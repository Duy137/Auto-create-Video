"""TTS Synthesizer — Text-to-Speech with abstract engine pattern.

Input:  Text string, voice name, rate, volume.
Output: TTSResult (audio_bytes, audio_path, duration_ms).

Engines:
- OpenAITTSEngine (primary): gpt-4o-mini-tts, natural Vietnamese-English code-switching.
- ElevenLabsTTSEngine (premium): Eleven v3 / Flash v2.5, native word timestamps.
- GeminiTTSEngine: Gemini 3.1 Flash TTS, LLM-powered with excellent code-switching.
- EdgeTTSEngine (fallback): Free Microsoft TTS.

See MASTER_PLAN section "Component 2A — TTS Synthesizer" for full spec.
"""

from __future__ import annotations

import asyncio
import base64
import importlib
import io
import shutil
import subprocess
import tempfile
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
from loguru import logger
from openai import AsyncOpenAI

from app.state import WordTimestamp


from config import ELEVENLABS_API_KEY, GOOGLE_API_KEY, OPENAI_API_KEY, VBEE_APP_ID, VBEE_API_TOKEN


class TTSError(Exception):
    """Raised when TTS synthesis fails."""
    pass


@dataclass
class TTSResult:
    """Result of TTS synthesis."""

    audio_bytes: bytes
    audio_path: str
    duration_ms: float
    word_boundaries: list[dict] = field(default_factory=list)
    # word_boundaries: [{text, start_ms, end_ms}, ...]
    # Populated by Whisper word aligner in a separate step


class TTSEngine(ABC):
    """Abstract base class for TTS engines."""

    @abstractmethod
    async def synthesize(
        self,
        text: str,
        voice: str,
        rate: float = 1.0,
        volume: float = 1.0,
        output_dir: str | Path | None = None,
    ) -> TTSResult:
        """Synthesize text to speech.

        Args:
            text: Text to synthesize.
            voice: Voice name/ID.
            rate: Speech rate (0.8–2.0).
            volume: Volume (0.6–3.0).
            output_dir: Directory to save audio file. Uses temp dir if None.

        Returns:
            TTSResult with audio bytes, path, and duration.
        """
        pass


def _resolve_ffmpeg_executable() -> str:
    """Resolve ffmpeg executable from imageio-ffmpeg or PATH."""
    try:
        imageio_ffmpeg = importlib.import_module("imageio_ffmpeg")
        return str(imageio_ffmpeg.get_ffmpeg_exe())
    except Exception:
        return shutil.which("ffmpeg") or "ffmpeg"


def _apply_speech_rate_ffmpeg(
    input_path: str | Path,
    output_path: str | Path,
    rate: float,
) -> None:
    """Adjust speech rate using ffmpeg atempo filter."""
    if rate <= 0:
        raise TTSError("Speech rate must be positive")

    remaining_rate = rate
    filters: list[str] = []

    while remaining_rate > 2.0:
        filters.append("atempo=2.0")
        remaining_rate /= 2.0

    while remaining_rate < 0.5:
        filters.append("atempo=0.5")
        remaining_rate /= 0.5

    filters.append(f"atempo={remaining_rate:.4f}")
    filter_chain = ",".join(filters)
    ffmpeg_exe = _resolve_ffmpeg_executable()

    cmd = [
        ffmpeg_exe, "-y", "-i", str(input_path),
        "-filter:a", filter_chain,
        "-q:a", "2",
        str(output_path),
    ]

    try:
        subprocess.run(
            cmd, check=True, capture_output=True, timeout=30,
        )
        logger.debug("ffmpeg atempo applied: rate={}, filter={}", rate, filter_chain)
    except FileNotFoundError as e:
        raise TTSError(
            "ffmpeg is required for speech rate adjustment but was not found in PATH"
        ) from e
    except subprocess.CalledProcessError as e:
        logger.warning("ffmpeg atempo failed: {}", e.stderr.decode()[:200])
        raise TTSError(f"ffmpeg speed adjustment failed: {e}") from e


