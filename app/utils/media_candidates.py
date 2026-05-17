"""Utilities for collecting and applying per-scene media candidates."""

from __future__ import annotations

import asyncio
from typing import Any

from loguru import logger

from app.pipeline.nodes.media.searcher import collect_media_candidates, pick_top_candidate


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

        # Only search media for scenes that actually display it
        if scene_type not in ("stock_background", "media_showcase", "title_card", "cryptovn101_news"):
            return scene_index, []

        # Fall back to LLM semantic queries when base queries are null
        effective_image_q = image_query or semantic_image_query
        effective_video_q = video_query or semantic_video_query

        if not effective_image_q and not effective_video_q:
            return scene_index, []

        query = effective_image_q or effective_video_q or ""
        prefer_video = True

        try:
            candidates = await collect_media_candidates(
                query,
                video_query=effective_video_q,
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
    """Apply first-ranked candidate media to scenes for preview props."""
    updated: list[dict[str, Any]] = []
    for scene in scenes:
        scene_copy = dict(scene)
        scene_index = int(scene_copy.get("scene_index", 0))
        candidates = candidates_by_scene.get(scene_index, [])
        top = pick_top_candidate(candidates)

        if top:
            media_type = top.get("type")
            media_url = top.get("url")
            scene_copy["media_url"] = media_url
            scene_copy["media_type"] = media_type
            scene_copy["poster_url"] = (
                top.get("thumbnail") if media_type == "video" else media_url
            )
        else:
            scene_copy["media_url"] = None
            scene_copy["media_type"] = None
            scene_copy["poster_url"] = None

        updated.append(scene_copy)

    return updated
