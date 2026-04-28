"""Media Searcher — Pexels video + image search.

Input:  Search query string (image_query or video_query).
Output: Dict with media info {type, url, width, height, ...} or empty dict.

Priority: video → image fallback → empty dict.
API: Pexels (free, 200 req/hr, same key for video + image).

See MASTER_PLAN section "Component 2B — Media Searcher" for full spec.
"""

from __future__ import annotations

from dataclasses import dataclass
import random
import re
from typing import Any

import httpx
from loguru import logger

from config import (
    PEXELS_API_KEY,
    SEMANTIC_QUERY_ENABLED,
    SEMANTIC_QUERY_MAX_WORDS,
    SEMANTIC_LLM_QUERY_ENABLED,
    VLM_RERANK_MAX_CANDIDATES,
)

# ── Pexels API endpoints ──
PEXELS_VIDEO_URL = "https://api.pexels.com/videos/search"
PEXELS_IMAGE_URL = "https://api.pexels.com/v1/search"

# Default search params
DEFAULT_ORIENTATION = "portrait"  # 9:16 vertical video
DEFAULT_PER_PAGE = 5
DEFAULT_TIMEOUT = 10  # seconds


class MediaSearchError(Exception):
    """Raised when media search fails."""
    pass


@dataclass
class MediaCandidate:
    """Candidate media item for optional VLM reranking."""

    media_type: str
    url: str
    width: int
    height: int
    duration: float | int | None = None
    thumbnail: str | None = None
    photographer: str | None = None
    pexels_id: int | None = None
    source_query: str | None = None
    source_rank: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "media_type": self.media_type,
            "url": self.url,
            "width": self.width,
            "height": self.height,
            "duration": self.duration,
            "thumbnail": self.thumbnail,
            "photographer": self.photographer,
            "pexels_id": self.pexels_id,
            "source_query": self.source_query,
            "source_rank": self.source_rank,
        }


_SEMANTIC_STOPWORDS = {
    "a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "with",
    "at", "from", "by", "as", "is", "are", "was", "were", "be", "been", "being",
    "this", "that", "these", "those", "it", "its", "into", "over", "under", "across",
    "during", "through", "about", "around", "inside", "outside", "while", "where", "when",
}
_SEMANTIC_LOCATION_PREPOSITIONS = {
    "in", "on", "at", "inside", "outside", "under", "over", "across", "through", "near",
    "within", "into", "behind", "beside",
}
_SEMANTIC_STYLE_TERMS = {
    "cinematic", "dramatic", "moody", "stylish", "minimal", "modern", "neon", "futuristic",
    "vibrant", "soft", "warm", "dark", "bright", "high-tech", "sleek",
}
_SEMANTIC_ACTION_TERMS = {
    "manage", "managing", "monitor", "monitoring", "walk", "walking", "run", "running",
    "stand", "standing", "sit", "sitting", "look", "looking", "watch", "watching",
    "hold", "holding", "show", "showing", "move", "moving",
}


def _tokenize_query_text(text: str | None) -> list[str]:
    """Tokenize free-form text into lowercase query terms."""
    if not text:
        return []
    return re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)?", text.lower())


def _collect_semantic_terms(
    tokens: list[str],
    blocked_tokens: set[str] | None = None,
    *,
    include_style_terms: bool = False,
    include_action_terms: bool = False,
) -> list[str]:
    """Collect deduplicated semantic terms while filtering noisy modifiers."""
    blocked = {token.lower() for token in blocked_tokens or set()}
    selected: list[str] = []
    seen = set(blocked)

    for token in tokens:
        key = token.lower()
        if key in seen:
            continue
        if key in _SEMANTIC_STOPWORDS:
            continue
        if len(key) <= 2 and not key.isdigit():
            continue
        if key in _SEMANTIC_STYLE_TERMS and not include_style_terms:
            continue
        if key in _SEMANTIC_ACTION_TERMS and not include_action_terms:
            continue

        seen.add(key)
        selected.append(token)

    return selected


def _split_summary_context(tokens: list[str]) -> tuple[list[str], list[str]]:
    """Split summary into leading subject/action terms and trailing scene terms."""
    for idx, token in enumerate(tokens):
        if token in _SEMANTIC_LOCATION_PREPOSITIONS:
            return tokens[:idx], tokens[idx + 1 :]
    return tokens, []