def _convert_audio_to_mp3_ffmpeg(
    input_path: str | Path,
    output_path: str | Path,
) -> None:
    """Transcode audio to MP3 using ffmpeg.

    This avoids pydub/audioop runtime issues on newer Python versions.
    """
    ffmpeg_exe = _resolve_ffmpeg_executable()

    cmd = [
        ffmpeg_exe, "-y", "-i", str(input_path),
        "-vn", "-acodec", "libmp3lame", "-b:a", "128k",
        str(output_path),
    ]

    try:
        subprocess.run(
            cmd, check=True, capture_output=True, timeout=30,
        )
        logger.debug("ffmpeg transcode complete: {} -> {}", input_path, output_path)
    except FileNotFoundError as e:
        raise TTSError(
            "ffmpeg is required for audio conversion but was not found in PATH"
        ) from e
    except subprocess.CalledProcessError as e:
        logger.warning("ffmpeg transcode failed: {}", e.stderr.decode()[:200])
        raise TTSError(f"ffmpeg conversion failed: {e}") from e


def _chars_to_word_timestamps(
    characters: list[str],
    start_times: list[float],
    end_times: list[float],
) -> list[WordTimestamp]:
    """Aggregate ElevenLabs character-level timestamps into word-level.

    Splits on whitespace characters to form words, using the first
    character's start time and last character's end time per word.
    """
    words: list[WordTimestamp] = []
    current_word = ""
    word_start: float | None = None
    word_end: float | None = None

    for char, start, end in zip(characters, start_times, end_times):
        if char.strip() == "":
            # Whitespace → flush current word
            if current_word and word_start is not None:
                words.append(WordTimestamp(
                    text=current_word,
                    start_ms=round(word_start * 1000, 1),
                    end_ms=round(word_end * 1000, 1),  # type: ignore[arg-type]
                ))
                current_word = ""
                word_start = None
                word_end = None
        else:
            if word_start is None:
                word_start = start
            word_end = end
            current_word += char

    # Last word (no trailing space)
    if current_word and word_start is not None:
        words.append(WordTimestamp(
            text=current_word,
            start_ms=round(word_start * 1000, 1),
            end_ms=round(word_end * 1000, 1),  # type: ignore[arg-type]
        ))

    return words


def _get_audio_duration_ms(audio_path: str) -> float:
    """Get accurate audio duration using mutagen. Fallback to a byte estimate."""
    try:
        from mutagen import File as MutagenFile

        audio = MutagenFile(audio_path)
        if audio is not None and getattr(audio, "info", None) is not None:
            length = getattr(audio.info, "length", 0.0) or 0.0
            if length > 0:
                return length * 1000
    except Exception:
        pass

    try:
        file_size = Path(audio_path).stat().st_size
    except OSError:
        return 1000.0

    # Rough fallback for ~128kbps MP3-equivalent audio.
    return max(1000.0, (file_size * 8 / 128000) * 1000)


