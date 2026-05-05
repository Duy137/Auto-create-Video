"""Content Parser — 3-Phase LLM scene structuring.

Phase 1 (Scene Splitter):  Analytical — split text, assign purpose, preserve narration (NO scene_type).
Phase 2 (Director):        Creative direction — color palette, scene_type ASSIGNMENT, transitions, layouts.
Phase 3 (Visual Enricher): Detail — generate media queries, visual descriptions, card_items, stats.

Three separate LLM calls with distinct roles:
- Splitter: faithful text splitting (low creativity)
- Director: holistic creative decisions (moderate creativity)
- Enricher: per-scene visual details (moderate creativity, reduced scope)

This separation prevents the conflict between "faithful text splitting" and
"creative content generation" that caused hallucinated card items and
paraphrased narrations in earlier approaches.
"""

from __future__ import annotations

import asyncio
import json
import re
from collections import Counter
from typing import Any

import httpx
from loguru import logger
from openai import AsyncOpenAI

from config import OPENAI_API_KEY, GOOGLE_API_KEY, QWEN_API_KEY, CONTENT_PARSER_PROVIDER, CONTENT_PARSER_MODEL
from app.nodes.agents.director import (
    DIRECTOR_PROMPT,
    DIRECTOR_SCHEMA,
    build_default_direction,
    validate_direction,
)


class ContentParserError(Exception):
    """Raised when content parsing fails."""
    pass


# ══════════════════════════════════════════
# Phase 1: SCENE SPLITTER (Analytical)
# ══════════════════════════════════════════

SPLITTER_PROMPT = """\
You are a text splitter for short vertical videos (9:16). Your ONLY job is to split input text into scenes and assign their narrative purpose.

STRICT RULES:
1. The "narration" field MUST contain the EXACT original text. DO NOT paraphrase, rewrite, or summarize. You may ONLY add punctuation for natural TTS.
2. EVERY word from the input MUST appear in exactly ONE scene's narration. No word may be dropped or duplicated across scenes.
3. Scenes MUST be in the same order as the original text. Scene 0's narration comes first in the input, scene 1's narration comes next, etc.
4. When you concatenate all narrations in scene order, the result must reconstruct the COMPLETE original text (with only minor punctuation differences).
5. Split text based on content length:
   - Short text (<200 words): 3-5 scenes
   - Medium text (200-400 words): 5-10 scenes
   - Long text (>400 words): 8-15 scenes
   Each scene should have 1-3 sentences of narration (roughly 5-15 seconds).
6. CRITICAL LENGTH RULES:
   - Each scene MUST have between 15-40 words of narration.
   - If a section exceeds 40 words, split it into multiple scenes at sentence boundaries.
   - The "conclude" scene MUST NOT exceed 30 words.
   - NEVER combine 2+ complete sentences into one scene if the total exceeds 40 words.
7. Each scene gets a purpose describing its role in the video narrative.
8. The first scene should have purpose "hook". The last MAY have purpose "conclude".
9. Use "explain" for narrative paragraphs that describe or explain a concept.
10. Use "list_steps" when there are listed items, steps, sequential events, or chronological milestones.
11. Use "data_visual" when there are statistics or numbers to emphasize.
12. Use "compare" when text clearly compares two things (A vs B, pros/cons, before/after).
13. Identify keywords_to_highlight: important terms (2-5 per scene).
14. Identify english_phrases: English words that appear in the text.
15. Generate a concise, engaging video title.

PURPOSE OPTIONS: hook, explain, list_steps, data_visual, compare, conclude

DO NOT generate any visual descriptions, search queries, scene types, or creative content. Only split, assign purpose, and extract keywords."""

SPLITTER_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Video title (concise, engaging)"},
        "scenes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "scene_index": {"type": "integer"},
                    "purpose": {
                        "type": "string",
                        "enum": ["hook", "explain", "list_steps", "data_visual", "compare", "conclude"],
                        "description": "Semantic role of this scene in the video narrative",
                    },
                    "narration": {"type": "string", "description": "EXACT original text, no paraphrasing"},
                    "keywords_to_highlight": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "english_phrases": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["scene_index", "purpose", "narration", "keywords_to_highlight", "english_phrases"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["title", "scenes"],
    "additionalProperties": False,
}


# ══════════════════════════════════════════
# Phase 3: VISUAL ENRICHER (Detail-oriented)
# ══════════════════════════════════════════
# Note: Phase 2 (Director) is defined in agents/director.py

