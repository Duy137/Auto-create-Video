// remotion/src/scenes/Comparison.tsx
/**
 * Comparison scene — A vs B with sentiment-coded sides.
 *
 * Two layout modes:
 *   - split_screen (DEFAULT): Classic left/right split with VS badge
 *   - stacked: Vertical layout, side A on top, side B on bottom
 *
 * Sizes designed for 1080×1920 (9:16 vertical video).
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
import { AnimatedGradientBg } from "../components/AnimatedGradientBg";
import { GlassCard } from "../components/GlassCard";

interface ComparisonProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: { text: string; startMs: number; endMs: number }[];
}

const SENTIMENT_COLORS: Record<string, { accent: string }> = {
  positive: { accent: "#22C55E" },
  negative: { accent: "#EF4444" },
  neutral: { accent: "#94A3B8" },
};

// ═════════════════════════════════════
// Shared: Header
// ═════════════════════════════════════

const ComparisonHeader: React.FC<{
  text: string;
  colorPalette: VideoProps["colorPalette"];
  opacity: number;
  width: number;
  height: number;
}> = ({ text, colorPalette, opacity, width, height }) => {
  const headerTop = Math.round(height * 0.12);
  const titleFontSize = Math.max(38, Math.round(width * 0.042));

  return (
    <div
      style={{
        position: "absolute",
        top: headerTop,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity,
        padding: `0 ${Math.round(width * 0.06)}px`,
        zIndex: 10,
      }}
    >
      <h2
        style={{
          fontFamily,
          fontSize: titleFontSize,
          fontWeight: 800,
          color: colorPalette.text,
          margin: 0,
          lineHeight: 1.25,
          maxHeight: Math.round(height * 0.1),
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          textShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}
      >
        {text}
      </h2>
    </div>
  );
};

// ═════════════════════════════════════
// Shared: VS Badge — LARGE
// ═════════════════════════════════════

const VSBadge: React.FC<{
  frame: number;
  fps: number;
  colorPalette: VideoProps["colorPalette"];
  size: number;
  baseDelay: number;
  style?: React.CSSProperties;
}> = ({ frame, fps, colorPalette, size, baseDelay, style }) => {
  const vsProgress = spring({
    frame: Math.max(0, frame - baseDelay),
    fps,
    config: { damping: 10, stiffness: 200, mass: 0.5 },
  });
  const vsScale = interpolate(vsProgress, [0, 1], [0, 1]);
  const glowPulse = interpolate(
    Math.sin(frame * 0.06),
    [-1, 1],
    [0.3, 0.7],
  );

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        transform: `scale(${vsScale})`,
        boxShadow: `0 0 ${Math.round(size * 0.6)}px ${colorPalette.primary}${Math.round(glowPulse * 255).toString(16).padStart(2, "0")}, 0 0 ${Math.round(size * 1.2)}px ${colorPalette.primary}20`,
        zIndex: 10,
        ...style,
      }}
    >
      <span
        style={{
          fontFamily,
          fontSize: Math.round(size * 0.38),
          fontWeight: 900,
          color: "#FFFFFF",
          letterSpacing: 2,
        }}
      >
        VS
      </span>
    </div>
  );
};

// ═════════════════════════════════════
// Shared: Points List — BIG TEXT
// ═════════════════════════════════════

const PointsList: React.FC<{
  points: string[];
  accentColor: string;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  baseDelay: number;
  slideDirection: "left" | "right" | "up";
  width: number;
}> = ({ points, accentColor, colorPalette, frame, fps, baseDelay, slideDirection, width }) => {
  const dotSize = Math.round(width * 0.014); // ~15px on 1080
  const pointFontSize = Math.round(width * 0.028); // ~30px on 1080

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: Math.round(width * 0.015),
      }}
    >
      {points.slice(0, 5).map((point, i) => {
        const pointDelay = baseDelay + 8 + i * 7;
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
        const slideOffset = slideDirection === "up"
          ? interpolate(pointProgress, [0, 1], [25, 0])
          : interpolate(pointProgress, [0, 1], [slideDirection === "left" ? -40 : 40, 0]);

        const transformProp = slideDirection === "up"
          ? `translateY(${slideOffset}px)`
          : `translateX(${slideOffset}px)`;

        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: Math.round(width * 0.02),
              opacity: pointOpacity,
              transform: transformProp,
              padding: `${Math.round(width * 0.012)}px ${Math.round(width * 0.018)}px`,
              borderRadius: Math.round(width * 0.015),
              backgroundColor: `${accentColor}08`,
            }}
          >
            {/* Accent dot */}
            <div
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: "50%",
                background: accentColor,
                marginTop: Math.round(pointFontSize * 0.2),
                flexShrink: 0,
                boxShadow: `0 0 10px ${accentColor}50`,
              }}
            />
            <div
              style={{
                fontFamily,
                fontSize: autoFontSize(point, pointFontSize, Math.round(pointFontSize * 0.75)),
                fontWeight: 600,
                color: colorPalette.text,
                lineHeight: 1.35,
              }}
            >
              {point}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ═════════════════════════════════════
