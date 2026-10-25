/**
 * Settings transfer over chat ("export to chat").
 *
 * The backup travels inside the **user** message, never in the model's reply:
 * a model re-typing a JSON blob abbreviates it, re-indents it or invents
 * values, and any of those silently corrupts a config. The bytes are injected
 * by `payload-mutator.js` straight into the outgoing request body, so the
 * model never authors them.
 *
 * Encoding rules that both bundles must agree on:
 *  - the block body is base64, so it never contains `<` or `>`. That keeps the
 *    `[^>]*` opening-tag regex in the injected bundle safe (see the note in
 *    `stripInjectedBlocks`).
 *  - `sum` is the first 16 hex chars of SHA-256 over the *decoded* JSON, so a
 *    truncated or normalised message is detected instead of applied.
 */

import { gzipSync, gunzipSync, strToU8, strFromU8 } from "fflate";
import { encryptData, decryptData } from "./utils/crypto.js";
import { CONFIG_SYNC_TAG } from "./constants.js";

/** Tag name of the transfer block. */
export const CONFIG_TAG = CONFIG_SYNC_TAG;
export const CONFIG_FORMAT_VERSION = 1;

/**
 * Keys that may be transferred. Order is the order the card lists them in.
 * Mirrors `EXPORT_SECTIONS` in SettingsPanel (which adds i18n labels).
 */
export const CONFIG_SECTIONS = [
  "settings",
  "customSystemPrompts",
  "cssSnippets",
  "skills",
  "characters",
  "memories",
  "mcpServers",
  "projects",
  "projectFiles",
  "chatTags",
  "savedItems",
];

/**
 * Settings keys that only make sense on the device that wrote them. Carrying
 * them over corrupts the destination's version-upgrade logic.
 */
const MIGRATION_ONLY_KEYS = [
  "systemPromptBackupDone",
  "systemPromptTemplateVersion",
  "downloadBehaviorVersion",
];

/** Credential-shaped keys, stripped when the block is sent unencrypted. */
const SECRET_KEY_PATTERN = /^(githubToken|apiKey|api_key|accessToken|authToken|token|secret|password)$/i;

export const CONFIG_ERRORS = {
  FORMAT: "format",
  VERSION: "version",
  CHECKSUM: "checksum",
  PASSWORD_REQUIRED: "password-required",
  PASSWORD_WRONG: "password-wrong",
  CRYPTO: "crypto",
};

// ── base64 ───────────────────────────────────────────────────────────────────

const B64_CHUNK = 0x8000;

export function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += B64_CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + B64_CHUNK, bytes.length)),
    );
  }
  return btoa(binary);
}

export function base64ToBytes(str) {
  const binary = atob(String(str || "").replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── checksum ─────────────────────────────────────────────────────────────────

/**
 * Short SHA-256 fingerprint of the plaintext payload.
 * Returns "" when WebCrypto is unavailable (the block is still readable; the
 * checksum is a corruption guard, not a security boundary).
 *
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function checksumOf(text) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return "";
  try {
    const digest = await subtle.digest("SHA-256", strToU8(text));
    return Array.from(new Uint8Array(digest).slice(0, 8))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

// ── payload assembly ─────────────────────────────────────────────────────────

/**
 * Does this settings object still carry the shipped default system prompt?
 *
 * `activeSystemPromptId === "default"` is the source of truth: storage.js
 * rewrites `systemPrompt` from `DEFAULT_SYSTEM_PROMPT` whenever that id is
 * selected, so the text itself can never drift while it is selected.
 *
 * @param {{activeSystemPromptId?: string}} settings
 * @returns {boolean}
 */
export function usesDefaultSystemPrompt(settings) {
  return String(settings?.activeSystemPromptId || "default") === "default";
}

/**
 * Remove credential-shaped values from the parts of the payload that can hold
 * them. Returns a new payload plus the number of fields that were cleared.
 *
 * Only `settings` and `mcpServers` are swept on purpose: those are the two
 * places credentials live. Sweeping user content (snippets, memories, skills)
 * by key name would blank real text.
 *
 * @param {object} payload
 * @returns {{ payload: object, removed: number }}
 */
export function redactSecrets(payload) {
  const next = cloneJson(payload);
  let removed = 0;

  const clear = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      if (!SECRET_KEY_PATTERN.test(key)) continue;
      if (typeof obj[key] !== "string" || obj[key] === "") continue;
      obj[key] = "";
      removed += 1;
    }
  };

  clear(next.settings);
  if (Array.isArray(next.mcpServers)) {
    for (const server of next.mcpServers) clear(server);
  }

  return { payload: next, removed };
}

