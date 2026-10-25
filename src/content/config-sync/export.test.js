// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn(async () => true);
vi.mock("../auto.js", () => ({
  injectPureTextAndSend: (...args) => sendMock(...args),
}));

const { exportSettingsToChat, MAX_SYNC_BLOCK_CHARS } = await import("./export.js");
const { BRIDGE_EVENTS } = await import("../../lib/constants.js");
const { parseConfigBlocks, decodeConfigBlock } = await import("../../lib/config-sync.js");
const { default: state } = await import("../state.js");

function stagedBlocks() {
  const blocks = [];
  const listener = (event) => {
    const detail = typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail;
    blocks.push(String(detail?.block || ""));
  };
  window.addEventListener(BRIDGE_EVENTS.configSyncStage, listener);
  return { blocks, stop: () => window.removeEventListener(BRIDGE_EVENTS.configSyncStage, listener) };
}

beforeEach(() => {
  sendMock.mockClear();
  sendMock.mockImplementation(async () => true);
  state.settings = {
    theme: "dark",
    githubToken: "ghp_local",
    activeSystemPromptId: "default",
    systemPrompt: "SHIPPED",
    customSystemPrompts: [],
  };
  state.skills = [];
  state.characters = [];
  state.memories = {};
  state.mcpServers = [{ id: "m1", serverUrl: "https://mcp.example", apiKey: "sk_local" }];
  state.projects = [];
  state.projectFiles = [];
  state.chatTags = {};
  state.savedItems = [];
  state.cssSnippets = [];
});

describe("exportSettingsToChat", () => {
  it("stages a block and sends the short visible message", async () => {
    const { blocks, stop } = stagedBlocks();
    const result = await exportSettingsToChat();
    stop();

    expect(result.ok).toBe(true);
    expect(sendMock).toHaveBeenCalledOnce();
    expect(blocks).toHaveLength(1);

    const parsed = parseConfigBlocks(blocks[0]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].attrs.enc).toBe("gz");

    const { payload } = await decodeConfigBlock(parsed[0]);
    expect(payload.settings.theme).toBe("dark");
    expect(payload.systemPromptIsDefault).toBe(true);
  });

  it("leaves credentials out unless a passphrase protects them", async () => {
    const { blocks, stop } = stagedBlocks();
    await exportSettingsToChat({ includeSecrets: true }); // no password → ignored
    stop();

    const { payload } = await decodeConfigBlock(parseConfigBlocks(blocks[0])[0]);
    expect(payload.settings.githubToken).toBe("");
    expect(payload.mcpServers[0].apiKey).toBe("");
    expect(payload.secretsRedacted).toBe(2);
  });

  it("carries credentials inside the encrypted block when a passphrase is set", async () => {
    const { blocks, stop } = stagedBlocks();
    await exportSettingsToChat({ includeSecrets: true, password: "correct horse" });
    stop();

    const parsed = parseConfigBlocks(blocks[0])[0];
    expect(parsed.attrs.enc).toBe("aes");
    expect(blocks[0]).not.toContain("ghp_local");

    const { payload } = await decodeConfigBlock(parsed, { password: "correct horse" });
    expect(payload.settings.githubToken).toBe("ghp_local");
  });

  it("withdraws the staged block when the send never lands", async () => {
    sendMock.mockImplementation(async () => false);
    const { blocks, stop } = stagedBlocks();

    const result = await exportSettingsToChat();
    stop();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("send-failed");
    // Staged, then explicitly withdrawn — otherwise the backup would ride
    // along with whatever the user sends next.
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toBe("");
  });

  it("never carries project files — they are content, not settings", async () => {
    state.projectFiles = [
      { id: "f1", projectId: "p1", name: "big.txt", content: "x".repeat(500000) },
    ];

    const { blocks, stop } = stagedBlocks();
    const result = await exportSettingsToChat();
    stop();

    expect(result.ok).toBe(true);
    const { payload } = await decodeConfigBlock(parseConfigBlocks(blocks[0])[0]);
    expect(payload.projectFiles).toBeUndefined();
  });

  it("refuses an oversized backup before it reaches the composer", async () => {
    state.savedItems = [
      {
        id: "s1",
        // Poorly compressible on purpose.
        content: Array.from({ length: 20000 }, () => Math.random().toString(36)).join(""),
      },
    ];

    const { blocks, stop } = stagedBlocks();
    const result = await exportSettingsToChat();
    stop();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("too-large");
    expect(result.bytes).toBeGreaterThan(MAX_SYNC_BLOCK_CHARS);
    // The message has to name the culprit, otherwise the user cannot act on it.
    expect(result.breakdown?.[0]?.key).toBe("savedItems");
    expect(blocks).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
