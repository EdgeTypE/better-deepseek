export const COMMANDS = [
  {
    id: "search",
    aliases: [],
    name: "Web Search",
    description: "Search the web and inject results into chat",
    usage: "/search <query>",
    category: "tools",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    minArgs: 1,
    validateArgs(args) { return args[0] ? null : "Usage: /search <query>" },
  },
  {
    id: "new",
    aliases: [],
    name: "New Chat",
    description: "Start a new conversation",
    usage: "/new",
    category: "navigation",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    minArgs: 0,
  },
  {
    id: "export",
    aliases: [],
    name: "Export Chat",
    description: "Export the conversation (markdown, pdf, html, image)",
    usage: "/export <format>",
    category: "tools",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    minArgs: 1,
    validateArgs(args) { const f = (args[0] || "").toLowerCase(); return ["markdown", "pdf", "html", "image"].includes(f) ? null : "Usage: /export markdown|pdf|html|image" },
  },
  {
    id: "compress",
    aliases: ["handoff"],
    name: "Compress / Handoff",
    description: "Summarize the conversation and start a new session with full context",
    usage: "/compress",
    category: "tools",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M8 15l4 4 4-4"/><path d="M12 19V9"/></svg>`,
    minArgs: 0,
  },
  {
    id: "summarize",
    aliases: [],
    name: "Summarize",
    description: "Generate a handoff summary of the conversation in the current chat",
    usage: "/summarize",
    category: "tools",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    minArgs: 0,
  },
  {
    id: "help",
    aliases: ["?"],
    name: "Help",
    description: "Show all available commands",
    usage: "/help [command]",
    category: "builtin",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    minArgs: 0,
  },
]

export function findCommand(id) {
  const lower = id.toLowerCase()
  return COMMANDS.find(c => c.id === lower || c.aliases.includes(lower)) || null
}

export function getCommandSuggestions(partial) {
  const lower = (partial || "").toLowerCase()
  if (!lower) return COMMANDS
  return COMMANDS.filter(c =>
    c.id.includes(lower) ||
    c.aliases.some(a => a.includes(lower)) ||
    c.name.toLowerCase().includes(lower) ||
    c.description.toLowerCase().includes(lower)
  )
}
