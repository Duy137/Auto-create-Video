// remotion/src/components/BackgroundVideo.tsx
/**
 * Background layer — renders stock video or image with blur + dark overlay.
 * Fills the full 1080×1920 frame responsively.
 */

import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, useCurrentFrame, interpolate, staticFile, getRemotionEnvironment } from "remotion";

/** Resolve asset URL: local paths use staticFile(), remote URLs pass through */
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

const withHexAlpha = (hexColor: string, alpha: number): string => {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  if (!/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
    return hexColor;
  }

  const alphaInt = Math.round(clampedAlpha * 255);
  const alphaHex =
    Math.floor(alphaInt / 16).toString(16) + (alphaInt % 16).toString(16);

  return `${hexColor}${alphaHex}`;
};

interface BackgroundVideoProps {
  mediaUrl: string | null;
  mediaType: "video" | "image" | null;
  fallbackGradient?: [string, string]; // [from, to] hex colors
  blurAmount?: number;
  overlayOpacity?: number;
  overlayColor?: string;
}

export const BackgroundVideo: React.FC<BackgroundVideoProps> = ({
  mediaUrl,
  mediaType,
  fallbackGradient = ["#0F172A", "#1E293B"],
  blurAmount = 8,
  overlayOpacity = 0.55,
  overlayColor = "#000000",
}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  const mediaStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    filter: `blur(${blurAmount}px)`,
    transform: "scale(1.1)", // Prevent blur edge artifacts
  };

  const overlayStyle: React.CSSProperties = {
    backgroundColor: withHexAlpha(overlayColor, overlayOpacity),
  };

  const gradientStyle: React.CSSProperties = {
    // Keep the fallback gentle so the global AnimatedBackground still shows through.
    background: `linear-gradient(135deg, ${fallbackGradient[0]}, ${fallbackGradient[1]})`,
    opacity: fadeIn * 0.35,
  };

  return (
    <>
      {/* Media layer */}
      <AbsoluteFill style={{ overflow: "hidden" }}>
        {mediaUrl && mediaType === "video" ? (
          <OffthreadVideo src={resolveAssetUrl(mediaUrl)} style={mediaStyle} muted />
        ) : mediaUrl && mediaType === "image" ? (
          <Img src={resolveAssetUrl(mediaUrl)} style={mediaStyle} />
        ) : (
          <AbsoluteFill style={gradientStyle} />
        )}
      </AbsoluteFill>

      {/* Dark overlay */}
      <AbsoluteFill style={overlayStyle} />
    </>
  );
};
