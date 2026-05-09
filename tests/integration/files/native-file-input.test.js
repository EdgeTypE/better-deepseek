// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { openNativeFilePicker } from "../../../src/content/files/native-file-input.js";

function createNativeInput() {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  return input;
}

describe("openNativeFilePicker", () => {
  it("clicks the native input without changing multiple by default", () => {
    const input = createNativeInput();
    input.click = vi.fn(() => {
      expect(input.multiple).toBe(true);
    });

    openNativeFilePicker(input);

    expect(input.click).toHaveBeenCalledOnce();
    expect(input.multiple).toBe(true);
  });

  it("temporarily disables multiple when single-file mode is preferred", () => {
    const input = createNativeInput();
    input.click = vi.fn(() => {
      expect(input.multiple).toBe(false);
    });

    openNativeFilePicker(input, { preferSingle: true });

    expect(input.click).toHaveBeenCalledOnce();
    expect(input.multiple).toBe(true);
  });
});
