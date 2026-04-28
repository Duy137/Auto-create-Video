// remotion/src/scenes/Comparison.tsx
/**
 * Comparison scene — split screen A vs B.
 * Left/right sides with sentiment color-coding and VS badge.
 * Points stagger animate from outside edges inward.
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
import { findKeywordTimestamp } from "../lib/voiceSync";
import { useExitAnimation } from "../lib/useExitAnimation";

interface ComparisonProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: { text: string; startMs: number; endMs: number }[];
}

const SENTIMENT_COLORS: Record<string, { bg: string; accent: string }> = {
  positive: { bg: "rgba(34,197,94,0.10)", accent: "#22C55E" },
  negative: { bg: "rgba(239,68,68,0.10)", accent: "#EF4444" },
  neutral: { bg: "rgba(255,255,255,0.04)", accent: "#94A3B8" },
};

export const Comparison: React.FC<ComparisonProps> = ({
  scene,
  colorPalette,
  wordTimestamps = [],
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOpacity = useExitAnimation();

  const sides = scene.comparisonSides ?? [];
  if (sides.length < 2) {
    return (
      <AbsoluteFill
        style={{ background: colorPalette.background, opacity: exitOpacity }}
      />
    );
  }

  const [left, right] = sides;

  // Header animation
  const headerOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // VS badge animation
  const vsProgress = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 12, stiffness: 180, mass: 0.5 },
  });
  const vsScale = interpolate(vsProgress, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const leftColors = SENTIMENT_COLORS[left.sentiment] ?? SENTIMENT_COLORS.neutral;
  const rightColors = SENTIMENT_COLORS[right.sentiment] ?? SENTIMENT_COLORS.neutral;

  // Voice-sync: find when each side's label is mentioned
  const sceneMidMs = (scene.startMs + scene.endMs) / 2;
  const leftStartFrame = (() => {
    const ms = findKeywordTimestamp(left.label, wordTimestamps, scene.startMs, sceneMidMs);
    return ms >= 0 ? Math.round(((ms - scene.startMs) / 1000) * fps) : 5;
  })();
  const rightStartFrame = (() => {
    const ms = findKeywordTimestamp(right.label, wordTimestamps, sceneMidMs, scene.endMs);
    return ms >= 0 ? Math.round(((ms - scene.startMs) / 1000) * fps) : Math.round(((sceneMidMs - scene.startMs) / 1000) * fps);
  })();

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
          top: 160,
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

      {/* Split container */}
      <div
        style={{
          position: "absolute",
          top: 320,
          bottom: 460,
          left: 40,
          right: 40,
          display: "flex",
          flexDirection: "row",
          gap: 16,
        }}
      >
        {/* Left side */}
        <SidePanel
          side={left}
          colors={leftColors}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          direction="left"
          baseDelay={leftStartFrame}
        />

        {/* VS Badge */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%) scale(${vsScale})`,
            zIndex: 10,
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            boxShadow: `0 0 24px ${colorPalette.primary}60`,
          }}
        >
          <span
            style={{
              fontFamily,
              fontSize: 22,
              fontWeight: 900,
              color: "#FFFFFF",
              letterSpacing: 1,
            }}
          >
            VS
          </span>
        </div>

        {/* Right side */}
        <SidePanel
          side={right}
          colors={rightColors}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          direction="right"
          baseDelay={rightStartFrame}
        />
      </div>
    </AbsoluteFill>
  );
};

// ── Side Panel ──

const SidePanel: React.FC<{
  side: NonNullable<SceneData["comparisonSides"]>[0];
  colors: { bg: string; accent: string };
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  direction: "left" | "right";
  baseDelay?: number;
}> = ({ side, colors, colorPalette, frame, fps, direction, baseDelay = 5 }) => {
  const isLeft = direction === "left";

  // Panel slide-in animation
  const panelProgress = spring({
    frame: Math.max(0, frame - baseDelay),
    fps,
    config: { damping: 18, stiffness: 100, mass: 0.6 },
  });
  const panelOpacity = interpolate(frame, [baseDelay, baseDelay + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const panelTranslateX = interpolate(
    panelProgress,
    [0, 1],
    [isLeft ? -80 : 80, 0],
  );

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        borderRadius: 20,
        backgroundColor: colors.bg,
        border: `1px solid ${colors.accent}30`,
        padding: "28px 20px",
        opacity: panelOpacity,
        transform: `translateX(${panelTranslateX}px)`,
        overflow: "hidden",
      }}
    >
      {/* Side label */}
      <div
        style={{
          fontFamily,
          fontSize: 28,
          fontWeight: 800,
          color: colors.accent,
          textAlign: "center",
          marginBottom: 24,
          letterSpacing: 1,
        }}
      >
        {side.label}
      </div>

      {/* Divider */}
      <div
        style={{
          width: "60%",
          height: 3,
          borderRadius: 2,
          background: `${colors.accent}40`,
          margin: "0 auto 20px",
        }}
      />

      {/* Points */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {side.points.slice(0, 5).map((point, i) => {
          const pointDelay = baseDelay + 10 + i * 8;
          const pointProgress = spring({
            frame: Math.max(0, frame - pointDelay),
            fps,
            config: { damping: 16, stiffness: 120, mass: 0.5 },
          });
          const pointOpacity = interpolate(
            frame,
            [pointDelay, pointDelay + 10],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const pointTranslateX = interpolate(
            pointProgress,
            [0, 1],
            [isLeft ? -40 : 40, 0],
          );

          return (
            <div
              key={i}
              style={{
                fontFamily,
                fontSize: autoFontSize(point, 26, 20),
                fontWeight: 600,
                color: colorPalette.text,
                opacity: pointOpacity,
                transform: `translateX(${pointTranslateX}px)`,
                padding: "10px 16px",
                borderRadius: 12,
                backgroundColor: `${colorPalette.text}06`,
                borderLeft: `3px solid ${colors.accent}60`,
                lineHeight: 1.3,
              }}
            >
              {point}
            </div>
          );
        })}
      </div>
    </div>
  );
};
