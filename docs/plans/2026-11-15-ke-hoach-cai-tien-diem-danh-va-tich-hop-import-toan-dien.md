# KẾ HOẠCH NÂNG CẤP TOÀN DIỆN ĐIỂM DANH, TÁI CẤU TRÚC HỌC PHÍ & TÍCH HỢP HỆ THỐNG IMPORT TẤT CẢ CÁC SỐ LIỆU

> **Ngày lập kế hoạch**: 15/11/2026  
> **Dự án**: NocoEdu - Hệ thống Quản trị & Vận hành Trung tâm Cờ Vua Dương Sinh  
> **Tài liệu lưu trữ**: `docs/plans/2026-11-15-ke-hoach-cai-tien-diem-danh-va-tich-hop-import-toan-dien.md`  
> **Các vấn đề người dùng phản hồi**:
>
> 1. Điểm danh hiện tại bị rối mắt, khó quan sát và thao tác khi vào lớp dạy. Cần tối ưu cho giáo viên đứng lớp.
> 2. Bổ sung tính năng **Import** cho tất cả các loại số liệu để cập nhật, bổ sung dữ liệu tiện lợi từ Excel/CSV.
> 3. **Trang `Đối soát buổi học` và trang `Học phí` có dữ liệu đang bị trùng lặp**: Cả 2 trang đều liệt kê danh sách học sinh với cột "Số buổi còn lại" và nút "Đối soát", gây phân tán và chưa rõ ràng vai trò nghiệp vụ.

---

## 1. Phân Tích & Tư Vấn Nghiệp Vụ Chuyên Sâu

### 1.1. Giải Quyết Trùng Lặp Giữa Trang "Đối Soát Buổi Học" và "Học Phí"

- **Thực trạng**:
  - Trang `Đối soát buổi học` (`/main/doi-soat`) đã làm rất tốt vai trò kiểm toán: 6 thẻ KPI, phân tích mapping buổi học - kỳ nộp, theo dõi công nợ học phí và tiền sách, in phiếu đối soát A4.
  - Tuy nhiên, trang `Học phí` (`/main/hoc-phi`) hiện tại vẫn đang dùng bảng `ListPage` liệt kê lại toàn bộ danh sách 174 học sinh với cột "Số buổi còn lại" và nút "Đối soát buổi học", tạo sự dư thừa và trùng lặp đến 70% nội dung.
- **Tư vấn định vị lại 2 phân hệ rõ ràng**:

