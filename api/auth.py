"""Authentication Bypass.

Provides dummy dependencies to satisfy existing routes without enforcing security.
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from api.database import User, get_db

async def get_current_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Bypass Auth for local tool usage."""
    user = User(
        id=1,
        username="local_admin",
        email="admin@localhost.com",
        role="admin",
        tier="studio",
        is_active=True,
        created_at=datetime.now(timezone.utc)
    )
    return user


def require_role(role: str):
    """Dummy role-based access control dependency for backward compatibility."""
    async def _check_role(
        user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        return user
    return _check_role

