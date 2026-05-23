"""Production API routes for AutoClip.

Endpoints:
    Auth:     POST /register, /login, GET /me, PATCH /me
  Jobs:     POST /jobs, GET /jobs, GET /jobs/{id}, GET /jobs/{id}/progress, GET /jobs/{id}/download
  Review:   POST /jobs/{id}/render, PATCH /jobs/{id}/props, POST /jobs/{id}/scenes/{idx}/re-search
  TTS:      POST /tts/preview
  BGM:      POST /bgm/upload
"""

from __future__ import annotations

import io
import json
import secrets
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, TYPE_CHECKING
from api.signed_url import generate_signed_url_token, verify_signed_url_token

_SCRIPT_AGENT_TASKS = {}
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    UploadFile,
    File,
    status,
)
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from loguru import logger
from sqlalchemy import select, func, desc, update, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import (
    get_current_user,
)

from api.database import Job, Notification, Project, Template, UsageRecord, User, get_db
from api.models import (
    ErrorReportRequest,
    HumanContinueRequest,
    JobCreateRequest,
    JobListResponse,
    JobResponse,
    ProgressEvent,
    ReSearchMediaRequest,
    ShareLinkResponse,
    PublicShareResponse,
    ScriptAgentRequestBody,
    ScriptAgentResponse,
    ScriptAgentTaskResponse,
    ScriptVariantResponse,
    ProgressPlanStep,
    ProgressSnapshot,
    ProjectCreateRequest,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdateRequest,
    TemplateListResponse,
    TemplateResponse,
    UpdatePropsRequest,
    UserResponse,
    VoicePreviewRequest,
    NotificationListResponse,
)
from api.sse_broker import (
    broadcast_progress,
    subscribe as sse_subscribe,
    broadcast_user_event,
    subscribe_user,
    broadcast_script_task,
    subscribe_script_task,
)
from config import MAX_CONCURRENT_PIPELINE_JOBS_PER_USER, OUTPUT_DIR, REMOTION_DIR

if TYPE_CHECKING:
    from app.state import AgentJobSettings, AgentState

router = APIRouter(prefix="/api")


@router.get("/health", tags=["System"], summary="Health check for Railway")
async def health_check(db: Annotated[AsyncSession, Depends(get_db)]):
    """Check database and redis connectivity for Railway monitoring."""
    health_status = {
        "status": "healthy",
        "timestamp": time.time(),
        "services": {
            "database": "down",
            "redis": "down"
        }
    }
    
    # 1. Database
    try:
        from sqlalchemy import text
        await db.execute(text("SELECT 1"))
        health_status["services"]["database"] = "up"
    except Exception as e:
        health_status["status"] = "unhealthy"
        health_status["services"]["database"] = f"error: {str(e)}"
        logger.error(f"[HEALTH] DB check failed: {e}")

    # 2. Redis (Removed in local mode)

    if health_status["status"] != "healthy":
        # We still return 200 for now to avoid killing the container during initial startup
        # unless it's a critical persistent failure. For now, 200 helps us debug.
        return JSONResponse(status_code=200, content=health_status)
    
    return health_status

PROJECT_STAGE_VALUES = {
    "idea",
    "config",
    "processing",
    "review",
    "rendering",
    "result",
    "failed",
}
RESUMABLE_PROJECT_STAGE_VALUES = {
    "idea",
    "config",
    "processing",
    "review",
    "rendering",
}
_QUEUED_PIPELINE_STATUSES = ("pending", "processing", "rendering")
_UNCHANGED = object()
USER_SYSTEM_ERROR_MESSAGE = "Lỗi hệ thống"
MAX_ERROR_REPORT_DETAIL_CHARS = 8000
MAX_ERROR_REPORT_TITLE_CHARS = 140


def _safe_report_detail(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, ensure_ascii=False, default=str)
        except Exception:
            text = str(value)
    if len(text) > MAX_ERROR_REPORT_DETAIL_CHARS:
        return text[:MAX_ERROR_REPORT_DETAIL_CHARS] + "...[truncated]"
    return text


def _safe_report_title(value: str) -> str:
    text = " ".join(value.split())
    if len(text) > MAX_ERROR_REPORT_TITLE_CHARS:
        return text[:MAX_ERROR_REPORT_TITLE_CHARS].rstrip() + "..."
    return text


def _public_job_response(job: Job) -> JobResponse:
    response = JobResponse.model_validate(job)
    if response.error:
        response.error = USER_SYSTEM_ERROR_MESSAGE
    return response


async def _optional_current_user(request: Request, db: AsyncSession) -> User | None:
    access_token = request.cookies.get("autoclip_access")
    auth_header = request.headers.get("authorization", "")
    if not access_token and auth_header.lower().startswith("bearer "):
        access_token = auth_header.split(" ", 1)[1].strip()
    if not access_token:
        return None

    return User(
        id=1,
        username="local_admin",
        role="admin",
        is_active=True,
    )

def _normalize_project_stage(stage: str | None, fallback: str = "idea") -> str:
    if isinstance(stage, str) and stage in PROJECT_STAGE_VALUES:
        return stage
    return fallback


def _derive_project_title(text: str | None) -> str | None:
    if not isinstance(text, str):
        return None
    compact = " ".join(text.split())
    if not compact:
        return None
    return compact[:200]


async def _sync_project_for_job(
    db: AsyncSession,
    job: Job,
    *,
    stage: str,
    last_known_props: dict[str, Any] | None = None,
    active_job_id: str | None | object = _UNCHANGED,
) -> None:
    if not job.project_id:
        return

    project = (await db.execute(select(Project).where(Project.id == job.project_id))).scalar_one_or_none()
    if project is None:
        return

    project.stage = _normalize_project_stage(stage, project.stage or "idea")
    if active_job_id is not _UNCHANGED:
        project.active_job_id = active_job_id if isinstance(active_job_id, str) or active_job_id is None else project.active_job_id
    if last_known_props is not None:
        project.last_known_props = last_known_props
        ai_title = last_known_props.get('title') if isinstance(last_known_props, dict) else None
        if ai_title and not project.title:
            project.title = ai_title


def _thumbnail_download_url(job_id: str) -> str:
    """Return the authenticated URL to download the job thumbnail."""
    return f"/api/jobs/{job_id}/thumbnail"


def _get_signed_file_url(relative_path: str) -> str:
    """Generate a signed URL for a file served via the proxy endpoint."""
    token = generate_signed_url_token(relative_path)
    return f"/api/files/{relative_path}?token={token}"


def _video_output_path(job_id: str) -> Path:
    return Path(OUTPUT_DIR) / job_id / "final.mp4"


def _thumbnail_output_path(job_id: str) -> Path:
    return Path(OUTPUT_DIR) / job_id / "thumbnail.jpg"


def _ensure_thumbnail(job_id: str) -> str | None:
    thumbnail_path = _thumbnail_output_path(job_id)
    if thumbnail_path.exists() and thumbnail_path.stat().st_size > 0:
        return _thumbnail_download_url(job_id)

    video_path = _video_output_path(job_id)
    if not video_path.exists():
        return None

    from app.pipeline.nodes.rendering.thumbnail import extract_thumbnail

    generated = extract_thumbnail(video_path, thumbnail_path)
    return _thumbnail_download_url(job_id) if generated else None


def _scene_poster_output_path(job_id: str, scene_index: int) -> Path:
    return Path(OUTPUT_DIR) / job_id / "media" / f"scene_{scene_index}_poster.jpg"


def _scene_poster_download_url(job_id: str, scene_index: int) -> str:
    """Return a signed URL for a specific scene's poster image."""
    rel_path = f"{job_id}/media/scene_{scene_index}_poster.jpg"
    return _get_signed_file_url(rel_path)


def _resolve_scene_local_video_path(job_id: str, scene: dict, media_url: str) -> Path | None:
    """Resolve local filesystem path for a scene video when possible."""
    candidates: list[Path] = []

    # Clean URL (remove query params like ?token=...)
    raw_media_url = media_url.split("?", 1)[0]
    
    # Check legacy prefix
    legacy_prefix = f"/api/outputs/{job_id}/"
    # Check new signed prefix
    signed_prefix = "/api/files/"

    if raw_media_url:
        media_path = Path(raw_media_url)
        if media_path.is_absolute() and media_path.exists():
            candidates.append(media_path)
        elif raw_media_url.startswith(legacy_prefix):
            relative_path = raw_media_url[len(legacy_prefix):]
            candidates.append(Path(OUTPUT_DIR) / job_id / relative_path)
        elif raw_media_url.startswith(signed_prefix):
            # Signed URLs use the path directly after /api/files/
            relative_path = raw_media_url[len(signed_prefix):]
            # Try matching as relative to OUTPUT_DIR
            candidates.append(Path(OUTPUT_DIR) / relative_path)
            # Try matching as relative to REMOTION_DIR/public
            candidates.append(Path(REMOTION_DIR) / "public" / relative_path)

    preview_url = str(scene.get("_preview_url") or "").split("?", 1)[0]
    if preview_url.startswith(legacy_prefix):
        relative_preview = preview_url[len(legacy_prefix):]
        candidates.append(Path(OUTPUT_DIR) / job_id / relative_preview)
    elif preview_url.startswith(signed_prefix):
        relative_preview = preview_url[len(signed_prefix):]
        candidates.append(Path(OUTPUT_DIR) / relative_preview)
        candidates.append(Path(REMOTION_DIR) / "public" / relative_preview)

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate

    return None


def _sign_props_urls(props: dict | None) -> dict | None:
    """Recursively find and sign local file URLs in video props."""
    if not props:
        return props
    
    import copy
    props = copy.deepcopy(props)
    
    scenes = props.get("scenes", [])
    for scene in scenes:
        for key in ["media_url", "poster_url", "_preview_url", "logo_url", "bg_url"]:
            val = scene.get(key)
            if isinstance(val, str) and val and not val.startswith(("http", "/api/")):
                # It's a local relative path (e.g. assets/jobid/file.png)
                scene[key] = _get_signed_file_url(val)
    
    # Also handle top-level settings (bgm_url, custom_background_url, watermark_logo_url, etc)
    settings = props.get("settings", {})
    if isinstance(settings, dict):
        for key in ["bgm_url", "custom_background_url", "watermark_logo_url", "custom_font_url"]:
            val = settings.get(key)
            if isinstance(val, str) and val and not val.startswith(("http", "/api/")):
                settings[key] = _get_signed_file_url(val)

    return props


def _derive_image_poster_url(scene: dict, media_url: str) -> str | None:
    """Helper to derive poster URL for image scenes."""
    if media_url.startswith(("http://", "https://", "/api/")):
        return media_url
    preview_url = scene.get("_preview_url")
    if isinstance(preview_url, str) and preview_url:
        return preview_url
    if media_url:
        return media_url
    return None


def _derive_video_poster_url(job_id: str, scene_index: int, scene: dict, media_url: str) -> str | None:
    """Helper to derive poster URL for video scenes, potentially extracting a thumbnail."""
    thumbnail = scene.get("thumbnail")
    if isinstance(thumbnail, str) and thumbnail.strip():
        return thumbnail

    if not media_url or media_url.startswith(("http://", "https://")):
        return None

    local_video_path = _resolve_scene_local_video_path(job_id, scene, media_url)
    if local_video_path is None:
        return None

    poster_path = _scene_poster_output_path(job_id, scene_index)
    if poster_path.exists() and poster_path.stat().st_size > 0:
        return _scene_poster_download_url(job_id, scene_index)

    from app.pipeline.nodes.rendering.thumbnail import extract_thumbnail
    generated = extract_thumbnail(local_video_path, poster_path)
    if generated:
        return _scene_poster_download_url(job_id, scene_index)

    return None


def _derive_scene_poster_url(job_id: str, scene_index: int, scene: dict) -> str | None:
    poster_url = scene.get("poster_url")
    if isinstance(poster_url, str) and poster_url.strip():
        return poster_url

    media_type = scene.get("media_type")
    media_url_value = scene.get("media_url")
    media_url = media_url_value if isinstance(media_url_value, str) else ""

    if media_type == "image":
        return _derive_image_poster_url(scene, media_url)
    elif media_type == "video":
        return _derive_video_poster_url(job_id, scene_index, scene, media_url)

    return None



def _ensure_scene_posters(job_id: str, job: Job) -> bool:
    """Backfill poster_url for scene thumbnails so frontend can render static previews."""
    props = job.props
    if not isinstance(props, dict):
        return False

    scenes = props.get("scenes")
    if not isinstance(scenes, list):
        return False

    changed = False
    updated_scenes: list = []

    for idx, raw_scene in enumerate(scenes):
        if not isinstance(raw_scene, dict):
            updated_scenes.append(raw_scene)
            continue

        scene = dict(raw_scene)
        poster_url = _derive_scene_poster_url(job_id, idx, scene)
        if poster_url and scene.get("poster_url") != poster_url:
            scene["poster_url"] = poster_url
            changed = True

        updated_scenes.append(scene)

    if not changed:
        return False

    updated_props = dict(props)
    updated_props["scenes"] = updated_scenes
    job.props = updated_props
    return True


