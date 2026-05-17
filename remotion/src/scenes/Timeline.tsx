// remotion/src/scenes/Timeline.tsx
/**
 * Timeline scene — vertical connected events with nodes.
 *
 * Two layout modes:
 *   - left_aligned (DEFAULT): Numbered steps, vertical line on left, content right
 *   - center_focus: Classic alternating left/right around center line
 *
 * Both modes feature:
 *   - AnimatedGradientBg for depth
 *   - GlassCard containers for content
 *   - Voice-synced stagger reveal
 *   - Thick animated gradient connecting line
 *   - Active node glow pulsing
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
import { getItemRevealFrames } from "../lib/voiceSync";
import { useExitAnimation } from "../lib/useExitAnimation";
import { AnimatedGradientBg } from "../components/AnimatedGradientBg";
import { GlassCard } from "../components/GlassCard";

interface TimelineProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: { text: string; startMs: number; endMs: number }[];
}

// ═════════════════════════════════════
// Shared: Header
// ═════════════════════════════════════

const TimelineHeader: React.FC<{
  text: string;
  colorPalette: VideoProps["colorPalette"];
  opacity: number;
  width: number;
  height: number;
}> = ({ text, colorPalette, opacity, width, height }) => {
  const headerTop = Math.round(height * 0.12);
  const headerPadding = Math.round(width * 0.08);
  const titleFontSize = Math.max(40, Math.round(width * 0.045));

  return (
    <div
      style={{
        position: "absolute",
        top: headerTop,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity,
        padding: `0 ${headerPadding}px`,
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
          maxHeight: Math.round(height * 0.12),
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          textShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}
      >
        {text}
      </h2>
      {/* Accent underline */}
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
  );
};

// ═════════════════════════════════════
// Left-Aligned Mode (DEFAULT)
// ═════════════════════════════════════

