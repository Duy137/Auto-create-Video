"""Rule-based keyword → emoji lookup.

Used as fallback when LLM-based emoji generation is unavailable
(no API key, network down, or LLM call fails).

Coverage is intentionally moderate (~80 entries). For higher quality,
prefer LLM-based extraction in story_beat_extractor.
"""

from __future__ import annotations


# Lower-case keyword → emoji. Order doesn't matter for `lookup_emoji`,
# but specific keywords should appear before generic ones in `_PRIORITY` below.
_EMOJI_MAP: dict[str, str] = {
    # AI / Tech
    "ai": "🤖",
    "agent": "🤖",
    "robot": "🤖",
    "model": "🧠",
    "neural": "🧠",
    "brain": "🧠",
    "thinking": "🧠",
    "code": "💻",
    "developer": "👨‍💻",
    "programming": "💻",
    "github": "🐙",
    "computer": "💻",
    "laptop": "💻",
    # Speed / Action
    "fast": "⚡",
    "speed": "⚡",
    "quick": "⚡",
    "rocket": "🚀",
    "deploy": "🚀",
    "launch": "🚀",
    "ship": "🚀",
    "boost": "🚀",
    # Money / Business
    "money": "💰",
    "revenue": "💵",
    "profit": "💵",
    "cash": "💵",
    "growth": "📈",
    "increase": "📈",
    "rise": "📈",
    "gem": "💎",
    "value": "💎",
    "bank": "🏦",
    "business": "💼",
    "enterprise": "🏢",
    # Process / System
    "step": "🔢",
    "process": "⚙️",
    "automate": "⚙️",
    "automation": "⚙️",
    "workflow": "⚙️",
    "pipeline": "🔧",
    # Cloud / Data
    "cloud": "☁️",
    "server": "🖥️",
    "data": "💾",
    "database": "🗄️",
    "storage": "🗄️",
    # Idea / Innovation
    "idea": "💡",
    "innovation": "💡",
    "insight": "💡",
    "discover": "🔍",
    "research": "🔬",
    # Time
    "time": "⏰",
    "deadline": "⏳",
    "wait": "⏳",
    "hour": "⏰",
    "day": "📅",
    "year": "📅",
    "fast-track": "⚡",
    # Communication / People
    "team": "👥",
    "user": "👤",
    "customer": "🛍️",
    "client": "🤝",
    "partner": "🤝",
    "talk": "💬",
    "chat": "💬",
    "message": "💬",
    # Warning / Alert
    "warning": "⚠️",
    "alert": "🚨",
    "error": "❌",
    "fail": "❌",
    "crash": "💥",
    "bug": "🐛",
    # Success / Check
    "success": "✅",
    "check": "✅",
    "done": "🎉",
    "complete": "🎉",
    "win": "🏆",
    "best": "🏆",
    # World / Global
    "world": "🌍",
    "global": "🌐",
    "earth": "🌍",
    "international": "🌐",
    # Education
    "learn": "📚",
    "study": "📚",
    "education": "🎓",
    "school": "🎓",
    "course": "📝",
    "tutorial": "📝",
    "guide": "📖",
    "book": "📖",
    # Health
    "health": "❤️",
    "medical": "🏥",
    "doctor": "👨‍⚕️",
    "drug": "💊",
    "medicine": "💊",
    # Nature
    "tree": "🌳",
    "plant": "🌱",
    "green": "🌱",
    "water": "🌊",
    "ocean": "🌊",
    "sun": "☀️",
    "fire": "🔥",
    "energy": "⚡",
    # Vietnamese-specific common terms
    "việt": "🇻🇳",
    "tiền": "💰",
    "nhanh": "⚡",
    "trí tuệ": "🧠",
    "an toàn": "🛡️",
    "bảo mật": "🛡️",
    "công nghệ": "💻",
}

# When multiple keywords match, prefer earlier ones (more specific).
_PRIORITY: list[str] = [
    # Multi-word / specific first
    "trí tuệ", "an toàn", "bảo mật", "công nghệ", "fast-track",
    "ai", "agent", "rocket", "deploy", "launch",
    "money", "revenue", "growth",
    "cloud", "server", "data",
    "idea", "innovation",
    "team", "user", "customer",
    "warning", "error", "success",
    "world", "global",
    "learn", "education",
]


_FALLBACK_EMOJI = "✨"


def lookup_emoji(text: str, fallback: str = _FALLBACK_EMOJI) -> str:
    """Find the best emoji for a piece of text.

    Tries priority keywords first, then any match in _EMOJI_MAP.
    Returns `fallback` if nothing matches.
    """
    if not text:
        return fallback
    text_lower = text.lower()

    # Priority pass — most specific keywords first
    for kw in _PRIORITY:
        if kw in text_lower:
            return _EMOJI_MAP[kw]

    # Generic pass — first match wins
    for kw, emoji in _EMOJI_MAP.items():
        if kw in text_lower:
            return emoji

    return fallback


def assign_emojis_to_beats(
    beats: list[dict],
    scene_keywords: list[str] | None = None,
    diversify: bool = True,
) -> list[dict]:
    """Fill `emoji` field on each beat using rule-based lookup.

    If `diversify=True`, avoid using the same emoji twice in one scene
    by falling back to scene keywords or generic ✨ for duplicates.
    """
    used: set[str] = set()
    scene_keywords = scene_keywords or []
    keyword_blob = " ".join(scene_keywords).lower()

    for beat in beats:
        emoji = lookup_emoji(beat.get("text", ""))

        if diversify and emoji in used and emoji != _FALLBACK_EMOJI:
            # Try to pick a different one from scene keywords
            alt = lookup_emoji(keyword_blob, fallback="")
            if alt and alt not in used:
                emoji = alt
            else:
                emoji = "💫"  # secondary fallback to keep variety

        used.add(emoji)
        beat["emoji"] = emoji

    return beats
