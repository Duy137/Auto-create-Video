"""LangGraph orchestrator — real pipeline with all nodes wired up.

Graph: validate → parse → preprocess_tts → [tts + media_search] (parallel) → align → render
State: VideoProps from app/state.py

Data flow (from MASTER_PLAN):
1. validate(text)
2. parse(text) → scenes JSON
3. preprocess_tts(narration) → cleaned text
4. tts(cleaned_text) → full.mp3
5. whisper(full.mp3) → word timestamps  }  parallel with
6. pexels(queries) → media URLs          }  step 4-5
7. Assemble → VideoProps
8. video_props.model_dump() → JSON → video_props.json
9. Remotion render → final.mp4
"""

from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path
from typing import Any

from loguru import logger

from app.state import (
    ColorPalette,
    Scene,
    VideoProps,
    VideoSettings,
    WordTimestamp,
)
from config import OUTPUT_DIR, REMOTION_DIR

# ── Real Node Imports ──
from app.nodes.input_validator import validate_input
from app.nodes.content_parser import parse_content
from app.nodes.tts_preprocessor import preprocess_for_tts
from app.nodes.tts_synthesizer import get_tts_engine
from app.nodes.word_aligner import align_words, estimate_timestamps_from_duration
from app.state import WordTimestamp
from app.nodes.media_searcher import (
    collect_media_candidates,
    download_media,
    pick_top_candidate,
    search_media,
)
from app.nodes.video_renderer import render_video
from app.nodes.media_reranker import rerank_candidates_by_scene


# ══════════════════════════════════════════
# Pipeline Steps
# ══════════════════════════════════════════


async def _step_validate(text: str) -> str:
    """Step 0: Validate input text."""
    logger.info("━━━ Step 0: Input Validation ━━━")
    result = validate_input(text)
    if result.warnings:
        for w in result.warnings:
            logger.warning("  ⚠ {}", w)
    return result.text


async def _step_parse(text: str) -> dict[str, Any]:
    """Step 1: Parse text into structured scenes via LLM."""
    logger.info("━━━ Step 1: Content Parsing (LLM) ━━━")
    parsed = await parse_content(text)
    logger.info(
        "  Parsed: '{}' → {} scenes",
        parsed["title"][:40],
        len(parsed["scenes"]),
    )
    return parsed


