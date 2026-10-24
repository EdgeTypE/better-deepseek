import { STORAGE_KEYS } from "../../lib/constants.js";
import { makeId } from "../../lib/utils/helpers.js";
import { triggerBlobDownload } from "../../lib/utils/download.js";
import { getDefaultRequest } from "./presets.js";

const STORAGE_KEY_HISTORY = "bds_api_playground_history";
const STORAGE_KEY_KEYS = "bds_api_playground_keys";
const STORAGE_KEY_SAVED = "bds_api_playground_saved";

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function createApiStore() {
  let request = $state(getDefaultRequest());
  let response = $state(null);
  let streamChunks = $state([]);
  let isLoading = $state(false);
  let error = $state(null);
  let latency = $state(0);
  let activeTab = $state("builder");
  let history = $state([]);
  let apiKeys = $state([]);
  let activeKeyId = $state(null);
  let savedRequests = $state([]);
  let showKeyManager = $state(false);
  let showRawJson = $state(false);
  let showStreamLog = $state(false);

  function endpointLabel(ep) {
    const labels = { 'chat/completions': 'Chat', 'completions': 'FIM', 'models': 'Models', 'user/balance': 'Balance' };
    return labels[ep] || ep;
  }

  function loadPersistedData() {
    try {
      const h = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) || "[]");
      if (Array.isArray(h)) history = h;
    } catch {}

    try {
      const k = JSON.parse(localStorage.getItem(STORAGE_KEY_KEYS) || "[]");
      if (Array.isArray(k)) apiKeys = k;
    } catch {}

    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY_SAVED) || "[]");
      if (Array.isArray(s)) savedRequests = s;
    } catch {}
  }

  function persistHistory() {
    try { localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history.slice(0, 200))); } catch {}
  }

  function persistKeys() {
    try { localStorage.setItem(STORAGE_KEY_KEYS, JSON.stringify(apiKeys)); } catch {}
  }

  function persistSaved() {
    try { localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(savedRequests)); } catch {}
  }

  function getActiveKey() {
    if (!activeKeyId) return null;
    const key = apiKeys.find((k) => k.id === activeKeyId);
    return key ? key.key : null;
  }

  function addApiKey(name, key) {
    const entry = { id: makeId(), name, key, createdAt: Date.now() };
    apiKeys = [...apiKeys, entry];
    activeKeyId = entry.id;
    persistKeys();
  }

  function removeApiKey(id) {
    apiKeys = apiKeys.filter((k) => k.id !== id);
    if (activeKeyId === id) activeKeyId = apiKeys[0]?.id || null;
    persistKeys();
  }

  function setActiveKey(id) {
    activeKeyId = id;
    persistKeys();
  }

  function updateRequest(partial) {
    request = { ...request, ...partial };
  }

  function updateMessage(index, partial) {
    const msgs = [...(request.messages || [])];
    msgs[index] = { ...msgs[index], ...partial };
    request = { ...request, messages: msgs };
  }

  function addMessage(role = "user") {
    const msgs = [...(request.messages || []), { role, content: "" }];
    request = { ...request, messages: msgs };
  }

  function removeMessage(index) {
    const msgs = (request.messages || []).filter((_, i) => i !== index);
    request = { ...request, messages: msgs };
  }

  function moveMessage(from, to) {
    const msgs = [...(request.messages || [])];
    const [moved] = msgs.splice(from, 1);
    msgs.splice(to, 0, moved);
    request = { ...request, messages: msgs };
  }

  function updateTools(text) {
    try {
      const tools = JSON.parse(text);
      if (Array.isArray(tools)) {
        request = { ...request, tools };
        return null;
      }
      return "Tools must be a JSON array";
    } catch (e) {
      return e.message;
    }
  }

  async function sendRequest(apiKey) {
    const key = apiKey || getActiveKey();
    if (!key) {
      error = "Please add an API key first.";
      return;
    }

    isLoading = true;
    error = null;
    response = null;
    streamChunks = [];
    latency = 0;

    const startTime = performance.now();

    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "bds-api-proxy",
            request: {
              ...deepClone(request),
              apiKey: key,
            },
          },
          (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!res.ok) {
              const err = new Error(res.error || "Request failed");
              err.status = res.status || 0;
              reject(err);
            } else {
              resolve(res);
            }
          }
        );
      });

      latency = performance.now() - startTime;

      if (result.streamed) {
        streamChunks = result.data;
        response = result.data;
      } else {
        response = result.data;
      }

      const entry = {
        id: makeId(),
        name: endpointLabel(request.endpoint) + ' — ' + (request.messages?.filter(m => m.content).slice(-1)[0]?.content?.slice(0, 50) || request.prompt?.slice(0, 50) || '') + (request.streamed ? ' (stream)' : ''),
        request: deepClone(request),
        response: deepClone(result.streamed ? null : result.data),
        streamChunks: result.streamed && Array.isArray(result.data) ? result.data.slice(0, 50).map((c) => {
          const delta = c.choices?.[0]?.delta || {};
          return { content: delta.content || "", reasoning: delta.reasoning_content || "" };
        }) : [],
        timestamp: Date.now(),
        latency: result.latency,
        streamed: result.streamed,
      };
      history = [entry, ...history].slice(0, 200);
      persistHistory();
    } catch (err) {
      latency = performance.now() - startTime;
      error = err.message;
      response = null;
    } finally {
      isLoading = false;
    }
  }

  function loadRequestFromHistory(entry) {
    request = deepClone(entry.request);
    response = entry.response ? deepClone(entry.response) : null;
    streamChunks = entry.streamChunks ? entry.streamChunks.map((c) => c) : [];
    activeTab = "response";
  }

  function deleteHistoryEntry(id) {
    history = history.filter((h) => h.id !== id);
    persistHistory();
  }

  function clearHistory() {
    history = [];
    persistHistory();
  }

  function exportHistory() {
    const data = JSON.stringify(history, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    triggerBlobDownload(blob, `api-playground-history-${Date.now()}.json`);
  }

  function loadRequestFromSaved(saved) {
    request = deepClone(saved.request);
    activeTab = "builder";
  }

  function saveCurrentRequest(name) {
    const entry = { id: makeId(), name, request: deepClone(request), createdAt: Date.now() };
    savedRequests = [entry, ...savedRequests];
    persistSaved();
  }

  function deleteSavedRequest(id) {
    savedRequests = savedRequests.filter((s) => s.id !== id);
    persistSaved();
  }

  function resetRequest() {
    request = getDefaultRequest();
    response = null;
    streamChunks = [];
    error = null;
    latency = 0;
  }

  loadPersistedData();

  return {
    get request() { return request; },
    set request(v) { request = v; },
    get response() { return response; },
    set response(v) { response = v; },
    get streamChunks() { return streamChunks; },
    set streamChunks(v) { streamChunks = v; },
    get isLoading() { return isLoading; },
    set isLoading(v) { isLoading = v; },
    get error() { return error; },
    set error(v) { error = v; },
    get latency() { return latency; },
    set latency(v) { latency = v; },
    get activeTab() { return activeTab; },
    set activeTab(v) { activeTab = v; },
    get history() { return history; },
    get apiKeys() { return apiKeys; },
    get activeKeyId() { return activeKeyId; },
    get savedRequests() { return savedRequests; },
    get showKeyManager() { return showKeyManager; },
    set showKeyManager(v) { showKeyManager = v; },
    get showRawJson() { return showRawJson; },
    set showRawJson(v) { showRawJson = v; },
    get showStreamLog() { return showStreamLog; },
    set showStreamLog(v) { showStreamLog = v; },
    getActiveKey,
    addApiKey,
    removeApiKey,
    setActiveKey,
    updateRequest,
    updateMessage,
    addMessage,
    removeMessage,
    moveMessage,
    updateTools,
    sendRequest,
    loadRequestFromHistory,
    deleteHistoryEntry,
    clearHistory,
    exportHistory,
    loadRequestFromSaved,
    saveCurrentRequest,
    deleteSavedRequest,
    resetRequest,
  };
}