const LeftAlignedTimeline: React.FC<{
  events: { label: string; title: string; description?: string | null }[];
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  revealFrames: number[];
  width: number;
  height: number;
}> = ({ events, colorPalette, frame, fps, revealFrames, width, height }) => {
  const containerTop = Math.round(height * 0.22);
  const containerBottom = Math.round(height * 0.08);
  const availableHeight = Math.max(400, height - containerTop - containerBottom);
  const eventSpacing = Math.min(
    Math.round(availableHeight / events.length),
    Math.round(height * 0.18),
  );

  // Spine X position — thick vertical line on left
  const spineX = Math.round(width * 0.14);
  const nodeSize = Math.round(width * 0.075); // ~80px on 1080w
  const spineWidth = Math.round(width * 0.008); // ~8px on 1080w
  const contentLeft = spineX + nodeSize + Math.round(width * 0.04);
  const contentWidth = width - contentLeft - Math.round(width * 0.05);

  // Line grows to match the position of the last revealed event (pixel-accurate)
  const lastRevealedIndex = events.reduce(
    (last, _, i) => (frame >= revealFrames[i] ? i : last),
    -1,
  );
  // Line height = distance from top to the center of the last revealed node
  const lineHeight = lastRevealedIndex >= 0
    ? lastRevealedIndex * eventSpacing + nodeSize / 2
    : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: containerTop,
        bottom: containerBottom,
        left: 0,
        right: 0,
      }}
    >
      {/* Vertical spine line — grows to last revealed node */}
      <div
        style={{
          position: "absolute",
          left: spineX + nodeSize / 2 - spineWidth / 2,
          top: 10,
          width: spineWidth,
          height: lineHeight,
          background: `linear-gradient(180deg, ${colorPalette.primary}, ${colorPalette.secondary}80)`,
          borderRadius: spineWidth / 2,
          boxShadow: `0 0 20px ${colorPalette.primary}40, 0 0 40px ${colorPalette.primary}15`,
        }}
      />

      {/* Events */}
      {events.map((event, i) => {
        const delay = revealFrames[i];
        const isActive = frame >= delay && (i === events.length - 1 || frame < (revealFrames[i + 1] ?? Infinity));
        const isPast = frame >= delay && !isActive;

        // Node pop-in
        const nodeProgress = spring({
          frame: Math.max(0, frame - delay),
          fps,
          config: { damping: 12, stiffness: 180, mass: 0.5 },
        });

        // Content slide-in from right
        const contentProgress = spring({
          frame: Math.max(0, frame - delay - 3),
          fps,
          config: { damping: 16, stiffness: 120, mass: 0.6 },
        });
        const contentOpacity = interpolate(
          frame,
          [delay + 3, delay + 12],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const contentSlide = interpolate(contentProgress, [0, 1], [50, 0]);

        // Active glow pulse
        const glowPulse = isActive
          ? interpolate(Math.sin(frame * 0.08), [-1, 1], [0.4, 0.8])
          : 0;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: i * eventSpacing,
              left: 0,
              right: 0,
              height: eventSpacing,
              display: "flex",
              alignItems: "flex-start",
              paddingTop: 4,
            }}
          >
            {/* Numbered node — always shows number */}
            <div
              style={{
                position: "absolute",
                left: spineX,
                width: nodeSize,
                height: nodeSize,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
                opacity: isPast ? 0.7 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `scale(${nodeProgress})`,
                boxShadow: isActive
                  ? `0 0 30px ${colorPalette.primary}${Math.round(glowPulse * 255).toString(16).padStart(2, "0")}, 0 0 60px ${colorPalette.primary}25`
                  : `0 0 12px ${colorPalette.primary}30`,
                zIndex: 5,
              }}
            >
              <span
                style={{
                  fontFamily,
                  fontSize: Math.round(nodeSize * 0.42),
                  fontWeight: 800,
                  color: "#FFFFFF",
                  lineHeight: 1,
                }}
              >
                {i + 1}
              </span>
            </div>

            {/* Connecting horizontal line from node to card */}
            {contentOpacity > 0 && (
              <div
                style={{
                  position: "absolute",
                  left: spineX + nodeSize,
                  top: nodeSize / 2 - 2,
                  width: contentLeft - spineX - nodeSize,
                  height: 4,
                  background: `${colorPalette.primary}30`,
                  opacity: contentOpacity,
                  borderRadius: 2,
                }}
              />
            )}

            {/* Content card */}
            <div
              style={{
                position: "absolute",
                left: contentLeft,
                width: contentWidth,
                opacity: contentOpacity,
                transform: `translateX(${contentSlide}px)`,
              }}
            >
              <GlassCard
                active={isActive}
                glowColor={colorPalette.primary}
                accentSide="left"
                accentColors={[colorPalette.primary, colorPalette.secondary]}
                padding={24}
                borderRadius={20}
              >
                {/* Label (year/step) */}
                <div
                  style={{
                    fontFamily,
                    fontSize: Math.round(width * 0.024),
                    fontWeight: 700,
                    color: colorPalette.primary,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  {event.label}
                </div>

                {/* Title */}
                <div
                  style={{
                    fontFamily,
                    fontSize: autoFontSize(event.title, Math.round(width * 0.035), Math.round(width * 0.026)),
                    fontWeight: 700,
                    color: colorPalette.text,
                    lineHeight: 1.3,
                  }}
                >
                  {event.title}
                </div>

                {/* Description */}
                {event.description && (
                  <div
                    style={{
                      fontFamily,
                      fontSize: autoFontSize(event.description ?? "", Math.round(width * 0.028), Math.round(width * 0.022)),
                      fontWeight: 400,
                      color: `${colorPalette.text}90`,
                      lineHeight: 1.4,
                      marginTop: 8,
                    }}
                  >
                    {event.description}
                  </div>
                )}
              </GlassCard>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ═════════════════════════════════════
// Center-Focus Mode (Classic, Upgraded)
// ═════════════════════════════════════

const CenterFocusTimeline: React.FC<{
  events: { label: string; title: string; description?: string | null }[];
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
  revealFrames: number[];
  width: number;
  height: number;
}> = ({ events, colorPalette, frame, fps, revealFrames, width, height }) => {
  const containerTop = Math.round(height * 0.22);
  const containerBottom = Math.round(height * 0.08);
  const availableHeight = Math.max(400, height - containerTop - containerBottom);
  const eventSpacing = Math.max(
    140,
    Math.min(Math.round(height * 0.18), Math.round(availableHeight / events.length)),
  );

  const nodeSize = Math.round(width * 0.065); // ~70px
  const spineWidth = Math.round(width * 0.008); // ~8px

  // Line grows to match position of last revealed event (pixel-accurate)
  const lastRevealedIndex = events.reduce(
    (last, _, i) => (frame >= revealFrames[i] ? i : last),
    -1,
  );
  // Line height = distance from top to center of last revealed node
  const lineHeightPx = lastRevealedIndex >= 0
    ? lastRevealedIndex * eventSpacing + eventSpacing / 2
    : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: containerTop,
        bottom: containerBottom,
        left: 40,
        right: 40,
      }}
    >
      {/* Vertical center line — grows to last revealed node */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          width: spineWidth,
          height: lineHeightPx,
          background: `linear-gradient(180deg, ${colorPalette.primary}, ${colorPalette.secondary}80)`,
          transform: "translateX(-50%)",
          borderRadius: spineWidth / 2,
          boxShadow: `0 0 20px ${colorPalette.primary}40, 0 0 40px ${colorPalette.primary}15`,
        }}
      />

      {/* Events */}
      {events.map((event, i) => {
        const isLeft = i % 2 === 0;
        const delay = revealFrames[i];
        const isActive = frame >= delay && (i === events.length - 1 || frame < (revealFrames[i + 1] ?? Infinity));

        // Node animation
        const nodeProgress = spring({
          frame: Math.max(0, frame - delay),
          fps,
          config: { damping: 14, stiffness: 150, mass: 0.5 },
        });
        const nodeOpacity = interpolate(
          frame,
          [delay, delay + 8],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );

        // Content slide
        const contentProgress = spring({
          frame: Math.max(0, frame - delay - 4),
          fps,
          config: { damping: 18, stiffness: 100, mass: 0.6 },
        });
        const contentOpacity = interpolate(
          frame,
          [delay + 4, delay + 14],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const contentTranslateX = interpolate(
          contentProgress,
          [0, 1],
          [isLeft ? -40 : 40, 0],
        );

        // Active glow
        const glowPulse = isActive
          ? interpolate(Math.sin(frame * 0.08), [-1, 1], [0.3, 0.7])
          : 0;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: i * eventSpacing,
              left: 0,
              right: 0,
              height: eventSpacing,
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* Content card */}
            <div
              style={{
                position: "absolute",
                [isLeft ? "right" : "left"]: `calc(50% + ${nodeSize / 2 + 24}px)`,
                width: `calc(50% - ${nodeSize / 2 + 36}px)`,
                opacity: contentOpacity,
                transform: `translateX(${contentTranslateX}px)`,
              }}
            >
              <GlassCard
                active={isActive}
                glowColor={colorPalette.primary}
                padding={20}
                borderRadius={18}
              >
                <div
                  style={{
                    fontFamily,
                    fontSize: Math.round(width * 0.022),
                    fontWeight: 700,
                    color: colorPalette.primary,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  {event.label}
                </div>
                <div
                  style={{
                    fontFamily,
                    fontSize: autoFontSize(event.title, Math.round(width * 0.032), Math.round(width * 0.024)),
                    fontWeight: 700,
                    color: colorPalette.text,
                    lineHeight: 1.3,
                    textAlign: isLeft ? "right" : "left",
                  }}
                >
                  {event.title}
                </div>
                {event.description && (
                  <div
                    style={{
                      fontFamily,
                      fontSize: autoFontSize(event.description ?? "", Math.round(width * 0.026), Math.round(width * 0.020)),
                      fontWeight: 400,
                      color: `${colorPalette.text}90`,
                      lineHeight: 1.35,
                      marginTop: 6,
                      textAlign: isLeft ? "right" : "left",
                    }}
                  >
                    {event.description}
                  </div>
                )}
              </GlassCard>
            </div>

            {/* Node circle — LARGE */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                transform: `translate(-50%, 0) scale(${nodeProgress})`,
                opacity: nodeOpacity,
                width: nodeSize,
                height: nodeSize,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
                boxShadow: isActive
                  ? `0 0 30px ${colorPalette.primary}${Math.round(glowPulse * 255).toString(16).padStart(2, "0")}, 0 0 50px ${colorPalette.primary}20`
                  : `0 0 12px ${colorPalette.primary}30`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 5,
              }}
            >
              <span
                style={{
                  fontFamily,
                  fontSize: Math.round(nodeSize * 0.4),
                  fontWeight: 800,
                  color: "#FFFFFF",
                }}
              >
                {i + 1}
              </span>
            </div>

            {/* Outer ring */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                transform: `translate(-50%, 0) scale(${nodeProgress})`,
                opacity: nodeOpacity * (isActive ? 0.6 : 0.25),
                width: nodeSize + 20,
                height: nodeSize + 20,
                borderRadius: "50%",
                border: `3px solid ${colorPalette.primary}40`,
                zIndex: 4,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

// ═════════════════════════════════════
// Main Export
// ═════════════════════════════════════

export const Timeline: React.FC<TimelineProps> = ({
  scene,
  colorPalette,
  wordTimestamps = [],
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const exitOpacity = useExitAnimation();

  const events = (scene.timelineEvents ?? []).slice(0, 5);
  if (events.length === 0) {
    return (
      <AbsoluteFill
        style={{ background: colorPalette.background, opacity: exitOpacity }}
      />
    );
  }

  // Header animation
  const headerOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Voice-sync reveal frames for events
  const revealFrames = getItemRevealFrames(
    events.map((e) => ({ title: e.title })),
    wordTimestamps,
    scene.startMs,
    scene.endMs,
    fps,
  );

  // Choose layout mode
  const layout = scene.layout ?? "left_aligned";

  return (
    <AbsoluteFill style={{ opacity: exitOpacity }}>
      {/* Animated background */}
      <AnimatedGradientBg
        colorPalette={colorPalette}
        intensity="subtle"
        withParticles={true}
        particleDensity={12}
      />

      {/* Header */}
      <TimelineHeader
        text={scene.visualDescription}
        colorPalette={colorPalette}
        opacity={headerOpacity}
        width={width}
        height={height}
      />

      {/* Layout variant */}
      {layout === "center_focus" ? (
        <CenterFocusTimeline
          events={events}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          revealFrames={revealFrames}
          width={width}
          height={height}
        />
      ) : (
        <LeftAlignedTimeline
          events={events}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
          revealFrames={revealFrames}
          width={width}
          height={height}
        />
      )}
    </AbsoluteFill>
  );
};
