"""TTS Preprocessor — Converts text for optimal TTS pronunciation.

Input:  Narration text string (Vietnamese, may contain numbers/abbreviations).
Output: Cleaned text string ready for TTS engine (no SSML).

Rules (from MASTER_PLAN Component 2A — TTS Preprocessor):
- Numbers → Vietnamese words (100 → "một trăm")
- Common abbreviations preserved as-is (AI, API, etc.)
- Custom abbreviation expansion via dict
- NO SSML wrapping (Edge-TTS dropped SSML support)
"""

from __future__ import annotations

import re

from loguru import logger
from num2words import num2words


# ── Common tech abbreviations that should NOT be expanded ──
# TTS engines handle these well as-is
PRESERVED_ABBREVIATIONS = {
    "RAM", "SSD", "HDD",
    "URL", "HTTP", "HTTPS", "HTML", "CSS", "JS", "TS",
    "GPT", "CNN", "RNN",
    "AWS", "GCP", "VPS", "SSH", "SQL", "NoSQL",
    "iOS", "macOS", "USB", "PDF", "SDK", "IDE",
    "TTS", "STT", "OCR", "QR",
    "VND", "USD", "EUR",
}

# ── Pronunciation fixes for Vietnamese TTS ──
# OpenAI TTS reads Vietnamese text; these abbreviations need dots
# to force letter-by-letter English pronunciation.
PRONUNCIATION_MAP: dict[str, str] = {
    "AI": "A.I.",
    "API": "A.P.I.",
    "GPU": "G.P.U.",
    "CPU": "C.P.U.",
    "UI": "U.I.",
    "UX": "U.X.",
    "LLM": "L.L.M.",
    "NLP": "N.L.P.",
    "ML": "M.L.",
    "DL": "D.L.",
}

# ── Default abbreviation expansions ──
DEFAULT_EXPANSIONS: dict[str, str] = {
    "TP.HCM": "Thành phố Hồ Chí Minh",
    "TP HCM": "Thành phố Hồ Chí Minh",
    "TPHCM": "Thành phố Hồ Chí Minh",
    "VN": "Việt Nam",
    "HN": "Hà Nội",
    "SG": "Sài Gòn",
    "vs": "versus",
    "etc": "et cetera",
}


def _convert_number_match(match: re.Match) -> str:
    """Convert a matched number string to Vietnamese words."""
    number_str = match.group(0)

    # Handle decimal numbers
    if "." in number_str or "," in number_str:
        # Vietnamese uses comma as decimal separator sometimes
        normalized = number_str.replace(",", ".")
        try:
            num = float(normalized)
            return num2words(num, lang="vi")
        except (ValueError, OverflowError):
            return number_str

    try:
        num = int(number_str)
        # Don't convert years (4-digit numbers like 2024, 2025)
        if 1900 <= num <= 2100:
            return number_str
        return num2words(num, lang="vi")
    except (ValueError, OverflowError):
        return number_str


def _convert_numbers_to_words(text: str) -> str:
    """Convert standalone numbers to Vietnamese word form.

    Preserves numbers that are part of identifiers (e.g., GPT-4, v2.0).
    """
    # Match standalone numbers (not preceded/followed by letters or hyphens connected to letters)
    # Pattern: number not adjacent to word chars (except when it IS the word)
    pattern = r"(?<![a-zA-Z\-])\d+(?:[.,]\d+)?(?![a-zA-Z\-])"
    return re.sub(pattern, _convert_number_match, text)


def _expand_abbreviations(
    text: str,
    custom_expansions: dict[str, str] | None = None,
) -> str:
    """Expand abbreviations that TTS engines mispronounce.

    Preserves common tech abbreviations that TTS handles well.
    """
    expansions = {**DEFAULT_EXPANSIONS}
    if custom_expansions:
        expansions.update(custom_expansions)

    result = text
    for abbr, full_form in expansions.items():
        # Word-boundary aware replacement
        pattern = re.compile(re.escape(abbr), re.IGNORECASE)
        result = pattern.sub(full_form, result)

    return result


def _apply_pronunciation_map(text: str) -> str:
    """Replace abbreviations with TTS-friendly pronunciation.

    Adds dots between letters so TTS reads them as English letters
    instead of Vietnamese syllables (e.g. "AI" → "A.I.").
    Uses word boundaries to avoid affecting words like MAIN or RAIN.
    """
    result = text
    for abbr, pronunciation in PRONUNCIATION_MAP.items():
        pattern = re.compile(r'\b' + re.escape(abbr) + r'\b')
        result = pattern.sub(pronunciation, result)
    return result

def preprocess_for_tts(
    narration: str,
    custom_expansions: dict[str, str] | None = None,
    engine_name: str = "",
) -> str:
    """Preprocess plain text for TTS. NO SSML wrapping.

    Args:
        narration: Raw narration text.
        custom_expansions: Optional dict of abbreviation → full form.
        engine_name: TTS engine identifier. Vietnamese engines (vbee, edge-tts)
            skip the pronunciation map to avoid dots being read as sentence breaks.

    Returns:
        Cleaned text optimized for TTS pronunciation.
    """
    if not narration or not narration.strip():
        return narration

    result = narration

    # Step 1: Expand custom abbreviations
    result = _expand_abbreviations(result, custom_expansions)

    # Step 1.5: Apply pronunciation fixes — SKIP for Vietnamese TTS engines
    # Vietnamese engines (Vbee, edge-tts) interpret dots as sentence endings,
    # causing unnatural pauses (e.g. "A.I." → "A" [pause] "I" [pause]).
    _SKIP_PRONUNCIATION_ENGINES = {"vbee", "edge-tts"}
    if engine_name.lower() not in _SKIP_PRONUNCIATION_ENGINES:
        result = _apply_pronunciation_map(result)

    # Step 2: Convert numbers to Vietnamese words
    result = _convert_numbers_to_words(result)

    # Step 3: Clean up extra whitespace
    result = re.sub(r"  +", " ", result).strip()

    changes = result != narration
    if changes:
        logger.debug("TTS preprocessed: '{}' → '{}'", narration[:50], result[:50])

    return result
