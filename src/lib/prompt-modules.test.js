import { describe, expect, it } from "vitest";
import { DEFAULT_SYSTEM_PROMPT } from "./constants.js";
import {
  PROMPT_MODULES,
  PROMPT_MODULE_IDS,
  resolvePromptModule,
} from "./prompt-modules/index.js";

describe("prompt module registry", () => {
  it("exposes midi and the office modules", () => {
    expect(PROMPT_MODULE_IDS).toEqual(
      expect.arrayContaining(["midi", "docx", "xlsx", "pptx", "office"]),
    );
  });

  it("keeps the full midi notation reference out of the main prompt", () => {
    const midi = PROMPT_MODULES.midi.content;

    expect(midi).toContain("tempo:");
    expect(midi).toContain("<BDS:midi>");
    expect(midi).toContain("STRICT SYNTAX");
  });

  it("bundles the library API of each office format", () => {
    expect(PROMPT_MODULES.docx.content).toContain("DOCX.save");
    expect(PROMPT_MODULES.xlsx.content).toContain("XLSX.writeFile");
    expect(PROMPT_MODULES.pptx.content).toContain("pptx.writeFile");
  });

  it("keeps the when-to-use guidance the main prompt used to carry", () => {
    for (const id of ["docx", "xlsx", "pptx"]) {
      expect(PROMPT_MODULES[id].content).toContain("WHEN TO USE:");
      expect(PROMPT_MODULES[id].content).toContain("DO NOT USE for:");
    }
  });

  it("keeps the quote-escaping rule for PptxGenJS", () => {
    expect(PROMPT_MODULES.pptx.content).toContain("escape inner quotes with a backslash");
  });

  it("carries the office when-to-use guidance in the main prompt too", () => {
    for (const heading of ["<BDS:pptx>:", "<BDS:excel>:", "<BDS:docx>:"]) {
      expect(DEFAULT_SYSTEM_PROMPT).toContain(heading);
    }
    expect(DEFAULT_SYSTEM_PROMPT).toContain("DO NOT USE for:");
    expect(DEFAULT_SYSTEM_PROMPT).toContain("✗ Plain text tables (use markdown).");
    expect(DEFAULT_SYSTEM_PROMPT).toContain("✗ Simple text snippets (use markdown).");
  });

  it("office carries all three references in one module", () => {
    const office = PROMPT_MODULES.office.content;

    expect(office).toContain("DOCX.save");
    expect(office).toContain("XLSX.writeFile");
    expect(office).toContain("pptx.writeFile");
  });
});

describe("resolvePromptModule", () => {
  it("resolves the bare id", () => {
    expect(resolvePromptModule("midi")).toMatchObject({ id: "midi" });
    expect(resolvePromptModule("  DOCX  ")).toMatchObject({ id: "docx" });
  });

  it("tolerates the phrasing models wrap around the name", () => {
    expect(resolvePromptModule("system prompt midi")).toMatchObject({ id: "midi" });
    expect(resolvePromptModule("BDS:get office module")).toMatchObject({ id: "office" });
    expect(resolvePromptModule("<BDS:GET>pptx</BDS:GET>")).toMatchObject({ id: "pptx" });
  });

  it("maps common aliases to their library", () => {
    expect(resolvePromptModule("excel")).toMatchObject({ id: "xlsx" });
    expect(resolvePromptModule("spreadsheet")).toMatchObject({ id: "xlsx" });
    expect(resolvePromptModule("word document")).toMatchObject({ id: "docx" });
    expect(resolvePromptModule("power point")).toMatchObject({ id: "pptx" });
    expect(resolvePromptModule("presentation")).toMatchObject({ id: "pptx" });
    expect(resolvePromptModule("melody")).toMatchObject({ id: "midi" });
  });

  it("returns null for unknown modules", () => {
    expect(resolvePromptModule("pdf")).toBeNull();
    expect(resolvePromptModule("")).toBeNull();
    expect(resolvePromptModule(null)).toBeNull();
  });
});
