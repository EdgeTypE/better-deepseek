import { mutatePayload } from "./payload-mutator.js";

/**
 * Patch window.fetch to intercept chat completion requests.
 *
 * @param {object} state - The injected script state
 * @param {function} isChatCompletionUrl
 * @param {function} markStart
 * @param {function} markEnd
 */
export function patchFetch(state, isChatCompletionUrl, markStart, markEnd) {
  const originalFetch = window.fetch;

  window.fetch = async function patchedFetch(input, init) {
    try {
      const url = extractUrl(input);
      if (!isChatCompletionUrl(url)) {
        return originalFetch.apply(this, arguments);
      }

      // If it's a session fetch, we don't mutate request, we capture response
      if (url.includes("/api/v0/chat_session/fetch_page")) {
        const response = await originalFetch.apply(this, arguments);
        const cloned = response.clone();
        cloned.json().then(data => {
          window.dispatchEvent(new CustomEvent("bds:session-data", { detail: JSON.stringify(data) }));
        }).catch(() => {});
        return response;
      }

      markStart(url);

      try {
        const requestInfo = await buildMutatedFetchRequest(
          input,
          init,
          state
        );

        if (!requestInfo) {
          const response = await originalFetch.apply(this, arguments);
          tryCaptureTokenUsage(response, url, requestInfo?.modelName);
          return response;
        }

        const response = await originalFetch.call(
          this,
          requestInfo.input,
          requestInfo.init
        );

        // Detect server errors
        if (response && response.status >= 500) {
          window.dispatchEvent(new CustomEvent("bds:network-error", {
            detail: JSON.stringify({
              url,
              status: response.status,
              type: 'fetch'
            })
          }));
        }

        tryCaptureTokenUsage(response, url, requestInfo.modelName);
        return response;
      } catch (innerError) {
        // Detect network failures
        window.dispatchEvent(new CustomEvent("bds:network-error", {
          detail: JSON.stringify({
            url,
            status: 0,
            type: 'fetch',
            error: String(innerError)
          })
        }));
        throw innerError;
      } finally {
        markEnd(url);
      }
    } catch (error) {
      console.warn("[BetterDeepSeek] Request patch failed:", error);
      return originalFetch.apply(this, arguments);
    }
  };
}

/**
 * Try to capture token usage from the API response stream.
 */
function tryCaptureTokenUsage(response, url, modelName) {
  if (!response || !response.clone) return;
  try {
    const cloned = response.clone();
    readResponseForUsage(cloned, modelName).catch(() => {});
  } catch (e) {
    // clone might fail if body already consumed; ignore
  }
}

/**
 * Extract URL string from various fetch input types.
 */
export function extractUrl(input) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  return "";
}

/**
 * Build a mutated fetch request with injected content.
 */
async function buildMutatedFetchRequest(input, init, state) {
  const bodyText = await extractBodyText(input, init);
  if (!bodyText) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return null;
  }

  const requestModelName = payload.model || null;

  const mutation = mutatePayload(payload, state);
  if (!mutation.changed) {
    return null;
  }

  const nextBody = JSON.stringify(mutation.payload);
  const sourceHeaders =
    init && init.headers
      ? init.headers
      : input instanceof Request
        ? input.headers
        : undefined;
  const headers = new Headers(sourceHeaders || {});
  headers.set("content-type", "application/json");

  const nextInit = {
    method:
      (init && init.method) ||
      (input instanceof Request ? input.method : "POST"),
    headers,
    body: nextBody,
    credentials:
      (init && init.credentials) ||
      (input instanceof Request ? input.credentials : undefined),
    cache:
      (init && init.cache) ||
      (input instanceof Request ? input.cache : undefined),
    mode:
      (init && init.mode) ||
      (input instanceof Request ? input.mode : undefined),
    redirect:
      (init && init.redirect) ||
      (input instanceof Request ? input.redirect : undefined),
    referrer:
      (init && init.referrer) ||
      (input instanceof Request ? input.referrer : undefined),
    referrerPolicy:
      (init && init.referrerPolicy) ||
      (input instanceof Request ? input.referrerPolicy : undefined),
    keepalive:
      (init && init.keepalive) ||
      (input instanceof Request ? input.keepalive : undefined),
    integrity:
      (init && init.integrity) ||
      (input instanceof Request ? input.integrity : undefined),
    signal:
      (init && init.signal) ||
      (input instanceof Request ? input.signal : undefined),
  };

  const nextInput =
    typeof input === "string" || input instanceof URL ? input : input.url;
  return { input: nextInput, init: nextInit, modelName: requestModelName };
}

/**
 * Read the response body (handles both streaming SSE and JSON) to extract token usage info.
 */
async function readResponseForUsage(response, modelName) {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream") || contentType.includes("stream")) {
      await parseSSEUsage(response, modelName);
    } else {
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        const usage = data?.usage || data?.token_usage;
        if (usage) {
          emitTokenUsage(usage.prompt_tokens || usage.input_tokens || 0,
            usage.completion_tokens || usage.output_tokens || 0,
            modelName);
        }
      } catch (e) { /* ignore parse errors */ }
    }
  } catch (e) { /* silently ignore */ }
}

/**
 * Parse SSE stream to find the final chunk with usage data.
 */
async function parseSSEUsage(response, modelName) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: !done });
      if (done) break;
    }
  } catch (e) { return; }

  const lines = buffer.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("data: ")) continue;
    const jsonStr = line.slice(6).trim();
    if (jsonStr === "[DONE]") continue;
    try {
      const chunk = JSON.parse(jsonStr);
      const usage = chunk?.usage || chunk?.token_usage;
      if (usage) {
        emitTokenUsage(usage.prompt_tokens || usage.input_tokens || 0,
          usage.completion_tokens || usage.output_tokens || 0,
          modelName || chunk?.model);
        break;
      }
    } catch (e) { /* ignore */ }
  }
}

function emitTokenUsage(inputTokens, outputTokens, modelName) {
  if (typeof inputTokens !== "number" && typeof outputTokens !== "number") return;
  window.dispatchEvent(new CustomEvent("bds:token-usage", {
    detail: JSON.stringify({
      inputTokens: Number(inputTokens) || 0,
      outputTokens: Number(outputTokens) || 0,
      modelName: modelName || null,
      timestamp: Date.now(),
    }),
  }));
}

/**
 * Extract body text from fetch arguments.
 */
async function extractBodyText(input, init) {
  if (init && typeof init.body === "string") {
    return init.body;
  }

  if (init && init.body instanceof URLSearchParams) {
    return init.body.toString();
  }

  if (input instanceof Request) {
    const cloned = input.clone();
    return cloned.text();
  }

  return "";
}
