"""AutoClip API — FastAPI Application.

Production-ready server with:
- Auth + Jobs routes (api/routes.py)
- Database initialization + admin seed on startup
- Structured logging (loguru, JSON in production)
- Rate limiting (slowapi)
- Request-ID middleware for tracing
- Sentry error tracking (optional)
- Static file serving for web/ frontend
"""


import asyncio
import sys
import time
import uuid

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware

from api.database import init_db
from api.routes import router as production_router
from config import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    ADMIN_USERNAME,
    ALLOWED_ORIGINS,
    ENV,
    OUTPUT_DIR,
    PORT,
    REMOTION_DIR,
    SENTRY_DSN,
)


# ══════════════════════════════
# Logging setup
# ══════════════════════════════

# ══════════════════════════════
# Static Paths
# ══════════════════════════════
web_dist = Path(__file__).parent.parent / "web" / "dist"
web_dir = Path(__file__).parent.parent / "web"


def _setup_logging() -> None:
    """Configure loguru for development (coloured) or production (JSON)."""
    logger.remove()
    if ENV == "production":
        logger.add(sys.stdout, format="{message}", serialize=True, level="INFO")
    else:
        logger.add(
            sys.stdout,
            colorize=True,
            format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}",
            level="DEBUG",
        )
    # Rotating file log — always on
    Path("logs").mkdir(exist_ok=True)
    logger.add(
        "logs/app.log",
        rotation="50 MB",
        retention=5,
        level="INFO",
        serialize=(ENV == "production"),
        encoding="utf-8",
    )


_setup_logging()


# ══════════════════════════════
# Sentry (optional)
# ══════════════════════════════

if SENTRY_DSN:
    try:
        import sentry_sdk  # type: ignore
        sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=0.1)
        logger.info("[OK] Sentry initialized")
    except ImportError:
        logger.warning("sentry-sdk not installed — Sentry disabled")


# ══════════════════════════════
# Request-ID middleware
# ══════════════════════════════

class _RequestIDMiddleware(BaseHTTPMiddleware):
    """Injects X-Request-ID header and binds request_id to log context."""

    async def dispatch(self, request: Request, call_next):
        request_id = uuid.uuid4().hex[:8]
        with logger.contextualize(request_id=request_id):
            response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


# ══════════════════════════════
# Admin seed helper
# ══════════════════════════════

async def _seed_admin() -> None:
    """Create the first admin from env vars if no admin exists yet."""
    if not all([ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD]):
        return  # Env vars not set — skip seed

    from sqlalchemy import func, select

    from api.auth import hash_password
    from api.database import SessionLocal, User

    async with SessionLocal() as db:
        count = (await db.execute(
            select(func.count()).select_from(User).where(User.role == "admin", User.is_active)
        )).scalar()

        if count and count > 0:
            return  # Admin already present

        admin = User(
            username=ADMIN_USERNAME,
            email=ADMIN_EMAIL,
            password_hash=hash_password(ADMIN_PASSWORD),
            role="admin",
            roles=[],
        )
        db.add(admin)
        await db.commit()
        logger.info("[OK] Admin user seeded: {}", ADMIN_USERNAME)


async def _seed_templates() -> None:
    """Ensure built-in template presets exist."""
    from api.database import SessionLocal
    from api.template_seed import seed_system_templates

    async with SessionLocal() as db:
        changed = await seed_system_templates(db)
        await db.commit()
        if changed:
            logger.info("[OK] Seeded {} system templates", changed)


async def _cleanup_stale_jobs() -> None:
    """Mark jobs stuck in 'processing' or 'rendering' as failed.

    These jobs were interrupted mid-run by a server crash or restart.
    They cannot be resumed (no mid-pipeline checkpoint), so fail them
    explicitly so the user sees a clear error instead of an infinite spinner.
    """
    from datetime import datetime, timezone
    from sqlalchemy import select, update
    from api.database import SessionLocal, Job

    stale_statuses = ("processing", "rendering")
    async with SessionLocal() as db:
        result = await db.execute(
            select(Job.id, Job.status).where(Job.status.in_(stale_statuses))
        )
        stale = result.all()
        if not stale:
            return

        stale_ids = [row.id for row in stale]
        await db.execute(
            update(Job)
            .where(Job.id.in_(stale_ids))
            .values(
                status="failed",
                error="Job was interrupted by a server restart and could not be resumed.",
                failure_reason="ServerRestart",
                pipeline_logs={"step": "startup_cleanup", "reason": "ServerRestart"},
            )
        )
        await db.commit()
        logger.warning(
            "[STARTUP] Marked {} stale job(s) as failed: {}",
            len(stale_ids),
            stale_ids,
        )


async def _promote_user_on_startup() -> None:
    """Promote a user to admin+studio if PROMOTE_USER env var is set."""
    import os
    username = os.getenv("PROMOTE_USER")
    if not username:
        return

    from sqlalchemy import select
    from api.database import SessionLocal, User

    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if user:
            logger.info("[STARTUP] Promoting user '{}' to admin + studio", username)
            user.role = "admin"
            user.tier = "studio"
            await db.commit()
        else:
            logger.warning("[STARTUP] User '{}' for PROMOTE_USER not found", username)


