import { describe, expect, it, vi } from "vitest";
import { base64ToBlob, buildTimestamp, escapeHtml, makeId } from "./helpers.js";

describe("makeId", () => {
  it("uses crypto.randomUUID when available", () => {
    const randomUUID = vi.fn(() => "uuid-value");
    vi.stubGlobal("crypto", { randomUUID });

    expect(makeId()).toBe("uuid-value");
  });

  it("falls back to a timestamp-based id", () => {
    vi.stubGlobal("crypto", {});
    vi.spyOn(Date, "now").mockReturnValue(123);
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    expect(makeId()).toBe("id-123-8");
  });
});

describe("escapeHtml", () => {
  it("escapes all HTML-sensitive characters", () => {
    expect(escapeHtml(`<div class="x">'&"</div>`)).toBe(
      "&lt;div class=&quot;x&quot;&gt;&#39;&amp;&quot;&lt;/div&gt;",
    );
  });
});

describe("buildTimestamp", () => {
  it("returns a compact local timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T03:04:05Z"));

    expect(buildTimestamp()).toMatch(/^\d{8}-\d{6}$/);
  });
});

describe("base64ToBlob", () => {
  it("decodes base64 text into a blob", async () => {
    const blob = base64ToBlob("SGVsbG8=", "text/plain");

    expect(blob.type).toBe("text/plain");
    expect(await blob.text()).toBe("Hello");
  });

  it("uses a binary fallback mime type", () => {
    const blob = base64ToBlob("", "");
    expect(blob.type).toBe("application/octet-stream");
  });
});
