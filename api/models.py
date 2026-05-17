"""Pydantic request / response schemas for the API layer.

Keeps API contracts clean and separate from ORM models.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ══════════════════════════════
# Auth
# ══════════════════════════════

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., max_length=100)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(_, v: str) -> str:
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        return v.lower().strip()

    @field_validator("username")
    @classmethod
    def validate_username(_, v: str) -> str:
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username can only contain letters, numbers, _ and -")
        return v.strip()


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class UpdateMeRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=100)
    avatar_url: str | None = Field(default=None, max_length=500)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    display_name: str | None = None
    avatar_url: str | None = None
    role: str                              # highest_role (legacy support)
    roles: list[str] = []                  # MỚI: all assigned roles
    permissions: list[str] = []            # MỚI: effective permissions
    is_active: bool = True
    tier: str = "starter"                  # starter | pro | studio
    quota_used_month: int = 0              # current usage
    quota_limit: int = 3                   # current limit (tier or override)
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("roles", mode="before")
    @classmethod
    def extract_roles(cls, v: Any) -> list[str]:
        if not v:
            return []
        if isinstance(v[0], str):
            return v
        return [r.name for r in v if hasattr(r, "name")]


class AdminUserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str                              # highest_role
    roles: list[str] = []                  # MỚI
    is_active: bool
    tier: str = "starter"
    quota_override: int | None = None
    quota_used_month: int = 0
    quota_limit: int = 3
    created_at: datetime
    last_login_at: datetime | None = None
    job_count: int = 0

    model_config = {"from_attributes": True}

    @field_validator("roles", mode="before")
    @classmethod
    def extract_roles(cls, v: Any) -> list[str]:
        if not v:
            return []
        if isinstance(v[0], str):
            return v
        return [r.name for r in v if hasattr(r, "name")]


class UserListResponse(BaseModel):
    users: list[AdminUserResponse]
    total: int
    page: int
    per_page: int
    total_pro_studio: int = 0
    total_active: int = 0
    total_videos_month: int = 0


class UpdateRoleRequest(BaseModel):
    role: str = Field(..., pattern=r"^(user|admin)$")


class UpdateStatusRequest(BaseModel):
    is_active: bool


class UpdateTierRequest(BaseModel):
    tier: str = Field(..., pattern=r"^(starter|pro|studio)$")


class UpdateQuotaRequest(BaseModel):
    quota_override: int | None = Field(None, ge=0, le=9999)  # None = use tier default


# Fix forward reference — TokenResponse needs UserResponse
TokenResponse.model_rebuild()


# ══════════════════════════════
# Jobs
# ══════════════════════════════

class ScriptAgentRequestBody(BaseModel):
    """Request body for ScriptAgent — generate script from topic."""
    project_id: str | None = Field(default=None, min_length=8, max_length=64)
    topic: str = Field(..., min_length=3, max_length=500)
    audience: str = "general"
    tone: str = Field(default="casual", pattern=r"^(formal|casual|hype|educational|news)$")
    duration_seconds: int = Field(default=60, ge=15, le=300)
    language: str = "vi"
    format: str = Field(default="explainer", pattern=r"^(news|training|promo|explainer|story)$")
    reference_urls: list[str] = []
    reference_text: str | None = None
    must_include: list[str] = []
    n_variants: int = Field(default=1, ge=1, le=3)


class ScriptVariantResponse(BaseModel):
    title: str
    hook: str
    body: str
    cta: str
    full_script: str
    estimated_duration: float
    hashtags: list[str] = []


class ScriptAgentResponse(BaseModel):
    variants: list[ScriptVariantResponse]
    job_id: str | None = None


class ProgressPlanStep(BaseModel):
    key: str
    label: str
    status: str = Field(default="pending", pattern=r"^(done|active|pending|error)$")


class ProgressSnapshot(BaseModel):
    phase: str
    current_step: str
    execution_plan: list[ProgressPlanStep] = []
    active_tool: str | None = None
    intermediate_results: list[str] = []
    step_index: int = 0
    step_count: int = 0
    elapsed_seconds: int = 0
    eta_seconds: int | None = None
    status: str = Field(default="running", pattern=r"^(pending|running|done|error|needs_human)$")


class ScriptAgentTaskResponse(BaseModel):
    task_id: str
    status: str  # pending | running | done | error
    result: ScriptAgentResponse | None = None
    error: str | None = None
    progress_snapshot: ProgressSnapshot | None = None


class TemplateResponse(BaseModel):
    id: int
    slug: str
    name: str
    description: str | None = None
    category: str = "general"
    settings: dict[str, Any] = {}
    example_script: str | None = None
    thumbnail_url: str | None = None
    is_system: bool = False
    is_active: bool = True
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class TemplateListResponse(BaseModel):
    templates: list[TemplateResponse]


class TemplateCreateRequest(BaseModel):
    slug: str = Field(..., pattern=r"^[a-z0-9][a-z0-9-]{1,62}$")
    name: str = Field(..., min_length=2, max_length=120)
    description: str | None = None
    category: str = "general"
    settings: dict[str, Any] = {}
    example_script: str | None = None
    thumbnail_url: str | None = None
    is_active: bool = True
    is_system: bool = False


class TemplateUpdateRequest(BaseModel):
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{1,62}$")
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = None
    category: str | None = None
    settings: dict[str, Any] | None = None
    example_script: str | None = None
    thumbnail_url: str | None = None
    is_active: bool | None = None
    is_system: bool | None = None


class ShareLinkResponse(BaseModel):
    share_token: str
    share_url: str
    api_url: str


class PublicShareResponse(BaseModel):
    job_id: str
    title: str
    status: str
    video_url: str
    thumbnail_url: str | None = None
    share_views: int
    created_at: datetime


class JobCreateRequest(BaseModel):
    """Request body for POST /api/jobs — submit a new video generation job.

    Modes:
    - input_text provided: classic pipeline (existing behavior)
    - script_request provided: topic → ScriptAgent → pipeline (agentic mode)
    """
    input_text: str = Field(default="", min_length=0)
    script_request: ScriptAgentRequestBody | None = None
    project_id: str | None = Field(default=None, min_length=8, max_length=64)
    template_slug: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{1,62}$")
    settings: JobSettings
    skip_review: bool | None = None

    def get_text_or_topic(self) -> str:
        if self.input_text and len(self.input_text) >= 10:
            return self.input_text
        if self.script_request:
            return self.script_request.topic
        return ""


class HumanContinueRequest(BaseModel):
    """POST /api/jobs/{id}/continue — provide human decision at a checkpoint."""
    decision_type: str  # "script_selection" | "content_review" | "general"
    chosen_script: str | None = None   # full_script text of selected variant
    approved: bool = True
    notes: str | None = None


class JobSettings(BaseModel):
    """User-configurable video settings from the 3-panel UI."""
    # Video & Audio (Middle panel)
    aspect_ratio: str = Field(default="9:16", pattern=r"^(9:16|16:9|1:1)$")
    tts_engine: str = Field(default="openai", pattern=r"^(openai|edge-tts|elevenlabs|gemini|vbee)$")
    voice: str = Field(default="nova")
    speech_rate: float = Field(default=1.0, ge=0.8, le=2.0)
    speech_volume: float = Field(default=1.0, ge=0.6, le=3.0)
    transition_mode: str = Field(
        default="crossfade",
        pattern=r"^(none|crossfade|fade_to_black)$",
    )
    bgm_mode: str = Field(default="none", pattern=r"^(none|custom|library)$")
    bgm_library_id: str | None = None
    bgm_url: str | None = None
    bgm_volume: float = Field(default=0.2, ge=0.0, le=1.0)

    # Subtitle (Right panel)
    subtitle_enabled: bool = True
    subtitle_font: str = "NotoSansVN-Bold"
    subtitle_font_size: int = Field(default=48, ge=30, le=80)
    subtitle_font_color: str = Field(default="#FFFFFF")
    subtitle_stroke_color: str = Field(default="#000000")
    subtitle_stroke_width: float = Field(default=2.0, ge=0, le=10)
    subtitle_position: str = Field(
        default="bottom",
        pattern=r"^(top|center|bottom)$",
    )
    subtitle_highlight_color: str = Field(default="#FF6B35")
    # Fast-track: skip review step and render directly (with VLM reranker)
    skip_review: bool = False


class JobResponse(BaseModel):
    """Response for job endpoints."""
    id: str
    user_id: int
    status: str
    input_text: str | None = None
    settings: dict[str, Any] | None = None
    project_id: str | None = None
    props: dict[str, Any] | None = None
    video_url: str | None = None
    thumbnail_url: str | None = None
    share_token: str | None = None
    share_views: int = 0
    error: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    """Paginated job list."""
    jobs: list[JobResponse]
    total: int
    page: int
    per_page: int

class AdminJobResponse(BaseModel):
    """Extended job response for admin — includes owner username."""
    id: str
    user_id: int
    username: str | None = None
    status: str
    input_text: str | None = None
    props_title: str | None = None
    settings: dict[str, Any] | None = None
    project_id: str | None = None
    error: str | None = None
    failure_reason: str | None = None
    thumbnail_url: str | None = None
    share_token: str | None = None
    share_views: int = 0
    created_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class AdminJobListResponse(BaseModel):
    jobs: list[AdminJobResponse]
    total: int
    page: int
    per_page: int



class ProjectCreateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    stage: str = Field(default="idea", pattern=r"^(idea|config|processing|review|rendering|result|failed)$")
    config_draft: dict[str, Any] | None = None
    script_agent_draft: dict[str, Any] | None = None
    script_variants: list[dict[str, Any]] | None = None
    chosen_script: str | None = None
    script_agent_task_id: str | None = Field(default=None, min_length=8, max_length=64)
    script_agent_progress_snapshot: dict[str, Any] | None = None


class ProjectUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    stage: str | None = Field(default=None, pattern=r"^(idea|config|processing|review|rendering|result|failed)$")
    config_draft: dict[str, Any] | None = None
    script_agent_draft: dict[str, Any] | None = None
    script_variants: list[dict[str, Any]] | None = None
    chosen_script: str | None = None
    script_agent_task_id: str | None = Field(default=None, min_length=8, max_length=64)
    script_agent_progress_snapshot: dict[str, Any] | None = None
    active_job_id: str | None = Field(default=None, min_length=8, max_length=64)
    last_known_props: dict[str, Any] | None = None


class ProjectResponse(BaseModel):
    id: str
    user_id: int
    title: str | None = None
    stage: str
    config_draft: dict[str, Any] | None = None
    script_agent_draft: dict[str, Any] | None = None
    script_variants: list[dict[str, Any]] | None = None
    chosen_script: str | None = None
    script_agent_task_id: str | None = None
    script_agent_progress_snapshot: dict[str, Any] | None = None
    active_job_id: str | None = None
    last_known_props: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]
    total: int


class AdminStatsResponse(BaseModel):
    # User metrics
    total_users: int
    new_users_7d: int
    top_users: list[dict[str, Any]]
    # Job metrics
    total_jobs: int
    new_jobs_7d: int
    success_count: int
    fail_count: int
    success_rate: float = 0.0
    avg_render_seconds: float = 0.0
    # Cost
    total_cost_estimate: float = 0.0
    # Timeseries (last 30 days)
    jobs_by_day: list[dict[str, Any]] = []   # [{date, total, failed}]
    cost_by_day: list[dict[str, Any]] = []   # [{date, cost}]
    # Heatmap — peak usage hour × day_of_week
    hourly_heatmap: list[dict[str, Any]] = []  # [{day, hour, count}]
    # Agent metrics (agentic pipeline jobs only)
    total_tokens_by_worker: dict[str, int] = {}
    avg_pipeline_turns: float = 0.0
    worker_retry_rates: dict[str, float] = {}  # {worker: 0.0–1.0}
    script_agent_pct: float = 0.0


# ══════════════════════════════
# TTS Preview
# ══════════════════════════════

class VoicePreviewRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    engine: str = Field(default="openai", pattern=r"^(openai|edge-tts|elevenlabs|gemini|vbee)$")
    voice: str = Field(default="nova")
    rate: float = Field(default=1.0, ge=0.8, le=2.0)


# ══════════════════════════════
# Pipeline 2-Phase (Review + Render)
# ══════════════════════════════

class RenderJobRequest(BaseModel):
    """POST /api/jobs/{id}/render — trigger render from saved props.

    Empty for MVP. Future: may accept render-specific overrides.
    """
    pass


class ErrorReportRequest(BaseModel):
    """POST /api/error-reports — user-facing error report for admins."""
    source: str = Field(default="unknown", max_length=120)
    job_id: str | None = Field(default=None, max_length=64)
    description: str = Field(..., max_length=300)
    detail: Any | None = None
    page_url: str | None = Field(default=None, max_length=500)


class UpdatePropsRequest(BaseModel):
    """PATCH /api/jobs/{id}/props — update scene-level props + video settings."""
    scenes: list[dict[str, Any]] | None = None
    settings: dict[str, Any] | None = None
    color_palette: dict[str, str] | None = None


class ReSearchMediaRequest(BaseModel):
    """POST /api/jobs/{id}/scenes/{index}/re-search — re-search media for one scene."""
    video_query: str | None = None
    image_query: str | None = None


# ══════════════════════════════
# SSE Progress
# ══════════════════════════════

class AgentTraceEvent(BaseModel):
    """A single pipeline/worker turn sent in agent_trace SSE events."""
    agent_name: str
    action: str
    thought: str | None = None
    result: str | None = None
    success: bool = True
    tokens_used: int = 0
    duration_ms: float = 0.0


class ProgressEvent(BaseModel):
    """Server-Sent Event payload for pipeline progress."""
    event: str  # "progress" | "review_ready" | "done" | "error" | "agent_trace"
    step: str | None = None
    progress: float | None = None
    message: str | None = None
    job_id: str | None = None
    download_url: str | None = None
    fatal: bool = False
    props: dict[str, Any] | None = None  # Sent with review_ready event
    # Agentic pipeline extras
    agent_trace: AgentTraceEvent | None = None  # Sent with agent_trace events
    needs_human: bool = False
    human_checkpoint_type: str | None = None
    human_question: str | None = None
    generated_scripts: list[dict[str, Any]] | None = None
    progress_snapshot: ProgressSnapshot | None = None


# ══════════════════════════════
# Notifications
# ══════════════════════════════

class NotificationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    message: str | None = None
    type: str
    is_read: bool
    action_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    notifications: list[NotificationResponse]
    unread_count: int
