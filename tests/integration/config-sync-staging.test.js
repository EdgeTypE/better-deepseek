// @vitest-environment jsdom

/**
 * End-to-end check of the staging path in the injected world.
 *
 * The block only reaches the model if the event name the content script
 * dispatches is the same one the injected listener registered on. A mismatch
 * is silent — the listener attaches to `undefined` and the payload goes out
 * untouched — which is exactly what happened once already.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BRIDGE_EVENTS } from "../../src/lib/constants.js";

const BLOCK = [
  '<BDS:CONFIG v="1" enc="gz" bytes="42" sum="deadbeefdeadbeef">',
  "H4sIAAAAAAAAA6tWKkktLlGyUjA0MDAwqgUAAAD//wMA",
  "</BDS:CONFIG>",
].join("\n");

/** Request bodies the patched fetch handed to the real transport. */
const sentBodies = [];

beforeAll(async () => {
  // Installed before the module patches window.fetch, so the patch wraps this.
  window.fetch = async (_input, init) => {
    sentBodies.push(String(init?.body || ""));
    return new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  await import("../../src/injected/index.js");
});

beforeEach(() => {
  sentBodies.length = 0;
});

function dispatchStage(block) {
  window.dispatchEvent(
    new CustomEvent(BRIDGE_EVENTS.configSyncStage, {
      detail: JSON.stringify({ block }),
    }),
  );
}

/**
 * The captured body is a JSON string, so the block's attribute quotes arrive
 * escaped (`v=\"1\"`). Compare against the decoded message text instead of
 * matching on the raw body.
 */
function messageTextOf(body) {
  const parsed = JSON.parse(body);
  return (parsed.messages || [])
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .join("\n");
}

async function sendMessage(text) {
  await window.fetch("/api/v0/chat/completion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_session_id: "conv_staging",
      messages: [{ role: "user", content: text }],
    }),
  });
  return sentBodies[sentBodies.length - 1] || "";
}

describe("settings transfer staging", () => {
  it("puts the staged block into the next request body", async () => {
    dispatchStage(BLOCK);
    const text = messageTextOf(await sendMessage("Syncing my settings."));

    expect(text).toContain('<BDS:CONFIG v="1"');
    expect(text).toContain("Syncing my settings.");
  });

  it("sends it exactly once", async () => {
    dispatchStage(BLOCK);
    const first = messageTextOf(await sendMessage("first"));
    const second = messageTextOf(await sendMessage("second"));

    expect(first).toContain("<BDS:CONFIG");
    expect(second).not.toContain("<BDS:CONFIG");
  });

  it("withdraws a staged block when the content script clears it", async () => {
    dispatchStage(BLOCK);
    dispatchStage("");
    const text = messageTextOf(await sendMessage("never mind"));

    expect(text).not.toContain("<BDS:CONFIG");
  });
});