def _extract_bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("authorization")
    if not auth_header:
        return None
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


async def _authenticate_asset_user(
    db: AsyncSession,
    request: Request,
    query_token: str | None,
) -> User:
    # Local tool bypass
    return User(id=1, role="admin", tier="studio")


def _public_share_page_url(share_token: str) -> str:
    return f"/share/{share_token}"


def _public_share_api_url(share_token: str) -> str:
    return f"/api/share/{share_token}"


async def _generate_unique_share_token(db: AsyncSession) -> str:
    for _ in range(8):
        token = secrets.token_urlsafe(12).replace("-", "").replace("_", "")
        token = token[:20]
        exists = (await db.execute(select(Job.id).where(Job.share_token == token))).scalar_one_or_none()
        if exists is None:
            return token

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to generate unique share token",
    )


async def _get_shared_job_or_404(db: AsyncSession, share_token: str) -> Job:
    result = await db.execute(
        select(Job).where(
            Job.share_token == share_token,
            Job.status == "done",
            Job.disabled_at.is_(None),
        )
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared video not found",
        )
    return job


# ══════════════════════════════════════
# AUTH — register / login / me
# ══════════════════════════════════════

async def _build_user_response(user: User, db: AsyncSession) -> UserResponse:
    usage = 0
    limit = 999999
    
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        role=user.highest_role,
        roles=[r.name for r in user.roles],
        permissions=list(user.effective_permissions),
        is_active=user.is_active,
        tier=user.tier or "starter",
        quota_used_month=usage,
        quota_limit=limit,
        created_at=user.created_at,
    )





@router.get("/auth/me", response_model=UserResponse)
async def get_me(user: Annotated[User, Depends(get_current_user)]):
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        roles=["admin"],
        permissions=["*"],
        is_active=True,
        tier="studio",
        quota_used_month=0,
        quota_limit=999999,
        created_at=user.created_at,
    )

@router.patch("/auth/me", response_model=UserResponse)
async def update_me(user: Annotated[User, Depends(get_current_user)]):
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        roles=["admin"],
        permissions=["*"],
        is_active=True,
        tier="studio",
        quota_used_month=0,
        quota_limit=999999,
        created_at=user.created_at,
    )


# ══════════════════════════════════════
# JOBS — create / list / detail
# ══════════════════════════════════════

@router.get(
    "/templates",
    response_model=TemplateListResponse,
    summary="List active video templates",
)
async def list_templates(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Template)
        .where(Template.is_active)
        .order_by(desc(Template.is_system), Template.name.asc())
    )
    templates = result.scalars().all()
    return TemplateListResponse(
        templates=[TemplateResponse.model_validate(t) for t in templates]
    )


@router.get(
    "/templates/{template_slug}",
    response_model=TemplateResponse,
    summary="Get template detail by slug",
)
async def get_template(
    template_slug: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Template).where(
            Template.slug == template_slug,
            Template.is_active,
        )
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    return TemplateResponse.model_validate(template)


@router.post(
    "/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a durable project workspace",
)
async def create_project(
    body: ProjectCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    project = Project(
        id=uuid.uuid4().hex[:12],
        user_id=user.id,
        title=body.title.strip() if isinstance(body.title, str) and body.title.strip() else None,
        stage=_normalize_project_stage(body.stage, "idea"),
        config_draft=body.config_draft,
        script_agent_draft=body.script_agent_draft,
        script_variants=body.script_variants,
        chosen_script=body.chosen_script,
        script_agent_task_id=body.script_agent_task_id,
        script_agent_progress_snapshot=body.script_agent_progress_snapshot,
    )
    db.add(project)
    await db.flush()
    await db.commit()
    await db.refresh(project)
    return ProjectResponse.model_validate(project)


@router.get(
    "/projects",
    response_model=ProjectListResponse,
    summary="List current user's projects",
)
async def list_projects(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    active_only: bool = Query(False, description="Only unfinished projects that can be resumed"),
    stages: str | None = Query(None, description="Comma-separated project stages"),
):
    filters = [Project.user_id == user.id]

    requested_stages: set[str] = set()
    if isinstance(stages, str) and stages.strip():
        requested_stages = {part.strip() for part in stages.split(",") if part.strip()}
        invalid_stages = requested_stages - PROJECT_STAGE_VALUES
        if invalid_stages:
            invalid_values = ", ".join(sorted(invalid_stages))
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Invalid project stages: {invalid_values}",
            )

    if requested_stages:
        filters.append(Project.stage.in_(requested_stages))
    elif active_only:
        filters.append(Project.stage.in_(RESUMABLE_PROJECT_STAGE_VALUES))

    count_q = select(func.count()).select_from(Project).where(*filters)
    total = (await db.execute(count_q)).scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        select(Project)
        .where(*filters)
        .order_by(desc(Project.updated_at))
        .offset(offset)
        .limit(per_page)
    )
    projects = result.scalars().all()

    # Lazy migration: backfill project.title from AI-generated props title for old projects
    needs_commit = False
    for p in projects:
        if not p.title and isinstance(p.last_known_props, dict):
            ai_title = p.last_known_props.get('title')
            if ai_title:
                p.title = ai_title
                needs_commit = True
    if needs_commit:
        await db.commit()

    return ProjectListResponse(
        projects=[ProjectResponse.model_validate(p) for p in projects],
        total=total,
    )


