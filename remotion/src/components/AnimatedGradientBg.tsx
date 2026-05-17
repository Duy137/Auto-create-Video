// remotion/src/components/AnimatedGradientBg.tsx
/**
 * Animated gradient background for non-media scenes.
 *
 * Replaces the flat `colorPalette.background` with a slowly-rotating
 * gradient that creates a "living" feel. Optionally includes FloatingParticles.
 *
 * Pattern extracted from TitleCard (which already had this effect).
 * Now available for all non-media scene types.
 *
 * IMPORTANT: All animations are deterministic (frame-based).
 */

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
} from "remotion";
import type { VideoProps } from "../schemas/videoProps";
import { FloatingParticles } from "./FloatingParticles";

export interface AnimatedGradientBgProps {
  colorPalette: VideoProps["colorPalette"];
  /** Controls gradient color bleed intensity */
  intensity?: "subtle" | "normal" | "vibrant";
  /** Include floating particles for extra depth */
  withParticles?: boolean;
  /** Particle density when withParticles is true */
  particleDensity?: number;
}

const INTENSITY_MAP = {
  subtle: { primary: "10", secondary: "08", glow: "06" },
  normal: { primary: "18", secondary: "12", glow: "0A" },
  vibrant: { primary: "25", secondary: "18", glow: "12" },
} as const;

export const AnimatedGradientBg: React.FC<AnimatedGradientBgProps> = ({
  colorPalette,
  intensity = "normal",
  withParticles = true,
  particleDensity = 15,
}) => {
  const frame = useCurrentFrame();
  const durationEstimate = 300; // ~10s at 30fps, safe fallback

  const alphas = INTENSITY_MAP[intensity];

  // Slowly rotating gradient angle
  const gradientAngle = interpolate(
    frame,
    [0, durationEstimate],
    [150, 210],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Breathing gradient stop position
  const gradientStop = interpolate(
    Math.sin(frame * 0.02),
    [-1, 1],
    [30, 50],
  );

  // Subtle glow pulse for the secondary accent
  const glowOpacity = interpolate(
    Math.sin(frame * 0.015 + 1.5),
    [-1, 1],
    [0.3, 0.7],
  );

  return (
    <>
      {/* Base dark background */}
      <AbsoluteFill
        style={{
          background: colorPalette.background,
        }}
      />

      {/* Animated gradient overlay */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(${gradientAngle}deg, ${colorPalette.primary}${alphas.primary} 0%, ${colorPalette.background} ${gradientStop}%, ${colorPalette.secondary}${alphas.secondary} 100%)`,
        }}
      />

      {/* Centered radial glow (primary color) */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 60% 40% at 50% 45%, ${colorPalette.primary}${alphas.glow} 0%, transparent 70%)`,
          opacity: glowOpacity,
        }}
      />

      {/* Floating particles for depth */}
      {withParticles && (
        <FloatingParticles
          primaryColor={colorPalette.primary}
          secondaryColor={colorPalette.secondary}
          density={particleDensity}
          baseOpacity={0.06}
        />
      )}
    </>
  );
};
