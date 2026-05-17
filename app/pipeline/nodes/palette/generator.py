"""Palette generator (Approach C — hybrid).

Pipeline:
1. Director LLM (existing) decides `mood` + `topic_category` + optional `theme_name`.
2. `library.find(mood, category)` returns a curated `PaletteTheme`, OR the LLM
   names a theme directly via `theme_name`.
3. `generate_for_video()` derives:
   - A `GlobalPalette` (4 hex colors that match the existing ColorPalette schema).
   - A list of `SceneColorVariant` — one per scene, with role-based shifts so
     a hook scene reads more vibrant than a conclude scene without ever
     leaving the theme.
4. Output is plain JSON-serializable dicts ready to drop into the existing
   content_parser merge step and ship to Remotion.

This module is INTENTIONALLY a separate concern from director.py:
- director.py keeps deciding scene_type, transition, layout (semantic).
- This module owns color (visual coherence).
- They communicate through the merge phase.

No LLM calls, no I/O — pure functions on top of `library` + `color_math`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Iterable

from . import color_math as cm
from .library import PaletteTheme, find


# ── Output shapes ──────────────────────────────────────────────────────


@dataclass(frozen=True)
class GlobalPalette:
    """Top-level palette for the whole video. Mirrors state.ColorPalette + meta."""

    primary: str
    secondary: str
    background: str
    text: str
    # Extra fields (optional in schema — see PALETTE_SCHEMA_PROPOSAL.md)
    accent: str
    theme_name: str
    mood: str
    background_preset: str
    harmony: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class SceneColorVariant:
    """Per-scene color shifts derived from the global palette.

    These are JSON-safe and meant to be passed straight to Remotion via
    `scene.color_variant` (see PALETTE_SCHEMA_PROPOSAL.md).
    """

    scene_index: int
    background: str   # scene-specific background (slight shift from global bg)
    accent: str       # the color to use for keywords/highlights this scene
    overlay: str      # gradient overlay color (for stock_background tint)
    intensity: float  # 0..1 — drives saturation of motion/animation
    role: str         # hook | explain | data | compare | conclude (semantic tag)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── Role-based intensity / accent table ────────────────────────────────
# Each scene "purpose" maps to a styling intent. These numbers are tuned for
# 9:16 short-form video — visible enough to read as different beats, subtle
# enough that they share a visual family.

_ROLE_RULES: dict[str, dict[str, float | str]] = {
    "hook":         {"intensity": 1.00, "lightness_shift": +0.04, "accent_role": "primary"},
    "explain":      {"intensity": 0.75, "lightness_shift": +0.00, "accent_role": "primary"},
    "list_steps":   {"intensity": 0.80, "lightness_shift": +0.02, "accent_role": "secondary"},
    "data_visual":  {"intensity": 0.95, "lightness_shift": +0.03, "accent_role": "accent"},
    "compare":      {"intensity": 0.90, "lightness_shift": +0.01, "accent_role": "accent"},
    "conclude":     {"intensity": 0.65, "lightness_shift": -0.03, "accent_role": "secondary"},
}

_DEFAULT_RULE = _ROLE_RULES["explain"]


def _accent_for(theme: PaletteTheme, accent_role: str) -> str:
    return {
        "primary": theme.primary,
        "secondary": theme.secondary,
        "accent": theme.accent,
    }.get(accent_role, theme.primary)


# ── Public API ─────────────────────────────────────────────────────────


def resolve_theme(
    mood: str,
    topic_category: str,
    theme_name: str | None = None,
) -> PaletteTheme:
    """Pick a theme: explicit name wins, else (mood, category) lookup."""
    if theme_name:
        from .library import by_name
        t = by_name(theme_name)
        if t is not None:
            return t
    return find(mood, topic_category)


def generate_for_video(
    *,
    mood: str,
    topic_category: str,
    scene_purposes: Iterable[str],
    theme_name: str | None = None,
    enforce_contrast: bool = True,
) -> tuple[GlobalPalette, list[SceneColorVariant]]:
    """Build a global palette + per-scene variants for one video.

    Args:
        mood: One of the Director enum values (professional_modern, playful, ...).
        topic_category: Free-form tag (tech, finance, education, ...).
        scene_purposes: Ordered list of scene purposes (hook, explain, ...).
        theme_name: Optional override — if given and valid, skips lookup.
        enforce_contrast: If True, runs WCAG checks on text/background and
            auto-corrects insufficient contrast. Recommended on.

    Returns:
        (GlobalPalette, list[SceneColorVariant]) — both JSON-serializable.
    """
    theme = resolve_theme(mood, topic_category, theme_name)

    # ── Build global palette ──
    text = theme.text
    bg = theme.background
    if enforce_contrast:
        text = cm.ensure_contrast(text, bg, target=7.0)  # AAA for body text

    primary = theme.primary
    if enforce_contrast and cm.contrast_ratio(primary, bg) < 4.5:
        primary = cm.ensure_contrast(primary, bg, target=4.5)

    secondary = theme.secondary
    if enforce_contrast and cm.contrast_ratio(secondary, bg) < 4.5:
        secondary = cm.ensure_contrast(secondary, bg, target=4.5)

    accent = theme.accent
    if enforce_contrast and cm.contrast_ratio(accent, bg) < 3.5:
        accent = cm.ensure_contrast(accent, bg, target=3.5)

    global_palette = GlobalPalette(
        primary=primary,
        secondary=secondary,
        background=bg,
        text=text,
        accent=accent,
        theme_name=theme.name,
        mood=theme.mood,
        background_preset=theme.background_preset,
        harmony=theme.harmony,
    )

    # ── Derive per-scene variants ──
    variants: list[SceneColorVariant] = []
    for idx, purpose in enumerate(scene_purposes):
        rule = _ROLE_RULES.get(purpose, _DEFAULT_RULE)
        intensity = float(rule["intensity"])
        light_shift = float(rule["lightness_shift"])
        accent_role = str(rule["accent_role"])

        scene_bg = cm.adjust_lightness(bg, light_shift)
        scene_accent = _accent_for(theme, accent_role)

        # Overlay = mid-mix of bg and scene accent (for stock-footage tinting)
        overlay = cm.mix(scene_bg, scene_accent, 0.18)

        # Optional: ensure scene accent stays readable on its scene bg
        if enforce_contrast and cm.contrast_ratio(scene_accent, scene_bg) < 3.0:
            scene_accent = cm.ensure_contrast(scene_accent, scene_bg, target=3.0)

        variants.append(
            SceneColorVariant(
                scene_index=idx,
                background=scene_bg,
                accent=scene_accent,
                overlay=overlay,
                intensity=round(intensity, 2),
                role=purpose,
            )
        )

    return global_palette, variants


def generate_from_director_output(direction: dict[str, Any], scene_purposes: list[str]) -> dict[str, Any]:
    """Adapter — drop-in for content_parser._merge_phases.

    Reads the existing Director output (which already has mood + topic) and
    returns a dict ready to splat into the merged result:

        {
          "color_palette": {primary, secondary, background, text},
          "palette_meta":  {accent, theme_name, mood, background_preset, harmony},
          "scene_color_variants": [{scene_index, background, accent, overlay, intensity, role}, ...]
        }

    This is the integration shape we propose — see PALETTE_SCHEMA_PROPOSAL.md.
    """
    mood = direction.get("mood", "professional_modern")
    topic_category = (direction.get("topic") or "general").lower().split("/")[0].strip()
    theme_name = direction.get("theme_name")  # optional new field; OK if missing

    global_palette, variants = generate_for_video(
        mood=mood,
        topic_category=topic_category,
        scene_purposes=scene_purposes,
        theme_name=theme_name,
    )

    return {
        "color_palette": {
            "primary": global_palette.primary,
            "secondary": global_palette.secondary,
            "background": global_palette.background,
            "text": global_palette.text,
        },
        "palette_meta": {
            "accent": global_palette.accent,
            "theme_name": global_palette.theme_name,
            "mood": global_palette.mood,
            "background_preset": global_palette.background_preset,
            "harmony": global_palette.harmony,
        },
        "scene_color_variants": [v.to_dict() for v in variants],
    }


__all__ = [
    "GlobalPalette",
    "SceneColorVariant",
    "generate_for_video",
    "generate_from_director_output",
    "resolve_theme",
]
