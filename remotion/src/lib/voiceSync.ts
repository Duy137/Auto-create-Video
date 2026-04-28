// remotion/src/lib/voiceSync.ts
/**
 * Voice-Sync keyword matching — aligns visual element reveals
 * with TTS audio timestamps for natural pacing.
 *
 * Used by scene components (Timeline, InfoCard, StatsHighlight, etc.)
 * to time item reveals to when the narrator mentions them.
 */

interface WordTimestamp {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Remove Vietnamese diacritics for fuzzy matching.
 */
function removeDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Strict keyword match — exact word boundary, NOT includes.
 * Prevents false positives like "AI" matching "bài".
 */
function matchKeyword(keyword: string, wordText: string): boolean {
  const keyTokens = removeDiacritics(keyword.toLowerCase()).split(/\s+/);
  const wordNorm = removeDiacritics(wordText.toLowerCase());
  return keyTokens.some((t) => wordNorm === t);
}

/**
 * Find the timestamp (ms) when voice first mentions a keyword.
 * Returns -1 if no match found (caller should use fallback).
 */
export function findKeywordTimestamp(
  keyword: string,
  wordTimestamps: WordTimestamp[],
  sceneStartMs: number,
  sceneEndMs: number,
): number {
  const sceneWords = wordTimestamps.filter(
    (w) => w.startMs >= sceneStartMs && w.startMs < sceneEndMs,
  );

  // Try multi-word match first (e.g. "mở rộng" → find "mở" then check next word is "rộng")
  const keyTokens = removeDiacritics(keyword.toLowerCase()).split(/\s+/);

  if (keyTokens.length > 1) {
    for (let i = 0; i < sceneWords.length - keyTokens.length + 1; i++) {
      const allMatch = keyTokens.every(
        (token, j) =>
          removeDiacritics(sceneWords[i + j].text.toLowerCase()) === token,
      );
      if (allMatch) return sceneWords[i].startMs;
    }
  }

  // Single word match
  for (const word of sceneWords) {
    if (matchKeyword(keyword, word.text)) {
      return word.startMs;
    }
  }

  return -1;
}

/**
 * Calculate reveal frames for an array of items based on keyword matching.
 * Falls back to evenly-distributed timing if keywords don't match.
 */
export function getItemRevealFrames(
  items: { title: string }[],
  wordTimestamps: WordTimestamp[],
  sceneStartMs: number,
  sceneEndMs: number,
  fps: number,
): number[] {
  if (items.length === 0) return [];

  const sceneDurationMs = sceneEndMs - sceneStartMs;
  const itemInterval = sceneDurationMs / items.length;

  return items.map((item, i) => {
    const matchMs = findKeywordTimestamp(
      item.title,
      wordTimestamps,
      sceneStartMs,
      sceneEndMs,
    );
    if (matchMs >= 0) {
      return Math.round(((matchMs - sceneStartMs) / 1000) * fps);
    }
    // Fallback: evenly distributed
    return Math.round(((i * itemInterval) / 1000) * fps);
  });
}
