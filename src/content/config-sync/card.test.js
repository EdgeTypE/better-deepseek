// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { indexConfigBlocks } from "./card.js";

function block(text = "backup") {
  return `<BDS:CONFIG v="1" enc="gz" bytes="10" sum="abc">${text}</BDS:CONFIG>`;
}

function userMessage(id, content) {
  return {
    message_id: id,
    role: "USER",
    fragments: [{ type: "REQUEST", content }],
  };
}

function assistantMessage(id, content = "Received.") {
  return {
    message_id: id,
    role: "ASSISTANT",
    fragments: [{ type: "RESPONSE", content }],
  };
}

describe("indexConfigBlocks", () => {
  it("anchors the block to the user message that carried it", () => {
    const records = indexConfigBlocks([
      userMessage(1, "hello"),
      assistantMessage(2),
      userMessage(3, `<BDS:CONFIG_NOTE>note</BDS:CONFIG_NOTE>\n${block()}\nSyncing my settings.`),
      assistantMessage(4),
    ]);

    expect(records).toHaveLength(1);
    // Second user message in the branch → DOM ordinal 1.
    expect(records[0].userIndex).toBe(1);
    expect(records[0].messageId).toBe("3");
    expect(records[0].block.body).toBe("backup");
  });

  it("counts user messages only, ignoring assistant turns", () => {
    const records = indexConfigBlocks([
      userMessage(1, "a"),
      assistantMessage(2),
      assistantMessage(3),
      userMessage(4, block()),
    ]);

    expect(records[0].userIndex).toBe(1);
  });

  it("keeps the newest block when a message holds more than one", () => {
    const records = indexConfigBlocks([
      userMessage(1, `${block("older")}\n${block("newer")}`),
    ]);

    expect(records).toHaveLength(1);
    expect(records[0].block.body).toBe("newer");
  });

  it("falls back to a positional key when the id is missing", () => {
    const records = indexConfigBlocks([{ role: "USER", content: block() }]);

    expect(records[0].messageId).toBeNull();
    expect(records[0].key).toBe("idx:0");
  });

  it("ignores assistant messages that quote a block", () => {
    const records = indexConfigBlocks([
      userMessage(1, "hello"),
      assistantMessage(2, block()),
    ]);

    expect(records).toEqual([]);
  });

  it("returns nothing for a conversation without blocks", () => {
    expect(indexConfigBlocks([userMessage(1, "hello"), assistantMessage(2)])).toEqual([]);
    expect(indexConfigBlocks(null)).toEqual([]);
  });
});
