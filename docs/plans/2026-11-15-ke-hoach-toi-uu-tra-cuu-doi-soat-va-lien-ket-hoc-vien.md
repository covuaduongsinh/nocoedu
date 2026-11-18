# KẾ HOẠCH NÂNG CẤP TÍNH NĂNG TRA CỨU ĐỐI SOÁT BUỔI HỌC VÀ LIÊN KẾT ĐA CHIỀU VỚI BẢNG HỌC VIÊN

> **Ngày lập kế hoạch**: 15/11/2026  
> **Dự án**: NocoEdu - Hệ thống Quản trị & Vận hành Trung tâm Cờ Vua Dương Sinh  
> **Lưu trữ**: `docs/plans/2026-11-15-ke-hoach-toi-uu-tra-cuu-doi-soat-va-lien-ket-hoc-vien.md`

---

## 1. Phân Tích Hiện Trạng & Vấn Đề

Dựa trên ảnh chụp màn hình từ người dùng tại `https://nocoedu.dsc.edu.vn/main/doi-soat`:

1. **Bảng Đối soát đang trống không hiển thị dữ liệu**:
   - _Nguyên nhân kỹ thuật_: Trong file `server/routes/edu-doi-soat.ts`, middleware kiểm tra quyền được khai báo là `needs('edu.hocPhi', 'view')`. Tuy nhiên trong hệ thống NocoEdu, tài nguyên `edu.hocPhi` không định nghĩa action `view` (mà dùng `edu.hocVien:view`). Điều này dẫn đến API `POST /api/doiSoat/tongQuan` bị từ chối với mã lỗi `403 AuthorizationDeniedError`, khiến frontend không nhận được dữ liệu và bảng hiển thị rỗng.
2. **Khó khăn trong tra cứu & tìm kiếm**:
   - Hiện tại thanh công cụ chỉ có một ô tìm kiếm đơn lẻ và một dropdown lọc trạng thái chung chung.
   - Chưa có bộ lọc trực tiếp theo **Lớp học** và **Cơ sở**, khiến quản lý/giáo viên muốn đối soát học viên của một lớp cụ thể phải tự tìm thủ công giữa hàng trăm học viên.
   - Cần tính năng tìm kiếm tức thì (Real-time Filter) hỗ trợ tìm theo Họ tên, Mã học viên (`HS000...`) và Số điện thoại phụ huynh.
3. **Chưa có sự liên kết 2 chiều với Bảng Học Viên**:
   - Người dùng khi ở trang **Học viên (`/main/hoc-vien`)** hoặc trang **Hồ sơ 360° (`/main/hoc-vien/:id`)** chưa có lối tắt để chuyển nhanh sang đối soát số buổi của học sinh đó.
   - Ngược lại, khi đang ở bảng Đối soát, bấm vào Tên hoặc Mã học viên chưa thể mở nhanh trang Hồ sơ học viên.

---

## 2. Giải Pháp Toàn Diện

```
  TRANG HỌC VIÊN (/main/hoc-vien)             TRANG ĐỐI SOÁT (/main/doi-soat)
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│ [HS00001] Trần Minh Hải          │        │ [🔍 Tìm theo Tên, Mã, SĐT...]    │
│ [📋 Nút Đối soát] ───────────────┼───────>│ [Lọc theo Lớp ▼] [Lọc Cơ sở ▼]   │
└──────────────────────────────────┘        │ [6 Thẻ KPI: Vượt/Sắp hết/Nợ...]  │
                                            │                                  │
  HỒ SƠ HỌC VIÊN (/main/hoc-vien/:id)       │ ── BẢNG ĐỐI SOÁT TOÀN DIỆN ──    │
┌──────────────────────────────────┐        │ • [HS00001] Trần Minh Hải        │
│ Hero Card 360°                   │        │   (Click mở Hồ sơ Học viên 360°) │
│ [📋 Nút Đối soát buổi học] ──────┼───────>│ • Số buổi: Đã nộp | Đã học       │
└──────────────────────────────────┘        │ • Trạng thái: Còn lại / Vượt gói │
                                            │ • [📋 Chi tiết Đối soát 4 Tab]   │
                                            └──────────────────────────────────┘
```

### 2.1. Khắc phục Triệt để Lỗi Quyền Truy Cập (Fix 403 Forbidden)

- Đổi middleware xác thực sang `needs('edu.hocVien', 'view')` trong `server/routes/edu-doi-soat.ts`.
- Đảm bảo tất cả người dùng có quyền xem học viên/lớp học đều xem được bảng đối soát ngay lập tức.

