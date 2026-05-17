"""Director Agent — Creative direction for the entire video.

Responsible for:
- Color palette selection based on topic/mood
- Scene type override (can correct Splitter's choices)
- Per-scene transition selection
- Per-scene layout selection

Input:  Splitter output (scenes with narration + purpose) + raw text
Output: Creative direction with color_palette + scene_directions[]

This is the "film director" — it sees the whole video and makes
aesthetic decisions that need global context.
"""

from __future__ import annotations

import json
import random
from typing import Any

from loguru import logger

import re


# ══════════════════════════════════════════
# Color Contrast Helpers
# ══════════════════════════════════════════

def _hex_to_luminance(hex_color: str) -> float:
    """Calculate relative luminance (0=black, 1=white) from hex color.

    Uses sRGB linearization per WCAG 2.1 spec.
    Returns 0.0 on invalid input.
    """
    hex_color = hex_color.strip().lstrip("#")
    if not re.fullmatch(r"[0-9a-fA-F]{6}", hex_color):
        return 0.0
    r, g, b = int(hex_color[:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    # sRGB linearization
    def _lin(c: int) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def _ensure_bright(hex_color: str, fallback: str, min_luminance: float = 0.5) -> str:
    """Return hex_color if bright enough, otherwise return fallback."""
    lum = _hex_to_luminance(hex_color)
    if lum < min_luminance:
        logger.debug(f"Color {hex_color} too dark (luminance={lum:.2f} < {min_luminance}), using {fallback}")
        return fallback
    return hex_color


def _ensure_dark(hex_color: str, fallback: str, max_luminance: float = 0.25) -> str:
    """Return hex_color if dark enough, otherwise return fallback."""
    lum = _hex_to_luminance(hex_color)
    if lum > max_luminance:
        logger.debug(f"Color {hex_color} too bright for bg (luminance={lum:.2f} > {max_luminance}), using {fallback}")
        return fallback
    return hex_color


# ══════════════════════════════════════════
# Director System Prompt
# ══════════════════════════════════════════

DIRECTOR_PROMPT = """\
You are a creative director for short educational TikTok/Reels videos (9:16 vertical).
Given the full narration text and a list of scenes with their narrative purpose, make creative decisions for the entire video.

YOUR RESPONSIBILITIES:
1. Identify the overall topic and mood.
2. Choose a harmonious color palette:
   - primary: VIBRANT bright accent (e.g. #FF6B35, #3B82F6). NEVER dark/muted.
   - secondary: VIBRANT complementary (e.g. #7B68EE, #10B981). NEVER dark.
   - background: Very dark (#0A0A14 to #1A1A2E).
   - text: MUST be #FFFFFF or #F0F0F0. NEVER gray/dark.
3. For EACH scene, assign scene_type based on purpose.
4. Choose a background_preset matching the topic.

SCENE TYPE OPTIONS: title_card, stock_background, info_card, stats_highlight, diagram, emoji_grid, comparison, media_showcase, timeline, cryptovn101_news

SCENE TYPE RULES:
- "hook" → cryptovn101_news
- "conclude" → title_card OR stock_background
- "explain" → media_showcase or stock_background
- "list_steps" → info_card or timeline
- "data_visual" → stats_highlight or diagram
- "compare" → comparison or info_card
- emoji_grid: 3-4 SHORT items. info_card: LONGER text.

TITLE CARD LAYOUT RULES:
- For hook/conclude scenes with scene_type "title_card", also choose a layout:
  - "news_intro": Breaking news style. Best for dramatic/urgent topics (news, finance, crypto).
  - "educational": "Did you know?" style. Best for professional_modern/educational topics.
  - "tutorial": Step-based instructional opener. Best for how-to/guide topics.
  - "commercial": Premium brand showcase. Best for product/brand/lifestyle topics.
- Default to "news_intro" if unsure.

BACKGROUND PRESETS — choose based on topic:
- Finance/Money/Investment → golden_dusk or warm_slate
- Health/Meditation/Wellness → aurora_borealis or forest_depth
- Technology/AI/Coding → cyber_teal or steel_blue
- Space/Science/Cosmos → cosmic_purple or electric_indigo
- News/Politics/Current Events → midnight_ember or deep_ocean
- Fashion/Beauty/Lifestyle → rose_noir
- Nature/Environment → forest_depth or aurora_borealis
- Dark/Serious/Minimal → obsidian
- General/Other → deep_ocean
IMPORTANT: Do NOT default to steel_blue. Match the preset to the content's emotional tone."""

DIRECTOR_SCHEMA = {
    "type": "object",
    "properties": {
        "topic": {
            "type": "string",
            "description": "Identified topic (e.g. 'AI/Technology', 'Education', 'Finance')",
        },
        "mood": {
            "type": "string",
            "enum": ["professional_modern", "playful", "dramatic", "minimal"],
        },
        "color_palette": {
            "type": "object",
            "properties": {
                "primary": {"type": "string", "description": "Vibrant bright hex color e.g. #FF6B35"},
                "secondary": {"type": "string", "description": "Vibrant bright hex color e.g. #7B68EE"},
                "background": {"type": "string", "description": "Very dark hex color e.g. #0F0F1A"},
                "text": {"type": "string", "description": "MUST be #FFFFFF or #F0F0F0"},
            },
            "required": ["primary", "secondary", "background", "text"],
            "additionalProperties": False,
        },
        "scene_directions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "scene_index": {"type": "integer"},
                    "scene_type": {
                        "type": "string",
                        "enum": [
                            "title_card",
                            "stock_background",
                            "info_card",
                            "stats_highlight",
                            "diagram",
                            "emoji_grid",
                            "comparison",
                            "media_showcase",
                            "timeline",
                            "cryptovn101_news",
                        ],
                    },
                    "layout": {
                        "type": "string",
                        "description": "Layout mode. Required for title_card: standard, news_intro, educational, tutorial, commercial. Optional for others.",
                    },
                },
                "required": ["scene_index", "scene_type", "layout"],
                "additionalProperties": False,
            },
        },
        "background_preset": {
            "type": "string",
            "description": "One of: deep_ocean, midnight_ember, aurora_borealis, cosmic_purple, golden_dusk, cyber_teal, rose_noir, forest_depth, steel_blue, warm_slate, electric_indigo, obsidian",
        },
    },
    "required": ["topic", "mood", "color_palette", "scene_directions", "background_preset"],
    "additionalProperties": False,
}


