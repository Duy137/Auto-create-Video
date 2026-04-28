// remotion/src/scenes/InfoCard.tsx
/**
 * Info Card scene — dark background with multiple layout options:
 *   - vertical_stack (default): staggered slide-in cards vertically
 *   - horizontal_grid: cards side-by-side (2 columns)
 *   - grid_2x2: 2×2 grid for 4 items
 *
 * When purpose="list_steps" and layout="vertical_stack", flow arrows (↓)
 * are displayed between cards to indicate sequential steps.
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

interface InfoCardProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: { text: string; startMs: number; endMs: number }[];
}

type CardItem = { icon: string; title: string; subtitle: string };

// ═════════════════════════════════════
// Shared: Single Card Rendering
// ═════════════════════════════════════

const CardBox: React.FC<{
  card: CardItem;
  colorPalette: VideoProps["colorPalette"];
  opacity: number;
  transform: string;
  iconTransform?: string;
  shadowOpacity?: number;
  compact?: boolean;
}> = ({
  card,
  colorPalette,
  opacity,
  transform,
  iconTransform,
  shadowOpacity = 0.2,
  compact = false,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: compact ? 16 : 24,
      padding: compact ? "20px 24px" : "28px 32px",
      borderRadius: compact ? 16 : 20,
      backgroundColor: `${colorPalette.text}08`,
      border: `1px solid ${colorPalette.text}15`,
      backdropFilter: "blur(10px)",
      opacity,
      transform,
      boxShadow: `0 8px 32px rgba(0, 0, 0, ${shadowOpacity})`,
    }}
  >
    {/* Icon */}
    <div
      style={{
        width: compact ? 48 : 64,
        height: compact ? 48 : 64,
        borderRadius: compact ? 12 : 16,
        background: `linear-gradient(135deg, ${colorPalette.primary}33, ${colorPalette.secondary}33)`,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontSize: compact ? 24 : 32,
        flexShrink: 0,
        transform: iconTransform ?? "scale(1)",
      }}
    >
      {card.icon}
    </div>

    {/* Text */}
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontFamily,
          fontSize: compact ? 24 : 30,
          fontWeight: 700,
          color: colorPalette.text,
          marginBottom: compact ? 4 : 6,
        }}
      >
        {card.title}
      </div>
      <div
        style={{
          fontFamily,
          fontSize: compact ? autoFontSize(card.subtitle, 22, 18) : autoFontSize(card.subtitle, 26, 20),
          fontWeight: 400,
          color: `${colorPalette.text}AA`,
          lineHeight: 1.4,
        }}
      >
        {card.subtitle}
      </div>
    </div>
  </div>
);

// ═════════════════════════════════════
// Layout: Vertical Stack (default)
// ═════════════════════════════════════

