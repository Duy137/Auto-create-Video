"""Video settings helpers."""

from __future__ import annotations

from typing import Any

from loguru import logger

from app.state import VideoSettings


ASPECT_RATIO_DIMENSIONS: dict[str, tuple[int, int]] = {
	"9:16": (1080, 1920),
	"16:9": (1920, 1080),
	"1:1": (1080, 1080),
}


def resolve_output_dimensions(aspect_ratio: str | None) -> tuple[int, int]:
	return ASPECT_RATIO_DIMENSIONS.get(str(aspect_ratio or ""), (1080, 1920))


def resolve_bgm_url(user_settings: dict[str, Any]) -> str | None:
	bgm_mode = user_settings.get("bgm_mode", "none")
	if bgm_mode == "none":
		return None

	if bgm_mode == "library":
		track_id = user_settings.get("bgm_library_id")
		if not track_id:
			return None
		from app.pipeline.nodes.rendering.bgm import resolve_bgm_track_path

		track_path = resolve_bgm_track_path(str(track_id))
		if track_path and track_path.exists():
			return str(track_path)
		logger.warning("Unknown/invalid bgm_library_id: {}", track_id)
		return None

	return user_settings.get("bgm_url")


def build_video_settings(user_settings: dict[str, Any] | None) -> VideoSettings:
	"""Build VideoSettings from user-provided settings dict."""
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
		bgm_url=resolve_bgm_url(user_settings),
		bgm_volume=user_settings.get("bgm_volume", 0.2),
		subtitle=subtitle,
	)
