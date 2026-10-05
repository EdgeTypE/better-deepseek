// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isNativeVoiceSupported,
  speakNativeResponse,
  stopNativeSpeech,
} from "../../src/content/live/native-tts.js";

/** Let promise chains settle without depending on timers. */
async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

/** Minimal WebCodecs stand-in that emits one chunk per decoded packet. */
function installAudioDecoder() {
  const decoders = [];
  // jsdom has no WebCodecs at all, so `new EncodedAudioChunk(...)` would throw a
  // ReferenceError inside the socket handler. The module reads the global, so a
  // plain constructor is enough.
  class FakeEncodedAudioChunk {
    constructor(init) {
      Object.assign(this, init);
    }
  }
  class FakeAudioData {
    constructor() {
      this.numberOfFrames = 960;
      this.numberOfChannels = 1;
      this.sampleRate = 48000;
    }
    copyTo(destination) {
      destination[0] = 0.25;
    }
    close() {}
  }
  class FakeAudioDecoder {
    constructor(init) {
      this.init = init;
      this.closed = false;
      this.chunks = [];
      decoders.push(this);
    }
    configure(config) {
      this.config = config;
    }
    decode(chunk) {
      this.chunks.push(chunk);
      this.init.output(new FakeAudioData());
      return chunk;
    }
    close() {
      this.closed = true;
    }
  }
  window.AudioDecoder = FakeAudioDecoder;
  window.EncodedAudioChunk = FakeEncodedAudioChunk;
  return { decoders, FakeAudioData };
}

function installAudioContext() {
  const contexts = [];
  class FakeAudioContext {
    constructor() {
      this.currentTime = 0;
      this.destination = {};
      this.closed = false;
      this.scheduled = [];
      contexts.push(this);
    }
    createBuffer(channels, frames, rate) {
      const data = Array.from({ length: channels }, () => new Float32Array(frames));
      return {
        numberOfChannels: channels,
        length: frames,
        duration: frames / rate,
        getChannelData: (channel) => data[channel],
      };
    }
    createBufferSource() {
      const context = this;
      return {
        buffer: null,
        connect() {},
        start() {
          context.scheduled.push(this);
        },
        stop() {},
        onended: null,
      };
    }
    close() {
      this.closed = true;
      return Promise.resolve();
    }
  }
  window.AudioContext = FakeAudioContext;
  return { contexts };
}

function installWebSocket() {
  const sockets = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.closed = false;
      this.binaryType = "blob";
      sockets.push(this);
    }
    close() {
      this.closed = true;
    }
    /** Test helper: deliver a server frame. */
    emit(data) {
      if (this.onmessage) this.onmessage({ data });
    }
  }
  window.WebSocket = FakeWebSocket;
  return { sockets };
}

/**
 * Build one server audio frame: 4-byte big-endian sequence number + payload.
 * @param {number} seq
 * @param {number[]} payload
 */
function audioFrame(seq, payload = [0xf8, 0xff, 0xfe]) {
  const frame = new Uint8Array(4 + payload.length);
  new DataView(frame.buffer).setUint32(0, seq, false);
  frame.set(payload, 4);
  return frame.buffer;
}

/**
 * Auto-answer ticket requests so tests only drive the stream itself.
 *
 * The listener must be removed again: a leaked responder answers *every* later
 * request, which silently turns "ticket rejected" and "ticket timeout" tests
 * into successes.
 */
function installTicketResponder(response) {
  const requests = [];
  const handler = (event) => {
    const detail = JSON.parse(event.detail);
    requests.push(detail);
    if (response === null) return;
    window.dispatchEvent(new CustomEvent("bds:tts-ticket", {
      detail: JSON.stringify({ id: detail.id, ...response }),
    }));
  };
  window.addEventListener("bds:request-tts-ticket", handler);
  return {
    requests,
    dispose: () => window.removeEventListener("bds:request-tts-ticket", handler),
  };
}

