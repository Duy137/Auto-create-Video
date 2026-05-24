# Hướng Dẫn Tạo Content TikTok Cho AutoClip

> **Mục đích:** File này cung cấp đầy đủ context để AI (bất kỳ conversation nào) có thể tạo script TikTok chất lượng cao, tối ưu cho hệ thống AutoClip tự động chuyển text → video.

---

## 1. AutoClip Là Gì?

AutoClip là pipeline AI tự động:
```
Input Text → AI phân tách scenes → TTS đọc giọng → Tìm media stock → Render video 9:16
```

**AI chỉ cần cung cấp text đầu vào** → AutoClip sẽ tự xử lý mọi thứ: chia scenes, chọn hình ảnh/video stock, thêm subtitle, chọn transition, và render thành video TikTok/Reels hoàn chỉnh.

---

## 2. Ràng Buộc Kỹ Thuật (QUAN TRỌNG)

### Độ dài text
| Thông số | Giá trị |
|----------|---------|
| Tối thiểu | 30 từ |
| Tối đa | 500 từ |
| **Khuyến nghị cho 1 phút video** | **~1,160 ký tự** (bao gồm dấu cách) |
| Tốc độ đọc (speed) | 1.4x |
| Thời lượng mục tiêu | 45-60 giây |

> ⚠️ Script quá ngắn (<30 từ) sẽ bị reject. Script quá dài (>500 từ) sẽ tạo video dài khó giữ người xem.

### Ngôn ngữ
- **Tiếng Việt** là ngôn ngữ chính
- **Code-switching Việt-Anh** được hỗ trợ tốt (ví dụ: Bitcoin, blockchain, AI, NVIDIA, smart contract...)
- TTS engine sẽ tự đọc các từ tiếng Anh đúng cách khi xen lẫn trong câu tiếng Việt

### AutoClip sẽ tự xử lý
- ✅ Chia text thành 5-8 scenes tự động
- ✅ Tìm hình ảnh/video stock (Pexels) theo nội dung từng scene
- ✅ Tạo subtitle word-by-word highlight
- ✅ Chọn scene type phù hợp (title_card, media_showcase, info_card, stats_highlight...)
- ✅ Thêm transition và animation

### AI KHÔNG cần làm
- ❌ Không cần đánh số scene
- ❌ Không cần ghi chú "[hình ảnh: ...]" hay "[cắt cảnh]"
- ❌ Không cần format đặc biệt — chỉ cần text thuần
- ❌ Không cần thêm hashtag (đó là việc đăng bài, không phải script)

---

## 3. Cấu Trúc Script Chuẩn

### Công thức 5 phần (đã chứng minh hiệu quả)

```
1. HOOK (1-2 câu)     → Gây tò mò ngay lập tức, câu hỏi hoặc tuyên bố gây sốc
2. BỐI CẢNH (2-3 câu) → Giải thích chuyện gì đang xảy ra
3. CHI TIẾT (3-4 câu) → Thông tin quan trọng, số liệu cụ thể
4. TÁC ĐỘNG (2-3 câu) → Điều này ảnh hưởng gì đến người xem
5. CTA (1 câu)         → Kêu gọi tương tác (comment, follow, share)
```

### Quy tắc viết

1. **Hook phải mạnh** — 3 giây đầu quyết định người xem ở lại hay lướt qua
   - ✅ "Mỹ vừa đóng băng 344 triệu đô crypto — chuyện gì đang xảy ra?"
   - ✅ "Chuyển khoản P2P trên 500 triệu — Coi chừng mất coin oan!"
   - ❌ "Hôm nay chúng ta sẽ tìm hiểu về..."

2. **Dùng con số cụ thể** — não người phản ứng mạnh với số liệu
   - ✅ "18 triệu user đã verify", "tăng 5.3% trong 24 giờ"
   - ❌ "rất nhiều người dùng", "tăng đáng kể"

3. **Câu ngắn, nhịp nhanh** — TikTok không phải báo cáo
   - Mỗi câu tối đa 25-30 từ
   - Tránh câu phức, mệnh đề lồng nhau
   - Dùng dấu "—" để tạo nhịp dừng tự nhiên

