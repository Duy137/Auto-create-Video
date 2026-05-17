// remotion/src/components/GlassCard.tsx
/**
 * Reusable glassmorphism card component for non-media scenes.
 *
 * Features:
 *   - Frosted glass effect (backdrop-filter: blur)
 *   - Optional pulsing glow border when `active`
 *   - Optional gradient accent side (left or top)
 *   - Deterministic animations (frame-based, no CSS transitions)
 *
 * Used by: Timeline, InfoCard, Comparison, StatsHighlight, StoryBeats
 */

import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

export interface GlassCardProps {
  children: React.ReactNode;
  /** Color for the glow effect when active */
  glowColor?: string;
  /** When true, border pulses with glow effect */
  active?: boolean;
  /** Gradient accent border position */
  accentSide?: "left" | "top" | "none";
  /** Accent gradient colors [from, to]. Defaults to glowColor if not set */
  accentColors?: [string, string];
  /** Inner padding in px */
  padding?: number;
  /** Border radius in px */
  borderRadius?: number;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  glowColor = "rgba(255,255,255,0.3)",
  active = false,
  accentSide = "none",
  accentColors,
  padding = 24,
  borderRadius = 20,
  style,
}) => {
  const frame = useCurrentFrame();

  // Pulsing glow when active (deterministic sine wave)
  const glowPulse = active
    ? interpolate(Math.sin(frame * 0.08), [-1, 1], [0.15, 0.45])
    : 0;

  const borderGlow = active
    ? `0 0 20px ${glowColor}${Math.round(glowPulse * 255).toString(16).padStart(2, "0")}`
    : "none";

  const borderColor = active
    ? `${glowColor}60`
    : "rgba(255, 255, 255, 0.08)";

  // Accent border gradient
  const accentGradient =
    accentSide !== "none" && accentColors
      ? `linear-gradient(${accentSide === "left" ? "to bottom" : "to right"}, ${accentColors[0]}, ${accentColors[1]})`
      : accentSide !== "none"
        ? `linear-gradient(${accentSide === "left" ? "to bottom" : "to right"}, ${glowColor}, ${glowColor}80)`
        : undefined;

  return (
    <div
      style={{
        position: "relative",
        borderRadius,
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Accent border (rendered as pseudo-element via div) */}
      {accentSide !== "none" && accentGradient && (
        <div
          style={{
            position: "absolute",
            ...(accentSide === "left"
              ? { top: 0, left: 0, bottom: 0, width: 4 }
              : { top: 0, left: 0, right: 0, height: 4 }),
            background: accentGradient,
            borderRadius:
              accentSide === "left"
                ? `${borderRadius}px 0 0 ${borderRadius}px`
                : `${borderRadius}px ${borderRadius}px 0 0`,
            zIndex: 2,
          }}
        />
      )}

      {/* Glass background */}
      <div
        style={{
          padding,
          paddingLeft: accentSide === "left" ? padding + 8 : padding,
          paddingTop: accentSide === "top" ? padding + 8 : padding,
          backgroundColor: "rgba(255, 255, 255, 0.04)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${borderColor}`,
          borderRadius,
          boxShadow: `0 8px 32px rgba(0, 0, 0, 0.2), ${borderGlow}`,
          position: "relative",
          zIndex: 1,
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
};