/**
 * Build the transfer payload from live app state.
 *
 * The default system prompt is replaced by a marker instead of being copied:
 * it is ~41 KB (the single largest item in a backup) and the destination
 * build's default is the correct one there — copying the source text would
 * pin an older prompt onto a newer device.
 *
 * @param {{
 *   settings: object,
 *   cssSnippets?: Array,
 *   skills?: Array,
 *   characters?: Array,
 *   memories?: object|Array,
 *   mcpServers?: Array,
 *   projects?: Array,
 *   projectFiles?: Array,
 *   chatTags?: object,
 *   savedItems?: Array,
 * }} sources
 * @param {{ includeSecrets?: boolean, exportedAt?: string, skipSections?: string[] }} [options]
 *   `skipSections` drops whole sections; the chat path uses it for the
 *   content-heavy ones (project files) that are not settings and can be
 *   megabytes.
 * @returns {{ payload: object, removedSecrets: number, skipped: string[] }}
 */
export function buildSyncPayload(sources, options = {}) {
  const {
    includeSecrets = false,
    exportedAt = new Date().toISOString(),
    skipSections = [],
  } = options;
  const sourceSettings = sources?.settings || {};
  const skip = new Set(skipSections);

  const settings = cloneJson(sourceSettings);
  for (const key of MIGRATION_ONLY_KEYS) delete settings[key];
  // Exported as its own section so it can be imported independently; keeping
  // it in the settings blob double-applies it.
  delete settings.customSystemPrompts;

  // Kept at the top level, not inside `settings`: the settings blob is merged
  // into the destination as-is, and a marker in there would leak into stored
  // settings. It also tells "replace" whether to reset the prompt to the
  // destination build's default.
  const systemPromptIsDefault = usesDefaultSystemPrompt(sourceSettings);
  if (systemPromptIsDefault) {
    delete settings.systemPrompt;
  } else {
    settings.systemPrompt = String(sourceSettings.systemPrompt || "");
  }

  const skipped = CONFIG_SECTIONS.filter(
    (key) => skip.has(key) && sources?.[key] !== undefined && sources?.[key] !== null,
  );

  let payload = {
    version: CONFIG_FORMAT_VERSION,
    exportedAt,
    systemPromptIsDefault,
    ...pickSection(sources, "cssSnippets", skip),
    ...pickSection(sources, "skills", skip),
    ...pickSection(sources, "characters", skip),
    ...pickSection(sources, "memories", skip),
    ...pickSection(sources, "mcpServers", skip),
    ...pickSection(sources, "projects", skip),
    ...pickSection(sources, "projectFiles", skip),
    ...pickSection(sources, "chatTags", skip),
    ...pickSection(sources, "savedItems", skip),
    customSystemPrompts: skip.has("customSystemPrompts")
      ? undefined
      : Array.isArray(sourceSettings.customSystemPrompts)
        ? cloneJson(sourceSettings.customSystemPrompts)
        : [],
    settings,
  };
  if (payload.customSystemPrompts === undefined) delete payload.customSystemPrompts;

  let removedSecrets = 0;
  if (!includeSecrets) {
    const redacted = redactSecrets(payload);
    payload = redacted.payload;
    removedSecrets = redacted.removed;
    payload.secretsRedacted = removedSecrets;
  }

  return { payload, removedSecrets, skipped };
}

function pickSection(sources, key, skip) {
  if (skip?.has(key)) return {};
  const value = sources?.[key];
  if (value === undefined || value === null) return {};
  return { [key]: cloneJson(value) };
}

/**
 * Size of each section once serialised, largest first.
 *
 * Used to explain an oversized backup instead of just refusing it: the culprit
 * is almost always one section (imported memories, saved documents), and the
 * user cannot guess which.
 *
 * @param {object} payload
 * @returns {Array<{ key: string, bytes: number }>}
 */
export function measureSections(payload) {
  if (!payload || typeof payload !== "object") return [];

  return Object.keys(payload)
    .filter((key) => key !== "version" && key !== "exportedAt")
    .map((key) => {
      let bytes = 0;
      try {
        bytes = JSON.stringify(payload[key])?.length || 0;
      } catch {
        bytes = 0;
      }
      return { key, bytes };
    })
    .filter((entry) => entry.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);
}

function cloneJson(value) {
  if (value === undefined || value === null) return value ?? null;
  return JSON.parse(JSON.stringify(value));
}

// ── encode / decode ──────────────────────────────────────────────────────────