4. **Code-switch tự nhiên** — giữ thuật ngữ tiếng Anh phổ biến
   - ✅ "smart contract", "blockchain", "on-chain", "DeFi", "stablecoin"
   - ❌ "hợp đồng thông minh", "chuỗi khối" (nghe giả tạo với audience crypto)

5. **Kết bằng CTA mở** — tạo engagement
   - ✅ "Comment cho tôi biết!", "Liệu... ? Bạn nghĩ sao?"
   - ✅ "Lưu lại để không mất tiền oan!"
   - ❌ Kết thúc đột ngột không có call-to-action

---

## 4. Ví Dụ Script Đạt Chuẩn

### Ví dụ 1 — Tin tức crypto (~920 ký tự, ~48s)
```
Mỹ vừa đóng băng 344 triệu đô crypto liên quan đến Iran — chuyện gì đang xảy ra?

Bộ Tài chính Mỹ thông qua OFAC vừa trừng phạt nhiều ví crypto trên mạng Tron, đóng băng tổng cộng 344 triệu đô. Các ví này bị cáo buộc liên quan đến Vệ binh Cách mạng Iran và Hizballah.

Đáng chú ý, chỉ một ngày trước đó, Tether đã chủ động đóng băng hơn 344 triệu USDT theo yêu cầu của cơ quan thực thi pháp luật Mỹ.

Bộ trưởng Tài chính Scott Bessent tuyên bố: Mỹ sẽ truy dấu mọi dòng tiền mà Tehran cố gắng chuyển ra nước ngoài và cắt đứt mọi nguồn tài chính của chế độ này.

Bối cảnh căng thẳng hơn khi Iran gần đây thu phí bằng Bitcoin cho tàu đi qua eo biển Hormuz — tuyến đường vận chuyển dầu quan trọng nhất thế giới. Hải quân Mỹ đã lập phong tỏa, Iran tấn công 3 tàu.

Đây là lần đầu tiên crypto trở thành vũ khí trực tiếp trong chiến tranh tài chính giữa các quốc gia. Liệu stablecoin có còn an toàn khi chính phủ có thể đóng băng bất cứ lúc nào?
```

### Ví dụ 2 — Tin chính sách Việt Nam (~920 ký tự, ~48s)
```
Chuyển khoản P2P trên 500 triệu — Coi chừng mất coin oan!

Từ ngày 21 tháng 4 năm 2026, quy định mới của Napas chính thức có hiệu lực: mọi lệnh chuyển khoản nhanh bị giới hạn dưới 500 triệu đồng cho mỗi lần giao dịch.

Vượt quá 500 triệu? Tiền sẽ đi qua hệ thống CITAD — hệ thống liên ngân hàng cũ chỉ xử lý trong giờ hành chính. Nghĩa là nếu bạn chuyển tiền vào buổi tối hoặc cuối tuần, người nhận có thể phải chờ đến ngày làm việc tiếp theo mới thấy tiền.

Đây là bẫy chết người khi giao dịch P2P crypto. Bạn bấm "đã thanh toán" trên sàn, nhưng người bán chưa nhận được tiền vì CITAD chưa xử lý xong. Kết quả? Người bán từ chối thả coin, mở tranh chấp, và cả hai tài khoản có thể bị khóa.

Giải pháp? Chia nhỏ giao dịch dưới 500 triệu mỗi lần để đi qua Napas chuyển khoản tức thì. Nếu bắt buộc phải chuyển một lần lớn thì báo trước cho đối tác về thời gian chờ, kèm ảnh chụp hóa đơn có mã giao dịch rõ ràng. Và luôn ưu tiên giao dịch với thương gia uy tín cao trên sàn.

Lưu lại để không mất tiền oan!
```