@router.get(
    "/projects/{project_id}",
    response_model=ProjectResponse,
    summary="Get project detail",
)
async def get_project(
    project_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    project = await _get_project_for(db, project_id, user)
    return ProjectResponse.model_validate(project)


@router.patch(
    "/projects/{project_id}",
    response_model=ProjectResponse,
    summary="Update project draft/stage",
)
async def update_project(
    project_id: str,
    body: ProjectUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    project = await _get_project_for(db, project_id, user)
    payload = body.model_dump(exclude_unset=True)

    if "title" in payload:
        raw_title = payload.get("title")
        project.title = raw_title.strip() if isinstance(raw_title, str) and raw_title.strip() else None

    if "stage" in payload:
        project.stage = _normalize_project_stage(payload.get("stage"), project.stage or "idea")

    if "config_draft" in payload:
        project.config_draft = payload.get("config_draft")

    if "script_agent_draft" in payload:
        project.script_agent_draft = payload.get("script_agent_draft")

    if "script_variants" in payload:
        project.script_variants = payload.get("script_variants")

    if "chosen_script" in payload:
        project.chosen_script = payload.get("chosen_script")

    if "script_agent_task_id" in payload:
        project.script_agent_task_id = payload.get("script_agent_task_id")

    if "script_agent_progress_snapshot" in payload:
        project.script_agent_progress_snapshot = payload.get("script_agent_progress_snapshot")

    if "active_job_id" in payload:
        project.active_job_id = payload.get("active_job_id")

    if "last_known_props" in payload:
        project.last_known_props = payload.get("last_known_props")

    await db.commit()
    await db.refresh(project)
    return ProjectResponse.model_validate(project)


@router.post("/jobs", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    body: JobCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    background_tasks: BackgroundTasks,
):
    project: Project | None = None

    # Check per-user queued/running pipeline limit (admins are exempt)
    if user.role != "admin":
        _active = (await db.execute(
            select(func.count(Job.id)).where(
                Job.user_id == user.id,
                Job.status.in_(_QUEUED_PIPELINE_STATUSES),
            )
        )).scalar() or 0
        if _active >= MAX_CONCURRENT_PIPELINE_JOBS_PER_USER:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Bạn đang có {_active} video đang chờ hoặc đang xử lý. "
                    "Vui lòng chờ một video hoàn tất trước khi tạo thêm."
                ),
            )

    # Validate input: need either script text or script_request
    if not body.input_text and not body.script_request:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either input_text (script) or script_request (topic-based generation)",
        )
    if body.input_text and len(body.input_text) < 10 and not body.script_request:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="input_text must be at least 10 characters",
        )

    if body.project_id:
        project = await _get_project_for(db, body.project_id, user)

    job_id = uuid.uuid4().hex[:12]

    settings_dict = body.settings.model_dump() if body.settings else {}
    if body.template_slug:
        template_row = await db.execute(
            select(Template).where(
                Template.slug == body.template_slug,
                Template.is_active,
            )
        )
        template = template_row.scalar_one_or_none()
        if template is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found",
            )
        template_settings = template.settings if isinstance(template.settings, dict) else {}
        settings_dict = {**template_settings, **settings_dict}
        settings_dict["template_slug"] = template.slug

    if body.skip_review is not None:
        settings_dict["skip_review"] = body.skip_review
    logger.info(
        "Create job request: top_level_skip_review={} normalized_skip_review={} agentic_only=true",
        body.skip_review,
        settings_dict.get("skip_review", False),
    )

    # input_text for DB: script text if provided, else placeholder
    input_text_for_db = body.input_text if body.input_text else f"[topic: {body.script_request.topic}]"

    job = Job(
        id=job_id,
        user_id=user.id,
        status="pending",
        input_text=input_text_for_db,
        settings=settings_dict,
        project_id=project.id if project else None,
    )
    db.add(job)

    if project is not None:
        project.config_draft = {
            "text": body.input_text or (project.chosen_script or ""),
            "settings": settings_dict,
        }
        if body.input_text:
            project.chosen_script = body.input_text
        if body.script_request:
            project.script_agent_draft = body.script_request.model_dump()
        project.active_job_id = job_id
        project.stage = "processing"
        if not project.title:
            project.title = _derive_project_title(body.input_text) or _derive_project_title(input_text_for_db)

    # Track usage for quota enforcement
    db.add(UsageRecord(
        user_id=user.id,
        action="create_job",
        created_at=datetime.now(timezone.utc),
    ))

    await db.flush()  # Populate job fields
    await db.commit()  # Commit NOW so background task can find the job

    # Launch pipeline — strictly use in-process background task for local tool.
    _script_request_dict = body.script_request.model_dump() if body.script_request else None

    background_tasks.add_task(
            _run_agentic_pipeline_background,
            job_id=job_id,
            user_id=user.id,
            text=body.input_text or "",
            script_request=body.script_request,
            settings=settings_dict,
        )

    return _public_job_response(job)


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    status_filter: str | None = Query(
        None, alias="status",
        description="Filter by job status (pending, processing, review, rendering, done, failed)",
    ),
):
    # Base filter
    filters = [Job.user_id == user.id, Job.disabled_at.is_(None)]
    if status_filter:
        filters.append(Job.status == status_filter)

    # Count total
    count_q = select(func.count()).select_from(Job).where(*filters)
    total = (await db.execute(count_q)).scalar() or 0

    # Fetch page
    offset = (page - 1) * per_page
    result = await db.execute(
        select(Job)
        .where(*filters)
        .order_by(desc(Job.created_at))
        .offset(offset)
        .limit(per_page)
    )
    jobs = result.scalars().all()
    # Sign URLs only in the response copy — not on ORM objects
    job_responses = []
    for job in jobs:
        resp = _public_job_response(job)
        resp.props = _sign_props_urls(resp.props)
        job_responses.append(resp)
        
    return JobListResponse(
        jobs=job_responses,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/jobs/stream", summary="SSE — user-level job event stream", include_in_schema=False)
async def user_job_stream(
    request: Request,
    token: str | None = Query(None, description="JWT fallback for SSE"),
):
    """SSE stream for significant job events (done/review_ready/failed).

    Used by Dashboard and Admin to auto-refresh without polling.
    Auth mirrors /jobs/{job_id}/progress: cookie or ?token= query param.
    """
    from api.database import SessionLocal

    async with SessionLocal() as db:
        user_id = 1

    return StreamingResponse(
        subscribe_user(user_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_job_for(db, job_id, user)
    if _ensure_scene_posters(job_id, job):
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(job, "props")
        await db.commit()
    # Sign URLs only for the response — never mutate the ORM object
    # to prevent signed URLs from leaking into the DB on commit.
    response_job = _public_job_response(job)
    response_job.props = _sign_props_urls(response_job.props)
    return response_job





def _cleanup_job_artifacts(job_id: str) -> None:
    """Remove generated output assets for a job if they exist."""
    job_dir = Path(OUTPUT_DIR) / job_id
    if job_dir.exists():
        shutil.rmtree(str(job_dir), ignore_errors=True)

    remotion_assets = Path(OUTPUT_DIR) / job_id / "assets"
    if remotion_assets.exists():
        shutil.rmtree(str(remotion_assets), ignore_errors=True)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    project = await _get_project_for(db, project_id, user)

    jobs = (
        await db.execute(
            select(Job).where(Job.project_id == project.id)
        )
    ).scalars().all()

    for job in jobs:
        _cleanup_job_artifacts(job.id)
        job.disabled_at = datetime.now(timezone.utc)

    await db.delete(project)
    await db.commit()
    return None


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_job_for(db, job_id, user)

    if job.project_id:
        project = (await db.execute(select(Project).where(Project.id == job.project_id))).scalar_one_or_none()
        if project is not None and project.active_job_id == job.id:
            project.active_job_id = None
            if project.stage in {"processing", "review", "rendering", "failed"}:
                project.stage = "config"

    # Bỏ chặn xóa video đang xử lý để user có thể xóa các video bị kẹt (orphaned jobs) do server sập.
    # if job.status in ("processing", "rendering"):
    #     raise HTTPException(
    #         status_code=status.HTTP_409_CONFLICT,
    #         detail=f"Cannot delete job while it is {job.status}",
    #     )

    _cleanup_job_artifacts(job_id)

    job.disabled_at = datetime.now(timezone.utc)
    await db.commit()
    return None


# ══════════════════════════════════════
# SSE — real-time progress stream
# ══════════════════════════════════════

@router.get(
    "/jobs/{job_id}/progress",
    summary="SSE progress stream",
)
async def job_progress(
    job_id: str,
    request: Request,
    token: str | None = Query(None, description="JWT fallback for SSE"),
):
    """Server-Sent Events stream for job progress.

    Priority:
    1. autoclip_access Cookie
    2. ?token= Query parameter (EventSource fallback)

    Uses a temporary DB session for auth check.
    """
    from api.database import SessionLocal

    async with SessionLocal() as db:
        # Local tool bypasses JWT validation
        user = User(id=1, role="admin", tier="studio")
        # Admin can watch any job; regular user only their own
        await _get_job_for(db, job_id, user)
    # ← db session closed here, BEFORE SSE stream starts

    return StreamingResponse(
        sse_subscribe(job_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ══════════════════════════════════════
# DOWNLOAD — serve final MP4
# ══════════════════════════════════════

@router.get(
    "/jobs/{job_id}/download",
    summary="Download final video MP4",
)
async def download_video(
    job_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_job_for(db, job_id, user)

    if job.status != "done":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job is not complete (status: {job.status})",
        )

    video_path = Path(OUTPUT_DIR) / job_id / "final.mp4"
    if not video_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video file not found",
        )

    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=f"autoclip_{job_id}.mp4",
    )


@router.get(
    "/jobs/{job_id}/thumbnail",
    summary="Download generated thumbnail image",
)
async def download_thumbnail(
    job_id: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    token: str | None = Query(
        None,
        description="JWT for image tags that cannot send Authorization header",
    ),
):
    user = await _authenticate_asset_user(db, request, token)
    await _get_job_for(db, job_id, user)

    thumbnail_path = _thumbnail_output_path(job_id)
    if not thumbnail_path.exists() or thumbnail_path.stat().st_size == 0:
        generated_url = _ensure_thumbnail(job_id)
        if not generated_url:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Thumbnail not found",
            )

    return FileResponse(
        path=str(thumbnail_path),
        media_type="image/jpeg",
        filename=f"autoclip_{job_id}.jpg",
    )


@router.post(
    "/jobs/{job_id}/share",
    response_model=ShareLinkResponse,
    summary="Create or get public share link",
)
async def create_share_link(
    job_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_job_for(db, job_id, user)
    if job.status != "done":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only completed jobs can be shared",
        )

    if not job.share_token:
        job.share_token = await _generate_unique_share_token(db)
        await db.commit()

    share_token = job.share_token
    assert share_token is not None
    return ShareLinkResponse(
        share_token=share_token,
        share_url=_public_share_page_url(share_token),
        api_url=_public_share_api_url(share_token),
    )


@router.delete(
    "/jobs/{job_id}/share",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Disable public share link",
)
async def delete_share_link(
    job_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_job_for(db, job_id, user)
    job.share_token = None
    await db.commit()
    return None


@router.get(
    "/share/{share_token}",
    response_model=PublicShareResponse,
    summary="Public shared-video metadata",
)
async def get_public_share(
    share_token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_shared_job_or_404(db, share_token)

    job.share_views = int(job.share_views or 0) + 1
    await db.commit()

    props = job.props if isinstance(job.props, dict) else {}
    title = str(props.get("title") or "AutoClip Video")

    thumbnail_path = _thumbnail_output_path(job.id)
    if not thumbnail_path.exists() or thumbnail_path.stat().st_size == 0:
        _ensure_thumbnail(job.id)

    return PublicShareResponse(
        job_id=job.id,
        title=title,
        status=job.status,
        video_url=f"/api/share/{share_token}/video",
        thumbnail_url=f"/api/share/{share_token}/thumbnail" if thumbnail_path.exists() else None,
        share_views=job.share_views,
        created_at=job.created_at,
    )


@router.get(
    "/share/{share_token}/video",
    summary="Public shared-video file",
)
async def get_public_share_video(
    share_token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_shared_job_or_404(db, share_token)
    video_path = _video_output_path(job.id)
    if not video_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video file not found",
        )
    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=f"autoclip_{job.id}.mp4",
    )


@router.get(
    "/share/{share_token}/thumbnail",
    summary="Public shared-video thumbnail",
)
async def get_public_share_thumbnail(
    share_token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_shared_job_or_404(db, share_token)
    thumbnail_path = _thumbnail_output_path(job.id)
    if not thumbnail_path.exists() or thumbnail_path.stat().st_size == 0:
        generated_url = _ensure_thumbnail(job.id)
        if not generated_url:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Thumbnail not found",
            )
    return FileResponse(
        path=str(thumbnail_path),
        media_type="image/jpeg",
        filename=f"autoclip_{job.id}.jpg",
    )


# ══════════════════════════════════════
# TTS — voice preview
# ══════════════════════════════════════

@router.post(
    "/tts/preview",
    summary="Preview TTS voice — returns audio stream",
)
async def preview_voice(
    body: VoicePreviewRequest,
    user: Annotated[User, Depends(get_current_user)],
):
    """Synthesize the first ~50 words with chosen voice/rate, return audio."""
    # Extract first sentence or ~50 words
    sample_text = _extract_sample(body.text, max_words=50)

    try:
        from app.pipeline.nodes.audio.synthesizer import get_tts_engine

        engine = get_tts_engine(body.engine)
        result = await engine.synthesize(
            text=sample_text,
            voice=body.voice,
            rate=body.rate,
        )

        return StreamingResponse(
            io.BytesIO(result.audio_bytes),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=preview.mp3"},
        )
    except Exception as e:
        logger.error(f"TTS preview failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"TTS preview failed: {str(e)}",
        )


# ══════════════════════════════════════
# BGM — library + upload custom background music
# ══════════════════════════════════════

_ALLOWED_BGM_TYPES = {"audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/mp3"}
_MAX_BGM_SIZE = 10 * 1024 * 1024  # 10 MB


@router.get(
    "/bgm/library",
    summary="List built-in BGM tracks",
)
async def list_bgm_library(
    user: Annotated[User, Depends(get_current_user)],
):
    from app.pipeline.nodes.rendering.bgm import list_bgm_tracks

    return {"tracks": list_bgm_tracks()}


@router.get(
    "/bgm/library/{track_id}/file",
    summary="Download/preview built-in BGM track",
)
async def get_bgm_library_file(
    track_id: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    token: str | None = Query(
        None,
        description="JWT for direct audio tag access",
    ),
):
    await _authenticate_asset_user(db, request, token)

    from app.pipeline.nodes.rendering.bgm import resolve_bgm_track_path

    track_path = resolve_bgm_track_path(track_id)
    if track_path is None or not track_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="BGM track not found",
        )

    return FileResponse(
        path=str(track_path),
        media_type="audio/wav",
        filename=track_path.name,
    )


@router.get(
    "/files/{file_path:path}",
    summary="Securely serve protected asset files via signed URLs",
)
async def serve_signed_file(
    file_path: str,
    token: str = Query(..., description="Signed URL token"),
):
    """
    Proxy endpoint to serve files from OUTPUT_DIR and REMOTION_DIR/public/assets
    only if a valid signature is provided.
    """
    # Verify signature
    if not verify_signed_url_token(file_path, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or expired signed URL",
        )

    # Resolve actual file path. 
    # We check OUTPUT_DIR first, then REMOTION_DIR/public/assets.
    # Security: path traversal is prevented by verify_signed_url_token 
    # because it checks the exact path that was signed.
    
    # Try output dir first
    target_path = Path(OUTPUT_DIR) / file_path
    if not target_path.exists():
        # Try remotion assets
        target_path = Path(REMOTION_DIR) / "public" / file_path
        
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    # Determine media type
    ext = target_path.suffix.lower()
    content_type = "application/octet-stream"
    if ext in (".jpg", ".jpeg"): content_type = "image/jpeg"
    elif ext == ".png": content_type = "image/png"
    elif ext == ".webp": content_type = "image/webp"
    elif ext == ".mp4": content_type = "video/mp4"
    elif ext == ".webm": content_type = "video/webm"
    elif ext == ".mp3": content_type = "audio/mpeg"
    elif ext == ".wav": content_type = "audio/wav"

    return FileResponse(path=str(target_path), media_type=content_type)


@router.post(
    "/bgm/upload",
    summary="Upload custom BGM (≤ 10MB, mp3/wav/m4a)",
)
async def upload_bgm(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    # Validate content type
    if file.content_type and file.content_type not in _ALLOWED_BGM_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio type: {file.content_type}. Allowed: mp3, wav, m4a",
        )

    # Validate file extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".mp3", ".wav", ".m4a"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension: {ext}. Allowed: .mp3, .wav, .m4a",
        )

    # Streaming write — never load entire file into RAM
    bgm_dir = Path(OUTPUT_DIR) / "bgm"
    bgm_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{user.id}_{uuid.uuid4().hex[:8]}{ext}"
    dest = bgm_dir / filename

    total_size = 0
    try:
        with dest.open("wb") as buffer:
            while chunk := await file.read(8192):
                total_size += len(chunk)
                if total_size > _MAX_BGM_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File too large (>{_MAX_BGM_SIZE // (1024*1024)}MB). Max: 10MB.",
                    )
                buffer.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    except Exception:
        dest.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save uploaded file.",
        )

    # Return rel_path (for DB/render) + signed URL (for frontend preview)
    rel_path = f"bgm/{filename}"
    return {
        "filename": filename,
        "url": _get_signed_file_url(rel_path),
        "rel_path": rel_path,
        "size_bytes": total_size,
    }


# ══════════════════════════════════════
# Health check (enhanced)
# ══════════════════════════════════════

@router.get("/health", summary="Health check")
async def health():
    from api.database import DATABASE_URL as _db_url
    db_type = "postgresql" if "postgresql" in _db_url else "sqlite"
    return {
        "status": "ok",
        "version": "0.2.0",
        "services": {"api": "online", "database": db_type},
    }


# ══════════════════════════════════════
# Helpers
# ══════════════════════════════════════

async def _get_user_job(db: AsyncSession, job_id: str, user_id: int) -> Job:
    """Fetch a job by owner. Raises 404 if not found or wrong owner."""
    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.user_id == user_id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return job


async def _get_job_for(db: AsyncSession, job_id: str, user: User) -> Job:
    """Fetch a job scoped by ownership. Admin/SuperAdmin bypasses ownership check via permissions."""
        
    if user.role == "admin":
        result = await db.execute(
            select(Job).where(Job.id == job_id, Job.disabled_at.is_(None))
        )
    else:
        result = await db.execute(
            select(Job).where(
                Job.id == job_id, 
                Job.user_id == user.id,
                Job.disabled_at.is_(None)
            )
        )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return job


async def _create_notification(
    db: AsyncSession,
    user_id: int,
    title: str,
    message: str | None = None,
    notif_type: str = "info",
    action_url: str | None = None,
):
    """Create a persistent notification and broadcast it via SSE."""
    notif = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=notif_type,
        action_url=action_url,
    )
    db.add(notif)
    await db.commit()

    # Broadcast real-time event
    await broadcast_user_event(user_id, "notification", {
        "id": notif.id,
        "title": title,
        "message": message,
        "type": notif_type,
        "action_url": action_url,
        "created_at": notif.created_at.isoformat(),
    })
    return notif


async def _get_project_for(db: AsyncSession, project_id: str, user: User) -> Project:
    """Fetch a project scoped by ownership. Admins can access any project."""
    
    if user.role == "admin":
        result = await db.execute(select(Project).where(Project.id == project_id))
    else:
        result = await db.execute(
            select(Project).where(Project.id == project_id, Project.user_id == user.id)
        )

    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


