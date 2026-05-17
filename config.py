# config.py
"""Central configuration — reads from environment variables."""

import os
from dotenv import load_dotenv

load_dotenv()

# --- Inject FFmpeg into System PATH dynamically ---
FFMPEG_PATH = os.getenv("FFMPEG_PATH")
if FFMPEG_PATH and os.path.exists(FFMPEG_PATH):
    ffmpeg_dir = os.path.dirname(FFMPEG_PATH)
    os.environ["PATH"] = f"{ffmpeg_dir}{os.pathsep}{os.environ.get('PATH', '')}"

REMOTION_CHROME_EXECUTABLE = os.getenv("REMOTION_CHROME_EXECUTABLE")

# ── API Keys ──
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
PEXELS_API_KEY: str = os.getenv("PEXELS_API_KEY", "")
GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")  # Gemini LLM + TTS
ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY", "")  # Premium TTS
QWEN_API_KEY: str = os.getenv("QWEN_API_KEY", "")  # DashScope / Qwen
QWEN_BASE_URL: str = os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
# Rerank models use a separate endpoint (not chat/completions)
QWEN_RERANK_URL: str = os.getenv(
    "QWEN_RERANK_URL",
    "https://dashscope-intl.aliyuncs.com/compatible-api/v1/reranks",
)
VBEE_APP_ID: str = os.getenv("VBEE_APP_ID", "")  # Vbee Vietnamese TTS
VBEE_API_TOKEN: str = os.getenv("VBEE_API_TOKEN", "")  # Vbee API JWT token


# ── Auth ──
DEFAULT_JWT_SECRET_KEY = "dev-secret-change-me-please-override-this-in-production"
JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", DEFAULT_JWT_SECRET_KEY)
JWT_ALGORITHM: str = "HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# ── Database ──
# MVP:        sqlite+aiosqlite:///data/autoclip.db
# Production: postgresql+asyncpg://user:pass@host/autoclip
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:///data/autoclip.db",
)

# Railway provides "postgresql://", but SQLAlchemy async needs "postgresql+asyncpg://"
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgres://"):
    # Some older versions use postgres://
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)

# ── CORS ──
# MVP (Railway monolith): "*" — same-origin, no CORS needed
# Production (Vercel + Railway): whitelist Vercel domain
ALLOWED_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if o.strip()
]

# ── Paths ──
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR: str = os.getenv("OUTPUT_DIR", "output")
REMOTION_DIR: str = os.getenv("REMOTION_DIR", "remotion")

# Ensure output directory exists (especially for custom mounts like on Railway)
if not os.path.isabs(OUTPUT_DIR):
    os.makedirs(os.path.join(PROJECT_ROOT, OUTPUT_DIR), exist_ok=True)
else:
    os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Redis ──
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_JOB_TTL_SECONDS: int = int(os.getenv("REDIS_JOB_TTL_SECONDS", "86400"))
REDIS_SSE_MAX_CONNECTIONS: int = int(os.getenv("REDIS_SSE_MAX_CONNECTIONS", "20"))
JOB_STORE_BACKEND: str = os.getenv("JOB_STORE_BACKEND", "auto").strip().lower()
if JOB_STORE_BACKEND not in {"auto", "redis", "file"}:
    JOB_STORE_BACKEND = "auto"

# ── ARQ worker queue ──
ARQ_MAX_JOBS: int = int(os.getenv("ARQ_MAX_JOBS", "20"))
ARQ_JOB_TIMEOUT_SECONDS: int = int(os.getenv("ARQ_JOB_TIMEOUT_SECONDS", "1800"))
ARQ_KEEP_RESULT_SECONDS: int = int(os.getenv("ARQ_KEEP_RESULT_SECONDS", "3600"))
ARQ_MAX_TRIES: int = int(os.getenv("ARQ_MAX_TRIES", "1"))
ARQ_HEALTH_CHECK_INTERVAL_SECONDS: int = int(
    os.getenv("ARQ_HEALTH_CHECK_INTERVAL_SECONDS", "30")
)

# ── TTS & Audio ──
DEFAULT_TTS_ENGINE: str = os.getenv("DEFAULT_TTS_ENGINE", "openai")
# Options: "openai" | "edge-tts" | "elevenlabs" | "gemini" | "vbee"
DEFAULT_VOICE: str = os.getenv("DEFAULT_VOICE", "nova")
WHISPER_MODEL_NAME: str = os.getenv("WHISPER_MODEL_NAME", "tiny")


