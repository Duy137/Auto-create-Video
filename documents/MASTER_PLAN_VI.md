# 🎬 AutoClip — Kế Hoạch Triển Khai Tổng Hợp v4.2

> **Ngày:** 2026-04-16  
> **Nguồn:** Tất cả tài liệu nội bộ (`RESEARCH.md`, `TTS_RESEARCH.md`, `WORKLOG.md`, `JOURNAL.md`, `TOOL_RESEARCH_REPORT.md`), `SPEC.md`, phân tích MoneyPrinterTurbo, 10 ảnh chụp video mẫu, phản biện builder AI  
> **Trạng thái:** ✅ Sẵn sàng triển khai — đã phê duyệt

---

## 📌 Mục Tiêu

Xây dựng pipeline AI tự động **chuyển đổi nội dung văn bản đã hoàn chỉnh** thành video ngắn dọc (9:16).

```
Người dùng gửi Văn Bản Cuối Cùng
    → Hệ thống phân tích cấu trúc
    → Tạo giọng đọc
    → Tìm video nền
    → Render video hoạt hình
    → Xuất MP4 hoàn chỉnh
```

⚠️ **Hệ thống KHÔNG chỉnh sửa, viết lại, hoặc biên tập nội dung.**

### Bảng Chỉ Tiêu

| Chỉ số | Mục tiêu | Ghi chú |
|:-------|:---------|:--------|
| Thời lượng video | ≤ 3 phút | ~500 từ tối đa |
| Chi phí / video | ≤ 5.000 VND | Ước tính ~400-900 VND |
| Thời gian xử lý | ≤ 3 phút | Bao gồm TTS + render |
| Toàn vẹn nội dung | 100% | Không thêm, xóa, hoặc viết lại |
| Đồng bộ Âm thanh — Phụ đề | ≤ 0.3s lệch | Căn chỉnh Whisper |

---

## ⚡ Các Quyết Định Chính (Thay đổi v4.2 so với v4.1)

### 🔴 Quan trọng

> [!IMPORTANT]
> **Đầu vào là Văn Bản Cuối Cùng, không phải Chủ Đề.**  
> Hệ thống chỉ xử lý hậu kỳ. Toàn vẹn nội dung = 100%.

> [!IMPORTANT]
> **Xem Trước Giọng Đọc trước khi Tạo Video _(v4.1)_**  
> Người dùng nhấn "▶ Preview Voice" → tổng hợp câu đầu tiên (~10-20 từ) → phát mẫu âm thanh.  
> Cho phép điều chỉnh giọng/tốc độ trước khi tạo video hoàn chỉnh.

> [!IMPORTANT]
> **Xem Trước Cảnh — Review trước Render _(v4.2 → v4.3)_**  
> Pipeline dừng sau bước Parse + TTS + Media Search → hiển thị Scene Cards cho user review.  
> User có thể sửa keywords/queries từng cảnh → nhấn "Start Render" để tiếp tục.  
> MVP dùng **scene cards** (narration, queries, timing) thay vì thumbnail tĩnh.  
> Remotion Player preview hoãn sang Phase 3 (cần chuyển frontend sang React).

> [!IMPORTANT]
> **Engine LLM đã thay đổi _(v4.2)_**  
> Content Parser chuyển từ Gemini 2.5 Flash → **GPT-4o-mini** (chính).  
> Lý do: cùng API key với TTS (giảm số key bắt buộc từ 3 → 2), hỗ trợ JSON structured output tuyệt vời.  
> Gemini 2.5 Flash giữ làm dự phòng.

### 🟡 Cảnh báo

> [!WARNING]
> **Engine TTS thay đổi so với v2.**  
> Chuyển từ Edge-TTS sang **OpenAI gpt-4o-mini-tts** cho chuyển đổi Việt–Anh tự nhiên.  
> Chi phí tăng 0 → ~380 VND/video nhưng chất lượng tốt hơn đáng kể.

> [!WARNING]
> **Video Nền _(v4)_**  
> Thay thế Ảnh Tĩnh Pexels bằng **Pexels Videos API** cho nền stock động.  
> Video được tải về, cache cục bộ, và làm mờ khi dùng làm nền. Giữ lại fallback ảnh.

> [!WARNING]
> **Ngôn ngữ giao diện là TIẾNG ANH.**  
> Tất cả nhãn, nút, thông báo, và văn bản form phải bằng tiếng Anh.

> [!WARNING]
> **Hệ Thống Xác Thực _(v4)_**  
> JWT + SQLite + bcrypt. Giao diện Đăng nhập/Đăng ký + Dashboard lịch sử công việc.

### 📝 Ghi chú

> [!NOTE]
> **F6 — Thay Thế Tài Nguyên _(giải trình v4.2)_**  
> SPEC.md F6 (P1): user có thể đổi image query từng cảnh.  
> **Flow MVP:** Pipeline tạo thumbnail từng cảnh qua `remotion still` → user xem grid → sửa keywords → tạo lại nếu cần (~2-3 phút, ~900 VND).  
> **Phase 3:** Chuyển `web/` sang React → embed `@remotion/player` cho xem trước tức thì + đổi ảnh ngay (0 VND, 2-5 giây).

---

## 🏗️ Tổng Quan Kiến Trúc

### Kiến trúc: Python Pipeline + Remotion Renderer

