# Worklog

Ghi lại các quyết định kỹ thuật, phân công, và brainstorming của nhóm.

> Cập nhật **bất cứ khi nào** nhóm ra quyết định kỹ thuật quan trọng hoặc thay đổi hướng đi.

---

## Template

### Quyết định kỹ thuật

```markdown
### [ADR-N] Tiêu đề quyết định — DD/MM/YYYY

**Bối cảnh:** Vấn đề cần giải quyết là gì?

**Các lựa chọn đã xem xét:**
- Option A: ...
- Option B: ...

**Quyết định:** Chọn option nào và tại sao.

**Hệ quả:** Những gì bị ảnh hưởng / trade-off.
```

### Phân công

```markdown
### Sprint N — DD/MM → DD/MM/YYYY

| Task | Người làm | Deadline | Trạng thái |
|---|---|---|---|
| | | | |
```

### Brainstorming

```markdown
### Brainstorm: [Chủ đề] — DD/MM/YYYY

**Câu hỏi:** ...

**Các ý tưởng:**
- Ý tưởng 1: ...
- Ý tưởng 2: ...

**Kết luận:** ...
```


### [ADR-4] Chuyển TTS từ Edge-TTS sang OpenAI gpt-4o-mini-tts — 12/04/2026

**Bối cảnh:** Plan ban đầu dùng Edge-TTS (free) + SSML `<lang>` tag chuyển giọng Anh. Research phát hiện Edge-TTS đã gỡ custom SSML. Giọng Việt đọc tiếng Anh rất tệ ("Claude" → "cờ-lao-đờ").

**Các lựa chọn đã xem xét:**
- **Edge-TTS + transliteration:** Phiên âm Anh→Việt. Phát âm không chuẩn.
- **Dual-Voice:** Tách text → TTS riêng → ghép audio. Chuyển giọng đột ngột.
- **OpenAI gpt-4o-mini-tts:** LLM-based, tự code-switch Việt-Anh. ~380 VNĐ/video.

**Quyết định:** OpenAI gpt-4o-mini-tts. Code-switch tốt nhất, chi phí thấp, API ổn định. Nhược điểm: cần Whisper alignment cho word timestamps.

**Hệ quả:** Chi phí TTS tăng từ 0 → ~380 VNĐ/video nhưng chất lượng audio tốt hơn nhiều. Tổng ~880 VNĐ/video, vẫn trong target ≤5,000 VNĐ.

---

### [ADR-5] Rendering: Pillow + MoviePy — 11/04/2026

**Bối cảnh:** Cần render 3 loại layout (stock_bg, stats_highlight, info_card). MoviePy TextClip phụ thuộc ImageMagick.

**Các lựa chọn đã xem xét:**
- **MoviePy TextClip:** Cần ImageMagick, không vẽ được layout phức tạp.
- **Pillow per-frame + MoviePy compose:** Full control pixel, MoviePy ghép video + audio.
- **FFmpeg pipe:** Nhanh nhất nhưng error handling khó.

**Quyết định:** Pillow + MoviePy cho MVP. Với caching (font, text layer, blurred BG), render ~30s/video 1 phút → đạt target.

**Hệ quả:** Cần implement RenderCache class. FFmpeg pipe là backup cho Phase 2.

---



### Sprint 1 — 06/04 → 12/04/2026

| Task | Người làm | Deadline | Trạng thái |
|---|---|---|---|
| Viết SPEC.md | Cả team | 10/04 | ✅ Xong |
| Viết implementation_plan.md | Duy | 11/04 | ✅ Xong |
| Research case studies (RESEARCH.md) | Duy | 11/04 | ✅ Xong |
| Cập nhật plan (UPDATED_PLAN.md) | Giang | 12/04 | ✅ Xong |
| Research TTS engines (TTS_RESEARCH.md) | Giang | 12/04 | ✅ Xong |

(Việt mới vào nhóm ngày chủ nhật nên chưa có task)

---
### [ADR-6] Đánh giá Remotion & Kie.ai cho Pipeline — 16/04/2026

