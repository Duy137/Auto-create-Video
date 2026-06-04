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
  Easing, getRemotionEnvironment} from "remotion";
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
import { StoryBeats } from "./scenes/StoryBeats";
import { CryptoVN101News } from "./scenes/CryptoVN101News"; // [CryptoVN Custom]

// Shared components & utilities
import { AnimatedCaption } from "./components/AnimatedCaption";
import { EmojiPopup } from "./components/EmojiPopup";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { ProgressBar } from "./components/ProgressBar";
import { Watermark } from "./components/Watermark";
import { camelizeKeys } from "./lib/utils";
import { getTransition } from "./lib/transitions";
import { hashJobId, seededRandom, seededInt, seededPick } from "./lib/seed";
import { shiftHue } from "./lib/color";

type AutoClipVideoProps = VideoProps;

/** Resolve asset URL: local paths are staged into remotion/public and served by Remotion. */
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

const SceneRenderer: React.FC<{
  scene: VideoProps["scenes"][0];
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps: VideoProps["wordTimestamps"];
  brandLogoUrl?: string | null;
  brandName?: string | null;
  jobId?: string;
  brandLogoFile?: string | null;
  brandOverlayBgFile?: string | null;
}> = ({
  scene,
  colorPalette,
  wordTimestamps,
  brandLogoUrl,
  brandName,
  jobId,
  brandLogoFile,
  brandOverlayBgFile,
}) => {
  switch (scene.sceneType) {
    case "title_card":
      return <TitleCard scene={scene} colorPalette={colorPalette} brandLogoUrl={brandLogoUrl} brandName={brandName} />;
    case "stock_background":
      return <StockBackground scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} jobId={jobId} />;
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
      return <MediaShowcase scene={scene} colorPalette={colorPalette} jobId={jobId} />;
    case "timeline":
      return <Timeline scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} />;
    case "cryptovn101_news": // [CryptoVN Custom]
      return (
        <CryptoVN101News
          scene={scene}
          colorPalette={colorPalette}
          jobId={jobId}
          brandLogoFile={brandLogoFile}
          brandOverlayBgFile={brandOverlayBgFile}
        />
      );
    case "story_beats":
      return <StoryBeats scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} />;
    default:
      return <StockBackground scene={scene} colorPalette={colorPalette} wordTimestamps={wordTimestamps} jobId={jobId} />;
  }
};

const getBaseTransitionDuration = (
  sceneType: VideoProps["scenes"][0]["sceneType"],
): number => {
  switch (sceneType) {
    case "title_card":
      return 20;
    case "stock_background":
      return 12;
    default:
      return 15;
  }
};

