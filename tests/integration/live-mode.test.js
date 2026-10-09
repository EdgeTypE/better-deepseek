// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import state from "../../src/content/state.js";
import { resetAppState } from "../helpers/app-state.js";
import { DEFAULT_SYSTEM_PROMPT, LIVE_MODE_SYSTEM_PROMPT } from "../../src/lib/constants.js";
import { cleanTextForSpeech, getBestVoice, softenPunctuationForSpeech, LiveEngine } from "../../src/content/live/live-engine.js";
import { buildHiddenPrefix, mutatePayload } from "../../src/injected/payload-mutator.js";
import { disableDeepThinkIfActive, findDeepSeekStopButton } from "../../src/content/scanner.js";

// The native AEC posture drives barge-in thresholds. Mocked here so both
// postures can be exercised without a device; the real accessor is covered by
// the android-speech shim tests.
vi.mock("../../src/platform/android-speech.js", () => ({
  isAndroidAecActive: vi.fn(() => null),
}));
import { isAndroidAecActive } from "../../src/platform/android-speech.js";

describe("Live Mode - cleanTextForSpeech", () => {
  it("strips think blocks", () => {
    const input = "<think>Let me ponder this deeply...</think>Hello, how can I help you today?";
    expect(cleanTextForSpeech(input)).toBe("Hello, how can I help you today?");
  });

  it("strips BDS tags and brackets", () => {
    const input = "<BDS:create_file fileName=\"test.txt\">hello</BDS:create_file>Sure, here is your file. [BDS:AUTO_FILE_READ_RESULT] data [/BDS:AUTO_FILE_READ_RESULT]";
    expect(cleanTextForSpeech(input)).toBe("Sure, here is your file. data");
  });

  it("strips markdown formatting, code fences, headers and URLs", () => {
    const input = "### Title\nHere is **bold** and `code`.\n```js\nconsole.log(1);\n```\nVisit https://example.com for more.";
    expect(cleanTextForSpeech(input)).toBe("Title Here is bold and code. Visit for more.");
  });

  it("strips bullet points, numbered lists and emojis for natural speech", () => {
    const input = "Harika haber! 😊\n- Birinci adım\n2. İkinci adım\n• Üçüncü adım 👍";
    expect(cleanTextForSpeech(input)).toBe("Harika haber! Birinci adım İkinci adım Üçüncü adım");
  });

  it("handles null and empty input gracefully", () => {
    expect(cleanTextForSpeech("")).toBe("");
    expect(cleanTextForSpeech(null)).toBe("");
  });
});

describe("Live Mode - softenPunctuationForSpeech", () => {
  it("keeps commas and downgrades every clause mark to a comma", () => {
    expect(softenPunctuationForSpeech("Merhaba, nasılsın? İyiyim; teşekkürler: evet."))
      .toBe("Merhaba, nasılsın, İyiyim, teşekkürler, evet");
  });

  it("downgrades sentence ends to a comma so the pause is shorter, not gone", () => {
    expect(softenPunctuationForSpeech("Birinci cümle. İkinci cümle! Üçüncü mü?"))
      .toBe("Birinci cümle, İkinci cümle, Üçüncü mü");
  });

  it("leaves decimals alone when shortening sentence pauses", () => {
    expect(softenPunctuationForSpeech("Fiyat 3.14 TL, değil mi?"))
      .toBe("Fiyat 3.14 TL, değil mi");
  });

  it("turns a spaced dash into a comma but keeps hyphenated words", () => {
    expect(softenPunctuationForSpeech("e-mail adresi (burada) — ve devamı"))
      .toBe("e-mail adresi burada, ve devamı");
  });

  it("collapses the extra whitespace it creates", () => {
    expect(softenPunctuationForSpeech("A, B;  C")).toBe("A, B, C");
  });

  it("leaves already plain text untouched", () => {
    expect(softenPunctuationForSpeech("Düz metin burada")).toBe("Düz metin burada");
  });

  it("softens Arabic and Persian punctuation to the Arabic comma", () => {
    expect(softenPunctuationForSpeech("سلام، چطوری؟ خوبم؛ ممنون."))
      .toBe("سلام، چطوری، خوبم، ممنون");
  });

  it("handles null and empty input gracefully", () => {
    expect(softenPunctuationForSpeech("")).toBe("");
    expect(softenPunctuationForSpeech(null)).toBe("");
  });
});

