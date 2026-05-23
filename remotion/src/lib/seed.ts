// remotion/src/lib/seed.ts
/**
 * Centralized seed utility for deterministic randomization.
 *
 * All components that need per-video variation MUST import from here.
 * Uses FNV-1a hash for jobId → seed conversion and a simple
 * sin-based PRNG for seeded random numbers.
 *
 * When seed === 0, all helpers return baseline values (no randomization).
 */

/**
 * FNV-1a hash: convert jobId string → unsigned 32-bit integer.
 * Fast, excellent distribution, deterministic.
 */
export function hashJobId(jobId: string): number {
  if (!jobId) return 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < jobId.length; i++) {
    hash ^= jobId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0; // unsigned 32-bit
}

/**
 * Seeded random number generator → returns float in [0, 1).
 * Deterministic: same (seed, index) → same result, always.
 */
export function seededRandom(seed: number, index: number): number {
  if (seed === 0) return 0.5; // neutral fallback
  const x = Math.sin(seed * 9301 + index * 49297) * 49297;
  return x - Math.floor(x);
}

/**
 * Returns integer in [min, max] inclusive, deterministic.
 */
export function seededInt(
  seed: number,
  index: number,
  min: number,
  max: number,
): number {
  if (seed === 0) return Math.floor((min + max) / 2); // midpoint fallback
  return min + Math.floor(seededRandom(seed, index) * (max - min + 1));
}

/**
 * Pick from array deterministically by seed + index.
 * Returns first element when seed === 0.
 */
export function seededPick<T>(
  seed: number,
  index: number,
  arr: readonly T[],
): T {
  if (seed === 0 || arr.length <= 1) return arr[0];
  return arr[seededInt(seed, index, 0, arr.length - 1)];
}
