# KẾ HOẠCH TỔNG THỂ: CƠ CẤU LẠI HỆ THỐNG MENU, TỐI ƯU HỌC VIÊN - PHỤ HUYNH VỚI NOCOCRM & TRIỂN KHAI CHUYÊN MỤC "ĐỐI SOÁT BUỔI HỌC"

> **Ngày cập nhật**: 15/11/2026  
> **Dự án**: NocoEdu - Hệ thống Quản trị & Vận hành Trung tâm Cờ Vua Dương Sinh  
> **Lưu trữ**: `docs/plans/2026-11-15-ke-hoach-co-cau-menu-va-chuyen-muc-doi-soat.md`

---

## 1. Phân Tích & Hoàn Thiện Mô Hình: Học Viên (NocoEdu) vs Phụ Huynh (NocoCRM)

Ý kiến của bạn về việc **tách riêng Học viên** và **đặt trọng tâm quản lý Phụ huynh ở NocoCRM** là **CỰC KỲ CHUẨN XÁC VỀ KIẾN TRÚC DOANH NGHIỆP**:

### Phân định Rõ ràng Trách nhiệm Hệ thống (Domain Separation):
1. **NocoCRM (Quản lý Khách hàng & Vòng đời Phụ huynh)**:
   - Phụ huynh chính là **Khách hàng trả tiền (Customer / Buyer)**.
   - NocoCRM quản lý: Phễu tuyển sinh (Leads), Lịch sử tư vấn, Chiến dịch Marketing, Hợp đồng, Chăm sóc khách hàng (CSKH), Tương tác qua Zalo OA/Lark, Lịch sử khiếu nại, Khảo sát hài lòng.
2. **NocoEdu (Quản lý Vận hành Đào tạo & Học viên)**:
   - Học viên chính là **Đối tượng thụ hưởng đào tạo (Student / Learner)**.
   - NocoEdu tập trung vào: Điểm danh buổi học, Xếp lớp, Học phí & Số buổi còn lại, Đánh giá nhận xét giáo viên, Phát sách/giáo trình, Đối soát buổi học.
   - Thông tin Phụ huynh trong NocoEdu chỉ đóng vai trò là **Người giám hộ liên hệ (Contact Reference)** gắn liền với Học viên (Họ tên bố/mẹ, SĐT, Địa chỉ). Khi giáo viên hoặc nhân viên cần gọi điện khẩn cấp, họ chỉ cần mở hồ sơ học viên là có đầy đủ số điện thoại phụ huynh.
3. **Kết luận về Menu**:
   - Menu chính NocoEdu chỉ giữ lại duy nhất mục: **👨‍🎓 Học viên**.
   - Bỏ mục menu độc lập "Phụ huynh" trên thanh sidebar để menu thanh thoát, tránh trùng lặp dư thừa.

---

## 2. Thiết kế Kiến trúc Hệ thống Menu Chuẩn Hóa Mới

```
┌──────────────────────────────────────┐          ┌──────────────────────────────────────────┐
│       CẤU TRÚC CŨ (14 MỤC RỜI RẠC)   │          │          CẤU TRÚC MỚI TINH GỌN (3 KHỐI)  │
├──────────────────────────────────────┤          ├──────────────────────────────────────────┤
│ 🏠 Trang chủ                         │          │ ── ⚡ VẬN HÀNH HÀNG NGÀY (CỐT LÕI) ──   │
│ 🏢 Cơ sở           (Ít đổi)          │          │ 🏠 Trang chủ                             │
│ 🏫 Lớp học         (Ít đổi)          │          │ 📅 Điểm danh ca học                      │
│ 👨‍🎓 Học viên                         │          │ 📋 ĐỐI SOÁT BUỔI HỌC     ⭐ [CHUYÊN MỤC] │
│ 👪 Phụ huynh       (Đưa về CRM)      │          │ 💳 Học phí & Gói học                     │
│ 📅 Điểm danh                         │          │ 💬 Nhận xét học viên                     │
│ 💳 Học phí                           │          │ 🎯 Tuyển sinh & Học thử (Link NocoCRM)   │
│ 💬 Nhận xét                          │          │ 👨‍🎓 Học viên                            │
│ 📊 Báo cáo                           │          │ 📊 Báo cáo & Thống kê                    │
│ 📚 Sách            (Ít đổi)          │          │                                          │
│ 📦 Phát sách                         │          │ ── 📁 DANH MỤC & DỮ LIỆU (ÍT ĐỔI) ──     │
│ 🎯 Tuyển sinh                        │          │ 📁 QUẢN LÝ DANH MỤC ▼                    │
│ 👨‍🏫 Giáo viên       (Ít đổi)          │  ═════>  │    ├── 🏫 Lớp học                        │
│ ⚙️ System settings                   │          │    ├── 🏢 Cơ sở đào tạo                  │
│                                      │          │    ├── 👨‍🏫 Đội ngũ Giáo viên            │
│ [Quá nhiều mục ngang hàng, dàn trải, │          │    └── 📚 Sách & Giáo trình (gộp)        │
│  học viên và phụ huynh bị chia đôi]  │          │ 💾 Sao lưu & Khôi phục dữ liệu           │
│                                      │          │                                          │
│                                      │          │ ── ⚙️ HỆ THỐNG ──                        │
│                                      │          │ ⚙️ Cài đặt hệ thống (System Settings)    │
└──────────────────────────────────────┘          └──────────────────────────────────────────┘
```

