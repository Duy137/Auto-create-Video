# AutoClip — Unified Implementation Plan v4.2

> **Date:** 2026-04-16  
> **Source:** All internal docs in `documents/` (`RESEARCH.md`, `TTS_RESEARCH.md`, `WORKLOG.md`, `JOURNAL.md`, `TOOL_RESEARCH_REPORT.md`), `SPEC.md`, MoneyPrinterTurbo analysis, 10 sample video screenshots, builder AI critical review  
> **Status:** ✅ Ready for implementation — approved

---

## Goal

Build an AI pipeline that **automatically converts finalized text content** into short vertical videos (9:16).

```
User submits Final Text
    → System analyzes structure
    → Generates voiceover
    → Fetches video backgrounds
    → Renders animated video
    → Outputs complete MP4
```

⚠️ **The system does NOT edit, rewrite, or curate content.**

### Target Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| Video length | ≤ 3 minutes | ~500 words max |
| Cost per video | ≤ 5,000 VND | Estimated ~900 VND |
| Processing time | ≤ 3 minutes | Including TTS + render |
| Content integrity | 100% | No additions, deletions, or rewrites |
| Audio–subtitle sync | ≤ 0.3s drift | Whisper alignment |

---

## Key Decisions (v4.2 changes from v4.1)

### 🔴 Critical

> [!IMPORTANT]
> **Input is Final Text, not a Topic.**  
> System only does post-production. Content integrity = 100%.

> [!IMPORTANT]
> **Voice Preview before Generate _(v4.1)_**  
> User clicks "▶ Preview Voice" → synthesizes first sentence (~10-20 words) → plays audio sample.  
> Allows adjusting voice/rate before full generation.

> [!IMPORTANT]
> **Scene Preview deferred _(v4.1 → v4.2)_**  
> Per-scene preview removed from MVP. LangGraph architecture supports adding `interrupt()` node later.  
> MVP uses `remotion still` thumbnails for per-scene preview instead of real-time Remotion Player.  
> Remotion Player preview deferred to Phase 3 (requires React frontend refactor).

> [!IMPORTANT]
> **LLM Engine changed _(v4.2)_**  
> Content Parser switched from Gemini 2.5 Flash → **GPT-4o-mini** (primary).  
> Reason: same API key as TTS (reduces dependency count from 3 → 2 required keys), excellent JSON structured output support.  
> Gemini 2.5 Flash kept as fallback.

### 🟡 Warnings

> [!WARNING]
> **TTS engine changed from v2.**  
> Switched from Edge-TTS to **OpenAI gpt-4o-mini-tts** for natural Vietnamese–English code-switching.  
> Cost increases 0 → ~380 VND/video but quality significantly better.

> [!WARNING]
> **Video Backgrounds _(v4)_**  
> Replaced Pexels static images with **Pexels Videos API** for animated stock backgrounds.  
> Videos are downloaded, locally cached, and blurred when used as backgrounds. Image fallback retained.

> [!WARNING]
> **UI language is ENGLISH.**  
> All labels, buttons, notifications, and form text must be in English.

> [!WARNING]
> **Authentication System _(v4)_**  
> JWT + SQLite + bcrypt. Login/Register UI + Job history dashboard.

### 📝 Notes

> [!NOTE]
> **F6 — Asset Substitution _(v4.2 clarification)_**  
> SPEC.md F6 (P1): user can change image query per scene.  
> **MVP flow:** Pipeline generates thumbnails per scene via `remotion still` → user sees grid → edits keywords → re-generates if needed (~2-3 min, ~900 VND).  
> **Phase 3:** Refactor `web/` to React → embed `@remotion/player` for real-time preview + instant asset swap (0 VND, 2-5s).

---

## Architecture Overview

### Architecture: Python Pipeline + Remotion Renderer

```
┌─────────────────────────────────────────────────────┐
│                  PYTHON LAYER                        │
│  (FastAPI + LangGraph — DATA processing only)        │
│                                                      │
│  • Validate input                                    │
│  • LLM parse → JSON (GPT-4o-mini)                   │
│  • TTS → audio + word timestamps                    │
│  • Pexels search → media URLs                       │
│  • Auth / Jobs / Database                           │
│  • SSE progress events                              │
│                                                      │
│  Output: video_props.json + full.mp3 + media files  │
└──────────────────────┬──────────────────────────────┘
                       │ JSON + files (JSON Contract)
                       ▼
┌─────────────────────────────────────────────────────┐
│                REMOTION LAYER                        │
│  (React/TypeScript — VISUAL rendering only)          │
│                                                      │
│  • Receives props from Python (JSON)                │
│  • 5 scene templates (React components)             │
│  • @remotion/captions for subtitles                 │
│  • KaTeX for math formulas                          │
│  • CSS animations, transitions                      │
│  • CLI render: export MP4                           │
│                                                      │
│  Input: inputProps JSON → Output: final.mp4         │
└─────────────────────────────────────────────────────┘
```

### Pipeline Flow (Continuous — No Interrupt)

```
User adjusts Settings (keywords, voice, speed, BGM, etc.)
        │
        ├── 🔊 [Optional] Preview Voice → plays audio sample
        │
        ▼
  Clicks "Generate Video"

┌─────────────────────────┐
│  0. Input Validator      │ ← Rule-based (instant)
└──────────┬──────────────┘
           │
┌─────────────────────────┐
│  1. Content Parser       │ ← GPT-4o-mini → JSON (uses edited keywords)
└──────────┬──────────────┘
           │
    ┌──────┴──────────────┐   (Parallel fan-out)
    ▼                     ▼
┌────────────┐    ┌──────────────┐
│ 2A. TTS    │    │ 2B. Media    │
│ + Whisper  │    │    Searcher  │
└─────┬──────┘    └──────┬───────┘
      └──────────┬───────┘   (Fan-in)
                 ▼
┌─────────────────────────┐
│  3. Video Renderer       │ ← Remotion render (3 layers + transitions + BGM)
└──────────┬──────────────┘
           ▼
      📹 Final MP4 (SSE notifies → user downloads)
```

