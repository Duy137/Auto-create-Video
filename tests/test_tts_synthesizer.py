"""Tests for app.nodes.tts_synthesizer.

Uses mock OpenAI client to avoid real API calls.
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.nodes.tts_synthesizer import (
    OpenAITTSEngine,
    TTSResult,
    TTSError,
    get_tts_engine,
)


def _mock_tts_response(audio_bytes: bytes | None = None) -> MagicMock:
    """Create a mock OpenAI speech response."""
    response = MagicMock()
    response.content = audio_bytes or b"\xff\xfb\x90\x00" * 4000  # ~16KB fake MP3
    return response


@pytest.mark.asyncio
async def test_synthesize_returns_mp3(tmp_path):
    """OpenAI TTS should return valid TTSResult with MP3 data."""
    mock_client = AsyncMock()
    mock_client.audio.speech.create.return_value = _mock_tts_response()

    with patch("app.nodes.tts_synthesizer.OPENAI_API_KEY", "sk-test"):
        engine = OpenAITTSEngine(api_key="sk-test")
        engine.client = mock_client

        result = await engine.synthesize(
            text="Xin chào thế giới",
            voice="nova",
            output_dir=str(tmp_path),
        )

    assert isinstance(result, TTSResult)
    assert len(result.audio_bytes) > 0
    assert result.audio_path.endswith(".mp3")
    assert result.duration_ms > 0


@pytest.mark.asyncio
async def test_synthesize_saves_file(tmp_path):
    """Audio file should be saved to the specified directory."""
    import os

    mock_client = AsyncMock()
    mock_client.audio.speech.create.return_value = _mock_tts_response()

    with patch("app.nodes.tts_synthesizer.OPENAI_API_KEY", "sk-test"):
        engine = OpenAITTSEngine(api_key="sk-test")
        engine.client = mock_client

        result = await engine.synthesize(
            text="Test audio",
            voice="nova",
            output_dir=str(tmp_path),
        )

    assert os.path.exists(result.audio_path)
    assert os.path.getsize(result.audio_path) > 0


@pytest.mark.asyncio
async def test_synthesize_empty_audio_raises():
    """Empty audio response should raise TTSError."""
    mock_client = AsyncMock()
    mock_client.audio.speech.create.return_value = _mock_tts_response(b"tiny")

    with patch("app.nodes.tts_synthesizer.OPENAI_API_KEY", "sk-test"):
        engine = OpenAITTSEngine(api_key="sk-test")
        engine.client = mock_client

        with pytest.raises(TTSError, match="empty or too-small"):
            await engine.synthesize(text="Test", voice="nova")


def test_get_engine_openai():
    """get_tts_engine('openai') should return OpenAITTSEngine."""
    with patch("app.nodes.tts_synthesizer.OPENAI_API_KEY", "sk-test"):
        engine = get_tts_engine("openai")
        assert isinstance(engine, OpenAITTSEngine)


def test_get_engine_edge_tts_not_implemented():
    """get_tts_engine('edge-tts') should raise NotImplementedError."""
    with pytest.raises(NotImplementedError):
        get_tts_engine("edge-tts")


def test_get_engine_unknown_raises():
    """get_tts_engine('unknown') should raise ValueError."""
    with pytest.raises(ValueError, match="Unknown TTS engine"):
        get_tts_engine("unknown")


def test_no_api_key_raises():
    """OpenAITTSEngine should raise if no API key."""
    with patch("app.nodes.tts_synthesizer.OPENAI_API_KEY", ""):
        with pytest.raises(TTSError, match="not configured"):
            OpenAITTSEngine()
