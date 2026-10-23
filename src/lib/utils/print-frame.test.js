// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createPrintFrame, fillPrintDocument } from "./print-frame.js";

const HTML = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <title>Session Title</title>
  <style>.marker { color: rgb(1, 2, 3); }</style>
</head>
<body class="bds-body">
  <h1 class="session-title">Session Title</h1>
</body>
</html>`;

let frames = [];

function makeFrame() {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  frames.push(iframe);
  return iframe;
}

afterEach(() => {
  for (const frame of frames) frame.remove();
  frames = [];
  document.body.innerHTML = "";
});

describe("fillPrintDocument", () => {
  it("writes the document when document.open() is available", () => {
    const doc = makeFrame().contentWindow.document;
    const open = vi.spyOn(doc, "open");
    const write = vi.spyOn(doc, "write");
    const close = vi.spyOn(doc, "close");

    expect(fillPrintDocument(doc, HTML)).toBe("write");

    expect(open).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(HTML);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("falls back to DOM fill when document.open() is blocked by the browser", () => {
    const doc = makeFrame().contentWindow.document;
    // Firefox content scripts hit exactly this (#202).
    doc.open = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    const write = vi.spyOn(doc, "write");

    expect(fillPrintDocument(doc, HTML)).toBe("dom");

    expect(write).not.toHaveBeenCalled();
    expect(doc.documentElement.getAttribute("class")).toBe("dark");
    expect(doc.documentElement.getAttribute("lang")).toBe("en");
    expect(doc.body.getAttribute("class")).toBe("bds-body");
    expect(doc.head.querySelector("style")?.textContent).toContain(".marker");
    expect(doc.querySelector(".session-title")?.textContent).toBe("Session Title");
  });

  it("keeps bubbling unexpected failures", () => {
    const doc = makeFrame().contentWindow.document;
    doc.open = () => {
      throw new Error("boom");
    };

    expect(() => fillPrintDocument(doc, HTML)).toThrow("boom");
  });
});

describe("createPrintFrame", () => {
  it("appends a hidden, filled print frame", () => {
    const iframe = createPrintFrame(HTML);

    expect(iframe.id).toBe("bds-print-iframe");
    expect(iframe.parentNode).toBe(document.body);
    expect(iframe.style.position).toBe("fixed");
    expect(iframe.style.width).toBe("0px");
    expect(iframe.style.height).toBe("0px");
    expect(iframe.contentWindow.document.body.textContent).toContain("Session Title");
  });
});
