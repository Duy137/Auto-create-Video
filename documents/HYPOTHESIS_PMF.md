# 🧪 Hypothesis & PMF (Product-Market Fit) Framework
*Dự án: AutoClip AI*

Dựa trên framework kiểm chứng sản phẩm, tài liệu này xác định những giả định rủi ro nhất của AutoClip AI và thiết lập các thước đo (metrics) thực tế có thể hành động (Actionable) để đo lường mức độ phù hợp với thị trường (Product-Market Fit).

---

## 1. Riskiest Assumption (Giả định nguy hiểm nhất)
*Giả định rủi ro nhất không phải là chúng ta có làm được kỹ thuật hay không (vì đã chứng minh E2E pipeline chạy tốt), mà nằm ở hành vi và sự chấp nhận của người dùng.*

*   **Giả định nguy hiểm nhất:** Sự kết hợp giữa giọng đọc AI (TTS) và các đoạn video/hình ảnh có sẵn (Stock Media) **đủ độ thu hút và tính chân thực để giữ chân người xem cuối (End-users)**. Nếu khán giả cuối không thích định dạng video "lắp ráp" này (chê video khô khan, thiếu cảm xúc cá nhân), các Content Creator/L&D Teams sẽ không có ROI (Return on Investment) từ video, dẫn đến việc họ sẽ dừng trả phí (churn) cho sản phẩm của chúng ta bất kể nó có giúp họ tiết kiệm bao nhiêu thời gian.
*   **Giả định rủi ro phụ:** Chức năng "Review & Edit" (Human-in-the-loop) thực sự giúp tiết kiệm thời gian. Nếu AI chọn sai quá nhiều, khiến user tốn thời gian "Re-search" và "Upload" tương đương với việc họ tự ghép thủ công trên CapCut, họ sẽ rời bỏ nền tảng.

---

## 2. Hypothesis (Giả thuyết)

> **Chúng tôi tin rằng** [kiến trúc Multi-Agent tự động ghép nối ngữ cảnh kết hợp với giao diện tinh chỉnh Human-in-the-loop (Review UI)] 
> **sẽ giúp** [Content Creators và đội ngũ L&D] 
> **đạt được** [việc xuất bản các video kiến thức/tin tức chính xác về chuyên môn trong dưới 5 phút, tiết kiệm 80% thời gian so với phương pháp thủ công].

---

## 3. Aha Moment (Khoảnh khắc bừng sáng)
*Hành vi cốt lõi nào chứng tỏ họ thực sự nhận ra giá trị của sản phẩm?*

**Khoảnh khắc "Aha!":** Lần đầu tiên người dùng paste một kịch bản thô và chỉ sau ~10 giây phân tích, họ nhìn thấy toàn bộ kịch bản đã được chia cảnh, gắn hình ảnh, phân chia giọng đọc một cách cực kỳ logic trên màn hình Review. 
*Và quan trọng hơn:* Khi họ thấy AI chọn sai một tấm hình, họ nhận ra mình có thể **click "Re-search" hoặc "Upload" để sửa nó ngay lập tức** thay vì phải chịu đựng một kết quả "đóng hộp" (black-box) như các tool AI khác.

**Hành vi cốt lõi (Actionable behavior):** 
Người dùng hoàn thành việc **chỉnh sửa ít nhất 1 phân cảnh** (đổi scene type, re-search, hoặc upload) tại màn hình Review **VÀ** sau đó ấn **Render thành công** video đầu tiên. 
*(Hành vi này chứng tỏ họ hiểu giá trị tự động hóa, nhưng vẫn nắm được quyền kiểm soát chất lượng - USP lớn nhất của chúng ta).*

---

## 4. PMF Signal (Tín hiệu Product-Market Fit)
*Chọn Actionable Metric, tuyệt đối không dùng Vanity Metric (như số lượt đăng ký, số lượt truy cập trang web).*

Để xác nhận AutoClip AI đạt PMF, chúng ta sẽ theo dõi các tín hiệu sau:

### A. Retention Metric (Chỉ số giữ chân cốt lõi)
*   **Tín hiệu:** Tỷ lệ người dùng **Tạo (Render) thành công >= 2 video** trong vòng **7 ngày đầu tiên** sau khi kích hoạt tài khoản.
*   *Lý do:* Tạo 1 video có thể chỉ là tò mò (curiosity). Tạo đến video thứ 2 (hoặc hơn) trong tuần đầu tiên chứng minh AutoClip đã thực sự đi vào luồng công việc (workflow) lặp đi lặp lại của họ.

### B. Aha / Activation Metric (Chỉ số kích hoạt)
*   **Tín hiệu:** Tỷ lệ người dùng đi đến bước "Review Scene" chuyển đổi thành hành động bấm nút "Render Video" đạt **> 70%**.
*   *Lý do:* Nếu tỷ lệ này thấp (ví dụ 30%), nghĩa là đến bước Review, họ thấy hình ảnh AI chọn quá tệ hoặc UI chỉnh sửa quá khó dùng nên họ bỏ cuộc giữa chừng. Mức >70% chứng tỏ chất lượng AI đủ tốt hoặc công cụ sửa lỗi đủ mượt để họ tự tin xuất file.

### C. The Sean Ellis Test (Khảo sát định tính)
Sau khi user sử dụng hệ thống được 14 ngày (hoặc tạo được 3 video), gửi một survey 1 câu hỏi duy nhất:
*   *"Bạn sẽ cảm thấy thế nào nếu ngày mai không thể sử dụng AutoClip AI được nữa?"*
*   **Tín hiệu PMF:** Nếu có **> 40%** số người dùng trả lời là **"Rất thất vọng" (Very disappointed)**.
*   *Lý do:* Theo benchmark của Sean Ellis, vượt qua mốc 40% này chứng tỏ sản phẩm đã trở thành giải pháp không thể thiếu "Must-have" thay vì chỉ là "Nice-to-have".
