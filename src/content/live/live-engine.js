/**
 * Better DeepSeek Live Mode Engine.
 *
 * Implements real-time Gemini Live-style conversational voice chat:
 * - Continuous Speech-to-Text (STT) via Web Speech API and VAD
 * - Automatic turn-taking when user pauses speaking
 * - Streaming Text-to-Speech (TTS) starting after first 3-5 tokens
 * - Instant barge-in / interruption: silences TTS and halts AI generation
 * - Disables DeepThink (thinking mode) for real-time speed
 * - Dedicated live mode system prompt injection
 * - Real-time audio waveform visualizer integration
 */

import state from "../state.js";
import { VADProcessor } from "../vad-processor.js";
import { pushConfigToPage } from "../bridge.js";
import {
  findDeepSeekStopButton,
  disableDeepThinkIfActive,
  findLatestAssistantMessageNode,
  detectMessageRole,
} from "../scanner.js";
import { injectPureTextAndSend } from "../auto.js";
import { extractMessageRawText } from "../dom/message-text.js";
import { isSystemGenerating } from "../message-processor.svelte.js";
import { devLog } from "../../lib/dev-log.js";
import { cleanTextForSpeech, getBestVoice, softenPunctuationForSpeech } from "./tts-utils.js";

export { cleanTextForSpeech, getBestVoice, softenPunctuationForSpeech };

/** Upper bound for merging queued sentences into one utterance. Bigger = fewer
 *  hand-offs to the synthesizer = fewer inter-utterance gaps. */
const TTS_MERGE_LIMIT = 400;

export class LiveEngine {
  constructor() {
    this.status = "idle"; // "idle" | "listening" | "thinking" | "speaking" | "muted"
    this.isMuted = false;
    this.vadProcessor = null;
    this.recognition = null;
    this.restartRecognitionTimer = null;
    this.speechSilenceTimer = null;
    this.currentTranscript = "";
    this.accumulatedTranscript = "";
    this.spokenOffset = 0;
    this.lastAssistantNode = null;
    this.activeAssistantNode = null;
    this.responseWatchTimer = null;
    this.activeUtterances = 0;
    this.isWaitingForResponse = false;
    this.onStateChange = null; // (status, details) => void
    this.speechLang = "en-US";
    this.destroyed = false;

    this.lastSubmittedPrompt = "";

    // Timestamp of the last transcript content change (for silence detection)
    this.lastTranscriptUpdateTime = 0;
    // Guard against multiple silence sources racing to submit the same prompt
    this._submitLock = false;

    // Echo cancellation & barge-in tracking
    this.recentSpokenChunks = [];
    this.lastChunkStartTime = 0;

    // Fluent TTS Pipeline & State
    this.ttsQueue = [];
    this.isSpeakingUtterance = false;
    this.activeUtteranceSet = new Set();
    this.ttsKeepAliveTimer = null;
    this.cachedBestVoice = null;
    this.cachedVoiceLang = null;
    this.cachedVoiceURI = null;
  }

  get analyser() {
    return this.vadProcessor?.analyser || null;
  }

  setStatus(nextStatus) {
    if (this.status === nextStatus && !this.isMuted) return;
    this.status = this.isMuted ? "muted" : nextStatus;
    if (state.liveMode) {
      state.liveMode.status = this.status;
    }
    if (typeof this.onStateChange === "function") {
      this.onStateChange(this.status);
    }
    devLog("Live", `Status changed -> ${this.status}`);
  }

