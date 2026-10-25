import { describe, expect, it } from "vitest";
import {
  CONFIG_ERRORS,
  CONFIG_TAG,
  buildSyncPayload,
  checksumOf,
  decodeConfigBlock,
  encodeConfigBlock,
  measureSections,
  parseConfigBlocks,
  rawMessageText,
  redactSecrets,
  usesDefaultSystemPrompt,
} from "./config-sync.js";

const SOURCES = {
  settings: {
    activeSystemPromptId: "default",
    systemPrompt: "SHIPPED DEFAULT PROMPT",
    githubToken: "ghp_secret",
    theme: "dark",
    systemPromptBackupDone: true,
    systemPromptTemplateVersion: 16,
    downloadBehaviorVersion: 2,
    customSystemPrompts: [{ id: "p1", name: "Mine", content: "be terse" }],
  },
  cssSnippets: [{ id: "s1", css: "body{color:red}" }],
  skills: [{ id: "k1", name: "Skill" }],
  characters: [],
  memories: {},
  mcpServers: [{ id: "m1", serverUrl: "https://mcp.example", apiKey: "sk_live_1" }],
  projects: [],
  projectFiles: [],
  chatTags: {},
  savedItems: [],
};

describe("usesDefaultSystemPrompt", () => {
  it("treats a missing id as the default", () => {
    expect(usesDefaultSystemPrompt({})).toBe(true);
    expect(usesDefaultSystemPrompt(null)).toBe(true);
  });

  it("is false once a custom prompt is selected", () => {
    expect(usesDefaultSystemPrompt({ activeSystemPromptId: "p1" })).toBe(false);
  });
});

describe("buildSyncPayload", () => {
  it("drops the default system prompt and records the marker instead", () => {
    const { payload } = buildSyncPayload(SOURCES);

    expect(payload.systemPromptIsDefault).toBe(true);
    expect(payload.settings.systemPrompt).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("SHIPPED DEFAULT PROMPT");
  });

  it("carries a custom system prompt as text", () => {
    const { payload } = buildSyncPayload({
      ...SOURCES,
      settings: { ...SOURCES.settings, activeSystemPromptId: "p1", systemPrompt: "be terse" },
    });

    expect(payload.systemPromptIsDefault).toBe(false);
    expect(payload.settings.systemPrompt).toBe("be terse");
  });

  it("strips migration-only flags and the duplicated prompt list", () => {
    const { payload } = buildSyncPayload(SOURCES);

    expect(payload.settings.systemPromptBackupDone).toBeUndefined();
    expect(payload.settings.systemPromptTemplateVersion).toBeUndefined();
    expect(payload.settings.downloadBehaviorVersion).toBeUndefined();
    expect(payload.settings.customSystemPrompts).toBeUndefined();
    // ...but the prompt list still travels as its own section.
    expect(payload.customSystemPrompts).toHaveLength(1);
  });

  it("clears credentials when secrets are not requested", () => {
    const { payload, removedSecrets } = buildSyncPayload(SOURCES);

    expect(removedSecrets).toBe(2);
    expect(payload.settings.githubToken).toBe("");
    expect(payload.mcpServers[0].apiKey).toBe("");
    expect(payload.secretsRedacted).toBe(2);
    // The server entry itself survives — only the credential is blanked.
    expect(payload.mcpServers[0].serverUrl).toBe("https://mcp.example");
  });

  it("keeps credentials when the caller asked for them", () => {
    const { payload, removedSecrets } = buildSyncPayload(SOURCES, { includeSecrets: true });

    expect(removedSecrets).toBe(0);
    expect(payload.settings.githubToken).toBe("ghp_secret");
    expect(payload.mcpServers[0].apiKey).toBe("sk_live_1");
    expect(payload.secretsRedacted).toBeUndefined();
  });

  it("does not mutate the live settings object", () => {
    buildSyncPayload(SOURCES);
    expect(SOURCES.settings.githubToken).toBe("ghp_secret");
    expect(SOURCES.settings.systemPrompt).toBe("SHIPPED DEFAULT PROMPT");
  });
});

describe("buildSyncPayload skipSections", () => {
  it("omits a skipped section and reports it", () => {
    const { payload, skipped } = buildSyncPayload(
      { ...SOURCES, projectFiles: [{ id: "f1", content: "x" }] },
      { skipSections: ["projectFiles"] },
    );

    expect(payload.projectFiles).toBeUndefined();
    expect(skipped).toEqual(["projectFiles"]);
  });

  it("does not report a section that had nothing to skip", () => {
    const { skipped } = buildSyncPayload(
      { settings: SOURCES.settings },
      { skipSections: ["projectFiles"] },
    );

    expect(skipped).toEqual([]);
  });

  it("can drop the prompt list too", () => {
    const { payload } = buildSyncPayload(SOURCES, { skipSections: ["customSystemPrompts"] });

    expect(payload.customSystemPrompts).toBeUndefined();
  });
});

describe("measureSections", () => {
  it("lists sections largest first and ignores metadata", () => {
    const sizes = measureSections({
      version: 1,
      exportedAt: "2026-10-25T00:00:00.000Z",
      skills: [],
      savedItems: [{ content: "x".repeat(200) }],
      memories: { a: { value: "y" } },
    });

    expect(sizes.map((entry) => entry.key)).toEqual(["savedItems", "memories", "skills"]);
    expect(sizes[0].bytes).toBeGreaterThan(sizes[1].bytes);
  });

  it("returns nothing for junk input", () => {
    expect(measureSections(null)).toEqual([]);
    expect(measureSections(undefined)).toEqual([]);
  });
});

