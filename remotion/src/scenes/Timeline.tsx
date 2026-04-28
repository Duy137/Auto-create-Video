// remotion/src/scenes/Timeline.tsx
/**
 * Timeline scene — vertical connected events with nodes.
 * Sequential stagger reveal from top to bottom.
 * Text alternates left/right of the center line.
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

interface TimelineProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: { text: string; startMs: number; endMs: number }[];
}

export const Timeline: React.FC<TimelineProps> = ({
  scene,
  colorPalette,
  wordTimestamps = [],
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
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

  // Vertical line grows per revealed segment
  const lastRevealedIndex = events.reduce(
    (last, _, i) => (frame >= revealFrames[i] ? i : last),
    -1,
  );
  const lineHeight = interpolate(
    lastRevealedIndex,
    [-1, events.length - 1],
    [0, 100],
    { extrapolateRight: "clamp" },
  );

  // Layout calculations
  const containerTop = 300;
  const containerBottom = 460;
  const availableHeight = 1920 - containerTop - containerBottom;
  const eventSpacing = Math.min(180, availableHeight / events.length);

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
          padding: "0 80px",
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

      {/* Timeline container */}
      <div
        style={{
          position: "absolute",
          top: containerTop,
          bottom: containerBottom,
          left: 80,
          right: 80,
        }}
      >
        {/* Vertical center line */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: 3,
            height: `${lineHeight}%`,
            background: `linear-gradient(180deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
            transform: "translateX(-50%)",
            borderRadius: 2,
          }}
        />

        {/* Events */}
        {events.map((event, i) => {
          const isLeft = i % 2 === 0;
          const delay = revealFrames[i];

          // Node + content animation
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
          const nodeScale = interpolate(nodeProgress, [0, 1], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          // Content slide animation
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
              {/* Content - left or right of center */}
              <div
                style={{
                  position: "absolute",
                  [isLeft ? "right" : "left"]: "calc(50% + 28px)",
                  width: "calc(50% - 40px)",
                  opacity: contentOpacity,
                  transform: `translateX(${contentTranslateX}px)`,
                  textAlign: isLeft ? "right" : "left",
                }}
              >
                {/* Label (year/step) */}
                <div
                  style={{
                    fontFamily,
                    fontSize: 18,
                    fontWeight: 700,
                    color: colorPalette.primary,
                    letterSpacing: 1,
                    marginBottom: 4,
                    textTransform: "uppercase",
                  }}
                >
                  {event.label}
                </div>

                {/* Title */}
                <div
                  style={{
                    fontFamily,
                    fontSize: 24,
                    fontWeight: 700,
                    color: colorPalette.text,
                    lineHeight: 1.3,
                  }}
                >
                  {event.title}
                </div>

                {/* Description (optional) */}
                {event.description && (
                  <div
                    style={{
                      fontFamily,
                      fontSize: autoFontSize(event.description ?? "", 22, 18),
                      fontWeight: 400,
                      color: `${colorPalette.text}99`,
                      lineHeight: 1.3,
                      marginTop: 4,
                    }}
                  >
                    {event.description}
                  </div>
                )}
              </div>

              {/* Node circle */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: `translate(-50%, 0) scale(${nodeScale})`,
                  opacity: nodeOpacity,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${colorPalette.primary}, ${colorPalette.secondary})`,
                  boxShadow: `0 0 12px ${colorPalette.primary}60`,
                  zIndex: 5,
                }}
              />

              {/* Outer ring */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: `translate(-50%, 0) scale(${nodeScale})`,
                  opacity: nodeOpacity * 0.4,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: `2px solid ${colorPalette.primary}60`,
                  zIndex: 4,
                }}
              />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
