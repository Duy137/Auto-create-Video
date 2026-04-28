# 🎬 AutoClip AI — Session Context

> **Last updated**: 2026-04-26  
> **Branch**: `UIUX`  
> **Status**: E2E pipeline stabilized. **4 TTS engines** integrated (OpenAI, ElevenLabs, Gemini, Edge-TTS). Native word timestamps (ElevenLabs) + smart Whisper skip. Accurate audio duration via mutagen. Custom media upload (drag-drop). Render sync fixed. Production-ready.
> **Paste this file at the start of a new session to resume work.**

---

## What Is This Project?

AutoClip is an AI pipeline that converts **finished text** into short vertical videos (9:16).

```
User pastes text → AI parses → TTS voice (4 engines) → Pexels media → Remotion renders → MP4 output
```

**Not** a content generator — it only does post-production on text the user provides.

---

## Architecture

```
React + Vite (TypeScript)                TypeScript (Remotion)
───────────────────────────────────         ─────────────────────
• Shadcn UI + Tailwind CSS                  • 6 scene templates (React)
• Lucide Icons + Sonner (Toast)             • @remotion/captions subtitles
• Professional 3-Pane Studio Editor         • KaTeX math formulas
• JWT auth + axios/fetch client             • CSS animations + transitions
• Video preview + Scene editing             • CLI render → MP4
• 4 TTS engines UI (voice/model picker)     • OffthreadVideo (frame-accurate)

    Output: video_props.json ──→ Input: Remotion reads JSON
```

---

## Project Structure (Key Files)

```
A20-App-160/
├── api/
│   ├── main.py          # FastAPI app, CORS, static mounts
│   ├── routes.py        # 13 production endpoints (auth, jobs, review, SSE, TTS, BGM)
│   ├── auth.py          # JWT + bcrypt
│   ├── database.py      # SQLAlchemy async (SQLite MVP / PostgreSQL prod)
│   ├── models.py        # Pydantic request/response schemas
│   └── demo_router.py   # Legacy demo endpoints (backward compat)
├── app/
│   ├── orchestrator.py  # LangGraph pipeline
│   ├── state.py         # VideoProps Pydantic model (JSON Contract)
│   └── nodes/           # Pipeline nodes (validator, parser, TTS, media, renderer)
│       └── _openai_client.py  # Singleton AsyncOpenAI client
│       # tts_synthesizer.py has 4 engines: OpenAI, ElevenLabs, Gemini, EdgeTTS
├── remotion/
│   ├── src/
│   │   ├── AutoClipVideo.tsx      # Main composition
│   │   ├── scenes/                # TitleCard, StockBackground, InfoCard, StatsHighlight, Diagram, EmojiGrid
│   │   ├── components/            # AnimatedCaption, BackgroundVideo, ProgressBar, Watermark
│   │   ├── schemas/videoProps.ts  # Zod schema (JSON Contract)
│   │   └── lib/                   # utils, fonts, transitions, animations
│   └── package.json               # Remotion 4.0.448, Zod 4.3.6
├── web/                 # Vite + React scaffolded (Day 3: build UI)
├── config.py            # Central config (env vars, 4 API keys)
├── requirements.txt     # Python deps (google-genai, elevenlabs, mutagen, etc.)
├── documents/
│   ├── MASTER_PLAN_VI.md              # Full technical spec
│   ├── FRONTEND_IMPLEMENTATION_PLAN.md # Day-by-day build plan (v4.2)
│   ├── WORKLOG.md                     # ADRs + sprint logs
│   ├── JOURNAL.md                     # Weekly journal
│   └── CONTEXT.md                     # ← THIS FILE
└── tests/
    └── test_day2_endpoints.py         # 29 integration tests (all passing)
```

---

## Implementation Progress

