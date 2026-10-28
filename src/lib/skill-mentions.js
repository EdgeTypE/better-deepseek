/**
 * `@skill` mentions, shared by the composer autocomplete (content world) and
 * the payload mutator (MAIN world).
 *
 * A mention stays in the visible message text: the user sees `@name`, and the
 * mutator resolves the same string when the request goes out. That is why the
 * parsing lives here — both sides must agree on what counts as a mention.
 *
 * Nothing is staged between the two worlds (no one-shot pending state, no
 * send-time hook), so a mention cannot leak into the next message and still
 * works when the message is edited or re-sent.
 */

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the `@` query the caret is currently inside.
 *
 * The query keeps growing across spaces as long as it is still a prefix of a
 * known skill name — that is what makes `@my skill` completable. As soon as it
 * stops being a prefix (`@translate this`), the menu closes. The `@` must start
 * a word, so `mail@host` never opens it.
 *
 * @param {string} text full editor value
 * @param {number} caret caret offset in `text`
 * @param {string[]} names known skill names
 * @returns {{ start: number, query: string, matches: string[] } | null}
 */
export function findMentionQuery(text, caret, names) {
  const value = String(text ?? "");
  const end = Math.max(0, Math.min(Number(caret) || 0, value.length));
  if (end === 0) return null;

  const at = value.lastIndexOf("@", end - 1);
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(value[at - 1])) return null;

  const query = value.slice(at + 1, end);
  if (query.includes("\n")) return null;

  const needle = query.toLowerCase();
  const matches = (Array.isArray(names) ? names : [])
    .map((name) => String(name ?? ""))
    .filter((name) => name && name.toLowerCase().startsWith(needle));
  if (matches.length === 0) return null;

  return { start: at, query, matches };
}

/**
 * Resolve `@name` mentions in a message to skills.
 *
 * Longest name wins, so a skill called `code review` is not shadowed by one
 * called `code`; the mention must also end on a word boundary, so `@testing`
 * does not match a skill named `test`.
 *
 * @param {string} text
 * @param {Array<{ name?: string }>} skills
 * @returns {Array<object>} matched skills, in order of appearance
 */
export function parseSkillMentions(text, skills) {
  const value = String(text ?? "");
  const list = Array.isArray(skills) ? skills : [];
  if (!value || list.length === 0) return [];

  const byName = new Map();
  for (const skill of list) {
    const name = String(skill && skill.name ? skill.name : "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, skill);
  }
  if (byName.size === 0) return [];

  const alternatives = [...byName.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");

  const pattern = new RegExp(`(?:^|\\s)@(${alternatives})(?![\\w-])`, "gi");
  const found = [];
  const seen = new Set();
  let match;
  while ((match = pattern.exec(value)) !== null) {
    const key = match[1].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(byName.get(key));
  }
  return found;
}
