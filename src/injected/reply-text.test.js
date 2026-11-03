import { describe, expect, it } from "vitest";
import { extractReplyTextFromSse } from "./reply-text.js";

/** Join raw SSE event strings into one response body. */
const sse = (...events) => events.join("");

const append = (v) =>
  `data: ${JSON.stringify({ p: "response/fragments/-1/content", o: "APPEND", v })}\n\n`;

describe("extractReplyTextFromSse", () => {
  it("stitches the streamed APPEND chunks back into the full reply", () => {
    const text = sse(append("He"), append("llo"));
    expect(extractReplyTextFromSse(text).content).toBe("Hello");
  });

  it("includes the first fragment carried by the opening frame", () => {
    // DeepSeek sends the opening character inside fragments[0].content, then
    // appends the rest. Missing it would drop the first character of every
    // reply.
    const opening = `data: ${JSON.stringify({
      v: {
        response: {
          message_id: 2,
          fragments: [{ id: 2, type: "RESPONSE", content: "<" }],
        },
      },
    })}\n\n`;
    const text = sse(opening, append("BDS"));
    expect(extractReplyTextFromSse(text).content).toBe("<BDS");
  });

  it("preserves a backslash that CommonMark would later eat", () => {
    // The whole point of reading the stream: `\\/` survives here but becomes
    // `/` once the reply goes through marked. Losing it in this layer would
    // leave the corruption unfixable downstream.
    const text = sse(append("D:"), append("\\"), append("/"), append("test"));
    expect(extractReplyTextFromSse(text).content).toBe("D:\\/test");
  });

  it("reports the message id the stream opened with", () => {
    const opening = `data: ${JSON.stringify({
      v: { response: { message_id: 2, fragments: [] } },
    })}\n\n`;
    expect(extractReplyTextFromSse(opening).messageId).toBe("2");
  });

  it("ignores APPEND chunks aimed at other fields", () => {
    const other = `data: ${JSON.stringify({
      p: "response/status",
      o: "SET",
      v: "FINISHED",
    })}\n\n`;
    const text = sse(other, append("ok"));
    expect(extractReplyTextFromSse(text).content).toBe("ok");
  });

  it("tolerates non-JSON and sentinel lines", () => {
    const text = sse(
      "event: ready\n",
      "data: not json\n\n",
      "data: [DONE]\n\n",
      append("ok"),
    );
    expect(extractReplyTextFromSse(text).content).toBe("ok");
  });

  it("returns empty results for an empty stream", () => {
    expect(extractReplyTextFromSse("")).toEqual({ messageId: null, content: "" });
    expect(extractReplyTextFromSse(null)).toEqual({ messageId: null, content: "" });
  });
});