```
┌─────────────────────────────────────────────────────┐
│                   LỚP PYTHON                        │
│  (FastAPI + LangGraph — CHỈ xử lý DỮ LIỆU)         │
│                                                      │
│  • Kiểm tra đầu vào                                 │
│  • LLM phân tích → JSON (GPT-4o-mini)               │
│  • TTS → âm thanh + timestamp từng từ               │
│  • Tìm kiếm Pexels → URL media                     │
│  • Xác thực / Công việc / Database                  │
│  • Gửi sự kiện SSE tiến trình                       │
│                                                      │
│  Đầu ra: video_props.json + full.mp3 + media files  │
└──────────────────────┬──────────────────────────────┘
                       │ JSON + files (JSON Contract)
                       ▼
┌─────────────────────────────────────────────────────┐
│                 LỚP REMOTION                         │
│  (React/TypeScript — CHỈ render HÌNH ẢNH)            │
│                                                      │
│  • Nhận props từ Python (JSON)                      │
│  • 5 template cảnh (React components)               │
│  • @remotion/captions cho phụ đề                    │
│  • KaTeX cho công thức toán                         │
│  • CSS animations, chuyển cảnh                      │
│  • CLI render: xuất MP4                             │
│                                                      │
│  Đầu vào: inputProps JSON → Đầu ra: final.mp4      │
└─────────────────────────────────────────────────────┘
```

### Luồng Pipeline (Review trước Render — v4.3)

```
User chỉnh Settings (keywords, giọng, tốc độ, BGM, v.v.)
        │
        ├── 🔊 [Tùy chọn] Preview Voice → phát mẫu âm thanh
        │
        ▼
  Nhấn "Generate Video"

┌─────────────────────────┐
│  0. Kiểm Tra Đầu Vào    │ ← Dựa trên luật (tức thì)
└──────────┬──────────────┘
           │
┌─────────────────────────┐
│  1. Phân Tích Nội Dung   │ ← GPT-4o-mini → JSON (dùng keywords đã chỉnh sửa)
└──────────┬──────────────┘
           │
    ┌──────┴──────────────┐   (Fan-out song song)
    ▼                     ▼
┌────────────┐    ┌──────────────┐
│ 2A. TTS    │    │ 2B. Tìm Kiếm │
│ + Whisper  │    │    Media      │
└─────┬──────┘    └──────┬───────┘
      └──────────┬───────┘   (Fan-in)
                 ▼
┌─────────────────────────┐
│  ⏸ REVIEW (User xem)    │ ← Scene cards: narration, queries, timing
│  User sửa keywords      │   User nhấn "Start Render" để tiếp tục
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│  3. Render Video         │ ← Remotion render (3 lớp + chuyển cảnh + BGM)
└──────────┬──────────────┘
           ▼
      📹 MP4 Cuối Cùng (SSE thông báo → user tải về)
```

> [!NOTE]
> Pipeline dừng sau bước 2 (TTS + Media) để user review scene cards.  
> User có thể sửa image/video queries từng cảnh → nhấn "Start Render" → pipeline tiếp tục render.  
> SSE gửi cập nhật tiến trình thời gian thực đến frontend.

### LangGraph Orchestrator (Ví dụ)

```python
graph.add_edge("validate", "parse")
graph.add_edge("parse", "tts")              # Fan-out
graph.add_edge("parse", "media")            # Fan-out  
graph.add_edge(["tts", "media"], "review")  # Fan-in → dừng để user review
graph.add_edge("review", "render")          # User nhấn "Start Render"
graph.add_edge("render", END)

# Pipeline dừng tại review node — user xem scene cards, sửa queries
# Nhấn "Start Render" → API gọi resume pipeline → render video
```

---

## 📜 JSON Contract (Python ↔ Remotion)

> [!IMPORTANT]
> **Đây là phần quan trọng nhất cho AI builder.** JSON Contract định nghĩa chính xác Python output gì và Remotion nhận gì. Cả hai bên phải tuân thủ schema này.

### Chiến lược snake_case → camelCase

Python xuất JSON `snake_case` (mặc định Pydantic). Phía TypeScript dùng hàm `camelizeKeys()` trong `remotion/src/lib/utils.ts` để chuyển đổi trước khi Zod validate.

### Schema TypeScript (Remotion — Zod)

```typescript
// remotion/src/schemas/videoProps.ts
import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

// ── Timestamp Từng Từ (từ Whisper) ──
const WordTimestamp = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
});

// ── Bảng Màu (từ LLM) ──
const ColorPalette = z.object({
  primary: hexColor,
  secondary: hexColor,
  background: hexColor,
  text: hexColor,
});

// ── Điểm Dữ Liệu Biểu Đồ ──
const ChartDataPoint = z.object({
  x: z.union([z.number(), z.string()]),
  y: z.number(),
  label: z.string().optional(),
});

// ── Thông Số Biểu Đồ ──
const DiagramSpec = z.object({
  type: z.enum(['line_chart', 'bar_chart', 'scatter', 'math_formula']),
  xRange: z.tuple([z.number(), z.number()]).optional(),
  function: z.string().optional(),
  data: z.array(ChartDataPoint).optional(),
  latex: z.string().optional(),          // Chuỗi LaTeX cho KaTeX
  annotations: z.array(z.string()).optional(),
});

// ── Dữ Liệu Cảnh ──
const Scene = z.object({
  sceneIndex: z.number().int().nonnegative(),
  sceneType: z.enum([
    'title_card', 'stock_background', 'info_card',
    'stats_highlight', 'diagram',
  ]),
  narration: z.string(),
  visualDescription: z.string(),

  // Timing (tính từ audio word timestamps)
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),

  // Query tìm kiếm (từ LLM, user có thể chỉnh)
  imageQuery: z.string().nullable(),
  videoQuery: z.string().nullable(),

  // Media đã giải quyết (từ Pexels, sau Media Searcher)
  mediaUrl: z.string().nullable(),
  mediaType: z.enum(['video', 'image']).nullable(),

  // Từ khóa
  keywordsToHighlight: z.array(z.string()),
  englishPhrases: z.array(z.string()),

  // Dữ liệu theo kiểu cảnh (tùy chọn)
  cardItems: z.array(z.object({        // info_card
    icon: z.string(),
    title: z.string(),
    subtitle: z.string(),
  })).optional(),

  stats: z.array(z.object({            // stats_highlight
    label: z.string(),
    value: z.string(),
    color: hexColor,
  })).optional(),

  diagramSpec: DiagramSpec.optional(),  // diagram
});

// ── Cài Đặt Phụ Đề ──
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

// ── Cài Đặt Video ──
const Settings = z.object({
  aspectRatio: z.enum(['9:16', '16:9']),
  fps: z.number().int().default(30),
  transitionMode: z.enum(['none', 'crossfade', 'fade_to_black']),
  bgmUrl: z.string().nullable(),
  bgmVolume: z.number().min(0).max(1),
  subtitle: SubtitleSettings,
});

// ══════════════════════════════════════
// ROOT: Toàn bộ dữ liệu cho 1 video
// ══════════════════════════════════════
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

### Schema Python (Pydantic)

```python
# app/state.py
from pydantic import BaseModel

