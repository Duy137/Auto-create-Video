# Hướng Dẫn Chạy AutoClip

## Yêu Cầu Hệ Thống

| Phần mềm | Phiên bản tối thiểu | Ghi chú |
|:---------|:--------------------|:--------|
| Python | 3.11+ | `python --version` |
| Node.js | 18+ | `node --version` |
| FFmpeg | bất kỳ | Cần cho render video |

---

## Lần Đầu Cài Đặt

### Bước 1 — Tạo file `.env`
```bash
cp .env.example .env
```

Mở `.env` và điền:
```
OPENAI_API_KEY=sk-...
PEXELS_API_KEY=...
GOOGLE_API_KEY=...             # tuỳ chọn, fallback Gemini
DATABASE_URL=sqlite+aiosqlite:///data/autoclip.db
JWT_SECRET_KEY=your-super-secret-key-12345
```

### Bước 2 — Cài Python dependencies
```bash
python -m venv .venv
.venv\Scripts\activate         # Windows
# hoặc: source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
```

### Bước 3 — Cài Frontend & Remotion dependencies
```bash
# Cài cho frontend web
cd web
npm install
cd ..

# Cài cho render engine
cd remotion
npm install
cd ..
```

---

## Cách 1: Pipeline CLI (không cần web UI)

```bash
# Từ file text
python run_pipeline.py test_input.txt

# Từ chuỗi trực tiếp
python run_pipeline.py --text "Nội dung bài viết của bạn..."

# Chỉ tạo JSON, không render video (không cần Node.js)
python run_pipeline.py test_input.txt --skip-render

# Tuỳ chỉnh giọng và tốc độ
python run_pipeline.py test_input.txt --voice nova --rate 1.2
```

Output: `output/<job_id>/final.mp4`

**Giọng đọc hỗ trợ:** `nova` `alloy` `echo` `fable` `onyx` `shimmer`

---

## Cách 2: Web Studio (Khuyến nghị)

### Bước 1 — Khởi động API server (Backend)
Hệ thống sử dụng SQLite mặc định, tự động tạo database tại `data/autoclip.db` khi chạy. Không cần cài đặt Redis.

```bash
uvicorn api.main:app --reload --port 8000
```

### Bước 2 — Khởi động Web UI (Frontend)

**Môi trường Sản phẩm (Khuyến nghị):**
API server sẽ phục vụ file static từ `web/dist`.
```bash
# Build frontend
cd web
npm run build
cd ..
# Chạy API (Phục vụ cả giao diện tại port 8000)
uvicorn api.main:app --host 0.0.0.0 --port 8000
# Mở: http://localhost:8000
```

**Môi trường Phát triển (Dành cho Coder):**
Dùng để có Hot-Reload khi sửa code React.
```bash
# Terminal 1: Chạy API (nếu chưa chạy)
uvicorn api.main:app --reload --port 8000

# Terminal 2: Chạy Vite Dev Server
cd web
npm run dev
# Mở: http://localhost:5173
```

### Luồng Web Studio

```
[Đăng nhập / Đăng ký] → Tự động tạo account trên local DB
     ↓
[Setup] Nhập text + chọn Voice/BG Music
     ↓
[Processing] Xem tiến trình AI chạy live qua SSE
     ↓
[Review] Studio Editor 3-pane:
   - Sửa nội dung từng Scene
   - Đổi Scene Type / Transition
   - Re-search Media (Pexels)
     ↓
[Render] Chạy render final MP4
     ↓
[Result] Xem kết quả + Tải video
```

---

## Cách 3: Remotion Studio (xem preview giao diện)

```bash
cd remotion
npx remotion studio
# Mở: http://localhost:3000
```

---

## Chạy Tests

```bash
pytest                          # tất cả
pytest tests/test_state.py -v  # một file cụ thể
pytest -q                       # nhanh, ít output
```

---

## Biến Môi Trường

| Biến | Mặc định | Mô tả |
|:-----|:---------|:------|
| `OPENAI_API_KEY` | — | Bắt buộc |
| `PEXELS_API_KEY` | — | Bắt buộc (tìm media) |
| `GOOGLE_API_KEY` | — | Tuỳ chọn (fallback Gemini) |
| `DATABASE_URL` | `sqlite+aiosqlite:///data/autoclip.db` | Kết nối Database |
| `JWT_SECRET_KEY` | `your-secret` | Key tạo token đăng nhập |
| `OUTPUT_DIR` | `output` | Thư mục lưu output |
| `REMOTION_DIR` | `remotion` | Thư mục Remotion |
| `DEFAULT_TTS_ENGINE` | `openai` | `openai`, `elevenlabs`, `gemini`, hoặc `edge-tts` |
| `DEFAULT_VOICE` | `nova` | Giọng mặc định |
| `FFMPEG_PATH` | — | Đường dẫn ffmpeg nếu không có trong PATH |
| `PORT` | `8000` | Port FastAPI |
| `QWEN_API_KEY` | — | Tuỳ chọn (DashScope — dùng cho media reranking) |
| `QWEN_RERANK_URL` | `https://dashscope-intl.aliyuncs.com/compatible-api/v1/reranks` | Endpoint DashScope Rerank API |
| `VLM_RERANK_MODEL` | `qwen3-rerank` | Model rerank (`qwen3-rerank` hoặc `qwen3-vl-rerank`) |

---

## Xử Lý Lỗi Thường Gặp

| Lỗi | Nguyên nhân | Cách sửa |
|:----|:------------|:---------|
| `RenderError: npx not found` | Chưa cài Node.js | Cài Node 18+ và `npm install` trong `remotion/` |
| `ValidationError: too_short` | Text < 30 từ | Thêm nội dung cho đủ |
| Dấu tiếng Việt bị lỗi | FFmpeg thiếu font | Đặt `FFMPEG_PATH` trong `.env` |
| `ConnectionRefusedError` | Thiếu API key | Kiểm tra `OPENAI_API_KEY` trong `.env` |
