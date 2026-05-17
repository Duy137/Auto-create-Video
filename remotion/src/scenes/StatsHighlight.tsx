// remotion/src/scenes/StatsHighlight.tsx
/**
 * Stats Highlight scene — animated count-up numbers.
 *
 * Two layout modes:
 *   - vertical_stack (DEFAULT): GlassCard stat boxes stacked vertically
 *   - hero_number: One large hero stat centered, smaller stats below
 *
 * Quality upgrades:
 *   - AnimatedGradientBg for depth
 *   - GlassCard containers with accent border
 *   - Animated count-up with completion pulse
 *   - Gradient underline progress
 *   - horizontal_grid removed → falls back to vertical_stack
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
import { AnimatedGradientBg } from "../components/AnimatedGradientBg";
import { GlassCard } from "../components/GlassCard";

interface StatsHighlightProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: { text: string; startMs: number; endMs: number }[];
}

const toHexAlpha = (opacity: number): string => {
  const clamped = Math.max(0, Math.min(1, opacity));
  const alphaInt = Math.round(clamped * 255);
  return alphaInt.toString(16).padStart(2, "0");
};

// ═════════════════════════════════════
// Shared: Header
// ═════════════════════════════════════

const StatsHeader: React.FC<{
  text: string;
  colorPalette: VideoProps["colorPalette"];
  opacity: number;
  width: number;
  height: number;
}> = ({ text, colorPalette, opacity, width, height }) => {
  const headerTop = Math.round(height * 0.12);
  const titleFontSize = Math.max(30, Math.round(width * 0.038));

  return (
    <div
      style={{
        position: "absolute",
        top: headerTop,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity,
        padding: "0 60px",
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
          lineHeight: 1.3,
          maxHeight: 100,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          textShadow: "0 2px 12px rgba(0,0,0,0.4)",
        }}
      >
        {text}
      </h2>
    </div>
  );
};

// ═════════════════════════════════════
// Shared: Animated Count-Up
// ═════════════════════════════════════

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
  fontSize = 60,
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

  const completionPulse = interpolate(
    progress,
    [0.9, 0.98, 1],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const pulseScale = 1 + Math.sin(Math.max(0, frame - delay) * 0.35) * 0.04 * completionPulse;
  const glowOpacity = 0.1 + completionPulse * 0.25;

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

// ═════════════════════════════════════
// Layout: Vertical Stack (DEFAULT)
// ═════════════════════════════════════

const VerticalStatsLayout: React.FC<{
  stats: NonNullable<SceneData["stats"]>;
  frame: number;
  fps: number;
  revealFrames: number[];
  activeIndex: number;
  height: number;
}> = ({ stats, frame, fps, revealFrames, activeIndex, height }) => {
  const containerTop = Math.round(height * 0.22);

  return (
    <div
      style={{
        position: "absolute",
        top: containerTop,
        left: 50,
        right: 50,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      {stats.map((stat, i) => {
        const delay = revealFrames[i];
        const isActive = i === activeIndex;
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
        const boxOpacity = interpolate(frame, [delay, delay + 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const translateX = interpolate(boxProgress, [0, 1], [isEvenCard ? -40 : 40, 0]);
        const underlineWidth = interpolate(countProgress, [0, 1], [0, 100], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        return (
          <div
            key={i}
            style={{
              opacity: boxOpacity,
              transform: `translateX(${translateX}px)`,
            }}
          >
            <GlassCard
              active={isActive}
              glowColor={stat.color}
              accentSide="left"
              accentColors={[stat.color, `${stat.color}80`]}
              padding={22}
              borderRadius={16}
            >
              <div
                style={{
                  fontFamily,
                  fontSize: 16,
                  fontWeight: 600,
                  color: stat.color,
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  marginBottom: 6,
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
                fontSize={52}
                progressOverride={countProgress}
              />
              <div
                style={{
                  marginTop: 10,
                  width: `${underlineWidth}%`,
                  height: 4,
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${stat.color}, ${stat.color}60)`,
                  boxShadow: `0 0 8px ${stat.color}30`,
                }}
              />
            </GlassCard>
          </div>
        );
      })}
    </div>
  );
};

// ═════════════════════════════════════
// Layout: Hero Number (NEW)
// ═════════════════════════════════════

const HeroNumberLayout: React.FC<{
  stats: NonNullable<SceneData["stats"]>;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  revealFrames: number[];
  height: number;
  width: number;
}> = ({ stats, colorPalette, frame, fps, revealFrames, height, width }) => {
  if (stats.length === 0) return null;

  const heroStat = stats[0];
  const secondaryStats = stats.slice(1);
  const heroDelay = revealFrames[0] ?? 5;

  // Hero entrance
  const heroProgress = spring({
    frame: Math.max(0, frame - heroDelay),
    fps,
    config: { damping: 14, stiffness: 80, mass: 0.8 },
  });
  const heroCountProgress = spring({
    frame: Math.max(0, frame - heroDelay - 3),
    fps,
    config: { damping: 30, stiffness: 50, mass: 1.2 },
  });
  const heroOpacity = interpolate(frame, [heroDelay, heroDelay + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const heroScale = interpolate(heroProgress, [0, 1], [0.8, 1]);

  // Hero glow pulse
  const glowPulse = interpolate(
    Math.sin(frame * 0.05),
    [-1, 1],
    [0.15, 0.4],
  );

  const heroTop = Math.round(height * 0.18);
  const secondaryTop = Math.round(height * 0.62);
  const heroFontSize = Math.max(80, Math.round(width * 0.12));

  return (
    <>
      {/* Hero stat — large centered number */}
      <div
        style={{
          position: "absolute",
          top: heroTop,
          left: 40,
          right: 40,
          opacity: heroOpacity,
          transform: `scale(${heroScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <GlassCard
          active={true}
          glowColor={heroStat.color}
          padding={36}
          borderRadius={24}
          style={{ width: "100%", textAlign: "center" }}
        >
          {/* Label */}
          <div
            style={{
              fontFamily,
              fontSize: 18,
              fontWeight: 700,
              color: heroStat.color,
              textTransform: "uppercase",
              letterSpacing: 2,
              marginBottom: 12,
            }}
          >
            {heroStat.label}
          </div>

          {/* Big number */}
          <CountUp
            value={heroStat.value}
            frame={frame}
            fps={fps}
            delay={heroDelay + 3}
            color={heroStat.color}
            fontSize={heroFontSize}
            progressOverride={heroCountProgress}
          />

          {/* Glow underline */}
          <div
            style={{
              marginTop: 16,
              width: `${interpolate(heroCountProgress, [0, 1], [0, 60])}%`,
              height: 5,
              borderRadius: 3,
              background: `linear-gradient(90deg, ${heroStat.color}, ${colorPalette.secondary})`,
              boxShadow: `0 0 16px ${heroStat.color}${toHexAlpha(glowPulse)}`,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          />
        </GlassCard>
      </div>

      {/* Secondary stats — smaller row */}
      {secondaryStats.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: secondaryTop,
            left: 40,
            right: 40,
            display: "flex",
            gap: 12,
          }}
        >
          {secondaryStats.map((stat, i) => {
            const delay = revealFrames[i + 1] ?? heroDelay + 20 + i * 10;
            const secProgress = spring({
              frame: Math.max(0, frame - delay),
              fps,
              config: { damping: 16, stiffness: 120, mass: 0.4 },
            });
            const secCountProgress = spring({
              frame: Math.max(0, frame - delay - 3),
              fps,
              config: { damping: 30, stiffness: 60, mass: 1 },
            });
            const secOpacity = interpolate(frame, [delay, delay + 8], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const secScale = interpolate(secProgress, [0, 1], [0.85, 1]);

            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  opacity: secOpacity,
                  transform: `scale(${secScale})`,
                }}
              >
                <GlassCard
                  glowColor={stat.color}
                  accentSide="top"
                  accentColors={[stat.color, `${stat.color}80`]}
                  padding={14}
                  borderRadius={14}
                >
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontFamily,
                        fontSize: autoFontSize(stat.label, 14, 11),
                        fontWeight: 600,
                        color: stat.color,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                        marginBottom: 6,
                      }}
                    >
                      {stat.label}
                    </div>
                    <CountUp
                      value={stat.value}
                      frame={frame}
                      fps={fps}
                      delay={delay + 3}
                      color={colorPalette.text}
                      fontSize={32}
                      progressOverride={secCountProgress}
                    />
                  </div>
                </GlassCard>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

// ═════════════════════════════════════
// Main Component
// ═════════════════════════════════════

export const StatsHighlight: React.FC<StatsHighlightProps> = ({
  scene,
  colorPalette,
  wordTimestamps = [],
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const exitOpacity = useExitAnimation();

  const stats = scene.stats ?? [];
  const layout = scene.layout ?? "vertical_stack";

  // Backward compat: horizontal_grid → vertical_stack
  const resolvedLayout = layout === "horizontal_grid" ? "vertical_stack" : layout;

  // Voice-sync reveal frames
  const revealFrames = getItemRevealFrames(
    stats.map((s) => ({ title: s.label })),
    wordTimestamps,
    scene.startMs,
    scene.endMs,
    fps,
  );

  // Active stat index
  const activeIndex = stats.reduce(
    (active, _, i) => (frame >= revealFrames[i] ? i : active),
    -1,
  );

  // Header animation
  const headerOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: exitOpacity }}>
      {/* Animated background */}
      <AnimatedGradientBg
        colorPalette={colorPalette}
        intensity="subtle"
        withParticles={true}
        particleDensity={10}
      />

      {/* Header */}
      <StatsHeader
        text={scene.visualDescription}
        colorPalette={colorPalette}
        opacity={headerOpacity}
        width={width}
        height={height}
      />

      {/* Layout switch */}
      {resolvedLayout === "hero_number" ? (
        <HeroNumberLayout
          stats={stats}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          revealFrames={revealFrames}
          height={height}
          width={width}
        />
      ) : (
        <VerticalStatsLayout
          stats={stats}
          frame={frame}
          fps={fps}
          revealFrames={revealFrames}
          activeIndex={activeIndex}
          height={height}
        />
      )}
    </AbsoluteFill>
  );
};
