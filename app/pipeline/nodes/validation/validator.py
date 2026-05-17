"""Input Validator — Rule-based text validation (no API cost, instant).

Input:  Raw text string from user.
Output: Validated text string (cleaned) or raises ValidationError.

Rules (from MASTER_PLAN Component 0):
- Too short: word_count < 30 → reject
- Too long: word_count > 500 → reject + show count
- Spam: 3+ consecutive identical sentences (≥90% match) → reject
- Light duplicates: duplicate sentences <3 consecutive → warning
- Emoji/CJK: auto-remove + notify
- Gibberish: 5+ consecutive meaningless consonants → warning
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from loguru import logger


class ValidationError(Exception):
    """Raised when input text fails validation rules."""

    def __init__(self, message: str, rule: str):
        self.rule = rule
        super().__init__(message)


@dataclass
class ValidationResult:
    """Result of input validation."""

    text: str
    warnings: list[str] = field(default_factory=list)
    removed_chars: list[str] = field(default_factory=list)


# ── Regex patterns ──

# Emoji + CJK (Chinese/Japanese/Korean) + misc symbols
_EMOJI_PATTERN = re.compile(
    "["
    "\U0001f600-\U0001f64f"  # emoticons
    "\U0001f300-\U0001f5ff"  # symbols & pictographs
    "\U0001f680-\U0001f6ff"  # transport & map
    "\U0001f1e0-\U0001f1ff"  # flags
    "\U00002702-\U000027b0"  # dingbats
    "\U0001f900-\U0001f9ff"  # supplemental symbols
    "\U0001fa00-\U0001fa6f"  # chess symbols
    "\U0001fa70-\U0001faff"  # symbols extended
    "\U00002600-\U000026ff"  # misc symbols
    "\u3000-\u303f"  # CJK punctuation
    "\u3040-\u309f"  # Hiragana
    "\u30a0-\u30ff"  # Katakana
    "\u4e00-\u9fff"  # CJK unified ideographs
    "\uf900-\ufaff"  # CJK compatibility
    "]+",
    flags=re.UNICODE,
)

# Gibberish: 5+ consecutive consonants (no vowels)
_GIBBERISH_PATTERN = re.compile(r"[bcdfghjklmnpqrstvwxz]{5,}", re.IGNORECASE)


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences by common delimiters."""
    sentences = re.split(r"[.!?。]+", text)
    return [s.strip() for s in sentences if s.strip()]


def _similarity(a: str, b: str) -> float:
    """Simple word-overlap similarity (0.0–1.0)."""
    words_a = set(a.lower().split())
    words_b = set(b.lower().split())
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    return len(intersection) / max(len(words_a), len(words_b))


def validate_input(text: str) -> ValidationResult:
    """Validate and clean raw input text.

    Args:
        text: Raw text from user input.

    Returns:
        ValidationResult with cleaned text and any warnings.

    Raises:
        ValidationError: If text fails a hard validation rule.
    """
    if not text or not text.strip():
        raise ValidationError("Text is empty", rule="empty")

    cleaned = text.strip()
    warnings: list[str] = []
    removed_chars: list[str] = []

    # ── Rule: Emoji/CJK removal ──
    emoji_matches = _EMOJI_PATTERN.findall(cleaned)
    if emoji_matches:
        removed_chars.extend(emoji_matches)
        cleaned = _EMOJI_PATTERN.sub("", cleaned)
        cleaned = re.sub(r"  +", " ", cleaned).strip()
        warnings.append(
            f"Removed {len(emoji_matches)} emoji/CJK characters"
        )
        logger.info("Auto-removed {} emoji/CJK chars", len(emoji_matches))

    # ── Rule: Word count ──
    word_count = len(cleaned.split())

    if word_count < 30:
        raise ValidationError(
            f"Text too short: {word_count} words (minimum 30)",
            rule="too_short",
        )

    if word_count > 500:
        raise ValidationError(
            f"Text too long: {word_count} words (maximum 500)",
            rule="too_long",
        )

    # ── Rule: Spam detection (3+ consecutive identical sentences) ──
    sentences = _split_sentences(cleaned)
    if len(sentences) >= 3:
        consecutive_count = 1
        for i in range(1, len(sentences)):
            if _similarity(sentences[i], sentences[i - 1]) >= 0.9:
                consecutive_count += 1
                if consecutive_count >= 3:
                    raise ValidationError(
                        "Spam detected: 3+ consecutive identical/similar sentences",
                        rule="spam",
                    )
            else:
                consecutive_count = 1

    # ── Rule: Light duplicates (warning only) ──
    if len(sentences) >= 2:
        seen = set()
        for s in sentences:
            normalized = s.lower().strip()
            if normalized in seen:
                warnings.append("Warning: duplicate sentence detected")
                logger.warning("Duplicate sentence: '{}'", s[:50])
                break
            seen.add(normalized)

    # ── Rule: Gibberish detection (warning only) ──
    gibberish_matches = _GIBBERISH_PATTERN.findall(cleaned)
    if gibberish_matches:
        warnings.append(
            f"Warning: possible gibberish detected ({', '.join(gibberish_matches[:3])})"
        )
        logger.warning("Gibberish detected: {}", gibberish_matches[:3])

    logger.info(
        "Input validated: {} words, {} warnings", word_count, len(warnings)
    )
    return ValidationResult(
        text=cleaned, warnings=warnings, removed_chars=removed_chars
    )
