// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANDROID_SPEECH_EVENTS,
  __resetAndroidSpeechForTests,
  installAndroidSpeech,
  isAndroidSpeechAvailable,
} from "./android-speech.js";

function installBridge(overrides = {}) {
  const bridge = {
    ttsInit: vi.fn(),
    ttsGetVoices: vi.fn(() => "[]"),
    ttsSpeak: vi.fn(),
    ttsStop: vi.fn(),
    ttsSetVoice: vi.fn(),
    sttStart: vi.fn(),
    sttStop: vi.fn(),
    sttAbort: vi.fn(),
    ...overrides,
  };
  window.AndroidSpeech = bridge;
  return bridge;
}

/** Deliver a native event the way SpeechBridge.dispatch does. */
function emitTts(payload) {
  window.dispatchEvent(
    new CustomEvent(ANDROID_SPEECH_EVENTS.TTS, { detail: JSON.stringify(payload) }),
  );
}

function emitStt(payload) {
  window.dispatchEvent(
    new CustomEvent(ANDROID_SPEECH_EVENTS.STT, { detail: JSON.stringify(payload) }),
  );
}

const VOICES = [
  { voiceURI: "en-us-x-local", name: "en-us-x-local", lang: "en-US", localService: true, quality: 300, latency: 200 },
  { voiceURI: "en-us-x-network", name: "en-us-x-network", lang: "en-US", localService: false, quality: 500, latency: 400 },
  { voiceURI: "tr-tr-x-local", name: "tr-tr-x-local", lang: "tr-TR", localService: true, quality: 300, latency: 200 },
];

beforeEach(() => {
  __resetAndroidSpeechForTests();
  delete window.speechSynthesis;
  delete window.SpeechSynthesisUtterance;
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  delete window.AndroidSpeech;
});

afterEach(() => {
  __resetAndroidSpeechForTests();
  delete window.speechSynthesis;
  delete window.SpeechSynthesisUtterance;
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  delete window.AndroidSpeech;
});

describe("installAndroidSpeech", () => {
  it("installs nothing when the native bridge is absent", () => {
    const result = installAndroidSpeech();
    expect(result).toEqual({ tts: false, stt: false });
    expect(window.speechSynthesis).toBeUndefined();
    expect(window.SpeechRecognition).toBeUndefined();
    expect(isAndroidSpeechAvailable()).toBe(false);
  });

  it("installs the TTS and STT shims when the bridge is present", () => {
    installBridge();
    const result = installAndroidSpeech();
    expect(result).toEqual({ tts: true, stt: true });
    expect(typeof window.speechSynthesis.getVoices).toBe("function");
    expect(typeof window.SpeechSynthesisUtterance).toBe("function");
    expect(typeof window.SpeechRecognition).toBe("function");
    // live-engine reads either spelling.
    expect(window.webkitSpeechRecognition).toBe(window.SpeechRecognition);
  });

  it("never shadows a real Web Speech implementation", () => {
    installBridge();
    const real = { getVoices: () => [], speak: vi.fn(), cancel: vi.fn() };
    window.speechSynthesis = real;
    const result = installAndroidSpeech();
    expect(result.tts).toBe(false);
    expect(window.speechSynthesis).toBe(real);
  });

  it("requests the voice list at install time", () => {
    const bridge = installBridge();
    installAndroidSpeech();
    expect(bridge.ttsInit).toHaveBeenCalled();
  });
});

