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

      markStart(url);

      try {
        const requestInfo = await buildMutatedFetchRequest(
          input,
          init,
          state
        );
        if (!requestInfo) {
          return await originalFetch.apply(this, arguments);
        }

        return await originalFetch.call(
          this,
          requestInfo.input,
          requestInfo.init
        );
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
  return { input: nextInput, init: nextInit };
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
