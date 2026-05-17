// remotion/src/scenes/CryptoVN101News.tsx
/**
 * News Intro scene — branded news opening for CryptoVN 101.
 *
 * Layout (9:16, 1080×1920) — optimized for TikTok safe zones:
 *   - Top ~50%: Media (image with Ken Burns zoom+pan, or video raw playback)
 *   - Bottom ~50%: Decorative overlay with brand-color tint
 *     • Layer A: Decorative background image (cryptovn101-overlay-bg.png)
 *     • Layer B: Semi-transparent brand-color tint over the image
 *     • Layer C: Content (logo, channel name, headline)
 *   - Source badge: positioned below TikTok search bar (~170px from top)
 *   - Content zone: 40%–70% of screen (above TikTok caption/avatar/buttons)
 *
 * TikTok safe zones:
 *   - Top 0–120px: search bar → avoid placing content here
 *   - Bottom 0–350px: caption, avatar, action buttons → avoid content here
 *   - Safe content area: 120px–1570px (on 1920px canvas)
 *
 * Assets required in remotion/public/:
 *   - cryptovn101-logo.png (brand logo)
 *   - cryptovn101-overlay-bg.png (decorative background for lower overlay)
 *
 * Brand color: #C6FD01 (lime neon)
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
/** Whether the decorative overlay background image exists */
const OVERLAY_BG_FILE = "cryptovn101-overlay-bg.jpeg";

interface CryptoVN101NewsProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
}

/** Resolve asset URL: local paths use staticFile(), remote URLs pass through */
function resolveAssetUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/api/")) return url;
  return staticFile(url);
}

export const CryptoVN101News: React.FC<CryptoVN101NewsProps> = ({
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
  const overlayTranslateY = interpolate(frame, [5, 25], [80, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const overlayOpacity = interpolate(frame, [5, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Source badge fade-in ──
  const badgeOpacity = interpolate(frame, [8, 18], [0, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Accent line width animation ──
  const accentWidth = interpolate(frame, [15, 35], [0, 80], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Adaptive headline font size ──
  const narrationLength = scene.narration.length;
  const headlineFontSize =
    narrationLength > 200 ? 38 : narrationLength > 120 ? 44 : 52;

  const hasMedia = scene.mediaUrl != null;

  return (
    <AbsoluteFill style={{ opacity: fadeIn * exitOpacity }}>
      {/* Layer 1: Media — constrained to top 50% only */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "50%",
          overflow: "hidden",
        }}
      >
        {hasMedia ? (
          scene.mediaType === "video" ? (
            <OffthreadVideo
              src={resolveAssetUrl(scene.mediaUrl!)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
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
                  objectPosition: "center",
                  transform: `scale(${kenBurnsScale}) translateX(${kenBurnsPanX}px)`,
                }}
              />
            </div>
          )
        ) : (
          /* Fallback gradient when no media */
          <div
            style={{
              width: "100%",
              height: "100%",
              background: `linear-gradient(160deg, ${colorPalette.background} 0%, ${colorPalette.primary}22 50%, ${colorPalette.background} 100%)`,
            }}
          />
        )}
      </div>

      {/* Layer 2: Source badge — below TikTok search bar */}
      <div
        style={{
          position: "absolute",
          top: 170,
          left: 40,
          opacity: badgeOpacity,
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 26,
            fontWeight: 600,
            color: "#FFFFFF",
            backgroundColor: "rgba(0,0,0,0.5)",
            borderRadius: 8,
            padding: "6px 16px",
            letterSpacing: 0.5,
          }}
        >
          Nguồn: Tổng hợp
        </div>
      </div>

      {/* Layer 3: Full-screen dark gradient — seamless fade from media into overlay */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, transparent 30%, rgba(5,10,0,0.6) 42%, rgba(5,10,0,0.92) 55%, rgba(3,6,0,0.98) 70%, rgba(2,4,0,1) 100%)",
          opacity: overlayOpacity,
        }}
      />

      {/* Layer 4: Decorative background — fades in from ~40% mark using mask */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "60%",
          opacity: overlayOpacity,
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 20%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 20%)",
          overflow: "hidden",
          filter: "blur(2px)",
        }}
      >
        <Img
          src={staticFile(OVERLAY_BG_FILE)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.35,
          }}
        />
      </div>

      {/* Layer 5: Brand color tint — visible green, bottom half only */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, transparent 45%, rgba(25,55,0,0.5) 58%, rgba(22,45,0,0.65) 100%)",
          opacity: overlayOpacity,
        }}
      />

      {/* Layer 6: Content — logo at ~45% mark (media/overlay boundary) */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 50,
          right: 120,
          opacity: overlayOpacity,
          transform: `translateY(${overlayTranslateY}px)`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Accent line */}
        <div
          style={{
            height: 4,
            width: accentWidth,
            backgroundColor: BRAND_COLOR,
            marginBottom: 16,
            borderRadius: 2,
          }}
        />

        {/* Logo + Channel name — sits at boundary */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 22,
            marginBottom: 30,
          }}
        >
          <Img
            src={staticFile("cryptovn101-logo.png")}
            style={{ width: 130, height: 130 }}
          />
          <span
            style={{
              fontFamily,
              fontSize: 56,
              fontWeight: 800,
              color: BRAND_COLOR,
              letterSpacing: 2.5,
              textShadow: "0 2px 10px rgba(0,0,0,0.6)",
            }}
          >
            CryptoVN 101
          </span>
        </div>

        {/* Headline text — smaller than brand name */}
        <div
          style={{
            fontFamily,
            fontSize: headlineFontSize,
            fontWeight: 800,
            color: "#FFFFFF",
            lineHeight: 1.3,
            textShadow: "0 2px 12px rgba(0,0,0,0.5)",

            textTransform: "uppercase",
          }}
        >
          {scene.narration}
        </div>
      </div>
    </AbsoluteFill>
  );
};
