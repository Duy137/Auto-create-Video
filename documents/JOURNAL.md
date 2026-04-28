# Weekly Journal

Ghi lại hành trình xây dựng sản phẩm mỗi tuần — những gì đã làm, học được gì, AI giúp như thế nào.

> **Cập nhật mỗi cuối tuần** (trước khi tạo PR). Không cần dài, chỉ cần thật.

---

## Template

```markdown
## Tuần N — DD/MM/YYYY

### Đã làm
-

### Khó nhất tuần này
-

### AI tool đã dùng
| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Claude Code | | |

### Học được
-

### Nếu làm lại, sẽ làm khác
-

### Kế hoạch tuần tới
-
```

---

## Tuần 1 — 06/04/2026

**Thành viên:** Nguyễn Đức Duy, Trần Trọng Giang, Trần Quốc Việt

### Đã làm
- Viết SPEC.md cho dự án AutoClip — AI Pipeline chuyển Final Text → Video ngắn dọc 9:16. Định nghĩa scope MVP, 4 user stories, failure modes, metrics
- Viết implementation_plan.md: kiến trúc LangGraph 8 nodes, 3 layout templates, JSON contract, Web UI 4 trang
- Research 5 dự án mã nguồn mở + 5 thư viện subtitle → viết RESEARCH.md. Phát hiện Edge-TTS đã gỡ custom SSML
- Cập nhật UPDATED_PLAN.md: thiết kế Dual-Voice TTS + Pillow caching layer
- Research 12 TTS engines, so sánh chi phí/code-switch → viết TTS_RESEARCH.md. Quyết định dùng OpenAI gpt-4o-mini-tts

### Khó nhất tuần này
- Phát hiện Edge-TTS gỡ SSML giữa chừng thiết kế. Plan ban đầu dựa vào `<lang>` tag để xử lý tiếng Anh xen kẽ → phải redesign TTS module. Bài học: verify tính năng thư viện trước khi thiết kế kiến trúc dựa trên nó

### AI tool đã dùng
| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Antigravity (Claude Onpus 4.6 tích hợp Superpowers) | Hỗ trợ thiết kế kiến trúc pipeline, viết SPEC | Rút ngắn thời gian thiết kế đáng kể |
| Antigravity (Claude Onpus 4.6 tích hợp Superpowers) | Research các repo GitHub giải quyết các bài toán tương tự để học hỏi + thư viện subtitle | Phát hiện SSML bị gỡ trước khi code |
| Antigravity (Claude Onpus 4.6 tích hợp Superpowers) | So sánh 12 TTS engine về pricing và code-switch | Tìm được OpenAI ~380 VNĐ/video, code-switch tốt nhất |

### Học được
- Viết SPEC + plan chi tiết trước khi code (Đặc biệt là xác định scope MVP vừa phải để có thể triển khai trong thời gian khả thi)
- Nên học hỏi từ những người đi trước (các dự án cùng loại) trước khi thực hiện

### Nếu làm lại, sẽ làm khác


### Kế hoạch tuần tới
- Bắt đầu triển khai code bằng vibe code càng nhanh càng tốt để có thể test và sửa lỗi sớm. Tuy nhiên, phải cho AI build theo nhiều phase và kiểm soát từng phase để tránh AI đi lệch hướng.

---

## Tuần 2 — 13/04/2026

**Thành viên:** Nguyễn Đức Duy, Trần Trọng Giang, Trần Quốc Việt

### Đã làm
- **Remotion rendering fix**: Sửa header text overflow (dùng `visualDescription` thay narration), subtitle sync (`currentMs` tính theo `sceneStartMs`)
- **Narration dedup**: Fix bug lặp câu cuối video — GPT-4o-mini tạo narration overlap giữa 2 scene cuối. Thêm strict suffix detection trong `_step_tts()`
- **Architectural audit**: 4 fixes (URI→Path, DB session SSE, singleton OpenAI client, TTS engine cache)
- **Pipeline 2 Phases**: Tách pipeline từ 1-shot thành 2-phase (review → render). Extract `stage_assets_for_remotion()`. 3 endpoints mới (render, update props, re-search per-scene)
- **Frontend plan v4.2**: Redesign Setup UI (3-panel → text-hero + 2-panel), bỏ Video Keywords + Raw JSON toggle, thêm per-scene re-search
- **Re-search strategy**: Quyết định chỉ lưu Pexels URL (không download), frontend preview từ CDN, staging download khi render

