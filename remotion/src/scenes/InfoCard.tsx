// remotion/src/scenes/InfoCard.tsx
/**
 * Info Card scene — multiple layout modes:
 *   - vertical_stack (DEFAULT): GlassCard stacked vertically with flow arrows
 *   - grid_2x2: GlassCard in 2×2 grid for 4 items
 *   - full_width_cards: Full-width horizontal cards with gradient accent border
 *
 * Quality upgrades:
 *   - AnimatedGradientBg replaces flat background
 *   - GlassCard containers with active glow for voice-synced items
 *   - Larger icon circles (48px) with gradient background
 *   - Animated SVG flow arrows between sequential steps
 *
 * horizontal_grid removed (ugly in 9:16) — falls back to vertical_stack.
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

interface InfoCardProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: { text: string; startMs: number; endMs: number }[];
}

type CardItem = { icon: string; title: string; subtitle: string };

// ═════════════════════════════════════
// Shared: Header
// ═════════════════════════════════════

const InfoHeader: React.FC<{
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
      <div
        style={{
          marginTop: 12,
          width: 50,
          height: 3,
          borderRadius: 2,
          background: `linear-gradient(90deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      />
    </div>
  );
};

// ═════════════════════════════════════
// Shared: Flow Arrow (animated SVG)
// ═════════════════════════════════════

const FlowArrow: React.FC<{
  frame: number;
  delay: number;
  primaryColor: string;
  secondaryColor: string;
}> = ({ frame, delay, primaryColor, secondaryColor }) => {
  const arrowOpacity = interpolate(frame, [delay, delay + 8], [0, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const arrowBounce = interpolate(
    Math.sin((frame - delay) * 0.1),
    [-1, 1],
    [-2, 2],
  );

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        opacity: arrowOpacity,
        transform: `translateY(${arrowBounce}px)`,
        height: 28,
      }}
    >
      <svg width="24" height="28" viewBox="0 0 24 28">
        <defs>
          <linearGradient id="arrowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.8" />
            <stop offset="100%" stopColor={secondaryColor} stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <path
          d="M12 2 L12 20 M6 16 L12 24 L18 16"
          stroke="url(#arrowGrad)"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

// ═════════════════════════════════════
// Layout: Vertical Stack (DEFAULT)
// ═════════════════════════════════════

const VerticalStackLayout: React.FC<{
  cards: CardItem[];
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  showArrows: boolean;
  revealFrames: number[];
  activeIndex: number;
  height: number;
}> = ({ cards, colorPalette, frame, fps, showArrows, revealFrames, activeIndex, height }) => {
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
        gap: showArrows ? 4 : 16,
      }}
    >
      {cards.map((card, i) => {
        const delay = revealFrames[i];
        const isActive = i === activeIndex;
        const isEvenCard = i % 2 === 0;

        const cardProgress = spring({
          frame: Math.max(0, frame - delay),
          fps,
          config: { damping: 18, stiffness: 110, mass: 0.5 },
        });

        const iconProgress = spring({
          frame: Math.max(0, frame - delay - 4),
          fps,
          config: { damping: 10, stiffness: 180, mass: 0.5 },
        });

        const cardOpacity = interpolate(frame, [delay, delay + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const translateX = interpolate(
          cardProgress,
          [0, 1],
          [isEvenCard ? -40 : 40, 0],
        );
        const iconScale = interpolate(iconProgress, [0, 1], [0.7, 1]);

        return (
          <React.Fragment key={i}>
            <div
              style={{
                opacity: cardOpacity,
                transform: `translateX(${translateX}px)`,
              }}
            >
              <GlassCard
                active={isActive}
                glowColor={colorPalette.primary}
                padding={20}
                borderRadius={16}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  {/* Icon circle */}
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 14,
                      background: `linear-gradient(135deg, ${colorPalette.primary}30, ${colorPalette.secondary}30)`,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: 30,
                      flexShrink: 0,
                      transform: `scale(${iconScale})`,
                    }}
                  >
                    {card.icon}
                  </div>
                  {/* Text */}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily,
                        fontSize: autoFontSize(card.title, 32, 24),
                        fontWeight: 700,
                        color: colorPalette.text,
                        marginBottom: 6,
                        lineHeight: 1.2,
                      }}
                    >
                      {card.title}
                    </div>
                    <div
                      style={{
                        fontFamily,
                        fontSize: autoFontSize(card.subtitle, 24, 18),
                        fontWeight: 400,
                        color: `${colorPalette.text}99`,
                        lineHeight: 1.35,
                      }}
                    >
                      {card.subtitle}
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* Flow arrow between sequential steps */}
            {showArrows && i < cards.length - 1 && (
              <FlowArrow
                frame={frame}
                delay={delay + 8}
                primaryColor={colorPalette.primary}
                secondaryColor={colorPalette.secondary}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ═════════════════════════════════════
// Layout: 2×2 Grid (upgraded)
// ═════════════════════════════════════

const Grid2x2Layout: React.FC<{
  cards: CardItem[];
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  revealFrames: number[];
  activeIndex: number;
  height: number;
}> = ({ cards, colorPalette, frame, fps, revealFrames, activeIndex, height }) => {
  const containerTop = Math.round(height * 0.22);

  return (
    <div
      style={{
        position: "absolute",
        top: containerTop,
        left: 40,
        right: 40,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
      }}
    >
      {cards.slice(0, 4).map((card, i) => {
        const delay = revealFrames[i] ?? i * 6;
        const isActive = i === activeIndex;

        const cardProgress = spring({
          frame: Math.max(0, frame - delay),
          fps,
          config: { damping: 14, stiffness: 140, mass: 0.4 },
        });
        const iconProgress = spring({
          frame: Math.max(0, frame - delay - 4),
          fps,
          config: { damping: 10, stiffness: 180, mass: 0.5 },
        });
        const cardOpacity = interpolate(frame, [delay, delay + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const cardScale = interpolate(cardProgress, [0, 1], [0.85, 1]);
        const iconScale = interpolate(iconProgress, [0, 1], [0.6, 1]);

        return (
          <div
            key={i}
            style={{
              opacity: cardOpacity,
              transform: `scale(${cardScale})`,
            }}
          >
            <GlassCard
              active={isActive}
              glowColor={colorPalette.primary}
              padding={16}
              borderRadius={14}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  textAlign: "center",
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 12,
                    background: `linear-gradient(135deg, ${colorPalette.primary}30, ${colorPalette.secondary}30)`,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontSize: 28,
                    transform: `scale(${iconScale})`,
                  }}
                >
                  {card.icon}
                </div>
                <div
                  style={{
                    fontFamily,
                    fontSize: autoFontSize(card.title, 26, 20),
                    fontWeight: 700,
                    color: colorPalette.text,
                    lineHeight: 1.2,
                  }}
                >
                  {card.title}
                </div>
                <div
                  style={{
                    fontFamily,
                    fontSize: autoFontSize(card.subtitle, 18, 14),
                    fontWeight: 400,
                    color: `${colorPalette.text}90`,
                    lineHeight: 1.3,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {card.subtitle}
                </div>
              </div>
            </GlassCard>
          </div>
        );
      })}
    </div>
  );
};

// ═════════════════════════════════════
// Layout: Full-Width Cards (NEW)
// ═════════════════════════════════════

const FullWidthCardsLayout: React.FC<{
  cards: CardItem[];
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  revealFrames: number[];
  activeIndex: number;
  height: number;
}> = ({ cards, colorPalette, frame, fps, revealFrames, activeIndex, height }) => {
  const containerTop = Math.round(height * 0.22);

  // Accent colors rotate per card
  const accentPairs: [string, string][] = [
    [colorPalette.primary, colorPalette.secondary],
    [colorPalette.secondary, colorPalette.primary],
    ["#10B981", "#3B82F6"],
    ["#F59E0B", "#EF4444"],
    ["#8B5CF6", "#EC4899"],
  ];

  return (
    <div
      style={{
        position: "absolute",
        top: containerTop,
        left: 40,
        right: 40,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {cards.map((card, i) => {
        const delay = revealFrames[i];
        const isActive = i === activeIndex;
        const accent = accentPairs[i % accentPairs.length];

        const cardProgress = spring({
          frame: Math.max(0, frame - delay),
          fps,
          config: { damping: 16, stiffness: 120, mass: 0.5 },
        });
        const cardOpacity = interpolate(frame, [delay, delay + 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const slideX = interpolate(cardProgress, [0, 1], [-50, 0]);
        const iconProgress = spring({
          frame: Math.max(0, frame - delay - 3),
          fps,
          config: { damping: 10, stiffness: 180, mass: 0.4 },
        });
        const iconScale = interpolate(iconProgress, [0, 1], [0.5, 1]);

        return (
          <div
            key={i}
            style={{
              opacity: cardOpacity,
              transform: `translateX(${slideX}px)`,
            }}
          >
            <GlassCard
              active={isActive}
              glowColor={accent[0]}
              accentSide="left"
              accentColors={accent}
              padding={18}
              borderRadius={14}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {/* Circular icon */}
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${accent[0]}25, ${accent[1]}25)`,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontSize: 28,
                    flexShrink: 0,
                    transform: `scale(${iconScale})`,
                    boxShadow: isActive ? `0 0 12px ${accent[0]}30` : "none",
                  }}
                >
                  {card.icon}
                </div>

                {/* Text inline */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily,
                      fontSize: autoFontSize(card.title, 28, 22),
                      fontWeight: 700,
                      color: colorPalette.text,
                      lineHeight: 1.2,
                      marginBottom: 3,
                    }}
                  >
                    {card.title}
                  </div>
                  <div
                    style={{
                      fontFamily,
                      fontSize: autoFontSize(card.subtitle, 22, 17),
                      fontWeight: 400,
                      color: `${colorPalette.text}90`,
                      lineHeight: 1.35,
                    }}
                  >
                    {card.subtitle}
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        );
      })}
    </div>
  );
};

// ═════════════════════════════════════
// Main Component
// ═════════════════════════════════════

export const InfoCard: React.FC<InfoCardProps> = ({
  scene,
  colorPalette,
  wordTimestamps = [],
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const exitOpacity = useExitAnimation();

  const cards = scene.cardItems ?? [];
  const layout = scene.layout ?? "vertical_stack";

  // Backward compat: horizontal_grid → vertical_stack
  const resolvedLayout = layout === "horizontal_grid" ? "vertical_stack" : layout;

  // Flow arrows only for sequential steps in vertical layout
  const showArrows =
    scene.purpose === "list_steps" && resolvedLayout === "vertical_stack";

  // Voice-sync reveal frames
  const revealFrames = getItemRevealFrames(
    cards.map((c) => ({ title: c.title })),
    wordTimestamps,
    scene.startMs,
    scene.endMs,
    fps,
  );

  // Active card index (voice currently reading)
  const activeIndex = cards.reduce(
    (active, _, i) => (frame >= revealFrames[i] ? i : active),
    -1,
  );

  // Header fade in
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
      <InfoHeader
        text={scene.visualDescription}
        colorPalette={colorPalette}
        opacity={headerOpacity}
        width={width}
        height={height}
      />

      {/* Layout switch */}
      {resolvedLayout === "grid_2x2" ? (
        <Grid2x2Layout
          cards={cards}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          revealFrames={revealFrames}
          activeIndex={activeIndex}
          height={height}
        />
      ) : resolvedLayout === "full_width_cards" ? (
        <FullWidthCardsLayout
          cards={cards}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          revealFrames={revealFrames}
          activeIndex={activeIndex}
          height={height}
        />
      ) : (
        <VerticalStackLayout
          cards={cards}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          showArrows={showArrows}
          revealFrames={revealFrames}
          activeIndex={activeIndex}
          height={height}
        />
      )}
    </AbsoluteFill>
  );
};