def _extract_sample(text: str, max_words: int = 50) -> str:
    """Extract first sentence or ~max_words words from text."""
    # Try first sentence
    for sep in [".", "!", "?", "。"]:
        idx = text.find(sep)
        if 0 < idx < 200:
            return text[: idx + 1].strip()

    # Fallback: first N words
    words = text.split()
    return " ".join(words[:max_words])


async def _openai_tts_preview(text: str, voice: str, rate: float) -> bytes:
    """Generate TTS audio using OpenAI gpt-4o-mini-tts."""
    from app.pipeline.nodes._openai_client import get_openai_client

    client = get_openai_client()

    response = await client.audio.speech.create(
        model="gpt-4o-mini-tts",
        voice=voice,
        input=text,
        speed=rate,
        response_format="mp3",
    )

    return response.content


async def _edge_tts_preview(text: str, voice: str, rate: float) -> bytes:
    """Generate TTS audio using Edge-TTS (free fallback)."""
    import edge_tts

    # Edge-TTS rate format: "+20%" or "-10%"
    rate_pct = int((rate - 1.0) * 100)
    rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"

    communicate = edge_tts.Communicate(text, voice, rate=rate_str)

    audio_chunks = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_chunks.append(chunk["data"])

    return b"".join(audio_chunks)


def _init_agent_settings(settings: dict) -> "AgentJobSettings":
    """Initialize AgentJobSettings from request settings dict."""
    from app.state import AgentJobSettings
    return AgentJobSettings(
        tts_engine=settings.get("tts_engine", "openai"),
        voice=settings.get("voice", "nova"),
        speech_rate=settings.get("speech_rate", 1.0),
        aspect_ratio=settings.get("aspect_ratio", "9:16"),
        transition_mode=settings.get("transition_mode", "crossfade"),
        bgm_mode=settings.get("bgm_mode", "none"),
        bgm_library_id=settings.get("bgm_library_id"),
        bgm_url=settings.get("bgm_url"),
        bgm_volume=settings.get("bgm_volume", 0.2),
        subtitle_enabled=settings.get("subtitle_enabled", True),
        subtitle_font=settings.get("subtitle_font", "NotoSansVN-Bold"),
        subtitle_font_size=settings.get("subtitle_font_size", 48),
        subtitle_font_color=settings.get("subtitle_font_color", "#FFFFFF"),
        subtitle_highlight_color=settings.get("subtitle_highlight_color", "#FF6B35"),
        subtitle_stroke_color=settings.get("subtitle_stroke_color", "#000000"),
        subtitle_stroke_width=int(settings.get("subtitle_stroke_width", 2)),
        subtitle_position=settings.get("subtitle_position", "bottom"),
        skip_review=settings.get("skip_review", False),
    )


def _init_agent_state(job_id: str, user_id: int, text: str, script_request: Any, settings: "AgentJobSettings") -> "AgentState":
    """Initialize AgentState based on input mode (topic or script)."""
    from app.state import AgentState, ScriptAgentRequest
    if script_request:
        sr = ScriptAgentRequest(
            topic=script_request.topic,
            audience=script_request.audience,
            tone=script_request.tone,
            duration_seconds=script_request.duration_seconds,
            language=script_request.language,
            format=script_request.format,
            reference_urls=script_request.reference_urls,
            reference_text=script_request.reference_text,
            must_include=script_request.must_include,
            n_variants=script_request.n_variants,
        )
        return AgentState(
            job_id=job_id,
            user_id=user_id,
            user_input_mode="topic",
            script_request=sr,
            settings=settings,
        )
    else:
        return AgentState(
            job_id=job_id,
            user_id=user_id,
            user_input_mode="script",
            user_input=text,
            settings=settings,
        )


CREATE_PROCESSING_PLAN: list[tuple[str, str]] = [
    ("validate_input", "Kiểm tra đầu vào"),
    ("parse_scenes", "Chia kịch bản thành cảnh"),
    ("direct_scenes", "Chọn phong cách và bố cục cảnh"),
    ("enrich_visuals", "Bổ sung mô tả và truy vấn media"),
    ("synthesize_tts", "Tổng hợp TTS"),
    ("align_words", "Căn chữ theo audio"),
    ("search_media", "Tìm media cho các cảnh"),
    ("media_fallback", "Đánh giá media và fallback"),
    ("scene_timing", "Căn thời lượng cảnh"),
    ("ready_review", "Sẵn sàng kiểm tra"),
]

CREATE_PROCESSING_WEIGHTS: dict[str, float] = {
    "validate_input": 0.5,
    "parse_scenes": 1.0,
    "direct_scenes": 1.0,
    "enrich_visuals": 1.2,
    "synthesize_tts": 1.2,
    "align_words": 0.8,
    "search_media": 2.0,
    "media_fallback": 0.9,
    "scene_timing": 0.8,
    "ready_review": 0.6,
}

RENDER_PLAN: list[tuple[str, str]] = [
    ("stage_assets", "Chuẩn bị tài nguyên render"),
    ("render_frames", "Kết xuất video"),
    ("finish_video", "Hoàn tất video"),
]

RENDER_WEIGHTS: dict[str, float] = {
    "stage_assets": 1.0,
    "render_frames": 4.0,
    "finish_video": 0.6,
}

SCRIPT_AGENT_PLAN: list[tuple[str, str]] = [
    ("analyze_topic", "Phân tích chủ đề"),
    ("research", "Thu thập tài liệu tham khảo"),
    ("outline", "Lập dàn ý"),
    ("draft", "Viết bản nháp"),
    ("refine", "Tinh chỉnh kịch bản"),
    ("variants", "Tạo thêm phiên bản"),
    ("ready", "Sẵn sàng chọn kịch bản"),
]

SCRIPT_AGENT_WEIGHTS: dict[str, float] = {
    "analyze_topic": 0.6,
    "research": 1.2,
    "outline": 1.0,
    "draft": 1.5,
    "refine": 1.2,
    "variants": 1.3,
    "ready": 0.5,
}


def _clamp_progress(progress: float) -> float:
    return max(0.0, min(1.0, progress))


def _compute_progress(
    plan: list[tuple[str, str]],
    done_steps: set[str],
    current_step: str | None,
    weights: dict[str, float],
    progress_hint: float | None,
    status: str,
) -> float:
    if status == "done":
        return 1.0
    if progress_hint is not None:
        return _clamp_progress(progress_hint)

    total_weight = sum(weights.get(step_key, 1.0) for step_key, _ in plan)
    if total_weight <= 0:
        return 0.0

    done_weight = sum(
        weights.get(step_key, 1.0)
        for step_key, _ in plan
        if step_key in done_steps
    )
    current_weight = 0.0
    if current_step and current_step not in done_steps:
        current_weight = 0.35 * weights.get(current_step, 1.0)

    return _clamp_progress((done_weight + current_weight) / total_weight)


def _build_execution_plan(
    plan: list[tuple[str, str]],
    done_steps: set[str],
    current_step: str | None,
    status: str = "running",
) -> list[ProgressPlanStep]:
    steps: list[ProgressPlanStep] = []
    for step_key, label in plan:
        step_status = "pending"
        if step_key in done_steps:
            step_status = "done"
        elif status == "error" and current_step == step_key:
            step_status = "error"
        elif current_step == step_key:
            step_status = "active"
        steps.append(ProgressPlanStep(key=step_key, label=label, status=step_status))
    return steps


def _build_progress_snapshot(
    *,
    phase: str,
    plan: list[tuple[str, str]],
    done_steps: set[str],
    current_step: str | None,
    active_tool: str | None,
    intermediate_results: list[str],
    started_at_monotonic: float,
    progress: float,
    status: str,
) -> ProgressSnapshot:
    index_map = {step_key: idx + 1 for idx, (step_key, _) in enumerate(plan)}
    step_count = len(plan)

    if status == "done":
        step_index = step_count
    elif current_step and current_step in index_map:
        step_index = index_map[current_step]
    else:
        step_index = min(step_count, len(done_steps))

    elapsed_seconds = int(max(0.0, time.monotonic() - started_at_monotonic))
    remaining_steps = max(0, step_count - step_index)

    eta_seconds: int | None
    if status in ("done", "error", "needs_human"):
        eta_seconds = None
    elif progress > 0.05 and elapsed_seconds > 0:
        eta_seconds = max(2, int((elapsed_seconds * (1 - progress)) / progress))
    else:
        eta_seconds = max(4, remaining_steps * 8) if remaining_steps > 0 else 4

    current_label = next((label for key, label in plan if key == current_step), "Đang xử lý")

    return ProgressSnapshot(
        phase=phase,
        current_step=current_label,
        execution_plan=_build_execution_plan(plan, done_steps, current_step, status),
        active_tool=active_tool,
        intermediate_results=intermediate_results[-5:],
        step_index=step_index,
        step_count=step_count,
        elapsed_seconds=elapsed_seconds,
        eta_seconds=eta_seconds,
        status=status,
    )


def _make_progress_tracker(
    *,
    phase: str,
    plan: list[tuple[str, str]],
    weights: dict[str, float],
    started_at_monotonic: float,
):
    done_steps: set[str] = set()
    current_step: str | None = None
    active_tool: str | None = None
    intermediate_results: list[str] = []

    async def emit_update(payload: dict[str, Any]) -> tuple[ProgressSnapshot, float, str, str | None]:
        nonlocal current_step, active_tool

        step_key = payload.get("step_key")
        if isinstance(step_key, str) and step_key:
            current_step = step_key

        tool_name = payload.get("tool_name")
        if isinstance(tool_name, str) and tool_name:
            active_tool = tool_name

        if payload.get("mark_done") and current_step:
            done_steps.add(current_step)

        result_text = payload.get("intermediate_result")
        if isinstance(result_text, str) and result_text.strip():
            intermediate_results.append(result_text.strip())
            if len(intermediate_results) > 5:
                del intermediate_results[:-5]

        status = payload.get("status") or "running"
        message = payload.get("message") or "Đang xử lý..."
        progress_hint = payload.get("progress")
        progress = _compute_progress(
            plan=plan,
            done_steps=done_steps,
            current_step=current_step,
            weights=weights,
            progress_hint=progress_hint if isinstance(progress_hint, (int, float)) else None,
            status=status,
        )

        snapshot = _build_progress_snapshot(
            phase=phase,
            plan=plan,
            done_steps=done_steps,
            current_step=current_step,
            active_tool=active_tool,
            intermediate_results=intermediate_results,
            started_at_monotonic=started_at_monotonic,
            progress=progress,
            status=status,
        )
        return snapshot, progress, message, current_step

    return emit_update


def _fallback_step_for_stage(stage_name: str | None) -> str | None:
    return {
        "validator": "validate_input",
        "content": "parse_scenes",
        "tts": "synthesize_tts",
        "media": "search_media",
        "timing": "scene_timing",
        "render": "render_frames",
    }.get(stage_name or "")


def _pipeline_error_metadata(exc: Exception, step_key: str | None) -> tuple[str, str | None]:
    stage_name = getattr(exc, "stage_name", None)
    failure_step = step_key or _fallback_step_for_stage(stage_name) or "agentic_pipeline"
    return failure_step, stage_name




