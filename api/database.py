"""Database layer — SQLAlchemy Async ORM.

Supports SQLite (MVP) and PostgreSQL (Production) via DATABASE_URL swap.

MVP:        DATABASE_URL=sqlite+aiosqlite:///data/autoclip.db
Production: DATABASE_URL=postgresql+asyncpg://user:pass@host/autoclip

Railway injects DATABASE_URL as postgresql:// (no async driver suffix).
The engine setup below normalises it to postgresql+asyncpg:// automatically.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import AsyncGenerator

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, JSON,
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

from config import DATABASE_URL

# SQLite needs special handling
_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    # SQLite: no pool; PostgreSQL: tuned async connection pool
    pool_pre_ping=not _is_sqlite,
    **({} if _is_sqlite else {"pool_size": 20, "max_overflow": 10}),
)

SessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Enable WAL mode for SQLite (better concurrent reads) ──
if _is_sqlite:
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=-64000")
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.close()


# ══════════════════════════════
# Base
# ══════════════════════════════

class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    """Return current UTC time as a timezone-aware datetime for DB columns."""
    return datetime.now(UTC)


# ══════════════════════════════
# ORM Models
# ══════════════════════════════

class User(Base):
    """Application user."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    display_name = Column(String(100), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="user")
    tier = Column(String(20), nullable=False, default="starter")  # starter | pro | studio
    quota_override = Column(Integer, nullable=True, default=None)  # admin override for monthly quota
    is_active = Column(Boolean, nullable=False, default=True)
    disabled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    roles = relationship(
        "Role",
        secondary="user_roles",
        primaryjoin="User.id == UserRole.user_id",
        secondaryjoin="Role.id == UserRole.role_id",
        back_populates="users",
        lazy="selectin"
    )
    jobs = relationship("Job", back_populates="user", lazy="selectin")
    projects = relationship("Project", back_populates="user", lazy="selectin")
    usage_records = relationship("UsageRecord", back_populates="user", lazy="noload")

    __table_args__ = (
        Index("idx_users_role", "role"),
    )

    @property
    def effective_permissions(self) -> set[str]:
        """Compute all permissions from all assigned roles."""
        # Baseline: admins always have super-permissions regardless of RBAC roles
        if self.role == "admin":
            return {"*"}

        perms: set[str] = set()
        for role in self.roles:
            role_perms = role.permissions if isinstance(role.permissions, list) else []
            if "*" in role_perms:
                return {"*"}  # super_admin — all permissions
            perms.update(role_perms)
        
        # Fallback: users without RBAC roles assigned use regular user baseline
        if not self.roles:
            return {
                "view_own_jobs", "create_job", "delete_own_job", "upload_media",
            }
        return perms

    @property
    def highest_role(self) -> str:
        """Return the name of the highest-level role."""
        if not self.roles:
            return self.role or "viewer"  # Fallback to legacy column or viewer
        return max(self.roles, key=lambda r: r.level).name

    def has_permission(self, perm: str) -> bool:
        """Check if user has a specific permission."""
        perms = self.effective_permissions
        return "*" in perms or perm in perms

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r}>"


class Template(Base):
    """Reusable preset template for video settings and prompt style."""

    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    slug = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=False, default="general")
    settings = Column(JSON, nullable=False, default=dict)
    example_script = Column(Text, nullable=True)
    thumbnail_url = Column(String(500), nullable=True)
    is_system = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=True, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        Index("idx_templates_active", "is_active"),
        Index("idx_templates_system", "is_system"),
        Index("idx_templates_category", "category"),
    )

    def __repr__(self) -> str:
        return f"<Template slug={self.slug!r} active={self.is_active}>"


class Project(Base):
    """Durable project workspace for idea/config/review lifecycle."""

    __tablename__ = "projects"

    id = Column(String(36), primary_key=True)  # UUID string
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=True)
    stage = Column(String(20), nullable=False, default="idea")
    config_draft = Column(JSON)                # {text, settings}
    script_agent_draft = Column(JSON)          # topic/tone/duration/reference draft
    script_variants = Column(JSON)             # Generated variants list
    chosen_script = Column(Text, nullable=True)
    script_agent_task_id = Column(String(36), nullable=True)
    script_agent_progress_snapshot = Column(JSON)
    active_job_id = Column(String(36), nullable=True)
    last_known_props = Column(JSON)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="projects")
    jobs = relationship("Job", back_populates="project", lazy="selectin")

    __table_args__ = (
        Index("idx_projects_user_id", "user_id"),
        Index("idx_projects_stage", "stage"),
        Index("idx_projects_updated", "updated_at"),
    )

    def __repr__(self) -> str:
        return f"<Project id={self.id!r} stage={self.stage!r}>"


