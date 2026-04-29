// remotion/src/scenes/NewsIntro.tsx
/**
 * News Intro scene — branded news opening for CryptoVN 101.
 *
 * Layout (9:16, 1080×1920):
 *   - Top 55%: Media (image with Ken Burns zoom+pan, or video raw playback)
 *   - Bottom 45%: Dark branded overlay with accent line, logo, channel name, headline
 *   - Top-left badge: "Nguồn: Tổng hợp"
 *
 * Brand color: #C6FD01 (lime neon)
 * Logo: cryptovn101-logo.png (user-provided asset in remotion/public/)
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
  Easing,
} from "remotion";
import type { SceneData, VideoProps } from "../schemas/videoProps";
import { fontFamily } from "../lib/fonts";
import { useExitAnimation } from "../lib/useExitAnimation";

// ── Constants ──

const BRAND_COLOR = "#C6FD01";

interface NewsIntroProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
}

/** Resolve asset URL: local paths use staticFile(), remote URLs pass through */
function resolveAssetUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return staticFile(url);
}

export const NewsIntro: React.FC<NewsIntroProps> = ({
  scene,
  colorPalette,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOpacity = useExitAnimation();

  const sceneDurationFrames = Math.max(
    1,
    Math.round(((scene.endMs - scene.startMs) / 1000) * fps),
  );

  // ── Global fade-in ──
  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  // ── Ken Burns effect for images (zoom-in + pan) ──
  const isImage = scene.mediaType === "image";
  const progress = interpolate(frame, [0, sceneDurationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eased = Easing.inOut(Easing.ease)(progress);
  const kenBurnsScale = isImage
    ? interpolate(eased, [0, 1], [1.0, 1.12], { extrapolateRight: "clamp" })
    : 1;
  const kenBurnsPanX = isImage
    ? interpolate(eased, [0, 1], [0, -40], { extrapolateRight: "clamp" })
    : 0;

  // ── Brand overlay slide-up ──
  const overlayTranslateY = interpolate(frame, [5, 25], [60, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const overlayOpacity = interpolate(frame, [5, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Source badge fade-in ──
  const badgeOpacity = interpolate(frame, [8, 18], [0, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Accent line width animation ──
  const accentWidth = interpolate(frame, [15, 35], [0, 60], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Adaptive headline font size ──
  const narrationLength = scene.narration.length;
  const headlineFontSize =
    narrationLength > 200 ? 36 : narrationLength > 120 ? 40 : 46;

  const hasMedia = scene.mediaUrl != null;

  return (
    <AbsoluteFill style={{ opacity: fadeIn * exitOpacity }}>
      {/* Layer 1: Media background (full bleed) */}
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
            <div
              style={{
                width: "100%",
                height: "100%",
                overflow: "hidden",
              }}
            >
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
          /* Fallback gradient when no media */
          <AbsoluteFill
            style={{
              background: `linear-gradient(160deg, ${colorPalette.background} 0%, ${colorPalette.primary}22 50%, ${colorPalette.background} 100%)`,
            }}
          />
        )}
      </AbsoluteFill>

      {/* Layer 2: Source badge (top-left) */}
      <div
        style={{
          position: "absolute",
          top: 50,
          left: 40,
          opacity: badgeOpacity,
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 18,
            fontWeight: 500,
            color: "#FFFFFF",
            backgroundColor: "rgba(0,0,0,0.4)",
            borderRadius: 6,
            padding: "4px 12px",
          }}
        >
          Nguồn: Tổng hợp
        </div>
      </div>

      {/* Layer 3: Brand overlay (bottom 45%) */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "45%",
          background:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.85) 35%, rgba(0,0,0,0.95) 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "0 60px 80px 60px",
          opacity: overlayOpacity,
          transform: `translateY(${overlayTranslateY}px)`,
        }}
      >
        {/* Accent line */}
        <div
          style={{
            height: 2,
            width: accentWidth,
            backgroundColor: BRAND_COLOR,
            marginBottom: 20,
          }}
        />

        {/* Logo + Channel name row */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Img
            src={staticFile("cryptovn101-logo.png")}
            style={{ width: 50, height: 50 }}
          />
          <span
            style={{
              fontFamily,
              fontSize: 22,
              fontWeight: 700,
              color: BRAND_COLOR,
              letterSpacing: 1,
            }}
          >
            CryptoVN 101
          </span>
        </div>

        {/* Headline text (from narration) */}
        <div
          style={{
            fontFamily,
            fontSize: headlineFontSize,
            fontWeight: 800,
            color: "#FFFFFF",
            lineHeight: 1.35,
            textShadow: "0 2px 8px rgba(0,0,0,0.6)",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {scene.narration}
        </div>
      </div>
    </AbsoluteFill>
  );
};