const VerticalStackLayout: React.FC<{
  cards: CardItem[];
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  showArrows: boolean;
  revealFrames: number[];
}> = ({ cards, colorPalette, frame, fps, showArrows, revealFrames }) => (
  <div
    style={{
      position: "absolute",
      top: 350,
      left: 60,
      right: 60,
      display: "flex",
      flexDirection: "column",
      gap: showArrows ? 8 : 24,
    }}
  >
    {cards.map((card, i) => {
      const delay = revealFrames[i];
      const isEvenCard = i % 2 === 0;

      const cardProgress = spring({
        frame: Math.max(0, frame - delay),
        fps,
        config: { damping: 20, stiffness: 100, mass: 0.6 },
      });

      const iconProgress = spring({
        frame: Math.max(0, frame - delay - 5),
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
        [isEvenCard ? -60 : 60, 0]
      );
      const rotation = interpolate(cardProgress, [0, 1], [isEvenCard ? -2 : 2, 0]);
      const shadowOpacity = interpolate(cardProgress, [0, 0.5, 1], [0, 0.12, 0.3], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const iconScale = interpolate(iconProgress, [0, 1], [0.78, 1]);

      return (
        <React.Fragment key={i}>
          <CardBox
            card={card}
            colorPalette={colorPalette}
            opacity={cardOpacity}
            transform={`translateX(${translateX}px) rotate(${rotation}deg)`}
            iconTransform={`scale(${iconScale})`}
            shadowOpacity={shadowOpacity}
          />
          {/* Flow arrow between cards (only for sequential steps) */}
          {showArrows && i < cards.length - 1 && (
            <FlowArrow
              frame={frame}
              delay={delay + 8}
              color={colorPalette.primary}
            />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ── Flow Arrow (↓) between sequential steps ──

const FlowArrow: React.FC<{
  frame: number;
  delay: number;
  color: string;
}> = ({ frame, delay, color }) => {
  const arrowOpacity = interpolate(frame, [delay, delay + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        opacity: arrowOpacity,
      }}
    >
      <span
        style={{
          fontFamily,
          fontSize: 28,
          color: `${color}80`,
          lineHeight: 1,
        }}
      >
        ↓
      </span>
    </div>
  );
};

// ═════════════════════════════════════
// Layout: Horizontal Grid (2 columns)
// ═════════════════════════════════════

const HorizontalGridLayout: React.FC<{
  cards: CardItem[];
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  revealFrames: number[];
}> = ({ cards, colorPalette, frame, fps, revealFrames }) => (
  <div
    style={{
      position: "absolute",
      top: 350,
      left: 40,
      right: 40,
      display: "flex",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 16,
    }}
  >
    {cards.map((card, i) => {
      const delay = revealFrames[i];
      // Alternate: left cards slide from left, right cards from right
      const isLeft = i % 2 === 0;
      const slideProgress = spring({
        frame: Math.max(0, frame - delay),
        fps,
        config: { damping: 20, stiffness: 100, mass: 0.6 },
      });
      const iconProgress = spring({
        frame: Math.max(0, frame - delay - 5),
        fps,
        config: { damping: 10, stiffness: 180, mass: 0.5 },
      });
      const cardOpacity = interpolate(frame, [delay, delay + 10], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const translateX = interpolate(
        slideProgress,
        [0, 1],
        [isLeft ? -60 : 60, 0],
      );
      const rotation = interpolate(slideProgress, [0, 1], [isLeft ? -2 : 2, 0]);
      const shadowOpacity = interpolate(slideProgress, [0, 0.5, 1], [0, 0.12, 0.28], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const iconScale = interpolate(iconProgress, [0, 1], [0.8, 1]);

      return (
        <div key={i} style={{ width: "calc(50% - 8px)", flexShrink: 0 }}>
          <CardBox
            card={card}
            colorPalette={colorPalette}
            opacity={cardOpacity}
            transform={`translateX(${translateX}px) rotate(${rotation}deg)`}
            iconTransform={`scale(${iconScale})`}
            shadowOpacity={shadowOpacity}
            compact
          />
        </div>
      );
    })}
  </div>
);

// ═════════════════════════════════════
// Layout: 2×2 Grid
// ═════════════════════════════════════

const Grid2x2Layout: React.FC<{
  cards: CardItem[];
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  revealFrames: number[];
}> = ({ cards, colorPalette, frame, fps, revealFrames }) => {
  // Stagger order: top-left → top-right → bottom-left → bottom-right
  const staggerOrder = [0, 1, 2, 3];

  return (
    <div
      style={{
        position: "absolute",
        top: 350,
        left: 40,
        right: 40,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
      }}
    >
      {cards.slice(0, 4).map((card, i) => {
        const staggerIdx = staggerOrder[i] ?? i;
        const delay = revealFrames[i] ?? staggerIdx * 6;
        const isEvenCard = i % 2 === 0;
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
        const translateX = interpolate(
          cardProgress,
          [0, 1],
          [isEvenCard ? -50 : 50, 0]
        );
        const rotation = interpolate(cardProgress, [0, 1], [isEvenCard ? -2 : 2, 0]);
        const scale = interpolate(cardProgress, [0, 1], [0.9, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const shadowOpacity = interpolate(cardProgress, [0, 0.5, 1], [0, 0.12, 0.28], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const iconScale = interpolate(iconProgress, [0, 1], [0.8, 1]);

        return (
          <div key={i}>
            <CardBox
              card={card}
              colorPalette={colorPalette}
              opacity={cardOpacity}
              transform={`translateX(${translateX}px) rotate(${rotation}deg) scale(${scale})`}
              iconTransform={`scale(${iconScale})`}
              shadowOpacity={shadowOpacity}
              compact
            />
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
  const { fps } = useVideoConfig();

  const cards = scene.cardItems ?? [];
  const exitOpacity = useExitAnimation();
  const layout = scene.layout ?? "vertical_stack";

  // Flow arrows only for sequential process steps in vertical layout
  const showArrows =
    scene.purpose === "list_steps" && layout === "vertical_stack";

  // Voice-sync reveal frames
  const revealFrames = getItemRevealFrames(
    cards.map((c) => ({ title: c.title })),
    wordTimestamps,
    scene.startMs,
    scene.endMs,
    fps,
  );

  // Header fade in
  const headerOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${colorPalette.background} 0%, ${colorPalette.background}EE 100%)`,
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
            fontSize: 48,
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
            background: colorPalette.primary,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        />
      </div>

      {/* Cards — layout switch */}
      {layout === "horizontal_grid" ? (
        <HorizontalGridLayout
          cards={cards}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          revealFrames={revealFrames}
        />
      ) : layout === "grid_2x2" ? (
        <Grid2x2Layout
          cards={cards}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          revealFrames={revealFrames}
        />
      ) : (
        <VerticalStackLayout
          cards={cards}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          showArrows={showArrows}
          revealFrames={revealFrames}
        />
      )}
    </AbsoluteFill>
  );
};
