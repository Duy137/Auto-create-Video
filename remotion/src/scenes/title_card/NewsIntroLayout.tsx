// remotion/src/scenes/title_card/NewsIntroLayout.tsx
/**
 * News Intro Title Card — broadcast-grade opening
 *
 * Design:
 *   - Full-bleed media background (image with Ken Burns, or video)
 *   - Heavy gradient overlay from bottom → transparent
 *   - Animated accent stripe + brand row (logo + name)
 *   - Bold uppercase headline sliding up
 *   - Pulsing "LIVE" / badge indicator
 *   - Diagonal line pattern for broadcast texture
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
  getRemotionEnvironment,
} from "remotion";
import type { SceneData, VideoProps } from "../../schemas/videoProps";
import { fontFamily } from "../../lib/fonts";
import { useExitAnimation } from "../../lib/useExitAnimation";

interface LayoutProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  brandLogoUrl?: string | null;
  brandName?: string | null;
}

function resolveAssetUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  if (url.startsWith("/api/")) {
    const { isRendering } = getRemotionEnvironment();
    if (isRendering) {
      // TODO: Refactor to use process.env.API_URL in production
      // In Puppeteer context, use absolute URL to hit FastAPI
      return `http://127.0.0.1:8000${url}`;
    }
    return url;
  }
  return staticFile(url);
}

export const NewsIntroLayout: React.FC<LayoutProps> = ({
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
  const text = colorPalette.text;

  const sceneDurationFrames = Math.max(
    1,
    Math.round(((scene.endMs - scene.startMs) / 1000) * fps),
  );

  // ── Animations ──
  const fadeIn = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Ken Burns for images
  const isImage = scene.mediaType === "image";
  const progress = interpolate(frame, [0, sceneDurationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eased = Easing.inOut(Easing.ease)(progress);
  const kenBurnsScale = isImage
    ? interpolate(eased, [0, 1], [1.0, 1.15], { extrapolateRight: "clamp" })
    : 1;
  const kenBurnsPanX = isImage
    ? interpolate(eased, [0, 1], [0, -50], { extrapolateRight: "clamp" })
    : 0;

  // Bottom content panel slides up
  const panelSpring = spring({
    frame: Math.max(0, frame - 4),
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.8 },
  });
  const panelY = interpolate(panelSpring, [0, 1], [120, 0]);
  const panelOpacity = interpolate(frame, [4, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Accent bar width
  const accentWidth = interpolate(frame, [8, 30], [0, Math.min(100, Math.round(width * 0.14))], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Brand row entrance
  const brandSpring = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 14, stiffness: 140 },
  });

  // Headline entrance
  const headlineSpring = spring({
    frame: Math.max(0, frame - 16),
    fps,
    config: { damping: 12, stiffness: 130, mass: 0.7 },
  });
  const headlineOpacity = interpolate(frame, [16, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Badge pulse
  const badgePulse = interpolate(
    Math.sin(frame * 0.1),
    [-1, 1],
    [0.7, 1.0],
  );

  const hasMedia = scene.mediaUrl != null;
  const narrationLength = scene.narration.length;
  const headlineFontSize =
    narrationLength > 200 ? Math.round(width * 0.045)
    : narrationLength > 120 ? Math.round(width * 0.055)
    : Math.round(width * 0.065);

  return (
    <AbsoluteFill style={{ opacity: fadeIn * exitOpacity, background: bg }}>
      {/* ── Full-bleed background media ── */}
      <AbsoluteFill style={{ overflow: "hidden" }}>
        {hasMedia ? (
          scene.mediaType === "video" ? (
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
                  transform: `scale(${kenBurnsScale}) translateX(${kenBurnsPanX}px)`,
                }}
              />
            </div>
          )
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: `linear-gradient(160deg, ${bg} 0%, ${primary}18 40%, ${bg} 100%)`,
            }}
          />
        )}
      </AbsoluteFill>

      {/* ── Colored gradient overlay ── */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(to bottom, 
            transparent 0%, 
            transparent 25%, 
            ${bg}40 40%, 
            ${bg}99 55%, 
            ${bg}e6 70%, 
            ${bg} 85%, 
            ${bg} 100%)`,
        }}
      />

      {/* ── Diagonal line texture ── */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "55%",
          opacity: 0.08,
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 30%)",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 30%)",
          backgroundImage: `repeating-linear-gradient(45deg, ${primary} 0, ${primary} 1px, transparent 0, transparent 50%)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* ── Colored tint at bottom ── */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(to bottom, transparent 50%, ${primary}1A 75%, ${primary}30 100%)`,
          opacity: panelOpacity,
        }}
      />

      {/* ── Badge (top-left) ── */}
      {scene.topBadge && (
        <div
          style={{
            position: "absolute",
            top: Math.round(height * 0.08),
            left: Math.round(width * 0.06),
            zIndex: 10,
            opacity: interpolate(frame, [6, 16], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: Math.max(18, Math.round(width * 0.032)),
              fontWeight: 700,
              color: "#fff",
              backgroundColor: `${primary}CC`,
              borderRadius: 6,
              padding: "6px 16px",
              letterSpacing: 1,
              opacity: badgePulse,
            }}
          >
            {scene.topBadge}
          </div>
        </div>
      )}

      {/* ── Bottom content panel ── */}
      <div
        style={{
          position: "absolute",
          bottom: Math.round(height * 0.18),
          left: Math.round(width * 0.06),
          right: Math.round(width * 0.20),
          opacity: panelOpacity,
          transform: `translateY(${panelY}px)`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Accent bar */}
        <div
          style={{
            height: 4,
            width: accentWidth,
            borderRadius: 2,
            background: `linear-gradient(90deg, ${primary}, ${secondary})`,
            marginBottom: 18,
            boxShadow: `0 0 12px ${primary}80`,
          }}
        />

        {/* Brand row — only shown if brandName/logo/icon exists */}
        {(brandLogoUrl || scene.topIcon || brandName) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: Math.round(width * 0.03),
              marginBottom: Math.round(height * 0.025),
              opacity: interpolate(brandSpring, [0, 1], [0, 1]),
              transform: `translateX(${interpolate(brandSpring, [0, 1], [-30, 0])}px)`,
            }}
          >
            {brandLogoUrl && (
              <Img
                src={resolveAssetUrl(brandLogoUrl)}
                style={{
                  width: Math.max(80, Math.round(width * 0.14)),
                  height: Math.max(80, Math.round(width * 0.14)),
                  objectFit: "contain",
                  filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))",
                }}
              />
            )}
            {!brandLogoUrl && scene.topIcon && (
              <span style={{ fontSize: Math.max(60, Math.round(width * 0.1)) }}>
                {scene.topIcon}
              </span>
            )}
            {brandName && (
              <span
                style={{
                  fontFamily,
                  fontSize: Math.max(36, Math.round(width * 0.065)),
                  fontWeight: 800,
                  color: primary,
                  letterSpacing: 2,
                  textShadow: `0 2px 12px rgba(0,0,0,0.5)`,
                }}
              >
                {brandName}
              </span>
            )}
          </div>
        )}

        {/* Headline */}
        <div
          style={{
            opacity: headlineOpacity,
            transform: `translateY(${interpolate(headlineSpring, [0, 1], [40, 0])}px)`,
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: headlineFontSize,
              fontWeight: 900,
              color: text,
              lineHeight: 1.35,
              textShadow: `0 3px 16px ${bg}99`,
              textTransform: "uppercase",
            }}
          >
            {scene.narration}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
