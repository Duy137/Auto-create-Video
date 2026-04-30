"""VLM media reranker for review-time candidate selection.

This module scores top-k image/video candidates for each scene using
OpenAI vision and selects the best-fit media for render quality.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from loguru import logger
from openai import AsyncOpenAI

from config import (
    OPENAI_API_KEY,
    QWEN_API_KEY,
    QWEN_RERANK_URL,
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


async def _score_scene_with_openai(
    scene: dict[str, Any],
    candidates: list[dict[str, Any]],
    max_candidates: int,
) -> dict[str, Any]:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required for VLM reranking")

    from app.nodes._openai_client import get_openai_client

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
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": preview, "detail": "low"},
                }
            )

    client = get_openai_client()
    timeout_seconds = max(5.0, VLM_RERANK_TIMEOUT_SECONDS)

    base_payload: dict[str, Any] = {
        "model": VLM_RERANK_MODEL,
        "messages": [
            {
                "role": "user",
                "content": content,
            }
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }

    # Prefer max_completion_tokens first (newer API style), then fallback to max_tokens
    # when either the SDK or the target model rejects it.
    token_variants: list[dict[str, Any]] = [
        {"max_completion_tokens": 800},
        {"max_tokens": 800},
    ]

    last_error: Exception | None = None
    response = None
    for token_payload in token_variants:
        try:
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    **base_payload,
                    **token_payload,
                ),
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

    return {
        "selected_index": selected_index,
        "selected_candidate": considered[selected_index],
        "confidence": max(0.0, min(1.0, confidence)),
        "reason": str(parsed.get("reason", ""))[:300],
        "scores": parsed.get("scores", []),
        "used_fallback": False,
    }


async def _score_scene_with_qwen(
    scene: dict[str, Any],
    candidates: list[dict[str, Any]],
    max_candidates: int,
) -> dict[str, Any]:
    """Score scene candidates using DashScope Rerank API (qwen3-rerank or qwen3-vl-rerank)."""
    if not QWEN_API_KEY:
        raise RuntimeError("QWEN_API_KEY is required for Qwen VLM reranking")

    import httpx

    considered = candidates[: max(1, max_candidates)]

    # Build query text from scene context
    parts = [
        scene.get("narration", "")[:400],
        scene.get("visual_description", ""),
        scene.get("semantic_summary_en", ""),
        scene.get("semantic_image_query") or scene.get("image_query") or "",
        scene.get("semantic_video_query") or scene.get("video_query") or "",
    ]
    query_text = " | ".join(p for p in parts if p)[:1000]

    # qwen3-vl-rerank supports image/video docs; qwen3-rerank is text-only
    _is_vl_model = "vl" in VLM_RERANK_MODEL.lower()

    documents: list[Any] = []
    for candidate in considered:
        if _is_vl_model:
            preview = _preview_url(candidate)
            if preview:
                documents.append({"image": preview})
                continue
        # text document: encode rich metadata so the ranker can score semantically
        media_type = candidate.get("media_type", "unknown")
        source_query = candidate.get("source_query") or candidate.get("image_query") or candidate.get("video_query") or ""
        tags = " ".join(candidate.get("tags", []) or [])
        meta = (
            f"type:{media_type} query:{source_query} "
            f"w:{candidate.get('width', '')} h:{candidate.get('height', '')} "
            f"dur:{candidate.get('duration', '')} tags:{tags}"
        ).strip()
        if _is_vl_model:
            documents.append({"text": meta})
        else:
            # qwen3-rerank expects plain string documents in compatible API mode.
            documents.append(meta)

    # qwen3-rerank expects query as a plain string; qwen3-vl-rerank accepts {"text": ...}
    query_field: Any = {"text": query_text} if _is_vl_model else query_text

    payload: dict[str, Any] = {
        "model": VLM_RERANK_MODEL,
        "query": query_field,
        "documents": documents,
        "top_n": len(documents),
        "instruct": "Select the most visually relevant stock media for this short-video scene.",
    }
    if _is_vl_model:
        payload["return_documents"] = False

    headers = {
        "Authorization": f"Bearer {QWEN_API_KEY}",
        "Content-Type": "application/json",
    }
    timeout_seconds = max(5.0, VLM_RERANK_TIMEOUT_SECONDS)

    async with httpx.AsyncClient(timeout=timeout_seconds) as http_client:
        resp = await http_client.post(QWEN_RERANK_URL, headers=headers, json=payload)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            body = e.response.text[:800]
            raise RuntimeError(f"DashScope rerank HTTP {e.response.status_code}: {body}") from e
        data = resp.json()

    results = data.get("results") or data.get("output", {}).get("results", []) or []
    if not results:
        body = json.dumps(data, ensure_ascii=False)[:800]
        raise RuntimeError(f"Qwen Rerank API returned empty results: {body}")

    # results are sorted by relevance_score descending; pick the top one
    best = results[0]
    selected_index = int(best.get("index", 0))
    if selected_index < 0 or selected_index >= len(considered):
        selected_index = 0

    relevance_score = float(best.get("relevance_score", 0.0))
    scores = [
        {"index": r.get("index"), "score": r.get("relevance_score"), "note": ""}
        for r in results
    ]

    return {
        "selected_index": selected_index,
        "selected_candidate": considered[selected_index],
        "confidence": max(0.0, min(1.0, relevance_score)),
        "reason": f"{VLM_RERANK_MODEL} score={relevance_score:.3f}",
        "scores": scores,
        "used_fallback": False,
    }


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
            decision = _fallback_decision(
                scene_index,
                "No candidates available for this scene.",
                selected_candidate=None,
            )
            scene_copy["media_url"] = None
            scene_copy["media_type"] = None
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
                    scored = await _score_scene_with_qwen(
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

        scene_copy["media_url"] = selected_candidate.get("url")
        scene_copy["media_type"] = selected_candidate.get("media_type")
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