> [!NOTE]
> Pipeline runs continuously (~2-3 minutes). SSE sends real-time progress updates to frontend.  
> No interrupt — user controls quality via editable keywords and voice preview **before** generation.

### LangGraph Orchestrator (Example)

```python
graph.add_edge("validate", "parse")
graph.add_edge("parse", "tts")              # Fan-out
graph.add_edge("parse", "media")            # Fan-out  
graph.add_edge(["tts", "media"], "render")  # Fan-in → render directly
graph.add_edge("render", END)

# No interrupt() — pipeline runs continuously
# Scalable: add interrupt node later = 1 node + 1 edge
```

---

## JSON Contract (Python ↔ Remotion)

> [!IMPORTANT]
> **This is the most critical section for AI builders.** The JSON Contract defines exactly what Python outputs and what Remotion receives. Both sides must conform to this schema.

### snake_case → camelCase Strategy

Python outputs `snake_case` JSON (Pydantic default). Remotion TypeScript side uses a `camelizeKeys()` utility in `remotion/src/lib/utils.ts` to transform before Zod validation.

### TypeScript Schema (Remotion — Zod)

```typescript
// remotion/src/schemas/videoProps.ts
import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

// ── Word Timestamps (from Whisper alignment) ──
const WordTimestamp = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
});

// ── Color Palette (from LLM) ──
const ColorPalette = z.object({
  primary: hexColor,
  secondary: hexColor,
  background: hexColor,
  text: hexColor,
});

// ── Chart Data Point (for diagram) ──
const ChartDataPoint = z.object({
  x: z.union([z.number(), z.string()]),
  y: z.number(),
  label: z.string().optional(),
});

// ── Diagram Spec ──
const DiagramSpec = z.object({
  type: z.enum(['line_chart', 'bar_chart', 'scatter', 'math_formula']),
  xRange: z.tuple([z.number(), z.number()]).optional(),
  function: z.string().optional(),
  data: z.array(ChartDataPoint).optional(),
  latex: z.string().optional(),
  annotations: z.array(z.string()).optional(),
});

// ── Scene Data ──
const Scene = z.object({
  sceneIndex: z.number().int().nonnegative(),
  sceneType: z.enum([
    'title_card', 'stock_background', 'info_card',
    'stats_highlight', 'diagram',
  ]),
  narration: z.string(),
  visualDescription: z.string(),

  // Timing (computed from audio word timestamps)
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),

  // Search queries (from LLM, editable by user)
  imageQuery: z.string().nullable(),
  videoQuery: z.string().nullable(),

  // Resolved media (from Pexels, after Media Searcher)
  mediaUrl: z.string().nullable(),
  mediaType: z.enum(['video', 'image']).nullable(),

  // Keywords
  keywordsToHighlight: z.array(z.string()),
  englishPhrases: z.array(z.string()),

  // Type-specific data (optional)
  cardItems: z.array(z.object({
    icon: z.string(),
    title: z.string(),
    subtitle: z.string(),
  })).optional(),

  stats: z.array(z.object({
    label: z.string(),
    value: z.string(),
    color: hexColor,
  })).optional(),

  diagramSpec: DiagramSpec.optional(),
});

// ── Subtitle Settings ──
const SubtitleSettings = z.object({
  enabled: z.boolean(),
  font: z.string(),
  fontSize: z.number().int().min(20).max(100),
  fontColor: hexColor,
  highlightColor: hexColor,
  strokeColor: hexColor,
  strokeWidth: z.number().min(0).max(10),
  position: z.enum(['top', 'center', 'bottom']),
});

// ── Video Settings ──
const Settings = z.object({
  aspectRatio: z.enum(['9:16', '16:9']),
  fps: z.number().int().default(30),
  transitionMode: z.enum(['none', 'crossfade', 'fade_to_black']),
  bgmUrl: z.string().nullable(),
  bgmVolume: z.number().min(0).max(1),
  subtitle: SubtitleSettings,
});

// ══════════════════════════════════════════════
// ROOT: Complete data for 1 video
// ══════════════════════════════════════════════
export const VideoPropsSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  colorPalette: ColorPalette,
  audioUrl: z.string(),
  wordTimestamps: z.array(WordTimestamp),
  scenes: z.array(Scene),
  settings: Settings,
});

export type VideoProps = z.infer<typeof VideoPropsSchema>;
export type SceneData = z.infer<typeof Scene>;
```

### Python Schema (Pydantic)

```python
# app/state.py
from pydantic import BaseModel

class WordTimestamp(BaseModel):
    text: str
    start_ms: float
    end_ms: float

class ColorPalette(BaseModel):
    primary: str     # hex color
    secondary: str
    background: str
    text: str

class CardItem(BaseModel):
    icon: str
    title: str
    subtitle: str

class StatItem(BaseModel):
    label: str
    value: str
    color: str

class ChartDataPoint(BaseModel):
    x: float | str
    y: float
    label: str | None = None

class DiagramSpec(BaseModel):
    type: str  # line_chart | bar_chart | scatter | math_formula
    x_range: list[float] | None = None
    function: str | None = None
    data: list[ChartDataPoint] | None = None
    latex: str | None = None
    annotations: list[str] | None = None

class Scene(BaseModel):
    scene_index: int
    scene_type: str
    narration: str
    visual_description: str
    start_ms: float
    end_ms: float
    image_query: str | None = None
    video_query: str | None = None
    media_url: str | None = None
    media_type: str | None = None
    keywords_to_highlight: list[str] = []
    english_phrases: list[str] = []
    card_items: list[CardItem] | None = None
    stats: list[StatItem] | None = None
    diagram_spec: DiagramSpec | None = None

class SubtitleSettings(BaseModel):
    enabled: bool = True
    font: str = "NotoSansVN-Bold"
    font_size: int = 48
    font_color: str = "#FFFFFF"
    highlight_color: str = "#FF6B35"
    stroke_color: str = "#000000"
    stroke_width: int = 2
    position: str = "bottom"

class VideoSettings(BaseModel):
    aspect_ratio: str = "9:16"
    fps: int = 30
    transition_mode: str = "crossfade"
    bgm_url: str | None = None
    bgm_volume: float = 0.2
    subtitle: SubtitleSettings = SubtitleSettings()

class VideoProps(BaseModel):
    """Root: complete data for 1 video."""
    job_id: str
    title: str
    color_palette: ColorPalette
    audio_url: str
    word_timestamps: list[WordTimestamp]
    scenes: list[Scene]
    settings: VideoSettings
```

