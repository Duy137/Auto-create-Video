"""Tests for app.nodes.media_searcher.

Uses mock httpx responses to avoid real Pexels API calls.
"""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from app.nodes.media_searcher import (
    collect_media_candidates,
    pick_top_candidate,
    search_media,
    search_videos,
    search_images,
    _pick_best_video_file,
    _semantic_anchor_from_summary,
    _shorten_query,
)


# ── Mock Pexels API responses ──

MOCK_VIDEO_RESPONSE = {
    "videos": [
        {
            "id": 12345,
            "duration": 15,
            "image": "https://pexels.com/thumb.jpg",
            "video_files": [
                {
                    "id": 1,
                    "link": "https://pexels.com/video-sd.mp4",
                    "width": 640,
                    "height": 360,
                },
                {
                    "id": 2,
                    "link": "https://pexels.com/video-hd.mp4",
                    "width": 1080,
                    "height": 1920,
                },
            ],
        }
    ]
}

MOCK_IMAGE_RESPONSE = {
    "photos": [
        {
            "id": 67890,
            "width": 1920,
            "height": 1080,
            "photographer": "Test Photographer",
            "src": {
                "original": "https://pexels.com/original.jpg",
                "large2x": "https://pexels.com/large2x.jpg",
                "large": "https://pexels.com/large.jpg",
            },
        }
    ]
}

MOCK_EMPTY_RESPONSE = {"videos": [], "photos": []}


def _mock_httpx_response(json_data: dict, status_code: int = 200) -> MagicMock:
    """Create a mock httpx response."""
    response = MagicMock()
    response.json.return_value = json_data
    response.status_code = status_code
    response.raise_for_status = MagicMock()
    return response


@pytest.mark.asyncio
async def test_search_returns_video():
    """search_media should return video result when available."""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get.return_value = _mock_httpx_response(MOCK_VIDEO_RESPONSE)

    with patch("app.nodes.media_searcher.PEXELS_API_KEY", "test-key"), \
         patch("app.nodes.media_searcher.httpx.AsyncClient", return_value=mock_client):
        result = await search_media("technology dark")

    assert result["type"] == "video"
    assert "url" in result
    assert result["url"].endswith(".mp4")