# ══════════════════════════════════════════
# Default Fallback
# ══════════════════════════════════════════

DEFAULT_PALETTE = {
    "primary": "#FF6B35",
    "secondary": "#7B68EE",
    "background": "#0F172A",
    "text": "#FFFFFF",
}

PURPOSE_TO_SCENE_TYPE = {
    "hook": "cryptovn101_news",
    "explain": "stock_background",
    "list_steps": "info_card",
    "data_visual": "stats_highlight",
    "compare": "comparison",
    "conclude": "title_card",
}

SCENE_TYPE_DEFAULT_LAYOUT = {
    "title_card": "standard",
    "stock_background": "media_overlay",
    "info_card": "vertical_stack",
    "stats_highlight": "vertical_stack",
    "diagram": "center_focus",
    "emoji_grid": "icon_showcase",
    "comparison": "split_screen",
    "media_showcase": "fit",
    "timeline": "left_aligned",
    "cryptovn101_news": "media_overlay",
    # story_beats is NEVER assigned by Director — only as audit fallback / manual override.
    # Layout listed for completeness so validators don't reject it.
    "story_beats": "card_beats",
}


def build_default_direction(splitter_output: dict[str, Any]) -> dict[str, Any]:
    """Build a safe fallback direction when Director agent fails.

    Uses purpose→scene_type mapping and default palette.
    This ensures the pipeline NEVER crashes due to Director failure.
    """
    scenes = splitter_output.get("scenes", [])
    scene_directions = []

    for scene in scenes:
        purpose = scene.get("purpose", "explain")
        # Map scene_type purely from purpose (Splitter no longer provides scene_type)
        scene_type = PURPOSE_TO_SCENE_TYPE.get(purpose, "stock_background")
        layout = SCENE_TYPE_DEFAULT_LAYOUT.get(scene_type, "center_focus")

        scene_directions.append({
            "scene_index": scene["scene_index"],
            "scene_type": scene_type,
            "transition": "fade",
            "layout": layout,
        })

    return {
        "topic": "General",
        "mood": "professional_modern",
        "color_palette": DEFAULT_PALETTE.copy(),
        "scene_directions": scene_directions,
        "background_preset": "steel_blue",
    }