### Data Flow

```
Python Pipeline                          Remotion
─────────────                           ─────────

1. validate(text)
2. parse(text) → scenes JSON
3. tts(narration) → full.mp3
4. whisper(full.mp3) → timestamps
5. pexels(queries) → media URLs

6. Assemble → VideoProps
7. video_props.model_dump() → JSON
   ↓
   output/{jobId}/video_props.json ──→ 8. Remotion reads JSON
   output/{jobId}/audio/full.mp3  ──→    (via inputProps)
   output/{jobId}/media/*         ──→
                                        9. camelizeKeys() transform
                                        10. Zod validate
                                        11. Render scenes
                                        12. Export final.mp4
```

---

## Cost Per Video Estimate (1 minute)

| Component | Technology | Cost |
|-----------|-----------|------|
| Content parsing | GPT-4o-mini (~1K tokens in/out) | ~19 VND |
| **Voice synthesis** | **OpenAI gpt-4o-mini-tts** | **~380 VND** |
| Word-level timestamps | Whisper forced-alignment (local) | 0 VND |
| Video/Image search | Pexels API (free, 200 req/hr) | 0 VND |
| Visual asset generation | CSS / React DOM (Remotion) | 0 VND |
| Math rendering | KaTeX (local) | 0 VND |
| Video rendering | Remotion CLI + Headless Chrome | 0 VND |
| **Total** | | **~400-900 VND ✅** |

> [!TIP]
> Cost reduced from v4.1 (~880 VND) by switching Content Parser from Gemini (~500 VND) to GPT-4o-mini (~19 VND).  
> Compared to MoneyPrinterTurbo (ElevenLabs/Azure), cost is **3-5x lower** since no LLM script generation.

---

## 5 Scene Layout Types

Analysis of 10 screenshots from "Cắt cảnh mẫu video output" → **5 layout types needed:**

| # | Type | Example | Description |
|:-:|------|---------|-------------|
| 1 | **`title_card`** | "DEPLOY AGENT AI TRONG VÀI NGÀY" | Dark/gradient bg + large multi-color text + branding |
| 2 | **`stock_background`** | "OPEN SOURCE + HUAWEI" | Blurred stock video bg + text overlay + subtitles |
| 3 | **`info_card`** | "Quy Trình PaperOrchestra" | Dark bg + staggered card list with icons + title |
| 4 | **`stats_highlight`** | "thảm 2.0, ghế 1.4" | Dark bg + large highlighted numbers + color-coded boxes |
| 5 | **`diagram`** | e^x graph, Softmax formula | Chart (Recharts) or **math formula (KaTeX)** + annotations |

> [!NOTE]
> LLM Content Parser auto-classifies each scene into 1 of 5 types.  
> `title_card` → opening/closing scenes · `diagram` → only when text contains formulas, data, or equations.  
> `diagram.type = "math_formula"` → user writes naturally ("hàm e mũ x"), LLM auto-converts to LaTeX (`e^{x}`).

---

## UI Settings

> Inspired by MoneyPrinterTurbo.  
> **All labels, buttons, and notifications in English.**

### Left Panel — Content

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| Final Text | textarea | — | Original content, system does not edit |
| Video Keywords | **editable textarea** | LLM-generated | Default from LLM; **user can edit before submit** |

### Middle Panel — Video & Audio Settings

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| Aspect Ratio | select | Portrait 9:16 | Vertical (1080×1920) / Horizontal (1920×1080) |
| Max Clip Duration | select | 5s | 2-10s, background duration per scene |
| TTS Engine | select | OpenAI | OpenAI gpt-4o-mini-tts / Edge-TTS (free) |
| Voice | select | — | Voices matching selected engine |
| Speech Rate | slider | 1.0 | 0.8 – 2.0 |
| Speech Volume | slider | 1.0 | 0.6 – 3.0 |
| **Video Transition** | **select** | **Crossfade** | **None / Crossfade / Fade to Black** |
| **Video Concatenation** | **select** | **Sequential** | **Sequential / Random** |
| Background Music | select | Random | None / Random / Custom upload (≤ 10MB, mp3/wav/m4a) |
| BGM Volume | slider | 0.2 | 0.0 – 1.0 |
| **▶ Preview Voice** | **button** | — | **Synthesizes first sentence → plays audio** |

### Right Panel — Subtitle Settings

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| Enable Subtitles | checkbox | ✅ | On / Off |
| Font | select | NotoSansVN-Bold | Scanned from `fonts/` directory |
| Font Size | slider | 48 | 30 – 80 |
| Font Color | color picker | `#FFFFFF` | |
| Stroke Color | color picker | `#000000` | |
| Stroke Width | slider | 2.0 | 0 – 10 |
| Position | select | Bottom | Top / Center / Bottom / Custom % |
| Highlight Color | color picker | `#FF6B35` | Color for currently spoken word |

---

## Project Structure

> [!IMPORTANT]
> **Folder decision (v4.2):**  
> Uses `app/` instead of `pipeline/` or `src/`. Existing `src/` (old prototype code) will be migrated to `app/` in Phase 1.  
> `rendering/` folder from v4.1 is **removed entirely** — all rendering logic moved to `remotion/src/`.

