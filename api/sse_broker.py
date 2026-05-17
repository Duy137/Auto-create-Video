"""SSE event broker — in-memory queues + optional Redis pub/sub.

Single-process (dev without Redis): in-memory asyncio.Queue only.
Multi-process or ARQ worker: publishes to Redis pub/sub so that
cross-process SSE listeners receive events from the worker.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncGenerator, TYPE_CHECKING

from loguru import logger

from config import REDIS_SSE_MAX_CONNECTIONS, REDIS_URL

if TYPE_CHECKING:
    from api.models import ProgressEvent


# ── In-memory queues (same-process SSE) ──────────────────────────────────────

_progress_queues: dict[str, list[asyncio.Queue]] = {}

# Latest event cache for reconnect/replay (single-process path).
_latest_progress_event: dict[str, str] = {}

# User-level event queues (keyed by user_id)
_user_queues: dict[int, list[asyncio.Queue]] = {}

# ScriptAgent task-level event queues (keyed by task_id)
_script_task_queues: dict[str, list[asyncio.Queue]] = {}
_latest_script_task_event: dict[str, str] = {}

_SCRIPT_TASK_CHANNEL_PREFIX = "script_task"
_SCRIPT_TASK_LAST_KEY_PREFIX = "script_task:last"

_redis_publish_client: Any | None = None
_redis_publish_lock = asyncio.Lock()


def _new_redis_connection() -> Any:
    # Bypassed for local tool: force instant in-memory fallback
    raise NotImplementedError("Redis SSE is disabled for local tool")


async def _get_redis_publish_client() -> Any:
    global _redis_publish_client
    if _redis_publish_client is None:
        async with _redis_publish_lock:
            if _redis_publish_client is None:
                _redis_publish_client = _new_redis_connection()
    return _redis_publish_client


async def close_redis_client() -> None:
    """Close the shared Redis publisher client on app shutdown."""
    global _redis_publish_client
    if _redis_publish_client is not None:
        try:
            await _redis_publish_client.aclose()
        finally:
            _redis_publish_client = None


async def _publish_redis(channel: str, data: str, latest_key: str | None = None) -> None:
    client = await _get_redis_publish_client()
    if latest_key is None:
        await client.publish(channel, data)
        return

    pipe = client.pipeline(transaction=False)
    pipe.publish(channel, data)
    pipe.set(latest_key, data, ex=3600)
    await pipe.execute()


def _get_queue(job_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _progress_queues.setdefault(job_id, []).append(q)
    return q


def _remove_queue(job_id: str, q: asyncio.Queue) -> None:
    queues = _progress_queues.get(job_id, [])
    if q in queues:
        queues.remove(q)
    if not queues:
        _progress_queues.pop(job_id, None)


def _get_user_queue(user_id: int) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _user_queues.setdefault(user_id, []).append(q)
    return q


def _remove_user_queue(user_id: int, q: asyncio.Queue) -> None:
    queues = _user_queues.get(user_id, [])
    if q in queues:
        queues.remove(q)
    if not queues:
        _user_queues.pop(user_id, None)


def _get_script_task_queue(task_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _script_task_queues.setdefault(task_id, []).append(q)
    return q


def _remove_script_task_queue(task_id: str, q: asyncio.Queue) -> None:
    queues = _script_task_queues.get(task_id, [])
    if q in queues:
        queues.remove(q)
    if not queues:
        _script_task_queues.pop(task_id, None)


# ── Broadcast ─────────────────────────────────────────────────────────────────

async def broadcast_progress(job_id: str, event: "ProgressEvent") -> None:
    """Publish a progress event to in-memory listeners and Redis (if available)."""
    data = event.model_dump_json()
    _latest_progress_event[job_id] = data

    # Push to in-memory queues (same-process SSE subscribers)
    for q in _progress_queues.get(job_id, []):
        await q.put(data)

    # Also publish to Redis pub/sub (cross-process / ARQ worker path — best effort)
    try:
        await _publish_redis(f"progress:{job_id}", data, f"progress:last:{job_id}")
    except Exception as exc:
        logger.debug("Redis progress publish skipped for job {}: {}", job_id, exc)
        pass  # Redis unavailable — in-memory delivery was already done above


async def broadcast_user_event(user_id: int, event_type: str, data: dict) -> None:
    """Publish a significant job event (done/review_ready/failed) to the user-level channel."""
    payload = json.dumps({"event": event_type, **data})

    for q in _user_queues.get(user_id, []):
        await q.put(payload)

    try:
        await _publish_redis(f"user_events:{user_id}", payload)
    except Exception as exc:
        logger.debug("Redis user-event publish skipped for user {}: {}", user_id, exc)
        pass


async def broadcast_script_task(task_id: str, payload: dict[str, Any]) -> None:
    """Publish ScriptAgent task updates for task-scoped SSE subscribers."""
    data = json.dumps(payload)
    _latest_script_task_event[task_id] = data

    for q in _script_task_queues.get(task_id, []):
        await q.put(data)

    channel = f"{_SCRIPT_TASK_CHANNEL_PREFIX}:{task_id}"
    latest_key = f"{_SCRIPT_TASK_LAST_KEY_PREFIX}:{task_id}"
    try:
        await _publish_redis(channel, data, latest_key)
    except Exception as exc:
        logger.debug("Redis script-task publish skipped for task {}: {}", task_id, exc)
        pass


# ── Subscribe ─────────────────────────────────────────────────────────────────

async def subscribe(job_id: str) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted strings for a job's progress stream.

    Tries Redis pub/sub first (works across web + worker processes).
    Falls back to in-memory asyncio.Queue when Redis is unavailable.
    """
    channel = f"progress:{job_id}"
    heartbeat_interval = 30.0
    redis_connected = False

    try:
        conn = _new_redis_connection()
        await conn.ping()
        redis_connected = True

        latest = await conn.get(f"progress:last:{job_id}")
        if latest:
            yield f"data: {latest}\n\n"

        pubsub = conn.pubsub()
        await pubsub.subscribe(channel)
        last_heartbeat = asyncio.get_event_loop().time()
        try:
            while True:
                msg = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if msg and msg["type"] == "message":
                    raw = msg["data"]
                    data = raw.decode() if isinstance(raw, bytes) else raw
                    yield f"data: {data}\n\n"
                    try:
                        parsed = json.loads(data)
                        if parsed.get("event") in ("done", "error") and parsed.get("fatal", False):
                            return
                    except Exception:
                        pass
                    last_heartbeat = asyncio.get_event_loop().time()
                else:
                    now = asyncio.get_event_loop().time()
                    if now - last_heartbeat >= heartbeat_interval:
                        yield ": heartbeat\n\n"
                        last_heartbeat = now
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
                await conn.aclose()
            except Exception:
                pass
        return
    except Exception as exc:
        if redis_connected:
            logger.warning("Redis SSE stream interrupted for job {}: {}", job_id, exc)

    # In-memory fallback (single-process dev without Redis)
    q = _get_queue(job_id)
    try:
        latest_local = _latest_progress_event.get(job_id)
        if latest_local:
            yield f"data: {latest_local}\n\n"

        while True:
            try:
                data = await asyncio.wait_for(q.get(), timeout=30.0)
                yield f"data: {data}\n\n"
                try:
                    parsed = json.loads(data)
                    if parsed.get("event") in ("done", "error") and parsed.get("fatal", False):
                        return
                except Exception:
                    pass
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
    finally:
        _remove_queue(job_id, q)