class Job(Base):
    """Video generation job."""

    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True)  # UUID string
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    # pending → processing → review → rendering → done | failed
    input_text = Column(Text)
    settings = Column(JSON)       # User-submitted settings
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True)
    props = Column(JSON)          # Generated VideoProps JSON
    video_url = Column(String(500))
    thumbnail_url = Column(String(500), nullable=True)
    share_token = Column(String(100), unique=True, nullable=True, index=True)
    share_views = Column(Integer, nullable=False, default=0)
    error = Column(Text)
    failure_reason = Column(Text)         # Human-readable failure step
    pipeline_logs = Column(JSON)          # Per-step trace for admin debug
    disabled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    completed_at = Column(DateTime(timezone=True))

    # Relationship
    user = relationship("User", back_populates="jobs")
    project = relationship("Project", back_populates="jobs")

    __table_args__ = (
        Index("idx_jobs_user_id", "user_id"),
        Index("idx_jobs_status", "status"),
        Index("idx_jobs_created", "created_at"),
        Index("idx_jobs_project_id", "project_id"),
    )

    def __repr__(self) -> str:
        return f"<Job id={self.id!r} status={self.status!r}>"


class UsageRecord(Base):
    """Tracks per-user actions for quota enforcement and analytics."""

    __tablename__ = "usage_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(50), nullable=False)   # e.g. "create_job", "tts_preview"
    cost_estimate = Column(Float, nullable=True)  # USD estimate (for analytics)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    user = relationship("User", back_populates="usage_records")

    __table_args__ = (
        Index("idx_usage_user_id", "user_id"),
        Index("idx_usage_created", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<UsageRecord user_id={self.user_id} action={self.action!r}>"


class RefreshToken(Base):
    """Refresh token — stored hashed in DB for revocation support."""

    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(255), nullable=False, unique=True, index=True)
    device_info = Column(String(500), nullable=True)
    ip_address = Column(String(45), nullable=True)
    is_revoked = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    user = relationship("User")

    __table_args__ = (
        Index("idx_refresh_user_id", "user_id"),
        Index("idx_refresh_expires", "expires_at"),
    )


class Role(Base):
    """RBAC Role — defines a set of permissions."""

    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    level = Column(Integer, nullable=False, default=10)
    permissions = Column(JSON, nullable=False, default=list)
    is_system = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    # Relationships
    users = relationship(
        "User",
        secondary="user_roles",
        primaryjoin="Role.id == UserRole.role_id",
        secondaryjoin="User.id == UserRole.user_id",
        back_populates="roles"
    )

    def __repr__(self) -> str:
        return f"<Role name={self.name!r} level={self.level}>"


class UserRole(Base):
    """Association table for many-to-many User <-> Role relationship."""

    __tablename__ = "user_roles"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    granted_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class AuditLog(Base):
    """Security audit log for administrative actions."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    target_type = Column(String(50), nullable=True)
    target_id = Column(String(100), nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    # Relationship
    user = relationship("User")

    __table_args__ = (
        Index("idx_audit_user", "user_id"),
        Index("idx_audit_action", "action"),
        Index("idx_audit_created", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<AuditLog action={self.action!r} user_id={self.user_id}>"


class Notification(Base):
    """User notifications for system events (e.g. video done, failed)."""

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=True)
    type = Column(String(50), nullable=False, default="info")  # success | error | info
    is_read = Column(Boolean, nullable=False, default=False)
    action_url = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)

    # Relationship
    user = relationship("User")

    __table_args__ = (
        Index("idx_notifications_user_id", "user_id"),
        Index("idx_notifications_unread", "user_id", "is_read"),
    )

    def __repr__(self) -> str:
        return f"<Notification id={self.id} user_id={self.user_id} title={self.title!r}>"


# ══════════════════════════════
# Session helpers
# ══════════════════════════════

async def init_db() -> None:
    """Create all tables. Safe to call multiple times."""
    from loguru import logger
    
    # Ensure data directory exists for SQLite
    if _is_sqlite:
        db_path = DATABASE_URL.replace("sqlite+aiosqlite:///", "")
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        logger.info("[DB] Using SQLite: {}", db_path)
    else:
        # Extract host from postgres URL for logging
        from urllib.parse import urlparse
        parsed = urlparse(DATABASE_URL.replace("+asyncpg", ""))
        logger.info("[DB] Using PostgreSQL: {}{}", parsed.hostname, f":{parsed.port}" if parsed.port else "")

    try:
        async with engine.begin() as conn:
            # Simple connectivity check
            from sqlalchemy import text
            await conn.execute(text("SELECT 1"))
            
            # Create tables
            await conn.run_sync(Base.metadata.create_all)
            logger.info("[OK] Database connectivity verified and tables initialized")
    except Exception as e:
        logger.error("[FATAL] Database connection failed: {}", e)
        # In production, we might want to exit, but for now let's just log
        if os.getenv("ENV") == "production":
            import sys
            sys.exit(1)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields an async session."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
