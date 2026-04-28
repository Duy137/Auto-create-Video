// remotion/src/scenes/TitleCard.tsx
/**
 * Title Card scene — opening/closing screen.
 * Slam Bounce line-by-line animation with optional badge + icon.
 *
 * Uses `titleLines` from LLM when available, falls back to
 * regex-based line splitting from narration text.
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
import { useExitAnimation } from "../lib/useExitAnimation";
import { FloatingParticles } from "../components/FloatingParticles";

interface TitleCardProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
}

type TitleLine = { text: string; style: "normal" | "highlight" | "accent" };

/** Regex-based fallback — split narration into ~3 display lines */
function splitTitleToLines(title: string): TitleLine[] {
  const words = title.split(/\s+/);
  const lines: TitleLine[] = [];
  const wordsPerLine = Math.ceil(words.length / 3);

  for (let i = 0; i < words.length; i += wordsPerLine) {
    const text = words.slice(i, i + wordsPerLine).join(" ");
    const lineIndex = lines.length;
    lines.push({
      text,
      style: lineIndex === 0 ? "normal" : lineIndex === 1 ? "highlight" : "accent",
    });
  }
  return lines;
}

/** Top badge whitelist */
const BADGE_WHITELIST = new Set(["BREAKING", "NEW", "TIP", "WARNING", "UPDATE"]);

const STAGGER_DELAY = 10; // frames between lines (~0.33s at 30fps)

export const TitleCard: React.FC<TitleCardProps> = ({
  scene,
  colorPalette,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOpacity = useExitAnimation();
  const sceneDurationFrames = Math.max(
    1,
    Math.round(((scene.endMs - scene.startMs) / 1000) * fps)
  );

  // Fade in
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Animated background gradient
  const gradientAngle = interpolate(
    frame,
    [0, sceneDurationFrames],
    [160, 200],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const gradientStop = interpolate(Math.sin(frame * 0.02), [-1, 1], [35, 45]);

  // Subtle glow pulse
  const glowIntensity = interpolate(
    Math.sin(frame * 0.05),
    [-1, 1],
    [0.3, 0.6]
  );

  // ── Resolve title lines (LLM → fallback) ──
  const lines: TitleLine[] =
    scene.titleLines && scene.titleLines.length > 0
      ? (scene.titleLines as TitleLine[])
      : splitTitleToLines(scene.narration);

  // ── Optional badge/icon ──
  const topBadge = scene.topBadge && BADGE_WHITELIST.has(scene.topBadge)
    ? scene.topBadge
    : null;
  const topIcon = scene.topIcon ?? null;

  // Badge animation
  const badgeProgress = spring({
    frame: Math.max(0, frame - 5),
    fps,
    config: { damping: 12, stiffness: 180, mass: 0.4 },
  });
  const badgeOpacity = interpolate(frame, [5, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${gradientAngle}deg, ${colorPalette.background} 0%, ${colorPalette.primary}22 ${gradientStop}%, ${colorPalette.background} 100%)`,
        opacity: opacity * exitOpacity,
      }}
    >
      {/* Floating particles for depth */}
      <FloatingParticles
        primaryColor={colorPalette.primary}
        secondaryColor={colorPalette.secondary}
      />

      {/* Decorative circles */}
      <div
        style={{
          position: "absolute",
          top: "15%",
          right: "-5%",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colorPalette.primary}20, transparent 70%)`,
          filter: "blur(40px)",
          opacity: glowIntensity,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "20%",
          left: "-10%",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colorPalette.secondary}18, transparent 70%)`,
          filter: "blur(50px)",
          opacity: glowIntensity * 0.7,
        }}
      />

      {/* Title content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 80px",
        }}
      >
        {/* Optional top icon */}
        {topIcon && (
          <div
            style={{
              fontSize: 64,
              marginBottom: 16,
              opacity: badgeOpacity,
              transform: `scale(${badgeProgress})`,
            }}
          >
            {topIcon}
          </div>
        )}

        {/* Optional badge */}
        {topBadge && (
          <div
            style={{
              marginBottom: 24,
              padding: "8px 24px",
              borderRadius: 20,
              backgroundColor: `${colorPalette.primary}33`,
              border: `2px solid ${colorPalette.primary}66`,
              opacity: badgeOpacity,
              transform: `scale(${badgeProgress})`,
            }}
          >
            <span
              style={{
                fontFamily,
                fontSize: 22,
                fontWeight: 800,
                color: colorPalette.primary,
                letterSpacing: 3,
                textTransform: "uppercase",
              }}
            >
              {topBadge}
            </span>
          </div>
        )}

        {/* Slam Bounce lines */}
        <div
          style={{
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          {lines.map((line, i) => {
            const lineDelay = i * STAGGER_DELAY;

            // Slam bounce: overshoot then settle
            const lineSpring = spring({
              frame: Math.max(0, frame - lineDelay),
              fps,
              config: { damping: 8, stiffness: 200, mass: 0.5 },
            });
            const lineScale = interpolate(lineSpring, [0, 1], [1.4, 1]);
            const lineY = interpolate(lineSpring, [0, 1], [120, 0]);
            const lineOpacity = interpolate(
              frame,
              [lineDelay, lineDelay + 8],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            // Glow pulse for highlight line (after bounce settles)
            const glowPulse =
              line.style === "highlight" && frame > lineDelay + 20
                ? Math.sin((frame - lineDelay - 20) * 0.08) * 0.3 + 0.7
                : 0;

            // Font size based on style + autoFontSize
            const fontSize =
              line.style === "highlight"
                ? autoFontSize(line.text, 96, 80, 12)
                : line.style === "accent"
                  ? autoFontSize(line.text, 72, 52, 15)
                  : autoFontSize(line.text, 64, 48, 15);

            // Color — colorPalette is now contrast-validated by pipeline
            const color =
              line.style === "highlight"
                ? colorPalette.primary
                : line.style === "accent"
                  ? colorPalette.secondary
                  : colorPalette.text;

            // Highlight gradient style
            const highlightStyle: React.CSSProperties =
              line.style === "highlight"
                ? {
                    background: `linear-gradient(135deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    filter: `drop-shadow(0 0 ${20 + glowPulse * 20}px ${colorPalette.primary}80)`,
                  }
                : {};

            return (
              <div
                key={i}
                style={{
                  fontFamily,
                  fontSize,
                  fontWeight: line.style === "highlight" ? 900 : line.style === "accent" ? 700 : 800,
                  color,
                  opacity: lineOpacity,
                  transform: `translateY(${lineY}px) scale(${lineScale})`,
                  lineHeight: 1.2,
                  letterSpacing: line.style === "highlight" ? 2 : 0,
                  textTransform: line.style === "highlight" ? "uppercase" : "none",
                  textShadow:
                    line.style === "highlight"
                      ? undefined
                      : `0 4px 20px rgba(0,0,0,0.7), 0 0 40px rgba(0,0,0,0.3)`,
                  ...highlightStyle,
                }}
              >
                {line.text}
              </div>
            );
          })}
        </div>

        {/* Accent line */}
        <div
          style={{
            marginTop: 40,
            width: interpolate(
              frame,
              [lines.length * STAGGER_DELAY + 10, lines.length * STAGGER_DELAY + 30],
              [0, 240],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            ),
            height: 6,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