### Khó nhất tuần này
- **Pipeline 2 Phases architecture**: Phải cân nhắc giữa 2 vs 3 phases. Ban đầu tưởng cần 3 phases (thêm 1 stop cho keywords editing) nhưng phân tích kỹ cho thấy 2 phases đủ — keywords sửa ở Review per-scene. Việc ra quyết định architecture đúng ngay từ đầu quan trọng hơn việc code.
- **Multi-agent coordination**: Dùng flow Architect AI → Builder AI (review + feedback loop) có ưu điểm là phản biện tốt nhưng cần coordinate context giữa các AI agents rất cẩn thận.

### AI tool đã dùng
| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Antigravity (Architect role) | Phân tích architecture, thiết kế Pipeline 2 Phases, viết implementation plan | Plan v2.3 đầy đủ, 3 files code ~145 LOC |
| Antigravity (Builder role) | Review plan, phát hiện SSE fake + media_url format issue, implement code | Builder phát hiện 2 vấn đề blocking mà Architect bỏ sót |
| Antigravity (Architect role) | Đánh giá Builder review, quyết định re-search strategy (URL-only), viết builder prompt | Prompt chi tiết giúp Builder implement chính xác |

### Học được
- **Multi-agent workflow hiệu quả**: Dùng AI với vai trò Architect (thiết kế) → Builder (phản biện + implement) tạo ra kết quả tốt hơn single-agent. Builder AI phát hiện SSE fake events bug mà Architect bỏ sót.
- **2 phases > 3 phases**: Không phải cứ nhiều điểm kiểm soát là tốt hơn. 80% user không cần sửa keywords → dừng giữa chừng = friction vô ích. Design for the majority.
- **Chỉ lưu URL, download khi cần**: Tránh download sớm tiết kiệm bandwidth và disk. Frontend preview trực tiếp từ CDN — leverage infrastructure sẵn có.
- **Scene model validation**: Validate input qua Pydantic model trước khi lưu DB ngăn chặn corrupt data → render crash.

### Nếu làm lại, sẽ làm khác
- Pipeline 2 Phases nên được thiết kế từ đầu (Day 1-2) thay vì retrofit sau khi API routes đã viết xong. Phải sửa lại `_run_pipeline_background()` thay vì viết mới.
- Nên có test file cho từng endpoint mới ngay khi implement, không để sau.

### Kế hoạch tuần tới
- Build frontend React theo phased approach: LoginPage → CreatePage → ReviewView → DashboardPage
- Test từng phase với backend thật trước khi build phase tiếp
- Deploy Railway MVP khi tất cả flow hoạt động end-to-end

---

## Tuần 3 — 20/04/2026

**Thành viên:** Nguyễn Đức Duy, Trần Trọng Giang, Trần Quốc Việt

### Đã làm
- **3 New Scene Types Integration**: Hoàn thành `comparison`, `timeline`, `media_showcase` với global caption overlay. Update Zod schema và Pydantic models bám sát JSON contract.
- **Splitter/Director Refactoring**: Extract logic map scene_type từ Splitter sang Director, giảm overload Splitter rules (13 -> 7) giải quyết triệt để lỗi "empty narration".
- **LLM Cost Optimization**: Tắt VLM reranking tiết kiệm 6 LLM calls/run. Bỏ qua media search cho non-stock scenes tiết kiệm 50% API Pexels calls và disk bandwidth.
- **E2E Pipeline Stabilization**: Fix hàng loạt lỗi blocking production — Vite base path `/web/`, static mount `web/dist/`, ReviewView crash (React hooks violation), favicon 404, authenticated video playback (fetch+Blob pattern).
- **Custom Media Upload**: Endpoint `POST /upload-media` (50MB video, 5MB ảnh) + drag-drop zone UI + toggle upload button. Dual URL strategy: local path cho Remotion staging, serve URL cho browser preview.
- **Review Page Bugfixes**
- Refactored Splitter/Director pipeline: tách scene_type assignment từ Splitter sang Director
- E2E pipeline stabilization: fix Vite base path, static mount, ReviewView crash, audio sync
- Custom media upload: drag-drop zone, upload endpoint, dual URL strategy (local + serve)
- Review UI bugfixes: PATCH merge, cinema/fullscreen preview, render validation
- **Fix Bug 1 — Render Sync**: Scene edits (type, media) không vào output → root cause: SQLAlchemy JSON shallow copy. Fix: deep-copy scenes list + `flag_modified`
- **Fix Bug 2 — Video Jitter**: Output bị giật → root cause: Remotion multi-threaded render. Fix: `--concurrency=1` + `<OffthreadVideo>`
- **Diagnostic Pipeline**: Thêm 3 checkpoint logs (PATCH COMMIT, RENDER READ, STAGED JSON) để trace data flow

