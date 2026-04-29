/**
 * Converts selected project files into a single concatenated File object,
 * using the same format as folder-reader.js so Deepseek treats it as a
 * native file attachment (avoids "content too long" payload rejection).
 */

export function projectFilesToFile(files, projectName) {
  if (!files || !files.length) return null;

  const safeName = (projectName || "project")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .toLowerCase();

  let text = `Project: ${projectName || "Project"}\n\nFiles:\n`;
  files.forEach((f) => { text += `  ${f.name}\n`; });
  text += "\n========================================\n";

  for (const file of files) {
    text += `\n\n--- [FILE: ${file.name}] ---\n\n`;
    text += file.content;
  }

  const blob = new Blob([text], { type: "text/plain" });
  return new File([blob], `${safeName}_context.txt`, { type: "text/plain" });
}
