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
const RENDERABLE_TOOLS = new Set(["html", "latex", "visualizer", "pptx", "excel", "docx", "ask_question", "character_create", "auto:code_runner", "auto_code_result"]);

/**
 * Parse a raw message text for all BDS tags.
 */
export function parseBdsMessage(rawText, isSettled = false) {
  let text = String(rawText || "");

  // Intercept unclosed tags if the message is fully settled (AI stopped generating).
  // This prevents infinite "Working..." animations and lost tool output.
  if (isSettled) {
    const unclosedTags = [];
    const allTags = Array.from(text.matchAll(/<\/?BDS:([A-Za-z0-9_:]+)[^>]*>/gi));
    for (const match of allTags) {
      const isClose = match[0].startsWith('</');
      const tName = match[1].toLowerCase();
      
      // AUTO tags are background requests lacking standard rendering lifecycle
      if (tName.startsWith("auto") && tName !== "auto:code_runner") continue;

      if (!isClose) {
        unclosedTags.push(match[1]);
      } else {
        const idx = unclosedTags.map(t => t.toLowerCase()).lastIndexOf(tName);
        if (idx !== -1) {
          unclosedTags.splice(idx, 1);
        }
      }
    }
    
    // Auto-close anything left gracefully
    for (let i = unclosedTags.length - 1; i >= 0; i--) {
      text += `\n</BDS:${unclosedTags[i]}>\n`;
    }
  }

  const result = {
    containsControlTags: false,
    longWorkOpen: false,
    longWorkClose: false,
    renderableBlocks: [],
    createFiles: [],
    memoryWrites: [],
    characterCreates: [],
    askQuestions: [],
    autoRequests: {
      webFetch: [],
      githubFetch: [],
      twitterFetch: [],
      youtubeFetch: []
    },
    visibleText: text,
  };

  if (!/(<BDS:|<BetterDeepSeek>|Bds create file>)/i.test(text)) {
    return result;
  }

  // We have BDS tags, but do we have tags that should HIDE the original message?
  // AUTO tags should NOT hide the message, EXCEPT for AUTO:CODE_RUNNER which has a UI card.
  const hasHidingTags = /(<BDS:(?!AUTO:(?!CODE_RUNNER))[a-zA-Z0-9_:]+|<BetterDeepSeek>|Bds create file>)/i.test(text);
  result.containsControlTags = hasHidingTags;
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
    /<BDS:([A-Za-z0-9_:]+)([^>]*)>([\s\S]*?)<\/BDS:\1>/gi;
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
      const parsedMemory = parseMemoryWrite(content, attrs);
      if (parsedMemory) {
        result.memoryWrites.push(parsedMemory);
      }
    }

    if (name === "character_create") {
      result.characterCreates.push({
        name: attrs.name || "New Character",
        usage: attrs.usage || attrs.kullanim_alani || "",
        content: content
      });
    }

    if (name === "ask_question") {
      try {
        const questions = JSON.parse(content);
        if (Array.isArray(questions)) {
          result.askQuestions = questions;
        }
      } catch (e) {
        console.error("Failed to parse ask_question JSON:", e);
      }
    }
  }

  const autoWebFetchRegex = /<BDS:AUTO:REQUEST_WEB_FETCH>([\s\S]*?)<\/BDS:AUTO:REQUEST_WEB_FETCH>/gi;
  while ((match = autoWebFetchRegex.exec(text)) !== null) {
     const cleanUrl = String(match[1] || "").trim();
     if (cleanUrl) {
       result.autoRequests.webFetch.push(cleanUrl);
     }
  }

  const autoGitHubFetchRegex = /<BDS:AUTO:REQUEST_GITHUB_FETCH>([\s\S]*?)<\/BDS:AUTO:REQUEST_GITHUB_FETCH>/gi;
  while ((match = autoGitHubFetchRegex.exec(text)) !== null) {
     const cleanUrl = String(match[1] || "").trim();
     if (cleanUrl) {
       result.autoRequests.githubFetch.push(cleanUrl);
     }
  }

  const autoTwitterFetchRegex = /<BDS:AUTO:REQUEST_TWITTER_FETCH>([\s\S]*?)<\/BDS:AUTO:REQUEST_TWITTER_FETCH>/gi;
  while ((match = autoTwitterFetchRegex.exec(text)) !== null) {
     const cleanUrl = String(match[1] || "").trim();
     if (cleanUrl) {
       result.autoRequests.twitterFetch.push(cleanUrl);
     }
  }

  const autoYouTubeFetchRegex = /<BDS:AUTO:REQUEST_YOUTUBE_FETCH>([\s\S]*?)<\/BDS:AUTO:REQUEST_YOUTUBE_FETCH>/gi;
  while ((match = autoYouTubeFetchRegex.exec(text)) !== null) {
     const cleanUrl = String(match[1] || "").trim();
     if (cleanUrl) {
       result.autoRequests.youtubeFetch.push(cleanUrl);
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

  const selfClosingMemoryRegex = /<BDS:memory_write([^>]*)\/>/gi;
  while ((match = selfClosingMemoryRegex.exec(text)) !== null) {
    const attrs = parseTagAttributes(match[1] || "");
    const parsedMemory = parseMemoryWrite("", attrs);
    if (parsedMemory) {
      result.memoryWrites.push(parsedMemory);
    }
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

  // UNIVERSAL INTERFACE LOCK: Detect if ANY BDS tag is currently open (not closed)
  // This handles streaming for all tools (Visualizer, LongWork, etc.)
  const allBdsTags = Array.from(text.matchAll(/<BDS:([A-Za-z0-9_:]+)[^>]*>/gi));
  const allBdsCloseTags = Array.from(text.matchAll(/<\/BDS:([A-Za-z0-9_:]+)>/gi));

  // Determine if there's an open tag that hasn't been closed yet
  // We check if the last open tag has a corresponding close tag after it
  let streamingTagName = null;
  let streamingTagStartIdx = -1;

  // Simple heuristic: if number of open tags > number of close tags, we are streaming
  // Or more accurately: find the last open tag and see if there's a close tag for it later
  for (let i = allBdsTags.length - 1; i >= 0; i--) {
    const openTag = allBdsTags[i];
    const tagName = openTag[1].toLowerCase();
    
    // EXCEPTION: AUTO tags are background instructions/requests, 
    // they should never trigger the UI's "Working..." overlay.
    if (tagName.startsWith("auto") && tagName !== "auto:code_runner") continue;

    // Check if this specific tag name has a close tag appearing after this open tag
    const hasClose = allBdsCloseTags.some(ct => 
      ct[1].toLowerCase() === tagName && ct.index > openTag.index
    );

    if (!hasClose) {
      streamingTagName = tagName;
      streamingTagStartIdx = openTag.index;
      break; 
    }
  }

  result.isStreamingTool = streamingTagStartIdx !== -1;
  result.streamingTagName = streamingTagName;

  if (result.isStreamingTool) {
    // Cut off visibility at the start of the FIRST open tool tag
    // (In case there are multiple, though unlikely)
    result.visibleText = sanitizeVisibleText(text.substring(0, streamingTagStartIdx));
  }

  return result;
}