describe("Live Mode - getBestVoice", () => {
  it("selects natural / neural cloud voice over legacy desktop voice", () => {
    const mockVoices = [
      { name: "Microsoft Tolga Desktop - Turkish", lang: "tr-TR", localService: true },
      { name: "Google Türkçe", lang: "tr-TR", localService: false },
      { name: "Microsoft David Desktop - English (United States)", lang: "en-US", localService: true },
    ];
    window.speechSynthesis.getVoices = vi.fn(() => mockVoices);

    const voiceTr = getBestVoice("tr-TR");
    expect(voiceTr).toBe(mockVoices[1]); // Google Türkçe wins

    const mockEdgeVoices = [
      { name: "Microsoft Tolga Desktop - Turkish", lang: "tr-TR", localService: true },
      { name: "Microsoft Ahmet Online (Natural) - Turkish (Turkey)", lang: "tr-TR", localService: false },
    ];
    window.speechSynthesis.getVoices = vi.fn(() => mockEdgeVoices);

    const voiceEdge = getBestVoice("tr-TR");
    expect(voiceEdge).toBe(mockEdgeVoices[1]); // Natural voice wins
  });

  it("honours an explicit voiceURI pick over a higher-scoring voice", () => {
    const mockVoices = [
      { name: "Microsoft Tolga Desktop - Turkish", lang: "tr-TR", localService: true, voiceURI: "urn:tolga" },
      { name: "Microsoft Ahmet Online (Natural) - Turkish (Turkey)", lang: "tr-TR", localService: false, voiceURI: "urn:ahmet" },
      { name: "Microsoft Emel Online (Natural) - Turkish (Turkey)", lang: "tr-TR", localService: false, voiceURI: "urn:emel" },
    ];
    window.speechSynthesis.getVoices = vi.fn(() => mockVoices);

    // Auto would land on Ahmet (first of the equally-scored Natural voices), so
    // both picks below prove the override beats the score, not just ties with it.
    expect(getBestVoice("tr-TR", "urn:emel")).toBe(mockVoices[2]);
    expect(getBestVoice("tr-TR", "urn:tolga")).toBe(mockVoices[0]);
  });

  it("falls back to the heuristic when the saved voiceURI is gone", () => {
    const mockVoices = [
      { name: "Microsoft Tolga Desktop - Turkish", lang: "tr-TR", localService: true, voiceURI: "urn:tolga" },
      { name: "Google Türkçe", lang: "tr-TR", localService: false, voiceURI: "urn:google" },
    ];
    window.speechSynthesis.getVoices = vi.fn(() => mockVoices);

    // Voice removed by an OS/browser update — must not leave TTS silent.
    expect(getBestVoice("tr-TR", "urn:removed")).toBe(mockVoices[1]);
  });

  it("treats an empty or omitted preference as Auto", () => {
    const mockVoices = [
      { name: "Microsoft Tolga Desktop - Turkish", lang: "tr-TR", localService: true, voiceURI: "urn:tolga" },
      { name: "Google Türkçe", lang: "tr-TR", localService: false, voiceURI: "urn:google" },
    ];
    window.speechSynthesis.getVoices = vi.fn(() => mockVoices);

    expect(getBestVoice("tr-TR")).toBe(mockVoices[1]);
    expect(getBestVoice("tr-TR", "")).toBe(mockVoices[1]);
  });
});

function makeMockInjectedState(configOverrides = {}) {
  return {
    config: {
      isLiveMode: false,
      systemPrompt: "",
      systemPromptEntries: [],
      skills: [],
      memories: [],
      activeCharacter: null,
      activeProject: null,
      projectRagEnabled: false,
      deepResearch: { enabled: false },
      ...configOverrides,
    },
    sessionUserMsgCounts: {},
  };
}

