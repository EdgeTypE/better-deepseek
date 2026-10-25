// @vitest-environment jsdom

/**
 * The card has to appear on the message that was just sent, before DeepSeek
 * writes its history cache — waiting for the cache is what made it show up
 * only after a refresh.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { nodes: [], sessionId: "s1", cache: { status: "missing" } };

vi.mock("svelte", () => ({
  mount: vi.fn(() => ({})),
  unmount: vi.fn(),
}));

vi.mock("../scanner.js", () => ({
  collectMessageNodes: () => state.nodes,
  detectMessageRole: (node) => node.getAttribute("data-role") || null,
}));

vi.mock("../tools/history-cache.js", () => ({
  getSessionIdFromUrl: () => state.sessionId,
  readCachedMessages: vi.fn(async () => state.cache),
}));

const { ensureConfigSyncCards, resetConfigSyncCards } = await import("./card.js");
const { rememberSentConfigBlock, takeLiveBlockFor } = await import("./live.js");

const BLOCK =
  '<BDS:CONFIG v="1" enc="gz" bytes="10" sum="abc">backup</BDS:CONFIG>';
const SENT_TEXT = "Syncing my Better DeepSeek settings to another device.";

function messageNode(role, text) {
  const node = document.createElement("div");
  node.setAttribute("data-role", role);
  node.textContent = text;
  document.body.appendChild(node);
  state.nodes.push(node);
  return node;
}

beforeEach(() => {
  resetConfigSyncCards();
  document.body.innerHTML = "";
  state.nodes = [];
  state.sessionId = "s1";
  state.cache = { status: "missing" };
});

describe("live block", () => {
  it("waits for the sent message instead of using the previous turn", () => {
    const previous = messageNode("user", "an older question");
    messageNode("assistant", "an older answer");
    rememberSentConfigBlock(BLOCK, { visibleText: SENT_TEXT });

    // The bubble is not on the page yet: the newest user message is the old one.
    ensureConfigSyncCards(2);
    expect(previous.querySelector(".bds-config-sync-host")).toBeNull();
    expect(document.querySelector(".bds-config-sync-host")).toBeNull();

    const sent = messageNode("user", SENT_TEXT);
    ensureConfigSyncCards(3);

    expect(sent.querySelector(".bds-config-sync-host")).toBeTruthy();
  });

  it("mounts once even though the scanner keeps running", () => {
    const sent = messageNode("user", SENT_TEXT);
    rememberSentConfigBlock(BLOCK, { visibleText: SENT_TEXT });

    ensureConfigSyncCards(1);
    ensureConfigSyncCards(1);
    ensureConfigSyncCards(1);

    expect(document.querySelectorAll(".bds-config-sync-host")).toHaveLength(1);
    expect(sent.querySelector(".bds-config-sync-host")).toBeTruthy();
  });

  it("drops a block the user carried into another conversation", () => {
    messageNode("user", "unrelated");
    rememberSentConfigBlock(BLOCK, { visibleText: SENT_TEXT });

    state.sessionId = "s2";
    messageNode("user", SENT_TEXT);
    ensureConfigSyncCards(2);

    expect(document.querySelector(".bds-config-sync-host")).toBeNull();
  });

  it("pins the session id a new chat only gets after the first message", () => {
    state.sessionId = null;
    rememberSentConfigBlock(BLOCK, { visibleText: SENT_TEXT });
    state.sessionId = "fresh";

    expect(takeLiveBlockFor("fresh")).not.toBeNull();
  });

  it("re-mounts when the client replaces the message node", () => {
    const sent = messageNode("user", SENT_TEXT);
    rememberSentConfigBlock(BLOCK, { visibleText: SENT_TEXT });
    ensureConfigSyncCards(1);

    // A re-render that swaps the node drops the host with it.
    sent.remove();
    state.nodes = state.nodes.filter((node) => node !== sent);
    const replaced = messageNode("user", SENT_TEXT);
    ensureConfigSyncCards(2);

    expect(replaced.querySelector(".bds-config-sync-host")).toBeTruthy();
  });

  it("hands over to the history cache once it holds the same block", async () => {
    messageNode("user", SENT_TEXT);
    rememberSentConfigBlock(BLOCK, { visibleText: SENT_TEXT });
    ensureConfigSyncCards(1);
    // Let the first (empty) cache read finish, or the next call is skipped.
    await new Promise((resolve) => setTimeout(resolve, 0));

    state.cache = {
      status: "hit",
      chatMessages: [
        {
          message_id: 1,
          role: "USER",
          fragments: [{ type: "REQUEST", content: `${BLOCK}\n${SENT_TEXT}` }],
        },
      ],
    };
    // A new node count also clears the cache-retry throttle.
    ensureConfigSyncCards(2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Parked copy released: the cache is now the source for this message.
    expect(takeLiveBlockFor("s1")).toBeNull();
  });
});
