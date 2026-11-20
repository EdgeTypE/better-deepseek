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

function resolveTelemetryTurnContext(eventParams, sessionId, state, doc) {
  if (eventParams.scene === "editMessage") {
    const isFirst = String(eventParams.messageId || "") === "1";
    return {
      isFirst,
      messageId: isFirst ? 1 : Number(eventParams.messageId) || 2,
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

/** Compute the transformed prompt length and stage its timestamp for XHR reuse. */
export function computeMutatedPromptLengthForTelemetry(
  eventParams,
  state,
  doc = typeof document !== "undefined" ? document : null,
  now = new Date()
) {
  if (!eventParams || typeof eventParams.promptLength !== "number") return null;

  const expectedLen = eventParams.promptLength;
  const rawPrompt = findMatchingComposerText(state, expectedLen, now.getTime());
  if (typeof rawPrompt !== "string") return null;

  const sessionId = String(eventParams.chatSessionId || "default");
  const turn = resolveTelemetryTurnContext(eventParams, sessionId, state, doc);

  const previewPayload = {
    chat_session_id: sessionId,
    prompt: rawPrompt,
    model_type: eventParams.modelType || "",
    message_id: turn.messageId,
    parent_message_id: turn.parentMessageId,
  };

  const result = mutatePayload(previewPayload, state, { preview: true, now });
  if (!result.changed || typeof previewPayload.prompt !== "string") return null;

  const mutatedLength = previewPayload.prompt.length;
  const sync = ensureSyncState(state);
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
  const staged = sync.preparedBySession.get(sessionId);
  if (!staged) return undefined;

  if (Date.now() - staged.ts > RECORD_TTL_MS) {
    sync.preparedBySession.delete(sessionId);
    return undefined;
  }

  if (staged.rawPrompt === payload.prompt || staged.rawPrompt.trim() === payload.prompt.trim()) {
    sync.preparedBySession.delete(sessionId);
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
  if (staged && nowMs - staged.ts <= RECORD_TTL_MS && staged.rawPrompt.length === rawLength) {
    return staged.mutatedLength;
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
      if (
        value &&
        typeof value === "object" &&
        value.event_name === "chatCompletionApi" &&
        value.event_params &&
        typeof value.event_params.promptLength === "number"
      ) {
        try {
          const mutatedLength = computeMutatedPromptLengthForTelemetry(
            value.event_params,
            state,
            doc
          );
          if (typeof mutatedLength === "number" && mutatedLength !== value.event_params.promptLength) {
            const cloned = {
              ...value,
              event_params: {
                ...value.event_params,
                promptLength: mutatedLength,
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

/** Update queued event batch payloads with the transformed prompt length. */
export function rewriteGatorBatchBody(bodyText, state) {
  if (typeof bodyText !== "string" || !bodyText.includes("chatCompletionApi")) {
    return bodyText;
  }

  try {
    const batches = JSON.parse(bodyText);
    if (!Array.isArray(batches)) return bodyText;

    let modified = false;
    for (const batch of batches) {
      if (!batch || !Array.isArray(batch.events)) continue;
      for (const ev of batch.events) {
        if (!ev || ev.event !== "chatCompletionApi" || typeof ev.params !== "string") continue;
        try {
          const params = JSON.parse(ev.params);
          if (typeof params.ds_promptLength !== "number") continue;
          const sessionId = String(params.ds_chatSessionId || "default");
          const updatedLen = resolveRecordedLength(state, sessionId, params.ds_promptLength);
          if (typeof updatedLen === "number" && updatedLen !== params.ds_promptLength) {
            params.ds_promptLength = updatedLen;
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
