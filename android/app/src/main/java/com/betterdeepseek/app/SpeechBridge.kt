package com.betterdeepseek.app

import android.content.Context
import android.content.Intent
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.util.Log
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Native speech bridge exposed to the WebView as `window.AndroidSpeech`.
 *
 * The Android System WebView does not ship the Web Speech API: neither
 * `SpeechSynthesis` nor `SpeechRecognition` is available there. The extension's
 * live voice mode is built on both, so this bridge backs them with the platform
 * APIs instead:
 *
 *   TTS → android.speech.tts.TextToSpeech (the Google engine, i.e. the same
 *         voices the Assistant speaks with)
 *   STT → android.speech.SpeechRecognizer (on-device when the device supports it)
 *
 * The JS side (`src/platform/android-speech.js`) installs thin shims that look
 * like the Web Speech API and forward to this object, so `live-engine.js` and
 * the rest of the codebase stay host-agnostic.
 *
 * ── Acoustic echo cancellation ──────────────────────────────────────────────
 *
 * `SpeechRecognizer` owns its own microphone session: its API has no way to
 * accept PCM we captured ourselves, so the AEC-enabled stream the page opens
 * through `getUserMedia` (used by VADProcessor) is invisible to it. Without a
 * second measure, the recognizer therefore hears the assistant's own TTS
 * through the speaker, and live mode interprets that echo as the user talking
 * — interrupting itself in a loop.
 *
 * The fix is `EXTRA_AUDIO_SOURCE`: it lets us pick which capture source the
 * recognizer reads from. `VOICE_COMMUNICATION` is the telephony processing
 * path, and Android feeds it the platform AEC/NS/AGC chain — including the
 * reference signal of everything the device is currently playing, our TTS
 * included. So the recognizer still opens its own session (the API constraint
 * stands), but what it reads is already echo-suppressed.
 *
 * `VOICE_COMMUNICATION` can narrow the stream on some devices (16 kHz mono),
 * which is why [aecStrategyJson] reports the live choice back to JS: the
 * barge-in filter in `live-engine.js` tightens or relaxes its thresholds based
 * on whether AEC is actually in effect.
 *
 * Contract:
 *   ttsInit(): void                       — idempotent; publishes `voices` when ready
 *   ttsGetVoices(): String                — JSON array, cached after init
 *   ttsSpeak(text, utteranceId, rate, pitch): void
 *   ttsStop(): void                       — cancels playback, fires no callback
 *   ttsSetVoice(voiceName): void          — applies to later ttsSpeak calls
 *   sttStart(lang): void
 *   sttStop(): void                       — graceful stop (delivers the final result)
 *   sttAbort(): void                      — immediate teardown, no final result
 *   sttAecStrategy(): String              — JSON, current echo-control strategy
 *
 * Native → JS events are delivered as CustomEvents carrying a JSON string in
 * `detail` (Firefox Xray Vision cannot read cross-world objects):
 *
 *   bds:android-tts  { kind: "voices" | "start" | "done" | "error", ... }
 *   bds:android-stt  { kind: "start" | "speechstart" | "speechend" | "partial"
 *                            | "final" | "error" | "end", text?, error?, aec? }
 *
 * Every public method is safe to call from arbitrary JS: inputs are validated
 * and nothing throws across the bridge boundary.
 */
class SpeechBridge(private val context: Context) {

    /** Set by MainActivity to evaluate JS in the WebView. Always invoked on the main thread. */
    @Volatile var evaluateJs: ((script: String) -> Unit)? = null

    /** Test hook for unit tests that cannot rely on Android's main looper. */
    @Volatile internal var scriptPoster: ((String) -> Unit)? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    // ── Text-to-speech ──────────────────────────────────────────────────────

    private var tts: TextToSpeech? = null
    private var ttsInitializing = false

    @Volatile private var ttsReady = false

    /** JSON array of voice descriptors, rebuilt once the engine reports ready. */
    @Volatile private var voicesJson: String = "[]"

    /** Utterance id currently being spoken, so stray callbacks can be dropped. */
    @Volatile private var activeUtteranceId: String? = null

    /** Voice descriptors from the last [publishVoices], keyed by name for [ttsSetVoice]. */
    private val voiceByName = mutableMapOf<String, Voice>()

    // ── Speech recognition ──────────────────────────────────────────────────

    private var recognizer: SpeechRecognizer? = null

    /**
     * Latest partial transcript. Android delivers cumulative partials per session,
     * but some engines replace rather than append, so we keep the longest seen and
     * let the JS shim decide how to surface it.
     */
    @Volatile private var lastPartialText: String = ""

