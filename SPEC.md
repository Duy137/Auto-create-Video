# 🎬 AutoClip — AI Video Generation Pipeline

## Product Specification Document (SPEC)

| Field | Detail |
|---|---|
| **Tên sản phẩm** | AutoClip |
| **Phiên bản** | 1.0 (MVP) |
| **Ngày tạo** | 2026-04-10 |
| **Deadline** | 2026-05-01 (3 tuần) |
| **Tác giả** | *(Tên bạn)* |
| **Loại dự án** | Đồ án đào tạo / Portfolio |

---

## 1. Tổng quan

### 1.1 Bối cảnh & Vấn đề

Sản xuất video training/news nội bộ doanh nghiệp hiện tại là quy trình **thủ công, tốn kém, và chậm:**

| Giai đoạn | Phương pháp thủ công | Chi phí |
|-----------|----------------------|---------|
| Viết kịch bản | Biên tập viên, 1-2 ngày | Nhân sự |
| Thu âm giọng đọc | Thuê voice talent, booking studio | $200-500/phút |
| Tìm hình ảnh/footage | Mua stock + duyệt manual | $50-200/clip |
| Dựng video | Editor chuyên nghiệp, 2-3 ngày | $500-2000 |
| Review & sửa | 1-2 vòng revisions | $500-2000/vòng |
| **Tổng** | **3-5 ngày** | **$1,000-10,000/phút** |

**Pain points cụ thể:**

1. **Thời gian quá lâu:** 3-5 ngày cho 1 clip 1 phút → không đáp ứng được nhu cầu training liên tục
2. **Chi phí cao:** $1,000-10,000 per finished minute → chỉ doanh nghiệp lớn mới chi trả được
3. **Thiếu nhân sự kỹ thuật:** Team L&D/Marketing thường không có kỹ năng video production
4. **Khó cập nhật nội dung:** Khi policy/quy trình thay đổi → phải quay/dựng lại từ đầu
5. **Scaling tuyến tính:** Nhiều video hơn = nhiều ngày & tiền hơn, không có leverage

### 1.2 Giải pháp đề xuất

**AutoClip** là một AI pipeline tự động tạo video từ text input. Người dùng chỉ cần nhập **chủ đề hoặc brief** → hệ thống tự động:

1. **Sinh kịch bản** có cấu trúc (sử dụng LLM)
2. **Tổng hợp giọng đọc** tự nhiên (Text-to-Speech)
3. **Tìm & xử lý hình nền** phù hợp (Image Search API)
4. **Tạo biểu đồ minh họa** khi cần (Charting library)
5. **Render video hoàn chỉnh** với text overlay, hiệu ứng, và audio sync

**Kết quả:** Video 1 phút hoàn chỉnh trong **< 3 phút**, chi phí **< $0.05/video**.

### 1.3 Giá trị cốt lõi (Value Proposition)