ENRICHER_PROMPT = """\
You are a visual detail specialist for short videos. Given a list of scenes (with narration, type, and creative direction), generate visual metadata for each scene.

The Director has already chosen the color palette and scene types. Your job is ONLY to add visual details.

RULES:
1. visual_description: Short topic label in the SAME language as the narration text, 3-5 words max.
   Examples: "Triển Khai Agent AI", "Quy Trình Ba Bước", "Cloud Computing Basics"
   This will be displayed as a small badge on screen — keep it SHORT.
2. semantic_summary_en: One short English sentence (8-16 words) that captures the core visual meaning.
    Focus on subject + context + mood. This is used to build semantic media queries.
    Example: "Engineers monitor cloud servers in a cinematic, high-tech operations room."
3. image_query: 2-4 concise English keywords for stock image search.
    Prefer style cues such as: "professional", "dark background", "minimal", "portrait".
4. video_query: 2-4 concise English keywords for stock video search.
    Prefer cinematic language: "cinematic", "slow motion", "aerial view", "close up", "dramatic lighting".
    Avoid generic single-term queries (e.g. "technology"). Make them specific (e.g. "technology server room cinematic").
5. semantic_image_query: 2-4 optimized English keywords specifically for stock IMAGE search.
    Think about what tags stock photographers actually use. Focus on: visual subject + setting + mood.
    Must differ from image_query — use synonyms, more visual/concrete terms.
    Example: "server room blue neon lighting" instead of "cloud servers operations room".
6. semantic_video_query: 2-4 optimized English keywords specifically for stock VIDEO search.
    Focus on: motion + atmosphere + cinematic cues that match stock video tagging.
    Must differ from video_query — use synonyms, more motion/cinematic terms.
    Example: "data center timelapse blue glow" instead of "cloud server cinematic".
7. card_items: ONLY for scenes with scene_type="info_card" or scene_type="emoji_grid".
   For info_card: generate 2-4 items with icon (emoji), title, subtitle based on the narration context.
   For emoji_grid: generate 3-4 items with icon (emoji), SHORT title (1-3 words), SHORT subtitle (max 8 words). Items should be concise and emoji-centric.
   ALL text (title, subtitle) MUST be in the SAME language as the narration text.
   Do NOT invent information not implied by the narration.
8. stats: ONLY for scenes with scene_type="stats_highlight". Extract statistics from narration.
   ALL text (label) MUST be in the SAME language as the narration text. Values stay as numbers/units.
9. diagram_spec: ONLY for scenes with scene_type="diagram".
   - If narration mentions math expressions: set type="math_formula", provide LaTeX in "latex" field.
   - Example: "e mũ x" → latex: "e^{x}"
10. comparison_sides: ONLY for scenes with scene_type="comparison". Generate exactly 2 sides.
    Each side: label (max 20 chars), points array (3-5 items, each max 30 chars), sentiment ("positive", "negative", or "neutral").
    ALL text (label, points) MUST be in the SAME language as the narration text.
    Extract comparison info from narration — do NOT invent facts.
11. timeline_events: ONLY for scenes with scene_type="timeline". Generate 3-5 events.
    Each event: label (max 10 chars, e.g. year or step number), title (max 20 chars), optional description (max 40 chars).
    ALL text (title, description) MUST be in the SAME language as the narration. Labels like years/numbers stay as-is.
    Extract timeline info from narration — do NOT invent facts.
12. media_layout: ONLY for scenes with scene_type="media_showcase". Choose "fit" (default, video/image fits width, letterbox background — use for wide/landscape media), "cinema" (video in rounded frame), or "fullscreen" (video fills entire screen).

For card_items, stats, diagram_spec, comparison_sides, timeline_events: set to null if the scene_type doesn't match.
For media_layout: set to "fit" if the scene_type is not "media_showcase".

13. title_lines: ONLY for scenes with scene_type="title_card". Split the narration into 2-4 display lines.
    Each line: { "text": "...", "style": "normal" | "highlight" | "accent" }.
    - First line: "normal" (setup context)
    - Middle line(s): "highlight" (main keyword/topic, UPPERCASE encouraged)
    - Last line: "accent" (supporting detail)
    ALL text MUST be in the SAME language as the narration.
14. top_badge: ONLY for scenes with scene_type="title_card". Optional badge text. MUST be from whitelist: BREAKING, NEW, TIP, WARNING, UPDATE. Set to null if not appropriate.
15. top_icon: ONLY for scenes with scene_type="title_card". Optional emoji icon displayed above the title. Set to null if not appropriate.

For title_lines, top_badge, top_icon: set to null if the scene_type is not "title_card".

16. emoji: REQUIRED emoji pop-up for each scene. You MUST provide exactly ONE emoji per scene.
    DO NOT set to null (except for title_card scenes).
    The emoji should match the scene's topic or emotional tone.
    
    EMOJI GUIDE by topic:
    - Technology/AI: 🤖 🧠 💻 ⚡ 🔧
    - Finance/Money: 💰 📈 💎 🏦 💵
    - Growth/Launch: 🚀 📊 🎯 ✨ 🔥
    - Warning/Risk: ⚠️ 🛑 ❌ 💥 🔴
    - Education: 📚 🎓 💡 🔬 📝
    - Health: 🏥 💊 🧬 ❤️ 🏃
    - Nature/Environment: 🌍 🌱 🌊 ☀️ 🌳
    - Entertainment: 🎬 🎮 🎵 🎨 🎭
    - Security/Privacy: 🔒 🛡️ 🔐 👁️ 🕵️
    - Communication: 💬 📱 🌐 📡 🤝
    - Success/Achievement: 🏆 ⭐ 🎉 👑 🥇
    - Data/Analytics: 📊 📉 🔢 📋 🗂️
    
    ONLY set to null for title_card and news_intro scenes. For ALL other scenes, you MUST choose one emoji.

DO NOT choose colors or scene types — the Director has already decided those."""

