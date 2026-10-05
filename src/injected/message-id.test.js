import { describe, expect, it } from "vitest";
import { findMessageId, findMessageIdInSse, isReplyStreamUrl } from "./message-id.js";

describe("findMessageId", () => {
  it("finds a top-level message_id", () => {
    expect(findMessageId({ message_id: "42" })).toBe("42");
  });

  it("finds a nested message_id at any depth", () => {
    expect(findMessageId({ data: { biz_data: { message_id: "7" } } })).toBe("7");
  });

  it("finds a message_id inside an array of chunks", () => {
    expect(findMessageId({ choices: [{ delta: {} }, { msg_id: "abc" }] })).toBe("abc");
  });

  it("accepts a numeric id and normalises it to a string", () => {
    expect(findMessageId({ message_id: 2 })).toBe("2");
  });

  it("ignores ids that are too generic to trust", () => {
    // `id` and `chat_session_id` are not the id of the reply being generated;
    // picking one of those would make auto-read speak the wrong message.
    expect(findMessageId({ id: "session-wide" })).toBeNull();
    expect(findMessageId({ chat_session_id: "session-wide" })).toBeNull();
    expect(findMessageId({ request_id: "req-1" })).toBeNull();
  });

  it("prefers a named message_id over a generic id in the same chunk", () => {
    expect(findMessageId({ id: "generic", message_id: "real" })).toBe("real");
  });

  it("ignores blank and non-scalar values", () => {
    expect(findMessageId({ message_id: "   " })).toBeNull();
    expect(findMessageId({ message_id: { nested: "x" } })).toBeNull();
    expect(findMessageId({ message_id: null })).toBeNull();
  });

  it("gives up on absurdly deep payloads instead of recursing forever", () => {
    let deep = { message_id: "buried" };
    for (let i = 0; i < 12; i++) deep = { nested: deep };
    expect(findMessageId(deep)).toBeNull();
  });

  it("survives non-objects", () => {
    expect(findMessageId(null)).toBeNull();
    expect(findMessageId("text")).toBeNull();
    expect(findMessageId(42)).toBeNull();
  });
});

describe("findMessageIdInSse", () => {
  const sse = (...chunks) =>
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("");

  it("pulls the id out of a streamed chunk", () => {
    const text = sse({ choices: [{ delta: { content: "hi" } }] }, { message_id: "12" });
    expect(findMessageIdInSse(text)).toBe("12");
  });

  it("lets the last reported id win", () => {
    // The finished message is addressed by the id the stream ends on.
    const text = sse({ message_id: "1" }, { message_id: "2" });
    expect(findMessageIdInSse(text)).toBe("2");
  });

  it("skips the [DONE] sentinel and non-JSON lines", () => {
    const text = `event: message\ndata: not json\n\ndata: [DONE]\n\n${sse({ message_id: "3" })}`;
    expect(findMessageIdInSse(text)).toBe("3");
  });

  it("returns null when the stream carries no id", () => {
    expect(findMessageIdInSse(sse({ choices: [{ delta: { content: "hi" } }] }))).toBeNull();
    expect(findMessageIdInSse("")).toBeNull();
    expect(findMessageIdInSse(null)).toBeNull();
  });
});

describe("isReplyStreamUrl", () => {
  it("accepts the endpoints that generate a reply", () => {
    expect(isReplyStreamUrl("https://chat.deepseek.com/api/v0/chat/completion")).toBe(true);
    expect(isReplyStreamUrl("/api/v0/chat/edit_message")).toBe(true);
  });

  it("rejects endpoints that list every message in the session", () => {
    // These carry a message_id per message; taking one would report an
    // arbitrary message as the reply that was just written.
    expect(isReplyStreamUrl("/api/v0/chat/history_messages?chat_session_id=x")).toBe(false);
    expect(isReplyStreamUrl("/api/v0/chat_session/fetch_page")).toBe(false);
    expect(isReplyStreamUrl("")).toBe(false);
    expect(isReplyStreamUrl(null)).toBe(false);
  });
});