    // ── TTS: public surface ─────────────────────────────────────────────────

    /**
     * Initialise the TTS engine. Idempotent — repeated calls from JS (page reload,
     * live mode opened twice) reuse the existing instance.
     */
    @JavascriptInterface
    fun ttsInit() {
        mainHandler.post {
            if (ttsReady || ttsInitializing) {
                // Already up: re-publish so a reloaded page gets the voice list.
                if (ttsReady) publishVoices()
                return@post
            }
            ttsInitializing = true
            try {
                tts =
                        TextToSpeech(context.applicationContext) { status ->
                            mainHandler.post {
                                ttsInitializing = false
                                if (status == TextToSpeech.SUCCESS) {
                                    ttsReady = true
                                    attachTtsListener()
                                    publishVoices()
                                } else {
                                    Log.w(TAG, "TextToSpeech init failed: status=$status")
                                    dispatchTts(
                                            JSONObject()
                                                    .put("kind", "error")
                                                    .put("error", "tts-init-failed")
                                    )
                                }
                            }
                        }
            } catch (t: Throwable) {
                ttsInitializing = false
                Log.e(TAG, "TextToSpeech construction failed", t)
                dispatchTts(JSONObject().put("kind", "error").put("error", "tts-init-failed"))
            }
        }
    }

    /**
     * Cached voice list as a JSON string. Empty until the engine finishes
     * initialising — mirrors how browsers report `getVoices()` before
     * `voiceschanged` fires.
     */
    @JavascriptInterface
    fun ttsGetVoices(): String = voicesJson

