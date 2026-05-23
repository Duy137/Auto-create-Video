// remotion/src/components/ProgressBar.tsx
/**
 * Thin progress bar at the bottom edge of the video.
 * Shows overall video playback progress.
 *
 * 3 visual variants (selected per-video by seed):
 *   - "line"      — gradient line with glow dot (original/default)
 *   - "dots"      — row of small circles that fill sequentially
 *   - "segmented" — discrete segments with gaps
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

interface ProgressBarProps {
  color: string;
  secondaryColor?: string;
  /** Visual style: "line" (default), "dots", "segmented" */
  variant?: "line" | "dots" | "segmented";
}

// ── Shared constants ──
const BAR_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 100,
};

// ── LINE variant (original) ──
const LineBar: React.FC<{ progress: number; color: string; gradientTo: string }> = ({
  progress,
  color,
  gradientTo,
}) => {
  const glowSize = 8;
  return (
    <div style={{ ...BAR_STYLE, height: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
      <div
        style={{
          width: `${progress * 100}%`,
          height: "100%",
          background: `linear-gradient(90deg, ${color}, ${gradientTo})`,
          borderRadius: 2,
          position: "relative",
        }}
      >
        {progress > 0 && (
          <span
            style={{
              position: "absolute",
              right: -glowSize / 2,
              top: "50%",
              width: glowSize,
              height: glowSize,
              borderRadius: "50%",
              transform: "translateY(-50%)",
              backgroundColor: gradientTo,
              filter: "blur(1px)",
              boxShadow: `0 0 10px ${gradientTo}`,
            }}
          />
        )}
      </div>
    </div>
  );
};

// ── DOTS variant ──
const DOTS_COUNT = 12;
const DotsBar: React.FC<{ progress: number; color: string; gradientTo: string }> = ({
  progress,
  color,
  gradientTo,
}) => {
  return (
    <div style={{ ...BAR_STYLE, height: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
      {Array.from({ length: DOTS_COUNT }, (_, i) => {
        const dotProgress = (i + 1) / DOTS_COUNT;
        const filled = progress >= dotProgress;
        const isActive = progress >= (i / DOTS_COUNT) && progress < dotProgress;
        return (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: filled
                ? gradientTo
                : "rgba(255,255,255,0.12)",
              transform: isActive ? "scale(1.4)" : "scale(1)",
              transition: "transform 0.1s",
              boxShadow: filled ? `0 0 6px ${color}40` : "none",
              opacity: filled ? 1 : 0.4,
            }}
          />
        );
      })}
    </div>
  );
};

// ── SEGMENTED variant ──
const SEGMENT_COUNT = 8;
const SEGMENT_GAP = 3;
const SegmentedBar: React.FC<{ progress: number; color: string; gradientTo: string }> = ({
  progress,
  color,
  gradientTo,
}) => {
  return (
    <div style={{ ...BAR_STYLE, height: 5, display: "flex", gap: SEGMENT_GAP, padding: "0 2px" }}>
      {Array.from({ length: SEGMENT_COUNT }, (_, i) => {
        const segProgress = (i + 1) / SEGMENT_COUNT;
        const filled = progress >= segProgress;
        const partial = !filled && progress > (i / SEGMENT_COUNT);
        const fillPercent = partial
          ? ((progress - i / SEGMENT_COUNT) / (1 / SEGMENT_COUNT)) * 100
          : filled ? 100 : 0;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: "100%",
              backgroundColor: "rgba(255,255,255,0.08)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${fillPercent}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${color}, ${gradientTo})`,
                borderRadius: 2,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

// ── Main component ──
export const ProgressBar: React.FC<ProgressBarProps> = ({
  color,
  secondaryColor,
  variant = "line",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = Math.max(0, Math.min(1, frame / durationInFrames));
  const gradientTo = secondaryColor ?? color;

  switch (variant) {
    case "dots":
      return <DotsBar progress={progress} color={color} gradientTo={gradientTo} />;
    case "segmented":
      return <SegmentedBar progress={progress} color={color} gradientTo={gradientTo} />;
    case "line":
    default:
      return <LineBar progress={progress} color={color} gradientTo={gradientTo} />;
  }
};
