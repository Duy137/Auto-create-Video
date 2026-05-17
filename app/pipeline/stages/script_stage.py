"""ScriptStage — composite stage that generates video scripts from a topic.

Sub-agents (all run sequentially):
  1. ResearcherSubAgent  — summarise reference_text / fetch URLs (optional)
  2. OutlineSubAgent     — 4-7 key points + time ratios
  3. DrafterSubAgent     — full narration per outline point
  4. RefinerSubAgent     — tighten hook, CTA, word count
  5. VariantGeneratorSubAgent — n > 1 variants (optional)
"""
from __future__ import annotations

import asyncio
import json
import re
from urllib.parse import urlparse, parse_qs

from loguru import logger

from app.state import AgentState, ResearchNote, ScriptVariant, TokenUsage, calc_cost
from app.pipeline.stages.base import BaseStage
from app.progress import emit_progress

# Words-per-second for Vietnamese narration (OpenAI TTS measured rate)
_WORDS_PER_SECOND_VI = 3.3


def _llm_client():
    """Return an OpenAI-compatible client based on config."""
    from config import OPENAI_API_KEY, QWEN_API_KEY, QWEN_BASE_URL, SCRIPT_AGENT_PROVIDER
    import openai

    if SCRIPT_AGENT_PROVIDER == "qwen" and QWEN_API_KEY:
        return openai.AsyncOpenAI(api_key=QWEN_API_KEY, base_url=QWEN_BASE_URL)
    return openai.AsyncOpenAI(api_key=OPENAI_API_KEY)


def _script_model() -> str:
    from config import SCRIPT_AGENT_OPENAI_MODEL, SCRIPT_AGENT_PROVIDER, SCRIPT_AGENT_QWEN_MODEL

    if SCRIPT_AGENT_PROVIDER == "qwen":
        return SCRIPT_AGENT_QWEN_MODEL or "qwen-plus"
    return SCRIPT_AGENT_OPENAI_MODEL or "gpt-4o-mini"


def _extract_token_usage(response, step: str) -> TokenUsage:
    """Extract token usage from an OpenAI-compatible chat completion response."""
    model = _script_model()
    input_tokens = getattr(response.usage, "prompt_tokens", 0) if response.usage else 0
    output_tokens = getattr(response.usage, "completion_tokens", 0) if response.usage else 0
    return TokenUsage(
        model=model,
        step=step,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=calc_cost(model, input_tokens, output_tokens),
    )


# ── Sub-agents ────────────────────────────────────────────────────────────────

def _extract_youtube_id(url: str) -> str | None:
    """Return the video ID from a YouTube URL, or None if not a YouTube URL."""
    parsed = urlparse(url)
    if parsed.hostname in ("www.youtube.com", "youtube.com", "m.youtube.com"):
        if parsed.path == "/watch":
            return parse_qs(parsed.query).get("v", [None])[0]
        if parsed.path.startswith("/shorts/"):
            return parsed.path.split("/")[2]
    if parsed.hostname == "youtu.be":
        return parsed.path.lstrip("/").split("?")[0] or None
    return None


