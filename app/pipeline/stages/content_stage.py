"""ContentStage — wraps pipeline content parsing."""
from __future__ import annotations

from app.state import AgentState
from app.pipeline.stages.base import BaseStage
from app.pipeline.nodes.content.parser import parse_content


class ContentStage(BaseStage):
    name = "content"

    async def run(self, state: AgentState) -> AgentState:
        text = state.effective_script()
        if not text:
            raise ValueError("No script text available for content parsing")
        skip_review = getattr(state.settings, "skip_review", False) if state.settings else False
        parsed = await parse_content(text, skip_review=skip_review)
        from loguru import logger
        logger.info("  Parsed: '{}' → {} scenes", parsed["title"][:40], len(parsed["scenes"]))

        # Collect token usage from content parser phases
        token_usages = parsed.pop("_token_usages", [])
        for u in token_usages:
            state.record_token_usage(u)

        return state.model_copy(update={
            "scenes": parsed["scenes"],
            "title": parsed.get("title"),
            "color_palette": parsed.get("color_palette"),
            "background_preset": parsed.get("background_preset"),
            "qc_scores": {},
            "qc_reasons": {},
            "audio_path": None,
            "duration_ms": None,
            "word_timestamps": None,
            "display_word_timestamps": None,
            "processed_word_counts": None,
            "rerank_decisions": {},
            "story_beats_applied_count": 0,
            "video_props": None,
            "final_mp4_path": None,
        })