# ── Content Parser LLM ──
CONTENT_PARSER_PROVIDER: str = os.getenv("CONTENT_PARSER_PROVIDER", "openai").strip().lower()
_CONTENT_PARSER_LEGACY_MODEL: str = os.getenv("CONTENT_PARSER_MODEL", "").strip()
CONTENT_PARSER_OPENAI_MODEL: str = (
    os.getenv("CONTENT_PARSER_OPENAI_MODEL")
    or (_CONTENT_PARSER_LEGACY_MODEL if CONTENT_PARSER_PROVIDER == "openai" else "")
).strip()
CONTENT_PARSER_QWEN_MODEL: str = (
    os.getenv("CONTENT_PARSER_QWEN_MODEL")
    or (_CONTENT_PARSER_LEGACY_MODEL if CONTENT_PARSER_PROVIDER == "qwen" else "")
).strip()
# Backward-compatible alias for the active provider model.
CONTENT_PARSER_MODEL: str = (
    CONTENT_PARSER_QWEN_MODEL if CONTENT_PARSER_PROVIDER == "qwen" else CONTENT_PARSER_OPENAI_MODEL
)

# ── ScriptAgent LLM ──
# Defaults to Content Parser config for backward compatibility.
SCRIPT_AGENT_PROVIDER: str = (
    os.getenv("SCRIPT_AGENT_PROVIDER") or CONTENT_PARSER_PROVIDER
).strip().lower()
_SCRIPT_AGENT_LEGACY_MODEL: str = os.getenv("SCRIPT_AGENT_MODEL", "").strip()
SCRIPT_AGENT_OPENAI_MODEL: str = (
    os.getenv("SCRIPT_AGENT_OPENAI_MODEL")
    or (_SCRIPT_AGENT_LEGACY_MODEL if SCRIPT_AGENT_PROVIDER == "openai" else "")
    or CONTENT_PARSER_OPENAI_MODEL
).strip()
SCRIPT_AGENT_QWEN_MODEL: str = (
    os.getenv("SCRIPT_AGENT_QWEN_MODEL")
    or (_SCRIPT_AGENT_LEGACY_MODEL if SCRIPT_AGENT_PROVIDER == "qwen" else "")
    or CONTENT_PARSER_QWEN_MODEL
).strip()
# Backward-compatible alias for the active provider model.
SCRIPT_AGENT_MODEL: str = (
    SCRIPT_AGENT_QWEN_MODEL if SCRIPT_AGENT_PROVIDER == "qwen" else SCRIPT_AGENT_OPENAI_MODEL
)

# ── VLM Media Reranker ──
VLM_RERANK_ENABLED: bool = os.getenv("VLM_RERANK_ENABLED", "true").strip().lower() in {
    "1", "true", "yes", "on"
}
VLM_RERANK_PROVIDER: str = os.getenv("VLM_RERANK_PROVIDER", "q").strip().lower()
VLM_RERANK_MODEL: str = os.getenv("VLM_RERANK_MODEL", "qwen3-omni-flash").strip()
VLM_RERANK_MAX_CANDIDATES: int = int(os.getenv("VLM_RERANK_MAX_CANDIDATES", "5"))
VLM_RERANK_TIMEOUT_SECONDS: float = float(os.getenv("VLM_RERANK_TIMEOUT_SECONDS", "10"))
VLM_RERANK_MAX_CONCURRENCY: int = int(os.getenv("VLM_RERANK_MAX_CONCURRENCY", "3"))

# ── VLM Rerank Audit (Approach 1 + 5) ──
VLM_AUDIT_ENABLED: bool = os.getenv("VLM_AUDIT_ENABLED", "true").strip().lower() in {
    "1", "true", "yes", "on"
}
# Approach 1: confidence gating
VLM_AUDIT_MIN_CONFIDENCE: float = float(os.getenv("VLM_AUDIT_MIN_CONFIDENCE", "0.55"))
# Approach 5: rule-based thresholds
VLM_AUDIT_MIN_DURATION_RATIO: float = float(os.getenv("VLM_AUDIT_MIN_DURATION_RATIO", "0.9"))
VLM_AUDIT_ASPECT_TOLERANCE: float = float(os.getenv("VLM_AUDIT_ASPECT_TOLERANCE", "0.15"))
VLM_AUDIT_REQUIRE_KEYWORD_OVERLAP: bool = os.getenv(
    "VLM_AUDIT_REQUIRE_KEYWORD_OVERLAP", "false"
).strip().lower() in {"1", "true", "yes", "on"}

