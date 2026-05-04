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
JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRY_HOURS: int = 24

# ── Database ──
# MVP:        sqlite+aiosqlite:///data/autoclip.db
# Production: postgresql+asyncpg://user:pass@host/autoclip
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:///data/autoclip.db",
)

# ── CORS ──
# MVP (Railway monolith): "*" — same-origin, no CORS needed
# Production (Vercel + Railway): whitelist Vercel domain
ALLOWED_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if o.strip()
]

# ── Paths ──
OUTPUT_DIR: str = os.getenv("OUTPUT_DIR", "output")
REMOTION_DIR: str = os.getenv("REMOTION_DIR", "remotion")

# ── Redis ──
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_JOB_TTL_SECONDS: int = int(os.getenv("REDIS_JOB_TTL_SECONDS", "86400"))
JOB_STORE_BACKEND: str = os.getenv("JOB_STORE_BACKEND", "auto").strip().lower()
if JOB_STORE_BACKEND not in {"auto", "redis", "file"}:
    JOB_STORE_BACKEND = "auto"

# ── TTS ──
DEFAULT_TTS_ENGINE: str = os.getenv("DEFAULT_TTS_ENGINE", "openai")
# Options: "openai" | "edge-tts" | "elevenlabs" | "gemini" | "vbee"
DEFAULT_VOICE: str = os.getenv("DEFAULT_VOICE", "nova")

# ── Content Parser LLM ──
CONTENT_PARSER_PROVIDER: str = os.getenv("CONTENT_PARSER_PROVIDER", "openai").strip().lower()
CONTENT_PARSER_MODEL: str = os.getenv("CONTENT_PARSER_MODEL", "gpt-4o-mini").strip()

# ── VLM Media Reranker ──
VLM_RERANK_ENABLED: bool = os.getenv("VLM_RERANK_ENABLED", "true").strip().lower() in {
    "1", "true", "yes", "on"
}
VLM_RERANK_PROVIDER: str = os.getenv("VLM_RERANK_PROVIDER", "openai").strip().lower()
VLM_RERANK_MODEL: str = os.getenv("VLM_RERANK_MODEL", "gpt-4o-mini").strip()
VLM_RERANK_MAX_CANDIDATES: int = int(os.getenv("VLM_RERANK_MAX_CANDIDATES", "5"))
VLM_RERANK_TIMEOUT_SECONDS: float = float(os.getenv("VLM_RERANK_TIMEOUT_SECONDS", "10"))
VLM_RERANK_MAX_CONCURRENCY: int = int(os.getenv("VLM_RERANK_MAX_CONCURRENCY", "3"))

# ── Semantic Query Builder ──
SEMANTIC_QUERY_ENABLED: bool = os.getenv("SEMANTIC_QUERY_ENABLED", "true").strip().lower() in {
    "1", "true", "yes", "on"
}
SEMANTIC_QUERY_MAX_WORDS: int = int(os.getenv("SEMANTIC_QUERY_MAX_WORDS", "4"))
SEMANTIC_LLM_QUERY_ENABLED: bool = os.getenv("SEMANTIC_LLM_QUERY_ENABLED", "true").strip().lower() in {
    "1", "true", "yes", "on"
}

# ── Rendering ──
MAX_CONCURRENT_RENDERS: int = int(os.getenv("MAX_CONCURRENT_RENDERS", "1"))

# ── Railway ──
PORT: int = int(os.getenv("PORT", "8000"))

# ── Story Beats Fallback (Concept D) ──  [CryptoVN Custom]
STORY_BEAT_LLM_ENABLED: bool = os.getenv("STORY_BEAT_LLM_ENABLED", "true").strip().lower() in {
    "1", "true", "yes", "on"
}
STORY_BEAT_LLM_MODEL: str = os.getenv("STORY_BEAT_LLM_MODEL", "qwen3.5-flash").strip()
STORY_BEAT_LLM_TIMEOUT_SECONDS: float = float(os.getenv("STORY_BEAT_LLM_TIMEOUT_SECONDS", "8"))
STORY_BEAT_MAX_BEATS: int = int(os.getenv("STORY_BEAT_MAX_BEATS", "5"))
STORY_BEAT_MIN_BEAT_MS: int = int(os.getenv("STORY_BEAT_MIN_BEAT_MS", "1500"))