```
┌─────────────────────────────────────────────────────┐
│                   AutoClip Value                     │
│                                                      │
│  ⏱️  3-5 ngày  →  < 3 phút     (1000x nhanh hơn)   │
│  💰  $1000+    →  < $0.05      (20,000x rẻ hơn)     │
│  👤  Cần expert →  Ai cũng dùng (Zero expertise)     │
│  🔄  Làm lại   →  Regenerate   (Instant update)      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 2. Phạm vi sản phẩm (Scope)

### 2.1 Trong phạm vi (In Scope) — MVP

| # | Tính năng | Mô tả | Ưu tiên |
|---|-----------|-------|---------|
| F1 | Script Generation | Tự động sinh kịch bản có cấu trúc từ topic | P0 — Bắt buộc |
| F2 | Voice Synthesis | Chuyển script thành giọng đọc tự nhiên (Tiếng Việt) | P0 — Bắt buộc |
| F3 | Background Image | Tìm hình ảnh phù hợp, xử lý làm nền (blur overlay) | P0 — Bắt buộc |
| F4 | Text Overlay | Hiển thị text trên video với hiệu ứng cho keywords | P0 — Bắt buộc |
| F5 | Video Assembly | Ghép tất cả thành phần → MP4 hoàn chỉnh | P0 — Bắt buộc |
| F6 | Chart Generation | Tạo biểu đồ minh họa khi script có data | P1 — Nên có |
| F7 | REST API | API endpoints để trigger và theo dõi pipeline | P1 — Nên có |
| F8 | Web UI | Giao diện web đơn giản để sử dụng pipeline | P2 — Nice to have |

### 2.2 Ngoài phạm vi (Out of Scope)

| Tính năng | Lý do loại bỏ |
|-----------|---------------|
| AI-generated video footage (Sora/Runway) | Chi phí cao, chất lượng không ổn định, phức tạp |
| Talking head / Avatar (Synthesia-style) | Cần API đắt tiền, khó tích hợp trong 3 tuần |
| Real-time video editing UI | Scope quá lớn, cần kinh nghiệm frontend sâu |
| Multi-user authentication | Không phải core value của MVP |
| Video templates phức tạp | Diminishing returns, tập trung 1 style tốt |
| Caching/CDN cho video delivery | Optimization phase, không cần cho demo |
| Mobile app | Quá tham vọng cho 3 tuần |

### 2.3 Giới hạn kỹ thuật đã biết (Known Constraints)

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| Developer chỉ biết Python | Không thể build frontend phức tạp | AI assistant build UI; hoặc CLI-only fallback |
| 3 tuần timeline | Không thể polish mọi thứ | Ưu tiên pipeline E2E trước, polish sau |
| Budget thấp | Không thể dùng premium API | Edge-TTS (free), Pexels (free), Gemini Flash (rẻ nhất) |
| Chạy local (không deploy) | Cần machine có FFmpeg, Python | Document rõ setup instructions |

---

## 3. Đối tượng sử dụng (Target Users)

### 3.1 Primary Persona: Nhân viên L&D / Training Manager

```
👤 Tên: Minh — Training Manager tại công ty vừa
📍 Bối cảnh: Cần tạo video onboarding cho nhân viên mới hàng tháng
😤 Pain: Mất 3 ngày làm 1 clip, không biết dùng Premiere Pro
🎯 Goal: Nhập chủ đề → ra video trong vài phút
💡 Kỳ vọng: Video đủ chuyên nghiệp để dùng nội bộ, không cần Hollywood quality
```

### 3.2 Secondary Persona: Content Creator / Marketer

```
👤 Tên: Lan — Digital Marketer tại startup
📍 Bối cảnh: Cần tạo video news/trend hàng tuần cho social media nội bộ
😤 Pain: Outsource quá đắt, tự làm thì không biết dựng video
🎯 Goal: Pipeline tự động, chỉ cần review output rồi publish
💡 Kỳ vọng: Video có style thống nhất, text dễ đọc, thông tin chính xác
```

---

## 4. User Stories & Acceptance Criteria

### US-1: Tạo video từ topic (Core Flow)

**Là** một Training Manager,
**tôi muốn** nhập chủ đề training và nhận được video hoàn chỉnh,
**để** tôi không phải thuê đội production mỗi lần cần video mới.

**Acceptance Criteria:**

```gherkin
Given user nhập topic "An toàn lao động trong nhà máy"
  And chọn style "training"
  And chọn duration 60 giây

When hệ thống xử lý xong

Then video MP4 được tạo ra với:
  - Giọng đọc tiếng Việt tự nhiên
  - Text overlay với từ khóa được highlight
  - Hình nền phù hợp chủ đề, được blur
  - Duration xấp xỉ 60 giây (±10s)
  - Resolution tối thiểu 1080p
  And chi phí API < $0.20
  And thời gian xử lý < 5 phút
```

### US-2: Theo dõi tiến trình

**Là** một user,
**tôi muốn** biết pipeline đang ở bước nào,
**để** tôi biết còn phải chờ bao lâu.

**Acceptance Criteria:**

```gherkin
Given video đang được tạo

When user kiểm tra trạng thái

Then hệ thống hiển thị:
  - Bước hiện tại (1/4: Generating script, 2/4: Creating voice, ...)
  - Progress percentage (0-100%)
  - Thời gian đã chạy
```

### US-3: Xem preview và download

**Là** một user,
**tôi muốn** xem preview video ngay trên trình duyệt và download file MP4,
**để** tôi có thể review trước khi chia sẻ.

**Acceptance Criteria:**

```gherkin
Given video đã tạo xong

When user mở trang kết quả

Then hiển thị:
  - Video player có thể play/pause/seek
  - Nút download file MP4
  - Thông tin: duration, file size, topic
  - Nút "Generate another"
```

### US-4: Video có biểu đồ minh họa

**Là** một user,
**tôi muốn** video tự động có biểu đồ khi nội dung có dữ liệu số,
**để** video sinh động và dễ hiểu hơn.

**Acceptance Criteria:**

```gherkin
Given script được sinh ra có chứa data points
  (ví dụ: "67% đại học ứng dụng AI")