```
A20-App-160/
│
├── 📦 Dockerfile                         # [UPDATED] python:3.11-slim + Node.js 20 + Chromium
├── 📦 docker-compose.yml                 # [UPDATED] api service + volume mounts
├── 📦 .dockerignore
├── 📄 SPEC.md
├── 📄 README.md
├── 📄 requirements.txt                   # [UPDATED — removed moviepy, Pillow, matplotlib]
├── 📄 .env.example                       # [UPDATED — JWT_SECRET_KEY]
│
├── 🔧 app/                               # PYTHON — Data & Orchestration
│   ├── __init__.py
│   ├── orchestrator.py                   # LangGraph graph (continuous, no interrupt)
│   ├── state.py                          # Pydantic VideoProps (JSON Contract)
│   └── nodes/
│       ├── __init__.py
│       ├── input_validator.py            # Rule-based validation
│       ├── content_parser.py             # GPT-4o-mini → JSON scenes
│       ├── tts_preprocessor.py           # Numbers → words, abbreviations (NO SSML)
│       ├── tts_synthesizer.py            # Abstract TTSEngine → OpenAI / EdgeTTS
│       ├── word_aligner.py               # Whisper forced-alignment
│       ├── media_searcher.py             # Pexels video + image search
│       └── video_renderer.py             # CLI wrapper for Remotion (subprocess)
│
├── 🌐 api/                               # PYTHON — Web API
│   ├── __init__.py
│   ├── main.py                           # FastAPI + CORS + static mount
│   ├── routes.py                         # submit, SSE, tts-preview, bgm-upload, download
│   ├── auth.py                           # [NEW — JWT, bcrypt, role deps]
│   ├── models.py                         # Pydantic request/response schemas
│   └── database.py                       # [NEW — SQLite, schema, CRUD]
│
├── 🎬 remotion/                           # TYPESCRIPT — Video Rendering
│   ├── package.json                      # [NEW — locked versions]
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── remotion.config.ts
│   ├── public/
│   │   ├── fonts/
│   │   │   ├── NotoSansVN-Bold.ttf
│   │   │   └── NotoSansVN-Regular.ttf
│   │   └── katex/                        # KaTeX fonts (bundled)
│   │       └── fonts/
│   └── src/
│       ├── Root.tsx                       # Composition registry
│       ├── AutoClipVideo.tsx              # Main composition (assembles scenes)
│       ├── scenes/                        # 1 file = 1 template
│       │   ├── TitleCard.tsx
│       │   ├── StockBackground.tsx
│       │   ├── InfoCard.tsx
│       │   ├── StatsHighlight.tsx
│       │   └── Diagram.tsx               # Charts (Recharts) + Math (KaTeX)
│       ├── components/                    # Shared UI components
│       │   ├── AnimatedCaption.tsx        # @remotion/captions wrapper
│       │   ├── MathFormula.tsx            # react-katex wrapper
│       │   ├── BackgroundVideo.tsx        # Video bg + blur overlay
│       │   └── TransitionWrapper.tsx      # Transition effects
│       ├── schemas/
│       │   └── videoProps.ts              # Zod schema (JSON Contract)
│       └── lib/
│           ├── utils.ts                   # camelizeKeys() helper
│           ├── animations.ts              # Easing, interpolate helpers
│           └── colors.ts                  # Color utilities
│
├── 🖥️ web/                                # Frontend (vanilla HTML/JS/CSS for MVP)
│   ├── index.html                        # Video creation page, English UI
│   ├── login.html                        # [NEW — login + register form]
│   ├── dashboard.html                    # [NEW — job list]
│   ├── style.css
│   └── app.js                            # [UPDATED — auth flow, dashboard, SSE]
│
├── ⚙️ config.py                           # [UPDATED — JWT, Railway configs]
├── 📦 output/                             # Generated videos (git-ignored)
│   └── {job_id}/
│       ├── video_props.json              # [NEW — JSON Contract output]
│       ├── audio/
│       │   ├── full.mp3
│       │   └── word_alignment.json
│       ├── media/                         # Downloaded bg videos/images
│       ├── thumbnails/                    # [NEW — remotion still outputs]
│       └── final.mp4
│
└── 🧪 tests/
    ├── test_input_validator.py
    ├── test_content_parser.py
    ├── test_tts.py
    ├── test_word_aligner.py
    └── test_renderer.py
```

---

## Component Details

---

### Component 0 — Input Validator

> **Rule-based · No API cost · Instant response**

| Rule | Condition | Action |
|------|-----------|--------|
| Too short | `word_count < 30` | ❌ Reject |
| Too long | `word_count > 500` | ❌ Reject + show word count |
| Spam | 3+ consecutive identical sentences ≥ 90% | ❌ Reject |
| Light duplicates | Duplicate sentences < 3 consecutive | ⚠️ Warning |
| Emoji/CJK | Regex detection | ✅ Auto-remove + notify |
| Gibberish | 5+ consecutive meaningless consonants | ⚠️ Warning |

---

### Component 1 — Content Parser

> **LLM:** GPT-4o-mini (primary) / Gemini 2.5 Flash (fallback)  
> **Input:** Final text (validated)  
> **Output:** JSON structure conforming to VideoProps schema

**v4.2 changes:**
- Switched from Gemini 2.5 Flash → GPT-4o-mini (structured output, same API key as TTS)
- Each scene now has `video_query` + `image_query` fields for Pexels search
- LLM auto-detects math expressions → outputs LaTeX in `diagram_spec.latex`

#### LLM Strategy

```
🥇 PRIMARY:   GPT-4o-mini (structured output via response_format)
🔄 FALLBACK:  Gemini 2.5 Flash (if OpenAI API fails)
```

#### Prompt additions (v4.2):

```
If narration contains mathematical expressions:
1. Keep narration as-is (natural Vietnamese text)
2. Set scene_type = "diagram", diagram_spec.type = "math_formula"
3. Set diagram_spec.latex = LaTeX equivalent
Example: "e mũ x" → latex: "e^{x}"
If user already uses $...$ notation, preserve LaTeX as-is.
```

<details>
<summary>📋 Full JSON Output Example</summary>

