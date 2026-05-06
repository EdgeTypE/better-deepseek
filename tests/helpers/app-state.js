import state from "../../src/content/state.js";
import {
  CHARS_PER_TOKEN,
  DEFAULT_SETTINGS,
  EMBEDDED_PRICING,
} from "../../src/lib/constants.js";

export function resetAppState(overrides = {}) {
  state.settings = structuredClone(DEFAULT_SETTINGS);
  state.embeddedPricing = structuredClone(EMBEDDED_PRICING);
  state.charsPerToken = CHARS_PER_TOKEN;
  state.skills = [];
  state.memories = {};
  state.characters = [];
  state.projects = [];
  state.projectFiles = [];
  state.activeProjectId = null;
  state.activeFileIds = [];
  state.observer = null;
  state.scanTimer = 0;
  state.urlWatchTimer = 0;
  state.lastUrl =
    typeof location !== "undefined" ? location.href : "https://chat.deepseek.com/";
  state.processedStandaloneFiles = new Set();
  state.downloadCounter = 0;
  state.network = {
    activeCompletionRequests: 0,
    lastEventAt: 0,
  };
  state.longWork = {
    active: false,
    files: new Map(),
    lastActivityAt: 0,
  };
  state.ui = null;
  state.heroBarRef = null;
  state.chatSessions = [];
  state.activeQuestions = [];
  state.pricing = {
    modelName: null,
    sessionTotals: { inputCost: 0, outputCost: 0, totalCost: 0 },
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    messageData: new Map(),
    pendingInjections: new Map(),
    pricingLoaded: false,
  };

  Object.assign(state, overrides);
  return state;
}
