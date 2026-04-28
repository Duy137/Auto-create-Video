"""Tests for app.nodes.word_aligner.

Tests the alignment format and timestamp estimation fallback.
Whisper model tests are skipped if whisper is not installed.
"""

import pytest

from app.state import WordTimestamp
from app.nodes.word_aligner import estimate_timestamps_from_duration, WordAlignerError


class TestEstimateTimestamps:
    """Test the fallback timestamp estimator (no Whisper needed)."""

    def test_alignment_format(self):
        """Estimated timestamps should return list of WordTimestamp."""
        text = "Xin chào thế giới hôm nay"
        timestamps = estimate_timestamps_from_duration(text, total_duration_ms=3000.0)

        assert isinstance(timestamps, list)
        assert len(timestamps) == 6  # 6 words
        for ts in timestamps:
            assert isinstance(ts, WordTimestamp)
            assert hasattr(ts, "text")
            assert hasattr(ts, "start_ms")
            assert hasattr(ts, "end_ms")

    def test_timestamps_ordered(self):
        """Timestamps should be sequential: start < end, non-overlapping."""
        text = "Một hai ba bốn năm sáu bảy tám"
        timestamps = estimate_timestamps_from_duration(text, total_duration_ms=4000.0)

        for ts in timestamps:
            assert ts.start_ms < ts.end_ms, f"start_ms ({ts.start_ms}) >= end_ms ({ts.end_ms})"

        for i in range(1, len(timestamps)):
            assert timestamps[i].start_ms >= timestamps[i - 1].end_ms - 0.1, (
                f"Timestamps overlap: {timestamps[i - 1]} and {timestamps[i]}"
            )

    def test_timestamps_cover_full_duration(self):
        """Timestamps should cover from 0 to total_duration_ms."""
        text = "Hello world testing timestamps"
        duration = 5000.0
        timestamps = estimate_timestamps_from_duration(text, total_duration_ms=duration)

        assert timestamps[0].start_ms == 0.0
        assert abs(timestamps[-1].end_ms - duration) < 1.0

    def test_empty_text_returns_empty(self):
        """Empty text should return empty list."""
        timestamps = estimate_timestamps_from_duration("", total_duration_ms=1000.0)
        assert timestamps == []

    def test_single_word(self):
        """Single word should span entire duration."""
        timestamps = estimate_timestamps_from_duration("Hello", total_duration_ms=2000.0)
        assert len(timestamps) == 1
        assert timestamps[0].text == "Hello"
        assert timestamps[0].start_ms == 0.0
        assert timestamps[0].end_ms == 2000.0


class TestAlignWordsErrors:
    @pytest.mark.asyncio
    async def test_missing_file_raises(self):
        """align_words with non-existent file should raise."""
        from app.nodes.word_aligner import align_words

        with pytest.raises(WordAlignerError, match="not found"):
            await align_words("/nonexistent/audio.mp3", "some text")
