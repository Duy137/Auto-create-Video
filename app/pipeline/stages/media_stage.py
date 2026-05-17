"""MediaStage — wraps media search + optional VLM rerank."""
from __future__ import annotations

import asyncio
import random
from pathlib import Path
from typing import Any

from loguru import logger

from app.state import AgentState
from app.pipeline.stages.base import BaseStage
from app.progress import emit_progress
from app.pipeline.nodes.media.reranker import rerank_candidates_by_scene
from app.pipeline.nodes.media.searcher import search_media
from app.utils.media_candidates import collect_scene_media_candidates
from config import OUTPUT_DIR


class MediaStage(BaseStage):
    name = "media"

    def __init__(self, use_reranker: bool = False) -> None:
        self.use_reranker = use_reranker

    async def run(self, state: AgentState) -> AgentState:
        if not state.scenes:
            raise ValueError("Scenes must be available before media search")

        await emit_progress({
            "phase": "create_processing",
            "step_key": "search_media",
            "message": "Đang tìm media cho các cảnh...",
            "tool_name": "Media Search",
        })

        job_dir = Path(OUTPUT_DIR) / state.job_id
        rerank_decisions: dict[int, dict[str, Any]] = {}

        if not self.use_reranker:
            scenes_with_media = await self._search_all_scenes(list(state.scenes), job_dir)
            media_found = sum(1 for s in scenes_with_media if s.get("media_url"))
            await emit_progress({
                "phase": "create_processing",
                "step_key": "search_media",
                "mark_done": True,
                "intermediate_result": f"Đã tìm media cho {media_found}/{len(scenes_with_media)} cảnh.",
            })
            await emit_progress({
                "phase": "create_processing",
                "step_key": "media_fallback",
                "mark_done": True,
                "intermediate_result": "Hoàn tất đánh giá media cho toàn bộ cảnh.",
            })
            return state.model_copy(update={"scenes": scenes_with_media, "rerank_decisions": {}})

        # Reranker path: collect all candidates first, skip redundant random search
        candidates = await collect_scene_media_candidates(state.scenes, max_candidates=5)
        media_found = sum(1 for c in candidates.values() if c)
        await emit_progress({
            "phase": "create_processing",
            "step_key": "search_media",
            "mark_done": True,
            "intermediate_result": f"Đã thu thập candidates cho {media_found}/{len(state.scenes)} cảnh.",
        })

        await emit_progress({
            "phase": "create_processing",
            "step_key": "media_fallback",
            "message": "Đang đánh giá mức độ phù hợp media...",
            "tool_name": "Media QC",
        })

        try:
            scenes_with_media, rerank_decisions = await rerank_candidates_by_scene(
                list(state.scenes),
                candidates,
            )
            scenes_with_media = self._attach_audit_to_scenes(scenes_with_media, rerank_decisions)
            for decision in rerank_decisions.values():
                token_usage = decision.get("token_usage")
                if token_usage:
                    state.record_token_usage(token_usage)

            failed_count = sum(
                1
                for d in rerank_decisions.values()
                if d.get("audit") and not d["audit"]["passed"]
            )
            if failed_count:
                logger.warning(
                    "MediaStage audit: {}/{} scenes failed.",
                    failed_count,
                    len(rerank_decisions),
                )
            await emit_progress({
                "phase": "create_processing",
                "step_key": "media_fallback",
                "intermediate_result": f"{failed_count} cảnh cần fallback sau khi QC media.",
            })
        except Exception as e:
            logger.warning("Reranker failed ({}), falling back to random.choice from candidates.", e)
            scenes_with_media = self._apply_candidates_randomly(list(state.scenes), candidates)
            rerank_decisions = {}

        await emit_progress({
            "phase": "create_processing",
            "step_key": "media_fallback",
            "mark_done": True,
            "intermediate_result": "Hoàn tất đánh giá media cho toàn bộ cảnh.",
        })

        return state.model_copy(update={"scenes": scenes_with_media, "rerank_decisions": rerank_decisions})

    @staticmethod
    async def _search_all_scenes(scenes: list[dict], job_dir: Path) -> list[dict]:
        """Search media for each scene, preserving scene order."""
        media_dir = job_dir / "media"
        media_dir.mkdir(parents=True, exist_ok=True)

        async def _search_for_scene(scene: dict) -> dict:
            image_query = scene.get("image_query")
            video_query = scene.get("video_query")
            semantic_summary_en = scene.get("semantic_summary_en")
            semantic_image_query = scene.get("semantic_image_query")
            semantic_video_query = scene.get("semantic_video_query")
            scene_type = scene.get("scene_type", "stock_background")

            layout = scene.get("layout")
            needs_media = {"stock_background", "media_showcase", "title_card", "cryptovn101_news"}
            
            if scene_type not in needs_media:
                scene["media_url"] = None
                scene["media_type"] = None
                scene["poster_url"] = None
                return scene

            if not image_query and not video_query:
                return scene

            query = image_query or video_query or ""
            prefer_video = scene_type in ("stock_background", "media_showcase", "title_card", "cryptovn101_news")
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
                    url = result.get("url", "")
                    scene["media_url"] = url or None
                    media_type = scene.get("media_type")
                    scene["poster_url"] = (
                        result.get("thumbnail") if media_type == "video" else url or None
                    )
                else:
                    scene["media_url"] = None
                    scene["media_type"] = None
                    scene["poster_url"] = None
            except Exception as e:
                logger.warning(
                    "  Media search failed for scene {}: {}",
                    scene.get("scene_index", "?"),
                    e,
                )
                scene["media_url"] = None
                scene["media_type"] = None
                scene["poster_url"] = None

            return scene

        results = await asyncio.gather(*[_search_for_scene(s) for s in scenes], return_exceptions=True)

        updated_scenes = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning("  Scene {} media search error: {}", i, result)
                scenes[i]["media_url"] = None
                scenes[i]["media_type"] = None
                scenes[i]["poster_url"] = None
                updated_scenes.append(scenes[i])
            else:
                updated_scenes.append(result)

        found = sum(1 for s in updated_scenes if s.get("media_url"))
        searched = sum(
            1
            for s in updated_scenes
            if s.get("scene_type", "stock_background") in {"stock_background", "media_showcase", "cryptovn101_news"}
            or (s.get("scene_type") == "title_card" and s.get("layout") not in {"standard", "center_focus"})
        )
        logger.info(
            "  Media found for {}/{} scenes ({} skipped — non-stock)",
            found,
            searched,
            len(updated_scenes) - searched,
        )
        return updated_scenes

    @staticmethod
    def _apply_candidates_randomly(
        scenes: list[dict[str, Any]],
        candidates_by_scene: dict[int, list[dict[str, Any]]],
    ) -> list[dict[str, Any]]:
        """Fallback: apply random.choice from collected candidates when reranker fails."""
        updated: list[dict[str, Any]] = []
        for scene in scenes:
            scene_copy = dict(scene)
            scene_index = int(scene_copy.get("scene_index", 0))
            candidates = candidates_by_scene.get(scene_index, [])
            if candidates:
                picked = random.choice(candidates)
                media_type = picked.get("media_type")
                media_url = picked.get("url")
                scene_copy["media_url"] = media_url
                scene_copy["media_type"] = media_type
                scene_copy["poster_url"] = (
                    picked.get("thumbnail") if media_type == "video" else media_url
                )
            else:
                scene_copy["media_url"] = None
                scene_copy["media_type"] = None
                scene_copy["poster_url"] = None
            updated.append(scene_copy)
        return updated

    @staticmethod
    def _attach_audit_to_scenes(
        scenes: list[dict[str, Any]],
        rerank_decisions: dict[int, dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not rerank_decisions:
            return scenes

        out: list[dict[str, Any]] = []
        for scene in scenes:
            scene_copy = dict(scene)
            scene_index = int(scene_copy.get("scene_index", 0))
            decision = rerank_decisions.get(scene_index) or {}
            audit = decision.get("audit")
            if isinstance(audit, dict):
                scene_copy["audit"] = dict(audit)
            out.append(scene_copy)

        return out