async def _step_tts(
    scenes: list[dict],
    job_dir: Path,
    voice: str = "nova",
    rate: float = 1.0,
    engine_name: str = "openai",
    **engine_kwargs,
) -> dict[str, Any]:
    """Step 2A: TTS synthesis + word alignment.

    1. Preprocess each scene's narration individually
    2. Synthesize audio via chosen TTS engine (using processed text)
    3. Align words via Whisper OR use native timestamps if engine provides them
    4. Return per-scene processed word counts for accurate timing
    """
    logger.info("━━━ Step 2A: TTS Synthesis ({}) ━━━", engine_name)

    # Preprocess EACH scene individually to track per-scene word counts
    # First: deduplicate overlapping narrations between consecutive scenes
    deduped_narrations: list[str] = [s["narration"] for s in scenes]
    for i in range(len(deduped_narrations) - 1):
        current = deduped_narrations[i]
        next_narr = deduped_narrations[i + 1]
        # If next scene's narration is a strict suffix of current (not identical), trim it
        if len(current) > len(next_narr) and current.endswith(next_narr):
            deduped_narrations[i] = current[: -len(next_narr)].rstrip()
            logger.warning(
                "  Dedup: scene {} narration overlapped with scene {} — trimmed",
                i, i + 1,
            )

    processed_narrations: list[str] = []
    processed_word_counts: list[int] = []
    original_word_counts: list[int] = []
    for i, narration in enumerate(deduped_narrations):
        processed = preprocess_for_tts(narration, engine_name=engine_name)
        processed_narrations.append(processed)
        processed_word_counts.append(len(processed.split()))
        original_word_counts.append(len(narration.split()))

    # Join processed narrations for TTS and alignment
    processed_full = " ".join(processed_narrations)
    full_narration = " ".join(s["narration"] for s in scenes)
    logger.info(
        "  Preprocessed: {} → {} chars, {} → {} words",
        len(full_narration), len(processed_full),
        len(full_narration.split()), len(processed_full.split()),
    )

    # Synthesize from processed text
    engine = get_tts_engine(engine_name, **engine_kwargs)
    audio_dir = job_dir / "audio"
    tts_result = await engine.synthesize(
        text=processed_full,
        voice=voice,
        rate=rate,
        output_dir=str(audio_dir),
    )
    logger.info("  Audio: {:.1f}s, saved to {}", tts_result.duration_ms / 1000, tts_result.audio_path)

    # Word alignment — smart skip if engine provides native timestamps
    logger.info("━━━ Step 2A.1: Word Alignment ━━━")
    if tts_result.word_boundaries:
        # Engine provided native timestamps (e.g. ElevenLabs) → skip Whisper
        logger.info("  ✅ Using native timestamps from TTS engine ({} words)",
                    len(tts_result.word_boundaries))
        word_timestamps = [
            WordTimestamp(
                text=wb["text"],
                start_ms=wb["start_ms"],
                end_ms=wb["end_ms"],
            )
            for wb in tts_result.word_boundaries
        ]
    else:
        # No native timestamps → run Whisper alignment (OpenAI, Edge-TTS)
        # Use ORIGINAL narration text (not processed) so word_timestamps
        # carry the user's original words for display (e.g. "AI" not "A.I.")
        logger.info("  Running Whisper forced alignment...")
        try:
            word_timestamps = await align_words(
                tts_result.audio_path,
                original_text=full_narration,
                language="vi",
            )
            logger.info("  Aligned {} words via Whisper", len(word_timestamps))
        except Exception as e:
            logger.warning("  Whisper alignment failed: {}. Using estimation.", e)
            word_timestamps = estimate_timestamps_from_duration(
                full_narration, tts_result.duration_ms
            )

    return {
        "audio_url": str(Path(tts_result.audio_path).resolve()),
        "duration_ms": tts_result.duration_ms,
        "word_timestamps": [wt.model_dump() for wt in word_timestamps],
        # Use original word counts (not processed) since word_timestamps
        # now carry original text after the Whisper alignment change
        "processed_word_counts": original_word_counts,
    }


async def _step_media_search(scenes: list[dict], job_dir: Path) -> list[dict]:
    """Step 2B: Search and download media for each scene (parallel with TTS)."""
    logger.info("━━━ Step 2B: Media Search ━━━")

    media_dir = job_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)

    async def _search_for_scene(scene: dict) -> dict:
        """Search media for a single scene."""
        image_query = scene.get("image_query")
        video_query = scene.get("video_query")
        semantic_summary_en = scene.get("semantic_summary_en")
        semantic_image_query = scene.get("semantic_image_query")
        semantic_video_query = scene.get("semantic_video_query")
        scene_type = scene.get("scene_type", "stock_background")

        # ── Skip media search for scenes that don't use stock media ──
        # Only stock_background and media_showcase render external media.
        # Other types (title_card, info_card, stats_highlight, diagram,
        # emoji_grid, comparison, timeline) use gradient/animated backgrounds.
        NEEDS_MEDIA = {"stock_background", "media_showcase", "news_intro"}  # [CryptoVN Custom] news_intro
        if scene_type not in NEEDS_MEDIA:
            scene["media_url"] = None
            scene["media_type"] = None
            return scene

        if not image_query and not video_query:
            return scene

        query = image_query or video_query or ""
        prefer_video = scene_type in ("stock_background", "media_showcase")
        try:
            result = await search_media(
                query,
                video_query=video_query,
                prefer_video=prefer_video,
                retry_on_low_video_hits=prefer_video,
                semantic_summary_en=semantic_summary_en,
                semantic_image_query=semantic_image_query,
                semantic_video_query=semantic_video_query,
            )
            if result:
                scene["media_type"] = result.get("type")

                # Keep remote Pexels CDN URL — browser accessible for review.
                # stage_assets_for_remotion() handles download at render time.
                url = result.get("url", "")
                if url:
                    scene["media_url"] = url  # Remote CDN URL
                else:
                    scene["media_url"] = None
            else:
                scene["media_url"] = None
                scene["media_type"] = None
        except Exception as e:
            logger.warning(
                "  Media search failed for scene {}: {}",
                scene["scene_index"], e,
            )
            scene["media_url"] = None
            scene["media_type"] = None

        return scene

    # Search all scenes in parallel
    tasks = [_search_for_scene(s) for s in scenes]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    updated_scenes = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.warning("  Scene {} media search error: {}", i, result)
            scenes[i]["media_url"] = None
            scenes[i]["media_type"] = None
            updated_scenes.append(scenes[i])
        else:
            updated_scenes.append(result)

    found = sum(1 for s in updated_scenes if s.get("media_url"))
    searched = sum(1 for s in updated_scenes if s.get("scene_type", "stock_background") in {"stock_background", "media_showcase"})
    logger.info("  Media found for {}/{} scenes ({} skipped — non-stock)",
                found, searched, len(updated_scenes) - searched)

    return updated_scenes


