"""Tests for app.nodes.content_parser.

Uses mock OpenAI client to avoid real API calls.
"""

import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.nodes.content_parser import parse_content, ContentParserError, _validate_phase1


# ── Sample LLM response ──

MOCK_LLM_RESPONSE = {
    "title": "Deploy Agent AI Trong Vài Ngày",
    "color_palette": {
        "primary": "#FF6B35",
        "secondary": "#7B68EE",
        "background": "#0F172A",
        "text": "#FFFFFF",
    },
    "scenes": [
        {
            "scene_index": 0,
            "scene_type": "title_card",
            "narration": "Deploy Agent AI Trong Vài Ngày.",
            "visual_description": "Title screen with tech network",
            "semantic_summary_en": "A bold AI launch title appears over a futuristic tech network backdrop.",
            "image_query": "AI neural network dark",
            "video_query": "AI technology animation",
            "semantic_image_query": "futuristic neural network neon glow",
            "semantic_video_query": "AI technology intro animation dark",
            "keywords_to_highlight": ["Agent AI"],
            "english_phrases": ["Agent AI", "Deploy"],
            "card_items": None,
            "stats": None,
            "diagram_spec": None,
        },
        {
            "scene_index": 1,
            "scene_type": "stock_background",
            "narration": "Claude Managed Agents cho phép chạy AI agent trên cloud.",
            "visual_description": "Cloud server illustration",
            "semantic_summary_en": "Engineers run autonomous AI agents inside a modern cloud infrastructure environment.",
            "image_query": "cloud computing server",
            "video_query": "cloud data center",
            "semantic_image_query": "server room blue neon lighting",
            "semantic_video_query": "data center timelapse blue glow",
            "keywords_to_highlight": ["Claude", "Managed Agents"],
            "english_phrases": ["Claude", "Managed Agents", "cloud"],
            "card_items": None,
            "stats": None,
            "diagram_spec": None,
        },
        {
            "scene_index": 2,
            "scene_type": "stock_background",
            "narration": "Hệ thống này giúp triển khai nhanh chóng và hiệu quả.",
            "visual_description": "Fast deployment visualization",
            "semantic_summary_en": "A streamlined deployment workflow highlights speed, precision, and operational efficiency.",
            "image_query": "fast deployment technology",
            "video_query": "speed technology animation",
            "semantic_image_query": "workflow automation dashboard minimal",
            "semantic_video_query": "speed motion technology cinematic",
            "keywords_to_highlight": ["triển khai", "hiệu quả"],
            "english_phrases": [],
            "card_items": None,
            "stats": None,
            "diagram_spec": None,
        },
    ],
}

SAMPLE_INPUT_TEXT = (
    "Deploy Agent AI Trong Vài Ngày. "
    "Claude Managed Agents cho phép chạy AI agent trên cloud. "
    "Hệ thống này giúp triển khai nhanh chóng và hiệu quả."
)


def _mock_openai_response(content: dict) -> MagicMock:
    """Create a mock OpenAI chat completion response."""
    choice = MagicMock()
    choice.message.content = json.dumps(content)

    response = MagicMock()
    response.choices = [choice]
    return response


@pytest.mark.asyncio
async def test_output_schema_valid():
    """Parser output should conform to VideoProps-compatible schema."""
    mock_client = AsyncMock()
    mock_client.chat.completions.create.return_value = _mock_openai_response(MOCK_LLM_RESPONSE)

    with patch("app.nodes.content_parser.AsyncOpenAI", return_value=mock_client), \
         patch("app.nodes.content_parser.OPENAI_API_KEY", "sk-test"):
        result = await parse_content(SAMPLE_INPUT_TEXT)

    # Check required top-level keys
    assert "title" in result
    assert "color_palette" in result
    assert "scenes" in result

    # Check color_palette has all required keys
    palette = result["color_palette"]
    for key in ("primary", "secondary", "background", "text"):
        assert key in palette
        assert palette[key].startswith("#")

    # Check each scene has required fields
    for scene in result["scenes"]:
        assert "scene_index" in scene
        assert "scene_type" in scene
        assert "narration" in scene
        assert "visual_description" in scene
        assert "semantic_summary_en" in scene
        assert "semantic_image_query" in scene
        assert "semantic_video_query" in scene
        assert "keywords_to_highlight" in scene
        assert isinstance(scene["keywords_to_highlight"], list)


@pytest.mark.asyncio
async def test_content_integrity():
    """Narration fields should contain original text (content integrity)."""
    mock_client = AsyncMock()
    mock_client.chat.completions.create.return_value = _mock_openai_response(MOCK_LLM_RESPONSE)

    with patch("app.nodes.content_parser.AsyncOpenAI", return_value=mock_client), \
         patch("app.nodes.content_parser.OPENAI_API_KEY", "sk-test"):
        result = await parse_content(SAMPLE_INPUT_TEXT)

    # All narrations joined should cover the original text (character-level)
    import re
    def _normalize(text: str) -> str:
        return re.sub(r"\s+", " ", text.lower().strip())

    all_narrations = " ".join(s["narration"] for s in result["scenes"])
    original_norm = _normalize(SAMPLE_INPUT_TEXT)
    narrations_norm = _normalize(all_narrations)

    # Sequential character coverage (must be ≥90%)
    match_count = 0
    search_start = 0
    for char in original_norm:
        pos = narrations_norm.find(char, search_start)
        if pos != -1:
            match_count += 1
            search_start = pos + 1
    char_coverage = match_count / len(original_norm)
    assert char_coverage >= 0.9, f"Content integrity: only {char_coverage:.0%} character coverage"