| 1 | Database (SQLAlchemy) + Auth (JWT/bcrypt) | ✅ Done |
| 2 | API Routes (10 endpoints) + SSE + Tests | ✅ Done |
| 3 | Design System + Create Page (Setup/Processing/Result) | ✅ Done |
| 4 | Login Page + Dashboard Page (Auth flow verified) | ✅ Done |
| 5-6 | Review View Integration (3-pane Studio Editor) | ✅ Done |
| 7 | Polish + Railway Deploy | ❌ |
| — | **Architectural Audit** (URI path fix, DB session, singleton client) | ✅ Done |
| — | **Pipeline 2 Phases** (tách review mode + 3 endpoints mới) | ✅ Done |
| — | **Frontend Refactor** (TypeScript + Shadcn UI + 20+ components) | ✅ Done |
| — | **Config Fix** (VLM env defaults added to prevent crashes) | ✅ Done |
| — | **ElevenLabs TTS Integration** (native timestamps, smart Whisper skip) | ✅ Done |
| — | **Gemini TTS Integration** (native async, PCM→WAV→MP3, ffmpeg atempo) | ✅ Done |
| — | **Audio Duration Accuracy** (mutagen replaces byte-estimate for all engines) | ✅ Done |
| — | **Director Simplification** (prompt 80→25 dòng + data-driven auto-layout) | ✅ Done |
| — | **Subtitle Text Fidelity** (original text display thay vì TTS-processed) | ✅ Done |
| — | **Round 2 Bug Fixes** (layout stale, scene overflow, collapsed timestamps) | ✅ Done |

### Architectural Audit Fixes (Apr 19)
- **URI→Path fix** (`orchestrator.py`): dùng `str(Path().resolve())` thay vì `file:///` URI
- **DB Session SSE** (`routes.py`): session đóng trước SSE stream, tránh connection pool exhaustion
- **Singleton OpenAI** (`_openai_client.py`): 1 AsyncOpenAI client cho toàn pipeline
- **TTS Engine cache** (`tts_synthesizer.py`): cache singleton instances

### Plan v4.1 → v4.2 Changes (Apr 19-20)
- Bỏ "Max Clip Duration" (duration do word timestamps quyết định)
- Enhanced Review State: video preview, transition editing, scene type switching, @remotion/player
- Dashboard: stats row → latest video status bar
- Preview Voice đưa lên ngay sau Voice selector
- Thêm §13 Notes for Frontend Developer
- **v4.2**: Bỏ "Video Keywords" từ Setup (chuyển sang Review per-scene re-search)
- **v4.2**: Bỏ Raw JSON toggle (user không cần thấy JSON)
- **v4.2**: Setup redesign: 3-panel → text-hero + 2-panel cân bằng