ENRICHER_SCHEMA = {
    "type": "object",
    "properties": {
        "scenes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "scene_index": {"type": "integer"},
                    "visual_description": {
                        "type": "string",
                        "description": "Short topic label, 3-5 words, SAME language as narration",
                    },
                    "semantic_summary_en": {
                        "type": "string",
                        "description": "One short English sentence (8-16 words) for semantic media search context",
                    },
                    "image_query": {"type": ["string", "null"], "description": "2-3 English keywords"},
                    "video_query": {"type": ["string", "null"], "description": "2-3 English keywords"},
                    "semantic_image_query": {
                        "type": ["string", "null"],
                        "description": "2-4 optimized English keywords for stock image search, visual subject + setting + mood",
                    },
                    "semantic_video_query": {
                        "type": ["string", "null"],
                        "description": "2-4 optimized English keywords for stock video search, motion + atmosphere + cinematic cues",
                    },
                    "card_items": {
                        "type": ["array", "null"],
                        "items": {
                            "type": "object",
                            "properties": {
                                "icon": {"type": "string"},
                                "title": {"type": "string"},
                                "subtitle": {"type": "string"},
                            },
                            "required": ["icon", "title", "subtitle"],
                            "additionalProperties": False,
                        },
                    },
                    "stats": {
                        "type": ["array", "null"],
                        "items": {
                            "type": "object",
                            "properties": {
                                "label": {"type": "string"},
                                "value": {"type": "string"},
                                "color": {"type": "string"},
                            },
                            "required": ["label", "value", "color"],
                            "additionalProperties": False,
                        },
                    },
                    "diagram_spec": {
                        "type": ["object", "null"],
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": ["line_chart", "bar_chart", "scatter", "math_formula"],
                            },
                            "x_range": {"type": ["array", "null"], "items": {"type": "number"}},
                            "function": {"type": ["string", "null"]},
                            "data": {
                                "type": ["array", "null"],
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "x": {"type": ["number", "string"]},
                                        "y": {"type": "number"},
                                        "label": {"type": ["string", "null"]},
                                    },
                                    "required": ["x", "y", "label"],
                                    "additionalProperties": False,
                                },
                            },
                            "latex": {"type": ["string", "null"]},
                            "annotations": {"type": ["array", "null"], "items": {"type": "string"}},
                        },
                        "required": ["type", "x_range", "function", "data", "latex", "annotations"],
                        "additionalProperties": False,
                    },
                    "comparison_sides": {
                        "type": ["array", "null"],
                        "items": {
                            "type": "object",
                            "properties": {
                                "label": {"type": "string"},
                                "points": {"type": "array", "items": {"type": "string"}},
                                "sentiment": {"type": "string", "enum": ["positive", "negative", "neutral"]},
                            },
                            "required": ["label", "points", "sentiment"],
                            "additionalProperties": False,
                        },
                    },
                    "timeline_events": {
                        "type": ["array", "null"],
                        "items": {
                            "type": "object",
                            "properties": {
                                "label": {"type": "string"},
                                "title": {"type": "string"},
                                "description": {"type": ["string", "null"]},
                            },
                            "required": ["label", "title", "description"],
                            "additionalProperties": False,
                        },
                    },
                    "media_layout": {
                        "type": "string",
                        "enum": ["cinema", "fullscreen", "fit"],
                    },
                    "title_lines": {
                        "type": ["array", "null"],
                        "items": {
                            "type": "object",
                            "properties": {
                                "text": {"type": "string"},
                                "style": {"type": "string", "enum": ["normal", "highlight", "accent"]},
                            },
                            "required": ["text", "style"],
                            "additionalProperties": False,
                        },
                    },
                    "top_badge": {
                        "type": ["string", "null"],
                        "enum": ["BREAKING", "NEW", "TIP", "WARNING", "UPDATE", None],
                    },
                    "top_icon": {
                        "type": ["string", "null"],
                    },
                    "emoji": {
                        "type": ["string", "null"],
                    },
                },
                "required": [
                    "scene_index", "visual_description", "semantic_summary_en",
                    "image_query", "video_query", "semantic_image_query", "semantic_video_query",
                    "card_items", "stats", "diagram_spec",
                    "comparison_sides", "timeline_events", "media_layout",
                    "title_lines", "top_badge", "top_icon",
                    "emoji",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["scenes"],
    "additionalProperties": False,
}


