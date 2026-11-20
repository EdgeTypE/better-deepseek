/**
 * Keep client-side prompt length metrics aligned with transformed payloads.
 */

import {
  countCompletedAssistantTurns,
  mutatePayload,
  resolveConversationId,
} from "./payload-mutator.js";

const MAX_RECENT_INPUTS = 6;
const INPUT_TTL_MS = 60_000;
const RECORD_TTL_MS = 60_000;

function ensureSyncState(state) {
  if (!state._telemetrySync) {
    state._telemetrySync = {
      recentInputs: [],
      preparedBySession: new Map(),
      actualBySession: new Map(),
    };
  }
  return state._telemetrySync;
}

function pruneOld(list, maxAgeMs, nowMs) {
  while (list.length > 0 && nowMs - list[0].ts > maxAgeMs) {
    list.shift();
  }
}

function findMatchingLength(entry, expectedLen) {
  if (!entry || typeof entry.rawPrompt !== "string") return false;
  return (
    entry.rawPrompt.length === expectedLen ||
    entry.rawPrompt.trim().length === expectedLen
  );
}

function findReusablePrepared(sync, sessionId, expectedLen, nowMs) {
  const direct = sync.preparedBySession.get(sessionId);
  if (direct && nowMs - direct.ts <= RECORD_TTL_MS && findMatchingLength(direct, expectedLen)) {
    return direct;
  }

  // `send_button_click` on a brand-new chat uses `""` before a session id is assigned.
  if (sessionId && sessionId !== "default") {
    const anon = sync.preparedBySession.get("");
    if (anon && nowMs - anon.ts <= RECORD_TTL_MS && findMatchingLength(anon, expectedLen)) {
      sync.preparedBySession.set(sessionId, anon);
      sync.preparedBySession.delete("");
      return anon;
    }
  }

  return null;
}

export function recordComposerText(state, text, nowMs = Date.now()) {
  if (typeof text !== "string" || !text) return;
  const sync = ensureSyncState(state);
  pruneOld(sync.recentInputs, INPUT_TTL_MS, nowMs);

  const trimmed = text.trim();
  const prev = sync.recentInputs[sync.recentInputs.length - 1];
  if (prev && prev.raw === text) {
    prev.ts = nowMs;
    return;
  }

  sync.recentInputs.push({ raw: text, trimmed, ts: nowMs });
  if (sync.recentInputs.length > MAX_RECENT_INPUTS) {
    sync.recentInputs.shift();
  }
}

function findMatchingComposerText(state, expectedLen, nowMs = Date.now()) {
  if (expectedLen === 0) return "";
  const sync = ensureSyncState(state);
  pruneOld(sync.recentInputs, INPUT_TTL_MS, nowMs);

  for (let i = sync.recentInputs.length - 1; i >= 0; i--) {
    const entry = sync.recentInputs[i];
    if (entry.raw.length === expectedLen) return entry.raw;
    if (entry.trimmed.length === expectedLen) return entry.trimmed;
  }
  return null;
}

function extractElementText(el) {
  if (!el) return "";
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    return typeof el.value === "string" ? el.value : "";
  }
  if (
    el.isContentEditable ||
    el.contentEditable === "true" ||
    el.contentEditable === "plaintext-only"
  ) {
    return typeof el.textContent === "string" ? el.textContent : "";
  }
  return "";
}

/** Track recent non-empty composer text before submission clears the editor. */
export function installInputTracker(state, doc = typeof document !== "undefined" ? document : null) {
  if (!doc || !doc.addEventListener) return () => {};

  const captureFromTarget = (event) => {
    const text = extractElementText(event?.target);
    if (text) recordComposerText(state, text);
  };

  const captureFromSubmitAction = (event) => {
    if (event.type === "keydown" && event.key !== "Enter") return;
    captureFromTarget({ target: doc.activeElement });
    const textareas = doc.querySelectorAll?.("textarea");
    if (textareas) {
      for (const ta of textareas) {
        const text = extractElementText(ta);
        if (text) recordComposerText(state, text);
      }
    }
  };

  doc.addEventListener("input", captureFromTarget, true);
  doc.addEventListener("keydown", captureFromSubmitAction, true);
  doc.addEventListener("pointerdown", captureFromSubmitAction, true);

  return () => {
    doc.removeEventListener("input", captureFromTarget, true);
    doc.removeEventListener("keydown", captureFromSubmitAction, true);
    doc.removeEventListener("pointerdown", captureFromSubmitAction, true);
  };
}

function resolveTelemetryTurnContext(spec, sessionId, state, doc) {
  if (spec.isEdit) {
    const isFirst = String(spec.messageId || "") === "1";
    return {
      isFirst,
      messageId: isFirst ? 1 : Number(spec.messageId) || 2,
      parentMessageId: isFirst ? null : "known",
    };
  }

  if (state.sessionUserMsgCounts && state.sessionUserMsgCounts[sessionId] > 0) {
    return {
      isFirst: false,
      messageId: undefined,
      parentMessageId: "known",
    };
  }

  const priorTurns = countCompletedAssistantTurns(doc);
  if (priorTurns === 0) {
    return {
      isFirst: true,
      messageId: 1,
      parentMessageId: null,
    };
  }

  return {
    isFirst: false,
    messageId: undefined,
    parentMessageId: String(priorTurns * 2),
  };
}

