"""QCStage: lightweight judge that scores stage outputs.

The deterministic runner stores these scores in state.qc_scores and decides
whether to retry, fall back, or continue.
"""
from __future__ import annotations

import json
from typing import Any
from typing import Literal

from loguru import logger

from app.state import AgentState
from app.pipeline.stages.base import BaseStage

QC_THRESHOLD_CONTENT = 0.8   # deterministic chain retries content below this
QC_THRESHOLD_MEDIA = 0.9     # deterministic chain may trigger media fallback below this

TTS_WPS = 2.5          # words/second, Vietnamese TV pace
SCENE_MIN_SECONDS = 3.5
SCENE_MIN_WORDS = round(SCENE_MIN_SECONDS * TTS_WPS)  # = 9 words

VALID_SCENE_TYPES = frozenset({
    "stock_background", "info_card", "emoji_grid", "stats_highlight",
    "comparison", "timeline", "media_showcase", "title_card", "diagram", "story_beats", "cryptovn101_news",
})

Stage = Literal["content", "media", "render"]


def _cheap_model() -> str:
    """Use Haiku if available, else fall back to content parser model."""
    from config import CONTENT_PARSER_PROVIDER, CONTENT_PARSER_MODEL, QWEN_API_KEY
    if CONTENT_PARSER_PROVIDER == "qwen" and QWEN_API_KEY:
        return "qwen-turbo"
    return "gpt-4o-mini"


def _llm_client():
    from config import OPENAI_API_KEY, QWEN_API_KEY, QWEN_BASE_URL, CONTENT_PARSER_PROVIDER
    import openai
    if CONTENT_PARSER_PROVIDER == "qwen" and QWEN_API_KEY:
        return openai.AsyncOpenAI(api_key=QWEN_API_KEY, base_url=QWEN_BASE_URL)
    return openai.AsyncOpenAI(api_key=OPENAI_API_KEY)


def _deterministic_score_content(scenes: list[dict]) -> tuple[float, list[str]]:
    """Pure-Python structural checks — no LLM needed."""
    if not scenes:
        return 0.0, ["no scenes"]

    issues: list[str] = []
    warnings: list[str] = []

    invalid_count = 0
    for s in scenes:
        words = len(s.get("narration", "").split())
        idx = s.get("scene_index", "?")
        if words < SCENE_MIN_WORDS:
            warnings.append(f"scene {idx}: short ({words} words, <{SCENE_MIN_SECONDS}s) — timing will add visual hold")

    # Hook presence
    structure_score = 1.0
    if scenes[0].get("purpose") != "hook":
        issues.append("first scene missing purpose=hook")
        structure_score = 0.6

    # Invalid scene_type
    for s in scenes:
        st = s.get("scene_type")
        if st not in VALID_SCENE_TYPES:
            issues.append(f"scene {s.get('scene_index', '?')}: invalid scene_type={st!r}")
            invalid_count += 1

    # Missing visual_description
    for s in scenes:
        if not s.get("visual_description", "").strip():
            issues.append(f"scene {s.get('scene_index', '?')}: empty visual_description")
            invalid_count += 1

    structural_score = max(0.0, 1.0 - (invalid_count / len(scenes)))

    return round(min(structure_score, structural_score), 2), issues