```json
{
  "title": "Deploy Agent AI Within Days",
  "color_palette": {
    "primary": "#FF6B35",
    "secondary": "#7B68EE",
    "background": "#0F172A",
    "text": "#FFFFFF"
  },
  "scenes": [
    {
      "scene_index": 0,
      "scene_type": "title_card",
      "narration": "Deploy Agent AI Trong Vài Ngày",
      "visual_description": "Title screen with tech network graphic",
      "image_query": "AI neural network dark background",
      "video_query": "AI technology network digital",
      "keywords_to_highlight": ["Agent AI"],
      "english_phrases": ["Agent AI", "Deploy"]
    },
    {
      "scene_index": 1,
      "scene_type": "stock_background",
      "narration": "Claude Managed Agents cho phép chạy AI agent trên cloud...",
      "visual_description": "Cloud computing servers",
      "image_query": "cloud computing server room",
      "video_query": "cloud server data center",
      "keywords_to_highlight": ["Claude", "Managed Agents", "cloud"],
      "english_phrases": ["Claude", "Managed Agents", "cloud"]
    },
    {
      "scene_index": 2,
      "scene_type": "diagram",
      "narration": "Softmax chuyển điểm số thành xác suất...",
      "visual_description": "Softmax probability formula",
      "image_query": null,
      "video_query": null,
      "diagram_spec": {
        "type": "math_formula",
        "latex": "\\text{softmax}(x_i) = \\frac{e^{x_i}}{\\sum_{j=1}^{K} e^{x_j}}",
        "annotations": ["Luôn dương ✓", "Tổng = 1 ✓"]
      },
      "keywords_to_highlight": ["Softmax"],
      "english_phrases": ["Softmax"]
    }
  ]
}
```

</details>

> [!IMPORTANT]
> **Content Integrity Rule:**  
> The `narration` field **MUST** contain the **exact original text** from user input.  
> LLM is ONLY allowed to add punctuation for TTS sentence-splitting.  
> ❌ Absolutely no paraphrasing or rewriting.

---

### Component 2A — TTS Synthesizer

#### TTS Strategy

```
🥇 PRIMARY:   OpenAI gpt-4o-mini-tts (~380 VND, natural Vi-En code-switch)
💎 PREMIUM:   Kie.ai ElevenLabs (Phase 3+, highest quality)
🔄 FALLBACK:  Edge-TTS (free, Vi-En quality lower but acceptable)
```

#### TTSEngine Abstract Interface

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class TTSResult:
    audio_bytes: bytes
    audio_path: str
    word_boundaries: list[dict]  # [{text, start_ms, end_ms}, ...]
    duration_ms: float

class TTSEngine(ABC):
    @abstractmethod
    async def synthesize(self, text: str, voice: str, rate: float = 1.0,
                         volume: float = 1.0) -> TTSResult:
        pass

class OpenAITTSEngine(TTSEngine):
    async def synthesize(self, text, voice="nova", rate=1.0, volume=1.0) -> TTSResult:
        # 1. Call OpenAI TTS API → audio bytes
        # 2. Save to temp file
        # 3. Run Whisper forced-alignment → word boundaries
        # 4. Return TTSResult
        pass

class EdgeTTSEngine(TTSEngine):
    async def synthesize(self, text, voice="vi-VN-HoaiMyNeural", rate=1.0, volume=1.0) -> TTSResult:
        # 1. edge_tts.Communicate() → stream audio + WordBoundary
        # 2. Convert ticks → ms (offset / 10000)
        # 3. Return TTSResult
        pass
```

#### TTS Preprocessor

> **No SSML** — Edge-TTS dropped SSML support.

```python
def preprocess_for_tts(narration: str, expanded_abbreviations: dict[str, str]) -> str:
    """Preprocess plain text for TTS. NO SSML wrapping."""
    result = narration
    for abbr, full_form in expanded_abbreviations.items():
        result = result.replace(abbr, full_form)
    result = convert_numbers_to_words(result)
    return result
```

---

### Component 2B — Media Searcher (video + image)

> **Renamed:** `image_searcher.py` → `media_searcher.py`  
> Pexels Video API uses **same API key** as Images API, same rate limit (200 req/hr).

```python
async def search_media(query: str, **kwargs) -> dict:
    """Priority: video → image fallback → empty dict."""
    videos = await search_videos(query, **kwargs)
    if videos:
        return {"type": "video", **videos[0]}
    images = await search_images(query)
    if images:
        return {"type": "image", **images[0]}
    return {}
```

**Background rendering strategy:**
- Stock video → resize/crop 9:16 → blur (resize 0.15x then upscale — faster than Gaussian) → semi-transparent dark overlay (opacity 0.5–0.6)
- Cache videos locally at `output/{job_id}/media/`
- Async download with timeout · fallback to image on timeout

---

### Component 3 — Voice Preview _(v4.1)_

```python
@router.post("/api/tts/preview")
async def preview_voice(request: VoicePreviewRequest):
    sample_text = extract_first_sentence(request.text, max_words=50)
    engine = get_tts_engine(request.engine)
    result = await engine.synthesize(text=sample_text, voice=request.voice, rate=request.rate)
    return StreamingResponse(io.BytesIO(result.audio_bytes), media_type="audio/mpeg")
```

**Cost:** ~20 VND per preview (1 sentence only) — negligible.

---

### Component 3B — BGM Upload _(v4.1)_

```python
@router.post("/api/bgm/upload")
async def upload_bgm(file: UploadFile):
    ALLOWED_TYPES = {"audio/mpeg", "audio/wav", "audio/x-m4a", "audio/mp4"}
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Only MP3, WAV, M4A files supported")
    if file.size > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 10MB)")
    # Save and return URL
    ...