async def _run_agentic_pipeline_background(
    job_id: str,
    user_id: int,
    text: str,
    script_request,
    settings: dict,
) -> None:
    from api.database import SessionLocal
    from app.pipeline.graph import run_agentic_chain
    from app.progress import use_progress_emitter
    from app.state import AgentState

    async with SessionLocal() as db:
        started_at = time.monotonic()
        tracker = _make_progress_tracker(
            phase="create_processing",
            plan=CREATE_PROCESSING_PLAN,
            weights=CREATE_PROCESSING_WEIGHTS,
            started_at_monotonic=started_at,
        )

        async def _emit_job_progress(payload: dict[str, Any]) -> ProgressSnapshot:
            snapshot, progress, message, step_key = await tracker(payload)
            await broadcast_progress(job_id, ProgressEvent(
                event="progress",
                step=step_key,
                progress=progress,
                message=message,
                progress_snapshot=snapshot,
                job_id=job_id,
            ))
            return snapshot

        try:
            job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
            job.status = "processing"
            await _sync_project_for_job(db, job, stage="processing", active_job_id=job.id)
            await db.commit()

            await _emit_job_progress({
                "step_key": "validate_input",
                "message": "Đang khởi tạo pipeline tạo nội dung...",
                "tool_name": "Pipeline Runner",
                "progress": 0.02,
            })

            agent_settings = _init_agent_settings(settings)
            initial = _init_agent_state(job_id, user_id, text, script_request, agent_settings)

            skip_review_flag = settings.get("skip_review", False)
            async def _pipeline_progress(payload: dict[str, Any]) -> None:
                await _emit_job_progress(payload)

            with use_progress_emitter(_pipeline_progress):
                final_state = await run_agentic_chain(
                    initial,
                    render=bool(skip_review_flag),
                )

            final_state = final_state if isinstance(final_state, AgentState) else AgentState.model_validate(final_state)

            if final_state.needs_human:
                # Save state to DB for continuation
                job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
                job.status = "needs_human"
                job.pipeline_logs = final_state.model_dump(mode="json")
                await _sync_project_for_job(db, job, stage="idea", active_job_id=job.id)
                await db.commit()

                scripts_payload = None
                if final_state.generated_scripts:
                    scripts_payload = [v.model_dump(mode="json") for v in final_state.generated_scripts]

                snapshot = await _emit_job_progress({
                    "step_key": "ready_review",
                    "message": final_state.human_question or "Cần quyết định từ bạn",
                    "status": "needs_human",
                    "intermediate_result": "Pipeline đang chờ xác nhận để tiếp tục.",
                })

                await broadcast_progress(job_id, ProgressEvent(
                    event="needs_human",
                    job_id=job_id,
                    needs_human=True,
                    human_checkpoint_type=final_state.human_checkpoint_type,
                    human_question=final_state.human_question,
                    generated_scripts=scripts_payload,
                    progress=0.5,
                    message=final_state.human_question or "Human input required",
                    progress_snapshot=snapshot,
                ))
                return

            if not skip_review_flag:
                props_data = final_state.video_props
                if not isinstance(props_data, dict):
                    props_file = Path(OUTPUT_DIR) / job_id / "video_props.json"
                    if props_file.exists():
                        props_data = json.loads(props_file.read_text(encoding="utf-8"))

                if isinstance(props_data, dict):
                    job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
                    job.props = props_data
                    job.status = "review"
                    job.pipeline_logs = {
                        "turns": len(final_state.history),
                        "tokens": final_state.total_tokens,
                        "cost": final_state.total_cost_estimate,
                        "qc_scores": final_state.qc_scores,
                        "token_breakdown": [t.model_dump() for t in final_state.token_breakdown],
                        "scene_completed_at": datetime.now(timezone.utc).isoformat(),
                    }
                    await _sync_project_for_job(
                        db,
                        job,
                        stage="review",
                        last_known_props=props_data,
                        active_job_id=job.id,
                    )
                    await db.commit()

                    snapshot = await _emit_job_progress({
                        "step_key": "ready_review",
                        "mark_done": True,
                        "status": "done",
                        "message": "Đã sẵn sàng để bạn kiểm tra cảnh.",
                        "intermediate_result": f"Hoàn tất xử lý {len(props_data.get('scenes', []))} cảnh.",
                    })

                    await broadcast_progress(job_id, ProgressEvent(
                        event="review_ready",
                        progress=1.0,
                        message="Ready for review",
                        props=_sign_props_urls(props_data),
                        job_id=job_id,
                        progress_snapshot=snapshot,
                    ))
                    await broadcast_user_event(job.user_id, "job_review_ready", {
                        "job_id": job_id,
                        "title": job.props.get("title", "") if isinstance(job.props, dict) else "",
                    })
                    return

            if final_state.is_done and final_state.final_mp4_path:
                video_url = f"/api/jobs/{job_id}/download"
                thumbnail_url = _ensure_thumbnail(job_id)
                job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
                if final_state.video_props:
                    job.props = final_state.video_props
                job.status = "done"
                job.video_url = video_url
                job.thumbnail_url = thumbnail_url
                job.completed_at = datetime.now(timezone.utc)
                job.pipeline_logs = {
                    "turns": len(final_state.history),
                    "tokens": final_state.total_tokens,
                    "cost": final_state.total_cost_estimate,
                    "qc_scores": final_state.qc_scores,
                    "token_breakdown": [t.model_dump() for t in final_state.token_breakdown],
                }
                from api.database import UsageRecord
                db.add(UsageRecord(
                    user_id=user_id,
                    action="job_completed",
                    cost_estimate=final_state.total_cost_estimate,
                    created_at=datetime.now(timezone.utc),
                ))
                await _sync_project_for_job(
                    db,
                    job,
                    stage="result",
                    last_known_props=job.props if isinstance(job.props, dict) else None,
                    active_job_id=job.id,
                )
                await db.commit()

                snapshot = await _emit_job_progress({
                    "step_key": "ready_review",
                    "mark_done": True,
                    "status": "done",
                    "message": "Video đã sẵn sàng.",
                    "intermediate_result": "Pipeline đã hoàn tất và xuất video thành công.",
                })

                await broadcast_progress(job_id, ProgressEvent(
                    event="done",
                    job_id=job_id,
                    download_url=video_url,
                    progress=1.0,
                    message="Video ready!",
                    progress_snapshot=snapshot,
                ))
                await broadcast_user_event(job.user_id, "job_done", {
                    "job_id": job_id,
                    "title": job.props.get("title", "") if isinstance(job.props, dict) else "",
                })
            elif not skip_review_flag:
                # Agentic pipeline stopped before render — enter review mode
                import json as _json
                props_file = Path(OUTPUT_DIR) / job_id / "video_props.json"
                if props_file.exists():
                    props_data = _json.loads(props_file.read_text(encoding="utf-8"))
                    job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
                    job.props = props_data
                    job.status = "review"
                    await _sync_project_for_job(
                        db,
                        job,
                        stage="review",
                        last_known_props=props_data,
                        active_job_id=job.id,
                    )
                    await db.commit()
                    snapshot = await _emit_job_progress({
                        "step_key": "ready_review",
                        "mark_done": True,
                        "status": "done",
                        "message": "Đã sẵn sàng để bạn kiểm tra cảnh.",
                        "intermediate_result": f"Hoàn tất xử lý {len(props_data.get('scenes', []))} cảnh.",
                    })
                    await broadcast_progress(job_id, ProgressEvent(
                        event="review_ready",
                        progress=1.0,
                        message="Ready for review",
                        props=_sign_props_urls(props_data),
                        job_id=job_id,
                        progress_snapshot=snapshot,
                    ))
                    await broadcast_user_event(job.user_id, "job_review_ready", {
                        "job_id": job_id,
                        "title": job.props.get("title", "") if isinstance(job.props, dict) else "",
                    })

        except Exception as e:
            import traceback as _tb
            logger.exception(f"Agentic pipeline failed for job {job_id}")
            snapshot, _, _, step_key = await tracker({
                "message": "Pipeline tháº¥t báº¡i.",
                "status": "error",
                "intermediate_result": USER_SYSTEM_ERROR_MESSAGE,
            })
            failure_step, failed_stage = _pipeline_error_metadata(e, step_key)
            async with SessionLocal() as db2:
                job = (await db2.execute(select(Job).where(Job.id == job_id))).scalar_one()
                job.status = "failed"
                job.error = USER_SYSTEM_ERROR_MESSAGE
                job.failure_reason = failed_stage or type(e).__name__
                job.pipeline_logs = {
                    "step": failure_step,
                    "stage": failed_stage,
                    "error": str(e),
                    "traceback": _tb.format_exc(),
                }
                await _sync_project_for_job(db2, job, stage="failed", active_job_id=job.id)
                await db2.commit()
            await broadcast_progress(job_id, ProgressEvent(
                event="error",
                step=failure_step,
                message=USER_SYSTEM_ERROR_MESSAGE,
                fatal=True,
                job_id=job_id,
                progress_snapshot=snapshot,
            ))
            await broadcast_user_event(user_id, "job_failed", {"job_id": job_id})


async def _run_render_background(
    job_id: str,
    video_props: dict,
) -> None:
    """Background task: Phase 2 — stage assets + render video.

    Called after user reviews and approves scenes via POST /jobs/{id}/render.
    Downloads any remote media URLs (from re-search), stages all assets,
    then renders via Remotion.
    """
    from api.database import SessionLocal, Job
    from app.utils.asset_staging import stage_assets_for_remotion
    from app.pipeline.nodes.rendering.renderer import render_video

    async with SessionLocal() as db:
        started_at = time.monotonic()
        tracker = _make_progress_tracker(
            phase="render",
            plan=RENDER_PLAN,
            weights=RENDER_WEIGHTS,
            started_at_monotonic=started_at,
        )

        async def _emit_render_progress(payload: dict[str, Any]) -> ProgressSnapshot:
            snapshot, progress, message, step_key = await tracker(payload)
            await broadcast_progress(job_id, ProgressEvent(
                event="progress",
                step=step_key,
                progress=progress,
                message=message,
                progress_snapshot=snapshot,
                job_id=job_id,
            ))
            return snapshot

        try:
            await _emit_render_progress({
                "step_key": "stage_assets",
                "message": "Đang chuẩn bị tài nguyên render...",
                "tool_name": "Asset Staging",
                "progress": 0.2,
            })

            job_dir = Path(OUTPUT_DIR) / job_id
            render_props_path = await stage_assets_for_remotion(
                job_id, video_props, job_dir,
            )

            await _emit_render_progress({
                "step_key": "stage_assets",
                "mark_done": True,
                "intermediate_result": "Tài nguyên render đã sẵn sàng.",
                "progress": 0.4,
            })

            await _emit_render_progress({
                "step_key": "render_frames",
                "message": "Đang kết xuất video...",
                "tool_name": "Remotion Renderer",
                "progress": 0.6,
            })

            last_frame_emit_ratio = 0.0
            last_frame_emit_at = 0.0

            async def _on_render_progress(payload: dict[str, Any]) -> None:
                nonlocal last_frame_emit_ratio, last_frame_emit_at

                ratio = payload.get("frame_progress")
                if not isinstance(ratio, (int, float)):
                    return

                ratio_val = max(0.0, min(1.0, float(ratio)))
                now = time.monotonic()
                if (
                    ratio_val < 1.0
                    and ratio_val <= last_frame_emit_ratio + 0.015
                    and now - last_frame_emit_at < 1.0
                ):
                    return

                last_frame_emit_ratio = max(last_frame_emit_ratio, ratio_val)
                last_frame_emit_at = now

                rendered_frames = payload.get("rendered_frames")
                total_frames = payload.get("total_frames")
                if isinstance(rendered_frames, int) and isinstance(total_frames, int) and total_frames > 0:
                    message = f"Đang kết xuất video... ({rendered_frames}/{total_frames} frame)"
                else:
                    message = f"Đang kết xuất video... ({int(ratio_val * 100)}%)"

                await _emit_render_progress({
                    "step_key": "render_frames",
                    "message": message,
                    "tool_name": "Remotion Renderer",
                    "progress": 0.6 + (0.3 * ratio_val),
                })

            output_path = job_dir / "final.mp4"
            await render_video(
                render_props_path,
                output_path,
                progress_callback=_on_render_progress,
            )
            thumbnail_url = _ensure_thumbnail(job_id)

            await _emit_render_progress({
                "step_key": "render_frames",
                "mark_done": True,
                "intermediate_result": "Đã render xong toàn bộ khung hình.",
                "progress": 0.9,
            })

            done_snapshot = await _emit_render_progress({
                "step_key": "finish_video",
                "mark_done": True,
                "status": "done",
                "message": "Video đã sẵn sàng.",
                "intermediate_result": "Hoàn tất xuất file MP4.",
                "progress": 1.0,
            })

            # Update DB
            job = (await db.execute(
                select(Job).options(selectinload(Job.project)).where(Job.id == job_id)
            )).scalar_one()
            job.status = "done"
            job.video_url = f"/api/jobs/{job_id}/download"
            job.thumbnail_url = thumbnail_url
            job.completed_at = datetime.now(timezone.utc)
            
            # Create notification
            await _create_notification(
                db, 
                job.user_id, 
                title="Tạo video hoàn thành!", 
                message=f"Video dự án '{job.project.title if job.project else 'không tên'}' đã sẵn sàng.",
                notif_type="success",
                action_url=f"/result/{job_id}"
            )
            
            cost = 0.0
            if isinstance(job.pipeline_logs, dict):
                cost = job.pipeline_logs.get("cost", 0.0)
            from api.database import UsageRecord
            db.add(UsageRecord(
                user_id=job.user_id,
                action="job_completed",
                cost_estimate=cost,
                created_at=datetime.now(timezone.utc),
            ))
            await _sync_project_for_job(
                db,
                job,
                stage="result",
                last_known_props=job.props if isinstance(job.props, dict) else None,
                active_job_id=job.id,
            )
            
            await db.commit()

            await broadcast_progress(job_id, ProgressEvent(
                event="done",
                job_id=job_id,
                download_url=f"/api/jobs/{job_id}/download",
                progress=1.0,
                message="Video ready!",
                progress_snapshot=done_snapshot,
            ))
            await broadcast_user_event(job.user_id, "job_done", {
                "job_id": job_id,
                "title": job.props.get("title", "") if isinstance(job.props, dict) else "",
            })

        except Exception as e:
            import traceback as _tb
            logger.exception(f"Render failed for job {job_id}")
            job = (await db.execute(
                select(Job).options(selectinload(Job.project)).where(Job.id == job_id)
            )).scalar_one()
            job.status = "failed"
            job.error = USER_SYSTEM_ERROR_MESSAGE
            job.failure_reason = type(e).__name__
            job.pipeline_logs = {
                "step": "render",
                "error": str(e),
                "traceback": _tb.format_exc(),
            }
            
            # Create notification
            await _create_notification(
                db, 
                job.user_id, 
                title="Lỗi tạo video", 
                message=f"Có lỗi xảy ra khi render video dự án '{job.project.title if job.project else 'không tên'}'.",
                notif_type="error",
                action_url=f"/result/{job_id}"
            )
            
            await _sync_project_for_job(db, job, stage="failed", active_job_id=job.id)
            await db.commit()

            # Notify frontend of failure via SSE
            await broadcast_progress(job_id, ProgressEvent(
                event="failed",
                job_id=job_id,
                progress=0.0,
                message=USER_SYSTEM_ERROR_MESSAGE,
            ))

            snapshot, _, _, step_key = await tracker({
                "message": "Render thất bại.",
                "status": "error",
                "intermediate_result": USER_SYSTEM_ERROR_MESSAGE,
                "step_key": "render_frames",
            })

            await broadcast_progress(job_id, ProgressEvent(
                event="error",
                step=step_key or "render_frames",
                message=USER_SYSTEM_ERROR_MESSAGE,
                fatal=True,
                job_id=job_id,
                progress_snapshot=snapshot,
            ))
            await broadcast_user_event(job.user_id, "job_failed", {"job_id": job_id})


