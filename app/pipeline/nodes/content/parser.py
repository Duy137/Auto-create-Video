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

from config import (
    OPENAI_API_KEY,
    GOOGLE_API_KEY,
    QWEN_API_KEY,
    CONTENT_PARSER_PROVIDER,
    CONTENT_PARSER_OPENAI_MODEL,
    CONTENT_PARSER_QWEN_MODEL,
)
from app.state import TokenUsage, calc_cost
from app.progress import emit_progress
from app.pipeline.nodes.content.director import (
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
   Each scene should have 1-2 sentences of narration (at least ~3.5 seconds).
6. CRITICAL LENGTH RULES:
   - Minimum: 9 words per scene (~3.5s narration). The renderer adds visual hold for very short scenes.
   - If a passage contains TWO distinct ideas, ALWAYS split into separate scenes even if each part < 9 words.
   - If a passage is short but expresses ONE continuous idea, keep it as one scene.
   - NEVER combine two distinct ideas into one scene just to reach a word count target.
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
# Note: Phase 2 (Director) is defined in content/director.py

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
3. image_query: 2-4 concise English keywords for stock image search. (REQUIRED ONLY for stock_background, media_showcase, title_card, and cryptovn101_news).
    Prefer style cues such as: "professional", "dark background", "minimal", "portrait".
4. video_query: 2-4 concise English keywords for stock video search. (REQUIRED ONLY for stock_background, media_showcase, title_card, and cryptovn101_news).
    Prefer cinematic language: "cinematic", "slow motion", "aerial view", "close up", "dramatic lighting".
    Avoid generic single-term queries (e.g. "technology"). Make them specific (e.g. "technology server room cinematic").
5. semantic_image_query: 2-4 optimized English keywords specifically for stock IMAGE search. (REQUIRED ONLY for stock_background, media_showcase, title_card, and cryptovn101_news).
    Think about what tags stock photographers actually use. Focus on: visual subject + setting + mood.
    Must differ from image_query — use synonyms, more visual/concrete terms.
    Example: "server room blue neon lighting" instead of "cloud servers operations room".
6. semantic_video_query: 2-4 optimized English keywords specifically for stock VIDEO search. (REQUIRED ONLY for stock_background, media_showcase, title_card, and cryptovn101_news).
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
14. top_badge: ONLY for scenes with scene_type="title_card". Optional short label (e.g. "HOT", "PRO", "UPDATE"). Set to null if not appropriate.
15. top_icon: ONLY for scenes with scene_type="title_card". Optional emoji icon displayed above the title. Set to null if not appropriate.

For title_lines, top_badge, top_icon: set to null if the scene_type is not "title_card".

16. emoji: REQUIRED emoji pop-up for each scene. You MUST provide exactly ONE emoji per scene.
    DO NOT set to null (except for title_card and cryptovn101_news scenes).
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
    
    ONLY set to null for title_card and cryptovn101_news scenes. For ALL other scenes, you MUST choose one emoji.

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
                        "type": ["string", "null"]
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


async def parse_content(text: str, *, skip_review: bool = False) -> dict[str, Any]:
    """Parse validated text into structured scene data using 3-phase LLM pipeline.

    Phase 1: Scene Splitter — split text into scenes with purpose, faithful to original.
    Phase 2: Director — creative direction (color palette, scene_type ASSIGNMENT, transitions, layouts).
    Phase 3: Visual Enricher — per-scene visual details (media queries, card_items, etc.)
    Phase 3.5: Alt Data Generator — pre-computed alternative scene type data (only for advanced gen).

    Args:
        text: Validated input text.
        skip_review: If True (quick gen), skip Phase 3.5 alt_data generation.

    Returns:
        Dict with keys: title, color_palette, scenes[].

    Raises:
        ContentParserError: If critical LLM calls fail (Splitter or Enricher).
        Director failure is handled gracefully with fallback defaults.
    """
    logger.info("Parsing content ({} chars, ~{} words)", len(text), len(text.split()))
    _token_usages: list[TokenUsage] = []

    # ── Phase 1: Split scenes (analytical, low creativity) ──
    await emit_progress({
        "phase": "create_processing",
        "step_key": "parse_scenes",
        "message": "Đang chia kịch bản thành các cảnh...",
        "tool_name": "Scene Splitter",
    })
    logger.info("  Phase 1: Scene Splitter...")
    phase1, _u1 = await _run_llm_phase(
        system_prompt=SPLITTER_PROMPT,
        user_content=text,
        schema=SPLITTER_SCHEMA,
        schema_name="scene_split",
        temperature=0.2,
    )
    if _u1:
        _token_usages.append(_u1)

    try:
        _validate_phase1(phase1, text)
    except ContentParserError as first_error:
        logger.warning(
            "  Phase 1 integrity check failed: {}. Retrying splitter once.",
            first_error,
        )

        retry_phase1: dict[str, Any] | None = None
        try:
            retry_phase1, _u1r = await _run_llm_phase(
                system_prompt=SPLITTER_PROMPT,
                user_content=text,
                schema=SPLITTER_SCHEMA,
                schema_name="scene_split_retry",
                temperature=0.0,
            )
            if _u1r:
                _token_usages.append(_u1r)
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
    await emit_progress({
        "phase": "create_processing",
        "step_key": "parse_scenes",
        "mark_done": True,
        "intermediate_result": f"Đã tách {len(phase1['scenes'])} cảnh.",
    })

    # ── Phase 2: Director (creative direction, with fallback) ──
    await emit_progress({
        "phase": "create_processing",
        "step_key": "direct_scenes",
        "message": "Đang chọn phong cách và bố cục cho từng cảnh...",
        "tool_name": "Director",
    })
    logger.info("  Phase 2: Director...")
    direction = await _run_director(phase1, text)
    # Collect director token usage if available
    _u_dir = direction.pop("_token_usage", None)
    if _u_dir:
        _token_usages.append(_u_dir)
    logger.info(
        "  Phase 2 done: topic='{}', mood='{}', palette={}",
        direction.get("topic", "?"),
        direction.get("mood", "?"),
        direction.get("color_palette", {}).get("primary", "?"),
    )
    await emit_progress({
        "phase": "create_processing",
        "step_key": "direct_scenes",
        "mark_done": True,
        "intermediate_result": "Đã chọn phong cách và bảng màu cho video.",
    })

    # ── Phase 3: Enricher (visual details, reduced scope) ──
    await emit_progress({
        "phase": "create_processing",
        "step_key": "enrich_visuals",
        "message": "Đang bổ sung truy vấn media và mô tả hình ảnh...",
        "tool_name": "Visual Enricher",
    })
    logger.info("  Phase 3: Visual Enricher...")
    num_scenes = len(phase1.get("scenes", []))
    BATCH_SIZE = 4

    if num_scenes > BATCH_SIZE:
        # Batch enricher: run in parallel to prevent long hangs and timeouts
        import asyncio
        batches = []
        for i in range(0, num_scenes, BATCH_SIZE):
            batches.append((i, min(i + BATCH_SIZE, num_scenes)))

        logger.info("  Enricher batching: {} scenes → {} batches (max {}/batch)", num_scenes, len(batches), BATCH_SIZE)

        tasks = []
        for start, end in batches:
            enricher_input = _build_enricher_input(phase1, direction, scene_range=(start, end))
            tasks.append(_run_llm_phase(
                system_prompt=ENRICHER_PROMPT,
                user_content=enricher_input,
                schema=ENRICHER_SCHEMA,
                schema_name=f"visual_enrich_batch",
                temperature=0.5,
            ))

        # We don't use return_exceptions=True because if one batch fails, we want it to bubble up to the pipeline's error handler
        results = await asyncio.gather(*tasks)

        phase3 = {"scenes": []}
        for batch_res, usage in results:
            phase3["scenes"].extend(batch_res.get("scenes", []))
            if usage:
                _token_usages.append(usage)
                
        await emit_progress({
            "phase": "create_processing",
            "step_key": "enrich_visuals",
            "intermediate_result": f"Xử lý song song {num_scenes} cảnh bằng {len(batches)} luồng.",
        })
    else:
        enricher_input = _build_enricher_input(phase1, direction)
        phase3, _u3 = await _run_llm_phase(
            system_prompt=ENRICHER_PROMPT,
            user_content=enricher_input,
            schema=ENRICHER_SCHEMA,
            schema_name="visual_enrich",
            temperature=0.5,
        )
        if _u3:
            _token_usages.append(_u3)
            
    logger.info("  Phase 3 done: visual metadata for {} scenes", len(phase3.get("scenes", [])))
    await emit_progress({
        "phase": "create_processing",
        "step_key": "enrich_visuals",
        "mark_done": True,
        "intermediate_result": f"Đã tạo metadata media cho {len(phase3.get('scenes', []))} cảnh.",
    })

    # ── Merge all 3 phases ──
    result = _merge_phases(phase1, direction, phase3, skip_review=skip_review)

    # ── Phase 3.5: Alt Data Generator (only for advanced gen / review mode) ──
    if not skip_review:
        try:
            logger.info("  Phase 3.5: Alt Data Generator...")
            alt_data_result = await _run_alt_data_phase(result["scenes"])
            if alt_data_result:
                alt_scenes = alt_data_result.get("scenes", [])
                logger.info("  Phase 3.5: LLM returned {} scene entries", len(alt_scenes))
                for alt_s in alt_scenes:
                    idx = alt_s.get("scene_index", -1)
                    alt_obj = alt_s.get("alt_data")
                    if alt_obj is None:
                        logger.warning("  Phase 3.5: scene {} has alt_data=None", idx)
                    elif not isinstance(alt_obj, dict):
                        logger.warning("  Phase 3.5: scene {} alt_data is {} not dict", idx, type(alt_obj))
                    elif 0 <= idx < len(result["scenes"]):
                        non_null_types = [k for k, v in alt_obj.items() if v is not None]
                        logger.info("  Phase 3.5: scene {} → {} non-null types: {}",
                                   idx, len(non_null_types), non_null_types)
                        result["scenes"][idx]["_alt_data"] = alt_obj
                    else:
                        logger.warning("  Phase 3.5: scene {} index out of range (total={})",
                                      idx, len(result["scenes"]))
                populated = sum(1 for s in result["scenes"] if s.get("_alt_data"))
                logger.info("  Phase 3.5 done: alt_data populated for {}/{} scenes", populated, len(result["scenes"]))
                # Collect token usage
                _u_alt = alt_data_result.pop("_token_usage", None)
                if _u_alt:
                    _token_usages.append(_u_alt)
            else:
                logger.warning("  Phase 3.5: alt_data LLM returned empty, skipping")
        except Exception as e:
            import traceback
            logger.warning("  Phase 3.5 failed (non-critical): {}. Scenes will use static fallback.", e)
            logger.debug("  Phase 3.5 traceback:\n{}", traceback.format_exc())
    else:
        logger.info("  Phase 3.5: Skipped (quick gen / skip_review=True)")

    # Attach token usage to result for caller to collect
    result["_token_usages"] = _token_usages

    total_in = sum(u.input_tokens for u in _token_usages)
    total_out = sum(u.output_tokens for u in _token_usages)
    total_cost = sum(u.cost_usd for u in _token_usages)
    logger.info("  [ContentParser] Tokens: in={}, out={}, cost=${:.6f}", total_in, total_out, total_cost)

    logger.info(
        "Parsed {} scenes: {}",
        len(result["scenes"]),
        [s["scene_type"] for s in result["scenes"]],
    )
    return result

# ══════════════════════════════════════════
# Phase 3.5: Alt Data Generator
# ══════════════════════════════════════════

ALT_DATA_PROMPT = """\
You are an expert content restructuring assistant.
Given a list of video scenes (each with narration and current scene_type),
generate alternative structured data for 7 different no-media scene types.

For EACH scene, generate data for ALL 7 types. NO exceptions. NEVER set any to null.
Even if the narration seems poorly suited, you MUST generate a creative approximation.
Example: narration "Compare A vs B" → timeline: "Step 1: A, Step 2: B, Step 3: Choose"

Types to generate for each scene:
1. info_card → {"card_items": [...]}  (2-4 items, each with "icon" emoji, "title" 2-5 words, "subtitle" max 10 words)
2. emoji_grid → {"card_items": [...]}  (3-4 items, "icon" = large emoji, "title" 1-3 words, "subtitle" max 8 words)
3. timeline → {"timeline_events": [...]}  (3-5 events with "label", "title", "description")
4. stats_highlight → {"stats": [...]}  (1-3 items with "value" like "300%" or "3 bước", "label", "color" hex)
5. comparison → {"comparison_sides": [...]}  (2 sides with "label", "points" array, "sentiment": positive/negative/neutral)
6. diagram → {"diagram_spec": {...}}  (bar_chart or line_chart — estimate numbers if narration has none)
7. story_beats → {"story_beats": [...]}  (3-5 beats with "text", "emoji", "start_ms": 0, "end_ms": 0)

Rules:
- ALL text MUST be in the SAME language as the narration.
- Every alt_data object MUST have all 7 keys with real data. null is FORBIDDEN."""

ALT_DATA_SCHEMA = {
    "type": "object",
    "properties": {
        "scenes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "scene_index": {"type": "integer"},
                    "alt_data": {
                        "type": "object",
                        "properties": {
                            "info_card": {
                                "type": "object",
                                "properties": {
                                    "card_items": {
                                        "type": "array",
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
                                },
                                "required": ["card_items"],
                                "additionalProperties": False,
                            },
                            "emoji_grid": {
                                "type": "object",
                                "properties": {
                                    "card_items": {
                                        "type": "array",
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
                                },
                                "required": ["card_items"],
                                "additionalProperties": False,
                            },
                            "timeline": {
                                "type": "object",
                                "properties": {
                                    "timeline_events": {
                                        "type": "array",
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
                                },
                                "required": ["timeline_events"],
                                "additionalProperties": False,
                            },
                            "stats_highlight": {
                                "type": "object",
                                "properties": {
                                    "stats": {
                                        "type": "array",
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
                                },
                                "required": ["stats"],
                                "additionalProperties": False,
                            },
                            "comparison": {
                                "type": "object",
                                "properties": {
                                    "comparison_sides": {
                                        "type": "array",
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
                                },
                                "required": ["comparison_sides"],
                                "additionalProperties": False,
                            },
                            "diagram": {
                                "type": "object",
                                "properties": {
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
                                },
                                "required": ["diagram_spec"],
                                "additionalProperties": False,
                            },
                            "story_beats": {
                                "type": "object",
                                "properties": {
                                    "story_beats": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "text": {"type": "string"},
                                                "emoji": {"type": "string"},
                                                "start_ms": {"type": "integer"},
                                                "end_ms": {"type": "integer"},
                                            },
                                            "required": ["text", "emoji", "start_ms", "end_ms"],
                                            "additionalProperties": False,
                                        },
                                    },
                                },
                                "required": ["story_beats"],
                                "additionalProperties": False,
                            },
                        },
                        "required": ["info_card", "emoji_grid", "timeline", "stats_highlight", "comparison", "diagram", "story_beats"],
                        "additionalProperties": False,
                    },
                },
                "required": ["scene_index", "alt_data"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["scenes"],
    "additionalProperties": False,
}


async def _run_alt_data_phase(merged_scenes: list[dict]) -> dict | None:
    """Dedicated LLM call to generate alt_data for all scenes.

    Processes scenes in batches of BATCH_SIZE to avoid GPT-4o-mini output
    truncation (8 scenes × 7 types = too much for one response).
    """
    BATCH_SIZE = 3
    all_alt_scenes: list[dict] = []
    total_usage = None

    # Split scenes into batches
    batches: list[list[dict]] = []
    for i in range(0, len(merged_scenes), BATCH_SIZE):
        batch = []
        for s in merged_scenes[i:i + BATCH_SIZE]:
            batch.append({
                "scene_index": s["scene_index"],
                "narration": s["narration"],
                "scene_type": s["scene_type"],
            })
        batches.append(batch)

    logger.info("  Phase 3.5: Processing {} scenes in {} batches of {}",
               len(merged_scenes), len(batches), BATCH_SIZE)

    async def _process_batch(batch: list[dict]) -> tuple[list[dict], dict | None]:
        user_content = json.dumps({"scenes": batch}, ensure_ascii=False)
        result, usage = await _run_llm_phase(
            system_prompt=ALT_DATA_PROMPT,
            user_content=user_content,
            schema=ALT_DATA_SCHEMA,
            schema_name="alt_data_gen",
            temperature=0.5,
        )
        _fill_null_alt_entries(result, merged_scenes)
        return result.get("scenes", []), usage

    # Run batches concurrently for speed
    import asyncio
    tasks = [_process_batch(b) for b in batches]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for i, res in enumerate(results):
        if isinstance(res, Exception):
            logger.warning("  Phase 3.5 batch {} failed: {}", i, res)
            continue
        batch_scenes, usage = res
        all_alt_scenes.extend(batch_scenes)
        if usage:
            if total_usage is None:
                total_usage = usage
            else:
                total_usage = type(usage)(
                    input_tokens=total_usage.input_tokens + usage.input_tokens,
                    output_tokens=total_usage.output_tokens + usage.output_tokens,
                    cost_usd=total_usage.cost_usd + usage.cost_usd,
                    model=usage.model,
                    step=total_usage.step,
                )

    if not all_alt_scenes:
        return None

    result = {"scenes": all_alt_scenes}
    if total_usage:
        result["_token_usage"] = total_usage
    return result


def _fill_null_alt_entries(result: dict, merged_scenes: list[dict]) -> None:
    """Patch any null alt_data entries with deterministic fallback content.

    GPT-4o-mini sometimes returns null despite schema forbidding it.
    This guarantees every scene has usable data for all 7 types.
    """
    ALT_TYPES = ["info_card", "emoji_grid", "timeline", "stats_highlight",
                 "comparison", "diagram", "story_beats"]
    
    llm_scenes = result.get("scenes") or []
    for llm_scene in llm_scenes:
        alt = llm_scene.get("alt_data")
        if not alt:
            continue
        idx = llm_scene.get("scene_index", 0)
        narration = ""
        for ms in merged_scenes:
            if ms.get("scene_index") == idx:
                narration = ms.get("narration", "")
                break
        
        # Shorten narration for labels
        words = narration.split()
        short = " ".join(words[:5]) if len(words) > 5 else narration
        
        null_count = sum(1 for t in ALT_TYPES if alt.get(t) is None)
        if null_count > 0:
            logger.warning("  Scene {} alt_data has {}/{} null entries — filling fallback",
                       idx, null_count, len(ALT_TYPES))
        
        # Fill each null type with deterministic fallback
        if alt.get("info_card") is None:
            alt["info_card"] = {"card_items": [
                {"icon": "📌", "title": short or "Thông tin", "subtitle": " ".join(words[:8]) or "Chi tiết"},
                {"icon": "💡", "title": "Chi tiết", "subtitle": " ".join(words[5:13]) or "Nội dung"},
            ]}
        if alt.get("emoji_grid") is None:
            alt["emoji_grid"] = {"card_items": [
                {"icon": "⚡", "title": words[0] if words else "Item", "subtitle": short},
                {"icon": "🎯", "title": words[1] if len(words) > 1 else "Item", "subtitle": short},
                {"icon": "🔥", "title": words[2] if len(words) > 2 else "Item", "subtitle": short},
            ]}
        if alt.get("timeline") is None:
            chunks = [words[i:i+3] for i in range(0, min(len(words), 12), 3)] or [["Bước 1"], ["Bước 2"], ["Bước 3"]]
            alt["timeline"] = {"timeline_events": [
                {"label": f"#{i+1}", "title": " ".join(c), "description": None}
                for i, c in enumerate(chunks[:4])
            ]}
        if alt.get("stats_highlight") is None:
            alt["stats_highlight"] = {"stats": [
                {"label": short or "Kết quả", "value": "100%", "color": "#6366f1"},
            ]}
        if alt.get("comparison") is None:
            alt["comparison"] = {"comparison_sides": [
                {"label": "Ưu điểm", "points": [short or "Tốt"], "sentiment": "positive"},
                {"label": "Nhược điểm", "points": ["Cần cải thiện"], "sentiment": "negative"},
            ]}
        if alt.get("diagram") is None:
            alt["diagram"] = {"diagram_spec": {
                "type": "bar_chart", "x_range": None, "function": None,
                "data": [{"x": "A", "y": 50, "label": short}, {"x": "B", "y": 80, "label": "Mục tiêu"}],
                "latex": None, "annotations": None,
            }}
        if alt.get("story_beats") is None:
            alt["story_beats"] = {"story_beats": [
                {"text": " ".join(words[:4]) or "Bắt đầu", "emoji": "✨", "start_ms": 0, "end_ms": 0},
                {"text": " ".join(words[4:8]) or "Phát triển", "emoji": "🔥", "start_ms": 0, "end_ms": 0},
                {"text": " ".join(words[8:12]) or "Kết thúc", "emoji": "🎯", "start_ms": 0, "end_ms": 0},
            ]}


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
        direction, _u_dir = await asyncio.wait_for(
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
        # Attach director token usage for caller to collect
        direction["_token_usage"] = _u_dir
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
) -> tuple[dict[str, Any], TokenUsage | None]:
    """Run a single LLM phase with fallback (primary → Gemini).

    Returns (result_dict, token_usage_or_None).
    """
    try:
        if CONTENT_PARSER_PROVIDER == "qwen":
            return await _call_qwen(system_prompt, user_content, schema, schema_name, temperature)
        return await _call_openai(system_prompt, user_content, schema, schema_name, temperature)
    except Exception as e:
        logger.warning("{} {} failed: {}. Trying Gemini fallback...", CONTENT_PARSER_PROVIDER, schema_name, e)
        try:
            result = await _call_gemini(system_prompt, user_content, schema, temperature)
            return result, None  # Gemini fallback — no token tracking
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
) -> tuple[dict[str, Any], TokenUsage | None]:
    """Call OpenAI with structured output.

    Returns (result_dict, token_usage).
    """
    if not OPENAI_API_KEY:
        raise ContentParserError("OPENAI_API_KEY not configured")

    from app.pipeline.nodes._openai_client import get_openai_client
    client = get_openai_client()

    response = await client.chat.completions.create(
        model=CONTENT_PARSER_OPENAI_MODEL,
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

    # Extract token usage
    model = CONTENT_PARSER_OPENAI_MODEL
    input_tokens = getattr(response.usage, "prompt_tokens", 0) if response.usage else 0
    output_tokens = getattr(response.usage, "completion_tokens", 0) if response.usage else 0
    usage = TokenUsage(
        model=model,
        step=f"content.{schema_name}",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=calc_cost(model, input_tokens, output_tokens),
    )

    content = response.choices[0].message.content
    if not content:
        raise ContentParserError(f"Empty response from OpenAI ({schema_name})")

    return json.loads(content), usage


async def _call_qwen(
    system_prompt: str,
    user_content: str,
    schema: dict,
    schema_name: str,
    temperature: float,
) -> tuple[dict[str, Any], TokenUsage | None]:
    """Call Qwen (DashScope) with JSON output.

    DashScope does not support strict json_schema mode, so the schema is
    inlined into the system prompt and response_format=json_object is used.

    Returns (result_dict, token_usage).
    """
    if not QWEN_API_KEY:
        raise ContentParserError("QWEN_API_KEY not configured")

    from app.pipeline.nodes._openai_client import get_qwen_client
    client = get_qwen_client()

    schema_hint = json.dumps(schema, ensure_ascii=False, indent=2)
    augmented_system = (
        f"{system_prompt}\n\n"
        f"You MUST respond with valid JSON strictly matching this schema:\n{schema_hint}"
    )

    response = await client.chat.completions.create(
        model=CONTENT_PARSER_QWEN_MODEL,
        messages=[
            {"role": "system", "content": augmented_system},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=temperature,
        max_tokens=4096,
    )

    # Extract token usage
    model = CONTENT_PARSER_QWEN_MODEL
    input_tokens = getattr(response.usage, "prompt_tokens", 0) if response.usage else 0
    output_tokens = getattr(response.usage, "completion_tokens", 0) if response.usage else 0
    usage = TokenUsage(
        model=model,
        step=f"content.{schema_name}",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=calc_cost(model, input_tokens, output_tokens),
    )

    content = response.choices[0].message.content
    if not content:
        raise ContentParserError(f"Empty response from Qwen ({schema_name})")

    return json.loads(content), usage


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

def _auto_layout(scene_type: str, enricher_data: dict, director_layout: str | None = None) -> str:
    """Choose layout based on actual Enricher data (card_items count, stats count).

    This runs AFTER Enricher, so we know exactly how many items each scene has.
    """
    if scene_type == "title_card" and director_layout:
        return director_layout

    if scene_type == "info_card":
        items = enricher_data.get("card_items") or []
        n = len(items)
        if n == 4:
            return "grid_2x2"          # 4 items in 2×2 grid
        else:
            return "vertical_stack"    # 2, 3, or 5+ items stacked vertically

    elif scene_type == "stats_highlight":
        return "vertical_stack"

    elif scene_type == "stock_background":
        return "media_overlay"  # media is the point of this scene type

    elif scene_type == "emoji_grid":
        return "icon_showcase"  # large icons, minimal text

    elif scene_type == "comparison":
        return "split_screen"  # classic left/right split

    elif scene_type == "timeline":
        return "left_aligned"  # numbered steps, line on left

    elif scene_type == "story_beats":
        return "card_beats"  # card-based layout with numbering

    elif scene_type == "media_showcase":
        return enricher_data.get("media_layout", "fit")  # migrate from media_layout

    # All other scene types
    return director_layout or "center_focus"


def _merge_phases(
    splitter: dict,
    direction: dict,
    enrichment: dict,
    skip_review: bool = False,
) -> dict[str, Any]:
    """Merge Splitter + Director + Enricher outputs into final result.

    Priority (for overlapping fields):
    - narration, keywords, english_phrases: from Splitter (source of truth)
    - scene_type, transition: from Director (sole authority)
    - layout: auto-assigned by _auto_layout() based on Enricher data or Director choice
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
            # Layout — data-driven based on Enricher output OR use Director's choice
            "layout": _auto_layout(scene_type, e, d.get("layout")),
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
            "emoji": e.get("emoji") if not (skip_review and scene_type in {"info_card", "comparison", "stats_highlight", "timeline", "emoji_grid", "diagram", "story_beats"}) else None,
        }

        # ── Fallback: ensure title_card scenes always have media search queries ──
        # The LLM Enricher sometimes omits queries for "hook" title_card scenes.
        # Generate fallback queries from semantic_summary_en so the media pipeline
        # can find a background video/image.
        if scene_type in ("title_card", "cryptovn101_news"):
            has_any_query = (
                merged.get("image_query")
                or merged.get("video_query")
                or merged.get("semantic_image_query")
                or merged.get("semantic_video_query")
            )
            if not has_any_query:
                summary_en = merged.get("semantic_summary_en") or ""
                visual_desc = merged.get("visual_description") or ""
                # Build a generic cinematic query from the English summary
                fallback_q = summary_en.strip() if summary_en else visual_desc.strip()
                if fallback_q:
                    # Use summary as video query with cinematic cue
                    merged["video_query"] = f"{fallback_q[:60]} cinematic"
                    merged["image_query"] = fallback_q[:60]
                    merged["semantic_video_query"] = f"{fallback_q[:60]} dramatic lighting"
                    merged["semantic_image_query"] = f"{fallback_q[:60]} professional"
                    logger.info(
                        "  Fallback: generated media queries for title_card scene {} from semantic_summary_en",
                        idx,
                    )

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
