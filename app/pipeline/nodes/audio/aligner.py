"""Word Aligner — stable-ts forced alignment.

Input:  Audio file path + original narration text.
Output: list[WordTimestamp] — [{text, start_ms, end_ms}, ...].

Uses stable-ts model.align() to force-align KNOWN text to audio.
This produces word-level timestamps using the original text (no transcription),
eliminating Vietnamese spelling errors that occur with Whisper transcribe().

See MASTER_PLAN section "Fallback Strategy" for details.
"""

from __future__ import annotations

from pathlib import Path

from loguru import logger

from app.state import WordTimestamp


class WordAlignerError(Exception):
    """Raised when word alignment fails."""
    pass


async def align_words(
    audio_path: str | Path,
    original_text: str,
    language: str = "vi",
    model_name: str | None = None,
) -> list[WordTimestamp]:
    """Force-align known text to audio using stable-ts.

    Unlike Whisper transcribe() which guesses text from audio (and often
    produces Vietnamese spelling errors), this function takes the KNOWN
    narration text and only computes accurate timestamps for each word.

    Args:
        audio_path: Path to the audio file (MP3/WAV).
        original_text: The exact narration text (source of truth for content).
        language: Language code for Whisper (default: "vi" for Vietnamese).
        model_name: Whisper model size ("tiny", "base", "small", "medium").

    Returns:
        List of WordTimestamp objects with original text + accurate timestamps.

    Raises:
        WordAlignerError: If alignment fails.
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise WordAlignerError(f"Audio file not found: {audio_path}")

    if not original_text or not original_text.strip():
        raise WordAlignerError("original_text is empty")

    logger.info(
        "Aligning words: {} (model={}, lang={}, text_len={})",
        audio_path, model_name, language, len(original_text),
    )

    if model_name is None:
        import config
        model_name = getattr(config, "WHISPER_MODEL_NAME", "tiny")

    try:
        timestamps = await _align_with_stable_ts(
            audio_path, original_text, language, model_name
        )
    except Exception as e:
        if model_name != "tiny":
            logger.warning(
                "stable-ts '{}' failed: {}. Falling back to 'tiny'...",
                model_name, e,
            )
            try:
                timestamps = await _align_with_stable_ts(
                    audio_path, original_text, language, "tiny"
                )
            except Exception as fallback_error:
                raise WordAlignerError(
                    f"All models failed. {model_name}: {e} | tiny: {fallback_error}"
                ) from fallback_error
        else:
            raise WordAlignerError(f"stable-ts alignment failed: {e}") from e

    if not timestamps:
        raise WordAlignerError("stable-ts produced no word timestamps")

    # Post-process: fix collapsed timestamps (Whisper alignment failures)
    timestamps = _fix_collapsed_timestamps(timestamps)

    logger.info(
        "Aligned {} words, total duration: {:.0f}ms",
        len(timestamps), timestamps[-1].end_ms if timestamps else 0,
    )

    return timestamps


def _fix_collapsed_timestamps(
    timestamps: list[WordTimestamp],
) -> list[WordTimestamp]:
    """Redistribute timing for words where start_ms == end_ms (Whisper fail).

    When stable-ts can't align certain words, they get collapsed timestamps
    (e.g. start_ms=25320, end_ms=25320). This causes all those words to
    flash in a single frame.

    Two-phase approach:
    1. Detect all collapsed groups (consecutive words with start==end)
    2. Redistribute timing evenly between previous word's end and next valid word's start
    """
    if not timestamps:
        return timestamps

    # Phase 1: Find all collapsed groups
    groups: list[tuple[int, int]] = []  # (start_idx, end_idx exclusive)
    i = 0
    while i < len(timestamps):
        if timestamps[i].end_ms - timestamps[i].start_ms < 10:  # < 10ms = collapsed
            j = i
            while j < len(timestamps) and timestamps[j].end_ms - timestamps[j].start_ms < 10:
                j += 1
            groups.append((i, j))
            i = j
        else:
            i += 1

    if not groups:
        return timestamps

    # Phase 2: Redistribute each group
    for start_idx, end_idx in groups:
        prev_end = timestamps[start_idx - 1].end_ms if start_idx > 0 else 0
        next_start = (
            timestamps[end_idx].start_ms
            if end_idx < len(timestamps)
            else timestamps[-1].end_ms + 500
        )

        count = end_idx - start_idx
        duration = next_start - prev_end
        per_word = duration / count if count > 0 else 0

        for k in range(count):
            timestamps[start_idx + k].start_ms = round(prev_end + k * per_word, 1)
            timestamps[start_idx + k].end_ms = round(prev_end + (k + 1) * per_word, 1)

        logger.debug(
            "Fixed {} collapsed words at idx {}-{}: redistributed {:.0f}ms ({:.0f}ms/word)",
            count, start_idx, end_idx - 1, duration, per_word,
        )

    return timestamps


async def _align_with_stable_ts(
    audio_path: Path,
    original_text: str,
    language: str,
    model_name: str,
) -> list[WordTimestamp]:
    """Run stable-ts forced alignment with known text.

    Uses model.align() which is significantly faster than transcribe()
    and preserves the original text exactly.
    """
    import asyncio

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _align_sync, str(audio_path), original_text, language, model_name
    )


def _align_sync(
    audio_path: str,
    original_text: str,
    language: str,
    model_name: str,
) -> list[WordTimestamp]:
    """Synchronous stable-ts alignment (runs in thread pool)."""
    import os
    from pathlib import Path
    import stable_whisper
    from app.pipeline.nodes.audio.synthesizer import _resolve_ffmpeg_executable

    # Ensure ffmpeg is in PATH for stable-ts (which calls whisper load_audio)
    ffmpeg_exe = _resolve_ffmpeg_executable()
    ffmpeg_dir = str(Path(ffmpeg_exe).parent)
    if ffmpeg_dir not in os.environ["PATH"]:
        os.environ["PATH"] = f"{ffmpeg_dir}{os.pathsep}{os.environ['PATH']}"

    logger.debug("Loading stable-ts model '{}'...", model_name)
    model = stable_whisper.load_model(model_name)

    logger.debug("Aligning known text to audio...")
    result = model.align(audio_path, original_text, language=language)

    timestamps: list[WordTimestamp] = []

    for word in result.all_words():
        text = word.word.strip()
        if not text:
            continue

        timestamps.append(
            WordTimestamp(
                text=text,
                start_ms=round(word.start * 1000, 1),
                end_ms=round(word.end * 1000, 1),
            )
        )

    return timestamps


def estimate_timestamps_from_duration(
    text: str,
    total_duration_ms: float,
) -> list[WordTimestamp]:
    """Fallback: estimate word timestamps from total audio duration.

    Used when stable-ts alignment fails completely.
    Distributes words evenly across the duration.
    """
    words = text.split()
    if not words:
        return []

    ms_per_word = total_duration_ms / len(words)
    timestamps = []

    for i, word in enumerate(words):
        timestamps.append(
            WordTimestamp(
                text=word,
                start_ms=round(i * ms_per_word, 1),
                end_ms=round((i + 1) * ms_per_word, 1),
            )
        )

    logger.warning(
        "Using estimated timestamps ({} words, {:.0f}ms each)",
        len(words), ms_per_word,
    )
    return timestamps