// Layout: Split Screen (DEFAULT) — LARGER
// ═════════════════════════════════════

const SplitScreenLayout: React.FC<{
  sides: NonNullable<SceneData["comparisonSides"]>;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  leftStartFrame: number;
  rightStartFrame: number;
  width: number;
  height: number;
}> = ({ sides, colorPalette, frame, fps, leftStartFrame, rightStartFrame, width, height }) => {
  const [left, right] = sides;
  const leftColors = SENTIMENT_COLORS[left.sentiment] ?? SENTIMENT_COLORS.neutral;
  const rightColors = SENTIMENT_COLORS[right.sentiment] ?? SENTIMENT_COLORS.neutral;

  const splitTop = Math.round(height * 0.23);
  const splitBottom = Math.round(height * 0.06);
  const splitGap = Math.round(width * 0.025);
  const vsBadgeSize = Math.max(70, Math.round(width * 0.075)); // ~80px on 1080
  const labelFontSize = Math.round(width * 0.032); // ~34px on 1080

  return (
    <div
      style={{
        position: "absolute",
        top: splitTop,
        bottom: splitBottom,
        left: Math.round(width * 0.035),
        right: Math.round(width * 0.035),
        display: "flex",
        flexDirection: "row",
        gap: splitGap,
        alignItems: "stretch",
      }}
    >
      {/* Left panel */}
      {(() => {
        const panelProgress = spring({
          frame: Math.max(0, frame - leftStartFrame),
          fps,
          config: { damping: 18, stiffness: 100, mass: 0.6 },
        });
        const panelOpacity = interpolate(frame, [leftStartFrame, leftStartFrame + 15], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const panelSlide = interpolate(panelProgress, [0, 1], [-60, 0]);

        return (
          <div
            style={{
              flex: 1,
              opacity: panelOpacity,
              transform: `translateX(${panelSlide}px)`,
            }}
          >
            <GlassCard
              glowColor={leftColors.accent}
              accentSide="top"
              accentColors={[leftColors.accent, leftColors.accent + "80"]}
              padding={Math.round(width * 0.025)}
              borderRadius={22}
              style={{ height: "100%" }}
            >
              {/* Side label */}
              <div
                style={{
                  fontFamily,
                  fontSize: labelFontSize,
                  fontWeight: 800,
                  color: leftColors.accent,
                  textAlign: "center",
                  marginBottom: Math.round(width * 0.025),
                  letterSpacing: 2,
                }}
              >
                {left.label}
              </div>

              <PointsList
                points={left.points}
                accentColor={leftColors.accent}
                colorPalette={colorPalette}
                frame={frame}
                fps={fps}
                baseDelay={leftStartFrame}
                slideDirection="left"
                width={width}
              />
            </GlassCard>
          </div>
        );
      })()}

      {/* VS Badge (centered) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 10,
        }}
      >
        <VSBadge
          frame={frame}
          fps={fps}
          colorPalette={colorPalette}
          size={vsBadgeSize}
          baseDelay={10}
        />
      </div>

      {/* Right panel */}
      {(() => {
        const panelProgress = spring({
          frame: Math.max(0, frame - rightStartFrame),
          fps,
          config: { damping: 18, stiffness: 100, mass: 0.6 },
        });
        const panelOpacity = interpolate(frame, [rightStartFrame, rightStartFrame + 15], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const panelSlide = interpolate(panelProgress, [0, 1], [60, 0]);

        return (
          <div
            style={{
              flex: 1,
              opacity: panelOpacity,
              transform: `translateX(${panelSlide}px)`,
            }}
          >
            <GlassCard
              glowColor={rightColors.accent}
              accentSide="top"
              accentColors={[rightColors.accent, rightColors.accent + "80"]}
              padding={Math.round(width * 0.025)}
              borderRadius={22}
              style={{ height: "100%" }}
            >
              <div
                style={{
                  fontFamily,
                  fontSize: labelFontSize,
                  fontWeight: 800,
                  color: rightColors.accent,
                  textAlign: "center",
                  marginBottom: Math.round(width * 0.025),
                  letterSpacing: 2,
                }}
              >
                {right.label}
              </div>

              <PointsList
                points={right.points}
                accentColor={rightColors.accent}
                colorPalette={colorPalette}
                frame={frame}
                fps={fps}
                baseDelay={rightStartFrame}
                slideDirection="right"
                width={width}
              />
            </GlassCard>
          </div>
        );
      })()}
    </div>
  );
};

// ═════════════════════════════════════
// Layout: Stacked — LARGER
// ═════════════════════════════════════

const StackedLayout: React.FC<{
  sides: NonNullable<SceneData["comparisonSides"]>;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  leftStartFrame: number;
  rightStartFrame: number;
  width: number;
  height: number;
}> = ({ sides, colorPalette, frame, fps, leftStartFrame, rightStartFrame, width, height }) => {
  const [sideA, sideB] = sides;
  const colorsA = SENTIMENT_COLORS[sideA.sentiment] ?? SENTIMENT_COLORS.neutral;
  const colorsB = SENTIMENT_COLORS[sideB.sentiment] ?? SENTIMENT_COLORS.neutral;

  const containerTop = Math.round(height * 0.23);
  const vsBadgeSize = Math.max(60, Math.round(width * 0.065));
  const labelFontSize = Math.round(width * 0.032);
  const labelDotSize = Math.round(width * 0.018);
  const sidePad = Math.round(width * 0.04);

  return (
    <div
      style={{
        position: "absolute",
        top: containerTop,
        left: sidePad,
        right: sidePad,
        bottom: Math.round(height * 0.04),
        display: "flex",
        flexDirection: "column",
        gap: Math.round(height * 0.012),
        alignItems: "stretch",
        justifyContent: "center",
      }}
    >
      {/* Side A (top) */}
      {(() => {
        const panelProgress = spring({
          frame: Math.max(0, frame - leftStartFrame),
          fps,
          config: { damping: 16, stiffness: 110, mass: 0.5 },
        });
        const panelOpacity = interpolate(frame, [leftStartFrame, leftStartFrame + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const panelSlide = interpolate(panelProgress, [0, 1], [-30, 0]);

        return (
          <div
            style={{

              opacity: panelOpacity,
              transform: `translateY(${panelSlide}px)`,
            }}
          >
            <GlassCard
              glowColor={colorsA.accent}
              accentSide="left"
              accentColors={[colorsA.accent, colorsA.accent + "80"]}
              padding={Math.round(width * 0.025)}
              borderRadius={20}
            >
              {/* Label row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: Math.round(width * 0.02),
                  marginBottom: Math.round(width * 0.02),
                }}
              >
                <div
                  style={{
                    width: labelDotSize,
                    height: labelDotSize,
                    borderRadius: "50%",
                    background: colorsA.accent,
                    boxShadow: `0 0 12px ${colorsA.accent}50`,
                  }}
                />
                <div
                  style={{
                    fontFamily,
                    fontSize: labelFontSize,
                    fontWeight: 800,
                    color: colorsA.accent,
                    letterSpacing: 2,
                  }}
                >
                  {sideA.label}
                </div>
              </div>

              <PointsList
                points={sideA.points}
                accentColor={colorsA.accent}
                colorPalette={colorPalette}
                frame={frame}
                fps={fps}
                baseDelay={leftStartFrame}
                slideDirection="up"
                width={width}
              />
            </GlassCard>
          </div>
        );
      })()}

      {/* VS Badge (between panels) */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <VSBadge
          frame={frame}
          fps={fps}
          colorPalette={colorPalette}
          size={vsBadgeSize}
          baseDelay={10}
        />
      </div>

      {/* Side B (bottom) */}
      {(() => {
        const panelProgress = spring({
          frame: Math.max(0, frame - rightStartFrame),
          fps,
          config: { damping: 16, stiffness: 110, mass: 0.5 },
        });
        const panelOpacity = interpolate(frame, [rightStartFrame, rightStartFrame + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const panelSlide = interpolate(panelProgress, [0, 1], [30, 0]);

        return (
          <div
            style={{

              opacity: panelOpacity,
              transform: `translateY(${panelSlide}px)`,
            }}
          >
            <GlassCard
              glowColor={colorsB.accent}
              accentSide="left"
              accentColors={[colorsB.accent, colorsB.accent + "80"]}
              padding={Math.round(width * 0.025)}
              borderRadius={20}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: Math.round(width * 0.02),
                  marginBottom: Math.round(width * 0.02),
                }}
              >
                <div
                  style={{
                    width: labelDotSize,
                    height: labelDotSize,
                    borderRadius: "50%",
                    background: colorsB.accent,
                    boxShadow: `0 0 12px ${colorsB.accent}50`,
                  }}
                />
                <div
                  style={{
                    fontFamily,
                    fontSize: labelFontSize,
                    fontWeight: 800,
                    color: colorsB.accent,
                    letterSpacing: 2,
                  }}
                >
                  {sideB.label}
                </div>
              </div>

              <PointsList
                points={sideB.points}
                accentColor={colorsB.accent}
                colorPalette={colorPalette}
                frame={frame}
                fps={fps}
                baseDelay={rightStartFrame}
                slideDirection="up"
                width={width}
              />
            </GlassCard>
          </div>
        );
      })()}
    </div>
  );
};

// ═════════════════════════════════════
// Main Component
// ═════════════════════════════════════

export const Comparison: React.FC<ComparisonProps> = ({
  scene,
  colorPalette,
  wordTimestamps = [],
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
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

  // Voice-sync
  const sceneMidMs = (scene.startMs + scene.endMs) / 2;
  const leftStartFrame = (() => {
    const ms = findKeywordTimestamp(left.label, wordTimestamps, scene.startMs, sceneMidMs);
    return ms >= 0 ? Math.round(((ms - scene.startMs) / 1000) * fps) : 5;
  })();
  const rightStartFrame = (() => {
    const ms = findKeywordTimestamp(right.label, wordTimestamps, sceneMidMs, scene.endMs);
    return ms >= 0 ? Math.round(((ms - scene.startMs) / 1000) * fps) : Math.round(((sceneMidMs - scene.startMs) / 1000) * fps);
  })();

  // Layout mode
  const layout = scene.layout ?? "split_screen";

  return (
    <AbsoluteFill style={{ opacity: exitOpacity }}>
      <AnimatedGradientBg
        colorPalette={colorPalette}
        intensity="subtle"
        withParticles={true}
        particleDensity={8}
      />

      <ComparisonHeader
        text={scene.visualDescription}
        colorPalette={colorPalette}
        opacity={headerOpacity}
        width={width}
        height={height}
      />

      {layout === "stacked" ? (
        <StackedLayout
          sides={sides}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          leftStartFrame={leftStartFrame}
          rightStartFrame={rightStartFrame}
          width={width}
          height={height}
        />
      ) : (
        <SplitScreenLayout
          sides={sides}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          leftStartFrame={leftStartFrame}
          rightStartFrame={rightStartFrame}
          width={width}
          height={height}
        />
      )}
    </AbsoluteFill>
  );
};