### Pipeline 2 Phases (Apr 19-20)
- **`orchestrator.py`**: Extract `stage_assets_for_remotion()` — handle 3 URL formats (http, file://, absolute)
- **`routes.py`**: `_run_pipeline_background()` gọi `skip_render=True`, emit `review_ready` SSE
- **`routes.py`**: 3 endpoints mới: render, update props (Scene validation), re-search per-scene
- **`models.py`**: Bỏ `max_clip_duration` + `video_keywords`, thêm 3 request models
- **SSE fix**: Bỏ fake progress events, chỉ 2 events thật (processing + review_ready)
- **Re-search**: Chỉ lưu Pexels URL, không download — frontend preview từ CDN

### TTS Narration Dedup (Apr 19)
- Fix bug lặp câu cuối video do GPT-4o-mini tạo narration overlap giữa 2 scene cuối
- Thêm dedup logic trong `_step_tts()` — trim strict suffix

### New Scene Types & Pipeline Optimization (Apr 20)
- Tích hợp 3 scene types mới: `comparison`, `timeline`, `media_showcase`.
- Text Animation Upgrades: Title card slam entrance + gradient text glow; global subtitle overlay. 
- Refactored Splitter/Director: Splitter không còn xử lý logic phân loại type, tránh lỗi overload ("empty narration"). Director phụ trách gán scene_type.
- Rerank VLM disabled và early return API Media Fetch tiết kiệm 50% chi phí Tokens & Bandwidth.

### E2E Pipeline Stabilization (Apr 21-22)
- **Vite base path** (`vite.config.ts`): Thêm `base: '/web/'` → fix 404 assets khi serve qua FastAPI
- **Static mount fix** (`api/main.py`): Mount `web/dist/` thay vì `web/` → serve built assets đúng
- **ReviewView crash fix**: `useEffect` reference `selectedScene` trước khi khai báo → ReferenceError
- **Props persistence**: PATCH `/props` trước render để save user edits
- **Audio sync**: Clamp `end_ms` scene cuối = `total_duration_ms`
- **Authenticated video playback**: `ResultView` dùng fetch+Blob pattern cho video có auth header

### Custom Media Upload & Review Enhancements (Apr 22)
- **Upload endpoint**: `POST /jobs/{id}/scenes/{idx}/upload-media` — multipart, 50MB video / 5MB ảnh
- **Drag-drop zone**: Toggle upload area, drag-drop + file picker
- **Dual URL strategy**: `media_url` = local path (Remotion staging), `preview_url` = serve URL (browser)
- **PATCH merge**: Backend merge client edits vào existing scene, giữ nguyên `media_url` gốc
- **Render validation**: Block render nếu stock scene thiếu media
- **Auto-search**: Đổi sang stock type → auto search Pexels nếu có query sẵn
- **Cinema/fullscreen preview**: Center pane apply layout cho `media_showcase`
- **Layout selector**: Dropdown Cinema/Fullscreen cho `media_showcase`

### Render Pipeline Fixes (Apr 23-24)
- **Bug 1 — Scene edits lost in render**: Root cause = `dict(job.props)` shallow copy khiến `scenes` list shared giữa old/new dict → SQLAlchemy JSON equality check thấy `old == new` → skip SQL UPDATE. Fix: deep-copy scenes list `[dict(s) for s in scenes]` + `flag_modified(job, "props")` belt-and-suspenders. Ảnh hưởng 2 endpoints: `re-search` và `upload-media`.
- **Bug 2 — Video jitter**: Remotion multi-threaded render (default concurrency = max CPUs) gây seeking inaccurate cho stock videos. Fix: `--concurrency=1` + đổi `<Video>` → `<OffthreadVideo>` (FFmpeg-based frame extraction, frame-accurate). Sửa 3 files: `video_renderer.py`, `BackgroundVideo.tsx`, `MediaShowcase.tsx`.
- **Diagnostic logging**: Thêm 3 checkpoint logs (`PATCH COMMIT`, `RENDER READ`, `STAGED RENDER JSON`) để trace data flow qua pipeline. Giúp xác nhận root cause chính xác.
- **Methodology**: Architect-Builder AI debate pattern — Architect phân tích → Builder phản biện → consensus → diagnostic verify → fix.

### TTS Engine Integration (Apr 25-26)
- **ElevenLabs TTS** (Premium): Native word timestamps via `convert_with_timestamps` → skip Whisper alignment. AsyncElevenLabs client. 10 curated Vietnamese voices (5 male / 5 female). Model selector (v3 / Flash v2.5). Custom Voice ID support. Speed param (0.7–1.2) with clamping.
- **Gemini TTS** (Standard): Native async via `client.aio.models.generate_content()`. PCM→WAV→MP3 conversion. 16 voices (9 male / 7 female). 3 models (3.1 Flash ⭐ / 2.5 Flash / 2.5 Pro). Speech rate via ffmpeg `atempo` filter (0.5x–4.0x).
- **Shared Infrastructure**: `_get_audio_duration_ms()` (mutagen) replaces byte-estimate across all engines. `_apply_speech_rate_ffmpeg()` shared helper. Generic cache key refactor (`_model_key_map`). TTS preview endpoint unified via `get_tts_engine()` factory.
- **Frontend**: SetupView updated with voice/model pickers for all 4 engines, custom Voice ID input for ElevenLabs.

### Director Simplification & Auto-Layout (Apr 27)
- **Director Prompt Simplification**: Rút gọn từ ~80 dòng → ~25 dòng. Bỏ layout instruction (LLM không nên quyết định layout trước khi có data). Giảm token cost.
- **Data-driven `_auto_layout()`** (`content_parser.py`): Heuristic chọn layout dựa trên data thực từ Enricher — `info_card` 4 items → `grid_2x2`, 2 items → `vertical_stack`, `stats_highlight` ≤2 → `horizontal_grid`. Chạy **post-Enricher** trong `_merge_phases()`.
- **SPLITTER_PROMPT word limit**: Thêm rule 15-40 words/scene, conclude ≤30 words, tránh text tràn viewport 9:16.

### Subtitle Text Fidelity Fix (Apr 28)
- **Root cause**: `word_timestamps` chứa text đã bị `preprocess_for_tts()` biến đổi (AI→A.I., 100→một trăm). Remotion render `word.text` → hiển thị processed text thay vì text gốc.
- **Fix (Architect đề xuất)**: Đổi `original_text=processed_full` → `full_narration` trong Whisper alignment call (`orchestrator.py:158`). 1 dòng thay đổi, 0 sửa frontend.
- **Scene timing fix**: Đổi `processed_word_counts` → `original_word_counts` để `assign_scene_timing()` match word_timestamps (giờ là original words).
- **Methodology**: Builder đề xuất mapping ~100 dòng → Architect phản biện → chỉ ra fix 1 dòng đơn giản hơn → test verify → fix timing bổ sung.

### Round 2 Bug Fixes (Apr 28)
- **Bug 1 (Critical) — Layout stale**: Đổi `scene_type` qua PATCH → layout cũ giữ nguyên → `stock_background` + `center_focus` = media ẩn. Fix: gọi `_auto_layout()` trong PATCH handler khi `scene_type` thay đổi (`routes.py`).
- **Bug 2 (High) — Scene overflow**: Scene conclude 65 words + font 52px → text tràn viewport 9:16. Fix: (a) word limit rule trong SPLITTER_PROMPT, (b) adaptive font-size trong `StockBackground.tsx` (>200 chars → 38px, >120 → 44px).
- **Bug 3 (Medium) — Whisper collapsed timestamps**: stable-ts fail align → 8 words có `start_ms == end_ms` → flash trong 1 frame. Fix: `_fix_collapsed_timestamps()` 2-phase trong `word_aligner.py` — detect collapsed groups rồi redistribute timing evenly.

### Commits on UIUX Branch
```
5431dcc chore: scaffold web project and update implementation plans
c783f3e fix: Remotion - zod v4 upgrade, font optimization, interpolate crash
aebce70 feat: Day 2 - production API routes + SSE + tests (29/29 passing)
01cab8a chore: gitignore database files (data/, *.db, WAL/journal)
80dcb87 feat: Day 1 - database + auth + models + alembic migration
708bca1 docs: resolve open questions - keep scene review, use free domains (v4.3)
f82f795 docs: add comprehensive frontend implementation plan v4.0
```

---

## API Endpoints (All Working)

| Method | Endpoint | Auth | Purpose |
|--------|----------|:----:|---------|
| `POST` | `/api/auth/register` | ❌ | Register new user |
| `POST` | `/api/auth/login` | ❌ | Login → JWT |
| `GET` | `/api/auth/me` | 🔒 | Current user info |
| `POST` | `/api/jobs` | 🔒 | Create video job → Phase 1 (stops at review) |
| `GET` | `/api/jobs` | 🔒 | List jobs (paginated) |
| `GET` | `/api/jobs/{id}` | 🔒 | Job detail (includes props when status=review) |
| `GET` | `/api/jobs/{id}/progress` | 🔒 | SSE progress stream |
| `GET` | `/api/jobs/{id}/download` | 🔒 | Download MP4 |
| `POST` | `/api/tts/preview` | 🔒 | Voice preview audio |
| `POST` | `/api/bgm/upload` | 🔒 | Upload BGM ≤10MB |
| `POST` | `/api/jobs/{id}/render` | 🔒 | ✅ Phase 2 — Trigger render from reviewed props |
| `PATCH` | `/api/jobs/{id}/props` | 🔒 | ✅ Update scene props (Scene model validated) |
| `POST` | `/api/jobs/{id}/scenes/{idx}/re-search` | 🔒 | ✅ Re-search media per-scene (saves Pexels URL) |
| `POST` | `/api/jobs/{id}/scenes/{idx}/upload-media` | 🔒 | ✅ Upload custom image/video (50MB video, 5MB image) |

---

## How To Run

```powershell
# Terminal 1: Start API server
cd A20-App-160
.\venv\Scripts\python.exe -m uvicorn api.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Run tests
$env:PYTHONIOENCODING='utf-8'; .\venv\Scripts\python.exe tests\test_day2_endpoints.py

# Terminal 3: Remotion Studio (optional)
cd remotion
cmd /c "npx remotion studio"
```

**Note**: Windows PowerShell blocks `npm` by default. Use `cmd /c "npm ..."` wrapper.

---

## Current Status

**Core UI + Pipeline**: ✅ Fully Functional.
- Register → Auto-login → Create Page → Dashboard all work.
- Professional 3-pane Studio Editor for scene review and re-search.
- 4 TTS engines fully integrated with UI and backend.
- ElevenLabs native timestamps → smart Whisper skip.
- Accurate audio duration (mutagen) across all engines.

**Next implementation focus**:

1. **Production Deployment**: Dockerize + Deploy to Railway.
2. **Testing**: End-to-end test all 4 TTS engines.
3. **Mobile Responsive**: Dashboard Grid & Setup panels.

---

## Key Technical Decisions

- **Vite + React (TypeScript)** for frontend — 100% type-safe, using Shadcn UI for a consistent and premium aesthetic.
- **Lucide React** for icons — tree-shakeable, clean stroke style.
- **Sonner** for notifications — reliable and lightweight toast system.
- **SQLite for MVP** — swap to PostgreSQL by changing 1 env var (`DATABASE_URL`)
- **Same-origin deploy** — FastAPI serves `web/` static files, no CORS needed for MVP
- **GPT-4o-mini** for content parsing (not Gemini) — shares API key with TTS
- **4 TTS engines**: OpenAI (primary) → Gemini (standard) → ElevenLabs (premium) → Edge-TTS (free fallback)
- **ElevenLabs native timestamps** — skip Whisper alignment when word_boundaries available
- **Gemini native async** — `client.aio` not `asyncio.to_thread`, PCM→WAV→MP3
- **mutagen for audio duration** — replaces byte-estimate `(len/16000)*1000` across all engines
- **ffmpeg atempo** — shared speech rate helper for engines without native speed control
- **Pexels Videos** for backgrounds (not static images)
- **All UI labels in English**
- **Max Clip Duration removed (v4.1)** — duration do word timestamps quyết định
- **Pipeline 2 Phases (done)** — tách review mode, user sửa scene trước khi render
- **Re-search per-scene** — chỉ lưu Pexels URL, download khi staging (tiết kiệm bandwidth)
- **Scene Type Switching (v4.2)** — UI dropdown qua PATCH /props. Mini-enricher deferred.
- **@remotion/player (v4.1)** — live preview trong Review state
- **Singleton OpenAI client** — 1 AsyncOpenAI instance, tránh TCP/TLS overhead
- **Video Keywords bỏ khỏi Setup (v4.2)** — chuyển sang Review per-scene edit
- **Raw JSON toggle bỏ (v4.2)** — user không cần thấy JSON
- **Cost Optimizations** — VLM reranking tắt, Pexels media search skipped cho các scene không phải stock (giảm 50% cost & bw).
- **Splitter/Director Separation** — Splitter chỉ đảm nhận tách nội dung, Director đảm nhận xếp loại layout/type triệt để lỗi LLM.
- **Generic TTS cache factory** — model-aware cache key via `_model_key_map` dict pattern
- **TTS preview unified** — `preview_voice()` route uses `get_tts_engine()` factory for all 4 engines
- **Data-driven auto-layout** — `_auto_layout()` post-Enricher heuristic replaces LLM random layout assignment
- **Subtitle text fidelity** — Whisper alignment dùng `full_narration` (original) thay vì `processed_full`, kèm `original_word_counts` cho scene timing
- **Collapsed timestamp recovery** — `_fix_collapsed_timestamps()` 2-phase detect+redistribute cho words Whisper fail align (<10ms)
- **Adaptive font-size** — `StockBackground.tsx` scale font down cho narration dài (>200 chars → 38px), safety net cho LLM word limit rule