| Tiêu chí so sánh          | 📋 Trang ĐỐI SOÁT BUỔI HỌC (`/main/doi-soat`)                                                                                                                                                    | 💳 Trang HỌC PHÍ (`/main/hoc-phi`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| :------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bản chất nghiệp vụ**    | **Kiểm toán - Đối soát - Theo dõi Buổi học & Công nợ**                                                                                                                                           | **Thu ngân - Quản lý Giao dịch & Dòng tiền Thu học phí**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Câu hỏi cần trả lời**   | • Em này đã học bao nhiêu buổi? Vượt mấy buổi?<br>• Buổi nào thuộc kỳ nộp nào? Thầy cô nhận xét gì?<br>• Còn nợ tiền học/tiền sách bao nhiêu?<br>• In phiếu đối soát A4 gửi phụ huynh đối chiếu. | • Hôm nay/tháng này thu được bao nhiêu tiền học phí?<br>• Ai vừa chuyển khoản / nộp tiền mặt?<br>• Bán gói học mới & quét mã VietQR nộp tiền ngay tại quầy.<br>• Danh sách học sinh đến hạn cần thu tiền.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Giao diện & Tính năng** | • 6 Thẻ KPI tổng quan (Vượt buổi, Nợ phí, Nợ sách)<br>• Bảng kiểm toán số buổi và công nợ<br>• Không gian đối soát 4 Tab chuyên sâu<br>• Xuất phiếu A4 / Sao kê buổi học                         | • **Tab 1: 💰 Thu phí nhanh (Quầy thu ngân / Cashier)**: Tìm học sinh $\rightarrow$ Chọn gói $\rightarrow$ Tạo mã VietQR động có sẵn số tiền & nội dung $\rightarrow$ Ghi nhận thanh toán tức thì.<br>• **Tab 2: 🧾 Sổ quỹ giao dịch (Payment History / Cash Book)**: Bảng lịch sử các giao dịch đóng tiền (ngày giờ, học sinh, số tiền, hình thức CK/TM, người thu, biên lai).<br>• **Tab 3: ⚠️ Danh sách cần thu tiền (Collection Due List)**: Chỉ lọc các em đang âm buổi (`🔴 Cần thu kỳ mới`) và các em sắp hết buổi (`🟡 0-2 buổi`) để thu ngân tập trung xử lý.<br>• Bỏ hẳn nút `Đối soát buổi học` trùng lặp trong trang này, thay bằng nút `🧾 Xem biên lai` và `💰 Thu phí`. |

$\rightarrow$ **Kết quả**: Hai trang có chức năng và luồng công việc hoàn toàn riêng biệt: Trang `Học phí` là nơi thực hiện các **Giao dịch Thu tiền**, còn trang `Đối soát` là nơi **Kiểm tra & Đối chiếu số liệu**.

---

### 1.2. Tối Ưu Giao Diện Điểm Danh Dưới Góc Nhìn Giáo Viên (Teacher-First UX)

- **Thực trạng**: Hiện tại khi mở Điểm danh, hệ thống hiện 628 thẻ buổi học phẳng trong một khung cuộn nhỏ, không biết hôm nay dạy ca nào, khung chọn chiếm nửa màn hình.
- **Thiết kế mới**:
  1. **Khối Tiêu Điểm Hôm Nay (Today's Spotlight)**: Tự động hiển thị các ca học của ngày hôm nay (`Thứ X, DD/MM`). Ca nào chưa điểm danh nổi bật với nút to: `👉 Điểm danh ngay`.
  2. **Bộ lọc thời gian 1 chạm**: `🌟 Hôm nay` | `⏪ Hôm qua` | `📅 Tuần này` | `🔍 Tất cả ca học`.
  3. **Không gian điểm danh tập trung (Focused Workspace)**: Khi chọn ca dạy, thanh chọn bên trên tự động thu gọn thành Banner tinh gọn trên đầu, nhường 100% diện tích màn hình để quan sát học sinh.
  4. **Thao tác nhanh 1 chạm**: `✅ Tất cả có mặt`, `Tất cả đã làm BTVN`.
  5. **Cảnh báo số buổi trực tiếp**: Hiện huy hiệu `🔴 Còn -1 buổi (Vượt gói)` hoặc `🟡 Còn 1 buổi` cạnh tên học sinh để giáo viên nhắc phụ huynh.
  6. **Gợi ý nhận xét 1 chạm (Quick Tags)**: Bấm chọn nhanh: `"Tiếp thu tốt"`, `"Chăm chỉ tập trung"`, `"Cần chú ý hơn"`, `"Chưa làm BTVN"`, `"Cờ tàn tiến bộ"`...
  7. **Thanh lưu cố định (Sticky Bottom Bar)**: Luôn ở đáy màn hình kèm thống kê `Đã chọn: X có mặt, Y vắng`, bấm `💾 Lưu điểm danh` mọi lúc.

---

### 1.3. Hệ Thống Import Dữ Liệu Toàn Diện (Universal Importer)

Xây dựng module Import CSV đa năng (Tải file mẫu $\rightarrow$ Xem trước/Validate $\rightarrow$ Xác nhận nạp vào DB) cho **8 phân hệ**:

1. **Lớp học & Lịch học (`lop`)**: Nhập Mã lớp, Tên lớp, Cơ sở, Cấp độ cờ, Lịch học trong tuần, Giờ học.
2. **Cơ sở đào tạo (`coSo`)**: Nhập Mã cơ sở, Tên cơ sở, Địa chỉ, Số điện thoại.
3. **Hồ sơ giáo viên (`hoSoGv`)**: Nhập Họ tên, Tên viết tắt, Vị trí, Số điện thoại, Thù lao/buổi.
4. **Sách giáo trình (`sach`)**: Nhập Mã sách, Tên sách, Cấp độ, Giá bìa, Tồn kho.
5. **Gói học & Thanh toán học phí (`goiHoc` & `thanhToan`)**: Nhập Mã/Tên học sinh, Số buổi, Thành tiền, Tiền đã nộp, Ngày mua, Hình thức (CK/Tiền mặt), Ghi chú.
6. **Phát sách & Nộp tiền sách (`phatSach` & `nopSach`)**: Nhập Mã/Tên học sinh, Sách phát, Tiền sách, Tiền đã nộp.
7. **Lịch sử Buổi học & Điểm danh (`diemDanh`)**: Nhập Ngày học, Lớp, Mã/Tên học sinh, Trạng thái (Có mặt / Vắng / Học bù), BTVN, Nhận xét.
8. **Tuyển sinh & Khách hàng tiềm năng (`tuyenSinh`)**: Nhập Tên phụ huynh, SĐT, Tên học sinh, Cơ sở, Nguồn, Ghi chú.

---

## 2. Kế Hoạch Triển Khai Chi Tiết

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      LỘ TRÌNH TRIỂN KHAI HOÀN THIỆN                     │
├─────────────────────────────────────────────────────────────────────────┤
│ BƯỚC 1: XÂY DỰNG BACKEND UNIVERSAL IMPORT ENGINE                        │
│   • server/routes/edu-import-universal.ts                               │
│   • GET /api/edu/import/:entity/mau (Tải CSV mẫu)                       │
│   • POST /api/edu/import/:entity/xemTruoc (Validate & Preview)          │
│   • POST /api/edu/import/:entity/xacNhan (Ghi DB an toàn)               │
├─────────────────────────────────────────────────────────────────────────┤
│ BƯỚC 2: XÂY DỰNG FRONTEND COMPONENT GENERIC IMPORT DIALOG               │
│   • client/pages/edu/generic-import-dialog.tsx                          │
│   • Dialog kéo thả file CSV, tải mẫu, xem trước và xác nhận             │
├─────────────────────────────────────────────────────────────────────────┤
│ BƯỚC 3: TỐI ƯU TOÀN DIỆN GIAO DIỆN ĐIỂM DANH DÀNH CHO GIÁO VIÊN         │
│   • client/pages/edu/diem-danh.tsx                                      │
│   • Khối Ca học hôm nay, lọc nhanh thời gian, thu gọn banner            │
│   • Điểm danh 1 chạm, cảnh báo hết buổi, quick tags, sticky bar lưu     │
│   • Tích hợp nút Nhập điểm danh từ CSV                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ BƯỚC 4: TÁI CẤU TRÚC TRANG HỌC PHÍ (CHỐNG TRÙNG LẶP VỚI ĐỐI SOÁT)       │
│   • client/pages/edu/hoc-phi.tsx                                        │
│   • Tab 1: Quầy thu ngân & Bán gói VietQR                               │
│   • Tab 2: Sổ quỹ dòng tiền & Lịch sử giao dịch đóng học phí            │
│   • Tab 3: Danh sách học viên đến hạn thu tiền (âm buổi/sắp hết)         │
│   • Bỏ bảng lặp với trang Đối soát, tích hợp nút Nhập học phí CSV       │
├─────────────────────────────────────────────────────────────────────────┤
│ BƯỚC 5: TÍCH HỢP NÚT IMPORT VÀO CÁC TRANG CÒN LẠI                       │
│   • Lớp học, Cơ sở, Giáo viên, Sách, Phát sách, Tuyển sinh              │
├─────────────────────────────────────────────────────────────────────────┤
│ BƯỚC 6: KIỂM THỬ TOÀN DIỆN & DEPLOY LÊN VPS DOKPLOY                     │
│   • tsc --noEmit (0 errors), Vitest tests pass                          │
│   • Commit & Push GitHub, build Docker và deploy VPS                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Tiêu Chuẩn Nghiệm Thu (Acceptance Criteria)

1. **Điểm danh**: Giáo viên mở trang là thấy ngay ca học hôm nay, điểm danh 1 chạm, nhận xét bằng quick tags, thấy ngay em nào sắp hết buổi/âm buổi.
2. **Học phí**: Trở thành Quầy thu ngân & Sổ quỹ thu tiền thực thụ, không còn bị trùng lặp với trang Đối soát.
3. **Đối soát**: Chuyên sâu về Kiểm toán buổi học, công nợ, in phiếu sao kê A4.
4. **Import dữ liệu**: Mọi trang quản lý số liệu đều có nút `📥 Nhập dữ liệu (Import)` kèm file mẫu chuẩn.