# ── Story Beats Fallback (Concept D) ──
# Convert audit-failed scenes into procedural emoji + text "story beat" scenes
# rendered by Remotion (no external media required).
STORY_BEAT_ENABLED: bool = os.getenv("STORY_BEAT_ENABLED", "true").strip().lower() in {
    "1", "true", "yes", "on"
}
# When true, use Qwen LLM to decompose narration into semantic beats.
# When false, use pure rule-based word-gap splitting.
STORY_BEAT_LLM_ENABLED: bool = os.getenv("STORY_BEAT_LLM_ENABLED", "true").strip().lower() in {
    "1", "true", "yes", "on"
}
# Qwen model used for beat extraction. Cheap & fast model recommended.
STORY_BEAT_LLM_MODEL: str = os.getenv("STORY_BEAT_LLM_MODEL", "qwen-turbo").strip()
# Max number of beats per scene (visual cap — 5 fits 9:16 nicely).
STORY_BEAT_MAX_BEATS: int = int(os.getenv("STORY_BEAT_MAX_BEATS", "5"))
# Min duration of a beat in ms; merge shorter ones into neighbors so user can read.
STORY_BEAT_MIN_BEAT_MS: int = int(os.getenv("STORY_BEAT_MIN_BEAT_MS", "800"))
# LLM call timeout (seconds).
STORY_BEAT_LLM_TIMEOUT_SECONDS: float = float(os.getenv("STORY_BEAT_LLM_TIMEOUT_SECONDS", "8"))

# ── Semantic Query Builder ──
SEMANTIC_QUERY_ENABLED: bool = os.getenv("SEMANTIC_QUERY_ENABLED", "true").strip().lower() in {
    "1", "true", "yes", "on"
}
SEMANTIC_QUERY_MAX_WORDS: int = int(os.getenv("SEMANTIC_QUERY_MAX_WORDS", "10"))
SEMANTIC_LLM_QUERY_ENABLED: bool = os.getenv("SEMANTIC_LLM_QUERY_ENABLED", "true").strip().lower() in {
    "1", "true", "yes", "on"
}

# ── Rendering ──
MAX_CONCURRENT_RENDERS: int = int(os.getenv("MAX_CONCURRENT_RENDERS", "5"))

# ── Pexels API concurrency (200 req/hr limit) ──
PEXELS_MAX_CONCURRENCY: int = int(os.getenv("PEXELS_MAX_CONCURRENCY", "5"))

# ── Per-user job queue limit ──
MAX_CONCURRENT_PIPELINE_JOBS_PER_USER: int = int(os.getenv("MAX_CONCURRENT_PIPELINE_JOBS_PER_USER", "10"))

# ── Environment ──
ENV: str = os.getenv("ENV", "development").strip().lower()

# ── Admin Seed ──
ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "")
ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "")
ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "")

# ── Quota ──
MAX_VIDEOS_PER_DAY: int = int(os.getenv("MAX_VIDEOS_PER_DAY", "50"))

# ── Sentry (optional) ──
SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")

# ── Railway ──
PORT: int = int(os.getenv("PORT", "8000"))


# ── Startup Validation (production safety) ──
def validate_production_config() -> None:
    """Raise immediately if critical secrets use default values in production."""
    if ENV != "production":
        return

    errors: list[str] = []

    # Check JWT Secret
    if JWT_SECRET_KEY in (
        DEFAULT_JWT_SECRET_KEY,
        "dev-secret-change-me",
        "change-this-to-a-random-string",
        "",
    ):
        errors.append("JWT_SECRET_KEY must be set to a strong random value in production")

    # Check OpenAI Key
    if not OPENAI_API_KEY or "your-openai-key" in OPENAI_API_KEY:
        errors.append("OPENAI_API_KEY is missing or uses a placeholder")

    # Check Pexels Key
    if not PEXELS_API_KEY or "your-pexels-key" in PEXELS_API_KEY:
        errors.append("PEXELS_API_KEY is missing or uses a placeholder")

    # Check Database
    if DATABASE_URL.startswith("sqlite"):
        # Not fatal, but worth a warning in logs (we can't easily block if user intentionally uses SQLite)
        print("WARNING: Production environment detected but using SQLite. Persistent volume required.", file=sys.stderr)

    if errors:
        import sys
        print("\n" + "="*50, file=sys.stderr)
        print("FATAL CONFIGURATION ERROR", file=sys.stderr)
        print("="*50, file=sys.stderr)
        for e in errors:
            print(f" - {e}", file=sys.stderr)
        print("="*50 + "\n", file=sys.stderr)
        sys.exit(1)


validate_production_config()