async def subscribe_script_task(task_id: str) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted strings for ScriptAgent task updates."""
    channel = f"{_SCRIPT_TASK_CHANNEL_PREFIX}:{task_id}"
    latest_key = f"{_SCRIPT_TASK_LAST_KEY_PREFIX}:{task_id}"
    heartbeat_interval = 30.0
    redis_connected = False

    try:
        conn = _new_redis_connection()
        await conn.ping()
        redis_connected = True

        latest = await conn.get(latest_key)
        if latest:
            yield f"data: {latest}\n\n"

        pubsub = conn.pubsub()
        await pubsub.subscribe(channel)
        last_heartbeat = asyncio.get_event_loop().time()
        try:
            while True:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if msg and msg["type"] == "message":
                    raw = msg["data"]
                    data = raw.decode() if isinstance(raw, bytes) else raw
                    yield f"data: {data}\n\n"
                    try:
                        parsed = json.loads(data)
                        if parsed.get("status") in ("done", "error"):
                            return
                    except Exception:
                        pass
                    last_heartbeat = asyncio.get_event_loop().time()
                else:
                    now = asyncio.get_event_loop().time()
                    if now - last_heartbeat >= heartbeat_interval:
                        yield ": heartbeat\n\n"
                        last_heartbeat = now
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
                await conn.aclose()
            except Exception:
                pass
        return
    except Exception as exc:
        if redis_connected:
            logger.warning("Redis script-task SSE interrupted for task {}: {}", task_id, exc)

    q = _get_script_task_queue(task_id)
    try:
        latest_local = _latest_script_task_event.get(task_id)
        if latest_local:
            yield f"data: {latest_local}\n\n"

        while True:
            try:
                data = await asyncio.wait_for(q.get(), timeout=30.0)
                yield f"data: {data}\n\n"
                try:
                    parsed = json.loads(data)
                    if parsed.get("status") in ("done", "error"):
                        return
                except Exception:
                    pass
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
    finally:
        _remove_script_task_queue(task_id, q)


async def subscribe_user(user_id: int) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted strings for user-level job events (done/review_ready/failed).

    Mirrors subscribe() but keyed on user_id instead of job_id.
    """
    channel = f"user_events:{user_id}"
    heartbeat_interval = 30.0
    redis_connected = False

    try:
        conn = _new_redis_connection()
        await conn.ping()
        redis_connected = True
        pubsub = conn.pubsub()
        await pubsub.subscribe(channel)
        last_heartbeat = asyncio.get_event_loop().time()
        try:
            while True:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if msg and msg["type"] == "message":
                    raw = msg["data"]
                    data = raw.decode() if isinstance(raw, bytes) else raw
                    yield f"data: {data}\n\n"
                    last_heartbeat = asyncio.get_event_loop().time()
                else:
                    now = asyncio.get_event_loop().time()
                    if now - last_heartbeat >= heartbeat_interval:
                        yield ": heartbeat\n\n"
                        last_heartbeat = now
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
                await conn.aclose()
            except Exception:
                pass
        return
    except Exception as exc:
        if redis_connected:
            logger.warning("Redis user SSE stream interrupted for user {}: {}", user_id, exc)

    # In-memory fallback
    q = _get_user_queue(user_id)
    try:
        while True:
            try:
                data = await asyncio.wait_for(q.get(), timeout=30.0)
                yield f"data: {data}\n\n"
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
    finally:
        _remove_user_queue(user_id, q)
