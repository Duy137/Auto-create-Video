// remotion/src/lib/color.ts
/**
 * Color manipulation utilities for per-scene hue micro-shifts.
 * Converts hex ↔ HSL and applies deterministic hue shifts via seed.
 *
 * Convention: seed=0 → no shift (returns original color).
 */

import { seededRandom } from "./seed";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/**
 * Parse "#RRGGBB" → { h: 0-360, s: 0-100, l: 0-100 }.
 * Returns null if input is not valid hex format.
 */
export function hexToHsl(
  hex: string,
): { h: number; s: number; l: number } | null {
  if (!HEX_RE.test(hex)) return null;

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Achromatic
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** Helper for HSL→RGB conversion */
function hueToRgb(p: number, q: number, t: number): number {
  let t1 = t;
  if (t1 < 0) t1 += 1;
  if (t1 > 1) t1 -= 1;
  if (t1 < 1 / 6) return p + (q - p) * 6 * t1;
  if (t1 < 1 / 2) return q;
  if (t1 < 2 / 3) return p + (q - p) * (2 / 3 - t1) * 6;
  return p;
}

/** Convert HSL (h: 0-360, s: 0-100, l: 0-100) → "#RRGGBB" */
export function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const hNorm = h / 360;

  let r: number, g: number, b: number;

  if (sNorm === 0) {
    r = g = b = lNorm;
  } else {
    const q = lNorm < 0.5
      ? lNorm * (1 + sNorm)
      : lNorm + sNorm - lNorm * sNorm;
    const p = 2 * lNorm - q;
    r = hueToRgb(p, q, hNorm + 1 / 3);
    g = hueToRgb(p, q, hNorm);
    b = hueToRgb(p, q, hNorm - 1 / 3);
  }

  const toHex = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v * 255)))
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Shift hue of a hex color by ±maxDegrees, deterministic via seed + index.
 *
 * @param hex       - Input color "#RRGGBB"
 * @param seed      - Job seed (0 = no shift, returns original)
 * @param index     - Unique index for this particular shift
 * @param maxDegrees - Maximum shift in degrees (default 10.8 = 3% of 360°)
 * @returns Shifted hex color, or original if invalid input or seed=0
 */
export function shiftHue(
  hex: string,
  seed: number,
  index: number,
  maxDegrees: number = 10.8,
): string {
  if (seed === 0) return hex;

  const hsl = hexToHsl(hex);
  if (!hsl) return hex; // invalid hex → return as-is, don't crash

  const shift = (seededRandom(seed, index) - 0.5) * 2 * maxDegrees;
  const newH = ((hsl.h + shift) % 360 + 360) % 360; // wrap to [0, 360)

  return hslToHex(newH, hsl.s, hsl.l);
}
