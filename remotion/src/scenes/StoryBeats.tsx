// remotion/src/scenes/StoryBeats.tsx
/**
 * StoryBeats scene — Concept D fallback for failed-audit scenes.
 *
 * When Pexels returns no fitting media, the backend decomposes the
 * scene's narration into 2–5 "beats" (text + emoji) and renders
 * them as a vertical stack-up timeline:
 *
 *   - Past beats: stacked at top, faded + scaled down
 *   - Current beat: centered, scale 1.05, glow effect
 *   - Future beats: hidden
 *
 * Visual is consistent with the rest of the video (uses colorPalette,
 * Noto Sans VN font) but renders entirely without external media.
 *
 * [CryptoVN Custom] Cherry-picked from upstream A20-App-160.
 */

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import type { SceneData, VideoProps, StoryBeat } from "../schemas/videoProps";
import { fontFamily } from "../lib/fonts";
import { useExitAnimation } from "../lib/useExitAnimation";

interface StoryBeatsProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: { text: string; startMs: number; endMs: number }[];
}

const BEAT_HEIGHT = 200;
const BEAT_GAP = 28;
const STACK_TOP_PADDING = 200;

// ── Single beat row ──

const SingleBeat: React.FC<{
  beat: StoryBeat;
  index: number;
  currentBeatIndex: number;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  sceneStartMs: number;
  currentMs: number;
}> = ({
  beat,
  index,
  currentBeatIndex,
  colorPalette,
  frame,
  fps,
  sceneStartMs,
  currentMs,
}) => {
  const isCurrent = index === currentBeatIndex;
  const isPast = index < currentBeatIndex;
  const isFuture = index > currentBeatIndex;

  // Frame at which this beat starts (relative to scene)
  const beatStartFrame = Math.max(
    0,
    Math.round(((beat.startMs - sceneStartMs) / 1000) * fps),
  );

  // Spring-driven entrance for the current beat
  const entranceProgress = spring({
    frame: Math.max(0, frame - beatStartFrame),
    fps,
    config: { damping: 18, stiffness: 130, mass: 0.5 },
  });

  // Visual state per beat
  let opacity: number;
  let scale: number;
  let yOffset: number;
  let xOffset: number;
  let glowIntensity: number;

  if (isFuture) {
    opacity = 0;
    scale = 0.9;
    yOffset = 50;
    xOffset = -80;
    glowIntensity = 0;
  } else if (isCurrent) {
    opacity = interpolate(entranceProgress, [0, 1], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    scale = interpolate(entranceProgress, [0, 1], [0.85, 1.05], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    yOffset = interpolate(entranceProgress, [0, 1], [40, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    xOffset = interpolate(entranceProgress, [0, 1], [-100, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    // Gentle pulse: amplitude 0.1 around 0.4 baseline
    glowIntensity = 0.4 + Math.sin(frame / 8) * 0.1;
  } else {
    // Past beat — fade based on how far back
    const distance = currentBeatIndex - index;
    opacity = Math.max(0.25, 0.7 - distance * 0.15);
    scale = Math.max(0.75, 0.95 - distance * 0.05);
    yOffset = 0;
    xOffset = 0;
    glowIntensity = 0;
  }

  // Convert glowIntensity (0..0.6) to hex alpha (00..FF)
  const glowAlpha = Math.max(0, Math.min(255, Math.round(glowIntensity * 255)));
  const glowAlphaHex = glowAlpha < 16
    ? `0${glowAlpha.toString(16)}`
    : glowAlpha.toString(16);

  // Word-by-word reveal while the beat is active.
  const words = beat.text.split(/\s+/).filter(Boolean);
  const beatDuration = Math.max(1, beat.endMs - beat.startMs);
  const revealProgress = isPast
    ? 1
    : isCurrent
      ? Math.max(0, Math.min(1, (currentMs - beat.startMs) / beatDuration))
      : 0;
  const revealCount = words.length === 0
    ? 0
    : Math.max(1, Math.ceil(words.length * revealProgress));
  const revealText = isFuture ? "" : words.slice(0, revealCount).join(" ");

  // Position: stacked from top
  const baseTop = index * (BEAT_HEIGHT + BEAT_GAP);

  return (
    <div
      style={{
        position: "absolute",
        top: baseTop + yOffset,
        left: 60,
        right: 60,
        height: BEAT_HEIGHT,
        display: "flex",
        alignItems: "center",
        gap: 24,
        opacity,
        transform: `translateX(${xOffset}px) scale(${scale})`,
        transformOrigin: "left center",
      }}
    >
      {/* Emoji */}
      <div
        style={{
          fontSize: isCurrent ? 100 : 72,
          lineHeight: 1,
          flexShrink: 0,
          filter: isCurrent
            ? `drop-shadow(0 0 24px ${colorPalette.primary}${glowAlphaHex})`
            : "none",
        }}
      >
        {beat.emoji}
      </div>

      {/* Text */}
      <div
        style={{
          flex: 1,
          fontFamily,
          fontSize: isCurrent ? 56 : 40,
          fontWeight: isCurrent ? 800 : 600,
          color: isCurrent ? colorPalette.text : `${colorPalette.text}99`,
          lineHeight: 1.25,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
        }}
      >
        {revealText}
      </div>
    </div>
  );
};

// ── Main component ──

export const StoryBeats: React.FC<StoryBeatsProps> = ({
  scene,
  colorPalette,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOpacity = useExitAnimation();

  const beats: StoryBeat[] = scene.storyBeats ?? [];
  const sceneStartMs = scene.startMs;
  const sceneEndMs = scene.endMs;

  // Determine current beat based on elapsed time inside scene
  const currentMs = sceneStartMs + (frame / fps) * 1000;
  let currentBeatIndex = -1;
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const isLast = i === beats.length - 1;
    if (currentMs >= b.startMs && (isLast || currentMs < beats[i + 1].startMs)) {
      currentBeatIndex = i;
      break;
    }
  }
  if (currentBeatIndex < 0 && beats.length > 0) {
    currentBeatIndex = currentMs < beats[0].startMs ? 0 : beats.length - 1;
  }

  // Progress bar progress (0..1)
  const totalDuration = Math.max(1, sceneEndMs - sceneStartMs);
  const progress = Math.min(
    1,
    Math.max(0, (currentMs - sceneStartMs) / totalDuration),
  );

  // Header animation
  const headerOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Empty-beat fallback: render scene title only
  if (beats.length === 0) {
    return (
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${colorPalette.primary}20 0%, ${colorPalette.background} 50%, ${colorPalette.secondary}20 100%)`,
          opacity: exitOpacity,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 64,
            fontWeight: 800,
            color: colorPalette.text,
            textAlign: "center",
            opacity: headerOpacity,
          }}
        >
          {scene.narration || scene.visualDescription}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${colorPalette.primary}15 0%, ${colorPalette.background} 50%, ${colorPalette.secondary}15 100%)`,
        opacity: exitOpacity,
      }}
    >
      {/* Beats stack */}
      <div
        style={{
          position: "absolute",
          top: STACK_TOP_PADDING,
          left: 0,
          right: 0,
          bottom: 200,
        }}
      >
        {beats.map((beat, i) => (
          <SingleBeat
            key={i}
            beat={beat}
            index={i}
            currentBeatIndex={currentBeatIndex}
            colorPalette={colorPalette}
            frame={frame}
            fps={fps}
            sceneStartMs={sceneStartMs}
            currentMs={currentMs}
          />
        ))}
      </div>

      {/* Progress bar at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: 60,
          right: 60,
          height: 4,
          borderRadius: 2,
          backgroundColor: `${colorPalette.text}20`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress * 100}%`,
            borderRadius: 2,
            background: `linear-gradient(90deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
