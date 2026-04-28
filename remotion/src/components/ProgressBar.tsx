// remotion/src/components/ProgressBar.tsx
/**
 * Thin progress bar at the bottom edge of the video.
 * Shows overall video playback progress.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

interface ProgressBarProps {
  color: string;
  secondaryColor?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  color,
  secondaryColor,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = Math.max(0, Math.min(1, frame / durationInFrames));
  const gradientTo = secondaryColor ?? color;
  const glowSize = 8;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 4,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderRadius: 2,
        zIndex: 100,
        overflow: "hidden",
      }}
    >
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