async def collect_scene_media_candidates(
    scenes: list[dict[str, Any]],
    max_candidates: int = 5,
) -> dict[int, list[dict[str, Any]]]:
    """Collect media candidates for review-time reranking.

    Returns mapping: scene_index -> candidate list (ordered by source priority).
    """
    logger.info("━━━ Step 2B.review: Collect Media Candidates ━━━")

    async def _collect(scene: dict[str, Any]) -> tuple[int, list[dict[str, Any]]]:
        scene_index = int(scene.get("scene_index", 0))
        image_query = scene.get("image_query")
        video_query = scene.get("video_query")
        semantic_summary_en = scene.get("semantic_summary_en")
        semantic_image_query = scene.get("semantic_image_query")
        semantic_video_query = scene.get("semantic_video_query")
        scene_type = scene.get("scene_type", "stock_background")

        if not image_query and not video_query:
            return scene_index, []

        query = image_query or video_query or ""
        prefer_video = scene_type in ("stock_background", "media_showcase")

        try:
            candidates = await collect_media_candidates(
                query,
                video_query=video_query,
                prefer_video=prefer_video,
                retry_on_low_video_hits=prefer_video,
                max_candidates=max_candidates,
                semantic_summary_en=semantic_summary_en,
                semantic_image_query=semantic_image_query,
                semantic_video_query=semantic_video_query,
            )
            return scene_index, candidates
        except Exception as e:
            logger.warning("  Candidate collect failed for scene {}: {}", scene_index, e)
            return scene_index, []

    tasks = [_collect(scene) for scene in scenes]
    results = await asyncio.gather(*tasks)

    candidates_by_scene = {scene_index: candidates for scene_index, candidates in results}

    found = sum(1 for candidates in candidates_by_scene.values() if candidates)
    logger.info("  Collected candidates for {}/{} scenes", found, len(scenes))
    return candidates_by_scene


