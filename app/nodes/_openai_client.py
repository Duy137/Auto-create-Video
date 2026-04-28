"""Singleton AsyncOpenAI client — shared across all pipeline nodes.

Reuses TCP connections via httpx connection pool to avoid
repeated TCP+TLS handshake overhead on every LLM call.
"""

from __future__ import annotations

from openai import AsyncOpenAI

from config import OPENAI_API_KEY

_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI:
    """Get or create singleton AsyncOpenAI client.

    Reuses TCP connections via httpx connection pool.
    Safe for concurrent use within asyncio event loop.
    """
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    return _client
