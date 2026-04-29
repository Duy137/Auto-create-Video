"""Production API routes for AutoClip.

Endpoints:
  Auth:     POST /register, /login, GET /me
  Jobs:     POST /jobs, GET /jobs, GET /jobs/{id}, GET /jobs/{id}/progress, GET /jobs/{id}/download
  Review:   POST /jobs/{id}/render, PATCH /jobs/{id}/props, POST /jobs/{id}/scenes/{idx}/re-search
  TTS:      POST /tts/preview
  BGM:      POST /bgm/upload
"""

from __future__ import annotations

import asyncio
import io
import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, AsyncGenerator

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    UploadFile,
    File,
    status,
)
from fastapi.responses import FileResponse, StreamingResponse
from loguru import logger
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import (
    create_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)
from api.database import Job, User, get_db
from api.models import (
    JobCreateRequest,
    JobListResponse,
    JobResponse,
    LoginRequest,
    ProgressEvent,
    RegisterRequest,
    RenderJobRequest,
    ReSearchMediaRequest,
    TokenResponse,
    UpdatePropsRequest,
    UserResponse,
    VoicePreviewRequest,
)
from config import OUTPUT_DIR, REMOTION_DIR

router = APIRouter(prefix="/api")

# ══════════════════════════════
# In-memory SSE progress store
# ══════════════════════════════

# job_id → asyncio.Queue of ProgressEvent dicts
_progress_queues: dict[str, list[asyncio.Queue]] = {}


def _get_queue(job_id: str) -> asyncio.Queue:
    """Create and register a new SSE queue for a job."""
    q: asyncio.Queue = asyncio.Queue()
    _progress_queues.setdefault(job_id, []).append(q)
    return q


def _remove_queue(job_id: str, q: asyncio.Queue) -> None:
    """Unregister an SSE queue."""
    queues = _progress_queues.get(job_id, [])
    if q in queues:
        queues.remove(q)
    if not queues:
        _progress_queues.pop(job_id, None)


async def broadcast_progress(job_id: str, event: ProgressEvent) -> None:
    """Send a progress event to all SSE listeners for a job."""
    data = event.model_dump_json()
    for q in _progress_queues.get(job_id, []):
        await q.put(data)


# ══════════════════════════════════════
# AUTH — register / login / me
# ══════════════════════════════════════

