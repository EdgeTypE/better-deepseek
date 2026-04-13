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
    name === "visualizer"
  ) {
    output = unwrapMarkdownCodeFence(output);
  }

  return stripMarkdownViewerControls(output);
}

/**
 * Unwrap markdown code fences (```lang ... ```) from content.
 */
export function unwrapMarkdownCodeFence(content) {
  const original = String(content || "");
  const trimmed = original.trim();

  const fencedMultiline = trimmed.match(
    /^```[a-zA-Z0-9_+.-]*\s*\r?\n([\s\S]*?)\r?\n```$/
  );
  if (fencedMultiline) {
    return String(fencedMultiline[1] || "");
  }

  const fencedInline = trimmed.match(/^```([\s\S]*?)```$/);
  if (fencedInline) {
    return String(fencedInline[1] || "");
  }

  return original;
}

/**
 * Strip DeepSeek's markdown viewer control text (Copy/Download buttons).
 */
export function stripMarkdownViewerControls(text) {
  let output = String(text || "");
  let previous = "";

  const languagePattern =
    "(?:python|javascript|typescript|tsx|jsx|html|css|json|bash|shell|sh|sql|yaml|yml|xml|markdown|md)";

  while (output !== previous) {
    previous = output;

    output = output.replace(
      new RegExp(
        `^\\s*${languagePattern}\\s*(?:\\r?\\n|\\s+)(?:Kopyala|Copy)\\s*(?:\\r?\\n|\\s+)(?:İndir|Download)\\s*(?:\\r?\\n)*`,
        "i"
      ),
      ""
    );

    output = output.replace(
      /^\s*(?:Kopyala|Copy)\s*(?:\r?\n|\s+)(?:İndir|Download)\s*(?:\r?\n)*/i,
      ""
    );
  }

  return output;
}
