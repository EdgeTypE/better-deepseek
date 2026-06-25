// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import state from "../../src/content/state.js"
import { resetAppState } from "../helpers/app-state.js"

const readerMocks = vi.hoisted(() => ({
  searchWeb: vi.fn(),
  injectPureTextAndSend: vi.fn(),
  exportSession: vi.fn(),
  performCompress: vi.fn(),
  performSummarize: vi.fn(),
}))

vi.mock("../../src/content/files/search-reader.js", () => ({ searchWeb: readerMocks.searchWeb }))
vi.mock("../../src/content/auto.js", () => ({ injectPureTextAndSend: readerMocks.injectPureTextAndSend, findChatEditor: vi.fn() }))
vi.mock("../../src/content/tools/exporter.js", () => ({ exportSession: readerMocks.exportSession }))
// context-handoff.js is NOT mocked — the executor tests don't call its functions,
// and the context-handoff tests need the real module. Its dependency injectPureTextAndSend
// is already mocked globally.

async function importExecutor() {
  return (await import("../../src/content/commands/executor.js"))
}

describe("tryExecuteRawInput", () => {
  beforeEach(() => {
    resetAppState()
    Object.values(readerMocks).forEach(m => m.mockReset())
  })

  it("returns false for non-command input", { timeout: 20000 }, async () => {
    const { tryExecuteRawInput } = await importExecutor()
    expect(tryExecuteRawInput("hello")).toBe(false)
  })

  it("returns false for unknown command", async () => {
    state.ui = { showToast: vi.fn() }
    const { tryExecuteRawInput } = await importExecutor()
    const result = tryExecuteRawInput("/zzz_not_a_command")
    expect(result).toBe(false)
    expect(state.ui.showToast).toHaveBeenCalledWith(expect.stringContaining("Unknown command"))
  })

  it("executes built-in command with valid args", async () => {
    readerMocks.searchWeb.mockResolvedValue({ file: new File(["result"], "search.md", { type: "text/markdown" }) })
    state.ui = { showToast: vi.fn() }
    state.settings.githubToken = ""
    const { tryExecuteRawInput } = await importExecutor()
    const result = tryExecuteRawInput("/search test query")
    expect(result).toBe(true)
  })

  it("shows validation error for invalid args", async () => {
    state.ui = { showToast: vi.fn() }
    const { tryExecuteRawInput } = await importExecutor()
    const result = tryExecuteRawInput("/search")
    expect(result).toBe(false)
    expect(state.ui.showToast).toHaveBeenCalledWith(expect.stringContaining("Usage"))
  })

  it("returns false for missing snippetId in custom mapping", async () => {
    state.ui = { showToast: vi.fn() }
    state.commands.customMappings = { mycmd: "nonexistent-id" }
    state.savedItems = [{ id: "other-id", content: "hello" }]
    const { tryExecuteRawInput } = await importExecutor()
    const result = tryExecuteRawInput("/mycmd")
    expect(result).toBe(false)
    expect(state.ui.showToast).toHaveBeenCalledWith(expect.stringContaining("Unknown command"))
  })

  it("executes snippet command with valid mapping", async () => {
    readerMocks.injectPureTextAndSend.mockResolvedValue(true)
    state.commands.customMappings = { greet: "snippet-1" }
    state.savedItems = [{ id: "snippet-1", content: "Hello world" }]
    const { tryExecuteRawInput } = await importExecutor()
    const result = tryExecuteRawInput("/greet")
    expect(result).toBe(true)
    expect(readerMocks.injectPureTextAndSend).toHaveBeenCalledWith("Hello world")
  })

  it("executes snippet command with extra text appended", async () => {
    readerMocks.injectPureTextAndSend.mockResolvedValue(true)
    state.commands.customMappings = { greet: "snippet-1" }
    state.savedItems = [{ id: "snippet-1", content: "Hello world" }]
    const { tryExecuteRawInput } = await importExecutor()
    const result = tryExecuteRawInput('/greet with extra note')
    expect(result).toBe(true)
    expect(readerMocks.injectPureTextAndSend).toHaveBeenCalledWith(expect.stringContaining("extra note"))
  })

  it("built-in command takes priority over snippet with same name", async () => {
    state.ui = { showToast: vi.fn() }
    state.commands.customMappings = { search: "snippet-1" }
    const { tryExecuteRawInput } = await importExecutor()
    const result = tryExecuteRawInput("/search")
    expect(result).toBe(false)
    expect(readerMocks.searchWeb).not.toHaveBeenCalled()
    expect(state.ui.showToast).toHaveBeenCalledWith(expect.stringContaining("Usage"))
  })

  it("fast consecutive commands do not interfere", async () => {
    readerMocks.searchWeb.mockResolvedValue({ file: new File(["a"], "a.md", { type: "text/markdown" }) })
    const { tryExecuteRawInput } = await importExecutor()

    tryExecuteRawInput("/search first")
    tryExecuteRawInput("/search second")

    expect(readerMocks.searchWeb).toHaveBeenCalledTimes(2)
  })
})

describe("context-handoff", () => {
  beforeEach(() => {
    resetAppState()
    sessionStorage.clear()
    document.body.innerHTML = ""
  })

  it("checkPendingHandoff skips when no stored handoff", async () => {
    const { checkPendingHandoff } = await import("../../src/content/commands/context-handoff.js")
    expect(() => checkPendingHandoff()).not.toThrow()
  })

  it("checkPendingHandoff reads modelType from stored handoff", async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `<textarea id="chat-input"></textarea>`
    sessionStorage.setItem("bds:pending-handoff", JSON.stringify({ handoff: "test handoff", modelType: "expert" }))
    readerMocks.injectPureTextAndSend.mockResolvedValue(true)

    const { checkPendingHandoff } = await import("../../src/content/commands/context-handoff.js")
    checkPendingHandoff()
    await vi.advanceTimersByTimeAsync(100)

    expect(readerMocks.injectPureTextAndSend).toHaveBeenCalled()
    expect(sessionStorage.getItem("bds:pending-handoff")).toBeNull()
    vi.useRealTimers()
  })

  it("performSummarize shows toast when no messages", async () => {
    state.ui = { showToast: vi.fn() }
    const { performSummarize } = await import("../../src/content/commands/context-handoff.js")
    await performSummarize()
    expect(state.ui.showToast).toHaveBeenCalledWith(expect.stringContaining("No messages"))
  })

  it("performCompress shows toast when no messages", async () => {
    state.ui = { showToast: vi.fn() }
    const { performCompress } = await import("../../src/content/commands/context-handoff.js")
    await performCompress()
    expect(state.ui.showToast).toHaveBeenCalledWith(expect.stringContaining("No messages"))
  })
})
