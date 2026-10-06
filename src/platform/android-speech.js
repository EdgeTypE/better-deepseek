/**
 * Android Web Speech shims.
 *
 * The Android System WebView ships no Web Speech API — neither `SpeechSynthesis`
 * nor `SpeechRecognition` exists there — yet live voice mode is built on both. This
 * module installs drop-in replacements on `window` backed by the native
 * `window.AndroidSpeech` bridge (see `SpeechBridge.kt`), so `live-engine.js`,
 * `tts-utils.js`, `message-processor` auto-read, the AttachMenu mic button and the
 * Settings voice list all keep working without host-specific branches.
 *
 * Contract with the native side (events carry a JSON string in `detail` because the
 * content script reads them from an isolated world):
 *
 *   bds:android-tts  { kind: "voices" | "start" | "done" | "error", ... }
 *   bds:android-stt  { kind: "start" | "speechstart" | "speechend" | "partial"
 *                            | "final" | "error" | "end", text?, error? }
 *
 * Installation is deliberately conservative: each shim is installed only when the
 * native bridge is present *and* the real API is absent, so a future WebView (or
 * Chrome Custom Tabs) that implements Web Speech natively keeps its own.
 */

const TTS_EVENT = "bds:android-tts";
const STT_EVENT = "bds:android-stt";

/**
 * Expose on-device voices only, so nothing the assistant says leaves the phone.
 *
 * Google's engine also offers network (neural) voices that sound better, but they
 * upload the spoken text. The chosen trade-off for Android is privacy-first with
 * on-device voices; flip this to `false` to surface network voices as well — they
 * arrive flagged `localService: false`, which `getBestVoice` already scores.
 *
 * If the device exposes no on-device voice at all, the full list is used instead:
 * a worse voice beats no voice.
 */
const PREFER_ON_DEVICE_VOICES = true;

let installedTts = false;
let installedStt = false;

/** Cached voice list, shaped like `SpeechSynthesisVoice`. */
let voices = [];
/** Utterances in flight, keyed by the id handed to the native engine. */
const utterances = new Map();
let utteranceSeq = 0;

/** Recognition session currently driving the native recognizer, if any. */
let activeRecognition = null;

/**
 * Whether the native recognizer's capture path is echo-cancelled.
 *
 * `null` until the first recognizer event reports it. `true` means the platform
 * AEC is running on the recognizer's microphone, so a short partial really is
 * the user talking; `false` means the recognizer can hear our own TTS and the
 * barge-in filter has to stay conservative. See `SpeechBridge.kt`.
 */
let aecActive = null;

function getBridge() {
  return typeof window !== "undefined" ? window.AndroidSpeech : null;
}

/**
 * Read a bridge event payload. Firefox Xray Vision hands `detail` over as a
 * string, so both shapes are accepted.
 */
function readDetail(event) {
  const detail = event && event.detail;
  if (typeof detail === "string") {
    try {
      return JSON.parse(detail);
    } catch {
      return null;
    }
  }
  if (detail && typeof detail === "object") return detail;
  return null;
}

// ── Text to speech ────────────────────────────────────────────────────────

/** Map a native voice descriptor onto the `SpeechSynthesisVoice` shape. */
function toVoice(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || raw.voiceURI || "");
  if (!name) return null;
  return {
    voiceURI: String(raw.voiceURI || name),
    name,
    lang: String(raw.lang || ""),
    localService: raw.localService !== false,
    default: false,
    // Native-only ranking hints, ignored by Web Speech consumers.
    __quality: Number(raw.quality) || 0,
    __latency: Number(raw.latency) || 0,
  };
}

function applyVoices(rawVoices) {
  const mapped = (Array.isArray(rawVoices) ? rawVoices : [])
    .map(toVoice)
    .filter(Boolean);

  let selected = mapped;
  if (PREFER_ON_DEVICE_VOICES) {
    const onDevice = mapped.filter((voice) => voice.localService);
    if (onDevice.length > 0) selected = onDevice;
  }

  // Highest quality first, lowest latency as the tie-break; `getBestVoice` then
  // re-scores by language, so this only settles otherwise-equal candidates.
  voices = selected.slice().sort((a, b) => b.__quality - a.__quality || a.__latency - b.__latency);

  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  if (synth && typeof synth.onvoiceschanged === "function") {
    try {
      synth.onvoiceschanged({ type: "voiceschanged", target: synth });
    } catch (err) {
      console.warn("[BDS] onvoiceschanged handler failed:", err);
    }
  }
}

/** `SpeechSynthesisUtterance` stand-in. */
class AndroidSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text === null || text === undefined ? "" : String(text);
    this.lang = "";
    this.voice = null;
    this.volume = 1;
    this.rate = 1;
    this.pitch = 1;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
    this.onpause = null;
    this.onresume = null;
    this.onboundary = null;
  }
}