```

---

### Fallback Strategy

| Component | Primary | Fallback 1 | Fallback 2 | Last resort |
|-----------|---------|------------|------------|-------------|
| Content Parser | GPT-4o-mini | Gemini 2.5 Flash | — | ❌ Fail |
| TTS | OpenAI gpt-4o-mini-tts | Edge-TTS (free) | — | ❌ Fail |
| Media (per scene) | Pexels Video | Pexels Image | Gradient from `color_palette` | ✅ Always OK |
| Media download | Async (10s timeout) | Retry 1x (5s) | Cached file if exists | Gradient |
| Whisper | Model `base` | Model `tiny` | Estimate from TTS duration | ✅ Always OK |

**Retry strategy:** `delay = base_delay × 2^attempt` (base 2s · max 3 attempts · max delay 16s)

---

### Component 4 — Video Renderer (Remotion)

#### Remotion Rendering Architecture

Each final video frame is rendered by **Remotion** (React/TypeScript):

| Layer | Technology | Description |
|-------|-----------|-------------|
| **Background** | `<Video>` component or CSS Gradients | Stock video (with backdrop-filter blur) or gradient |
| **Visual Content** | React components + CSS layout | `AbsoluteFill`, Flex, etc. |
| **Animations** | CSS Keyframes / `spring()` / `interpolate()` | Smooth animations |
| **Subtitle** | `@remotion/captions` | TikTok-style captions |
| **Math** | `react-katex` + KaTeX | LaTeX formulas (vector SVG) |

#### KaTeX Math Component

```tsx
// remotion/src/components/MathFormula.tsx
import { BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { useCurrentFrame, interpolate } from 'remotion';

export const MathFormula: React.FC<{ latex: string; color?: string }> = ({
  latex,
  color = '#FFFFFF',
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{ opacity, color, fontSize: 56, textAlign: 'center' }}>
      <BlockMath math={latex} />
    </div>
  );
};
```

> [!NOTE]
> Uses `react-katex` (not raw `katex`) for proper React tree rendering.  
> KaTeX fonts must be bundled in `remotion/public/katex/fonts/`.

#### Transitions

Uses Remotion `TransitionSeries` with standard fade/crossfade effects.

#### CLI Render Integration (Python → Remotion)

```python
# app/nodes/video_renderer.py
import subprocess
import asyncio

render_semaphore = asyncio.Semaphore(1)  # Only 1 render at a time (Railway RAM)

async def render_video(props_path: str, output_path: str) -> dict:
    """Render video via Remotion CLI with error handling."""
    async with render_semaphore:
        cmd = [
            "npx", "remotion", "render",
            "src/index.ts", "AutoClipVideo", output_path,
            "--props", props_path,
            "--timeout", "300000",
        ]
        process = subprocess.Popen(
            cmd, cwd="remotion/",
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        return_code = process.wait()
        if return_code != 0:
            stderr = process.stderr.read()
            raise RuntimeError(f"Remotion render failed: {stderr}")
        return {"output_path": output_path}
```

#### Thumbnail Generation (MVP Scene Preview)

```bash
# Generate 1 static thumbnail per scene for preview grid
npx remotion still src/index.ts AutoClipVideo \
  --frame=0 --props=scene_props.json \
  output/thumbnails/scene_0.png
```

Frontend displays thumbnail grid → user reviews scenes → edits keywords if needed → re-generates.

---

### Component 5 — Authentication _(v4)_

#### Database Schema (SQLite)

```sql
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT DEFAULT 'user',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT PRIMARY KEY,
    user_id       INTEGER REFERENCES users(id),
    status        TEXT NOT NULL,   -- pending / processing / done / failed
    settings      JSON,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at  TIMESTAMP,
    output_path   TEXT
);
```

#### API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/auth/register` | Register | ❌ |
| `POST` | `/api/auth/login` | Login → JWT (24h) | ❌ |
| `GET` | `/api/auth/me` | Current user info | 🔒 |
| `POST` | `/api/tts/preview` | Voice preview | 🔒 |
| `POST` | `/api/bgm/upload` | Upload BGM (≤ 10MB) | 🔒 |
| `POST` | `/api/jobs` | Create video job | 🔒 |
| `GET` | `/api/jobs` | List user's jobs | 🔒 |
| `GET` | `/api/jobs/{id}` | Job detail | 🔒 |
| `GET` | `/api/jobs/{id}/progress` | SSE progress stream | 🔒 |
| `GET` | `/api/jobs/{id}/download` | Download final MP4 | 🔒 |

#### SSE Event Schema

```json
{"event": "progress", "step": "validate", "progress": 0.05, "message": "Validating input..."}
{"event": "progress", "step": "parse",    "progress": 0.15, "message": "Parsing content..."}
{"event": "progress", "step": "tts",      "progress": 0.35, "message": "Generating voiceover..."}
{"event": "progress", "step": "media",    "progress": 0.50, "message": "Downloading backgrounds..."}
{"event": "progress", "step": "render",   "progress": 0.80, "message": "Rendering video..."}
{"event": "done", "job_id": "abc-123", "download_url": "/api/jobs/abc-123/download"}
{"event": "error", "step": "media", "message": "Pexels timeout", "fatal": false}
```

**Progress weights:**

| validate | parse | tts | media | render | done |
|:--------:|:-----:|:---:|:-----:|:------:|:----:|
| 5% | 10% | 20% | 20% | 40% | 5% |

#### Roles

| Role | Permissions |
|------|-------------|
| `user` | Create videos, view own jobs only |
| `admin` | View all jobs, manage users |

#### UI Flow

```
Login → Dashboard → Create New (Settings + Voice Preview) → [Generate] → Progress → Result
```

---

### Component 6 — Docker + Railway Deployment

#### Dockerfile

```dockerfile
FROM python:3.11-slim

# Install Node.js 20 + FFmpeg + Chromium (for Remotion render)
RUN apt-get update && apt-get install -y \
    curl ffmpeg chromium \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium

WORKDIR /app

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Remotion deps
COPY remotion/package.json remotion/package-lock.json ./remotion/
RUN cd remotion && npm ci

COPY . .

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### docker-compose.yml

```yaml
version: "3.9"
services:
  api:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./output:/app/output
      - ./data:/app/data
      - ./assets:/app/assets
    env_file:
      - .env
