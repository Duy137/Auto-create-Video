"""Pydantic schemas — JSON Contract (Python side).

These models define the exact structure of data that flows from
the Python pipeline to the Remotion renderer via a JSON file.

Python outputs snake_case JSON. The Remotion side transforms it
to camelCase via camelizeKeys() before Zod validation.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


# ── Word Timestamps (from Whisper alignment) ──


class WordTimestamp(BaseModel):
    """Đại diện cho mốc thời gian bắt đầu và kết thúc của một từ trong luồng âm thanh."""
    text: str
    start_ms: float
    end_ms: float


# ── Color Palette (from LLM) ──


class ColorPalette(BaseModel):
    """Bảng màu chủ đạo cho video, thường do LLM tự động phối màu."""
    primary: str  # hex color e.g. "#FF6B35"
    secondary: str
    background: str
    text: str


# ── Type-specific scene data ──


class CardItem(BaseModel):
    """Dữ liệu cho một mục trong danh sách (dùng cho scene type: info_card)."""
    icon: str
    title: str
    subtitle: str


class StatItem(BaseModel):
    """Dữ liệu thống kê (dùng cho scene type: stats_highlight)."""
    label: str
    value: str
    color: str  # hex color


class ChartDataPoint(BaseModel):
    """Một điểm dữ liệu trên biểu đồ (dùng cho scene type: diagram)."""
    x: float | str
    y: float
    label: str | None = None


class DiagramSpec(BaseModel):
    """Cấu hình chi tiết cho biểu đồ hoặc công thức toán học (dùng cho scene type: diagram)."""
    type: str  # line_chart | bar_chart | scatter | math_formula
    x_range: list[float] | None = None
    function: str | None = None
    data: list[ChartDataPoint] | None = None
    latex: str | None = None
    annotations: list[str] | None = None


# ── Type-specific scene data (for new scene types) ──


class ComparisonSide(BaseModel):
    """Dữ liệu một bên của bảng so sánh (dùng cho scene type: comparison)."""
    label: str                    # max 20 chars
    points: list[str]             # max 5 items, each max 30 chars
    sentiment: str = "neutral"    # "positive" | "negative" | "neutral"


class TimelineEvent(BaseModel):
    """Một sự kiện trên dòng thời gian (dùng cho scene type: timeline)."""
    label: str                      # max 10 chars (e.g. "2024")
    title: str                      # max 20 chars
    description: str | None = None  # max 40 chars


class StoryBeat(BaseModel):
    """A single beat in a story_beats scene.

    Each beat is a 3-8 word micro-idea with one representative emoji,
    timed to the underlying narration via wordTimestamps.
    """
    text: str
    emoji: str
    start_ms: float
    end_ms: float


class SceneAudit(BaseModel):
    """Audit metadata from VLM reranker (Approach 1 + 5)."""

    passed: bool
    signals: list[str] = []
    confidence: float | None = None
    min_confidence: float | None = None
    rule_details: dict[str, Any] | None = None
    suggested_fallback: str | None = None


# ── Scene ──


class Scene(BaseModel):
    """Đại diện cho một phân cảnh trong video, chứa toàn bộ thông tin nội dung, timing và url media."""
    scene_index: int
    scene_type: str  # title_card | stock_background | info_card | stats_highlight | diagram | emoji_grid | comparison | media_showcase | timeline | story_beats | cryptovn101_news
    narration: str
    visual_description: str

    # Timing (computed from audio word timestamps)
    start_ms: float
    end_ms: float

    # Director agent outputs (Phase 1)
    transition: str = "fade"  # fade | slide | wipe | zoom | flip | clock-wipe | iris | none — per-scene transition
    purpose: str | None = None  # hook | explain | list_steps | data_visual | compare | conclude
    layout: str = "standard"  # standard | news_intro | educational | tutorial | commercial_overlay | horizontal_grid | grid_2x2

    # Search queries (from LLM, editable by user)
    semantic_summary_en: str | None = None
    semantic_image_query: str | None = None
    semantic_video_query: str | None = None
    image_query: str | None = None
    video_query: str | None = None

    # Resolved media (from Pexels, after Media Searcher)
    media_url: str | None = None
    media_type: str | None = None  # "video" | "image" | None
    poster_url: str | None = None  # First-frame/static thumbnail URL for review sidebar

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
    top_badge: str | None = None  # Optional label (e.g. HOT, NEW)
    top_icon: str | None = None  # emoji icon above badge

    # Emoji pop-up (optional, LLM-generated)
    emoji: str | None = None  # single emoji for pop-up display

    # Story Beats fallback (optional, populated when scene_type == "story_beats")
    # Used when audit fails or user manually selects this scene type.
    story_beats: list[StoryBeat] | None = None

    # VLM audit metadata (used by Review UI badge/action).
    audit: SceneAudit | None = None

    # Pre-computed alternative scene type content (Phase 3.5).
    # Used by Review UI for instant scene type switching.
    alt_data: dict | None = Field(None, alias="_alt_data")

    class Config:
        populate_by_name = True  # allow both "alt_data" and "_alt_data"


# ── Subtitle Settings ──


class SubtitleSettings(BaseModel):
    """Cấu hình hiển thị phụ đề karaoke trong video."""
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
    """Cấu hình hiệu ứng âm thanh (Sound Effects)."""
    enabled: bool = True
    volume: float = 0.25


class CtaSettings(BaseModel):
    """Cấu hình phần Kêu gọi hành động (Call To Action) ở cuối video."""
    enabled: bool = False
    media_url: str | None = None
    media_type: str = "video"  # "video" | "image"
    duration_ms: int = 3000


class VideoSettings(BaseModel):
    """Cấu hình tổng quan về video (kích thước, hiệu ứng, nhạc nền, watermark...)."""
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
    custom_background_url: str | None = None
    custom_background_type: str = "image"  # "image" | "video"


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
    width: int = 1080
    height: int = 1920
    settings: VideoSettings = VideoSettings()
    brand_logo_file: str | None = None
    brand_overlay_bg_file: str | None = None



# ══════════════════════════════════════════════
# TOKEN USAGE & COST TRACKING
# ══════════════════════════════════════════════

# Pricing per 1M tokens (USD)
MODEL_PRICING: dict[str, dict[str, float]] = {
    "gpt-4o-mini-tts": {"input": 0.0, "output": 12.0},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "tongyi-embedding-vision-flash": {"input": 0.03, "output": 0.0},
    "qwen3.5-flash": {"input": 0.1, "output": 0.4},
    # Aliases — DashScope model names may differ from display names
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
    step: str                   # e.g. "script_agent.researcher", "content.splitter"
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


# ══════════════════════════════════════════════
# AGENTIC PIPELINE STATE
# ══════════════════════════════════════════════


# ── Sub-types ─────────────────────────────────────────────────────────────────

class AgentTurn(BaseModel):
    """Lịch sử xử lý của một node/agent trong pipeline."""
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    agent_name: str
    thought: str | None = None
    action: str
    result: str | None = None
    tokens_used: int = 0
    duration_ms: float = 0.0
    success: bool = True


class WorkerFailure(BaseModel):
    """Ghi nhận lỗi khi một công đoạn trong pipeline chạy thất bại."""
    worker_name: str
    error: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    attempt: int = 1


# ── Script generation schemas ──────────────────────────────────────────────────

class ScriptAgentRequest(BaseModel):
    """Yêu cầu tạo kịch bản từ chủ đề do người dùng nhập vào (Topic mode)."""
    topic: str
    audience: str = "general"
    tone: Literal["formal", "casual", "hype", "educational", "news"] = "casual"
    duration_seconds: int = 60
    language: str = "vi"
    format: Literal["news", "training", "promo", "explainer", "story"] = "explainer"
    reference_urls: list[str] = []
    reference_text: str | None = None
    must_include: list[str] = []
    n_variants: int = 1


class ResearchNote(BaseModel):
    """Ghi chú tài liệu do sub-agent Researcher cào từ web hoặc YouTube."""
    source: str
    summary: str
    url: str | None = None


class ScriptVariant(BaseModel):
    """Một phiên bản kịch bản video hoàn chỉnh do LLM tự động soạn ra."""
    title: str
    hook: str
    body: str
    cta: str
    full_script: str
    estimated_duration: float
    hashtags: list[str] = []


# ── Job settings (mirrors api/models.py JobSettings) ──────────────────────────

class AgentJobSettings(BaseModel):
    """Cài đặt cho Job từ phía người dùng (giọng đọc, tỉ lệ, nhạc...). Dữ liệu này sẽ map qua VideoSettings."""
    tts_engine: str = "openai"
    voice: str = "nova"
    speech_rate: float = 1.0
    aspect_ratio: Literal["9:16", "16:9", "1:1"] = "9:16"
    transition_mode: str = "crossfade"
    bgm_mode: Literal["none", "custom", "library"] = "none"
    bgm_library_id: str | None = None
    bgm_url: str | None = None
    bgm_volume: float = 0.2
    subtitle_enabled: bool = True
    subtitle_font: str = "NotoSansVN-Bold"
    subtitle_font_size: int = 48
    subtitle_font_color: str = "#FFFFFF"
    subtitle_highlight_color: str = "#FF6B35"
    subtitle_stroke_color: str = "#000000"
    subtitle_stroke_width: int = 2
    subtitle_position: str = "bottom"
    skip_review: bool = False


# ── Central state ─────────────────────────────────────────────────────────────

DEFAULT_RETRY_BUDGET: dict[str, int] = {
    "script_agent": 2,
    "validator": 3,
    "content": 1,
    "tts": 4,
    "alignment": 2,
    "media": 3,
    "timing": 2,
    "render": 1,
    "qc": 2,
}


class AgentState(BaseModel):
    """State trung tâm - Trái tim của toàn bộ pipeline, mang theo dữ liệu xuyên suốt các công đoạn."""
    # Identity
    job_id: str
    user_id: int

    # User input
    user_input_mode: Literal["script", "topic"] = "script"
    user_input: str | None = None          # provided script
    script_request: ScriptAgentRequest | None = None   # topic-based
    settings: AgentJobSettings = Field(default_factory=AgentJobSettings)

    # Worker outputs
    generated_scripts: list[ScriptVariant] | None = None
    chosen_script: str | None = None       # user selected or auto-chosen variant
    scenes: list[dict[str, Any]] | None = None
    title: str | None = None
    color_palette: dict[str, str] | None = None
    background_preset: str | None = None
    audio_path: str | None = None
    duration_ms: float | None = None
    word_timestamps: list[dict[str, Any]] | None = None
    display_word_timestamps: list[dict[str, Any]] | None = None
    processed_word_counts: list[int] | None = None
    rerank_decisions: dict[int, dict[str, Any]] = Field(default_factory=dict)
    story_beats_applied_count: int = 0
    video_props: dict[str, Any] | None = None
    final_mp4_path: str | None = None

    # QC scores and reasons keyed by stage, e.g. "content_qc", "media_qc".
    qc_scores: dict[str, float] = Field(default_factory=dict)
    qc_reasons: dict[str, list[str]] = Field(default_factory=dict)

    # Pipeline memory
    history: list[AgentTurn] = []
    failures: list[WorkerFailure] = []
    retry_budget: dict[str, int] = Field(default_factory=lambda: dict(DEFAULT_RETRY_BUDGET))
    total_tokens: int = 0
    total_cost_estimate: float = 0.0
    token_breakdown: list[TokenUsage] = Field(default_factory=list)

    # Stop conditions
    is_done: bool = False
    needs_human: bool = False
    human_question: str | None = None
    human_checkpoint_type: str | None = None   # "script_selection" | "content_review"
    human_checkpoint_data: dict[str, Any] | None = None

    # ── Helpers ──

    def can_retry(self, worker_name: str) -> bool:
        return self.retry_budget.get(worker_name, 0) > 0

    def consume_retry(self, worker_name: str) -> None:
        if worker_name in self.retry_budget:
            self.retry_budget[worker_name] = max(0, self.retry_budget[worker_name] - 1)

    def record_turn(self, turn: AgentTurn) -> None:
        self.history.append(turn)
        self.total_tokens += turn.tokens_used

    def record_token_usage(self, usage: TokenUsage) -> None:
        """Append a token usage record and update running cost total."""
        self.token_breakdown.append(usage)
        self.total_cost_estimate += usage.cost_usd

    def record_failure(self, failure: WorkerFailure) -> None:
        self.failures.append(failure)
        self.consume_retry(failure.worker_name)

    def effective_script(self) -> str | None:
        """Return the script text that should be processed by the content worker."""
        if self.chosen_script:
            return self.chosen_script
        if self.generated_scripts:
            return self.generated_scripts[0].full_script
        return self.user_input