def validate_direction(direction: dict[str, Any], num_scenes: int) -> dict[str, Any]:
    """Validate and sanitize Director output.

    Ensures:
    - color_palette has all required fields
    - scene_directions covers all scenes
    - layout respects constraint matrix
    """
    # Validate color_palette
    palette = direction.get("color_palette", {})
    for key in ("primary", "secondary", "background", "text"):
        if key not in palette or not isinstance(palette[key], str):
            palette[key] = DEFAULT_PALETTE[key]

    # ── Contrast enforcement: ensure text/primary/secondary are bright enough ──
    palette["text"] = _ensure_bright(palette["text"], fallback="#FFFFFF", min_luminance=0.6)
    palette["primary"] = _ensure_bright(palette["primary"], fallback=DEFAULT_PALETTE["primary"], min_luminance=0.25)
    palette["secondary"] = _ensure_bright(palette["secondary"], fallback=DEFAULT_PALETTE["secondary"], min_luminance=0.2)
    palette["background"] = _ensure_dark(palette["background"], fallback="#0F0F1A", max_luminance=0.15)

    direction["color_palette"] = palette

    # Validate scene_directions
    directions = direction.get("scene_directions", [])
    direction_map = {d["scene_index"]: d for d in directions}

    valid_layouts = {
        "title_card": {"center_focus", "standard", "news_intro", "educational", "tutorial", "commercial"},
        "stock_background": {"media_overlay", "center_focus"},
        "info_card": {"vertical_stack", "grid_2x2", "full_width_cards"},
        "stats_highlight": {"vertical_stack", "hero_number"},
        "diagram": {"center_focus"},
        "emoji_grid": {"icon_showcase"},
        "comparison": {"split_screen", "stacked"},
        "media_showcase": {"fit", "cinema", "fullscreen"},
        "timeline": {"left_aligned", "center_focus"},
        "story_beats": {"card_beats"},
        "cryptovn101_news": {"media_overlay"},
    }

    # Transition pool — weighted toward smooth transitions
    _TRANSITIONS = ["fade", "slide", "zoom", "slide", "fade", "flip", "iris", "clock-wipe"]

    validated = []
    for i in range(num_scenes):
        d = direction_map.get(i, {})
        scene_type = d.get("scene_type", "stock_background")

        # Assign layout — use Director's choice if valid, otherwise default
        director_layout = d.get("layout")
        allowed = valid_layouts.get(scene_type, set())
        if director_layout and director_layout in allowed:
            layout = director_layout
        else:
            layout = SCENE_TYPE_DEFAULT_LAYOUT.get(scene_type, "center_focus")

        # Auto-assign transition (random, first scene always fade)
        if i == 0:
            transition = "fade"
        else:
            transition = random.choice(_TRANSITIONS)

        validated.append({
            "scene_index": i,
            "scene_type": scene_type,
            "transition": transition,
            "layout": layout,
        })

    direction["scene_directions"] = validated

    # Validate background_preset
    VALID_PRESETS = {
        "deep_ocean", "midnight_ember", "aurora_borealis", "cosmic_purple",
        "golden_dusk", "cyber_teal", "rose_noir", "forest_depth",
        "steel_blue", "warm_slate", "electric_indigo", "obsidian",
    }
    preset = direction.get("background_preset", "steel_blue")
    if preset not in VALID_PRESETS:
        logger.warning("  Invalid background_preset '{}' → fallback to steel_blue", preset)
        preset = "steel_blue"
    direction["background_preset"] = preset
    logger.info("  Director background_preset: {}", preset)
    logger.info("  Director scene_types: {}", [d["scene_type"] for d in validated])

    return direction