describe("Live Mode - System Prompt & Payload Mutation", () => {
  beforeEach(() => {
    resetAppState();
  });

  it("injects LIVE_MODE_SYSTEM_PROMPT into hidden prefix when isLiveMode is true, suppressing main systemPrompt", () => {
    const mockState = makeMockInjectedState({
      isLiveMode: true,
      systemPrompt: "Default prompt",
    });

    const prefix = buildHiddenPrefix("hello", "conv-1", mockState, true, [], null);
    expect(prefix).toContain(LIVE_MODE_SYSTEM_PROMPT);
    expect(prefix).not.toContain("Default prompt");
  });

  it("suppresses DEFAULT_SYSTEM_PROMPT in live mode even when forceSystemPrompt is true", () => {
    const mockState = makeMockInjectedState({
      isLiveMode: true,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
    });

    const prefix = buildHiddenPrefix("hello", "conv-1", mockState, true, [], null);
    expect(prefix).toContain(LIVE_MODE_SYSTEM_PROMPT);
    expect(prefix).not.toContain(DEFAULT_SYSTEM_PROMPT);
  });

  it("does not inject LIVE_MODE_SYSTEM_PROMPT when isLiveMode is false, and injects main systemPrompt", () => {
    const mockState = makeMockInjectedState({
      isLiveMode: false,
      systemPrompt: "Default prompt",
    });

    const prefix = buildHiddenPrefix("hello", "conv-1", mockState, true, [], null);
    expect(prefix).not.toContain("LIVE VOICE MODE");
    expect(prefix).toContain("Default prompt");
  });

  it("does not inject MCP server tools/block when isLiveMode is true", () => {
    const mockState = makeMockInjectedState({
      isLiveMode: true,
      mcpToolSchemas: [
        {
          serverName: "test-server",
          serverUrl: "http://localhost:3000",
          toolName: "fetch_data",
          description: "Fetch mock data",
        },
      ],
    });

    const prefix = buildHiddenPrefix("hello", "conv-1", mockState, true, [], null);
    expect(prefix).toContain(LIVE_MODE_SYSTEM_PROMPT);
    expect(prefix).not.toContain("BDS:MCP");
    expect(prefix).not.toContain("test-server");
  });

  it("injects MCP server tools/block when isLiveMode is false", () => {
    const mockState = makeMockInjectedState({
      isLiveMode: false,
      mcpToolSchemas: [
        {
          serverName: "test-server",
          serverUrl: "http://localhost:3000",
          toolName: "fetch_data",
          description: "Fetch mock data",
        },
      ],
    });

    const prefix = buildHiddenPrefix("hello", "conv-1", mockState, true, [], null);
    expect(prefix).toContain("BDS:MCP");
    expect(prefix).toContain("test-server");
  });

  it("forces thinking_enabled = false in payload when isLiveMode is true", () => {
    const payload = {
      model: "deepseek-chat",
      messages: [{ role: "user", content: "hello" }],
      thinking_enabled: true,
      chat_session: { thinking_enabled: true },
      model_pref: { thinking_enabled: true },
    };

    const mockState = makeMockInjectedState({
      isLiveMode: true,
    });

    const { changed, payload: modified } = mutatePayload(payload, mockState);
    expect(changed).toBe(true);
    expect(modified.thinking_enabled).toBe(false);
    expect(modified.chat_session.thinking_enabled).toBe(false);
    expect(modified.model_pref.thinking_enabled).toBe(false);
  });

  it("leaves thinking_enabled unchanged when isLiveMode is false", () => {
    const payload = {
      model: "deepseek-chat",
      messages: [{ role: "user", content: "hello" }],
      thinking_enabled: true,
    };

    const mockState = makeMockInjectedState({
      isLiveMode: false,
    });

    mutatePayload(payload, mockState);
    expect(payload.thinking_enabled).toBe(true);
  });
});

