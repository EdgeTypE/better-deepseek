/**
 * Lightweight browser-side search and retrieval (RAG) engine.
 * Implements line-aware document chunking, query tokenization with English & Turkish stopword filtering,
 * and a robust BM25-like ranking algorithm with filename keyword boosting.
 */

const STOPWORDS = new Set([
  // English
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "when", "at", "by", "for", "with", "about", "against",
  "is", "it", "was", "were", "are", "be", "been",
  "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out",
  "on", "off", "over", "under", "again", "further", "once", "here", "there", "all", "any", "both", "each",
  "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "can", "will", "just", "should", "now", "how", "what", "where", "why", "who", "which",
  // Turkish
  "ve", "veya", "ama", "fakat", "lakin", "ancak", "ise", "ki", "de", "da", "mi", "mu", "mü", "mı", "bir", "bu", "şu",
  "o", "için", "gibi", "kadar", "ile", "tarafından", "hakkında", "karşı", "arasında", "içine", "boyunca", "önce", "sonra",
  "üzerinde", "altında", "yine", "daha", "en", "tüm", "her", "bazı", "hiç", "sadece", "kendi", "aynı", "öyle", "böyle",
  "çok", "yapılan", "yaparak", "olan"
]);

/**
 * Split a file's content into overlapping chunks, keeping code lines intact.
 * 
 * @param {{ name: string, content: string }} file 
 * @param {number} chunkSize Maximum characters per chunk (default 800)
 * @param {number} overlapLines Number of lines to overlap between chunks (default 5)
 * @returns {Array<{ fileName: string, content: string, startLine: number, endLine: number }>}
 */
export function chunkFile(file, chunkSize = 800, overlapLines = 5) {
  if (!file || !file.content) return [];
  
  const lines = file.content.split(/\r?\n/);
  if (lines.length === 0) return [];
  
  const chunks = [];
  let i = 0;

  while (i < lines.length) {
    const chunkLines = [];
    let currentChars = 0;
    const startLine = i + 1;

    // Collect lines until we hit the character limit
    // Ensure we take at least 3 lines to make sure chunks aren't completely empty
    while (i < lines.length && (currentChars < chunkSize || chunkLines.length < 3)) {
      chunkLines.push(lines[i]);
      currentChars += lines[i].length + 1; // +1 for newline character
      i++;
    }

    const endLine = i;
    chunks.push({
      fileName: file.name,
      content: chunkLines.join("\n"),
      startLine,
      endLine
    });

    if (i >= lines.length) break;

    // Slide window back by overlapLines for the next start, but never slide past the start of this chunk
    i = Math.max(startLine, i - overlapLines);
  }

  return chunks;
}

/**
 * Tokenize a text string, lowercasing it and stripping symbols, then filtering stopwords.
 * 
 * @param {string} text 
 * @returns {string[]} Filtered tokens
 */
export function tokenize(text) {
  if (!text) return [];
  const rawTokens = String(text).toLowerCase().match(/[a-z0-9_şçgöıü]+/gi) || [];
  return rawTokens.filter(token => token.length >= 2 && !STOPWORDS.has(token));
}

/**
 * Rank project chunks based on a query using a BM25-inspired similarity scoring algorithm,
 * including a boost for matches in the filename.
 * 
 * @param {string} query 
 * @param {Array<{ name: string, content: string }>} files 
 * @param {number} limit 
 * @returns {Array<{ fileName: string, content: string, startLine: number, endLine: number, score: number }>}
 */
export function searchActiveProjectRAG(query, files, limit = 5) {
  if (!query || !files || !files.length) return [];

  // 1. Chunk all files
  const chunks = [];
  for (const file of files) {
    chunks.push(...chunkFile(file, 800, 5));
  }

  if (chunks.length === 0) return [];

  // 2. Tokenize the query
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // 3. Pre-calculate chunk lengths and build term frequencies
  const N = chunks.length;
  const chunkTokenLists = chunks.map(chunk => tokenize(chunk.content));
  const chunkLengths = chunkTokenLists.map(list => list.length);
  const totalLength = chunkLengths.reduce((sum, len) => sum + len, 0);
  const avgdl = totalLength / N || 1;

  // 4. Calculate chunk frequency for each query token (how many chunks contain the token)
  const df = {};
  for (const token of queryTokens) {
    df[token] = 0;
    for (const list of chunkTokenLists) {
      if (list.includes(token)) {
        df[token]++;
      }
    }
  }

  // 5. Compute BM25 scores
  const k1 = 1.2;
  const b = 0.75;
  const scoredChunks = [];

  for (let idx = 0; idx < N; idx++) {
    const chunk = chunks[idx];
    const tokensInChunk = chunkTokenLists[idx];
    const docLen = chunkLengths[idx];
    
    let score = 0;

    // Calculate term frequencies in this chunk
    const tf = {};
    for (const token of tokensInChunk) {
      tf[token] = (tf[token] || 0) + 1;
    }

    for (const token of queryTokens) {
      const freq = tf[token] || 0;
      if (freq === 0) continue;

      // Calculate BM25 IDF
      const n_q = df[token] || 0;
      const idf = Math.log(1 + (N - n_q + 0.5) / (n_q + 0.5));

      // Calculate BM25 term score
      const termScore = idf * (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (docLen / avgdl)));
      score += termScore;
    }

    // Filename keyword boosting:
    // If a term in the query appears directly in the filename, give this chunk a massive score boost
    const safeFilename = String(chunk.fileName).toLowerCase();
    for (const token of queryTokens) {
      if (safeFilename.includes(token)) {
        score += 12.0; // Static additive boost for filename match
      }
    }

    if (score > 0) {
      scoredChunks.push({
        ...chunk,
        score
      });
    }
  }

  // 6. Sort by score descending and return the top matching chunks up to limit
  return scoredChunks
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

/**
 * Format retrieved RAG chunks into a beautiful markdown context block.
 * 
 * @param {Array<{ fileName: string, content: string, startLine: number, endLine: number, score: number }>} chunks 
 * @param {string} projectName 
 * @returns {string} Fully formatted Markdown block
 */
export function formatRagInjections(chunks, projectName = "Project") {
  if (!chunks || !chunks.length) return "";

  let output = `<BDS:PROJECT_CONTEXT>\n`;
  output += `You are working on the project "${projectName}". Based on the user's latest prompt, here are the most relevant sections of the project files:\n\n`;

  for (const chunk of chunks) {
    // Detect code block extension for syntax highlighting
    const ext = chunk.fileName.split('.').pop() || "";
    output += `--- [FILE: ${chunk.fileName} (Lines ${chunk.startLine}-${chunk.endLine})] ---\n`;
    output += `\`\`\`${ext}\n`;
    output += chunk.content + `\n`;
    output += `\`\`\`\n\n`;
  }

  output += `</BDS:PROJECT_CONTEXT>`;
  return output;
}