When hệ thống render video

Then section đó hiển thị kèm biểu đồ phù hợp:
  - Bar chart cho so sánh
  - Line chart cho xu hướng
  - Pie chart cho tỷ lệ
  And biểu đồ có style nhất quán với video
  And biểu đồ hiển thị ở vị trí không che text chính
```

---

## 5. Kiến trúc hệ thống

### 5.1 Architecture Overview

```
                         ┌──────────────┐
                         │   Web UI     │
                         │  (HTML/JS)   │
                         └──────┬───────┘
                                │ HTTP
                         ┌──────▼───────┐
                         │  FastAPI     │
                         │  Server     │
                         └──────┬───────┘
                                │
                    ┌───────────▼───────────┐
                    │  LangGraph            │
                    │  Orchestrator         │
                    │                       │
                    │  ┌─────────────────┐  │
                    │  │ Pipeline State  │  │
                    │  └────────┬────────┘  │
                    │           │           │
                    │     ┌─────▼─────┐    │
                    │     │  Script    │    │
                    │     │  Agent    │    │
                    │     └─────┬─────┘    │
                    │           │           │
                    │    ┌──────┼──────┐    │
                    │    ▼      ▼      ▼   │
                    │  ┌───┐ ┌───┐ ┌────┐  │
                    │  │TTS│ │Img│ │Chart│  │
                    │  └─┬─┘ └─┬─┘ └──┬─┘  │
                    │    │     │      │    │
                    │    └──┬──┴──────┘    │
                    │       ▼              │
                    │  ┌──────────┐        │
                    │  │ Video    │        │
                    │  │ Renderer │        │
                    │  └──────────┘        │
                    └──────────────────────┘
                                │
                         ┌──────▼───────┐
                         │  output/     │
                         │  video.mp4   │
                         └──────────────┘
```

### 5.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        AutoClip                              │
│                                                              │
│  ┌─────────┐    ┌──────────────┐    ┌───────────────────┐   │
│  │ Web UI  │───▶│  API Layer   │───▶│  Pipeline Engine  │   │
│  │ (HTML)  │◀───│  (FastAPI)   │◀───│  (LangGraph)      │   │
│  └─────────┘    └──────────────┘    └────────┬──────────┘   │
│                                              │              │
│                           ┌──────────────────┼──────┐       │
│                           ▼                  ▼      ▼       │
│                    ┌────────────┐  ┌──────┐  ┌────────┐     │
│                    │ Script Gen │  │ TTS  │  │ Assets │     │
│                    │            │  │      │  │        │     │
│                    │ Gemini API │  │edge- │  │Pexels  │     │
│                    │ (external) │  │tts   │  │API     │     │
│                    │            │  │(free)│  │(free)  │     │
│                    └────────────┘  └──────┘  └────────┘     │
│                                                              │
│                    ┌─────────────────────────────────┐       │
│                    │      Rendering Engine            │       │
│                    │  Pillow + OpenCV + matplotlib    │       │
│                    │  (tất cả local, free)            │       │
│                    └─────────────────────────────────┘       │
│                                                              │
└─────────────────────────────────────────────────────────────┘

External Dependencies:
  ☁️  Google Gemini Flash API  — Script generation ($0.001/video)
  ☁️  Pexels API              — Image search (free, 200 req/hr)
  ☁️  Microsoft Edge TTS      — Voice synthesis (free, unlimited)
```

### 5.3 Tech Stack

| Layer | Công nghệ | Lý do chọn |
|-------|-----------|-----------|
| **Orchestration** | LangGraph | Agentic workflow, developer đã có kinh nghiệm, hỗ trợ async + parallel |
| **LLM** | Google Gemini 2.0 Flash | Rẻ nhất ($0.10/1M input tokens), JSON mode, đủ thông minh cho script gen |
| **TTS** | edge-tts (Python) | Miễn phí, chất lượng cao, hỗ trợ tiếng Việt (vi-VN-HoaiMyNeural, vi-VN-NamMinhNeural) |
| **Image Search** | Pexels API | Miễn phí (200 req/hr), ảnh chất lượng cao, license thoải mái |
| **Charting** | matplotlib | Python native, custom style dễ, export PNG |
| **Text Rendering** | Pillow (PIL) | Full control per-pixel, hỗ trợ Unicode/Vietnamese, font loading |
| **Video Encoding** | OpenCV (cv2) | Frame-by-frame compile, codec support, Python native |
| **Audio** | pydub | Merge audio segments, get duration, format conversion |
| **API** | FastAPI | Async native, auto-docs (Swagger), Python, cực dễ setup |
| **Frontend** | HTML/CSS/JS (vanilla) | Không cần framework, AI assistant xây dựng |
| **Font** | Noto Sans Vietnamese | Google font, free, đầy đủ ký tự tiếng Việt |

