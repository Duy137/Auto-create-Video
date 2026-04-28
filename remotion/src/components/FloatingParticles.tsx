// remotion/src/components/FloatingParticles.tsx
/**
 * Deterministic floating particles — subtle animated dots for visual depth.
 *
 * IMPORTANT: No Math.random() — Remotion requires deterministic rendering.
 * Uses golden-angle distribution for pseudo-random but reproducible positions.
 *
 * Currently used only by TitleCard for ambient background interest.
 */

import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

const PARTICLE_COUNT = 20;

interface FloatingParticlesProps {
  primaryColor: string;
  secondaryColor: string;
}

export const FloatingParticles: React.FC<FloatingParticlesProps> = ({
  primaryColor,
  secondaryColor,
}) => {
  const frame = useCurrentFrame();

  // Deterministic particle properties (golden-angle distribution)
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    x: (i * 137.508) % 100,
    y: (i * 91.1) % 100,
    size: 2 + (i % 7) * 3,
    verticalSpeed: 0.3 + (i % 5) * 0.12,
    horizontalSpeed: 0.6 + (i % 4) * 0.2,
    opacity: 0.08 + (i % 5) * 0.03,
    blur: 2 + (i % 3) * 2,
    phase: i * 2.1,
    driftAmplitude: 6 + (i % 4) * 3,
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
              opacity: Math.max(0.05, Math.min(0.25, opacityPulse)),
              filter: `blur(${p.blur}px)`,
              boxShadow: `0 0 ${8 + p.blur * 2}px ${particleColor}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