  async start() {
    this.destroyed = false;
    this.speechLang = state.settings.voiceLanguage || navigator.language || "en-US";
    state.liveMode.active = true;
    state.liveMode.status = "listening";
    state.liveMode.isMuted = false;
    this.isMuted = false;
    this.accumulatedTranscript = "";
    this.currentTranscript = "";
    this.recentSpokenChunks = [];
    this._submitLock = false;
    this.lastTranscriptUpdateTime = 0;

    // 1. Proactively disable DeepThink (thinking mode) in DeepSeek DOM
    disableDeepThinkIfActive();

    // 2. Notify injected script that Live Mode is active (injects Live prompt and payload flags)
    pushConfigToPage();

    // Prime Web Speech synthesis engine and cache voices
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.getVoices();
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.onvoiceschanged = () => {
          this.cachedBestVoice = null;
          try { window.speechSynthesis.getVoices(); } catch {}
        };
      } catch {}
    }

    // 3. Listen for SPA URL navigation transitions (e.g. / to /a/chat/s/:id)
    if (!this.urlChangeHandler && typeof window !== "undefined") {
      this.urlChangeHandler = () => {
        if (this.isWaitingForResponse || this.status === "thinking" || this.status === "speaking") {
          devLog("Live", "URL change detected during active generation; clearing detached node references");
          if (this.activeAssistantNode && (!this.activeAssistantNode.isConnected || !document.contains(this.activeAssistantNode))) {
            this.activeAssistantNode = null;
          }
          if (this.lastAssistantNode && (!this.lastAssistantNode.isConnected || !document.contains(this.lastAssistantNode))) {
            this.lastAssistantNode = null;
          }
        }
      };
      window.addEventListener("bds:urlChanged", this.urlChangeHandler);
    }

    // 4. Check for Speech Recognition support
    const SpeechRecognition =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

    if (!SpeechRecognition) {
      return { supported: false, error: "SpeechRecognition unsupported" };
    }

    // 4. Initialize VAD with continuous mode enabled so mic never dies between turns
    const silenceTimeout = Math.max(600, Math.min(2500, Number(state.settings?.vadSilenceTimeout) || 1100));
    this.silenceTimeout = silenceTimeout;

    try {
      this.vadProcessor = new VADProcessor({
        continuous: true,
        silenceTimeout: silenceTimeout,
        hangoverFrames: 14,      // ~233ms at 60fps — keeps natural pauses connected without sluggishness
        minSpeechFrames: 3,
        minSpeechDurationMs: 300, // 300ms minimum speech burst to avoid click/thump triggers
      });

      this.vadProcessor.onSpeechStart = () => this.handleUserSpeechStart();
      this.vadProcessor.onSpeechEnd = () => this.handleUserSpeechEnd();
      this.vadProcessor.onVADStop = () => this.handleUserSilenceStop("vad-stop");

      await this.vadProcessor.start();
    } catch (err) {
      console.warn("[BDS:Live] VAD / Mic initialization failed:", err);
    }

    // 5. Initialize Continuous Speech Recognition
    this.initRecognition(SpeechRecognition);

    this.setStatus("listening");
    return { supported: true };
  }

  initRecognition(SpeechRecognition) {
    try {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = this.speechLang;
      this.recognition.interimResults = true;
      this.recognition.continuous = true;

      this.recognition.onstart = () => {
        devLog("Live", `SpeechRecognition started (lang=${this.speechLang})`);
      };

      this.recognition.onspeechstart = () => {
        devLog("Live", "SpeechRecognition speechstart detected");
        clearTimeout(this.speechSilenceTimer);
      };

      this.recognition.onspeechend = () => {
        devLog("Live", "SpeechRecognition speechend detected");
        if (this.status === "listening" && this.currentTranscript.trim()) {
          clearTimeout(this.speechSilenceTimer);
          this.speechSilenceTimer = setTimeout(() => {
            // Double-check: if transcript has been updated recently, STT is just catching up.
            const sinceLast = Date.now() - this.lastTranscriptUpdateTime;
            if (sinceLast < 600) {
              devLog("Live", "Silence trigger deferred: transcript still updating recently");
              this.speechSilenceTimer = setTimeout(() => {
                this.handleUserSilenceStop("speechend-timer-retry");
              }, 400);
              return;
            }
            devLog("Live", "Silence trigger: speechend timer expired");
            this.handleUserSilenceStop("speechend-timer");
          }, 800); // 800ms after browser's native speechend
        }
      };

      this.recognition.onresult = (event) => {
        if (this.isMuted || this.destroyed) return;

        let sessionText = "";
        for (let i = 0; i < event.results.length; i++) {
          sessionText += event.results[i][0].transcript;
        }
        this.currentTranscript = sessionText;

        // ── BARGE-IN INTERRUPTION VIA VOICE ──
        if (this.status === "speaking") {
          const detected = sessionText.trim();
          if (detected && this.isGenuineBargeIn(detected)) {
            devLog("Live", `Voice barge-in detected: "${detected}"`);
            this.handleBargeInInterruption();
          }
          return;
        }

        // If listening and user spoke:
        if (this.status === "listening" && sessionText.trim()) {
          devLog("Live", `Transcript updated: "${sessionText}"`);

          // Track that the transcript is actively changing
          this.lastTranscriptUpdateTime = Date.now();

          clearTimeout(this.speechSilenceTimer);
          this.speechSilenceTimer = setTimeout(() => {
            // Before firing, check one more time if transcript grew since this timer started.
            const sinceLast = Date.now() - this.lastTranscriptUpdateTime;
            if (sinceLast < 800) {
              devLog("Live", "Silence trigger deferred: transcript still growing");
              this.speechSilenceTimer = setTimeout(() => {
                this.handleUserSilenceStop("result-timer-retry");
              }, 400);
              return;
            }
            devLog("Live", "Silence trigger: speech result timer expired");
            this.handleUserSilenceStop("result-timer");
          }, this.silenceTimeout || 1100);
        }
      };

      this.recognition.onerror = (event) => {
        if (this.destroyed) return;
        if (event.error === "no-speech") return;
        console.warn("[BDS:Live] SpeechRecognition error:", event.error);
        if (
          event.error === "network" ||
          event.error === "audio-capture" ||
          event.error === "aborted"
        ) {
          clearTimeout(this.restartRecognitionTimer);
          this.restartRecognitionTimer = setTimeout(() => {
            this.restartRecognition();
          }, 300);
        }
      };

      this.recognition.onend = () => {
        if (this.destroyed || !state.liveMode?.active) return;
        clearTimeout(this.restartRecognitionTimer);
        this.restartRecognitionTimer = setTimeout(() => {
          this.restartRecognition();
        }, 150);
      };

      this.recognition.start();
    } catch (err) {
      console.warn("[BDS:Live] Failed to start SpeechRecognition:", err);
    }
  }

  restartRecognition() {
    if (this.destroyed || !state.liveMode?.active) return;
    try {
      if (this.recognition) {
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.onresult = null;
        try {
          this.recognition.abort();
        } catch {}
        this.recognition = null;
      }
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.initRecognition(SpeechRecognition);
      }
    } catch (e) {
      console.warn("[BDS:Live] Recognition restart error:", e);
    }
  }

  /**
   * Discriminate between genuine user barge-in and the microphone
   * picking up the speaker's own Text-to-Speech output.
   */
  isGenuineBargeIn(recognizedText) {
    if (!recognizedText || !recognizedText.trim()) return false;

    // Disregard onset click/transient in the first 400ms of audio chunk
    if (Date.now() - this.lastChunkStartTime < 400) {
      return false;
    }

    const cleanInput = recognizedText.toLowerCase().replace(/[.,!?;:"]/g, "").trim();
    if (!cleanInput) return false;

    // Check if the recognized words are simply an echo of recent AI speech
    const now = Date.now();
    const recentSpoken = this.recentSpokenChunks
      .filter((c) => now - c.timestamp < 8000)
      .map((c) => c.text)
      .join(" ");

    if (recentSpoken) {
      // Substring match
      if (recentSpoken.includes(cleanInput)) {
        return false;
      }
      // Word overlap match
      const inputWords = cleanInput.split(/\s+/).filter(Boolean);
      if (inputWords.length > 0) {
        const matchingWords = inputWords.filter((w) => recentSpoken.includes(w));
        if (matchingWords.length / inputWords.length >= 0.75) {
          return false;
        }
      }
    }

    return true;
  }

  handleUserSpeechStart() {
    if (this.isMuted || this.destroyed) return;

    // If AI is in thinking mode (request sent, tokens generating, but TTS not speaking yet):
    // Room is quiet, so any speech is a genuine user barge-in!
    if (this.status === "thinking") {
      devLog("Live", "User spoke during thinking: canceling AI generation");
      this.handleBargeInInterruption();
      return;
    }

    // In speaking mode, we intentionally DO NOT interrupt purely on VAD energy
    // because laptop speakers feed back into the mic. Voice barge-in during
    // speaking is handled by isGenuineBargeIn in SpeechRecognition.onresult!
  }

  handleBargeInInterruption() {
    devLog("Live", "Barge-in: silencing TTS and interrupting AI generation");
    clearTimeout(this.speechSilenceTimer);
    this.cancelTTS();
    this.stopAIGeneration();
    this.stopResponseWatcher();
    this.spokenOffset = 0;
    this.activeAssistantNode = null;
    this._submitLock = false;
    this.setStatus("listening");
  }

  handleUserSpeechEnd() {
    // Handled by silence stop
  }

  handleUserSilenceStop(source = "unknown") {
    if (this.isMuted || this.destroyed) return;

    // Silence timeout only submits prompts when actively in listening state
    if (this.status !== "listening") return;

    // Prevent multiple sources from racing to submit the same utterance
    if (this._submitLock) {
      devLog("Live", `Silence stop from '${source}' skipped: submit already in progress`);
      return;
    }

    clearTimeout(this.speechSilenceTimer);

    const fullTranscript = (
      this.currentTranscript ||
      this.accumulatedTranscript ||
      ""
    ).trim();

    if (!fullTranscript) {
      // Nothing said; keep listening
      return;
    }

    // If the transcript was updated very recently, the user may still be
    // in mid-sentence. Defer unless enough silence has truly elapsed.
    const sinceLast = Date.now() - this.lastTranscriptUpdateTime;
    if (sinceLast < 700 && source !== "result-timer-retry" && source !== "speechend-timer-retry") {
      devLog("Live", `Silence stop from '${source}' deferred: transcript updated ${sinceLast}ms ago`);
      this.speechSilenceTimer = setTimeout(() => {
        this.handleUserSilenceStop(source + "-deferred");
      }, 500);
      return;
    }

    this._submitLock = true;

    devLog("Live", `User utterance captured via ${source}: "${fullTranscript}"`);
    this.accumulatedTranscript = "";
    this.currentTranscript = "";
    this.lastTranscriptUpdateTime = 0;

    // Send the prompt to DeepSeek
    void this.submitUserPrompt(fullTranscript);
  }

  async submitUserPrompt(text) {
    if (this.destroyed || !text.trim()) return;

    clearTimeout(this.speechSilenceTimer);
    this.setStatus("thinking");
    this.cancelTTS();
    this.spokenOffset = 0;
    this.activeAssistantNode = null;
    this.lastSubmittedPrompt = text.trim();
    this.isWaitingForResponse = true;
    this._submitLock = false; // release lock now that we've transitioned state

    // Reset recognition session so next turn starts with clean event.results
    this.restartRecognition();

    // Ensure DeepThink is disabled in the DOM before sending
    disableDeepThinkIfActive();

    // Mark previous latest assistant node so we detect the new one
    this.lastAssistantNode = this.findLatestAssistantNode();

    // Send prompt
    const sent = await injectPureTextAndSend(text, "Live Voice Prompt");
    if (!sent) {
      console.warn("[BDS:Live] Failed to inject prompt into chat editor");
      this.setStatus("listening");
      return;
    }

    // Start watching for AI response tokens
    this.startResponseWatcher();
  }

  findLatestAssistantNode() {
    if (typeof document === "undefined") return null;

    // 1. Direct search targeting genuine assistant markdown containers
    const markdowns = Array.from(
      document.querySelectorAll(".ds-markdown, [class*='ds-markdown']")
    );

    for (let i = markdowns.length - 1; i >= 0; i--) {
      const md = markdowns[i];
      if (!md.isConnected || !document.contains(md)) {
        continue;
      }
      if (
        md.closest("#bds-root") ||
        md.closest(".bds-host-wrapper") ||
        md.closest(".bds-message-overlay")
      ) {
        continue;
      }

      // Skip user message subtrees
      if (
        md.closest("div._9663006, .d29f3d7d, .fbb737a4") ||
        md.closest("[data-message-author-role='user']") ||
        md.closest(".ds-icon-user")
      ) {
        continue;
      }

      const host =
        md.closest("div.ds-message, [data-message-author-role='assistant']") ||
        md.closest(".ds-message") ||
        md;

      // Ensure host is not marked as user
      const authorRole = host.getAttribute?.("data-message-author-role");
      if (authorRole === "user") continue;
      if (
        host.querySelector?.(
          "div._9663006, .d29f3d7d, .fbb737a4, [data-message-author-role='user']"
        )
      ) {
        continue;
      }

      // Candidate text must not be identical to user's freshly submitted prompt
      const raw = (extractMessageRawText(host) || md.textContent || "").trim();
      if (
        this.lastSubmittedPrompt &&
        raw &&
        raw.toLowerCase() === this.lastSubmittedPrompt.toLowerCase()
      ) {
        continue;
      }

      return host;
    }

    // 2. Fallback using scanner's findLatestAssistantMessageNode
    const fallback = findLatestAssistantMessageNode();
    if (fallback) {
      if (
        fallback.closest("#bds-root") ||
        fallback.querySelector?.(
          "div._9663006, .d29f3d7d, .fbb737a4, [data-message-author-role='user']"
        ) ||
        fallback.getAttribute?.("data-message-author-role") === "user"
      ) {
        return null;
      }
      const raw = (extractMessageRawText(fallback) || "").trim();
      if (
        this.lastSubmittedPrompt &&
        raw &&
        raw.toLowerCase() === this.lastSubmittedPrompt.toLowerCase()
      ) {
        return null;
      }
      return fallback;
    }

    return null;
  }

  startResponseWatcher() {
    this.stopResponseWatcher();

    let attempts = 0;
    const maxWaitAttempts = 200; // ~10 seconds
    const watchStartTime = Date.now();
    let generationObserved = false;
    let lastText = "";
    let lastTextChangeAt = Date.now();

    this.responseWatchTimer = setInterval(() => {
      if (this.destroyed || !state.liveMode?.active) {
        this.stopResponseWatcher();
        return;
      }

      // If active assistant node was detached from DOM (SPA session URL redirect on new chat), re-discover it
      if (
        this.activeAssistantNode &&
        (!this.activeAssistantNode.isConnected || !document.contains(this.activeAssistantNode))
      ) {
        devLog("Live", "Active assistant node detached during SPA route transition; re-discovering...");
        this.activeAssistantNode = null;
      }

      attempts++;
      const latestAssistant = this.findLatestAssistantNode();

      // Check if a new assistant message has arrived
      if (!this.activeAssistantNode) {
        if (latestAssistant && latestAssistant !== this.lastAssistantNode) {
          const rawText = (extractMessageRawText(latestAssistant) || "").trim();
          if (
            this.lastSubmittedPrompt &&
            rawText &&
            rawText.toLowerCase() === this.lastSubmittedPrompt.toLowerCase()
          ) {
            devLog("Live", "Watcher skipped node matching user's own prompt:", rawText);
          } else {
            this.activeAssistantNode = latestAssistant;
            lastTextChangeAt = Date.now();
            devLog("Live", "Active assistant node captured for streaming");
          }
        } else if (
          attempts > maxWaitAttempts &&
          !isSystemGenerating() &&
          !findDeepSeekStopButton()
        ) {
          devLog("Live", "Response watch timed out waiting for assistant node");
          this.stopResponseWatcher();
          this.activeAssistantNode = null;
          this.setStatus("listening");
          return;
        }
      }

      if (this.activeAssistantNode) {
        const rawText = extractMessageRawText(this.activeAssistantNode) || "";
        const cleanText = cleanTextForSpeech(rawText);
        const unread = cleanText.slice(this.spokenOffset);

        // Detect generation activity: growing text, cursor, or stop button
        const hasCursor = Boolean(
          this.activeAssistantNode.querySelector(".ds-cursor, ._streaming")
        );
        const hasStopButton = Boolean(findDeepSeekStopButton() || isSystemGenerating());

        if (cleanText.length > lastText.length || hasCursor || hasStopButton) {
          generationObserved = true;
          if (cleanText !== lastText) {
            lastText = cleanText;
            lastTextChangeAt = Date.now();
          }
        }

        // Extra safeguard: do not speak if the text is exactly the user prompt
        if (
          this.lastSubmittedPrompt &&
          cleanText.trim().toLowerCase() === this.lastSubmittedPrompt.toLowerCase()
        ) {
          devLog("Live", "Ignoring node content because it equals user prompt");
          return;
        }

        // ── STREAMING TTS: Natural sentence chunking ──
        if (this.spokenOffset === 0) {
          // First chunk: start as soon as first full sentence arrives (or at least 45 chars for long opening clauses)
          const sentenceEndMatch = unread.match(/^([\s\S]*?[.!?\n]+)(?:\s+|$)/);
          if (sentenceEndMatch && sentenceEndMatch[1].trim().length >= 8) {
            const chunk = sentenceEndMatch[1].trim();
            this.spokenOffset += sentenceEndMatch[0].length;
            this.speakChunk(chunk);
          } else if (unread.length >= 45) {
            // Introductory clause fallback: split at comma or space (min 25 chars)
            let splitIdx = -1;
            const commaIdx = unread.indexOf(",", 25);
            if (commaIdx !== -1 && commaIdx <= 60) {
              splitIdx = commaIdx + 1;
            } else {
              const spaceIdx = unread.lastIndexOf(" ", 55);
              if (spaceIdx > 25) {
                splitIdx = spaceIdx;
              }
            }

            if (splitIdx > 0) {
              const chunk = unread.slice(0, splitIdx).trim();
              if (chunk) {
                this.spokenOffset += splitIdx;
                this.speakChunk(chunk);
              }
            }
          }
        } else {
          // Subsequent chunks: ONLY split on full sentence boundaries [.!?\n]+ (never on commas or colons)
          const sentenceMatch = unread.match(/^([\s\S]*?[.!?\n]+)(?:\s+|$)/);
          if (sentenceMatch) {
            const chunk = sentenceMatch[1].trim();
            this.spokenOffset += sentenceMatch[0].length;
            this.speakChunk(chunk);
          } else if (unread.length >= 140) {
            // Long sentence fallback: only if a sentence exceeds 140 characters without ending punctuation
            const spaceIdx = unread.lastIndexOf(" ", 140);
            const splitIdx = spaceIdx > 40 ? spaceIdx : 140;
            const chunk = unread.slice(0, splitIdx).trim();
            this.spokenOffset += splitIdx;
            this.speakChunk(chunk);
          }
        }

        // Check if generation completed
        const now = Date.now();
        const timeSinceLastChange = now - lastTextChangeAt;
        const timeSinceWatchStart = now - watchStartTime;

        const hasActionButtons = Boolean(
          this.activeAssistantNode.querySelector?.(
            ".ds-icon-copy, .ds-icon-regenerate, .ds-icon-share, [class*='copy'], [class*='regenerate']"
          )
        );

        // Generation is finished ONLY when:
        // 1. Text has actually arrived (cleanText.length > 0)
        // 2. Generation has been observed (or at least 1.5s passed since watch began)
        // 3. Stop button is gone
        // 4. Streaming cursor is gone
        // 5. Either action buttons have appeared OR text has stayed unchanged for >= 800ms
        const isGenerationDone =
          cleanText.length > 0 &&
          (generationObserved || timeSinceWatchStart > 1500) &&
          !hasStopButton &&
          !hasCursor &&
          (hasActionButtons || timeSinceLastChange >= 800);

        if (isGenerationDone) {
          devLog("Live", "AI generation completed; flushing remaining text");
          // Flush any final remaining text
          const remainder = cleanText.slice(this.spokenOffset).trim();
          if (remainder) {
            this.spokenOffset = cleanText.length;
            this.speakChunk(remainder, true);
          }
          this.isWaitingForResponse = false;
          this.stopResponseWatcher();
          this.activeAssistantNode = null;

          // If nothing was queued to speak, resume listening
          if (!this.isSpeakingUtterance && this.ttsQueue.length === 0 && this.activeUtterances === 0) {
            this.setStatus("listening");
          }
        }
      }
    }, 50);
  }

  stopResponseWatcher() {
    if (this.responseWatchTimer) {
      clearInterval(this.responseWatchTimer);
      this.responseWatchTimer = null;
    }
  }

  getVoice() {
    const preferredURI = state.settings.voiceURI || "";
    if (
      !this.cachedBestVoice ||
      this.cachedVoiceLang !== this.speechLang ||
      this.cachedVoiceURI !== preferredURI
    ) {
      this.cachedBestVoice = getBestVoice(this.speechLang, preferredURI);
      this.cachedVoiceLang = this.speechLang;
      this.cachedVoiceURI = preferredURI;
      if (this.cachedBestVoice) {
        devLog("Live", `Selected high-quality TTS voice: "${this.cachedBestVoice.name}" (${this.cachedBestVoice.lang})`);
      }
    }
    return this.cachedBestVoice;
  }

  speakChunk(text, isFinal = false) {
    if (!text || !text.trim() || typeof window === "undefined" || !window.speechSynthesis) return;
    this.queueTTS(text);
  }

  queueTTS(text) {
    if (!text || !text.trim()) return;
    this.ttsQueue.push(text.trim());
    this.processTTSQueue();
  }

  processTTSQueue() {
    if (this.destroyed || this.isMuted) return;
    if (this.isSpeakingUtterance) return;
    if (this.ttsQueue.length === 0) return;

    // Merge pending sentences from queue into a fluid paragraph (up to TTS_MERGE_LIMIT
    // chars) to avoid inter-chunk gaps and robotic pauses
    let combinedText = this.ttsQueue.shift();
    while (this.ttsQueue.length > 0) {
      const next = this.ttsQueue[0];
      if (combinedText.length + next.length + 1 <= TTS_MERGE_LIMIT) {
        combinedText += " " + this.ttsQueue.shift();
      } else {
        break;
      }
    }

    this.speakUtterance(combinedText);
  }

  speakUtterance(text) {
    if (!text || !text.trim() || typeof window === "undefined" || !window.speechSynthesis) return;

    this.setStatus("speaking");
    this.lastChunkStartTime = Date.now();
    this.isSpeakingUtterance = true;

    const cleanSpoken = text.toLowerCase().replace(/[.,!?;:"]/g, "").trim();
    this.recentSpokenChunks.push({ text: cleanSpoken, timestamp: Date.now() });
    if (this.recentSpokenChunks.length > 12) {
      this.recentSpokenChunks.shift();
    }

    // Shorten punctuation pauses: sentence/clause marks become commas (the engine's
    // shortest pause) instead of long full-stop silences, so clauses still breathe.
    const spokenText = softenPunctuationForSpeech(text);
    if (!spokenText) return;

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = this.speechLang;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    const voice = this.getVoice();
    if (voice) {
      utterance.voice = voice;
    }

    // Retain in Set to prevent V8 Garbage Collector from killing active playback
    this.activeUtteranceSet.add(utterance);
    this.activeUtterances++;

    this.ensureTtsKeepAlive();

    utterance.onend = () => {
      this.activeUtteranceSet.delete(utterance);
      this.activeUtterances = Math.max(0, this.activeUtterances - 1);
      this.isSpeakingUtterance = false;

      if (this.ttsQueue.length > 0) {
        this.processTTSQueue();
      } else if (!this.isWaitingForResponse && this.activeUtterances === 0) {
        this.stopTtsKeepAlive();
        if (this.status === "speaking") {
          this.accumulatedTranscript = "";
          this.currentTranscript = "";
          this.setStatus("listening");
        }
      }
    };

    utterance.onerror = (err) => {
      devLog("Live", "TTS utterance error:", err);
      this.activeUtteranceSet.delete(utterance);
      this.activeUtterances = Math.max(0, this.activeUtterances - 1);
      this.isSpeakingUtterance = false;

      if (this.ttsQueue.length > 0) {
        this.processTTSQueue();
      } else if (!this.isWaitingForResponse && this.activeUtterances === 0) {
        this.stopTtsKeepAlive();
        if (this.status === "speaking") {
          this.accumulatedTranscript = "";
          this.currentTranscript = "";
          this.setStatus("listening");
        }
      }
    };

    try {
      if (typeof window.speechSynthesis.resume === "function" && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch {}

    window.speechSynthesis.speak(utterance);
  }

  ensureTtsKeepAlive() {
    if (this.ttsKeepAliveTimer) return;
    this.ttsKeepAliveTimer = setInterval(() => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        if (window.speechSynthesis.speaking) {
          try {
            if (typeof window.speechSynthesis.pause === "function") {
              window.speechSynthesis.pause();
            }
            if (typeof window.speechSynthesis.resume === "function") {
              window.speechSynthesis.resume();
            }
          } catch {}
        }
      }
    }, 10000);
  }

  stopTtsKeepAlive() {
    if (this.ttsKeepAliveTimer) {
      clearInterval(this.ttsKeepAliveTimer);
      this.ttsKeepAliveTimer = null;
    }
  }

  cancelTTS() {
    this.stopTtsKeepAlive();
    this.ttsQueue = [];
    this.isSpeakingUtterance = false;
    this.activeUtterances = 0;
    this.activeUtteranceSet.clear();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  stopAIGeneration() {
    const stopBtn = findDeepSeekStopButton();
    if (stopBtn) {
      stopBtn.click();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    state.liveMode.isMuted = this.isMuted;
    if (this.isMuted) {
      this.cancelTTS();
      this.setStatus("muted");
    } else {
      this.setStatus("listening");
    }
    return this.isMuted;
  }

  interrupt() {
    this.cancelTTS();
    this.stopAIGeneration();
    this.stopResponseWatcher();
    this.spokenOffset = 0;
    this.activeAssistantNode = null;
    this._submitLock = false;
    this.setStatus("listening");
  }

  stop() {
    this.destroyed = true;
    clearTimeout(this.restartRecognitionTimer);
    clearTimeout(this.speechSilenceTimer);
    this.cancelTTS();
    this.stopResponseWatcher();
    if (this.urlChangeHandler && typeof window !== "undefined") {
      window.removeEventListener("bds:urlChanged", this.urlChangeHandler);
      this.urlChangeHandler = null;
    }
    this.activeAssistantNode = null;
    this.lastAssistantNode = null;
    this.lastSubmittedPrompt = "";
    this.spokenOffset = 0;

    if (this.vadProcessor) {
      this.vadProcessor.stop();
      this.vadProcessor = null;
    }

    if (this.recognition) {
      this.recognition.onend = null;
      this.recognition.onerror = null;
      this.recognition.onresult = null;
      try {
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }

    state.liveMode.active = false;
    state.liveMode.status = "idle";
    state.liveMode.isMuted = false;
    this.isMuted = false;
    this.accumulatedTranscript = "";
    this.currentTranscript = "";
    this.recentSpokenChunks = [];
    this._submitLock = false;
    this.lastTranscriptUpdateTime = 0;

    // Restore normal config in injected script
    pushConfigToPage();

    this.setStatus("idle");
    devLog("Live", "LiveEngine stopped and cleaned up");
  }
}

export const liveEngine = new LiveEngine();