---

## 3. Chi tiết Chuyên mục Độc lập: "📋 Đối Soát Buổi Học" (`/main/doi-soat`)

Chuyên mục này giải quyết trọn vẹn điểm nghẽn của dạng Modal, cung cấp **100% diện tích màn hình**:

### 3.1. Chế độ 1: Bảng điều khiển đối soát toàn trung tâm (Audit Hub)
- **Thống kê nhanh toàn trường**:
  - 🔴 **Vượt gói / Cần thu kỳ mới**: Học viên có số buổi âm (đã học vượt số buổi nộp).
  - 🟡 **Sắp hết buổi (1–2 buổi)**: Cần chuẩn bị gửi thông báo thu học phí kỳ tiếp.
  - 🟢 **Bình thường (≥ 3 buổi)**: Học viên đang trong kỳ học an toàn.
  - 📚 **Nợ quỹ sách**: Tổng tiền sách học viên đã nhận nhưng chưa thanh toán.
- **Bộ lọc cấp cao**: Lọc theo Cơ sở, Lớp, Trạng thái (Vượt buổi / Sắp hết / Nợ tiền), Tìm kiếm theo tên hoặc mã học viên.
- **Bảng danh sách đối soát nhanh**: Thể hiện Số buổi nộp, Đã học, Số buổi còn lại/vượt, Tình trạng học phí, Tồn nợ sách + Nút `[📋 Xem đối soát chi tiết]`.

### 3.2. Chế độ 2: Không gian đối soát chi tiết học viên (Student Audit Workspace)
- **Header học viên**: Họ tên, Mã HV, Lớp đang học, Cơ sở, Phụ huynh liên hệ, SĐT, Số buổi hiện tại (`🔴 Vượt 21 buổi`).
- **Thao tác góc phải**:
  - `🖨️ In phiếu đối soát A4`: Kích hoạt định dạng in chuẩn có logo Cờ Vua Dương Sinh và chữ ký xác nhận gửi phụ huynh.
  - `📥 Xuất Excel bảng kê`: Tải file đối soát chi tiết về máy.
  - `⬅️ Quay lại danh sách`: Trở về bảng tổng quan toàn trường.
- **Hệ thống 4 Tab chuyên sâu**:
  1. **Tab 1: 📊 Tổng hợp đối soát & Tiến độ từng kỳ**:
     - Thẻ KPI: Đã mua bao nhiêu buổi, Đã học bao nhiêu buổi, Số buổi còn lại/vượt.
     - Cột mốc Timeline phân bổ buổi học vào từng kỳ nộp:
       - *Kỳ 1 (24 buổi)*: Học từ 01/01/2025 → 30/03/2025. **Tiến độ: 24/24 (100%) - Đã hoàn thành**.
       - *Kỳ 2 (24 buổi)*: Học từ 01/04/2025 → 30/06/2025. **Tiến độ: 24/24 (100%) - Đã hoàn thành**.
       - *Vượt gói (21 buổi)*: Học từ 01/07/2025 → Nay. **Cảnh báo: Cần thu học phí kỳ 3**.
  2. **Tab 2: 📅 Lịch sử buổi học & Chỉnh sửa trực tiếp (Quick Edit)**:
     - Bảng full màn hình, sticky header, không bị tràn hay cắt chữ.
     - Bộ lọc: Lọc theo kỳ, theo tháng, theo lớp, theo trạng thái (Có mặt / Vắng / Học bù).
     - **Chỉnh sửa trực tiếp (Quick Edit)**: Bấm `✏️ Sửa` để cập nhật trạng thái điểm danh, BTVN, điểm ý thức (0-10) và nhận xét giáo viên; hệ thống tự động tính toán lại số buổi trừ và số buổi còn lại ngay lập tức.
  3. **Tab 3: 💳 Kỳ nộp học phí & Biên lai**:
     - Quản lý các gói học đã đăng ký, thu học phí, mở mã VietQR chuyển khoản, in biên lai.
  4. **Tab 4: 📚 Sách & Quỹ giáo trình**:
     - Chi tiết từng cuốn sách đã nhận, giá bìa, ưu đãi. Bảng đối soát quỹ sách: Đã nộp - Tiền sách nhận = Tồn quỹ/Nợ sách.

