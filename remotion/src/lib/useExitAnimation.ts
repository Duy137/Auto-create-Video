// remotion/src/lib/useExitAnimation.ts
/**
 * Shared exit animation hook — provides a fade-out opacity value
 * for the last N frames of a scene.
 *
 * Apply to the root container of each scene component:
 *   const exitOpacity = useExitAnimation();
 *   <AbsoluteFill style={{ opacity: exitOpacity }}>
 *
 * When used with TransitionSeries, the exit animation creates
 * a smooth visual bridge between scenes.
 */

import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

/**
 * Returns an opacity value that fades from 1 → 0 over the last `marginFrames`.
 *
 * @param marginFrames - Number of frames for the fade-out (default: 8)
 * @returns Opacity value between 0 and 1
 */
export function useExitAnimation(marginFrames: number = 8): number {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Don't animate if scene is too short
  if (durationInFrames <= marginFrames * 2) {
    return 1;
  }

  return interpolate(
    frame,
    [durationInFrames - marginFrames, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}