# ══════════════════════════════════════════
# Main Entry Point
# ══════════════════════════════════════════


async def parse_content(text: str) -> dict[str, Any]:
    """Parse validated text into structured scene data using 3-phase LLM pipeline.

    Phase 1: Scene Splitter — split text into scenes with purpose, faithful to original.
    Phase 2: Director — creative direction (color palette, scene_type ASSIGNMENT, transitions, layouts).
    Phase 3: Visual Enricher — per-scene visual details (media queries, card_items, etc.)

    Args:
        text: Validated input text.

    Returns:
        Dict with keys: title, color_palette, scenes[].

    Raises:
        ContentParserError: If critical LLM calls fail (Splitter or Enricher).
        Director failure is handled gracefully with fallback defaults.
    """
    logger.info("Parsing content ({} chars, ~{} words)", len(text), len(text.split()))

    # ── Phase 1: Split scenes (analytical, low creativity) ──
    logger.info("  Phase 1: Scene Splitter...")
    phase1 = await _run_llm_phase(
        system_prompt=SPLITTER_PROMPT,
        user_content=text,
        schema=SPLITTER_SCHEMA,
        schema_name="scene_split",
        temperature=0.2,
    )

    try:
        _validate_phase1(phase1, text)
    except ContentParserError as first_error:
        logger.warning(
            "  Phase 1 integrity check failed: {}. Retrying splitter once.",
            first_error,
        )

        retry_phase1: dict[str, Any] | None = None
        try:
            retry_phase1 = await _run_llm_phase(
                system_prompt=SPLITTER_PROMPT,
                user_content=text,
                schema=SPLITTER_SCHEMA,
                schema_name="scene_split_retry",
                temperature=0.0,
            )
            _validate_phase1(retry_phase1, text)
            phase1 = retry_phase1
            logger.info("  Phase 1 retry succeeded.")
        except Exception as retry_error:
            logger.warning(
                "  Phase 1 retry failed: {}. Using deterministic fallback splitter.",
                retry_error,
            )
            scene_hint_count = None
            if isinstance(retry_phase1, dict):
                scene_hint_count = len(retry_phase1.get("scenes", []))
            elif isinstance(phase1, dict):
                scene_hint_count = len(phase1.get("scenes", []))

            phase1 = _build_fallback_phase1(text, preferred_scene_count=scene_hint_count)
            _validate_phase1(phase1, text)
            logger.info("  Phase 1 fallback applied: {} deterministic scenes", len(phase1["scenes"]))

    logger.info(
        "  Phase 1 done: '{}' → {} scenes (purposes: {})",
        phase1["title"][:40],
        len(phase1["scenes"]),
        [s.get("purpose", "?") for s in phase1["scenes"]],
    )

    # ── Phase 2: Director (creative direction, with fallback) ──
    logger.info("  Phase 2: Director...")
    direction = await _run_director(phase1, text)
    logger.info(
        "  Phase 2 done: topic='{}', mood='{}', palette={}",
        direction.get("topic", "?"),
        direction.get("mood", "?"),
        direction.get("color_palette", {}).get("primary", "?"),
    )

    # ── Phase 3: Enricher (visual details, reduced scope) ──
    logger.info("  Phase 3: Visual Enricher...")
    num_scenes = len(phase1.get("scenes", []))

    if num_scenes > 8:
        # Batch enricher: split scenes into 2 halves, run in parallel
        import asyncio
        mid = num_scenes // 2
        enricher_input_a = _build_enricher_input(phase1, direction, scene_range=(0, mid))
        enricher_input_b = _build_enricher_input(phase1, direction, scene_range=(mid, num_scenes))

        logger.info("  Enricher batching: {} scenes → 2 batches ({} + {})", num_scenes, mid, num_scenes - mid)

        phase3_a, phase3_b = await asyncio.gather(
            _run_llm_phase(
                system_prompt=ENRICHER_PROMPT,
                user_content=enricher_input_a,
                schema=ENRICHER_SCHEMA,
                schema_name="visual_enrich_a",
                temperature=0.5,
            ),
            _run_llm_phase(
                system_prompt=ENRICHER_PROMPT,
                user_content=enricher_input_b,
                schema=ENRICHER_SCHEMA,
                schema_name="visual_enrich_b",
                temperature=0.5,
            ),
        )
        # Merge batch results
        phase3 = {
            "scenes": phase3_a.get("scenes", []) + phase3_b.get("scenes", []),
        }
    else:
        enricher_input = _build_enricher_input(phase1, direction)
        phase3 = await _run_llm_phase(
            system_prompt=ENRICHER_PROMPT,
            user_content=enricher_input,
            schema=ENRICHER_SCHEMA,
            schema_name="visual_enrich",
            temperature=0.5,
        )
    logger.info("  Phase 3 done: visual metadata for {} scenes", len(phase3.get("scenes", [])))

    # ── Merge all 3 phases ──
    result = _merge_phases(phase1, direction, phase3)

    logger.info(
        "Parsed {} scenes: {}",
        len(result["scenes"]),
        [s["scene_type"] for s in result["scenes"]],
    )
    return result


