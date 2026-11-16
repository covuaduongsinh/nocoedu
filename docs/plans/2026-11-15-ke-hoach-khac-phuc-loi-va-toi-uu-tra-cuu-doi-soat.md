# KẾ HOẠCH KHẮC PHỤC TRIỆT ĐỂ LỖI TRA CỨU ĐỐI SOÁT & HOÀN THIỆN GIAO DIỆN KHÔNG GIAN ĐỐI SOÁT

> **Ngày lập kế hoạch**: 15/11/2026  
> **Dự án**: NocoEdu - Hệ thống Quản trị & Vận hành Trung tâm Cờ Vua Dương Sinh  
> **Tài liệu lưu trữ**: `docs/plans/2026-11-15-ke-hoach-khac-phuc-loi-va-toi-uu-tra-cuu-doi-soat.md`  
> **Theo phản hồi của người dùng**:
>
> 1. Ảnh 1: Chữ bị đè chồng lên nhau giữa cột "Nhận xét giáo viên" và "Thuộc kỳ nộp".
> 2. Ảnh 2 & 3: Tab đối soát buổi học khó tra cứu, tìm kiếm không ra kết quả (khi gõ "trần minh hải", chọn cơ sở "Kim Liên", lớp học "Tất cả lớp học (4)" thì bảng rỗng hoàn toàn, không có kết quả cũng không có thống kê).

---

## 1. Phân Tích Nguyên Nhân Gốc Rễ (Root Cause Analysis)

### 1.1. Tại sao tìm kiếm không ra kết quả và bảng trống trơn (Ảnh 2 & 3)?

- **Truy vết Docker Logs trên VPS**:
  ```
  POST /api/doiSoat/tongQuan 500 failed
  error: select "id", "hoc_vien_id", "so_buoi", "thanh_tien", "da_thanh_toan" from "edu_goi_hoc"
  - column "da_thanh_toan" does not exist
  ```
- **Nguyên nhân cốt lõi**:
  - Trong database NocoEdu, bảng `eduGoiHoc` **không có cột `da_thanh_toan`**.
  - Các giao dịch đóng học phí thực tế được lưu riêng ở bảng `eduThanhToan` (với các cột `goiHocId`, `hocVienId`, `coSoId`, `soTien`).
  - Do truy vấn cột không tồn tại, PostgreSQL ném lỗi `500 Internal Server Error`.
  - Frontend gọi API bị lỗi ném vào khối `catch`, biến `overviewData` mãi mãi mang giá trị `null` $\rightarrow$ Toàn bộ 6 thẻ KPI và bảng dữ liệu bị trắng xóa, không hiển thị gì cả dù người dùng tìm kiếm bất kỳ từ khóa nào.

### 1.2. Tại sao tìm kiếm tiếng Việt trước đây có thể bị hạn chế?

- Khi người dùng gõ không dấu (`tran minh hai`) nhưng database lưu có dấu (`Trần Minh Hải`), nếu chỉ so sánh chuỗi đơn giản bằng `.includes()` thì sẽ không khớp. Cần bổ sung thuật toán chuẩn hóa bỏ dấu tiếng Việt (Unaccent Normalization) cho cả backend và frontend.

### 1.3. Tại sao chữ bị đè lên nhau trong tab đối soát học viên (Ảnh 1)?

- Bảng chi tiết buổi học không khai báo `min-width` tối thiểu và chưa cố định độ rộng cho cột `Nhận xét giáo viên` và cột `Thuộc kỳ nộp`.
- Khi nội dung nhận xét giáo viên dài, kết hợp với nhãn dài `Vượt gói / Chưa nộp tiền kỳ mới`, trình duyệt co cột lại và làm chữ màu đỏ tràn đè lên chữ của cột nhận xét.

---

## 2. Giải Pháp Hoàn Thiện Toàn Diện

### 2.1. Sửa Lỗi Backend API (`server/routes/edu-doi-soat.ts`)

1. **Khắc phục lỗi Query `da_thanh_toan`**:
   - Truy vấn `eduGoiHoc` với đúng các trường tồn tại: `['id', 'hocVienId', 'soBuoi', 'thanhTien']`.
   - Bổ sung truy vấn song song từ bảng `eduThanhToan` lấy `['id', 'hocVienId', 'goiHocId', 'soTien']`.
   - Tính toán chính xác tổng tiền đã thanh toán (`daThanhToan`) và công nợ học phí (`conNo`) theo từng học viên và từng gói học.
2. **Tìm kiếm thông minh không phân biệt dấu tiếng Việt (Accent-insensitive Search)**:
   - Tích hợp hàm `normalizeSearchText()` loại bỏ dấu tiếng Việt chuẩn Unicode:
     `"trần minh hải"`, `"tran minh hai"`, `"TRẦN MINH HẢI"`, mã `"HS00001"`, hoặc số điện thoại đều tìm kiếm ra chính xác 100%.

