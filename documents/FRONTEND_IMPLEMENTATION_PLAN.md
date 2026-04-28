# 🎬 AutoClip — Frontend & Backend Implementation Plan v4.3 (Refactor Complete)

> **Timeline**: 19/04 → 10/05/2026  
> **MVP**: 7 ngày → Railway monolith + SQLite  
> **Production**: +2 tuần → Vercel + Railway + PostgreSQL  
> **Sources**: `implementation_plan v3.1` + `autoclip_frontend_design v2.0` + `MASTER_PLAN_VI v4.2`  
> **Frontend Stack**: Vite + React 19 (swapped from vanilla HTML/CSS/JS — ADR-17)

---

## 1. Deployment & Database Strategy

### 1.1 Phased Deploy

```
Week 1 (MVP)                          Week 2-3 (Production)
─────────────                         ────────────────────

  Railway ($5)                         Vercel (free)      Railway ($5+$7)
  ┌──────────────────┐                 ┌────────────┐     ┌──────────────┐
  │ FastAPI           │                │ web/       │     │ FastAPI       │
  │ ├── API routes   │    ──TÁCH──▶   │ ├── html   │────▶│ ├── API only │
  │ ├── web/ static  │                │ ├── css    │CORS │ ├── SSE      │
  │ ├── Remotion     │                │ └── js     │     │ ├── Remotion │
  │ └── SQLite (file)│                │ CDN edge   │     │ └── PostgreSQL│
  └──────────────────┘                └────────────┘     └──────────────┘

  same-origin = no CORS                cross-origin + CORS whitelist
  SSE simple                           SSE with token query param
  SQLite local file                    Railway Postgres add-on
  1 deploy                             2 deploys + managed DB
```

### 1.2 Database Migration Strategy

```
MVP (SQLite)                              Production (PostgreSQL)
────────────                              ──────────────────────

SQLAlchemy ORM (same code)                SQLAlchemy ORM (same code)
         │                                         │
         ▼                                         ▼
DATABASE_URL=                             DATABASE_URL=
"sqlite+aiosqlite:///data/autoclip.db"    "postgresql+asyncpg://user:pass@host/db"

         │              ĐỔI 1 DÒNG                 │
         └──────────────────────────────────────────┘
```

---

## 2. Design System

> **Language**: All labels, buttons, messages in **English**.  
> **Theme**: Premium dark mode with glassmorphism.

### 2.1 Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#0f0f1a` | Main background |
| `--bg-secondary` | `#1a1a2e` | Sidebar, panels |
| `--bg-card` | `rgba(255,255,255,0.05)` | Glass card background |
| `--bg-card-hover` | `rgba(255,255,255,0.08)` | Card hover state |
| `--primary` | `#FF6B35` | CTAs, active states, highlights |
| `--primary-hover` | `#FF8C61` | Primary hover/glow |
| `--secondary` | `#7C3AED` | AI/processing indicators |
| `--success` | `#4ADE80` | Completed, success states |
| `--warning` | `#FBBF24` | In-progress, attention |
| `--error` | `#EF4444` | Errors, delete actions |
| `--text-primary` | `#F0F0F0` | Main text |
| `--text-secondary` | `#9CA3AF` | Muted text, labels |
| `--border` | `rgba(255,255,255,0.1)` | Card borders |
| `--glow-primary` | `0 0 20px rgba(255,107,53,0.3)` | Orange glow effect |
| `--glow-purple` | `0 0 20px rgba(124,58,237,0.3)` | Purple glow effect |

### 2.2 Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| H1 (Logo) | Plus Jakarta Sans | 700 | 28px |
| H2 (Page Title) | Outfit | 600 | 24px |
| H3 (Section) | Outfit | 600 | 18px |
| Body | Outfit | 400 | 14px |
| Label | Outfit | 300 | 12px |
| Code/JSON | JetBrains Mono | 400 | 13px |
| Badge | Outfit | 600 | 11px |

### 2.3 Spacing & Radius

| Token | Value |
|-------|-------|
| `--radius-sm` | `8px` |
| `--radius-md` | `12px` |
| `--radius-lg` | `16px` |
| `--radius-xl` | `24px` |
| `--gap-xs` | `4px` |
| `--gap-sm` | `8px` |
| `--gap-md` | `16px` |
| `--gap-lg` | `24px` |
| `--gap-xl` | `32px` |

### 2.4 Glassmorphism Card

```css
.glass-card {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    transition: all 0.3s ease;
}

.glass-card:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 107, 53, 0.3);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4),
                0 0 20px rgba(255, 107, 53, 0.1);
}
```

---

## 3. Page Structure & Wireframes

### 3.1 Navigation

| # | Page | Route | File | Mô Tả |
|---|------|-------|------|--------|
| 1 | **Login** | `/login` | `pages/LoginPage.jsx` | Auth — Login / Register toggle |
| 2 | **Dashboard** | `/dashboard` | `pages/DashboardPage.jsx` | Stats + Job history + Quick Create |
| 3 | **Create Video** | `/` | `pages/CreatePage.jsx` | Settings 3-panel → Generate → Progress → Result |

### 3.2 Top Navigation Bar (64px)

```
┌────────────────────────────────────────────────────────────┐
│  🔶 AutoClip AI           [Dashboard] [Create]    👤 Logout│
└────────────────────────────────────────────────────────────┘
```

---

## 4. Page Details

### 4.1 Login Page (`/login`)