    /**
     * Speak [text]. Playback is queued (`QUEUE_ADD`) so a caller that streams
     * sentence by sentence never truncates the previous chunk.
     */
    @JavascriptInterface
    fun ttsSpeak(text: String?, utteranceId: String?, rate: Float, pitch: Float) {
        val spoken = text?.trim().orEmpty()
        if (spoken.isEmpty()) return
        val id = utteranceId?.takeIf { it.isNotBlank() } ?: "u-${System.nanoTime()}"

        mainHandler.post {
            val engine = tts
            if (engine == null || !ttsReady) {
                dispatchTts(
                        JSONObject()
                                .put("kind", "error")
                                .put("utteranceId", id)
                                .put("error", "not-ready")
                )
                return@post
            }
            try {
                engine.setSpeechRate(normalizeRate(rate))
                engine.setPitch(normalizePitch(pitch))
                activeUtteranceId = id
                val params = Bundle().apply { putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, id) }
                val result = engine.speak(spoken, TextToSpeech.QUEUE_ADD, params, id)
                if (result != TextToSpeech.SUCCESS) {
                    activeUtteranceId = null
                    dispatchTts(
                            JSONObject()
                                    .put("kind", "error")
                                    .put("utteranceId", id)
                                    .put("error", "speak-failed")
                    )
                }
            } catch (t: Throwable) {
                activeUtteranceId = null
                Log.e(TAG, "speak failed", t)
                dispatchTts(
                        JSONObject()
                                .put("kind", "error")
                                .put("utteranceId", id)
                                .put("error", "speak-failed")
                )
            }
        }
    }

    /**
     * Cancel everything currently queued or speaking.
     *
     * Deliberately fires no callback: callers reach this through
     * `speechSynthesis.cancel()`, and `live-engine.cancelTTS()` already resets its
     * own speaking state before calling. Emitting `done`/`error` here would race a
     * freshly started utterance and could hand the queue a stale completion.
     */
    @JavascriptInterface
    fun ttsStop() {
        mainHandler.post {
            activeUtteranceId = null
            try {
                tts?.stop()
            } catch (t: Throwable) {
                Log.w(TAG, "tts stop failed", t)
            }
        }
    }

    /**
     * Select the voice used by later [ttsSpeak] calls. Unknown names are ignored so a
     * voice that disappeared (engine update, language pack removed) degrades to the
     * engine default instead of breaking playback.
     */
    @JavascriptInterface
    fun ttsSetVoice(voiceName: String?) {
        val name = voiceName?.takeIf { it.isNotBlank() } ?: return
        mainHandler.post {
            val voice = voiceByName[name] ?: return@post
            try {
                tts?.voice = voice
            } catch (t: Throwable) {
                Log.w(TAG, "voice selection failed", t)
            }
        }
    }

    // ── TTS: internals ──────────────────────────────────────────────────────

    private fun attachTtsListener() {
        val engine = tts ?: return
        engine.setOnUtteranceProgressListener(
                object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {
                        if (utteranceId == null || utteranceId != activeUtteranceId) return
                        dispatchTts(
                                JSONObject().put("kind", "start").put("utteranceId", utteranceId)
                        )
                    }

                    override fun onDone(utteranceId: String?) {
                        if (utteranceId == null) return
                        if (utteranceId == activeUtteranceId) activeUtteranceId = null
                        dispatchTts(
                                JSONObject().put("kind", "done").put("utteranceId", utteranceId)
                        )
                    }

                    @Suppress("OVERRIDE_DEPRECATION")
                    override fun onError(utteranceId: String?) {
                        onError(utteranceId, TextToSpeech.ERROR)
                    }

                    override fun onError(utteranceId: String?, errorCode: Int) {
                        // Android passes a null id when the engine fails before it can
                        // attribute the failure to an utterance. Fall back to the one
                        // currently being spoken: the JS shim routes events by id, so an
                        // id it cannot resolve is dropped and that utterance would never
                        // settle — leaving `speechSynthesis.speaking` stuck on true.
                        val id = utteranceId ?: activeUtteranceId
                        if (id != null && id == activeUtteranceId) {
                            activeUtteranceId = null
                        }
                        dispatchTts(
                                JSONObject()
                                        .put("kind", "error")
                                        .put("utteranceId", id ?: "")
                                        .put("error", "synthesis-failed")
                                        .put("code", errorCode)
                        )
                    }
                }
        )
    }

    /**
     * Publish the engine's voices.
     *
     * `localService` is derived from [Voice.isNetworkConnectionRequired] so the JS
     * shim can offer on-device voices (no text leaves the device) and still fall
     * back to network voices when a language has no local one.
     */
    private fun publishVoices() {
        val engine = tts ?: return
        val array = JSONArray()
        voiceByName.clear()
        try {
            val voices: Set<Voice> = engine.voices ?: emptySet()
            for (voice in voices) {
                val locale = voice.locale ?: continue
                val tag = localeTag(locale)
                if (tag.isEmpty()) continue
                val name = voice.name ?: continue
                voiceByName[name] = voice
                array.put(
                        JSONObject()
                                .put("voiceURI", name)
                                .put("name", name)
                                .put("lang", tag)
                                .put("localService", !voice.isNetworkConnectionRequired)
                                .put("quality", voice.quality)
                                .put("latency", voice.latency)
                )
            }
        } catch (t: Throwable) {
            Log.w(TAG, "voice enumeration failed", t)
        }
        voicesJson = array.toString()
        dispatchTts(JSONObject().put("kind", "voices").put("voices", array))
    }

    private fun dispatchTts(payload: JSONObject) = dispatch(TTS_EVENT, payload)

    // ── STT: public surface ─────────────────────────────────────────────────

    /** Start listening. Replaces any recognizer already running. */
    @JavascriptInterface
    fun sttStart(lang: String?) {
        val requested = lang?.takeIf { it.isNotBlank() }
        mainHandler.post {
            tearDownRecognizer(abort = true)
            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                dispatchStt(JSONObject().put("kind", "error").put("error", "service-not-allowed"))
                dispatchStt(JSONObject().put("kind", "end"))
                return@post
            }
            try {
                val engine = createRecognizer()
                recognizer = engine
                engine.setRecognitionListener(recognitionListener)
                lastPartialText = ""
                engine.startListening(buildRecognizerIntent(requested))
            } catch (t: Throwable) {
                Log.e(TAG, "recognizer start failed", t)
                recognizer = null
                dispatchStt(JSONObject().put("kind", "error").put("error", "audio-capture"))
                dispatchStt(JSONObject().put("kind", "end"))
            }
        }
    }

    /** Ask the recognizer to wrap up; the engine still delivers its final result. */
    @JavascriptInterface
    fun sttStop() {
        mainHandler.post {
            try {
                recognizer?.stopListening()
            } catch (t: Throwable) {
                Log.w(TAG, "recognizer stop failed", t)
            }
        }
    }

    /** Tear down immediately, discarding any pending result. */
    @JavascriptInterface
    fun sttAbort() {
        mainHandler.post { tearDownRecognizer(abort = true) }
    }

    // ── STT: internals ──────────────────────────────────────────────────────

    /**
     * Whether the platform reports echo cancellation support.
     *
     * `AcousticEchoCanceler.isAvailable()` is a static capability query and needs
     * no audio session of its own. Resolved once and cached: the answer cannot
     * change while the app runs, and the probe is not free.
     */
    private val aecAvailable: Boolean by lazy {
        try {
            AcousticEchoCanceler.isAvailable()
        } catch (t: Throwable) {
            Log.w(TAG, "AEC availability probe failed", t)
            false
        }
    }

    /**
     * Which capture source the recognizer reads from.
     *
     * `VOICE_COMMUNICATION` routes through the telephony processing chain, so
     * the platform AEC/NS/AGC runs on what the recognizer hears — including the
     * reference of our own TTS playback, which is exactly the echo that used to
     * trigger the self-interrupt loop. It is only requested when the platform
     * actually has an echo canceller; otherwise the default source is kept,
     * because `VOICE_COMMUNICATION` without AEC just narrows the stream for no
     * benefit.
     */
    private fun audioSourceExtra(): Int =
            if (aecAvailable) MediaRecorder.AudioSource.VOICE_COMMUNICATION
            else MediaRecorder.AudioSource.VOICE_RECOGNITION

    /**
     * Describe the current echo-control posture for the JS barge-in filter.
     *
     * `aec: true` means the recognizer's stream is echo-suppressed and the
     * filter can trust short partials as genuine speech. `aec: false` means it
     * cannot, and `live-engine.js` has to stay conservative.
     */
    private fun aecStrategyJson(): JSONObject =
            JSONObject()
                    .put("aec", aecAvailable)
                    .put("source", if (aecAvailable) "voice-communication" else "voice-recognition")

    /** Expose the strategy so the shim can publish it before recognition starts. */
    @JavascriptInterface
    fun sttAecStrategy(): String =
            try {
                aecStrategyJson().toString()
            } catch (t: Throwable) {
                Log.w(TAG, "AEC strategy serialization failed", t)
                """{"aec":false,"source":"voice-recognition"}"""
            }

    private fun createRecognizer(): SpeechRecognizer =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                            SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
                // Keeps audio on the device — no utterance is uploaded for recognition.
                SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
            } else {
                SpeechRecognizer.createSpeechRecognizer(context)
            }

    /**
     * Build the recognition intent.
     *
     * Beyond the language model, three extras matter for live mode:
     *
     *  - [RecognizerIntent.EXTRA_AUDIO_SOURCE] picks the AEC-enabled capture
     *    path (see [audioSourceExtra]); without it the recognizer hears our own
     *    TTS and the echo loop returns.
     *  - [RecognizerIntent.EXTRA_PREFER_OFFLINE] keeps recognition on-device
     *    where the model exists, cutting latency and keeping speech local.
     *  - The silence-length extras align the engine's own endpointing with the
     *    timeouts live mode applies on top, so the two stop cutting each other
     *    off mid-sentence.
     */
    private fun buildRecognizerIntent(lang: String?): Intent =
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(
                        RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                        RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                )
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
                if (lang != null) putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, audioSourceExtra())
                // Masquerading offensive words mangles the transcript the barge-in
                // filter compares against, producing false "genuine speech" reads.
                putExtra(RecognizerIntent.EXTRA_MASK_OFFENSIVE_WORDS, false)
                putExtra(
                        RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS,
                        COMPLETE_SILENCE_MS
                )
                putExtra(
                        RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS,
                        POSSIBLY_COMPLETE_SILENCE_MS
                )
                putExtra(
                        RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS,
                        MINIMUM_LENGTH_MS
                )
            }

    private fun tearDownRecognizer(abort: Boolean) {
        val engine = recognizer ?: return
        recognizer = null
        try {
            if (abort) engine.cancel() else engine.stopListening()
        } catch (t: Throwable) {
            Log.w(TAG, "recognizer teardown failed", t)
        }
        try {
            engine.destroy()
        } catch (t: Throwable) {
            Log.w(TAG, "recognizer destroy failed", t)
        }
    }

    private val recognitionListener =
            object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    dispatchStt(JSONObject().put("kind", "start").put("aec", aecAvailable))
                }

                override fun onBeginningOfSpeech() {
                    dispatchStt(JSONObject().put("kind", "speechstart").put("aec", aecAvailable))
                }

                override fun onRmsChanged(rmsdB: Float) = Unit

                override fun onBufferReceived(buffer: ByteArray?) = Unit

                override fun onEndOfSpeech() {
                    dispatchStt(JSONObject().put("kind", "speechend").put("aec", aecAvailable))
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val text = firstResult(partialResults) ?: return
                    if (text.isBlank()) return
                    // Some engines emit cumulative partials, others replace; keep the
                    // longer of the two so the caller never sees the transcript shrink.
                    if (text.length >= lastPartialText.length) lastPartialText = text
                    dispatchStt(
                            JSONObject()
                                    .put("kind", "partial")
                                    .put("text", lastPartialText)
                                    .put("aec", aecAvailable)
                    )
                }

                override fun onResults(results: Bundle?) {
                    val text = firstResult(results) ?: lastPartialText
                    dispatchStt(
                            JSONObject()
                                    .put("kind", "final")
                                    .put("text", text)
                                    .put("aec", aecAvailable)
                    )
                    finishSession()
                }

                override fun onError(error: Int) {
                    dispatchStt(
                            JSONObject()
                                    .put("kind", "error")
                                    .put("error", mapRecognizerError(error))
                                    .put("aec", aecAvailable)
                    )
                    finishSession()
                }

                override fun onEvent(eventType: Int, params: Bundle?) = Unit

                /** Release the recognizer and tell JS the session is over. */
                private fun finishSession() {
                    mainHandler.post {
                        tearDownRecognizer(abort = false)
                        lastPartialText = ""
                        dispatchStt(JSONObject().put("kind", "end"))
                    }
                }
            }

    private fun firstResult(bundle: Bundle?): String? {
        val list = bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        return list?.firstOrNull()
    }

    /**
     * Map Android's error codes onto the Web Speech error strings the extension
     * already reacts to, so the restart logic in `live-engine` / `AttachMenu`
     * works unchanged.
     */
    private fun mapRecognizerError(error: Int): String =
            when (error) {
                SpeechRecognizer.ERROR_NO_MATCH,
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
                SpeechRecognizer.ERROR_AUDIO -> "audio-capture"
                SpeechRecognizer.ERROR_NETWORK,
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
                // ERROR_RECOGNIZER_BUSY / ERROR_CLIENT both mean "this session is dead,
                // start a new one" — "aborted" is what triggers the restart path.
                else -> "aborted"
            }

    private fun dispatchStt(payload: JSONObject) = dispatch(STT_EVENT, payload)

    // ── Shared ──────────────────────────────────────────────────────────────

    /**
     * Deliver a native event into the page. The payload travels as a JSON string
     * because the content script reads it from the isolated world.
     */
    private fun dispatch(eventName: String, payload: JSONObject) {
        val script =
                "(function(){try{window.dispatchEvent(new CustomEvent(${JSONObject.quote(eventName)}," +
                        "{detail:${JSONObject.quote(payload.toString())}}));}" +
                        "catch(e){console.error('[BDS] speech delivery failed',e)}})();"
        val poster = scriptPoster
        if (poster != null) {
            poster(script)
            return
        }
        mainHandler.post { evaluateJs?.invoke(script) }
    }

    /** Release everything. Called from the Activity's `onDestroy`. */
    fun release() {
        evaluateJs = null
        tearDownRecognizer(abort = true)
        voiceByName.clear()
        val engine = tts
        tts = null
        ttsReady = false
        ttsInitializing = false
        activeUtteranceId = null
        if (engine != null) {
            try {
                engine.stop()
                engine.shutdown()
            } catch (t: Throwable) {
                Log.w(TAG, "tts shutdown failed", t)
            }
        }
    }

    /** Stop in-flight speech and recognition without dropping the engine instances. */
    fun onHostPaused() {
        mainHandler.post {
            try {
                tts?.stop()
            } catch (t: Throwable) {
                Log.w(TAG, "tts pause-stop failed", t)
            }
            tearDownRecognizer(abort = true)
        }
    }

    private fun normalizeRate(rate: Float): Float =
            if (rate.isFinite() && rate > 0f) rate.coerceIn(0.1f, 3f) else 1f

    private fun normalizePitch(pitch: Float): Float =
            if (pitch.isFinite() && pitch > 0f) pitch.coerceIn(0.1f, 2f) else 1f

    private fun localeTag(locale: Locale): String {
        val tag = locale.toLanguageTag()
        return if (tag.isBlank() || tag == "und") "" else tag
    }

    companion object {
        /** JS bridge name — matches `window.AndroidSpeech`. */
        const val BRIDGE_NAME = "AndroidSpeech"

        const val TTS_EVENT = "bds:android-tts"
        const val STT_EVENT = "bds:android-stt"

        /**
         * Endpointing hints for the native engine, in milliseconds.
         *
         * Live mode applies its own silence timeout (default 1100ms) on top of the
         * engine's own endpointing. Left at the engine defaults the two disagree:
         * the engine finalises mid-sentence while the JS timer is still waiting, so
         * a single utterance arrives split in two and gets submitted twice. These
         * values keep the engine's window at or above the JS one so the JS timer is
         * always the one that ends a turn.
         */
        private const val COMPLETE_SILENCE_MS = 1200L
        private const val POSSIBLY_COMPLETE_SILENCE_MS = 1200L
        private const val MINIMUM_LENGTH_MS = 300L

        private const val TAG = "BdsSpeechBridge"
    }
}