def _semantic_setting_from_summary(summary: str | None, base_query: str | None = None) -> str:
    """Extract a concise setting phrase from the location part of the summary."""
    if not summary or not SEMANTIC_QUERY_ENABLED:
        return ""

    tokens = _tokenize_query_text(summary)
    _, tail_tokens = _split_summary_context(tokens)
    if not tail_tokens:
        return ""

    blocked_tokens = set(_tokenize_query_text(base_query))
    setting_tokens = _collect_semantic_terms(tail_tokens, blocked_tokens)
    if not setting_tokens:
        return ""

    max_terms = min(3, max(1, SEMANTIC_QUERY_MAX_WORDS - 1))
    return " ".join(setting_tokens[-max_terms:])


def _semantic_anchor_from_summary(summary: str | None, base_query: str | None = None) -> str:
    """Extract a balanced semantic anchor using subject/object plus scene context."""
    if not summary or not SEMANTIC_QUERY_ENABLED:
        return ""

    tokens = _tokenize_query_text(summary)
    if not tokens:
        return ""

    blocked_tokens = set(_tokenize_query_text(base_query))
    lead_tokens, tail_tokens = _split_summary_context(tokens)
    lead_terms = _collect_semantic_terms(lead_tokens, blocked_tokens)
    tail_terms = _collect_semantic_terms(tail_tokens, blocked_tokens)
    max_terms = max(1, SEMANTIC_QUERY_MAX_WORDS)

    selected: list[str] = []
    if tail_terms:
        tail_budget = min(len(tail_terms), max(1, max_terms - 1))
        selected.extend(tail_terms[-tail_budget:])

        remaining = max_terms - len(selected)
        if lead_terms and remaining > 0:
            if remaining == 1:
                selected = lead_terms[:1] + selected
            else:
                selected = lead_terms[-remaining:] + selected
    elif lead_terms:
        if max_terms == 1:
            selected = lead_terms[:1]
        else:
            selected = _merge_terms(
                " ".join(lead_terms[:1]),
                " ".join(lead_terms[-(max_terms - 1):]),
                max_terms=max_terms,
            ).split()

    if len(selected) < max_terms:
        supplemental = _collect_semantic_terms(
            tokens,
            blocked_tokens,
            include_style_terms=True,
            include_action_terms=False,
        )
        selected = _merge_terms(
            " ".join(selected),
            " ".join(supplemental),
            max_terms=max_terms,
        ).split()

    return " ".join(selected)


def _merge_terms(*parts: str, max_terms: int = 10) -> str:
    """Merge query parts with stable order and deduplication."""
    merged: list[str] = []
    seen: set[str] = set()

    for part in parts:
        for token in part.split():
            cleaned = token.strip()
            if not cleaned:
                continue
            key = cleaned.lower()
            if key in seen:
                continue
            seen.add(key)
            merged.append(cleaned)
            if len(merged) >= max_terms:
                return " ".join(merged)

    return " ".join(merged)


def _build_query_variants(
    base_query: str,
    semantic_summary_en: str | None,
    semantic_llm_query: str | None = None,
) -> list[str]:
    """Build query variants with LLM semantic query prioritised, then deterministic enrichments.

    Priority order:
    1. LLM-generated semantic query (from Enricher, stock-tag-optimized)
    2. Deterministic anchor merged with base (from semantic_summary_en)
    3. Original base query (fallback)
    """
    base = (base_query or "").strip()
    if not base:
        return []

    variants: list[str] = []

    # Priority 1: LLM-generated semantic query
    if SEMANTIC_LLM_QUERY_ENABLED and semantic_llm_query:
        llm_q = semantic_llm_query.strip()
        if llm_q and llm_q not in variants:
            variants.append(llm_q)

    # Priority 2 & 3: deterministic anchor + base (existing logic)
    if SEMANTIC_QUERY_ENABLED:
        setting = _semantic_setting_from_summary(semantic_summary_en, base)
        anchor = _semantic_anchor_from_summary(semantic_summary_en, base)

        for candidate in (
            _merge_terms(base, setting).strip() if setting else "",
            _merge_terms(base, anchor).strip() if anchor else "",
        ):
            if candidate and candidate not in variants:
                variants.append(candidate)

    # Priority 3: base query is always the final fallback
    if base not in variants:
        variants.append(base)

    return variants


