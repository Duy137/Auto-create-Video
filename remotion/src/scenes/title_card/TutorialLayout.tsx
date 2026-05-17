// remotion/src/scenes/title_card/TutorialLayout.tsx
/**
 * Tutorial Title Card — step-based instructional opener
 *
 * Design:
 *   - Clean light/dark adaptive background
 *   - Giant decorative step number as watermark
 *   - Left-aligned layout with step indicator pill
 *   - Bold title with animated entrance
 *   - Numbered progress dots at bottom
 *   - Geometric accent shapes for visual interest
 *   - Gradient underline bar
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

function resolveAssetUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  return staticFile(url);
}

interface LayoutProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
}

export const TutorialLayout: React.FC<LayoutProps> = ({
  scene,
  colorPalette,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const exitOpacity = useExitAnimation();

  const primary = colorPalette.primary;
  const secondary = colorPalette.secondary;
  const bg = colorPalette.background;
  const text = colorPalette.text;

  // ── Timing ──
  const fadeIn = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Giant number watermark
  const numSpring = spring({
    frame: Math.max(0, frame - 3),
    fps,
    config: { damping: 18, stiffness: 80, mass: 1.2 },
  });

  // Step pill entrance
  const pillSpring = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 14, stiffness: 160, mass: 0.5 },
  });
  const pillOpacity = interpolate(frame, [8, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Title entrance
  const titleSpring = spring({
    frame: Math.max(0, frame - 14),
    fps,
    config: { damping: 12, stiffness: 130, mass: 0.7 },
  });
  const titleOpacity = interpolate(frame, [14, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Underline
  const underlineWidth = interpolate(frame, [24, 42], [0, Math.min(width * 0.5, 350)], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Decorative corner shape
  const cornerScale = spring({
    frame: Math.max(0, frame - 2),
    fps,
    config: { damping: 20, stiffness: 60 },
  });

  // ── Content ──
  const stepNumber = scene.topBadge?.replace(/\D/g, "") || "";
  const badgeLabel = scene.topBadge || null;  // No hardcoded fallback
  const titleFontSize = autoFontSize(
    scene.narration,
    Math.max(48, Math.round(width * 0.065)),
    Math.max(34, Math.round(width * 0.045)),
    12,
  );
  const padding = Math.round(width * 0.08);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bg,
        opacity: fadeIn * exitOpacity,
        overflow: "hidden",
      }}
    >
      {/* ── Optional media background ── */}
      {scene.mediaUrl ? (
        <>
          <AbsoluteFill style={{ overflow: "hidden" }}>
            {scene.mediaType === "video" ? (
              <OffthreadVideo
                src={resolveAssetUrl(scene.mediaUrl)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                muted
              />
            ) : (
              <Img
                src={resolveAssetUrl(scene.mediaUrl)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
          </AbsoluteFill>
          {/* Heavy dark overlay for text contrast */}
          <AbsoluteFill
            style={{
              background: `linear-gradient(150deg, ${bg}DD 0%, ${bg}CC 50%, ${bg}EE 100%)`,
            }}
          />
        </>
      ) : null}

      {/* ── Background gradient ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(150deg, ${bg} 0%, ${primary}0D 50%, ${bg} 100%)`,
        }}
      />

      {/* ── Top-right decorative corner ── */}
      <div
        style={{
          position: "absolute",
          top: -Math.round(height * 0.1),
          right: -Math.round(width * 0.08),
          width: Math.round(width * 0.6),
          height: Math.round(width * 0.6),
          borderRadius: "50%",
          background: `radial-gradient(circle, ${primary}12 0%, transparent 70%)`,
          transform: `scale(${cornerScale})`,
        }}
      />

      {/* ── Bottom-left decorative accent ── */}
      <div
        style={{
          position: "absolute",
          bottom: -Math.round(height * 0.15),
          left: -Math.round(width * 0.1),
          width: Math.round(width * 0.5),
          height: Math.round(width * 0.5),
          borderRadius: "50%",
          background: `radial-gradient(circle, ${secondary}10 0%, transparent 70%)`,
          transform: `scale(${cornerScale})`,
        }}
      />

      {/* ── Giant watermark number ── */}
      <div
        style={{
          position: "absolute",
          right: Math.round(width * 0.02),
          top: "50%",
          transform: `translateY(-50%) scale(${interpolate(numSpring, [0, 1], [0.6, 1])})`,
          opacity: interpolate(numSpring, [0, 1], [0, 0.06]),
        }}
      >
        <span
          style={{
            fontFamily,
            fontSize: Math.round(width * 0.85),
            fontWeight: 900,
            color: primary,
            lineHeight: 0.85,
            pointerEvents: "none",
          }}
        >
          {stepNumber}
        </span>
      </div>

      {/* ── Dot grid texture ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `radial-gradient(${text}08 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
        }}
      />

      {/* ── Main content ── */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: padding,
          paddingRight: Math.round(width * 0.22),
          paddingBottom: Math.round(height * 0.18),
        }}
      >
        {/* Step pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            opacity: pillOpacity,
            transform: `translateX(${interpolate(pillSpring, [0, 1], [-40, 0])}px)`,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: Math.max(52, Math.round(width * 0.07)),
              height: Math.max(52, Math.round(width * 0.07)),
              borderRadius: 14,
              background: `linear-gradient(135deg, ${primary}, ${secondary})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontFamily,
              fontSize: Math.max(26, Math.round(width * 0.038)),
              fontWeight: 900,
              boxShadow: `0 6px 24px ${primary}50`,
            }}
          >
            {stepNumber}
          </div>
          {badgeLabel && (
            <div
              style={{
                fontFamily,
                fontSize: Math.max(18, Math.round(width * 0.028)),
                fontWeight: 800,
                color: primary,
                letterSpacing: 3,
                textTransform: "uppercase",
              }}
            >
              {badgeLabel}
            </div>
          )}
        </div>

        {/* Title */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${interpolate(titleSpring, [0, 1], [50, 0])}px)`,
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: titleFontSize,
              fontWeight: 900,
              color: text,
              lineHeight: 1.35,
              textShadow: `0 4px 20px rgba(0,0,0,0.5)`,
              textTransform: "uppercase",
              maxWidth: Math.round(width * 0.85),
            }}
          >
            {scene.narration}
          </div>

          {/* Gradient underline */}
          <div
            style={{
              marginTop: 22,
              height: 5,
              width: underlineWidth,
              borderRadius: 3,
              background: `linear-gradient(90deg, ${primary}, ${secondary})`,
              boxShadow: `0 0 14px ${primary}50`,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
