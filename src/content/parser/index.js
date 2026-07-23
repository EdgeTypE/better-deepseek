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
import { parseLooseJson } from "./json-repair.js";
import { parseMemoryWrite } from "./memory-parser.js";
import { sanitizeVisibleText } from "./text-sanitizer.js";
import { extractHttpUrl } from "../../lib/utils/url-normalizer.js";

// Tool renderers that have visual cards
const RENDERABLE_TOOLS = new Set(["html", "latex", "visualizer", "pptx", "excel", "docx", "ask_question", "character_create", "skill_create", "auto:code_runner", "auto_code_result", "auto:request_web_fetch", "auto:request_github_fetch", "auto:search", "auto:mcp", "deep_research_plan", "deep_research_status", "deep_research_report", "deep_research_step_done", "image", "todo"]);

function normalizeAutoHttpTarget(value) {
  return extractHttpUrl(value);
}

function normalizeAutoTextTarget(value) {
  const input = String(value || "").trim();
  const linkedUrl = extractHttpUrl(input);
  return linkedUrl || input;
}

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(\s*https?:\/\/[^)\s]+\s*\)/gi;

function stripMarkdownLinks(text) {
  return String(text || "").replace(MARKDOWN_LINK_RE, (_, linkText) => linkText);
}

/**
 * Compute ranges of fenced code blocks and inline code in text.
 * Used to exclude BDS tags inside code blocks from tool processing.
 */
