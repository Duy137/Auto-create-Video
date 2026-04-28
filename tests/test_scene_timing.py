"""Tests for scene timing computation in orchestrator.

Tests both word-timestamp-based and proportional fallback timing.
"""

import pytest

from app.orchestrator import _compute_scene_timing, _compute_scene_timing_proportional


class TestComputeSceneTimingWithTimestamps:
    """Test word-timestamp-based scene timing."""

    def test_basic_two_scenes(self):
        """Two scenes should split at word boundary."""
        scenes = [
            {"scene_index": 0, "narration": "Hello world"},
            {"scene_index": 1, "narration": "Goodbye friend"},
        ]
        word_timestamps = [
            {"text": "Hello", "start_ms": 0.0, "end_ms": 500.0},
            {"text": "world", "start_ms": 500.0, "end_ms": 1000.0},
            {"text": "Goodbye", "start_ms": 1200.0, "end_ms": 1800.0},
            {"text": "friend", "start_ms": 1800.0, "end_ms": 2500.0},
        ]
        result = _compute_scene_timing(scenes, word_timestamps, 2500.0)

        assert result[0]["start_ms"] == 0.0
        assert result[0]["end_ms"] >= 1000.0  # covers "Hello world"
        assert result[1]["start_ms"] == result[0]["end_ms"]  # continuity
        assert result[1]["end_ms"] >= 2500.0  # covers "Goodbye friend"

    def test_three_scenes_continuity(self):
        """Three scenes should have no gaps between them."""
        scenes = [
            {"scene_index": 0, "narration": "Một hai"},
            {"scene_index": 1, "narration": "Ba bốn"},
            {"scene_index": 2, "narration": "Năm sáu"},
        ]
        word_timestamps = [
            {"text": "Một", "start_ms": 0.0, "end_ms": 400.0},
            {"text": "hai", "start_ms": 400.0, "end_ms": 800.0},
            {"text": "Ba", "start_ms": 900.0, "end_ms": 1300.0},
            {"text": "bốn", "start_ms": 1300.0, "end_ms": 1700.0},
            {"text": "Năm", "start_ms": 1800.0, "end_ms": 2200.0},
            {"text": "sáu", "start_ms": 2200.0, "end_ms": 2600.0},
        ]
        result = _compute_scene_timing(scenes, word_timestamps, 2600.0)

        # No gaps between scenes
        for i in range(1, len(result)):
            assert result[i]["start_ms"] == result[i - 1]["end_ms"], \
                f"Gap between scene {i-1} and {i}"

    def test_minimum_duration_enforced(self):
        """Each scene should have at least 2 seconds duration."""
        scenes = [
            {"scene_index": 0, "narration": "Quick"},
            {"scene_index": 1, "narration": "Also quick"},
        ]
        word_timestamps = [
            {"text": "Quick", "start_ms": 0.0, "end_ms": 200.0},
            {"text": "Also", "start_ms": 200.0, "end_ms": 400.0},
            {"text": "quick", "start_ms": 400.0, "end_ms": 600.0},
        ]
        result = _compute_scene_timing(scenes, word_timestamps, 600.0)

        for scene in result:
            assert scene["end_ms"] - scene["start_ms"] >= 2000.0

    def test_empty_timestamps_uses_proportional(self):
        """Empty word_timestamps should fall back to proportional."""
        scenes = [
            {"scene_index": 0, "narration": "Hello world"},
            {"scene_index": 1, "narration": "Goodbye friend now"},
        ]
        result = _compute_scene_timing(scenes, [], 5000.0)

        assert result[0]["start_ms"] == 0.0
        assert result[0]["end_ms"] > 0
        assert result[1]["start_ms"] == result[0]["end_ms"]

    def test_word_count_mismatch_fallback(self):
        """Large word count mismatch should trigger proportional fallback."""
        scenes = [
            {"scene_index": 0, "narration": "One two three four five six seven eight nine ten"},
        ]
        # Only 2 timestamps for 10 words — big mismatch
        word_timestamps = [
            {"text": "One", "start_ms": 0.0, "end_ms": 500.0},
            {"text": "two", "start_ms": 500.0, "end_ms": 1000.0},
        ]
        result = _compute_scene_timing(scenes, word_timestamps, 5000.0)
        assert result[0]["start_ms"] == 0.0
        assert result[0]["end_ms"] > 0


class TestComputeSceneTimingProportional:
    """Test proportional fallback timing."""

    def test_proportional_by_word_count(self):
        """Scenes with more words should get proportionally more time."""
        scenes = [
            {"scene_index": 0, "narration": "Short"},
            {"scene_index": 1, "narration": "This is a longer sentence here"},
        ]
        result = _compute_scene_timing_proportional(scenes, 10000.0)

        # Longer scene should get more time (after min 2s enforcement)
        dur0 = result[0]["end_ms"] - result[0]["start_ms"]
        dur1 = result[1]["end_ms"] - result[1]["start_ms"]
        assert dur1 > dur0

    def test_minimum_2_seconds(self):
        """Each scene should get at least 2 seconds."""
        scenes = [
            {"scene_index": 0, "narration": "Hi"},
            {"scene_index": 1, "narration": "Hello world nice day today very long"},
        ]
        result = _compute_scene_timing_proportional(scenes, 3000.0)

        for scene in result:
            dur = scene["end_ms"] - scene["start_ms"]
            assert dur >= 2000.0

    def test_sequential_no_overlap(self):
        """Scenes should be sequential with no overlaps."""
        scenes = [
            {"scene_index": 0, "narration": "First scene"},
            {"scene_index": 1, "narration": "Second scene"},
            {"scene_index": 2, "narration": "Third scene"},
        ]
        result = _compute_scene_timing_proportional(scenes, 9000.0)

        for i in range(1, len(result)):
            assert result[i]["start_ms"] == result[i - 1]["end_ms"]