---

## 4. Chi tiết Mục: "💾 Sao Lưu & Dữ Liệu" (`/main/du-lieu`)

1. **Sao lưu & Khôi phục toàn bộ (Full Backup & Restore)**:
   - **Tạo bản sao lưu tức thì (One-click Snapshot Backup)**: Tạo file zip chứa toàn bộ SQLite DB và thư mục lưu trữ `storage/`.
   - **Danh sách bản sao lưu**: Xem ngày tạo, dung lượng, nút tải file về máy tính.
   - **Khôi phục (Restore)**: Tải file backup lên để phục hồi dữ liệu khi cần.
2. **Import & Export từng loại dữ liệu (Modular Import/Export)**:
   - **Xuất dữ liệu (Export)**: Xuất file Excel / CSV cho từng danh mục riêng biệt:
     - Danh sách Học viên (kèm SĐT phụ huynh)
     - Lịch sử Điểm danh & Nhận xét
     - Bảng kê Học phí & Gói học
     - Danh mục Sách & Lịch sử Phát sách
   - **Nhập dữ liệu (Import)**:
     - Tải file mẫu chuẩn Excel/CSV.
     - Đẩy dữ liệu hàng loạt vào hệ thống với cơ chế Upsert chống trùng lặp theo Mã học viên / SĐT.

---

## 5. Lộ trình Triển khai Chi tiết

| Giai đoạn | Nội dung công việc | File ảnh hưởng | Thời gian |
| :--- | :--- | :--- | :--- |
| **Giai đoạn 1** | **Cơ cấu lại Menu**: Tách riêng Học viên (bỏ mục Phụ huynh ở sidebar, đưa về hồ sơ học viên / CRM), nhóm danh mục ít đổi, thêm route `doiSoat` và `duLieu` | `client/routes.ts`, `client/locales/en-US.ts`, `client/locales/zh-CN.ts`, `page-permission-titles.ts` | 30 phút |
| **Giai đoạn 2** | **Backend API**: Xây dựng API tổng quan đối soát, chi tiết học viên, API sửa nhanh buổi học (recalculate balance) và xuất Excel | `server/routes/edu-doi-soat.ts`, `server/routes/index.ts` | 35 phút |
| **Giai đoạn 3** | **Frontend Đối Soát**: Hoàn thiện trang `/main/doi-soat` với 2 chế độ (Tổng quan trung tâm + Chi tiết học viên 4 tab) | `client/pages/edu/doi-soat.tsx` | 45 phút |
| **Giai đoạn 4** | **In ấn & Xuất file**: Thiết kế CSS Print chuẩn A4 cho Phiếu đối soát Cờ Vua Dương Sinh + Tích hợp nút xuất Excel | `client/pages/edu/doi-soat.tsx` | 25 phút |
| **Giai đoạn 5** | **Sao lưu & Dữ liệu**: Xây dựng trang `/main/du-lieu` hỗ trợ backup snapshot, export/import Excel từng bảng | `client/pages/edu/du-lieu.tsx`, `server/routes/edu-backup.ts` | 40 phút |
| **Giai đoạn 6** | **Kiểm thử & Deploy VPS**: Chạy `tsc`, tests, build Docker và cập nhật lên VPS `https://nocoedu.dsc.edu.vn/main` | VPS `217.15.160.118` | 25 phút |
