/**
 * Normalize the `content` array of an MCP `tools/call` result into plain text.
 *
 * The MCP spec allows text, image, audio, embedded resources and resource
 * links in a tool result. Reading only `content[].text` silently dropped every
 * embedded resource — which is how servers such as GitHub MCP return a file
 * body (`content[].resource.text`). The model then received an empty result and
 * either stalled or retried the call (issue #146).
 *
 * Non-text parts are rendered as short bracketed placeholders rather than being
 * discarded, so a result made up entirely of binary parts is still visible to
 * the model instead of arriving as an empty string.
 */

const MIME_FALLBACK = "application/octet-stream";

function describeResource(resource) {
  if (!resource || typeof resource !== "object") return "";

  if (typeof resource.text === "string" && resource.text) {
    return resource.text;
  }

  const label = resource.uri || resource.name || "unknown";

  if (typeof resource.blob === "string" && resource.blob) {
    return `[binary resource: ${label} (${resource.mimeType || MIME_FALLBACK})]`;
  }

  return `[resource: ${label}]`;
}

function describePart(part) {
  if (!part || typeof part !== "object") return "";

  if (typeof part.text === "string" && part.text) return part.text;
  if (part.resource) return describeResource(part.resource);

  if (part.type === "resource_link" || part.uri) {
    return `[resource link: ${part.uri || part.name || "unknown"}]`;
  }
  if (part.type === "image") return `[image: ${part.mimeType || MIME_FALLBACK}]`;
  if (part.type === "audio") return `[audio: ${part.mimeType || MIME_FALLBACK}]`;

  return "";
}

/**
 * Extract the text a `tools/call` result should contribute to the conversation.
 *
 * @param {unknown} result Raw JSON-RPC result of an MCP `tools/call`.
 * @returns {string} Concatenated content, ready to inject into the chat.
 */
export function extractMcpResultText(result) {
  const content = result?.content;

  if (!Array.isArray(content)) {
    // Results without a content array are passed through verbatim so nothing is
    // lost. `undefined`/`null` must not reach JSON.stringify — it returns
    // `undefined`, and the caller would then read `.length` off it.
    if (result === undefined || result === null) return "";
    return JSON.stringify(result);
  }

  const text = content.map(describePart).filter(Boolean).join("\n");

  // A tool that fails at the application level still returns HTTP 200 with
  // `isError: true`. Without this marker the failure text reads as a normal
  // result and the model treats it as data.
  if (result.isError) {
    return text ? `MCP tool reported an error:\n${text}` : "MCP tool reported an error.";
  }

  return text;
}