@router.post(
    "/auth/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    body: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Check duplicate username
    existing = await db.execute(
        select(User).where(
            (User.username == body.username) | (User.email == body.email)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already taken",
        )

    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.flush()  # Populate user.id

    token = create_token(user.id, user.role)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/auth/login",
    response_model=TokenResponse,
    summary="Login → JWT",
)
async def login(
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(User).where(User.username == body.username)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = create_token(user.id, user.role)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get(
    "/auth/me",
    response_model=UserResponse,
    summary="Current user info",
)
async def me(user: Annotated[User, Depends(get_current_user)]):
    return UserResponse.model_validate(user)


# ══════════════════════════════════════
# JOBS — create / list / detail
# ══════════════════════════════════════

@router.post(
    "/jobs",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new video generation job",
)
async def create_job(
    body: JobCreateRequest,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job_id = uuid.uuid4().hex[:12]

    job = Job(
        id=job_id,
        user_id=user.id,
        status="pending",
        input_text=body.input_text,
        settings=body.settings.model_dump() if body.settings else {},
    )
    db.add(job)
    await db.flush()  # Populate job fields
    await db.commit()  # Commit NOW so background task can find the job

    # Launch pipeline in background
    background_tasks.add_task(
        _run_pipeline_background,
        job_id=job_id,
        text=body.input_text,
        settings=body.settings,
    )

    return JobResponse.model_validate(job)


@router.get(
    "/jobs",
    response_model=JobListResponse,
    summary="List current user's jobs",
)
async def list_jobs(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    status_filter: str | None = Query(
        None, alias="status",
        description="Filter by job status (pending, processing, review, rendering, done, failed)",
    ),
):
    # Base filter
    filters = [Job.user_id == user.id]
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

    return JobListResponse(
        jobs=[JobResponse.model_validate(j) for j in jobs],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get(
    "/jobs/{job_id}",
    response_model=JobResponse,
    summary="Get job detail",
)
async def get_job(
    job_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_user_job(db, job_id, user.id)
    return JobResponse.model_validate(job)


@router.delete(
    "/jobs/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a job and its output files",
)
async def delete_job(
    job_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_user_job(db, job_id, user.id)

    # Prevent deleting jobs that are actively processing or rendering
    if job.status in ("processing", "rendering"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete job while it is {job.status}",
        )

    # Clean up output files
    job_dir = Path(OUTPUT_DIR) / job_id
    if job_dir.exists():
        shutil.rmtree(str(job_dir), ignore_errors=True)

    # Clean up staged Remotion assets
    remotion_assets = Path(REMOTION_DIR) / "public" / "assets" / job_id
    if remotion_assets.exists():
        shutil.rmtree(str(remotion_assets), ignore_errors=True)

    await db.delete(job)
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
    token: str | None = Query(None, description="JWT for cross-origin SSE"),
):
    """Server-Sent Events stream for job progress.

    Accepts JWT via Authorization header OR ?token= query param
    (EventSource doesn't support custom headers).

    Uses a temporary DB session for auth check, released before
    the long-lived SSE stream starts.
    """
    # Auth with temporary session — release DB before SSE stream
    from api.database import SessionLocal

    async with SessionLocal() as db:
        user: User | None = None
        if token:
            payload = decode_token(token)
            user_id = int(payload["sub"])
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated — pass ?token=JWT for SSE",
            )

        # Verify job belongs to user
        await _get_user_job(db, job_id, user.id)
    # ← db session closed here, BEFORE SSE stream starts

    async def _event_stream() -> AsyncGenerator[str, None]:
        q = _get_queue(job_id)
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield f"data: {data}\n\n"
                    # Check if this is a terminal event
                    parsed = json.loads(data)
                    if parsed.get("event") in ("done", "error") and parsed.get("fatal", False):
                        break
                except asyncio.TimeoutError:
                    # Heartbeat to keep connection alive
                    yield ": heartbeat\n\n"
        finally:
            _remove_queue(job_id, q)

    return StreamingResponse(
        _event_stream(),
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
    job = await _get_user_job(db, job_id, user.id)

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
        from app.nodes.tts_synthesizer import get_tts_engine

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
# BGM — upload custom background music
# ══════════════════════════════════════

_ALLOWED_BGM_TYPES = {"audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/mp3"}
_MAX_BGM_SIZE = 10 * 1024 * 1024  # 10 MB


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

    # Read and validate size
    content = await file.read()
    if len(content) > _MAX_BGM_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large ({len(content) / 1024 / 1024:.1f}MB). Max: 10MB.",
        )

    # Save to output/bgm/
    bgm_dir = Path(OUTPUT_DIR) / "bgm"
    bgm_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{user.id}_{uuid.uuid4().hex[:8]}{ext}"
    dest = bgm_dir / filename
    dest.write_bytes(content)

    return {
        "filename": filename,
        "url": f"/api/outputs/bgm/{filename}",
        "size_bytes": len(content),
    }


# ══════════════════════════════════════
# Health check (enhanced)
# ══════════════════════════════════════

@router.get("/health", summary="Health check")
async def health():
    return {
        "status": "ok",
        "version": "0.2.0",
        "services": {
            "api": "online",
            "database": "sqlite" if "sqlite" in str(Path(OUTPUT_DIR)) or True else "postgresql",
        },
    }


# ══════════════════════════════════════
# Helpers
# ══════════════════════════════════════

async def _get_user_job(db: AsyncSession, job_id: str, user_id: int) -> Job:
    """Fetch a job and verify it belongs to the user. Raises 404 if not found."""
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
    from app.nodes._openai_client import get_openai_client

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


async def _run_pipeline_background(
    job_id: str,
    text: str,
    settings,
) -> None:
    """Background task: run pipeline Phase 1 (parse+TTS+media), stop at review.

    Phase 1: validate → parse → TTS → media search → word alignment → props
    Stops with status='review' so user can review/edit scenes before rendering.
    """
    from api.database import SessionLocal

    async with SessionLocal() as db:
        try:
            # Update status → processing
            job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
            job.status = "processing"
            await db.commit()

            # ONE real SSE event at start (not fake per-step events)
            await broadcast_progress(job_id, ProgressEvent(
                event="progress", step="processing", progress=0.10,
                message="AI is generating your video content...",
            ))

            # ── Run pipeline — STOP before render ──
            from app.orchestrator import run_pipeline

            voice = "nova"
            rate = 1.0
            settings_dict = {}
            if settings:
                settings_dict = settings.model_dump() if hasattr(settings, "model_dump") else settings
                voice = settings_dict.get("voice", "nova")
                rate = settings_dict.get("speech_rate", 1.0)

            await run_pipeline(
                text=text,
                job_id=job_id,
                voice=voice,
                rate=rate,
                skip_render=True,  # ← KEY CHANGE: stop before render
                user_settings=settings_dict,  # ← Pass ALL settings to pipeline
            )

            # Read generated props
            props_file = Path(OUTPUT_DIR) / job_id / "video_props.json"
            props_data = json.loads(props_file.read_text(encoding="utf-8"))

            # Save to DB as review
            job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
            job.props = props_data
            job.status = "review"  # ← NOT "done" — user reviews first
            await db.commit()

            # Emit review_ready with props
            await broadcast_progress(job_id, ProgressEvent(
                event="review_ready",
                progress=1.0,
                message="Ready for review",
                props=props_data,
                job_id=job_id,
            ))

        except Exception as e:
            logger.exception(f"Pipeline failed for job {job_id}")
            job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
            job.status = "failed"
            job.error = str(e)
            await db.commit()

            await broadcast_progress(job_id, ProgressEvent(
                event="error",
                step="pipeline",
                message=str(e),
                fatal=True,
                job_id=job_id,
            ))


async def _run_render_background(
    job_id: str,
    video_props: dict,
) -> None:
    """Background task: Phase 2 — stage assets + render video.

    Called after user reviews and approves scenes via POST /jobs/{id}/render.
    Downloads any remote media URLs (from re-search), stages all assets,
    then renders via Remotion.
    """
    from api.database import SessionLocal
    from app.orchestrator import stage_assets_for_remotion
    from app.nodes.video_renderer import render_video

    async with SessionLocal() as db:
        try:
            await broadcast_progress(job_id, ProgressEvent(
                event="progress", step="staging", progress=0.20,
                message="Staging assets for render...",
            ))

            job_dir = Path(OUTPUT_DIR) / job_id
            render_props_path = await stage_assets_for_remotion(
                job_id, video_props, job_dir,
            )

            await broadcast_progress(job_id, ProgressEvent(
                event="progress", step="render", progress=0.60,
                message="Rendering video...",
            ))

            output_path = job_dir / "final.mp4"
            await render_video(render_props_path, output_path)

            # Update DB
            job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
            job.status = "done"
            job.video_url = f"/api/jobs/{job_id}/download"
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()

            await broadcast_progress(job_id, ProgressEvent(
                event="done",
                job_id=job_id,
                download_url=f"/api/jobs/{job_id}/download",
                progress=1.0,
                message="Video ready!",
            ))

        except Exception as e:
            logger.exception(f"Render failed for job {job_id}")
            job = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
            job.status = "failed"
            job.error = str(e)
            await db.commit()

            await broadcast_progress(job_id, ProgressEvent(
                event="error",
                step="render",
                message=str(e),
                fatal=True,
                job_id=job_id,
            ))


# ══════════════════════════════════════
# REVIEW — render / props / re-search
# ══════════════════════════════════════

@router.post(
    "/jobs/{job_id}/render",
    response_model=JobResponse,
    summary="Trigger video render from reviewed props (Phase 2)",
)
async def render_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_user_job(db, job_id, user.id)

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
    await db.commit()

    # Diagnostic: verify render reads correct data from DB
    logger.info("═══ RENDER READ ═══")
    logger.info("  scene_types: {}", [s.get("scene_type") for s in job.props.get("scenes", [])])
    logger.info("  media_urls:  {}", [str(s.get("media_url", "NONE"))[:60] for s in job.props.get("scenes", [])])

    background_tasks.add_task(
        _run_render_background,
        job_id=job_id,
        video_props=job.props,
    )

    return JobResponse.model_validate(job)


@router.patch(
    "/jobs/{job_id}/props",
    response_model=JobResponse,
    summary="Update scene props during review",
)
async def update_job_props(
    job_id: str,
    body: UpdatePropsRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    job = await _get_user_job(db, job_id, user.id)

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
        # Validate each scene via Scene model before saving
        from app.state import Scene

        existing_scenes = job.props.get("scenes", [])
        updated_scenes = []
        for i, scene_patch in enumerate(body.scenes):
            # Start from existing scene data (preserves media_url, _preview_url, etc.)
            base = dict(existing_scenes[i]) if i < len(existing_scenes) else {}
            # Merge client edits on top — allow explicit null for nullable fields
            NULLABLE_FIELDS = {"emoji", "top_badge", "top_icon", "diagram_spec",
                               "comparison_sides", "timeline_events", "title_lines"}
            patch_updates = {}
            for k, v in scene_patch.items():
                if v is not None or k in NULLABLE_FIELDS:
                    patch_updates[k] = v
            merged = {**base, **patch_updates}

            # Re-calculate layout when scene_type changes (e.g. media_showcase → stock_background)
            # Without this, layout stays stale and media may be hidden
            old_type = base.get("scene_type")
            new_type = merged.get("scene_type")
            if old_type != new_type and new_type:
                from app.nodes.content_parser import _auto_layout
                merged["layout"] = _auto_layout(new_type, merged)

            # Validate merged scene
            try:
                scene_obj = Scene(**merged)
                updated_scenes.append(scene_obj.model_dump())
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid scene at index {i}: {e}",
                )

        # Update scenes in props
        updated_props = dict(job.props)
        updated_props["scenes"] = updated_scenes
        job.props = updated_props
        # Belt-and-suspenders: force SQLAlchemy detect JSON change
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

    # Merge settings if provided (CTA, watermark, SFX, subtitle preset, etc.)
    if body.settings is not None:
        updated_props = dict(job.props)
        existing_settings = updated_props.get("settings", {})
        updated_props["settings"] = {**existing_settings, **body.settings}
        job.props = updated_props
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(job, "props")
        logger.info("═══ PATCH SETTINGS ═══")
        logger.info("  keys updated: {}", list(body.settings.keys()))

    await db.commit()
    return JobResponse.model_validate(job)


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
    job = await _get_user_job(db, job_id, user.id)

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

    # Search with new queries — returns Pexels URL (no download)
    from app.nodes.media_searcher import search_media

    query = body.image_query or body.video_query or ""
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one of video_query or image_query is required",
        )

    scene = scenes[scene_index]
    scene_type = scene.get("scene_type", "stock_background")
    prefer_video = scene_type in ("stock_background", "news_intro")

    try:
        result = await search_media(
            query=body.image_query or query,
            video_query=body.video_query,
            prefer_video=prefer_video,
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

    # Save Pexels URL directly — NOT downloaded (frontend previews from CDN)
    # IMPORTANT: deep-copy scenes list to break shared reference with job.props
    # (shallow dict() shares the scenes list → SQLAlchemy skips UPDATE)
    updated_props = dict(job.props)
    updated_props["scenes"] = [dict(s) for s in updated_props["scenes"]]  # NEW list + NEW dicts
    updated_props["scenes"][scene_index]["media_url"] = result.get("url")
    updated_props["scenes"][scene_index]["media_type"] = result.get("type")
    if body.image_query:
        updated_props["scenes"][scene_index]["image_query"] = body.image_query
    if body.video_query:
        updated_props["scenes"][scene_index]["video_query"] = body.video_query
    job.props = updated_props
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(job, "props")
    await db.commit()

    return {
        "scene_index": scene_index,
        "media_url": result.get("url"),
        "media_type": result.get("type"),
        "width": result.get("width"),
        "height": result.get("height"),
    }


# ══════════════════════════════════════
# REVIEW — Custom media upload
# ══════════════════════════════════════

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
    job = await _get_user_job(db, job_id, user.id)

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

    # Validate content type
    ALLOWED_IMAGE = {"image/jpeg", "image/png", "image/webp"}
    ALLOWED_VIDEO = {"video/mp4", "video/webm", "video/quicktime"}
    content_type = file.content_type or ""

    if content_type not in ALLOWED_IMAGE and content_type not in ALLOWED_VIDEO:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Loại file không hỗ trợ: {content_type}. Chấp nhận: JPEG, PNG, WebP, MP4, WebM.",
        )

    # Read and validate size
    content = await file.read()
    is_video = content_type in ALLOWED_VIDEO
    max_size = 50 * 1024 * 1024 if is_video else 5 * 1024 * 1024  # 50MB video, 5MB image
    if len(content) > max_size:
        limit_mb = max_size // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File quá lớn ({len(content) / 1024 / 1024:.1f}MB). Giới hạn: {limit_mb}MB.",
        )

    # Save file
    media_dir = Path(OUTPUT_DIR) / job_id / "media"
    media_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "upload").suffix or (".mp4" if is_video else ".jpg")
    filename = f"scene_{scene_index}_custom{ext}"
    filepath = media_dir / filename
    filepath.write_bytes(content)

    media_type = "video" if is_video else "image"
    local_path = str(filepath.resolve())
    # Serve URL for frontend preview (served via /api/outputs/ static mount)
    serve_url = f"/api/outputs/{job_id}/media/{filename}"

    # Update scene in DB
    # IMPORTANT: deep-copy scenes list to break shared reference with job.props
    # (shallow dict() shares the scenes list → SQLAlchemy skips UPDATE)
    updated_props = dict(job.props)
    updated_props["scenes"] = [dict(s) for s in updated_props["scenes"]]  # NEW list + NEW dicts
    updated_props["scenes"][scene_index]["media_url"] = local_path     # For stage_assets_for_remotion (local copy)
    updated_props["scenes"][scene_index]["media_type"] = media_type
    updated_props["scenes"][scene_index]["_preview_url"] = serve_url    # For frontend preview
    job.props = updated_props
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(job, "props")
    await db.commit()

    return {
        "scene_index": scene_index,
        "media_url": local_path,
        "preview_url": serve_url,
        "media_type": media_type,
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
    job = await _get_user_job(db, job_id, user.id)

    if file.content_type not in _ALLOWED_CTA_TYPES:
        raise HTTPException(400, f"File type not allowed: {file.content_type}")

    content = await file.read()
    if len(content) > _MAX_CTA_SIZE:
        raise HTTPException(400, "File too large (max 50MB)")

    # Save to remotion/public/assets/{job_id}/cta_{filename}
    assets_dir = Path(REMOTION_DIR) / "public" / "assets" / job_id
    assets_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "media").suffix or ".mp4"
    dest = assets_dir / f"cta{ext}"
    dest.write_bytes(content)

    # Return local path (for Remotion) and preview URL (for frontend)
    local_path = f"assets/{job_id}/cta{ext}"
    media_type = "video" if file.content_type.startswith("video") else "image"

    return {
        "media_url": local_path,
        "media_type": media_type,
        "preview_url": f"/api/demo/assets/{job_id}/cta{ext}",
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
    job = await _get_user_job(db, job_id, user.id)

    if file.content_type not in _ALLOWED_LOGO_TYPES:
        raise HTTPException(400, "Only PNG, JPG, WebP, SVG allowed")

    content = await file.read()
    if len(content) > _MAX_LOGO_SIZE:
        raise HTTPException(400, "Logo too large (max 2MB)")

    assets_dir = Path(REMOTION_DIR) / "public" / "assets" / job_id
    assets_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "logo.png").suffix or ".png"
    dest = assets_dir / f"logo{ext}"
    dest.write_bytes(content)

    return {
        "logo_url": f"assets/{job_id}/logo{ext}",
        "preview_url": f"/api/demo/assets/{job_id}/logo{ext}",
    }