function normalizePromptEventSpec(eventParams) {
  if (!eventParams || typeof eventParams !== "object") return null;
  if (typeof eventParams.expectedLen === "number" && eventParams.lengthField) {
    return eventParams;
  }
  if (typeof eventParams.promptLength === "number") {
    return {
      lengthField: "promptLength",
      expectedLen: eventParams.promptLength,
      sessionId: String(eventParams.chatSessionId || "default"),
      modelType: eventParams.modelType || "",
      isEdit: eventParams.scene === "editMessage",
      messageId: eventParams.messageId,
    };
  }
  if (typeof eventParams.prompt_length === "number") {
    return {
      lengthField: "prompt_length",
      expectedLen: eventParams.prompt_length,
      sessionId: typeof eventParams.chat_session_id === "string"
        ? eventParams.chat_session_id
        : "",
      modelType: eventParams.model_type || "",
      isEdit: Number(eventParams.is_edit_mode) === 1,
      messageId: undefined,
    };
  }
  return null;
}

function extractTelemetryPromptSpec(value) {
  if (!value || typeof value !== "object" || !value.event_params) return null;
  if (value.event_name === "chatCompletionApi" || value.event_name === "send_button_click") {
    return normalizePromptEventSpec(value.event_params);
  }
  return null;
}

/** Compute the transformed prompt length and stage its timestamp for XHR reuse. */
export function computeMutatedPromptLengthForTelemetry(
  eventParams,
  state,
  doc = typeof document !== "undefined" ? document : null,
  now = new Date()
) {
  const spec = normalizePromptEventSpec(eventParams);
  if (!spec) return null;

  const expectedLen = spec.expectedLen;
  const sessionId = spec.sessionId || "";
  const sync = ensureSyncState(state);
  const reusable = findReusablePrepared(sync, sessionId, expectedLen, now.getTime());
  if (reusable) {
    return reusable.mutatedLength;
  }

  const rawPrompt = findMatchingComposerText(state, expectedLen, now.getTime());
  if (typeof rawPrompt !== "string") return null;

  const turn = resolveTelemetryTurnContext(spec, sessionId || "default", state, doc);

  const previewPayload = {
    chat_session_id: sessionId || "default",
    prompt: rawPrompt,
    model_type: spec.modelType || "",
    message_id: turn.messageId,
    parent_message_id: turn.parentMessageId,
  };

  const result = mutatePayload(previewPayload, state, { preview: true, now });
  if (!result.changed || typeof previewPayload.prompt !== "string") return null;

  const mutatedLength = previewPayload.prompt.length;
  sync.preparedBySession.set(sessionId, {
    rawPrompt,
    mutatedLength,
    now,
    ts: now.getTime(),
  });
  return mutatedLength;
}

/**
 * Consume the staged `Date` from the telemetry preview if the outgoing XHR
 * payload matches, guaranteeing identical `toLocaleString()` timestamps.
 *
 * @param {object} payload
 * @param {object} state
 * @returns {Date|undefined}
 */
export function consumePreparedTimestamp(payload, state) {
  if (!payload || typeof payload.prompt !== "string") return undefined;
  const sync = ensureSyncState(state);
  const sessionId = resolveConversationId(payload);
  let staged = sync.preparedBySession.get(sessionId);
  let stagedKey = sessionId;
  if (!staged) {
    staged = sync.preparedBySession.get("");
    stagedKey = "";
  }
  if (!staged) return undefined;

  if (Date.now() - staged.ts > RECORD_TTL_MS) {
    sync.preparedBySession.delete(stagedKey);
    return undefined;
  }

  if (staged.rawPrompt === payload.prompt || staged.rawPrompt.trim() === payload.prompt.trim()) {
    sync.preparedBySession.delete(stagedKey);
    return staged.now;
  }

  return undefined;
}

/** Record raw -> transformed prompt lengths for queued event batches. */
export function recordActualPromptLength(state, payload, rawLength, mutatedLength) {
  if (typeof rawLength !== "number" || typeof mutatedLength !== "number") return;
  const sync = ensureSyncState(state);
  const sessionId = resolveConversationId(payload || {});
  const list = sync.actualBySession.get(sessionId) || [];
  const nowMs = Date.now();
  pruneOld(list, RECORD_TTL_MS, nowMs);
  list.push({ rawLength, mutatedLength, ts: nowMs });
  if (list.length > MAX_RECENT_INPUTS) list.shift();
  sync.actualBySession.set(sessionId, list);
}

