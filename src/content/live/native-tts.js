/**
 * DeepSeek's native voice for auto-read.
 *
 * DeepSeek synthesizes replies server-side with its own neural voices. The flow
 * (captured from the app's own "Read aloud" button) is:
 *
 *   1. `POST /api/v0/auth/ticket {scope:"tts"}` → short-lived ticket.
 *      Needs the Bearer token, so it is proxied through the MAIN world.
 *   2. `wss://…/api/v0/chat/tts/?chat_session_id=…&message_id=…&ticket=…&mode=manual&format=opus`
 *      → `{event:"ready", voice_id:"echo"}` → binary frames → `{event:"finish"}`.
 *      The socket authenticates with cookies, so no token is needed here.
 *   3. Each binary frame is a 4-byte big-endian sequence number followed by one
 *      raw Opus packet — no Ogg/WebM container (see `readBinaryFrame`). Decode
 *      those packets with WebCodecs and schedule them on an AudioContext for
 *      gapless playback.
 *
 * The server reads the *stored* message text, so nothing can be cleaned on the
 * way in — callers decide whether a message is worth speaking natively.
 *
 * Every step can fail (no ticket, unsupported language, no AudioDecoder on
 * Firefox, stream error). `speakNativeResponse` therefore resolves as soon as
 * audio is actually flowing, and reports a reason otherwise, so the caller can
 * fall back to the Web Speech API.
 */

import { devLog } from "../../lib/dev-log.js";

const TICKET_REQUEST_EVENT = "bds:request-tts-ticket";
const TICKET_RESPONSE_EVENT = "bds:tts-ticket";
const TTS_PATH = "/api/v0/chat/tts/";

/** Give up on the ticket round-trip after this long. */
const TICKET_TIMEOUT_MS = 4000;

/**
 * Give up on the stream if no audio has played yet. Long replies keep streaming
 * after the first chunk, so this only guards the *start* of playback.
 */
const FIRST_AUDIO_TIMEOUT_MS = 8000;

/** Opus always decodes at 48 kHz. DeepSeek's TTS is mono. */
const OPUS_SAMPLE_RATE = 48000;
const OPUS_CHANNELS = 1;

/**
 * Bytes of sequence-number prefix in front of every audio frame. The server
 * sends it so an interrupted read can be resumed, so it is *not* audio.
 */
const FRAME_HEADER_BYTES = 4;

/** Currently playing stream, if any. */
let activePlayback = null;

/**
 * Whether this browser can decode DeepSeek's opus stream.
 *
 * WebCodecs `AudioDecoder` is Chromium-only today, so Firefox (and any browser
 * without it) reports false and stays on the Web Speech path. Measured with
 * `AudioDecoder.isConfigSupported({codec:"opus"})` → supported in Chromium.
 */
export function isNativeVoiceSupported() {
  return (
    typeof window !== "undefined" &&
    typeof window.AudioDecoder === "function" &&
    typeof window.AudioContext === "function" &&
    typeof window.WebSocket === "function"
  );
}

/**
 * Stop and tear down whatever native speech is playing. Safe to call when
 * nothing is playing, and safe to call twice.
 */
export function stopNativeSpeech() {
  const playback = activePlayback;
  if (!playback) return;
  activePlayback = null;

  playback.finished = true;
  // An in-flight attempt must never be left hanging: settle it as a failure so
  // the caller can fall back. The first reason wins, so callers that have a more
  // specific reason settle *before* tearing down.
  playback.finish({ ok: false, reason: "stopped" });
  if (playback.timer) clearTimeout(playback.timer);
  try { playback.ws?.close(); } catch { /* already closing */ }
  for (const source of playback.sources) {
    try { source.stop(); } catch { /* not started or already ended */ }
  }
  playback.sources.clear();
  try { playback.decoder?.close?.(); } catch { /* already closed */ }
  try { playback.ctx?.close?.(); } catch { /* already closed */ }
}

/**
 * Ask the MAIN world for a TTS ticket.
 *
 * @param {string} sessionId
 * @returns {Promise<{ok: true, ticket: string} | {ok: false, error: string}>}
 */