const getSceneDurationFrames = (
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
  seed: number,
  sceneIndex: number,
) => {
  const key = sceneIndex * 100 + 40;
  switch (transitionName) {
    case "slide":
    case "zoom":
      return springTiming({
        durationInFrames,
        config: {
          damping: 18 + (seededRandom(seed, key) - 0.5) * 4,        // 16-20
          stiffness: 140 + (seededRandom(seed, key + 1) - 0.5) * 30, // 125-155
          mass: 0.9 + (seededRandom(seed, key + 2) - 0.5) * 0.2,    // 0.8-1.0
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
  brandLogoUrl?: string | null;
  brandName?: string | null;
  seed: number;
  jobId?: string;
  brandLogoFile?: string | null;
  brandOverlayBgFile?: string | null;
}> = ({
  scene,
  colorPalette,
  wordTimestamps,
  sequenceDurationFrames,
  outgoingTransitionName,
  outgoingTransitionDuration,
  brandLogoUrl,
  brandName,
  seed,
  jobId,
  brandLogoFile,
  brandOverlayBgFile,
}) => {
  const frame = useCurrentFrame();
  const sceneKey = scene.sceneIndex * 100;
  const incomingTransitionName = scene.transition ?? "fade";
  const isIncomingZoom = incomingTransitionName === "zoom";

  // Seed-based entry motion variation (Hướng C: randomize params, not types)
  const entryScaleStart = isIncomingZoom
    ? 0.88 + seededRandom(seed, sceneKey + 10) * 0.08  // 0.88-0.96
    : 1;
  const entryDuration = isIncomingZoom
    ? 12 + seededInt(seed, sceneKey + 11, 0, 8)         // 12-20 frames
    : 0;
  const entryFadeDuration = isIncomingZoom
    ? 8 + seededInt(seed, sceneKey + 12, 0, 6)          // 8-14 frames
    : 0;

  const entryScale = isIncomingZoom
    ? interpolate(frame, [0, entryDuration], [entryScaleStart, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;
  const entryOpacity = isIncomingZoom
    ? interpolate(frame, [0, entryFadeDuration], [0.7, 1], {
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
  // Seed-based exit strength variation: 0.5-1.0
  const exitStrength = hasOutgoingTransition
    ? 0.5 + seededRandom(seed, sceneKey + 20) * 0.5
    : 0;

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
      <SceneRenderer
        scene={scene}
        colorPalette={colorPalette}
        wordTimestamps={wordTimestamps}
        brandLogoUrl={brandLogoUrl}
        brandName={brandName}
        jobId={jobId}
        brandLogoFile={brandLogoFile}
        brandOverlayBgFile={brandOverlayBgFile}
      />
      {/* Emoji pop-up overlay (per-scene, not on title_card) */}
      {scene.emoji && scene.sceneType !== "title_card" && (
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

  // Diversity seed — deterministic per video, all randomization flows from this
  const seed = hashJobId(props.jobId ?? "");

  // Since AnimatedBackground (Layer 0) renders the preset gradient,
  // we must make the scene background transparent so it shows through.
  const effectivePalette = { ...colorPalette, background: "transparent" };

  return (
    <AbsoluteFill>
      {/* Layer 0: Animated background */}
      <AnimatedBackground
        preset={settings.backgroundPreset ?? "steel_blue"}
        primaryColor={colorPalette.primary}
        secondaryColor={colorPalette.secondary}
        customBackgroundUrl={settings.customBackgroundUrl}
        customBackgroundType={settings.customBackgroundType}
        seed={seed}
      />
      {/* Layer 1: Scene sequences with transitions */}
      <TransitionSeries>
        {(() => {
          // Budget constraint: cumulative jitter clamped to [-4, +4] frames
          let jitterBudget = 0;
          return scenes.map((scene, index) => {
            const durationFrames = getSceneDurationFrames(scene, fps);
            const nextScene = scenes[index + 1] ?? null;
            const nextTransitionName = nextScene?.transition ?? "fade";
            const hasTransition =
              index < scenes.length - 1 && nextTransitionName !== "none";

            // Seed-based transition duration jitter (±2 frames)
            let transitionDurationFrames = 0;
            if (hasTransition) {
              const baseDur = getBaseTransitionDuration(nextScene!.sceneType);
              const jitter = seededInt(seed, index * 100 + 1, -2, 2);
              if (Math.abs(jitterBudget + jitter) > 4) {
                transitionDurationFrames = baseDur; // reset if budget exceeded
              } else {
                jitterBudget += jitter;
                transitionDurationFrames = Math.max(8, baseDur + jitter);
              }
            }

            const compensatedDuration =
              index < scenes.length - 1
                ? durationFrames + transitionDurationFrames
                : durationFrames;

            // Per-scene color micro-shift (±3% hue on primary/secondary only)
            const shiftedPalette = {
              ...effectivePalette,
              primary: shiftHue(colorPalette.primary, seed, index * 100 + 60),
              secondary: shiftHue(colorPalette.secondary, seed, index * 100 + 61),
            };

            return (
              <React.Fragment key={scene.sceneIndex}>
                <TransitionSeries.Sequence durationInFrames={compensatedDuration}>
                  <SceneWithEntryMotion
                    scene={scene}
                    colorPalette={shiftedPalette}
                    wordTimestamps={props.wordTimestamps}
                    sequenceDurationFrames={compensatedDuration}
                    outgoingTransitionName={hasTransition ? nextTransitionName : "none"}
                    outgoingTransitionDuration={transitionDurationFrames}
                    brandLogoUrl={props.brandLogoUrl}
                    brandName={props.brandName}
                    seed={seed}
                    jobId={props.jobId}
                    brandLogoFile={props.brandLogoFile}
                    brandOverlayBgFile={props.brandOverlayBgFile}
                  />
                </TransitionSeries.Sequence>
                {hasTransition && (
                  <TransitionSeries.Transition
                    presentation={getTransition(nextTransitionName, seed, index)}
                    timing={getTransitionTiming(
                      nextScene!.sceneType,
                      nextTransitionName,
                      transitionDurationFrames,
                      seed,
                      index,
                    )}
                  />
                )}
              </React.Fragment>
            );
          });
        })()}

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

      {/* Layer 2.5: SFX variety pool — maps by transition type + seed */}
      {settings.sfx?.enabled && (() => {
        const WHOOSH_SFX = [
          "sfx/whoosh.mp3",
          "sfx/fast-swish.mp3",
          "sfx/fast-whoosh.mp3",
          "sfx/mixkit-arrow-whoosh-1491.wav",
          "sfx/single-swish-01.mp3",
          "sfx/swish-swoosh-cutscene-sound-effect.mp3",
          "sfx/swish.mp3",
          "sfx/transition-whoosh.mp3",
          "sfx/whoosh-sfx (1).mp3",
          "sfx/whoosh-sfx.mp3",
          "sfx/whoosh-wind.mp3",
        ] as const;

        const CLICK_POP_SFX = [
          "sfx/pop.mp3",
          "sfx/pop_7e9Is8L.mp3",
          "sfx/ding.mp3",
          "sfx/ding-sound-effect_1_0gpHFnw.mp3",
          "sfx/finger-snap.mp3",
          "sfx/meme-click.mp3",
          "sfx/mouse-click-00-c-fesliyanstudios.mp3",
          "sfx/mouse-click_gt1reD8.mp3",
          "sfx/mouse-clicking-1.mp3",
          "sfx/photo-click.mp3",
          "sfx/quick-ting.mp3",
        ] as const;

        const ZOOM_SFX = [
          "sfx/mixkit-air-zoom-vacuum-2608.wav",
          ...WHOOSH_SFX,
          ...CLICK_POP_SFX,
        ] as const;

        const SFX_MAP: Record<string, readonly string[]> = {
          fade: WHOOSH_SFX,
          slide: [...WHOOSH_SFX, ...CLICK_POP_SFX],
          wipe: WHOOSH_SFX,
          zoom: ZOOM_SFX,
          flip: [...CLICK_POP_SFX, ...WHOOSH_SFX],
          iris: CLICK_POP_SFX,
          "clock-wipe": CLICK_POP_SFX,
          none: WHOOSH_SFX,
        };
        return scenes.map((scene, i) => {
          if (i === 0) return null;
          const transition = scene.transition ?? "fade";
          const candidates = SFX_MAP[transition] ?? SFX_MAP.fade;
          const sfxFile = seededPick(seed, i * 100 + 50, candidates);
          const absFrame = Math.ceil((scene.startMs / 1000) * fps);
          return (
            <Sequence key={`sfx-${i}`} from={Math.max(0, absFrame - 5)} durationInFrames={30}>
              <Audio
                src={staticFile(sfxFile)}
                volume={() => settings.sfx?.volume ?? 0.25}
              />
            </Sequence>
          );
        });
      })()}

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
          position={settings.watermarkPosition ?? "top-right"}
          opacity={settings.watermarkOpacity ?? 0.5}
          logoUrl={settings.watermarkLogoUrl}
          mode={settings.watermarkMode ?? "text"}
        />
      )}

      {/* Layer 4: Progress bar (variant selected by seed) */}
      {(() => {
        const PROGRESS_VARIANTS = ["line", "dots", "segmented"] as const;
        const progressVariant = seededPick(seed, 99, PROGRESS_VARIANTS);
        return (
          <ProgressBar
            color={colorPalette.primary}
            secondaryColor={colorPalette.secondary}
            variant={progressVariant}
          />
        );
      })()}
    </AbsoluteFill>
  );
};