# ══════════════════════════════════════════
# Director Phase (with timeout + fallback)
# ══════════════════════════════════════════


async def _run_director(splitter_output: dict, raw_text: str) -> dict[str, Any]:
    """Run Director agent with graceful fallback on failure.

    Director is the SOLE AUTHORITY for scene_type assignment.
    It receives purpose (from Splitter) + narration text and assigns scene_type.

    Risk mitigations:
    - Director sees full narration → can override wrong purpose (e.g. "explain"
      on comparison text → Director assigns "comparison" based on narration content)
    - If Director fails entirely → build_default_direction uses PURPOSE_TO_SCENE_TYPE
      map as safe fallback
    """
    director_input = json.dumps(
        {
            "raw_text": raw_text[:2000],  # Cap to avoid token explosion
            "scenes": [
                {
                    "scene_index": s["scene_index"],
                    "purpose": s.get("purpose", "explain"),
                    "narration": s["narration"],
                }
                for s in splitter_output["scenes"]
            ],
        },
        ensure_ascii=False,
    )

    try:
        # Timeout: Director should respond within 8s
        direction = await asyncio.wait_for(
            _run_llm_phase(
                system_prompt=DIRECTOR_PROMPT,
                user_content=director_input,
                schema=DIRECTOR_SCHEMA,
                schema_name="direction",
                temperature=0.3,
            ),
            timeout=8.0,
        )
        # Validate and sanitize Director output
        direction = validate_direction(direction, len(splitter_output["scenes"]))
        logger.info("  Director succeeded — custom creative direction applied")
        return direction

    except asyncio.TimeoutError:
        logger.warning("  Director timed out (>8s). Using default direction.")
        return build_default_direction(splitter_output)
    except Exception as e:
        logger.warning("  Director failed: {}. Using default direction.", e)
        return build_default_direction(splitter_output)


def _build_enricher_input(
    splitter_output: dict,
    direction: dict,
    scene_range: tuple[int, int] | None = None,
) -> str:
    """Build Enricher input by combining Splitter + Director outputs.

    Enricher receives scene_type from Director (not Splitter) so it
    generates appropriate card_items/stats for the correct scene type.

    Args:
        scene_range: Optional (start, end) to select a subset of scenes
                     for batched enricher calls. None = all scenes.
    """
    # Build direction lookup
    dir_lookup = {
        d["scene_index"]: d
        for d in direction.get("scene_directions", [])
    }

    all_scenes = splitter_output["scenes"]
    if scene_range is not None:
        all_scenes = [s for s in all_scenes if scene_range[0] <= s["scene_index"] < scene_range[1]]

    enricher_scenes = []
    for s in all_scenes:
        idx = s["scene_index"]
        d = dir_lookup.get(idx, {})
        enricher_scenes.append({
            "scene_index": idx,
            # Use Director's scene_type (sole authority)
            "scene_type": d.get("scene_type", "stock_background"),
            "purpose": s.get("purpose", "explain"),
            "narration": s["narration"],
            "keywords_to_highlight": s.get("keywords_to_highlight", []),
        })

    return json.dumps(
        {
            "title": splitter_output["title"],
            "scenes": enricher_scenes,
        },
        ensure_ascii=False,
    )


# ══════════════════════════════════════════
# LLM Execution (shared by all phases)
# ══════════════════════════════════════════


async def _run_llm_phase(
    system_prompt: str,
    user_content: str,
    schema: dict,
    schema_name: str,
    temperature: float,
) -> dict[str, Any]:
    """Run a single LLM phase with fallback (primary → Gemini)."""
    try:
        if CONTENT_PARSER_PROVIDER == "qwen":
            return await _call_qwen(system_prompt, user_content, schema, schema_name, temperature)
        return await _call_openai(system_prompt, user_content, schema, schema_name, temperature)
    except Exception as e:
        logger.warning("{} {} failed: {}. Trying Gemini fallback...", CONTENT_PARSER_PROVIDER, schema_name, e)
        try:
            return await _call_gemini(system_prompt, user_content, schema, temperature)
        except Exception as fallback_error:
            raise ContentParserError(
                f"All LLMs failed for {schema_name}. Primary: {e} | Gemini: {fallback_error}"
            ) from fallback_error


async def _call_openai(
    system_prompt: str,
    user_content: str,
    schema: dict,
    schema_name: str,
    temperature: float,
) -> dict[str, Any]:
    """Call GPT-4o-mini with structured output."""
    if not OPENAI_API_KEY:
        raise ContentParserError("OPENAI_API_KEY not configured")

    from app.nodes._openai_client import get_openai_client
    client = get_openai_client()

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": schema_name,
                "strict": True,
                "schema": schema,
            },
        },
        temperature=temperature,
        max_tokens=4096,
    )

    content = response.choices[0].message.content
    if not content:
        raise ContentParserError(f"Empty response from GPT-4o-mini ({schema_name})")

    return json.loads(content)


