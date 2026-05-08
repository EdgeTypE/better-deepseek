import { mutatePayload } from "./payload-mutator.js";

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

  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__bdsRequestMeta = {
      method: String(method || "GET").toUpperCase(),
      url: String(url || ""),
    };
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function patchedSend(body) {
    try {
      const meta = this.__bdsRequestMeta || {};
      if (!isChatCompletionUrl(meta.url)) {
        return originalSend.call(this, body);
      }

      if (meta.url.includes("/api/v0/chat_session/fetch_page")) {
        this.addEventListener("load", () => {
          try {
            const data = JSON.parse(this.responseText);
            window.dispatchEvent(new CustomEvent("bds:session-data", { detail: JSON.stringify(data) }));
          } catch (e) {}
        });
        return originalSend.call(this, body);
      }

      markStart(meta.url);
      let requestFinalized = false;
      const finalizeRequest = () => {
        if (requestFinalized) {
          return;
        }
        requestFinalized = true;
        
        // Detect server errors or network failure
        if (this.status >= 500 || this.status === 0) {
          window.dispatchEvent(new CustomEvent("bds:network-error", {
            detail: JSON.stringify({
              url: meta.url,
              status: this.status,
              type: 'xhr'
            })
          }));
        }
        
        markEnd(meta.url);
      };

      this.addEventListener("loadend", finalizeRequest, { once: true });

      const bodyText = getXhrBodyText(body);
      if (!bodyText) {
        return originalSend.call(this, body);
      }

      const payload = JSON.parse(bodyText);
      const requestModelName = payload.model || null;

      const mutation = mutatePayload(payload, state);
      if (!mutation.changed) {
        return originalSend.call(this, body);
      }

      const nextBody = JSON.stringify(mutation.payload);

      const xhrRef = this;
      // Intercept response for token usage
      this.addEventListener("load", () => {
        try {
          const responseText = xhrRef.responseText;
          if (responseText) {
            extractXhrUsageContent(responseText, xhrRef, requestModelName);
          }
        } catch (e) {}
      }, { once: true });

      return originalSend.call(this, nextBody);
    } catch (error) {
      const meta = this.__bdsRequestMeta || {};
      console.warn("[BetterDeepSeek] XHR patch failed:", error);
      try {
        return originalSend.call(this, body);
      } catch (sendError) {
        if (isChatCompletionUrl(meta.url)) {
          markEnd(meta.url);
        }
        throw sendError;
      }
    }
  };
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

function extractXhrUsageContent(responseText, xhr, modelName) {
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
    }
  } catch (e) {}
}
