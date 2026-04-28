// remotion/src/scenes/StockBackground.tsx
/**
 * Stock Background scene — supports two layouts:
 *   - media_overlay (default): blurred video/image background + text overlay
 *   - center_focus: gradient background only (no media) + centered text
 *
 * Keywords are highlighted in the narration overlay.
 */

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import { BackgroundVideo } from "../components/BackgroundVideo";
import type { SceneData, VideoProps } from "../schemas/videoProps";
import { fontFamily } from "../lib/fonts";
import { useExitAnimation } from "../lib/useExitAnimation";

interface WordTimestamp {
  text: string;
  startMs: number;
  endMs: number;
}

interface StockBackgroundProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: WordTimestamp[];
}

// ── Shared: chunk words into display lines by character count ──

function chunkByChars(words: WordTimestamp[], maxChars: number = 28): WordTimestamp[][] {
  const lines: WordTimestamp[][] = [];
  let currentLine: WordTimestamp[] = [];
  let currentLength = 0;

  for (const word of words) {
    const wordLen = word.text.length + (currentLine.length > 0 ? 1 : 0); // +1 for space
    if (currentLength + wordLen > maxChars && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [word];
      currentLength = word.text.length;
    } else {
      currentLine.push(word);
      currentLength += wordLen;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);
  return lines;
}

// ── Shared: Narration text with keyword highlighting (line-by-line slide + word-by-word sync) ──

const NarrationText: React.FC<{
  narration: string;
  keywordsToHighlight: string[];
  colorPalette: VideoProps["colorPalette"];
  fontSize?: number;
  wordTimestamps: WordTimestamp[];
  sceneStartMs: number;
  sceneEndMs: number;
}> = ({
  narration,
  keywordsToHighlight,
  colorPalette,
  fontSize = 52,
  wordTimestamps,
  sceneStartMs,
  sceneEndMs,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const highlightSet = new Set(
      keywordsToHighlight.map((k) => k.toLowerCase()),
    );

    // Current absolute time in ms (frame is relative to scene start)
    const currentMs = sceneStartMs + (frame / fps) * 1000;

    // Filter words belonging to this scene's time window
    const sceneWords = wordTimestamps.filter(
      (w) => w.startMs >= sceneStartMs && w.startMs < sceneEndMs,
    );

    // Fallback: if no word timestamps match, render static text
    if (sceneWords.length === 0) {
      const words = narration.split(" ");
      return (
        <div
          style={{
            textAlign: "center",
            lineHeight: 1.6,
            maxWidth: 900,
          }}
        >
          {words.map((word, i) => {
            const isHighlighted = highlightSet.has(
              word.toLowerCase().replace(/[.,!?]/g, ""),
            );
            return (
              <span
                key={i}
                style={{
                  fontFamily,
                  fontSize,
                  fontWeight: isHighlighted ? 900 : 700,
                  color: isHighlighted ? colorPalette.primary : colorPalette.text,
                  textShadow: isHighlighted
                    ? `0 0 30px ${colorPalette.primary}80, 0 0 60px ${colorPalette.primary}40, 0 2px 8px rgba(0,0,0,0.6)`
                    : "0 2px 8px rgba(0,0,0,0.5)",
                  marginRight: 6,
                  display: "inline",
                }}
              >
                {word}{" "}
              </span>
            );
          })}
        </div>
      );
    }

    // Line-by-line slide-in with word-by-word highlight
    const lines = chunkByChars(sceneWords, 28);

    return (
      <div
        style={{
          textAlign: "center",
          lineHeight: 1.6,
          maxWidth: 900,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        {lines.map((lineWords, lineIndex) => {
          const firstWordMs = lineWords[0].startMs;
          const lineFrame = Math.max(
            0,
            frame - Math.round(((firstWordMs - sceneStartMs) / 1000) * fps)
          );

          const slideY = interpolate(lineFrame, [0, 15], [40, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const lineOpacity = interpolate(lineFrame, [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <div
              key={lineIndex}
              style={{
                transform: `translateY(${slideY}px)`,
                opacity: lineOpacity,
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              {lineWords.map((word, i) => {
                const isVisible = currentMs >= word.startMs;
                const isHighlighted = highlightSet.has(
                  word.text.toLowerCase().replace(/[.,!?]/g, ""),
                );

                // Slam bounce for keywords when they appear
                const revealFrame = Math.max(
                  0,
                  frame - Math.round(((word.startMs - sceneStartMs) / 1000) * fps),
                );
                const keywordScale =
                  isHighlighted && isVisible
                    ? interpolate(
                      spring({
                        frame: revealFrame,
                        fps,
                        config: { damping: 10, stiffness: 180, mass: 0.5 },
                      }),
                      [0, 1],
                      [0.8, 1],
                    )
                    : 1;

                return (
                  <span
                    key={`${word.startMs}-${i}`}
                    style={{
                      display: "inline",
                      opacity: isVisible ? 1 : 0,
                      transform: `scale(${keywordScale})`,
                      fontFamily,
                      fontSize,
                      fontWeight: isHighlighted ? 900 : 700,
                      color: isHighlighted ? colorPalette.primary : colorPalette.text,
                      textShadow: isHighlighted
                        ? `0 0 30px ${colorPalette.primary}80, 0 0 60px ${colorPalette.primary}40, 0 2px 8px rgba(0,0,0,0.6)`
                        : "0 2px 8px rgba(0,0,0,0.5)",
                      marginRight: 6,
                    }}
                  >
                    {word.text}{" "}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

export const StockBackground: React.FC<StockBackgroundProps> = ({
  scene,
  colorPalette,
  wordTimestamps = [],
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOpacity = useExitAnimation();
  const layout = scene.layout ?? "media_overlay";
  const sceneDurationFrames = Math.max(
    1,
    Math.round(((scene.endMs - scene.startMs) / 1000) * fps)
  );

  // Fade in
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Text slide up from bottom
  const translateY = interpolate(frame, [5, 25], [40, 0], {
    extrapolateRight: "clamp",
  });

  const sceneProgress = interpolate(frame, [0, sceneDurationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const easedProgress = Easing.inOut(Easing.ease)(sceneProgress);

  // Ken Burns effect — subtle zoom + pan (only for media_overlay)
  const kenBurnsScale = interpolate(easedProgress, [0, 1], [1, 1.09], {
    extrapolateRight: "clamp",
  });
  const kenBurnsPanX = interpolate(easedProgress, [0, 1], [0, -10], {
    extrapolateRight: "clamp",
  });
  const kenBurnsRotate = interpolate(easedProgress, [0, 1], [0, 0.3], {
    extrapolateRight: "clamp",
  });

  const gradientAngle = interpolate(
    frame,
    [0, sceneDurationFrames],
    [160, 200],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );
  const gradientStop = interpolate(Math.sin(frame * 0.02), [-1, 1], [37, 43]);

  return (
    <AbsoluteFill style={{ opacity: opacity * exitOpacity }}>
      {/* Background layer — depends on layout */}
      {layout === "center_focus" ? (
        // center_focus: gradient only, no media, no Ken Burns
        <AbsoluteFill
          style={{
            background: `linear-gradient(${gradientAngle}deg, ${colorPalette.background} 0%, ${colorPalette.secondary}18 ${gradientStop}%, ${colorPalette.background} 100%)`,
          }}
        />
      ) : (
        // media_overlay (default): blurred video/image background with Ken Burns
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              inset: -20,
              transform: `scale(${kenBurnsScale}) translateX(${kenBurnsPanX}px) rotate(${kenBurnsRotate}deg)`,
            }}
          >
            <BackgroundVideo
              mediaUrl={scene.mediaUrl}
              mediaType={scene.mediaType}
              fallbackGradient={[
                colorPalette.background,
                colorPalette.secondary + "33",
              ]}
              blurAmount={8}
              overlayOpacity={0.55}
              overlayColor={colorPalette.background}
            />
          </div>
        </div>
      )}

      {/* Content overlay */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 70px",
          transform: `translateY(${translateY}px)`,
        }}
      >
        {/* Visual description badge */}
        <div
          style={{
            marginBottom: 30,
            padding: "8px 24px",
            borderRadius: 20,
            backgroundColor: `${colorPalette.primary}22`,
            border: `1px solid ${colorPalette.primary}44`,
          }}
        >
          <span
            style={{
              fontFamily,
              fontSize: 20,
              color: colorPalette.primary,
              letterSpacing: 2,
            }}
          >
            {scene.visualDescription.slice(0, 40)}
          </span>
        </div>

        {/* Narration text with keyword highlighting */}
        {/* Adaptive font: scale down for long narrations to prevent overflow */}
        <NarrationText
          narration={scene.narration}
          keywordsToHighlight={scene.keywordsToHighlight}
          colorPalette={colorPalette}
          fontSize={scene.narration.length > 200 ? 38 : scene.narration.length > 120 ? 44 : 52}
          wordTimestamps={wordTimestamps}
          sceneStartMs={scene.startMs}
          sceneEndMs={scene.endMs}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
