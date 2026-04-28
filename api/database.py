"""Database layer — SQLAlchemy Async ORM.

Supports SQLite (MVP) and PostgreSQL (Production) via DATABASE_URL swap.

MVP:        DATABASE_URL=sqlite+aiosqlite:///data/autoclip.db
Production: DATABASE_URL=postgresql+asyncpg://user:pass@host/autoclip
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import AsyncGenerator

from sqlalchemy import (
    Column, DateTime, ForeignKey, Index, Integer, JSON,
    String, Text, event,
)
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, relationship

# ══════════════════════════════════════
# Engine Setup — change URL = change DB
# ══════════════════════════════════════

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:///data/autoclip.db",
)

# SQLite needs special handling
_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    # SQLite: no pool; PostgreSQL: connection pool
    pool_pre_ping=not _is_sqlite,
)

SessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Enable WAL mode for SQLite (better concurrent reads) ──
if _is_sqlite:
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


# ══════════════════════════════
# Base
# ══════════════════════════════

class Base(DeclarativeBase):
    pass


# ══════════════════════════════
# ORM Models
# ══════════════════════════════

class User(Base):
    """Application user."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="user")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationship
    jobs = relationship("Job", back_populates="user", lazy="selectin")

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r}>"


class Job(Base):
    """Video generation job."""

    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True)  # UUID string
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    # pending → processing → review → rendering → done | failed
    input_text = Column(Text)
    settings = Column(JSON)       # User-submitted settings
    props = Column(JSON)          # Generated VideoProps JSON
    video_url = Column(String(500))
    error = Column(Text)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime)

    # Relationship
    user = relationship("User", back_populates="jobs")

    __table_args__ = (
        Index("idx_jobs_user_id", "user_id"),
        Index("idx_jobs_status", "status"),
        Index("idx_jobs_created", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Job id={self.id!r} status={self.status!r}>"


# ══════════════════════════════
# Session helpers
# ══════════════════════════════

async def init_db() -> None:
    """Create all tables. Safe to call multiple times."""
    # Ensure data directory exists for SQLite
    if _is_sqlite:
        db_path = DATABASE_URL.replace("sqlite+aiosqlite:///", "")
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields an async session."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