**Bối cảnh:** Cần đánh giá các công cụ video generation (Remotion) và AI provider aggregator (Kie.ai) để xem xét khả năng thay thế Pillow/MoviePy hoặc tích hợp vào hệ thống hiện tại nhằm tối ưu chi phí và tăng chất lượng, độ linh hoạt.

**Các lựa chọn đã xem xét:**
- **Remotion:** Framework React để tạo programmatic video, free cho nhóm nhỏ, cost hiệu quả khi tự host hoặc chạy Lambda. Cung cấp animation cực mượt, responsive native web.
- **Kie.ai Video Gen:** Các model AI video cinematic như Veo, Kling. Rất đắt và gen video không deterministic, trái nguyên tắc core content integrity.
- **Kie.ai ElevenLabs TTS:** Voice chất lượng rất cao (premium). Cost tăng nhẹ, gặp hạn chế vì không có WordBoundary.

**Quyết định:** 
- **Không dùng Kie.ai Video Gen** (vì concept khác biệt và cost quá cao).
- **Chuyển MoviePy/Pillow sang Remotion vào Phase 2**: Giúp tăng chất lượng đồ hoạ và caption mượt mà hơn. Ban đầu vẫn giữ Pillow + MoviePy cho MVP.
- **Tích hợp ElevenLabs qua Kie.ai vào Phase 3+**: Làm tính năng voice premium tuỳ chọn thay cho tài khoản free, cần nghiên cứu thêm Whisper.

**Hệ quả:** Mở rộng kiến trúc tương lai của dự án với Node.js. Cần setup Remotion Lambda pipeline vào lúc thực thi Phase 2, nhưng MVP Phase 1 được bảo vệ hoàn toàn không ảnh hưởng.

---

### [ADR-7] Bỏ MoviePy/Pillow, dùng Remotion từ Phase 1 — 16/04/2026

**Bối cảnh:** ADR-5 chọn Pillow+MoviePy cho MVP, ADR-6 đánh giá Remotion cho Phase 2. Phân tích kỹ hơn cho thấy xây Pillow renderer rồi bỏ là lãng phí effort. Demo cần trong 3 ngày, MVP cần sớm — Remotion cho phép CSS/React layout nhanh hơn Pillow pixel drawing.

**Các lựa chọn đã xem xét:**
- **Giữ MoviePy+Pillow cho MVP, Remotion cho Phase 2:** An toàn nhưng tốn ~4.5 ngày build code sẽ vứt đi.
- **Dùng Remotion từ Phase 1:** Cần học React cơ bản nhưng CSS layout nhanh hơn, caption animation có sẵn `@remotion/captions`, real-time preview.

**Quyết định:** **Dùng Remotion từ Phase 1.** Bỏ hoàn toàn MoviePy và Pillow rendering.
- Python pipeline (LangGraph) giữ nguyên → output JSON + audio + images
- Remotion React project nhận data qua `input_props` → render MP4
- Tích hợp qua CLI: `npx remotion render` gọi từ Python subprocess
- Free license (team ≤ 3 người)

**Hệ quả:**
- Thêm Node.js vào tech stack (Docker cần cả Python + Node.js)
- Bỏ `moviepy`, `Pillow`, `matplotlib`, `numpy` khỏi Python dependencies
- Cần tạo Remotion project mới (`remotion/` subfolder) với React components cho 3 layout templates
- **Supersedes ADR-5** (Pillow+MoviePy) và cập nhật ADR-6 (Remotion không còn Phase 2 mà là Phase 1)

---
### [ADR-8] Pipeline 2 Phases — 19/04/2026

**Bối cảnh:** Pipeline hiện tại chạy 1-shot (validate → render liền). User không có cơ hội review/sửa scenes trước khi render. Plan v4.1 yêu cầu Review state nhưng backend chưa hỗ trợ.

**Các lựa chọn đã xem xét:**
- **3 phases (2 điểm dừng):** Parse → ⏸️STOP1 (sửa keywords) → TTS+Media → ⏸️STOP2 (review scenes) → Render. Cho phép sửa keywords trước khi media search.
- **2 phases (1 điểm dừng):** Parse+TTS+Media → ⏸️STOP (review scenes, re-search per-scene) → Render. Keywords sửa ở Review.

