// remotion/src/components/EmojiPopup.tsx
/**
 * Emoji Pop-up — decorative emoji overlay per scene.
 *
 * Uses hash-based positioning to place emoji in different corners
 * based on narration content (deterministic, no randomness).
 *
 * Spring bounce entrance + fade-out exit.
 * Max 1 emoji per scene, not shown on title_card scenes.
 */

import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";

interface EmojiPopupProps {
  emoji: string;
  narration: string; // used for hash-based positioning
  sceneStartMs: number;
  sceneEndMs: number;
}

// Simple string hash for deterministic positioning
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Positions near center — above or overlapping media area
// On 1080×1920: media typically occupies ~middle 60% vertically
const POSITIONS: React.CSSProperties[] = [
  { top: 260, left: 0, right: 0, textAlign: 'center' as const },  // center-top
  { top: 320, left: 120 },                                         // left
  { top: 320, right: 120 },                                        // right
  { top: 260, right: 160 },                                        // top-right
];

export const EmojiPopup: React.FC<EmojiPopupProps> = ({
  emoji,
  narration,
  sceneStartMs,
  sceneEndMs,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sceneDurationFrames = Math.round(
    ((sceneEndMs - sceneStartMs) / 1000) * fps,
  );

  // Appear at ~1.5s into scene (or 20% of scene, whichever is smaller)
  const appearFrame = Math.min(45, Math.round(sceneDurationFrames * 0.2));
  // Duration: 2 seconds (or until scene end minus buffer)
  const durationFrames = Math.min(120, sceneDurationFrames - appearFrame - 10);

  if (durationFrames <= 0) return null;

  const relativeFrame = frame - appearFrame;
  if (relativeFrame < 0 || relativeFrame > durationFrames) return null;

  // Spring bounce entrance
  const bounceSpring = spring({
    frame: relativeFrame,
    fps,
    config: { damping: 8, stiffness: 200, mass: 0.5 },
  });
  const scale = interpolate(bounceSpring, [0, 1], [0, 1]);

  // Gentle floating motion
  const floatY = Math.sin(relativeFrame * 0.08) * 4;

  // Fade out near end
  const fadeOut = interpolate(
    relativeFrame,
    [durationFrames - 15, durationFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Hash-based position
  const posIndex = hashCode(narration) % POSITIONS.length;
  const position = POSITIONS[posIndex];

  return (
    <div
      style={{
        position: "absolute",
        ...position,
        fontSize: 144,
        transform: `scale(${scale}) translateY(${floatY}px)`,
        opacity: fadeOut,
        zIndex: 50,
        filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.5))",
        pointerEvents: "none",
      }}
    >
      {emoji}
    </div>
  );
};
