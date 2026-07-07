/**
 * RTL (Right-to-Left) text detection for Persian, Arabic, Hebrew, etc.
 */

const RTL_RANGES = [
  [0x0590, 0x05FF], // Hebrew
  [0x0600, 0x06FF], // Arabic
  [0x0750, 0x077F], // Arabic Supplement
  [0x08A0, 0x08FF], // Arabic Extended-A
  [0xFB50, 0xFDFF], // Arabic Presentation Forms-A
  [0xFE70, 0xFEFF], // Arabic Presentation Forms-B
];

function isRtlChar(code) {
  return RTL_RANGES.some(([start, end]) => code >= start && code <= end);
}

export function isRtlText(text) {
  if (!text || typeof text !== 'string') return false;
  for (const char of text) {
    if (isRtlChar(char.codePointAt(0))) return true;
  }
  return false;
}

export function isPredominantlyRtl(text, threshold = 0.3) {
  if (!text || typeof text !== 'string') return false;
  
  let rtlCount = 0;
  let totalCount = 0;
  
  for (const char of text) {
    const code = char.codePointAt(0);
    // Skip whitespace and common punctuation
    if (code <= 0x2F || (code >= 0x3A && code <= 0x40) || 
        (code >= 0x5B && code <= 0x60) || (code >= 0x7B && code <= 0x7E)) {
      continue;
    }
    totalCount++;
    if (isRtlChar(code)) rtlCount++;
  }
  
  if (totalCount === 0) return false;
  return (rtlCount / totalCount) >= threshold;
}