function settleUtterance(utterance, kind, extra) {
  if (!utterance) return;
  if (kind === "start" && typeof utterance.onstart === "function") {
    utterance.onstart({ type: "start", utterance });
  } else if (kind === "done" && typeof utterance.onend === "function") {
    utterance.onend({ type: "end", utterance });
  } else if (kind === "error" && typeof utterance.onerror === "function") {
    utterance.onerror({ type: "error", utterance, error: extra || "synthesis-failed" });
  }
}

function handleTtsEvent(event) {
  const detail = readDetail(event);
  if (!detail) return;

  if (detail.kind === "voices") {
    applyVoices(detail.voices);
    return;
  }

  // Route by utterance id. Native playback is queued, so an older utterance can
  // still be finishing while a newer one is already in flight — a single "current
  // utterance" slot would misattribute the completion.
  const id = detail.utteranceId;
  if (!id || !utterances.has(id)) return;
  const utterance = utterances.get(id);
  if (detail.kind === "done" || detail.kind === "error") {
    utterances.delete(id);
  }
  settleUtterance(utterance, detail.kind, detail.error);
}

function createSynthesis() {
  const synth = {
    getVoices() {
      return voices.slice();
    },
    speak(utterance) {
      const bridge = getBridge();
      if (!bridge || !utterance) return;
      const text = String(utterance.text || "");
      if (!text.trim()) return;

      const id = `u${++utteranceSeq}`;
      // Native playback is queued (`QUEUE_ADD`), so several utterances can be in
      // flight at once; each is settled only by the event carrying its own id.
      utterances.set(id, utterance);
      utterance.__androidId = id;

      bridge.ttsInit();
      if (utterance.voice && utterance.voice.voiceURI) {
        bridge.ttsSetVoice(String(utterance.voice.voiceURI));
      }
      bridge.ttsSpeak(
        text,
        id,
        Number(utterance.rate) > 0 ? Number(utterance.rate) : 1,
        Number(utterance.pitch) > 0 ? Number(utterance.pitch) : 1,
      );
    },
    cancel() {
      utterances.clear();
      try {
        getBridge()?.ttsStop();
      } catch (err) {
        console.warn("[BDS] tts cancel failed:", err);
      }
    },
    // Android's TextToSpeech has no pause; these exist so callers that feature-detect
    // `typeof pause === "function"` find a harmless no-op instead of throwing.
    pause() {},
    resume() {},
    get speaking() {
      return utterances.size > 0;
    },
    get pending() {
      return false;
    },
    get paused() {
      return false;
    },
    onvoiceschanged: null,
  };
  return synth;
}

// ── Speech recognition ────────────────────────────────────────────────────

/**
 * Build the `SpeechRecognitionEvent`-shaped payload consumers rely on.
 *
 * A plain object rather than `new Event(...)`: `Event.target` is read-only, and
 * `AttachMenu` identifies the session with `event.target !== recognition`.
 */
function makeRecognitionEvent(type, recognition, entries, error) {
  const results = entries.map((entry) => {
    const alternatives = [{ transcript: entry.transcript, confidence: 1 }];
    alternatives.isFinal = Boolean(entry.isFinal);
    return alternatives;
  });
  const event = { type, target: recognition, results };
  if (error) event.error = error;
  return event;
}

class AndroidSpeechRecognition {
  constructor() {
    this.lang = "";
    this.continuous = false;
    this.interimResults = false;
    this.maxAlternatives = 1;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
    this.onresult = null;
    this.onspeechstart = null;
    this.onspeechend = null;
    this.onaudiostart = null;
    this.onaudioend = null;
    this.onnomatch = null;
    this._listening = false;
    /** Transcript confirmed by the engine for this session. */
    this._finalText = "";
  }

  start() {
    const bridge = getBridge();
    if (!bridge) throw new Error("[BDS] AndroidSpeech bridge is unavailable");
    if (this._listening) return;

    this._listening = true;
    this._finalText = "";
    activeRecognition = this;

    // Ask for the echo-control posture before listening starts. The barge-in
    // filter consults it to pick thresholds, and waiting for the first `start`
    // event would leave it blind for the opening partial of every session.
    try {
      if (typeof bridge.sttAecStrategy === "function") {
        const raw = bridge.sttAecStrategy();
        const strategy = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (strategy && typeof strategy.aec === "boolean") aecActive = strategy.aec;
      }
    } catch (err) {
      console.warn("[BDS] AEC strategy probe failed:", err);
    }

    bridge.sttStart(String(this.lang || ""));
  }

  stop() {
    if (!this._listening) return;
    try {
      getBridge()?.sttStop();
    } catch (err) {
      console.warn("[BDS] stt stop failed:", err);
    }
  }

  abort() {
    if (!this._listening) return;
    try {
      getBridge()?.sttAbort();
    } catch (err) {
      console.warn("[BDS] stt abort failed:", err);
    }
    // The native teardown is silent by design, so the session is closed here.
    this._finish();
  }

