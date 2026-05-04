// remotion/src/AutoClipVideo.tsx
/**
 * Main composition — assembles scenes based on VideoProps.
 *
 * Maps through scenes array and renders the correct component based on sceneType.
 * Uses TransitionSeries for smooth per-scene transitions (from Director agent).
 * Layers: Background → Visual Content → Audio
 *
 * Dynamic duration calculated from the last scene's endMs.
 */

import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  useVideoConfig,
  staticFile,
  useCurrentFrame,
  interpolate,
  Easing,
} from "remotion";
import {
  TransitionSeries,
  linearTiming,
  springTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import type { VideoProps } from "./schemas/videoProps";

// Scene templates
import { TitleCard } from "./scenes/TitleCard";
import { StockBackground } from "./scenes/StockBackground";
import { InfoCard } from "./scenes/InfoCard";
import { StatsHighlight } from "./scenes/StatsHighlight";
import { DiagramScene } from "./scenes/DiagramScene";
import { EmojiGrid } from "./scenes/EmojiGrid";
import { Comparison } from "./scenes/Comparison";
import { MediaShowcase } from "./scenes/MediaShowcase";
import { Timeline } from "./scenes/Timeline";
import { NewsIntro } from "./scenes/NewsIntro";
import { StoryBeats } from "./scenes/StoryBeats";  // [CryptoVN Custom]

// Shared components & utilities
import { AnimatedCaption } from "./components/AnimatedCaption";
import { EmojiPopup } from "./components/EmojiPopup";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { ProgressBar } from "./components/ProgressBar";
import { Watermark } from "./components/Watermark";
import { camelizeKeys } from "./lib/utils";
import { getTransition } from "./lib/transitions";

type AutoClipVideoProps = VideoProps;

/** Resolve asset URL: local paths use staticFile(), remote URLs pass through */
function resolveAssetUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return staticFile(url);
}

const SceneRenderer: React.FC<{
  scene: VideoProps["scenes"][0];
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps: VideoProps["wordTimestamps"];
}> = ({ scene, colorPalette, wordTimestamps }) => {
  switch (scene.sceneType) {
    case "title_card":
      return <TitleCard scene={scene} colorPalette={colorPalette} />;
    case "stock_background":
      return <StockBackground scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} />;
    case "info_card":
      return <InfoCard scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} />;
    case "stats_highlight":
      return <StatsHighlight scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} />;
    case "diagram":
      return <DiagramScene scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} />;
    case "emoji_grid":
      return <EmojiGrid scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} />;
    case "comparison":
      return <Comparison scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} />;
    case "media_showcase":
      return <MediaShowcase scene={scene} colorPalette={colorPalette} />;
    case "timeline":
      return <Timeline scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} />;
    case "news_intro":
      return <NewsIntro scene={scene} colorPalette={colorPalette} />;
    // [CryptoVN Custom] Story Beats fallback
    case "story_beats":
      return <StoryBeats scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} />;
    default:
      return <StockBackground scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} />;
  }
};

const getTransitionDurationFrames = (
  sceneType: VideoProps["scenes"][0]["sceneType"],
  transitionName: string,
): number => {
  if (transitionName === "none") return 0;

  switch (sceneType) {
    case "title_card":
      return 20;
    case "stock_background":
      return 12;
    default:
      return 15;
  }
};

export const getSceneDurationFrames = (
  scene: Pick<VideoProps["scenes"][0], "startMs" | "endMs">,
  fps: number,
): number => {
  // Use absolute scene boundaries to avoid cumulative rounding drift.
  // This keeps transitions from starting before narration ends while
  // limiting timing offset to at most ~1 frame.
  const startFrame = Math.ceil((scene.startMs / 1000) * fps);
  const endFrame = Math.ceil((scene.endMs / 1000) * fps);
  return Math.max(1, endFrame - startFrame);
};

export const calculateTimelineDurationInFrames = (
  scenes: VideoProps["scenes"],
  fps: number,
): number => {
  return scenes.reduce((total, scene) => total + getSceneDurationFrames(scene, fps), 0);
};