---

## 6. Luồng xử lý chính (Pipeline Flow)

### 6.1 Happy Path — End to End

```
User                    API                     Pipeline
  │                      │                         │
  │  POST /api/generate  │                         │
  │  {topic, style, ...} │                         │
  │─────────────────────▶│                         │
  │                      │  Create job, enqueue    │
  │  {job_id, status:    │                         │
  │   "pending"}         │                         │
  │◀─────────────────────│                         │
  │                      │  Start pipeline ───────▶│
  │                      │                         │
  │  GET /api/jobs/{id}  │                         │
  │─────────────────────▶│                         │
  │  {status:            │     Step 1: Script      │
  │   "script_generating"│     Generation          │
  │   progress: 15%}     │     ┌─────────────┐     │
  │◀─────────────────────│     │ Gemini Flash │     │
  │                      │     │ → JSON script│     │
  │         ...          │     └──────┬──────┘     │
  │       (polling)      │            │            │
  │                      │     Step 2: Parallel    │
  │                      │     Asset Generation    │
  │                      │     ┌─────┬─────┐      │
  │                      │     │     │     │      │
  │                      │     ▼     ▼     ▼      │
  │                      │    TTS  Images Charts   │
  │                      │     │     │     │      │
  │                      │     └─────┴─────┘      │
  │                      │            │            │
  │                      │     Step 3: Video       │
  │                      │     Rendering           │
  │                      │     ┌─────────────┐     │
  │                      │     │ Pillow+OpenCV│    │
  │                      │     │ Frame-by-    │    │
  │                      │     │ frame render │    │
  │                      │     └──────┬──────┘     │
  │                      │            │            │
  │  GET /api/jobs/{id}  │            │            │
  │─────────────────────▶│◀───────────┘            │
  │  {status:"completed" │                         │
  │   video_url: "..."}  │                         │
  │◀─────────────────────│                         │
  │                      │                         │
  │  GET /api/jobs/{id}/ │                         │
  │      video           │                         │
  │─────────────────────▶│                         │
  │  ← MP4 file stream   │                         │
  │◀─────────────────────│                         │
```

### 6.2 LangGraph State Machine

```
                    ┌──────────┐
                    │  START   │
                    └────┬─────┘
                         │
                         ▼
                ┌────────────────┐
                │ validate_input │──── Error ──▶ END (error)
                └────────┬───────┘
                         │ OK
                         ▼
                ┌────────────────┐
                │generate_script │──── Error ──▶ retry (max 2)
                └────────┬───────┘                  │
                         │ OK                  fail ▼
                         │                    END (error)
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        ┌──────────┐┌─────────┐┌──────────┐
        │synthesize││ search  ││ generate │
        │  _voice  ││ _images ││ _charts  │
        └────┬─────┘└────┬────┘└────┬─────┘
              │          │          │
              └──────────┼──────────┘
                         ▼
                ┌────────────────┐
                │ render_video   │──── Error ──▶ END (error)
                └────────┬───────┘
                         │ OK
                         ▼
                ┌────────────────┐
                │  finalize      │
                └────────┬───────┘
                         │
                         ▼
                    ┌──────────┐
                    │   END    │
                    │(completed│
                    └──────────┘
```

**Parallel execution:** Sau khi `generate_script` hoàn thành, 3 node `synthesize_voice`, `search_images`, `generate_charts` chạy **đồng thời** (LangGraph fan-out) → giảm tổng thời gian xử lý.

---

## 7. Data Models

### 7.1 Pipeline State (Internal)