async def _call_qwen(
    system_prompt: str,
    user_content: str,
    schema: dict,
    schema_name: str,
    temperature: float,
) -> dict[str, Any]:
    """Call Qwen3.5-Flash (DashScope) with JSON output.

    DashScope does not support strict json_schema mode, so the schema is
    inlined into the system prompt and response_format=json_object is used.
    """
    if not QWEN_API_KEY:
        raise ContentParserError("QWEN_API_KEY not configured")

    from app.nodes._openai_client import get_qwen_client
    client = get_qwen_client()

    schema_hint = json.dumps(schema, ensure_ascii=False, indent=2)
    augmented_system = (
        f"{system_prompt}\n\n"
        f"You MUST respond with valid JSON strictly matching this schema:\n{schema_hint}"
    )

    response = await client.chat.completions.create(
        model=CONTENT_PARSER_MODEL,
        messages=[
            {"role": "system", "content": augmented_system},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=temperature,
        max_tokens=4096,
    )

    content = response.choices[0].message.content
    if not content:
        raise ContentParserError(f"Empty response from Qwen ({schema_name})")

    return json.loads(content)


async def _call_gemini(
    system_prompt: str,
    user_content: str,
    schema: dict,
    temperature: float,
) -> dict[str, Any]:
    """Fallback: Gemini 2.0 Flash via REST API."""
    if not GOOGLE_API_KEY:
        raise ContentParserError("GOOGLE_API_KEY not configured for fallback")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GOOGLE_API_KEY}"

    prompt = f"{system_prompt}\n\nRespond with valid JSON matching this schema:\n{json.dumps(schema, indent=2)}\n\nInput:\n{user_content}"

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            url,
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": temperature},
            },
        )
        response.raise_for_status()
        data = response.json()

    result_text = data["candidates"][0]["content"]["parts"][0]["text"]

    # Strip markdown code fences if present
    result_text = result_text.strip()
    if result_text.startswith("```"):
        lines = result_text.split("\n")
        result_text = "\n".join(lines[1:-1])

    return json.loads(result_text)


# ══════════════════════════════════════════
# Merge & Validation
# ══════════════════════════════════════════


# ── Data-driven layout assignment ──

def _auto_layout(scene_type: str, enricher_data: dict) -> str:
    """Choose layout based on actual Enricher data (card_items count, stats count).

    This runs AFTER Enricher, so we know exactly how many items each scene has.
    """
    if scene_type == "info_card":
        items = enricher_data.get("card_items") or []
        n = len(items)
        if n == 4:
            return "grid_2x2"          # 4 items in 2×2 grid
        elif n == 2:
            return "vertical_stack"    # 2 items stacked (avoid looking like comparison)
        else:
            return "vertical_stack"    # 3 or 5+ items stacked vertically

    elif scene_type == "stats_highlight":
        stats = enricher_data.get("stats") or []
        return "horizontal_grid" if len(stats) <= 2 else "vertical_stack"

    elif scene_type == "stock_background":
        return "media_overlay"  # media is the point of this scene type

    elif scene_type == "news_intro":
        return "media_overlay"  # news intro always shows media behind brand overlay

    # All other scene types have only 1 valid layout
    return "center_focus"


