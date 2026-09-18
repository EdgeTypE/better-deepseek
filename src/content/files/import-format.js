/**
 * Import format detection for the data-management lists (skills, personas,
 * saved items, memories).
 *
 * Every one of these sections exports JSON, but the same input also accepts
 * hand-authored markdown. Deciding purely from the file name means a JSON
 * backup that was renamed — or that the browser saved with a different
 * extension — is silently imported as one giant markdown blob whose body is
 * the raw JSON text. So the content decides, and the name is only consulted
 * when the content is not recognisably a JSON document.
 */

export const IMPORT_FORMAT = {
  JSON: "json",
  MARKDOWN: "markdown",
  UNSUPPORTED: "unsupported",
};

const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

/**
 * Parse `text` as a JSON object or array.
 *
 * Returns the parsed value, or null when the text is not a JSON document.
 * Scalars are rejected on purpose: a markdown file whose first line is a bare
 * word would otherwise parse as a JSON string and be misread as a backup.
 */
export function parseJsonDocument(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  try {
    const value = JSON.parse(trimmed);
    if (value === null || typeof value !== "object") {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/**
 * Decide how to interpret an uploaded file.
 *
 * A `.json` name that does not contain a JSON document still reports JSON so
 * the caller can surface its own "invalid file" error instead of quietly
 * treating the bytes as markdown.
 */
export function detectImportFormat(fileName, rawText) {
  const name = String(fileName || "").trim().toLowerCase();

  if (parseJsonDocument(rawText)) {
    return IMPORT_FORMAT.JSON;
  }
  if (name.endsWith(".json")) {
    return IMPORT_FORMAT.JSON;
  }
  if (MARKDOWN_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return IMPORT_FORMAT.MARKDOWN;
  }
  return IMPORT_FORMAT.UNSUPPORTED;
}