### 2.2. Khắc phục triệt để lỗi hiển thị đè chữ trong Tab Buổi học (Ảnh 1)

1. Thêm `min-w-[1100px]` vào thẻ `Table` để bảng luôn có đủ không gian co giãn, tự động kích hoạt thanh cuộn ngang mượt mà khi xem trên màn hình nhỏ.
2. Định dạng cột **Nhận xét giáo viên**: `min-w-[280px] max-w-[450px] break-words whitespace-normal leading-relaxed`.
3. Định dạng cột **Thuộc kỳ nộp**: `w-48 min-w-[180px]`.
4. Bọc nhãn kỳ nộp trong Badge riêng biệt có viền và màu nền nhạt:
   - Buổi trong gói: Badge xanh `🟢 Kỳ 1 (10 buổi)`
   - Buổi vượt gói: Badge đỏ có nền `🔴 Vượt gói / Chưa nộp kỳ mới`  
     $\rightarrow$ Đảm bảo không bao giờ bị tràn hay đè chữ lên nhau.

### 2.3. Tối ưu hóa toàn diện trải nghiệm Tra cứu & Tìm kiếm (UX)

1. **Live Search (Tìm kiếm tức thì)**:
   - Tự động lọc ngay khi người dùng đang gõ phím (Realtime / Debounce 300ms) mà không bắt buộc phải click nút "Tìm kiếm" hay gõ Enter.
2. **Hiển thị trạng thái rõ ràng**:
   - Khi đang tải dữ liệu: Hiện Spinner / Skeleton tải trang thay vì để trắng màn hình.
   - Khi có lỗi kết nối: Hiện thông báo thân thiện và nút "Thử lại".
   - Báo số lượng kết quả: `"Hiển thị X / Y học viên"` để người dùng nắm rõ.
3. **Thanh lọc tiện lợi trong Tab Buổi học**:
   - Lọc buổi học theo Từ khóa nhận xét.
   - Lọc buổi học theo Kỳ nộp (Tất cả / Kỳ 1 / Kỳ 2 / Vượt gói).
   - Lọc buổi học theo Trạng thái (Có mặt / Học bù / Vắng có phép / Vắng không phép).
   - Nút đảo chiều sắp xếp (Mới nhất trước $\leftrightarrow$ Cũ nhất trước).

---

## 3. Kế Hoạch Triển Khai Chi Tiết

| Bước       | Mô tả công việc                                                                                                                                                                   | File thực hiện                  |
| :--------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------ |
| **Bước 1** | Sửa triệt để lỗi SQL 500: Query đúng bảng `eduThanhToan` thay vì trường không tồn tại `da_thanh_toan` trong `eduGoiHoc`. Bổ sung hàm tìm kiếm tiếng Việt không dấu chuẩn Unicode. | `server/routes/edu-doi-soat.ts` |
| **Bước 2** | Sửa lỗi bảng bị đè chữ: Thêm `min-w-[1100px]`, cố định độ rộng cột, bọc Badge cho cột "Thuộc kỳ nộp".                                                                             | `client/pages/edu/doi-soat.tsx` |
| **Bước 3** | Nâng cấp bộ lọc tìm kiếm: Tìm kiếm tức thì (live search), lọc tiếng Việt không dấu, hiển thị skeleton loading, badge số lượng kết quả.                                            | `client/pages/edu/doi-soat.tsx` |
| **Bước 4** | Nâng cấp bộ lọc buổi học: Thêm lọc theo trạng thái, kỳ nộp, tìm kiếm nhận xét, đảo chiều sắp xếp ngày học.                                                                        | `client/pages/edu/doi-soat.tsx` |
| **Bước 5** | Kiểm tra TypeScript, test suite, commit, push GitHub và build deploy lại lên VPS Dokploy.                                                                                         | Terminal & VPS Dokploy          |
| **Bước 6** | Xác thực trên trình duyệt thực tế và bàn giao kết quả.                                                                                                                            | Browser & Logs                  |

---

## 4. Cam Kết & Tiêu Chuẩn Nghiệm Thu

- Sau khi triển khai, truy cập `https://nocoedu.dsc.edu.vn/main/doi-soat` sẽ tải dữ liệu ngay lập tức, 6 thẻ KPI hiện đầy đủ số liệu.
- Gõ bất kỳ từ khóa nào ("Trần Minh Hải", "tran minh hai", "HS00001", SĐT) kết quả sẽ hiện ra tức thì.
- Tab buổi học không còn hiện tượng đè chữ, trình bày rõ ràng, chuyên nghiệp và có thể tra cứu từng buổi học cực kỳ thuận tiện.
