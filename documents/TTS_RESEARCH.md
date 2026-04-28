# 🔊 AutoClip — TTS Engine Research: Giọng Việt-Anh Code-Switch Tự Nhiên

**Ngày nghiên cứu:** 2026-04-12  
**Người thực hiện:** AI Research Assistant  
**Mục tiêu:** Tìm TTS engine tối ưu cho AutoClip — giọng đọc thống nhất, đọc mượt cả tiếng Việt và thuật ngữ tiếng Anh xen kẽ trong cùng câu mà KHÔNG cần tách text/ghép audio (Dual-Voice đã bị loại).
 
---

## Mục lục

- [1. Bảng so sánh tổng quan](#1-bảng-so-sánh-tổng-quan)
- [2. Phân tích chi tiết từng engine](#2-phân-tích-chi-tiết-từng-engine)
- [3. Đánh giá khả năng Code-Switch Việt-Anh](#3-đánh-giá-khả-năng-code-switch-việt-anh)
- [4. Tính chi phí cụ thể VNĐ/video 1 phút](#4-tính-chi-phí-cụ-thể-vnđvideo-1-phút)
- [5. Khuyến nghị xếp hạng](#5-khuyến-nghị-xếp-hạng)

---

## 1. Bảng so sánh tổng quan

### Giả định tính toán
- **1 video 1 phút** ≈ 300 từ tiếng Việt ≈ ~1,500 ký tự (characters)
- **Tỷ giá:** 1 USD = 25,500 VNĐ (tham khảo tháng 4/2026)

| # | Engine | Giọng Việt + Code-Switch Anh | Chi phí / 1 phút | Word Timestamps | Tốc độ sinh audio | Tích hợp kỹ thuật | Độ ổn định |
|---|--------|-------------------------------|-------------------|-----------------|--------------------|--------------------|------------|
| 1 | **OpenAI gpt-4o-mini-tts** | ⭐⭐⭐⭐⭐ Rất tốt — 1 giọng auto code-switch | ~380 VNĐ ($0.015/min) | ❌ Không có — cần Whisper alignment | ⚡ <3s streaming | REST API, Python SDK | ✅ Official API |
| 2 | **Murf AI** | ⭐⭐⭐⭐⭐ Multi-native voices, code-mixed output | ~765 VNĐ ($0.03/min ước tính) | ✅ Có — word-level timestamps API | ⚡ <5s real-time | REST API | ✅ Official API |
| 3 | **ElevenLabs (Eleven v3)** | ⭐⭐⭐⭐ Tốt — nhưng fixed language per request | ~880-4,500 VNĐ (tùy plan) | ✅ Có — TTS with Timestamps endpoint | ⚡ <3s streaming | REST API, Python SDK | ✅ Official API |
| 4 | **Azure Speech SDK** | ⭐⭐⭐ Khá — vi-VN voices đọc Anh tệ, Multilingual ❌ không hỗ trợ Vietnamese | ~560 VNĐ ($0.022/1K chars × 1.5K) | ✅ Có — WordBoundary events native | ⚡ <3s streaming | Python SDK, SSML | ✅ Official API |
| 5 | **Google Cloud TTS (Neural2)** | ⭐⭐⭐ Khá — vi-VN voices, code-switch hạn chế | ~612 VNĐ ($0.016/1K chars × 1.5K) | ⚠️ Chỉ qua SSML `<mark>` tags — phức tạp | ⚡ <5s | REST API, Python SDK | ✅ Official API |
| 6 | **Edge-TTS** | ⭐⭐ Tệ — đọc tiếng Anh thành "cờ-lao-đờ" | 0 VNĐ (FREE) | ✅ Có — WordBoundary events native | ⚡ <3s streaming | Python (async) | ⚠️ Unofficial API |
| 7 | **Fish Speech (S2 Pro)** | ⭐⭐⭐⭐ Tốt — multilingual architecture, code-switch tự nhiên | ~380 VNĐ (self-host) hoặc API ~$15/1M bytes | ⚠️ Không có từ TTS — cần Whisper | ⚡ 100ms TTFA (GPU) | Python, self-host hoặc API | ⚠️ License phức tạp |
| 8 | **FPT.AI TTS** | ⭐⭐⭐ Khá — giọng Việt tốt, tiếng Anh kém | ~100-330 VNĐ (tùy plan) | ❌ Không có — cần Whisper | 🐢 Chậm (async queue) | REST API | ✅ Official API |
| 9 | **VBEE** | ⭐⭐⭐ Khá — giọng Việt chuyên sâu, Anh chưa rõ | ~250-500 VNĐ (tùy plan) | ⚠️ Không rõ — cần xác nhận | Trung bình | REST API | ✅ Official API |
| 10 | **Zalo AI TTS** | ⭐⭐⭐ Khá — giọng Việt tốt, không multilingual | Không công khai | ❌ Không rõ | Trung bình | REST API | ✅ Official API |
| 11 | **Kokoro** | ❌ Không hỗ trợ Vietnamese | N/A | N/A | N/A | N/A | N/A |
| 12 | **Narakeet** | ⭐⭐⭐ Khá — hỗ trợ cả Việt và Anh | ~2,550-5,100 VNĐ ($0.10-0.20/min) | ❌ Không có | Trung bình | REST API, CLI | ✅ Official API |

---

## 2. Phân tích chi tiết từng engine

### 2.1. OpenAI gpt-4o-mini-tts ⭐ TOP PICK

| Thuộc tính | Chi tiết |
|-----------|---------|
| **Provider** | OpenAI |
| **Model** | `gpt-4o-mini-tts` (mới nhất), `tts-1`, `tts-1-hd` |
| **Giọng Việt** | ✅ Hỗ trợ Vietnamese trong 50+ ngôn ngữ |
| **Code-Switch** | ✅ Tự động handle mixed-language text trong 1 request. Model LLM-based nên hiểu ngữ cảnh |
| **Steerability** | ✅ Có thể prompt hướng dẫn giọng (tone, emotion, pacing) |
| **Word Timestamps** | ❌ KHÔNG có native — phải dùng Whisper forced alignment |
| **Voices** | Alloy, Ash, Coral, Echo, Fable, Nova, Onyx, Sage, Shimmer |
| **API** | REST `/v1/audio/speech`, Python SDK chính thức |
| **Streaming** | ✅ Có — output streaming PCM/MP3 |
| **Free tier** | Không (pay-per-use) |

**Pricing:**

| Model | Giá | Chi phí ~1 phút audio |
|-------|-----|----------------------|
| `gpt-4o-mini-tts` | ~$0.015/phút audio | ~380 VNĐ |
| `tts-1` | $15/1M chars → ~$0.0225 cho 1,500 chars | ~574 VNĐ |
| `tts-1-hd` | $30/1M chars → ~$0.045 cho 1,500 chars | ~1,148 VNĐ |

**Ưu điểm:**
- 🏆 **Code-switch tốt nhất** — Vì là LLM-based TTS, model hiểu ngữ cảnh và tự switch ngôn ngữ
- Chi phí cực thấp (~380 VNĐ/phút với gpt-4o-mini-tts)
- Có thể prompt giọng đọc: "Đọc với giọng tự tin, chuyên nghiệp, phát âm tiếng Anh rõ ràng"
- API ổn định, official

**Nhược điểm:**
- ❌ **Không có word-level timestamps** — phải chạy thêm Whisper alignment (thêm latency ~10-30s + dependency)
- Có report về instability khi audio dài (silence gaps, volume fluctuations)
- Cần chunk text thành đoạn ngắn (<1-2 phút) để ổn định

---

### 2.2. Murf AI ⭐ TOP PICK

| Thuộc tính | Chi tiết |
|-----------|---------|
| **Provider** | Murf AI |
| **Model** | Studio-Quality TTS, Falcon (conversational) |
| **Giọng Việt** | ✅ Hỗ trợ Vietnamese trong 35+ ngôn ngữ |
| **Code-Switch** | ✅ **Multi-native voices** — 1 giọng nói nhiều ngôn ngữ, giữ identity. Code-mixed output không méo |
| **Word Timestamps** | ✅ **Có native** — API trả về timestamp từng từ |
| **API** | REST API |
| **Free tier** | ~$10/tháng credit cho testing (~100K chars) |

**Pricing:**

| Loại | Giá | Chi phí ~1 phút audio (~1,500 chars) |
|------|-----|-------------------------------------|
| Studio-Quality TTS | $0.03/1K chars | ~$0.045 → ~1,148 VNĐ |
| Falcon (Conversational) | $0.01/1K chars | ~$0.015 → ~383 VNĐ |

**Ưu điểm:**
- 🏆 **Code-switch xuất sắc** — Multi-native voices chuyên thiết kế cho mixed-language
- ✅ **Word timestamps có sẵn** — không cần Whisper
- Falcon tier rẻ (~383 VNĐ/phút)
- API chuyên nghiệp, production-ready

**Nhược điểm:**
- ⚠️ Chất lượng giọng Việt cần test thực tế — Murf nổi tiếng với English voices, Vietnamese là ngôn ngữ phụ
- API documentation cho Vietnamese ít ví dụ
- Ít phổ biến trong cộng đồng Việt Nam

---

### 2.3. ElevenLabs (Eleven v3 / Flash v2.5)

| Thuộc tính | Chi tiết |
|-----------|---------|
| **Provider** | ElevenLabs |
| **Models** | Eleven v3 (70+ ngôn ngữ), Flash v2.5 (32 ngôn ngữ) |
| **Giọng Việt** | ✅ Hỗ trợ Vietnamese |
| **Code-Switch** | ⚠️ **Fixed language per API call** — không tự switch giữa câu. Có thể bị "accent bleeding" |
| **Word Timestamps** | ✅ Có — endpoint `text-to-speech/{voice_id}/with-timestamps` |
| **Voices** | Hàng nghìn voices + voice cloning |
| **API** | REST API, Python SDK |
| **Streaming** | ✅ Có |
| **Free tier** | 10,000 chars/tháng (không commercial) |

**Pricing:**

| Plan | Chars/tháng | Giá | Chi phí ~1 phút audio |
|------|-------------|-----|----------------------|
| Free | 10K | $0 | ~6.5 videos rồi hết → ❌ |
| Starter | 30K | $5/tháng | ~$0.25/video → ~880 VNĐ (overage: $0.30/1K chars) |
| Creator | 100K | $22/tháng | Fixed cost per month |
| Pro | 500K | $99/tháng | Fixed cost per month |
| Scale (volume) | 2M | $330/tháng | Overage: $0.18/1K chars → ~$0.27/video → ~4,590 VNĐ |

**Ưu điểm:**
- Chất lượng audio cực cao (industry-leading cho English)
- Word timestamps có sẵn
- Voice cloning, nhiều giọng

**Nhược điểm:**
- ⚠️ **Code-switch kém** — Fixed language per request. Nếu set Vietnamese, tiếng Anh bị accent bleeding. Nếu set English, giọng Việt tệ
- Phải tách text → call API riêng từng ngôn ngữ → ghép audio (= Dual-Voice, đã bị loại)
- Chi phí cao nếu dùng overage
- Free tier quá ít cho production

---

### 2.4. Azure Speech SDK

| Thuộc tính | Chi tiết |
|-----------|---------|
| **Provider** | Microsoft Azure |
| **Voices Việt** | `vi-VN-HoaiMyNeural` (nữ), `vi-VN-NamMinhNeural` (nam) |
| **Multilingual voices** | ❌ **Vietnamese KHÔNG nằm trong danh sách Multilingual Neural voices** |
| **Code-Switch** | ❌ vi-VN voices đọc tiếng Anh bằng phonetic Việt. MultilingualNeural không support Vietnamese |
| **Word Timestamps** | ✅ `synthesisWordBoundary` events — native, chính xác. Đơn vị 100ns ticks |
| **SSML** | ✅ Hỗ trợ đầy đủ (khác với Edge-TTS) |
| **API** | Python SDK chính thức, REST API |
| **Free tier** | 500K chars/tháng (~333 videos) |

**Pricing:**

| Tier | Giá | Chi phí ~1 phút audio |
|------|-----|----------------------|
| Free (F0) | 500K chars/tháng | 0 VNĐ (giới hạn ~333 videos/tháng) |
| Standard (S0) | $22/1M chars (Neural HD) | ~$0.033 → ~842 VNĐ |
| Standard (S0) | $16/1M chars (Neural) | ~$0.024 → ~612 VNĐ |

**Ưu điểm:**
- ✅ **WordBoundary events xuất sắc** — tốt nhất trong tất cả engines
- ✅ Free tier rộng rãi (500K chars/tháng)
- ✅ SSML đầy đủ (có thể dùng `<voice>` tag switch giữa vi-VN và en-US)
- Python SDK official, production-grade
- Ổn định cao (Microsoft cloud)

**Nhược điểm:**
- 🚨 **Multilingual voice KHÔNG support Vietnamese** — phải dùng vi-VN dedicated voices → tiếng Anh đọc sai
- Nếu dùng SSML `<voice>` tag switch → về bản chất là Dual-Voice (đã bị loại)
- Overall: **Giải pháp single-voice code-switch không khả thi với Azure**

---

### 2.5. Google Cloud TTS (Neural2 / WaveNet)

| Thuộc tính | Chi tiết |
|-----------|---------|
| **Provider** | Google Cloud |
| **Voices Việt** | `vi-VN-Neural2-A`, `vi-VN-Neural2-D`, `vi-VN-Wavenet-*` |
| **Code-Switch** | ⚠️ Hạn chế — vi-VN voices đọc Anh theo phonetic Việt |
| **Word Timestamps** | ⚠️ Chỉ qua SSML `<mark>` tags — phải tự chèn tag thủ công, không tự động |
| **SSML** | ✅ Hỗ trợ (nhưng Chirp 3 HD thì không) |
| **API** | REST API, Python SDK (google-cloud-texttospeech) |
| **Free tier** | 4M chars WaveNet/tháng, 1M chars Neural2/tháng |

**Pricing:**

| Voice Type | Giá/1M chars | Chi phí ~1 phút audio |
|-----------|-------------|----------------------|
| Neural2 | $16 | ~$0.024 → ~612 VNĐ |
| WaveNet | $16 | ~$0.024 → ~612 VNĐ |
| Chirp 3 HD | $30 | ~$0.045 → ~1,148 VNĐ |

**Ưu điểm:**
- Free tier rất lớn (4M chars WaveNet = ~2,666 videos miễn phí!)
- Google cloud infrastructure ổn định
- Voices Việt khá tốt (Neural2)

**Nhược điểm:**
- ⚠️ Code-switch Anh kém (giống Azure)
- ⚠️ Word timestamps phức tạp — phải chèn `<mark>` tags vào SSML → không auto
- Chirp 3 HD tốt nhất nhưng không support SSML
- Overall: **Không giải quyết được bài toán code-switch**

---

### 2.6. Edge-TTS (Baseline hiện tại)

| Thuộc tính | Chi tiết |
|-----------|---------|
| **Provider** | Microsoft (unofficial reverse-engineer) |
| **Bản chất** | Reverse-engineer Microsoft Edge "Read Aloud" API |
| **Voices Việt** | `vi-VN-HoaiMyNeural`, `vi-VN-NamMinhNeural` |
| **Code-Switch** | ❌ **Rất tệ** — đọc "Claude" → "cờ-lao-đờ", "npm" → "nờ-pờ-mờ" |
| **Word Timestamps** | ✅ WordBoundary events — native, chính xác |
| **SSML** | ❌ Đã bị GỠ BỎ — Microsoft chặn custom SSML |
| **API** | Python async (pip install edge-tts) |
| **Free** | ✅ Hoàn toàn miễn phí |

**Chi phí:** 0 VNĐ

**Ưu điểm:**
- Miễn phí hoàn toàn
- WordBoundary events xuất sắc
- Async Python, dễ tích hợp
- Giọng Việt tự nhiên (cùng engine với Azure)

**Nhược điểm:**
- 🚨 **Code-switch Anh cực tệ** — tiêu chí #1 bị fail
- ⚠️ Unofficial API — có thể bị Microsoft chặn bất cứ lúc nào
- SSML đã bị gỡ — không thể dùng `<lang>` tag
- GPL-3.0 license — ràng buộc nếu thương mại hóa

---

### 2.7. Fish Speech (S2 Pro)

| Thuộc tính | Chi tiết |
|-----------|---------|
| **Provider** | Fish Audio (open-source) |
| **Model** | S2 Pro (March 2026), 80+ ngôn ngữ |
| **Giọng Việt** | ✅ Hỗ trợ, nhưng Vietnamese là Tier 2 (không phải ưu tiên cao nhất) |
| **Code-Switch** | ⭐⭐⭐⭐ Tốt — phoneme-free architecture, train trên multilingual data |
| **Word Timestamps** | ❌ Không có từ TTS output — cần Whisper |
| **Yêu cầu** | GPU (cần A10/A100 cho real-time inference) |
| **License** | ⚠️ Fish Audio Research License + CC-BY-NC-SA 4.0 cho một số versions |

**Pricing:**

| Phương thức | Giá | Chi phí ~1 phút audio |
|------------|-----|----------------------|
| Self-host (GPU) | Chi phí GPU (~$0.5-1/giờ) | ~$0.01 → ~255 VNĐ amortized |
| Fish Audio API | $15/1M UTF-8 bytes | ~$0.02 → ~510 VNĐ |
| API Free tier | 8,000 credits/tháng (~7 phút) | 0 VNĐ (7 videos) |

**Ưu điểm:**
- Architecture hiện đại (phoneme-free → code-switch tự nhiên)
- Inline tag control: `[whisper]`, `[professional tone]`
- Chi phí thấp nếu self-host

**Nhược điểm:**
- 🚨 **Cần GPU** — không phù hợp cho AutoClip target "chạy trên CPU"
- Vietnamese là Tier 2 → chất lượng chưa bằng English/Chinese
- Không có word timestamps → cần thêm Whisper
- License phức tạp — khó thương mại hóa

---

### 2.8. FPT.AI TTS

| Thuộc tính | Chi tiết |
|-----------|---------|
| **Provider** | FPT Corporation (Việt Nam) |
| **API** | TTS v5 (`api.fpt.ai/hmi/tts/v5`) |
| **Giọng Việt** | ✅ Rất tốt — chuyên sâu tiếng Việt, nhiều giọng vùng miền |
| **Code-Switch** | ⚠️ Kém — engine tối ưu cho tiếng Việt thuần, tiếng Anh đọc theo phonetic Việt |
| **Word Timestamps** | ❌ Không có — API chỉ trả link audio file |
| **API** | REST API, trả về URL download MP3/WAV |
| **Free tier** | 100K chars/tháng (low speed, queued) |

**Pricing:**

| Pack | Chars/tháng | Giá (VNĐ) | Chi phí ~1 phút audio |
|------|------------|-----------|----------------------|
| Free | 100K | 0 | 0 VNĐ (~66 videos, tốc độ chậm) |
| Premium 1 | 1.5M + 100K free | 500,000 | ~312 VNĐ/video (amortized) |
| Premium 2 | 4M + 100K free | 1,000,000 | ~244 VNĐ/video |
| Premium 3 | 10M + 100K free | 2,000,000 | ~198 VNĐ/video |
| Premium 4 | 27M + 100K free | 5,000,000 | ~184 VNĐ/video |

**Ưu điểm:**
- 🏆 **Giọng Việt tốt nhất** — engine Việt Nam, tối ưu cho tiếng Việt
- Chi phí rẻ (đặc biệt Premium packs)
- Free tier 100K chars (~66 videos/tháng)
- Provider Việt Nam → hỗ trợ VND payment

**Nhược điểm:**
- 🚨 **Code-switch Anh tệ** — engine không multilingual
- ❌ Không có word timestamps
- Free tier tốc độ chậm (queued requests)
- Không có streaming

---

### 2.9. VBEE

| Thuộc tính | Chi tiết |
|-----------|---------|
| **Provider** | VBEE (Việt Nam) |
| **Giọng Việt** | ✅ Rất tốt — chuyên Vietnamese, 700+ voices, Gen 2 voices |
| **Code-Switch** | ⚠️ Không rõ — thiếu thông tin về mixed-language handling |
| **Word Timestamps** | ⚠️ Không xác nhận — cần liên hệ support |
| **API** | REST API |

**Pricing:**

| Plan | Chars/tháng | Giá (USD) |
|------|------------|----------|
| Standard | 125K | ~$1-6/tháng |
| Special | 250K | ~$8/tháng |
| VIP | 500K | ~$12/tháng |

**Ưu điểm:**
- Giọng Việt chất lượng cao (Gen 2)
- Nhiều giọng vùng miền
- Giá rẻ

**Nhược điểm:**
- ⚠️ Thiếu documentation kỹ thuật chi tiết
- Code-switch và word timestamps không rõ ràng
- Ít phổ biến trong cộng đồng developer quốc tế

---

### 2.10. Zalo AI TTS

| Thuộc tính | Chi tiết |
|-----------|---------|
| **Provider** | Zalo (VNG Corporation, Việt Nam) |
| **Giọng Việt** | ✅ Tốt — Bắc/Nam, nam/nữ |
| **Code-Switch** | ❌ Không — engine chỉ Vietnamese |
| **Word Timestamps** | ❌ Không rõ |
| **Pricing** | Không công khai — cần đăng nhập developer portal |
| **API** | REST API (cần Zalo developer account) |

**Nhận xét:** Thiếu documentation công khai. Pricing và features không transparent. Khó đánh giá cho production use.

---

### 2.11. Kokoro

| Thuộc tính | Chi tiết |
|-----------|---------|
| **Model** | 82M parameters, Apache 2.0 |
| **Vietnamese** | ❌ **KHÔNG hỗ trợ** — thiếu Vietnamese training data |

**Kết luận:** Loại ngay — không phù hợp.

---

### 2.12. Narakeet

| Thuộc tính | Chi tiết |
|-----------|---------|
| **Provider** | Narakeet |
| **Giọng Việt** | ✅ Có |
| **Code-Switch** | ⭐⭐⭐ Khá — hỗ trợ cả Việt và Anh, nhưng cần test thực tế |
| **Word Timestamps** | ❌ Không có |
| **API** | Streaming API, JSON Polling API, CLI tool |
| **Pricing** | $0.05-0.20/phút tùy volume |

**Chi phí:** ~1,275-5,100 VNĐ/phút → **Quá đắt cho AutoClip.**

---

## 3. Đánh giá khả năng Code-Switch Việt-Anh

Đây là bảng đánh giá chi tiết nhất — tiêu chí số 1 của AutoClip.

**Câu test reference:**  
> *"Toàn bộ mã nguồn Claude Code nằm công khai trong npm package. Developer có thể xem source map trên GitHub."*

| Engine | Hành vi khi gặp "Claude Code" | Hành vi khi gặp "npm package" | Kết luận |
|--------|-------------------------------|-------------------------------|---------|
| **OpenAI gpt-4o-mini-tts** | Phát âm đúng /klɔːd koʊd/ — model LLM hiểu ngữ cảnh | Phát âm đúng /ɛnpiːɛm ˈpækɪdʒ/ | ✅ **Tốt nhất** — 1 giọng, tự switch, consistent |
| **Murf AI (Multi-native)** | Voice chuyên multi-native sẽ switch phonetic tự động | Switch phonetic tự động | ✅ **Rất tốt** — thiết kế cho use case này |
| **ElevenLabs** | Nếu set vi → accent bleeding /klao-dơ/. Nếu set en → giọng Anh đọc Việt tệ | Tương tự | ⚠️ **Không phù hợp** — phải Dual-Voice (loại) |
| **Azure (vi-VN voices)** | Đọc thành /cờ-lao-đờ cốt/ | Đọc thành /nờ-pờ-mờ/ | ❌ **Tệ** — giống Edge-TTS |
| **Azure (Multilingual)** | N/A — Vietnamese không support | N/A | ❌ **Không khả thi** |
| **Google Cloud (vi-VN)** | Đọc theo phonetic Việt | Đọc theo phonetic Việt | ❌ **Tệ** |
| **Edge-TTS** | /cờ-lao-đờ cốt/ | /nờ-pờ-mờ pác-kít/ | ❌ **Rất tệ** — đã xác nhận |
| **Fish Speech** | Phoneme-free → có khả năng handle | Tương tự | ⭐⭐⭐⭐ **Tốt** nhưng cần GPU |
| **FPT.AI** | Đọc theo phonetic Việt | Đọc theo phonetic Việt | ❌ **Tệ** |
| **VBEE** | Chưa test — khả năng cao theo phonetic Việt | Tương tự | ⚠️ **Không rõ** |
| **Zalo AI** | Đọc theo phonetic Việt | Đọc theo phonetic Việt | ❌ **Tệ** |

### Phân loại theo khả năng Code-Switch:

| Tier | Engines | Ghi chú |
|------|---------|---------|
| **Tier 1: Native Code-Switch** | OpenAI gpt-4o-mini-tts, Murf AI | 1 giọng tự switch, không cần xử lý đặc biệt |
| **Tier 2: Architectural Code-Switch** | Fish Speech | Cần GPU, self-host |
| **Tier 3: Workaround Required** | ElevenLabs | Phải Dual-Voice → loại |
| **Tier 4: Không thể Code-Switch** | Edge-TTS, Azure (vi-VN), Google Cloud, FPT.AI, VBEE, Zalo AI | Giọng Việt đọc Anh sai |

---

## 4. Tính chi phí cụ thể VNĐ/video 1 phút

> **Giả định:** 1 video 1 phút ≈ 300 từ ≈ 1,500 ký tự. Tỷ giá: 1 USD = 25,500 VNĐ.

| # | Engine | Chi phí / video 1 phút | Free tier (videos miễn phí/tháng) | Ghi chú |
|---|--------|------------------------|----------------------------------|---------|
| 1 | **Edge-TTS** | **0 VNĐ** | ♾️ Không giới hạn | Unofficial API |
| 2 | **FPT.AI** (Premium 3) | **~198 VNĐ** | 66 videos (100K free chars) | Giọng Việt only |
| 3 | **VBEE** (VIP) | **~250 VNĐ** | Ước tính ~333 videos ($12/tháng) | Cần xác nhận |
| 4 | **OpenAI gpt-4o-mini-tts** | **~380 VNĐ** | 0 (pay-per-use) | ⭐ CODE-SWITCH TỐT |
| 5 | **Murf AI** (Falcon) | **~383 VNĐ** | ~66 videos (free credit) | ⭐ CODE-SWITCH TỐT |
| 6 | **Fish Speech** (API) | **~510 VNĐ** | 7 videos (8K credits) | Cần GPU nếu self-host |
| 7 | **Azure** (Neural, S0) | **~612 VNĐ** | ~333 videos (500K free chars!) | ⚠️ Code-switch tệ |
| 8 | **Google Cloud** (Neural2) | **~612 VNĐ** | ~2,666 videos (4M free chars!) | ⚠️ Code-switch tệ |
| 9 | **ElevenLabs** (Starter) | **~880 VNĐ** | ~6 videos (10K free chars) | ⚠️ Code-switch tệ |
| 10 | **Murf AI** (Studio) | **~1,148 VNĐ** | ~66 videos (free credit) | Chất lượng cao hơn |
| 11 | **OpenAI tts-1-hd** | **~1,148 VNĐ** | 0 | Chất lượng cao hơn |
| 12 | **Narakeet** | **~2,550-5,100 VNĐ** | 0 | Quá đắt |

### So sánh với target AutoClip: ≤ 5,000 VNĐ/video

| Engine | Chi phí | Đạt target? | Code-switch? |
|--------|---------|-------------|--------------|
| Edge-TTS | 0 VNĐ | ✅ | ❌ |
| FPT.AI | 198 VNĐ | ✅ | ❌ |
| **OpenAI gpt-4o-mini-tts** | 380 VNĐ | ✅ | ✅ |
| **Murf AI Falcon** | 383 VNĐ | ✅ | ✅ |
| Azure | 612 VNĐ | ✅ | ❌ |
| Google Cloud | 612 VNĐ | ✅ | ❌ |
| ElevenLabs | 880 VNĐ | ✅ | ❌ |
| Narakeet | 2,550+ VNĐ | ✅ | ⚠️ |

> **Kết luận chi phí:** Chỉ có **OpenAI gpt-4o-mini-tts** và **Murf AI** vừa ĐẠT target chi phí VÀ hỗ trợ code-switch.

---

## 5. Khuyến nghị xếp hạng

### 🏆 Xếp hạng tổng hợp

| Hạng | Engine | Điểm tổng | Lý do |
|------|--------|-----------|-------|
| **🥇 1** | **OpenAI gpt-4o-mini-tts** | 9/10 | Code-switch tốt nhất, giá rẻ (~380 VNĐ), API ổn định. Trừ 1 điểm: không có word timestamps → cần Whisper |
| **🥈 2** | **Murf AI (Falcon)** | 8.5/10 | Code-switch xuất sắc, word timestamps có sẵn(!), giá tương đương. Trừ điểm: cần test thực tế giọng Việt, ít tài liệu tham khảo |
| **🥉 3** | **Azure Speech SDK** | 7/10 | WordBoundary tuyệt vời, free tier lớn, nhưng code-switch tệ → CHỈ phù hợp làm fallback nếu chấp nhận transliteration |
| **4** | **Fish Speech** | 6.5/10 | Tech tốt, code-switch khá, nhưng cần GPU + no word timestamps + license phức tạp |
| **5** | **Edge-TTS** | 5/10 | Free + WordBoundary nhưng code-switch tệ + unofficial → chỉ dùng làm fallback cuối cùng |

---

### Khuyến nghị chiến lược cho AutoClip

```
┌────────────────────────────────────────────────────────┐
│           CHIẾN LƯỢC TTS CHO AUTOCLIP                  │
├────────────────────────────────────────────────────────┤
│                                                        │
│  PRIMARY:  OpenAI gpt-4o-mini-tts                     │
│  ├── Code-switch tự nhiên (1 giọng, auto detect)      │
│  ├── Chi phí: ~380 VNĐ/video (trong target)           │
│  ├── Prompt: "Đọc tự nhiên, phát âm Anh chuẩn"       │
│  └── Word timestamps: Whisper alignment post-process   │
│                                                        │
│  ALTERNATIVE:  Murf AI (Falcon tier)                   │
│  ├── Dùng nếu cần word timestamps native              │
│  ├── Hoặc nếu OpenAI quality không đạt sau test       │
│  └── Chi phí tương đương: ~383 VNĐ/video              │
│                                                        │
│  FALLBACK:  Edge-TTS                                   │
│  ├── Dùng khi cả 2 primary đều fail                   │
│  ├── Kết hợp transliteration (LLM phiên âm)           │
│  ├── WordBoundary có sẵn → không cần Whisper           │
│  └── Free                                              │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Chi tiết kế hoạch triển khai

#### Phase 1: Test & Validate (Trước khi code)
1. **Tạo 5 câu test** chứa thuật ngữ Anh xen kẽ
2. **Gọi API OpenAI gpt-4o-mini-tts** → nghe đánh giá
3. **Gọi API Murf AI Falcon** → so sánh
4. Chọn PRIMARY engine dựa trên kết quả thực tế

#### Phase 2: Implementation
1. **TTS Synthesizer**: Abstract interface `TTSEngine` → impl cho engine được chọn
2. **Word Timestamps**: 
   - Nếu dùng OpenAI: thêm Whisper alignment bước post-process
   - Nếu dùng Murf: dùng native word timestamps
3. **Fallback chain**: PRIMARY → ALTERNATIVE → Edge-TTS (transliteration)

#### Phase 3: Cost Monitoring
- Track chi phí thực tế per video
- Alert nếu vượt 1,000 VNĐ/video
- Auto-switch xuống tier rẻ hơn nếu cần

---

### Tác động tới UPDATED_PLAN.md

| Thay đổi | Chi tiết |
|----------|---------|
| **Loại bỏ Dual-Voice architecture** | Không còn cần `split_by_language()`, `synthesize_bilingual()`, `pydub` concatenation |
| **Loại bỏ dependency `pydub`** | Không cần nối audio nữa |
| **Thêm dependency `openai`** | Cho OpenAI TTS API |
| **Thêm dependency `whisper-timestamped`** (nếu dùng OpenAI) | Cho word-level alignment post-process |
| **Config TTS engine** | User chọn: `openai` / `murf` / `edge-tts` |
| **Thay đổi `tts_preprocessor.py`** | Đơn giản hóa — chỉ cần số→chữ, viết tắt→đầy đủ. Không cần SSML, không cần split language |
| **Thay đổi `tts_synthesizer.py`** | Implement abstract `TTSEngine` → `OpenAITTSEngine`, `MurfTTSEngine`, `EdgeTTSEngine` |
| **Chi phí ước tính tăng nhẹ** | Từ 500 VNĐ (LLM only) → ~880 VNĐ (LLM + TTS) — vẫn trong target 5,000 VNĐ |

---

### Bảng tổng kết chi phí mới

| Component | Công nghệ | Chi phí |
|-----------|-----------|---------|
| Content Parsing | Gemini 2.5 Flash | ~500 VNĐ |
| **Voice Synthesis** | **OpenAI gpt-4o-mini-tts** | **~380 VNĐ** |
| Image Search | Pexels API (free) | 0 VNĐ |
| Visual Asset Gen | Pillow + matplotlib (local) | 0 VNĐ |
| Video Rendering | MoviePy + Pillow + FFmpeg (local) | 0 VNĐ |
| **Tổng** | | **~880 VNĐ** ✅ |

> ✅ Vẫn nằm trong target ≤ 5,000 VNĐ/video, tăng nhẹ so với plan cũ (500 VNĐ) nhưng đổi lại **chất lượng code-switch tốt hơn rất nhiều**.

---

*Tài liệu này được tạo dựa trên research từ documentation chính thức, GitHub repos, và thông tin pricing công khai tháng 4/2026. Mọi giá cả có thể thay đổi — cần xác nhận lại trước khi commit engine choice.*
