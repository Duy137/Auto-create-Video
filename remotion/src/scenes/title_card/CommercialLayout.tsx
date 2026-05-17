// remotion/src/scenes/title_card/CommercialLayout.tsx
/**
 * Commercial Title Card — premium product/brand showcase
 *
 * Design:
 *   - Full-bleed media background with elegant slow Ken Burns
 *   - Heavy cinematic vignette overlay
 *   - Glassmorphism content card with border glow
 *   - Brand logo/name with golden accent
 *   - Elegant large serif-inspired title
 *   - Animated double divider lines
 *   - Subtle floating light particles for luxury feel
 */

import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import type { SceneData, VideoProps } from "../../schemas/videoProps";
import { fontFamily } from "../../lib/fonts";
import { autoFontSize } from "../../lib/textUtils";
import { useExitAnimation } from "../../lib/useExitAnimation";

interface LayoutProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  brandLogoUrl?: string | null;
  brandName?: string | null;
}

function resolveAssetUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  return staticFile(url);
}

export const CommercialLayout: React.FC<LayoutProps> = ({
  scene,
  colorPalette,
  brandLogoUrl,
  brandName,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const exitOpacity = useExitAnimation();

  const primary = colorPalette.primary;
  const secondary = colorPalette.secondary;
  const bg = colorPalette.background;

  const sceneDurationFrames = Math.max(
    1,
    Math.round(((scene.endMs - scene.startMs) / 1000) * fps),
  );

  // ── Animations ──
  const fadeIn = interpolate(frame, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });

  // Ken Burns
  const isImage = scene.mediaType === "image";
  const progress = interpolate(frame, [0, sceneDurationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const kenBurnsScale = isImage
    ? interpolate(progress, [0, 1], [1.02, 1.15], { extrapolateRight: "clamp" })
    : 1;

  // Card entrance (slides up gently)
  const cardSpring = spring({
    frame: Math.max(0, frame - 12),
    fps,
    config: { damping: 22, stiffness: 80, mass: 1 },
  });
  const cardOpacity = interpolate(frame, [12, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Brand entrance
  const brandOpacity = interpolate(frame, [18, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Title entrance
  const titleSpring = spring({
    frame: Math.max(0, frame - 22),
    fps,
    config: { damping: 16, stiffness: 100, mass: 0.8 },
  });
  const titleOpacity = interpolate(frame, [22, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Divider lines
  const dividerWidth = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Glow pulse on card border
  const borderGlow = interpolate(
    Math.sin(frame * 0.05),
    [-1, 1],
    [0.3, 0.7],
  );

  const hasMedia = scene.mediaUrl != null;
  const titleFontSize = autoFontSize(
    scene.narration,
    Math.max(48, Math.round(width * 0.065)),
    Math.max(34, Math.round(width * 0.045)),
    12,
  );

  // ── Floating light particles ──
  const particles = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      x: (i * 41 + 17) % 100,
      y: (i * 67 + 23) % 100,
      size: 2 + (i % 3),
      speed: 0.2 + (i % 4) * 0.12,
      phase: i * 1.1,
    }));
  }, []);

  const cardPadH = Math.round(width * 0.08);
  const cardPadV = Math.round(height * 0.04);

  return (
    <AbsoluteFill style={{ opacity: fadeIn * exitOpacity, backgroundColor: bg }}>
      {/* ── Background Media ── */}
      {hasMedia && (
        <AbsoluteFill style={{ overflow: "hidden" }}>
          {scene.mediaType === "video" ? (
            <OffthreadVideo
              src={resolveAssetUrl(scene.mediaUrl!)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              muted
            />
          ) : (
            <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
              <Img
                src={resolveAssetUrl(scene.mediaUrl!)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: `scale(${kenBurnsScale})`,
                }}
              />
            </div>
          )}
        </AbsoluteFill>
      )}

      {/* ── No-media fallback gradient ── */}
      {!hasMedia && (
        <AbsoluteFill
          style={{
            background: `linear-gradient(160deg, ${bg} 0%, ${primary}15 40%, ${bg} 100%)`,
          }}
        />
      )}

      {/* ── Cinematic vignette ── */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 60% at center, 
            transparent 0%, 
            rgba(0,0,0,0.4) 50%, 
            rgba(0,0,0,0.85) 100%)`,
        }}
      />

      {/* ── Floating light particles ── */}
      {particles.map((p, i) => {
        const y = (p.y + frame * p.speed * 0.12) % 110 - 5;
        const x = p.x + Math.sin(frame * 0.025 + p.phase) * 2;
        const opacity = interpolate(
          Math.sin(frame * 0.035 + p.phase),
          [-1, 1],
          [0.05, 0.25],
        );
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              backgroundColor: "#fff",
              opacity,
            }}
          />
        );
      })}

      {/* ── Content Card ── */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: Math.round(width * 0.06),
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 28,
            padding: `${cardPadV}px ${cardPadH}px`,
            border: `1px solid rgba(255,255,255,${(borderGlow * 0.25).toFixed(2)})`,
            borderRadius: 4,
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            backgroundColor: "rgba(0,0,0,0.35)",
            boxShadow: `0 0 60px rgba(0,0,0,0.5), inset 0 0 30px rgba(255,255,255,0.02)`,
            opacity: cardOpacity,
            transform: `translateY(${interpolate(cardSpring, [0, 1], [40, 0])}px)`,
            maxWidth: Math.round(width * 0.65),
          }}
        >
          {/* Top divider */}
          <div
            style={{
              width: `${dividerWidth * 100}%`,
              maxWidth: 100,
              height: 1,
              background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)`,
            }}
          />

          {/* Brand section */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              opacity: brandOpacity,
            }}
          >
            {brandLogoUrl && (
              <Img
                src={resolveAssetUrl(brandLogoUrl)}
                style={{
                  height: Math.max(50, Math.round(height * 0.06)),
                  objectFit: "contain",
                  filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))",
                }}
              />
            )}
            {(scene.topBadge || brandName) && (
              <div
                style={{
                  fontFamily,
                  fontSize: Math.max(14, Math.round(width * 0.022)),
                  fontWeight: 500,
                  color: `rgba(255,255,255,0.7)`,
                  letterSpacing: 6,
                  textTransform: "uppercase",
                }}
              >
                {scene.topBadge || brandName}
              </div>
            )}
          </div>

          {/* Title */}
          <div
            style={{
              opacity: titleOpacity,
              transform: `translateY(${interpolate(titleSpring, [0, 1], [25, 0])}px)`,
            }}
          >
            <div
              style={{
                fontFamily,
                fontSize: titleFontSize,
                fontWeight: 800,
                color: "#ffffff",
                textAlign: "center",
                lineHeight: 1.35,
                textShadow: "0 4px 20px rgba(0,0,0,0.8)",
                textTransform: "uppercase",
              }}
            >
              {scene.narration}
            </div>
          </div>

          {/* Bottom divider */}
          <div
            style={{
              width: `${dividerWidth * 100}%`,
              maxWidth: 100,
              height: 1,
              background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)`,
            }}
          />

          {/* Accent gradient dot */}
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${primary}, ${secondary})`,
              opacity: dividerWidth,
              boxShadow: `0 0 10px ${primary}80`,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
