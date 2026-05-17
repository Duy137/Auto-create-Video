"""Lightweight async progress emitter shared across pipeline stages.

Routes set an emitter callback for the current async context; stage/node code
can emit structured progress payloads without direct coupling to SSE.
"""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Awaitable, Callable, Iterator

ProgressEmitter = Callable[[dict[str, Any]], Awaitable[None]]

_progress_emitter: ContextVar[ProgressEmitter | None] = ContextVar(
    "_progress_emitter",
    default=None,
)


@contextmanager
def use_progress_emitter(emitter: ProgressEmitter | None) -> Iterator[None]:
    token = _progress_emitter.set(emitter)
    try:
        yield
    finally:
        _progress_emitter.reset(token)


async def emit_progress(payload: dict[str, Any]) -> None:
    emitter = _progress_emitter.get()
    if emitter is None:
        return
    await emitter(payload)