describe("native-tts", () => {
  let originalAudioDecoder;
  let originalAudioContext;
  let originalEncodedAudioChunk;
  let originalWebSocket;
  let responders;

  beforeEach(() => {
    originalAudioDecoder = window.AudioDecoder;
    originalAudioContext = window.AudioContext;
    originalEncodedAudioChunk = window.EncodedAudioChunk;
    originalWebSocket = window.WebSocket;
    responders = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopNativeSpeech();
    for (const responder of responders) responder.dispose();
    responders = [];
    window.AudioDecoder = originalAudioDecoder;
    window.AudioContext = originalAudioContext;
    window.EncodedAudioChunk = originalEncodedAudioChunk;
    window.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  /** Install a ticket responder that is torn down with the test. */
  const responder = (response) => {
    const instance = installTicketResponder(response);
    responders.push(instance);
    return instance;
  };

  describe("isNativeVoiceSupported", () => {
    it("reports false when WebCodecs audio decoding is missing", () => {
      delete window.AudioDecoder;
      window.AudioContext = function () {};
      window.WebSocket = function () {};
      expect(isNativeVoiceSupported()).toBe(false);
    });

    it("reports true when the decoder, audio context and sockets are present", () => {
      installAudioDecoder();
      installAudioContext();
      installWebSocket();
      expect(isNativeVoiceSupported()).toBe(true);
    });
  });

  describe("speakNativeResponse", () => {
    beforeEach(() => {
      installAudioDecoder();
      installAudioContext();
    });

    it("opens the app's own tts stream and resolves once audio is playing", async () => {
      const { sockets } = installWebSocket();
      const { contexts } = installAudioContext();
      const { requests } = responder({ ok: true, ticket: "ticket-1" });

      const promise = speakNativeResponse({ sessionId: "session-1", messageId: "2" });
      await flush();

      expect(requests).toHaveLength(1);
      expect(requests[0].sessionId).toBe("session-1");
      expect(sockets).toHaveLength(1);

      const url = new URL(sockets[0].url);
      expect(url.pathname).toBe("/api/v0/chat/tts/");
      expect(url.searchParams.get("chat_session_id")).toBe("session-1");
      expect(url.searchParams.get("message_id")).toBe("2");
      expect(url.searchParams.get("ticket")).toBe("ticket-1");
      expect(url.searchParams.get("mode")).toBe("manual");
      expect(url.searchParams.get("format")).toBe("opus");
      expect(sockets[0].binaryType).toBe("arraybuffer");

      sockets[0].emit(JSON.stringify({ event: "ready", voice_id: "echo" }));
      sockets[0].emit(audioFrame(1));

      await expect(promise).resolves.toEqual({ ok: true });
      expect(contexts[0].scheduled).toHaveLength(1);
    });

    it("falls back when the ticket request is rejected", async () => {
      installWebSocket();
      responder({ ok: false, error: "http 401" });

      const promise = speakNativeResponse({ sessionId: "session-1", messageId: "2" });
      await flush();

      await expect(promise).resolves.toEqual({ ok: false, reason: "ticket: http 401" });
    });

    it("falls back when the ticket never arrives", async () => {
      installWebSocket();
      responder(null);

      const promise = speakNativeResponse({ sessionId: "session-1", messageId: "2" });
      await flush();
      vi.advanceTimersByTime(4000);

      await expect(promise).resolves.toEqual({ ok: false, reason: "ticket: ticket timeout" });
    });

    it("falls back when no audio arrives before the timeout", async () => {
      const { sockets } = installWebSocket();
      responder({ ok: true, ticket: "ticket-1" });

      const promise = speakNativeResponse({ sessionId: "session-1", messageId: "2" });
      await flush();

      sockets[0].emit(JSON.stringify({ event: "ready", voice_id: "echo" }));
      vi.advanceTimersByTime(8000);

      await expect(promise).resolves.toEqual({ ok: false, reason: "no audio before timeout" });
    });

    it("falls back when the socket closes before any audio", async () => {
      const { sockets } = installWebSocket();
      responder({ ok: true, ticket: "ticket-1" });

      const promise = speakNativeResponse({ sessionId: "session-1", messageId: "2" });
      await flush();

      sockets[0].onclose();

      await expect(promise).resolves.toEqual({ ok: false, reason: "socket closed before audio" });
    });

    it("falls back when the socket errors before any audio", async () => {
      const { sockets } = installWebSocket();
      responder({ ok: true, ticket: "ticket-1" });

      const promise = speakNativeResponse({ sessionId: "session-1", messageId: "2" });
      await flush();

      sockets[0].onerror();

      await expect(promise).resolves.toEqual({ ok: false, reason: "socket error" });
    });

    it("refuses to run without a session or message id", async () => {
      installWebSocket();
      responder({ ok: true, ticket: "ticket-1" });

      await expect(speakNativeResponse({ sessionId: "session-1" })).resolves.toEqual({
        ok: false,
        reason: "unknown session/message id",
      });
      await expect(speakNativeResponse({ messageId: "2" })).resolves.toEqual({
        ok: false,
        reason: "unknown session/message id",
      });
    });

    it("refuses to run when the browser cannot decode opus", async () => {
      delete window.AudioDecoder;
      installWebSocket();
      responder({ ok: true, ticket: "ticket-1" });

      await expect(speakNativeResponse({ sessionId: "session-1", messageId: "2" })).resolves.toEqual({
        ok: false,
        reason: "no AudioDecoder in this browser",
      });
    });
  });

  describe("audio frames", () => {
    /** Open a stream, answer the ticket, and return the socket and decoder. */
    async function openStream() {
      const { decoders } = installAudioDecoder();
      installAudioContext();
      const { sockets } = installWebSocket();
      responder({ ok: true, ticket: "ticket-1" });

      const promise = speakNativeResponse({ sessionId: "session-1", messageId: "2" });
      await flush();
      sockets[0].emit(JSON.stringify({ event: "ready", voice_id: "echo" }));
      return { socket: sockets[0], decoder: decoders[0], promise };
    }

    // The prefix is not audio: decoding it makes the whole packet undecodable,
    // which is audible as noise instead of speech.
    it("strips the sequence-number prefix before decoding", async () => {
      const { socket, decoder, promise } = await openStream();

      socket.emit(audioFrame(1, [0xaa, 0xbb, 0xcc]));
      await flush();

      await expect(promise).resolves.toEqual({ ok: true });
      expect(decoder.chunks).toHaveLength(1);
      expect(Array.from(decoder.chunks[0].data)).toEqual([0xaa, 0xbb, 0xcc]);
      expect(decoder.chunks[0].type).toBe("key");
    });

    it("decodes every frame in order", async () => {
      const { socket, decoder } = await openStream();

      socket.emit(audioFrame(1, [0x01]));
      socket.emit(audioFrame(2, [0x02]));
      socket.emit(audioFrame(3, [0x03]));
      await flush();

      expect(decoder.chunks.map((chunk) => Array.from(chunk.data)))
        .toEqual([[0x01], [0x02], [0x03]]);
    });

    it("ignores replayed sequence numbers", async () => {
      const { socket, decoder } = await openStream();

      socket.emit(audioFrame(1, [0x01]));
      socket.emit(audioFrame(1, [0x01]));
      socket.emit(audioFrame(2, [0x02]));
      await flush();

      expect(decoder.chunks.map((chunk) => Array.from(chunk.data)))
        .toEqual([[0x01], [0x02]]);
    });

    it("ignores frames too short to hold a header and audio", async () => {
      const { socket, decoder, promise } = await openStream();

      socket.emit(new Uint8Array([0, 0, 0, 0]).buffer);
      socket.emit(new ArrayBuffer(0));
      await flush();

      expect(decoder.chunks).toHaveLength(0);
      // A frame with no audio must not be mistaken for playback starting.
      vi.advanceTimersByTime(8000);
      await expect(promise).resolves.toEqual({ ok: false, reason: "no audio before timeout" });
    });
  });

  describe("stopNativeSpeech", () => {
    it("closes the socket and the audio context, and is safe when idle", async () => {
      installAudioDecoder();
      const { sockets } = installWebSocket();
      const { contexts } = installAudioContext();
      responder({ ok: true, ticket: "ticket-1" });

      expect(() => stopNativeSpeech()).not.toThrow();

      const promise = speakNativeResponse({ sessionId: "session-1", messageId: "2" });
      await flush();
      stopNativeSpeech();

      expect(sockets[0].closed).toBe(true);
      expect(contexts[0].closed).toBe(true);

      // The in-flight attempt must not resolve as a success after teardown.
      sockets[0].emit(audioFrame(1));
      await flush();
      await expect(promise).resolves.toMatchObject({ ok: false });
    });
  });
});