```
┌────────────────────────────────────────────────┐
│                   🔶 AutoClip AI               │
│                                                 │
│           ┌─────────────────────────┐          │
│           │                         │          │
│           │   [Login] [Register]    │ ← Toggle │
│           │                         │          │
│           │   Username              │          │
│           │   ┌───────────────────┐ │          │
│           │   │                   │ │          │
│           │   └───────────────────┘ │          │
│           │   Password              │          │
│           │   ┌───────────────────┐ │          │
│           │   │                   │ │          │
│           │   └───────────────────┘ │          │
│           │   Email (register only) │          │
│           │   ┌───────────────────┐ │          │
│           │   │                   │ │          │
│           │   └───────────────────┘ │          │
│           │                         │          │
│           │   ┌───────────────────┐ │          │
│           │   │  🚀 Sign In       │ │          │
│           │   └───────────────────┘ │          │
│           │   ⚠️ Error message      │          │
│           └─────────────────────────┘          │
│                                                 │
│       Animated mesh gradient background         │
└────────────────────────────────────────────────┘
```

**Requirements:**
- Client-side validation (min 3 chars username, 8 chars password)
- Inline error messages (not alert)
- On login success → store JWT in localStorage → redirect to `/`
- On register success → auto login → redirect
- Auto-redirect to `/login` if no valid token on any page
- Enter key = submit

---

### 4.2 Dashboard Page (`/dashboard`)

```
┌──────────────────────────────────────────────────┐
│  🔶 AutoClip AI          [Dashboard] [Create] 👤 │
├──────────────────────────────────────────────────┤
│                                                   │
│  🎬 24 videos              🟡 Latest: Rendering  │
│  ┌──────────────────────────────────────────────┐│
│  │ "Python AI cơ bản"      ━━━━━━━◉━━━ 67%     ││
│  │ Rendering video...                  [Xem →]  ││
│  └──────────────────────────────────────────────┘│
│  (Nếu không có video đang xử lý → hiện video    │
│   hoàn thành gần nhất với nút Download/Xem)      │
│                                                   │
│  📹 My Videos                                    │
│  [All] [Completed] [Processing] [Failed]  🔍     │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  ┌────┐  │  │  ┌────┐  │  │  ┌────┐  │       │
│  │  │9:16│  │  │  │9:16│  │  │  │9:16│  │       │
│  │  │ ▶  │  │  │  │ ▶  │  │  │  │ 🔄 │  │       │
│  │  └────┘  │  │  └────┘  │  │  └────┘  │       │
│  │ AI intro │  │ React 101│  │ Python   │       │
│  │ 0:45     │  │ 1:02     │  │ Rendering│       │
│  │ 🟢 Done  │  │ 🟢 Done  │  │ 🟡 67%  │       │
│  │ 2h ago   │  │ 5h ago   │  │ just now │       │
│  │[⬇][🔗][🗑]│ │[⬇][🔗][🗑]│ │ [⏸][🗑]  │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                   │
│  ⚡ Quick Create                                  │
│  ┌──────────────────────────────────────────────┐│
│  │ 📝 Paste your script to start... [Create →]  ││
│  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

**Requirements:**
- **Latest status bar**: hiện video gần nhất đang xử lý (progress bar + title + link).
  Nếu không có video đang chạy → hiện video hoàn thành gần nhất (title + duration + Download).
  Data từ `GET /api/jobs?limit=1&sort=created_at:desc`
- Job cards: status badges (🟢 Completed / 🟡 Processing / 🔴 Failed)
- Filter tabs: All / Completed / Processing / Failed
- Actions per card: Download, Copy link, Delete
- Quick Create → redirect to `/` with pre-filled text
- Empty state: illustration + "Create your first video" CTA
- Skeleton loading while fetching
- Pagination or infinite scroll (10 per page)

---

### 4.3 Create Video Page (`/`) — Main Page

> This is the most complex page. Design follows MASTER_PLAN_VI §6 "Tùy Chọn Giao Diện".

#### State Machine (4 states — single page):

```
┌──────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────┐
│  SETUP   │────▶│  PROCESSING  │────▶│  REVIEW  │────▶│  RESULT  │
│ Settings │     │  Pipeline    │     │  Scenes  │     │  Video   │
│ progdisc │     │  SSE stream  │     │  Cards   │     │  Player  │
└──────────┘     └──────────────┘     └──────────┘     └──────────┘
   ↑                                       │                │
   └───────────────────────────────────────┘                │
   └────────────────────────────────────────────────────────┘
                    "Create Another"
