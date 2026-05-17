// remotion/src/scenes/EmojiGrid.tsx
/**
 * EmojiGrid scene — icon_showcase layout (large icons, minimal text).
 *
 * Features:
 *   - Large emoji/icons (80px) as focal point
 *   - Circular gradient glow behind each icon
 *   - Minimal text (small title + subtitle)
 *   - AnimatedGradientBg for depth
 *   - Subtle continuous icon wiggle animation
 *   - Voice-synced stagger reveal
 *
 * Uses same cardItems data as InfoCard (icon, title, subtitle).
 * Max 4 items. Renders as a 2×2 or vertical layout based on count.
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

interface EmojiGridProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: { text: string; startMs: number; endMs: number }[];
}

type CardItem = { icon: string; title: string; subtitle: string };

// ── Single Icon Card ──

const IconCard: React.FC<{
  card: CardItem;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  delay: number;
  cardIndex: number;
  isActive: boolean;
}> = ({ card, colorPalette, frame, fps, delay, cardIndex, isActive }) => {
  // Entry animation
  const cardProgress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 14, stiffness: 140, mass: 0.5 },
  });

  const iconProgress = spring({
    frame: Math.max(0, frame - delay - 4),
    fps,
    config: { damping: 8, stiffness: 200, mass: 0.4 },
  });

  const cardOpacity = interpolate(frame, [delay, delay + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cardScale = interpolate(cardProgress, [0, 1], [0.85, 1]);
  const iconScale = interpolate(iconProgress, [0, 1], [0.5, 1]);

  // Continuous subtle wiggle for revealed icons
  const isRevealed = frame >= delay + 10;
  const wiggle = isRevealed
    ? Math.sin((frame - delay) * 0.06 + cardIndex * 1.5) * 3
    : 0;
  const wiggleRotate = isRevealed
    ? Math.sin((frame - delay) * 0.04 + cardIndex * 2.0) * 2
    : 0;

  // Active glow intensity
  const glowIntensity = isActive
    ? interpolate(Math.sin(frame * 0.07), [-1, 1], [0.3, 0.7])
    : 0.1;

  // Pick accent color alternating
  const accentColor = cardIndex % 2 === 0 ? colorPalette.primary : colorPalette.secondary;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "36px 20px 28px",
        borderRadius: 24,
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        border: `1px solid rgba(255, 255, 255, ${isActive ? 0.12 : 0.06})`,
        opacity: cardOpacity,
        transform: `scale(${cardScale})`,
        gap: 16,
      }}
    >
      {/* Icon with circular gradient glow */}
      <div
        style={{
          position: "relative",
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Glow circle behind icon */}
        <div
          style={{
            position: "absolute",
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${accentColor}${Math.round(glowIntensity * 255).toString(16).padStart(2, "0")} 0%, transparent 70%)`,
          }}
        />
        {/* Large emoji */}
        <div
          style={{
            fontSize: 120,
            lineHeight: 1,
            transform: `scale(${iconScale}) translateY(${wiggle}px) rotate(${wiggleRotate}deg)`,
            zIndex: 2,
            filter: isActive ? `drop-shadow(0 0 14px ${accentColor}40)` : "none",
          }}
        >
          {card.icon}
        </div>
      </div>

      {/* Title — compact */}
      <div
        style={{
          fontFamily,
          fontSize: autoFontSize(card.title, 38, 28),
          fontWeight: 700,
          color: colorPalette.text,
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {card.title}
      </div>

      {/* Subtitle — minimal */}
      <div
        style={{
          fontFamily,
          fontSize: autoFontSize(card.subtitle, 28, 20),
          fontWeight: 400,
          color: `${colorPalette.text}90`,
          textAlign: "center",
          lineHeight: 1.3,
          maxWidth: "100%",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 1,
          WebkitBoxOrient: "vertical",
        }}
      >
        {card.subtitle}
      </div>
    </div>
  );
};

// ── Main Component ──

export const EmojiGrid: React.FC<EmojiGridProps> = ({
  scene,
  colorPalette,
  wordTimestamps = [],
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const exitOpacity = useExitAnimation();

  const allCards = scene.cardItems ?? [];
  const cards = allCards.slice(0, 4);

  // Voice-sync reveal frames
  const revealFrames = getItemRevealFrames(
    cards.map((c) => ({ title: c.title })),
    wordTimestamps,
    scene.startMs,
    scene.endMs,
    fps,
  );

  // Find active card index
  const activeIndex = cards.reduce(
    (active, _, i) => {
      if (frame >= revealFrames[i]) return i;
      return active;
    },
    -1,
  );

  // Header animation
  const headerOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Grid layout: 2 columns for 3-4 items, 1 column for 1-2 items
  const gridColumns = cards.length <= 2 ? "1fr" : "1fr 1fr";

  // Dynamic top positioning based on content
  const headerTop = Math.round(height * 0.12);
  const gridTop = Math.round(height * 0.23);

  return (
    <AbsoluteFill style={{ opacity: exitOpacity }}>
      {/* Animated background — dark minimal */}
      <AnimatedGradientBg
        colorPalette={colorPalette}
        intensity="subtle"
        withParticles={true}
        particleDensity={10}
      />

      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: headerTop,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: headerOpacity,
          padding: "0 60px",
          zIndex: 10,
        }}
      >
        <h2
          style={{
            fontFamily,
            fontSize: Math.max(48, Math.round(width * 0.055)),
            fontWeight: 800,
            color: colorPalette.text,
            margin: 0,
            lineHeight: 1.3,
            maxHeight: 100,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            textShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
        >
          {scene.visualDescription}
        </h2>
        {/* Accent line */}
        <div
          style={{
            marginTop: 16,
            width: 80,
            height: 5,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        />
      </div>

      {/* Icon Grid */}
      <div
        style={{
          position: "absolute",
          top: gridTop,
          left: 50,
          right: 50,
          display: "grid",
          gridTemplateColumns: gridColumns,
          gap: 24,
        }}
      >
        {cards.map((card, i) => (
          <IconCard
            key={i}
            card={card}
            colorPalette={colorPalette}
            frame={frame}
            fps={fps}
            delay={revealFrames[i]}
            cardIndex={i}
            isActive={i === activeIndex}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