def _merge_phases(
    splitter: dict,
    direction: dict,
    enrichment: dict,
) -> dict[str, Any]:
    """Merge Splitter + Director + Enricher outputs into final result.

    Priority (for overlapping fields):
    - narration, keywords, english_phrases: from Splitter (source of truth)
    - scene_type, transition: from Director (sole authority)
    - layout: auto-assigned by _auto_layout() based on Enricher data
    - visual_description, media queries, card_items, stats: from Enricher
    - color_palette: from Director
    """
    # Build lookups
    dir_lookup: dict[int, dict] = {
        d["scene_index"]: d
        for d in direction.get("scene_directions", [])
    }
    enrich_lookup: dict[int, dict] = {
        s["scene_index"]: s
        for s in enrichment.get("scenes", [])
    }

    merged_scenes = []
    for scene in splitter["scenes"]:
        idx = scene["scene_index"]
        d = dir_lookup.get(idx, {})
        e = enrich_lookup.get(idx, {})

        scene_type = d.get("scene_type", "stock_background")

        merged = {
            # Splitter fields (structure — source of truth for text)
            "scene_index": scene["scene_index"],
            "narration": scene["narration"],
            "keywords_to_highlight": scene.get("keywords_to_highlight", []),
            "english_phrases": scene.get("english_phrases", []),
            "purpose": scene.get("purpose"),
            # Director fields (sole authority for scene_type)
            "scene_type": scene_type,
            "transition": d.get("transition", "fade"),
            # Layout — data-driven based on Enricher output
            "layout": _auto_layout(scene_type, e),
            # Enricher fields (visual details — with defaults)
            "visual_description": e.get("visual_description", scene["narration"][:30]),
            "semantic_summary_en": (
                e.get("semantic_summary_en")
                or e.get("visual_description")
                or scene["narration"][:80]
            ),
            "image_query": e.get("image_query"),
            "video_query": e.get("video_query"),
            "semantic_image_query": e.get("semantic_image_query"),
            "semantic_video_query": e.get("semantic_video_query"),
            "card_items": e.get("card_items") or [],
            "stats": e.get("stats") or [],
            "diagram_spec": e.get("diagram_spec"),
            # New scene type data (from Enricher)
            "comparison_sides": e.get("comparison_sides"),
            "timeline_events": e.get("timeline_events"),
            "media_layout": e.get("media_layout", "fit"),
            # TitleCard redesign fields (from Enricher)
            "title_lines": e.get("title_lines"),
            "top_badge": e.get("top_badge"),
            "top_icon": e.get("top_icon"),
            # Emoji pop-up (from Enricher)
            "emoji": e.get("emoji"),
        }
        merged_scenes.append(merged)

    return {
        "title": splitter["title"],
        "color_palette": direction.get("color_palette", {
            "primary": "#FF6B35",
            "secondary": "#7B68EE",
            "background": "#0F172A",
            "text": "#FFFFFF",
        }),
        "background_preset": direction.get("background_preset", "steel_blue"),
        "scenes": merged_scenes,
    }


def _tokenize_for_integrity(text: str) -> list[str]:
    """Tokenize text for robust integrity checks.

    Keeps Unicode word characters (including Vietnamese) and removes punctuation.
    """
    normalized = re.sub(r"[^\w\s]", " ", text.lower(), flags=re.UNICODE)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized.split() if normalized else []


def _ordered_token_recall(original_tokens: list[str], candidate_tokens: list[str]) -> float:
    """Return ordered recall of original tokens inside candidate tokens."""
    if not original_tokens:
        return 1.0

    j = 0
    matched = 0
    for token in original_tokens:
        while j < len(candidate_tokens) and candidate_tokens[j] != token:
            j += 1
        if j >= len(candidate_tokens):
            break
        matched += 1
        j += 1

    return matched / len(original_tokens)


def _coverage_token_recall(original_tokens: list[str], candidate_tokens: list[str]) -> float:
    """Return multiset token coverage of original tokens in candidate tokens."""
    if not original_tokens:
        return 1.0

    original_counter = Counter(original_tokens)
    candidate_counter = Counter(candidate_tokens)
    matched = sum(min(count, candidate_counter[token]) for token, count in original_counter.items())
    return matched / len(original_tokens)


def _build_fallback_phase1(original_text: str, preferred_scene_count: int | None = None) -> dict[str, Any]:
    """Build deterministic Phase 1 output from original text without paraphrasing.

    This fallback is used when LLM splitter output fails integrity validation.
    """
    text = original_text.strip()
    if not text:
        raise ContentParserError("Cannot build fallback scenes from empty input text")

    sentence_chunks = [s.strip() for s in re.split(r"(?<=[.!?…])\s+", text) if s.strip()]
    if not sentence_chunks:
        sentence_chunks = [text]

    if preferred_scene_count and 1 <= preferred_scene_count <= 10:
        target_scene_count = min(preferred_scene_count, len(sentence_chunks))
    else:
        word_count = len(text.split())
        if word_count <= 35:
            target_scene_count = 1
        elif word_count <= 90:
            target_scene_count = 2
        elif word_count <= 170:
            target_scene_count = 3
        else:
            target_scene_count = min(7, max(4, len(sentence_chunks)))
        target_scene_count = max(1, min(target_scene_count, len(sentence_chunks)))

    grouped_chunks: list[str] = []
    if target_scene_count >= len(sentence_chunks):
        grouped_chunks = sentence_chunks
    else:
        total = len(sentence_chunks)
        start = 0
        for i in range(target_scene_count):
            end = round((i + 1) * total / target_scene_count)
            end = max(end, start + 1)
            chunk = " ".join(sentence_chunks[start:end]).strip()
            if chunk:
                grouped_chunks.append(chunk)
            start = end

    if not grouped_chunks:
        grouped_chunks = [text]

    first_clause = re.split(r"[\n.!?…]", text, maxsplit=1)[0].strip()
    fallback_title = " ".join(first_clause.split()[:10]).strip() or "Auto Generated Video"

    scenes: list[dict[str, Any]] = []
    for idx, narration in enumerate(grouped_chunks):
        english_phrases = list(dict.fromkeys(re.findall(r"[A-Za-z][A-Za-z0-9'_\-]*", narration)))[:5]

        purpose = "explain"
        if idx == 0:
            purpose = "hook"
        elif idx == len(grouped_chunks) - 1 and len(grouped_chunks) > 2:
            purpose = "conclude"

        scenes.append(
            {
                "scene_index": idx,
                "purpose": purpose,
                "narration": narration,
                "keywords_to_highlight": [],
                "english_phrases": english_phrases,
            }
        )

    return {
        "title": fallback_title,
        "scenes": scenes,
    }