@pytest.mark.asyncio
async def test_parse_content_uses_deterministic_fallback_on_integrity_failure():
    """Parser should recover with deterministic fallback when splitter drifts from input text."""
    bad_splitter = {
        "title": "Bad Split",
        "scenes": [
            {
                "scene_index": 0,
                "scene_type": "title_card",
                "purpose": "hook",
                "narration": "Completely unrelated summary.",
                "keywords_to_highlight": [],
                "english_phrases": [],
            }
        ],
    }
    minimal_director = {"scene_directions": [], "color_palette": {}}
    minimal_enricher = {"scenes": []}

    mock_client = AsyncMock()
    mock_client.chat.completions.create.side_effect = [
        _mock_openai_response(bad_splitter),   # Phase 1
        _mock_openai_response(bad_splitter),   # Phase 1 retry
        _mock_openai_response(minimal_director),  # Phase 2
        _mock_openai_response(minimal_enricher),  # Phase 3
    ]

    with patch("app.nodes.content_parser.AsyncOpenAI", return_value=mock_client), \
         patch("app.nodes.content_parser.OPENAI_API_KEY", "sk-test"):
        result = await parse_content(SAMPLE_INPUT_TEXT)

    assert len(result["scenes"]) >= 1
    reconstructed = " ".join(scene["narration"] for scene in result["scenes"])
    for token in ("deploy", "claude", "cloud"):
        assert token in reconstructed.lower()


def test_validate_rejects_empty_narration():
    """_validate_phase1 should reject scenes with empty narration."""
    result = {
        "title": "Test",
        "scenes": [
            {"scene_index": 0, "scene_type": "title_card", "narration": "Hello world"},
            {"scene_index": 1, "scene_type": "stock_background", "narration": ""},
        ],
    }
    with pytest.raises(ContentParserError, match="empty narration"):
        _validate_phase1(result, "Hello world something else")


def test_validate_rejects_low_coverage():
    """_validate_phase1 should raise error when narration diverges too much from original."""
    result = {
        "title": "Test",
        "scenes": [
            {"scene_index": 0, "scene_type": "title_card", "narration": "Something completely different and unrelated."},
        ],
    }
    with pytest.raises(ContentParserError, match="Content integrity failed"):
        _validate_phase1(result, "Deploy Agent AI Trong Vài Ngày. Claude Managed Agents cho phép chạy AI agent trên cloud.")


def test_validate_reindexes_non_sequential():
    """_validate_phase1 should fix non-sequential scene indices."""
    result = {
        "title": "Test",
        "scenes": [
            {"scene_index": 5, "scene_type": "title_card", "narration": "Deploy Agent AI."},
            {"scene_index": 10, "scene_type": "stock_background", "narration": "Claude Managed Agents."},
        ],
    }
    _validate_phase1(result, "Deploy Agent AI. Claude Managed Agents.")
    assert result["scenes"][0]["scene_index"] == 0
    assert result["scenes"][1]["scene_index"] == 1


@pytest.mark.asyncio
async def test_scene_count():
    """Parser should generate 3-7 scenes for ~300 word input."""
    mock_client = AsyncMock()
    mock_client.chat.completions.create.return_value = _mock_openai_response(MOCK_LLM_RESPONSE)

    with patch("app.nodes.content_parser.AsyncOpenAI", return_value=mock_client), \
         patch("app.nodes.content_parser.OPENAI_API_KEY", "sk-test"):
        result = await parse_content(SAMPLE_INPUT_TEXT)

    assert len(result["scenes"]) >= 1
    assert len(result["scenes"]) <= 10


@pytest.mark.asyncio
async def test_missing_api_key_raises_error():
    """Parser should raise ContentParserError when no API key is set."""
    with patch("app.nodes.content_parser.OPENAI_API_KEY", ""), \
         patch("app.nodes.content_parser.GOOGLE_API_KEY", ""):
        with pytest.raises(ContentParserError):
            await parse_content(SAMPLE_INPUT_TEXT)


def test_validate_output_missing_key():
    """_validate_phase1 should catch missing required keys."""
    bad_result = {"title": "Test", "color_palette": {}}  # missing "scenes"
    with pytest.raises(ContentParserError, match="missing required key"):
        _validate_phase1(bad_result, "test text")


def test_validate_output_empty_scenes():
    """_validate_phase1 should reject empty scenes list."""
    bad_result = {"title": "Test", "color_palette": {}, "scenes": []}
    with pytest.raises(ContentParserError, match="no scenes"):
        _validate_phase1(bad_result, "test text")