async def _search_videos_with_variants(
    query_variants: list[str],
    orientation: str,
    per_page: int,
    retry_on_low_video_hits: bool,
) -> tuple[list[dict[str, Any]], str]:
    """Try video queries in order and return first successful result set."""
    if not query_variants:
        return [], ""

    for query in query_variants:
        videos = await search_videos(query, orientation, per_page)

        if retry_on_low_video_hits and 0 < len(videos) < 2:
            retry_query = _shorten_query(query)
            if retry_query and retry_query != query:
                logger.debug("Retrying low-hit video query '{}' with '{}'", query, retry_query)
                retry_videos = await search_videos(retry_query, orientation, per_page)
                if retry_videos:
                    return retry_videos, retry_query

        if videos:
            return videos, query

    return [], query_variants[-1]


async def _search_images_with_variants(
    query_variants: list[str],
    orientation: str,
    per_page: int,
) -> tuple[list[dict[str, Any]], str]:
    """Try image queries in order and return first successful result set."""
    if not query_variants:
        return [], ""

    for query in query_variants:
        images = await search_images(query, orientation, per_page)
        if images:
            return images, query

    return [], query_variants[-1]


async def search_media(
    query: str,
    video_query: str | None = None,
    orientation: str = DEFAULT_ORIENTATION,
    per_page: int = DEFAULT_PER_PAGE,
    prefer_video: bool = True,
    retry_on_low_video_hits: bool = False,
    semantic_summary_en: str | None = None,
    semantic_image_query: str | None = None,
    semantic_video_query: str | None = None,
) -> dict[str, Any]:
    """Search for media with video priority, image fallback.

    Args:
        query: Image search query (English keywords).
        video_query: Video-specific search query. Falls back to `query`.
        orientation: "portrait" | "landscape" | "square".
        per_page: Number of results per API call.
        prefer_video: If True, video search is attempted first.
        retry_on_low_video_hits: Retry once with a shortened query when video hits are low.
        semantic_summary_en: Optional short English sentence for semantic query enrichment.
        semantic_image_query: LLM-optimized image search query (stock-tag-aware).
        semantic_video_query: LLM-optimized video search query (stock-tag-aware).

    Returns:
        Dict with keys: type ("video"|"image"), url, width, height, etc.
        Empty dict if nothing found.
    """
    if not PEXELS_API_KEY:
        logger.warning("PEXELS_API_KEY not configured, returning empty media")
        return {}

    video_q = (video_query or query or "").strip()
    image_q = (query or video_query or "").strip()

    if not video_q and not image_q:
        return {}

    video_variants = _build_query_variants(video_q, semantic_summary_en, semantic_llm_query=semantic_video_query)
    image_variants = _build_query_variants(image_q, semantic_summary_en, semantic_llm_query=semantic_image_query)

    if prefer_video:
        # Try video first
        try:
            videos, used_video_query = await _search_videos_with_variants(
                video_variants,
                orientation,
                per_page,
                retry_on_low_video_hits,
            )
            if videos:
                result = {"type": "video", **random.choice(videos)}
                logger.info("Found video for '{}': {}", used_video_query, result["url"][:80])
                return result
        except Exception as e:
            logger.warning("Video search failed for '{}': {}", video_q, e)

        # Fallback to image
        try:
            images, used_image_query = await _search_images_with_variants(
                image_variants,
                orientation,
                per_page,
            )
            if images:
                result = {"type": "image", **random.choice(images)}
                logger.info("Found image for '{}': {}", used_image_query, result["url"][:80])
                return result
        except Exception as e:
            logger.warning("Image search failed for '{}': {}", image_q, e)
    else:
        # Image-first mode for non-background scenes.
        try:
            images, used_image_query = await _search_images_with_variants(
                image_variants,
                orientation,
                per_page,
            )
            if images:
                result = {"type": "image", **random.choice(images)}
                logger.info("Found image for '{}': {}", used_image_query, result["url"][:80])
                return result
        except Exception as e:
            logger.warning("Image search failed for '{}': {}", image_q, e)

        # Optional fallback to video if image not found.
        try:
            videos, used_video_query = await _search_videos_with_variants(
                video_variants,
                orientation,
                per_page,
                retry_on_low_video_hits,
            )
            if videos:
                result = {"type": "video", **random.choice(videos)}
                logger.info("Found video for '{}': {}", used_video_query, result["url"][:80])
                return result
        except Exception as e:
            logger.warning("Video search failed for '{}': {}", video_q, e)

    logger.info("No media found for query: '{}'", query)
    return {}


