/**
 * Main BDS message parser.
 *
 * Parses raw message text and extracts:
 * - Control tags (LONG_WORK open/close)
 * - Renderable tool blocks (HTML, LaTeX, Python)
 * - create_file entries
 * - memory_write entries
 * - Sanitized visible text
 */

import {
  parseTagAttributes,
  normalizeTaggedCodeContent,
} from "./tag-parser.js";
import { parseMemoryWrite } from "./memory-parser.js";
import { sanitizeVisibleText } from "./text-sanitizer.js";

// Tool renderers that have visual cards
const RENDERABLE_TOOLS = new Set(["html", "latex", "run_python_embed", "visualizer"]);

/**
 * Parse a raw message text for all BDS tags.
 */
export function parseBdsMessage(rawText) {
  const text = String(rawText || "");
  const result = {
    containsControlTags: false,
    longWorkOpen: false,
    longWorkClose: false,
    renderableBlocks: [],
    createFiles: [],
    memoryWrites: [],
    visibleText: text,
  };

  if (!/(<BDS:|<BetterDeepSeek>|Bds create file>)/i.test(text)) {
    return result;
  }

  result.containsControlTags = true;
  result.longWorkOpen = /<BDS:LONG_WORK>/i.test(text);
  result.longWorkClose = /<\/BDS:LONG_WORK>/i.test(text);

  // Parse create_file pair tags independently so nested files inside LONG_WORK are captured.
  const createFilePairRegex =
    /<BDS:create_file([^>]*)>([\s\S]*?)<\/BDS:create_file>/gi;
  let match;
  while ((match = createFilePairRegex.exec(text)) !== null) {
    const attrs = parseTagAttributes(match[1] || "");
    const fileName = attrs.fileName || attrs.filename || attrs.path;
    if (!fileName) {
      continue;
    }
    const content = normalizeTaggedCodeContent(
      String(match[2] || ""),
      "create_file"
    );
    result.createFiles.push({ fileName, content });
  }

  const pairTagRegex =
    /<BDS:([A-Za-z0-9_]+)([^>]*)>([\s\S]*?)<\/BDS:\1>/gi;
  match = null;
  while ((match = pairTagRegex.exec(text)) !== null) {
    const name = String(match[1] || "").toLowerCase();
    const attrs = parseTagAttributes(match[2] || "");
    const content = normalizeTaggedCodeContent(
      String(match[3] || ""),
      name
    );

    if (RENDERABLE_TOOLS.has(name)) {
      result.renderableBlocks.push({ name, attrs, content });
    }

    if (name === "memory_write") {
      const parsedMemory = parseMemoryWrite(content);
      if (parsedMemory) {
        result.memoryWrites.push(parsedMemory);
      }
    }
  }

  const selfClosingCreateRegex = /<BDS:create_file([^>]*)\/>/gi;
  while ((match = selfClosingCreateRegex.exec(text)) !== null) {
    const attrs = parseTagAttributes(match[1] || "");
    const fileName = attrs.fileName || attrs.filename || attrs.path;
    if (!fileName) {
      continue;
    }
    const content = normalizeTaggedCodeContent(
      String(attrs.content || ""),
      "create_file"
    );
    result.createFiles.push({ fileName, content });
  }

  const plainCreateRegex =
    /Bds create file>\s*fileName\s*=\s*"([^"]+)"\s*content\s*=\s*"([\s\S]*?)"/gi;
  while ((match = plainCreateRegex.exec(text)) !== null) {
    result.createFiles.push({
      fileName: String(match[1] || "file.txt"),
      content: normalizeTaggedCodeContent(
        String(match[2] || ""),
        "create_file"
      ),
    });
  }

  result.visibleText = sanitizeVisibleText(text);
  return result;
}
