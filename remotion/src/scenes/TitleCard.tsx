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
  brandLogoUrl?: string | null;
  brandName?: string | null;
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

import { NewsIntroLayout } from "./title_card/NewsIntroLayout";
import { EducationalLayout } from "./title_card/EducationalLayout";
import { TutorialLayout } from "./title_card/TutorialLayout";
import { CommercialLayout } from "./title_card/CommercialLayout";

const DefaultTitleCard: React.FC<TitleCardProps> = ({
  scene,
  colorPalette,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
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
  const horizontalPadding = Math.round(width * 0.07);
  const topCircleSize = Math.max(Math.round(width * 0.36), 220);
  const bottomCircleSize = Math.max(Math.round(width * 0.44), 260);
  const iconSize = Math.max(44, Math.round(width * 0.06));
  const badgeFontSize = Math.max(16, Math.round(width * 0.02));
  const normalMax = Math.max(44, Math.round(width * 0.06));
  const highlightMax = Math.max(58, Math.round(width * 0.09));
  const accentMax = Math.max(48, Math.round(width * 0.07));
  const accentLineMaxWidth = Math.max(180, Math.round(width * 0.22));

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
          width: topCircleSize,
          height: topCircleSize,
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
          width: bottomCircleSize,
          height: bottomCircleSize,
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
          padding: `0 ${horizontalPadding}px`,
        }}
      >
        {/* Optional top icon */}
        {topIcon && (
          <div
            style={{
              fontSize: iconSize,
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
                fontSize: badgeFontSize,
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
                ? autoFontSize(line.text, highlightMax, Math.max(40, Math.round(width * 0.055)), 12)
                : line.style === "accent"
                  ? autoFontSize(line.text, accentMax, Math.max(32, Math.round(width * 0.045)), 15)
                  : autoFontSize(line.text, normalMax, Math.max(30, Math.round(width * 0.04)), 15);

            // Color — colorPalette is now contrast-validated by pipeline
            const lineColor =
              line.style === "highlight"
                ? colorPalette.primary
                : line.style === "accent"
                  ? colorPalette.secondary
                  : colorPalette.text;

            // Determine tint color for normal text based on the NEXT line's color
            const nextStyle = lines[i + 1]?.style;
            const tintColor = nextStyle === "highlight" ? colorPalette.primary : nextStyle === "accent" ? colorPalette.secondary : null;
            const normalColor = tintColor ? `color-mix(in srgb, #ffffff 85%, ${tintColor})` : "#ffffff";

            // Highlight solid color style
            const highlightStyle: React.CSSProperties =
              line.style === "highlight"
                ? {
                    color: lineColor,
                    filter: `drop-shadow(0 0 ${20 + glowPulse * 20}px ${colorPalette.primary}90)`,
                  }
                : line.style === "accent"
                  ? {
                      color: lineColor,
                      filter: `drop-shadow(0 0 15px ${colorPalette.secondary}70)`,
                    }
                  : { color: normalColor, filter: `drop-shadow(0 4px 20px rgba(0,0,0,0.8))` };

            return (
              <div
                key={i}
                style={{
                  fontFamily,
                  fontSize,
                  fontWeight: 900,
                  opacity: lineOpacity,
                  transform: `translateY(${lineY}px) scale(${lineScale})`,
                  lineHeight: 1.35,
                  letterSpacing: -1,
                  textTransform: "uppercase",
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
            marginTop: Math.round(height * 0.02),
            width: interpolate(
              frame,
              [lines.length * STAGGER_DELAY + 10, lines.length * STAGGER_DELAY + 30],
              [0, accentLineMaxWidth],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            ),
            height: 6,
            borderRadius: 3,
            background: `linear-gradient(90deg, transparent, ${colorPalette.primary}, ${colorPalette.secondary}, transparent)`,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const TitleCard: React.FC<TitleCardProps> = (props) => {
  const layout = props.scene.layout;
  
  switch (layout) {
    case "news_intro":
      return <NewsIntroLayout {...props} />;
    case "educational":
      return <EducationalLayout {...props} />;
    case "tutorial":
      return <TutorialLayout {...props} />;
    case "commercial":
      return <CommercialLayout {...props} />;
    default:
      return <DefaultTitleCard {...props} />;
  }
};
