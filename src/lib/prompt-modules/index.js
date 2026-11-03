/**
 * On-demand prompt modules.
 *
 * A module is a block of tool documentation that is too large (or too niche)
 * to live in the main system prompt. The model requests one with
 * `<BDS:GET>module</BDS:GET>`; the extension injects the reference as a
 * follow-up message and the model continues the task with it in context.
 */

import { MIDI_PROMPT } from "./midi.js";
import { DOCX_SKILL } from "../office-skills/docx.js";
import { XLSX_SKILL } from "../office-skills/xlsx.js";
import { PPTX_SKILL } from "../office-skills/pptx.js";

/**
 * Rules shared by every office library. Kept out of the individual skill files
 * because all three repeat them in their own words.
 */
const OFFICE_SHARED = [
  "## Office document rules (shared)",
  "- The code runs in a browser sandbox and the library is already global.",
  "  Never use `import`, `require`, or redeclare it.",
  "- ALWAYS end with the library's save/write call — without it no file is produced.",
  "- Use template literals (backticks) for strings that contain quotes.",
  "- CRITICAL: only valid JavaScript inside the tag. No explanations, no chatter.",
].join("\n");

/** @typedef {{ id: string, label: string, content: string }} PromptModule */

/** @type {Record<string, { label: string, content: string }>} */
export const PROMPT_MODULES = {
  midi: {
    label: "MIDI music",
    content: MIDI_PROMPT,
  },
  docx: {
    label: "Word documents",
    content: `${OFFICE_SHARED}\n\n${DOCX_SKILL}`,
  },
  xlsx: {
    label: "Excel workbooks",
    content: `${OFFICE_SHARED}\n\n${XLSX_SKILL}`,
  },
  pptx: {
    label: "PowerPoint decks",
    content: `${OFFICE_SHARED}\n\n${PPTX_SKILL}`,
  },
  office: {
    label: "All office references",
    content: [OFFICE_SHARED, DOCX_SKILL, XLSX_SKILL, PPTX_SKILL].join("\n\n"),
  },
};

export const PROMPT_MODULE_IDS = Object.keys(PROMPT_MODULES);

/** Words a model tends to wrap around the module name. */
const ALIASES = {
  word: "docx",
  doc: "docx",
  docs: "docx",
  document: "docx",
  "word document": "docx",
  excel: "xlsx",
  xls: "xlsx",
  spreadsheet: "xlsx",
  sheet: "xlsx",
  workbook: "xlsx",
  powerpoint: "pptx",
  ppt: "pptx",
  presentation: "pptx",
  slide: "pptx",
  slides: "pptx",
  deck: "pptx",
  music: "midi",
  melody: "midi",
  song: "midi",
};

/**
 * Resolve a module name from whatever the model put in the tag.
 *
 * Accepts the bare id, aliases (`excel`, `word`, `presentation`), and the
 * noisy phrasings models produce (`system prompt midi`, `BDS: midi module`).
 * Tokens are scanned left to right; the first recognised one wins.
 *
 * @param {string} raw
 * @returns {PromptModule | null}
 */
export function resolvePromptModule(raw) {
  const text = String(raw || "")
    .toLowerCase()
    .replace(/<\/?bds:[^>]*>/g, " ")
    .trim();
  if (!text) return null;

  const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (PROMPT_MODULES[token]) {
      return { id: token, ...PROMPT_MODULES[token] };
    }
    if (ALIASES[token]) {
      const id = ALIASES[token];
      return { id, ...PROMPT_MODULES[id] };
    }

    // Two-word aliases ("word document", "power point").
    const pair = tokens.slice(i, i + 2).join(" ");
    if (ALIASES[pair]) {
      const id = ALIASES[pair];
      return { id, ...PROMPT_MODULES[id] };
    }
    if (pair === "power point") {
      return { id: "pptx", ...PROMPT_MODULES.pptx };
    }
  }

  return null;
}