**Quyết định:** 2 phases. Lý do:
- Voice preview đã có ở Setup (`POST /tts/preview`) — không cần dừng pipeline.
- 80% user không đổi keywords → dừng giữa chừng = friction vô ích.
- Keywords sửa ở Review per-scene + re-search (~1s/scene) — tốt hơn bắt tất cả user dừng.

**Hệ quả:** 3 endpoints mới (render, update props, re-search). Fake SSE events phải bỏ, thay bằng 2 events thật. Frontend build phải theo flow 4-state: setup → processing → review → result.

---

### [ADR-9] Re-search Strategy: URL-only, không download — 19/04/2026

**Bối cảnh:** Khi user re-search media cho 1 scene ở Review, có 2 cách: (A) download file ngay, (B) chỉ lưu Pexels URL, download khi render.

**Các lựa chọn đã xem xét:**
- **Download ngay:** Simple, props luôn có local file. Nhưng mỗi re-search tốn 3-5s download, nếu user thử nhiều lần → wasted I/O + bandwidth.
- **Chỉ lưu URL:** Re-search ~1s (chỉ API call). Frontend preview trực tiếp từ Pexels CDN. Download 1 lần duy nhất khi staging (render).

**Quyết định:** Chỉ lưu URL. `stage_assets_for_remotion()` handle cả local path + remote URL.

**Hệ quả:** Frontend phải handle 2 format `media_url`: absolute local path (từ Phase 1) và Pexels URL (từ re-search). Staging function cần download remote URLs trước khi render.

---

### Sprint 2 — 14/04 → 20/04/2026

| Task | Người làm | Deadline | Trạng thái |
|---|---|---|---|
| Sprint 2 — 14/04 → 20/04/2026                               | Duy + AI | 20/04 | ✅ Xong |
| Frontend Refactor to TypeScript & Shadcn UI (The Great Refactor) | Duy + AI | 21/04 | ✅ Xong |
| Pipeline 2 Phases (extract staging, 3 endpoints mới)             | Duy + AI | 20/04 | ✅ Xong |
| 3 New Scene Types (`comparison`, `timeline`, `media_showcase`)   | Duy + AI | 20/04 | ✅ Xong |
| Splitter/Director Refactoring                                    | Duy + AI | 20/04 | ✅ Xong |
| LLM Cost Optimizations (VLM rerank disable, non-stock skip)      | Duy + AI | 20/04 | ✅ Xong |

---

### [ADR-10] Đại Cải Cách: Chuyển Frontend sang TypeScript & Shadcn UI — 21/04/2026

**Bối cảnh:** Frontend vanilla React/JSX gặp nhiều lỗi runtime, khó bảo trì khi project phình to. UI thiếu sự đồng nhất và chuyên nghiệp cho một Studio Editor.

**Các lựa chọn đã xem xét:**
- **Tiếp tục dùng JSX:** Nhanh nhất nhưng nợ kỹ thuật (tech debt) tăng cao.
- **Dùng TypeScript + Ant Design/MUI:** Mạnh mẽ nhưng bundle size lớn và khó customize deep premium dark mode.
- **Dùng TypeScript + Shadcn UI + Tailwind CSS:** Hiện đại, type-safe 100%, dễ customize giao diện premium, copy-paste component giúp giảm dependency.

**Quyết định:** **TypeScript + Shadcn UI + Tailwind CSS**. 
- Refactor 100% component sang `.tsx`.
- Sử dụng Radix UI (qua Shadcn) để đảm bảo accessibility và tương tác mượt mà.
- Thay thế toàn bộ CSS thủ công bằng Tailwind.

**Hệ quả:**
- Codebase sạch, catch lỗi tại thời điểm biên dịch.
- UI/UX lột xác hoàn toàn: 3-pane Studio Editor chuyên nghiệp.
- Cần thời gian refactor lớn (đã thực hiện xong trong 1 sprint thần tốc).
---