# ══════════════════════════════════════════════
# AGENTIC — script-agent + human-in-the-loop
# ══════════════════════════════════════════════

_SCRIPT_AGENT_RESULT_TTL = 3600  # Redis TTL for task results (1 hour)


async def _run_script_agent_background(task_id: str, body_dict: dict, user_id: int) -> None:
    """Run ScriptAgent and store the result in Redis under script_agent:{task_id}."""
    from app.state import ScriptAgentRequest, AgentState
    from app.pipeline.stages.script_stage import ScriptStage
    from app.progress import use_progress_emitter

    project_id_raw = body_dict.get("project_id")
    project_id = project_id_raw if isinstance(project_id_raw, str) and project_id_raw else None
    script_agent_draft = {k: v for k, v in body_dict.items() if k != "project_id"}

    async def _persist_project_snapshot(
        snapshot: ProgressSnapshot | None,
        *,
        variants: list[dict[str, Any]] | None = None,
    ) -> None:
        if not project_id:
            return

        from api.database import SessionLocal

        async with SessionLocal() as db:
            project = (
                await db.execute(
                    select(Project).where(
                        Project.id == project_id,
                        Project.user_id == user_id,
                    )
                )
            ).scalar_one_or_none()
            if project is None:
                return

            project.stage = "idea"
            project.script_agent_task_id = task_id
            project.script_agent_draft = script_agent_draft
            project.script_agent_progress_snapshot = (
                snapshot.model_dump(mode="json") if snapshot is not None else None
            )
            if variants is not None:
                project.script_variants = variants
            await db.commit()

    async def _set_redis(payload: dict) -> None:
        _SCRIPT_AGENT_TASKS[task_id] = json.dumps(payload)

    async def _publish_task_update(payload: dict[str, Any]) -> None:
        task_payload = {
            "task_id": task_id,
            "user_id": user_id,
            **payload,
        }
        await _set_redis(task_payload)
        await broadcast_script_task(task_id, task_payload)

    started_at = time.monotonic()
    tracker = _make_progress_tracker(
        phase="script_agent",
        plan=SCRIPT_AGENT_PLAN,
        weights=SCRIPT_AGENT_WEIGHTS,
        started_at_monotonic=started_at,
    )

    async def _write_running(payload: dict[str, Any]) -> ProgressSnapshot:
        snapshot, progress, message, _ = await tracker(payload)
        await _publish_task_update({
            "status": "running",
            "message": message,
            "progress": progress,
            "progress_snapshot": snapshot.model_dump(mode="json"),
        })
        return snapshot

    await _write_running({
        "step_key": "analyze_topic",
        "message": "Đang khởi tạo tạo kịch bản...",
        "tool_name": "Script Agent",
        "status": "running",
    })
    try:
        body = ScriptAgentRequestBody(**body_dict)
        req = ScriptAgentRequest(
            topic=body.topic,
            audience=body.audience,
            tone=body.tone,
            duration_seconds=body.duration_seconds,
            language=body.language,
            format=body.format,
            reference_urls=body.reference_urls,
            reference_text=body.reference_text,
            must_include=body.must_include,
            n_variants=body.n_variants,
        )
        state = AgentState(
            job_id=f"preview-{task_id}",
            user_id=user_id,
            user_input_mode="topic",
            script_request=req,
        )
        agent = ScriptStage()
        async def _script_agent_progress(payload: dict[str, Any]) -> None:
            await _write_running(payload)

        with use_progress_emitter(_script_agent_progress):
            result_state = await agent.run(state)

        variants = [v.model_dump() for v in (result_state.generated_scripts or [])]
        done_snapshot, _, _, _ = await tracker({
            "step_key": "ready",
            "mark_done": True,
            "status": "done",
            "message": "Kịch bản đã sẵn sàng để bạn chọn.",
            "intermediate_result": f"Hoàn tất với {len(variants)} phiên bản.",
            "progress": 1.0,
        })
        await _persist_project_snapshot(done_snapshot, variants=variants)
        await _publish_task_update({
            "status": "done",
            "variants": variants,
            "progress_snapshot": done_snapshot.model_dump(mode="json"),
        })
    except Exception:
        logger.exception("[ScriptAgent] Task {} failed", task_id)
        error_snapshot, _, _, _ = await tracker({
            "status": "error",
            "message": "Tạo kịch bản thất bại.",
            "intermediate_result": USER_SYSTEM_ERROR_MESSAGE,
            "progress": 1.0,
        })
        await _persist_project_snapshot(error_snapshot)
        await _publish_task_update({
            "status": "error",
            "error": USER_SYSTEM_ERROR_MESSAGE,
            "progress_snapshot": error_snapshot.model_dump(mode="json"),
        })


