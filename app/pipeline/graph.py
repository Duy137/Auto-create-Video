"""Deterministic agentic AutoClip pipeline runner."""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Callable

from app.pipeline.stages.content_stage import ContentStage
from app.pipeline.stages.media_stage import MediaStage
from app.pipeline.stages.qc_stage import QC_THRESHOLD_CONTENT, QCStage
from app.pipeline.stages.render_stage import RenderStage
from app.pipeline.stages.script_stage import ScriptStage
from app.pipeline.stages.story_beats_stage import StoryBeatsStage
from app.pipeline.stages.timing_stage import TimingStage
from app.pipeline.stages.tts_stage import TTSStage
from app.pipeline.stages.validator_stage import ValidatorStage
from app.state import (
    AgentJobSettings,
    AgentState,
    ColorPalette,
    Scene,
    VideoProps,
    WordTimestamp,
)
from app.utils.video_settings import build_video_settings, resolve_output_dimensions
from config import OUTPUT_DIR


_validator = ValidatorStage()
_content = ContentStage()
_tts = TTSStage()
_media = MediaStage(use_reranker=True)
_timing = TimingStage()
_render = RenderStage()
_script_stage = ScriptStage()
_story_beats = StoryBeatsStage()
_qc_content = QCStage(stage="content")
_qc_media = QCStage(stage="media")


class PipelineStageError(RuntimeError):
    """Raised when a stage records a failure that should stop the pipeline."""

    def __init__(self, stage_name: str, error: str) -> None:
        self.stage_name = stage_name
        self.stage_error = error
        super().__init__(f"Stage '{stage_name}' failed: {error}")


async def run_agentic_pipeline(
    initial_state: AgentState,
    progress_callback: Callable[[str, str, float], None] | None = None,
) -> AgentState:
    """Điểm khởi chạy (entry point) tương thích ngược để chạy toàn bộ chu trình pipeline."""
    return await run_agentic_chain(initial_state, render=True)


def _has_critical_story_beats_signals(state: AgentState) -> bool:
    """Kiểm tra xem VLM audit có báo lỗi nghiêm trọng (không tìm thấy media hoặc sai tỉ lệ khung hình) hay không."""
    trigger = {"no_selection", "aspect_mismatch"}
    for decision in state.rerank_decisions.values():
        if not isinstance(decision, dict):
            continue
        audit = decision.get("audit")
        if not isinstance(audit, dict):
            continue
        if trigger & set(audit.get("signals") or []):
            return True
    return False


def _build_video_props_from_state(state: AgentState) -> dict:
    """Đóng gói toàn bộ dữ liệu từ State thành file video_props (chuẩn JSON) để đưa cho Remotion render."""
    if not state.scenes:
        raise ValueError("Cannot build video props without scenes")
    if not state.audio_path:
        raise ValueError("Cannot build video props without audio_path")
    if not state.word_timestamps:
        raise ValueError("Cannot build video props without word_timestamps")

    video_settings = build_video_settings(state.settings.model_dump())
    if state.background_preset:
        video_settings.background_preset = state.background_preset

    width, height = resolve_output_dimensions(video_settings.aspect_ratio)
    render_word_timestamps = state.display_word_timestamps or state.word_timestamps or []
    video_props = VideoProps(
        job_id=state.job_id,
        title=state.title or "AutoClip Video",
        color_palette=ColorPalette(**(state.color_palette or {
            "primary": "#FF6B35",
            "secondary": "#004E89",
            "background": "#1A1A2E",
            "text": "#FFFFFF",
        })),
        audio_url=state.audio_path,
        word_timestamps=[WordTimestamp(**wt) for wt in render_word_timestamps],
        scenes=[Scene(**scene) for scene in state.scenes],
        width=width,
        height=height,
        settings=video_settings,
    )
    return video_props.model_dump(by_alias=True)


def _persist_video_props(job_id: str, video_props: dict) -> Path:
    """Lưu dữ liệu video_props thành file JSON vật lý vào thư mục output của job."""
    job_dir = Path(OUTPUT_DIR) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    props_path = job_dir / "video_props.json"
    props_path.write_text(
        json.dumps(video_props, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return props_path


def _check_stage_failure(state: AgentState, stage_name: str) -> None:
    """Kiểm tra xem stage vừa chạy có bị lỗi hay không, nếu có thì dừng toàn bộ pipeline."""
    if state.failures and state.failures[-1].worker_name == stage_name:
        raise PipelineStageError(stage_name, state.failures[-1].error)


async def run_agentic_chain(state: AgentState, *, render: bool = False) -> AgentState:
    """Chạy toàn bộ chu trình pipeline theo thứ tự các bước định sẵn.

    Chu trình này có khả năng tự động bỏ qua (skip) những bước đã hoàn thành trước đó (dựa vào data trong state).
    Nhờ vậy, nếu chạy lại (resume), ta sẽ không bị mất tiền API cho các bước đắt đỏ (như TTS hoặc Media) đã làm xong.
    """
    if render and state.final_mp4_path:
        return state.model_copy(update={"is_done": True})

    if state.user_input_mode == "topic" and not state.effective_script():
        state = await _script_stage(state)
        _check_stage_failure(state, "script_agent")

    if not state.scenes:
        state = await _validator(state)
        _check_stage_failure(state, "validator")
        state = await _content(state)
        _check_stage_failure(state, "content")

    while state.scenes:
        if "content_qc" not in state.qc_scores:
            state = await _qc_content(state)
            _check_stage_failure(state, "qc")

        if state.qc_scores.get("content_qc", 1.0) >= QC_THRESHOLD_CONTENT:
            break

        if not state.can_retry("content"):
            break

        state.consume_retry("content")
        state = await _content(state)
        _check_stage_failure(state, "content")

    if not state.audio_path or not state.word_timestamps:
        state = await _tts(state)
        _check_stage_failure(state, "tts")

    scenes_for_check = state.scenes or []
    has_any_media = any(scene.get("media_url") for scene in scenes_for_check)
    if scenes_for_check and not has_any_media:
        state = await _media(state)
        _check_stage_failure(state, "media")

    if "media_qc" not in state.qc_scores:
        state = await _qc_media(state)
        _check_stage_failure(state, "qc")

    if (
        _has_critical_story_beats_signals(state)
        and state.story_beats_applied_count == 0
    ):
        state = await _story_beats(state)
        _check_stage_failure(state, "story_beats")

    needs_timing = bool(
        state.scenes
        and state.scenes[0].get("start_ms") is None
    )
    if needs_timing:
        state = await _timing(state)
        _check_stage_failure(state, "timing")

    if render:
        state = await _render(state)
        _check_stage_failure(state, "render")
        return state

    video_props = _build_video_props_from_state(state)
    _persist_video_props(state.job_id, video_props)
    return state.model_copy(update={
        "video_props": video_props,
        "is_done": True,
    })


async def run_agentic_pipeline_from_text(
    text: str,
    user_id: int,
    job_id: str | None = None,
    settings: AgentJobSettings | None = None,
    skip_render: bool = False,
) -> AgentState:
    """Hàm tiện ích để chạy nhanh pipeline từ Text mà không cần thông qua API (dùng cho CLI, demo)."""
    initial_state = AgentState(
        job_id=job_id or uuid.uuid4().hex[:12],
        user_id=user_id,
        user_input_mode="script",
        user_input=text,
        settings=settings or AgentJobSettings(),
    )
    return await run_agentic_chain(initial_state, render=not skip_render)