### [ADR-11] Custom Media Upload — Dual URL Strategy — 22/04/2026

**Bối cảnh:** User muốn upload ảnh/video riêng thay vì chỉ search Pexels. Cần serve file cho browser preview VÀ cung cấp local path cho Remotion staging.

**Quyết định:** Dual URL — `media_url` = local absolute path (cho `stage_assets_for_remotion` copy trực tiếp), `_preview_url` = serve URL qua `/api/outputs/` static mount (cho browser). Frontend dùng `getPreviewUrl()` helper để chọn URL đúng.

**Hệ quả:** `stage_assets_for_remotion` không cần sửa — đã handle local paths. Browser preview hoạt động qua static mount có sẵn. Cache buster (`?t=Date.now()`) cho upload lần 2 cùng scene.
---

### [ADR-12]: SQLAlchemy JSON Column Shallow Copy — 24/04/2026

**Vấn đề:** Scene edits (re-search, upload media) không persist vào DB → render output dùng media/type ban đầu.

**Root cause:** `dict(job.props)` tạo **shallow copy** — `scenes` list shared giữa old/new dict. Khi `updated_props["scenes"][i] = new_scene`, mutation ảnh hưởng cả `job.props["scenes"][i]`. SQLAlchemy JSON equality check: `old == new` → skip SQL UPDATE → thay đổi bị mất.

**Bằng chứng:** Diagnostic logs cho thấy PATCH COMMIT vẫn chứa media_url gốc từ Phase 1 pipeline, dù re-search + upload đã được gọi thành công.

**Fix:**
```python
# Trước (BUG):
updated_props = dict(job.props)
updated_props["scenes"][i] = new_scene  # mutates shared list
job.props = updated_props               # old == new → SKIP!

# Sau (FIX):
updated_props = dict(job.props)
updated_props["scenes"] = [dict(s) for s in updated_props["scenes"]]  # NEW list
updated_props["scenes"][i]["media_url"] = new_url
job.props = updated_props
flag_modified(job, "props")  # belt-and-suspenders
```

**Files thay đổi:** `api/routes.py` (re-search endpoint + upload endpoint)

**Methodology:** Architect-Builder AI debate → diagnostic logging (3 checkpoints) → log comparison xác nhận root cause.

### [ADR-13]: Video Jitter Fix (OffthreadVideo + Concurrency) — 24/04/2026

**Vấn đề:** Video output bị giật/stuttering dù video source (Pexels) hoàn toàn mượt.

**Root cause:** Remotion render CLI dùng multi-threading (mỗi CPU core = 1 Chrome tab). Mỗi tab seek video đến frame khác → long-GOP encoding gây seeking inaccurate → frame skip/duplicate.

**Fix:**
1. `--concurrency=1` trong `video_renderer.py` — loại bỏ multi-tab seeking
2. `<Video>` → `<OffthreadVideo>` trong `BackgroundVideo.tsx` + `MediaShowcase.tsx` — FFmpeg-based frame extraction, frame-accurate kể cả concurrency > 1

**Trade-off:** Render chậm hơn ~3-5x do single-thread. Khi cần tối ưu tốc độ, có thể bỏ `--concurrency=1` vì `<OffthreadVideo>` đã đảm bảo frame-accurate.


### Sprint 3 — 21/04 → 27/04/2026

| Task | Người làm | Deadline | Trạng thái |
|---|---|---|---|
| Đồng bộ hóa Documentation (Master Plan, Architecture, Context) | Duy + AI | 22/04 | ✅ Xong |
| E2E Pipeline Stabilization (Vite base path, static mount, ReviewView crash) | Duy + AI | 21/04 | ✅ Xong |
| Props persistence + Dashboard filter + Audio sync | Duy + AI | 21/04 | ✅ Xong |
| Custom Media Upload endpoint + drag-drop UI | Duy + AI | 22/04 | ✅ Xong |
| Polish CSS & Responsive Mobile | Duy + AI | 24/04 | ⏳ Next |
| PostgreSQL Migration Research | Duy + AI | 25/04 | ⏳ Chờ |
| Dockerize & Railway Deployment | Duy + AI | 27/04 | ⏳ Chờ |