### Ví dụ 3 — Tin dự án crypto (~900 ký tự, ~46s)
```
Pi Network chơi lớn tại Consensus 2026 — Tín hiệu gì cho holder?

Pi Network vừa trở thành nhà tài trợ chính thức của Consensus 2026 tại Miami — hội nghị blockchain lớn nhất thế giới. Và cả hai founder đều sẽ lên sân khấu phát biểu.

Chengdiao Fan sẽ trình bày ngày 6 tháng 5 về hạ tầng blockchain của Pi, hệ thống xác minh danh tính, và cách mạng lưới 18 triệu user đã verify có thể hỗ trợ các sản phẩm AI và Web3 thế hệ mới.

Nicolas Kokkalis sẽ lên sân khấu ngày 7 tháng 5, thảo luận về chủ đề cực hot: làm sao chứng minh bạn là người thật trên internet trong thời đại AI có thể giả mạo mọi thứ.

Về mặt kỹ thuật, Pi đang trong giai đoạn nâng cấp quan trọng. Protocol 22 yêu cầu tất cả node phải upgrade trước ngày 27 tháng 4, nếu không sẽ bị loại khỏi mạng. Protocol 23 dự kiến ra mắt tháng 5 sẽ hỗ trợ smart contract, mở đường cho hệ sinh thái DApp trên Pi.

Giá Pi coin đã tăng hơn 5% trong 24 giờ qua, giao dịch quanh mức 0.18 đô. Liệu Consensus 2026 có phải bước ngoặt thực sự cho Pi Network? Comment cho tôi biết!
```

---

## 5. Quy Trình Tạo Content Từ Bài Báo

Khi được yêu cầu chuyển bài báo thành content TikTok:

### Bước 1: Đọc và trích xuất
- Đọc toàn bộ bài báo gốc
- Xác định 3-5 điểm chính quan trọng nhất
- Tìm con số, dữ kiện cụ thể (rất quan trọng cho hook)

### Bước 2: Viết hook
- Chọn thông tin gây sốc/tò mò nhất làm hook
- Format: câu hỏi hoặc tuyên bố mạnh + dấu "—"
- Tối đa 1-2 câu

### Bước 3: Phát triển nội dung
- Sắp xếp thông tin theo logic: bối cảnh → chi tiết → tác động
- Giữ câu ngắn, nhịp nhanh
- Dùng thuật ngữ tiếng Anh tự nhiên khi phù hợp
- Giữ trong khoảng 900-1,160 ký tự

### Bước 4: Kết thúc với CTA
- Câu hỏi mở hoặc lời kêu gọi hành động
- Khuyến khích comment, follow, share

### Bước 5: Kiểm tra
- [ ] Ký tự: 900-1,160 (target ~1,000)
- [ ] Hook có đủ mạnh? (3 giây đầu)
- [ ] Có con số cụ thể không?
- [ ] Câu nào dài quá 30 từ? → Cắt ngắn
- [ ] Có CTA cuối không?
- [ ] Không có format đặc biệt (hashtag, emoji, ghi chú scene)

---

## 6. Những Điều KHÔNG NÊN Làm

| ❌ TRÁNH | ✅ THAY BẰNG |
|----------|-------------|
| Mở đầu nhàm chán "Hôm nay..." | Hook gây sốc với số liệu |
| Dùng quá nhiều emoji trong text | Text thuần, để AutoClip thêm visual |
| Câu dài >30 từ, nhiều mệnh đề | Câu ngắn, 1 ý/câu |
| Dịch thuật ngữ Anh sang Việt | Giữ nguyên (blockchain, DeFi, stablecoin) |
| Thêm "[cảnh 1]", "[nhạc nền]" | Text thuần, AutoClip tự chia scene |
| Liệt kê quá 5 điểm | Chọn 3-4 điểm quan trọng nhất |
| Kết thúc đột ngột | Luôn có CTA (câu hỏi/kêu gọi) |
| Script dài >1,200 ký tự | Giữ 900-1,160 ký tự cho video ~1 phút |

---

## 7. Danh Sách Từ Cấm & Bị Bóp Tương Tác (CẦN TRÁNH)

Để tránh video bị TikTok/YouTube bóp view (shadowban) hoặc đánh gậy vi phạm, **tuyệt đối KHÔNG sử dụng** các nhóm từ khóa sau trong script:

### 7.1. Bạo lực & Thù hận (Lỗi nặng nhất)
- **Cấm dùng:** Đe dọa, giết, chết, tự tử, khủng bố, đâm chém, bạo lực, tẩy chay, bôi nhọ, phỉ báng, "bị ghét nhất", "hủy hoại".
- **Thay bằng:** Cảnh báo mạnh mẽ, rủi ro lớn, phản đối gay gắt, gây tranh cãi, tổn hại.

