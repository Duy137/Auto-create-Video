// remotion/src/components/Watermark.tsx
/**
 * Branded watermark — supports text, logo, or both modes.
 * Configurable position (5 options) and opacity.
 */

import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from "remotion";
import { fontFamily } from "../lib/fonts";

interface WatermarkProps {
  text: string;
  color: string;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  opacity?: number;
  logoUrl?: string | null;
  mode?: "text" | "logo" | "both";
}

const POSITION_STYLES: Record<string, React.CSSProperties> = {
  "top-left":     { top: 60, left: 40 },
  "top-right":    { top: 60, right: 40 },
  "bottom-left":  { bottom: 140, left: 40 },   // above progress bar
  "bottom-right": { bottom: 140, right: 40 },   // above progress bar
  "center":       { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
};

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

function resolveUrl(url?: string | null): string {
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

export const Watermark: React.FC<WatermarkProps> = ({
  text,
  color,
  position = "bottom-right",
  opacity = 0.5,
  logoUrl,
  mode = "text",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [Math.max(0, durationInFrames - 20), durationInFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const breathe = 1 + Math.sin(frame * 0.08) * 0.02;
  const animOpacity = fadeIn * fadeOut * opacity;

  const posStyle = POSITION_STYLES[position] ?? POSITION_STYLES["bottom-right"];

  const showLogo = (mode === "logo" || mode === "both") && logoUrl;
  const showText = mode === "text" || mode === "both";

  return (
    <div
      style={{
        position: "absolute",
        ...posStyle,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transform: `scale(${breathe})${posStyle.transform ? ` ${posStyle.transform}` : ""}`,
        opacity: animOpacity,
        pointerEvents: "none",
      }}
    >
      {showLogo && (
        <Img
          src={resolveUrl(logoUrl)}
          style={{
            width: 150,
            height: 150,
            objectFit: "contain",
            marginBottom: mode === "both" ? 8 : 0,
          }}
        />
      )}
      {showText && (
        <span
          style={{
            fontFamily,
            fontSize: 42,
            color: withHexAlpha(color, 0.75),
            letterSpacing: 4,
            textTransform: "uppercase",
            textShadow: "0 2px 12px rgba(0,0,0,0.7), 0 0 4px rgba(0,0,0,0.4)",
          }}
        >
          {text}
        </span>
      )}
    </div>
  );
};