```python
class VideoState(TypedDict):
    """LangGraph pipeline state — passes through all nodes."""

    # ── Input (user-provided) ──
    topic: str                        # "An toàn lao động trong nhà máy"
    style: Literal["training", "news", "explainer"]
    target_duration: int              # seconds: 30 | 60 | 90
    language: Literal["vi", "en"]     # default: "vi"
    voice_gender: Literal["male", "female"]  # default: "female"
    orientation: Literal["landscape", "portrait"]  # default: "landscape"

    # ── Script (from LLM) ──
    script: VideoScript               # Structured script object
    
    # ── Generated Assets ──
    audio_segments: list[AudioSegment]  # TTS audio per section
    total_audio_duration: float         # seconds
    background_images: list[str]        # file paths
    chart_images: list[str]             # file paths

    # ── Output ──
    video_path: str                   # final MP4 file path
    
    # ── Pipeline Meta ──
    job_id: str
    status: str                       # pending | processing | completed | error
    current_step: str                 # human-readable step name
    progress: int                     # 0-100
    error_message: str                # empty if no error
    created_at: str                   # ISO datetime
    completed_at: str                 # ISO datetime
```

### 7.2 Script Schema (LLM Output)

```python
class ScriptSection(BaseModel):
    """Một section/scene trong video."""
    
    section_id: int                    # 1, 2, 3, ...
    section_type: Literal["intro", "body", "conclusion"]
    
    # Content
    narration_text: str                # Text để TTS đọc (dài, tự nhiên)
    display_text: str                  # Text ngắn hiển thị trên video
    keywords: list[str]               # Từ khóa cần highlight
    
    # Assets
    image_query: str                   # Search query cho Pexels (English)
    
    # Chart (optional)
    has_chart: bool
    chart_config: Optional[ChartConfig]
    
    # Timing
    estimated_duration: int            # seconds (ước tính)


class ChartConfig(BaseModel):
    """Cấu hình biểu đồ minh họa."""
    
    chart_type: Literal["bar", "line", "pie"]
    title: str                         # Tiếng Việt
    labels: list[str]
    values: list[float]
    unit: Optional[str]                # "%", "triệu", etc.


class VideoScript(BaseModel):
    """Output hoàn chỉnh từ Script Agent."""
    
    title: str
    sections: list[ScriptSection]
    total_sections: int
    estimated_total_duration: int      # seconds
    summary: str                       # 1-2 câu tóm tắt
```

### 7.3 Audio Segment

```python
class AudioSegment(BaseModel):
    """Metadata cho audio đã generate."""
    
    section_id: int
    file_path: str                     # "output/{job_id}/audio/section_1.mp3"
    duration: float                    # seconds (actual, from file)
    start_time: float                  # cumulative start time in final video
```

---

## 8. API Specification

### 8.1 Endpoints

#### `POST /api/generate` — Tạo video mới

**Request:**
```json
{
  "topic": "An toàn lao động trong nhà máy",
  "style": "training",
  "duration": 60,
  "language": "vi",
  "voice": "female",
  "orientation": "landscape"
}
```

**Response (202 Accepted):**
```json
{
  "job_id": "abc123-def456",
  "status": "pending",
  "message": "Video generation started",
  "created_at": "2026-04-10T12:00:00Z",
  "estimated_time": 180
}
```

---

#### `GET /api/jobs/{job_id}` — Kiểm tra trạng thái

**Response (200 OK):**
```json
{
  "job_id": "abc123-def456",
  "status": "processing",
  "progress": 45,
  "current_step": "Generating voice narration",
  "steps": [
    {"name": "Script Generation", "status": "completed", "duration": 3.2},
    {"name": "Voice Synthesis", "status": "in_progress", "duration": null},
    {"name": "Image Search", "status": "completed", "duration": 2.1},
    {"name": "Chart Generation", "status": "completed", "duration": 1.0},
    {"name": "Video Rendering", "status": "pending", "duration": null}
  ],
  "created_at": "2026-04-10T12:00:00Z",
  "elapsed_time": 12.5
}
```

**Khi hoàn thành:**
```json
{
  "job_id": "abc123-def456",
  "status": "completed",
  "progress": 100,
  "current_step": "Done",
  "video_url": "/api/jobs/abc123-def456/video",
  "video_info": {
    "duration": 62.5,
    "file_size_mb": 18.3,
    "resolution": "1920x1080",
    "sections": 6
  },
  "cost": {
    "llm_tokens_used": 3200,
    "estimated_cost_usd": 0.003
  },
  "created_at": "2026-04-10T12:00:00Z",
  "completed_at": "2026-04-10T12:02:35Z",
  "total_time": 155.0
}
```

**Khi lỗi:**
```json
{
  "job_id": "abc123-def456",
  "status": "error",
  "progress": 25,
  "current_step": "Script Generation",
  "error": {
    "code": "LLM_API_ERROR",
    "message": "Gemini API rate limit exceeded. Please retry in 60 seconds.",
    "retry_after": 60
  }
}
```

