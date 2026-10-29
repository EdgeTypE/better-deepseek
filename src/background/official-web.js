/** DeepSeek official Search/Fetch. Keys stay out of content state and page bridges. */
export const OFFICIAL_WEB_KEY = 'bds_official_web_api_key';
const API = 'https://api.deepseek.com/v1/tools/';
const MAX_RESPONSE = 4 * 1024 * 1024;
const problem = (code, message, status = 0) => Object.assign(new Error(message), { code, status });

function validUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 8192) throw problem('invalid_url', 'Invalid page URL.');
  let url; try { url = new URL(raw); } catch { throw problem('invalid_url', 'Invalid page URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw problem('invalid_url', 'Only public HTTP/HTTPS page URLs without credentials are allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || host.includes(':') || /^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host)) throw problem('private_url', 'Local and private page URLs cannot be sent to the official Fetch service.');
  return url.href;
}

async function readJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw problem('invalid_response', 'Official service returned no readable response.');
  const decoder = new TextDecoder(); let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE) throw problem('response_too_large', 'Official service response exceeded the size limit.');
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text); } catch { throw problem('invalid_response', 'Official service returned invalid JSON.'); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function officialWebRequest(operation, input, { fetcher = globalThis.fetch, storage = chrome.storage.local, timeoutMs = 20000 } = {}) {
  if (!['search', 'fetch'].includes(operation)) throw problem('invalid_operation', 'Unsupported official web operation.');
  const stored = await storage.get(['bds_settings', OFFICIAL_WEB_KEY]);
  const settings = stored.bds_settings || {};
  if (operation === 'search' && !settings.searchProviders?.includes('deepseek-official')) throw problem('disabled', 'Enable DeepSeek Official Search in settings first.');
  if (operation === 'fetch' && settings.webFetchProvider !== 'deepseek-official') throw problem('disabled', 'Enable DeepSeek Official Fetch in settings first.');
  const key = stored[OFFICIAL_WEB_KEY];
  if (typeof key !== 'string' || !key || key.length > 512 || /[\s\x00-\x1f\x7f]/.test(key)) throw problem('missing_key', 'Configure the official Search/Fetch API key in settings.');
  let body;
  if (operation === 'search') {
    const query = typeof input?.query === 'string' ? input.query.trim() : '';
    if (!query || [...query].length > 128) throw problem('invalid_query', 'Official Search requires a query of 1–128 Unicode characters. Shorten the query; it was not truncated.');
    body = { query, count: 10, need_content: false };
  } else { body = { url: validUrl(input?.url) }; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(API + operation, {
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body), signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const labels = { 401: 'API key is invalid.', 402: 'API account balance is insufficient.', 403: 'Official service rejected the URL.', 404: 'No usable page content was found.', 429: 'Official web rate limit reached. Retry later.' };
      throw problem('http_error', labels[response.status] || 'Official web service request failed.', response.status);
    }
    const value = await readJson(response);
    if (operation === 'fetch') {
      if (typeof value?.title !== 'string' || typeof value?.content !== 'string' || !value.content.trim()) throw problem('invalid_response', 'Official Fetch returned no usable Markdown.');
      return { title: value.title, content: value.content, url: body.url };
    }
    if (!Array.isArray(value?.results)) throw problem('invalid_response', 'Official Search returned an invalid result list.');
    const results = value.results.slice(0, 50).map(item => {
      if (!item || typeof item.title !== 'string' || typeof item.url !== 'string') throw problem('invalid_response', 'Official Search returned an invalid result.');
      return { title: item.title, url: validUrl(item.url), snippet: typeof item.summary === 'string' ? item.summary : typeof item.snippet === 'string' ? item.snippet : '' };
    });
    return { results };
  } catch (error) {
    if (controller.signal.aborted) throw problem('timeout', 'Official web request timed out.');
    if (error?.code && error instanceof Error && !String(error.message).includes(key)) throw error;
    throw problem('network_error', 'Unable to reach the official web service.');
  } finally { clearTimeout(timer); }
}

function trusted(sender) {
  if (!sender || sender.id !== chrome.runtime.id) return false;
  const url = sender.url || '';
  return url.startsWith(chrome.runtime.getURL('')) || (() => { try { return new URL(url).origin === 'https://chat.deepseek.com'; } catch { return false; } })();
}

export async function handleOfficialWebMessage(message, sender) {
  if (!trusted(sender)) throw problem('unauthorized', 'Unauthorized extension caller.');
  if (message.type === 'bds-official-web-open-settings') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('static/official-web-settings.html') });
    return { opened: true };
  }
  if (message.type === 'bds-official-web-settings') {
    if (message.action !== 'status' && sender.url !== chrome.runtime.getURL('static/official-web-settings.html')) throw problem('unauthorized', 'Open the extension-owned settings page to change the key.');
    if (message.action === 'save') {
      const key = typeof message.apiKey === 'string' ? message.apiKey.trim() : '';
      if (!key || key.length > 512 || /[\s\x00-\x1f\x7f]/.test(key)) throw problem('invalid_key', 'Enter a valid API key.');
      await chrome.storage.local.set({ [OFFICIAL_WEB_KEY]: key });
    } else if (message.action === 'clear') { await chrome.storage.local.remove(OFFICIAL_WEB_KEY); }
    else if (message.action !== 'status') throw problem('invalid_action', 'Unsupported key action.');
    const stored = await chrome.storage.local.get(OFFICIAL_WEB_KEY);
    return { configured: Boolean(stored[OFFICIAL_WEB_KEY]) };
  }
  if (message.type !== 'bds-official-web') throw problem('invalid_operation', 'Unsupported message.');
  return officialWebRequest(message.operation, message.input);
}

export function registerOfficialWeb() {
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!['bds-official-web', 'bds-official-web-settings', 'bds-official-web-open-settings'].includes(message?.type)) return false;
    handleOfficialWebMessage(message, sender).then(data => respond({ ok: true, data })).catch(error => respond({ ok: false, error: error.message, code: error.code || 'request_failed', status: error.status || 0 }));
    return true;
  });
}