@pytest.mark.asyncio
async def test_video_priority_over_image():
    """Video should be returned before image when both are available."""
    call_count = 0

    async def mock_get(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:  # First call = video search
            return _mock_httpx_response(MOCK_VIDEO_RESPONSE)
        return _mock_httpx_response(MOCK_IMAGE_RESPONSE)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = mock_get

    with patch("app.nodes.media_searcher.PEXELS_API_KEY", "test-key"), \
         patch("app.nodes.media_searcher.httpx.AsyncClient", return_value=mock_client):
        result = await search_media("test query")

    assert result["type"] == "video"


@pytest.mark.asyncio
async def test_fallback_to_image():
    """When no video found, should fallback to image."""
    call_count = 0

    async def mock_get(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:  # First call = video search → empty
            return _mock_httpx_response({"videos": []})
        return _mock_httpx_response(MOCK_IMAGE_RESPONSE)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = mock_get

    with patch("app.nodes.media_searcher.PEXELS_API_KEY", "test-key"), \
         patch("app.nodes.media_searcher.httpx.AsyncClient", return_value=mock_client):
        result = await search_media("test query")

    assert result["type"] == "image"
    assert "url" in result


@pytest.mark.asyncio
async def test_prefer_image_mode():
    """When prefer_video=False, image is selected first if available."""
    call_count = 0

    async def mock_get(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:  # Image endpoint first
            return _mock_httpx_response(MOCK_IMAGE_RESPONSE)
        return _mock_httpx_response(MOCK_VIDEO_RESPONSE)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = mock_get

    with patch("app.nodes.media_searcher.PEXELS_API_KEY", "test-key"), \
         patch("app.nodes.media_searcher.httpx.AsyncClient", return_value=mock_client):
        result = await search_media("test query", prefer_video=False)

    assert result["type"] == "image"


@pytest.mark.asyncio
async def test_collect_media_candidates_video_first():
    """Candidate collection should prioritize video first for stock backgrounds."""
    call_count = 0

    async def mock_get(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _mock_httpx_response(MOCK_VIDEO_RESPONSE)
        return _mock_httpx_response(MOCK_IMAGE_RESPONSE)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = mock_get

    with patch("app.nodes.media_searcher.PEXELS_API_KEY", "test-key"), \
         patch("app.nodes.media_searcher.httpx.AsyncClient", return_value=mock_client):
        candidates = await collect_media_candidates(
            "cloud server cinematic",
            prefer_video=True,
            max_candidates=5,
        )

    assert candidates
    assert candidates[0]["media_type"] == "video"
    assert len(candidates) <= 5


@pytest.mark.asyncio
async def test_collect_media_candidates_image_first():
    """Candidate collection should prioritize image first for non-background scenes."""
    call_count = 0

    async def mock_get(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _mock_httpx_response(MOCK_IMAGE_RESPONSE)
        return _mock_httpx_response(MOCK_VIDEO_RESPONSE)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = mock_get

    with patch("app.nodes.media_searcher.PEXELS_API_KEY", "test-key"), \
         patch("app.nodes.media_searcher.httpx.AsyncClient", return_value=mock_client):
        candidates = await collect_media_candidates(
            "technology infographic",
            prefer_video=False,
            max_candidates=5,
        )

    assert candidates
    assert candidates[0]["media_type"] == "image"


def test_pick_top_candidate():
    """Top candidate picker should preserve type + essential fields."""
    candidates = [
        {
            "media_type": "video",
            "url": "https://example.com/a.mp4",
            "width": 1080,
            "height": 1920,
            "duration": 12,
            "thumbnail": "https://example.com/a.jpg",
            "pexels_id": 11,
        },
        {
            "media_type": "image",
            "url": "https://example.com/b.jpg",
            "width": 1080,
            "height": 1920,
            "photographer": "test",
            "pexels_id": 12,
        },
    ]

    top = pick_top_candidate(candidates)
    assert top["type"] == "video"
    assert top["url"].endswith(".mp4")


def test_shorten_query():
    """Retry helper should drop the final token when query has multiple words."""
    assert _shorten_query("technology server room cinematic") == "technology server room"
    assert _shorten_query("technology") == "technology"


def test_semantic_anchor_from_summary():
    """Semantic anchor should balance subject/object terms with scene context."""
    with patch("app.nodes.media_searcher.SEMANTIC_QUERY_ENABLED", True), \
         patch("app.nodes.media_searcher.SEMANTIC_QUERY_MAX_WORDS", 4):
        anchor = _semantic_anchor_from_summary(
            "Engineers monitor autonomous cloud servers in a dramatic neon operations room."
        )

    assert anchor == "cloud servers operations room"


@pytest.mark.asyncio
async def test_search_media_tries_semantic_query_before_base_query():
    """Video search should try scene-aware semantic variants before the original base query."""
    queries: list[str] = []

    async def mock_get(*args, **kwargs):
        queries.append(kwargs.get("params", {}).get("query", ""))
        if len(queries) < 3:
            return _mock_httpx_response({"videos": []})
        return _mock_httpx_response(MOCK_VIDEO_RESPONSE)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = mock_get

    with patch("app.nodes.media_searcher.PEXELS_API_KEY", "test-key"), \
         patch("app.nodes.media_searcher.SEMANTIC_QUERY_ENABLED", True), \
         patch("app.nodes.media_searcher.SEMANTIC_QUERY_MAX_WORDS", 4), \
         patch("app.nodes.media_searcher.SEMANTIC_LLM_QUERY_ENABLED", False), \
         patch("app.nodes.media_searcher.httpx.AsyncClient", return_value=mock_client):
        result = await search_media(
            "cloud server room",
            video_query="cloud server cinematic",
            semantic_summary_en="Operators manage cloud racks in a cinematic high-tech control room.",
            prefer_video=True,
        )

    assert result["type"] == "video"
    assert len(queries) >= 3
    assert queries[0] == "cloud server cinematic control room"
    assert queries[1] != "cloud server cinematic"
    assert queries[-1] == "cloud server cinematic"


@pytest.mark.asyncio
async def test_llm_semantic_query_is_tried_first():
    """When LLM semantic query is provided, it should be tried before deterministic anchor."""
    queries: list[str] = []

    async def mock_get(*args, **kwargs):
        queries.append(kwargs.get("params", {}).get("query", ""))
        # Return empty for all queries except the last one (base query)
        if len(queries) < 4:
            return _mock_httpx_response({"videos": []})
        return _mock_httpx_response(MOCK_VIDEO_RESPONSE)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = mock_get

    with patch("app.nodes.media_searcher.PEXELS_API_KEY", "test-key"), \
         patch("app.nodes.media_searcher.SEMANTIC_LLM_QUERY_ENABLED", True), \
         patch("app.nodes.media_searcher.SEMANTIC_QUERY_ENABLED", True), \
         patch("app.nodes.media_searcher.SEMANTIC_QUERY_MAX_WORDS", 4), \
         patch("app.nodes.media_searcher.httpx.AsyncClient", return_value=mock_client):
        result = await search_media(
            "cloud server room",
            video_query="cloud server cinematic",
            semantic_summary_en="Operators manage cloud racks in a high-tech control room.",
            semantic_video_query="data center timelapse blue glow",
            prefer_video=True,
        )

    assert result["type"] == "video"
    # First query tried should be the LLM-generated one
    assert queries[0] == "data center timelapse blue glow"
    # LLM query comes before any deterministic variant
    assert queries[0] != "cloud server cinematic"
    # Base query should eventually appear (last fallback)
    assert queries[-1] == "cloud server cinematic"


@pytest.mark.asyncio
async def test_collect_media_candidates_records_semantic_source_query():
    """Candidate metadata should preserve the semantic-enriched source query used."""
    queries: list[str] = []

    async def mock_get(*args, **kwargs):
        queries.append(kwargs.get("params", {}).get("query", ""))
        if len(queries) == 1:
            return _mock_httpx_response(MOCK_VIDEO_RESPONSE)
        return _mock_httpx_response(MOCK_IMAGE_RESPONSE)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = mock_get

    with patch("app.nodes.media_searcher.PEXELS_API_KEY", "test-key"), \
         patch("app.nodes.media_searcher.SEMANTIC_LLM_QUERY_ENABLED", True), \
         patch("app.nodes.media_searcher.SEMANTIC_QUERY_ENABLED", True), \
         patch("app.nodes.media_searcher.SEMANTIC_QUERY_MAX_WORDS", 4), \
         patch("app.nodes.media_searcher.httpx.AsyncClient", return_value=mock_client):
        candidates = await collect_media_candidates(
            "cloud server room",
            video_query="cloud server cinematic",
            semantic_summary_en="Neon-lit operators monitor secure cloud infrastructure in a cinematic operations center.",
            semantic_video_query="server rack neon blue cinematic",
            prefer_video=True,
            max_candidates=5,
        )

    assert candidates
    # First candidate should have used the LLM semantic query
    assert candidates[0]["source_query"] == "server rack neon blue cinematic"
    assert candidates[0]["source_query"] != "cloud server cinematic"


@pytest.mark.asyncio
async def test_no_api_key_returns_empty():
    """When PEXELS_API_KEY is not set, should return empty dict."""
    with patch("app.nodes.media_searcher.PEXELS_API_KEY", ""):
        result = await search_media("test query")

    assert result == {}


class TestPickBestVideoFile:
    def test_picks_hd_file(self):
        """Should pick HD (720p+) file."""
        files = [
            {"link": "http://sd.mp4", "width": 640, "height": 360},
            {"link": "http://hd.mp4", "width": 1080, "height": 1920},
        ]
        best = _pick_best_video_file(files)
        assert best["link"] == "http://hd.mp4"

    def test_fallback_to_any(self):
        """Should fallback to any file if no HD available."""
        files = [
            {"link": "http://low.mp4", "width": 320, "height": 240},
        ]
        best = _pick_best_video_file(files)
        assert best["link"] == "http://low.mp4"

    def test_empty_list(self):
        """Empty file list should return None."""
        assert _pick_best_video_file([]) is None