---

#### `GET /api/jobs/{job_id}/video` — Download video

**Response:** MP4 file stream (`Content-Type: video/mp4`)

---

#### `GET /api/jobs` — Liệt kê tất cả jobs

**Response (200 OK):**
```json
{
  "jobs": [
    {
      "job_id": "abc123",
      "topic": "An toàn lao động",
      "status": "completed",
      "created_at": "2026-04-10T12:00:00Z"
    }
  ],
  "total": 1
}
```

### 8.2 Error Codes

| Code | Mô tả | HTTP Status |
|------|--------|-------------|
| `VALIDATION_ERROR` | Input không hợp lệ (topic quá ngắn, duration sai) | 422 |
| `LLM_API_ERROR` | Gemini API fail (rate limit, network) | 502 |
| `TTS_ERROR` | Edge-TTS synthesis fail | 500 |
| `IMAGE_SEARCH_ERROR` | Pexels API fail | 502 |
| `RENDER_ERROR` | Video rendering fail (font missing, disk full) | 500 |
| `JOB_NOT_FOUND` | Job ID không tồn tại | 404 |
| `TIMEOUT_ERROR` | Pipeline exceed 10 phút timeout | 504 |

---

## 9. Video Output Specification

### 9.1 Visual Design

```
┌──────────────────────────────────────────────┐
│                                              │
│         [Blurred Background Image]           │
│         (from Pexels, Gaussian blur r=15)    │
│         + Dark overlay (opacity 50%)         │
│                                              │
│    ┌──────────────────────────────────┐      │
│    │                                  │      │
│    │   Display Text Line 1            │      │
│    │   with **keyword** highlighted   │      │
│    │                                  │      │
│    └──────────────────────────────────┘      │
│                                              │
│              ┌────────────────┐              │
│              │   Chart Image  │              │
│              │   (if present) │              │
│              └────────────────┘              │
│                                              │
│  [1/6]                        AutoClip ▶     │
│                                              │
└──────────────────────────────────────────────┘
```

### 9.2 Video Specs

| Thuộc tính | Landscape | Portrait |
|------------|-----------|----------|
| Resolution | 1920 × 1080 | 1080 × 1920 |
| Aspect Ratio | 16:9 | 9:16 |
| FPS | 24 | 24 |
| Video Codec | H.264 (mp4v) | H.264 (mp4v) |
| Audio Codec | AAC | AAC |
| Container | MP4 | MP4 |
| Target File Size | < 30 MB/phút | < 30 MB/phút |

### 9.3 Text Styling

| Element | Font | Size | Color | Effect |
|---------|------|------|-------|--------|
| Display Text | Noto Sans VN Regular | 48px | #FFFFFF | Fade in + Slide up |
| Keyword | Noto Sans VN Bold | 52px | #FFD700 (Gold) | Scale pop + Glow |
| Section Counter | Noto Sans VN Light | 24px | #FFFFFF80 | Static |
| Watermark | Noto Sans VN Light | 20px | #FFFFFF40 | Static |

### 9.4 Animation Timeline (per section ~10s)

```
Time:  0s    1s    2s    3s    4s    5s    6s    7s    8s    9s    10s
       │     │     │     │     │     │     │     │     │     │     │
BG:    ╠═════════════════════════════════════════════════════╣ crossfade
       │ fade in                              fade out       │
       │                                                     │
Text:  │ ╠═══╣                                          ╠═══╣
       │ slide  ╠════════════════════════════════════╣  fade
       │  up    │          visible                   │  out
       │        │                                    │
KW:    │        │    ╠══╣                            │
       │        │    pop   ╠═══════════════════╣     │
       │        │          │    highlighted     │     │
       │        │          │                   │     │
Chart: │        │          │    ╠═══════╣      │     │
       │        │          │    fade in        │     │
       │        │          │         visible   │     │
       │        │          │                   │     │
Audio: ╠═════════════════════════════════════════════════════╣
       │              narration playing                      │
```

---

## 10. Cây thư mục dự án

