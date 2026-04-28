# 🎯 Xác định ranh giới MVP: AutoClip AI

Tài liệu này sử dụng framework phân loại MVP (Minimum Viable Product) để định hướng phát triển dự án AutoClip AI. Việc xác định rõ ràng các ranh giới này giúp team tập trung nguồn lực vào giá trị cốt lõi, tránh tình trạng "feature creep" (phình to tính năng) và đưa sản phẩm ra mắt nhanh nhất có thể để kiểm chứng giả thuyết với người dùng.

---

## 1. In-Scope (Trong phạm vi MVP)
*Tính năng cốt lõi bắt buộc để test giả thuyết: "Người dùng có cần một công cụ chuyển đổi văn bản có sẵn thành video ngắn tự động với kho media stock không?"*

Đây là những tính năng "sống còn". Nếu thiếu, sản phẩm không hoạt động hoặc không mang lại giá trị chính.

* **Nhập kịch bản (Text Input):** Cho phép người dùng dán một đoạn văn bản (script) đã chuẩn bị sẵn.
* **Phân tích nội dung (LLM Parser):** Chia nhỏ văn bản thành các cảnh (scenes) logic, gán loại cảnh (scene type) và tạo prompt tìm kiếm hình ảnh/video.
* **Tổng hợp giọng nói (TTS):** Chuyển đổi văn bản thành giọng đọc tự nhiên (hiện tại hỗ trợ tiếng Việt).
* **Tìm kiếm Media tự động:** Tự động tìm và gán video/hình ảnh stock từ Pexels (hoặc nguồn tương đương) dựa trên prompt của từng cảnh.
* **Trình duyệt & Chỉnh sửa cơ bản (Review UI):**
  * Xem trước danh sách các cảnh.
  * Cho phép thay đổi loại cảnh (Scene Type).
  * Cho phép tải lại (Re-search) hoặc tự tải lên (Upload) media (ảnh/video custom) cho từng cảnh.
* **Render Video (Remotion):** Xuất ra video định dạng dọc (9:16) hoàn chỉnh dạng MP4 với subtitle khớp với giọng đọc.

---

## 2. Out-of-Scope (Ngoài phạm vi MVP - Backlog cho Phase 2+)
*Tính năng tốt nhưng không cần thiết cho MVP.*

Đây là những tính năng hữu ích, tạo ra trải nghiệm "Wow", nhưng nếu thiếu thì người dùng vẫn có thể tạo ra video. Chúng ta sẽ ưu tiên làm sau khi MVP đã chứng minh được giá trị.

* **Sinh kịch bản tự động (AI Script Writer):** Tích hợp AI để viết kịch bản từ 1 câu lệnh ngắn (hiện tại yêu cầu user phải tự chuẩn bị text).
* **Đa định dạng xuất video:** Hỗ trợ xuất video ngang (16:9 cho YouTube) hoặc vuông (1:1 cho Facebook), ngoài định dạng 9:16 hiện tại.
* **Đa ngôn ngữ (Multi-language):** Hỗ trợ dịch và tạo giọng đọc đa ngôn ngữ tự động.
* **Trình chỉnh sửa Timeline nâng cao:** Cho phép kéo thả, cắt ghép thời lượng của từng scene hoặc âm thanh một cách thủ công trên một giao diện timeline chi tiết.
* **Tích hợp Avatar/Talking Head:** Cho phép chèn AI Avatar đọc kịch bản thay vì chỉ có giọng đọc ẩn danh.
* **Tự động đăng tải (Auto-publish API):** Tích hợp API trực tiếp lên TikTok, Instagram Reels, YouTube Shorts sau khi render xong.
* **Đồng bộ nhạc nền nâng cao (Beat-sync BGM):** AI tự động cắt ghép video chuyển cảnh khớp với nhịp của nhạc nền.
* **Brand Kit:** Lưu trữ font chữ, màu sắc, logo riêng của từng user để tự động áp dụng vào video.

---

## 3. Non-Goals (Không phải mục tiêu - Ranh giới đỏ)
*Sản phẩm sẽ KHÔNG làm.*

Xác định những gì chúng ta tuyệt đối không làm để tránh đối đầu với các "ông lớn" hoặc đi sai định vị sản phẩm.

* **KHÔNG PHẢI phần mềm Edit Video chuyên nghiệp:** Chúng ta không cạnh tranh với Premiere Pro, CapCut PC hay DaVinci Resolve. Không làm các tính năng keyframe, color grading phức tạp.
* **KHÔNG PHẢI công cụ tạo Video từ Text dạng Generative (như Sora, Runway):** AutoClip AI không tự "vẽ" ra các pixel video mới từ prompt. Chúng ta chỉ sử dụng kho media có sẵn (Stock) và media do người dùng tự tải lên để tiết kiệm chi phí và đảm bảo tính ổn định.
* **KHÔNG PHẢI nền tảng Mạng xã hội/Video Hosting:** Chúng ta không lưu trữ video để người dùng xem public giống YouTube/TikTok. Render xong, người dùng tải về là kết thúc luồng.

---

## 4. Phương pháp "Kill Question" (Câu hỏi sinh tử)
Để sử dụng framework này trong quá trình phát triển tiếp theo, mỗi khi ai đó đề xuất một tính năng mới cho MVP, hãy dùng bộ lọc này:

> **"Cắt thêm 1 tính năng này trong In-Scope, khách hàng còn nhận được giá trị cốt lõi (tạo video từ text) không?"**

*   **Trường hợp 1:** "Nếu bỏ tính năng chèn nhạc nền (BGM) thì sao?" -> User vẫn có video với giọng đọc và hình ảnh minh họa. Video vẫn truyền tải được nội dung cốt lõi. -> **Chuyển BGM sang Out-of-Scope** (Có thì tốt, chưa có cũng không chết dự án).
*   **Trường hợp 2:** "Nếu bỏ tính năng tổng hợp giọng đọc (TTS) thì sao?" -> Video chỉ có hình và chữ, mất đi sự thu hút của định dạng video ngắn hiện đại, user sẽ thấy nó giống một slide PowerPoint hơn là một clip TikTok. -> **Bắt buộc giữ ở In-Scope**.

*Bất kỳ tính năng mới nào trong tương lai cũng phải vượt qua "Kill Question" này trước khi được đưa vào code base của phiên bản đầu tiên.*