def apply_top_media_from_candidates(
    scenes: list[dict[str, Any]],
    candidates_by_scene: dict[int, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Apply first-ranked candidate media to scenes in-place for preview props."""
    updated: list[dict[str, Any]] = []
    for scene in scenes:
        scene_copy = dict(scene)
        scene_index = int(scene_copy.get("scene_index", 0))
        candidates = candidates_by_scene.get(scene_index, [])
        top = pick_top_candidate(candidates)

        if top:
            scene_copy["media_url"] = top.get("url")
            scene_copy["media_type"] = top.get("type")
        else:
            scene_copy["media_url"] = None
            scene_copy["media_type"] = None

        updated.append(scene_copy)

    return updated


def _compute_scene_timing(
    scenes: list[dict],
    word_timestamps: list[dict],
    total_duration_ms: float,
    processed_word_counts: list[int] | None = None,
) -> list[dict]:
    """Compute start_ms/end_ms for each scene using word timestamp boundaries.

    Maps words from word_timestamps to scenes by matching word counts,
    then uses the actual timestamp boundaries for precise scene timing.

    Args:
        scenes: Scene dicts with narration text.
        word_timestamps: Word-level timestamps from alignment.
        total_duration_ms: Total audio duration.
        processed_word_counts: Per-scene word counts from TTS-preprocessed text.
            When provided, these are used instead of raw narration word counts
            to correctly map timestamps (which come from processed audio).

    Falls back to proportional distribution if word counts don't align.
    """
    if not scenes:
        return scenes

    # Use processed word counts (matching actual audio) when available,
    # otherwise fall back to raw narration word counts
    if processed_word_counts and len(processed_word_counts) == len(scenes):
        scene_word_counts = processed_word_counts
    else:
        scene_word_counts = [len(s["narration"].split()) for s in scenes]

    total_scene_words = sum(scene_word_counts)

    if not word_timestamps or total_scene_words == 0:
        # Fallback: proportional distribution
        return _compute_scene_timing_proportional(
            scenes, total_duration_ms, processed_word_counts,
        )

    # ── Map word timestamps to scenes by cumulative word count ──
    # Each scene "owns" a contiguous slice of word_timestamps
    ts_count = len(word_timestamps)

    # Handle mismatch between scene words and timestamp words
    if abs(ts_count - total_scene_words) > max(3, total_scene_words * 0.1):
        logger.warning(
            "Word count mismatch: scenes have {} words, timestamps have {}. "
            "Using proportional fallback.",
            total_scene_words, ts_count,
        )
        return _compute_scene_timing_proportional(
            scenes, total_duration_ms, processed_word_counts,
        )

    # ── Alignment quality validation ──
    # Even if word count matches, timestamps may be catastrophically wrong
    # (e.g. stable-ts fails on Vietnamese audio from certain TTS engines)

    # Check 1: Collapsed timestamps (start ≈ end → alignment couldn't place word)
    collapsed = sum(
        1 for wt in word_timestamps if wt["end_ms"] - wt["start_ms"] < 10
    )
    collapsed_ratio = collapsed / ts_count if ts_count > 0 else 0
    if collapsed_ratio > 0.15:
        logger.warning(
            "Alignment quality poor: {}/{} words collapsed ({:.0%}). "
            "Falling back to proportional timing.",
            collapsed, ts_count, collapsed_ratio,
        )
        return _compute_scene_timing_proportional(
            scenes, total_duration_ms, processed_word_counts,
        )

    # Check 2: Large gaps between consecutive words (misalignment)
    max_gap_ms = 0.0
    gap_word_idx = 0
    for k in range(1, ts_count):
        gap = word_timestamps[k]["start_ms"] - word_timestamps[k - 1]["end_ms"]
        if gap > max_gap_ms:
            max_gap_ms = gap
            gap_word_idx = k
    if max_gap_ms > 5000:
        logger.warning(
            "Alignment has {:.0f}ms gap at word {} '{}'. "
            "Falling back to proportional timing.",
            max_gap_ms, gap_word_idx,
            word_timestamps[gap_word_idx].get("text", "?"),
        )
        return _compute_scene_timing_proportional(
            scenes, total_duration_ms, processed_word_counts,
        )

    # Distribute timestamps to scenes proportionally
    ts_idx = 0
    for i, scene in enumerate(scenes):
        scene_words = scene_word_counts[i]

        if i == len(scenes) - 1:
            # Last scene gets all remaining timestamps
            slice_end = ts_count
        else:
            # Proportional mapping: this scene gets its share of timestamps
            slice_end = min(ts_idx + scene_words, ts_count)

        if ts_idx < ts_count and slice_end > ts_idx:
            scene["start_ms"] = round(word_timestamps[ts_idx]["start_ms"], 1)
            scene["end_ms"] = round(word_timestamps[min(slice_end, ts_count) - 1]["end_ms"], 1)
        elif ts_idx > 0:
            # No timestamps left — use end of previous
            prev_end = word_timestamps[ts_idx - 1]["end_ms"]
            scene["start_ms"] = round(prev_end, 1)
            scene["end_ms"] = round(prev_end + 2000.0, 1)  # minimum 2s
        else:
            scene["start_ms"] = 0.0
            scene["end_ms"] = 2000.0

        # Enforce minimum 2 seconds
        if scene["end_ms"] - scene["start_ms"] < 2000.0:
            scene["end_ms"] = round(scene["start_ms"] + 2000.0, 1)

        ts_idx = slice_end

    # ── Ensure continuity: no gaps or overlaps between scenes ──
    for i in range(1, len(scenes)):
        if scenes[i]["start_ms"] != scenes[i - 1]["end_ms"]:
            scenes[i]["start_ms"] = scenes[i - 1]["end_ms"]
        # Re-enforce minimum 2 seconds after continuity adjustment
        if scenes[i]["end_ms"] - scenes[i]["start_ms"] < 2000.0:
            scenes[i]["end_ms"] = round(scenes[i]["start_ms"] + 2000.0, 1)

    # Ensure last scene covers full audio duration
    if scenes and scenes[-1]["end_ms"] < total_duration_ms:
        scenes[-1]["end_ms"] = round(total_duration_ms, 1)

    return scenes


def _compute_scene_timing_proportional(
    scenes: list[dict],
    total_duration_ms: float,
    processed_word_counts: list[int] | None = None,
) -> list[dict]:
    """Fallback: distribute duration proportionally by word count."""
    if processed_word_counts and len(processed_word_counts) == len(scenes):
        word_counts = processed_word_counts
    else:
        word_counts = [len(s["narration"].split()) for s in scenes]

    total_words = sum(word_counts)
    if total_words == 0:
        total_words = len(scenes)
        word_counts = [1] * len(scenes)

    current_ms = 0.0
    for i, scene in enumerate(scenes):
        scene_words = word_counts[i]
        scene_ratio = scene_words / total_words
        scene_duration = total_duration_ms * scene_ratio
        scene_duration = max(scene_duration, 2000.0)

        scene["start_ms"] = round(current_ms, 1)
        scene["end_ms"] = round(current_ms + scene_duration, 1)
        current_ms += scene_duration

    # Ensure last scene covers full audio duration
    if scenes and scenes[-1]["end_ms"] < total_duration_ms:
        scenes[-1]["end_ms"] = round(total_duration_ms, 1)

    return scenes

# ══════════════════════════════════════════
# Asset Staging (shared by pipeline + render endpoint)
# ══════════════════════════════════════════


async def stage_assets_for_remotion(
    job_id: str,
    video_props_dict: dict,
    job_dir: Path,
) -> Path:
    """Stage assets into remotion/public/ and return render-ready props path.

    Handles 3 media_url formats:
    - https://...       → remote Pexels URL (from re-search in Review) → download then stage
    - file:///D:/...    → file URI (legacy/defensive)                  → parse path, copy
    - D:\\...\\scene_0.jpg → absolute local path (Phase 1 pipeline)      → copy directly

    Copies audio + media → remotion/public/assets/{job_id}/
    Converts all paths to Remotion-relative (assets/{job_id}/...)
    Returns: Path to video_props_render.json
    """
    import shutil
    from urllib.parse import urlparse, unquote

    logger.info("━━━ Staging Assets for Remotion ━━━")
    remotion_assets_dir = Path(REMOTION_DIR) / "public" / "assets" / job_id
    remotion_assets_dir.mkdir(parents=True, exist_ok=True)

    # ── Stage audio ──
    props_dict = dict(video_props_dict)  # shallow copy
    audio_url = props_dict.get("audio_url", "")
    audio_source = _resolve_local_path(audio_url)
    if audio_source is None or not audio_source.exists():
        # Fallback to standard audio location
        audio_source = job_dir / "audio" / "full.mp3"
    if not audio_source.exists():
        raise FileNotFoundError(
            f"Audio file not found at '{audio_url}' "
            f"or fallback {audio_source}"
        )
    audio_dest = remotion_assets_dir / "full.mp3"
    shutil.copy2(str(audio_source), str(audio_dest))
    props_dict["audio_url"] = f"assets/{job_id}/full.mp3"

    # ── Stage media per scene ──
    scenes = props_dict.get("scenes", [])
    for scene in scenes:
        media_url = scene.get("media_url")
        if not media_url:
            continue

        scene_idx = scene.get("scene_index", 0)

        if media_url.startswith("http://") or media_url.startswith("https://"):
            # Remote URL (e.g. from re-search) → download then stage
            ext = ".mp4" if scene.get("media_type") == "video" else ".jpg"
            media_filename = f"scene_{scene_idx}{ext}"
            local_dest = remotion_assets_dir / media_filename
            logger.info(
                "  Staging scene {} remote media: {} → {}",
                scene_idx, media_url[:80], local_dest,
            )
            # Try download with 1 retry on failure
            download_ok = False
            for attempt in range(2):
                try:
                    await download_media(media_url, str(local_dest), timeout=60)
                    scene["media_url"] = f"assets/{job_id}/{media_filename}"
                    logger.info(
                        "  ✅ Scene {} media staged ({:.0f}KB)",
                        scene_idx, local_dest.stat().st_size / 1024,
                    )
                    download_ok = True
                    break
                except Exception as e:
                    if attempt == 0:
                        logger.warning(
                            "  ⚠️ Download attempt 1 failed for scene {}: {}, retrying...",
                            scene_idx, e,
                        )
                    else:
                        logger.error(
                            "  ❌ Download failed for scene {} after 2 attempts: {}",
                            scene_idx, e,
                        )
            if not download_ok:
                scene["media_url"] = None
        else:
            # Local path (absolute or file:// URI) → copy
            local_source = _resolve_local_path(media_url)
            if local_source is None:
                # Try as relative path from job_dir/media/
                media_filename = f"scene_{scene_idx}.mp4"
                local_source = job_dir / "media" / media_filename
                if not local_source.exists():
                    media_filename = f"scene_{scene_idx}.jpg"
                    local_source = job_dir / "media" / media_filename

            if local_source and local_source.exists():
                media_filename = f"scene_{scene_idx}{local_source.suffix}"
                shutil.copy2(
                    str(local_source),
                    str(remotion_assets_dir / media_filename),
                )
                scene["media_url"] = f"assets/{job_id}/{media_filename}"
            else:
                logger.warning(
                    "  Media file not found for scene {}: {}",
                    scene_idx, media_url,
                )
                scene["media_url"] = None

    # Diagnostic: verify staged data matches DB
    logger.info("═══ STAGED RENDER JSON ═══")
    logger.info("  scene_types: {}", [s.get("scene_type") for s in props_dict.get("scenes", [])])
    logger.info("  media_urls:  {}", [str(s.get("media_url", "NONE"))[:60] for s in props_dict.get("scenes", [])])

    # ── Save render-ready props ──
    render_props_path = job_dir / "video_props_render.json"
    render_props_path.write_text(
        json.dumps(props_dict, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    logger.info("  Staged assets to {}", remotion_assets_dir)

    return render_props_path


def _resolve_local_path(url_or_path: str) -> Path | None:
    """Resolve a media URL/path string to a local Path.

    Handles: file:///D:/..., D:\\..., /abs/path
    Returns None if the string is not a local path.
    """
    from urllib.parse import urlparse, unquote

    if not url_or_path:
        return None

    # file:// URI
    if url_or_path.startswith("file:///"):
        parsed = urlparse(url_or_path)
        local = Path(unquote(parsed.path))
        # On Windows, urlparse gives /D:/... → need to strip leading /
        if len(local.parts) > 1 and len(local.parts[0]) == 1 and local.parts[0] == "/":
            local = Path(unquote(parsed.path[1:]))
        return local

    # Remote URL — not local
    if url_or_path.startswith("http://") or url_or_path.startswith("https://"):
        return None

    # Absolute local path
    path = Path(url_or_path)
    if path.is_absolute():
        return path

    return None


# ══════════════════════════════════════════
# Main Pipeline
# ══════════════════════════════════════════


def _build_video_settings(user_settings: dict | None) -> VideoSettings:
    """Build VideoSettings from user-provided settings dict.

    Maps flat JobSettings keys to nested VideoSettings + SubtitleSettings.
    Falls back to defaults for any missing key.
    """
    from app.state import SubtitleSettings

    if not user_settings:
        return VideoSettings()

    subtitle = SubtitleSettings(
        enabled=user_settings.get("subtitle_enabled", True),
        font=user_settings.get("subtitle_font", "NotoSansVN-Bold"),
        font_size=user_settings.get("subtitle_font_size", 48),
        font_color=user_settings.get("subtitle_font_color", "#FFFFFF"),
        highlight_color=user_settings.get("subtitle_highlight_color", "#FF6B35"),
        stroke_color=user_settings.get("subtitle_stroke_color", "#000000"),
        stroke_width=int(user_settings.get("subtitle_stroke_width", 2)),
        position=user_settings.get("subtitle_position", "bottom"),
    )

    return VideoSettings(
        aspect_ratio=user_settings.get("aspect_ratio", "9:16"),
        transition_mode=user_settings.get("transition_mode", "crossfade"),
        bgm_url=user_settings.get("bgm_url"),
        bgm_volume=user_settings.get("bgm_volume", 0.2),
        subtitle=subtitle,
    )


async def run_pipeline(
    text: str,
    job_id: str | None = None,
    voice: str = "nova",
    rate: float = 1.0,
    skip_render: bool = False,
    user_settings: dict | None = None,
    use_reranker: bool = False,
) -> Path:
    """Run the full AutoClip pipeline.

    Args:
        text: Raw input text.
        job_id: Optional custom job ID.
        voice: TTS voice name.
        rate: Speech rate.
        skip_render: If True, skip Remotion render (for testing).
        user_settings: User-provided settings dict from frontend (JobSettings).
        use_reranker: If True, collect multiple media candidates and VLM-rerank
            before timing/render stages.

    Returns:
        Path to the final video file (or video_props.json if skip_render).
    """
    job_id = job_id or uuid.uuid4().hex[:12]
    job_dir = Path(OUTPUT_DIR) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    logger.info("═" * 55)
    logger.info("  AutoClip Pipeline — Job: {}", job_id)
    logger.info("  Input: {} chars, ~{} words", len(text), len(text.split()))
    logger.info("═" * 55)

    # ── Step 0: Validate ──
    validated_text = await _step_validate(text)

    # ── Step 1: Parse (LLM) ──
    parsed = await _step_parse(validated_text)

    # ── Resolve TTS engine from user settings ──
    tts_engine_name = "openai"  # default
    engine_kwargs: dict[str, Any] = {}
    if user_settings:
        tts_engine_name = user_settings.get("tts_engine", "openai")
        if tts_engine_name == "elevenlabs":
            engine_kwargs["elevenlabs_model"] = user_settings.get(
                "elevenlabs_model", "eleven_v3"
            )
        elif tts_engine_name == "gemini":
            engine_kwargs["gemini_model"] = user_settings.get(
                "gemini_model", "gemini-3.1-flash-tts-preview"
            )
        elif tts_engine_name == "vbee":
            pass  # No extra kwargs needed for Vbee

    # ── Step 2A & 2B: TTS + Media Search (PARALLEL) ──
    tts_result, scenes_with_media = await asyncio.gather(
        _step_tts(parsed["scenes"], job_dir, voice=voice, rate=rate,
                  engine_name=tts_engine_name, **engine_kwargs),
        _step_media_search(parsed["scenes"], job_dir),
    )

    # ── Step 2C: VLM Rerank (optional) ──
    if use_reranker:
        logger.info("━━━ Step 2C: VLM Rerank ━━━")
        candidates_by_scene = await collect_scene_media_candidates(
            parsed["scenes"],
            max_candidates=5,
        )
        scenes_with_media, _ = await rerank_candidates_by_scene(
            scenes_with_media,
            candidates_by_scene,
        )
        logger.info("  VLM rerank complete")
    else:
        logger.info("━━━ Step 2C: VLM Rerank skipped (use_reranker=False) ━━━")

    # ── Step 2D: Story Beats Fallback ──  [CryptoVN Custom]
    # After all media search + rerank, any scene that NEEDS media but still
    # has none gets auto-converted to "story_beats" type with emoji+text beats.
    NEEDS_MEDIA_TYPES = {"stock_background", "media_showcase", "news_intro"}
    failed_scenes = [
        s for s in scenes_with_media
        if s.get("scene_type") in NEEDS_MEDIA_TYPES and not s.get("media_url")
    ]
    if failed_scenes:
        logger.info(
            "━━━ Step 2D: Story Beats Fallback ({} scenes without media) ━━━",
            len(failed_scenes),
        )
        from app.nodes.story_beat_extractor import extract_story_beats
        word_ts_dicts = tts_result.get("word_timestamps", [])
        for scene in failed_scenes:
            try:
                beats, _token = await extract_story_beats(scene, word_ts_dicts)
                if beats:
                    scene["scene_type"] = "story_beats"
                    scene["story_beats"] = beats
                    scene["media_url"] = None
                    scene["media_type"] = None
                    logger.info(
                        "  Scene {} → story_beats ({} beats)",
                        scene.get("scene_index"), len(beats),
                    )
            except Exception as e:
                logger.warning(
                    "  Story beat extraction failed for scene {}: {}",
                    scene.get("scene_index"), e,
                )
    else:
        logger.info("━━━ Step 2D: Story Beats Fallback — not needed (all media found) ━━━")

    # ── Step 3: Compute scene timing from audio duration ──
    logger.info("━━━ Step 3: Scene Timing ━━━")
    scenes_timed = _compute_scene_timing(
        scenes_with_media,
        tts_result["word_timestamps"],
        tts_result["duration_ms"],
        processed_word_counts=tts_result.get("processed_word_counts"),
    )

    # ── Step 4: Assemble VideoProps ──
    logger.info("━━━ Step 4: Assemble VideoProps ━━━")
    video_settings = _build_video_settings(user_settings)
    # Merge Director's background_preset into settings
    if parsed.get("background_preset"):
        video_settings.background_preset = parsed["background_preset"]
    video_props = VideoProps(
        job_id=job_id,
        title=parsed["title"],
        color_palette=ColorPalette(**parsed["color_palette"]),
        audio_url=tts_result["audio_url"],
        word_timestamps=[
            WordTimestamp(**wt) for wt in tts_result["word_timestamps"]
        ],
        scenes=[Scene(**s) for s in scenes_timed],
        settings=video_settings,
    )

    # Save video_props.json
    props_path = job_dir / "video_props.json"
    props_path.write_text(
        json.dumps(video_props.model_dump(), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    logger.info("  Saved: {}", props_path)

    if skip_render:
        logger.info("═" * 55)
        logger.info("  Pipeline complete (render skipped)")
        logger.info("  Props: {}", props_path)
        logger.info("═" * 55)
        return props_path

    # ── Step 5: Stage + Render ──
    render_props_path = await stage_assets_for_remotion(
        job_id, video_props.model_dump(), job_dir,
    )

    # ── Step 6: Render via Remotion ──
    logger.info("━━━ Step 6: Remotion Render ━━━")
    output_path = job_dir / "final.mp4"
    await render_video(render_props_path, output_path)

    logger.info("═" * 55)
    logger.info("  ✅ Pipeline complete!")
    logger.info("  Video: {}", output_path)
    logger.info("  Props: {}", props_path)
    logger.info("═" * 55)

    return output_path