---

### [ADR-14] Subtitle Text Fidelity — Original Text thay vì TTS-Processed — 28/04/2026

**Bối cảnh:** Subtitle và text lớn trên `stock_background` hiển thị text đã bị `preprocess_for_tts()` biến đổi (VD: "AI"→"A.I.", "100"→"một trăm", "TP.HCM"→"Thành phố Hồ Chí Minh"). User mong đợi thấy đúng text gốc mình nhập.

**Các lựa chọn đã xem xét:**
- **Option A (Builder đề xuất):** Thêm `preprocess_for_tts_with_mapping()` trả word-level mapping, merge timestamps ngược → ~100 dòng code mới.
- **Option B (Architect đề xuất):** Đổi `original_text=processed_full` → `full_narration` trong Whisper `align_words()` call → 1 dòng thay đổi. stable-ts forced alignment gán audio segments cho text được cung cấp bất kể word count.

**Quyết định:** Option B — fix 1 dòng. Test trước, nếu timing lệch nghiêm trọng mới implement Option A.

**Hệ quả:**
- `word_timestamps` giờ chứa original words → `processed_word_counts` phải đổi thành `original_word_counts` để `assign_scene_timing()` match.
- ElevenLabs native timestamps path vẫn cần mapping riêng (chưa fix, phủ <10% use case).
- Methodology: Builder over-engineer → Architect phản biện → consensus → test verify.

---

### [ADR-15] Data-driven Auto-Layout thay vì LLM Random Assignment — 27/04/2026

**Bối cảnh:** Director LLM chọn layout bằng random pool (fade/slide/grid) TRƯỚC khi Enricher generate data. Dẫn đến layout không phù hợp số lượng items thực tế (VD: `grid_2x2` cho 2 items → 2 ô trống).

**Quyết định:** Thêm hàm `_auto_layout()` trong `content_parser.py`, chạy POST-Enricher trong `_merge_phases()`. Logic heuristic:
- `info_card` 4 items → `grid_2x2`, 2 items → `vertical_stack`, 3+ → `vertical_stack`
- `stats_highlight` ≤2 → `horizontal_grid`, 3+ → `vertical_stack`
- `stock_background` → luôn `media_overlay`
- Default → `center_focus`

**Hệ quả:** Director prompt rút gọn ~80→25 dòng (bỏ layout rules). Layout luôn match data thực. PATCH handler cần gọi `_auto_layout()` khi user đổi `scene_type` (Round 2 Bug Fix 1).

---

### Sprint 4 — 28/04 → 04/05/2026

| Task | Người làm | Deadline | Trạng thái |
|---|---|---|---|
| Director Simplification + Auto-Layout | Duy + AI | 27/04 | ✅ Xong |
| Subtitle Text Fidelity Fix (original text display) | Duy + AI | 28/04 | ✅ Xong |
| Round 2 Bug Fixes (layout stale, scene overflow, collapsed timestamps) | Duy + AI | 28/04 | ✅ Xong |
| Production Testing E2E (all TTS engines + scene types) | Duy + AI | 30/04 | ⏳ Next |
| Dockerize & Railway Deployment | Duy + AI | 04/05 | ⏳ Chờ |


## Ví dụ

### [ADR-1] Dùng TypeScript thay vì Python — 30/03/2026

**Bối cảnh:** Cả nhóm cần chọn 1 ngôn ngữ chính để xây dựng agent. Có 2 thành viên quen Python, 1 thành viên quen TypeScript.

**Các lựa chọn đã xem xét:**
- **Python**: Ecosystem ML tốt hơn, syntax đơn giản, thành viên quen hơn.
- **TypeScript**: Type safety, dễ refactor khi project lớn, nhiều library AI mới ra bản TS trước.

**Quyết định:** Chọn TypeScript vì project này focus vào agent architecture, không cần ML library nặng. Type safety sẽ giúp bắt lỗi sớm hơn khi codebase phình ra.

