// remotion/src/scenes/title_card/EducationalLayout.tsx
/**
 * Educational Title Card — "DID YOU KNOW?" style
 *
 * Premium design with:
 *   - Large animated accent stripe on the left
 *   - Pulsing radial glow behind the text
 *   - Bold, large question text with keyword gradient highlight
 *   - Animated underline bar
 *   - Subtle floating particle dots for depth
 *   - Optional emoji/icon rendered large alongside the badge
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
import { autoFontSize } from "../../lib/textUtils";
import { useExitAnimation } from "../../lib/useExitAnimation";

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

interface LayoutProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
}

export const EducationalLayout: React.FC<LayoutProps> = ({
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
  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Left accent bar slides in
  const barWidth = interpolate(frame, [0, 18], [0, Math.round(width * 0.028)], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Glow pulse behind title
  const glowPulse = interpolate(
    Math.sin(frame * 0.06),
    [-1, 1],
    [0.35, 0.65],
  );

  // Badge slides up
  const badgeSpring = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 14, stiffness: 160, mass: 0.6 },
  });
  const badgeOpacity = interpolate(frame, [8, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Title text entrance
  const titleSpring = spring({
    frame: Math.max(0, frame - 14),
    fps,
    config: { damping: 12, stiffness: 140, mass: 0.8 },
  });
  const titleOpacity = interpolate(frame, [14, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Underline bar grows
  const underlineWidth = interpolate(frame, [22, 40], [0, Math.min(width * 0.55, 380)], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // ── Content ──
  const emoji = scene.topIcon || scene.emoji || "💡";
  const badgeText = scene.topBadge || null;  // No hardcoded fallback
  const titleFontSize = autoFontSize(
    scene.narration,
    Math.max(46, Math.round(width * 0.065)),
    Math.max(34, Math.round(width * 0.045)),
    12,
  );

  // ── Floating particles (subtle depth) ──
  const particles = React.useMemo(() => {
    const count = 18;
    return Array.from({ length: count }, (_, i) => ({
      x: (i * 37 + 13) % 100,
      y: (i * 53 + 7) % 100,
      size: 2 + (i % 3),
      speed: 0.3 + (i % 5) * 0.15,
      phase: i * 0.8,
    }));
  }, []);

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
          {/* Heavy color overlay for text contrast */}
          <AbsoluteFill
            style={{
              background: `linear-gradient(180deg, ${bg}DD 0%, ${bg}CC 40%, ${bg}EE 100%)`,
            }}
          />
        </>
      ) : null}

      {/* ── Background: moving radial gradients ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse 80% 60% at 20% 80%, ${primary}30 0%, transparent 60%),
            radial-gradient(ellipse 70% 50% at 85% 20%, ${secondary}20 0%, transparent 55%)
          `,
        }}
      />

      {/* ── Subtle dot grid ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `radial-gradient(${text}0A 1.5px, transparent 1.5px)`,
          backgroundSize: "32px 32px",
          opacity: 0.6,
        }}
      />

      {/* ── Floating particles ── */}
      {particles.map((p, i) => {
        const y = (p.y + frame * p.speed * 0.15) % 110 - 5;
        const x = p.x + Math.sin(frame * 0.03 + p.phase) * 3;
        const opacity = interpolate(
          Math.sin(frame * 0.04 + p.phase),
          [-1, 1],
          [0.1, 0.4],
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
              backgroundColor: i % 2 === 0 ? primary : secondary,
              opacity,
            }}
          />
        );
      })}

      {/* ── Left accent bar ── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: barWidth,
          height: "100%",
          background: `linear-gradient(180deg, ${primary}, ${secondary})`,
        }}
      />

      {/* ── Pulsing glow behind content area ── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "52%",
          transform: "translate(-50%, -50%)",
          width: Math.round(width * 0.8),
          height: Math.round(height * 0.35),
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${primary}${Math.round(glowPulse * 30).toString(16).padStart(2, "0")} 0%, transparent 70%)`,
          filter: "blur(50px)",
        }}
      />

      {/* ── Main content ── */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingLeft: Math.round(width * 0.1),
          paddingRight: Math.round(width * 0.22),
          paddingTop: Math.round(height * 0.1),
          paddingBottom: Math.round(height * 0.18),
        }}
      >
        {/* Badge row (emoji + "DID YOU KNOW?") */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            opacity: badgeOpacity,
            transform: `translateY(${interpolate(badgeSpring, [0, 1], [30, 0])}px)`,
            marginBottom: 24,
          }}
        >
          <span
            style={{
              fontSize: Math.max(56, Math.round(width * 0.08)),
              filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.25))",
            }}
          >
            {emoji}
          </span>
          {badgeText && (
            <div
              style={{
                padding: "8px 22px",
                borderRadius: 8,
                background: `linear-gradient(135deg, ${primary}33, ${secondary}22)`,
                border: `1.5px solid ${primary}55`,
                fontFamily,
                fontSize: Math.max(18, Math.round(width * 0.028)),
                fontWeight: 800,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: primary,
              }}
            >
              {badgeText}
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
              textShadow: `0 3px 20px rgba(0,0,0,0.4), 0 0 40px rgba(0,0,0,0.1)`,
              textTransform: "uppercase",
            }}
          >
            {scene.narration}
          </div>

          {/* Animated underline */}
          <div
            style={{
              marginTop: 20,
              height: 5,
              width: underlineWidth,
              borderRadius: 3,
              background: `linear-gradient(90deg, ${primary}, ${secondary})`,
              boxShadow: `0 0 16px ${primary}60`,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
