# 📄 AutoClip AI - Mini PRD (Product Requirements Document)

Dựa trên framework yêu cầu sản phẩm, dưới đây là định nghĩa ngắn gọn nhưng đầy đủ về bài toán, người dùng và các yếu tố kỹ thuật AI cốt lõi của AutoClip AI.

---

## 1. Core Definition

*   **Problem (1 câu):** Quá trình chuyển đổi văn bản/kịch bản thành video tin tức, kiến thức tốn quá nhiều thời gian (thường là hàng giờ) do khâu tìm kiếm media minh hoạ và cắt ghép thủ công cho khớp với giọng đọc.
*   **Target User (Ai?):** Content Creators (Nhà sáng tạo nội dung giáo dục/tin tức) và L&D Teams (Đội ngũ đào tạo nội bộ của doanh nghiệp).

## 2. User Stories

*   **User Story #1 (Tốc độ & Tự động hoá):**
    *   *As a* Content Creator bận rộn,
    *   *I want* hệ thống tự động phân tích kịch bản của tôi và tự động gán các video/hình ảnh minh hoạ phù hợp theo từng câu,
    *   *so that* tôi có thể sản xuất video tin tức hàng ngày mà không bị kiệt sức vì công đoạn dựng hình.

*   **User Story #2 (Tính kiểm soát & Tùy chỉnh):**
    *   *As an* L&D Manager,
    *   *I want* có thể xem trước (review) và tự tay thay đổi hình ảnh hoặc tải lên video nội bộ của công ty cho những phân cảnh cụ thể,
    *   *so that* tôi đảm bảo video bài giảng chính xác 100% về mặt chuyên môn trước khi xuất file cuối cùng.

---

## 3. AI-Specific (Bắt buộc)

### Model Selection (Tại sao chọn model này?)
*   **Khâu xử lý văn bản (Text/Logic):** Sử dụng các mô hình nhỏ, tốc độ cao như **OpenAI `gpt-4o-mini`** (hoặc `gemini-1.5-flash`). 
    *   *Lý do:* Chạy qua **kiến trúc Multi-Agent** (chia rõ tác vụ cho Splitter và Director), chúng ta không cần một model quá khổng lồ. Các model mini có chi phí cực rẻ, tốc độ phản hồi tính bằng giây, và thừa đủ khả năng hiểu ngữ cảnh văn bản để phân loại loại cảnh (scene type) cũng như trích xuất từ khóa tìm kiếm (search query) mà không lo bị "ảo giác" (hallucination).
*   **Khâu giọng đọc (TTS):** Sử dụng **OpenAI TTS**.
    *   *Lý do:* Chất lượng giọng đọc tự nhiên, ngắt nghỉ cảm xúc tốt và hỗ trợ tiếng Việt chuẩn xác so với các giải pháp mã nguồn mở.

### Data Source (Lấy dữ liệu từ đâu?)
*   **Media minh hoạ tự động:** Sử dụng API của **Pexels** (Kho video/hình ảnh stock chất lượng cao, miễn phí bản quyền thương mại).
*   **Media cá nhân hoá:** Dữ liệu do **người dùng tự tải lên** (Custom Upload - giới hạn 50MB cho video và 5MB cho ảnh) được lưu trữ tại local storage/cloud của hệ thống.

### Fallback UX (Khi AI "ngáo" / Không tự tin)
*Trong môi trường thực tế, AI chắc chắn sẽ có lúc tìm sai hình, không hiểu ngữ cảnh hoặc API bên thứ 3 bị lỗi. AutoClip AI thiết kế cơ chế "Human-in-the-loop" để xử lý:*

1.  **Khi AI không tìm được hình ảnh phù hợp (Empty Search Results):**
    *   **Giao diện:** Thay vì báo lỗi crash hoặc render ra video đen thui, giao diện Review sẽ hiển thị một **ảnh Placeholder mặc định** (màu xám dịu mắt với icon cảnh báo mờ).
    *   **Hành động (Action):** Bên cạnh placeholder, hiển thị nổi bật 2 nút: `🔄 Tìm kiếm lại (Re-search)` (Cho phép user nhập từ khoá khác cho AI tự tìm lại) và `📤 Tải lên (Upload Media)` (Để user tự giải quyết vấn đề bằng file của họ).
2.  **Khi AI "ảo giác" chọn sai loại cảnh (Wrong Scene Type):**
    *   **Giao diện:** Nếu AI chọn cảnh dạng "Biểu đồ" (Diagram) nhưng nội dung lại chỉ là kể chuyện bình thường.
    *   **Hành động (Action):** Cung cấp Menu Dropdown cho phép user tự chuyển đổi loại cảnh (VD: Đổi từ `diagram` về dạng an toàn nhất là `stock_background`). Khi đổi, hệ thống sẽ tự update lại giao diện preview.
3.  **Thông báo thân thiện:**
    *   Tuyệt đối không hiện lỗi kỹ thuật kiểu `"Error 404: Pexels API returned empty"`.
    *   Thay bằng: *"AI chưa tìm được hình ảnh phù hợp cho phân cảnh này. Bạn có muốn thử từ khóa khác hoặc tự tải media lên không?"*