async def collect_media_candidates(
    query: str,
    video_query: str | None = None,
    orientation: str = DEFAULT_ORIENTATION,
    per_page: int = DEFAULT_PER_PAGE,
    prefer_video: bool = True,
    retry_on_low_video_hits: bool = False,
    max_candidates: int = VLM_RERANK_MAX_CANDIDATES,
    semantic_summary_en: str | None = None,
    semantic_image_query: str | None = None,
    semantic_video_query: str | None = None,
) -> list[dict[str, Any]]:
    """Collect media candidates for review-time reranking.

    Returns up to `max_candidates` mixed candidates with stable ordering.
    """
    if not PEXELS_API_KEY:
        logger.warning("PEXELS_API_KEY not configured, cannot collect candidates")
        return []

    video_q = (video_query or query or "").strip()
    image_q = (query or video_query or "").strip()

    if not video_q and not image_q:
        return []

    video_variants = _build_query_variants(video_q, semantic_summary_en, semantic_llm_query=semantic_video_query)
    image_variants = _build_query_variants(image_q, semantic_summary_en, semantic_llm_query=semantic_image_query)

    videos: list[dict[str, Any]] = []
    images: list[dict[str, Any]] = []
    used_video_query = video_q
    used_image_query = image_q

    if prefer_video:
        try:
            videos, used_video_query = await _search_videos_with_variants(
                video_variants,
                orientation,
                per_page,
                retry_on_low_video_hits,
            )
        except Exception as e:
            logger.warning("Video candidate search failed for '{}': {}", video_q, e)
            videos = []

        try:
            images, used_image_query = await _search_images_with_variants(
                image_variants,
                orientation,
                per_page,
            )
        except Exception as e:
            logger.warning("Image candidate search failed for '{}': {}", image_q, e)
            images = []
    else:
        try:
            images, used_image_query = await _search_images_with_variants(
                image_variants,
                orientation,
                per_page,
            )
        except Exception as e:
            logger.warning("Image candidate search failed for '{}': {}", image_q, e)
            images = []

        try:
            videos, used_video_query = await _search_videos_with_variants(
                video_variants,
                orientation,
                per_page,
                retry_on_low_video_hits,
            )
        except Exception as e:
            logger.warning("Video candidate search failed for '{}': {}", video_q, e)
            videos = []

    candidates = _merge_and_rank_candidates(
        videos=videos,
        images=images,
        used_video_query=used_video_query,
        used_image_query=used_image_query,
        prefer_video=prefer_video,
        max_candidates=max_candidates,
    )
    return [c.to_dict() for c in candidates]


def _merge_and_rank_candidates(
    videos: list[dict[str, Any]],
    images: list[dict[str, Any]],
    used_video_query: str,
    used_image_query: str,
    prefer_video: bool,
    max_candidates: int,
) -> list[MediaCandidate]:
    """Merge raw video/image search results into stable candidate list."""
    merged: list[MediaCandidate] = []

    ordered_groups: list[tuple[str, list[dict[str, Any]], str]]
    if prefer_video:
        ordered_groups = [("video", videos, used_video_query), ("image", images, used_image_query)]
    else:
        ordered_groups = [("image", images, used_image_query), ("video", videos, used_video_query)]

    for media_type, items, source_query in ordered_groups:
        for idx, item in enumerate(items, start=1):
            candidate = MediaCandidate(
                media_type=media_type,
                url=item.get("url", ""),
                width=int(item.get("width", 0) or 0),
                height=int(item.get("height", 0) or 0),
                duration=item.get("duration"),
                thumbnail=item.get("thumbnail") or item.get("url"),
                photographer=item.get("photographer"),
                pexels_id=item.get("pexels_id"),
                source_query=source_query,
                source_rank=idx,
            )
            if candidate.url:
                merged.append(candidate)

            if len(merged) >= max_candidates:
                return merged

    return merged