function requestTtsTicket(sessionId) {
  return new Promise((resolve) => {
    const id = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener(TICKET_RESPONSE_EVENT, onResponse);
      resolve(result);
    };

    const onResponse = (event) => {
      let detail = event && event.detail ? event.detail : {};
      if (typeof detail === "string") {
        try { detail = JSON.parse(detail); } catch { return; }
      }
      if (!detail || detail.id !== id) return;
      if (detail.ok && detail.ticket) {
        finish({ ok: true, ticket: detail.ticket });
      } else {
        finish({ ok: false, error: detail.error || "ticket rejected" });
      }
    };

    const timer = setTimeout(() => finish({ ok: false, error: "ticket timeout" }), TICKET_TIMEOUT_MS);
    window.addEventListener(TICKET_RESPONSE_EVENT, onResponse);
    window.dispatchEvent(new CustomEvent(TICKET_REQUEST_EVENT, {
      detail: JSON.stringify({ id, sessionId }),
    }));
  });
}

/**
 * Build the same socket URL the app's own read-aloud button uses.
 * @returns {string}
 */
function buildStreamUrl({ sessionId, messageId, ticket }) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({
    chat_session_id: sessionId,
    message_id: messageId,
    ticket,
    mode: "manual",
    format: "opus",
  });
  return `${protocol}//${location.host}${TTS_PATH}?${params.toString()}`;
}

/**
 * Split one binary frame into its sequence number and Opus payload.
 *
 * Every frame is `<uint32 big-endian seq><raw Opus packet>`. Handing the whole
 * frame to the decoder makes the packet undecodable — the prefix is read as the
 * Opus TOC byte, so the output is noise rather than speech. Stripping it is what
 * makes the audio intelligible.
 *
 * @returns {{seq: number, payload: Uint8Array} | null} null when the frame is
 *   too short to carry a header plus audio.
 */
function readBinaryFrame(data) {
  const bytes = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : (ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null);
  if (!bytes || bytes.byteLength <= FRAME_HEADER_BYTES) return null;
  const seq = new DataView(bytes.buffer, bytes.byteOffset, FRAME_HEADER_BYTES).getUint32(0, false);
  return { seq, payload: bytes.subarray(FRAME_HEADER_BYTES) };
}

/**
 * Copy one decoded chunk into the context's timeline, right after the previous
 * one, so the reply plays without gaps.
 */
function scheduleChunk(playback, audioData) {
  const { ctx, sources } = playback;
  const channels = audioData.numberOfChannels || OPUS_CHANNELS;
  const buffer = ctx.createBuffer(channels, audioData.numberOfFrames, audioData.sampleRate);

  for (let channel = 0; channel < channels; channel++) {
    audioData.copyTo(buffer.getChannelData(channel), {
      planeIndex: channel,
      format: "f32-planar",
    });
  }
  audioData.close();

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  const startAt = Math.max(ctx.currentTime + 0.02, playback.nextStartTime);
  source.start(startAt);
  playback.nextStartTime = startAt + buffer.duration;

  sources.add(source);
  source.onended = () => sources.delete(source);
}

