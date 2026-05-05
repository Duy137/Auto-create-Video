/**
 * AnimatedBackground — gradient preset + floating particles + vignette.
 * Renders behind all scene content in AutoClipVideo root.
 * Deterministic — no Math.random().
 *
 * [CryptoVN Custom] — Supports customBackgroundUrl to override gradient.
 */

import React from "react";
import { AbsoluteFill, Img, Loop, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FloatingParticles } from "./FloatingParticles";

// ── 12 curated gradient presets by topic ──
export const GRADIENT_PRESETS: Record<string, string> = {
  deep_ocean:
    "radial-gradient(ellipse at 20% 80%, #0d1f3c 0%, #0a0f1e 40%, #06080f 100%)",
  midnight_ember:
    "radial-gradient(ellipse at 80% 20%, #1a0a0a 0%, #0f0f1a 50%, #080810 100%)",
  aurora_borealis:
    "radial-gradient(ellipse at 50% 0%, #0a2a1a 0%, #0a1628 40%, #060d18 100%)",
  cosmic_purple:
    "radial-gradient(ellipse at 30% 70%, #1a0d2a 0%, #0d0a1a 50%, #08060f 100%)",
  golden_dusk:
    "radial-gradient(ellipse at 70% 30%, #1a1508 0%, #0f0d06 40%, #0a0a08 100%)",
  cyber_teal:
    "radial-gradient(ellipse at 40% 60%, #081a1a 0%, #060f14 50%, #050a0f 100%)",
  rose_noir:
    "radial-gradient(ellipse at 60% 80%, #1a0a14 0%, #0f0810 50%, #08060a 100%)",
  forest_depth:
    "radial-gradient(ellipse at 50% 50%, #0a1a0d 0%, #060f08 50%, #040a06 100%)",
  steel_blue:
    "radial-gradient(ellipse at 30% 30%, #0d1520 0%, #080d14 50%, #05080d 100%)",
  warm_slate:
    "radial-gradient(ellipse at 60% 40%, #141210 0%, #0d0c0a 50%, #080806 100%)",
  electric_indigo:
    "radial-gradient(ellipse at 20% 50%, #100a20 0%, #0a0814 50%, #06050d 100%)",
  obsidian:
    "radial-gradient(ellipse at 50% 50%, #121212 0%, #0a0a0a 50%, #050505 100%)",
};

export const PRESET_KEYS = Object.keys(GRADIENT_PRESETS);

// Map topic keywords → best preset
export const TOPIC_PRESET_MAP: Record<string, string> = {
  technology: "cyber_teal",
  ai: "electric_indigo",
  crypto: "deep_ocean",
  blockchain: "deep_ocean",
  finance: "golden_dusk",
  business: "warm_slate",
  health: "forest_depth",
  science: "aurora_borealis",
  education: "cosmic_purple",
  entertainment: "rose_noir",
  default: "steel_blue",
};

// [CryptoVN Custom] — Resolve custom background URL
function resolveCustomBgUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("assets/") || url.startsWith("public/")) return staticFile(url.replace(/^public\//, ""));
  return url;
}

interface AnimatedBackgroundProps {
  preset?: string;
  primaryColor: string;
  secondaryColor: string;
  customBackgroundUrl?: string | null;
  customBackgroundType?: "image" | "video";
  customBackgroundDurationSec?: number | null;
}

export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
  preset = "steel_blue",
  primaryColor,
  secondaryColor,
  customBackgroundUrl,
  customBackgroundType = "image",
  customBackgroundDurationSec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const gradientBg = GRADIENT_PRESETS[preset] || GRADIENT_PRESETS.steel_blue;

  // Slow-moving secondary gradient orb for depth
  const orbX = 50 + Math.sin(frame * 0.008) * 20;
  const orbY = 50 + Math.cos(frame * 0.006) * 25;

  // [CryptoVN Custom] — Resolve custom background
  const hasCustomBg = !!customBackgroundUrl;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* Layer 1: Base gradient */}
      <AbsoluteFill style={{ background: gradientBg }} />

      {/* [CryptoVN Custom] Layer 1b: Custom background override */}
      {hasCustomBg && (
        <AbsoluteFill>
          {customBackgroundType === "video" ? (
            <Loop durationInFrames={Math.max(1, Math.ceil((customBackgroundDurationSec || 30) * fps))}>
              <OffthreadVideo
                src={resolveCustomBgUrl(customBackgroundUrl!)}
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </Loop>
          ) : (
            <Img
              src={resolveCustomBgUrl(customBackgroundUrl!)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </AbsoluteFill>
      )}

      {/* Layer 2: Slow-moving color orb */}
      {!hasCustomBg && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at ${orbX}% ${orbY}%, ${primaryColor}08 0%, transparent 50%)`,
          }}
        />
      )}

      {/* Layer 3: Floating particles */}
      <FloatingParticles
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
      />

      {/* Layer 4: Vignette — darken edges */}
      <AbsoluteFill
        style={{
          background:
            `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${hasCustomBg ? 0.6 : 0.4}) 100%)`,
        }}
      />

      {/* Layer 5: Subtle noise texture (CSS-based, no image needed) */}
      <AbsoluteFill
        style={{
          opacity: 0.03,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "200px 200px",
        }}
      />
    </AbsoluteFill>
  );
};