@router.post(
    "/script-agent",
    response_model=ScriptAgentTaskResponse,
    summary="Enqueue ScriptAgent task — returns task_id for polling",
)
async def generate_script(
    body: ScriptAgentRequestBody,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    """Enqueue a ScriptAgent run. Poll GET /script-agent/{task_id} for result."""
    task_id = str(uuid.uuid4())
    body_dict = body.model_dump()
    script_agent_draft = {k: v for k, v in body_dict.items() if k != "project_id"}
    pending_snapshot: ProgressSnapshot | None = None
    project: Project | None = None

    if body.project_id:
        if db is None:
            raise HTTPException(status_code=500, detail="Database session unavailable")
        project = await _get_project_for(db, body.project_id, user)

    pending_snapshot = ProgressSnapshot(
        phase="script_agent",
        current_step="Đang chờ xử lý",
        execution_plan=[
            ProgressPlanStep(key=key, label=label, status="pending")
            for key, label in SCRIPT_AGENT_PLAN
        ],
        active_tool=None,
        intermediate_results=[],
        step_index=0,
        step_count=len(SCRIPT_AGENT_PLAN),
        elapsed_seconds=0,
        eta_seconds=None,
        status="pending",
    )
    pending_payload = {
        "task_id": task_id,
        "user_id": user.id,
        "status": "pending",
        "progress_snapshot": pending_snapshot.model_dump(mode="json"),
    }
    _SCRIPT_AGENT_TASKS[task_id] = json.dumps(pending_payload)
    await broadcast_script_task(task_id, pending_payload)
    # Launch ScriptAgent task — strictly use in-process background task for local tool.
    background_tasks.add_task(_run_script_agent_background, task_id, body_dict, user.id)

    if project is not None and pending_snapshot is not None:
        project.stage = "idea"
        project.script_agent_task_id = task_id
        project.script_agent_draft = script_agent_draft
        project.script_agent_progress_snapshot = pending_snapshot.model_dump(mode="json")
        await db.commit()

    background_tasks.add_task(_run_script_agent_background, task_id, body_dict, user.id)

    return ScriptAgentTaskResponse(
        task_id=task_id,
        status="pending",
        progress_snapshot=pending_snapshot,
    )


@router.get(
    "/script-agent/{task_id}",
    response_model=ScriptAgentTaskResponse,
    summary="Poll ScriptAgent task status and result",
)
async def get_script_agent_task(
    task_id: str,
    user: Annotated[User, Depends(get_current_user)],
):
    """Return current status of a ScriptAgent task. Once status is 'done', result contains variants."""
    raw = _SCRIPT_AGENT_TASKS.get(task_id)

    if raw is None:
        raise HTTPException(status_code=404, detail="Task not found or expired")

    data = json.loads(raw)
    owner_id_raw = data.get("user_id")
    owner_id = int(owner_id_raw) if isinstance(owner_id_raw, (int, str)) and str(owner_id_raw).isdigit() else None
    if owner_id is not None and owner_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")

    status = data.get("status", "pending")
    progress_snapshot_data = data.get("progress_snapshot")
    progress_snapshot = (
        ProgressSnapshot.model_validate(progress_snapshot_data)
        if isinstance(progress_snapshot_data, dict)
        else None
    )

    if status == "done":
        variants = [ScriptVariantResponse(**v) for v in data.get("variants", [])]
        return ScriptAgentTaskResponse(
            task_id=task_id,
            status="done",
            result=ScriptAgentResponse(variants=variants),
            progress_snapshot=progress_snapshot,
        )
    if status == "error":
        return ScriptAgentTaskResponse(
            task_id=task_id,
            status="error",
            error=data.get("error"),
            progress_snapshot=progress_snapshot,
        )
    return ScriptAgentTaskResponse(
        task_id=task_id,
        status=status,
        progress_snapshot=progress_snapshot,
    )


@router.get(
    "/script-agent/{task_id}/stream",
    summary="SSE stream for ScriptAgent task progress",
)
async def stream_script_agent_task(
    task_id: str,
    request: Request,
    token: str | None = Query(None, description="JWT fallback for SSE"),
):
    """Server-Sent Events stream for a ScriptAgent task."""

    user_id = 1

    raw = _SCRIPT_AGENT_TASKS.get(task_id)

    if raw is None:
        raise HTTPException(status_code=404, detail="Task not found or expired")

    data = json.loads(raw)
    owner_id_raw = data.get("user_id")
    owner_id = int(owner_id_raw) if isinstance(owner_id_raw, (int, str)) and str(owner_id_raw).isdigit() else None
    if owner_id is not None and owner_id != user_id:
        pass  # Local admin mode overrides all checks

    return StreamingResponse(
        subscribe_script_task(task_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/jobs/{job_id}/continue",
    response_model=JobResponse,
    summary="Continue a job suspended at a human checkpoint",
)
async def continue_job(
    job_id: str,
    body: HumanContinueRequest,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Resume an agentic pipeline that is waiting for human input.

    For script_selection: provide chosen_script (full text of selected variant).
    For content_review: provide approved=true/false.
    """
    job = await _get_job_for(db, job_id, user)

    if job.status != "needs_human":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job is not awaiting human input (status: {job.status})",
        )
    if not job.pipeline_logs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job has no saved agentic state to continue",
        )

    # Restore AgentState from pipeline_logs
    from app.state import AgentState
    saved_state = AgentState.model_validate(job.pipeline_logs)
    saved_state = saved_state.model_copy(update={"needs_human": False, "human_question": None})

    if body.decision_type == "script_selection" and body.chosen_script:
        saved_state = saved_state.model_copy(update={"chosen_script": body.chosen_script})
    elif not body.approved:
        # User rejected — mark failed
        job.status = "failed"
        job.error = "User rejected at checkpoint"
        await _sync_project_for_job(db, job, stage="failed", active_job_id=job.id)
        await db.commit()
        return _public_job_response(job)

    # Resume pipeline
    job.status = "processing"
    await _sync_project_for_job(db, job, stage="processing", active_job_id=job.id)
    await db.commit()

    # Resume pipeline — strictly use in-process background task for local tool.
    _resume_state_dict = saved_state.model_dump()

    background_tasks.add_task(
            _resume_agentic_pipeline_background,
            job_id=job_id,
            saved_state_dict=_resume_state_dict,
        )

    return _public_job_response(job)


async def _resume_agentic_pipeline_background(
    job_id: str,
    saved_state_dict: dict,
) -> None:
    """Continue an agentic pipeline from a saved state.

    Honours `state.settings.skip_review`:
      - `skip_review=False` (default): run the deterministic chain with
        render disabled so the editor can adjust props.
      - `skip_review=True`: run the same deterministic chain through render.
    """
    from api.database import SessionLocal
    from app.pipeline.graph import run_agentic_chain
    from app.progress import use_progress_emitter
    from app.state import AgentState

    async with SessionLocal() as db:
        started_at = time.monotonic()
        tracker = _make_progress_tracker(
            phase="create_processing",
            plan=CREATE_PROCESSING_PLAN,
            weights=CREATE_PROCESSING_WEIGHTS,
            started_at_monotonic=started_at,
        )

        async def _emit_job_progress(payload: dict[str, Any]) -> ProgressSnapshot:
            snapshot, progress, message, step_key = await tracker(payload)
            await broadcast_progress(job_id, ProgressEvent(
                event="progress",
                step=step_key,
                progress=progress,
                message=message,
                progress_snapshot=snapshot,
                job_id=job_id,
            ))
            return snapshot

        try:
            await _emit_job_progress({
                "step_key": "validate_input",
                "message": "Đang tiếp tục pipeline sau quyết định của bạn...",
                "tool_name": "Pipeline Runner",
                "progress": 0.1,
            })
            state = AgentState.model_validate(saved_state_dict)
            skip_review_flag = bool(getattr(state.settings, "skip_review", False))

            async def _pipeline_progress(payload: dict[str, Any]) -> None:
                await _emit_job_progress(payload)

            with use_progress_emitter(_pipeline_progress):
                final_state = await run_agentic_chain(
                    state,
                    render=skip_review_flag,
                )

            # Review path: emit review_ready with persisted props.
            if not skip_review_flag:
                props_data = final_state.video_props
                if not isinstance(props_data, dict):
                    props_file = Path(OUTPUT_DIR) / job_id / "video_props.json"
                    if props_file.exists():
                        props_data = json.loads(props_file.read_text(encoding="utf-8"))

                if isinstance(props_data, dict):
                    job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
                    job.props = props_data
                    job.status = "review"
                    job.pipeline_logs = {
                        "turns": len(final_state.history),
                        "tokens": final_state.total_tokens,
                        "cost": final_state.total_cost_estimate,
                        "qc_scores": final_state.qc_scores,
                        "token_breakdown": [t.model_dump() for t in final_state.token_breakdown],
                        "scene_completed_at": datetime.now(timezone.utc).isoformat(),
                    }
                    await _sync_project_for_job(
                        db,
                        job,
                        stage="review",
                        last_known_props=props_data,
                        active_job_id=job.id,
                    )
                    await db.commit()

                    snapshot = await _emit_job_progress({
                        "step_key": "ready_review",
                        "mark_done": True,
                        "status": "done",
                        "message": "Đã sẵn sàng để bạn kiểm tra cảnh.",
                        "intermediate_result": f"Hoàn tất xử lý {len(props_data.get('scenes', []))} cảnh.",
                    })

                    await broadcast_progress(job_id, ProgressEvent(
                        event="review_ready",
                        progress=1.0,
                        message="Ready for review",
                        props=_sign_props_urls(props_data),
                        job_id=job_id,
                        progress_snapshot=snapshot,
                    ))
                    await broadcast_user_event(job.user_id, "job_review_ready", {
                        "job_id": job_id,
                        "title": job.props.get("title", "") if isinstance(job.props, dict) else "",
                    })
                    return

            if final_state.is_done and final_state.final_mp4_path:
                video_url = f"/api/jobs/{job_id}/download"
                thumbnail_url = _ensure_thumbnail(job_id)
                job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
                if final_state.video_props:
                    job.props = final_state.video_props
                job.status = "done"
                job.video_url = video_url
                job.thumbnail_url = thumbnail_url
                job.completed_at = datetime.now(timezone.utc)
                job.pipeline_logs = {
                    "turns": len(final_state.history),
                    "tokens": final_state.total_tokens,
                    "cost": final_state.total_cost_estimate,
                    "qc_scores": final_state.qc_scores,
                    "token_breakdown": [t.model_dump() for t in final_state.token_breakdown],
                }
                from api.database import UsageRecord
                db.add(UsageRecord(
                    user_id=job.user_id,
                    action="job_completed",
                    cost_estimate=final_state.total_cost_estimate,
                    created_at=datetime.now(timezone.utc),
                ))
                await _sync_project_for_job(
                    db,
                    job,
                    stage="result",
                    last_known_props=job.props if isinstance(job.props, dict) else None,
                    active_job_id=job.id,
                )
                await db.commit()

                snapshot = await _emit_job_progress({
                    "step_key": "ready_review",
                    "mark_done": True,
                    "status": "done",
                    "message": "Video đã sẵn sàng.",
                    "intermediate_result": "Pipeline đã hoàn tất và xuất video thành công.",
                })
                await broadcast_progress(job_id, ProgressEvent(
                    event="done", job_id=job_id, download_url=video_url,
                    progress=1.0, message="Video ready!",
                    progress_snapshot=snapshot,
                ))
                await broadcast_user_event(job.user_id, "job_done", {
                    "job_id": job_id,
                    "title": job.props.get("title", "") if isinstance(job.props, dict) else "",
                })

        except Exception as e:
            import traceback as _tb
            logger.exception(f"Resume pipeline failed for job {job_id}")
            snapshot, _, _, step_key = await tracker({
                "message": "Tiáº¿p tá»¥c pipeline tháº¥t báº¡i.",
                "status": "error",
                "intermediate_result": USER_SYSTEM_ERROR_MESSAGE,
            })
            failure_step, failed_stage = _pipeline_error_metadata(e, step_key)
            async with SessionLocal() as db2:
                job = (await db2.execute(select(Job).where(Job.id == job_id))).scalar_one()
                job.status = "failed"
                job.error = USER_SYSTEM_ERROR_MESSAGE
                job.failure_reason = failed_stage or type(e).__name__
                job.pipeline_logs = {
                    "step": failure_step,
                    "stage": failed_stage,
                    "error": str(e),
                    "traceback": _tb.format_exc(),
                }
                await _sync_project_for_job(db2, job, stage="failed", active_job_id=job.id)
                await db2.commit()
            await broadcast_progress(job_id, ProgressEvent(
                event="error",
                step=failure_step,
                message=USER_SYSTEM_ERROR_MESSAGE,
                fatal=True,
                job_id=job_id,
                progress_snapshot=snapshot,
            ))
            await broadcast_user_event(job.user_id, "job_failed", {"job_id": job_id})


# ══════════════════════════════════════
# REVIEW — render / props / re-search
# ══════════════════════════════════════

@router.post("/jobs/{job_id}/render", response_model=JobResponse)
async def trigger_render(
    job_id: str,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        job = await _get_job_for(db, job_id, user)

        if job.status != "review":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Job must be in 'review' status to render (current: {job.status})",
            )
        if not job.props:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Job has no props to render",
            )

        job.status = "rendering"
        if isinstance(job.pipeline_logs, dict):
            logs = dict(job.pipeline_logs)
            logs["render_started_at"] = datetime.now(timezone.utc).isoformat()
            job.pipeline_logs = logs
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(job, "pipeline_logs")
        await _sync_project_for_job(
            db,
            job,
            stage="rendering",
            last_known_props=job.props if isinstance(job.props, dict) else None,
            active_job_id=job.id,
        )
        await db.commit()
        await broadcast_user_event(job.user_id, "job_rendering", {"job_id": job_id})
        # Overwrite the cached SSE event so ProcessingView doesn't replay stale review_ready
        await broadcast_progress(job_id, ProgressEvent(
            event="progress",
            job_id=job_id,
            step="render_start",
            progress=0.0,
            message="Đang chuẩn bị kết xuất video...",
        ))

        # Diagnostic: verify render reads correct data from DB
        logger.info("═══ RENDER READ ═══")
        logger.info("  scene_types: {}", [s.get("scene_type") for s in job.props.get("scenes", [])])
        logger.info("  media_urls:  {}", [str(s.get("media_url", "NONE"))[:60] for s in job.props.get("scenes", [])])

        # Trigger render — strictly use in-process background task for local tool.
        background_tasks.add_task(
                _run_render_background,
                job_id=job_id,
                video_props=job.props,
            )

        logger.info("═══ RENDER TRIGGER COMPLETE ═══")
        return _public_job_response(job)
    except Exception as e:
        logger.exception(f"CRITICAL: trigger_render failed for job {job_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khởi động Render: {str(e)}"
        )


def _merge_and_validate_scene(base_scene: dict, patch_scene: dict, index: int) -> dict:
    """Merge new scene data into existing scene and validate."""
    NULLABLE_FIELDS = {"emoji", "top_badge", "top_icon", "diagram_spec",
                       "comparison_sides", "timeline_events", "title_lines"}
    
    patch_updates = {
        k: v for k, v in patch_scene.items() 
        if v is not None or k in NULLABLE_FIELDS
    }
    merged = {**base_scene, **patch_updates}

    old_type = base_scene.get("scene_type")
    new_type = merged.get("scene_type")
    if old_type != new_type and new_type:
        from app.pipeline.nodes.content.parser import _auto_layout
        merged["layout"] = _auto_layout(new_type, merged)

    try:
        from app.state import Scene
        return Scene(**merged).model_dump(by_alias=True)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid scene at index {index}: {e}",
        )


def _apply_scene_updates(job, new_scenes: list) -> None:
    """Iterate through scenes patch and update Job.props."""
    existing_scenes = job.props.get("scenes", [])
    updated_scenes = []
    
    for i, scene_patch in enumerate(new_scenes):
        base = dict(existing_scenes[i]) if i < len(existing_scenes) else {}
        updated_scene = _merge_and_validate_scene(base, scene_patch, i)
        updated_scenes.append(updated_scene)

    updated_props = dict(job.props)
    updated_props["scenes"] = updated_scenes
    job.props = updated_props
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(job, "props")
    
    # Diagnostic: verify PATCH data before commit
    logger.info("═══ PATCH COMMIT ═══")
    for i, (old, new) in enumerate(zip(existing_scenes, updated_scenes)):
        old_type = old.get("scene_type", "?")
        new_type = new.get("scene_type", "?")
        changed = " ← CHANGED" if old_type != new_type else ""
        logger.info("  scene[{}] type: {} → {}{}", i, old_type, new_type, changed)
    logger.info("  media_urls:  {}", [str(s.get("media_url", "NONE"))[:60] for s in updated_scenes])


@router.patch("/jobs/{job_id}/props", response_model=JobResponse)
async def update_job_props(
    job_id: str,
    body: UpdatePropsRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_job_for(db, job_id, user)

    if job.status != "review":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job must be in 'review' status to edit props (current: {job.status})",
        )
    if not job.props:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job has no props to update",
        )

    if body.scenes is not None:
        _apply_scene_updates(job, body.scenes)

    # Merge settings if provided (CTA, watermark, SFX, subtitle preset, etc.)
    if body.settings is not None:
        updated_props = dict(job.props)
        existing_settings = updated_props.get("settings", {})
        merged_settings = {**existing_settings, **body.settings}

        # Strip signed URLs back to relative paths before saving to DB.
        # Frontend receives signed URLs from GET (e.g. "/api/files/bgm/x.mp3?token=...")
        # and sends them back in PATCH. We must store only the relative path.
        for key in ["bgm_url", "custom_background_url", "watermark_logo_url", "custom_font_url"]:
            val = merged_settings.get(key)
            if isinstance(val, str) and val.startswith("/api/files/"):
                # Extract relative path: "/api/files/bgm/x.mp3?token=..." → "bgm/x.mp3"
                rel = val[len("/api/files/"):]
                if "?" in rel:
                    rel = rel.split("?", 1)[0]
                merged_settings[key] = rel

        updated_props["settings"] = merged_settings
        job.props = updated_props
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(job, "props")
        logger.info("═══ PATCH SETTINGS ═══")
        logger.info("  keys updated: {}", list(body.settings.keys()))

    # Merge color_palette if provided
    if body.color_palette is not None:
        updated_props = dict(job.props)
        updated_props["color_palette"] = body.color_palette
        job.props = updated_props
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(job, "props")
        logger.info("═══ PATCH COLOR_PALETTE ═══")
        logger.info("  palette: {}", body.color_palette)

    await db.commit()
    return _public_job_response(job)


def _validate_re_search_request(job, scene_index: int, body: ReSearchMediaRequest) -> None:
    """Validate that the job and scene index are eligible for re-search."""
    if job.status != "review":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job must be in 'review' status (current: {job.status})",
        )
    if not job.props or "scenes" not in job.props:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job has no scenes to re-search",
        )

    scenes = job.props["scenes"]
    if scene_index < 0 or scene_index >= len(scenes):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid scene_index {scene_index} (max: {len(scenes) - 1})",
        )

    if not (body.image_query or body.video_query):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one of video_query or image_query is required",
        )


async def _perform_media_search(body: ReSearchMediaRequest, scene: dict) -> dict:
    """Execute the media search logic."""
    from app.pipeline.nodes.media.searcher import search_media
    query = body.image_query or body.video_query or ""
    scene_type = scene.get("scene_type", "stock_background")
    prefer_video = scene_type in ("stock_background", "media_showcase", "title_card", "cryptovn101_news")

    try:
        result = await search_media(
            query=body.image_query or query,
            video_query=body.video_query,
            prefer_video=prefer_video,
            per_page=15,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Media search failed: {e}",
        )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No media found for the given query",
        )
    return result


def _update_scene_media_props(job, scene_index: int, result: dict, body: ReSearchMediaRequest) -> None:
    """Apply the search result to the job props and flag for modification."""
    updated_props = dict(job.props)
    updated_props["scenes"] = [dict(s) for s in updated_props["scenes"]]
    scene = updated_props["scenes"][scene_index]
    
    scene["media_url"] = result.get("url")
    scene["media_type"] = result.get("type")
    scene["poster_url"] = (
        result.get("thumbnail") if result.get("type") == "video" else result.get("url")
    )
    if body.image_query:
        scene["image_query"] = body.image_query
    if body.video_query:
        scene["video_query"] = body.video_query
        
    job.props = updated_props
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(job, "props")


@router.post(
    "/jobs/{job_id}/scenes/{scene_index}/re-search",
    summary="Re-search media for a single scene",
)
async def re_search_scene_media(
    job_id: str,
    scene_index: int,
    body: ReSearchMediaRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_job_for(db, job_id, user)
    _validate_re_search_request(job, scene_index, body)

    scene = job.props["scenes"][scene_index]
    result = await _perform_media_search(body, scene)
    
    _update_scene_media_props(job, scene_index, result, body)
    await db.commit()

    return {
        "scene_index": scene_index,
        "media_url": result.get("url"),
        "media_type": result.get("type"),
        "poster_url": result.get("thumbnail") if result.get("type") == "video" else result.get("url"),
        "width": result.get("width"),
        "height": result.get("height"),
    }


# ══════════════════════════════════════
# REVIEW — Story Beats fallback (Concept D)
# ══════════════════════════════════════


@router.post(
    "/jobs/{job_id}/scenes/{scene_index}/apply-story-beats",
    summary="Convert a scene to story_beats (emoji + text fallback)",
)
async def apply_story_beats_to_scene(
    job_id: str,
    scene_index: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Decompose the scene's narration into story beats and switch scene_type.

    Used when:
      - Audit suggested a fallback (badge in review UI), or
      - User manually picks `story_beats` from the scene-type dropdown.

    Idempotent: safe to call multiple times (re-extracts beats each time).
    """
    from app.pipeline.nodes.content.story_beats import extract_story_beats
    from sqlalchemy.orm.attributes import flag_modified

    job = await _get_job_for(db, job_id, user)

    if job.status not in {"review", "review_ready"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job phải đang ở trạng thái review (hiện tại: {job.status})",
        )
    if not job.props or "scenes" not in job.props:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job chưa có phân cảnh nào",
        )

    scenes = job.props["scenes"]
    if scene_index < 0 or scene_index >= len(scenes):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Số thứ tự cảnh không hợp lệ ({scene_index}). Tối đa: {len(scenes) - 1}",
        )

    scene = scenes[scene_index]
    word_timestamps = job.props.get("word_timestamps") or []

    try:
        beats, _token_usage = await extract_story_beats(scene, word_timestamps)
    except Exception as e:
        logger.exception("apply-story-beats failed for job {} scene {}", job_id, scene_index)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không tạo được story beats: {e}",
        )

    if not beats:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Không tạo được beats — narration quá ngắn hoặc rỗng",
        )

    # Deep-copy scenes (same pattern as re_search to break shared reference)
    updated_props = dict(job.props)
    updated_props["scenes"] = [dict(s) for s in updated_props["scenes"]]
    updated_props["scenes"][scene_index].update({
        "scene_type": "story_beats",
        "story_beats": beats,
        "media_url": None,
        "media_type": None,
        "poster_url": None,
        "layout": "vertical_stack",
    })

    job.props = updated_props
    flag_modified(job, "props")
    await db.commit()

    return {
        "scene_index": scene_index,
        "scene_type": "story_beats",
        "story_beats": beats,
        "beat_count": len(beats),
    }


