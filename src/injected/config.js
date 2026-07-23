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

  const activeProject = normalizeActiveProject(config.activeProject);

  const rawEntries = Array.isArray(config.systemPromptEntries) ? config.systemPromptEntries : [];
  const systemPromptEntries = rawEntries
    .map(e => ({
      id: String(e && e.id ? e.id : ""),
      content: String(e && e.content ? e.content : ""),
      enabled: e && typeof e.enabled === "boolean" ? e.enabled : true,
      schedule: normalizeSchedule(e && e.schedule),
    }))
    .filter(e => e.id && e.content.trim().length > 0 && e.enabled);

  const mcpToolSchemas = Array.isArray(config.mcpToolSchemas)
    ? config.mcpToolSchemas.map(s => ({
        serverName: String(s.serverName || ""),
        serverUrl: String(s.serverUrl || ""),
        toolName: String(s.toolName || ""),
        description: String(s.description || ""),
        inputSchema: s.inputSchema || {},
      })).filter(s => s.serverName && s.toolName)
    : [];

  return {
    systemPrompt: String(config.systemPrompt || ""),
    systemPromptEntries,
    skills,
    memories,
    activeCharacter: config.activeCharacter || null,
    preferredLang: String(config.preferredLang || ""),
    disableSystemPrompt: Boolean(config.disableSystemPrompt),
    disableMemory: Boolean(config.disableMemory),
    systemPromptInjectionFrequency: String(config.systemPromptInjectionFrequency || "first"),
    systemPromptInjectionInterval: Number(config.systemPromptInjectionInterval) || 3,
    activeProject,
    projectRagEnabled: Boolean(config.projectRagEnabled),
    projectRagLimit: Number(config.projectRagLimit) || 5,
    injectSystemDateTime: Boolean(config.injectSystemDateTime),
    deepResearch: normalizeDeepResearch(config.deepResearch),
    mcpToolSchemas,
  };
}

export function normalizeDeepResearch(raw) {
  if (!raw || typeof raw !== "object") {
    return { enabled: false, runId: "" };
  }
  return {
    enabled: Boolean(raw.enabled),
    runId: String(raw.runId || "").trim(),
  };
}

function normalizeActiveProject(raw) {
  if (!raw || typeof raw !== "object") return null;

  const name = String(raw.name || "").trim();
  const instructions = String(raw.instructions || "");
  const files = Array.isArray(raw.files)
    ? raw.files
        .map((f) => ({
          name: String(f && f.name ? f.name : "file"),
          content: String(f && f.content ? f.content : ""),
        }))
        .filter((f) => f.content.length > 0)
    : [];

  if (!name) return null;

  return { name, instructions, files };
}

function normalizeSchedule(raw) {
  if (!raw || typeof raw !== "object") return { type: "first", everyNTurns: 1 };
  const type = String(raw.type || "first");
  const validTypes = ["first", "always", "interval"];
  return {
    type: validTypes.includes(type) ? type : "first",
    everyNTurns: Math.max(1, Math.floor(Number(raw.everyNTurns) || 3)),
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
