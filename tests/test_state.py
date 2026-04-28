"""Tests for app.state — Pydantic VideoProps schema (JSON Contract)."""

import json
import pytest


def _sample_video_props() -> dict:
    """Return a minimal valid VideoProps dict in snake_case."""
    return {
        "job_id": "test-job-001",
        "title": "Deploy Agent AI Within Days",
        "color_palette": {
            "primary": "#FF6B35",
            "secondary": "#7B68EE",
            "background": "#0F172A",
            "text": "#FFFFFF",
        },
        "audio_url": "output/test-job-001/audio/full.mp3",
        "word_timestamps": [
            {"text": "Deploy", "start_ms": 0.0, "end_ms": 500.0},
            {"text": "Agent", "start_ms": 500.0, "end_ms": 900.0},
        ],
        "scenes": [
            {
                "scene_index": 0,
                "scene_type": "title_card",
                "narration": "Deploy Agent AI Trong Vài Ngày",
                "visual_description": "Title screen with tech network",
                "start_ms": 0.0,
                "end_ms": 3000.0,
                "image_query": "AI neural network dark background",
                "video_query": "AI technology network digital",
                "media_url": None,
                "media_type": None,
                "keywords_to_highlight": ["Agent AI"],
                "english_phrases": ["Agent AI", "Deploy"],
            }
        ],
        "settings": {
            "aspect_ratio": "9:16",
            "fps": 30,
            "transition_mode": "crossfade",
            "bgm_url": None,
            "bgm_volume": 0.2,
            "subtitle": {
                "enabled": True,
                "font": "NotoSansVN-Bold",
                "font_size": 48,
                "font_color": "#FFFFFF",
                "highlight_color": "#FF6B35",
                "stroke_color": "#000000",
                "stroke_width": 2,
                "position": "bottom",
            },
        },
    }


def test_video_props_from_dict():
    """VideoProps should parse a valid dict without errors."""
    from app.state import VideoProps

    data = _sample_video_props()
    props = VideoProps(**data)
    assert props.job_id == "test-job-001"
    assert props.title == "Deploy Agent AI Within Days"
    assert len(props.scenes) == 1
    assert props.scenes[0].scene_type == "title_card"


def test_video_props_model_dump_roundtrip():
    """model_dump → JSON string → parse back should produce identical object."""
    from app.state import VideoProps

    data = _sample_video_props()
    props = VideoProps(**data)

    json_str = props.model_dump_json()
    restored = VideoProps.model_validate_json(json_str)

    assert restored.job_id == props.job_id
    assert len(restored.scenes) == len(props.scenes)
    assert restored.settings.subtitle.font_size == 48


def test_video_props_model_dump_is_json_serializable():
    """model_dump() output must be directly json.dumps()-able."""
    from app.state import VideoProps

    data = _sample_video_props()
    props = VideoProps(**data)
    dumped = props.model_dump()

    # Must not raise
    json_str = json.dumps(dumped)
    assert isinstance(json_str, str)
    assert "test-job-001" in json_str


def test_video_props_defaults():
    """VideoSettings and SubtitleSettings should have sensible defaults."""
    from app.state import VideoSettings, SubtitleSettings

    settings = VideoSettings()
    assert settings.aspect_ratio == "9:16"
    assert settings.fps == 30
    assert settings.bgm_volume == 0.2

    subtitle = SubtitleSettings()
    assert subtitle.enabled is True
    assert subtitle.font == "NotoSansVN-Bold"
    assert subtitle.position == "bottom"


def test_scene_with_diagram_spec():
    """Scene with diagram_spec (math_formula) should validate."""
    from app.state import Scene

    scene = Scene(
        scene_index=4,
        scene_type="diagram",
        narration="Hàm e mũ x có tính chất luôn dương",
        visual_description="Exponential function e^x graph",
        start_ms=10000.0,
        end_ms=15000.0,
        diagram_spec={
            "type": "math_formula",
            "latex": "e^{x}",
            "annotations": ["Luôn dương ✓", "Bảo toàn thứ tự ✓"],
        },
    )
    assert scene.diagram_spec is not None
    assert scene.diagram_spec.type == "math_formula"
    assert scene.diagram_spec.latex == "e^{x}"


def test_scene_with_card_items():
    """Scene with card_items (info_card) should validate."""
    from app.state import Scene

    scene = Scene(
        scene_index=2,
        scene_type="info_card",
        narration="Quy trình gồm 3 bước",
        visual_description="Three-step process cards",
        start_ms=5000.0,
        end_ms=10000.0,
        card_items=[
            {"icon": "✓", "title": "Literature", "subtitle": "Tổng hợp tài liệu"},
            {"icon": "✓", "title": "Biểu đồ", "subtitle": "Tạo hình minh họa"},
        ],
    )
    assert len(scene.card_items) == 2
    assert scene.card_items[0].title == "Literature"


def test_scene_with_stats():
    """Scene with stats (stats_highlight) should validate."""
    from app.state import Scene

    scene = Scene(
        scene_index=3,
        scene_type="stats_highlight",
        narration="Softmax chuyển điểm thành xác suất",
        visual_description="Softmax probability values",
        start_ms=8000.0,
        end_ms=12000.0,
        stats=[
            {"label": "thảm", "value": "2.0", "color": "#4CAF50"},
            {"label": "ghế", "value": "1.4", "color": "#7B68EE"},
        ],
    )
    assert len(scene.stats) == 2
    assert scene.stats[0].label == "thảm"
