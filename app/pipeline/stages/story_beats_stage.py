"""StoryBeatsStage — convert failed media scenes to story beats fallback."""

from __future__ import annotations

from typing import Any

from app.state import AgentState
from app.pipeline.stages.base import BaseStage
from app.pipeline.nodes.content.story_beats import extract_story_beats


class StoryBeatsStage(BaseStage):
    """Convert media-failed scenes into story_beats scenes."""

    name = "story_beats"

    _TRIGGER_SIGNALS = frozenset({"no_selection", "aspect_mismatch"})
    _CONVERTIBLE_TYPES = {"stock_background", "media_showcase"}

    async def run(self, state: AgentState) -> AgentState:
        if not state.scenes:
            return state
        if not state.rerank_decisions:
            return state

        scenes = [dict(scene) for scene in state.scenes]
        word_ts = self._normalize_word_timestamps(state.word_timestamps)
        converted = 0

        for scene in scenes:
            idx = int(scene.get("scene_index", 0))
            decision = state.rerank_decisions.get(idx) or {}
            audit = decision.get("audit") or {}
            signals = set(audit.get("signals") or [])

            critical = bool(self._TRIGGER_SIGNALS & signals)
            eligible = scene.get("scene_type") in self._CONVERTIBLE_TYPES

            if critical and eligible:
                beats, token_usage = await extract_story_beats(scene, word_ts)
                if token_usage:
                    state.record_token_usage(token_usage)
                if beats:
                    scene["scene_type"] = "story_beats"
                    scene["story_beats"] = beats
                    scene["media_url"] = None
                    scene["media_type"] = None
                    scene["poster_url"] = None
                    converted += 1

        return state.model_copy(update={
            "scenes": scenes,
            "story_beats_applied_count": converted,
        })

    @staticmethod
    def _normalize_word_timestamps(
        word_timestamps: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        if not word_timestamps:
            return []
        return [dict(w) for w in word_timestamps if isinstance(w, dict)]
