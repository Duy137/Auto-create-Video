/**
 * AnimatedBackground — gradient preset + floating particles + vignette.
 * Renders behind all scene content in AutoClipVideo root.
 * Deterministic — no Math.random().
 * Supports custom background image/video override.
 */

import React from "react";
import { AbsoluteFill, Img, Video, useCurrentFrame, staticFile, getRemotionEnvironment } from "remotion";
import { FloatingParticles } from "./FloatingParticles";

// ── 12 curated gradient presets by topic ──
export const GRADIENT_PRESETS: Record<string, string> = {
  deep_ocean:
    "radial-gradient(ellipse at 20% 80%, #1a3d6b 0%, #0e1e32 40%, #080e1a 100%)",
  midnight_ember:
    "radial-gradient(ellipse at 80% 20%, #4a1818 0%, #1e1020 50%, #0e0810 100%)",
  aurora_borealis:
    "radial-gradient(ellipse at 50% 0%, #145030 0%, #0e2838 40%, #081420 100%)",
  cosmic_purple:
    "radial-gradient(ellipse at 30% 70%, #301a55 0%, #181035 50%, #0c0818 100%)",
  golden_dusk:
    "radial-gradient(ellipse at 70% 30%, #3d3012 0%, #201a0a 40%, #12100a 100%)",
  cyber_teal:
    "radial-gradient(ellipse at 40% 60%, #124040 0%, #0e2530 50%, #081418 100%)",
  rose_noir:
    "radial-gradient(ellipse at 60% 80%, #401530 0%, #201018 50%, #100a10 100%)",
  forest_depth:
    "radial-gradient(ellipse at 50% 50%, #164018 0%, #0e2410 50%, #081408 100%)",
  steel_blue:
    "radial-gradient(ellipse at 30% 30%, #1a3355 0%, #102035 50%, #081018 100%)",
  warm_slate:
    "radial-gradient(ellipse at 60% 40%, #302a22 0%, #1c1814 50%, #12100e 100%)",
  electric_indigo:
    "radial-gradient(ellipse at 20% 50%, #251660 0%, #141035 50%, #0c0818 100%)",
  obsidian:
    "radial-gradient(ellipse at 50% 50%, #282828 0%, #181818 50%, #0c0c0c 100%)",
};

// Helper to resolve asset URLs (same pattern as AutoClipVideo)
const resolveCustomBgUrl = (url: string): string => {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  if (url.startsWith("/api/")) {
    const { isRendering } = getRemotionEnvironment();
    if (isRendering) {
      return `http://127.0.0.1:8000${url}`;
    }
    return url;
  }
  return staticFile(url);
};

interface AnimatedBackgroundProps {
  preset?: string;
  primaryColor: string;
  secondaryColor: string;
  customBackgroundUrl?: string | null;
  customBackgroundType?: "image" | "video";
  /** Seed for deterministic variation per video */
  seed?: number;
}

export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
  preset = "steel_blue",
  primaryColor,
  secondaryColor,
  customBackgroundUrl,
  customBackgroundType = "image",
  seed = 0,
}) => {
  const frame = useCurrentFrame();
  const hasCustomBg = !!customBackgroundUrl;

  const gradientBg = GRADIENT_PRESETS[preset] || GRADIENT_PRESETS.steel_blue;
  const customBackgroundStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  };

  // Seed-based orb movement variation
  const s = seed >>> 0;
  const orbSpeedX = 0.006 + (s % 100) * 0.00003;
  const orbSpeedY = 0.004 + (s % 77) * 0.00004;
  const orbAmpX = 15 + (s % 13) * 1.5;
  const orbAmpY = 18 + (s % 11) * 2;
  const orbX = 50 + Math.sin(frame * orbSpeedX) * orbAmpX;
  const orbY = 50 + Math.cos(frame * orbSpeedY) * orbAmpY;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {hasCustomBg ? (
        <>
          {/* Custom background: image or video */}
          {customBackgroundType === "video" ? (
            <Video
              src={resolveCustomBgUrl(customBackgroundUrl!)}
              style={customBackgroundStyle}
              muted
              loop
            />
          ) : (
            <Img
              src={resolveCustomBgUrl(customBackgroundUrl!)}
              style={customBackgroundStyle}
            />
          )}
        </>
      ) : (
        <>
          {/* Layer 1: Base gradient */}
          <AbsoluteFill style={{ background: gradientBg }} />

          {/* Layer 2: Slow-moving color orb */}
          <AbsoluteFill
            style={{
              background: `radial-gradient(circle at ${orbX}% ${orbY}%, ${primaryColor}1F 0%, transparent 50%)`,
            }}
          />
        </>
      )}

      {/* Layer 3: Floating particles (with seed for variation) */}
      <FloatingParticles
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        seed={seed}
      />

      {/* Layer 4: Vignette — darken edges (softer on custom bg) */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)",
          opacity: hasCustomBg ? 0.6 : 1,
        }}
      />

      {/* Layer 5: Subtle noise texture (CSS-based, no image needed) */}
      <AbsoluteFill
        style={{
          opacity: 0.03,
          background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "200px 200px",
        }}
      />
    </AbsoluteFill>
  );
};