# ══════════════════════════════════════
# REVIEW — Custom media upload
# ══════════════════════════════════════

async def _validate_and_read_upload(file: UploadFile) -> tuple[bytes, bool, str]:
    """Validate content type and size of uploaded scene media."""
    ALLOWED_IMAGE = {"image/jpeg", "image/png", "image/webp"}
    ALLOWED_VIDEO = {"video/mp4", "video/webm", "video/quicktime"}
    content_type = file.content_type or ""

    if content_type not in ALLOWED_IMAGE and content_type not in ALLOWED_VIDEO:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Loại file không hỗ trợ: {content_type}. Chấp nhận: JPEG, PNG, WebP, MP4, WebM.",
        )

    content = await file.read()
    is_video = content_type in ALLOWED_VIDEO
    max_size = 50 * 1024 * 1024 if is_video else 5 * 1024 * 1024  # 50MB video, 5MB image
    
    if len(content) > max_size:
        limit_mb = max_size // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File quá lớn ({len(content) / 1024 / 1024:.1f}MB). Giới hạn: {limit_mb}MB.",
        )
    return content, is_video, content_type



def _save_custom_media(
    job_id: str, scene_index: int, content: bytes, is_video: bool, original_filename: str
) -> tuple[str, str, str]:
    """Save the uploaded content to the job's media directory and return paths/URLs."""
    media_dir = Path(OUTPUT_DIR) / job_id / "media"
    media_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(original_filename or "upload").suffix or (".mp4" if is_video else ".jpg")
    filename = f"scene_{scene_index}_custom{ext}"
    filepath = media_dir / filename
    filepath.write_bytes(content)

    local_path = str(filepath.resolve())
    rel_path = f"{job_id}/media/{filename}"
    serve_url = _get_signed_file_url(rel_path)
    return local_path, serve_url, filename


def _update_scene_custom_media(
    job, scene_index: int, media_path: str, media_type: str, preview_url: str, poster_url: str
) -> None:
    """Update the job props with the new custom media information."""
    updated_props = dict(job.props)
    updated_props["scenes"] = [dict(s) for s in updated_props["scenes"]]
    scene = updated_props["scenes"][scene_index]
    
    scene["media_url"] = media_path
    scene["media_type"] = media_type
    scene["_preview_url"] = preview_url
    scene["poster_url"] = poster_url
    
    job.props = updated_props
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(job, "props")


@router.post(
    "/jobs/{job_id}/scenes/{scene_index}/upload-media",
    summary="Upload custom image/video for a scene",
)
async def upload_scene_media(
    job_id: str,
    scene_index: int,
    file: UploadFile = File(...),
    user: Annotated[User, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    """Upload a custom image or video to replace scene media."""
    job = await _get_job_for(db, job_id, user)

    if job.status != "review":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job must be in 'review' status (current: {job.status})",
        )
    if not job.props or "scenes" not in job.props:
        raise HTTPException(status_code=400, detail="Job has no scenes")

    scenes = job.props["scenes"]
    if scene_index < 0 or scene_index >= len(scenes):
        raise HTTPException(status_code=400, detail=f"Invalid scene_index {scene_index}")

    # Validate content and read
    content, is_video, _ = await _validate_and_read_upload(file)

    # Save file
    local_path, serve_url, filename = _save_custom_media(
        job_id, scene_index, content, is_video, file.filename
    )

    media_type = "video" if is_video else "image"
    poster_url = serve_url if not is_video else None

    if is_video:
        poster_path = _scene_poster_output_path(job_id, scene_index)
        from app.pipeline.nodes.rendering.thumbnail import extract_thumbnail
        if extract_thumbnail(Path(local_path), poster_path):
            poster_url = _scene_poster_download_url(job_id, scene_index)

    # Update DB
    _update_scene_custom_media(job, scene_index, local_path, media_type, serve_url, poster_url)
    await db.commit()

    return {
        "scene_index": scene_index,
        "media_url": local_path,
        "preview_url": serve_url,
        "media_type": media_type,
        "poster_url": poster_url,
        "filename": filename,
        "size_bytes": len(content),
    }


# ── CTA Upload ──

_ALLOWED_CTA_TYPES = {"video/mp4", "video/webm", "image/jpeg", "image/png", "image/webp"}
_MAX_CTA_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post(
    "/jobs/{job_id}/cta/upload",
    summary="Upload CTA media (video/image)",
)
async def upload_cta(
    job_id: str,
    file: Annotated[UploadFile, File()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):

    _ = await _get_job_for(db, job_id, user)


    if file.content_type not in _ALLOWED_CTA_TYPES:
        raise HTTPException(400, f"File type not allowed: {file.content_type}")

    content = await file.read()
    if len(content) > _MAX_CTA_SIZE:
        raise HTTPException(400, "File too large (max 50MB)")

    # Save to output/{job_id}/assets/cta_{filename}
    assets_dir = Path(OUTPUT_DIR) / job_id / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "media").suffix or ".mp4"
    dest = assets_dir / f"cta{ext}"
    dest.write_bytes(content)

    # Return local path (for Remotion) and signed URL (for frontend)
    local_path = f"{job_id}/assets/cta{ext}"
    rel_path = f"{job_id}/assets/cta{ext}"
    media_type = "video" if file.content_type.startswith("video") else "image"

    return {
        "media_url": local_path,
        "media_type": media_type,
        "preview_url": _get_signed_file_url(rel_path),
    }


# ── Logo Upload ──

_ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/webp", "image/svg+xml"}
_MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2 MB


@router.post(
    "/jobs/{job_id}/logo/upload",
    summary="Upload watermark logo",
)
async def upload_logo(
    job_id: str,
    file: Annotated[UploadFile, File()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):

    _ = await _get_job_for(db, job_id, user)

    if file.content_type not in _ALLOWED_LOGO_TYPES:
        raise HTTPException(400, "Only PNG, JPG, WebP, SVG allowed")

    content = await file.read()
    if len(content) > _MAX_LOGO_SIZE:
        raise HTTPException(400, "Logo too large (max 2MB)")

    assets_dir = Path(OUTPUT_DIR) / job_id / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "logo.png").suffix or ".png"
    dest = assets_dir / f"logo{ext}"
    dest.write_bytes(content)

    return {
        "logo_url": f"{job_id}/assets/logo{ext}",
        "preview_url": _get_signed_file_url(f"{job_id}/assets/logo{ext}"),
    }


# ── Custom Background Upload ──

_ALLOWED_BG_TYPES = {
    "image/jpeg", "image/png", "image/webp",
    "video/mp4", "video/webm",
}
_MAX_BG_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post(
    "/jobs/{job_id}/background/upload",
    summary="Upload custom background image/video for the entire video",
)
async def upload_custom_background(
    job_id: str,
    file: Annotated[UploadFile, File()],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Upload a custom background that replaces the gradient preset for the whole video."""
    _ = await _get_job_for(db, job_id, user)

    if file.content_type not in _ALLOWED_BG_TYPES:
        raise HTTPException(400, f"File type not allowed: {file.content_type}. Accepted: JPEG, PNG, WebP, MP4, WebM.")

    content = await file.read()
    if len(content) > _MAX_BG_SIZE:
        raise HTTPException(400, "File too large (max 50MB)")

    assets_dir = Path(OUTPUT_DIR) / job_id / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "bg").suffix or (".mp4" if file.content_type.startswith("video") else ".jpg")
    dest = assets_dir / f"custom_bg{ext}"
    dest.write_bytes(content)

    media_type = "video" if file.content_type.startswith("video") else "image"

    return {
        "bg_url": f"{job_id}/assets/custom_bg{ext}",
        "bg_type": media_type,
        "preview_url": _get_signed_file_url(f"{job_id}/assets/custom_bg{ext}"),
    }


# ══════════════════════════════
# Notifications
# ══════════════════════════════

@router.get("/notifications", response_model=NotificationListResponse)
async def get_notifications(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get all notifications for the user."""
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
    )
    notifications = result.scalars().all()

    unread_result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.is_read == False)
    )
    unread_count = unread_result.scalar() or 0

    return {"notifications": notifications, "unread_count": unread_count}


@router.patch("/notifications/{notif_id}/read")
async def mark_notification_read(
    notif_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark a single notification as read."""
    result = await db.execute(
        select(Notification).where(Notification.id == notif_id, Notification.user_id == user.id)
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(404, "Notification not found")
    notif.is_read = True
    await db.commit()
    return {"success": True}


@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark all notifications as read."""
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id)
        .values(is_read=True)
    )
    await db.commit()
    return {"success": True}


@router.delete("/notifications")
async def delete_all_notifications(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete all notifications for the current user."""
    await db.execute(
        delete(Notification).where(Notification.user_id == user.id)
    )
    await db.commit()
    return {"success": True}
