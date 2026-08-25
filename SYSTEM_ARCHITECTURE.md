# 🎬 AutoClip — System Architecture Guide

> **Mục tiêu:** Sau khi đọc xong tài liệu này, bạn sẽ hình dung được toàn bộ logic vận hành và flow data của hệ thống, từ lúc user nhập text đến khi video MP4 hoàn chỉnh được tạo ra.

---

## 📖 Thứ tự đọc file được khuyến nghị

Đọc theo thứ tự này để hiểu từ trên xuống dưới (big picture → chi tiết):

| # | File | Tại sao đọc file này trước |
|---|------|---------------------------|
| 1 | [`config.py`](file:///d:/Developer/Auto%20create%20Video/config.py) | Toàn bộ API keys, feature flags, và cấu hình hệ thống |
| 2 | [`app/state.py`](file:///d:/Developer/Auto%20create%20Video/app/state.py) | **Data contract trung tâm** — mọi data đều chảy qua `AgentState` |
| 3 | [`api/database.py`](file:///d:/Developer/Auto%20create%20Video/api/database.py) | ORM models: User, Job, Project — hiểu DB schema |
| 4 | [`app/pipeline/graph.py`](file:///d:/Developer/Auto%20create%20Video/app/pipeline/graph.py) | **Bộ điều phối pipeline** — thứ tự chạy các stage |
| 5 | [`api/main.py`](file:///d:/Developer/Auto%20create%20Video/api/main.py) | FastAPI app entry point, middleware, startup lifecycle |
| 6 | [`api/routes.py`](file:///d:/Developer/Auto%20create%20Video/api/routes.py) | Tất cả API endpoints — nơi user request được nhận |
| 7 | [`app/pipeline/stages/script_stage.py`](file:///d:/Developer/Auto%20create%20Video/app/pipeline/stages/script_stage.py) | ScriptAgent — LLM viết kịch bản từ topic |
| 8 | [`app/pipeline/stages/tts_stage.py`](file:///d:/Developer/Auto%20create%20Video/app/pipeline/stages/tts_stage.py) | TTS + Word Alignment |
| 9 | [`app/pipeline/stages/media_stage.py`](file:///d:/Developer/Auto%20create%20Video/app/pipeline/stages/media_stage.py) | Tìm media (Pexels) + VLM Reranker |
| 10 | [`app/pipeline/stages/render_stage.py`](file:///d:/Developer/Auto%20create%20Video/app/pipeline/stages/render_stage.py) | Gọi Remotion render video |
| 11 | [`api/sse_broker.py`](file:///d:/Developer/Auto%20create%20Video/api/sse_broker.py) | Realtime progress (SSE) system |
| 12 | [`remotion/src/Root.tsx`](file:///d:/Developer/Auto%20create%20Video/remotion/src/Root.tsx) | Remotion composition registry |
| 13 | [`remotion/src/AutoClipVideo.tsx`](file:///d:/Developer/Auto%20create%20Video/remotion/src/AutoClipVideo.tsx) | Remotion video renderer chính |
| 14 | [`web/src/App.tsx`](file:///d:/Developer/Auto%20create%20Video/web/src/App.tsx) | React routing + page structure |

---

## 🏗️ Tổng quan kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          BROWSER / USER                                  │
│                    React SPA (web/src/)                                  │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │ HTTP + SSE
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND (api/)                                │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │  auth.py    │  │  routes.py   │  │ sse_broker   │  │ database.py │  │
│  │ JWT Auth    │  │ 50+ endpoints│  │ Realtime Push│  │ SQLite/PG   │  │
│  └─────────────┘  └──────┬───────┘  └──────────────┘  └─────────────┘  │
└─────────────────────────┼───────────────────────────────────────────────┘
                          │ Async calls
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   AI PIPELINE (app/pipeline/)                            │
│                                                                          │
│  graph.py — PIPELINE ORCHESTRATOR                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Script  │→ │Validator │→ │ Content  │→ │  TTS     │→ │  Media   │  │
│  │  Stage   │  │  Stage   │  │  Stage   │  │  Stage   │  │  Stage   │  │
│  │(LLM write│  │(validate │  │(LLM parse│  │(TTS+     │  │(Pexels   │  │
│  │ script)  │  │ input)   │  │ scenes)  │  │ Whisper) │  │ +VLM QC) │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └─────┬────┘  │
│                                                                  │       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │       │
│  │  Timing  │← │Story Beat│← │  QC      │←──────────────────────┘       │
│  │  Stage   │  │  Stage   │  │  Stage   │                                │
│  │(word-to- │  │(fallback │  │(quality  │                                │
│  │ scene map│  │ scenes)  │  │ scoring) │                                │
│  └────┬─────┘  └──────────┘  └──────────┘                                │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────────────────────────┐                                        │
│  │      RENDER STAGE            │                                        │
│  │  (Assemble VideoProps JSON   │                                        │
│  │   → stage assets → call      │                                        │
│  │   Remotion CLI render)       │                                        │
│  └──────────────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────┘
                          │ video_props.json
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   REMOTION RENDERER (remotion/)                          │
│  TypeScript/React — Frame-by-frame video composition                     │
│  Input: video_props.json → Output: final.mp4                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow End-to-End

### Luồng 1: Script Mode (user nhập sẵn script)

```
User nhập text script
        │
        ▼ POST /api/jobs
   API tạo Job record (status="processing")
        │
        ▼ asyncio.create_task()
   run_agentic_chain(state, render=False)
        │
        ├─ ValidatorStage    → validate input text
        ├─ ContentStage      → LLM parse → scenes[] + color_palette + title
        ├─ QCStage(content)  → score content quality (retry nếu < threshold)
        ├─ TTSStage          → TTS audio + Whisper alignment → word_timestamps[]
        ├─ MediaStage        → Pexels search + VLM reranker → media_url per scene
        ├─ QCStage(media)    → score media quality
        ├─ StoryBeatsStage   → (nếu VLM audit fail) tạo story beats fallback
        ├─ TimingStage       → map word_timestamps → scene start_ms/end_ms
        │
        ▼ (nếu skip_review=False)
   Lưu video_props.json → Job(status="review")
   SSE broadcast: "review_ready" event + props data
        │
   User review trên ReviewPage
        │
        ▼ POST /api/jobs/{id}/render
   RenderStage:
        ├─ Stage assets (copy audio/media to remotion/public/assets/)
        ├─ Write video_props.json
        ├─ npx remotion render AutoClipVideo → final.mp4
        └─ Extract thumbnail.jpg
        │
   Job(status="done") + video_url
   SSE broadcast: "done" event
```

### Luồng 2: Topic Mode (user nhập topic → AI viết script)

```
User nhập topic
        │
        ▼ POST /api/script-agent/run (async task)
   ScriptStage sub-agents chạy tuần tự:
        ├─ ResearcherSubAgent  → fetch URLs/YouTube transcripts
        ├─ OutlineSubAgent     → 4-7 key points + time ratios
        ├─ DrafterSubAgent     → full narration (hook/body/cta)
        ├─ RefinerSubAgent     → tighten word count + hook
        └─ VariantGeneratorSubAgent → n variants (optional)
        │
        ▼ SSE stream: script_agent task events
   User chọn variant (hoặc auto-select variant[0])
        │
        ▼ Tiếp tục như Luồng 1 từ ContentStage
```

---

## 📂 Cấu trúc thư mục & vai trò từng file

### `api/` — FastAPI Backend Layer

| File | Vai trò |
|------|---------|
| [`main.py`](file:///d:/Developer/Auto%20create%20Video/api/main.py) | App entry point. Khởi tạo FastAPI, middleware (CORS, RequestID), static files, SPA catch-all, lifespan hooks (init DB, seed admin, cleanup stale jobs) |
| [`routes.py`](file:///d:/Developer/Auto%20create%20Video/api/routes.py) | **Toàn bộ API endpoints** (~136KB). Auth, Jobs CRUD, Pipeline trigger, Script Agent, Review, Render, Share, Admin, SSE progress, TTS Preview, Notifications |
| [`database.py`](file:///d:/Developer/Auto%20create%20Video/api/database.py) | SQLAlchemy async ORM. Định nghĩa tất cả DB tables: `User`, `Job`, `Project`, `Template`, `Role`, `AuditLog`, `Notification`, `RefreshToken`, `UsageRecord` |
| [`models.py`](file:///d:/Developer/Auto%20create%20Video/api/models.py) | Pydantic request/response schemas. `JobCreateRequest`, `JobResponse`, `ProgressEvent`, `UserResponse`, `ProjectResponse`, v.v. |
| [`auth.py`](file:///d:/Developer/Auto%20create%20Video/api/auth.py) | JWT token creation/verification, password hashing (bcrypt), auth dependencies |
| [`sse_broker.py`](file:///d:/Developer/Auto%20create%20Video/api/sse_broker.py) | **Realtime event system**. In-memory asyncio.Queue (dev) + Redis pub/sub (prod). 3 channel types: job-level, user-level, script-task-level |
| [`signed_url.py`](file:///d:/Developer/Auto%20create%20Video/api/signed_url.py) | Tạo signed URLs cho file downloads an toàn (HMAC-based) |
| [`template_seed.py`](file:///d:/Developer/Auto%20create%20Video/api/template_seed.py) | Seed system templates vào DB khi khởi động |

---

### `app/` — AI Pipeline Layer

#### `app/state.py` — Data Contract Trung Tâm ⭐

**Đây là file quan trọng nhất cần đọc đầu tiên.**

```python
# AgentState — object chảy qua toàn bộ pipeline
class AgentState(BaseModel):
    job_id: str          # ID của job
    user_id: int         # User sở hữu job

    # Input
    user_input_mode: Literal["script", "topic"]
    user_input: str      # Script text (mode="script")
    script_request: ...  # Topic params (mode="topic")

    # Stage outputs (populated as pipeline runs)
    generated_scripts: list[ScriptVariant]  # ScriptStage output
    scenes: list[dict]           # ContentStage output
    color_palette: dict          # ContentStage output
    audio_path: str              # TTSStage output
    word_timestamps: list[dict]  # TTSStage output
    final_mp4_path: str          # RenderStage output

    # QC + retry management
    qc_scores: dict[str, float]
    retry_budget: dict[str, int]
    failures: list[WorkerFailure]
```

#### `app/pipeline/graph.py` — Pipeline Orchestrator ⭐

Đây là "bộ não" điều phối toàn bộ pipeline theo thứ tự deterministic:

```
run_agentic_chain(state):
  1. ScriptStage      # chỉ nếu mode="topic" và chưa có script
  2. ValidatorStage   # validate input
  3. ContentStage     # LLM parse → scenes[]
  4. QCStage(content) # quality gate (retry nếu fail)
  5. TTSStage         # TTS + word alignment
  6. MediaStage       # Pexels + VLM rerank
  7. QCStage(media)   # media quality gate
  8. StoryBeatsStage  # fallback khi VLM audit fail
  9. TimingStage      # word → scene timing
  10. RenderStage     # → final.mp4
```

> **Đặc điểm quan trọng:** Pipeline có checkpoint — nếu một stage đã chạy xong (ví dụ audio_path đã có), stage đó sẽ bị skip khi resume.

---

#### `app/pipeline/stages/` — 9 Pipeline Stages

| Stage | File | Vai trò | Input → Output |
|-------|------|---------|----------------|
| **ScriptStage** | `script_stage.py` | LLM viết kịch bản từ topic. Gồm 5 sub-agents | `script_request` → `generated_scripts[]`, `chosen_script` |
| **ValidatorStage** | `validator_stage.py` | Kiểm tra input text hợp lệ | `user_input` → validated |
| **ContentStage** | `content_stage.py` | LLM parse script → scenes có type, media queries | `user_input` → `scenes[]`, `color_palette`, `title` |
| **QCStage** | `qc_stage.py` | Chấm điểm quality content hoặc media | `scenes` → `qc_scores` |
| **TTSStage** | `tts_stage.py` | Text-to-Speech + word alignment | `scenes[]` → `audio_path`, `word_timestamps[]` |
| **MediaStage** | `media_stage.py` | Tìm video/ảnh Pexels + VLM reranker | `scenes[]` → `scenes[].media_url` |
| **StoryBeatsStage** | `story_beats_stage.py` | Tạo story beats fallback khi media audit fail | `scenes[]` → `scenes[].story_beats[]` |
| **TimingStage** | `timing_stage.py` | Map word timestamps → scene start_ms/end_ms | `word_timestamps[]` + `scenes[]` → `scenes[].start_ms/end_ms` |
| **RenderStage** | `render_stage.py` | Build VideoProps → stage assets → Remotion render | `state` → `final_mp4_path` |

---

#### `app/pipeline/nodes/` — Worker Nodes (Nodes cụ thể)

```
nodes/
├── audio/
│   ├── synthesizer.py  # TTS engines: OpenAI, Edge-TTS, ElevenLabs, Gemini, Vbee
│   ├── aligner.py      # Whisper word alignment hoặc estimation fallback
│   └── preprocessor.py # Normalize text trước khi TTS (số → chữ, v.v.)
│
├── content/
│   ├── parser.py       # LLM prompt → scenes[] JSON (ContentStage worker)
│   ├── director.py     # Scene director: layout, transition, purpose
│   └── story_beats.py  # Story beats decomposer
│
├── media/
│   ├── searcher.py     # Pexels API search (video + image)
│   └── reranker.py     # VLM reranker: pick best media per scene
│
├── rendering/
│   ├── renderer.py     # Shell call: npx remotion render
│   ├── thumbnail.py    # Extract thumbnail.jpg từ final.mp4 (FFmpeg)
│   └── bgm.py          # Background music management
│
├── palette/
│   ├── generator.py    # LLM → color palette generation
│   └── library.py      # Preset color palette library
│
└── validation/
    ├── validator.py    # Input validation rules
    └── emoji.py        # Emoji validation/extraction
```

---

#### `app/utils/` — Utility Helpers

| File | Vai trò |
|------|---------|
| `asset_staging.py` | Copy audio + media files vào `remotion/public/assets/{job_id}/` trước khi render |
| `media_candidates.py` | Collect top-N Pexels candidates per scene (for VLM reranker) |
| `tts_text_processing.py` | Build display word timestamps (maps processed → original text) |
| `video_settings.py` | Convert `AgentJobSettings` → `VideoSettings`, resolve output dimensions |

---

### `api/models.py` & `app/state.py` — Hai lớp Pydantic models

> **Tại sao có 2 lớp models riêng biệt?**

```
api/models.py          ←→  HTTP Layer (API request/response schemas)
app/state.py           ←→  Pipeline Layer (internal state + VideoProps)
```

- `api/models.py`: Defines what the **API** accepts/returns: `JobCreateRequest`, `JobResponse`, `UserResponse`, `ProgressEvent`, v.v.
- `app/state.py`: Defines the **pipeline's internal state** (`AgentState`) và **JSON contract với Remotion** (`VideoProps`, `Scene`, `WordTimestamp`).

---

### `remotion/` — Video Renderer (TypeScript/React)

```
remotion/src/
├── Root.tsx              # Composition registry (entry point cho Remotion)
├── AutoClipVideo.tsx     # Main video component — orchestrates all scenes
├── Composition.tsx       # Thin wrapper
├── schemas/
│   └── videoProps.ts     # TypeScript schema (mirrors app/state.py VideoProps)
├── scenes/               # Scene type components
│   ├── TitleCard.tsx     # title_card scene type
│   ├── StockBackground.tsx  # stock_background (video/image + overlay)
│   ├── InfoCard.tsx      # info_card (danh sách icons)
│   ├── StatsHighlight.tsx   # stats_highlight (số liệu)
│   ├── Diagram.tsx       # diagram (chart, math formula)
│   ├── Comparison.tsx    # comparison (left vs right)
│   ├── Timeline.tsx      # timeline (events)
│   ├── StoryBeats.tsx    # story_beats (emoji + text beats)
│   └── EmojiGrid.tsx     # emoji_grid
├── components/
│   ├── Subtitle.tsx      # Word-by-word karaoke subtitles
│   ├── Watermark.tsx     # Brand watermark overlay
│   └── BackgroundGradient.tsx  # Animated gradient backgrounds
└── lib/
    └── utils.ts          # camelizeKeys() — snake_case → camelCase converter
```

**Cơ chế hoạt động:** Remotion được gọi bằng CLI:
```bash
npx remotion render AutoClipVideo --props=video_props.json --output=final.mp4
```

Remotion đọc `video_props.json`, render từng frame theo timeline (30fps), xuất ra MP4.

---

### `web/` — React SPA Frontend (Vite + TypeScript)

```
web/src/
├── App.tsx              # Router setup (React Router)
├── pages/
│   ├── CreatePage.tsx   # Bước 1: Nhập script/topic + cài đặt (3-panel UI)
│   ├── DashboardPage.tsx  # Dashboard: danh sách jobs + notifications
│   ├── ReviewPage.tsx   # Bước 2: Review scenes + media + settings
│   ├── ResultPage.tsx   # Bước 3: Download/share video
│   ├── LibraryPage.tsx  # Thư viện BGM và templates
│   ├── SettingsPage.tsx # User settings (account, preferences)
│   └── SharePage.tsx    # Public share page (no auth required)
├── components/
│   ├── ProjectStartDialog.tsx  # Modal chọn template để bắt đầu
│   ├── SystemErrorReport.tsx   # Error boundary + reporting
│   └── app-sidebar.tsx         # Navigation sidebar
├── api/                 # API client functions (fetch wrappers)
├── context/             # React contexts (AuthContext, v.v.)
├── hooks/               # Custom hooks (useSSE, useJobs, v.v.)
└── sections/            # Section components dùng trong pages
```

---

### Database Schema

```
users ──────────────────────────── (auth, tiers, quotas)
    │
    ├── user_roles ─── roles ───── (RBAC permissions)
    │
    ├── projects ───────────────── (durable workspace)
    │       │
    │       └── jobs ─────────────  (video generation job)
    │               status: pending → processing → review → rendering → done | failed
    │               props: VideoProps JSON
    │               pipeline_logs: debug trace
    │
    ├── usage_records ───────────── (quota tracking per action)
    ├── refresh_tokens ──────────── (JWT refresh token store)
    ├── notifications ───────────── (user notifications)
    └── audit_logs ──────────────── (admin action trail)

templates ─────────────────────── (reusable video presets)
```

---

## 🔧 Config & Feature Flags (config.py)

| Variable | Mặc định | Ý nghĩa |
|----------|----------|---------|
| `CONTENT_PARSER_PROVIDER` | `openai` | LLM cho Content Parsing (`openai` / `qwen`) |
| `SCRIPT_AGENT_PROVIDER` | (same as content) | LLM cho Script Writing |
| `VLM_RERANK_ENABLED` | `true` | Bật/tắt VLM reranker cho media |
| `VLM_RERANK_MODEL` | `qwen3-omni-flash` | Model VLM cho reranking |
| `STORY_BEAT_ENABLED` | `true` | Bật/tắt Story Beats fallback |
| `STORY_BEAT_LLM_ENABLED` | `true` | Dùng LLM hay rule-based cho story beats |
| `WHISPER_MODEL_NAME` | `tiny` | Whisper model size (`tiny`/`base`/`small`) |
| `DEFAULT_TTS_ENGINE` | `openai` | TTS engine mặc định |
| `PEXELS_MAX_CONCURRENCY` | `5` | Số request Pexels song song tối đa |
| `DATABASE_URL` | SQLite | Swap sang PostgreSQL cho production |
| `REDIS_URL` | localhost | Redis cho SSE pub/sub + ARQ worker queue |

---

## 📡 SSE Realtime System (sse_broker.py)

Pipeline gửi progress events realtime lên frontend qua **Server-Sent Events (SSE)**:

```
Pipeline Stage        →    sse_broker.broadcast_progress(job_id, event)
                                    │
                          ┌─────────┴──────────┐
                          │                    │
                    In-memory Queue      Redis pub/sub
                    (same process)       (multi-process)
                          │                    │
                    Browser EventSource listens GET /api/jobs/{id}/progress
```

**Event types được broadcast:**
- `progress` — step update với percentage
- `review_ready` — pipeline phase 1 xong, gửi `props` data cho Review UI
- `done` — render xong, kèm `download_url`
- `error` — pipeline fail
- `agent_trace` — per-turn debug trace từ pipeline
- `needs_human` — pipeline cần user input (script selection checkpoint)

---

## 🎬 Scene Types (Remotion renders)

| Scene Type | Mô tả |
|-----------|-------|
| `title_card` | Màn hình tiêu đề với animated text |
| `stock_background` | Video/ảnh Pexels làm nền + subtitle overlay |
| `info_card` | Danh sách items với icon + title + subtitle |
| `stats_highlight` | Hiển thị số liệu/statistics với màu sắc |
| `diagram` | Math formula (LaTeX), line chart, bar chart |
| `comparison` | So sánh 2 phía (left vs right) |
| `timeline` | Chuỗi sự kiện theo thứ tự thời gian |
| `story_beats` | Emoji + text beats timed theo audio |
| `emoji_grid` | Grid emojis với labels |
| `media_showcase` | Full-screen media focus |
| `cryptovn101_news` | Custom news-style template |

---

## 🔑 External Services

| Service | Dùng cho | Config Key |
|---------|----------|-----------|
| OpenAI | TTS (nova voice), LLM (gpt-4o-mini) | `OPENAI_API_KEY` |
| Pexels | Stock video + image search | `PEXELS_API_KEY` |
| Qwen/DashScope | Content Parser LLM, VLM Reranker, Story Beats | `QWEN_API_KEY` |
| ElevenLabs | Premium TTS (optional) | `ELEVENLABS_API_KEY` |
| Google Gemini | Gemini TTS (optional) | `GOOGLE_API_KEY` |
| Vbee | Vietnamese TTS (optional) | `VBEE_APP_ID`, `VBEE_API_TOKEN` |
| Redis | SSE pub/sub + ARQ job queue | `REDIS_URL` |
| Sentry | Error tracking (optional) | `SENTRY_DSN` |
| FFmpeg | Thumbnail extraction | `FFMPEG_PATH` |

---

## ⚡ Key Design Decisions

### 1. Immutable State Pattern
`AgentState` dùng Pydantic `model_copy(update={...})` — mỗi stage trả về state mới thay vì mutate. Giúp dễ debug và có thể resume.

### 2. Two-Phase Pipeline (Review Mode)
```
Phase 1: script → scenes → audio → media → timing
              ↓ (review_ready SSE)
Phase 2: User chỉnh sửa trên ReviewPage
              ↓ (POST /render)
Phase 3: Render stage → final.mp4
```
User có thể edit scenes, thay media, đổi settings trước khi render.

### 3. VLM Reranker + Story Beats Fallback
```
Pexels search → candidates[]
      ↓
VLM Reranker (qwen3-omni-flash) → pick best media
      ↓
Audit: confidence < threshold hoặc aspect_mismatch?
      ↓ YES
Story Beats fallback: no media needed (pure text+emoji)
```

### 4. Python ↔ Remotion Bridge
Pipeline output là `video_props.json` (snake_case). Remotion's `lib/utils.ts:camelizeKeys()` tự động convert sang camelCase trước khi validate với Zod schema.

### 5. Retry Budget
```python
DEFAULT_RETRY_BUDGET = {
    "script_agent": 2, "validator": 3, "content": 1,
    "tts": 4, "media": 3, "timing": 2, "render": 1
}
```
Mỗi stage có số lần retry tối đa. Khi fail + hết retry budget → `PipelineStageError` → Job status = "failed".

---

## 🚀 Output Directory Structure

```
output/
└── {job_id}/
    ├── video_props.json     # Pipeline output → Remotion input
    ├── final.mp4            # Rendered video
    ├── thumbnail.jpg        # First-frame thumbnail
    └── audio/
        └── tts.mp3          # TTS audio file

remotion/public/assets/
└── {job_id}/
    ├── tts.mp3              # Audio (staged copy for Remotion)
    └── media/               # Media files (staged)
```
