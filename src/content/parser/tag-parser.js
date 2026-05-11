/**
 * Parse tag attributes from a string like: fileName="test.py" content="..."
 */
export function parseTagAttributes(rawAttrs) {
  const attrs = {};
  const regex = /([A-Za-z0-9_:-]+)\s*=\s*"([\s\S]*?)"/g;

  let match;
  while ((match = regex.exec(rawAttrs)) !== null) {
    const key = String(match[1] || "").trim();
    if (!key) {
      continue;
    }

    if (key === "fileName") {
      attrs.fileName = String(match[2] || "");
    } else {
      attrs[key] = String(match[2] || "");
    }
  }

  return attrs;
}

/**
 * Normalize content extracted from a BDS tag.
 */
export function normalizeTaggedCodeContent(content, tagName) {
  const name = String(tagName || "").toLowerCase();
  let output = String(content || "");

  if (
    name === "create_file" ||
    name === "run_python_embed" ||
    name === "html" ||
    name === "latex" ||
    name === "visualizer" ||
    name === "docx" ||
    name === "pptx" ||
    name === "excel" ||
    name === "character_create" ||
    name === "auto:code_runner"
  ) {
    output = unwrapMarkdownCodeFence(output);
  }

  if (
    name === "run_python_embed" ||
    name === "html" ||
    name === "docx" ||
    name === "pptx" ||
    name === "excel" ||
    name === "auto:code_runner"
  ) {
    output = stripLeadingChatter(output);
  }

  return output;
}

/**
 * Strips leading/trailing conversational text from a code block.
 * Specifically targets cases where AI ignores markdown fences and writes:
 * "Here is the code: const doc = ..."
 */
function stripLeadingChatter(content) {
  let output = String(content || "").trim();

  // If it already looks like it starts with code, leave it
  if (/^(?:const|let|var|function|async|import|export|class|await|\/\/|\/\*)/.test(output)) {
    return output;
  }

  // Look for the first occurrence of a JS keyword at the start of a line
  const jsStartMatch = output.match(/(?:\r?\n|^)\s*(const|let|var|function|async|import|class|await|document)\s+/);
  if (jsStartMatch && jsStartMatch.index > 0) {
    console.log(`[BDS:Parser] Stripping leading chatter for JS block: "${output.substring(0, 30)}..."`);
    return output.substring(jsStartMatch.index).trim();
  }

  return output;
}

/**
 * Unwrap markdown code fences (```lang ... ```) from content.
 * Robust: Handles multiple fences, unclosed fences, and leftover backticks.
 */
export function unwrapMarkdownCodeFence(content) {
  let text = String(content || "");

  // Find the first and last occurrences of the code fence marker.
  // This approach correctly handles nested code fences (e.g., inside a README.md)
  // because the outer fences created by the AI inside the BDS tag will be
  // the very first and very last markers in the string.
  const firstFenceIndex = text.indexOf("```");
  if (firstFenceIndex !== -1) {
    // Find the end of the first fence's line (to skip the language tag)
    let contentStartIndex = text.indexOf("\n", firstFenceIndex);
    if (contentStartIndex === -1) {
      contentStartIndex = firstFenceIndex + 3; // No newline, just start after ```
    } else {
      contentStartIndex += 1; // Start after the newline
    }

    const lastFenceIndex = text.lastIndexOf("```");

    // If there is a distinct closing fence, extract everything in between.
    if (lastFenceIndex > firstFenceIndex) {
      return text.substring(contentStartIndex, lastFenceIndex).trim();
    }
  }

  // Handle unclosed fence: ```python\n...code... (no closing ```)
  const unclosedMatch = text.match(/```(?:[a-zA-Z0-9_+.-]*)\s*\r?\n([\s\S]+)$/);
  if (unclosedMatch) {
    return unclosedMatch[1].trim();
  }

  // Strip ALL stray leading/trailing ``` markers 
  while (/^\s*```/.test(text)) {
    text = text.replace(/^\s*```[a-zA-Z0-9_+.-]*\s*\r?\n?/, "");
  }
  while (/```\s*$/.test(text)) {
    text = text.replace(/\r?\n?\s*```\s*$/, "");
  }

  return text.trim();
}

