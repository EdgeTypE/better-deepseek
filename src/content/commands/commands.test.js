import { describe, expect, it, vi } from "vitest";

// --- PARSER ---

describe("parseCommandInput", () => {
  it("parses a simple command", async () => {
    const { parseCommandInput } = await import("./parser.js")
    const result = parseCommandInput("/help")
    expect(result).toEqual({ command: "help", args: [], rawArgs: "", text: "help" })
  })

  it("parses command with arguments", async () => {
    const { parseCommandInput } = await import("./parser.js")
    const result = parseCommandInput("/web https://example.com")
    expect(result.command).toBe("web")
    expect(result.args).toEqual(["https://example.com"])
    expect(result.rawArgs).toBe("https://example.com")
  })

  it("parses quoted arguments", async () => {
    const { parseCommandInput } = await import("./parser.js")
    const result = parseCommandInput('/search "hello world"')
    expect(result.args).toEqual(["hello world"])
  })

  it("returns null for non-command input", async () => {
    const { parseCommandInput } = await import("./parser.js")
    expect(parseCommandInput("hello")).toBeNull()
    expect(parseCommandInput("")).toBeNull()
  })

  it("normalizes command to lowercase", async () => {
    const { parseCommandInput } = await import("./parser.js")
    const result = parseCommandInput("/GitHub owner/repo")
    expect(result.command).toBe("github")
  })
})

// --- REGISTRY ---

describe("findCommand", () => {
  it("finds built-in commands by id", async () => {
    const { findCommand } = await import("./registry.js")
    expect(findCommand("search").id).toBe("search")
    expect(findCommand("help").id).toBe("help")
  })

  it("finds built-in commands by alias", async () => {
    const { findCommand } = await import("./registry.js")
    expect(findCommand("?").id).toBe("help")
  })

  it("returns null for unknown command", async () => {
    const { findCommand } = await import("./registry.js")
    expect(findCommand("nonexistent")).toBeNull()
  })

  it("is case-insensitive", async () => {
    const { findCommand } = await import("./registry.js")
    expect(findCommand("SEARCH")).not.toBeNull()
    expect(findCommand("New")).not.toBeNull()
  })
})

describe("getCommandSuggestions", () => {
  it("returns all commands for empty input", async () => {
    const { getCommandSuggestions, COMMANDS } = await import("./registry.js")
    expect(getCommandSuggestions("")).toHaveLength(COMMANDS.length)
  })

  it("filters by partial id", async () => {
    const { getCommandSuggestions } = await import("./registry.js")
    const results = getCommandSuggestions("sear")
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some(c => c.id === "search")).toBe(true)
  })

  it("returns empty array for no matches", async () => {
    const { getCommandSuggestions } = await import("./registry.js")
    expect(getCommandSuggestions("zzz")).toEqual([])
  })
})


