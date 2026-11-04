import { describe, expect, it } from "vitest";

import { DEFAULT_SYSTEM_PROMPT } from "./constants.js";
import {
  BUILTIN_SYSTEM_PROMPT_ENTRY_ID,
  isBuiltinSystemPromptEntry,
  syncBuiltinSystemPromptEntries,
} from "./system-prompt-entries.js";

const SHIPPED = "You are Better DeepSeek. New core prompt with <BDS:midi>.";
const PREVIOUS = "You are Better DeepSeek. Old core prompt without MIDI.";

function coreEntry(overrides = {}) {
  return {
    id: BUILTIN_SYSTEM_PROMPT_ENTRY_ID,
    name: "Default",
    content: PREVIOUS,
    enabled: true,
    schedule: { type: "first", everyNTurns: 1 },
    ...overrides,
  };
}

describe("syncBuiltinSystemPromptEntries", () => {
  it("refreshes a stale built-in entry without touching its schedule", () => {
    const custom = { id: "sp_mine", name: "Mine", content: "be terse", enabled: true };
    const result = syncBuiltinSystemPromptEntries(
      [coreEntry({ builtin: true }), custom],
      { shippedPrompt: SHIPPED },
    );

    expect(result[0]).toEqual(coreEntry({ builtin: true, content: SHIPPED }));
    expect(result[1]).toBe(custom);
  });

  it("never overwrites an entry the user edited", () => {
    const edited = coreEntry({ builtin: false, content: "My own rules" });
    const result = syncBuiltinSystemPromptEntries([edited], { shippedPrompt: SHIPPED });

    expect(result[0]).toBe(edited);
    expect(result[0].content).toBe("My own rules");
  });

  it("adopts an untouched legacy copy when it matches the stored prompt", () => {
    const legacy = coreEntry();
    const result = syncBuiltinSystemPromptEntries([legacy], {
      shippedPrompt: SHIPPED,
      storedPrompt: PREVIOUS,
    });

    expect(result[0].builtin).toBe(true);
    expect(result[0].content).toBe(SHIPPED);
  });

  it("adopts a legacy copy even after the single prompt was already migrated", () => {
    const legacy = coreEntry();
    const result = syncBuiltinSystemPromptEntries([legacy], {
      shippedPrompt: SHIPPED,
      storedPrompt: SHIPPED,
    });

    expect(result[0].builtin).toBe(true);
    expect(result[0].content).toBe(SHIPPED);
  });

  it("leaves a user-authored legacy entry untouched", () => {
    const legacy = coreEntry({ content: "Speak like a pirate." });
    const result = syncBuiltinSystemPromptEntries([legacy], { shippedPrompt: SHIPPED });

    expect(result[0].content).toBe("Speak like a pirate.");
    expect(result[0].builtin).toBe(false);
  });

  it("is idempotent and defaults to this build's core prompt", () => {
    const once = syncBuiltinSystemPromptEntries([coreEntry({ builtin: true })]);
    expect(once[0].content).toBe(DEFAULT_SYSTEM_PROMPT.trim());

    const twice = syncBuiltinSystemPromptEntries(once);
    expect(twice[0]).toBe(once[0]);
  });

  it("tolerates missing entries", () => {
    expect(syncBuiltinSystemPromptEntries(undefined)).toEqual([]);
    expect(isBuiltinSystemPromptEntry(coreEntry({ builtin: true }))).toBe(true);
    expect(isBuiltinSystemPromptEntry(coreEntry())).toBe(false);
  });
});
