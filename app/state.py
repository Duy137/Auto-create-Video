"""Pydantic schemas — JSON Contract (Python side).

These models define the exact structure of data that flows from
the Python pipeline to the Remotion renderer via a JSON file.

Python outputs snake_case JSON. The Remotion side transforms it
to camelCase via camelizeKeys() before Zod validation.
"""

from __future__ import annotations

from pydantic import BaseModel


# ── Word Timestamps (from Whisper alignment) ──


class WordTimestamp(BaseModel):
    text: str
    start_ms: float
    end_ms: float


# ── Color Palette (from LLM) ──


class ColorPalette(BaseModel):
    primary: str  # hex color e.g. "#FF6B35"
    secondary: str
    background: str
    text: str


# ── Type-specific scene data ──


class CardItem(BaseModel):
    icon: str
    title: str
    subtitle: str


class StatItem(BaseModel):
    label: str
    value: str
    color: str  # hex color


class ChartDataPoint(BaseModel):
    x: float | str
    y: float
    label: str | None = None


class DiagramSpec(BaseModel):
    type: str  # line_chart | bar_chart | scatter | math_formula
    x_range: list[float] | None = None
    function: str | None = None
    data: list[ChartDataPoint] | None = None
    latex: str | None = None
    annotations: list[str] | None = None


# ── Type-specific scene data (for new scene types) ──


class ComparisonSide(BaseModel):
    label: str                    # max 20 chars
    points: list[str]             # max 5 items, each max 30 chars
    sentiment: str = "neutral"    # "positive" | "negative" | "neutral"


class TimelineEvent(BaseModel):
    label: str                      # max 10 chars (e.g. "2024")
    title: str                      # max 20 chars
    description: str | None = None  # max 40 chars


# ── Scene ──


class Scene(BaseModel):
    scene_index: int
    scene_type: str  # title_card | stock_background | info_card | stats_highlight | diagram | emoji_grid | comparison | media_showcase | timeline | news_intro
    narration: str
    visual_description: str

    # Timing (computed from audio word timestamps)
    start_ms: float
    end_ms: float

    # Director agent outputs (Phase 1)
    transition: str = "fade"  # fade | slide | wipe | zoom | flip | clock-wipe | iris | none — per-scene transition
    purpose: str | None = None  # hook | explain | list_steps | data_visual | compare | conclude
    layout: str = "center_focus"  # center_focus | vertical_stack | media_overlay | horizontal_grid | grid_2x2

    # Search queries (from LLM, editable by user)
    semantic_summary_en: str | None = None
    semantic_image_query: str | None = None
    semantic_video_query: str | None = None
    image_query: str | None = None
    video_query: str | None = None

    # Resolved media (from Pexels, after Media Searcher)
    media_url: str | None = None
    media_type: str | None = None  # "video" | "image" | None

    # Keywords
    keywords_to_highlight: list[str] = []
    english_phrases: list[str] = []

    # Type-specific data (optional)
    card_items: list[CardItem] | None = None
    stats: list[StatItem] | None = None
    diagram_spec: DiagramSpec | None = None

    # New scene type data (optional)
    comparison_sides: list[ComparisonSide] | None = None
    timeline_events: list[TimelineEvent] | None = None
    media_layout: str = "fit"  # "fullscreen" | "cinema" | "fit"

    # TitleCard redesign fields (optional, LLM-enhanced)
    title_lines: list[dict] | None = None  # [{text, style: normal|highlight|accent}]
    top_badge: str | None = None  # BREAKING | NEW | TIP | WARNING | UPDATE
    top_icon: str | None = None  # emoji icon above badge

    # Emoji pop-up (optional, LLM-generated)
    emoji: str | None = None  # single emoji for pop-up display

    # Story Beats fallback data (optional, auto-generated)  [CryptoVN Custom]
    story_beats: list[dict] | None = None  # [{text, emoji, start_ms, end_ms}]