describe("redactSecrets", () => {
  it("leaves user content alone", () => {
    const { payload } = redactSecrets({
      settings: { githubToken: "x" },
      cssSnippets: [{ id: "s", css: ".a{password:1}" }],
      memories: { note: "my password is hunter2" },
    });

    expect(payload.cssSnippets[0].css).toBe(".a{password:1}");
    expect(payload.memories.note).toBe("my password is hunter2");
  });
});

describe("encodeConfigBlock / parseConfigBlocks / decodeConfigBlock", () => {
  it("round-trips a payload without a password", async () => {
    const { payload } = buildSyncPayload(SOURCES);
    const block = await encodeConfigBlock(payload);

    const parsed = parseConfigBlocks(block);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].attrs.enc).toBe("gz");
    expect(parsed[0].attrs.v).toBe("1");
    expect(parsed[0].attrs.sum).toBe(await checksumOf(JSON.stringify(payload)));

    const { payload: decoded, error } = await decodeConfigBlock(parsed[0]);
    expect(error).toBeUndefined();
    expect(decoded).toEqual(payload);
  });

  it("round-trips a payload with a password", async () => {
    const { payload } = buildSyncPayload(SOURCES, { includeSecrets: true });
    const block = await encodeConfigBlock(payload, { password: "correct horse" });

    const parsed = parseConfigBlocks(block);
    expect(parsed[0].attrs.enc).toBe("aes");
    // Ciphertext must not leak the credential.
    expect(parsed[0].body).not.toContain("ghp_secret");

    const { payload: decoded, error } = await decodeConfigBlock(parsed[0], {
      password: "correct horse",
    });
    expect(error).toBeUndefined();
    expect(decoded.settings.githubToken).toBe("ghp_secret");
  });

  it("asks for the password instead of failing silently", async () => {
    const block = await encodeConfigBlock({ version: 1, settings: {} }, { password: "pw" });
    const { error } = await decodeConfigBlock(parseConfigBlocks(block)[0]);
    expect(error).toBe(CONFIG_ERRORS.PASSWORD_REQUIRED);
  });

  it("reports a wrong password", async () => {
    const block = await encodeConfigBlock({ version: 1, settings: {} }, { password: "pw" });
    const { error } = await decodeConfigBlock(parseConfigBlocks(block)[0], { password: "nope" });
    expect(error).toBe(CONFIG_ERRORS.PASSWORD_WRONG);
  });

  it("detects a body that was altered in transit", async () => {
    const block = await encodeConfigBlock({ version: 1, settings: { theme: "dark" } });
    const parsed = parseConfigBlocks(block)[0];

    // Re-encode a different payload under the original checksum.
    const tampered = await encodeConfigBlock({ version: 1, settings: { theme: "light" } });
    const tamperedBlock = { ...parsed, body: parseConfigBlocks(tampered)[0].body };

    const { error } = await decodeConfigBlock(tamperedBlock);
    expect(error).toBe(CONFIG_ERRORS.CHECKSUM);
  });

  it("finds the block inside a message that also holds the instruction line", async () => {
    const block = await encodeConfigBlock({ version: 1, settings: {} });
    const text = [
      "<BetterDeepSeek>",
      "Transfer. Do not decode.",
      "</BetterDeepSeek>",
      block,
      "",
      "Syncing my settings.",
    ].join("\n");

    const parsed = parseConfigBlocks(text);
    expect(parsed).toHaveLength(1);
    expect((await decodeConfigBlock(parsed[0])).payload.settings).toEqual({});
  });

  it("keeps the body free of angle brackets so the injected regex stays safe", async () => {
    const block = await encodeConfigBlock({ version: 1, settings: { a: "<b>", c: ">" } });
    const body = parseConfigBlocks(block)[0].body;

    expect(body).not.toContain("<");
    expect(body).not.toContain(">");
    expect(block).toContain(`<${CONFIG_TAG}`);
  });

  it("rejects a newer format version rather than guessing", async () => {
    const block = await encodeConfigBlock({ version: 1, settings: {} });
    const parsed = parseConfigBlocks(block)[0];
    const { error } = await decodeConfigBlock({ ...parsed, attrs: { ...parsed.attrs, v: "99" } });

    expect(error).toBe(CONFIG_ERRORS.VERSION);
  });

  it("returns nothing for text without a block", () => {
    expect(parseConfigBlocks("just a message")).toEqual([]);
    expect(parseConfigBlocks("")).toEqual([]);
  });
});

describe("rawMessageText", () => {
  it("joins fragments without sanitising them", () => {
    const message = {
      fragments: [
        { type: "REQUEST", content: "<BDS:CONFIG v=\"1\">x</BDS:CONFIG>" },
        { type: "REQUEST", content: "hello" },
      ],
    };
    expect(rawMessageText(message)).toContain("<BDS:CONFIG");
    expect(rawMessageText(message)).toContain("hello");
  });

  it("falls back to the flat content field", () => {
    expect(rawMessageText({ content: "flat" })).toBe("flat");
    expect(rawMessageText(null)).toBe("");
  });
});