class WordTimestamp(BaseModel):
    text: str
    start_ms: float
    end_ms: float

class ColorPalette(BaseModel):
    primary: str     # mã hex
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
    """Root: toàn bộ dữ liệu cho 1 video."""
    job_id: str
    title: str
    color_palette: ColorPalette
    audio_url: str
    word_timestamps: list[WordTimestamp]
    scenes: list[Scene]
    settings: VideoSettings
```

### Luồng Dữ Liệu

```
Python Pipeline                          Remotion
─────────────                           ─────────

1. validate(text)
2. parse(text) → scenes JSON
3. tts(narration) → full.mp3
4. whisper(full.mp3) → timestamps
5. pexels(queries) → media URLs

6. Gộp tất cả → VideoProps
7. video_props.model_dump() → JSON
   ↓
   output/{jobId}/video_props.json ──→ 8. Remotion đọc JSON
   output/{jobId}/audio/full.mp3  ──→    (qua inputProps)
   output/{jobId}/media/*         ──→
                                        9. camelizeKeys() chuyển đổi
                                        10. Zod validate
                                        11. Render từng cảnh
                                        12. Xuất final.mp4
```

---

## 💰 Ước Tính Chi Phí Mỗi Video (1 phút)

| Thành phần | Công nghệ | Chi phí |
|:-----------|:----------|:--------|
| Phân tích nội dung | GPT-4o-mini (~1K tokens vào/ra) | ~19 VND |
| **Tổng hợp giọng nói** | **OpenAI gpt-4o-mini-tts** | **~380 VND** |
| Timestamp từng từ | Whisper forced-alignment (cục bộ) | 0 VND |
| Tìm kiếm Video/Ảnh | Pexels API (miễn phí, 200 req/giờ) | 0 VND |
| Tạo tài nguyên hình ảnh | CSS / React DOM (Remotion) | 0 VND |
| Render công thức toán | KaTeX (cục bộ) | 0 VND |
| Render video | Remotion CLI + Headless Chrome | 0 VND |
| **Tổng cộng** | | **~400-900 VND ✅** |

> [!TIP]
> Chi phí giảm so với v4.1 (~880 VND) nhờ chuyển Content Parser từ Gemini (~500 VND) sang GPT-4o-mini (~19 VND).  
> So với MoneyPrinterTurbo (ElevenLabs/Azure), rẻ hơn **3-5 lần** vì không cần LLM tạo kịch bản.

---

## 🎨 5 Kiểu Bố Cục Cảnh

| # | Kiểu | Ví dụ | Mô tả |
|:-:|:------|:------|:------|
| 1 | **`title_card`** | "DEPLOY AGENT AI TRONG VÀI NGÀY" | Nền tối/gradient + chữ lớn nhiều màu + thương hiệu |
| 2 | **`stock_background`** | "OPEN SOURCE + HUAWEI" | Nền video stock làm mờ + chữ phủ + phụ đề |
| 3 | **`info_card`** | "Quy Trình PaperOrchestra" | Nền tối + danh sách thẻ với icon + tiêu đề |
| 4 | **`stats_highlight`** | "thảm 2.0, ghế 1.4" | Nền tối + số lớn nổi bật + hộp mã màu |
| 5 | **`diagram`** | Đồ thị e^x, công thức Softmax | Biểu đồ (Recharts) hoặc **công thức toán (KaTeX)** + chú thích |

> [!NOTE]
> LLM Content Parser tự động phân loại mỗi cảnh vào 1 trong 5 kiểu.  
> `title_card` → cảnh mở đầu/kết thúc · `diagram` → chỉ khi văn bản chứa công thức hoặc dữ liệu.  
> `diagram.type = "math_formula"` → user viết tự nhiên ("hàm e mũ x"), LLM tự convert sang LaTeX (`e^{x}`).

---

## 🖥️ Tùy Chọn Giao Diện

> Lấy cảm hứng từ MoneyPrinterTurbo.  
> **Tất cả nhãn, nút, và thông báo đều bằng tiếng Anh.**

### Bảng Trái — Nội dung

| Tùy chọn | Kiểu | Mặc định | Ghi chú |
|:---------|:-----|:---------|:--------|
| Final Text | textarea | — | Nội dung gốc, hệ thống không chỉnh sửa |
| Video Keywords | **textarea chỉnh sửa được** | LLM tạo ra | User có thể sửa trước khi gửi |

### Bảng Giữa — Cài đặt Video & Âm thanh

| Tùy chọn | Kiểu | Mặc định | Ghi chú |
|:---------|:-----|:---------|:--------|
| Aspect Ratio | select | Portrait 9:16 | Dọc / Ngang |
| Max Clip Duration | select | 5s | 2-10s |
| TTS Engine | select | OpenAI | OpenAI / Edge-TTS (miễn phí) |
| Voice | select | — | Giọng tương ứng engine |
| Speech Rate | slider | 1.0 | 0.8 – 2.0 |
| Speech Volume | slider | 1.0 | 0.6 – 3.0 |
| Video Transition | select | Crossfade | None / Crossfade / Fade to Black |
| Video Concatenation | select | Sequential | Sequential / Random |
| Background Music | select | Random | None / Random / Custom upload (≤ 10MB) |
| BGM Volume | slider | 0.2 | 0.0 – 1.0 |
| **▶ Preview Voice** | **button** | — | **Tổng hợp câu đầu → phát âm thanh** |

### Bảng Phải — Cài đặt Phụ đề

| Tùy chọn | Kiểu | Mặc định | Ghi chú |
|:---------|:-----|:---------|:--------|
| Enable Subtitles | checkbox | ✅ | Bật / Tắt |
| Font | select | NotoSansVN-Bold | Quét từ `fonts/` |
| Font Size | slider | 48 | 30 – 80 |
| Font Color | color picker | `#FFFFFF` | |
| Stroke Color | color picker | `#000000` | |
| Stroke Width | slider | 2.0 | 0 – 10 |
| Position | select | Bottom | Top / Center / Bottom |
| Highlight Color | color picker | `#FF6B35` | Màu từ đang được đọc |

---

## 📁 Cấu Trúc Dự Án

> [!IMPORTANT]
> **Quyết định thư mục (v4.2):**  
> Dùng `app/` thay vì `pipeline/`. Folder `rendering/` từ v4.1 **bị XÓA hoàn toàn** — tất cả rendering logic chuyển sang `remotion/src/`.

```
A20-App-160/
│
├── 📦 Dockerfile                         # [CẬP NHẬT] python:3.11-slim + Node.js 20 + Chromium
├── 📦 docker-compose.yml
├── 📦 .dockerignore
├── 📄 requirements.txt                   # [CẬP NHẬT — bỏ moviepy, Pillow, matplotlib]
├── 📄 .env.example
│
├── 🔧 app/                               # PYTHON — Dữ liệu & Điều phối
│   ├── orchestrator.py                   # LangGraph graph (liên tục, không interrupt)
│   ├── state.py                          # Pydantic VideoProps (JSON Contract)
│   └── nodes/                            # 1 file = 1 node = 1 nhiệm vụ
│       ├── input_validator.py
│       ├── content_parser.py             # GPT-4o-mini → JSON scenes
│       ├── tts_preprocessor.py
│       ├── tts_synthesizer.py            # TTSEngine ABC → OpenAI / EdgeTTS
│       ├── word_aligner.py               # Whisper forced-alignment
│       ├── media_searcher.py             # Pexels video + ảnh
│       └── video_renderer.py             # CLI wrapper cho Remotion (subprocess)
│
├── 🌐 api/                               # PYTHON — Web API
│   ├── main.py                           # FastAPI + CORS + static mount
│   ├── routes.py                         # submit, SSE, tts-preview, bgm-upload, download
│   ├── auth.py                           # JWT, bcrypt, role deps
│   ├── models.py                         # Pydantic schemas
│   └── database.py                       # SQLite, schema, CRUD
│
├── 🎬 remotion/                           # TYPESCRIPT — Render Video
│   ├── package.json                      # Versions đã lock
│   ├── remotion.config.ts
│   ├── public/
│   │   ├── fonts/                        # NotoSansVN fonts
│   │   └── katex/fonts/                  # KaTeX fonts (bundle sẵn)
│   └── src/
│       ├── Root.tsx                       # Registry compositions
│       ├── AutoClipVideo.tsx              # Composition chính
│       ├── scenes/                        # 1 file = 1 template
│       │   ├── TitleCard.tsx
│       │   ├── StockBackground.tsx
│       │   ├── InfoCard.tsx
│       │   ├── StatsHighlight.tsx
│       │   └── Diagram.tsx               # Biểu đồ (Recharts) + Toán (KaTeX)
│       ├── components/                    # Dùng chung
│       │   ├── AnimatedCaption.tsx
│       │   ├── MathFormula.tsx            # react-katex wrapper
│       │   ├── BackgroundVideo.tsx
│       │   └── TransitionWrapper.tsx
│       ├── schemas/
│       │   └── videoProps.ts              # Zod schema (JSON Contract)
│       └── lib/
│           ├── utils.ts                   # camelizeKeys()
│           ├── animations.ts
│           └── colors.ts
│
├── 🖥️ web/                                # Frontend (vanilla HTML/JS/CSS cho MVP)
│   ├── index.html · login.html · dashboard.html
│   ├── style.css
│   └── app.js
│
├── ⚙️ config.py
├── 📦 output/{job_id}/                    # Video đã tạo (git-ignored)
│   ├── video_props.json                  # JSON Contract output
│   ├── audio/ · media/ · thumbnails/
│   └── final.mp4
│
└── 🧪 tests/
```

---

## 🔍 Chi Tiết Từng Thành Phần

---

### 🧩 Thành phần 0 — Kiểm Tra Đầu Vào

> **Dựa trên luật · Không tốn API · Phản hồi tức thì**

| Luật | Điều kiện | Hành động |
|:-----|:----------|:----------|
| Quá ngắn | `word_count < 30` | ❌ Từ chối |
| Quá dài | `word_count > 500` | ❌ Từ chối + hiển thị số từ |
| Spam | 3+ câu liên tiếp giống nhau ≥ 90% | ❌ Từ chối |
| Lặp nhẹ | Câu lặp < 3 liên tiếp | ⚠️ Cảnh báo |
| Emoji/CJK | Regex phát hiện | ✅ Tự động xóa + thông báo |
| Vô nghĩa | 5+ phụ âm vô nghĩa liên tiếp | ⚠️ Cảnh báo |

---

### 🧩 Thành phần 1 — Phân Tích Nội Dung (Content Parser)

> **LLM:** GPT-4o-mini (chính) / Gemini 2.5 Flash (dự phòng)  
> **Đầu vào:** Văn bản cuối cùng (đã kiểm tra)  
> **Đầu ra:** JSON tuân thủ VideoProps schema

#### Chiến Lược LLM

```
🥇 CHÍNH:    GPT-4o-mini (structured output qua response_format)
🔄 DỰ PHÒNG: Gemini 2.5 Flash (khi OpenAI API lỗi)
```

#### Bổ sung prompt (v4.2):

```
Nếu narration chứa biểu thức toán học:
1. Giữ narration nguyên gốc (tiếng Việt tự nhiên)
2. Đặt scene_type = "diagram", diagram_spec.type = "math_formula"
3. Đặt diagram_spec.latex = bản LaTeX tương ứng
Ví dụ: "e mũ x" → latex: "e^{x}"
Nếu user đã dùng ký hiệu $...$, giữ nguyên LaTeX.
```

<details>
<summary>📋 Xem JSON mẫu đầy đủ</summary>

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
> **Quy Tắc Toàn Vẹn Nội Dung:**  
> Trường `narration` **PHẢI** chứa **nguyên văn bản gốc** từ đầu vào.  
> LLM CHỈ được thêm dấu câu cho TTS.  
> ❌ Tuyệt đối không diễn giải hoặc viết lại.

---

### 🧩 Thành phần 2A — Tổng Hợp Giọng Nói

#### Chiến Lược TTS

```
🥇 CHÍNH:    OpenAI gpt-4o-mini-tts (~380 VND, chuyển đổi Vi–En tự nhiên)
💎 PREMIUM:  Kie.ai ElevenLabs (Phase 3+, chất lượng cao nhất)
🔄 DỰ PHÒNG: Edge-TTS (miễn phí, chất lượng tiếng Anh giảm)
```

#### Giao Diện TTSEngine

```python
class TTSEngine(ABC):
    @abstractmethod
    async def synthesize(self, text, voice, rate=1.0, volume=1.0) -> TTSResult:
        pass

class OpenAITTSEngine(TTSEngine): ...   # Chính + Whisper alignment
class EdgeTTSEngine(TTSEngine): ...     # Dự phòng + WordBoundary gốc
```

---

### 🧩 Thành phần 2B — Tìm Kiếm Media

> Pexels Video API dùng **cùng API key** với Images API, giới hạn 200 req/giờ.

```python
async def search_media(query: str, **kwargs) -> dict:
    """Ưu tiên: video → ảnh fallback → rỗng."""
    ...
```

**Chiến lược nền:** Video stock → resize/crop 9:16 → làm mờ → lớp phủ tối · Cache cục bộ · Async + timeout · Fallback sang ảnh

---

### 🧩 Thành phần 3 — Xem Trước Giọng _(v4.1)_

```python
@router.post("/api/tts/preview")
async def preview_voice(request: VoicePreviewRequest):
    sample_text = extract_first_sentence(request.text, max_words=50)
    engine = get_tts_engine(request.engine)
    result = await engine.synthesize(text=sample_text, voice=request.voice, rate=request.rate)
    return StreamingResponse(io.BytesIO(result.audio_bytes), media_type="audio/mpeg")
```

**Chi phí:** ~20 VND mỗi lần — không đáng kể.

---

### 🧩 Thành phần 3B — Tải Lên BGM _(v4.1)_

Tải lên nhạc nền tùy chỉnh. Tối đa 10MB, chỉ mp3/wav/m4a.

---

### 🛡️ Chiến Lược Dự Phòng

| Thành phần | Chính | Dự phòng 1 | Dự phòng 2 | Cuối cùng |
|:-----------|:------|:-----------|:-----------|:----------|
| Content Parser | GPT-4o-mini | Gemini 2.5 Flash | — | ❌ Thất bại |
| TTS | OpenAI gpt-4o-mini-tts | Edge-TTS (miễn phí) | — | ❌ Thất bại |
| Media (mỗi cảnh) | Pexels Video | Pexels Image | Gradient từ `color_palette` | ✅ Luôn OK |
| Tải Media | Async (10s timeout) | Thử lại 1x (5s) | File cache nếu có | Gradient |
| Whisper | Model `base` | Model `tiny` | Ước tính từ TTS duration | ✅ Luôn OK |

**Thử lại:** `delay = base_delay × 2^attempt` (base 2s · tối đa 3 lần · delay tối đa 16s)

---

### 🧩 Thành phần 4 — Video Renderer (Remotion)

#### Kiến Trúc Render

| Lớp | Công nghệ | Mô tả |
|:----|:----------|:------|
| **Background** | `<Video>` hoặc CSS Gradients | Video stock (blur) hoặc gradient |
| **Visual Content** | React components + CSS | Layout, thẻ, biểu đồ |
| **Animations** | CSS Keyframes / `spring()` / `interpolate()` | Hoạt hình mượt |
| **Subtitle** | `@remotion/captions` | Phụ đề kiểu TikTok |
| **Math** | `react-katex` + KaTeX | Công thức toán (vector SVG) |

#### Component KaTeX

```tsx
// remotion/src/components/MathFormula.tsx
import { BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { useCurrentFrame, interpolate } from 'remotion';

export const MathFormula: React.FC<{ latex: string; color?: string }> = ({
  latex, color = '#FFFFFF',
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
> Dùng `react-katex` (không phải raw `katex`) cho render đúng trong React tree.  
> KaTeX fonts phải bundle sẵn trong `remotion/public/katex/fonts/`.

#### Tích Hợp CLI Render (Python → Remotion)

```python
# app/nodes/video_renderer.py
import asyncio, subprocess

render_semaphore = asyncio.Semaphore(1)  # Chỉ 1 render tại 1 thời điểm (Railway RAM)

async def render_video(props_path: str, output_path: str) -> dict:
    async with render_semaphore:
        cmd = ["npx", "remotion", "render",
               "src/index.ts", "AutoClipVideo", output_path,
               "--props", props_path, "--timeout", "300000"]
        process = subprocess.Popen(cmd, cwd="remotion/",
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return_code = process.wait()
        if return_code != 0:
            raise RuntimeError(f"Remotion render failed: {process.stderr.read()}")
        return {"output_path": output_path}
```

#### Tạo Thumbnail (Xem Trước Cảnh MVP)

```bash
# Tạo 1 ảnh tĩnh cho mỗi cảnh để hiện grid xem trước
npx remotion still src/index.ts AutoClipVideo \
  --frame=0 --props=scene_props.json \
  output/thumbnails/scene_0.png
```

Frontend hiện grid thumbnail → user xem trước → sửa keywords nếu cần → tạo lại.

---

### 🧩 Thành phần 5 — Hệ Thống Xác Thực

#### Schema Database (SQLite)

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    status TEXT NOT NULL,   -- pending / processing / done / failed
    settings JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    output_path TEXT
);
```

#### API Endpoints

| Phương thức | Endpoint | Mô tả | Auth |
|:------------|:---------|:------|:-----|
| `POST` | `/api/auth/register` | Đăng ký | ❌ |
| `POST` | `/api/auth/login` | Đăng nhập → JWT (24h) | ❌ |
| `GET` | `/api/auth/me` | Thông tin user | 🔒 |
| `POST` | `/api/tts/preview` | Xem trước giọng | 🔒 |
| `POST` | `/api/bgm/upload` | Tải lên BGM | 🔒 |
| `POST` | `/api/jobs` | Tạo công việc | 🔒 |
| `GET` | `/api/jobs` | Danh sách jobs | 🔒 |
| `GET` | `/api/jobs/{id}` | Chi tiết job | 🔒 |
| `GET` | `/api/jobs/{id}/progress` | SSE stream | 🔒 |
| `GET` | `/api/jobs/{id}/download` | Tải MP4 | 🔒 |

#### SSE Events

```json
{"event": "progress", "step": "validate", "progress": 0.05, "message": "Validating input..."}
{"event": "progress", "step": "parse",    "progress": 0.15, "message": "Parsing content..."}
{"event": "progress", "step": "tts",      "progress": 0.35, "message": "Generating voiceover..."}
{"event": "progress", "step": "media",    "progress": 0.50, "message": "Downloading backgrounds..."}
{"event": "progress", "step": "render",   "progress": 0.80, "message": "Rendering video..."}
{"event": "done", "job_id": "abc-123", "download_url": "/api/jobs/abc-123/download"}
{"event": "error", "step": "media", "message": "Pexels timeout", "fatal": false}
```

**Trọng số:** validate 5% · parse 10% · tts 20% · media 20% · render 40% · done 5%

#### Phân Quyền

| Vai trò | Quyền |
|:--------|:------|
| `user` | Tạo video · Xem jobs của mình |
| `admin` | Xem tất cả · Quản lý users |

#### Luồng UI

```
Đăng nhập → Dashboard → Tạo Mới (Settings + Xem Trước Giọng)
    → [Generate] → Tiến Trình (SSE)
    → ⏸ Review Scene Cards (sửa queries)
    → [Start Render] → Render Tiến Trình
    → Kết Quả (Video Player + Download)
```

---

### 🧩 Thành phần 6 — Docker + Triển Khai Railway

#### Dockerfile

```dockerfile
FROM python:3.11-slim

# Cài Node.js 20 + FFmpeg + Chromium (cho Remotion render)
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

#### Cấu Hình Railway

| Cấu hình | Giá trị |
|:---------|:--------|
| Nền tảng | Railway Hobby Plan (~$5/tháng) |
| Triển khai | Auto-deploy từ GitHub (Docker build) |
| Lưu trữ | Railway Volume → `/app/output` + `/app/data` |
| Biến môi trường | `OPENAI_API_KEY` · `PEXELS_API_KEY` · `GOOGLE_API_KEY` (fallback) · `JWT_SECRET_KEY` |
| **Đồng thời** | **1 render tại 1 thời điểm (Semaphore)** — RAM 512MB |

---

## 📐 Tóm Tắt Quyết Định Kiến Trúc (ADR)

| # | Quyết định | Lý do | Đánh đổi |
|:-:|:----------|:------|:---------|
| 4 | **OpenAI gpt-4o-mini-tts** thay Edge-TTS | Chuyển đổi Vi–En tốt nhất | Cần Whisper (+10-30s) |
| 6 | **Không Manim** | LaTeX/FFmpeg quá nặng | KaTeX trong Remotion đủ |
| 9 | **FastAPI + SPA** thay Streamlit | Cần SSE, UI tùy chỉnh | Phức tạp hơn |
| 10 | **Pexels Video API** | Nền động >> ảnh tĩnh | File lớn, cần cache |
| 11 | **Remotion từ Phase 1** (thay thế ADR-5) | CSS/React nhanh hơn Pillow pixel, preview, captions built-in | Thêm Node.js vào stack |
| 12 | **SQLite + JWT** | Đơn giản, không dep ngoài | Không scale multi-server |
| 13 | **Railway Hobby** | Auto-deploy, $5/tháng | RAM chia sẻ, 1 render cùng lúc |
| 14 | **KaTeX** cho công thức toán (thay matplotlib) | Vector SVG, CSS animatable, 7KB | Chỉ render toán, không chart |
| 15 | **GPT-4o-mini** cho Content Parser (thay Gemini) | Cùng key TTS, structured output, rẻ hơn | Gemini giữ fallback |
| 16 | **~~Bỏ~~ Giữ Scene Review trước Render _(v4.3)_** | UX tốt hơn, user sửa queries trước render | Pipeline tách 2 bước (generate → review → render) |

---

## 📅 Kế Hoạch Triển Khai Theo Giai Đoạn

### 🔷 Giai Đoạn 1 — Pipeline Lõi + Remotion Templates
> **~42-45h · 5-7 ngày**  
> **Sản phẩm:** `python run_pipeline.py --input "text.txt"` → xuất MP4

| # | Nhiệm vụ | File | Giờ | Song song? |
|:-:|:---------|:-----|:---:|:----------:|
| 1.1 | Setup project + Remotion init + JSON Contract + **mock orchestrator** | `requirements.txt` · `Dockerfile` · `remotion/` · `app/state.py` · `videoProps.ts` | 4h | — |
| 1.2 | Input Validator | `app/nodes/input_validator.py` | 2h | ✅ |
| 1.3 | Content Parser + Prompt (GPT-4o-mini structured output) | `app/nodes/content_parser.py` | 5h | ✅ |
| 1.4 | TTS Preprocessor | `app/nodes/tts_preprocessor.py` | 2h | ✅ |
| 1.5 | OpenAI TTS Engine | `app/nodes/tts_synthesizer.py` (OpenAI) | 3h | ✅ |
| 1.6 | Edge-TTS Fallback | `app/nodes/tts_synthesizer.py` (EdgeTTS) | 2h | ✅ |
| 1.7 | Whisper Word Aligner + **TEST tiếng Việt sớm** | `app/nodes/word_aligner.py` | 4h | ✅ |
| 1.8 | Media Searcher (Pexels) | `app/nodes/media_searcher.py` | 3h | ✅ |
| 1.9 | Remotion 5 scene templates | `remotion/src/scenes/*.tsx` | 8h | 🔗 sau 1.1 |
| 1.10 | Remotion animated captions | `remotion/src/components/AnimatedCaption.tsx` | 3h | 🔗 sau 1.1 |
| 1.11 | **[Stretch]** KaTeX MathFormula | `remotion/src/components/MathFormula.tsx` | 3h | 🔗 sau 1.1 |
| 1.12 | LangGraph Orchestrator (swap mock → real nodes) | `app/orchestrator.py` | 4h | 🔗 sau 1.2-1.8 |
| 1.13 | CLI render (Python → Remotion) | `app/nodes/video_renderer.py` | 2h | 🔗 cuối |

> [!NOTE]
> **Tasks 1.2-1.8 có thể code song song** (Python nodes độc lập).  
> **Tasks 1.9-1.11 song song nhau** (Remotion, phụ thuộc 1.1).  
> **Thứ tự integration test:** 1.3 → 1.5 → 1.7 (Parser → TTS → Whisper cần data thật).  
> **Mock orchestrator** (task 1.1): viết skeleton + mock nodes → swap real nodes khi xong → giảm bottleneck ở 1.12.

---

### 🔷 Giai Đoạn 2 — Giao Diện Web + Xác Thực
> **~42h · 4-6 ngày**  
> **Sản phẩm:** Web app tại `localhost:8000` — auth + settings + thumbnails + kết quả

| # | Nhiệm vụ | File | Giờ |
|:-:|:---------|:-----|:---:|
| 2.1 | Auth: JWT + SQLite + bcrypt | `api/auth.py` · `api/database.py` | 5h |
| 2.2 | UI Đăng nhập/Đăng ký | `web/login.html` · `web/style.css` | 3h |
| 2.3 | Dashboard — danh sách jobs | `web/dashboard.html` | 3h |
| 2.4 | Endpoints: submit, SSE, download | `api/main.py` · `api/routes.py` · `api/models.py` | 5h |
| 2.5 | Voice Preview endpoint + UI | `api/routes.py` · `web/app.js` | 3h |
| 2.6 | BGM Upload endpoint + UI | `api/routes.py` · `web/app.js` | 1h |
| 2.7 | Settings Panel — 3 cột, UI tiếng Anh | `web/index.html` · `web/app.js` | 6h |
| 2.8 | **Thumbnails cảnh** — `remotion still` + grid UI | `web/app.js` | 3h |
| 2.9 | Trang kết quả — video player + download | `web/app.js` | 3h |
| 2.10 | `info_card` hiệu ứng — staggered slide-in | `remotion/InfoCard.tsx` | 4h |
| 2.11 | `stats_highlight` — count-up + slide-in | `remotion/StatsHighlight.tsx` | 4h |

---

### 🔷 Giai Đoạn 3 — Hoàn Thiện + Triển Khai + Nâng Cấp Preview
> **~24h · 3-5 ngày**  
> **Sản phẩm:** Demo trực tiếp trên Railway + tùy chọn Remotion Player preview

| # | Nhiệm vụ | Giờ |
|:-:|:---------|:---:|
| 3.1 | Triển khai Docker + Railway | 4h |
| 3.2 | Hỗ trợ BGM (thư viện + tùy chỉnh) | 3h |
| 3.3 | Xử lý lỗi + retry tất cả API | 3h |
| 3.4 | Unit test các thành phần lõi | 4h |
| 3.5 | Đánh giá hiệu năng + tối ưu | 3h |
| 3.6 | Test end-to-end trên Railway | 3h |
| 3.7 | **[Tùy chọn]** Chuyển `web/` sang React + embed `@remotion/player` cho F6 | 4h |

---

## 📦 Dependencies

### Python (requirements.txt)

```text
# Pipeline Lõi
langgraph>=0.4
openai>=1.0
edge-tts>=7.0

# LLM Dự Phòng
langchain-google-genai

# Căn Chỉnh Từ (test cả 2, chọn 1)
openai-whisper
# HOẶC: faster-whisper (CTranslate2, nhẹ hơn 4x — test accuracy trước)

# API + Xác Thực
fastapi
uvicorn[standard]
httpx
python-dotenv
pydantic>=2.0
PyJWT
bcrypt
python-multipart
aiosqlite

# Âm Thanh
pydub
aiofiles

# Tiện Ích
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

## ✅ Kế Hoạch Xác Minh

### Kiểm Tra Tự Động
- `pytest tests/` — unit test: validator, parser schema, TTS output
- **Toàn vẹn nội dung:** Parse → trích narration → diff vs đầu vào → khớp 100%
- **Thời gian:** Pipeline end-to-end ≤ 3 phút cho 300 từ
- **Xác thực:** Đăng ký → Đăng nhập → JWT → Phân quyền
- **Voice Preview:** POST `/api/tts/preview` → audio response
- **BGM Upload:** POST `/api/bgm/upload` → file + URL
- **JSON Contract:** VideoProps.model_dump() → camelizeKeys() → Zod validate → pass

### Xác Minh Thủ Công
- 🎧 Nghe audio — chuyển đổi Việt–Anh (OpenAI vs Edge-TTS)
- 📺 Xem video — đồng bộ phụ đề ≤ 0.3s
- 🎨 Xác minh cả 5 kiểu bố cục render đúng + hoạt hình
- 🧮 Xác minh công thức KaTeX render đúng (nếu đã implement)
- 🔊 Test voice preview → đổi giọng/tốc độ → phát lại
- 🎵 Test BGM upload → nghe thử → xem trong video cuối
- 🎬 Test chuyển cảnh (None / Crossfade / Fade to Black)
- 🔐 Test auth: Đăng ký → Đăng nhập → Dashboard → Tạo Video → Đăng xuất
- 📝 Test trên 5 văn bản mẫu (50 · 150 · 300 · 400 · 500 từ)
- 🚀 Test Railway: tải video → xem kết quả → kiểm tra hiệu năng

---

## ❓ Câu Hỏi Mở

> [!IMPORTANT]
> **Q1:** OpenAI gpt-4o-mini-tts cần test thực tế với nội dung Việt–Anh hỗn hợp.  
> Test 5 câu mẫu trước khi cam kết. Nếu không đủ → dự phòng Edge-TTS hoặc Kie.ai ElevenLabs.

> [!IMPORTANT]
> **Q2:** Whisper vs faster-whisper cho căn chỉnh tiếng Việt?  
> Test cả 2. Nếu lệch > 0.3s → chuyển sang WhisperX.

---

## ⚠️ Rủi Ro & Biện Pháp Giảm Thiểu

| Rủi ro | Mức độ | Biện pháp |
|:-------|:------:|:----------|
| Chất lượng OpenAI TTS cho Việt–Anh | 🟡 | Test trước · dự phòng Edge-TTS |
| Edge-TTS là API không chính thức | 🟡 | Abstract TTSEngine · nhiều fallback |
| Whisper căn chỉnh chậm (10-30s) | 🟡 | Tải trước model · cache · faster-whisper |
| Giới hạn Pexels (200 req/giờ) | 🟢 | Xoay API key · cache |
| **RAM Railway khi render** | 🟡 | Sequential queue (Semaphore) · tối ưu bộ nhớ |
| **Tải Video Pexels chậm** | 🟡 | Async + cache · fallback sang ảnh |
| **SQLite truy cập đồng thời** | 🟢 | WAL mode · OK cho < 10 users |
| **KaTeX fonts không load trong Docker** | 🟢 | Bundle fonts trong `remotion/public/katex/` |
| **GPT-4o-mini structured output edge cases** | 🟢 | Zod validation bắt JSON lỗi · Gemini fallback |
| **User không hài lòng (không preview tức thì)** | 🟢 | Thumbnails + keywords + voice preview · re-run ~900 VND |

---

> *Tài liệu này thay thế `implementation_plan.md` (v2), `UPDATED_PLAN.md`, `UPDATED_PLAN_2.md` (v3), và `MASTER_PLAN.md` (v4.1).*  
> *Tất cả quyết định kiến trúc được tổng hợp tại đây.*  
> *Phiên bản: **v4.2***