**Hệ quả:** 2 thành viên Python cần học TypeScript cơ bản (ước tính 1 tuần). Sẽ không dùng được `langchain` Python trực tiếp.

---

### [ADR-2] Lưu conversation history bằng file JSON — 03/04/2026

**Bối cảnh:** Agent cần nhớ context giữa các lần chạy. Cần chọn storage.

**Các lựa chọn đã xem xét:**
- **In-memory array**: Đơn giản nhất nhưng mất khi restart.
- **File JSON**: Persistent, không cần setup, dễ inspect bằng tay.
- **SQLite**: Có thể query, tốt cho production nhưng overkill cho prototype.
- **Redis**: Fast nhưng cần chạy thêm service.

**Quyết định:** File JSON cho giai đoạn prototype. Thiết kế interface `MemoryStore` để sau này swap sang SQLite không cần sửa logic agent.

**Hệ quả:** Không query được theo thời gian hay user. Chấp nhận được ở giai đoạn này.

---

### Sprint 1 — 31/03 → 06/04/2026

| Task | Người làm | Deadline | Trạng thái |
|---|---|---|---|
| Setup TypeScript project + CI | Văn A | 01/04 | ✅ Xong |
| Implement agent loop cơ bản | Thị B | 02/04 | ✅ Xong |
| Tool: `search_web` (Brave API) | Văn C | 03/04 | ✅ Xong |
| Tool: `read_file`, `write_file` | Thị B | 05/04 | ✅ Xong |
| Conversation memory (JSON) | Văn A | 06/04 | ✅ Xong |
| README + setup docs | Văn C | 06/04 | ✅ Xong |

---

### Sprint 2 — 07/04 → 13/04/2026

| Task | Người làm | Deadline | Trạng thái |
|---|---|---|---|
| Fix infinite loop: thêm `max_iterations` | Thị B | 08/04 | 🔄 Đang làm |
| Tool: `run_tests` (chạy pytest) | Văn C | 10/04 | ⏳ Chờ |
| Sliding window memory | Văn A | 09/04 | ⏳ Chờ |
| Demo prep + slides | Cả nhóm | 13/04 | ⏳ Chờ |

---

### Brainstorm: Tính năng cho demo — 05/04/2026

**Câu hỏi:** Demo tuần tới nên show gì để ấn tượng nhất trong 5 phút?

**Các ý tưởng:**
- **Ý tưởng 1 (Văn A):** Cho agent đọc 1 file Python có bug, tự fix, rồi chạy test để verify. Trực quan, dễ hiểu.
- **Ý tưởng 2 (Thị B):** Agent tự build 1 tính năng nhỏ từ mô tả bằng tiếng Việt. Show khả năng hiểu ngôn ngữ tự nhiên.
- **Ý tưởng 3 (Văn C):** Agent review PR, comment vào từng dòng code có vấn đề. Gần với use case thực tế nhất.

**Pros/Cons:**
| Ý tưởng | Pros | Cons |
|---|---|---|
| Fix bug | Dễ làm, chắc chắn chạy được | Ít "wow" hơn |
| Build từ mô tả | Ấn tượng nhất | Có thể fail nếu prompt phức tạp |
| Review PR | Thực tế, liên quan trực tiếp đến khóa học | Cần setup GitHub webhook |

**Kết luận:** Chọn ý tưởng 1 (fix bug) cho demo chính vì đảm bảo. Nếu còn thời gian sẽ show thêm ý tưởng 2 như bonus.

---

### Bug quan trọng: Tool call loop vô hạn — 04/04/2026

**Triệu chứng:** Agent gọi `search_web` liên tục không dừng khi tool trả về lỗi network.

**Root cause:** Không có stop condition khi tool raise exception. Agent nhận `"error": "timeout"` nhưng interpret là cần thử lại.

**Fix:** Thêm 2 điều kiện dừng:
1. `max_iterations = 10` — hard stop sau 10 vòng
2. Nếu tool trả về lỗi 3 lần liên tiếp → dừng và báo user

**Code thay đổi:** `src/agent.ts` lines 45-67

**Học được:** Luôn thiết kế stop condition trước khi implement retry logic.

---
