// remotion/src/components/AnimatedCaption.tsx
/**
 * TikTok-style animated captions — global overlay layer.
 * Highlights the currently spoken word based on wordTimestamps timing.
 *
 * Renders as a global overlay (outside TransitionSeries), using absolute
 * frame-based timing to determine which word is active.
 *
 * Disabled for scenes that already have their own text display
 * (title_card, stock_background).
 */

import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { fontFamily } from "../lib/fonts";
import type { SceneData } from "../schemas/videoProps";

interface WordTimestamp {
  text: string;
  startMs: number;
  endMs: number;
}

interface SubtitleSettings {
  enabled: boolean;
  font: string;
  fontSize: number;
  fontColor: string;
  highlightColor: string;
  strokeColor: string;
  strokeWidth: number;
  position: "top" | "center" | "bottom";
  preset?: "default" | "bold_pop" | "karaoke" | "minimal";
}

// ── Subtitle Presets ──

interface PresetConfig {
  fontSizeMultiplier: number;
  strokeWidthOverride?: number;
  highlightScale: number;
  inactiveOpacity: number;
  activeOpacity: number;
}

const PRESETS: Record<string, PresetConfig> = {
  default: {
    fontSizeMultiplier: 1,
    highlightScale: 1.15,
    inactiveOpacity: 1,
    activeOpacity: 1,
  },
  bold_pop: {
    fontSizeMultiplier: 1.1,
    strokeWidthOverride: 4,
    highlightScale: 1.1,
    inactiveOpacity: 1,
    activeOpacity: 1,
  },
  karaoke: {
    fontSizeMultiplier: 1,
    strokeWidthOverride: 3,
    highlightScale: 1.05,
    inactiveOpacity: 0.3,
    activeOpacity: 1.0,
  },
  minimal: {
    fontSizeMultiplier: 0.85,
    strokeWidthOverride: 1,
    highlightScale: 1.0,
    inactiveOpacity: 1,
    activeOpacity: 1,
  },
};

interface AnimatedCaptionProps {
  wordTimestamps: WordTimestamp[];
  subtitleSettings: SubtitleSettings;
  /** All scenes — used for per-scene-type disable logic */
  scenes: SceneData[];
}

/** Scenes that already display their own text — captions disabled */
const CAPTION_DISABLED_TYPES = new Set(["title_card", "stock_background"]);

const withHexAlpha = (hexColor: string, alpha: number): string => {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  if (!/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
    return hexColor;
  }

  const alphaInt = Math.round(clampedAlpha * 255);
  const alphaHex =
    Math.floor(alphaInt / 16).toString(16) + (alphaInt % 16).toString(16);

  return `${hexColor}${alphaHex}`;
};

