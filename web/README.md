# 🖥️ AutoClip Web Studio — Frontend Documentation

Giao diện người dùng tương tác của hệ thống **AutoClip**, được xây dựng bằng **React 18**, **TypeScript**, **Vite** và **TailwindCSS**. 

Đây là trung tâm điều khiển (Control Center) cho phép người sáng tạo nội dung tạo video bằng AI, theo dõi tiến độ từng stage theo thời gian thực (real-time SSE), xem trước video trực tiếp bằng Remotion Player và tùy biến chi tiết từng phân cảnh trong Studio 3-panel.

---

## 🛠️ Công nghệ Sử dụng (Frontend Stack)

| Công nghệ | Vai trò trong hệ thống |
|---|---|
| **React 18** | Thư viện UI nền tảng với Concurrent Features |
| **TypeScript** | Đảm bảo an toàn kiểu dữ liệu, đồng bộ schema với Backend |
| **Vite** | Build tool siêu tốc với Hot Module Replacement (HMR) tức thì |
| **TailwindCSS** | Hệ thống styling utility-first hiện đại |
| **Radix UI & Shadcn** | Bộ UI Primitives dễ tiếp cận (Accessible Components) |
| **Remotion Player** | Trình phát video thời gian thực nhúng trực tiếp trong trình duyệt |
| **Lucide React** | Bộ icon vector trực quan, đồng bộ |

---

## 📁 Cấu trúc Thư mục `web/src`

```text
web/src/
├── pages/                  # Các màn hình chính của ứng dụng
│   ├── CreatePage.tsx      # Nhập văn bản hoặc chọn chủ đề (Topic / Script mode)
│   ├── ReviewPage.tsx      # Studio Editor 3-panel: kịch bản, media, preview
│   ├── DashboardPage.tsx   # Giám sát trạng thái pipeline và lịch sử tác vụ
│   ├── ResultPage.tsx      # Xuất video hoàn chỉnh, tải file MP4, chia sẻ
│   ├── LibraryPage.tsx     # Quản lý kho video và tài nguyên đã tạo
│   └── SettingsPage.tsx    # Cấu hình API key, voice defaults, video ratio
│
├── components/             # Thư viện component tái sử dụng
│   ├── ui/                 # Nút bấm, modal, input, dropdown, tooltip...
│   ├── studio/             # Các khối của trình dựng (Scene List, Timeline, Inspector)
│   └── player/             # Trình phát video Remotion Player
│
├── api/                    # Giao tiếp với FastAPI Backend
│   ├── client.ts           # Axios / Fetch client với base URL và interceptors
│   └── sse.ts              # Custom EventSource hook lắng nghe luồng SSE
│
├── hooks/                  # Custom React Hooks (useJobProgress, useVideoPlayer...)
├── context/                # Global State Providers (JobContext, ThemeContext)
└── lib/                    # Hàm tiện ích (format time, color conversion, string utils)
```

---

## 🚀 Hướng dẫn Cài đặt & Khởi chạy

### Yêu cầu
- Node.js >= 18.0
- Backend FastAPI đang chạy tại cổng `8000`

### 1. Cài đặt Dependencies
```bash
npm install
```

### 2. Chạy môi trường Phát triển (Development)
```bash
npm run dev
```
Truy cập tại: **http://localhost:5173**

### 3. Biên dịch cho Môi trường Sản xuất (Production Build)
```bash
npm run build
```
Thư mục xuất tĩnh `dist/` sẽ được FastAPI tự động mount và phục vụ tại **http://localhost:8000**.

### 4. Kiểm tra mã nguồn (Linting)
```bash
npm run lint
```

---

## 🔗 Liên kết tài liệu tổng thể
Để tìm hiểu chi tiết về kiến trúc toàn hệ thống, Agentic Pipeline và cách hoạt động của Backend, xem tại:
👉 **[Root README (System Architecture & Pipeline Deep-Dive)](../README.md)**
