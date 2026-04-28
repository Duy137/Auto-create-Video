"""Tests for app.nodes.media_reranker."""

import pytest
from unittest.mock import patch

from app.nodes.media_reranker import rerank_candidates_by_scene


@pytest.mark.asyncio
async def test_rerank_fallback_when_disabled():
    scenes = [
        {
            "scene_index": 0,
            "scene_type": "stock_background",
            "narration": "Cloud servers are the backbone of modern AI.",
            "visual_description": "Cloud server room",
            "purpose": "explain",
            "image_query": "cloud server room",
            "video_query": "cloud server cinematic",
        }
    ]
    candidates_by_scene = {
        0: [
            {
                "media_type": "video",
                "url": "https://example.com/top.mp4",
                "thumbnail": "https://example.com/top.jpg",
                "width": 1080,
                "height": 1920,
                "source_rank": 1,
            },
            {
                "media_type": "image",
                "url": "https://example.com/second.jpg",
                "width": 1080,
                "height": 1920,
                "source_rank": 2,
            },
        ]
    }

    with patch("app.nodes.media_reranker.VLM_RERANK_ENABLED", False):
        updated_scenes, decisions = await rerank_candidates_by_scene(
            scenes,
            candidates_by_scene,
            max_candidates=5,
        )

    assert updated_scenes[0]["media_url"] == "https://example.com/top.mp4"
    assert updated_scenes[0]["media_type"] == "video"
    assert decisions[0]["used_fallback"] is True


@pytest.mark.asyncio
async def test_rerank_handles_missing_candidates():
    scenes = [
        {
            "scene_index": 2,
            "scene_type": "info_card",
            "narration": "Three steps to deploy.",
            "visual_description": "Three-step process",
            "purpose": "list_steps",
        }
    ]

    updated_scenes, decisions = await rerank_candidates_by_scene(
        scenes,
        {},
        max_candidates=5,
    )

    assert updated_scenes[0]["media_url"] is None
    assert updated_scenes[0]["media_type"] is None
    assert decisions[2]["used_fallback"] is True
