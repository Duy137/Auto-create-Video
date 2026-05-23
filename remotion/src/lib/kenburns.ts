// remotion/src/lib/kenburns.ts
/**
 * Shared Ken Burns & video drift presets.
 *
 * Used by MediaShowcase, CryptoVN101News, StockBackground to ensure
 * consistent preset pools while avoiding duplication.
 */

/** Standard Ken Burns presets — for clear (non-blurred) images */
export const KENBURNS_PRESETS = [
  { scaleFrom: 1.0, scaleTo: 1.25, panXFrom: 0, panXTo: -25 },   // zoom in + pan left
  { scaleFrom: 1.25, scaleTo: 1.0, panXFrom: -25, panXTo: 0 },   // zoom out + pan right
  { scaleFrom: 1.0, scaleTo: 1.2, panXFrom: 0, panXTo: 20 },     // zoom in + pan right
  { scaleFrom: 1.15, scaleTo: 1.0, panXFrom: 15, panXTo: -10 },  // zoom out + sweep left
  { scaleFrom: 1.0, scaleTo: 1.18, panXFrom: -10, panXTo: 10 },  // zoom in + sweep right
] as const;

export type KenBurnsPreset = (typeof KENBURNS_PRESETS)[number];

/** Subtle Ken Burns presets — for blurred backgrounds (StockBackground) */
export const KENBURNS_SUBTLE_PRESETS = [
  { scaleFrom: 1.0, scaleTo: 1.09, panXTo: -10, rotateTo: 0.3 },
  { scaleFrom: 1.08, scaleTo: 1.0, panXTo: 5, rotateTo: -0.2 },
  { scaleFrom: 1.0, scaleTo: 1.07, panXTo: -8, rotateTo: 0.25 },
  { scaleFrom: 1.06, scaleTo: 1.0, panXTo: 8, rotateTo: -0.3 },
] as const;

export type KenBurnsSubtlePreset = (typeof KENBURNS_SUBTLE_PRESETS)[number];

/** Subtle drift presets — for video content (very light movement) */
export const VIDEO_DRIFT_PRESETS = [
  { scaleTo: 1.02, panXTo: -3 },   // slight zoom + drift left
  { scaleTo: 1.03, panXTo: 4 },    // slight zoom + drift right
  { scaleTo: 1.025, panXTo: -5 },  // medium zoom + drift left
  { scaleTo: 1.04, panXTo: 3 },    // max zoom + drift right
  { scaleTo: 1.02, panXTo: 0 },    // zoom only, no pan
] as const;

export type VideoDriftPreset = (typeof VIDEO_DRIFT_PRESETS)[number];
