/**
 * Multi-system-prompt entries. The built-in slot is a live reference to the
 * core prompt shipped with this build, never a frozen copy (#235).
 */

import { DEFAULT_SYSTEM_PROMPT } from "./constants.js";

export const BUILTIN_SYSTEM_PROMPT_ENTRY_ID = "sp_default";

// Older builds copied the shipped prompt verbatim into the first entry. Every
// shipped version opens with one of these lines, which lets us adopt those
// copies on upgrade while leaving user-authored entries alone.
const BUILTIN_OPENINGS = [
  "You are Better DeepSeek",
  "You are now Better DeepSeek",
];

function clean(value) {
  return String(value == null ? "" : value).trim();
}

export function isBuiltinSystemPromptEntry(entry) {
  return Boolean(entry)
    && entry.id === BUILTIN_SYSTEM_PROMPT_ENTRY_ID
    && entry.builtin === true;
}

/**
 * Resolve the built-in entry against the current core prompt.
 *
 * `builtin: true` entries are managed by the extension: their content is
 * replaced with `shippedPrompt` so upstream prompt changes reach the model.
 * Editing such an entry in the UI clears the flag, which turns it into an
 * ordinary custom entry that is never overwritten.
 *
 * Legacy entries carry no flag. A legacy `sp_default` is adopted only when it
 * is still a copy of a shipped prompt; anything else is treated as user text.
 *
 * @param {Array} entries persisted multi-prompt entries
 * @param {{ shippedPrompt?: string, storedPrompt?: string }} [options]
 *   shippedPrompt - core prompt of this build (defaults to DEFAULT_SYSTEM_PROMPT)
 *   storedPrompt  - `settings.systemPrompt` as read from storage before any
 *                   migration; pristine legacy copies match it exactly.
 * @returns {Array} entries with the built-in slot resolved
 */
export function syncBuiltinSystemPromptEntries(entries, options = {}) {
  if (!Array.isArray(entries)) return [];

  const shippedPrompt = clean(options.shippedPrompt ?? DEFAULT_SYSTEM_PROMPT);
  const storedPrompt = clean(options.storedPrompt);

  return entries.map((entry) => {
    if (!entry || entry.id !== BUILTIN_SYSTEM_PROMPT_ENTRY_ID) return entry;

    // User edit: keep the text exactly as written.
    if (entry.builtin === false) return entry;

    const content = clean(entry.content);
    if (entry.builtin === true) {
      return content === shippedPrompt
        ? entry
        : { ...entry, content: shippedPrompt };
    }

    const isBuiltinCopy =
      content === shippedPrompt
      || (Boolean(storedPrompt) && content === storedPrompt)
      || BUILTIN_OPENINGS.some((opening) => content.startsWith(opening));

    if (!isBuiltinCopy) return { ...entry, builtin: false };
    return { ...entry, builtin: true, content: shippedPrompt };
  });
}
