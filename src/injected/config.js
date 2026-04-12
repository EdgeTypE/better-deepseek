/**
 * Normalize incoming config from the content script.
 */
export function normalizeConfig(config) {
  const skills = Array.isArray(config.skills)
    ? config.skills
        .map((skill) => ({
          name: String(skill && skill.name ? skill.name : "skill"),
          content: String(skill && skill.content ? skill.content : ""),
        }))
        .filter((skill) => skill.content.trim().length > 0)
    : [];

  const memories = Array.isArray(config.memories)
    ? config.memories
        .map((item) => ({
          key: sanitizeKey(item && item.key),
          value: String(item && item.value ? item.value : ""),
          importance: sanitizeImportance(item && item.importance),
        }))
        .filter((item) => item.key && item.value.trim().length > 0)
    : [];

  return {
    systemPrompt: String(config.systemPrompt || ""),
    skills,
    memories,
  };
}

export function sanitizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

export function sanitizeImportance(value) {
  return String(value || "called").toLowerCase() === "always"
    ? "always"
    : "called";
}
