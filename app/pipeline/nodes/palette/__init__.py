"""Hybrid palette package — curated themes + HSL-based per-scene variants.

Public API:
    from app.pipeline.nodes.palette import generate_for_video, generate_from_director_output
    from app.pipeline.nodes.palette import resolve_theme, THEMES

See:
    library.py     — curated PaletteTheme list + lookup
    color_math.py  — HSL/contrast utilities
    generator.py   — main entry point
    demo.py        — runnable example (python -m app.pipeline.nodes.palette.demo)
"""

from .generator import (
    GlobalPalette,
    SceneColorVariant,
    generate_for_video,
    generate_from_director_output,
    resolve_theme,
)
from .library import THEMES, PaletteTheme, all_names, by_name, find

__all__ = [
    "GlobalPalette",
    "PaletteTheme",
    "SceneColorVariant",
    "THEMES",
    "all_names",
    "by_name",
    "find",
    "generate_for_video",
    "generate_from_director_output",
    "resolve_theme",
]
