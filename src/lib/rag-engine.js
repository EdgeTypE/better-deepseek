/**
 * Lightweight browser-side search and retrieval (RAG) engine.
 * Implements line-aware document chunking, mixed Chinese/English tokenization,
 * and TF-IDF ranking with filename/path boosting.
 */

const EN_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "when", "at", "by", "for", "with", "about", "against",
  "is", "it", "was", "were", "are", "be", "been",
  "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out",
  "on", "off", "over", "under", "again", "further", "once", "here", "there", "all", "any", "both", "each",
  "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "can", "will", "just", "should", "now", "how", "what", "where", "why", "who", "which"
]);

const TR_STOPWORDS = new Set([
  "ve", "veya", "ama", "fakat", "lakin", "ancak", "ise", "ki", "de", "da", "mi", "mu", "mü", "mı", "bir", "bu", "şu",
  "o", "için", "gibi", "kadar", "ile", "tarafından", "hakkında", "karşı", "arasında", "içine", "boyunca", "önce", "sonra",
  "üzerinde", "altında", "yine", "daha", "en", "tüm", "her", "bazı", "hiç", "sadece", "kendi", "aynı", "öyle", "böyle",
  "çok", "yapılan", "yaparak", "olan"
]);

const ZH_STOPWORDS = new Set([
  "的", "了", "是", "在", "和", "有", "就", "也", "都", "但",
  "因为", "所以", "可以", "这个", "那个", "一个", "一些",
  "什么", "怎么", "如何", "这样", "那样", "很", "非常",
  "已经", "可能", "需要", "应该", "不是", "没有", "我", "你", "他", "她", "它",
  "我们", "你们", "他们", "这", "那", "从", "到", "被", "把"
]);

const STOPWORDS = new Set([...EN_STOPWORDS, ...TR_STOPWORDS, ...ZH_STOPWORDS]);

/**
 * Check if a character is a Chinese (CJK) ideograph.
 * @param {string} ch
 * @returns {boolean}
 */
function isChineseChar(ch) {
  if (!ch) return false;
  const code = ch.codePointAt(0);
  // CJK Unified Ideographs, Extension A, Extension B, Compatibility Ideographs
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x20000 && code <= 0x2a6df) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

/**
 * Tokenize a text string supporting mixed Chinese (bigram) and English/alphanumeric tokens.
 *
 * - English/alphanumeric: /[a-zA-Z0-9]+/g, lowercased, length >= 2, stopwords filtered.
 * - Chinese: consecutive CJK characters are split into overlapping 2-grams.
 *   Single-character tokens are kept only if the entire query is very short (< 3 tokens).
 *
 * @param {string} text
 * @param {boolean} keepSingleChinese  Whether to keep single Chinese chars as tokens.
 * @returns {string[]} Filtered tokens
 */
export function tokenize(text, keepSingleChinese = false) {
  if (!text) return [];
  const input = String(text);
  const tokens = [];
  const seen = new Set();

  // 1. English / alphanumeric / Turkish tokens.
  const asciiRegex = /[a-zA-Z0-9_şçğöıüŞÇĞÖIÜ]+/g;
  let match;
  while ((match = asciiRegex.exec(input)) !== null) {
    const token = match[0].toLowerCase();
    if (token.length >= 2 && !EN_STOPWORDS.has(token) && !TR_STOPWORDS.has(token) && !seen.has(token)) {
      tokens.push(token);
      seen.add(token);
    }
  }

  // 2. Chinese bigrams.
  let chineseBuffer = "";
  const flushChinese = () => {
    if (chineseBuffer.length === 0) return;
    if (chineseBuffer.length === 1) {
      const ch = chineseBuffer[0];
      if (keepSingleChinese && !ZH_STOPWORDS.has(ch) && !seen.has(ch)) {
        tokens.push(ch);
        seen.add(ch);
      }
    } else {
      for (let i = 0; i < chineseBuffer.length - 1; i++) {
        const bigram = chineseBuffer[i] + chineseBuffer[i + 1];
        if (!ZH_STOPWORDS.has(bigram) && !seen.has(bigram)) {
          tokens.push(bigram);
          seen.add(bigram);
        }
      }
      if (keepSingleChinese) {
        for (const ch of chineseBuffer) {
          if (!ZH_STOPWORDS.has(ch) && !seen.has(ch)) {
            tokens.push(ch);
            seen.add(ch);
          }
        }
      }
    }
    chineseBuffer = "";
  };

  for (const ch of input) {
    if (isChineseChar(ch)) {
      chineseBuffer += ch;
    } else {
      flushChinese();
    }
  }
  flushChinese();

  return tokens;
}

/**
 * Fallback keyword matcher for very short queries (tokens < 3).
 * Returns chunks that contain any query token, sorted by number of distinct token matches.
 *
 * @param {string[]} queryTokens
 * @param {Array<{ fileName: string, content: string, startLine: number, endLine: number }>} chunks
 * @param {number} limit
 * @returns {Array<{ fileName: string, content: string, startLine: number, endLine: number, score: number }>}
 */