```
Auto create Video/
├── SPEC.md                      ← Tài liệu này
├── README.md                    ← Hướng dẫn setup & sử dụng
├── requirements.txt             ← Python dependencies
├── .env.example                 ← Template cho API keys
├── .gitignore
├── config.py                    ← App configuration (Pydantic Settings)
│
├── pipeline/                    ← Core pipeline engine
│   ├── __init__.py
│   ├── state.py                 ← VideoState TypedDict
│   ├── orchestrator.py          ← LangGraph graph definition
│   ├── nodes/                   ← Pipeline nodes (1 file = 1 node)
│   │   ├── __init__.py
│   │   ├── script_generator.py  ← Gemini Flash → VideoScript
│   │   ├── tts_synthesizer.py   ← edge-tts → audio files
│   │   ├── image_searcher.py    ← Pexels API → images
│   │   └── chart_generator.py   ← matplotlib → chart PNGs
│   └── prompts/
│       └── script_prompt.py     ← Prompt templates cho LLM
│
├── rendering/                   ← Video rendering engine
│   ├── __init__.py
│   ├── text_renderer.py         ← Text overlay + keyword effects
│   ├── background.py            ← Background blur & overlay
│   ├── effects.py               ← Animation functions (fade, slide, pop)
│   └── composer.py              ← Combine all layers → frames → MP4
│
├── api/                         ← REST API layer
│   ├── __init__.py
│   ├── main.py                  ← FastAPI app + CORS + static mount
│   ├── routes.py                ← Endpoint handlers
│   └── schemas.py               ← Pydantic request/response models
│
├── web/                         ← Frontend (served by FastAPI)
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── assets/                      ← Static assets
│   └── fonts/
│       └── NotoSansVN-*.ttf     ← Vietnamese font files
│
├── output/                      ← Generated videos (git-ignored)
│   └── {job_id}/
│       ├── script.json
│       ├── audio/
│       │   ├── section_1.mp3
│       │   └── ...
│       ├── images/
│       │   ├── bg_1.jpg
│       │   └── ...
│       ├── charts/
│       │   ├── chart_1.png
│       │   └── ...
│       └── final.mp4
│
└── tests/
    ├── test_script_generator.py
    ├── test_tts.py
    ├── test_renderer.py
    └── test_pipeline.py
```

---

## 11. Chi phí vận hành (Cost Analysis)

### 11.1 Chi phí per video (1 phút)

| Thành phần | API / Service | Giá | Estimate per video |
|------------|---------------|-----|-------------------|
| Script Generation | Gemini 2.0 Flash | Input: $0.10/1M tokens, Output: $0.40/1M tokens | ~$0.001 |
| Voice Synthesis | edge-tts | Free (Microsoft Edge) | $0.000 |
| Image Search | Pexels API | Free (200 req/hr) | $0.000 |
| Chart Generation | matplotlib | Local (free) | $0.000 |
| Video Rendering | Pillow + OpenCV | Local (free) | $0.000 |
| **Tổng** | | | **~$0.001** |

### 11.2 Tổng chi phí dự án

| Hạng mục | Chi phí |
|----------|---------|
| Gemini API (dev + test, ~500 requests) | ~$0.50 |
| Pexels API | Free |
| Edge-TTS | Free |
| Python packages | Free (open source) |
| Font (Noto Sans VN) | Free (Google Fonts) |
| **Tổng chi phí dự án** | **< $1.00** |

> **So sánh với yêu cầu:** Budget limit $0.20/video → Actual cost ~$0.001/video ✅ (200x dưới ngưỡng)

---

## 12. Rủi ro & Biện pháp giảm thiểu

| # | Rủi ro | Xác suất | Impact | Biện pháp |
|---|--------|----------|--------|-----------|
| R1 | Edge-TTS bị Microsoft chặn/thay đổi | Thấp | Cao | Fallback: gTTS (Google, cũng free) |
| R2 | Pexels API rate limit (200 req/hr) | Trung bình | Trung bình | Cache images, limit 3-5 images/video |
| R3 | Gemini API down/quota hết | Thấp | Cao | Fallback: OpenAI GPT-4o-mini (~$0.01/video) |
| R4 | Video rendering quá chậm (>5 phút) | Trung bình | Trung bình | Giảm FPS (24→15), giảm resolution |
| R5 | Font không render đúng tiếng Việt | Thấp | Cao | Test kỹ Noto Sans VN, có backup Arial Unicode |
| R6 | Scope creep — thêm tính năng liên tục | Cao | Cao | Strictly follow SPEC, P0 first |
| R7 | Audio-video sync bị lệch | Trung bình | Cao | Dùng actual TTS duration, không estimate |
| R8 | Script quality kém (LLM hallucinate data) | Trung bình | Trung bình | Prompt engineering kỹ, thêm "based on real data only" |

