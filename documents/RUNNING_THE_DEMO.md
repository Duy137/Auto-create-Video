venv\Scripts\activate
python -m api.main

# Hướng dẫn chạy Demo AutoClip

Tài liệu này sẽ hướng dẫn bạn cách thiết lập môi trường và chạy giao diện tạm thời (Web UI Demo) cho quy trình tạo video AutoClip.

## 1. Yêu cầu hệ thống

Trước khi chạy dự án, hãy đảm bảo máy tính của bạn đã cài đặt các phần mềm sau:
- **Python 3.10+**
- **Node.js**: Phiên bản `v22` trở lên (dùng cho Remotion).
- **FFmpeg**: Bắt buộc phải có để xử lý video và âm thanh.

## 2. Thiết lập môi trường

1. **Kích hoạt môi trường ảo (virtual environment)**:
   - Trên Windows:
     ```powershell
     venv\Scripts\activate
     ```
   - Trên Mac/Linux:
     ```bash
     source venv/bin/activate
     ```
   *Lưu ý: Nếu bạn dùng Windows và PowerShell chặn không cho chạy script, hãy gõ lệnh `Set-ExecutionPolicy Unrestricted -Scope Process` để cấp quyền tạm thời.*

2. **Cài đặt thư viện Python**:
   ```bash
   pip install -r requirements.txt
   ```
   *(Bước này sẽ tải về các thư viện nặng như PyTorch và OpenAI Whisper, quá trình này có thể mất một chút thời gian tuỳ thuộc vào tốc độ mạng của bạn.)*

3. **Cài đặt thư viện Remotion**:
   Mở dòng lệnh, chuyển vào thư mục `remotion` và tiến hành cài đặt thư viện:
   ```bash
   cd remotion
   npm install
   cd ..
   ```

4. **Cấu hình file `.env`**:
   Đảm bảo bạn đã nhân bản file `.env.example` thành file mới có tên là `.env` ở thư mục gốc của dự án.
   Bạn cần điền đầy đủ các mã khoá API (OpenAI, Pexels) và lưu ý thiết lập biến `FFMPEG_PATH` trỏ tới file `ffmpeg.exe` mà bạn đang có trong máy.

## 3. Khởi chạy giao diện Demo (Dashboard)

Sau khi thiết lập xong, bạn có thể khởi động mạng chủ (server) ngay tại thư mục chính của dự án. 

Chạy server dưới dạng một module Python bằng lệnh:
```bash
python -m api.main
```
*(Hoặc bạn có thể dùng lệnh `uvicorn api.main:app --reload`)*

**Truy cập vào Dashboard:**
Mở trình duyệt web của bạn và đi đến đường dẫn này:
[http://localhost:8080/demo/](http://localhost:8080/demo/)

## 4. Chạy trực tiếp qua dòng lệnh (Không sử dụng UI)

Nếu bạn muốn kiểm tra trực tiếp quy trình qua terminal mà không cần truy cập vào Web UI, hãy sử dụng lệnh sau:
```bash
python run_pipeline.py đường/dẫn/tới/file_văn_bản_của_bạn.txt
```