function keywordMatch(queryTokens, chunks, limit) {
  const scored = [];
  for (const chunk of chunks) {
    const contentLower = chunk.content.toLowerCase();
    const fileNameLower = String(chunk.fileName).toLowerCase();
    let matches = 0;
    let fileNameMatches = 0;
    for (const token of queryTokens) {
      if (contentLower.includes(token)) matches++;
      if (fileNameLower.includes(token)) fileNameMatches++;
    }
    if (matches > 0 || fileNameMatches > 0) {
      scored.push({ ...chunk, score: matches + fileNameMatches * 3 });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, Math.max(1, limit));
}

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

    while (i < lines.length && (currentChars < chunkSize || chunkLines.length < 3)) {
      chunkLines.push(lines[i]);
      currentChars += lines[i].length + 1;
      i++;
    }

    const endLine = i;
    chunks.push({
      fileName: file.name,
      content: chunkLines.join("\n"),
      startLine,
      endLine,
    });

    if (i >= lines.length) break;
    i = Math.max(startLine, i - overlapLines);
  }

  return chunks;
}

/**
 * Build a pre-computable TF-IDF index for a set of files.
 *
 * @param {Array<{ name: string, content: string }>} files
 * @returns {{
 *   chunks: Array<{ fileName: string, content: string, startLine: number, endLine: number }>,
 *   tokenizedChunks: string[][],
 *   df: Record<string, number>,
 *   idf: Record<string, number>,
 *   docLengths: number[],
 *   avgDocLength: number
 * }}
 */
export function buildRagIndex(files) {
  const chunks = [];
  for (const file of files) {
    chunks.push(...chunkFile(file, 800, 5));
  }

  const tokenizedChunks = chunks.map((chunk) => tokenize(chunk.content));
  const N = chunks.length;
  const df = {};

  for (const tokens of tokenizedChunks) {
    const seen = new Set(tokens);
    for (const token of seen) {
      df[token] = (df[token] || 0) + 1;
    }
  }

  const idf = {};
  for (const [token, count] of Object.entries(df)) {
    idf[token] = Math.log(N / (count + 1)) + 1;
  }

  const docLengths = tokenizedChunks.map((tokens) => tokens.length);
  const totalLength = docLengths.reduce((sum, len) => sum + len, 0);
  const avgDocLength = N > 0 ? totalLength / N : 1;

  return { chunks, tokenizedChunks, df, idf, docLengths, avgDocLength };
}

/**
 * Rank project chunks based on a query using TF-IDF scoring with filename/path boosting.
 * Falls back to simple keyword matching when the query has fewer than 3 tokens.
 *
 * @param {string} query
 * @param {Array<{ name: string, content: string }>} files
 * @param {number} limit
 * @returns {Array<{ fileName: string, content: string, startLine: number, endLine: number, score: number }>}
 */
export function searchActiveProjectRAG(query, files, limit = 5) {
  if (!query || !files || !files.length) return [];

  const index = buildRagIndex(files);
  if (index.chunks.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // Fallback for very short queries to avoid all-zero TF-IDF scores.
  if (queryTokens.length < 3) {
    return keywordMatch(queryTokens, index.chunks, limit);
  }

  const { chunks, tokenizedChunks, idf, docLengths, avgDocLength } = index;
  const N = chunks.length;
  const scoredChunks = [];

  for (let idx = 0; idx < N; idx++) {
    const chunk = chunks[idx];
    const tokensInChunk = tokenizedChunks[idx];
    const docLen = docLengths[idx];

    const tf = {};
    for (const token of tokensInChunk) {
      tf[token] = (tf[token] || 0) + 1;
    }

    let score = 0;
    for (const token of queryTokens) {
      const freq = tf[token] || 0;
      if (freq === 0) continue;
      const tokenIdf = idf[token] || 0;
      const normalizedTf = freq / Math.max(1, docLen);
      score += normalizedTf * tokenIdf;
    }

    // Boost tokens that appear in the filename/path.
    const safeFilename = String(chunk.fileName).toLowerCase();
    for (const token of queryTokens) {
      if (safeFilename.includes(token)) {
        score += (idf[token] || 1) * 2;
      }
    }

    if (score > 0) {
      scoredChunks.push({ ...chunk, score });
    }
  }

  return scoredChunks
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

/**
 * Format retrieved RAG chunks into a markdown context block.
 * Supports an optional project name prefix per file.
 *
 * @param {Array<{ fileName: string, content: string, startLine: number, endLine: number, score: number, projectName?: string }>} chunks
 * @param {string} projectName
 * @returns {string} Fully formatted Markdown block
 */
export function formatRagInjections(chunks, projectName = "Project") {
  if (!chunks || !chunks.length) return "";

  let output = `<BDS:PROJECT_CONTEXT>\n`;
  output += `You are working on the project "${projectName}". Based on the user's latest prompt, here are the most relevant sections of the project files:\n\n`;

  for (const chunk of chunks) {
    const ext = chunk.fileName.split(".").pop() || "";
    const sourcePrefix = chunk.projectName ? `[${chunk.projectName}] ` : "";
    output += `--- [FILE: ${sourcePrefix}${chunk.fileName} (Lines ${chunk.startLine}-${chunk.endLine})] ---\n`;
    output += `\`\`\`${ext}\n`;
    output += chunk.content + `\n`;
    output += `\`\`\`\n\n`;
  }

  output += `</BDS:PROJECT_CONTEXT>`;
  return output;
}
