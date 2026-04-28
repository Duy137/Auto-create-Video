"""AutoClip API — FastAPI Application.

Production-ready server with:
- Auth + Jobs routes (api/routes.py)
- Demo routes (api/demo_router.py) — backward compatible
- Database initialization on startup
- Static file serving for web/ frontend
- Output file serving
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger

from api.database import init_db
from api.demo_router import router as demo_router
from api.routes import router as production_router
from config import ALLOWED_ORIGINS, OUTPUT_DIR, PORT, REMOTION_DIR


# ══════════════════════════════
# Lifespan — startup / shutdown
# ══════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # ── Startup ──
    logger.info("🚀 AutoClip API starting up...")

    # Initialise database tables
    await init_db()
    logger.info("✅ Database initialized")

    # Ensure output directory exists
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

    yield

    # ── Shutdown ──
    logger.info("👋 AutoClip API shutting down")


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
# CORS Middleware
# ══════════════════════════════

# MVP: same-origin ("*") — no CORS issues
# Production: whitelist Vercel domain via ALLOWED_ORIGINS env var
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS and ALLOWED_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ══════════════════════════════
# Routers
# ══════════════════════════════

# Production routes (auth, jobs, SSE, TTS, BGM)
app.include_router(production_router)

# Demo routes (backward compatible at /api/demo/*)
app.include_router(demo_router)


# ══════════════════════════════
# Static File Mounts
# ══════════════════════════════

# Serve rendered outputs (videos, audio, media)
output_path = Path(OUTPUT_DIR).resolve()
output_path.mkdir(parents=True, exist_ok=True)
app.mount("/api/outputs", StaticFiles(directory=str(output_path)), name="outputs")

# Serve demo outputs at legacy path too
app.mount("/api/demo/outputs", StaticFiles(directory=str(output_path)), name="demo_outputs")

# Remotion assets (for preview)
assets_path = Path(REMOTION_DIR) / "public" / "assets"
assets_path.mkdir(parents=True, exist_ok=True)
app.mount("/api/demo/assets", StaticFiles(directory=str(assets_path)), name="assets")

# Demo UI at /demo/
static_dir = Path(__file__).parent / "static" / "demo"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/demo", StaticFiles(directory=str(static_dir), html=True), name="demo_ui")

# Production frontend at /web/ (serve built assets from web/dist/)
web_dist_dir = Path(__file__).parent.parent / "web" / "dist"
if web_dist_dir.exists():
    app.mount("/web", StaticFiles(directory=str(web_dist_dir), html=True), name="web_ui")
    logger.info(f"✅ Web UI mounted at /web/ from {web_dist_dir}")


# ══════════════════════════════
# Root redirect
# ══════════════════════════════

@app.get("/", include_in_schema=False)
async def root():
    """Redirect root to web UI (or demo if web/ doesn't exist)."""
    web_dist = Path(__file__).parent.parent / "web" / "dist"
    web_dir = Path(__file__).parent.parent / "web"
    if (web_dist.exists() and (web_dist / "index.html").exists()):
        return RedirectResponse(url="/web/")
    if (web_dir.exists() and (web_dir / "index.html").exists()):
        return RedirectResponse(url="/web/")
    return RedirectResponse(url="/demo/")


# ══════════════════════════════
# SPA Catch-All (React Router)
# ══════════════════════════════

@app.get("/web/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    """Serve index.html for any /web/* path that isn't a real file.

    This enables React Router client-side routing — paths like
    /web/login, /web/dashboard are handled by the React app.
    StaticFiles(html=True) only works for the root, not sub-paths.
    """
    from fastapi.responses import FileResponse as FR

    # Try web/dist/ first (production build), then web/ (dev)
    web_dist = Path(__file__).parent.parent / "web" / "dist"
    web_dir = Path(__file__).parent.parent / "web"

    # Check if it's a real static file (js, css, png, etc.)
    for base in [web_dist, web_dir]:
        real_file = base / full_path
        if real_file.exists() and real_file.is_file():
            return FR(str(real_file))

    # Otherwise serve index.html (SPA fallback)
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
