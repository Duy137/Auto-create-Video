import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, BackgroundTasks, HTTPException
from loguru import logger
from pydantic import BaseModel

# Import your pipeline logic
from app.orchestrator import (
    apply_top_media_from_candidates,
    collect_scene_media_candidates,
    run_pipeline,
)
from app.nodes.media_reranker import rerank_candidates_by_scene
from app.nodes.media_searcher import download_media
from app.nodes.video_renderer import render_video
from config import (
    JOB_STORE_BACKEND,
    OUTPUT_DIR,
    REDIS_JOB_TTL_SECONDS,
    REDIS_URL,
    REMOTION_DIR,
    VLM_RERANK_ENABLED,
    VLM_RERANK_MAX_CANDIDATES,
)

router = APIRouter(prefix="/api/demo")

JOB_KEY_PREFIX = "autoclip:demo:job"
JOB_FILE_STORE_DIR = Path(OUTPUT_DIR) / ".demo_jobs"
redis_client: Any | None = None
file_store_fallback_enabled = JOB_STORE_BACKEND == "file"


class JobStoreUnavailableError(RuntimeError):
    """Raised when Redis is not reachable or not installed."""


class JobCreate(BaseModel):
    text: str
    voice: str = "nova"
    rate: float = 1.0

class RenderRequest(BaseModel):
    job_id: str
    video_props: dict


class RerankMediaRequest(BaseModel):
    video_props: dict | None = None
    max_candidates: int | None = None


def _job_key(job_id: str) -> str:
    return f"{JOB_KEY_PREFIX}:{job_id}"


def _job_file_path(job_id: str) -> Path:
    return JOB_FILE_STORE_DIR / f"{job_id}.json"


def _enable_file_store_fallback(reason: str) -> None:
    global file_store_fallback_enabled
    global redis_client

    if file_store_fallback_enabled:
        return

    file_store_fallback_enabled = True
    redis_client = None
    logger.warning(
        "Redis unavailable ({}). Falling back to file store at {}",
        reason,
        JOB_FILE_STORE_DIR,
    )


def _delete_job_file(job_id: str) -> None:
    job_file = _job_file_path(job_id)
    if not job_file.exists():
        return
    try:
        job_file.unlink()
    except Exception:
        logger.exception("Failed to delete file-store job {}", job_id)


async def _read_job_file(job_id: str) -> dict[str, Any] | None:
    job_file = _job_file_path(job_id)
    if not job_file.exists():
        return None

    try:
        with open(job_file, "r", encoding="utf-8") as f:
            decoded = json.load(f)
    except Exception:
        logger.exception("Corrupted file-store payload for job {}", job_id)
        _delete_job_file(job_id)
        return None

    if not isinstance(decoded, dict):
        logger.error("Unexpected file-store payload type for job {}", job_id)
        _delete_job_file(job_id)
        return None

    expires_at = decoded.get("_expires_at")
    if isinstance(expires_at, (int, float)) and expires_at <= time.time():
        _delete_job_file(job_id)
        return None

    decoded.pop("_expires_at", None)
    return decoded


async def _write_job_file(job_id: str, job: dict[str, Any]) -> None:
    JOB_FILE_STORE_DIR.mkdir(parents=True, exist_ok=True)

    payload = dict(job)
    payload["id"] = job_id
    payload["_expires_at"] = time.time() + REDIS_JOB_TTL_SECONDS

    job_file = _job_file_path(job_id)
    temp_file = job_file.with_suffix(".tmp")

    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        temp_file.replace(job_file)
    except Exception as exc:
        raise JobStoreUnavailableError("Failed to write job to file store.") from exc


async def _get_redis() -> Any:
    global redis_client
    if file_store_fallback_enabled:
        raise JobStoreUnavailableError("Redis is disabled while file fallback is active.")
    if redis_client is None:
        try:
            from redis.asyncio import Redis  # type: ignore[reportMissingImports]
        except ModuleNotFoundError as exc:
            raise JobStoreUnavailableError(
                "Redis client is not installed. Run pip install -r requirements.txt."
            ) from exc
        redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
    return redis_client


async def _read_job_redis(job_id: str) -> dict[str, Any] | None:
    client = await _get_redis()
    try:
        payload = await client.get(_job_key(job_id))
    except Exception as exc:
        raise JobStoreUnavailableError("Failed to read job from Redis.") from exc
    if payload is None:
        return None
    try:
        decoded = json.loads(payload)
    except json.JSONDecodeError:
        logger.error("Corrupted Redis payload for job {}", job_id)
        try:
            await client.delete(_job_key(job_id))
        except Exception:
            logger.exception("Failed to delete corrupted payload for job {}", job_id)
        return None
    if not isinstance(decoded, dict):
        logger.error("Unexpected job payload type for job {}", job_id)
        try:
            await client.delete(_job_key(job_id))
        except Exception:
            logger.exception("Failed to delete invalid payload for job {}", job_id)
        return None
    return decoded