function computeCodeBlockRanges(text) {
  const ranges = [];
  let match;

  // Fenced code blocks: ```lang ... ```
  const fenceRe = /```(?:[a-zA-Z0-9_+.-]*)[ \t]*\r?\n?([\s\S]*?)```/g;
  while ((match = fenceRe.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }

  // Inline code: `...` (skip if already inside a fenced block — inline
  // can't span fence boundaries because `[^`\n]+` excludes newlines)
  const inlineRe = /`([^`\n]+)`/g;
  while ((match = inlineRe.exec(text)) !== null) {
    const { index } = match;
    if (!ranges.some(r => index >= r.start && index < r.end)) {
      const end = index + match[0].length;
      ranges.push({ start: index, end });
    }
  }

  return ranges;
}

/**
 * Parse a raw message text for all BDS tags.
 */
export function parseBdsMessage(rawText, isSettled = false) {
  let text = String(rawText || "");
  const renderableTagMatches = [];

  // Compute code block ranges once — BDS tags inside these ranges are
  // documentation examples, not actual tool invocations.
  const codeBlockRanges = computeCodeBlockRanges(text);
  const isInsideCodeBlock = (idx) =>
    codeBlockRanges.some(r => idx >= r.start && idx < r.end);

  // Intercept unclosed tags if the message is fully settled (AI stopped generating).
  // This prevents infinite "Working..." animations and lost tool output.
  if (isSettled) {
    const unclosedTags = [];
    const allTags = Array.from(text.matchAll(/<\/?BDS:([A-Za-z0-9_:]+)[^>]*>/gi))
      .filter(m => !isInsideCodeBlock(m.index));
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
    skillCreates: [],
    askQuestions: [],
    deepResearch: {
      plans: [],
      statuses: [],
      reports: [],
      stepDone: [],
    },
    autoRequests: {
      webFetch: [],
      githubFetch: [],
      twitterFetch: [],
      youtubeFetch: [],
      searchQueries: [],
      mcpCalls: [],
    },
    visibleText: text,
  };

  if (!/(<BDS:|<BetterDeepSeek>|Bds create file>)/i.test(text)) {
    return result;
  }

  // We have BDS tags, but do we have tags that should HIDE the original message?
  // AUTO tags should NOT hide the message, EXCEPT for AUTO:CODE_RUNNER, AUTO:REQUEST_WEB_FETCH, AUTO:REQUEST_GITHUB_FETCH, and AUTO:SEARCH which have UI cards.
  // BDS tags inside code blocks are ignored — they are documentation examples.
  const hidingRegex = /(<BDS:(?!AUTO:(?!CODE_RUNNER|REQUEST_WEB_FETCH|REQUEST_GITHUB_FETCH|SEARCH))[a-zA-Z0-9_:]+|<BetterDeepSeek>|Bds create file>)/gi;
  const hidingMatches = Array.from(text.matchAll(hidingRegex))
    .filter(m => !isInsideCodeBlock(m.index));
  result.containsControlTags = hidingMatches.length > 0;
  result.longWorkOpen = Array.from(text.matchAll(/<BDS:LONG_WORK>/gi))
    .some(m => !isInsideCodeBlock(m.index));
  result.longWorkClose = Array.from(text.matchAll(/<\/BDS:LONG_WORK>/gi))
    .some(m => !isInsideCodeBlock(m.index));

  // Parse create_file pair tags using position-based matching.
  // This correctly handles content that literally contains </BDS:create_file>
  // by pairing each opening with the last closing before the next opening.
  // Also requires whitespace between tag name and attributes.
  const openCreateRegex = /<BDS:create_file\s+([^>]*)>/gi;
  const closeCreateRegex = /<\/BDS:create_file>/gi;

  const openEnds = [];
  const openAttrsList = [];
  let openMatch;
  while ((openMatch = openCreateRegex.exec(text)) !== null) {
    if (isInsideCodeBlock(openMatch.index)) continue;
    openEnds.push(openMatch.index + openMatch[0].length);
    openAttrsList.push(openMatch[1] || "");
  }

  const closeStarts = [];
  let closeMatch;
  while ((closeMatch = closeCreateRegex.exec(text)) !== null) {
    if (isInsideCodeBlock(closeMatch.index)) continue;
    closeStarts.push(closeMatch.index);
  }

  for (let i = 0; i < openEnds.length; i++) {
    const endSearch = i < openEnds.length - 1 ? openEnds[i + 1] : text.length;
    let realClose = -1;
    for (let j = closeStarts.length - 1; j >= 0; j--) {
      if (closeStarts[j] >= openEnds[i] && closeStarts[j] < endSearch) {
        realClose = closeStarts[j];
        break;
      }
    }
    if (realClose === -1) continue;

    const attrs = parseTagAttributes(openAttrsList[i]);
    const fileName = attrs.fileName || attrs.filename || attrs.path;
    if (!fileName) continue;

    const content = normalizeTaggedCodeContent(
      text.substring(openEnds[i], realClose),
      "create_file"
    );
    result.createFiles.push({ fileName, content });
  }

  const pairTagRegex =
    /<BDS:([A-Za-z0-9_:]+)([^>]*)>([\s\S]*?)<\/BDS:\1>/gi;
  let match;
  while ((match = pairTagRegex.exec(text)) !== null) {
    if (isInsideCodeBlock(match.index)) continue;
    const name = String(match[1] || "").toLowerCase();
    const attrs = parseTagAttributes(match[2] || "");
    const content = normalizeTaggedCodeContent(
      String(match[3] || ""),
      name
    );

    if (RENDERABLE_TOOLS.has(name)) {
      const blockIdx = result.renderableBlocks.length;
      result.renderableBlocks.push({ name, attrs, content });
      renderableTagMatches.push({ original: match[0], index: match.index, blockIdx });
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

      if (name === "skill_create") {
      result.skillCreates.push({
        name: attrs.name || "New Skill",
        usage: attrs.usage || "",
        content: content
      });
    }

    if (name === "ask_question") {
      const parsed = parseLooseJson(content);
      if (Array.isArray(parsed.value)) {
        result.askQuestions = parsed.value;
      }
      if (parsed.error) {
        console.error("Failed to parse ask_question JSON:", parsed.error);
      }
    }

    if (name === "deep_research_plan") {
      const runId = attrs.runId || attrs.runid || "";
      const parsedPlan = parseLooseJson(content);
      result.deepResearch.plans.push({
        runId,
        plan: parsedPlan.value,
        raw: parsedPlan.value ? "" : content,
        error: parsedPlan.error,
      });
    }

    if (name === "deep_research_status") {
      const runId = attrs.runId || attrs.runid || "";
      const parsedStatus = parseLooseJson(content);
      result.deepResearch.statuses.push({
        runId,
        status: parsedStatus.value,
        raw: parsedStatus.value ? "" : content,
        error: parsedStatus.error,
      });
    }

    if (name === "deep_research_report") {
      const runId = attrs.runId || attrs.runid || "";
      // Report is markdown, preserve as-is
      result.deepResearch.reports.push({ runId, markdown: content });
    }

    if (name === "deep_research_step_done") {
      const runId = attrs.runId || attrs.runid || "";
      const stepId = attrs.stepId || attrs.stepid || "";
      const parsedJson = parseLooseJson(content);
      result.deepResearch.stepDone.push({
        runId,
        stepId,
        analysis: parsedJson.value,
        raw: parsedJson.value ? "" : content,
        error: parsedJson.error,
      });
    }
  }

  const autoWebFetchRegex = /<BDS:AUTO:REQUEST_WEB_FETCH>([\s\S]*?)<\/BDS:AUTO:REQUEST_WEB_FETCH>/gi;
  while ((match = autoWebFetchRegex.exec(text)) !== null) {
    if (isInsideCodeBlock(match.index)) continue;
    const cleanUrl = normalizeAutoHttpTarget(match[1]);
    if (cleanUrl) {
      result.autoRequests.webFetch.push(cleanUrl);
    }
  }

  const autoGitHubFetchRegex = /<BDS:AUTO:REQUEST_GITHUB_FETCH>([\s\S]*?)<\/BDS:AUTO:REQUEST_GITHUB_FETCH>/gi;
  while ((match = autoGitHubFetchRegex.exec(text)) !== null) {
    if (isInsideCodeBlock(match.index)) continue;
    const cleanUrl = normalizeAutoTextTarget(match[1]);
    if (cleanUrl) {
      result.autoRequests.githubFetch.push(cleanUrl);
    }
  }

  const autoTwitterFetchRegex = /<BDS:AUTO:REQUEST_TWITTER_FETCH>([\s\S]*?)<\/BDS:AUTO:REQUEST_TWITTER_FETCH>/gi;
  while ((match = autoTwitterFetchRegex.exec(text)) !== null) {
    if (isInsideCodeBlock(match.index)) continue;
    const cleanUrl = normalizeAutoHttpTarget(match[1]);
    if (cleanUrl) {
      result.autoRequests.twitterFetch.push(cleanUrl);
    }
  }

  const autoYouTubeFetchRegex = /<BDS:AUTO:REQUEST_YOUTUBE_FETCH>([\s\S]*?)<\/BDS:AUTO:REQUEST_YOUTUBE_FETCH>/gi;
  while ((match = autoYouTubeFetchRegex.exec(text)) !== null) {
    if (isInsideCodeBlock(match.index)) continue;
    const cleanUrl = normalizeAutoHttpTarget(match[1]);
    if (cleanUrl) {
      result.autoRequests.youtubeFetch.push(cleanUrl);
    }
  }

  const autoSearchRegex = /<BDS:AUTO:SEARCH([^>]*)>([\s\S]*?)<\/BDS:AUTO:SEARCH>/gi;
  while ((match = autoSearchRegex.exec(text)) !== null) {
    if (isInsideCodeBlock(match.index)) continue;
    const rawQuery = String(match[2] || "").trim();
    const query = stripMarkdownLinks(rawQuery);
    if (!query) continue;
    const attrs = parseTagAttributes(match[1] || "");
    const deepFetch = Math.max(0, parseInt(attrs.deepFetch, 10) || 0);
    const runId = attrs.runId || attrs.runid || "";
    const purpose = String(attrs.purpose || "").trim();
    const sourceType = String(attrs.sourceType || attrs.sourcetype || "").trim();
    result.autoRequests.searchQueries.push({ query, deepFetch, runId, purpose, sourceType });
  }

  const autoMcpRegex = /<BDS:AUTO:MCP\s+((?:[^>"']+|"[^"]*"|'[^']*')*)\s*>([\s\S]*?)<\/BDS:AUTO:MCP>/gi;
  while ((match = autoMcpRegex.exec(text)) !== null) {
    if (isInsideCodeBlock(match.index)) continue;
    const attrs = parseTagAttributes(match[1] || "");
    const serverUrl = attrs.url || attrs.serverUrl || "";
    const toolName = attrs.tool || attrs.toolName || "";
    const rawArgs = attrs.args || match[2] || "";
    if (!serverUrl || !toolName) continue;
    let argsObj = {};
    try { argsObj = JSON.parse(rawArgs); } catch { argsObj = { _raw: rawArgs.trim() }; }
    result.autoRequests.mcpCalls.push({ serverUrl, toolName, args: argsObj });
  }

  const selfClosingCreateRegex = /<BDS:create_file\s+([^>]*)\/>/gi;
  while ((match = selfClosingCreateRegex.exec(text)) !== null) {
    if (isInsideCodeBlock(match.index)) continue;
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

  const selfClosingImageRegex = /<BDS:IMAGE\s*([^>]*)\/>/gi;
  while ((match = selfClosingImageRegex.exec(text)) !== null) {
    if (isInsideCodeBlock(match.index)) continue;
    const attrs = parseTagAttributes(match[1] || "");
    if (!attrs.src && !attrs.query && !attrs.q && !attrs.search) continue;
    const query = attrs.src ? "" : (attrs.query || attrs.q || attrs.search || "");
    const blockIdx = result.renderableBlocks.length;
    result.renderableBlocks.push({ name: "image", attrs, content: query });
    renderableTagMatches.push({ original: match[0], index: match.index, blockIdx });
  }

  const selfClosingMemoryRegex = /<BDS:memory_write([^>]*)\/>/gi;
  while ((match = selfClosingMemoryRegex.exec(text)) !== null) {
    if (isInsideCodeBlock(match.index)) continue;
    const attrs = parseTagAttributes(match[1] || "");
    const parsedMemory = parseMemoryWrite("", attrs);
    if (parsedMemory) {
      result.memoryWrites.push(parsedMemory);
    }
  }

  const plainCreateRegex =
    /Bds create file>\s*fileName\s*=\s*"([^"]+)"\s*content\s*=\s*"([\s\S]*?)"/gi;
  while ((match = plainCreateRegex.exec(text)) !== null) {
    if (isInsideCodeBlock(match.index)) continue;
    result.createFiles.push({
      fileName: String(match[1] || "file.txt"),
      content: normalizeTaggedCodeContent(
        String(match[2] || ""),
        "create_file"
      ),
    });
  }

  // UNIVERSAL INTERFACE LOCK: Detect if ANY BDS tag is currently open (not closed)
  // This handles streaming for all tools (Visualizer, LongWork, etc.)
  // BDS tags inside code blocks are excluded — they are documentation examples.
  const allBdsTags = Array.from(text.matchAll(/<BDS:([A-Za-z0-9_:]+)[^>]*>/gi))
    .filter(m => !isInsideCodeBlock(m.index));
  const allBdsCloseTags = Array.from(text.matchAll(/<\/BDS:([A-Za-z0-9_:]+)>/gi))
    .filter(m => !isInsideCodeBlock(m.index));

  let streamingTagName = null;
  let streamingTagStartIdx = -1;

  for (let i = allBdsTags.length - 1; i >= 0; i--) {
    const openTag = allBdsTags[i];
    const tagName = openTag[1].toLowerCase();
    
    if (tagName.startsWith("auto") && tagName !== "auto:code_runner") continue;

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

  // Build visible text: truncate at streaming point if streaming
  let visibleText;
  if (result.isStreamingTool) {
    visibleText = text.substring(0, streamingTagStartIdx);
  } else {
    visibleText = text;
  }

  // Replace renderable block tags with inline position markers
  // Process in reverse index order so earlier replacements don't shift later ones
  const sortedMatches = [...renderableTagMatches]
    .filter(m => m.index + m.original.length <= visibleText.length)
    .sort((a, b) => b.index - a.index);

  for (const { original, index, blockIdx } of sortedMatches) {
    const marker = `\x00BLOCK:${blockIdx}\x00`;
    visibleText = visibleText.substring(0, index) + marker + visibleText.substring(index + original.length);
  }

  // Protect BDS tags inside code blocks from sanitization by HTML-escaping
  // the opening `<` so they survive as literal text (rendered correctly by marked).
  const vtRanges = computeCodeBlockRanges(visibleText);
  if (vtRanges.length > 0) {
    let protectedVT = '';
    let lastPos = 0;
    for (const { start, end } of vtRanges) {
      protectedVT += visibleText.substring(lastPos, start);
      const codeContent = visibleText.substring(start, end);
      protectedVT += codeContent.replace(/<(\/?(?:BDS:|BetterDeepSeek))/gi, '&lt;$1');
      lastPos = end;
    }
    protectedVT += visibleText.substring(lastPos);
    visibleText = protectedVT;
  }

  // Remove skill_create tags not captured by pairTagRegex (fallback cleanup)
  // Tags inside code blocks are already escaped and won't match.
  visibleText = visibleText.replace(/<BDS:skill_create[^>]*>[\s\S]*?<\/BDS:skill_create>/gi, '');

  // Strip all remaining BDS tags; markers survive (no <BDS: prefix)
  result.visibleText = sanitizeVisibleText(visibleText);

  // Summary card for memory_write if more than 3 in one message
  if (result.memoryWrites.length > 3) {
    result.renderableBlocks.push({
      name: "memory_write",
      attrs: { count: result.memoryWrites.length }
    });
  }

  return result;
}