### 7.2. Lừa đảo & Tài chính (Rủi ro cao trong Crypto)
- **Cấm dùng:** Lừa đảo, đa cấp, lùa gà, cờ bạc, cá độ, cam kết lợi nhuận 100%, chắc chắn x10 x100, kiếm tiền nhanh.
- **Thay bằng:** đào lửa, dấu hiệu bất thường, rủi ro cao, tiềm năng lớn, bài học đầu tư, dự án rác.

### 7.3. Điều hướng nền tảng (Lỗi bóp view tự động)
- **Cấm dùng:** Facebook, YouTube, Zalo, Telegram, Shopee, Bio, link ở mô tả, click vào, mua bán.
- **Thay bằng:** Nền tảng phở bò, nền tảng chữ Y, kênh tê-lê, đường dẫn ở hồ sơ, trao đổi.

### 7.4. Chính trị & Pháp luật (Nhạy cảm dễ bị quét duyệt)
- **Hạn chế dùng:** Công an, nhà nước, bắt bớ, phản động, buôn lậu. (Các từ này không bị cấm hoàn toàn, nhưng AI của TikTok sẽ đưa video vào diện kiểm duyệt thủ công gắt gao, rất dễ gây "ngâm" video hoặc bóp tương tác).
- **Thay bằng:** Cơ quan chức năng, giới chức trách, vướng vòng lao lý.

---

## 8. Chủ Đề Nội Dung Chính

Kênh TikTok tập trung vào **crypto/blockchain/tài chính số** với audience Việt Nam:

- Tin tức crypto quốc tế (Bitcoin, Ethereum, altcoins)
- Chính sách tài sản số tại Việt Nam
- DeFi, NFT, RWA, stablecoins
- Phân tích thị trường, cảnh báo rủi ro
- Công nghệ blockchain, AI trong tài chính
- Giao dịch P2P, sàn giao dịch, quy định pháp lý

---

## 9. Prompt Mẫu Cho AI

Khi bắt đầu conversation mới, dùng prompt sau (AI sẽ tự đối chiếu với mục 7 để lọc từ ngữ):

```
## prompt với link

Đọc file @CONTENT_CREATOR_GUIDE.md để hiểu context.

Hãy tóm tắt nội dung bài báo trong link dưới đây thành content hấp dẫn để tôi dùng AutoClip chuyển thành video TikTok. TUYỆT ĐỐI NÉ CÁC TỪ CẤM ở mục 7 của file hướng dẫn để tránh bị bóp view. Sử dụng skill của content Creator
[URL bài báo]

## prompt với đoạn content sẵn
Đọc file @CONTENT_CREATOR_GUIDE.md để hiểu context.

Hãy research các trang báo uy tín, kiểm tra tính chính xác rồi tóm tắt nội dung bài báo dưới đây thành content hấp dẫn để tôi dùng AutoClip chuyển thành video TikTok. Lưu ý: Đảm bảo tính khách quan, không đưa thông tin sai sự thật, và TUYỆT ĐỐI NÉ CÁC TỪ CẤM ở mục 7 của file hướng dẫn để tránh bị bóp view. Sử dụng skill của content Creator.

## Prompt nháp
Đọc file @CONTENT_CREATOR_GUIDE.md để hiểu context.

Dưới đây là các nội dung mà twitter dự án WLFI đăng về sự tranh chấp giữa dự án và Justin Sun. Bạn hãy tự research thêm để hiểu bối cảnh câu chuyện. Sau đó, sử dụng skill của content Creator viết thành content hấp dẫn để tôi dùng AutoClip chuyển thành video tiktok. Lưu ý: phải đảm bảo tính khách quan, không đưa thông tin sai sự thật, TUYỆT ĐỐI NÉ CÁC TỪ CẤM ở mục 7 của file hướng dẫn để tránh bị bóp view.
```

---

*File này được tạo và maintain bởi team AutoClip. Cập nhật lần cuối: 2026-04-27.*
