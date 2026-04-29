// remotion/src/schemas/videoProps.ts
/**
 * Zod schema — JSON Contract (TypeScript side).
 *
 * This schema defines what the Remotion renderer expects as inputProps.
 * Python pipeline outputs snake_case JSON → camelizeKeys() transforms
 * to camelCase → this schema validates the result.
 *
 * MUST stay in sync with app/state.py (Python side).
 */

import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

// ── Word Timestamps (from Whisper alignment) ──

const WordTimestampSchema = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
});

// ── Color Palette (from LLM) ──

const ColorPaletteSchema = z.object({
  primary: hexColor,
  secondary: hexColor,
  background: hexColor,
  text: hexColor,
});

// ── Chart Data Point (for diagram) ──

const ChartDataPointSchema = z.object({
  x: z.union([z.number(), z.string()]),
  y: z.number(),
  label: z.string().optional(),
});

// ── Diagram Spec ──

const DiagramSpecSchema = z.object({
  type: z.enum(["line_chart", "bar_chart", "scatter", "math_formula"]),
  xRange: z.tuple([z.number(), z.number()]).optional(),
  function: z.string().optional(),
  data: z.array(ChartDataPointSchema).optional(),
  latex: z.string().optional(),
  annotations: z.array(z.string()).optional(),
});

// ── Comparison Side (for comparison scene) ──

const ComparisonSideSchema = z.object({
  label: z.string().max(20),
  points: z.array(z.string().max(30)).max(5),
  sentiment: z.enum(["positive", "negative", "neutral"]).default("neutral"),
});

// ── Timeline Event (for timeline scene) ──

const TimelineEventSchema = z.object({
  label: z.string().max(10),
  title: z.string().max(20),
  description: z.string().max(40).nullable().optional(),
});

// ── Scene Data ──

const SceneSchema = z.object({
  sceneIndex: z.number().int().nonnegative(),
  sceneType: z.enum([
    "title_card",
    "stock_background",
    "info_card",
    "stats_highlight",
    "diagram",
    "emoji_grid",
    "comparison",
    "media_showcase",
    "timeline",
    "news_intro",
  ]),
  narration: z.string(),

  // Director agent outputs (Phase 1)
  transition: z.enum(["fade", "slide", "wipe", "none", "zoom", "flip", "clock-wipe", "iris"]).optional().default("fade"),
  purpose: z.enum(["hook", "explain", "list_steps", "data_visual", "compare", "conclude"]).optional(),
  layout: z.enum(["center_focus", "vertical_stack", "media_overlay", "horizontal_grid", "grid_2x2"]).optional().default("center_focus"),
  visualDescription: z.string(),

  // Timing (computed from audio word timestamps)
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),

  // Search queries (from LLM, editable by user)
  semanticSummaryEn: z.string().nullable().optional(),
  semanticImageQuery: z.string().nullable().optional(),
  semanticVideoQuery: z.string().nullable().optional(),
  imageQuery: z.string().nullable(),
  videoQuery: z.string().nullable(),

  // Resolved media (from Pexels, after Media Searcher)
  mediaUrl: z.string().nullable(),
  mediaType: z.enum(["video", "image"]).nullable(),

  // Keywords
  keywordsToHighlight: z.array(z.string()),
  englishPhrases: z.array(z.string()),

  // Type-specific data (optional)
  cardItems: z
    .array(
      z.object({
        icon: z.string(),
        title: z.string(),
        subtitle: z.string(),
      }),
    )
    .optional(),

  stats: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        color: hexColor,
      }),
    )
    .optional(),

  diagramSpec: DiagramSpecSchema.optional(),

  // New scene type data
  comparisonSides: z.array(ComparisonSideSchema).length(2).nullable().optional(),
  timelineEvents: z.array(TimelineEventSchema).min(3).max(5).nullable().optional(),
  mediaLayout: z.enum(["cinema", "fullscreen", "fit"]).optional(),

  // TitleCard redesign fields (optional, LLM-enhanced)
  titleLines: z.array(z.object({
    text: z.string(),
    style: z.enum(["normal", "highlight", "accent"]),
  })).optional().nullable(),
  topBadge: z.string().optional().nullable(),
  topIcon: z.string().optional().nullable(),

  // Emoji pop-up (optional, LLM-generated)
  emoji: z.string().optional().nullable(),
});

// ── Subtitle Settings ──

const SubtitleSettingsSchema = z.object({
  enabled: z.boolean(),
  font: z.string(),
  fontSize: z.number().int().min(20).max(100),
  fontColor: hexColor,
  highlightColor: hexColor,
  strokeColor: hexColor,
  strokeWidth: z.number().min(0).max(10),
  position: z.enum(["top", "center", "bottom"]),
  preset: z.enum(["default", "bold_pop", "karaoke", "minimal"]).optional().default("default"),
});

// ── Video Settings ──

const SettingsSchema = z.object({
  aspectRatio: z.enum(["9:16", "16:9"]),
  fps: z.number().int().default(30),
  transitionMode: z.enum(["none", "crossfade", "fade_to_black"]),
  bgmUrl: z.string().nullable(),
  bgmVolume: z.number().min(0).max(1),
  watermarkText: z.string().nullable().optional(),
  watermarkPosition: z.enum([
    "top-left", "top-right", "bottom-left", "bottom-right", "center",
  ]).optional().default("bottom-right"),
  watermarkOpacity: z.number().min(0.1).max(1).optional().default(0.5),
  watermarkLogoUrl: z.string().nullable().optional().default(null),
  watermarkMode: z.enum(["text", "logo", "both"]).optional().default("text"),
  subtitle: SubtitleSettingsSchema,
  sfx: z.object({
    enabled: z.boolean().default(true),
    volume: z.number().min(0).max(1).default(0.25),
  }).optional().default({ enabled: true, volume: 0.25 }),
  cta: z.object({
    enabled: z.boolean().default(false),
    mediaUrl: z.string().nullable().default(null),
    mediaType: z.enum(["video", "image"]).default("video"),
    durationMs: z.number().default(3000),
  }).optional().default({ enabled: false, mediaUrl: null, mediaType: "video", durationMs: 3000 }),
  backgroundPreset: z.string().optional().default("steel_blue"),
});

// ══════════════════════════════════════════════
// ROOT: Complete data for 1 video
// ══════════════════════════════════════════════

export const VideoPropsSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  colorPalette: ColorPaletteSchema,
  audioUrl: z.string(),
  wordTimestamps: z.array(WordTimestampSchema),
  scenes: z.array(SceneSchema),
  settings: SettingsSchema,
});

export type VideoProps = z.infer<typeof VideoPropsSchema>;
export type SceneData = z.infer<typeof SceneSchema>;

// Re-export sub-schemas for use in components
export {
  WordTimestampSchema,
  ColorPaletteSchema,
  SceneSchema,
  SubtitleSettingsSchema,
  SettingsSchema,
  DiagramSpecSchema,
};
