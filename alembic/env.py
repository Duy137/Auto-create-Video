"""Alembic env.py — configured for AutoClip database models.

Reads DATABASE_URL from config.py to stay in sync with the application.
Converts async URL to sync for Alembic (which runs synchronously).
"""

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# ── Import our models so Alembic can detect schema changes ──
import sys
import os

# Ensure project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from api.database import Base  # noqa: E402
from config import DATABASE_URL  # noqa: E402

# Alembic Config object
config = context.config

# ── Convert async URL to sync for Alembic ──
# Alembic runs synchronously, so we swap async drivers:
#   sqlite+aiosqlite → sqlite
#   postgresql+asyncpg → postgresql
sync_url = DATABASE_URL.replace("+aiosqlite", "").replace("+asyncpg", "+psycopg2")
config.set_main_option("sqlalchemy.url", sync_url.replace("%", "%%"))

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set target metadata from our Base so autogenerate works
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # Required for SQLite ALTER TABLE
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # Required for SQLite ALTER TABLE
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