def _validate_phase1(result: dict[str, Any], original_text: str) -> None:
    """Validate Phase 1 output structure and content integrity.

    Checks:
    1. Required keys and fields exist.
    2. scene_index is sequential starting from 0.
    3. Narration text preserves original content in order using token-based recall.
    4. No narration is empty.
    5. Combined narrations maintain high token coverage and avoid duplicates.
    """
    for key in ("title", "scenes"):
        if key not in result:
            raise ContentParserError(f"Phase 1 missing required key: {key}")

    scenes = result["scenes"]
    if not scenes:
        raise ContentParserError("Phase 1 produced no scenes")

    required_fields = {"scene_index", "narration"}
    for i, scene in enumerate(scenes):
        missing = required_fields - set(scene.keys())
        if missing:
            raise ContentParserError(f"Phase 1 scene {i} missing fields: {missing}")

    # ── Check 1: scene_index sequential ──
    indices = [s["scene_index"] for s in scenes]
    expected = list(range(len(scenes)))
    if indices != expected:
        logger.warning(
            "Scene indices not sequential: {} (expected {}). Reindexing.",
            indices, expected,
        )
        for i, scene in enumerate(scenes):
            scene["scene_index"] = i

    # ── Check 2: no empty narrations ──
    for i, scene in enumerate(scenes):
        narration = scene.get("narration", "").strip()
        if not narration:
            raise ContentParserError(f"Scene {i} has empty narration")

    def _normalize(text: str) -> str:
        return re.sub(r"\s+", " ", text.lower().strip())

    original_norm = _normalize(original_text)
    all_narrations = " ".join(s["narration"] for s in scenes)
    narrations_norm = _normalize(all_narrations)

    # ── Check 3: ordered token coverage ──
    original_tokens = _tokenize_for_integrity(original_text)
    narration_tokens = _tokenize_for_integrity(all_narrations)

    if original_tokens:
        ordered_recall = _ordered_token_recall(original_tokens, narration_tokens)
        token_coverage = _coverage_token_recall(original_tokens, narration_tokens)

        if ordered_recall < 0.92 or token_coverage < 0.95:
            raise ContentParserError(
                "Content integrity failed: "
                f"{ordered_recall:.0%} ordered recall, {token_coverage:.0%} token coverage "
                "(need ≥92% ordered recall and ≥95% token coverage). "
                "LLM may have paraphrased, reordered, or dropped text."
            )
        if ordered_recall < 0.96 or token_coverage < 0.98:
            logger.warning(
                "Content integrity marginal: {:.0%} ordered recall, {:.0%} token coverage",
                ordered_recall,
                token_coverage,
            )

    # ── Check 3.1: duplicate narration detection ──
    seen_narrations: dict[str, int] = {}
    for i, scene in enumerate(scenes):
        normalized_scene = " ".join(_tokenize_for_integrity(scene["narration"]))
        if normalized_scene in seen_narrations:
            raise ContentParserError(
                f"Duplicate narration detected between scenes {seen_narrations[normalized_scene]} and {i}"
            )
        seen_narrations[normalized_scene] = i

    # ── Check 4: narration order matches original ──
    # Each scene's narration should appear in the original text in order
    search_pos = 0
    for i, scene in enumerate(scenes):
        scene_norm = _normalize(scene["narration"])
        # Find a significant fragment (first 20 chars) in original
        fragment = scene_norm[:min(20, len(scene_norm))]
        pos = original_norm.find(fragment, max(0, search_pos - 10))
        if pos == -1:
            # Try fuzzy: check if ≥60% of scene words appear in remaining original
            scene_words = scene_norm.split()
            remaining = original_norm[search_pos:]
            found = sum(1 for w in scene_words if w in remaining)
            if scene_words and found / len(scene_words) < 0.6:
                logger.warning(
                    "Scene {} narration may be out of order or fabricated "
                    "(fragment '{}' not found at position {}+)",
                    i, fragment[:30], search_pos,
                )
        else:
            search_pos = pos + len(fragment)

    # ── Check 5: word-level coverage (existing, kept for backward compat) ──
    original_words = set(_tokenize_for_integrity(original_text))
    narration_words = set(_tokenize_for_integrity(all_narrations))
    if original_words:
        word_coverage = len(original_words & narration_words) / len(original_words)
        if word_coverage < 0.8:
            logger.warning(
                "Word-level coverage warning: only {:.0%} (token checks passed)",
                word_coverage,
            )
