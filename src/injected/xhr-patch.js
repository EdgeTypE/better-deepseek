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

      markStart(meta.url);
      let requestFinalized = false;
      const finalizeRequest = () => {
        if (requestFinalized) {
          return;
        }
        requestFinalized = true;
        markEnd(meta.url);
      };

      this.addEventListener("loadend", finalizeRequest, { once: true });

      const bodyText = getXhrBodyText(body);
      if (!bodyText) {
        return originalSend.call(this, body);
      }

      const payload = JSON.parse(bodyText);
      const mutation = mutatePayload(payload, state);
      if (!mutation.changed) {
        return originalSend.call(this, body);
      }

      const nextBody = JSON.stringify(mutation.payload);
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