const getTransitionTiming = (
  sceneType: VideoProps["scenes"][0]["sceneType"],
  transitionName: string,
  durationInFrames: number,
) => {
  switch (transitionName) {
    case "slide":
    case "zoom":
      return springTiming({
        durationInFrames,
        config: {
          damping: 18,
          stiffness: 140,
          mass: 0.9,
        },
      });
    case "wipe":
      return linearTiming({
        durationInFrames,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      });
    case "fade":
    default:
      return linearTiming({
        durationInFrames,
        easing: Easing.inOut(Easing.ease),
      });
  }
};

const SceneWithEntryMotion: React.FC<{
  scene: VideoProps["scenes"][0];
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps: VideoProps["wordTimestamps"];
  sequenceDurationFrames: number;
  outgoingTransitionName: string;
  outgoingTransitionDuration: number;
}> = ({
  scene,
  colorPalette,
  wordTimestamps,
  sequenceDurationFrames,
  outgoingTransitionName,
  outgoingTransitionDuration,
}) => {
  const frame = useCurrentFrame();
  const incomingTransitionName = scene.transition ?? "fade";
  const isIncomingZoom = incomingTransitionName === "zoom";

  const entryScale = isIncomingZoom
    ? interpolate(frame, [0, 16], [0.94, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;
  const entryOpacity = isIncomingZoom
    ? interpolate(frame, [0, 12], [0.7, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  const hasOutgoingTransition =
    outgoingTransitionName !== "none" && outgoingTransitionDuration > 0;
  const exitStartFrame = Math.max(
    0,
    sequenceDurationFrames - outgoingTransitionDuration
  );
  const exitStrength = outgoingTransitionName === "zoom" ? 1 : 0.7;

  const exitScale = hasOutgoingTransition
    ? interpolate(
        frame,
        [exitStartFrame, sequenceDurationFrames],
        [1, 1 + 0.03 * exitStrength],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }
      )
    : 1;

  const exitOpacity = hasOutgoingTransition
    ? interpolate(frame, [exitStartFrame, sequenceDurationFrames], [1, 0.92], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  const exitTranslateY = hasOutgoingTransition
    ? interpolate(
        frame,
        [exitStartFrame, sequenceDurationFrames],
        [0, -10 * exitStrength],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }
      )
    : 0;

  return (
    <AbsoluteFill
      style={{
        transform: `translateY(${exitTranslateY}px) scale(${entryScale * exitScale})`,
        opacity: entryOpacity * exitOpacity,
      }}
    >
      <SceneRenderer scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} />
      {/* Emoji pop-up overlay (per-scene, not on title_card) */}
      {scene.emoji && scene.sceneType !== "title_card" && scene.sceneType !== "news_intro" && scene.sceneType !== "story_beats" && (
        <EmojiPopup
          emoji={scene.emoji}
          narration={scene.narration}
          sceneStartMs={scene.startMs}
          sceneEndMs={scene.endMs}
        />
      )}
    </AbsoluteFill>
  );
};

export const AutoClipVideo: React.FC<AutoClipVideoProps> = (rawProps) => {
  const { fps } = useVideoConfig();

  // Convert snake_case props from Python JSON to camelCase for TypeScript
  const props = camelizeKeys(rawProps) as VideoProps;

  const {
    scenes,
    colorPalette,
    audioUrl,
    settings,
  } = props;

  return (
    <AbsoluteFill>
      {/* Layer 0: Animated background */}
      <AnimatedBackground
        preset={settings.backgroundPreset ?? "steel_blue"}
        primaryColor={colorPalette.primary}
        secondaryColor={colorPalette.secondary}
      />
      {/* Layer 1: Scene sequences with transitions */}
      <TransitionSeries>
        {scenes.map((scene, index) => {
          const durationFrames = getSceneDurationFrames(scene, fps);

          const nextScene = scenes[index + 1] ?? null;
          const nextTransitionName = nextScene?.transition ?? "fade";
          const hasTransition =
            index < scenes.length - 1 && nextTransitionName !== "none";
          const transitionDurationFrames = hasTransition
            ? getTransitionDurationFrames(nextScene!.sceneType, nextTransitionName)
            : 0;

          // Compensate for TransitionSeries overlap: each transition
          // "eats" transitionDurationFrames from the total timeline,
          // causing visuals to run ahead of audio/captions.
          // Adding the transition duration to every non-last scene
          // keeps the visual timeline aligned with the absolute
          // audio + caption timeline.
          const compensatedDuration =
            index < scenes.length - 1
              ? durationFrames + transitionDurationFrames
              : durationFrames;

          return (
            <React.Fragment key={scene.sceneIndex}>
              <TransitionSeries.Sequence durationInFrames={compensatedDuration}>
                <SceneWithEntryMotion
                  scene={scene}
                  colorPalette={colorPalette}
                  wordTimestamps={props.wordTimestamps}
                  sequenceDurationFrames={compensatedDuration}
                  outgoingTransitionName={hasTransition ? nextTransitionName : "none"}
                  outgoingTransitionDuration={transitionDurationFrames}
                />
              </TransitionSeries.Sequence>
              {/* Add transition between scenes (not after the last one) */}
              {hasTransition && (
                <TransitionSeries.Transition
                  presentation={getTransition(nextTransitionName)}
                  timing={getTransitionTiming(
                    nextScene!.sceneType,
                    nextTransitionName,
                    transitionDurationFrames
                  )}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* CTA Scene — appended to end of TransitionSeries */}
        {settings.cta?.enabled && settings.cta?.mediaUrl && (() => {
          const ctaDuration = Math.round(((settings.cta?.durationMs ?? 3000) / 1000) * fps);
          return (
            <>
              <TransitionSeries.Transition
                presentation={fade()}
                timing={linearTiming({ durationInFrames: 15 })}
              />
              <TransitionSeries.Sequence durationInFrames={ctaDuration}>
                <AbsoluteFill style={{
                  background: "#000",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}>
                  {settings.cta.mediaType === "video" ? (
                    <OffthreadVideo
                      src={resolveAssetUrl(settings.cta.mediaUrl!)}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      muted
                    />
                  ) : (
                    <Img
                      src={resolveAssetUrl(settings.cta.mediaUrl!)}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  )}
                </AbsoluteFill>
              </TransitionSeries.Sequence>
            </>
          );
        })()}
      </TransitionSeries>

      {/* Layer 2: Animated Captions (global overlay) */}
      {settings.subtitle.enabled && (
        <AnimatedCaption
          wordTimestamps={props.wordTimestamps}
          subtitleSettings={settings.subtitle}
          scenes={scenes}
        />
      )}

      {/* Layer 3: Audio (narration) */}
      {audioUrl && (
        <Audio src={resolveAssetUrl(audioUrl)} volume={() => 1} />
      )}

      {/* Layer 2.5: SFX (scene transition sound effects) — OUTSIDE TransitionSeries */}
      {settings.sfx?.enabled && scenes.map((scene, i) => {
        if (i === 0) return null; // No SFX on first scene
        const absFrame = Math.ceil((scene.startMs / 1000) * fps);
        return (
          <Sequence key={`sfx-${i}`} from={Math.max(0, absFrame - 5)} durationInFrames={30}>
            <Audio
              src={staticFile("sfx/whoosh.mp3")}
              volume={settings.sfx?.volume ?? 0.25}
            />
          </Sequence>
        );
      })}

      {/* Layer 2.5: BGM (background music) */}
      {settings.bgmUrl && (
        <Audio
          src={resolveAssetUrl(settings.bgmUrl)}
          volume={() => settings.bgmVolume}
          loop
        />
      )}

      {/* Layer 3: Watermark (if configured — text or logo) */}
      {(settings.watermarkText || settings.watermarkLogoUrl) && (
        <Watermark
          text={settings.watermarkText ?? ""}
          color={colorPalette.primary}
          position={settings.watermarkPosition ?? "bottom-right"}
          opacity={settings.watermarkOpacity ?? 0.5}
          logoUrl={settings.watermarkLogoUrl}
          mode={settings.watermarkMode ?? "text"}
        />
      )}

      {/* Layer 4: Progress bar */}
      <ProgressBar
        color={colorPalette.primary}
        secondaryColor={colorPalette.secondary}
      />
    </AbsoluteFill>
  );
};