  /** Emit `end` once and detach from the bridge. */
  _finish() {
    const wasListening = this._listening;
    this._listening = false;
    this._finalText = "";
    if (activeRecognition === this) activeRecognition = null;
    if (wasListening && typeof this.onend === "function") {
      this.onend(makeRecognitionEvent("end", this, []));
    }
  }
}

function handleSttEvent(event) {
  const detail = readDetail(event);
  if (!detail) return;

  // AEC posture rides along on every recognizer event; track it before routing so
  // the barge-in filter sees the correct thresholds even on the first partial.
  if (typeof detail.aec === "boolean") aecActive = detail.aec;

  const recognition = activeRecognition;
  if (!recognition) return;

  switch (detail.kind) {
    case "start":
      if (typeof recognition.onstart === "function") {
        recognition.onstart(makeRecognitionEvent("start", recognition, []));
      }
      break;

    case "speechstart":
      if (typeof recognition.onspeechstart === "function") {
        recognition.onspeechstart(makeRecognitionEvent("speechstart", recognition, []));
      }
      break;

    case "speechend":
      if (typeof recognition.onspeechend === "function") {
        recognition.onspeechend(makeRecognitionEvent("speechend", recognition, []));
      }
      break;

    case "partial": {
      const text = String(detail.text || "");
      if (!text.trim() || typeof recognition.onresult !== "function") break;
      // Native partials are cumulative for the session, which matches how
      // consumers sum `event.results[*][0].transcript`.
      recognition.onresult(
        makeRecognitionEvent("result", recognition, [{ transcript: text, isFinal: false }]),
      );
      break;
    }

    case "final": {
      const text = String(detail.text || "") || recognition._finalText;
      // Record the engine's verdict so a later `end` with no result payload still
      // has the confirmed transcript to fall back on.
      recognition._finalText = text;
      if (text.trim() && typeof recognition.onresult === "function") {
        recognition.onresult(
          makeRecognitionEvent("result", recognition, [{ transcript: text, isFinal: true }]),
        );
      }
      break;
    }

    case "error":
      if (typeof recognition.onerror === "function") {
        recognition.onerror(
          makeRecognitionEvent("error", recognition, [], String(detail.error || "unknown")),
        );
      }
      break;

    case "end":
      recognition._finish();
      break;

    default:
      break;
  }
}

// ── Installation ──────────────────────────────────────────────────────────

/**
 * Install the shims that the host is missing.
 *
 * @returns {{ tts: boolean, stt: boolean }} which surfaces were installed
 */
export function installAndroidSpeech() {
  if (typeof window === "undefined") return { tts: false, stt: false };
  if (!getBridge()) return { tts: false, stt: false };

  if (!installedTts && typeof window.speechSynthesis === "undefined") {
    window.addEventListener(TTS_EVENT, handleTtsEvent);
    if (typeof window.SpeechSynthesisUtterance === "undefined") {
      window.SpeechSynthesisUtterance = AndroidSpeechSynthesisUtterance;
    }
    window.speechSynthesis = createSynthesis();
    installedTts = true;
    // Kick the engine off now so `getVoices()` is populated by the time the
    // settings panel or live mode asks — voice enumeration is async natively.
    try {
      getBridge().ttsInit();
    } catch (err) {
      console.warn("[BDS] tts init failed:", err);
    }
  }

  if (
    !installedStt &&
    typeof window.SpeechRecognition === "undefined" &&
    typeof window.webkitSpeechRecognition === "undefined"
  ) {
    window.addEventListener(STT_EVENT, handleSttEvent);
    window.SpeechRecognition = AndroidSpeechRecognition;
    window.webkitSpeechRecognition = AndroidSpeechRecognition;
    installedStt = true;
  }

  return { tts: installedTts, stt: installedStt };
}

/**
 * Whether the native bridge can back Web Speech on this host. Used by the UI to
 * decide whether the Live Mode / mic buttons are worth showing.
 */
export function isAndroidSpeechAvailable() {
  return Boolean(getBridge());
}

/**
 * Whether the recognizer's capture path is echo-cancelled.
 *
 * Returns `null` when unknown (no event has reported it yet, or a real Web
 * Speech implementation is in use), `true`/`false` once the native side has
 * told us. `live-engine.js` uses this to pick barge-in thresholds: with AEC on,
 * a short partial is trustworthy; without it, short partials are presumed echo.
 */
export function isAndroidAecActive() {
  return aecActive;
}

/** Test-only: drop all installed shims and cached state. */
export function __resetAndroidSpeechForTests() {
  if (typeof window !== "undefined") {
    window.removeEventListener(TTS_EVENT, handleTtsEvent);
    window.removeEventListener(STT_EVENT, handleSttEvent);
  }
  installedTts = false;
  installedStt = false;
  voices = [];
  utterances.clear();
  activeRecognition = null;
  aecActive = null;
  utteranceSeq = 0;
}

export const ANDROID_SPEECH_EVENTS = { TTS: TTS_EVENT, STT: STT_EVENT };
