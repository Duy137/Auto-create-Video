// remotion/src/scenes/StoryBeats.tsx
/**
 * StoryBeats scene — card_beats layout (card-based with step indicators).
 *
 * Fallback for failed-audit scenes. Decomposes narration into 2–5 beats
 * (text + emoji) rendered as GlassCard containers.
 *
 * Features:
 *   - Each beat in a GlassCard with step indicator (1/5, 2/5, etc.)
 *   - Current beat: active glow + left accent border
 *   - Past beats: faded + scaled down
 *   - AnimatedGradientBg for depth
 *   - Word-by-word reveal for current beat
 *   - Progress bar with rounded ends + glow
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
import { AnimatedGradientBg } from "../components/AnimatedGradientBg";
import { GlassCard } from "../components/GlassCard";

interface StoryBeatsProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: { text: string; startMs: number; endMs: number }[];
}

// ── Single Beat Card ──

const BeatCard: React.FC<{
  beat: StoryBeat;
  index: number;
  totalBeats: number;
  currentBeatIndex: number;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  sceneStartMs: number;
  currentMs: number;
}> = ({
  beat,
  index,
  totalBeats,
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

  // Spring entrance
  const entranceProgress = spring({
    frame: Math.max(0, frame - beatStartFrame),
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.5 },
  });

  // Visual state
  let opacity: number;
  let scale: number;
  let yOffset: number;

  if (isFuture) {
    opacity = 0;
    scale = 0.92;
    yOffset = 30;
  } else if (isCurrent) {
    opacity = interpolate(entranceProgress, [0, 1], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    scale = interpolate(entranceProgress, [0, 1], [0.9, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    yOffset = interpolate(entranceProgress, [0, 1], [20, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else {
    // Past beat
    const distance = currentBeatIndex - index;
    opacity = Math.max(0.3, 0.7 - distance * 0.12);
    scale = Math.max(0.85, 0.95 - distance * 0.03);
    yOffset = 0;
  }

  // Word-by-word reveal
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

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${yOffset}px) scale(${scale})`,
        transformOrigin: "left center",
        marginBottom: 16,
      }}
    >
      <GlassCard
        active={isCurrent}
        glowColor={colorPalette.primary}
        accentSide={isCurrent ? "left" : "none"}
        accentColors={[colorPalette.primary, colorPalette.secondary]}
        padding={20}
        borderRadius={16}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          {/* Emoji */}
          <div
            style={{
              fontSize: isCurrent ? 52 : 40,
              lineHeight: 1,
              flexShrink: 0,
              filter: isCurrent
                ? `drop-shadow(0 0 12px ${colorPalette.primary}50)`
                : "none",
            }}
          >
            {beat.emoji}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Step indicator */}
            <div
              style={{
                fontFamily,
                fontSize: 12,
                fontWeight: 700,
                color: isCurrent ? colorPalette.primary : `${colorPalette.text}50`,
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              {index + 1}/{totalBeats}
            </div>

            {/* Text */}
            <div
              style={{
                fontFamily,
                fontSize: isCurrent ? 26 : 22,
                fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? colorPalette.text : `${colorPalette.text}90`,
                lineHeight: 1.35,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
              }}
            >
              {revealText}
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

// ── Main Component ──

export const StoryBeats: React.FC<StoryBeatsProps> = ({
  scene,
  colorPalette,
}) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const exitOpacity = useExitAnimation();

  const beats: StoryBeat[] = scene.storyBeats ?? [];
  const sceneStartMs = scene.startMs;
  const sceneEndMs = scene.endMs;

  // Determine current beat
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

  // Progress (0..1)
  const totalDuration = Math.max(1, sceneEndMs - sceneStartMs);
  const progress = Math.min(
    1,
    Math.max(0, (currentMs - sceneStartMs) / totalDuration),
  );

  // Header animation
  const headerOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Empty-beat fallback
  if (beats.length === 0) {
    return (
      <AbsoluteFill style={{ opacity: exitOpacity }}>
        <AnimatedGradientBg
          colorPalette={colorPalette}
          intensity="normal"
          withParticles={true}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 80,
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: 48,
              fontWeight: 800,
              color: colorPalette.text,
              textAlign: "center",
              opacity: headerOpacity,
              textShadow: "0 2px 12px rgba(0,0,0,0.4)",
            }}
          >
            {scene.narration || scene.visualDescription}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  const stackTop = Math.round(height * 0.10);

  return (
    <AbsoluteFill style={{ opacity: exitOpacity }}>
      {/* Animated background */}
      <AnimatedGradientBg
        colorPalette={colorPalette}
        intensity="subtle"
        withParticles={true}
        particleDensity={10}
      />

      {/* Beat cards stack */}
      <div
        style={{
          position: "absolute",
          top: stackTop,
          left: 40,
          right: 40,
          bottom: 120,
        }}
      >
        {beats.map((beat, i) => (
          <BeatCard
            key={i}
            beat={beat}
            index={i}
            totalBeats={beats.length}
            currentBeatIndex={currentBeatIndex}
            colorPalette={colorPalette}
            frame={frame}
            fps={fps}
            sceneStartMs={sceneStartMs}
            currentMs={currentMs}
          />
        ))}
      </div>

      {/* Progress bar — rounded + glow */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 50,
          right: 50,
          height: 5,
          borderRadius: 3,
          backgroundColor: `${colorPalette.text}15`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress * 100}%`,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
            boxShadow: `0 0 10px ${colorPalette.primary}40`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