class OpenAITTSEngine(TTSEngine):
    """OpenAI gpt-4o-mini-tts engine."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or OPENAI_API_KEY
        if not self.api_key:
            raise TTSError("OPENAI_API_KEY not configured")
        self.client = AsyncOpenAI(api_key=self.api_key)

    async def synthesize(
        self,
        text: str,
        voice: str = "nova",
        rate: float = 1.0,
        volume: float = 1.0,
        output_dir: str | Path | None = None,
    ) -> TTSResult:
        logger.info(
            "OpenAI TTS: synthesizing {} chars, voice={}, rate={}",
            len(text), voice, rate,
        )

        try:
            response = await self.client.audio.speech.create(
                model="gpt-4o-mini-tts",
                voice=voice,
                input=text,
                speed=rate,
                response_format="mp3",
            )
            audio_bytes = response.content
            if not audio_bytes or len(audio_bytes) < 100:
                raise TTSError("OpenAI TTS returned empty or too-small audio")

            if output_dir:
                out_dir = Path(output_dir)
                out_dir.mkdir(parents=True, exist_ok=True)
                audio_path = out_dir / "full.mp3"
            else:
                tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
                audio_path = Path(tmp.name)
                tmp.close()

            audio_path.write_bytes(audio_bytes)
            duration_ms = _get_audio_duration_ms(str(audio_path))

            return TTSResult(
                audio_bytes=audio_bytes,
                audio_path=str(audio_path),
                duration_ms=duration_ms,
            )
        except Exception as e:
            if "TTSError" in type(e).__name__:
                raise
            raise TTSError(f"OpenAI TTS failed: {e}") from e


class EdgeTTSEngine(TTSEngine):
    """Edge-TTS engine."""

    async def synthesize(
        self,
        text: str,
        voice: str = "vi-VN-HoaiMyNeural",
        rate: float = 1.0,
        volume: float = 1.0,
        output_dir: str | Path | None = None,
    ) -> TTSResult:
        import edge_tts

        logger.info(
            "Edge TTS: synthesizing {} chars, voice={}, rate={}",
            len(text), voice, rate,
        )

        rate_pct = int((rate - 1.0) * 100)
        rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"

        try:
            communicate = edge_tts.Communicate(text, voice, rate=rate_str)
            audio_chunks = []
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_chunks.append(chunk["data"])

            audio_bytes = b"".join(audio_chunks)
            if not audio_bytes or len(audio_bytes) < 100:
                raise TTSError("Edge TTS returned empty audio")

            if output_dir:
                out_dir = Path(output_dir)
                out_dir.mkdir(parents=True, exist_ok=True)
                audio_path = out_dir / "full.mp3"
            else:
                tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
                audio_path = Path(tmp.name)
                tmp.close()

            audio_path.write_bytes(audio_bytes)
            duration_ms = _get_audio_duration_ms(str(audio_path))

            return TTSResult(
                audio_bytes=audio_bytes,
                audio_path=str(audio_path),
                duration_ms=duration_ms,
            )
        except Exception as e:
            if "TTSError" in type(e).__name__:
                raise
            raise TTSError(f"Edge TTS failed: {e}") from e


# ── ElevenLabs TTS Engine ──


class ElevenLabsTTSEngine(TTSEngine):
    """ElevenLabs TTS — premium quality with native word timestamps.

    Cost: ~880 VND per video (Starter plan).
    Quality: Industry-leading, excellent Vietnamese-English code-switching.
    Advantage: Native timestamps → skip Whisper alignment (-10-30s pipeline).
    Models: eleven_v3 (flagship), eleven_flash_v2_5 (low-latency).
    """

    MODELS = {
        "eleven_v3": "eleven_v3",
        "eleven_flash_v2_5": "eleven_flash_v2_5",
    }
    DEFAULT_MODEL = "eleven_v3"

    def __init__(self, api_key: str | None = None, model: str = "eleven_v3"):
        from elevenlabs import AsyncElevenLabs

        self.api_key = api_key or ELEVENLABS_API_KEY
        if not self.api_key:
            raise TTSError("ELEVENLABS_API_KEY not configured")
        self.model = model if model in self.MODELS else self.DEFAULT_MODEL
        self.client = AsyncElevenLabs(api_key=self.api_key)

    async def synthesize(
        self,
        text: str,
        voice: str = "6adFm46eyy74snVn6YrT",  # Nhật - Narrative & Compelling
        rate: float = 1.0,
        volume: float = 1.0,
        output_dir: str | Path | None = None,
    ) -> TTSResult:
        """Synthesize text using ElevenLabs with native timestamps.

        Always uses convert_with_timestamps (same cost as regular convert)
        to get free character-level alignment → aggregated to word timestamps.

        Args:
            text: Text to synthesize.
            voice: ElevenLabs voice ID.
            rate: Speech rate. Supported range 0.7–1.2, values outside will be clamped.
            volume: Volume (not directly supported, ignored).
            output_dir: Directory to save the MP3 file.

        Returns:
            TTSResult with MP3 audio and word_boundaries populated.

        Raises:
            TTSError: If API call fails.
        """
        # Clamp rate to ElevenLabs supported range (0.7–1.2)
        el_speed = max(0.7, min(rate, 1.2))
        if rate != el_speed:
            logger.warning(
                "ElevenLabs speed capped at {} (requested {})",
                el_speed, rate,
            )

        logger.info(
            "ElevenLabs TTS: synthesizing {} chars, voice={}, model={}, speed={}",
            len(text), voice, self.model, el_speed,
        )

        try:
            # 1. Call ElevenLabs API (async) with timestamps + speed
            response = await self.client.text_to_speech.convert_with_timestamps(
                voice_id=voice,
                text=text,
                model_id=self.model,
                output_format="mp3_44100_128",
                speed=el_speed,
            )

            # 2. Decode audio from base64
            audio_bytes = base64.b64decode(response.audio_base64)

            if not audio_bytes or len(audio_bytes) < 100:
                raise TTSError("ElevenLabs TTS returned empty or too-small audio")

            # 3. Save to file (inline, consistent with OpenAI/Edge pattern)
            if output_dir:
                out_dir = Path(output_dir)
                out_dir.mkdir(parents=True, exist_ok=True)
                audio_path = out_dir / "full.mp3"
            else:
                tmp = tempfile.NamedTemporaryFile(
                    suffix=".mp3", delete=False
                )
                audio_path = Path(tmp.name)
                tmp.close()

            audio_path.write_bytes(audio_bytes)

            # 4. Aggregate character timestamps → word timestamps
            word_boundaries_wt = _chars_to_word_timestamps(
                response.alignment.characters,
                response.alignment.character_start_times_seconds,
                response.alignment.character_end_times_seconds,
            )

            # 5. Accurate duration via mutagen
            duration_ms = _get_audio_duration_ms(str(audio_path))

            logger.info(
                "ElevenLabs TTS complete: {} bytes, {:.0f}ms, {} words, saved to {}",
                len(audio_bytes), duration_ms, len(word_boundaries_wt), audio_path,
            )

            return TTSResult(
                audio_bytes=audio_bytes,
                audio_path=str(audio_path),
                duration_ms=duration_ms,
                word_boundaries=[
                    {"text": wb.text, "start_ms": wb.start_ms, "end_ms": wb.end_ms}
                    for wb in word_boundaries_wt
                ],
            )

        except Exception as e:
            if "TTSError" in type(e).__name__:
                raise
            raise TTSError(f"ElevenLabs TTS failed: {e}") from e


# ── Gemini TTS Engine ──


class GeminiTTSEngine(TTSEngine):
    """Gemini 3.1 Flash TTS — LLM-powered TTS with excellent code-switching.

    Cost: ~765 VND per video (1 min).
    Quality: Excellent Vietnamese-English code-switching, 30 expressive voices.
    Note: No native word timestamps → requires Whisper alignment.
    Output: Raw PCM 24kHz 16-bit mono → convert to WAV → MP3.
    """

    MODELS = {
        "gemini-3.1-flash-tts-preview": "gemini-3.1-flash-tts-preview",
        "gemini-2.5-flash-preview-tts": "gemini-2.5-flash-preview-tts",
        "gemini-2.5-pro-preview-tts": "gemini-2.5-pro-preview-tts",
    }
    DEFAULT_MODEL = "gemini-3.1-flash-tts-preview"

    def __init__(self, api_key: str | None = None, model: str = "gemini-3.1-flash-tts-preview"):
        from google import genai

        self.api_key = api_key or GOOGLE_API_KEY
        if not self.api_key:
            raise TTSError("GOOGLE_API_KEY not configured")
        self.model = model if model in self.MODELS else self.DEFAULT_MODEL
        self.client = genai.Client(api_key=self.api_key)

    async def synthesize(
        self,
        text: str,
        voice: str = "Charon",
        rate: float = 1.0,
        volume: float = 1.0,
        output_dir: str | Path | None = None,
    ) -> TTSResult:
        """Synthesize text using Gemini TTS.

        Uses native async client (client.aio). Outputs PCM 24kHz → WAV → MP3.
        Speech rate applied via ffmpeg atempo post-processing.

        Args:
            text: Text to synthesize.
            voice: Gemini voice name (e.g. Charon, Kore, Puck).
            rate: Speech rate (0.5–4.0). Applied via ffmpeg post-processing.
            volume: Volume (not directly supported, ignored).
            output_dir: Directory to save the MP3 file.

        Returns:
            TTSResult with MP3 audio. No word_boundaries (Whisper will handle).

        Raises:
            TTSError: If API call fails.
        """
        from google.genai import types
        import wave

        logger.info(
            "Gemini TTS: synthesizing {} chars, voice={}, model={}",
            len(text), voice, self.model,
        )

        try:
            config = types.GenerateContentConfig(
                response_modalities=["audio"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=voice
                        )
                    )
                ),
            )

            # Native async call via client.aio
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=text,
                config=config,
            )

            # Extract PCM audio bytes
            audio_part = response.candidates[0].content.parts[0]
            pcm_data = audio_part.inline_data.data

            if not pcm_data or len(pcm_data) < 100:
                raise TTSError("Gemini TTS returned empty audio")

            # Resolve output paths
            if output_dir:
                out_dir = Path(output_dir)
                out_dir.mkdir(parents=True, exist_ok=True)
                wav_path = out_dir / "full.wav"
                mp3_path = out_dir / "full.mp3"
            else:
                tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
                wav_path = Path(tmp.name)
                mp3_path = wav_path.with_suffix(".mp3")
                tmp.close()

            # Write WAV (PCM 24kHz, 16-bit, mono)
            with wave.open(str(wav_path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)  # 16-bit
                wf.setframerate(24000)
                wf.writeframes(pcm_data)

            # Convert WAV -> MP3 via ffmpeg for Python 3.13+ compatibility
            _convert_audio_to_mp3_ffmpeg(wav_path, mp3_path)

            # Clean up WAV
            wav_path.unlink(missing_ok=True)

            # Apply speech rate via ffmpeg atempo if != 1.0
            if rate != 1.0:
                rate_tmp = mp3_path.with_name("full_rated.mp3")
                _apply_speech_rate_ffmpeg(mp3_path, rate_tmp, rate)
                rate_tmp.replace(mp3_path)  # overwrite original

            audio_bytes = mp3_path.read_bytes()

            # Accurate duration via mutagen
            duration_ms = _get_audio_duration_ms(str(mp3_path))

            logger.info(
                "Gemini TTS complete: {} bytes, {:.0f}ms, saved to {}",
                len(audio_bytes), duration_ms, mp3_path,
            )

            return TTSResult(
                audio_bytes=audio_bytes,
                audio_path=str(mp3_path),
                duration_ms=duration_ms,
                # No word_boundaries → Whisper will handle
            )

        except Exception as e:
            if "TTSError" in type(e).__name__:
                raise
            raise TTSError(f"Gemini TTS failed: {e}") from e


# ── Vbee TTS Engine ──


class VbeeTTSEngine(TTSEngine):
    """Vbee AIVoice TTS — best Vietnamese voice quality, lowest cost.

    Cost: ~181 VND per video (Tiêu chuẩn plan, 39K/month for 250K chars).
    Quality: Best Vietnamese pronunciation with regional accents (Bắc/Trung/Nam).
    Note: No native word timestamps → requires Whisper alignment.
    API: Callback-based → we use polling via Get Request endpoint.
    """

    API_BASE = "https://vbee.vn/api/v1/tts"
    DEFAULT_VOICE = "n_hanoi_male_nhabaohoangnam_news_vc"
    VOICES = {
        "phong_vien_nam": "n_hanoi_male_nhabaohoangnam_news_vc",
        "tuan_anh_news": "n_hanoi_male_tuananhnews_news_vc",
        "bao_trung_mc": "n_hanoi_male_baotrungmc_news_vc",
        "mr_cu": "n_hanoi_male_sizonguyen_education_vc",
    }
    POLL_INTERVAL = 1.5  # seconds between polls
    POLL_TIMEOUT = 30    # max wait seconds

    def __init__(self, app_id: str | None = None, api_token: str | None = None):
        self.app_id = app_id or VBEE_APP_ID
        self.api_token = api_token or VBEE_API_TOKEN
        if not self.app_id or not self.api_token:
            raise TTSError(
                "VBEE_APP_ID and VBEE_API_TOKEN not configured. "
                "Get credentials at https://vbee.vn"
            )

    async def synthesize(
        self,
        text: str,
        voice: str = "n_hanoi_male_nhabaohoangnam_news_vc",
        rate: float = 1.0,
        volume: float = 1.0,
        output_dir: str | Path | None = None,
    ) -> TTSResult:
        """Synthesize text using Vbee AIVoice API.

        Uses callback-based API with polling: POST → poll GET until SUCCESS
        → download audio from audio_link.

        Args:
            text: Text to synthesize.
            voice: Vbee voice code (e.g. n_hanoi_male_nhabaohoangnam_news_vc).
            rate: Speech rate (min 0.1, default 1.0).
            volume: Volume (not supported by Vbee API, ignored).
            output_dir: Directory to save the MP3 file.

        Returns:
            TTSResult with MP3 audio. No word_boundaries (Whisper will handle).

        Raises:
            TTSError: If API call or polling fails.
        """
        import asyncio

        import httpx

        # Resolve voice alias → full code
        voice = self.VOICES.get(voice, voice)

        logger.info(
            "Vbee TTS: synthesizing {} chars, voice={}, speed={}",
            len(text), voice, rate,
        )

        headers = {"Authorization": f"Bearer {self.api_token}"}

        try:
            # ── Step 1: Create speech request ──
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    self.API_BASE,
                    json={
                        "app_id": self.app_id,
                        "input_text": text,
                        "voice_code": voice,
                        "speed_rate": max(0.1, rate),
                        "audio_type": "mp3",
                        "bitrate": 128,
                        "response_type": "indirect",
                        "callback_url": "https://example.com/noop",
                    },
                    headers=headers,
                )
                resp.raise_for_status()
                create_data = resp.json()

            # request_id may be at top-level or nested inside "result"
            request_id = create_data.get("request_id") or create_data.get("result", {}).get("request_id")
            if not request_id:
                raise TTSError(
                    f"Vbee TTS: no request_id in response: {create_data}"
                )

            logger.debug("Vbee TTS: request_id={}, polling...", request_id)

            # ── Step 2: Poll for completion ──
            audio_link = None
            polls = int(self.POLL_TIMEOUT / self.POLL_INTERVAL)

            for attempt in range(polls):
                await asyncio.sleep(self.POLL_INTERVAL)

                async with httpx.AsyncClient(timeout=10) as client:
                    poll_resp = await client.get(
                        f"{self.API_BASE}/{request_id}",
                        headers=headers,
                    )
                    poll_data = poll_resp.json()

                # Response: {"status": 1, "result": {"status": "SUCCESS", ...}}
                result = poll_data.get("result", {})
                req_status = result.get("status", "")
                progress = result.get("progress", "?")

                if req_status == "SUCCESS":
                    audio_link = result.get("audio_link")
                    logger.debug(
                        "Vbee TTS: SUCCESS after {} polls, audio_link={}",
                        attempt + 1, audio_link,
                    )
                    break
                elif req_status == "FAILED":
                    raise TTSError(
                        f"Vbee TTS request failed: {poll_data}"
                    )
                else:
                    logger.debug(
                        "Vbee TTS: poll {}/{}, status={}, progress={}",
                        attempt + 1, polls, req_status, progress,
                    )

            if not audio_link:
                raise TTSError(
                    f"Vbee TTS timed out after {self.POLL_TIMEOUT}s "
                    f"(request_id={request_id})"
                )

            # ── Step 3: Download audio ──
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                audio_resp = await client.get(audio_link)
                audio_resp.raise_for_status()
                audio_bytes = audio_resp.content

            if not audio_bytes or len(audio_bytes) < 100:
                raise TTSError("Vbee TTS returned empty or too-small audio")

            # ── Step 4: Save to file ──
            if output_dir:
                out_dir = Path(output_dir)
                out_dir.mkdir(parents=True, exist_ok=True)
                audio_path = out_dir / "full.mp3"
            else:
                tmp = tempfile.NamedTemporaryFile(
                    suffix=".mp3", delete=False
                )
                audio_path = Path(tmp.name)
                tmp.close()

            audio_path.write_bytes(audio_bytes)

            # Accurate duration via mutagen
            duration_ms = _get_audio_duration_ms(str(audio_path))

            logger.info(
                "Vbee TTS complete: {} bytes, {:.0f}ms, saved to {}",
                len(audio_bytes), duration_ms, audio_path,
            )

            return TTSResult(
                audio_bytes=audio_bytes,
                audio_path=str(audio_path),
                duration_ms=duration_ms,
                # No word_boundaries → Whisper will handle
            )

        except Exception as e:
            if "TTSError" in type(e).__name__:
                raise
            raise TTSError(f"Vbee TTS failed: {e}") from e


# ── Engine Factory ──


_tts_engine_cache: dict[str, TTSEngine] = {}


def get_tts_engine(engine_name: str = "openai", **kwargs) -> TTSEngine:
    """Factory function to get a TTS engine by name.

    Args:
        engine_name: "openai", "edge-tts", "elevenlabs", "gemini", or "vbee".
        **kwargs: Engine-specific options (e.g. elevenlabs_model, gemini_model).

    Returns:
        TTSEngine instance (cached singleton per engine+config).

    Raises:
        ValueError: If engine_name is not supported.
    """
    # Generic cache key: include model for engines that have model variants
    _model_key_map = {
        "elevenlabs": kwargs.get("elevenlabs_model", "eleven_v3"),
        "gemini": kwargs.get("gemini_model", GeminiTTSEngine.DEFAULT_MODEL),
    }
    model_suffix = _model_key_map.get(engine_name)
    cache_key = f"{engine_name}:{model_suffix}" if model_suffix else engine_name

    if cache_key in _tts_engine_cache:
        return _tts_engine_cache[cache_key]

    if engine_name == "openai":
        engine = OpenAITTSEngine()
    elif engine_name == "edge-tts":
        engine = EdgeTTSEngine()
    elif engine_name == "elevenlabs":
        model = kwargs.get("elevenlabs_model", ElevenLabsTTSEngine.DEFAULT_MODEL)
        engine = ElevenLabsTTSEngine(model=model)
    elif engine_name == "gemini":
        model = kwargs.get("gemini_model", GeminiTTSEngine.DEFAULT_MODEL)
        engine = GeminiTTSEngine(model=model)
    elif engine_name == "vbee":
        engine = VbeeTTSEngine()
    else:
        raise ValueError(
            f"Unknown TTS engine: {engine_name}. "
            "Use 'openai', 'edge-tts', 'elevenlabs', 'gemini', or 'vbee'."
        )

    _tts_engine_cache[cache_key] = engine
    return engine
