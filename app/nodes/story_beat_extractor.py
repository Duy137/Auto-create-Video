"""Extract story beats from narration.

Used as the audit-fail fallback (Concept D — Story Beats):
when Pexels returns no fitting media, we decompose the scene's narration
into 2-5 micro-beats, each with one emoji, and render them via Remotion's
StoryBeats component.

Pipeline:
  1. Try LLM (Qwen) to get semantic decomposition + emoji per beat.
  2. If LLM fails or returns garbage, fall back to word-gap splitting
     + rule-based emoji lookup.
  3. Always align beat text → wordTimestamps to set start_ms / end_ms.

[CryptoVN Custom] Cherry-picked from upstream A20-App-160.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any

import httpx
from loguru import logger

from app.nodes.emoji_lookup import assign_emojis_to_beats, lookup_emoji
from app.state import TokenUsage, calc_cost
from config import (
    QWEN_API_KEY,
    QWEN_BASE_URL,
    STORY_BEAT_LLM_ENABLED,
    STORY_BEAT_LLM_MODEL,
    STORY_BEAT_LLM_TIMEOUT_SECONDS,
    STORY_BEAT_MAX_BEATS,
    STORY_BEAT_MIN_BEAT_MS,
)


_PUNCT_BOUNDARY = re.compile(r"[.!?,;:]\s*$")
_WORD_GAP_MIN_MS = 250  # gap between words to consider a beat boundary
_EMOJI_CHAR = re.compile(
    "["
    "\U0001F1E6-\U0001F1FF"  # flags
    "\U0001F300-\U0001FAFF"  # symbols & pictographs
    "\u2600-\u27BF"          # dingbats/misc
    "]",
    flags=re.UNICODE,
)


# ── Public API ──


async def extract_story_beats(
    scene: dict[str, Any],
    word_timestamps: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], TokenUsage | None]:
    """Extract 1-N story beats for a scene.

    Args:
        scene: Scene dict with at minimum `narration`, `start_ms`, `end_ms`.
        word_timestamps: Global word timestamps (full video). Will be filtered
            to this scene's time window.

    Returns:
        Tuple of (beats, token_usage).
        List of beat dicts: `[{text, emoji, start_ms, end_ms}, ...]`.
        Empty list if narration is empty.
    """
    narration = (scene.get("narration") or "").strip()
    if not narration:
        return [], None

    scene_start = float(scene.get("start_ms", 0) or 0)
    scene_end = float(scene.get("end_ms", 0) or 0)

    # Filter to scene's words (use a small tolerance because word.start_ms
    # is sometimes 1-2ms off the scene boundary).
    scene_words: list[dict[str, Any]] = []
    if word_timestamps:
        for w in word_timestamps:
            ws = float(w.get("start_ms", 0) or 0)
            we = float(w.get("end_ms", 0) or 0)
            if ws >= scene_start - 50 and we <= scene_end + 50:
                scene_words.append(w)

    # Edge case: very short narration should stay as a single beat.
    if len(narration.split()) < 5:
        start_ms = float(scene_words[0].get("start_ms", scene_start)) if scene_words else scene_start
        end_ms = float(scene_words[-1].get("end_ms", scene_end)) if scene_words else scene_end
        return [_build_single_beat(narration, start_ms, end_ms)], None

    # Edge case: missing timestamps from TTS/aligner. Keep one full beat
    # instead of aggressive punctuation splitting to avoid visual flashes.
    if not scene_words:
        return [_build_single_beat(narration, scene_start, scene_end)], None

    # Try LLM first
    beats: list[dict[str, Any]] | None = None
    token_usage: TokenUsage | None = None
    if STORY_BEAT_LLM_ENABLED and QWEN_API_KEY:
        try:
            llm_beats, token_usage = await _extract_beats_with_qwen(
                narration,
                scene.get("keywords_to_highlight") or [],
            )
            if llm_beats:
                beats = _align_beats_with_timestamps(
                    llm_beats, narration, scene_words,
                    scene_start, scene_end,
                )
        except Exception as e:
            logger.warning("Qwen beat extraction failed: {}. Falling back to rule-based.", e)

    # Rule-based fallback
    if not beats:
        beats = _split_beats_by_word_gaps(narration, scene_words, scene_start, scene_end)
        beats = assign_emojis_to_beats(
            beats,
            scene_keywords=scene.get("keywords_to_highlight") or [],
        )

    # Final safety: clamp to max, merge short
    beats = _merge_short_beats(beats, STORY_BEAT_MIN_BEAT_MS)
    if len(beats) > STORY_BEAT_MAX_BEATS:
        beats = _reduce_to_max(beats, STORY_BEAT_MAX_BEATS)

    # If everything ended up empty, return one beat covering the whole narration
    if not beats:
        beats = [_build_single_beat(narration, scene_start, scene_end)]
    else:
        for beat in beats:
            beat["emoji"] = _sanitize_emoji(beat.get("emoji"), fallback="✨")

    return beats, token_usage


# ── LLM (Qwen) extraction ──


async def _extract_beats_with_qwen(
    narration: str,
    keywords: list[str],
) -> tuple[list[dict[str, Any]], TokenUsage | None]:
    """Ask Qwen to decompose narration into beats with emojis.

    Returns (list of {text, emoji}, token_usage_or_None).
    """
    if not QWEN_API_KEY:
        return [], None

    instruction = (
        f"Decompose the following narration into 2 to {STORY_BEAT_MAX_BEATS} "
        f"semantic 'beats'. Each beat is one micro-idea (3-8 words). "
        f"Pick ONE emoji that best represents each beat's core meaning.\n\n"
        f"Constraints:\n"
        f"- Beat text MUST be a contiguous substring of the narration "
        f"(preserve original word order and casing).\n"
        f"- Cover the ENTIRE narration, no overlap, no gaps.\n"
        f"- Choose a common, semantically-relevant emoji "
        f"(prefer 🤖 🚀 💡 ✨ 📈 ⏰ 🛡️ ⚡ over obscure ones).\n"
        f"- Return STRICT JSON with this shape:\n"
        f'  {{"beats": [{{"text": "...", "emoji": "🚀"}}, ...]}}\n\n'
        f"Narration: {narration!r}\n"
        f"Keywords to highlight: {keywords}"
    )

    url = f"{QWEN_BASE_URL.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {QWEN_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": STORY_BEAT_LLM_MODEL,
        "messages": [{"role": "user", "content": instruction}],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
        "max_tokens": 500,
    }

    timeout = max(2.0, STORY_BEAT_LLM_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await asyncio.wait_for(
            client.post(url, headers=headers, json=payload),
            timeout=timeout + 1.0,
        )

    resp.raise_for_status()
    data = resp.json()

    # Extract token usage from DashScope response
    usage_data = data.get("usage", {})
    input_tokens = usage_data.get("prompt_tokens", 0) or usage_data.get("input_tokens", 0)
    output_tokens = usage_data.get("completion_tokens", 0) or usage_data.get("output_tokens", 0)
    model = STORY_BEAT_LLM_MODEL
    token_usage = TokenUsage(
        model=model,
        step="story_beats.extract",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=calc_cost(model, input_tokens, output_tokens),
    )

    raw = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    if not raw:
        return [], token_usage

    parsed = json.loads(raw)
    raw_beats = parsed.get("beats") or []
    cleaned: list[dict[str, Any]] = []
    for b in raw_beats:
        if not isinstance(b, dict):
            continue
        text = str(b.get("text", "")).strip()
        emoji = _sanitize_emoji(b.get("emoji"), fallback="✨")
        if text:
            cleaned.append({"text": text, "emoji": emoji})

    return cleaned, token_usage


# ── Aligner: match LLM beat texts back to wordTimestamps ──


def _align_beats_with_timestamps(
    llm_beats: list[dict[str, Any]],
    narration: str,
    word_timestamps: list[dict[str, Any]],
    scene_start: float,
    scene_end: float,
) -> list[dict[str, Any]]:
    """Find each beat's word range in word_timestamps and assign start/end ms."""
    if not word_timestamps:
        return _distribute_evenly(llm_beats, scene_start, scene_end)

    aligned: list[dict[str, Any]] = []
    cursor = 0  # index into word_timestamps

    for beat in llm_beats:
        target = _normalize_text(beat["text"])
        if not target:
            continue

        beat_start_ms: float | None = None
        beat_end_ms: float | None = None
        consumed_words: list[str] = []

        target_word_count = max(1, len(target.split()))
        target_word_count = min(target_word_count, len(word_timestamps) - cursor)

        for _ in range(target_word_count):
            if cursor >= len(word_timestamps):
                break
            w = word_timestamps[cursor]
            wtext = str(w.get("text", "")).strip()
            if not consumed_words:
                beat_start_ms = float(w.get("start_ms", 0) or 0)
            consumed_words.append(wtext)
            beat_end_ms = float(w.get("end_ms", 0) or 0)
            cursor += 1

            consumed_norm = _normalize_text(" ".join(consumed_words))
            if target in consumed_norm:
                break

        if beat_start_ms is None or beat_end_ms is None:
            continue

        aligned.append({
            "text": beat["text"],
            "emoji": _sanitize_emoji(beat.get("emoji"), fallback="✨"),
            "start_ms": beat_start_ms,
            "end_ms": beat_end_ms,
        })

    if not aligned:
        return _distribute_evenly(llm_beats, scene_start, scene_end)

    if aligned and scene_end > aligned[-1]["end_ms"]:
        aligned[-1]["end_ms"] = scene_end

    return aligned