```

#### Railway Deployment

| Config | Value |
|--------|-------|
| Platform | Railway Hobby Plan (~$5/month) |
| Deploy method | Auto-deploy from GitHub (Docker build) |
| Persistent storage | Railway Volume → `/app/output` + `/app/data` |
| Environment variables | `OPENAI_API_KEY`, `PEXELS_API_KEY`, `GOOGLE_API_KEY` (fallback), `JWT_SECRET_KEY` |
| **Concurrency** | **1 render at a time (Semaphore)** — Railway 512MB RAM limit |

---

## Architecture Decisions Summary (ADR)

| # | Decision | Reason | Tradeoff |
|---|---------|--------|----------|
| ADR-4 | **OpenAI gpt-4o-mini-tts** over Edge-TTS | Best Vi-En code-switching, ~380 VND | Needs Whisper alignment (+10-30s) |
| ADR-6 | **No Manim** | LaTeX/FFmpeg deps too heavy, overkill | KaTeX in Remotion sufficient |
| ADR-7 | **No Kokoro TTS** | No Vietnamese support | N/A |
| ADR-8 | **No Dual-Voice** | Sudden voice switching degrades UX | Depends on OpenAI code-switch quality |
| ADR-9 | **FastAPI + SPA** over Streamlit | Needs SSE streaming, custom UI | More complex than Streamlit |
| ADR-10 | **Pexels Video API** for animated backgrounds | Animated >> static for engagement | Video files larger; need local caching |
| ADR-11 | **Remotion from Phase 1** (supersedes ADR-5) | CSS/React layout faster than Pillow pixel drawing, real-time preview, `@remotion/captions` built-in | Adds Node.js to stack |
| ADR-12 | **SQLite + JWT** for auth | Simple, zero external dependency | Doesn't scale for multi-server production |
| ADR-13 | **Railway Hobby Plan** for deployment | GitHub auto-deploy, $5/month | Shared RAM; 1 concurrent render max |
| ADR-14 | **KaTeX** for math formulas (replaces matplotlib) | Vector SVG, CSS-animatable, 7KB, no LaTeX/Cairo deps | Only renders math, not charts (use Recharts) |
| ADR-15 | **GPT-4o-mini** for Content Parser (replaces Gemini) | Same API key as TTS (reduces deps), excellent structured output, cheaper | Gemini kept as fallback |
| **ADR-16** | **Drop Scene Preview interrupt for v1, keep LangGraph** | Simpler UX, saves 9h, faster pipeline | No per-scene preview before render; mitigate with editable keywords + voice preview + thumbnails |

---

## Phased Execution Plan

### Phase 1: Core Pipeline + Remotion Templates
**~42-45h · 5-7 days**

**Deliverable:** `python run_pipeline.py --input "text.txt"` outputs MP4 with animated video backgrounds

| # | Task | File(s) | Est. | Parallel |
|---|------|---------|:----:|:--------:|
| 1.1 | Setup project + Remotion init + JSON Contract files + **mock orchestrator skeleton** | `requirements.txt`, `config.py`, `Dockerfile`, `remotion/`, `app/state.py`, `remotion/src/schemas/videoProps.ts` | 4h | — |
| 1.2 | Input Validator | `app/nodes/input_validator.py` | 2h | ✅ |
| 1.3 | Content Parser + Prompt (GPT-4o-mini structured output) | `app/nodes/content_parser.py` | 5h | ✅ |
| 1.4 | TTS Preprocessor | `app/nodes/tts_preprocessor.py` | 2h | ✅ |
| 1.5 | OpenAI TTS Engine | `app/nodes/tts_synthesizer.py` (OpenAI impl) | 3h | ✅ |
| 1.6 | Edge-TTS Fallback Engine | `app/nodes/tts_synthesizer.py` (EdgeTTS impl) | 2h | ✅ |
| 1.7 | Whisper Word Aligner + **TEST Vietnamese accuracy early** | `app/nodes/word_aligner.py` | 4h | ✅ |
| 1.8 | Media Searcher — Image + Video Pexels API | `app/nodes/media_searcher.py` | 3h | ✅ |
| 1.9 | Remotion 5 scene templates (React components) | `remotion/src/scenes/*.tsx` | 8h | 🔗 after 1.1 |
| 1.10 | Remotion animated captions (`@remotion/captions`) | `remotion/src/components/AnimatedCaption.tsx` | 3h | 🔗 after 1.1 |
| 1.11 | **[Stretch]** KaTeX MathFormula component | `remotion/src/components/MathFormula.tsx` | 3h | 🔗 after 1.1 |
| 1.12 | LangGraph Orchestrator (swap mock → real nodes) | `app/orchestrator.py` | 4h | 🔗 after 1.2-1.8 |
| 1.13 | CLI render integration (Python → Remotion) | `app/nodes/video_renderer.py` | 2h | 🔗 last |

> [!NOTE]
> **Tasks 1.2-1.8 can be coded in parallel** (independent Python nodes).  
> **Tasks 1.9-1.11 parallel with each other** (Remotion, depend on 1.1).  
> **Integration test order:** 1.3 → 1.5 → 1.7 (Content Parser → TTS → Whisper need real data).  
> **Mock orchestrator** (task 1.1): write skeleton with mock nodes → swap real nodes as they complete → reduces bottleneck at 1.12.

---

### Phase 2: Web UI + Auth
**~42h · 4-6 days**

**Deliverable:** Full web app at `localhost:8000`, auth + settings + thumbnails + result

| # | Task | File(s) | Est. |
|---|------|---------|:----:|
| 2.1 | Auth system: JWT + SQLite + bcrypt | `api/auth.py`, `api/database.py` | 5h |
| 2.2 | Login/Register UI | `web/login.html`, `web/style.css` | 3h |
| 2.3 | Dashboard UI — list jobs | `web/dashboard.html` | 3h |
| 2.4 | FastAPI endpoints: submit, SSE progress, download | `api/main.py`, `api/routes.py`, `api/models.py` | 5h |
| 2.5 | Voice Preview endpoint + UI | `api/routes.py`, `web/app.js` | 3h |
| 2.6 | BGM Upload endpoint + UI | `api/routes.py`, `web/app.js` | 1h |
| 2.7 | Settings Panel UI — 3-column layout, English UI | `web/index.html`, `web/app.js` | 6h |
| 2.8 | **Scene Thumbnails** — `remotion still` per scene + grid UI | `web/app.js` | 3h |
| 2.9 | Result page — video player + download | `web/app.js` (result section) | 3h |
| 2.10 | `info_card` template effects — animated staggered slide-in | `remotion/src/scenes/InfoCard.tsx` | 4h |
| 2.11 | `stats_highlight` template — animated count-up + slide-in | `remotion/src/scenes/StatsHighlight.tsx` | 4h |

> [!TIP]
> **v4.2 savings vs v4:** Removed "LangGraph interrupt" (4h) + "Scene Preview page" (5h). Added "Voice Preview" (3h) + "BGM Upload" (1h) + "Thumbnails" (3h). **Net savings: ~4h.**

---

### Phase 3: Polish + Deploy + Preview Upgrade
**~24h · 3-5 days**

**Deliverable:** Live demo on Railway + optional Remotion Player preview

| # | Task | Est. |
|---|------|:----:|
| 3.1 | Docker deployment + Railway setup | 4h |
| 3.2 | Background music support (library + custom) | 3h |
| 3.3 | Error handling + retry for all APIs | 3h |
| 3.4 | Unit tests for core components | 4h |
| 3.5 | Performance profiling + optimization | 3h |
| 3.6 | End-to-end demo test on Railway | 3h |
| 3.7 | **[Optional]** Refactor `web/` to React + embed `@remotion/player` for F6 | 4h |

---

## Dependencies

### Python (requirements.txt)

```text
# Core Pipeline
langgraph>=0.4
openai>=1.0
edge-tts>=7.0

# LLM Fallback
langchain-google-genai

# Word Alignment (test both, pick one)
openai-whisper
# OR: faster-whisper (CTranslate2, 4x lighter — test accuracy first)

# API + Auth
fastapi
uvicorn[standard]
httpx
python-dotenv
pydantic>=2.0
PyJWT
bcrypt
python-multipart
aiosqlite

# Audio
pydub
aiofiles

# Utils
loguru
num2words
```

### Remotion (remotion/package.json)

```json
{
  "dependencies": {
    "remotion": "^4.0.0",
    "@remotion/cli": "^4.0.0",
    "@remotion/player": "^4.0.0",
    "@remotion/captions": "^4.0.0",
    "@remotion/animated-captions": "^4.0.0",
    "@remotion/transitions": "^4.0.0",
    "@remotion/zod-types": "^4.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zod": "^3.22.0",
    "react-katex": "^3.0.1",
    "katex": "^0.16.9"
  }
}
```

---

## Verification Plan

### Automated Tests
- `pytest tests/` — unit tests for validator, parser output schema, TTS output
- **Content Integrity test:** Parse → extract narration → diff against input → must be 100% match
- **Timing test:** End-to-end pipeline ≤ 3 minutes for 300-word input
- **Auth test:** Register → Login → JWT validation → role-based access
- **Voice Preview test:** POST `/api/tts/preview` → verify audio response
- **BGM Upload test:** POST `/api/bgm/upload` → verify file saved + URL returned
- **JSON Contract test:** VideoProps.model_dump() → camelizeKeys() → Zod validate → must pass

### Manual Verification
- Listen to audio output — verify Vietnamese-English code-switching (OpenAI vs Edge-TTS)
- Watch video — verify subtitle sync ≤ 0.3s
- Verify all 5 layout types render correctly with animations
- Verify KaTeX math formulas render correctly (if implemented)
- Test voice preview → change voice/rate → play again
- Test BGM upload → play preview → verify in final video
- Test transition modes (None / Crossfade / Fade to Black)
- Test auth flow: Register → Login → Dashboard → Create Video → Logout
- Test on 5 sample texts of varying lengths (50, 150, 300, 400, 500 words)
- Test Railway deployment: upload video, watch result, check performance

---

## Open Questions

> [!IMPORTANT]
> **Q1:** OpenAI gpt-4o-mini-tts needs real-world testing with Vietnamese-English mixed content. Test 5 sample sentences before committing. If quality is insufficient, fallback to Edge-TTS or **Kie.ai ElevenLabs**.

> [!IMPORTANT]
> **Q2:** Whisper vs faster-whisper for Vietnamese alignment accuracy? Test both on real audio. If drift > 0.3s, switch to **WhisperX** (word-level forced alignment).

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| OpenAI TTS quality for mixed Vietnamese-English | 🟡 Medium | Test first; fallback to Edge-TTS |
| Edge-TTS is unofficial API, may break | 🟡 Medium | Abstract TTSEngine; multiple fallbacks |
| Whisper alignment slow (10-30s overhead) | 🟡 Medium | Pre-download model; cache; consider faster-whisper |
| Pexels rate limit (200 req/hr) | 🟢 Low | Rotate multiple API keys; local cache |
| Remotion rendering performance | 🟢 Low | Verify CLI performance; Semaphore(1) for RAM |
| **Railway RAM limit during render** | 🟡 Medium | Sequential queue (Semaphore); optimize memory |
| **Pexels Video download slow** | 🟡 Medium | Async download + local cache; fallback to image |
| **SQLite concurrent access** | 🟢 Low | Enable WAL mode; acceptable for < 10 users |
| **KaTeX fonts not loading in Docker** | 🟢 Low | Bundle fonts in `remotion/public/katex/` |
| **GPT-4o-mini structured output edge cases** | 🟢 Low | Zod validation catches malformed JSON; Gemini fallback |
| **User not satisfied (no real-time preview)** | 🟢 Low | Thumbnails + editable keywords + voice preview; re-run ~2-3 min, ~900 VND |

---

*This document supersedes `implementation_plan.md` (v2), `UPDATED_PLAN.md`, `UPDATED_PLAN_2.md` (v3), and `MASTER_PLAN.md` (v4.1). All architecture decisions are consolidated here. Version: v4.2.*