async def _write_job_redis(job_id: str, job: dict[str, Any]) -> None:
    client = await _get_redis()
    payload = dict(job)
    payload["id"] = job_id
    try:
        await client.set(
            _job_key(job_id),
            json.dumps(payload, ensure_ascii=False),
            ex=REDIS_JOB_TTL_SECONDS,
        )
    except Exception as exc:
        raise JobStoreUnavailableError("Failed to write job to Redis.") from exc


async def _read_job(job_id: str) -> dict[str, Any] | None:
    if file_store_fallback_enabled:
        return await _read_job_file(job_id)

    try:
        return await _read_job_redis(job_id)
    except JobStoreUnavailableError as exc:
        if JOB_STORE_BACKEND == "redis":
            raise
        _enable_file_store_fallback(str(exc))
        return await _read_job_file(job_id)


async def _write_job(job_id: str, job: dict[str, Any]) -> None:
    if file_store_fallback_enabled:
        await _write_job_file(job_id, job)
        return

    try:
        await _write_job_redis(job_id, job)
    except JobStoreUnavailableError as exc:
        if JOB_STORE_BACKEND == "redis":
            raise
        _enable_file_store_fallback(str(exc))
        await _write_job_file(job_id, job)


async def _update_job(
    job_id: str,
    patch: dict[str, Any] | None = None,
    append_log: str | None = None,
) -> dict[str, Any] | None:
    job = await _read_job(job_id)
    if job is None:
        return None

    if patch:
        job.update(patch)

    if append_log is not None:
        logs = job.get("logs")
        if not isinstance(logs, list):
            logs = []
        logs.append(append_log)
        job["logs"] = logs

    await _write_job(job_id, job)
    return job


def _file_url_to_path(file_url: str) -> Path:
    parsed = urlparse(file_url)
    if parsed.scheme != "file":
        return Path(file_url)

    parsed_path = unquote(parsed.path)
    if os.name == "nt":
        parsed_path = parsed_path.lstrip("/")
    return Path(parsed_path)


def _normalize_candidates_map_for_job(
    candidates_by_scene: dict[int, list[dict[str, Any]]],
) -> dict[str, list[dict[str, Any]]]:
    return {str(k): v for k, v in candidates_by_scene.items()}


def _guess_media_ext(media_url: str, media_type: str | None) -> str:
    parsed = urlparse(media_url)
    suffix = Path(parsed.path).suffix.lower()
    if suffix in {".mp4", ".mov", ".webm", ".jpg", ".jpeg", ".png"}:
        return suffix

    if media_type == "video":
        return ".mp4"
    return ".jpg"

@router.post("/jobs")
async def create_job(request: JobCreate, background_tasks: BackgroundTasks):
    job_id = uuid.uuid4().hex[:12]
    job_payload = {
        "id": job_id,
        "status": "parsing",
        "progress": 0,
        "logs": ["Job created", "Starting AI pipeline (Props Generation)..."],
        "props": None,
        "video_url": None,
        "error": None
    }

    try:
        await _write_job(job_id, job_payload)
    except JobStoreUnavailableError as exc:
        logger.exception("Job store unavailable while creating job {}", job_id)
        raise HTTPException(status_code=503, detail="Job store unavailable") from exc
    
    background_tasks.add_task(process_job_props, job_id, request.text, request.voice, request.rate)
    return {"job_id": job_id}

