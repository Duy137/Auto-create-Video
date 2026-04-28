// remotion/src/scenes/StatsHighlight.tsx
/**
 * Stats Highlight scene — dark bg + large animated count-up numbers.
 * Supports two layouts:
 *   - vertical_stack (default): color-coded boxes stacked vertically
 *   - horizontal_grid: color-coded boxes in a horizontal row
 *
 * Animation: number count-up + scale-in per stat box.
 */

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import type { SceneData, VideoProps } from "../schemas/videoProps";
import { fontFamily } from "../lib/fonts";
import { autoFontSize } from "../lib/textUtils";
import { getItemRevealFrames } from "../lib/voiceSync";
import { useExitAnimation } from "../lib/useExitAnimation";

interface StatsHighlightProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: { text: string; startMs: number; endMs: number }[];
}

const toHexAlpha = (opacity: number): string => {
  const clamped = Math.max(0, Math.min(1, opacity));
  const alphaInt = Math.round(clamped * 255);
  return (
    Math.floor(alphaInt / 16).toString(16) +
    (alphaInt % 16).toString(16)
  );
};

// ── Shared: Animated count-up number ──

const CountUp: React.FC<{
  value: string;
  frame: number;
  fps: number;
  delay: number;
  color: string;
  fontSize?: number;
  progressOverride?: number;
}> = ({
  value,
  frame,
  fps,
  delay,
  color,
  fontSize = 72,
  progressOverride,
}) => {
  const numericMatch = value.match(/^([\d.]+)(.*)$/);
  const isNumeric = numericMatch !== null;
  const numValue = isNumeric ? parseFloat(numericMatch![1]) : 0;
  const suffix = isNumeric ? numericMatch![2] : "";

  const progress =
    progressOverride ??
    spring({
      frame: Math.max(0, frame - delay),
      fps,
      config: { damping: 30, stiffness: 60, mass: 1 },
    });

  const completionPulseStrength = interpolate(
    progress,
    [0.9, 0.98, 1],
    [0, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );
  const pulseScale =
    1 + Math.sin(Math.max(0, frame - delay) * 0.35) * 0.05 * completionPulseStrength;
  const glowOpacity = 0.12 + completionPulseStrength * 0.25;

  const displayValue = isNumeric
    ? (numValue * progress).toFixed(numValue % 1 === 0 ? 0 : 1) + suffix
    : value;

  return (
    <span
      style={{
        fontFamily,
        fontSize,
        fontWeight: 900,
        color,
        letterSpacing: -2,
        display: "inline-block",
        transform: `scale(${pulseScale})`,
        textShadow: `0 0 24px ${color}${toHexAlpha(glowOpacity)}`,
      }}
    >
      {displayValue}
    </span>
  );
};

// ── Layout: Vertical Stack (existing/default) ──

const VerticalStatsLayout: React.FC<{
  stats: NonNullable<SceneData["stats"]>;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  revealFrames: number[];
}> = ({ stats, colorPalette, frame, fps, revealFrames }) => (
  <div
    style={{
      position: "absolute",
      top: 380,
      left: 60,
      right: 60,
      display: "flex",
      flexDirection: "column",
      gap: 28,
    }}
  >
    {stats.map((stat, i) => {
      const delay = revealFrames[i];
      const isEvenCard = i % 2 === 0;

      const boxProgress = spring({
        frame: Math.max(0, frame - delay),
        fps,
        config: { damping: 18, stiffness: 100, mass: 0.5 },
      });

      const countProgress = spring({
        frame: Math.max(0, frame - delay - 5),
        fps,
        config: { damping: 30, stiffness: 60, mass: 1 },
      });

      const boxOpacity = interpolate(frame, [delay, delay + 8], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

      const translateX = interpolate(
        boxProgress,
        [0, 1],
        [isEvenCard ? -60 : 60, 0]
      );
      const rotation = interpolate(boxProgress, [0, 1], [isEvenCard ? -2 : 2, 0]);
      const scale = interpolate(boxProgress, [0, 1], [0.92, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const shadowOpacity = interpolate(boxProgress, [0, 0.5, 1], [0, 0.12, 0.3], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const flashOpacity = interpolate(countProgress, [0.9, 1], [0, 0.22], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const underlineWidth = interpolate(countProgress, [0, 1], [0, 100], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

      return (
        <div
          key={i}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 28,
            padding: "32px 36px",
            borderRadius: 24,
            backgroundColor: `${stat.color}15`,
            border: `2px solid ${stat.color}40`,
            opacity: boxOpacity,
            transform: `translateX(${translateX}px) rotate(${rotation}deg) scale(${scale})`,
            boxShadow: `0 8px 32px rgba(0, 0, 0, ${shadowOpacity})`,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 24,
              backgroundColor: `${stat.color}${toHexAlpha(flashOpacity)}`,
              pointerEvents: "none",
            }}
          />

          {/* Color accent bar */}
          <div
            style={{
              position: "relative",
              width: 6,
              height: 60,
              borderRadius: 3,
              backgroundColor: stat.color,
              flexShrink: 0,
            }}
          />
          {/* Stat content */}
          <div style={{ flex: 1, position: "relative" }}>
            <div
              style={{
                fontFamily,
                fontSize: 24,
                fontWeight: 500,
                color: `${colorPalette.text}BB`,
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {stat.label}
            </div>
            <CountUp
              value={stat.value}
              frame={frame}
              fps={fps}
              delay={delay + 5}
              color={stat.color}
              progressOverride={countProgress}
            />
            <div
              style={{
                marginTop: 10,
                width: `${underlineWidth}%`,
                height: 4,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
              }}
            />
          </div>
        </div>
      );
    })}
  </div>
);

// ── Layout: Horizontal Grid (new) ──

const HorizontalStatsLayout: React.FC<{
  stats: NonNullable<SceneData["stats"]>;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  revealFrames: number[];
}> = ({ stats, colorPalette, frame, fps, revealFrames }) => (
  <div
    style={{
      position: "absolute",
      top: 380,
      bottom: 200,
      left: 40,
      right: 40,
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    }}
  >
    {stats.map((stat, i) => {
      const delay = revealFrames[i];
      const isEvenCard = i % 2 === 0;

      const boxProgress = spring({
        frame: Math.max(0, frame - delay),
        fps,
        config: { damping: 18, stiffness: 120, mass: 0.4 },
      });

      const countProgress = spring({
        frame: Math.max(0, frame - delay - 5),
        fps,
        config: { damping: 30, stiffness: 60, mass: 1 },
      });

      const boxOpacity = interpolate(frame, [delay, delay + 8], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

      const translateX = interpolate(
        boxProgress,
        [0, 1],
        [isEvenCard ? -50 : 50, 0]
      );
      const rotation = interpolate(boxProgress, [0, 1], [isEvenCard ? -2 : 2, 0]);
      const scale = interpolate(boxProgress, [0, 1], [0.9, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const shadowOpacity = interpolate(boxProgress, [0, 0.5, 1], [0, 0.12, 0.28], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const flashOpacity = interpolate(countProgress, [0.9, 1], [0, 0.2], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const underlineWidth = interpolate(countProgress, [0, 1], [0, 100], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

      return (
        <div
          key={i}
          style={{
            flex: 1,
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px 12px",
            borderRadius: 16,
            backgroundColor: `${stat.color}25`,
            border: `2px solid ${stat.color}`,
            opacity: boxOpacity,
            transform: `translateX(${translateX}px) rotate(${rotation}deg) scale(${scale})`,
            boxShadow: `0 8px 32px rgba(0, 0, 0, ${shadowOpacity})`,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 16,
              backgroundColor: `${stat.color}${toHexAlpha(flashOpacity)}`,
              pointerEvents: "none",
            }}
          />

          {/* Label */}
          <div
            style={{
              position: "relative",
              fontFamily,
              fontSize: autoFontSize(stat.label, 22, 18),
              fontWeight: 600,
              color: stat.color,
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            {stat.label}
          </div>
          {/* Value */}
          <CountUp
            value={stat.value}
            frame={frame}
            fps={fps}
            delay={delay + 5}
            color={colorPalette.text}
            fontSize={36}
            progressOverride={countProgress}
          />
          <div
            style={{
              marginTop: 8,
              width: `${underlineWidth}%`,
              height: 4,
              borderRadius: 999,
              background: `linear-gradient(90deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
              position: "relative",
            }}
          />
        </div>
      );
    })}
  </div>
);

// ── Main Component ──

export const StatsHighlight: React.FC<StatsHighlightProps> = ({
  scene,
  colorPalette,
  wordTimestamps = [],
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stats = scene.stats ?? [];
  const exitOpacity = useExitAnimation();
  const layout = scene.layout ?? "vertical_stack";

  // Voice-sync reveal frames
  const revealFrames = getItemRevealFrames(
    stats.map((s) => ({ title: s.label })),
    wordTimestamps,
    scene.startMs,
    scene.endMs,
    fps,
  );

  // Header animation
  const headerOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: colorPalette.background,
        opacity: exitOpacity,
      }}
    >
      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: 180,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: headerOpacity,
          padding: "0 60px",
        }}
      >
        <h2
          style={{
            fontFamily,
            fontSize: 44,
            fontWeight: 800,
            color: colorPalette.text,
            margin: 0,
            lineHeight: 1.3,
            maxHeight: 120,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {scene.visualDescription}
        </h2>
      </div>

      {/* Stats — layout switch */}
      {layout === "horizontal_grid" ? (
        <HorizontalStatsLayout
          stats={stats}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          revealFrames={revealFrames}
        />
      ) : (
        <VerticalStatsLayout
          stats={stats}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          revealFrames={revealFrames}
        />
      )}
    </AbsoluteFill>
  );
};
