// remotion/src/components/FloatingParticles.tsx
/**
 * Deterministic floating particles — subtle animated dots for visual depth.
 *
 * IMPORTANT: No Math.random() — Remotion requires deterministic rendering.
 * Uses golden-angle distribution for pseudo-random but reproducible positions.
 *
 * Used by TitleCard and AnimatedGradientBg for ambient background interest.
 */

import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

const DEFAULT_PARTICLE_COUNT = 20;

interface FloatingParticlesProps {
  primaryColor: string;
  secondaryColor: string;
  /** Number of particles to render (default: 20) */
  density?: number;
  /** Base opacity multiplier (default: 1.0, range 0-1) */
  baseOpacity?: number;
  /** Seed for deterministic variation per video (default: 0 = no variation) */
  seed?: number;
}

export const FloatingParticles: React.FC<FloatingParticlesProps> = ({
  primaryColor,
  secondaryColor,
  density = DEFAULT_PARTICLE_COUNT,
  baseOpacity = 1.0,
  seed = 0,
}) => {
  const frame = useCurrentFrame();

  // Deterministic particle properties (golden-angle distribution + seed offset)
  const s = seed >>> 0; // ensure unsigned
  const particles = Array.from({ length: density }, (_, i) => ({
    x: (i * 137.508 + s * 17.3) % 100,
    y: (i * 91.1 + s * 23.7) % 100,
    size: 2 + ((i + s) % 7) * 3,
    verticalSpeed: 0.3 + ((i + s) % 5) * 0.12,
    horizontalSpeed: 0.6 + ((i + s) % 4) * 0.2,
    opacity: 0.08 + ((i + s) % 5) * 0.03,
    blur: 2 + ((i + s) % 3) * 2,
    phase: i * 2.1 + s * 0.7,
    driftAmplitude: 6 + ((i + s) % 4) * 3,
  }));

  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      {particles.map((p, i) => {
        const y = ((p.y + frame * p.verticalSpeed * 0.1) % 120) - 10;
        const xDrift =
          Math.sin(frame * 0.03 * p.horizontalSpeed + p.phase) *
          p.driftAmplitude;
        const opacityPulse =
          p.opacity + Math.sin(frame * 0.02 + p.phase) * 0.06;
        const particleColor = i % 2 === 0 ? primaryColor : secondaryColor;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${y}%`,
              transform: `translateX(${xDrift}px)`,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              backgroundColor: particleColor,
              opacity: Math.max(0.05, Math.min(0.25, opacityPulse)) * baseOpacity,
              filter: `blur(${p.blur}px)`,
              boxShadow: `0 0 ${8 + p.blur * 2}px ${particleColor}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