describe("Live Mode - disableDeepThinkIfActive & findDeepSeekStopButton", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("clicks active DeepThink toggle button and returns true", () => {
    const btn = document.createElement("div");
    btn.className = "ds-toggle-button ds-toggle-button--selected";
    btn.innerHTML = `<svg><path d="M7.0643 test"></path></svg><span>DeepThink</span>`;
    let clicked = false;
    btn.addEventListener("click", () => { clicked = true; });
    document.body.appendChild(btn);

    const result = disableDeepThinkIfActive();
    expect(result).toBe(true);
    expect(clicked).toBe(true);
  });

  it("returns false if DeepThink toggle is not active", () => {
    const btn = document.createElement("div");
    btn.className = "ds-toggle-button";
    btn.innerHTML = `<svg><path d="M7.0643 test"></path></svg><span>DeepThink</span>`;
    document.body.appendChild(btn);

    const result = disableDeepThinkIfActive();
    expect(result).toBe(false);
  });

  it("clicks the active DeepThink chip when its label and icon are localized (Lottie)", () => {
    // Live Turkish DOM: Lottie icon (no static `M7.0643`) and no English label,
    // so the chip is only identifiable by the icon's stable centre dot.
    const btn = document.createElement("div");
    btn.className = "f79352dc ds-toggle-button ds-toggle-button--m ds-toggle-button--selected";
    btn.innerHTML = `
      <div class="ds-toggle-button__icon"><div class="ds-icon">
        <div class="ds-lottie-toggle-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16">
            <path fill="rgb(15,17,20)" fill-opacity="1" d=" M8,6.769999980926514 C8.678836822509766,7.321163177490234"></path>
            <path stroke-width="1.4" fill-opacity="0" d=" M10.730999946594238,5.269000053405762 C13.935999870300293,8.473999977111816"></path>
          </svg>
        </div>
      </div></div>
      <span>Derin Düşünme</span>
    `;
    let clicked = false;
    btn.addEventListener("click", () => { clicked = true; });
    document.body.appendChild(btn);

    const result = disableDeepThinkIfActive();
    expect(result).toBe(true);
    expect(clicked).toBe(true);
  });

  it("never clicks the selected Search chip when DeepThink cannot be identified", () => {
    // The Search chip is selected and shares every structural marker with
    // DeepThink apart from its icon, so an icon miss must stay a no-op rather
    // than fall back to "the selected mode chip".
    const btn = document.createElement("div");
    btn.className = "f79352dc ds-toggle-button ds-toggle-button--m ds-toggle-button--selected";
    btn.innerHTML = `
      <div class="ds-toggle-button__icon"><div class="ds-icon">
        <div class="ds-lottie-toggle-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16">
            <path stroke-width="1.4" fill-opacity="0" d=" M7.999599933624268,14.849200248718262 C9.598299980163574,11.78279972076416"></path>
            <path stroke-width="1.4" fill-opacity="0" d=" M1.6399999856948853,8 C1.6399999856948853,8 14.359999656677246,8"></path>
          </svg>
        </div>
      </div></div>
      <span>Akıllı Arama</span>
    `;
    let clicked = false;
    btn.addEventListener("click", () => { clicked = true; });
    document.body.appendChild(btn);

    const result = disableDeepThinkIfActive();
    expect(result).toBe(false);
    expect(clicked).toBe(false);
  });

  it("finds stop button correctly", () => {
    const stopBtn = document.createElement("button");
    stopBtn.setAttribute("aria-label", "Stop generating");
    document.body.appendChild(stopBtn);

    const found = findDeepSeekStopButton();
    expect(found).toBe(stopBtn);
  });
});

