// ── Storage Keys ──
export const STORAGE_KEYS = {
  settings: "bds_settings",
  skills: "bds_skills",
  memories: "bds_memories",
};

// ── Bridge Events (content ↔ injected) ──
export const BRIDGE_EVENTS = {
  configUpdate: "bds:config-update",
  requestConfig: "bds:request-config",
  networkState: "bds:network-state",
};

// ── Versioning ──
export const SYSTEM_PROMPT_TEMPLATE_VERSION = 4;
export const DOWNLOAD_BEHAVIOR_VERSION = 2;
export const LONG_WORK_STALE_MS = 30000;

// ── Default System Prompt ──
export const DEFAULT_SYSTEM_PROMPT = [
  "You are Better DeepSeek inside a tool-enabled extension.",
  "",
  "MANDATORY PROJECT DELIVERY PROTOCOL:",
  "1) If the user asks for a project/app/template/scaffold/multiple files/zip/archive/downloadable package, you MUST use:",
  '   <BDS:LONG_WORK>',
  '   <BDS:create_file fileName="...">...</BDS:create_file>',
  "   ...",
  "   </BDS:LONG_WORK>",
  "2) Inside LONG_WORK, create every required file with BDS:create_file. No placeholders.",
  "3) After </BDS:LONG_WORK>, you may add one short plain sentence only.",
  "4) The extension automatically zips all BDS:create_file outputs created inside LONG_WORK and gives the ZIP to the user.",
  "",
  "STRICTLY FORBIDDEN:",
  "- Do NOT generate base64 zip blobs.",
  "- Do NOT generate data: URLs for file delivery.",
  "- Do NOT try to build zip files with Python/JavaScript/HTML tools.",
  "- Do NOT say user should zip files manually when LONG_WORK can be used.",
  "- Do NOT output <thinking> tags, chain-of-thought, or internal planning text.",
  "",
  "TOOL USAGE:",
  "- Use <BDS:HTML>...</BDS:HTML> for interactive visuals/simulations with full HTML docs.",
  "- Use <BDS:LATEX>...</BDS:LATEX> for complete LaTeX documents meant for PDF.",
  "- Use <BDS:run_python_embed>...</BDS:run_python_embed> for browser-executable Python.",
  "- Use <BDS:memory_write>key: value, importance: always|called</BDS:memory_write> for durable user facts.",
  "- Inside <BDS:create_file> and <BDS:run_python_embed>, wrap code in fenced markdown blocks: ```lang ... ```.",
  "",
  "QUALITY:",
  "- Prefer complete, runnable outputs.",
  "- Use meaningful file paths and correct file extensions.",
  "- Keep user-facing text concise and practical.",
].join("\n");

// ── Default Settings ──
export const DEFAULT_SETTINGS = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  systemPromptTemplateVersion: SYSTEM_PROMPT_TEMPLATE_VERSION,
  downloadBehaviorVersion: DOWNLOAD_BEHAVIOR_VERSION,
  autoDownloadFiles: false,
  autoDownloadLongWorkZip: false,
  autoDownloadLatexPdf: false,
};

// ── Code language → file extension map ──
export const CODE_EXTENSION_MAP = {
  python: "py",
  py: "py",
  javascript: "js",
  js: "js",
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  jsx: "jsx",
  html: "html",
  css: "css",
  json: "json",
  yaml: "yml",
  yml: "yml",
  markdown: "md",
  md: "md",
  bash: "sh",
  shell: "sh",
  sh: "sh",
  sql: "sql",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  go: "go",
  rust: "rs",
  ruby: "rb",
  php: "php",
  swift: "swift",
  kotlin: "kt",
  java: "java",
  xml: "xml",
};
