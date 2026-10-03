/**
 * Text-to-Speech Utilities for Better DeepSeek.
 * Handles text sanitization and intelligent voice selection.
 */

/**
 * Clean text for smooth, natural Text-to-Speech playback.
 * Strips code fences, markdown symbols, BDS tags, URLs, HTML, emojis, list bullets,
 * and normalizes punctuation for fluid, human-like voice delivery.
 */
export function cleanTextForSpeech(text) {
  if (!text) return "";
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "") // strip unclosed thinking block during generation
    .replace(/<(BDS|BetterDeepSeek):[^>]*>[\s\S]*?<\/(BDS|BetterDeepSeek):[^>]*>/gi, "")
    .replace(/\[\/?(BDS|BetterDeepSeek):[^\]]*\]/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    // Remove list markers at line starts: bullets (*, -, •), numbered lists (1., 2))
    .replace(/^[\s*•\-–—>]+\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    // Strip common emojis that TTS spells out robotically
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    // Normalize repeated punctuation
    .replace(/\.{2,}/g, ".")
    .replace(/\?{2,}/g, "?")
    .replace(/!{2,}/g, "!")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Trim pause-inducing punctuation right before handing text to the synthesizer.
 *
 * Every comma, semicolon, colon, bracket and spaced dash makes the engine insert a
 * silence, and those add up to a stuttery, over-paused delivery on long replies.
 * They are replaced by a plain space. Sentence-final marks (. ! ?) are downgraded
 * to a comma rather than removed: that keeps an audible boundary between sentences
 * (speech would otherwise be one run-on) while cutting most of the silence a full
 * stop costs. See the inline note below — pause duration itself is not controllable.
 *
 * Kept separate from `cleanTextForSpeech` (which only sanitizes markup) so the
 * readable text shown to the user is unaffected.
 *
 * @param {string} text Already cleaned text
 * @returns {string} Same words, fewer pauses
 */
export function softenPunctuationForSpeech(text) {
  if (!text) return "";
  return text
    .replace(/[,;:]/g, " ")
    .replace(/[()\[\]{}]/g, " ")
    .replace(/\s+[–—]\s+/g, " ") // spaced dash only — keeps hyphenated words ("e-mail") intact
    .replace(/\s+/g, " ")
    .trim()
    // Shorten the sentence pause. Web Speech exposes no control over pause length,
    // so the only lever is the mark itself: a full stop makes the engine idle far
    // longer than a comma. Downgrading sentence ends to a comma keeps a boundary
    // while cutting most of the silence. Decimals ("3.14") survive because the mark
    // must be followed by whitespace or end-of-string.
    .replace(/[.!?]+(?=\s|$)/g, ",")
    .replace(/[,\s]+$/, ""); // a trailing comma would add a pause at the very end
}

/**
 * Intelligently select the highest quality natural/neural voice available in the browser.
 * Prioritizes Microsoft Natural / Azure Neural, Google Neural, Apple Premium/Enhanced voices,
 * and heavily penalizes legacy robotic desktop/SAPI voices (e.g. "Microsoft Tolga Desktop").
 *
 *
 * @param {string} targetLang BCP-47 tag, e.g. "tr-TR"
 * @param {string} [preferredURI] voiceURI chosen in settings; "" means Auto
 * @returns {SpeechSynthesisVoice | null}
 */
export function getBestVoice(targetLang = "tr-TR", preferredURI = "") {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  let voices = [];
  try {
    voices = window.speechSynthesis.getVoices() || [];
  } catch {
    return null;
  }
  if (!voices || voices.length === 0) return null;

  // An explicit pick short-circuits the scoring — the user chose that voice.
  if (preferredURI) {
    const explicit = voices.find((v) => v.voiceURI === preferredURI);
    if (explicit) return explicit;
    // Falls through when the voice is gone (browser updated, OS voice removed).
  }

  const targetPrefix = targetLang.split("-")[0].toLowerCase();
  const targetFull = targetLang.toLowerCase().replace("_", "-");

  // Filter voices that match the language prefix (e.g. "tr" or "en")
  const matchingVoices = voices.filter((v) => {
    const vLang = (v.lang || "").toLowerCase().replace("_", "-");
    return vLang.startsWith(targetPrefix);
  });

  const candidates = matchingVoices.length > 0 ? matchingVoices : voices;

  const scored = candidates.map((voice) => {
    let score = 0;
    const name = (voice.name || "").toLowerCase();
    const vLang = (voice.lang || "").toLowerCase().replace("_", "-");

    // Locale matching bonus
    if (vLang === targetFull) {
      score += 60;
    } else if (vLang.startsWith(targetPrefix)) {
      score += 30;
    }

    // Modern Neural / Natural voices have specific branding keywords
    if (name.includes("natural")) score += 120; // Edge Azure Natural (e.g., Ahmet Online Natural)
    if (name.includes("neural")) score += 110;  // Azure Neural / Neural TTS
    if (name.includes("google")) score += 100;  // Chrome Google TTS (e.g., Google Türkçe)
    if (name.includes("online")) score += 70;   // Online streamed voices
    if (name.includes("premium")) score += 60;  // Apple Premium voices
    if (name.includes("enhanced")) score += 50; // Apple Enhanced voices

    // Remote network service voices (localService === false) are cloud neural synthesizers
    if (voice.localService === false) score += 40;

    // Browser default voice bonus
    if (voice.default) score += 10;

    // Heavy penalty for legacy robotic SAPI / Desktop / eSpeak voices
    if (name.includes("desktop")) score -= 70; // e.g. "Microsoft Tolga Desktop - Turkish"
    if (name.includes("espeak")) score -= 80;  // Linux eSpeak
    if (name.includes("compact")) score -= 40; // Apple Compact legacy voices

    return { voice, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.voice || null;
}
