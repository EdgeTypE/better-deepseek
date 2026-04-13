/**
 * Clean up LaTeX source to ensure it's a valid document for remote compilers.
 * TexLive.net and LaTeXOnline both expect a full document structure.
 */
export function preprocessLatex(source) {
  let cleaned = source || "";

  // 1. Remove markers that might confuse simple parsers (optional, but good for cleanliness)
  cleaned = cleaned.trim();

  // 2. Ensure it's a full document
  // If it doesn't have a documentclass, wrap it in a standard one.
  if (!cleaned.includes('\\documentclass')) {
    // Add a robust preamble for snippets
    cleaned = [
      '\\documentclass[11pt]{article}',
      '\\usepackage[utf8]{inputenc}',
      '\\usepackage[T1]{fontenc}',
      '\\usepackage{amsmath,amssymb}',
      '\\usepackage{geometry}',
      '\\geometry{a4paper, margin=1in}',
      '\\begin{document}',
      cleaned,
      '\\end{document}'
    ].join('\n');
  }

  return cleaned;
}

/**
 * Note: Local rendering via latex.js has been removed in favor of 
 * robust remote compilation via TexLive.net / LaTeXOnline.
 * This ensures full package support (TikZ, pgfplots, etc).
 */