describe("speechSynthesis shim", () => {
  it("exposes on-device voices only, hiding network voices", () => {
    installBridge();
    installAndroidSpeech();
    emitTts({ kind: "voices", voices: VOICES });

    const voices = window.speechSynthesis.getVoices();
    expect(voices.map((v) => v.voiceURI).sort()).toEqual([
      "en-us-x-local",
      "tr-tr-x-local",
    ]);
    expect(voices.every((v) => v.localService)).toBe(true);
  });

  it("falls back to every voice when the device has no on-device voice", () => {
    installBridge();
    installAndroidSpeech();
    emitTts({
      kind: "voices",
      voices: [VOICES[1]],
    });

    const voices = window.speechSynthesis.getVoices();
    expect(voices).toHaveLength(1);
    expect(voices[0].localService).toBe(false);
  });

  it("fires onvoiceschanged once voices arrive", () => {
    installBridge();
    installAndroidSpeech();
    const handler = vi.fn();
    window.speechSynthesis.onvoiceschanged = handler;

    emitTts({ kind: "voices", voices: VOICES });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("forwards speak() to the native bridge with rate, pitch and voice", () => {
    const bridge = installBridge();
    installAndroidSpeech();
    emitTts({ kind: "voices", voices: VOICES });

    const utterance = new window.SpeechSynthesisUtterance("hello there");
    utterance.rate = 1.05;
    utterance.pitch = 1;
    utterance.voice = window.speechSynthesis.getVoices()[0];
    window.speechSynthesis.speak(utterance);

    expect(bridge.ttsSetVoice).toHaveBeenCalledWith("en-us-x-local");
    expect(bridge.ttsSpeak).toHaveBeenCalledTimes(1);
    const [text, id, rate, pitch] = bridge.ttsSpeak.mock.calls[0];
    expect(text).toBe("hello there");
    expect(typeof id).toBe("string");
    expect(rate).toBeCloseTo(1.05);
    expect(pitch).toBe(1);
  });

  it("ignores empty utterances", () => {
    const bridge = installBridge();
    installAndroidSpeech();
    window.speechSynthesis.speak(new window.SpeechSynthesisUtterance("   "));
    expect(bridge.ttsSpeak).not.toHaveBeenCalled();
  });

  it("reports speaking and calls onend when the native engine finishes", () => {
    const bridge = installBridge();
    installAndroidSpeech();

    const utterance = new window.SpeechSynthesisUtterance("hi");
    const onend = vi.fn();
    utterance.onend = onend;
    window.speechSynthesis.speak(utterance);

    expect(window.speechSynthesis.speaking).toBe(true);
    emitTts({ kind: "done", utteranceId: bridge.ttsSpeak.mock.calls[0][1] });

    expect(onend).toHaveBeenCalledTimes(1);
    expect(window.speechSynthesis.speaking).toBe(false);
  });

  it("surfaces synthesis errors on the utterance", () => {
    const bridge = installBridge();
    installAndroidSpeech();

    const utterance = new window.SpeechSynthesisUtterance("hi");
    const onerror = vi.fn();
    utterance.onerror = onerror;
    window.speechSynthesis.speak(utterance);

    emitTts({
      kind: "error",
      utteranceId: bridge.ttsSpeak.mock.calls[0][1],
      error: "synthesis-failed",
    });

    expect(onerror).toHaveBeenCalledTimes(1);
    expect(onerror.mock.calls[0][0].error).toBe("synthesis-failed");
  });

  it("settles queued utterances independently by id", () => {
    const bridge = installBridge();
    installAndroidSpeech();

    const first = new window.SpeechSynthesisUtterance("one");
    const second = new window.SpeechSynthesisUtterance("two");
    const firstEnd = vi.fn();
    const secondEnd = vi.fn();
    first.onend = firstEnd;
    second.onend = secondEnd;

    window.speechSynthesis.speak(first);
    window.speechSynthesis.speak(second);
    const firstId = bridge.ttsSpeak.mock.calls[0][1];
    const secondId = bridge.ttsSpeak.mock.calls[1][1];

    // The native engine reports completion per utterance, in its own order.
    emitTts({ kind: "done", utteranceId: secondId });
    expect(secondEnd).toHaveBeenCalledTimes(1);
    expect(firstEnd).not.toHaveBeenCalled();
    expect(window.speechSynthesis.speaking).toBe(true);

    emitTts({ kind: "done", utteranceId: firstId });
    expect(firstEnd).toHaveBeenCalledTimes(1);
    expect(window.speechSynthesis.speaking).toBe(false);
  });

  it("ignores events for an utterance it never issued", () => {
    installBridge();
    installAndroidSpeech();
    expect(() => emitTts({ kind: "done", utteranceId: "u999" })).not.toThrow();
  });

  it("stops natively on cancel() without settling the utterance", () => {
    const bridge = installBridge();
    installAndroidSpeech();

    const utterance = new window.SpeechSynthesisUtterance("hi");
    const onend = vi.fn();
    utterance.onend = onend;
    window.speechSynthesis.speak(utterance);

    window.speechSynthesis.cancel();

    expect(bridge.ttsStop).toHaveBeenCalledTimes(1);
    // live-engine resets its own speaking state before cancelling; a callback here
    // would race the next utterance.
    expect(onend).not.toHaveBeenCalled();
    expect(window.speechSynthesis.speaking).toBe(false);
  });
});

describe("SpeechRecognition shim", () => {
  function startRecognition(bridge) {
    const recognition = new window.SpeechRecognition();
    recognition.lang = "en-US";
    const handlers = {
      onstart: vi.fn(),
      onresult: vi.fn(),
      onerror: vi.fn(),
      onend: vi.fn(),
      onspeechstart: vi.fn(),
      onspeechend: vi.fn(),
    };
    Object.assign(recognition, handlers);
    recognition.start();
    return { recognition, handlers, bridge };
  }

  it("forwards start() to the native recognizer with the language", () => {
    const bridge = installBridge();
    installAndroidSpeech();
    const { recognition } = startRecognition(bridge);
    expect(bridge.sttStart).toHaveBeenCalledWith("en-US");
    expect(recognition).toBeInstanceOf(window.SpeechRecognition);
  });

  it("emits the event sequence live-engine depends on", () => {
    const bridge = installBridge();
    installAndroidSpeech();
    const { handlers } = startRecognition(bridge);

    emitStt({ kind: "start" });
    emitStt({ kind: "speechstart" });
    emitStt({ kind: "partial", text: "hello" });
    emitStt({ kind: "partial", text: "hello world" });
    emitStt({ kind: "speechend" });
    emitStt({ kind: "final", text: "hello world" });
    emitStt({ kind: "end" });

    expect(handlers.onstart).toHaveBeenCalledTimes(1);
    expect(handlers.onspeechstart).toHaveBeenCalledTimes(1);
    expect(handlers.onspeechend).toHaveBeenCalledTimes(1);
    expect(handlers.onresult).toHaveBeenCalledTimes(3);
    expect(handlers.onend).toHaveBeenCalledTimes(1);
  });

  it("shapes results the way consumers sum them", () => {
    const bridge = installBridge();
    installAndroidSpeech();
    const { handlers } = startRecognition(bridge);

    emitStt({ kind: "partial", text: "merhaba dünya" });

    const event = handlers.onresult.mock.calls[0][0];
    // live-engine / AttachMenu both do: results[i][0].transcript, summed over i.
    let text = "";
    for (let i = 0; i < event.results.length; i += 1) {
      text += event.results[i][0].transcript;
    }
    expect(text).toBe("merhaba dünya");
    expect(event.results[0].isFinal).toBe(false);
  });

  it("marks the final result as final and sets event.target", () => {
    const bridge = installBridge();
    installAndroidSpeech();
    const { recognition, handlers } = startRecognition(bridge);

    emitStt({ kind: "final", text: "done" });

    const event = handlers.onresult.mock.calls[0][0];
    expect(event.results[0].isFinal).toBe(true);
    // AttachMenu bails out unless event.target is the instance that started.
    expect(event.target).toBe(recognition);
  });

  it("maps native error codes onto the Web Speech error names", () => {
    const bridge = installBridge();
    installAndroidSpeech();
    const { handlers } = startRecognition(bridge);

    emitStt({ kind: "error", error: "no-speech" });
    expect(handlers.onerror.mock.calls[0][0].error).toBe("no-speech");
  });

  it("stop() asks the native recognizer to wrap up", () => {
    const bridge = installBridge();
    installAndroidSpeech();
    const { recognition } = startRecognition(bridge);

    recognition.stop();
    expect(bridge.sttStop).toHaveBeenCalledTimes(1);
  });

  it("abort() tears down natively and closes the session locally", () => {
    const bridge = installBridge();
    installAndroidSpeech();
    const { recognition, handlers } = startRecognition(bridge);

    recognition.abort();

    expect(bridge.sttAbort).toHaveBeenCalledTimes(1);
    // The native abort is silent by design, so `end` is emitted here.
    expect(handlers.onend).toHaveBeenCalledTimes(1);
  });

  it("accepts an object detail as well as a JSON string", () => {
    const bridge = installBridge();
    installAndroidSpeech();
    const { handlers } = startRecognition(bridge);

    window.dispatchEvent(
      new CustomEvent(ANDROID_SPEECH_EVENTS.STT, {
        detail: { kind: "final", text: "object form" },
      }),
    );

    expect(handlers.onresult.mock.calls[0][0].results[0][0].transcript).toBe("object form");
  });

  it("ignores events once the session has ended", () => {
    const bridge = installBridge();
    installAndroidSpeech();
    const { handlers } = startRecognition(bridge);

    emitStt({ kind: "end" });
    emitStt({ kind: "partial", text: "late" });

    expect(handlers.onresult).not.toHaveBeenCalled();
    expect(handlers.onend).toHaveBeenCalledTimes(1);
  });
});