### Khó nhất tuần này
- **Splitter Overload**: Ban đầu Splitter kiêm cả việc assign scene_type với 13 rules dẫn đến bị fail "empty narration" thường xuyên vì quá tải (LLM output thiếu). Giải pháp là refactor: Splitter chỉ split + purpose (7 rules), nhường toàn quyền scene_type cho Director.
- Dual URL pattern (`media_url` vs `_preview_url`) khó thiết kế — cần tách local path (cho Remotion staging) và serve URL (cho browser preview). Mất 1 ngày để thiết kế đúng.
- PATCH merge logic phải giữ nguyên `media_url` từ DB khi frontend strip nó. Logic `{**base, **patch}` phải cẩn thận với `None` values.

### AI tool đã dùng
| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Antigravity (Architect role) | Refactor Splitter/Director + phân tích thiết kế 3 scene types mới + phân tích LLM cost optimization | Giảm 50% LLM cost + BW, loại bỏ hoàn toàn lỗi Splitter fail, integrate 3 scene types (timeline, comparison, media_showcase) |

### Học được
- **LLM Cognitive Load**: Không nên nhồi nhét quá nhiều instruction vào 1 Agent (Splitter) dẫn đến lỗi bỏ sót dữ liệu. Việc chia responsibilities rõ ràng (Splitter: split/purpose, Director: type/layout) giúp pipeline ổn định 100%.
- **LLM Cost Optimization**: Tắt các LLM calls không mang lại nhiều value (như VLM reranking khi đã có human review) và early return cho các file media không cần thiết giúp giảm cost rât đáng kể mà chỉ tốn vài LOC.
- `media_url` cần 2 representations: local path cho backend processing, serve URL cho frontend display
- PATCH endpoint merge phải explicit về field ownership: client owns narration/type, server owns media paths
- **`dict()` là shallow copy** — KHÔNG đủ cho nested structures (list, dict). Dùng `copy.deepcopy()` hoặc reconstruct mới (`[dict(s) for s in list]`).
- **SQLAlchemy JSON columns** cần `MutableDict.as_mutable(JSON)` hoặc `flag_modified()` cho in-place mutations. Reassignment chỉ đủ khi old value THẬT SỰ khác new value (bao gồm nested objects).
- **Diagnostic logging > guessing**: Thêm 3 dòng log + chạy 1 lần → xác nhận root cause trong 5 phút. Thay vì guess + fix blind có thể mất hàng giờ.
- **Architect-Builder debate pattern** hiệu quả: 2 AI roles phản biện → loại bỏ hypothesis sai sớm → tiết kiệm thời gian fix.
- **Remotion `<OffthreadVideo>`** là must-have cho production: FFmpeg-based frame extraction chính xác hơn Chrome video seeking rất nhiều.

#### Nếu làm lại, sẽ làm khác
- Thêm diagnostic logs NGAY TỪ ĐẦU khi gặp bug khó — không nên guess root cause quá lâu.
- Dùng `copy.deepcopy()` hoặc `MutableDict` ngay khi thiết kế JSON column — đây là known pitfall của SQLAlchemy.
- Viết integration test: thay đổi scene → render → verify output matches. Sẽ catch bug này ngay lập tức.

