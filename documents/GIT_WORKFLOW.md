# Hướng Dẫn Quản Lý Mã Nguồn: AutoClip Cá Nhân & Bản Trường Học

Tài liệu này hướng dẫn cách thiết lập Git để dự án cá nhân (`Auto create Video`) có thể:
1. **Lưu trữ an toàn** trên GitHub cá nhân (Private).
2. **Nhận các bản cập nhật** (vá lỗi, tính năng mới) từ dự án gốc của trường (`A20-App-160`) mà không làm mất đi các tính năng kinh doanh riêng biệt của bạn.

Mô hình này được gọi là **Forking Workflow**.

---

## 1. Thiết Lập Ban Đầu (Chỉ làm 1 lần duy nhất)

Mở terminal tại thư mục dự án cá nhân của bạn: `d:\Developer\Auto create Video`

### Bước 1.1: Khởi tạo Git cho thư mục cá nhân (Nếu chưa có)
```powershell
git init
git add .
git commit -m "Khởi tạo bản cá nhân"
```

### Bước 1.2: Kết nối với GitHub cá nhân của bạn (Origin)
Lên GitHub, tạo một Repository mới (chọn Private). Sau đó chạy lệnh để trỏ đường truyền `origin` về repo đó:
```powershell
git remote add origin https://github.com/Duy137/Auto-create-Video.git
git branch -M main
git push -u origin main
```
*(Từ giờ trở đi, kho chứa cá nhân trên GitHub của bạn đã có bộ code đầu tiên).*

### Bước 1.3: Kết nối với Repo của trường (Upstream)
Khai báo thư mục chứa code của trường (`A20-App-160`) là nguồn cung cấp bản cập nhật (chỉ đọc):
```powershell
git remote add upstream "d:\Developer\A20-App-160"
```
Kiểm tra lại xem đã cài đặt đúng 2 đường truyền chưa:
```powershell
git remote -v
```
*Kết quả trả về phải thấy `origin` chỉ ra link GitHub của bạn, và `upstream` chỉ ra thư mục `A20-App-160`.*

---

## 2. Quy Trình Làm Việc Hàng Ngày (Phát triển tính năng riêng)

Khi bạn code thêm các tính năng kinh doanh phục vụ cá nhân trong thư mục `Auto create Video`:

1. Code bình thường.
2. Lưu lại (Commit):
   ```powershell
   git add .
   git commit -m "Thêm tính năng UI mới cho business"
   ```
3. Đẩy lên GitHub cá nhân để sao lưu:
   ```powershell
   git push
   ```
*(Lệnh này chỉ đẩy lên GitHub cá nhân của bạn, không liên quan và không ảnh hưởng gì tới thư mục của trường).*

---

## 3. Quy Trình Nhận Bản Cập Nhật Từ Trường

Giả sử thư mục `A20-App-160` vừa được update code mới. Bạn muốn mang các bản sửa lỗi đó sang bản cá nhân:

1. Đảm bảo bạn đang ở thư mục `Auto create Video` và đã commit mọi thay đổi đang code dở.
2. Tải thay đổi từ bản gốc về máy (nhưng chưa trộn):
   ```powershell
   git fetch upstream
   ```
3. Trộn thay đổi đó vào code cá nhân của bạn:
   ```powershell
   git merge upstream/main
   ```
4. Đẩy bản đã trộn hoàn chỉnh lên GitHub cá nhân của bạn:
   ```powershell
   git push
   ```

---

## 4. BÍ QUYẾT VÀNG: Các Lưu Ý Để Không Bao Giờ Bị Conflict

Xung đột (Conflict) xảy ra khi bạn và trường **cùng sửa vào một dòng** của **cùng một file**. Để tránh điều này, hãy tuân thủ nghiêm ngặt các nguyên tắc sau trong `Auto create Video`:

### 🔴 KHÔNG NÊN (Dễ gây conflict)
- **KHÔNG** sửa trực tiếp vào logic của các file cốt lõi (`api/routes.py`, `app/orchestrator.py`...) trừ khi bắt buộc.
- **KHÔNG** sửa đè lên các Component gốc của frontend (VD: Không thêm logic cá nhân vào thẳng file `StockBackground.tsx` gốc).
- **KHÔNG** commit file cấu hình như `.env` hay file database (`.db`) lên Git. (Đã có sẵn `.gitignore` để lo việc này).

### 🟢 NÊN LÀM (An toàn tuyệt đối)
1. **Tính năng mới = File mới:**
   - Khi muốn làm một dạng Scene mới (VD: `business_showcase`), hãy tạo hẳn một file mới `BusinessShowcase.tsx`.
   - Khi muốn đổi Prompt AI cho business, copy file `director.py` thành `director_business.py` rồi sửa ở đó.
2. **Sử dụng file cấu hình (Config/Env):**
   - Đưa các thông số tùy chỉnh (ví dụ: Tên công ty, Theme color) vào `.env` hoặc file config riêng.
3. **Thêm UI mới ở khu vực riêng:**
   - Nếu muốn thêm nút bẩm ở Frontend, hãy cố gắng bọc chúng trong một component riêng biệt và chỉ import (nhúng) vào file chính 1 dòng duy nhất. (Sửa 1 dòng thì tỷ lệ conflict rất thấp).

---

## 5. Xử Lý Xung Đột (Nếu lỡ xảy ra)

Nếu khi chạy lệnh `git merge upstream/main` mà terminal báo lỗi `CONFLICT`, hãy làm theo các bước sau bằng phần mềm **Visual Studio Code (VS Code)**:

1. **Không hoảng sợ:** Code của bạn không hề mất, Git chỉ đang tạm dừng để hỏi ý kiến bạn.
2. **Mở VS Code:** Ở thanh bên trái, mục *Source Control*, bạn sẽ thấy danh sách các file bị đỏ (Merge Changes).
3. **Mở từng file bị đỏ lên:** Bạn sẽ thấy các đoạn code được highlight. Phía trên đoạn bị lỗi sẽ có các nút bấm:
   - `Accept Current Change`: Lấy code của bạn (Bỏ code trường).
   - `Accept Incoming Change`: Lấy code update của trường (Bỏ code của bạn).
   - `Accept Both Changes`: Giữ cả 2 để bạn tự sắp xếp lại bằng tay.
4. **Lưu file:** Chọn xong cho mọi khu vực bị lỗi, nhấn `Ctrl + S`.
5. **Chốt hạ:** Quay lại terminal gõ:
   ```powershell
   git add .
   git commit -m "Giải quyết xung đột (Merge Conflict)"
   ```
Mọi thứ đã trở lại bình thường!

---

## 6. Cherry-Pick: Lấy Đúng Commit Cần Thiết (Quan Trọng!)

### Vấn đề: Tại sao `git merge` có thể thất bại?

Nếu 2 repo **không có lịch sử chung** (không fork trực tiếp từ nhau qua Git), lệnh merge sẽ báo lỗi:

```
fatal: HEAD...upstream/UpgradeOutput: no merge base
```

Lý do: Git không tìm được "tổ tiên chung" (common ancestor) giữa 2 repo để so sánh. Điều này xảy ra khi repo cá nhân được tạo độc lập (copy thủ công) thay vì `git clone` hoặc `git fork` từ repo trường.

### Giải pháp: Cherry-Pick

**Cherry-pick** = chọn lọc đúng commit cụ thể cần lấy, thay vì merge toàn bộ lịch sử.

Hình dung đơn giản:
```
Merge    = Trộn TOÀN BỘ lịch sử 2 bên lại → dễ conflict
Cherry-pick = Nhặt ĐÚNG 1 commit bạn cần  → an toàn, chính xác
```

### Quy trình Cherry-Pick từ Upstream

```powershell
# 0. Mở terminal tại repo cá nhân
cd "d:\Developer\Auto create Video"

# 1. LUÔN commit trước (bảo vệ code đang làm)
git add -A
git commit -m "Mô tả công việc đang làm"

# 2. Tạo backup branch (phòng hờ)
git branch backup-before-merge

# 3. Fetch branch cần lấy từ upstream
git fetch upstream <tên-branch>
# Ví dụ: git fetch upstream UpgradeOutput

# 4. Xem danh sách commit gần nhất trên branch đó
git log upstream/<tên-branch> --oneline -10

# 5. Copy mã hash của commit cần lấy, rồi cherry-pick
git cherry-pick <commit-hash> --no-commit

# 6. Kiểm tra kỹ trước khi commit
git status                    # Xem file nào thay đổi
git diff --cached --stat      # Xem tổng quan thay đổi
git diff --cached             # Xem chi tiết từng dòng (nếu cần)

# 7. Commit
git commit -m "feat: mô tả tính năng (cherry-pick from upstream)"
```

### Ví dụ thực tế: Lấy Vbee TTS từ Upstream

```powershell
# Đã commit code NewsIntro trước
git add -A && git commit -m "feat: NewsIntro scene + CryptoVN branding"

# Backup
git branch backup-before-merge

# Fetch branch UpgradeOutput từ repo trường
git fetch upstream UpgradeOutput

# Xem commit nào có Vbee
git log upstream/UpgradeOutput --oneline -5
# Kết quả: abc1234 feat: add Vbee AIVoice TTS engine (Vietnamese)

# Cherry-pick commit đó
git cherry-pick abc1234 --no-commit

# Kiểm tra: chỉ có 5-6 file Vbee thay đổi, không đụng NewsIntro
git diff --cached --stat

# OK → commit
git commit -m "feat: add Vbee TTS engine (cherry-pick from upstream)"
```

### Khi nào dùng Merge vs Cherry-Pick?

| Tình huống | Dùng |
|------------|------|
| 2 repo có lịch sử chung (`git fork`) | **Merge** |
| 2 repo độc lập (copy thủ công) | **Cherry-pick** |
| Chỉ cần lấy 1-2 commit cụ thể | **Cherry-pick** |
| Cần đồng bộ toàn bộ branch | **Merge** (nếu có merge base) |
| Merge bị conflict quá phức tạp | **Cherry-pick** từng commit |

### Nếu Cherry-Pick bị conflict

```powershell
# Xem file nào conflict
git status

# Mở VS Code để giải quyết (giống Section 5)
# Sau khi sửa xong:
git add .
git commit -m "feat: cherry-pick upstream + resolve conflicts"
```

### Rollback nếu hỏng

```powershell
# Quay lại đúng trạng thái trước cherry-pick
git reset --hard backup-before-merge
```

---

## 7. Tóm Tắt Nhanh

| Việc cần làm | Lệnh |
|-------------|------|
| Code hàng ngày → lưu | `git add . && git commit -m "..."` |
| Backup lên GitHub | `git push` |
| Lấy update từ trường | `git fetch upstream <branch>` |
| Xem commit mới | `git log upstream/<branch> --oneline -5` |
| Lấy commit cụ thể | `git cherry-pick <hash> --no-commit` |
| Kiểm tra trước commit | `git diff --cached --stat` |
| Rollback | `git reset --hard backup-before-merge` |