async def _fetch_youtube_transcript(video_id: str) -> str | None:
    """Fetch YouTube transcript (runs sync library in thread pool). Returns None on failure."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled

        def _get():
            try:
                segments = YouTubeTranscriptApi.get_transcript(video_id, languages=["vi", "en"])
            except NoTranscriptFound:
                # Fallback: grab whatever language is available
                transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                segments = next(iter(transcript_list)).fetch()
            return " ".join(s["text"] for s in segments)

        return await asyncio.get_event_loop().run_in_executor(None, _get)
    except Exception as e:
        logger.warning("  [Researcher] Cannot fetch YouTube transcript {}: {}", video_id, e)
        return None


async def _researcher(req) -> tuple[list[ResearchNote], list[TokenUsage]]:
    """Summarise reference_text or return empty list."""
    if not req.reference_text and not req.reference_urls:
        return [], []

    content_parts = []
    if req.reference_text:
        content_parts.append(f"Nội dung tham khảo:\n{req.reference_text[:3000]}")

    if req.reference_urls:
        import httpx
        for url in req.reference_urls[:3]:
            video_id = _extract_youtube_id(url)
            if video_id:
                transcript = await _fetch_youtube_transcript(video_id)
                if transcript:
                    # Truncate to first ~5000 chars (~first 10-15 mins of content)
                    content_parts.append(f"YouTube transcript ({url}):\n{transcript[:5000]}")
                else:
                    logger.warning("  [Researcher] No transcript available for YouTube video: {}", url)
            else:
                try:
                    async with httpx.AsyncClient(timeout=8) as client:
                        r = await client.get(url, follow_redirects=True)
                        text = re.sub(r"<[^>]+>", " ", r.text)
                        text = re.sub(r"\s+", " ", text).strip()
                        content_parts.append(f"URL {url}:\n{text[:2000]}")
                except Exception as e:
                    logger.warning("  [Researcher] Cannot fetch {}: {}", url, e)

    if not content_parts:
        return [], []

    client = _llm_client()
    response = await client.chat.completions.create(
        model=_script_model(),
        messages=[{
            "role": "user",
            "content": (
                f"Tóm tắt các nguồn tham khảo sau cho video về '{req.topic}'. "
                "Trả về JSON: [{\"source\": \"...\", \"summary\": \"...\", \"url\": null}]\n\n"
                + "\n\n".join(content_parts)
            ),
        }],
        temperature=0.3,
        max_tokens=800,
        response_format={"type": "json_object"},
    )
    usage = _extract_token_usage(response, "script_agent.researcher")
    raw = response.choices[0].message.content or "[]"
    try:
        data = json.loads(raw)
        notes_list = data if isinstance(data, list) else data.get("notes", data.get("items", [data]))
        return [ResearchNote(**n) for n in notes_list[:5]], [usage]
    except Exception:
        return [], [usage]


async def _outline(req, research_notes: list[ResearchNote]) -> tuple[list[dict], TokenUsage]:
    """Generate 4-7 outline points with time ratios."""
    research_ctx = ""
    if research_notes:
        research_ctx = "\n\nNguồn tham khảo:\n" + "\n".join(
            f"- {n.summary}" for n in research_notes
        )

    must_include = ""
    if req.must_include:
        must_include = "\nBắt buộc đề cập: " + ", ".join(req.must_include)

    client = _llm_client()
    response = await client.chat.completions.create(
        model=_script_model(),
        messages=[{
            "role": "user",
            "content": (
                f"Tạo outline 4-7 ý chính cho video {req.format} về '{req.topic}'.\n"
                f"Đối tượng: {req.audience}. Tone: {req.tone}. Thời lượng: {req.duration_seconds}s.\n"
                f"Ngôn ngữ: {'Tiếng Việt' if req.language == 'vi' else req.language}."
                f"{must_include}{research_ctx}\n\n"
                "Trả về JSON: {\"outline\": [{\"title\": \"...\", \"key_point\": \"...\", \"time_ratio\": 0.15}]}\n"
                "time_ratio là tỉ lệ thời gian (tổng = 1.0). Ý đầu là hook (5-10s), ý cuối là CTA."
            ),
        }],
        temperature=0.7,
        max_tokens=600,
        response_format={"type": "json_object"},
    )
    usage = _extract_token_usage(response, "script_agent.outliner")
    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)
    return data.get("outline", []), usage


async def _drafter(req, outline: list[dict]) -> tuple[dict, TokenUsage]:
    """Write full narration for each outline point, return hook/body/cta."""
    target_words = int(req.duration_seconds * _WORDS_PER_SECOND_VI)

    outline_text = "\n".join(
        f"{i+1}. {item.get('title','')}: {item.get('key_point','')}"
        for i, item in enumerate(outline)
    )

    client = _llm_client()
    response = await client.chat.completions.create(
        model=_script_model(),
        messages=[{
            "role": "user",
            "content": (
                f"Viết kịch bản đầy đủ cho video '{req.topic}'.\n"
                f"Tone: {req.tone}. Đối tượng: {req.audience}. Format: {req.format}.\n"
                f"Mục tiêu: ~{target_words} từ ({req.duration_seconds}s).\n"
                f"Ngôn ngữ: {'Tiếng Việt' if req.language == 'vi' else req.language}.\n\n"
                f"Outline:\n{outline_text}\n\n"
                "Trả về JSON:\n"
                "{\n"
                '  "title": "Tiêu đề video gợi ý",\n'
                '  "hook": "5-10s mở đầu hấp dẫn",\n'
                '  "body": "Nội dung chính (dùng // để chia scene)",\n'
                '  "cta": "Call-to-action cuối video",\n'
                '  "hashtags": ["#tag1", "#tag2"]\n'
                "}"
            ),
        }],
        temperature=0.8,
        max_tokens=1500,
        response_format={"type": "json_object"},
    )
    usage = _extract_token_usage(response, "script_agent.drafter")
    raw = response.choices[0].message.content or "{}"
    return json.loads(raw), usage


async def _refiner(req, draft: dict) -> tuple[ScriptVariant, TokenUsage]:
    """Tighten the draft: remove repetition, ensure hook in 5s, count words."""
    full = f"{draft.get('hook','')} {draft.get('body','')} {draft.get('cta','')}".strip()
    target_words = int(req.duration_seconds * _WORDS_PER_SECOND_VI)

    client = _llm_client()
    response = await client.chat.completions.create(
        model=_script_model(),
        messages=[{
            "role": "user",
            "content": (
                f"Tinh chỉnh kịch bản sau cho video '{req.topic}'.\n"
                f"Yêu cầu: ~{target_words} từ, hook rõ ràng trong 5 giây đầu, CTA mạnh.\n"
                f"Bỏ lặp từ, đảm bảo tự nhiên.\n\n"
                f"Kịch bản hiện tại:\n{full}\n\n"
                "Trả về JSON giống input nhưng đã tinh chỉnh:\n"
                '{"title": "...", "hook": "...", "body": "...", "cta": "...", "hashtags": [...]}'
            ),
        }],
        temperature=0.4,
        max_tokens=1500,
        response_format={"type": "json_object"},
    )
    usage = _extract_token_usage(response, "script_agent.refiner")
    raw = response.choices[0].message.content or "{}"
    refined = json.loads(raw)

    # Merge with original draft for any missing keys
    for k in ("title", "hook", "body", "cta", "hashtags"):
        refined.setdefault(k, draft.get(k, ""))

    title = refined.get("title") or req.topic
    hook = refined.get("hook", "")
    body = refined.get("body", "")
    cta = refined.get("cta", "")
    full_script = f"{hook} {body} {cta}".strip()
    word_count = len(full_script.split())
    estimated_duration = round(word_count / _WORDS_PER_SECOND_VI, 1)

    return ScriptVariant(
        title=title,
        hook=hook,
        body=body,
        cta=cta,
        full_script=full_script,
        estimated_duration=estimated_duration,
        hashtags=refined.get("hashtags", []),
    ), usage


async def _variant_generator(req, base_variant: ScriptVariant, n: int) -> tuple[list[ScriptVariant], list[TokenUsage]]:
    """Generate n-1 additional variants with different hooks/CTAs."""
    if n <= 1:
        return [base_variant], []

    client = _llm_client()
    variants = [base_variant]
    usages: list[TokenUsage] = []
    for i in range(n - 1):
        response = await client.chat.completions.create(
            model=_script_model(),
            messages=[{
                "role": "user",
                "content": (
                    f"Dựa trên kịch bản sau, tạo phiên bản #{i+2} với hook và CTA khác:\n\n"
                    f"Hook gốc: {base_variant.hook}\n"
                    f"Body: {base_variant.body}\n"
                    f"CTA gốc: {base_variant.cta}\n\n"
                    "Giữ nguyên body, chỉ đổi hook + CTA. Trả JSON:\n"
                    '{"title": "...", "hook": "...", "body": "...", "cta": "...", "hashtags": [...]}'
                ),
            }],
            temperature=1,
            max_tokens=1200,
            response_format={"type": "json_object"},
        )
        usages.append(_extract_token_usage(response, f"script_agent.variant_{i+2}"))
        raw = response.choices[0].message.content or "{}"
        v = json.loads(raw)
        title = v.get("title") or base_variant.title
        hook = v.get("hook") or base_variant.hook
        body = v.get("body") or base_variant.body
        cta = v.get("cta") or base_variant.cta
        full_script = f"{hook} {body} {cta}".strip()
        variants.append(ScriptVariant(
            title=title,
            hook=hook,
            body=body,
            cta=cta,
            full_script=full_script,
            estimated_duration=round(len(full_script.split()) / _WORDS_PER_SECOND_VI, 1),
            hashtags=v.get("hashtags", base_variant.hashtags),
        ))
    return variants, usages


# ── Main ScriptStage ──────────────────────────────────────────────────────────

class ScriptStage(BaseStage):
    name = "script_agent"

    async def run(self, state: AgentState) -> AgentState:
        req = state.script_request
        if not req:
            raise ValueError("ScriptStage requires script_request in state")

        logger.info("  [ScriptAgent] topic='{}', duration={}s, variants={}",
                    req.topic, req.duration_seconds, req.n_variants)

        all_usages: list[TokenUsage] = []

        await emit_progress({
            "phase": "script_agent",
            "step_key": "analyze_topic",
            "message": "Đang phân tích chủ đề...",
            "tool_name": "Script Planner",
        })
        await emit_progress({
            "phase": "script_agent",
            "step_key": "analyze_topic",
            "mark_done": True,
            "intermediate_result": f"Chủ đề: {req.topic[:80]}",
        })

        # 1. Research (optional)
        await emit_progress({
            "phase": "script_agent",
            "step_key": "research",
            "message": "Đang thu thập tài liệu tham khảo...",
            "tool_name": "Research Agent",
        })
        research_notes, research_usages = await _researcher(req)
        all_usages.extend(research_usages)
        logger.info("  [Researcher] {} notes", len(research_notes))
        await emit_progress({
            "phase": "script_agent",
            "step_key": "research",
            "mark_done": True,
            "intermediate_result": f"Tổng hợp {len(research_notes)} nguồn tham khảo.",
        })

        # 2. Outline
        await emit_progress({
            "phase": "script_agent",
            "step_key": "outline",
            "message": "Đang lập dàn ý...",
            "tool_name": "Outline Agent",
        })
        outline, outline_usage = await _outline(req, research_notes)
        all_usages.append(outline_usage)
        logger.info("  [Outline] {} points", len(outline))
        await emit_progress({
            "phase": "script_agent",
            "step_key": "outline",
            "mark_done": True,
            "intermediate_result": f"Dàn ý gồm {len(outline)} ý chính.",
        })

        # 3. Draft
        await emit_progress({
            "phase": "script_agent",
            "step_key": "draft",
            "message": "Đang viết bản nháp...",
            "tool_name": "Draft Writer",
        })
        draft, draft_usage = await _drafter(req, outline)
        all_usages.append(draft_usage)
        await emit_progress({
            "phase": "script_agent",
            "step_key": "draft",
            "mark_done": True,
            "intermediate_result": "Đã tạo bản nháp theo dàn ý.",
        })

        # 4. Refine
        await emit_progress({
            "phase": "script_agent",
            "step_key": "refine",
            "message": "Đang tinh chỉnh hook, body và CTA...",
            "tool_name": "Refiner",
        })
        base_variant, refiner_usage = await _refiner(req, draft)
        all_usages.append(refiner_usage)
        logger.info("  [Refiner] ~{}s estimated", base_variant.estimated_duration)
        await emit_progress({
            "phase": "script_agent",
            "step_key": "refine",
            "mark_done": True,
            "intermediate_result": f"Ước lượng thời lượng: {base_variant.estimated_duration:.1f}s.",
        })

        # 5. Variants (if n > 1)
        await emit_progress({
            "phase": "script_agent",
            "step_key": "variants",
            "message": "Đang tạo các phiên bản kịch bản...",
            "tool_name": "Variant Generator",
        })
        variants, variant_usages = await _variant_generator(req, base_variant, req.n_variants)
        all_usages.extend(variant_usages)
        logger.info("  [ScriptAgent] Generated {} variant(s)", len(variants))
        await emit_progress({
            "phase": "script_agent",
            "step_key": "variants",
            "mark_done": True,
            "intermediate_result": f"Đã tạo {len(variants)} phiên bản kịch bản.",
        })

        # Record all token usages into state
        valid_usages = [u for u in all_usages if u is not None]
        for u in valid_usages:
            state.record_token_usage(u)

        total_in = sum(u.input_tokens for u in valid_usages)
        total_out = sum(u.output_tokens for u in valid_usages)
        total_cost = sum(u.cost_usd for u in valid_usages)
        logger.info("  [ScriptAgent] Tokens: in={}, out={}, cost=${:.6f}", total_in, total_out, total_cost)

        await emit_progress({
            "phase": "script_agent",
            "step_key": "ready",
            "message": "Kịch bản đã sẵn sàng để bạn chọn.",
            "tool_name": "Script Agent",
            "mark_done": True,
            "intermediate_result": f"Hoàn tất với {len(variants)} phiên bản.",
            "status": "done",
        })

        # Auto-select first variant as chosen_script unless human checkpoint requested
        auto_chosen = variants[0].full_script if variants else None

        return state.model_copy(update={
            "generated_scripts": variants,
            "chosen_script": auto_chosen,
        })