### 2.2. Nâng cấp Bộ Lọc & Tra Cứu Đa Chiều Siêu Nhanh

- **Thêm Dropdown Lọc theo Lớp học (Class Selector)**:
  - Tự động nạp danh sách các lớp học (KL3, KL5, KL7, VP2-CA1...).
  - Chọn lớp nào -> lập tức lọc ra danh sách toàn bộ học viên lớp đó kèm tình trạng số buổi còn lại/vượt.
- **Thêm Dropdown Lọc theo Cơ sở (Branch Selector)**.
- **Tìm kiếm Real-time linh hoạt**:
  - Tự động lọc tức thì theo: Họ và tên học viên, Mã học viên, Số điện thoại phụ huynh.
- **Tương tác nhanh qua 6 thẻ KPI**:
  - Bấm vào thẻ **🔴 Vượt buổi**: Lọc ngay học sinh âm buổi cần thu tiền kỳ mới.
  - Bấm vào thẻ **🟡 Sắp hết buổi**: Lọc ngay học sinh còn 0–2 buổi cần nhắc nộp phí.
  - Bấm vào thẻ **💳 Nợ học phí**: Lọc ngay học sinh chưa đóng đủ tiền gói học.
  - Bấm vào thẻ **📚 Nợ sách**: Lọc ngay học sinh chưa thanh toán tiền giáo trình.

### 2.3. Tích hợp Liên Kết Hai Chiều (Two-way Deep Linking)

1. **Trên Trang Học Viên (`/main/hoc-vien`)**:
   - Trong bảng danh sách (cột Thao tác): Bổ sung nút **`📋 Đối soát`** màu sắc nổi bật, bấm vào chuyển ngay sang `/main/doi-soat?hocVienId=...`.
   - Trong chế độ xem thẻ Grid: Thêm nút tắt **`📋 Đối soát`** cạnh nút Hồ sơ 360° và Thu phí.
2. **Trên Trang Hồ Sơ Chi Tiết Học Viên (`/main/hoc-vien/:id`)**:
   - Thêm nút **`📋 Đối soát buổi học & học phí`** trên thẻ đầu trang (Hero Card) cạnh ô số dư buổi.
3. **Trên Trang Đối Soát (`/main/doi-soat`)**:
   - Gắn `RecordLink` cho cả **Mã học viên** và **Họ và tên**: Bấm vào là mở ngay Hồ sơ học viên 360° (`/main/hoc-vien/:id`).
   - Cột **Lớp học**: Bấm vào mở ngay trang chi tiết lớp học (`/main/lop/:id`).

---

## 3. Kế Hoạch Triển Khai Chi Tiết

| Bước       | Công việc                                                                            | File thực hiện                                                            | Thời gian |
| :--------- | :----------------------------------------------------------------------------------- | :------------------------------------------------------------------------ | :-------- |
| **Bước 1** | Sửa quyền `needs('edu.hocVien', 'view')` trong API đối soát tổng quan và chi tiết    | `server/routes/edu-doi-soat.ts`                                           | 5 phút    |
| **Bước 2** | Bổ sung bộ lọc Lớp học, Cơ sở và tối ưu tra cứu real-time trên giao diện Đối soát    | `client/pages/edu/doi-soat.tsx`                                           | 20 phút   |
| **Bước 3** | Gắn link liên kết học viên từ bảng Đối soát sang trang Hồ sơ chi tiết (`RecordLink`) | `client/pages/edu/doi-soat.tsx`                                           | 10 phút   |
| **Bước 4** | Thêm nút `📋 Đối soát` vào danh sách học viên và trang chi tiết học viên 360°        | `client/pages/edu/hoc-vien.tsx`, `client/pages/edu/hoc-vien-chi-tiet.tsx` | 15 phút   |
| **Bước 5** | Kiểm tra TypeScript, commit, push GitHub và build deploy lại lên VPS Dokploy         | Terminal & VPS                                                            | 20 phút   |

---

## 4. Kết Quả Sau Khi Hoàn Thành

1. Mở trang `/main/doi-soat` là dữ liệu và 6 thẻ KPI hiện ra ngay lập tức, đầy đủ, mượt mà.
2. Lọc học sinh theo từng lớp, từng cơ sở hay tìm kiếm theo tên/SĐT chỉ mất 1 giây.
3. Liên kết thông suốt giữa Học viên, Lớp học và Đối soát giúp quản trị viên thao tác cực kỳ thuận tiện.
