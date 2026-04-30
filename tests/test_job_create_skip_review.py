from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api.database import Base, Job, User
from api.models import JobCreateRequest
from api.routes import _run_pipeline_background, create_job


class CapturingBackgroundTasks:
    def __init__(self) -> None:
        self.calls: list[tuple[object, tuple[object, ...], dict[str, object]]] = []

    def add_task(self, func, *args, **kwargs) -> None:
        self.calls.append((func, args, kwargs))


async def _make_session(tmp_path: Path) -> tuple[AsyncSession, User, object]:
    db_url = f"sqlite+aiosqlite:///{tmp_path / 'skip_review_test.db'}"
    engine = create_async_engine(db_url, echo=False)
    session_factory = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session = session_factory()
    user = User(
        username="skip-review-user",
        email="skip-review@example.com",
        password_hash="not-used-in-this-test",
        role="user",
    )
    session.add(user)
    await session.flush()
    await session.commit()
    await session.refresh(user)

    return session, user, engine


def _job_payload() -> dict[str, object]:
    return {
        "input_text": (
            "Day la mot doan van ban thu nghiem de tao video tu dong cho "
            "kiem thu skip review va dam bao payload duoc chuyen dung den "
            "background worker."
        ),
        "settings": {
            "aspect_ratio": "9:16",
            "tts_engine": "openai",
            "voice": "nova",
            "speech_rate": 1.0,
            "transition_mode": "crossfade",
        },
    }


@pytest.mark.asyncio
async def test_create_job_normalizes_top_level_skip_review(tmp_path: Path):
    session, user, engine = await _make_session(tmp_path)
    try:
        payload = _job_payload()
        payload["skip_review"] = True
        body = JobCreateRequest.model_validate(payload)
        background_tasks = CapturingBackgroundTasks()

        response = await create_job(
            body=body,
            background_tasks=background_tasks,
            user=user,
            db=session,
        )

        job = (
            await session.execute(select(Job).where(Job.id == response.id))
        ).scalar_one()

        assert job.settings["skip_review"] is True
        assert len(background_tasks.calls) == 1
        func, _, kwargs = background_tasks.calls[0]
        assert func is _run_pipeline_background
        assert kwargs["settings"]["skip_review"] is True
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_create_job_preserves_nested_skip_review(tmp_path: Path):
    session, user, engine = await _make_session(tmp_path)
    try:
        payload = _job_payload()
        payload["settings"]["skip_review"] = True
        body = JobCreateRequest.model_validate(payload)
        background_tasks = CapturingBackgroundTasks()

        response = await create_job(
            body=body,
            background_tasks=background_tasks,
            user=user,
            db=session,
        )

        job = (
            await session.execute(select(Job).where(Job.id == response.id))
        ).scalar_one()

        assert job.settings["skip_review"] is True
        assert len(background_tasks.calls) == 1
        func, _, kwargs = background_tasks.calls[0]
        assert func is _run_pipeline_background
        assert kwargs["settings"]["skip_review"] is True
    finally:
        await session.close()
        await engine.dispose()