export const AnimatedCaption: React.FC<AnimatedCaptionProps> = ({
  wordTimestamps,
  subtitleSettings,
  scenes,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!subtitleSettings.enabled || wordTimestamps.length === 0) {
    return null;
  }

  // Resolve preset overrides
  const preset = PRESETS[subtitleSettings.preset ?? "default"] ?? PRESETS.default;
  const effectiveFontSize = Math.round(subtitleSettings.fontSize * preset.fontSizeMultiplier);
  const effectiveStrokeWidth = preset.strokeWidthOverride ?? subtitleSettings.strokeWidth;

  // Global absolute time in ms
  const currentMs = (frame / fps) * 1000;

  // Find current scene based on absolute time
  const currentScene = scenes.find(
    (s) => currentMs >= s.startMs && currentMs < s.endMs,
  );

  // Disable caption for scenes that have their own text
  if (!currentScene || CAPTION_DISABLED_TYPES.has(currentScene.sceneType)) {
    return null;
  }

  // Dynamic grouping: short words fit more, long words fit fewer
  const averageWordLength =
    wordTimestamps.reduce(
      (total, w) => total + w.text.replace(/\s+/g, "").length,
      0,
    ) / wordTimestamps.length;
  const wordsPerGroup =
    averageWordLength < 4 ? 8 : averageWordLength < 8 ? 6 : 4;

  // Find current word index
  const currentWordIndex = wordTimestamps.findIndex(
    (w) => currentMs >= w.startMs && currentMs < w.endMs,
  );

  // Determine which group of words to show
  const upcomingWordIndex = wordTimestamps.findIndex(
    (w) => w.startMs > currentMs,
  );
  const anchorWordIndex =
    currentWordIndex >= 0
      ? currentWordIndex
      : upcomingWordIndex >= 0
        ? upcomingWordIndex
        : wordTimestamps.length - 1;
  const groupIndex = Math.floor(anchorWordIndex / wordsPerGroup);

  const startIdx = Math.max(0, groupIndex * wordsPerGroup);
  const visibleWords = wordTimestamps.slice(startIdx, startIdx + wordsPerGroup);

  if (visibleWords.length === 0) return null;

  // Fade in/out
  const groupStartMs = visibleWords[0].startMs;
  const groupEndMs = visibleWords[visibleWords.length - 1].endMs;

  // Guard: interpolate() requires strictly monotonically increasing inputRange.
  let opacity = 1;
  if (groupEndMs > groupStartMs) {
    opacity = interpolate(
      currentMs,
      [groupStartMs - 120, groupStartMs, groupEndMs, groupEndMs + 120],
      [0, 1, 1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  } else {
    // Single-word group: simple fade in/out over 240ms window
    opacity = interpolate(
      currentMs,
      [groupStartMs - 120, groupStartMs, groupStartMs + 120],
      [0, 1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  }

  const enterTranslateY = interpolate(
    currentMs,
    [groupStartMs - 150, groupStartMs],
    [20, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const exitTranslateY = interpolate(
    currentMs,
    [groupEndMs, groupEndMs + 120],
    [0, -8],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const groupTranslateY = enterTranslateY + exitTranslateY;

  // Position
  const positionMap: Record<string, React.CSSProperties> = {
    top: { top: 250, left: 0, right: 0 },
    center: { top: "50%", left: 0, right: 0 },
    bottom: { bottom: 440, left: 0, right: 0 },
  };

  const transformSegments: string[] = [];
  if (subtitleSettings.position === "center") {
    transformSegments.push("translateY(-50%)");
  }
  transformSegments.push(`translateY(${groupTranslateY}px)`);

   const strokeShadow = `
      ${effectiveStrokeWidth}px ${effectiveStrokeWidth}px 0 ${subtitleSettings.strokeColor},
      -${effectiveStrokeWidth}px ${effectiveStrokeWidth}px 0 ${subtitleSettings.strokeColor},
      ${effectiveStrokeWidth}px -${effectiveStrokeWidth}px 0 ${subtitleSettings.strokeColor},
      -${effectiveStrokeWidth}px -${effectiveStrokeWidth}px 0 ${subtitleSettings.strokeColor}
    `;

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    ...positionMap[subtitleSettings.position],
    transform: transformSegments.join(" "),
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "0 80px",
    opacity,
    pointerEvents: "none",
  };

  const textStyle: React.CSSProperties = {
    fontFamily,
    fontSize: effectiveFontSize,
    textAlign: "center",
    lineHeight: 1.4,
    textShadow: strokeShadow,
  };

  return (
    <div style={containerStyle}>
      <div
        style={{
          background:
            "linear-gradient(transparent, rgba(0,0,0,0.4) 20%, rgba(0,0,0,0.4) 80%, transparent)",
          padding: "20px 40px",
          borderRadius: 12,
        }}
      >
        <div style={textStyle}>
          {visibleWords.map((word, i) => {
            const isActive = currentMs >= word.startMs && currentMs < word.endMs;

            const activeWordFrame = Math.max(
              0,
              Math.floor(((currentMs - word.startMs) / 1000) * fps),
            );
            const activeWordSpring = spring({
              frame: activeWordFrame,
              fps,
              config: { damping: 12, stiffness: 200, mass: 0.3 },
            });
            // Guard: interpolate needs strictly increasing range
            const wordStart = word.startMs;
            const wordEnd = word.endMs > word.startMs ? word.endMs : word.startMs + 1;
            const activeProgress = interpolate(
              currentMs,
              [wordStart, wordEnd],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );

            const scale = isActive
              ? 1 + activeWordSpring * preset.highlightScale * 0.15 - activeProgress * 0.1
              : 1;
            const liftY = isActive
              ? interpolate(activeWordSpring, [0, 1], [0, -4], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
              : 0;

            const glowPulse = 0.5 + 0.5 * Math.sin(frame * 0.15 + i * 0.6);
            const activeGlowColor = withHexAlpha(
              subtitleSettings.highlightColor,
              0.35 + glowPulse * 0.35,
            );
            const glowRadius = 14 + glowPulse * 18;

            // Karaoke preset: dim inactive words
            const wordBaseOpacity = isActive
              ? preset.activeOpacity
              : currentMs > word.endMs
                ? preset.activeOpacity // already spoken = full
                : preset.inactiveOpacity; // not yet spoken

            const wordStyle: React.CSSProperties = {
              color: isActive
                ? subtitleSettings.highlightColor
                : subtitleSettings.fontColor,
              fontWeight: isActive ? 800 : 700,
              display: "inline-block",
              transform: `translateY(${liftY}px) scale(${scale})`,
              marginRight: 8,
              opacity: wordBaseOpacity,
              textShadow: isActive
                ? `${strokeShadow}, 0 0 ${glowRadius}px ${activeGlowColor}`
                : strokeShadow,
            };

            return (
              <span key={`${word.startMs}-${i}`} style={wordStyle}>
                {word.text}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
