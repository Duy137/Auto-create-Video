# So sánh Model: Qwen vs GPT-4o-mini

> Cập nhật: 29/04/2026  
> Nguồn giá: [Alibaba Cloud Model Studio](https://www.alibabacloud.com/help/en/model-studio/getting-started/models) (cập nhật 28/04/2026) & [OpenAI API Pricing](https://developers.openai.com/api/docs/pricing)

---

## 1. Content Parser — qwen3.5-flash-2026-02-23 vs gpt-4o-mini

| | **qwen3.5-flash-2026-02-23** | **gpt-4o-mini** |
|---|---|---|
| **Input** | $0.10 / 1M tokens | $0.15 / 1M tokens |
| **Output** | $0.40 / 1M tokens | $0.60 / 1M tokens |
| **Region** | Singapore (DashScope Intl) | US |
| **Context window** | 1,000,000 tokens | 128,000 tokens |
| **Tốc độ** | Rất nhanh — Flash-tier, ~50–80 tok/s | Nhanh — ~60–90 tok/s |
| **Structured output** | `json_object` (schema inline vào prompt) | `json_schema` strict ✓ |

### Ước tính chi phí / video

> Giả sử 3 LLM calls (Splitter + Director + Enricher), mỗi call ~2K input + ~800 output tokens.

| Model | Chi phí (USD) | Chi phí (VNĐ ~25,400) |
|---|---|---|
| qwen3.5-flash-2026-02-23 | ~$0.0016 | ~40 VNĐ |
| gpt-4o-mini | ~$0.0023 | ~58 VNĐ |

**→ Qwen3.5-Flash rẻ hơn ~30%.**

### Điểm khác biệt

- **Context 8× lớn hơn**: 1M tokens vs 128K — phù hợp với input text rất dài.
- **Nhược điểm Qwen**: Không hỗ trợ `strict json_schema`, cần nhúng schema vào system prompt. Hiện tại `_call_qwen()` đã xử lý bằng `json_object` + schema inline.
- **Ưu điểm GPT-4o-mini**: Structured output strict đảm bảo format đúng 100%, ít cần retry.

---

## 2. Media Reranker — qwen3-rerank vs gpt-4o-mini

| | **qwen3-rerank** | **gpt-4o-mini** (dùng làm reranker) |
|---|---|---|
| **Loại** | Dedicated rerank model | Chat model, scoring qua prompt |
| **Chi phí** | $0.10 / 1M input tokens *(không có output billing)* | $0.15 input + $0.60 output / 1M tokens |
| **Max documents/request** | 500 | N/A (tuỳ thiết kế prompt) |
| **Tốc độ** | ~100–300ms / batch | ~1–3s / call (chat overhead) |
| **API endpoint** | `/compatible-api/v1/reranks` (httpx POST) | `chat.completions.create` |
| **Chất lượng ranking** | Huấn luyện chuyên biệt cho ranking task | Tổng quát, không tối ưu cho task này |

### Ước tính chi phí / video

> Giả sử 6 scenes × 6 candidates, ~3K total tokens mỗi rerank batch.

| Model | Chi phí (USD) | Chi phí (VNĐ ~25,400) |
|---|---|---|
| qwen3-rerank | ~$0.0003 | ~8 VNĐ |
| gpt-4o-mini | ~$0.0006 | ~15 VNĐ |

**→ qwen3-rerank rẻ hơn ~50% và nhanh hơn ~5–10×.**

### Điểm khác biệt

- **Dedicated rerank model**: qwen3-rerank được huấn luyện riêng để so sánh relevance — không cần prompt engineering, kết quả ổn định hơn.
- **Không có output billing**: Rerank API chỉ tính input tokens (query + documents). GPT-4o-mini vừa tốn input vừa tốn output tokens cho reasoning.
- **Batch hiệu quả**: Gửi 500 documents/request vs GPT-4o-mini cần 1 call riêng hoặc prompt dài.
- **Nhược điểm qwen3-rerank**: Chỉ trả `relevance_score` (float), không trả reasoning. GPT-4o-mini có thể giải thích lý do chọn.

---

## Tổng kết

| Use case | Model hiện tại | Chi phí / video | So với GPT-4o-mini |
|---|---|---|---|
| Content Parser | qwen3.5-flash-2026-02-23 | ~40 VNĐ | Rẻ hơn ~30% |
| Media Reranker | qwen3-rerank | ~8 VNĐ | Rẻ hơn ~50%, nhanh hơn 10× |
| **Tổng** | | **~48 VNĐ** | vs ~73 VNĐ (GPT-4o-mini cho cả 2) |

Cả 2 Qwen model đều chạy trên DashScope Singapore (cùng `QWEN_API_KEY`), không cần thêm vendor. GPT-4o-mini chỉ có ưu thế duy nhất là `strict json_schema` output cho content parser — nhưng hiện tại schema inline đã đủ ổn định.