/**
 * Speak a reply with DeepSeek's own voice.
 *
 * Resolves as soon as audio starts playing (`ok: true`) — the rest of the reply
 * keeps streaming in the background. Resolves `ok: false` with a short reason
 * when the native path cannot deliver audio, so the caller can fall back.
 *
 * @param {{sessionId?: string|null, messageId?: string|null}} target
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function speakNativeResponse({ sessionId, messageId } = {}) {
  if (!isNativeVoiceSupported()) {
    devLog("Voice", "native: unsupported browser");
    return { ok: false, reason: "no AudioDecoder in this browser" };
  }
  if (!sessionId || !messageId) {
    devLog("Voice", "native: missing session/message id");
    return { ok: false, reason: "unknown session/message id" };
  }

  stopNativeSpeech();
  devLog("Voice", "native: requesting tts ticket", { sessionId, messageId });

  const ticketResult = await requestTtsTicket(sessionId);
  if (!ticketResult.ok) {
    devLog("Voice", "native: ticket failed:", ticketResult.error);
    return { ok: false, reason: `ticket: ${ticketResult.error}` };
  }

  let ctx;
  let decoder;
  try {
    ctx = new window.AudioContext();
    decoder = new window.AudioDecoder({
      output: (audioData) => {
        const playback = activePlayback;
        if (!playback || playback.finished) {
          try { audioData.close(); } catch { /* already closed */ }
          return;
        }
        try {
          scheduleChunk(playback, audioData);
        } catch (error) {
          try { audioData.close(); } catch { /* already closed */ }
          devLog("Voice", "chunk scheduling failed:", error);
          return;
        }
        if (!playback.started) {
          playback.started = true;
          devLog("Voice", "native: audio is playing");
          playback.finish({ ok: true });
        }
      },
      error: (error) => {
        devLog("Voice", "decode error:", error);
        const playback = activePlayback;
        if (playback && !playback.started) {
          playback.finish({ ok: false, reason: "decode error" });
          stopNativeSpeech();
        }
      },
    });
    decoder.configure({
      codec: "opus",
      sampleRate: OPUS_SAMPLE_RATE,
      numberOfChannels: OPUS_CHANNELS,
    });
  } catch (error) {
    devLog("Voice", "decoder setup failed:", error);
    try { ctx?.close?.(); } catch { /* nothing to close */ }
    return { ok: false, reason: `decoder setup: ${(error && error.message) || error}` };
  }

  return new Promise((resolve) => {
    const playback = {
      ws: null,
      ctx,
      decoder,
      sources: new Set(),
      nextStartTime: 0,
      started: false,
      settled: false,
      finished: false,
      timer: null,
      /** Sequence number of the last accepted audio frame, or null before any. */
      lastSeq: null,
      frameCount: 0,
      resolve,
      /** Settle once: the first failure or the first successful chunk wins. */
      finish(result) {
        if (playback.settled) return;
        playback.settled = true;
        if (playback.timer) clearTimeout(playback.timer);
        resolve(result);
      },
    };
    activePlayback = playback;

    /** Settle with a reason, then tear down. Finish must win, so it runs first. */
    const fail = (reason) => {
      playback.finish({ ok: false, reason });
      stopNativeSpeech();
    };

    playback.timer = setTimeout(() => {
      if (playback.started) return;
      devLog("Voice", "no audio before timeout");
      fail("no audio before timeout");
    }, FIRST_AUDIO_TIMEOUT_MS);

    let socket;
    try {
      socket = new window.WebSocket(buildStreamUrl({
        sessionId,
        messageId,
        ticket: ticketResult.ticket,
      }));
      socket.binaryType = "arraybuffer";
    } catch (error) {
      devLog("Voice", "socket open failed:", error);
      fail(`socket: ${(error && error.message) || error}`);
      return;
    }
    playback.ws = socket;

    socket.onmessage = (event) => {
      if (playback.finished) return;
      const data = event.data;

      if (typeof data === "string") {
        let payload;
        try { payload = JSON.parse(data); } catch { return; }
        if (payload?.event === "ready") {
          devLog("Voice", "stream ready:", payload.voice_id);
        } else if (payload?.event === "finish") {
          // Nothing more is coming; the queued chunks keep playing.
          try { decoder.close(); } catch { /* already closed */ }
        }
        return;
      }

      // Binary audio frames.
      const frame = readBinaryFrame(data);
      if (!frame) return;
      // Sequence numbers only ever move forward; anything at or below the last
      // one is a replay (a resumed read re-sends its tail) and would double up.
      if (playback.lastSeq !== null && frame.seq <= playback.lastSeq) return;
      playback.lastSeq = frame.seq;

      if (playback.frameCount === 0) {
        devLog("Voice", "native: first audio frame", {
          seq: frame.seq,
          bytes: frame.payload.byteLength,
        });
      }
      playback.frameCount += 1;

      try {
        decoder.decode(new EncodedAudioChunk({
          type: "key",
          timestamp: Math.round(playback.nextStartTime * 1e6),
          data: frame.payload,
        }));
      } catch (error) {
        devLog("Voice", "decode call failed:", error);
        if (!playback.started) fail("decode call failed");
      }
    };

    socket.onerror = () => {
      if (playback.started) return;
      devLog("Voice", "socket error");
      fail("socket error");
    };

    socket.onclose = () => {
      if (playback.started || playback.finished) return;
      devLog("Voice", "socket closed before audio");
      fail("socket closed before audio");
    };
  });
}
