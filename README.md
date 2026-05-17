# 🎬 AutoClip — Local AI Video Generator

> Biến văn bản thành video dọc viral chỉ trong vài giây ngay trên máy tính của bạn

---

## 📋 Mục lục

- [Mô tả dự án](#-mô-tả-dự-án)
- [Tính năng chính](#-tính-năng-chính)
- [Công nghệ sử dụng](#-công-nghệ-sử-dụng)
- [Hướng dẫn cài đặt](#-hướng-dẫn-cài-đặt)
- [Hướng dẫn chạy dự án](#-hướng-dẫn-chạy-dự-án)
- [Cấu trúc thư mục](#-cấu-trúc-thư-mục)

---

## 📝 Mô tả dự án

**AutoClip** là một công cụ local mạnh mẽ sử dụng AI để tự động chuyển đổi văn bản tiếng Việt thành video ngắn dọc (9:16) hoàn chỉnh — phù hợp để đăng lên TikTok, YouTube Shorts, Instagram Reels..

Người dùng chỉ cần nhập nội dung văn bản hoặc chủ đề, hệ thống sẽ tự động:
- Phân tích và chia nội dung thành các cảnh (scenes)
- Sinh giọng đọc AI (Text-to-Speech)
- Tìm kiếm và ghép media minh hoạ phù hợp
- Render ra video MP4 hoàn chỉnh với hiệu ứng chuyển cảnh, phụ đề và nhạc nền

---

## ✨ Tính năng chính

| Tính năng | Mô tả |
|-----------|-------|
| ⚡ **Siêu Nhanh, Siêu Nhẹ** | Khởi động tức thì không cần cấu hình Docker hay Redis. |
| 🤖 **AI Agentic Pipeline** | Hệ thống multi-agent với LangGraph điều phối các stage xử lý |
| 📝 **Text-to-Video** | Nhập văn bản hoặc chủ đề → AI tự chia scene, chọn layout, tìm media |
| 🎙️ **Multi-engine TTS** | Hỗ trợ 5 engine giọng đọc: OpenAI, Edge-TTS, ElevenLabs, Gemini, Vbee |
| 🔍 **Smart Media Search** | Tìm media stock tự động + VLM Rerank bằng AI vision để chọn media phù hợp nhất |
| 🎨 **Studio Editor** | Giao diện review 3 panel — chỉnh sửa scene, đổi media, tuỳ chỉnh màu sắc |
| 📊 **Đa dạng Scene Type** | 8+ loại scene: info_card, stats_highlight, comparison, timeline, diagram... |
| 🎵 **BGM & SFX** | Nhạc nền và hiệu ứng âm thanh tự động |

---

## 🛠️ Công nghệ sử dụng

### Frontend
| Công nghệ | Vai trò |
|-----------|---------|
| React 18 + TypeScript | Framework UI chính |
| Vite | Build tool & dev server |
| Shadcn/UI + Radix | Component library |
| TailwindCSS | Styling utility |
| Remotion | Video rendering engine (React-based) |

### Backend
| Công nghệ | Vai trò |
|-----------|---------|
| Python 3.13 | Ngôn ngữ backend |
| FastAPI | Web framework (async) |
| SQLAlchemy 2.0 | ORM & database (SQLite tự động cấu hình) |
| Asyncio Queue | Xử lý background task in-process |
| Pydantic v2 | Data validation & serialization |

---

## 📦 Hướng dẫn cài đặt

### Yêu cầu hệ thống

| Yêu cầu | Phiên bản |
|----------|-----------|
| Python | >= 3.11 |
| Node.js | >= 18.0 |
| FFmpeg | Cần thiết cho audio/video |

### Bước 1: Clone repository & Cấu hình môi trường

```bash
git clone https://github.com/Duy137/Auto-create-Video.git
cd Auto-create-Video
cp .env.example .env
```

Mở file `.env` và điền các API key cần thiết:
```env
OPENAI_API_KEY=sk-...           # Bắt buộc: Xử lý LLM
PEXELS_API_KEY=...              # Bắt buộc: Tìm media stock
```

### Bước 2: Cài đặt Python dependencies

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### Bước 3: Cài đặt Frontend & Remotion

```bash
# Frontend (React web app)
cd web
npm install
cd ..

# Remotion (Video renderer)
cd remotion
npm install
cd ..
```

---

## 🚀 Hướng dẫn chạy dự án

Dự án cung cấp 2 chế độ chạy: **Môi trường Phát triển (Development)** và **Môi trường Sản xuất (Production)**.

### Cách 1: Chạy môi trường Phát triển (Dành cho việc chỉnh sửa code)
Bạn mở 2 cửa sổ Terminal (đều đã kích hoạt `.venv` với Backend):

**Terminal 1: Chạy Backend API (Thư mục gốc)**
```bash
uvicorn api.main:app --port 8000 --reload
```

**Terminal 2: Chạy Frontend Web App (Thư mục web)**
```bash
cd web
npm run dev
```
👉 **Truy cập:** **http://localhost:5173** (Hoặc cổng mà Vite báo). Giao diện sẽ tự động cập nhật (Hot-reload) mỗi khi bạn lưu file code ở thư mục `web/src`.

### Cách 2: Chạy môi trường Sản xuất (Chỉ dùng Backend)
Nếu bạn chỉ muốn dùng cổng `8000` của FastAPI để hiển thị luôn cả Frontend (không cần chạy `npm run dev`), bạn phải **build (biên dịch)** code Frontend tĩnh trước:

```bash
cd web
npm run build
```
👉 Sau đó khởi động Backend (`uvicorn api.main:app --port 8000`) và truy cập thẳng vào **http://localhost:8000**.
*(Lưu ý: Nếu bạn sửa code UI trong thư mục `web/src`, bạn PHẢI chạy lại `npm run build` thì `localhost:8000` mới nhận diện được thay đổi mới nhất).*

*(Mẹo: Mọi API đã được mở khóa 100%, bạn là Admin cục bộ nên không cần đăng nhập hay lo lắng về giới hạn Quota).*

---

## 📁 Cấu trúc thư mục

```text
Auto-create-Video/
├── api/                    # FastAPI backend (In-process Jobs, SSE)
│   ├── main.py             # Entry point API server
│   ├── routes.py           # REST API endpoints
│   └── database.py         # SQLite database
│
├── app/                    # Core application logic
│   ├── agents/             # Agentic AI stack
│   ├── pipeline/           # Pipeline nodes (parser, TTS, media...)
│   └── utils/              # Shared utilities
│
├── web/                    # Frontend (React + TypeScript + Vite)
│   └── src/                # Giao diện UI (Create, Studio, Dashboard)
│
├── remotion/               # Video renderer (React + Remotion)
│   └── src/                # AutoClipVideo.tsx và các scene
│
├── config.py               # Cấu hình biến môi trường
└── run_pipeline.py         # CLI chạy trực tiếp qua Terminal (tuỳ chọn)
```