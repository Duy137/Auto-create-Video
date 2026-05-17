"""RenderStage — assembles VideoProps, stages assets, triggers Remotion render."""
from __future__ import annotations

import json
from pathlib import Path

from app.state import AgentState
from app.pipeline.stages.base import BaseStage
from app.pipeline.nodes.rendering.thumbnail import extract_thumbnail
from app.progress import emit_progress
from app.state import ColorPalette, Scene, VideoProps, VideoSettings, WordTimestamp
from config import OUTPUT_DIR


class RenderStage(BaseStage):
    name = "render"

    async def run(self, state: AgentState) -> AgentState:
        _require(state.scenes, "scenes")
        _require(state.audio_path, "audio_path")
        _require(state.word_timestamps, "word_timestamps")

        await emit_progress({
            "phase": "render",
            "step_key": "stage_assets",
            "message": "Đang chuẩn bị tài nguyên render...",
            "tool_name": "Asset Staging",
        })

        from app.utils.asset_staging import stage_assets_for_remotion
        from app.utils.video_settings import build_video_settings, resolve_output_dimensions
        from app.pipeline.nodes.rendering.renderer import render_video

        job_dir = Path(OUTPUT_DIR) / state.job_id
        settings_dict = state.settings.model_dump()

        # Assemble VideoProps
        parsed_title = state.title or "AutoClip Video"
        parsed_palette = state.color_palette or {
            "primary": "#FF6B35",
            "secondary": "#004E89",
            "background": "#1A1A2E",
            "text": "#FFFFFF",
        }

        video_settings = build_video_settings(settings_dict)
        if state.background_preset:
            video_settings.background_preset = state.background_preset
        width, height = resolve_output_dimensions(video_settings.aspect_ratio)
        render_word_timestamps = state.display_word_timestamps or state.word_timestamps or []
        video_props = VideoProps(
            job_id=state.job_id,
            title=parsed_title,
            color_palette=ColorPalette(**parsed_palette),
            audio_url=state.audio_path or "",
            word_timestamps=[WordTimestamp(**wt) for wt in render_word_timestamps],
            scenes=[Scene(**s) for s in (state.scenes or [])],
            width=width,
            height=height,
            settings=video_settings,
        )

        # Persist video_props.json
        props_path = job_dir / "video_props.json"
        props_path.write_text(
            json.dumps(video_props.model_dump(by_alias=True), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        # Stage assets and render
        render_props_path = await stage_assets_for_remotion(
            state.job_id, video_props.model_dump(by_alias=True), job_dir
        )
        await emit_progress({
            "phase": "render",
            "step_key": "stage_assets",
            "mark_done": True,
            "intermediate_result": "Tài nguyên render đã sẵn sàng.",
        })

        await emit_progress({
            "phase": "render",
            "step_key": "render_frames",
            "message": "Đang kết xuất khung hình video...",
            "tool_name": "Remotion Renderer",
        })
        output_path = job_dir / "final.mp4"
        await render_video(render_props_path, output_path)
        await emit_progress({
            "phase": "render",
            "step_key": "render_frames",
            "mark_done": True,
            "intermediate_result": "Đã kết xuất xong video MP4.",
        })
        extract_thumbnail(output_path, job_dir / "thumbnail.jpg")

        await emit_progress({
            "phase": "render",
            "step_key": "finish_video",
            "mark_done": True,
            "message": "Video đã sẵn sàng.",
            "status": "done",
        })

        return state.model_copy(update={
            "video_props": video_props.model_dump(by_alias=True),
            "final_mp4_path": str(output_path),
            "is_done": True,
        })


def _require(value, name: str) -> None:
    if value is None:
        raise ValueError(f"RenderStage requires '{name}' in state")
