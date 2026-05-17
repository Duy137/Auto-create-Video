"""TimingStage — computes start_ms/end_ms for each scene from word timestamps."""
from __future__ import annotations

from loguru import logger

MIN_SCENE_DURATION_MS = 3500.0  # 3.5s minimum display time per scene

from app.state import AgentState
from app.pipeline.stages.base import BaseStage
from app.progress import emit_progress


class TimingStage(BaseStage):
    name = "timing"

    async def run(self, state: AgentState) -> AgentState:
        if not state.scenes:
            raise ValueError("Scenes must be available before timing")
        if not state.word_timestamps or state.duration_ms is None:
            raise ValueError("TTS result (word_timestamps, duration_ms) must be available before timing")

        await emit_progress({
            "phase": "create_processing",
            "step_key": "scene_timing",
            "message": "Đang căn thời lượng cho từng cảnh...",
            "tool_name": "Timing Stage",
        })

        timed = self._compute_timing(
            list(state.scenes),
            state.word_timestamps,
            state.duration_ms,
            processed_word_counts=state.processed_word_counts,
        )
        await emit_progress({
            "phase": "create_processing",
            "step_key": "scene_timing",
            "mark_done": True,
            "intermediate_result": f"Đã căn thời lượng cho {len(timed)} cảnh.",
        })
        return state.model_copy(update={"scenes": timed})

    @staticmethod
    def _compute_timing(
        scenes: list[dict],
        word_timestamps: list[dict],
        total_duration_ms: float,
        processed_word_counts: list[int] | None = None,
    ) -> list[dict]:
        """Compute scene timing from aligned word timestamps."""
        if not scenes:
            return scenes

        if processed_word_counts and len(processed_word_counts) == len(scenes):
            scene_word_counts = processed_word_counts
        else:
            scene_word_counts = [len(str(s.get("narration", "")).split()) for s in scenes]

        total_scene_words = sum(scene_word_counts)

        if not word_timestamps or total_scene_words == 0:
            return TimingStage._compute_proportional(
                scenes,
                total_duration_ms,
                processed_word_counts,
            )

        ts_count = len(word_timestamps)

        if abs(ts_count - total_scene_words) > max(3, total_scene_words * 0.1):
            logger.warning(
                "Word count mismatch: scenes have {} words, timestamps have {}. Using proportional fallback.",
                total_scene_words,
                ts_count,
            )
            return TimingStage._compute_proportional(
                scenes,
                total_duration_ms,
                processed_word_counts,
            )

        collapsed = sum(
            1 for wt in word_timestamps if float(wt.get("end_ms", 0)) - float(wt.get("start_ms", 0)) < 10
        )
        collapsed_ratio = collapsed / ts_count if ts_count > 0 else 0
        if collapsed_ratio > 0.15:
            logger.warning(
                "Alignment quality poor: {}/{} words collapsed ({:.0%}). Falling back to proportional timing.",
                collapsed,
                ts_count,
                collapsed_ratio,
            )
            return TimingStage._compute_proportional(
                scenes,
                total_duration_ms,
                processed_word_counts,
            )

        max_gap_ms = 0.0
        gap_word_idx = 0
        for k in range(1, ts_count):
            gap = float(word_timestamps[k].get("start_ms", 0)) - float(word_timestamps[k - 1].get("end_ms", 0))
            if gap > max_gap_ms:
                max_gap_ms = gap
                gap_word_idx = k
        if max_gap_ms > 5000:
            logger.warning(
                "Alignment has {:.0f}ms gap at word {} '{}'. Falling back to proportional timing.",
                max_gap_ms,
                gap_word_idx,
                word_timestamps[gap_word_idx].get("text", "?"),
            )
            return TimingStage._compute_proportional(
                scenes,
                total_duration_ms,
                processed_word_counts,
            )

        ts_idx = 0
        for i, scene in enumerate(scenes):
            scene_words = scene_word_counts[i]

            if i == len(scenes) - 1:
                slice_end = ts_count
            else:
                slice_end = min(ts_idx + scene_words, ts_count)

            if ts_idx < ts_count and slice_end > ts_idx:
                scene["start_ms"] = round(float(word_timestamps[ts_idx]["start_ms"]), 1)
                scene["end_ms"] = round(float(word_timestamps[min(slice_end, ts_count) - 1]["end_ms"]), 1)
            elif ts_idx > 0:
                prev_end = float(word_timestamps[ts_idx - 1]["end_ms"])
                scene["start_ms"] = round(prev_end, 1)
                scene["end_ms"] = round(prev_end + MIN_SCENE_DURATION_MS, 1)
            else:
                scene["start_ms"] = 0.0
                scene["end_ms"] = MIN_SCENE_DURATION_MS

            if scene["end_ms"] - scene["start_ms"] < MIN_SCENE_DURATION_MS:
                scene["end_ms"] = round(scene["start_ms"] + MIN_SCENE_DURATION_MS, 1)

            ts_idx = slice_end

        for i in range(1, len(scenes)):
            if scenes[i]["start_ms"] != scenes[i - 1]["end_ms"]:
                scenes[i]["start_ms"] = scenes[i - 1]["end_ms"]
            if scenes[i]["end_ms"] - scenes[i]["start_ms"] < MIN_SCENE_DURATION_MS:
                scenes[i]["end_ms"] = round(scenes[i]["start_ms"] + MIN_SCENE_DURATION_MS, 1)

        if scenes and scenes[-1]["end_ms"] < total_duration_ms:
            scenes[-1]["end_ms"] = round(total_duration_ms, 1)

        return scenes

    @staticmethod
    def _compute_proportional(
        scenes: list[dict],
        total_duration_ms: float,
        processed_word_counts: list[int] | None = None,
    ) -> list[dict]:
        """Fallback: distribute duration proportionally by word count."""
        if processed_word_counts and len(processed_word_counts) == len(scenes):
            word_counts = processed_word_counts
        else:
            word_counts = [len(str(s.get("narration", "")).split()) for s in scenes]

        total_words = sum(word_counts)
        if total_words == 0:
            total_words = len(scenes)
            word_counts = [1] * len(scenes)

        current_ms = 0.0
        for i, scene in enumerate(scenes):
            scene_words = word_counts[i]
            scene_ratio = scene_words / total_words
            scene_duration = total_duration_ms * scene_ratio
            scene_duration = max(scene_duration, MIN_SCENE_DURATION_MS)

            scene["start_ms"] = round(current_ms, 1)
            scene["end_ms"] = round(current_ms + scene_duration, 1)
            current_ms += scene_duration

        if scenes and scenes[-1]["end_ms"] < total_duration_ms:
            scenes[-1]["end_ms"] = round(total_duration_ms, 1)

        return scenes
