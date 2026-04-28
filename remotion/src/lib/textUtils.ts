// remotion/src/lib/textUtils.ts
/**
 * Auto text sizing utility — dynamically adjusts font size
 * based on text length to prevent overflow in scene components.
 *
 * Uses Unicode-aware character counting for correct behavior
 * with Vietnamese, emoji, and other multi-byte characters.
 */

/**
 * Calculate an appropriate font size based on text length.
 *
 * Returns maxSize for short text, linearly interpolates down to
 * minSize as text length increases past the breakpoint.
 *
 * @param text - The text content to size
 * @param maxSize - Font size for short text (px)
 * @param minSize - Minimum font size (px)
 * @param breakpoint - Character count below which maxSize is used
 * @returns Computed font size in px (integer)
 */
export function autoFontSize(
  text: string,
  maxSize: number,
  minSize: number,
  breakpoint: number = 20,
): number {
  // Unicode-aware character counting (handles emoji, Vietnamese, etc.)
  const charCount = [...text].length;
  if (charCount <= breakpoint) return maxSize;
  const ratio = Math.min(1, (charCount - breakpoint) / (80 - breakpoint));
  return Math.round(maxSize - ratio * (maxSize - minSize));
}
