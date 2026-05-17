"""TTSStage — self-contained TTS synthesis + alignment workflow."""
from __future__ import annotations

from pathlib import Path

from loguru import logger

from app.state import AgentJobSettings, AgentState
from app.pipeline.stages.base import BaseStage
from app.progress import emit_progress
from app.pipeline.nodes.audio.preprocessor import preprocess_for_tts
from app.pipeline.nodes.audio.synthesizer import TTSResult, get_tts_engine
from app.pipeline.nodes.audio.aligner import align_words, estimate_timestamps_from_duration
from app.state import WordTimestamp
from app.utils.tts_text_processing import build_display_word_timestamps
from config import OUTPUT_DIR


class TTSStage(BaseStage):
    name = "tts"

    async def run(self, state: AgentState) -> AgentState:
        if not state.scenes:
            raise ValueError("Scenes must be available before TTS")

        await emit_progress({
            "phase": "create_processing",
            "step_key": "synthesize_tts",
            "message": "Đang chuẩn hóa văn bản cho TTS...",
            "tool_name": "TTS Preprocessor",
        })

        job_dir = Path(OUTPUT_DIR) / state.job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        deduped_narrations = self._dedup_narrations(
            [str(scene.get("narration", "")) for scene in state.scenes]
        )
        processed_narrations, processed_word_counts = self._preprocess(
            deduped_narrations,
            state.settings.tts_engine,
        )

        processed_full = " ".join(processed_narrations)

        await emit_progress({
            "phase": "create_processing",
            "step_key": "synthesize_tts",
            "message": "Đang tổng hợp audio TTS...",
            "tool_name": f"TTS Engine ({state.settings.tts_engine})",
        })
        tts_result = await self._synthesize(
            processed_full=processed_full,
            settings=state.settings,
            job_dir=job_dir,
        )

        if tts_result.token_usage:
            state.record_token_usage(tts_result.token_usage)

        await emit_progress({
            "phase": "create_processing",
            "step_key": "synthesize_tts",
            "mark_done": True,
            "intermediate_result": f"Audio dài {round(tts_result.duration_ms / 1000, 1)} giây.",
        })

        await emit_progress({
            "phase": "create_processing",
            "step_key": "align_words",
            "message": "Đang căn chữ theo audio...",
            "tool_name": "Word Aligner",
        })

        timing_word_timestamps = await self._align(
            tts_result,
            processed_full=processed_full,
        )

        display_word_timestamps = build_display_word_timestamps(
            deduped_narrations,
            timing_word_timestamps,
            processed_word_counts,
            state.settings.tts_engine,
        )

        await emit_progress({
            "phase": "create_processing",
            "step_key": "align_words",
            "mark_done": True,
            "intermediate_result": f"Đã căn {len(timing_word_timestamps)} mốc từ.",
        })

        return state.model_copy(update={
            "audio_path": str(Path(tts_result.audio_path).resolve()),
            "duration_ms": tts_result.duration_ms,
            "word_timestamps": [wt.model_dump() for wt in timing_word_timestamps],
            "display_word_timestamps": [wt.model_dump() for wt in display_word_timestamps],
            "processed_word_counts": processed_word_counts,
        })

    @staticmethod
    def _dedup_narrations(narrations: list[str]) -> list[str]:
        deduped = list(narrations)
        for i in range(len(deduped) - 1):
            current = deduped[i]
            next_narr = deduped[i + 1]
            if len(current) > len(next_narr) and current.endswith(next_narr):
                deduped[i] = current[: -len(next_narr)].rstrip()
                logger.warning(
                    "  Dedup: scene {} narration overlapped with scene {} — trimmed",
                    i,
                    i + 1,
                )
        return deduped

    @staticmethod
    def _preprocess(narrations: list[str], engine_name: str) -> tuple[list[str], list[int]]:
        processed_narrations: list[str] = []
        processed_word_counts: list[int] = []
        for narration in narrations:
            processed = preprocess_for_tts(narration, engine_name=engine_name)
            processed_narrations.append(processed)
            processed_word_counts.append(len(processed.split()))
        return processed_narrations, processed_word_counts

    @staticmethod
    async def _synthesize(
        processed_full: str,
        settings: AgentJobSettings,
        job_dir: Path,
    ) -> TTSResult:
        engine_kwargs: dict[str, str] = {}
        if settings.tts_engine == "elevenlabs":
            engine_kwargs["elevenlabs_model"] = "eleven_v3"
        elif settings.tts_engine == "gemini":
            engine_kwargs["gemini_model"] = "gemini-3.1-flash-tts-preview"

        engine = get_tts_engine(settings.tts_engine, **engine_kwargs)
        audio_dir = job_dir / "audio"
        return await engine.synthesize(
            text=processed_full,
            voice=settings.voice,
            rate=settings.speech_rate,
            output_dir=str(audio_dir),
        )

    @staticmethod
    async def _align(tts_result: TTSResult, processed_full: str) -> list[WordTimestamp]:
        if tts_result.word_boundaries:
            logger.info(
                "  Using native timestamps from TTS engine ({} words)",
                len(tts_result.word_boundaries),
            )
            return [
                WordTimestamp(
                    text=wb["text"],
                    start_ms=wb["start_ms"],
                    end_ms=wb["end_ms"],
                )
                for wb in tts_result.word_boundaries
            ]

        try:
            return await align_words(
                tts_result.audio_path,
                original_text=processed_full,
                language="vi",
            )
        except Exception as e:
            logger.warning("  Whisper alignment failed: {}. Using estimation.", e)
            return estimate_timestamps_from_duration(
                processed_full,
                tts_result.duration_ms,
            )
