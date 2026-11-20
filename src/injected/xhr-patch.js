import { mutatePayload } from "./payload-mutator.js";
import {
  consumePreparedTimestamp,
  recordActualPromptLength,
  rewriteGatorBatchBody,
} from "./telemetry-sync.js";
import {
  emitAssistantMessageId,
  findMessageIdInSse,
  isReplyStreamUrl,
} from "./message-id.js";

/**
 * Patch XMLHttpRequest to intercept chat completion requests.
 *
 * @param {object} state - The injected script state
 * @param {function} isChatCompletionUrl
 * @param {function} markStart
 * @param {function} markEnd
 */
export function patchXmlHttpRequest(
  state,
  isChatCompletionUrl,
  markStart,
  markEnd
) {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const xhrMetaMap = new WeakMap();

  XMLHttpRequest.prototype.open = new Proxy(originalOpen, {
    apply(target, thisArg, argArray) {
      const [method, url] = argArray;
      if (thisArg && typeof thisArg === "object") {
        xhrMetaMap.set(thisArg, {
          method: String(method || "GET").toUpperCase(),
          url: String(url || ""),
        });
      }
      return Reflect.apply(target, thisArg, argArray);
    },
  });

  XMLHttpRequest.prototype.setRequestHeader = new Proxy(originalSetRequestHeader, {
    apply(target, thisArg, argArray) {
      const [header, value] = argArray;
      if (header) {
        const lower = String(header).toLowerCase();
        if (lower === "authorization" && typeof state?.setAuthToken === "function") {
          state.setAuthToken(String(value || ""));
        } else if (typeof state?.captureClientHeader === "function") {
          state.captureClientHeader(lower, value);
        }
      }
      return Reflect.apply(target, thisArg, argArray);
    },
  });

  XMLHttpRequest.prototype.send = new Proxy(originalSend, {
    apply(target, thisArg, argArray) {
      const [body] = argArray;
      const meta = (thisArg && xhrMetaMap.get(thisArg)) || {};
      try {
        if (meta.url.includes("gator.volces.com") && typeof body === "string") {
          const rewritten = rewriteGatorBatchBody(body, state);
          if (rewritten !== body) {
            return Reflect.apply(target, thisArg, [rewritten]);
          }
          return Reflect.apply(target, thisArg, argArray);
        }

        if (!isChatCompletionUrl(meta.url)) {
          return Reflect.apply(target, thisArg, argArray);
        }

        if (meta.url.includes("/api/v0/chat_session/fetch_page")) {
          thisArg.addEventListener("load", () => {
            try {
              const data = JSON.parse(thisArg.responseText);
              window.dispatchEvent(new CustomEvent("bds:session-data", { detail: JSON.stringify(data) }));
            } catch (e) {}
          });
          return Reflect.apply(target, thisArg, argArray);
        }

        if (meta.url.includes("/api/v0/chat/history_messages")) {
          thisArg.addEventListener("load", () => {
            try {
              const data = JSON.parse(thisArg.responseText);
              window.dispatchEvent(new CustomEvent("bds:history-msgs", { detail: JSON.stringify(data) }));
            } catch (e) {}
          });
          return Reflect.apply(target, thisArg, argArray);
        }

        markStart(meta.url);
        let requestFinalized = false;
        const finalizeRequest = () => {
          if (requestFinalized) {
            return;
          }
          requestFinalized = true;

          // Detect server errors or network failure
          if (thisArg.status >= 500 || thisArg.status === 0) {
            window.dispatchEvent(new CustomEvent("bds:network-error", {
              detail: JSON.stringify({
                url: meta.url,
                status: thisArg.status,
                type: 'xhr'
              })
            }));
          }

          markEnd(meta.url);
        };

        thisArg.addEventListener("loadend", finalizeRequest, { once: true });

        const bodyText = getXhrBodyText(body);
        if (!bodyText) {
          return Reflect.apply(target, thisArg, argArray);
        }

        const payload = JSON.parse(bodyText);
        const requestModelName = payload.model || null;
        const rawPromptLen = typeof payload.prompt === "string" ? payload.prompt.length : null;
        const stagedNow = consumePreparedTimestamp(payload, state);

        const mutation = mutatePayload(payload, state, stagedNow ? { now: stagedNow } : {});
        if (!mutation.changed) {
          return Reflect.apply(target, thisArg, argArray);
        }

        if (typeof rawPromptLen === "number" && typeof mutation.payload?.prompt === "string") {
          recordActualPromptLength(state, mutation.payload, rawPromptLen, mutation.payload.prompt.length);
        }

        const nextBody = JSON.stringify(mutation.payload);

        // Intercept response for token usage
        thisArg.addEventListener("load", () => {
          try {
            const responseText = thisArg.responseText;
            if (responseText) {
              extractXhrUsageContent(responseText, thisArg, requestModelName, meta.url);
            }
          } catch (e) {}
        }, { once: true });

        return Reflect.apply(target, thisArg, [nextBody]);
      } catch (error) {
        console.warn("[BetterDeepSeek] XHR patch failed:", error);
        try {
          return Reflect.apply(target, thisArg, argArray);
        } catch (sendError) {
          if (isChatCompletionUrl(meta.url)) {
            markEnd(meta.url);
          }
          throw sendError;
        }
      }
    },
  });
}

/**
 * Extract body text from XHR send argument.
 */
function getXhrBodyText(body) {
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  return "";
}

function extractXhrUsageContent(responseText, xhr, modelName, url) {
  try {
    const contentType = xhr.getResponseHeader?.("content-type") || "";
    if (contentType.includes("text/event-stream") || responseText.startsWith("data: ")) {
      const lines = responseText.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const chunk = JSON.parse(jsonStr);
          const usage = chunk?.usage;
          if (usage) {
            window.dispatchEvent(new CustomEvent("bds:token-usage", {
              detail: JSON.stringify({
                inputTokens: usage.prompt_tokens || usage.input_tokens || 0,
                outputTokens: usage.completion_tokens || usage.output_tokens || 0,
                modelName: modelName || chunk?.model || null,
                timestamp: Date.now(),
              }),
            }));
            break;
          }
        } catch (e) {}
      }

      // The same stream carries the id of the reply being generated — the id
      // DeepSeek's own read-aloud button addresses it by.
      if (isReplyStreamUrl(url)) {
        const messageId = findMessageIdInSse(responseText);
        if (messageId) emitAssistantMessageId(messageId);
      }
    }
  } catch (e) {}
}
