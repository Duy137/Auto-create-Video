"""Singleton AsyncOpenAI client — shared across all pipeline nodes.

Reuses TCP connections via httpx connection pool to avoid
repeated TCP+TLS handshake overhead on every LLM call.
"""

from __future__ import annotations

from openai import AsyncOpenAI

from config import OPENAI_API_KEY, QWEN_API_KEY, QWEN_BASE_URL

_client: AsyncOpenAI | None = None
_qwen_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI:
    """Get or create singleton AsyncOpenAI client.

    Reuses TCP connections via httpx connection pool.
    Safe for concurrent use within asyncio event loop.
    """
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    return _client


def get_qwen_client() -> AsyncOpenAI:
    """Get or create singleton Qwen client (DashScope OpenAI-compatible API).

    Uses QWEN_API_KEY + QWEN_BASE_URL from config.
    Safe for concurrent use within asyncio event loop.
    """
    global _qwen_client
    if _qwen_client is None:
        _qwen_client = AsyncOpenAI(api_key=QWEN_API_KEY, base_url=QWEN_BASE_URL)
    return _qwen_client