```

#### State 1: SETUP — Text + Progressive Disclosure Settings

> **v4.3 layout change (Progressive Disclosure):**
> - Essential settings visible by default (7 fields). Advanced settings hidden behind accordion.
> - Removed "Video Transition" from Setup entirely — Director agent auto-selects, user fine-tunes per-scene in Review.
> - Two voice buttons: **Preview Voice** (free sample) + **Play Full Script** (costs credits, cached & reused in pipeline).
> - Dual Generate: **Quick Generate** (skip review) + **Generate & Review** (review scenes first).

```
┌──────────────────────────────────────────────────────────────┐
│ 📝 Your Video Script                                          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │                                                           │ │
│ │ Paste your finished text here...                          │ │
│ │ Min 30 words. AI will split into scenes automatically.    │ │
│ │                                                           │ │
│ └──────────────────────────────────────────────────────────┘ │
│ Words: 0/500                                          │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  📐 Aspect Ratio       🗣️ Voice                               │
│  [Portrait 9:16 ▼]     [Nova ▼]                               │
│                                                                │
│  ┌──────────────────┐  ┌──────────────────────────────────┐  │
│  │ ▶ Preview Voice   │  │ 🔊 Play Full Script              │  │
│  │ (free sample)     │  │ (costs credit · reused in gen)   │  │
│  └──────────────────┘  └──────────────────────────────────┘  │
│                                                                │
│  ⏩ Speech Rate         🔊 Volume                              │
│  0.8 ━━━◉━━━━ 2.0     0.6 ━━━◉━━━━ 3.0                     │
│  1.0x                   1.0                                    │
│                                                                │
│  🎵 Background Music    ☑ Enable Subtitles                    │
│  [None ▼] / Upload ▼    │                                      │
│  📎 [Choose File]                                              │
│  (≤10MB, mp3/wav/m4a)                                          │
│  🎚️ Volume: 0.0 ━◉━━ 1.0                                      │
│                                                                │
│  ⚙️ Advanced Settings ▼                                       │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌──────────────────────────────┐  │
│  │ ⚡ Quick Generate     │  │ 🎬 Generate & Review         │  │
│  │ (skip review)         │  │ (review scenes first)        │  │
│  │ [secondary/outlined]  │  │ [primary/filled + glow]      │  │
│  └──────────────────────┘  └──────────────────────────────┘  │
│            (both disabled until text ≥ 30 words)               │
└──────────────────────────────────────────────────────────────┘
```

**Advanced Settings** (expanded via accordion):

```
│  ⚙️ Advanced Settings ▲                                       │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │  🎤 TTS Engine          🎚️ BGM Volume                    │ │
│  │  [OpenAI ▼]             0.0 ━━◉━━━ 1.0 (0.2)           │ │
│  │                                                           │ │
│  │  📎 Upload Custom BGM                                    │ │
│  │  [Choose File] (≤10MB, mp3/wav/m4a)                      │ │
│  │                                                           │ │
│  │  ── Subtitle Styling ──                                   │ │
│  │  🔤 Font          🔠 Size        📍 Position              │ │
│  │  [NotoSans ▼]     [48]           [Bottom ▼]              │ │
│  │                                                           │ │
│  │  🎨 Font Color   🖊️ Stroke Color  ✨ Highlight Color     │ │
│  │  [#FFF 🎨]       [#000 🎨]        [#FF6B35 🎨]          │ │
│  │                                                           │ │
│  │  🖊️ Stroke Width                                         │ │
│  │  0 ━━◉━━━━━ 10 (2.0)                                    │ │
│  │                                                           │ │
│  └──────────────────────────────────────────────────────────┘ │
```

**Field Specifications (v4.3 — Progressive Disclosure):**

> [!NOTE]
> **"Video Keywords" moved to Review state (v4.2).** User edits media queries per-scene
> in Review via `[✏️ Edit Query]` + `[🔄 Re-search]` buttons. No upfront keyword input needed.

> [!NOTE]
> **"Max Clip Duration" removed (v4.1).** Scene duration is determined by
> narration length (word timestamps from TTS+Whisper), not a fixed config.

> [!NOTE]
> **"Video Transition" removed from Setup (v4.3).** Director agent auto-selects
> per-scene transitions. User fine-tunes in Review state via per-scene dropdown.

**Main settings (visible by default):**

| Field | Type | Default | Constraints |
|-------|------|---------|-------------|
| Final Text | textarea | — | Min 30, max 500 words |
| Aspect Ratio | select | Portrait 9:16 | 9:16 / 16:9 |
| Voice | select | Nova | Dynamic options per TTS engine |
| ▶ Preview Voice | button | — | Play free voice sample (~5s). No credit cost |
| 🔊 Play Full Script | button | — | TTS full user content. Costs credit. Audio cached by hash(text+voice+rate) and reused in pipeline generation (no double-pay) |
| Speech Rate | slider | 1.0 | 0.8 – 2.0, step 0.1 |
| Speech Volume | slider | 1.0 | 0.6 – 3.0, step 0.1 |
| Background Music | select | None | None / Custom upload |
| BGM Upload | file input | — | ≤ 10MB, mp3/wav/m4a. Shown when BGM = Custom |
| BGM Volume | slider | 0.2 | 0.0 – 1.0, step 0.05. Shown when BGM = Custom |
| Enable Subtitles | checkbox | ✅ Enabled | On / Off |

**Advanced settings (hidden behind accordion):**

| Field | Type | Default | Constraints |
|-------|------|---------|-------------|
| TTS Engine | select | OpenAI | OpenAI / ElevenLabs / Gemini / Edge-TTS |
| Font | select | NotoSansVN-Bold | Scan from `fonts/` folder |
| Font Size | slider | 48 | 30 – 80, step 1 |
| Font Color | color picker | `#FFFFFF` | Hex color |
| Stroke Color | color picker | `#000000` | Hex color |
| Stroke Width | slider | 2.0 | 0 – 10, step 0.5 |
| Position | select | Bottom | Top / Center / Bottom |
| Highlight Color | color picker | `#FF6B35` | Active word color |

**Dual Generate Buttons:**

| Button | Style | Behavior |
|--------|-------|----------|
| ⚡ Quick Generate | Secondary (outlined) | Pipeline runs Phase 1 → Phase 2 automatically. Skips Review state. SSE streams straight to RESULT. Backend flag: `skip_review=true` |
| 🎬 Generate & Review | **Primary (filled + glow)** | Pipeline runs Phase 1 → stops at Review state. User edits scenes, then triggers Phase 2 render. This is the recommended flow for content creators |

> [!IMPORTANT]
> **"Generate & Review" is the primary/default button** because AutoClip targets content creators
> who benefit from reviewing and fine-tuning scenes before final render.
> "Quick Generate" is secondary — for users who trust AI defaults or are in a hurry.

#### State 2: PROCESSING — Pipeline Progress (SSE)

```
┌──────────────────────────────────────────────────────┐
│  ① Settings  →  ② Processing  →  ③ Review  →  ④ Done│
│                  ===========                          │
├──────────────────────────────────────────────────────┤
│                                                       │
│              ┌─────────────────┐                      │
│              │   ◠ ◡ ◠ ◡      │   ← Animated loader  │
│              │  AI Processing  │                      │
│              └─────────────────┘                      │
│                                                       │
│  Pipeline Progress:                                   │
│  ✅ Input Validation ··················· 100%         │
│  ✅ Content Parsing (LLM) ·············  100%         │
│  🔄 TTS Synthesis ·····················  67%          │
│  🔄 Media Search (Pexels) ··············  45%         │
│  ⏳ Word Alignment ····················  --           │
│  ⏳ Scene Assembly ····················  --           │
│                                                       │
│  ━━━━━━━━━━━━━━━━━━░░░░░░░░░░ 35%                    │
│  Estimated: ~45 seconds remaining                     │
│                                                       │
│  📋 Live Logs                                         │
│  ┌──────────────────────────────────────────────────┐│
│  │ [09:33:01] Parsed: "AI là gì?" → 4 scenes       ││
│  │ [09:33:03] Preprocessed: 145 → 152 chars         ││
│  │ [09:33:05] Audio: 12.5s, saved to /audio/full.mp3││
│  │ [09:33:06] Media found for 3/4 scenes            ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

**SSE Events (from MASTER_PLAN_VI §5):**

```
data: {"event":"progress","step":"validate","progress":0.05,"message":"Validating input..."}
data: {"event":"progress","step":"parse",   "progress":0.15,"message":"Parsing content..."}
data: {"event":"progress","step":"tts",     "progress":0.35,"message":"Generating voiceover..."}
data: {"event":"progress","step":"media",   "progress":0.50,"message":"Downloading backgrounds..."}
data: {"event":"progress","step":"render",  "progress":0.80,"message":"Rendering video..."}
data: {"event":"done","job_id":"abc-123","download_url":"/api/jobs/abc-123/download"}
data: {"event":"error","step":"media","message":"Pexels timeout","fatal":false}
```

**Progress weights**: validate 5% · parse 10% · tts 20% · media 20% · render 40% · done 5%

#### State 3: REVIEW — Scene Cards (Enhanced v4.1)

```
┌──────────────────────────────────────────────────────────────────────┐
│  ① Settings  →  ② Processing  →  ③ Review  →  ④ Done               │
│                                    ======                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ▶ Live Preview (via @remotion/player)              [Toggle Preview] │
│  ┌───────────────────────────────────────┐                           │
│  │         ┌──────────┐                 │                           │
│  │         │   9:16   │                 │ ← Real-time Remotion      │
│  │         │ Preview  │                 │   composition preview     │
│  │         │    ▶     │                 │   Updates when props      │
│  │         └──────────┘                 │   change                  │
│  │  ▶▶ ◼ ━━━━━━━━◉━━━ 3:20 / 12:50    │                           │
│  └───────────────────────────────────────┘                           │
│                                                                      │
│  🎨 Color Palette                                                    │
│  [██ #FF6B35] [██ #7B68EE] [██ #0F172A] [██ #FFFFFF]                │
│                                                                      │
│  📋 Scenes (4 scenes, 12.5s total)                                  │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │ Scene 1 — [title_card     ▼]                            [Edit] ││
│  │ "Deploy Agent AI Trong Vài Ngày"                               ││
│  │ 🖼️ Query: "AI neural network dark background"                  ││
│  │ 🎬 Background: ┌──────┐ (video preview thumbnail)              ││
│  │                 │ ▶ 🎥 │ [🔄 Re-search]                        ││
│  │                 └──────┘                                        ││
│  │ ⏱️ 0ms → 3200ms | 🔄 [fade ▼] | 📐 center_focus               ││
│  ├──────────────────────────────────────────────────────────────────┤│
│  │ Scene 2 — [stock_background ▼]                          [Edit] ││
│  │ "Học máy giúp máy tính tự học từ dữ liệu..."                  ││
│  │ 🖼️ Query: "machine learning computer"   [✏️ Edit Query]        ││
│  │ 🎬 Background: ┌──────┐                                        ││
│  │                 │ ▶ 🎥 │ [🔄 Re-search]                        ││
│  │                 └──────┘                                        ││
│  │ ⏱️ 3200ms → 6800ms | 🔄 [slide ▼]                              ││
│  ├──────────────────────────────────────────────────────────────────┤│
│  │ Scene 3 — [info_card ▼]                                 [Edit] ││
│  │ "Các ứng dụng nổi bật gồm ChatGPT, Midjourney..."             ││
│  │ 📊 Cards: [ChatGPT] [Midjourney] [Sora]                        ││
│  │ ⏱️ 6800ms → 10000ms | 🔄 [wipe ▼]                              ││
│  ├──────────────────────────────────────────────────────────────────┤│
│  │ Scene 4 — [diagram ▼]                                   [Edit] ││
│  │ "Softmax chuyển điểm số thành xác suất..."                     ││
│  │ 🧮 LaTeX: softmax(x_i) = e^{x_i} / Σe^{x_j}                  ││
│  │ ⏱️ 10000ms → 12500ms | 🔄 [fade ▼]                             ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─────────────────┐        ┌────────────────────────────┐          │
│  │ ← Back to Setup │        │ 🎬 Start Final Render      │          │
│  └─────────────────┘        └────────────────────────────┘          │
└──────────────────────────────────────────────────────────────────────┘
```

**Requirements:**
- Scene cards replace raw JSON textarea from demo
- Each card shows: type badge, narration, media queries (editable), timing, transition
- Color palette preview strip from LLM output
- Edit Query button → inline edit → `POST /api/jobs/{id}/scenes/{idx}/re-search` (~2-3s per scene)
- "Start Render" sends to State 4 via `POST /api/jobs/{id}/render`
- "Back to Setup" returns to State 1 with pre-filled values

**Enhanced Review Features (v4.1):**

1. **Background Video Preview** — Mỗi scene card hiển thị thumbnail của video/image background.
   Click để xem preview đầy đủ. Media URL đã có sẵn trong props (`scene.media_url`).

2. **Transition Editing** — Dropdown cho mỗi scene, cho phép đổi transition per-scene.
   Options: `fade | slide | wipe | zoom | none`. Cập nhật qua `PATCH /api/jobs/{id}/props`.

3. **Scene Type Switching** — User được đổi scene type cho từng scene riêng lẻ.
   Dropdown options: `title_card | stock_background | info_card | stats_highlight | diagram | emoji_grid`.
   - Khi đổi type: backend kiểm tra data cần thiết cho type mới (card_items, stats, diagram_spec)
   - Nếu có sẵn → đổi ngay
   - Nếu thiếu → backend gọi LLM mini-enricher generate cho scene đó (~2-3s)
   - Nếu narration không phù hợp (ví dụ: đổi sang `diagram` nhưng không có biểu thức toán)
     → hiện warning, user quyết định giữ hay hủy
   - API: `PATCH /api/jobs/{id}/props` với `{ scene_index: N, scene_type: "new_type" }`

4. **Live Preview (@remotion/player)** — Embed Remotion composition trực tiếp trong browser.
   User thấy preview video real-time, cập nhật khi sửa props.
   Cần: `npm install @remotion/player`, import `AutoClipVideo` component.
   Optional: toggle show/hide preview để tiết kiệm performance.

> [!IMPORTANT]
> **Scene Type Switching cần backend support:**
> - `PATCH /api/jobs/{id}/props` endpoint (chưa implement, nằm trong pipeline 2-phases work)
> - Mini-enricher function cho single scene re-enrichment
> - Scene Type Registry để quản lý required data per type:
>   ```
>   title_card:       []              → Luôn OK
>   stock_background: [media_url]     → Cần Pexels search
>   info_card:        [card_items]    → LLM auto-generate
>   stats_highlight:  [stats]         → LLM, chỉ nếu narration có số
>   diagram:          [diagram_spec]  → LLM, chỉ nếu narration có biểu thức
>   emoji_grid:       [card_items]    → LLM auto-generate
>   ```

#### State 4: RESULT — Video Player + Download

```
┌──────────────────────────────────────────────────────┐
│  ① Settings  →  ② Processing  →  ③ Review  →  ④ Done│
│                                              ======  │
├──────────────────────────────────────────────────────┤
│                                                       │
│                  ✅ Your video is ready!               │
│                                                       │
│         ┌──────────────────────────────┐              │
│         │        ┌──────────┐         │              │
│         │        │   9:16   │         │              │
│         │        │  Video   │         │              │
│         │        │  Player  │         │              │
│         │        │    ▶     │         │              │
│         │        │          │         │              │
│         │        └──────────┘         │              │
│         │   Title: "AI là gì?"        │              │
│         │   Duration: 0:45            │              │
│         │   Scenes: 4                 │              │
│         └──────────────────────────────┘              │
│                                                       │
│     ┌──────────────┐  ┌──────────────────────────┐   │
│     │ 📥 Download  │  │ 🔄 Create Another Video  │   │
│     └──────────────┘  └──────────────────────────┘   │
│                                                       │
│  📊 Generation Stats                                  │
│  Pipeline: 45s | TTS: 12s | Render: 28s | Size: 4.2MB│
└──────────────────────────────────────────────────────┘
```

---

## 5. Responsive Design

### 5.1 Breakpoints

| Name | Width | Layout Changes |
|------|-------|----------------|
| **Desktop** | ≥1280px | 3-panel settings side by side |
| **Laptop** | 1024–1279px | 3-panel but narrower |
| **Tablet** | 768–1023px | 2-panel (Left+Mid stacked, Right below) |
| **Mobile** | <768px | Single column, all panels stacked |

### 5.2 Mobile Layout (< 768px)

```
┌──────────────────────┐
│ 🔶 AutoClip    [≡]  │  ← Hamburger menu
├──────────────────────┤
│ ① → ② → ③ → ④      │  ← Step indicator
├──────────────────────┤
│   📝 Script Editor   │
│   ┌────────────────┐ │
│   │ Enter text...  │ │
│   └────────────────┘ │
│   Words: 0/30        │
│                      │
│   Voice: [Nova ▼]    │
│   Speed: ━━◉━━ 1.0x │
│   ▶ Preview Voice    │
│                      │
│   ▼ More Settings    │  ← Collapsible
│                      │
│  ┌──────────────────┐│
│  │ 🚀 Generate      ││
│  └──────────────────┘│
├──────────────────────┤
│ [📊] [🎬] [📹]      │  ← Bottom nav
└──────────────────────┘
```

---

## 6. Micro-Interactions & Animations

| Element | Animation | Duration | Trigger |
|---------|-----------|----------|---------|
| Step Progress | Gradient slide | 300ms | Step change |
| Glass Cards | Fade in + scale(0.95→1) | 400ms | Mount |
| Scene Cards | Stagger fade (50ms delay each) | 300ms | Props loaded |
| Render Progress | Circular fill animation | Continuous | Rendering |
| Pipeline Steps | Checkmark pop + green glow | 500ms | Step complete |
| CTA Button | Gradient shift + shadow pulse | 200ms | Hover |
| Log entries | Slide in from left | 200ms | New log |
| Background mesh | Slow float (translate) | 20s loop | Always |
| Pulse dot (logo) | Opacity + scale breathing | 2s loop | Always |
| Video card | Lift + shadow expand | 200ms | Hover |
| Toast notification | Slide in right + fade out | 300ms/3s | API response |
| Skeleton loader | Shimmer gradient sweep | 1.5s loop | Data loading |

### Step Transition CSS

```css
.view-enter {
    opacity: 0;
    transform: translateX(30px);
}
.view-enter-active {
    opacity: 1;
    transform: translateX(0);
    transition: all 400ms cubic-bezier(0.16, 1, 0.3, 1);
}
.view-exit-active {
    opacity: 0;
    transform: translateX(-30px);
    transition: all 300ms ease-in;
}
```

---

## 7. API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| `POST` | `/api/auth/register` | ❌ | Register |
| `POST` | `/api/auth/login` | ❌ | Login → JWT (24h) |
| `GET` | `/api/auth/me` | 🔒 | Current user info |
| `POST` | `/api/jobs` | 🔒 | Create video job → Phase 1 (stops at review) |
| `GET` | `/api/jobs` | 🔒 | List user's jobs |
| `GET` | `/api/jobs/{id}` | 🔒 | Job detail (includes props when status=review) |
| `GET` | `/api/jobs/{id}/progress` | 🔒 | SSE progress stream |
| `GET` | `/api/jobs/{id}/download` | 🔒 | Download MP4 |
| `POST` | `/api/tts/preview` | 🔒 | Voice preview → audio (all 4 engines) |
| `POST` | `/api/bgm/upload` | 🔒 | Upload BGM ≤10MB |
| `POST` | `/api/jobs/{id}/render` | 🔒 | Phase 2 — Trigger render from reviewed props |
| `PATCH` | `/api/jobs/{id}/props` | 🔒 | Update scene props (validated) |
| `POST` | `/api/jobs/{id}/scenes/{idx}/re-search` | 🔒 | Re-search media per-scene |
| `POST` | `/api/jobs/{id}/scenes/{idx}/upload-media` | 🔒 | Upload custom image/video |

---

## 8. Backend Implementation — Day-by-Day

### Day 1: Database (SQLAlchemy) + Auth

#### [NEW] api/database.py — SQLAlchemy Async ORM

```python
# === Engine setup — đổi URL = đổi database ===
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import os

# MVP:        sqlite+aiosqlite:///data/autoclip.db
# Production: postgresql+asyncpg://user:pass@host/autoclip
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:///data/autoclip.db"
)

engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    async with SessionLocal() as session:
        yield session
```

```python
# === ORM Models ===
class User(Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True, autoincrement=True)
    username      = Column(String(50), unique=True, nullable=False)
    email         = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role          = Column(String(20), default="user")
    created_at    = Column(DateTime, default=datetime.utcnow)

class Job(Base):
    __tablename__ = "jobs"
    id            = Column(String(36), primary_key=True)  # UUID
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    status        = Column(String(20), nullable=False, default="pending")
    input_text    = Column(Text)
    settings      = Column(JSON)
    props         = Column(JSON)
    video_url     = Column(String(500))
    error         = Column(Text)
    created_at    = Column(DateTime, default=datetime.utcnow)
    completed_at  = Column(DateTime)

    __table_args__ = (
        Index("idx_jobs_user_id", "user_id"),
        Index("idx_jobs_status", "status"),
    )
```

#### [NEW] api/auth.py
- `hash_password()` / `verify_password()` → bcrypt
- `create_token(user_id, role)` → JWT 24h expiry
- `get_current_user()` → FastAPI Dependency
- `require_role("admin")` → role-based access

#### [NEW] api/models.py — Pydantic Request/Response
- `RegisterRequest`, `LoginRequest`, `TokenResponse`
- `JobCreateRequest`, `JobResponse`
- `VoicePreviewRequest`, `ProgressEvent`

#### [MODIFY] config.py
- Add `DATABASE_URL`, `ALLOWED_ORIGINS`

#### [MODIFY] requirements.txt
- Add: `sqlalchemy[asyncio]>=2.0`, `aiosqlite`, `asyncpg`, `alembic`

---

### Day 2: API Routes + SSE

#### [NEW] api/routes.py — All 10 endpoints from §7

#### [MODIFY] api/main.py
- Add `routes.py` router + `init_db()` on startup
- Mount `web/dist/` at `/` via `StaticFiles(directory="web/dist", html=True)`
- Vite dev: proxy `/api` → FastAPI; Production: serve built `dist/`
- Keep demo at `/demo/` backward compat

---

### Day 3: Vite + React Setup + Design System + Create Page

#### [SETUP] web/ — Vite + React project
- Scaffold via `npx create-vite@latest web --template react`
- Install: `react-router-dom`
- Vite config: proxy `/api` → `http://localhost:8080` (dev mode)
- Production: `npm run build` → `web/dist/` → FastAPI serves as static

#### Project Structure (`web/src/`):
- `main.jsx` — Entry point + React Router (`/`, `/login`, `/dashboard`)
- `App.jsx` — Root layout (Navbar, ToastContainer, `<Outlet />`)
- `index.css` — Full design system (§2 tokens, glass cards, 12+ animations, responsive)
- `api/client.js` — `apiRequest(method, url, body)` with JWT header
- `api/sse.js` — `connectSSE(jobId, token, onEvent)` for pipeline progress
- `context/AuthContext.jsx` — `useAuth()` hook (login, register, logout, authGuard)
- `components/` — Navbar, StepIndicator, Toast, GlassCard, SkeletonLoader
- `pages/CreatePage.jsx` — 4-state machine (Day 3)
- `pages/LoginPage.jsx` — Auth form (Day 4)
- `pages/DashboardPage.jsx` — Stats + job list (Day 4)
- `sections/` — SetupView, ProcessingView, ReviewView, ResultView

#### [NEW] web/src/index.css — Full design system from §2
- All 15 color tokens, typography (Google Fonts: Outfit, Plus Jakarta Sans, JetBrains Mono)
- Glass cards, buttons, form inputs, select, slider, color picker
- Toast notifications, progress bar, skeleton loader, spinner
- Scene cards, status badges, navigation bar
- 12+ keyframe animations from §6
- Responsive breakpoints from §5 (4 tiers: Desktop/Laptop/Tablet/Mobile)

#### [DONE] web/src/sections/SetupView.tsx — 3-Panel Settings
- CSS Grid 3-column layout with all 18 form fields from §4.3 (Max Clip Duration removed)
- Left: textarea + keywords | Middle: video/audio controls | Right: subtitle settings
- Word counter, voice preview, dynamic voice options per TTS engine

### Day 4: Login & Dashboard Auth Flow (✅ Done)

#### [DONE] web/src/pages/LoginPage.tsx — Auth form (§4.1)
- Toggle Login/Register
- JWT storage in localStorage
- Auto-redirect upon success

#### [DONE] web/src/pages/DashboardPage.tsx — Job history (§4.2)
- Stats row or Latest video status bar
- Job list with status badges (Completed/Processing/Failed)
- Pagination / Search

### Day 5-6: Review View & 3-Pane Studio Editor (✅ Done)

#### [DONE] web/src/sections/ReviewView.tsx — Studio Editor
- 3-pane layout: Sidebar (Timeline) | Center (Live Preview) | Right (Scene Detail)
- @remotion/player integration for live preview
- Per-scene property editing (Text, Scene Type, Transition)
- Media re-search integration

### Day 7: Final Polish & Refactor (✅ Done)

#### [DONE] TypeScript Refactor
- Converted all `.jsx` files to `.tsx`
- Established shared `types.ts` for consistent data flow
- Removed all `@ts-ignore` and established strict typing for Job/Scene models
- Professional Shadcn UI components used across the board


#### [NEW] web/src/sections/ProcessingView.jsx — Pipeline Progress
- SSE connection via `api/sse.js`, renders pipeline steps with status icons
- Overall progress bar, live log box, estimated time remaining

#### [NEW] web/src/sections/ReviewView.jsx — Scene Cards (Enhanced v4.1)
- Renders scene cards from `videoProps.scenes` with type badges, timing, transitions
- Color palette preview strip, inline edit for media queries
- Raw JSON toggle for advanced users
- **Background video preview** (thumbnail + click to play)
- **Transition dropdown** per scene (fade/slide/wipe/zoom/none)
- **Scene type dropdown** per scene (with auto-enrichment for missing data)
- **@remotion/player integration** for live video preview (optional toggle)

#### [NEW] web/src/sections/ResultView.jsx — Video Player
- HTML5 video player for 9:16 video, download button, "Create Another" reset
- Generation stats (pipeline time, TTS time, render time, file size)

#### [NEW] web/src/context/AuthContext.jsx — Auth Provider
- `useAuth()` hook: `{ user, token, login(), register(), logout() }`
- JWT in localStorage, auto-redirect to `/login` if expired

---

### Day 4: Login Page + Dashboard Page

#### [NEW] web/src/pages/LoginPage.jsx — §4.1 wireframe
- Login/Register toggle, animated mesh gradient background
- Client-side validation, inline errors, Enter key = submit

#### [NEW] web/src/pages/DashboardPage.jsx — §4.2 wireframe
- Stats row, job cards with status badges, filter tabs
- Quick Create redirect, skeleton loading, pagination

---

### Day 5-6: Scene Review + Polish

- Visual scene cards with edit functionality (§4.3 State 3)
- Edit Query inline → re-search media for that scene
- Color palette preview
- Toast system, responsive polish, keyboard shortcuts
- Cross-browser testing

---

### Day 7: Railway Deploy + Integration Test

- Dockerfile serves API + `web/` static
- Set Railway env vars (NOT in code)
- Full flow test checklist

---

## 9. Week 2-3: Production

### Day 8: Vercel Migration + PostgreSQL Swap (~4h)

**Part A: Vercel** — `API_BASE` auto-detect, CORS whitelist, `vercel.json`  
**Part B: PostgreSQL** — Provision Railway add-on, change `DATABASE_URL`, `alembic upgrade`

### Day 9-10: Security Hardening

Rate limiting, input sanitization, security headers, API key rotation, XSS prevention

### Day 11-12: Testing

E2E (Playwright) + API integration tests + existing unit tests

### Day 13: Performance + Accessibility

GZip, font preloading, PostgreSQL connection pooling, WCAG 2.1 AA

### Day 14: Monitoring + Final Verification

Sentry, Vercel Analytics, Lighthouse scores

---

## 10. Data Models (Frontend State)

```typescript
interface VideoProps {
  job_id: string;
  title: string;
  color_palette: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
  };
  audio_url: string;
  word_timestamps: Array<{
    text: string;
    start_ms: number;
    end_ms: number;
  }>;
  scenes: Array<{
    scene_index: number;
    scene_type: 'title_card' | 'stock_background' | 'info_card'
              | 'stats_highlight' | 'diagram' | 'emoji_grid'
              | 'comparison' | 'timeline' | 'media_showcase';
    narration: string;
    visual_description: string;
    start_ms: number;
    end_ms: number;
    transition: 'fade' | 'slide' | 'wipe' | 'none';
    layout: string;
    image_query: string | null;
    video_query: string | null;
    media_url: string | null;
    media_type: 'video' | 'image' | null;
    keywords_to_highlight: string[];
    english_phrases: string[];
    card_items?: Array<{ icon: string; title: string; subtitle: string }>;
    stats?: Array<{ label: string; value: string; color: string }>;
    diagram_spec?: {
      type: 'line_chart' | 'bar_chart' | 'scatter' | 'math_formula';
      latex?: string;
      data?: Array<{ x: number | string; y: number }>;
      annotations?: string[];
    };
  }>;
  settings: {
    aspect_ratio: '9:16' | '16:9';
    fps: number;
    transition_mode: 'none' | 'crossfade' | 'fade_to_black';
    bgm_url: string | null;
    bgm_volume: number;
    subtitle: {
      enabled: boolean;
      font: string;
      font_size: number;
      font_color: string;
      highlight_color: string;
      stroke_color: string;
      stroke_width: number;
      position: 'top' | 'center' | 'bottom';
    };
  };
}

interface AppState {
  currentStep: 'setup' | 'processing' | 'review' | 'result';
  inputText: string;
  settings: VideoSettings;
  jobId: string | null;
  videoProps: VideoProps | null;
  videoUrl: string | null;
  error: string | null;
  logs: string[];
}
```

---

## 11. File Summary

### New Files (~25+)

| File | Layer | Day |
|------|:-----:|:---:|
| `api/database.py` | Backend (SQLAlchemy ORM) | 1 |
| `api/auth.py` | Backend | 1 |
| `api/models.py` | Backend (Pydantic) | 1 |
| `api/routes.py` | Backend | 2 |
| `alembic.ini` + `alembic/` | DB Migrations | 1 |
| `web/` (Vite + React scaffold) | Frontend project | 3 |
| `web/src/index.css` | Design System | 3 |
| `web/src/main.jsx` | Entry + Router | 3 |
| `web/src/App.jsx` | Root Layout | 3 |
| `web/src/api/client.js` | API Client | 3 |
| `web/src/api/sse.js` | SSE Handler | 3 |
| `web/src/context/AuthContext.jsx` | Auth State | 3 |
| `web/src/pages/CreatePage.jsx` | Create Page | 3 |
| `web/src/sections/SetupView.jsx` | Settings Form | 3 |
| `web/src/sections/ProcessingView.jsx` | SSE Progress | 3 |
| `web/src/sections/ReviewView.jsx` | Scene Cards | 5 |
| `web/src/sections/ResultView.jsx` | Video Result | 3 |
| `web/src/components/*.jsx` | Navbar, Toast, etc. | 3-4 |
| `web/src/pages/LoginPage.jsx` | Login Page | 4 |
| `web/src/pages/DashboardPage.jsx` | Dashboard Page | 4 |
| `vercel.json` | Deploy | 8 |
| `tests/test_auth.py` | Test | 11 |
| `tests/test_routes.py` | Test | 11 |
| `tests/test_database.py` | Test | 11 |
| `tests/e2e/*.spec.js` | Test | 11 |

### Modified Files (3)

| File | Day | Changes |
|------|:---:|---------|
| `api/main.py` | 2, 8 | Routes, DB init, mount `web/dist/`, CORS |
| `config.py` | 1 | DATABASE_URL, ALLOWED_ORIGINS |
| `requirements.txt` | 1 | sqlalchemy, asyncpg, alembic |

---

## 12. Resolved Decisions

> [!NOTE]
> **Q1: ✅ Giữ Scene Review trước Render.**  
> Pipeline dừng sau Parse + TTS + Media → hiển thị Scene Cards → user sửa queries → nhấn "Start Render".  
> MASTER_PLAN_VI đã update lên v4.3 (ADR-16 updated).

> [!NOTE]
> **Q2: ✅ Dùng free subdomain.**  
> MVP: `*.railway.app`. Production: `*.vercel.app` (frontend) + `*.railway.app` (backend).  
> Không cần mua domain riêng.

---

## 13. Notes for Frontend Developer (v4.1)

> [!IMPORTANT]
> Phần này là lưu ý từ System Architect & Builder AI sau khi review plan.
> Frontend developer nên đọc trước khi bắt đầu code.

### 13.1 Backend Gaps — Cần coordinate

| Issue | Mô tả | Impact | Status |
|-------|--------|--------|:------:|
| **Pipeline 2 Phases** | Tách pipeline: Phase 1 (`skip_render=True` → `review_ready` SSE) + Phase 2 (`POST /jobs/{id}/render`). | Review state (State 3) cần API này | ✅ Plan v2 approved |
| **PATCH /jobs/{id}/props** | Update scenes array (transitions, types, etc.) | Scene editing trong Review | ✅ Plan v2 approved |
| **POST /jobs/{id}/scenes/{idx}/re-search** | Re-search media cho 1 scene, thay thế Video Keywords từ Setup | Per-scene keyword editing trong Review | ✅ Plan v2 approved |
| **Settings passthrough** | `run_pipeline()` hiện chỉ nhận `voice` + `rate`. 15 settings còn lại lưu DB nhưng chưa pipeline đọc | UI settings ngoài voice/rate chưa có effect | ℹ️ Known |

### 13.2 Frontend Technical Notes

| Topic | Lưu ý |
|-------|-------|
| **Base URL** | `main.py` mount frontend tại `/web/`. Nếu dùng react-router, cần `basename="/web"` trong `<BrowserRouter>`. Hoặc đổi mount point sang `/` (cần tránh conflict với `/demo/`). **Quyết định trước khi config router.** |
| **SPA Fallback** | `StaticFiles(html=True)` KHÔNG return `index.html` cho sub-paths (`/web/login`, `/web/dashboard`). Cần thêm catch-all route trong `main.py`. Fix trước deploy, không ảnh hưởng dev mode (Vite dev server tự handle). |
| **Vite Proxy** | `vite.config.js` chưa có proxy config. Cần thêm `server.proxy: { '/api': 'http://localhost:8080' }` để dev mode không bị CORS. |
| **SSE Connection** | Pipeline mất 30-60s. SSE connect <1s. Race condition gần như không xảy ra. Nếu cần fallback, dùng `GET /api/jobs/{id}` để sync state. Không cần replay buffer cho MVP. |
| **@remotion/player** | Cần `npm install @remotion/player` trong `web/`. Import components từ `remotion/src/`. Cần config Vite alias để resolve cross-project imports. Effort setup: ~2-3h. |
| **Max Clip Duration** | Đã bị loại bỏ khỏi plan. Duration do pipeline tự tính từ word timestamps. Xem §4.3 Field Specifications. |