def _normalize_text(t: str) -> str:
    """Normalize text for fuzzy comparison."""
    t = re.sub(r"[^\w\s]", " ", t.lower(), flags=re.UNICODE)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _distribute_evenly(
    llm_beats: list[dict[str, Any]],
    scene_start: float,
    scene_end: float,
) -> list[dict[str, Any]]:
    """When no word timestamps, split scene duration evenly among beats."""
    n = max(1, len(llm_beats))
    duration = max(0.0, scene_end - scene_start)
    chunk = duration / n if n else duration
    out: list[dict[str, Any]] = []
    for i, beat in enumerate(llm_beats):
        out.append({
            "text": beat["text"],
            "emoji": _sanitize_emoji(beat.get("emoji"), fallback="✨"),
            "start_ms": scene_start + i * chunk,
            "end_ms": scene_start + (i + 1) * chunk,
        })
    return out


def _sanitize_emoji(value: Any, fallback: str = "✨") -> str:
    """Coerce arbitrary LLM output into a single valid emoji glyph."""
    if not value:
        return fallback
    s = str(value).strip()
    if not s:
        return fallback
    match = _EMOJI_CHAR.search(s)
    if match:
        return match.group(0)
    return fallback


def _build_single_beat(narration: str, start_ms: float, end_ms: float) -> dict[str, Any]:
    """Build a one-beat fallback covering the full narration."""
    safe_start = float(start_ms or 0)
    safe_end = float(end_ms or 0)
    if safe_end <= safe_start:
        safe_end = safe_start + 3000.0
    return {
        "text": narration,
        "emoji": _sanitize_emoji(lookup_emoji(narration), fallback="✨"),
        "start_ms": safe_start,
        "end_ms": safe_end,
    }