async def _score_content(scenes: list[dict]) -> tuple[float, str, list[str]]:
    """Judge whether scenes are well-split and non-repetitive."""
    det_score, issues = _deterministic_score_content(scenes)

    if det_score < QC_THRESHOLD_CONTENT:
        reason = "; ".join(issues[:5])
        if len(issues) > 5:
            reason += f" (+{len(issues) - 5} more)"
        return det_score, reason, issues

    # Deterministic passed — run LLM for coherence/logic check
    sample = [
        {
            "index": s.get("scene_index"),
            "type": s.get("scene_type"),
            "purpose": s.get("purpose"),
            "words": len(s.get("narration", "").split()),
            "narration": s.get("narration", "")[:200],
        }
        for s in scenes
    ]
    client = _llm_client()
    resp = await client.chat.completions.create(
        model=_cheap_model(),
        messages=[{
            "role": "user",
            "content": (
                "Đánh giá chất lượng kịch bản video bên dưới (0.0-1.0).\n"
                "Tiêu chí:\n"
                "- Nội dung mạch lạc, không lặp ý giữa các scene\n"
                "- Có hook rõ ràng ở scene đầu\n"
                "- Kết thúc có CTA hoặc kết luận\n"
                "- Scene_type phù hợp với nội dung narration\n"
                "Không đánh giá độ dài (đã kiểm tra riêng).\n"
                f"Scenes:\n{json.dumps(sample, ensure_ascii=False)}\n\n"
                'Trả về JSON: {"score": 0.85, "reason": "..."}'
            ),
        }],
        temperature=0.1,
        max_tokens=200,
        response_format={"type": "json_object"},
    )
    raw = resp.choices[0].message.content or '{"score": 0.5, "reason": "no response"}'
    data = json.loads(raw)
    llm_score = float(data.get("score", 0.5))
    llm_reason = data.get("reason", "")

    final_score = round(min(det_score, llm_score), 2)
    det_summary = ("; ".join(issues[:2]) + " ") if issues else ""
    reason = f"{det_summary}{llm_reason}"
    reasons = [*issues]
    if llm_reason:
        reasons.append(llm_reason)
    return final_score, reason, reasons


def _audit_signals(rerank_decisions: dict[int, dict[str, Any]] | None) -> list[str]:
    if not rerank_decisions:
        return []

    signals: list[str] = []
    for decision in rerank_decisions.values():
        if not isinstance(decision, dict):
            continue
        audit = decision.get("audit")
        if isinstance(audit, dict):
            signals.extend(str(s) for s in (audit.get("signals") or []))
        elif isinstance(audit, str):
            signals.append(audit)
    return signals


async def _score_media(
    scenes: list[dict],
    rerank_decisions: dict[int, dict[str, Any]] | None = None,
) -> tuple[float, str, list[str]]:
    """Judge whether media URLs match scene narrations."""
    sample = [
        {
            "narration": s.get("narration", "")[:100],
            "visual": s.get("visual_description", "")[:80],
            "has_media": bool(s.get("media_url")),
        }
        for s in scenes[:8]
        if s.get("scene_type") in ("stock_background", "media_showcase")
    ]
    if not sample:
        return 1.0, "no media scenes to evaluate", ["no media scenes to evaluate"]

    coverage = sum(1 for s in sample if s["has_media"]) / len(sample)
    base_score = coverage if coverage < 0.5 else min(1.0, coverage + 0.1)

    audit_flags = {"aspect_mismatch", "low_confidence", "keyword_no_overlap"}
    bad_signals = [s for s in _audit_signals(rerank_decisions) if s in audit_flags]
    penalty = min(0.3, len(bad_signals) * 0.05)
    final_score = max(0.0, base_score - penalty)

    reason = f"{int(coverage*100)}% media coverage, audit_penalty={penalty:.2f}"
    if coverage < 0.5:
        reason = f"only {int(coverage*100)}% scenes have media, audit_penalty={penalty:.2f}"
    reasons = [reason]
    if bad_signals:
        reasons.append("audit signals: " + ", ".join(bad_signals[:8]))

    return round(final_score, 2), reason, reasons


class QCStage(BaseStage):
    name = "qc"

    def __init__(self, stage: Stage = "content") -> None:
        self.stage = stage

    async def run(self, state: AgentState) -> AgentState:
        if self.stage == "content":
            if not state.scenes:
                return state
            score, reason, reasons = await _score_content(state.scenes)
        elif self.stage == "media":
            if not state.scenes:
                return state
            score, reason, reasons = await _score_media(state.scenes, state.rerank_decisions)
        else:
            score, reason = 1.0, "stage not evaluated"
            reasons = [reason]

        key = f"{self.stage}_qc"
        logger.info("  [QC] stage={} score={:.2f} reason={}", self.stage, score, reason)

        new_scores = dict(state.qc_scores)
        new_scores[key] = score
        new_reasons = dict(state.qc_reasons)
        new_reasons[key] = reasons
        return state.model_copy(update={
            "qc_scores": new_scores,
            "qc_reasons": new_reasons,
        })