#### Kế hoạch tuần tới
- Dọn diagnostic logs (đổi `info` → `debug`)
- Xem xét migrate `Column(JSON)` → `MutableDict.as_mutable(JSON)` cho phòng ngừa
- Production testing toàn bộ pipeline end-to-end

---

## Tuần 4 — 27/04/2026

**Thành viên:** Nguyễn Đức Duy, Trần Trọng Giang, Trần Quốc Việt

### Đã làm
- **Director Simplification**: Rút gọn Director prompt từ ~80 → ~25 dòng. Bỏ layout rules khỏi LLM (LLM không nên quyết định layout khi chưa có data).
- **Data-driven Auto-Layout**: Thêm hàm `_auto_layout()` post-Enricher trong `content_parser.py`. Layout giờ dựa trên data thực (số card_items, stats) thay vì random.
- **Subtitle Text Fidelity Fix**: Phát hiện subtitle hiển thị TTS-processed text ("A.I.", "một trăm") thay vì text gốc user ("AI", "100"). Fix: đổi Whisper alignment input từ `processed_full` → `full_narration` + đổi `processed_word_counts` → `original_word_counts` cho scene timing.
- **Round 2 Bug Fixes** (3 bugs từ Architect review):
  - (Critical) Layout stale khi đổi scene_type qua PATCH → gọi `_auto_layout()` trong PATCH handler
  - (High) Scene conclude 65 words tràn viewport → thêm word limit rule (15-40 words) + adaptive font-size (>200 chars → 38px)
  - (Medium) Whisper collapsed timestamps (8 words flash 1 frame) → `_fix_collapsed_timestamps()` 2-phase redistribute

### Khó nhất tuần này
- **Subtitle text fidelity**: Builder AI đề xuất solution phức tạp (~100 dòng mapping code). Architect phản biện chỉ cần đổi 1 dòng `original_text=full_narration`. Sau khi test verify → fix 1 dòng đúng cho 90% cases. Nhưng phát sinh bug phụ: scene timing lệch vì `processed_word_counts` không match `original_word_counts` — cần fix bổ sung.
- **Bài học over-engineering**: Xu hướng tự nhiên là nghĩ ra solution phức tạp "đầy đủ" thay vì thử cách đơn giản nhất trước. Architect-Builder debate pattern giúp counter bias này.

### AI tool đã dùng
| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Antigravity (Builder role) | Trace root cause subtitle bug qua 5 files, đề xuất mapping solution | Xác định chính xác root cause, nhưng solution quá phức tạp |
| Antigravity (Architect role) | Phản biện Builder plan, đề xuất fix 1 dòng, review Round 2 bugs | Giảm effort từ ~100 LOC → 1 LOC cho subtitle fix |
| Antigravity (Builder role) | Implement 3 Round 2 fixes, unit test collapsed timestamps | 3 fixes pass, unit test verify redistribute logic |

### Học được
- **Thử giải pháp đơn giản nhất trước** (YAGNI): Architect đề xuất 1 dòng fix thay vì 100 dòng mapping. Test verify → đủ tốt cho 90% cases. Chỉ implement complex solution khi simple fails.
- **Architect-Builder debate pattern ngày càng hiệu quả**: Round 1 (shallow copy bug) → Round 2 (subtitle + 3 bugs) → mỗi round nhanh hơn, chất lượng phản biện tốt hơn.
- **Defense-in-depth cho LLM output**: LLM word limit prompt rule (primary) + adaptive font-size (frontend safety net). Không tin LLM 100% → luôn có fallback.
- **2-phase algorithm > iterate-and-mutate**: Khi cần detect + fix data trong list, tách detect phase (readonly) và fix phase (mutate) tránh bug iterate-while-mutating.
- **Khi fix 1 thứ, kiểm tra downstream**: Fix `word_timestamps` dùng original text → phải fix `scene_word_counts` theo → phải fix `estimation_fallback` theo. Mỗi thay đổi có cascade effect.

#### Nếu làm lại, sẽ làm khác
- Viết test case cho subtitle text ĐẦU TIÊN (expected: "AI" not "A.I.") trước khi implement fix → TDD mindset.
- Gửi plan cho Architect review TRƯỚC khi implement, tiết kiệm effort refactor.

#### Kế hoạch tuần tới

