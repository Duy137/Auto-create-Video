"""Test that Python Pydantic output can be camelized and validated by the TS schema.

This test validates the JSON Contract roundtrip:
  Python VideoProps.model_dump() → JSON → camelizeKeys() → Zod parse

We test the camelizeKeys logic in Python (mirroring the TS implementation)
to catch field mismatches early without needing to run Node.js.
"""

import json
import re


def _snake_to_camel(name: str) -> str:
    """Python mirror of remotion/src/lib/utils.ts snakeToCamel."""
    return re.sub(r"_([a-z0-9])", lambda m: m.group(1).upper(), name)


def _camelize_keys(obj):
    """Python mirror of remotion/src/lib/utils.ts camelizeKeys."""
    if isinstance(obj, list):
        return [_camelize_keys(item) for item in obj]
    if isinstance(obj, dict):
        return {_snake_to_camel(k): _camelize_keys(v) for k, v in obj.items()}
    return obj


# ── The exact set of camelCase keys the Zod schema expects ──

EXPECTED_ROOT_KEYS = {
    "jobId", "title", "colorPalette", "audioUrl",
    "wordTimestamps", "scenes", "settings",
}

EXPECTED_SCENE_KEYS = {
    "sceneIndex", "sceneType", "narration", "visualDescription",
    "startMs", "endMs", "imageQuery", "videoQuery",
    "mediaUrl", "mediaType", "keywordsToHighlight", "englishPhrases",
    # Optional keys not always present:
    # "cardItems", "stats", "diagramSpec"
}

EXPECTED_SETTINGS_KEYS = {
    "aspectRatio", "fps", "transitionMode", "bgmUrl", "bgmVolume", "subtitle",
    "watermarkText",
}

EXPECTED_SUBTITLE_KEYS = {
    "enabled", "font", "fontSize", "fontColor",
    "highlightColor", "strokeColor", "strokeWidth", "position",
}


def _sample_video_props_dict() -> dict:
    """Build a full VideoProps via Pydantic and dump."""
    from app.state import VideoProps, Scene, WordTimestamp, ColorPalette

    props = VideoProps(
        job_id="test-roundtrip-001",
        title="Test Video",
        color_palette=ColorPalette(
            primary="#FF6B35",
            secondary="#7B68EE",
            background="#0F172A",
            text="#FFFFFF",
        ),
        audio_url="output/test/audio/full.mp3",
        word_timestamps=[
            WordTimestamp(text="Hello", start_ms=0, end_ms=500),
        ],
        scenes=[
            Scene(
                scene_index=0,
                scene_type="title_card",
                narration="Test narration",
                visual_description="Test visual",
                start_ms=0,
                end_ms=3000,
                image_query="test query",
                video_query="test video query",
                keywords_to_highlight=["test"],
                english_phrases=["test"],
            ),
        ],
    )
    return props.model_dump()


def test_snake_to_camel_conversion():
    """Verify key conversion examples."""
    assert _snake_to_camel("job_id") == "jobId"
    assert _snake_to_camel("start_ms") == "startMs"
    assert _snake_to_camel("keywords_to_highlight") == "keywordsToHighlight"
    assert _snake_to_camel("font_color") == "fontColor"
    assert _snake_to_camel("bgm_volume") == "bgmVolume"
    assert _snake_to_camel("scene_index") == "sceneIndex"
    assert _snake_to_camel("english_phrases") == "englishPhrases"
    assert _snake_to_camel("visual_description") == "visualDescription"
    # Keys without underscores stay the same
    assert _snake_to_camel("title") == "title"
    assert _snake_to_camel("narration") == "narration"


def test_camelize_keys_produces_expected_root_keys():
    """After camelizing, root keys must match Zod schema expectations."""
    raw = _sample_video_props_dict()
    camelized = _camelize_keys(raw)

    actual_keys = set(camelized.keys())
    assert actual_keys == EXPECTED_ROOT_KEYS, (
        f"Root key mismatch.\n"
        f"  Extra: {actual_keys - EXPECTED_ROOT_KEYS}\n"
        f"  Missing: {EXPECTED_ROOT_KEYS - actual_keys}"
    )


def test_camelize_keys_produces_expected_scene_keys():
    """Scene keys after camelizing must match Zod SceneSchema."""
    raw = _sample_video_props_dict()
    camelized = _camelize_keys(raw)

    scene = camelized["scenes"][0]
    actual_keys = set(scene.keys())

    # Check required keys are present
    missing = EXPECTED_SCENE_KEYS - actual_keys
    assert not missing, f"Missing scene keys: {missing}"


def test_camelize_keys_produces_expected_settings_keys():
    """Settings keys after camelizing must match Zod SettingsSchema."""
    raw = _sample_video_props_dict()
    camelized = _camelize_keys(raw)

    settings = camelized["settings"]
    actual_keys = set(settings.keys())
    assert actual_keys == EXPECTED_SETTINGS_KEYS, (
        f"Settings key mismatch.\n"
        f"  Extra: {actual_keys - EXPECTED_SETTINGS_KEYS}\n"
        f"  Missing: {EXPECTED_SETTINGS_KEYS - actual_keys}"
    )


def test_camelize_keys_produces_expected_subtitle_keys():
    """Subtitle keys after camelizing must match Zod SubtitleSettingsSchema."""
    raw = _sample_video_props_dict()
    camelized = _camelize_keys(raw)

    subtitle = camelized["settings"]["subtitle"]
    actual_keys = set(subtitle.keys())
    assert actual_keys == EXPECTED_SUBTITLE_KEYS, (
        f"Subtitle key mismatch.\n"
        f"  Extra: {actual_keys - EXPECTED_SUBTITLE_KEYS}\n"
        f"  Missing: {EXPECTED_SUBTITLE_KEYS - actual_keys}"
    )


def test_full_roundtrip_json_serializable():
    """Full roundtrip: Pydantic → dump → camelize → JSON string."""
    raw = _sample_video_props_dict()
    camelized = _camelize_keys(raw)
    json_str = json.dumps(camelized, indent=2)

    # Verify it's valid JSON and contains expected camelCase keys
    parsed = json.loads(json_str)
    assert "jobId" in parsed
    assert "colorPalette" in parsed
    assert "wordTimestamps" in parsed
    assert parsed["scenes"][0]["sceneType"] == "title_card"
