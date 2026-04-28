# 🎬 AutoClip — AI Video Generation Pipeline (Tập trung chuyển đổi Content thành Video Ngắn)

---

## 1. Problem Statement & Solution (Tổng quan)

### 1.1 Bối cảnh & Vấn đề

Sản xuất video về kiến thức, hướng dẫn, tin tức tốn rất nhiều thời gian, công sức và là một quy trình lặp đi lặp lại. Những video dạng này thường không cần quá phức tạp về hình ảnh, chủ yếu là truyền tải nội dung chính xác. Những AI gen video hiện tại có thể tạo những video rất đẹp mắt lại không phù hợp với video dạng này và thường tốn nhiều chi phí.

Một hệ thống tự động tạo video có thể giúp doanh nghiệp tạo ra những video hướng dẫn hoặc đưa tin nội bộ nhanh chóng. Bên cạnh đó, content creator cũng có thể sử dụng để tạo ra những video kiến thức hữu ích giúp giữ chân và duy trì tương tác với followers. Thậm chí, những nội dung kiến thức thú vị vẫn có thể trở nên hấp dẫn và thu hút followers.
*(Ví dụ thực tế kênh thành công: https://www.tiktok.com/@ainius.net)*

**Khó khăn thực tế tại Việt Nam đối với sản xuất Video Ngắn thủ công (Dưới 3 phút):**

| Giai đoạn sản xuất | Cấu trúc phương pháp thủ công | Thời gian ước tính |
|-----------|----------------------------------|--------------------|
| **Thu âm Voiceover** | Thu âm thủ công hoặc sử dụng các tool AI Audio (có tốn thời gian thao tác). | 15 - 30 phút |
| **Tìm hình ảnh/Footage** | Tìm stock từ Freepik/Pexels, lọc, tải và bóc tách bối cảnh. | 30 phút - 1 giờ |
| **Tạo sơ đồ, biểu đồ minh họa** | Tìm sơ đồ / biểu đồ mẫu hoặc tự vẽ bằng các công cụ. | 30 phút - 1 giờ |
| **Dựng & Biên tập (Editing)** | Đưa vào Premiere/CapCut, căn chỉnh timing vietsub, effect text, chèn ảnh thủ công. | 2 - 3 giờ |
| **Tổng cộng** | **Quy trình truyền thống thao tác tay** | **~3 - 5 tiếng** |

**Pain points cốt lõi:**
1. **Nút thắt mở rộng quy mô (Scaling Bottleneck):** Dù 3-5 tiếng cho 1 video không phải quá dài, nhưng để một cá nhân/team nhỏ sản xuất khối lượng lớn (30-50 video/tháng) sẽ tốn hàng trăm giờ thao tác lặp đi lặp lại rất nhàm chán. Thời gian đó có thể dùng để làm việc khác hoặc kiếm tiền (đây là chi phí cơ hội).
2. **Phân mảnh công cụ:** Phải Copy/Paste văn bản qua lại giữa nhiều tool như Text-to-Speech, CapCut, kho ảnh trên mạng ... tiêu tốn công sức chuyển đổi ngữ cảnh liên tục.

### 1.2 Giải pháp đề xuất (Solution)

Xây dựng **AutoClip** — một AI Pipeline tự động hóa khâu hậu kỳ (Post-production) cho **Video Ngắn dọc (9:16)**.
Người dùng chịu trách nhiệm chuẩn bị **Content cuối cùng (Final text)**. Hệ thống AutoClip tuyện đối **KHÔNG** tự ý sửa đổi, viết lại hay cắt xén nội dung của user. AI chỉ đảm nhận việc xử lý logic để biến đoạn đoạn text đó thành một video hoàn chỉnh. Những video dạng kiến thức, hướng dẫn và tin tức thường người dùng sẽ muốn có nội dung kiến thức chính xác, không bị thay đổi hoặc nếu họ cần gen cả nội dung thì có thể nhờ sự hỗ trợ của các công cụ LLM free như Gemini, ChatGPT.

Luồng xử lý tự động của hệ thống bao gồm:
1. **Phân tích Cấu trúc (Text Parser)**: AI (LLM) đọc content gốc để bóc tách thành các phân cảnh ngắn (scenes).
2. **Nhận diện Từ khóa & Hình ảnh**: LLM rà soát văn bản để tìm ra từ khóa quan trọng cần trích xuất (làm hiệu ứng vietsub) và tự động suy luận ra các câu lệnh (query) để tải hình ảnh stock tương ứng.
3. **Voiceover tự động**: Đẩy toàn bộ văn bản gốc vào Engine Text-to-Speech Tiếng Việt tự nhiên.
4. **Text Animation đồng bộ**: Đồng bộ text hiển thị màn hình ráp với âm thanh đọc (Karaoke mode), highlight các từ đã bóc tách.
5. **Dựng render tốc độ cao**: Assembly bằng **Remotion** (React/TypeScript) thành MP4. Layout thiết kế dọc, blur background chuẩn mực, TikTok-style caption animation.

**Kết quả kì vọng:** 1 video dọc ngắn hoàn chỉnh dựa trên nội dung có sẵn xuất bản trong **dưới 3 phút** với cost xử lý tự động **< 5,000 VNĐ/video** (OpenAI/Gemini) hoặc **< 10,000 VNĐ/video** (ElevenLabs Premium).

---

## 2. AI Product Canvas

| Yếu tố (Element) | Nội dung mô tả (Description) |
| :--- | :--- |
| **Value (Giá trị)** | **Người dùng:** Đóng gói hóa tài sản (content) thành Video trong nháy mắt. Rút ngắn thời gian thao tác từ 4 tiếng xuống 3 phút. Tiết kiệm 99% chi phí hậu kỳ để có thể scale up hàng chục kênh vệ tinh.<br>**Doanh nghiệp:** Chuyển hóa toàn bộ quy trình quy chuẩn/bản tin dạng text thành video nội bộ cực kỳ dễ thẩm thấu. |
| **Trust (Niềm tin)** | **Tôn trọng tác giả:** Không thay đổi nội dung gốc, máy chỉ làm công việc "công nhân" đóng gói video. Các bước có Process Bar minh bạch. Hình ảnh public không lo bản quyền. |
| **Feasibility (Tính khả thi)** | Hoàn toàn tách bạch bước "Sáng tạo nội dung" ra khỏi AI. Tập trung sức mạnh máy vào việc phân rã văn bản thành biểu đồ JSON và render video bằng Remotion (React) trên CPU. Không phụ thuộc GPU đắt đỏ. |
* **Learning Signal (Tín hiệu Model)**  Feedback của user về chất lượng video. 

* **Mô hình tương tác:** **Utility Pipeline** – User nhập "Final Content" → Máy cấu trúc hóa → Phân bố hình & âm → Render MP4.

---

## 3. Phạm vi sản phẩm (Scope)

### 3.1 Trong phạm vi (In Scope) - Focus (MVP Release)
| # | Tính năng (Feature) | Mô tả chi tiết | Ưu tiên |
|---|---------------------|----------------|---------|
| F1 | Text Parser & Structuring | Phân tích bài văn gốc thành các scenes chuẩn cho video dọc. Chỉ bóc tách, không thêm bớt nội dung. | P0 |
| F2 | Vietnamese TTS Sync | Chuyển đổi văn bản thành giọng Tiếng Việt | P0 |
| F3 | Dynamic Captions | Phụ đề động cho phép làm nổi bật keyword (TikTok-style với Remotion `@remotion/captions`) | P0 |
| F4 | Stock Image Sourcing | Tự động sinh câu lệnh tiếng Anh vào Pexels để tải ảnh lót theo từng phân cảnh. | P0 |
| F5 | Vertical Render Engine | Remotion render 1080x1920 MP4, frame rate 30fps. Background tự làm mờ với CSS `backdrop-filter`. | P0 |
| F6 | Asset Substitution | Bảng Review cho phép User đổi query ảnh khác nếu không hài lòng với ảnh AI tìm. | P1 |

### 3.2 Ngoài phạm vi (Out of Scope)
- **Tạo lại nội dung (AI Content Generation):** Hệ thống không sửa chính tả, không rút gọn, không thêm mắm dặm muối. Input sao Output đọc y vậy.
- **Tạo Footage bằng Diffusion AI (Sora, SD Video):** Không sinh hình/video bằng AI do cost cao và rủi ro hình ảnh méo mó. Chỉ dùng kho stock thật (Pexels, Unsplash).
- **Advanced Editing Transitions:** Bỏ qua các transition xoay vòng 3D, hiệu ứng ánh sáng CapCut. Video theo chuẩn tối giản tập trung text và hình.
- **AI-generated Video via Kie.ai:** Không dùng các API AI video gen (Veo, Kling) do chi phí rất cao và output không deterministic, vi phạm nguyên tắc Content Integrity.

---

## 4. User Stories (4 Cấp Độ Input)

| Cấp độ | Kịch bản ví dụ & Khắc phục |
| :--- | :--- |
| **1. Happy Path**<br>*(Khách hàng cung cấp Content chuẩn)* | **User Input:** Đưa đoạn văn bản 300 từ về "Mẹo tâm lý bán hàng".<br>**AutoClip AI:** Phân tích đoạn text thành 5 cảnh. Lên Pexels lấy hình "cửa hàng, khách, mua sắm". Render text khớp với Voiceover. File MP4 trả về mất tròn 1 phút render. |
| **2. Low-confidence**<br>*(Văn bản gốc không định dạng)* | **User Input:** Nhập một đoạn Text dày đặc không có ngắt dòng hay dấu chấm câu.<br>**AutoClip AI:** LLM sẽ chỉ chèn thêm các dấu câu (chấm/phẩy) ẩn/metadata để hệ thống Voiceover biết ngắt nghỉ, ngoài ra đoạn code vẫn mapping chặt chẽ với từ gốc để show vietsub, không thay đổi từ vựng. |
| **3. Failure Mode**<br>*(Văn bản vượt quá thời lượng)* | **User Input:** Bỏ nguyên 1 bài báo 3000 từ vào tool dành cho Short Video.<br>**AutoClip AI:** Thông báo lỗi Input Validation: "Nội dung cung cấp dài hơn mức cho phép của một video ngắn (Ước tính > 3 phút). Hệ thống AutoClip không cắt xén nội dung của bạn. Vui lòng tự tóm tắt văn bản và đưa lại đoạn trích dưới 500 từ." |
| **4. Correction Mode**<br>*(Đổi Assets hình ảnh)* | **Trigger:** Pipeline sinh ảnh "Siêu thị" nhưng User thấy ảnh báo xám xịt không ưng.<br>**AutoClip AI:** Ở giao diện Review, User bấm Edit Image Query thành "Modern bright mall", Graph sẽ fetch lại ảnh tĩnh mới và bypass ngay lập tức tới khâu Compile Video để render cục bộ đoạn bị lệch. |

---

## 5. Evaluation Metrics (Đo lường & Thông số)

| Metric (Chỉ số) | Định nghĩa & Ý nghĩa | Ngưỡng (Threshold) |
| :--- | :--- | :--- |
| **Cost Efficiency** | Chi phí API/Token cho mỗi video 1 phút. Càng thấp càng scale mượt. | **≤ 5,000 VNĐ / clip** |
| **Time to Video** | Tính từ lúc ấn "Bắt đầu" tới lúc file MP4 sẵn sàng tải về. | **≤ 3 phút** |
| **Content Integrity** | Mức độ trung thành của text hiển thị & Audio so với text gốc do người dùng nạp vào. | **Tỉ lệ khớp 100%** |
| **Audio-Subtitle Sync** | Tỉ lệ bị trễ/lệch timestamp phụ đề. Lệch có thể do ngắt âm sai. | Không quá **0.3s** |

> 🚨 **Red Flags:**
> 1. Video render ra có chữ bị đọc sai nhịp (Word-level mapping lỗi) > 5% → Trải nghiệm xem sẽ cực kì tệ.
> 2. Pexels rate limit (giới hạn 200 tấm) đạt đỉnh nhanh -> Hình nền đen/fallback xuất hiện liên tục.

---

## 6. Top 4 Failure Modes (Rủi ro & Mitigation)

| Tên lỗi | Trigger (Nguyên nhân khởi phát) | Hậu quả tác động | Mitigation (Cách phòng vệ) |
|---------|--------------------------------|------------------|---------------------------|
| **1. Hallucinated Keyword (Sai Hình)** | Mặc dù text có sẵn, AI bóc keyword quá tối nghĩa (VD: Văn bản nói "Gấu Nga ăn đòn", AI lấy hình con Gấu Grizzly). | Hình không miêu tả đúng ẩn dụ của nội dung. | Ép prompt LLM tập trung vào hành động cốt lõi. Cung cấp tính năng Image Query Replacement cho user. |
| **2. Text Cut-off (Chữ Tràn Màn Hình)** | User viết các câu quá dài không ngắt, trình Renderer không biết trượt chữ xuống sao cho vừa. | Chữ tràn nát thiết kế màn hình dọc. | Lập trình Engine Text Auto-Wrap (CSS Flex/Wrap) ép block tối đa 5-7 từ hiển thị 1 lúc giữa màn. |
| **3. Non-latin Characters (Lỗi Font)** | Content user cố tình chèn emojis, các kí tự đặc biệt tiếng Trung/Hàn/Nhật. | Render ra "ô vuông đen" hoặc Crash Python Lib. | Regex Pre-filter xóa hết emoji không được support. Chỉ hỗ trợ font bảng mã Tiếng Việt Noto Sans. |
| **4. External Timeout** | Edge-TTS hoặc Pexels bị kẹt mạng ngắt kết nối. | Job fail giữa chừng. | Đứt đoạn nào bọc khối Try Catch và Exponential Retry đoạn đó. |

---

## 7. ROI Estimation (Kịch Bản Ước Tính Giá Trị)

Thay vì cắt hoàn toàn khâu sản xuất content (do user vẫn phải tự chuẩn bị), hệ thống tối ưu hóa khâu lao động tay chân (Dựng, Lồng Tiếng, Subtitles).
- **Conservative (Tối thiểu - Kênh nội bộ):** Mỗi công ty 1 tháng cần làm 20 video dạng thông báo, truyền thông chính sách 1 phút. Dùng Tool tiết kiệm ~10 triệu VNĐ/tháng tiền thuê Editor part-time. Thời gian chờ sản phẩm giảm từ 4 tiếng xuống 3 phút.
- **Realistic (Thực tế - Creator/Affiliate):** Nhà sáng tạo nội dung Tiktok dùng tool để lên hàng loạt clip tổng hợp, kể chuyện ma, đọc sách. Quỹ thời gian được giải phóng cho việc Edit (chán nản) để chuyển qua Tập trung sáng tạo text content → Tần suất đăng video gấp 10 lần.
- **Optimistic (Lạc quan - Software as a Service):** Thương mại hóa Tool. Thu mức phí siêu rẻ 2,500đ / Video (với cost 500đ lót đáy). Cung cấp giải pháp cho Network Agency buff traffic. Lợi nhuận định kì ổn định, không bảo trì con người tốn kém.

---

## 8. Kiến trúc tổng thể & Pipeline Flow (Mini Tech Spec)

### 8.1 Base Tech Stack
1. **Core Orchestrator:** `LangGraph` + `Python` — State machine có sẵn checkpointing (resume khi crash), retry per-node, parallel fan-out, và human-in-the-loop. Thiết kế theo hướng graph giúp việc thêm tính năng mới sau này chỉ cần thêm node + nối edge mà không phải refactor lại pipeline.
2. **LLM Engine (Text Parser):** `Google Gemini 2.5 Flash hoặc GPT-4o-mini`.
3. **Voice Engine (4 TTS Engines):**
   - `OpenAI gpt-4o-mini-tts` (Primary) — Chất lượng cao, code-switching Việt-Anh tự nhiên. ~380 VNĐ/video.
   - `ElevenLabs v3 / Flash v2.5` (Premium) — Native word timestamps (skip Whisper), voice clone, 10 giọng Việt. ~880 VNĐ/video.
   - `Gemini 3.1 Flash TTS` (Standard) — LLM-powered, code-switching xuất sắc, 30 giọng. ~765 VNĐ/video. PCM→WAV→MP3.
   - `Edge-TTS` (Fallback) — Free hoàn toàn, hỗ trợ sẵn **WordBoundary events**.
   - **Smart Whisper Skip:** Khi engine trả về `word_boundaries` (ElevenLabs), orchestrator bỏ qua Whisper alignment → tiết kiệm 3-5s/video.
   - **Audio Duration:** Đo chính xác bằng `mutagen` (thay thế byte-estimate cũ).
4. **Media Engine (Rendering):** `Remotion` (React/TypeScript) — Framework programmatic video, render bằng headless Chromium + FFmpeg. Hỗ trợ `@remotion/captions` cho TikTok-style animations, CSS layouts cho mọi template, real-time preview khi develop. Python gọi qua CLI `npx remotion render`.
5. **API Layer:** `FastAPI` (Xử lý Endpoints gọi Job).

### 8.2 Graph Workflow Diagram

```text
       [USER Gửi Toàn Bộ Văn Bản Bài Đăng Chốt Cuối]
                            │
                            ▼
              ┌───────────────────────────┐
              │ 1. Content_Parser_Node    │ <--- Gemini/GPT-4o-mini
              └─────────────┬─────────────┘
                            │
               ┌────────────┴─────────────┐ (Parallel Tasks)
               ▼                          ▼
   ┌────────────────────┐       ┌────────────────────┐
   │  2A. Audio_Node    │       │ 2B. Asset_Node     │
   │  (4 TTS engines:   │       │ (Pexels lấy hình,  │
   │  OpenAI/ElevenLabs/ │       │ Resize theo 9:16)  │
   │  Gemini/Edge-TTS)   │       └────┬─────┘
   │  + Smart Whisper    │            │
   │    Skip            │            │
   └───┬────┘│            │
        │     │            │
        └─────┼──────┬─────┘
              ▼
    ┌─────────────────────┐
    │ 3. Scene Preview     │ ← ⏸️ PAUSE: Gửi preview cho user
    │    (Interrupt)       │   User xem ảnh + layout từng cảnh
    │                      │   User có thể đổi image query
    │                      │   User bấm Confirm → tiếp tục
    └─────────┬───────────┘───────┐
              │ 4. Video_Renderer_Node    │ <--- Remotion render MP4
              └─────────────┬─────────────┘
                            │
                            ▼
                 [ Output: File MP4 ]
```

### 8.3 JSON Contract Example (Giao Tiếp Giữa Các Các Node)
Node AI chỉ làm nhiệm vụ ngắt cái Text cục súc dài nhằng của User thành mảng có cấu trúc, kèm theo Keyword Image để hệ thống Node sau tiếp nhận làm toán cho dễ:
```json
{
  "total_scenes": 2,
  "scenes": [
    {
      "scene_id": 1,
      "exact_narration": "Ngày xưa có một người đi tìm vàng ở tận chân núi mây.",
      "visual_captions": ["Ngày xưa có một người", "đi tìm vàng", "ở tận chân núi mây."],
      "highlight_words": ["vàng", "chân núi"],
      "image_search_query": "gold seeker mountain clouds"
    },
    {
      "scene_id": 2,
      "exact_narration": "Nhưng cuối cùng cái anh ta tìm được lại là công cụ đào vàng.",
      "visual_captions": ["Nhưng cuối cùng", "cái anh ta tìm được", "lại là công cụ đào vàng."],
      "highlight_words": ["công cụ đào vàng"],
      "image_search_query": "mining tools pickaxe"
    }
  ]
}
```

---