describe("Live Mode - LiveEngine Lifecycle & State", () => {
  let engine;

  beforeEach(() => {
    resetAppState();
    document.body.innerHTML = "";
    engine = new LiveEngine();
    // Default posture: unknown, so the conservative thresholds apply unless a
    // test opts into AEC explicitly.
    isAndroidAecActive.mockReturnValue(null);
  });

  it("initializes with idle status", () => {
    expect(engine.status).toBe("idle");
    expect(engine.isMuted).toBe(false);
  });

  it("toggles mute correctly and reflects in state", () => {
    const muted1 = engine.toggleMute();
    expect(muted1).toBe(true);
    expect(engine.isMuted).toBe(true);
    expect(engine.status).toBe("muted");
    expect(state.liveMode.isMuted).toBe(true);

    const muted2 = engine.toggleMute();
    expect(muted2).toBe(false);
    expect(engine.isMuted).toBe(false);
    expect(engine.status).toBe("listening");
    expect(state.liveMode.isMuted).toBe(false);
  });

  it("interrupts speaking state, cancels TTS and returns to listening", () => {
    engine.status = "speaking";
    engine.interrupt();
    expect(engine.status).toBe("listening");
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });

  it("handles barge-in speech start while thinking by interrupting generation", () => {
    engine.status = "thinking";
    const stopBtn = document.createElement("button");
    stopBtn.setAttribute("aria-label", "Stop generating");
    let stopClicked = false;
    stopBtn.addEventListener("click", () => { stopClicked = true; });
    document.body.appendChild(stopBtn);

    engine.handleUserSpeechStart();

    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
    expect(stopClicked).toBe(true);
    expect(engine.status).toBe("listening");
  });

  it("filters out TTS echo and recognizes genuine voice barge-in", () => {
    engine.ttsEchoWindow = true;
    engine.lastChunkStartTime = Date.now() - 1000;
    engine.recentSpokenChunks = [
      {
        text: "merhaba bugün hava çok güzel",
        words: ["merhaba", "bugün", "hava", "çok", "güzel"],
        timestamp: Date.now() - 500,
      },
    ];

    // A fragment of recent AI speech is rejected as echo
    expect(engine.isGenuineBargeIn("hava çok güzel")).toBe(false);

    // New/different words from user are accepted as genuine barge-in
    expect(engine.isGenuineBargeIn("dur bekle bir şey diyeceğim")).toBe(true);
  });

  it("trusts speech before TTS starts, when there is nothing to echo", () => {
    engine.ttsEchoWindow = false;
    engine.lastChunkStartTime = Date.now() - 1000;
    engine.recentSpokenChunks = [
      {
        text: "merhaba bugün hava çok güzel",
        words: ["merhaba", "bugün", "hava", "çok", "güzel"],
        timestamp: Date.now() - 500,
      },
    ];

    // Nothing is playing, so even a one-word utterance is the user's
    expect(engine.isGenuineBargeIn("hava")).toBe(true);
    expect(engine.isGenuineBargeIn("stop")).toBe(true);
  });

  it("rejects one-word fragments while TTS is audible without AEC", () => {
    isAndroidAecActive.mockReturnValue(false);
    engine.ttsEchoWindow = true;
    engine.lastChunkStartTime = Date.now() - 1000;
    engine.recentSpokenChunks = [
      {
        text: "yapay zeka hayatımızı değiştiriyor",
        words: ["yapay", "zeka", "hayatımızı", "değiştiriyor"],
        timestamp: Date.now() - 500,
      },
    ];

    // A single mis-recognised word is indistinguishable from echo here, and this
    // is exactly the case that used to trigger the self-interrupt loop.
    expect(engine.isGenuineBargeIn("yapay")).toBe(false);
    expect(engine.isGenuineBargeIn("zeka")).toBe(false);
  });

  it("trusts short utterances once AEC is cancelling the echo", () => {
    isAndroidAecActive.mockReturnValue(true);
    engine.ttsEchoWindow = true;
    engine.lastChunkStartTime = Date.now() - 1000;
    engine.recentSpokenChunks = [
      {
        text: "evet tamam anladım simdi devam edelim lutfen",
        words: ["evet", "tamam", "anladım", "simdi", "devam", "edelim", "lutfen"],
        timestamp: Date.now() - 500,
      },
    ];

    // Real replies that reuse the assistant's words must survive.
    expect(engine.isGenuineBargeIn("evet tamam")).toBe(true);
    expect(engine.isGenuineBargeIn("devam edelim")).toBe(true);
    expect(engine.isGenuineBargeIn("peki")).toBe(true);

    // A verbatim repeat is still echo, AEC or not.
    expect(
      engine.isGenuineBargeIn("evet tamam anladım simdi devam edelim lutfen"),
    ).toBe(false);
  });

  it("rejects a big slice of a chunk as echo at any length", () => {
    isAndroidAecActive.mockReturnValue(true);
    engine.ttsEchoWindow = true;
    engine.lastChunkStartTime = Date.now() - 1000;
    engine.recentSpokenChunks = [
      {
        text: "merhaba bugün hava çok güzel",
        words: ["merhaba", "bugün", "hava", "çok", "güzel"],
        timestamp: Date.now() - 500,
      },
    ];

    // Most of what was playing: a pickup, not a reply, even with AEC on.
    expect(engine.isGenuineBargeIn("hava çok güzel")).toBe(false);
    expect(engine.isGenuineBargeIn("merhaba bugün hava")).toBe(false);
  });

  it("does not interrupt speaking state purely on VAD energy (prevents speaker feedback)", () => {
    engine.status = "speaking";
    engine.handleUserSpeechStart();
    expect(engine.status).toBe("speaking");
  });

  it("keeps TTS echo out of the transcript so it cannot become the next prompt", () => {
    isAndroidAecActive.mockReturnValue(true);
    engine.status = "speaking";
    engine.ttsEchoWindow = true;
    engine.lastChunkStartTime = Date.now() - 1000;
    engine.recentSpokenChunks = [
      {
        text: "elbette bunu senin için yapabilirim",
        words: ["elbette", "bunu", "senin", "için", "yapabilirim"],
        timestamp: Date.now() - 500,
      },
    ];

    let nextPrompt = null;
    engine.submitUserPrompt = async (text) => {
      nextPrompt = text;
    };

    // Drive the real recognizer handler by capturing it from initRecognition.
    const speechSynthesisUtterance = globalThis.SpeechSynthesisUtterance;
    engine.initRecognition(function FakeRecognition() {
      this.start = () => {};
      this.abort = () => {};
    });
    const onresult = engine.recognition.onresult;

    // The recognizer reports the assistant's own words while it is audible.
    onresult({
      results: [[{ transcript: "elbette bunu senin için yapabilirim" }]],
    });

    // Echo must not land in the transcript buffer at all: left there it would be
    // submitted as the user's next prompt once listening resumed.
    expect(engine.currentTranscript).toBe("");

    // Turn over: listening resumes with a clean buffer, so nothing is submitted.
    engine.ttsEchoWindow = false;
    engine.status = "listening";
    engine.handleUserSilenceStop("test");
    expect(nextPrompt).toBeNull();
    expect(speechSynthesisUtterance).toBeDefined();
  });

  it("stops and cleans up active session", () => {
    state.liveMode.active = true;
    engine.status = "speaking";
    engine.stop();

    expect(state.liveMode.active).toBe(false);
    expect(engine.status).toBe("idle");
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });

  it("findLatestAssistantNode ignores user messages even without 'user' class and matches genuine assistant markdown", () => {
    const userMsg = document.createElement("div");
    userMsg.className = "ds-message _63c77b1";
    userMsg.innerHTML = '<div class="_9663006"><div class="d29f3d7d">hi deep sea can you hear me now</div></div>';
    document.body.appendChild(userMsg);

    // Only user message exists: should return null
    expect(engine.findLatestAssistantNode()).toBe(null);

    // Add assistant message
    const assistantMsg = document.createElement("div");
    assistantMsg.className = "ds-message _63c77b1";
    assistantMsg.innerHTML = '<div class="_4f9bf79 _43c05b5"><div class="ds-markdown"><p>Hello! Yes I hear you.</p></div></div>';
    document.body.appendChild(assistantMsg);

    expect(engine.findLatestAssistantNode()).toBe(assistantMsg);
  });

  it("findLatestAssistantNode rejects candidate if its text equals lastSubmittedPrompt", () => {
    engine.lastSubmittedPrompt = "hi deep sea can you hear me now";

    const echoMsg = document.createElement("div");
    echoMsg.className = "ds-message";
    echoMsg.innerHTML = '<div class="ds-markdown">hi deep sea can you hear me now</div>';
    document.body.appendChild(echoMsg);

    // Text identical to user prompt should be rejected
    expect(engine.findLatestAssistantNode()).toBe(null);

    // When new text arrives, it is accepted
    const genuineMsg = document.createElement("div");
    genuineMsg.className = "ds-message";
    genuineMsg.innerHTML = '<div class="ds-markdown">Hello! How can I help you?</div>';
    document.body.appendChild(genuineMsg);

    expect(engine.findLatestAssistantNode()).toBe(genuineMsg);
  });
});