function resolveRecordedLength(state, sessionId, rawLength) {
  const sync = ensureSyncState(state);
  const nowMs = Date.now();

  if (sessionId) {
    const actualList = sync.actualBySession.get(sessionId);
    if (actualList && actualList.length > 0) {
      pruneOld(actualList, RECORD_TTL_MS, nowMs);
      for (let i = actualList.length - 1; i >= 0; i--) {
        if (actualList[i].rawLength === rawLength) {
          return actualList[i].mutatedLength;
        }
      }
    }

    const staged = sync.preparedBySession.get(sessionId);
    if (staged && nowMs - staged.ts <= RECORD_TTL_MS && findMatchingLength(staged, rawLength)) {
      return staged.mutatedLength;
    }
    return null;
  }

  // Fallback when `send_button_click` was emitted before a session id existed.
  for (const actualList of sync.actualBySession.values()) {
    pruneOld(actualList, RECORD_TTL_MS, nowMs);
    for (let i = actualList.length - 1; i >= 0; i--) {
      if (actualList[i].rawLength === rawLength) {
        return actualList[i].mutatedLength;
      }
    }
  }

  for (const staged of sync.preparedBySession.values()) {
    if (nowMs - staged.ts <= RECORD_TTL_MS && findMatchingLength(staged, rawLength)) {
      return staged.mutatedLength;
    }
  }

  return null;
}

/** Update serialized prompt length fields before dispatch. */
export function patchTelemetryStringify(
  state,
  jsonObj = typeof JSON !== "undefined" ? JSON : null,
  doc = typeof document !== "undefined" ? document : null
) {
  if (!jsonObj || typeof jsonObj.stringify !== "function") return () => {};
  const originalStringify = jsonObj.stringify;

  const proxied = new Proxy(originalStringify, {
    apply(target, thisArg, argArray) {
      const value = argArray[0];
      const spec = extractTelemetryPromptSpec(value);
      if (spec) {
        try {
          const mutatedLength = computeMutatedPromptLengthForTelemetry(
            spec,
            state,
            doc
          );
          if (typeof mutatedLength === "number" && mutatedLength !== spec.expectedLen) {
            const cloned = {
              ...value,
              event_params: {
                ...value.event_params,
                [spec.lengthField]: mutatedLength,
              },
            };
            return Reflect.apply(target, thisArg, [cloned, ...argArray.slice(1)]);
          }
        } catch {
          /* never break app serialization */
        }
      }
      return Reflect.apply(target, thisArg, argArray);
    },
  });

  jsonObj.stringify = proxied;
  return () => {
    jsonObj.stringify = originalStringify;
  };
}

function resolveBatchSessionId(events) {
  for (const ev of events) {
    if (ev?.event === "chatCompletionApi" && typeof ev.params === "string") {
      try {
        const p = JSON.parse(ev.params);
        if (typeof p.ds_chatSessionId === "string" && p.ds_chatSessionId) {
          return p.ds_chatSessionId;
        }
      } catch {
        /* ignore malformed event params */
      }
    }
  }
  return "";
}

/** Update queued event batch payloads with the transformed prompt length. */
export function rewriteGatorBatchBody(bodyText, state) {
  if (
    typeof bodyText !== "string" ||
    (!bodyText.includes("chatCompletionApi") && !bodyText.includes("send_button_click"))
  ) {
    return bodyText;
  }

  try {
    const batches = JSON.parse(bodyText);
    if (!Array.isArray(batches)) return bodyText;

    let modified = false;
    for (const batch of batches) {
      if (!batch || !Array.isArray(batch.events)) continue;
      const fallbackSessionId = resolveBatchSessionId(batch.events);
      for (const ev of batch.events) {
        if (!ev || typeof ev.params !== "string") continue;
        const isCompletion = ev.event === "chatCompletionApi";
        const isSendClick = ev.event === "send_button_click";
        if (!isCompletion && !isSendClick) continue;

        try {
          const params = JSON.parse(ev.params);
          const lengthKey = isCompletion ? "ds_promptLength" : "ds_prompt_length";
          if (typeof params[lengthKey] !== "number") continue;

          const rawSession = isCompletion
            ? params.ds_chatSessionId
            : params.ds_chat_session_id;
          const sessionId = String(rawSession || fallbackSessionId || "");
          const updatedLen = resolveRecordedLength(state, sessionId, params[lengthKey]);
          if (typeof updatedLen === "number" && updatedLen !== params[lengthKey]) {
            params[lengthKey] = updatedLen;
            ev.params = JSON.stringify(params);
            modified = true;
          }
        } catch {
          /* ignore malformed event params */
        }
      }
    }

    return modified ? JSON.stringify(batches) : bodyText;
  } catch {
    return bodyText;
  }
}

/** Wrap `navigator.sendBeacon` for queued batch updates. */
export function patchSendBeacon(state, nav = typeof navigator !== "undefined" ? navigator : null) {
  if (!nav || typeof nav.sendBeacon !== "function") return () => {};
  const originalSendBeacon = nav.sendBeacon;

  nav.sendBeacon = new Proxy(originalSendBeacon, {
    apply(target, thisArg, argArray) {
      const [url, data] = argArray;
      if (typeof url === "string" && url.includes("gator.volces.com") && typeof data === "string") {
        const rewritten = rewriteGatorBatchBody(data, state);
        if (rewritten !== data) {
          return Reflect.apply(target, thisArg, [url, rewritten]);
        }
      }
      return Reflect.apply(target, thisArg, argArray);
    },
  });

  return () => {
    nav.sendBeacon = originalSendBeacon;
  };
}