@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    try:
        job = await _read_job(job_id)
    except JobStoreUnavailableError as exc:
        logger.exception("Job store unavailable while reading job {}", job_id)
        raise HTTPException(status_code=503, detail="Job store unavailable") from exc

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs/{job_id}/rerank-media")
async def rerank_job_media(job_id: str, request: RerankMediaRequest):
    try:
        job = await _read_job(job_id)
    except JobStoreUnavailableError as exc:
        logger.exception("Job store unavailable while reranking media for job {}", job_id)
        raise HTTPException(status_code=503, detail="Job store unavailable") from exc

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    props = request.video_props or job.get("props")
    if not isinstance(props, dict):
        raise HTTPException(status_code=400, detail="Missing video props for reranking")

    scenes = props.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise HTTPException(status_code=400, detail="Props must contain non-empty scenes")

    max_candidates = request.max_candidates or VLM_RERANK_MAX_CANDIDATES

    try:
        await _update_job(
            job_id,
            patch={"progress": 75, "error": None},
            append_log="Reranking media candidates with VLM...",
        )

        # Use cached candidates from job state when available
        cached_candidates = job.get("media_candidates")
        if isinstance(cached_candidates, dict) and cached_candidates:
            # Convert string keys back to int keys
            candidates_by_scene: dict[int, list[dict[str, Any]]] = {
                int(k): v for k, v in cached_candidates.items()
            }
            logger.info("Using cached media candidates for job {}", job_id)
        else:
            # Re-collect only if no cache exists
            candidates_by_scene = await collect_scene_media_candidates(
                scenes,
                max_candidates=max_candidates,
            )

        scenes_with_top_fallback = apply_top_media_from_candidates(
            scenes,
            candidates_by_scene,
        )
        reranked_scenes, decisions = await rerank_candidates_by_scene(
            scenes_with_top_fallback,
            candidates_by_scene,
            max_candidates=max_candidates,
        )

        updated_props = dict(props)
        updated_props["scenes"] = reranked_scenes

        await _update_job(
            job_id,
            patch={
                "status": "review_ready",
                "progress": 100,
                "props": updated_props,
                "media_candidates": _normalize_candidates_map_for_job(candidates_by_scene),
                "media_rerank": {str(k): v for k, v in decisions.items()},
                "error": None,
            },
            append_log="Media rerank complete. Review updated props before render.",
        )

        return {
            "status": "ok",
            "props": updated_props,
            "media_candidates": _normalize_candidates_map_for_job(candidates_by_scene),
            "media_rerank": {str(k): v for k, v in decisions.items()},
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Media rerank failed for job {}", job_id)
        try:
            await _update_job(
                job_id,
                patch={"error": str(exc)},
                append_log=(
                    "Rerank failed. Falling back to current media selection. "
                    f"Detail: {str(exc)}"
                ),
            )
        except JobStoreUnavailableError:
            logger.exception("Failed to persist rerank failure for job {}", job_id)

        raise HTTPException(status_code=500, detail=f"Rerank failed: {str(exc)}") from exc

@router.post("/render")
async def start_render(request: RenderRequest, background_tasks: BackgroundTasks):
    job_id = request.job_id
    try:
        updated_job = await _update_job(
            job_id,
            patch={"status": "rendering", "progress": 0, "error": None},
            append_log="User approved JSON. Starting video render...",
        )
    except JobStoreUnavailableError as exc:
        logger.exception("Job store unavailable while starting render for job {}", job_id)
        raise HTTPException(status_code=503, detail="Job store unavailable") from exc

    if updated_job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    
    background_tasks.add_task(process_job_render, job_id, request.video_props)
    return {"status": "started"}

async def process_job_props(job_id: str, text: str, voice: str, rate: float):
    try:
        await _update_job(
            job_id,
            patch={"progress": 10},
            append_log="Running parser, TTS, and media search...",
        )

        # Step 1: Run pipeline with skip_render=True to get JSON
        # Path returned is the video_props.json path
        props_path = await run_pipeline(
            text=text,
            job_id=job_id,
            voice=voice,
            rate=rate,
            skip_render=True
        )
        
        # Read the JSON back to return to UI
        with open(props_path, "r", encoding="utf-8") as f:
            props_data = json.load(f)

        scenes = props_data.get("scenes", [])
        candidates_by_scene = await collect_scene_media_candidates(
            scenes,
            max_candidates=VLM_RERANK_MAX_CANDIDATES,
        )
        props_data["scenes"] = apply_top_media_from_candidates(
            scenes,
            candidates_by_scene,
        )

        # ── Auto-rerank with VLM if enabled ──
        media_rerank: dict[str, Any] = {}
        if VLM_RERANK_ENABLED:
            try:
                await _update_job(
                    job_id,
                    patch={"progress": 80},
                    append_log="Auto-reranking media with VLM...",
                )
                reranked_scenes, decisions = await rerank_candidates_by_scene(
                    props_data["scenes"],
                    candidates_by_scene,
                    max_candidates=VLM_RERANK_MAX_CANDIDATES,
                )
                props_data["scenes"] = reranked_scenes
                media_rerank = {str(k): v for k, v in decisions.items()}
                logger.info("Auto-rerank complete for job {}", job_id)
            except Exception as rerank_exc:
                logger.warning(
                    "Auto-rerank failed for job {}: {}. Keeping top-1 selection.",
                    job_id, rerank_exc,
                )

        await _update_job(
            job_id,
            patch={
                "status": "review_ready",
                "progress": 100,
                "props": props_data,
                "media_candidates": _normalize_candidates_map_for_job(candidates_by_scene),
                "media_rerank": media_rerank,
                "error": None,
            },
            append_log="AI pipeline complete. Video Props ready for review."
            + (" (VLM media rerank applied)" if media_rerank else ""),
        )
        
    except Exception as exc:
        logger.exception("Prop generation failed for job {}", job_id)
        try:
            await _update_job(
                job_id,
                patch={"status": "failed", "error": str(exc)},
                append_log=f"ERROR: {str(exc)}",
            )
        except JobStoreUnavailableError:
            logger.exception("Failed to persist prop-generation failure for job {}", job_id)

async def process_job_render(job_id: str, video_props: dict):
    try:
        job_dir = Path(OUTPUT_DIR) / job_id

        await _update_job(
            job_id,
            patch={"progress": 20},
            append_log="Staging assets for Remotion...",
        )
        
        # ── Step 5 from orchestrator: Stage assets for Remotion ──
        logger.info("Staging assets for job {}", job_id)
        remotion_assets_dir = Path(REMOTION_DIR) / "public" / "assets" / job_id
        remotion_assets_dir.mkdir(parents=True, exist_ok=True)

        # Update props with Remotion-relative paths
        final_props = video_props.copy()
        
        # Copy and update audio
        # Support both absolute paths (from audit fix) and file:// URIs (legacy)
        audio_url = final_props.get("audio_url", "")
        if isinstance(audio_url, str) and not audio_url.startswith(("http://", "https://", "assets/")):
            if audio_url.startswith("file://"):
                audio_source = _file_url_to_path(audio_url)
            else:
                audio_source = Path(audio_url)
            if not audio_source.exists():
                audio_source = job_dir / "audio" / "full.mp3"
            
            if audio_source.exists():
                audio_dest = remotion_assets_dir / "full.mp3"
                shutil.copy2(str(audio_source), str(audio_dest))
                final_props["audio_url"] = f"assets/{job_id}/full.mp3"

        # Copy and update media for each scene
        for scene in final_props.get("scenes", []):
            if not isinstance(scene, dict):
                continue
            media_url = scene.get("media_url")
            if not isinstance(media_url, str) or not media_url:
                continue
            if media_url.startswith(("http://", "https://")):
                # Remote URL: download and stage
                scene_index = int(scene.get("scene_index", 0))
                media_type = scene.get("media_type")
                ext = _guess_media_ext(media_url, media_type)
                media_filename = f"scene_{scene_index}{ext}"
                local_media_path = remotion_assets_dir / media_filename
                try:
                    await download_media(media_url, str(local_media_path))
                    scene["media_url"] = f"assets/{job_id}/{media_filename}"
                except Exception as e:
                    logger.warning(
                        "Failed to stage remote media for scene {}: {}",
                        scene_index,
                        e,
                    )
                    scene["media_url"] = None
                    scene["media_type"] = None
            elif not media_url.startswith("assets/"):
                # Local path (absolute or file:// URI): copy and stage
                if media_url.startswith("file://"):
                    media_source = _file_url_to_path(media_url)
                else:
                    media_source = Path(media_url)
                if media_source.exists():
                    media_filename = media_source.name
                    shutil.copy2(str(media_source), str(remotion_assets_dir / media_filename))
                    scene["media_url"] = f"assets/{job_id}/{media_filename}"

        # Save the FINAL props for rendering
        props_for_render = job_dir / "video_props_render.json"
        with open(props_for_render, "w", encoding="utf-8") as f:
            json.dump(final_props, f, indent=2, ensure_ascii=False)

        await _update_job(
            job_id,
            patch={"progress": 60},
            append_log="Assets staged. Rendering video...",
        )
            
        output_path = job_dir / "final.mp4"
        
        # Call render
        await render_video(props_for_render, output_path)
        
        await _update_job(
            job_id,
            patch={
                "status": "completed",
                "progress": 100,
                "video_url": f"/api/demo/outputs/{job_id}/final.mp4",
                "error": None,
            },
            append_log="Video render complete!",
        )
        
    except Exception as exc:
        logger.exception("Rendering failed for job {}", job_id)
        try:
            await _update_job(
                job_id,
                patch={"status": "failed", "error": str(exc)},
                append_log=f"ERROR: {str(exc)}",
            )
        except JobStoreUnavailableError:
            logger.exception("Failed to persist rendering failure for job {}", job_id)