describe("Live Mode - TTS Queue & Merging", () => {
  let engine;
  beforeEach(() => {
    resetAppState();
    document.body.innerHTML = "";
    engine = new LiveEngine();
  });

  it("buffers incoming chunks in ttsQueue and merges subsequent sentences when previous is speaking", () => {
    engine.isSpeakingUtterance = true; // simulate speech in progress
    engine.queueTTS("İlk cümle tamamlandı.");
    engine.queueTTS("İkinci cümle de eklendi.");

    expect(engine.ttsQueue.length).toBe(2);

    engine.isSpeakingUtterance = false;
    engine.processTTSQueue();

    // The two sentences should be merged into one single utterance to prevent inter-utterance pause
    expect(engine.ttsQueue.length).toBe(0);
    expect(engine.isSpeakingUtterance).toBe(true);
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
  });

  it("cancelTTS clears active queue and cancels window.speechSynthesis", () => {
    engine.queueTTS("Bekleyen mesaj 1");
    engine.queueTTS("Bekleyen mesaj 2");
    expect(engine.ttsQueue.length).toBeGreaterThan(0);

    engine.cancelTTS();
    expect(engine.ttsQueue.length).toBe(0);
    expect(engine.isSpeakingUtterance).toBe(false);
    expect(engine.activeUtterances).toBe(0);
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });
});