def pick_top_candidate(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    """Pick the top candidate using source order (Pexels rank fallback)."""
    if not candidates:
        return {}

    top = candidates[0]
    media_type = top.get("media_type")
    result = {
        "type": media_type,
        "url": top.get("url"),
        "width": top.get("width", 0),
        "height": top.get("height", 0),
        "pexels_id": top.get("pexels_id"),
    }

    if media_type == "video":
        result["duration"] = top.get("duration", 0)
        result["thumbnail"] = top.get("thumbnail", "")
    else:
        result["photographer"] = top.get("photographer", "")

    return result


def _shorten_query(query: str) -> str:
    """Return a shorter retry query by dropping the final token."""
    tokens = [t for t in query.strip().split() if t]
    if len(tokens) <= 1:
        return query.strip()
    return " ".join(tokens[:-1])


async def search_videos(
    query: str,
    orientation: str = DEFAULT_ORIENTATION,
    per_page: int = DEFAULT_PER_PAGE,
) -> list[dict[str, Any]]:
    """Search Pexels Videos API.

    Returns list of dicts with: url, width, height, duration, thumbnail.
    """
    headers = {"Authorization": PEXELS_API_KEY}
    params = {
        "query": query,
        "orientation": orientation,
        "per_page": per_page,
        "size": "medium",
    }

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        response = await client.get(PEXELS_VIDEO_URL, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()

    results = []
    for video in data.get("videos", []):
        # Find the best video file (HD preferred)
        video_files = video.get("video_files", [])
        best_file = _pick_best_video_file(video_files)
        if not best_file:
            continue

        results.append({
            "url": best_file["link"],
            "width": best_file.get("width", 0),
            "height": best_file.get("height", 0),
            "duration": video.get("duration", 0),
            "thumbnail": video.get("image", ""),
            "pexels_id": video.get("id"),
        })

    return results


async def search_images(
    query: str,
    orientation: str = DEFAULT_ORIENTATION,
    per_page: int = DEFAULT_PER_PAGE,
) -> list[dict[str, Any]]:
    """Search Pexels Images API.

    Returns list of dicts with: url, width, height, photographer.
    """
    headers = {"Authorization": PEXELS_API_KEY}
    params = {
        "query": query,
        "orientation": orientation,
        "per_page": per_page,
    }

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        response = await client.get(PEXELS_IMAGE_URL, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()

    results = []
    for photo in data.get("photos", []):
        src = photo.get("src", {})
        results.append({
            "url": src.get("large2x") or src.get("large") or src.get("original", ""),
            "width": photo.get("width", 0),
            "height": photo.get("height", 0),
            "photographer": photo.get("photographer", ""),
            "pexels_id": photo.get("id"),
        })

    return results


def _pick_best_video_file(video_files: list[dict]) -> dict | None:
    """Pick the best video file from Pexels options.

    Prefers HD (720p+) with reasonable file size.
    """
    if not video_files:
        return None

    # Sort by height (prefer taller for vertical video), then by quality
    candidates = sorted(
        video_files,
        key=lambda f: (f.get("height", 0), f.get("width", 0)),
        reverse=True,
    )

    # Pick first HD-ish file
    for f in candidates:
        h = f.get("height", 0)
        if 720 <= h <= 1920 and f.get("link"):
            return f

    # Fallback to any file with a link
    for f in candidates:
        if f.get("link"):
            return f

    return None


async def download_media(
    url: str,
    output_path: str,
    timeout: int = DEFAULT_TIMEOUT,
) -> str:
    """Download media file from URL using streaming to avoid memory spikes.

    Args:
        url: Media URL to download.
        output_path: Local file path to save.
        timeout: Download timeout in seconds.

    Returns:
        Path to downloaded file.

    Raises:
        MediaSearchError: If download fails.
    """
    from pathlib import Path

    logger.info("Downloading media: {} → {}", url[:80], output_path)

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=10),
            follow_redirects=True,
        ) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()

                out_path = Path(output_path)
                out_path.parent.mkdir(parents=True, exist_ok=True)

                total_bytes = 0
                with open(out_path, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        f.write(chunk)
                        total_bytes += len(chunk)

            logger.info("Downloaded {:.1f}KB to {}", total_bytes / 1024, output_path)
            return str(out_path)

    except Exception as e:
        raise MediaSearchError(f"Failed to download {url}: {e}") from e