# ══════════════════════════════
# Lifespan — startup / shutdown
# ══════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[DEBUG] App starting (ENV={ENV})")
    await init_db()
    
    # Essential background tasks (delayed and sequenced to avoid DB connection surge)
    async def _bg_tasks():
        try:
            # Wait a few seconds for server to be fully ready and handle first healthchecks
            await asyncio.sleep(5)
            
            from api.database import User
            from sqlalchemy import select
            
            print("[DEBUG] Starting background sequence...")
            # 1. Seed/Promote admin (Sequential)
            await _seed_admin()
            await _seed_templates()
            await _promote_user_on_startup()
            
            # 2. Cleanup
            await _cleanup_stale_jobs()
            
            # 3. ARQ Pool
            from api.redis_pool import get_arq_pool
            await get_arq_pool()
            
            print("[DEBUG] Background startup sequence complete")
        except Exception as e:
            print(f"[WARN] Background startup tasks had issues: {e}")

    asyncio.create_task(_bg_tasks())
    
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    
    yield
    print("[DEBUG] App shutting down")

    # Shutdown ARQ pool
    try:
        from api.redis_pool import close_arq_pool
        await close_arq_pool()
    except Exception:
        pass

    # Shutdown shared Redis publisher used by SSE broadcasts
    try:
        from api.sse_broker import close_redis_client
        await close_redis_client()
    except Exception:
        pass

    logger.info("[STOP] AutoClip API shutting down")


# ══════════════════════════════
# Application
# ══════════════════════════════

app = FastAPI(
    title="AutoClip API",
    description="AI pipeline that converts text into short vertical videos",
    version="0.2.0",
    lifespan=lifespan,
)

# ══════════════════════════════
# Health Checks (Top Priority)
# ══════════════════════════════

@app.get("/health", include_in_schema=False)
async def fast_health():
    print("[HEALTH] Hit /health")
    return {"status": "ok"}

@app.get("/api/health", include_in_schema=False)
async def api_health_fast():
    print("[HEALTH] Hit /api/health")
    return {"status": "ok", "message": "Fast startup health check"}

@app.get("/api/ping", tags=["System"])
async def ping():
    print("[HEALTH] Hit /api/ping")
    return {"status": "pong", "time": time.time()}



# ══════════════════════════════
# Middleware
# ══════════════════════════════

app.add_middleware(_RequestIDMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS and ALLOWED_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ══════════════════════════════
# Routers
# ══════════════════════════════

app.include_router(production_router)


# ══════════════════════════════
# Static File Mounts
# ══════════════════════════════

output_path = Path(OUTPUT_DIR).resolve()
output_path.mkdir(parents=True, exist_ok=True)

assets_path = Path(REMOTION_DIR) / "public" / "assets"
assets_path.mkdir(parents=True, exist_ok=True)

# Static mounts are restricted in production.
# Protected files are now served via /api/files proxy with signed URLs.
if ENV != "production":
    # Demo/Dev access to raw outputs (legacy support for demo UI)
    app.mount("/api/outputs", StaticFiles(directory=str(output_path)), name="outputs")




# ══════════════════════════════
# Root redirect
# ══════════════════════════════

@app.get("/", include_in_schema=False)
async def root():
    """Serve the Web UI index.html if built, otherwise fallback to demo."""
    from fastapi.responses import FileResponse
    index = web_dist / "index.html"
    if index.exists():
        return FileResponse(str(index))
    # Fallback to local 404 if no index exists
    raise HTTPException(status_code=404, detail="Web UI not built")





# ══════════════════════════════
# Root-level SPA Catch-All
# (allows direct URLs like /dashboard, /create without /web/ prefix)
# IMPORTANT: must be the LAST route registered so it doesn't shadow API routes.
# ══════════════════════════════

@app.get("/{full_path:path}", include_in_schema=False)
async def root_spa_fallback(full_path: str):
    """Fallback for client-side routes (React Router) at root level.

    Order of resolution:
      1. Skip API/known prefixes — let them 404 naturally as JSON.
      2. If a real file exists in web/dist (or web/), serve it.
      3. Otherwise serve index.html so React Router can handle the path.
    """
    from fastapi.responses import FileResponse as FR

    # Don't hijack API / docs / static-mount paths.
    reserved_prefixes = (
        "api/", "demo/",
        "docs", "redoc", "openapi.json",
    )
    if full_path.startswith(reserved_prefixes):
        raise HTTPException(status_code=404, detail="Not Found")

    # Serve a real static asset if one matches (e.g. /favicon.ico, /assets/foo.js).
    for base in [web_dist, web_dir]:
        real_file = base / full_path
        if full_path and real_file.exists() and real_file.is_file():
            return FR(str(real_file))

    # Otherwise hand off to the SPA's index.html.
    for base in [web_dist, web_dir]:
        index = base / "index.html"
        if index.exists():
            return FR(str(index))

    raise HTTPException(status_code=404, detail="Web UI not found")


# ══════════════════════════════
# Run
# ══════════════════════════════

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=PORT,
        reload=True,
    )