/**
 * Turn a payload into the `<BDS:CONFIG …>body</BDS:CONFIG>` block.
 *
 * Without a password the payload is gzipped so the block stays compact; with
 * one it is encrypted with the same AES-GCM envelope the file export uses
 * (encrypted data does not compress, so gzip is skipped).
 *
 * @param {object} payload
 * @param {{ password?: string }} [options]
 * @returns {Promise<string>}
 */
export async function encodeConfigBlock(payload, options = {}) {
  const password = String(options.password || "");
  const json = JSON.stringify(payload);
  const sum = await checksumOf(json);

  let enc = "gz";
  let body;
  if (password) {
    const envelope = await encryptData(json, password);
    enc = "aes";
    body = bytesToBase64(strToU8(JSON.stringify(envelope)));
  } else {
    body = bytesToBase64(gzipSync(strToU8(json)));
  }

  const attrs = [
    `v="${CONFIG_FORMAT_VERSION}"`,
    `enc="${enc}"`,
    `bytes="${json.length}"`,
    sum ? `sum="${sum}"` : "",
    payload?.exportedAt ? `at="${payload.exportedAt}"` : "",
    payload?.secretsRedacted ? `red="${payload.secretsRedacted}"` : "",
  ].filter(Boolean).join(" ");

  return `<${CONFIG_TAG} ${attrs}>\n${body}\n</${CONFIG_TAG}>`;
}

/**
 * Find transfer blocks in a raw message body (as stored by the server, i.e.
 * with the injected prefix still attached).
 *
 * @param {string} text
 * @returns {Array<{ raw: string, attrs: Record<string,string>, body: string }>}
 */
export function parseConfigBlocks(text) {
  const source = String(text || "");
  if (!source.includes(CONFIG_TAG)) return [];

  const pattern = new RegExp(
    `<${CONFIG_TAG}\\b([^>]*)>([\\s\\S]*?)</${CONFIG_TAG}>`,
    "gi",
  );
  const blocks = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    blocks.push({
      raw: match[0],
      attrs: parseAttributes(match[1]),
      body: match[2].trim(),
    });
  }
  return blocks;
}

function parseAttributes(raw) {
  const attrs = {};
  const pattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(String(raw || ""))) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}

/**
 * Decode a parsed block back into a payload.
 *
 * @param {{ attrs: Record<string,string>, body: string }} block
 * @param {{ password?: string }} [options]
 * @returns {Promise<{ payload?: object, error?: string }>}
 */
export async function decodeConfigBlock(block, options = {}) {
  const password = String(options.password || "");
  const attrs = block?.attrs || {};
  const version = Number(attrs.v || 0);

  if (!version) return { error: CONFIG_ERRORS.FORMAT };
  if (version > CONFIG_FORMAT_VERSION) return { error: CONFIG_ERRORS.VERSION };

  let json;
  try {
    const raw = strFromU8(base64ToBytes(block.body));
    if (attrs.enc === "aes") {
      if (!password) return { error: CONFIG_ERRORS.PASSWORD_REQUIRED };
      let envelope;
      try {
        envelope = JSON.parse(raw);
      } catch {
        return { error: CONFIG_ERRORS.FORMAT };
      }
      try {
        json = await decryptData(envelope, password);
      } catch {
        return { error: CONFIG_ERRORS.PASSWORD_WRONG };
      }
    } else {
      json = strFromU8(gunzipSync(base64ToBytes(block.body)));
    }
  } catch {
    return { error: CONFIG_ERRORS.FORMAT };
  }

  if (attrs.sum) {
    const actual = await checksumOf(json);
    // An empty `actual` means WebCrypto is missing, not that the data is bad.
    if (actual && actual !== attrs.sum) return { error: CONFIG_ERRORS.CHECKSUM };
  }

  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    return { error: CONFIG_ERRORS.FORMAT };
  }
  if (!payload || typeof payload !== "object") return { error: CONFIG_ERRORS.FORMAT };

  return { payload };
}

// ── message text helpers ─────────────────────────────────────────────────────

/**
 * Raw text of an API/history message (`fragments` shape), including injected
 * blocks. `collectMessagesFromApi` is deliberately not used here: it sanitises
 * the text and would remove the very block we are looking for.
 *
 * @param {{ fragments?: Array<{content?: string}>, content?: string }} message
 * @returns {string}
 */
export function rawMessageText(message) {
  if (!message) return "";
  const fragments = Array.isArray(message.fragments) ? message.fragments : [];
  const joined = fragments.map((f) => f?.content || "").join("\n\n");
  if (joined.trim()) return joined;
  return String(message.content || "");
}
