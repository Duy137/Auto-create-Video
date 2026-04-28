// remotion/src/scenes/EmojiGrid.tsx
/**
 * EmojiGrid scene — playful 2×2 grid of emoji-centric cards.
 *
 * Distinct from InfoCard:
 *   - Background: subtle gradient with primary/secondary tints (not pure dark)
 *   - Emoji: large and centered (48-56px)
 *   - Style: playful, spacious, colorful
 *   - Best for: feature lists, tool lists, category overviews
 *
 * Uses same cardItems data as InfoCard (icon, title, subtitle).
 * Always renders grid_2x2 layout. Max 4 items.
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

interface EmojiGridProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: { text: string; startMs: number; endMs: number }[];
}

type CardItem = { icon: string; title: string; subtitle: string };

// ── Single Grid Card ──

const EmojiGridCard: React.FC<{
  card: CardItem;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  delay: number;
  cardIndex: number;
}> = ({ card, colorPalette, frame, fps, delay, cardIndex }) => {
  const isEvenCard = cardIndex % 2 === 0;

  const cardProgress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.4 },
  });

  const iconProgress = spring({
    frame: Math.max(0, frame - delay - 5),
    fps,
    config: { damping: 10, stiffness: 180, mass: 0.5 },
  });

  const cardOpacity = interpolate(frame, [delay, delay + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const translateX = interpolate(cardProgress, [0, 1], [isEvenCard ? -50 : 50, 0]);
  const rotation = interpolate(cardProgress, [0, 1], [isEvenCard ? -2 : 2, 0]);
  const cardScale = interpolate(cardProgress, [0, 1], [0.9, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const iconScale = interpolate(iconProgress, [0, 1], [0.8, 1]);
  const shadowOpacity = interpolate(cardProgress, [0, 0.5, 1], [0, 0.12, 0.28], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        borderRadius: 24,
        backgroundColor: "rgba(255, 255, 255, 0.05)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        backdropFilter: "blur(8px)",
        opacity: cardOpacity,
        transform: `translateX(${translateX}px) rotate(${rotation}deg) scale(${cardScale})`,
        boxShadow: `0 8px 32px rgba(0, 0, 0, ${shadowOpacity})`,
        gap: 12,
      }}
    >
      {/* Large Emoji */}
      <div
        style={{
          fontSize: 52,
          lineHeight: 1,
          transform: `scale(${iconScale})`,
        }}
      >
        {card.icon}
      </div>

      {/* Title */}
      <div
        style={{
          fontFamily,
          fontSize: 28,
          fontWeight: 700,
          color: colorPalette.text,
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {card.title}
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontFamily,
          fontSize: autoFontSize(card.subtitle, 22, 18),
          fontWeight: 400,
          color: `${colorPalette.text}B3`,
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
  const { fps } = useVideoConfig();
  const exitOpacity = useExitAnimation();

  const allCards = scene.cardItems ?? [];
  // Max 4 items for 2×2 grid
  const cards = allCards.slice(0, 4);

  // Voice-sync reveal frames
  const revealFrames = getItemRevealFrames(
    cards.map((c) => ({ title: c.title })),
    wordTimestamps,
    scene.startMs,
    scene.endMs,
    fps,
  );

  // Header animation
  const headerOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Determine grid columns based on item count
  const gridColumns = cards.length <= 2 ? "1fr" : "1fr 1fr";

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${colorPalette.primary}20 0%, ${colorPalette.background} 40%, ${colorPalette.secondary}20 100%)`,
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
        <div
          style={{
            marginTop: 16,
            width: 60,
            height: 4,
            borderRadius: 2,
            background: `linear-gradient(90deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        />
      </div>

      {/* 2×2 Grid */}
      <div
        style={{
          position: "absolute",
          top: 360,
          left: 50,
          right: 50,
          display: "grid",
          gridTemplateColumns: gridColumns,
          gap: 20,
        }}
      >
        {cards.map((card, i) => (
          <EmojiGridCard
            key={i}
            card={card}
            colorPalette={colorPalette}
            frame={frame}
            fps={fps}
            delay={revealFrames[i]}
            cardIndex={i}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
