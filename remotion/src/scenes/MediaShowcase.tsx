// remotion/src/scenes/MediaShowcase.tsx
/**
 * Media Showcase scene — video/image hero content (not blurred background).
 * Two layouts:
 *   - cinema (default): 16:9 video in rounded frame with gradient overlay + title
 *   - fullscreen: video fills entire frame with objectFit cover
 *
 * Unlike stock_background (blurred bg), media here IS the content.
 */

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  Img,
  OffthreadVideo,
  interpolate,
  staticFile,
  Easing,
} from "remotion";
import type { SceneData, VideoProps } from "../schemas/videoProps";
import { fontFamily } from "../lib/fonts";
import { useExitAnimation } from "../lib/useExitAnimation";

interface MediaShowcaseProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
}

/** Resolve asset URL: local paths use staticFile(), remote URLs pass through */
function resolveAssetUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return staticFile(url);
}

export const MediaShowcase: React.FC<MediaShowcaseProps> = ({
  scene,
  colorPalette,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOpacity = useExitAnimation();
  const layout = scene.mediaLayout ?? "cinema";
  const sceneDurationFrames = Math.max(
    1,
    Math.round(((scene.endMs - scene.startMs) / 1000) * fps),
  );

  // Fade in
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Ken Burns — stronger for images, disabled for video
  const isImage = scene.mediaType === "image";
  const sceneProgress = interpolate(frame, [0, sceneDurationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const easedProgress = Easing.inOut(Easing.ease)(sceneProgress);
  const kenBurnsScale = isImage
    ? interpolate(easedProgress, [0, 1], [1.0, 1.25], { extrapolateRight: "clamp" })
    : 1;
  const kenBurnsPanX = isImage
    ? interpolate(easedProgress, [0, 1], [0, -25], { extrapolateRight: "clamp" })
    : 0;

  const hasMedia = scene.mediaUrl != null;

  if (layout === "fullscreen") {
    return (
      <AbsoluteFill style={{ opacity: opacity * exitOpacity }}>
        {/* Fullscreen media */}
        {hasMedia ? (
          <AbsoluteFill style={{ overflow: "hidden" }}>
            {scene.mediaType === "video" ? (
              <OffthreadVideo
                src={resolveAssetUrl(scene.mediaUrl!)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                muted
              />
            ) : (
              <Img
                src={resolveAssetUrl(scene.mediaUrl!)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: `scale(${kenBurnsScale}) translateX(${kenBurnsPanX}px)`,
                }}
              />
            )}
          </AbsoluteFill>
        ) : (
          <AbsoluteFill
            style={{
              background: `linear-gradient(160deg, ${colorPalette.background} 0%, ${colorPalette.primary}22 50%, ${colorPalette.background} 100%)`,
            }}
          />
        )}

        {/* Bottom gradient for caption readability */}
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(transparent 50%, rgba(0,0,0,0.6) 80%, rgba(0,0,0,0.8) 100%)",
          }}
        />
      </AbsoluteFill>
    );
  }

  if (layout === "fit") {
    return (
      <AbsoluteFill
        style={{
          opacity: opacity * exitOpacity,
          background: colorPalette.background,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {hasMedia ? (
          <div style={{
            width: "100%",
            position: "relative",
          }}>
            {scene.mediaType === "video" ? (
              <OffthreadVideo
                src={resolveAssetUrl(scene.mediaUrl!)}
                style={{
                  width: "100%",
                  display: "block",
                  transform: `scale(${kenBurnsScale}) translateX(${kenBurnsPanX}px)`,
                }}
                muted
              />
            ) : (
              <Img
                src={resolveAssetUrl(scene.mediaUrl!)}
                style={{
                  width: "100%",
                  display: "block",
                  transform: `scale(${kenBurnsScale}) translateX(${kenBurnsPanX}px)`,
                }}
              />
            )}
          </div>
        ) : (
          <AbsoluteFill
            style={{
              background: `linear-gradient(135deg, ${colorPalette.primary}33, ${colorPalette.secondary}33)`,
            }}
          />
        )}

        {/* Bottom gradient for readability */}
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(transparent 60%, rgba(0,0,0,0.6) 100%)",
          }}
        />
      </AbsoluteFill>
    );
  }

  // ── Cinema layout (default) ──

  // Title slide-in
  const titleOpacity = interpolate(frame, [5, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleTranslateY = interpolate(frame, [5, 25], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Video container scale-in
  const videoOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const videoScale = interpolate(frame, [10, 30], [0.92, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        opacity: opacity * exitOpacity,
        background: colorPalette.background,
      }}
    >
      {/* Top gradient accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 300,
          background: `linear-gradient(180deg, ${colorPalette.primary}15 0%, transparent 100%)`,
        }}
      />

      {/* Title text above video */}
      <div
        style={{
          position: "absolute",
          top: 180,
          left: 0,
          right: 0,
          textAlign: "center",
          padding: "0 80px",
          opacity: titleOpacity,
          transform: `translateY(${titleTranslateY}px)`,
        }}
      >
        <h2
          style={{
            fontFamily,
            fontSize: 40,
            fontWeight: 800,
            color: colorPalette.text,
            margin: 0,
            lineHeight: 1.3,
            maxHeight: 110,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {scene.visualDescription}
        </h2>
      </div>

      {/* Video container (16:9 aspect ratio within frame) */}
      <div
        style={{
          position: "absolute",
          top: 360,
          left: 40,
          right: 40,
          // 16:9 aspect: width=1000, height=562
          height: 562,
          borderRadius: 16,
          overflow: "hidden",
          opacity: videoOpacity,
          transform: `scale(${videoScale})`,
          boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${colorPalette.primary}20`,
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
                transform: `scale(${kenBurnsScale}) translateX(${kenBurnsPanX}px)`,
              }}
              muted
            />
          ) : (
            <Img
              src={resolveAssetUrl(scene.mediaUrl!)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: `scale(${kenBurnsScale}) translateX(${kenBurnsPanX}px)`,
              }}
            />
          )
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: `linear-gradient(135deg, ${colorPalette.primary}33, ${colorPalette.secondary}33)`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontFamily,
                fontSize: 48,
                opacity: 0.3,
                color: colorPalette.text,
              }}
            >
              ▶
            </span>
          </div>
        )}
      </div>

      {/* Bottom gradient */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 300,
          background: `linear-gradient(0deg, ${colorPalette.background} 0%, transparent 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