# ── Subtitle Settings ──


class SubtitleSettings(BaseModel):
    enabled: bool = True
    font: str = "NotoSansVN-Bold"
    font_size: int = 48
    font_color: str = "#FFFFFF"
    highlight_color: str = "#FF6B35"
    stroke_color: str = "#000000"
    stroke_width: int = 2
    position: str = "bottom"  # top | center | bottom
    preset: str = "default"  # default | bold_pop | karaoke | minimal


# ── Video Settings ──


class SfxSettings(BaseModel):
    enabled: bool = True
    volume: float = 0.25


class CtaSettings(BaseModel):
    enabled: bool = False
    media_url: str | None = None
    media_type: str = "video"  # "video" | "image"
    duration_ms: int = 3000


class VideoSettings(BaseModel):
    aspect_ratio: str = "9:16"
    fps: int = 30
    transition_mode: str = "crossfade"  # none | crossfade | fade_to_black
    bgm_url: str | None = None
    bgm_volume: float = 0.2
    watermark_text: str | None = None  # e.g. "@ainius.net"
    watermark_position: str = "top-right"  # top-left | top-right | bottom-left | bottom-right | center
    watermark_opacity: float = 0.5
    watermark_logo_url: str | None = None
    watermark_mode: str = "text"  # text | logo | both
    subtitle: SubtitleSettings = SubtitleSettings()
    sfx: SfxSettings = SfxSettings()
    cta: CtaSettings = CtaSettings()
    background_preset: str = "steel_blue"
    # [CryptoVN Custom] Custom background
    custom_background_url: str | None = None
    custom_background_type: str = "image"  # "image" | "video"
    custom_background_duration_sec: float | None = None


# ══════════════════════════════════════════════
# ROOT: Complete data for 1 video
# ══════════════════════════════════════════════


class VideoProps(BaseModel):
    """Root schema — complete data for one video.

    Python pipeline assembles this after all nodes finish:
    - Content Parser → scenes, color_palette, title
    - TTS + Whisper → audio_url, word_timestamps
    - Media Searcher → media_url/media_type per scene
    - User settings → settings

    Serialized to JSON via model_dump() and passed to Remotion.
    """

    job_id: str
    title: str
    color_palette: ColorPalette
    audio_url: str
    word_timestamps: list[WordTimestamp]
    scenes: list[Scene]
    settings: VideoSettings = VideoSettings()


# ══════════════════════════════════════════════
# TOKEN USAGE & COST TRACKING  [CryptoVN Custom]
# ══════════════════════════════════════════════

# Pricing per 1M tokens (USD)
MODEL_PRICING: dict[str, dict[str, float]] = {
    "gpt-4o-mini-tts": {"input": 0.0, "output": 12.0},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "tongyi-embedding-vision-flash": {"input": 0.03, "output": 0.0},
    "qwen3.5-flash": {"input": 0.1, "output": 0.4},
    "qwen-plus": {"input": 0.1, "output": 0.4},
    "qwen-turbo": {"input": 0.1, "output": 0.4},
}


def calc_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate USD cost for a single LLM call."""
    pricing = MODEL_PRICING.get(model)
    if not pricing:
        return 0.0
    cost_in = (input_tokens / 1_000_000) * pricing["input"]
    cost_out = (output_tokens / 1_000_000) * pricing["output"]
    return round(cost_in + cost_out, 8)


class TokenUsage(BaseModel):
    """Token usage record for a single LLM / API call."""
    model: str
    step: str                   # e.g. "story_beats.extract", "content.splitter"
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


# ══════════════════════════════════════════════
# STORY BEAT (for Story Beats fallback scene)  [CryptoVN Custom]
# ══════════════════════════════════════════════


class StoryBeat(BaseModel):
    """A single micro-beat within a story_beats scene."""
    text: str
    emoji: str = "✨"
    start_ms: float = 0.0
    end_ms: float = 0.0
