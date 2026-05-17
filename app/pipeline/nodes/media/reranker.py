"""VLM media reranker for review-time candidate selection.

This module scores top-k image/video candidates for each scene using
OpenAI vision and selects the best-fit media for render quality.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from loguru import logger
from app.state import TokenUsage, calc_cost

from config import (
    OPENAI_API_KEY,
    QWEN_API_KEY,
    VLM_AUDIT_ASPECT_TOLERANCE,
    VLM_AUDIT_ENABLED,
    VLM_AUDIT_MIN_CONFIDENCE,
    VLM_AUDIT_MIN_DURATION_RATIO,
    VLM_AUDIT_REQUIRE_KEYWORD_OVERLAP,
    VLM_RERANK_ENABLED,
    VLM_RERANK_MAX_CANDIDATES,
    VLM_RERANK_MAX_CONCURRENCY,
    VLM_RERANK_MODEL,
    VLM_RERANK_PROVIDER,
    VLM_RERANK_TIMEOUT_SECONDS,
)


def _normalize_candidates_by_scene(
    candidates_by_scene: dict[Any, list[dict[str, Any]]],
) -> dict[int, list[dict[str, Any]]]:
    normalized: dict[int, list[dict[str, Any]]] = {}
    for raw_key, raw_candidates in candidates_by_scene.items():
        try:
            scene_index = int(raw_key)
        except (TypeError, ValueError):
            continue

        if not isinstance(raw_candidates, list):
            continue

        candidates = [c for c in raw_candidates if isinstance(c, dict)]
        normalized[scene_index] = candidates

    return normalized


def _preview_url(candidate: dict[str, Any]) -> str:
    media_type = candidate.get("media_type")
    if media_type == "video":
        return str(candidate.get("thumbnail") or candidate.get("url") or "")
    return str(candidate.get("url") or "")


def _fallback_decision(
    scene_index: int,
    reason: str,
    selected_candidate: dict[str, Any] | None,
) -> dict[str, Any]:
    return {
        "scene_index": scene_index,
        "selected_index": 0 if selected_candidate else None,
        "selected_candidate": selected_candidate,
        "confidence": 0.0,
        "reason": reason,
        "scores": [],
        "used_fallback": True,
    }


def _is_param_compat_error(error: Exception, param_name: str) -> bool:
    message = str(error).lower()
    return (
        f"unexpected keyword argument '{param_name}'" in message
        or f"unsupported parameter: '{param_name}'" in message
    )


async def _score_scene_with_vlm(
    scene: dict[str, Any],
    candidates: list[dict[str, Any]],
    max_candidates: int,
    client: Any,
    *,
    include_image_detail: bool = True,
) -> dict[str, Any]:
    """Shared VLM scoring logic — works with any OpenAI-compatible client."""
    considered = candidates[: max(1, max_candidates)]
    scene_context = {
        "scene_index": scene.get("scene_index"),
        "scene_type": scene.get("scene_type"),
        "purpose": scene.get("purpose"),
        "narration": scene.get("narration", "")[:400],
        "visual_description": scene.get("visual_description", ""),
        "semantic_summary_en": scene.get("semantic_summary_en", ""),
        "semantic_image_query": scene.get("semantic_image_query", ""),
        "semantic_video_query": scene.get("semantic_video_query", ""),
        "keywords_to_highlight": scene.get("keywords_to_highlight", []),
        "image_query": scene.get("image_query"),
        "video_query": scene.get("video_query"),
    }

    instruction = (
        "You are selecting the best stock media for a short-video scene. "
        "Score candidates by: (1) match with the semantic search intent "
        "(semantic_image_query / semantic_video_query), (2) visual clarity, "
        "(3) fit for overlaid text. "
        "Return strict JSON with keys: selected_index (0-based int), confidence (0-1), "
        "reason (short string), scores (array of {index, score, note})."
    )

    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"{instruction}\n\n"
                f"Scene context:\n{json.dumps(scene_context, ensure_ascii=False)}\n\n"
                "Candidates will follow as numbered visual inputs."
            ),
        }
    ]

    for idx, candidate in enumerate(considered):
        summary = {
            "index": idx,
            "media_type": candidate.get("media_type"),
            "width": candidate.get("width"),
            "height": candidate.get("height"),
            "duration": candidate.get("duration"),
            "source_query": candidate.get("source_query"),
            "source_rank": candidate.get("source_rank"),
        }
        content.append(
            {
                "type": "text",
                "text": f"Candidate {idx}: {json.dumps(summary, ensure_ascii=False)}",
            }
        )

        preview = _preview_url(candidate)
        if preview:
            image_url_block: dict[str, Any] = {"url": preview}
            if include_image_detail:
                image_url_block["detail"] = "low"
            content.append({"type": "image_url", "image_url": image_url_block})

    timeout_seconds = max(5.0, VLM_RERANK_TIMEOUT_SECONDS)

    base_payload: dict[str, Any] = {
        "model": VLM_RERANK_MODEL,
        "messages": [{"role": "user", "content": content}],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }

    token_variants: list[dict[str, Any]] = [
        {"max_completion_tokens": 800},
        {"max_tokens": 800},
    ]

    last_error: Exception | None = None
    response = None
    for token_payload in token_variants:
        try:
            response = await asyncio.wait_for(
                client.chat.completions.create(**base_payload, **token_payload),
                timeout=timeout_seconds,
            )
            break
        except Exception as e:
            last_error = e
            token_key = next(iter(token_payload.keys()))
            if _is_param_compat_error(e, token_key):
                continue
            raise

    if response is None:
        if last_error is not None:
            raise last_error
        raise RuntimeError("VLM reranker request failed without response")

    raw_content = response.choices[0].message.content
    if not raw_content:
        raise RuntimeError("VLM reranker returned empty content")

    parsed = json.loads(raw_content)

    selected_index = parsed.get("selected_index", 0)
    try:
        selected_index = int(selected_index)
    except (TypeError, ValueError):
        selected_index = 0

    if selected_index < 0 or selected_index >= len(considered):
        selected_index = 0

    confidence = parsed.get("confidence", 0.0)
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.0

    token_usage = None
    if response and response.usage:
        in_toks = response.usage.prompt_tokens
        out_toks = response.usage.completion_tokens
        token_usage = TokenUsage(
            model=VLM_RERANK_MODEL,
            step="media_reranker",
            input_tokens=in_toks,
            output_tokens=out_toks,
            cost_usd=calc_cost(VLM_RERANK_MODEL, in_toks, out_toks),
        )

    return {
        "selected_index": selected_index,
        "selected_candidate": considered[selected_index],
        "confidence": max(0.0, min(1.0, confidence)),
        "reason": str(parsed.get("reason", ""))[:300],
        "scores": parsed.get("scores", []),
        "used_fallback": False,
        "token_usage": token_usage,
    }


async def _score_scene_with_openai(
    scene: dict[str, Any],
    candidates: list[dict[str, Any]],
    max_candidates: int,
) -> dict[str, Any]:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required for VLM reranking")
    from app.pipeline.nodes._openai_client import get_openai_client
    return await _score_scene_with_vlm(
        scene, candidates, max_candidates, get_openai_client(), include_image_detail=True
    )


async def _score_scene_with_qwen_vlm(
    scene: dict[str, Any],
    candidates: list[dict[str, Any]],
    max_candidates: int,
) -> dict[str, Any]:
    if not QWEN_API_KEY:
        raise RuntimeError("QWEN_API_KEY is required for Qwen VLM reranking")
    from app.pipeline.nodes._openai_client import get_qwen_client
    return await _score_scene_with_vlm(
        scene, candidates, max_candidates, get_qwen_client(), include_image_detail=False
    )



_TARGET_ASPECT = 9 / 16  # portrait short-video


def _estimate_narration_duration(narration: str) -> float:
    """Rough estimate: ~2.5 words/second for VN narration."""
    words = len((narration or "").split())
    return max(2.0, words / 2.5)


def _rule_based_audit(
    scene: dict[str, Any],
    selected: dict[str, Any] | None,
) -> dict[str, Any]:
    """Approach 5: deterministic technical checks."""
    signals: list[str] = []
    details: dict[str, Any] = {}

    if not selected:
        return {"signals": ["no_selection"], "details": {}}

    width_raw = selected.get("width") or 0
    height_raw = selected.get("height") or 0
    try:
        width = float(width_raw)
        height = float(height_raw)
    except (TypeError, ValueError):
        width = 0.0
        height = 0.0

    if width and height:
        ratio = width / height
        details["aspect_ratio"] = round(ratio, 3)
        if abs(ratio - _TARGET_ASPECT) > VLM_AUDIT_ASPECT_TOLERANCE:
            signals.append("aspect_mismatch")

    if selected.get("media_type") == "video":
        duration = float(selected.get("duration") or 0)
        narration_sec = _estimate_narration_duration(scene.get("narration", ""))
        details["duration"] = duration
        details["narration_estimate_sec"] = round(narration_sec, 2)
        if duration and duration < narration_sec * VLM_AUDIT_MIN_DURATION_RATIO:
            signals.append("duration_too_short")

    if VLM_AUDIT_REQUIRE_KEYWORD_OVERLAP:
        keywords = [str(k).lower() for k in (scene.get("keywords_to_highlight") or []) if k]
        tags = selected.get("tags") or []
        tags_text = " ".join(tags) if isinstance(tags, list) else str(tags)
        haystack = " ".join([
            str(selected.get("source_query") or ""),
            tags_text,
        ]).lower()
        if keywords and not any(k in haystack for k in keywords):
            signals.append("keyword_no_overlap")

    return {"signals": signals, "details": details}


_CRITICAL_AUDIT_SIGNALS = frozenset({"no_selection", "aspect_mismatch"})


def _build_audit(
    scene: dict[str, Any],
    decision: dict[str, Any],
) -> dict[str, Any]:
    """Combine Approach 1 (confidence) + Approach 5 (rules).

    Emits ``suggested_fallback="story_beats"`` when critical signals appear
    AND the scene is convertible (stock_background / media_showcase).
    Review path uses it to show a one-click convert button; fast-track
    path auto-applies via StoryBeatsStage.
    """
    signals: list[str] = []
    confidence = float(decision.get("confidence") or 0.0)

    # Approach 1
    if decision.get("used_fallback"):
        signals.append("vlm_fallback")
    elif confidence < VLM_AUDIT_MIN_CONFIDENCE:
        signals.append("low_confidence")

    # Approach 5
    rule_result = _rule_based_audit(scene, decision.get("selected_candidate"))
    signals.extend(rule_result["signals"])

    audit: dict[str, Any] = {
        "passed": len(signals) == 0,
        "signals": signals,
        "confidence": confidence,
        "min_confidence": VLM_AUDIT_MIN_CONFIDENCE,
        "rule_details": rule_result["details"],
    }

    has_critical = bool(_CRITICAL_AUDIT_SIGNALS & set(signals))
    convertible = scene.get("scene_type") in {"stock_background", "media_showcase"}
    if has_critical and convertible:
        audit["suggested_fallback"] = "story_beats"

    return audit


async def rerank_candidates_by_scene(
    scenes: list[dict[str, Any]],
    candidates_by_scene: dict[Any, list[dict[str, Any]]],
    max_candidates: int | None = None,
) -> tuple[list[dict[str, Any]], dict[int, dict[str, Any]]]:
    """Rerank media candidates for each scene and apply selected media to scenes.

    Returns:
        (updated_scenes, decisions_by_scene)
    """
    max_candidates = max_candidates or VLM_RERANK_MAX_CANDIDATES
    candidates_lookup = _normalize_candidates_by_scene(candidates_by_scene)
    semaphore = asyncio.Semaphore(max(1, VLM_RERANK_MAX_CONCURRENCY))

    async def _rerank_scene(scene: dict[str, Any]) -> tuple[int, dict[str, Any], dict[str, Any]]:
        scene_copy = dict(scene)
        scene_index = int(scene_copy.get("scene_index", 0))
        candidates = candidates_lookup.get(scene_index, [])

        if not candidates:
            is_media_scene = scene_copy.get("scene_type") in {"stock_background", "media_showcase"}
            decision = _fallback_decision(
                scene_index,
                "No candidates available for this scene." if is_media_scene else "Non-media scene, skipped.",
                selected_candidate=None,
            )
            if not is_media_scene:
                # Non-media scenes never have candidates — not a reranker failure
                decision["used_fallback"] = False
            elif VLM_AUDIT_ENABLED:
                decision["audit"] = _build_audit(scene_copy, decision)
                if not decision["audit"]["passed"]:
                    logger.warning(
                        "Scene {} audit failed: signals={} confidence={:.2f}",
                        scene_index,
                        decision["audit"]["signals"],
                        decision["audit"]["confidence"],
                    )
                logger.bind(audit_event=True).info(
                    "audit_record scene={} confidence={:.3f} passed={} signals={}",
                    scene_index,
                    decision["audit"]["confidence"],
                    decision["audit"]["passed"],
                    decision["audit"]["signals"],
                )
            scene_copy["media_url"] = None
            scene_copy["media_type"] = None
            scene_copy["poster_url"] = None
            return scene_index, scene_copy, decision

        selected_candidate = candidates[0]
        decision = _fallback_decision(
            scene_index,
            "VLM rerank disabled or unavailable. Using Pexels top-1.",
            selected_candidate=selected_candidate,
        )

        if VLM_RERANK_ENABLED and VLM_RERANK_PROVIDER == "openai":
            try:
                async with semaphore:
                    scored = await _score_scene_with_openai(
                        scene_copy,
                        candidates,
                        max_candidates=max_candidates,
                    )
                selected_candidate = scored.get("selected_candidate") or selected_candidate
                decision = {
                    "scene_index": scene_index,
                    **scored,
                }
            except Exception as e:
                logger.warning(
                    "VLM rerank failed for scene {}: {}. Falling back to top-1.",
                    scene_index,
                    e,
                )
        elif VLM_RERANK_ENABLED and VLM_RERANK_PROVIDER == "qwen":
            try:
                async with semaphore:
                    scored = await _score_scene_with_qwen_vlm(
                        scene_copy,
                        candidates,
                        max_candidates=max_candidates,
                    )
                selected_candidate = scored.get("selected_candidate") or selected_candidate
                decision = {
                    "scene_index": scene_index,
                    **scored,
                }
            except Exception as e:
                logger.warning(
                    "Qwen VLM rerank failed for scene {}: {}. Falling back to top-1.",
                    scene_index,
                    e,
                )

        # ── Audit (Approach 1 + 5) ──
        if VLM_AUDIT_ENABLED:
            decision["audit"] = _build_audit(scene_copy, decision)
            if not decision["audit"]["passed"]:
                logger.warning(
                    "Scene {} audit failed: signals={} confidence={:.2f}",
                    scene_index,
                    decision["audit"]["signals"],
                    decision["audit"]["confidence"],
                )
            logger.bind(audit_event=True).info(
                "audit_record scene={} confidence={:.3f} passed={} signals={}",
                scene_index,
                decision["audit"]["confidence"],
                decision["audit"]["passed"],
                decision["audit"]["signals"],
            )

        media_type = selected_candidate.get("media_type")
        media_url = selected_candidate.get("url")
        scene_copy["media_url"] = media_url
        scene_copy["media_type"] = media_type
        scene_copy["poster_url"] = (
            selected_candidate.get("thumbnail") if media_type == "video" else media_url
        )
        return scene_index, scene_copy, decision

    tasks = [_rerank_scene(scene) for scene in scenes]
    results = await asyncio.gather(*tasks)

    scene_map: dict[int, dict[str, Any]] = {}
    decisions: dict[int, dict[str, Any]] = {}

    for scene_index, updated_scene, decision in results:
        scene_map[scene_index] = updated_scene
        decisions[scene_index] = decision

    updated_scenes: list[dict[str, Any]] = []
    for scene in scenes:
        scene_index = int(scene.get("scene_index", 0))
        updated_scenes.append(scene_map.get(scene_index, scene))

    return updated_scenes, decisions
