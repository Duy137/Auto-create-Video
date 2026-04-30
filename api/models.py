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
    def validate_email(cls, v: str) -> str:
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        return v.lower().strip()

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username can only contain letters, numbers, _ and -")
        return v.strip()


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


# Fix forward reference — TokenResponse needs UserResponse
TokenResponse.model_rebuild()


# ══════════════════════════════
# Jobs
# ══════════════════════════════

class JobCreateRequest(BaseModel):
    """Request body for POST /api/jobs — submit a new video generation job."""
    input_text: str = Field(..., min_length=10)
    settings: JobSettings
    skip_review: bool | None = None


class JobSettings(BaseModel):
    """User-configurable video settings from the 3-panel UI."""
    # Video & Audio (Middle panel)
    aspect_ratio: str = Field(default="9:16", pattern=r"^(9:16|16:9)$")
    tts_engine: str = Field(default="openai", pattern=r"^(openai|edge-tts)$")
    voice: str = Field(default="nova")
    speech_rate: float = Field(default=1.0, ge=0.8, le=2.0)
    speech_volume: float = Field(default=1.0, ge=0.6, le=3.0)
    transition_mode: str = Field(
        default="crossfade",
        pattern=r"^(none|crossfade|fade_to_black)$",
    )
    bgm_mode: str = Field(default="none", pattern=r"^(none|custom)$")
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
    props: dict[str, Any] | None = None
    video_url: str | None = None
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


# ══════════════════════════════
# TTS Preview
# ══════════════════════════════

class VoicePreviewRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    engine: str = Field(default="openai", pattern=r"^(openai|edge-tts|elevenlabs|gemini)$")
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


class UpdatePropsRequest(BaseModel):
    """PATCH /api/jobs/{id}/props — update scene-level props + video settings."""
    scenes: list[dict[str, Any]] | None = None
    settings: dict[str, Any] | None = None


class ReSearchMediaRequest(BaseModel):
    """POST /api/jobs/{id}/scenes/{index}/re-search — re-search media for one scene."""
    video_query: str | None = None
    image_query: str | None = None


# ══════════════════════════════
# SSE Progress
# ══════════════════════════════

class ProgressEvent(BaseModel):
    """Server-Sent Event payload for pipeline progress."""
    event: str  # "progress" | "review_ready" | "done" | "error"
    step: str | None = None
    progress: float | None = None
    message: str | None = None
    job_id: str | None = None
    download_url: str | None = None
    fatal: bool = False
    props: dict[str, Any] | None = None  # Sent with review_ready event
