/**
 * Sanitize visible text by removing all BDS control tags.
 */
export function sanitizeVisibleText(text) {
  let output = String(text || "");

  output = output.replace(
    /<BetterDeepSeek>[\s\S]*?<\/BetterDeepSeek>/gi,
    ""
  );
  output = output.replace(/<BDS:SKILLS>[\s\S]*?<\/BDS:SKILLS>/gi, "");
  output = output.replace(
    /<BDS:memory_calls>[\s\S]*?<\/BDS:memory_calls>/gi,
    ""
  );
  output = output.replace(
    /<BDS:[A-Za-z0-9_]+[^>]*>[\s\S]*?<\/BDS:[A-Za-z0-9_]+>/gi,
    ""
  );
  output = output.replace(/<BDS:create_file[^>]*\/>/gi, "");
  output = output.replace(/<\/?BDS:LONG_WORK>/gi, "");
  output = output.replace(/Bds create file>[^\n]*/gi, "");

  return output.replace(/\n{3,}/g, "\n\n").trim();
}