---

## 13. Tiêu chí thành công (Success Metrics)

### 13.1 Technical Metrics

| Metric | Target | Cách đo |
|--------|--------|---------|
| End-to-end pipeline time | < 3 phút (cho video 60s) | Timestamp log |
| Cost per video | < $0.05 | API usage tracking |
| Video output quality | 1080p, audio sync ±0.5s | Manual review |
| Pipeline success rate | > 90% (không crash) | Error rate monitoring |
| Script relevance | Đúng chủ đề, không hallucinate | Manual review |

### 13.2 Demo Criteria (Cho buổi demo/chấm điểm)

| Criteria | Yêu cầu |
|----------|---------|
| ✅ E2E Pipeline hoạt động | Nhập topic → ra video MP4 |
| ✅ Agentic AI orchestration | LangGraph với parallel execution rõ ràng |
| ✅ Video quality chấp nhận được | Text đọc được, audio rõ, background đẹp |
| ✅ API documentation | Swagger/OpenAPI tự động từ FastAPI |
| ✅ Code quality | Clean code, type hints, docstrings |
| ✅ Cost efficiency | Evidence chi phí < $0.05/video |
| 🎁 Web UI (bonus) | Giao diện web để demo trực quan |
| 🎁 Multiple video styles | Training vs News style khác nhau |

---

## 14. Timeline & Milestones

```
Week 1: Core Pipeline                Week 2: Rendering + API            Week 3: UI + Polish
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│ Day 1-2: Setup      │  │ Day 1-2: Text render│  │ Day 1-2: Web UI     │
│  - Project skeleton │  │  - Pillow renderer  │  │  - Input form       │
│  - Config/env       │  │  - Effects system   │  │  - Progress view    │
│  - State schema     │  │  - Background blur  │  │  - Result viewer    │
│                     │  │                     │  │                     │
│ Day 3: Script Agent │  │ Day 3: Video compose│  │ Day 3: Integration  │
│  - Prompt engineer  │  │  - Audio sync       │  │  - End-to-end test  │
│  - JSON output      │  │  - Transitions      │  │  - Error handling   │
│  - Gemini API       │  │  - Frame→MP4        │  │  - Edge cases       │
│                     │  │                     │  │                     │
│ Day 4: TTS Agent    │  │ Day 4: FastAPI      │  │ Day 4: Polish       │
│  - edge-tts         │  │  - REST endpoints   │  │  - Improve prompts  │
│  - Audio segments   │  │  - Job management   │  │  - Better styling   │
│  - Duration extract │  │  - Background tasks │  │  - Performance      │
│                     │  │                     │  │                     │
│ Day 5: Assets Agent │  │ Day 5: API testing  │  │ Day 5: Demo prep    │
│  - Pexels search    │  │  - Swagger docs     │  │  - README           │
│  - Chart generation │  │  - Error handling   │  │  - Demo script      │
│  - Image processing │  │  - Integration test │  │  - Recording        │
│                     │  │                     │  │                     │
│ ✅ Milestone:       │  │ ✅ Milestone:       │  │ ✅ Milestone:       │
│ CLI: topic → assets │  │ API: POST → MP4     │  │ Web: topic → video  │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

---

## 15. Glossary

| Thuật ngữ | Định nghĩa |
|-----------|-----------|
| **Pipeline** | Chuỗi xử lý tuần tự/song song từ input đến output |
| **LangGraph** | Framework của LangChain cho stateful, multi-actor AI workflows |
| **TTS** | Text-to-Speech — chuyển văn bản thành giọng nói |
| **Edge-TTS** | Python package sử dụng Microsoft Edge's TTS service (miễn phí) |
| **Pexels** | Thư viện ảnh stock miễn phí với API |
| **Pillow (PIL)** | Python Imaging Library — xử lý ảnh, render text |
| **OpenCV** | Thư viện computer vision — dùng để compile frames thành video |
| **Frame-by-frame rendering** | Render từng frame (ảnh) rồi ghép thành video |
| **Orchestrator** | Thành phần điều phối toàn bộ pipeline |
| **Node** | Một bước xử lý trong LangGraph graph |
| **Section/Scene** | Một đoạn trong video, tương ứng 1 phần script |

---

## Changelog

| Ngày | Phiên bản | Thay đổi |
|------|-----------|----------|
| 2026-04-10 | 1.0 | Initial SPEC creation |
