import { XLSX_SKILL } from "./xlsx.js";
import { PPTX_SKILL } from "./pptx.js";
import { DOCX_SKILL } from "./docx.js";

const OFFICE_KEYWORDS = [
  {
    name: "xlsx",
    keywords: ["excel", "spreadsheet", "xlsx", "xls", "sheet", "tabular data", "workbook", "cells", ".xlsx"],
    skill: XLSX_SKILL,
  },
  {
    name: "pptx",
    keywords: ["powerpoint", "presentation", "slide", "pptx", ".pptx", "slideshow", "deck", "power point"],
    skill: PPTX_SKILL,
  },
  {
    name: "docx",
    keywords: ["word", "document", "docx", "msword", "word document", "doc", ".docx", "letter", "report"],
    skill: DOCX_SKILL,
  },
];

/**
 * Detect which office skills are relevant based on the user prompt.
 * Returns an array of matched skill names (e.g., ["xlsx", "pptx"]).
 */
export function detectOfficeSkillNames(userPrompt) {
  if (!userPrompt || typeof userPrompt !== "string") return [];
  const lower = userPrompt.toLowerCase();
  const matched = [];

  for (const entry of OFFICE_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        matched.push(entry.name);
        break;
      }
    }
  }

  return matched;
}

/**
 * Build a `<BetterDeepSeek>` block containing the relevant office library
 * skill documentation based on the user's prompt.
 */
export function buildOfficeSkillsBlock(userPrompt) {
  const skillNames = detectOfficeSkillNames(userPrompt);
  if (!skillNames.length) return "";

  const blocks = [];
  for (const name of skillNames) {
    const entry = OFFICE_KEYWORDS.find((e) => e.name === name);
    if (entry) {
      blocks.push(entry.skill);
    }
  }

  if (!blocks.length) return "";

  return [
    "<BetterDeepSeek>",
    "[OFFICE SKILL] The user wants to create an office document. Below is the API reference for the required library:",
    "",
    blocks.join("\n\n"),
    "</BetterDeepSeek>",
  ].join("\n");
}
