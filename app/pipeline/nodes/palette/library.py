"""Predefined palette themes — the curated layer of the hybrid (Approach C) pipeline.

Each `PaletteTheme` is a designer-vetted starting point for a (mood, category) pair.
The Director LLM picks one of these by name, and `generator.py` then derives
per-scene variants on top of the chosen theme using `color_math.py`.

Why not let the LLM pick raw hex codes?
- LLM-picked colors regularly fail contrast or look muddy together.
- Themes are stable across runs: the same input produces the same look.
- Designers can tune one theme and every video using it improves at once.

Conventions:
- `mood` aligns with director.py's enum: professional_modern | playful | dramatic | minimal.
- `categories` is a tuple of free-form topic tags. Order doesn't matter.
- `background_preset` MUST exist in the 12-preset whitelist used by the Remotion side.
- `harmony` is a hint to `generator.py` for how to derive scene-level accents.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PaletteTheme:
    """A curated palette + metadata for picking and deriving variants."""

    name: str
    mood: str
    categories: tuple[str, ...]
    primary: str       # vibrant accent (used for highlights, keywords, stat values)
    secondary: str     # complementary accent (used for icons, secondary CTAs)
    accent: str        # third color (used for emphasis on data_visual / hook scenes)
    background: str    # very dark base background
    text: str          # near-white body text
    background_preset: str
    harmony: str       # analogous | complementary | triadic | split_complementary
    description: str   # human-readable hint for debug/UI


# ── Theme library ──────────────────────────────────────────────────────
# Keep ~2-3 themes per category × mood. Adding more is cheap.

THEMES: tuple[PaletteTheme, ...] = (
    # ── Tech / AI ──
    PaletteTheme(
        name="cyber_neon",
        mood="professional_modern",
        categories=("tech", "ai", "data", "saas"),
        primary="#3B82F6",      # electric blue
        secondary="#22D3EE",    # cyan
        accent="#A855F7",       # neon purple
        background="#0B1120",
        text="#F8FAFC",
        background_preset="cyber_teal",
        harmony="analogous",
        description="Cool blue-purple — tech, futuristic, modern.",
    ),
    PaletteTheme(
        name="electric_violet",
        mood="dramatic",
        categories=("tech", "ai", "crypto"),
        primary="#A855F7",
        secondary="#EC4899",
        accent="#F59E0B",
        background="#0F0A1F",
        text="#FFFFFF",
        background_preset="electric_indigo",
        harmony="triadic",
        description="High-contrast violet/magenta — bold, edgy.",
    ),

    # ── Finance / Business ──
    PaletteTheme(
        name="wealth_emerald",
        mood="professional_modern",
        categories=("finance", "business", "investing"),
        primary="#10B981",      # emerald
        secondary="#F59E0B",    # gold
        accent="#3B82F6",       # trust blue
        background="#0A1F1A",
        text="#F0FDF4",
        background_preset="forest_depth",
        harmony="split_complementary",
        description="Emerald + gold — money, growth, trust.",
    ),
    PaletteTheme(
        name="executive_steel",
        mood="minimal",
        categories=("business", "corporate", "consulting"),
        primary="#60A5FA",
        secondary="#94A3B8",
        accent="#FBBF24",
        background="#0F172A",
        text="#F1F5F9",
        background_preset="steel_blue",
        harmony="analogous",
        description="Cool steel + warm gold accent — professional, restrained.",
    ),

    # ── Education / Knowledge ──
    PaletteTheme(
        name="study_warmth",
        mood="professional_modern",
        categories=("education", "tutorial", "science"),
        primary="#F97316",      # warm orange
        secondary="#FACC15",    # warm yellow
        accent="#06B6D4",       # cool cyan accent
        background="#1A1208",
        text="#FEF3C7",
        background_preset="midnight_ember",
        harmony="complementary",
        description="Warm orange/yellow — friendly, inviting, classroom feel.",
    ),
    PaletteTheme(
        name="curiosity_indigo",
        mood="playful",
        categories=("education", "kids", "explainer"),
        primary="#8B5CF6",
        secondary="#F472B6",
        accent="#FACC15",
        background="#1A1235",
        text="#F5F3FF",
        background_preset="cosmic_purple",
        harmony="triadic",
        description="Playful indigo + pink + yellow — engaging, kid-friendly.",
    ),

    # ── Health / Wellness ──
    PaletteTheme(
        name="vital_mint",
        mood="professional_modern",
        categories=("health", "fitness", "wellness", "medical"),
        primary="#14B8A6",
        secondary="#22D3EE",
        accent="#F472B6",
        background="#06201F",
        text="#ECFEFF",
        background_preset="deep_ocean",
        harmony="analogous",
        description="Calm teal/mint — health, clean, clinical.",
    ),

    # ── Lifestyle / Entertainment ──
    PaletteTheme(
        name="sunset_glow",
        mood="playful",
        categories=("lifestyle", "travel", "food", "entertainment"),
        primary="#F97316",
        secondary="#EC4899",
        accent="#FACC15",
        background="#1F0A14",
        text="#FFF7ED",
        background_preset="rose_noir",
        harmony="analogous",
        description="Sunset orange + pink — warm, vibrant, lifestyle.",
    ),
    PaletteTheme(
        name="midnight_drama",
        mood="dramatic",
        categories=("storytelling", "true_crime", "documentary"),
        primary="#EF4444",
        secondary="#F59E0B",
        accent="#FAFAFA",
        background="#0A0A0F",
        text="#FAFAFA",
        background_preset="obsidian",
        harmony="split_complementary",
        description="Stark red on near-black — tension, drama.",
    ),

    # ── Nature / Eco ──
    PaletteTheme(
        name="forest_canopy",
        mood="professional_modern",
        categories=("nature", "environment", "outdoors"),
        primary="#22C55E",
        secondary="#84CC16",
        accent="#F59E0B",
        background="#0A1F12",
        text="#F0FDF4",
        background_preset="forest_depth",
        harmony="analogous",
        description="Forest green + sun gold — nature, sustainability.",
    ),
    PaletteTheme(
        name="aurora_sky",
        mood="dramatic",
        categories=("nature", "space", "science"),
        primary="#22D3EE",
        secondary="#A855F7",
        accent="#10B981",
        background="#050B1F",
        text="#F0F9FF",
        background_preset="aurora_borealis",
        harmony="triadic",
        description="Aurora-inspired cyan/violet/teal — cosmic, dramatic.",
    ),

    # ── Minimal / Generic fallback ──
    PaletteTheme(
        name="quiet_slate",
        mood="minimal",
        categories=("general", "minimal", "default"),
        primary="#94A3B8",
        secondary="#CBD5E1",
        accent="#FBBF24",
        background="#0F172A",
        text="#F8FAFC",
        background_preset="warm_slate",
        harmony="analogous",
        description="Quiet slate with gold accent — neutral, safe default.",
    ),
)


# ── Lookup helpers ─────────────────────────────────────────────────────


def by_name(name: str) -> PaletteTheme | None:
    for t in THEMES:
        if t.name == name:
            return t
    return None


def all_names() -> list[str]:
    return [t.name for t in THEMES]


def find(mood: str, category: str) -> PaletteTheme:
    """Best-fit lookup with graceful fallback chain.

    1. Exact mood + category match.
    2. Same mood, any category.
    3. Same category, any mood.
    4. Default `quiet_slate`.
    """
    mood = (mood or "").lower()
    category = (category or "").lower()

    # 1. Exact match
    for t in THEMES:
        if t.mood == mood and category in t.categories:
            return t
    # 2. Mood-only
    for t in THEMES:
        if t.mood == mood:
            return t
    # 3. Category-only
    for t in THEMES:
        if category in t.categories:
            return t
    # 4. Final fallback
    return by_name("quiet_slate") or THEMES[-1]


__all__ = ["PaletteTheme", "THEMES", "all_names", "by_name", "find"]