# ── Rule-based fallback: split by punctuation + word gaps ──


def _split_beats_by_word_gaps(
    narration: str,
    word_timestamps: list[dict[str, Any]],
    scene_start: float,
    scene_end: float,
) -> list[dict[str, Any]]:
    """Split into beats based on punctuation and inter-word gaps."""
    if not word_timestamps:
        chunks = _split_by_punctuation(narration)
        return _distribute_evenly(
            [{"text": c, "emoji": "✨"} for c in chunks],
            scene_start, scene_end,
        )

    beats: list[dict[str, Any]] = []
    current: list[dict[str, Any]] = []

    for i, w in enumerate(word_timestamps):
        current.append(w)
        text = str(w.get("text", ""))
        is_last = i == len(word_timestamps) - 1

        ends_with_punct = bool(_PUNCT_BOUNDARY.search(text))
        gap_to_next = 0.0
        if not is_last:
            next_w = word_timestamps[i + 1]
            gap_to_next = float(next_w.get("start_ms", 0) or 0) - float(w.get("end_ms", 0) or 0)

        boundary = ends_with_punct or gap_to_next >= _WORD_GAP_MIN_MS or is_last
        if boundary and current:
            beat_text = " ".join(str(x.get("text", "")) for x in current).strip()
            beats.append({
                "text": beat_text,
                "emoji": "✨",  # filled by assign_emojis_to_beats later
                "start_ms": float(current[0].get("start_ms", 0) or 0),
                "end_ms": float(current[-1].get("end_ms", 0) or 0),
            })
            current = []

    return beats


def _split_by_punctuation(narration: str) -> list[str]:
    """Coarse split when we have no word timestamps."""
    parts = re.split(r"[.!?,;:]\s*", narration)
    return [p.strip() for p in parts if p.strip()]


# ── Beat post-processing ──


def _merge_short_beats(
    beats: list[dict[str, Any]],
    min_ms: int,
) -> list[dict[str, Any]]:
    """Merge any beat shorter than `min_ms` with its right neighbor."""
    if not beats:
        return beats
    merged: list[dict[str, Any]] = []
    i = 0
    while i < len(beats):
        beat = dict(beats[i])
        duration = beat["end_ms"] - beat["start_ms"]
        if duration < min_ms and i + 1 < len(beats):
            nxt = beats[i + 1]
            beat = {
                "text": (beat["text"] + " " + nxt["text"]).strip(),
                "emoji": beat["emoji"] or nxt["emoji"],
                "start_ms": beat["start_ms"],
                "end_ms": nxt["end_ms"],
            }
            i += 2
        else:
            i += 1
        if (
            beat["end_ms"] - beat["start_ms"] < min_ms
            and merged
        ):
            prev = merged.pop()
            beat = {
                "text": (prev["text"] + " " + beat["text"]).strip(),
                "emoji": prev["emoji"] or beat["emoji"],
                "start_ms": prev["start_ms"],
                "end_ms": beat["end_ms"],
            }
        merged.append(beat)
    return merged


def _reduce_to_max(
    beats: list[dict[str, Any]],
    max_count: int,
) -> list[dict[str, Any]]:
    """Iteratively merge the two adjacent shortest-combined beats until count <= max."""
    out = [dict(b) for b in beats]
    while len(out) > max_count:
        best_i = 0
        best_dur = float("inf")
        for i in range(len(out) - 1):
            dur = (out[i + 1]["end_ms"] - out[i]["start_ms"])
            if dur < best_dur:
                best_dur = dur
                best_i = i
        a, b = out[best_i], out[best_i + 1]
        merged_beat = {
            "text": (a["text"] + " " + b["text"]).strip(),
            "emoji": a["emoji"] or b["emoji"],
            "start_ms": a["start_ms"],
            "end_ms": b["end_ms"],
        }
        out = out[:best_i] + [merged_beat] + out[best_i + 2:]
    return out
