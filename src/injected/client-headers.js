/**
 * Helpers for normalizing bearer tokens and forwarding page client headers.
 */

export const DEFAULT_CLIENT_VERSION = "2.8.0";

const CLIENT_HEADER_KEYS = new Set([
  "x-client-bundle-id",
  "x-client-platform",
  "x-client-version",
  "x-client-locale",
  "x-client-timezone-offset",
  "x-device-id",
  "x-device-model",
]);

/**
 * Strip whitespace, surrounding quotes, and any repeated "Bearer " prefix
 * so stored tokens never turn into "Bearer Bearer ...".
 *
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeBearerToken(raw) {
  if (typeof raw !== "string") return null;
  let token = raw.trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  while (/^bearer(?:\s+|$)/i.test(token)) {
    token = token.replace(/^bearer(?:\s+|$)/i, "").trim();
  }
  return token || null;
}

/**
 * Record a single header if it belongs to DeepSeek's client/device metadata set.
 *
 * @param {string} name
 * @param {unknown} value
 * @param {Record<string, string>} target
 */
export function captureClientHeader(name, value, target) {
  if (!name || !target || value === undefined || value === null) return;
  const lower = String(name).toLowerCase();
  if (!CLIENT_HEADER_KEYS.has(lower)) return;
  target[lower] = String(value);
}

/**
 * Iterate over Headers, entry-pair arrays, or plain header objects uniformly.
 *
 * @param {Headers|Array<[string, unknown]>|Record<string, unknown>|null|undefined} headers
 * @param {(lowerName: string, value: string) => void} visitor
 */
function forEachHeader(headers, visitor) {
  if (!headers) return;
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    headers.forEach((value, key) => {
      visitor(String(key).toLowerCase(), String(value));
    });
    return;
  }
  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      visitor(String(entry[0]).toLowerCase(), String(entry[1] ?? ""));
    }
    return;
  }
  if (typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined || value === null) continue;
      visitor(String(key).toLowerCase(), String(value));
    }
  }
}

/**
 * Capture authorization and DeepSeek client/device headers from a fetch
 * Request or RequestInit header collection.
 *
 * @param {Headers|Array<[string, unknown]>|Record<string, unknown>|null|undefined} headers
 * @param {{ setAuthToken?: (token: string) => void, captureClientHeader?: (k: string, v: string) => void }} state
 */
export function captureMetadataFromHeaders(headers, state) {
  if (!headers || !state) return;
  forEachHeader(headers, (lower, value) => {
    if (lower === "authorization") {
      if (value && typeof state.setAuthToken === "function") {
        state.setAuthToken(value);
      }
      return;
    }
    if (CLIENT_HEADER_KEYS.has(lower) && typeof state.captureClientHeader === "function") {
      state.captureClientHeader(lower, value);
    }
  });
}

function readStoredLocale(storage, navigatorObj) {
  try {
    const raw = storage?.getItem?.("__appKit_@deepseek/chat_localePreference");
    if (raw) {
      const parsed = JSON.parse(raw);
      const val = parsed?.value;
      if (typeof val === "string" && val && val !== "system") {
        return val;
      }
    }
  } catch {
    /* ignore malformed storage */
  }
  const navLang = navigatorObj?.language || navigatorObj?.languages?.[0];
  if (typeof navLang === "string" && navLang) {
    return navLang.replace("-", "_");
  }
  return "en_US";
}

function readStoredDeviceId(storage) {
  try {
    const id = storage?.getItem?.("deepseek-device-id:chat");
    if (typeof id === "string" && id.trim()) return id.trim();
  } catch {
    /* ignore storage errors */
  }
  return null;
}

/**
 * Build request headers for extension-initiated API calls.
 *
 * @param {object} options
 * @param {string|null} [options.authToken]
 * @param {Record<string, string>} [options.capturedHeaders]
 * @param {boolean} [options.includeContentType=false]
 * @param {Storage} [options.storage]
 * @param {Navigator} [options.navigatorObj]
 * @returns {Record<string, string>}
 */
export function buildDeepSeekApiHeaders({
  authToken = null,
  capturedHeaders = {},
  includeContentType = false,
  storage = typeof localStorage !== "undefined" ? localStorage : undefined,
  navigatorObj = typeof navigator !== "undefined" ? navigator : undefined,
} = {}) {
  const headers = {
    accept: "*/*",
    "x-client-bundle-id": capturedHeaders["x-client-bundle-id"] || "com.deepseek.chat",
    "x-client-platform": capturedHeaders["x-client-platform"] || "web",
    "x-client-locale":
      capturedHeaders["x-client-locale"] || readStoredLocale(storage, navigatorObj),
    "x-client-timezone-offset":
      capturedHeaders["x-client-timezone-offset"] ||
      String(-new Date().getTimezoneOffset() * 60),
    "x-client-version": capturedHeaders["x-client-version"] || DEFAULT_CLIENT_VERSION,
    "x-device-model": capturedHeaders["x-device-model"] ?? "",
  };

  const deviceId = capturedHeaders["x-device-id"] || readStoredDeviceId(storage);
  if (deviceId) {
    headers["x-device-id"] = deviceId;
  }

  if (includeContentType) {
    headers["content-type"] = "application/json";
  }

  const normalizedToken = normalizeBearerToken(authToken);
  if (normalizedToken) {
    headers["authorization"] = `Bearer ${normalizedToken}`;
  }

  return headers;
}
