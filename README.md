# AutoClip

AutoClip là hệ thống AI chuyển văn bản thành video ngắn dọc 9:16.

Đầu vào của hệ thống là một đoạn text tiếng Việt. Đầu ra là một video hoàn chỉnh gồm giọng đọc, timestamp từng từ, media minh hoạ theo scene và file JSON trung gian để Remotion render.

## Hệ Thống Làm Gì

Pipeline hiện tại tập trung vào 4 việc chính:

1. Phân tích nội dung văn bản thành các scene có thứ tự, mục đích và layout rõ ràng.
2. Sinh audio TTS và căn chỉnh word-level timestamp để subtitle và timing scene bám sát lời đọc.
3. Tìm media từ query ngữ nghĩa và tự động rerank bằng VLM trước khi đưa vào review/render.
4. Kết xuất JSON contract thống nhất giữa Python và Remotion để render ra MP4.

## Luồng Xử Lý End-To-End

```text
Raw Text
	-> Input Validator
	-> Content Parser (Splitter -> Director -> Enricher)
	-> [TTS + Word Alignment] song song với [Media Search]
	-> Scene Timing
	-> VideoProps JSON
	-> Asset Staging
	-> Remotion Render
	-> final.mp4
```

Chi tiết từng bước:

1. `input_validator` làm sạch input, kiểm tra độ dài và cảnh báo các trường hợp bất thường.
2. `content_parser` chạy 3 phase:
	 - Splitter chia scene nhưng phải giữ nội dung gốc theo thứ tự.
	 - Director gán `scene_type`, `purpose`, `transition`, `layout`, `color_palette`.
	 - Enricher tạo `visual_description`, query tìm ảnh/video, stats và dữ liệu hiển thị.
3. `_step_tts()` preprocess narration theo từng scene, ghép thành `processed_full`, gọi TTS rồi align chính xác trên đúng text đã synthesize.
4. `_step_media_search()` tìm media theo query cho từng scene; riêng luồng demo còn thu thập thêm top-k candidate để rerank.
5. `_compute_scene_timing()` dùng `word_timestamps` và `processed_word_counts` để chia thời lượng scene đúng với audio thực tế.
6. `VideoProps` được assemble, ghi ra `output/<job_id>/video_props.json`.
7. Khi render, asset được copy sang thư mục public của Remotion và sinh `video_props_render.json`.
8. Remotion render composition thành `output/<job_id>/final.mp4`.

## Hai Cách Chạy Hệ Thống

### 1. CLI Pipeline

- Entry point: `run_pipeline.py`
- Dùng khi muốn chạy thẳng từ text sang JSON hoặc MP4.
- Flow: validate -> parse -> TTS/media -> timing -> JSON -> render.

### 2. Modern Studio (Web App)

- Backend: `api/main.py`
- Frontend: `web/` (React + TypeScript + Vite + Shadcn UI)
- Flow:
	1. Login/Register qua JWT Auth.
	2. Setup: Nhập text & tùy chỉnh TTS/BGM.
	3. Processing: Xem AI pipeline chạy live qua SSE.
	4. Review: Studio Editor 3-pane chuyên nghiệp để sửa scene, re-search media, đổi layout.
	5. Render: Kết xuất MP4 từ các thiết lập đã review.

## Kiến Trúc Các Lớp

```text
Entry Points
	run_pipeline.py
	api/main.py
				|
				v
Orchestration Layer
	app/orchestrator.py
				|
				v
Node Layer (LangGraph Nodes)
	input_validator
	content_parser
	tts_preprocessor
	tts_synthesizer
	word_aligner
	media_searcher
	media_reranker
	video_renderer
				|
				v
UI Layer (Modern Studio)
	web/src/pages/CreatePage.tsx
	web/src/sections/ReviewView.tsx
	web/src/api/client.ts (Typed API)
				|
				v
Contract Layer
	app/state.py (Pydantic VideoProps)
	remotion/src/schemas/videoProps.ts (Zod)
				|
				v
Render Layer
	remotion/src/* (React + CSS Animations)
```

## Điểm Quan Trọng Của Kiến Trúc Hiện Tại

### 1. Text-Scene Alignment Là Trục Chính

- Splitter phải giữ nội dung gốc đủ chặt để scene không bị paraphrase quá mức.
- TTS không align trên raw narration nữa, mà align trên đúng `processed_text` đã dùng để synthesize.
- Timing scene dùng `processed_word_counts` theo từng scene để tránh lệch khi text bị biến đổi bởi bước preprocess như `AI -> A.I.` hoặc `100 -> một trăm`.

### 2. Media Chạy Theo Hai Tầng

- Tầng 1: `media_searcher` lấy kết quả candidate từ stock source.
- Tầng 2: `media_reranker` dùng VLM để chấm top-k candidate và chọn media phù hợp nhất.

Trong demo flow, VLM rerank chạy tự động trước khi job chuyển sang `review_ready`.

### 3. JSON Contract Là Điểm Nối Giữa Python Và Remotion

- Python side sinh `snake_case` JSON bằng Pydantic.
- Remotion side nhận dữ liệu, camelize key và validate lại bằng Zod.
- Điều này giúp renderer không phụ thuộc trực tiếp vào logic Python runtime.

## Dữ Liệu Đầu Ra Quan Trọng

- `output/<job_id>/video_props.json`: contract gốc từ pipeline Python.
- `output/<job_id>/video_props_render.json`: contract đã đổi path asset để Remotion render.
- `output/<job_id>/audio/full.mp3`: audio narration.
- `output/<job_id>/media/*`: media tải về cho từng scene.
- `output/<job_id>/final.mp4`: video kết quả.

## Lưu Trạng Thái Job

Demo API hỗ trợ 3 mode lưu job state qua `JOB_STORE_BACKEND`:

- `auto`: ưu tiên Redis, lỗi thì fallback sang file store.
- `redis`: bắt buộc Redis.
- `file`: lưu trực tiếp vào `output/.demo_jobs/`.

Key Redis có dạng `autoclip:demo:job:<job_id>`.

## Thư Mục Chính

```text
api/        FastAPI backend (Auth, Jobs, SSE, Static serve)
app/        Pipeline orchestration, nodes, schema
remotion/   Video Renderer (React/TS)
web/        Modern Studio Frontend (React/Vite/TS/Shadcn)
output/     Artefacts sinh ra theo từng job
tests/      Integration tests (29/29 passing)
scripts/    Utility scripts
```

## File Quan Trọng

- `app/orchestrator.py`: điều phối toàn pipeline.
- `app/nodes/content_parser.py`: parser 3 phase và integrity checks.
- `app/nodes/tts_preprocessor.py`: chuẩn hoá text trước TTS.
- `app/nodes/word_aligner.py`: word-level alignment.
- `app/nodes/media_searcher.py`: tìm media và candidate collection.
- `app/nodes/media_reranker.py`: chấm candidate bằng VLM.
- `app/state.py`: schema `VideoProps` và `Scene`.
- `api/demo_router.py`: luồng job cho web demo.
- `remotion/src/AutoClipVideo.tsx`: composition chính để render.

## File Legacy

Thư mục `src/` là scaffold cũ từ starter repo và không nằm trong pipeline AutoClip hiện tại.

## Chạy Nhanh (Sản phẩm)

```bash
# 1. Cài đặt Python
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# 2. Cài đặt & Build Frontend
cd web
npm install
npm run build
cd ..

# 3. Chạy API Server (Giao diện tại port 8000)
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

Hoặc chạy pipeline CLI:

```bash
python run_pipeline.py --text "Nội dung của bạn"
```
