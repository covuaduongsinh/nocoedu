---
name: lark-giai-doan-2-mac-dinh
description: Câu trả lời của Thầy Tường cho 15 câu hỏi nhập Lark và các mặc định còn lại (câu 7, 10, 12).
type: project
modified: 2026-11-11
---

Thầy Tường đã trả lời (comment `396805820907520` trên DS-60, 09/11/2026):

- Nguồn điểm danh duy nhất là **Base**, mọi năm. Sheets KL357/VP26 (Kim Liên, Vĩnh Phúc) chỉ là danh sách dự kiến: `1` đã đăng ký, `!`/`?` dự kiến hoặc học thử, `x` đã báo nghỉ đột xuất. Không nhập điểm danh từ Sheets.
- Cột "có mặt": `1` có mặt, `0` vắng (không phân biệt có phép). "học lớp 2" là tuổi của học viên, **không** phải học bù: báo lỗi, không trừ buổi, không lưu lớp ở trường.
- Số dư = số buổi đã nộp − số buổi có mặt. **Chưa trừ buổi khi vắng**; sau này có thể trừ khi vắng không phép (`EDU_TRU_BUOI_VANG_KHONG_PHEP=true`, mặc định tắt).
- `NM1`/`NM2` → `tot`; phụ huynh lấy từ `Contact` (trước 11/11/2026: các ô tra cứu "Họ tên PH", "SDT PH" của HocVien); điểm Ý thức thang 10; giữ mã học viên cũ trong `externalCode`; giữ cả **ngày sinh** (`eduHocVien.ngaySinh`, chỉ quản trị và quản lý cơ sở đọc qua `/hocVien/ngaySinh`).

Còn dùng mặc định (chưa hỏi lại): câu 7 cấp của lớp = cấp phổ biến nhất của học viên; câu 10 không nhập "Ghi chú"; câu 12 gộp ba trạng thái học thử thành `hoc_thu`.

**Số dư tính lại từ `Deal HP` (chủ dự án chốt 11/11/2026):** số dư buổi của học viên có Deal = Σ (`Số buổi nộp` − `Số buổi đã học chưa thống kê`) các lần nộp có cờ `Đã nộp` − mọi buổi bị trừ của điểm danh 2024–2026, trừ theo vào-trước-ra-trước (`server/edu/phan-bo-goi.ts`). **Không** dùng số tồn ghi trên Lark và bỏ phần gắn tay `20xx Tkê ngày học`; số tính lại thường thấp hơn số trên Lark. Học viên không có Deal giữ gói mở đầu từ "số buổi tồn update".

Ba mặc định tạm dùng, **chờ Thầy Tường xác nhận** (công tắc `DEAL_RULES` trong `server/edu/lark/chua-xac-nhan.ts`): (1) "chưa thống kê" là buổi học trước khi có bảng điểm danh nên trừ khỏi số buổi nộp; (2) bỏ dòng Deal chưa có cờ `Đã nộp` (cảnh báo `DEAL_CHUA_NOP`); (3) không nhập phụ huynh không có SĐT (cảnh báo `PH_THIEU_SDT`). Phụ huynh lấy từ `Contact` thay cho các ô tra cứu của HocVien ("Họ tên PH", "SDT PH"); `Quan hệ` của HocVien chỉ là phương án dự phòng.

**Vì sao:** các quy tắc này quyết định số dư buổi của học viên; sai thì sai tiền học.

**Cách áp dụng:** sửa hằng số ở `server/edu/lark/chua-xac-nhan.ts` (mỗi hằng số ghi đã xác nhận hay mặc định) và bảng ở `docs/lark/anh-xa-nocoedu.md`; không cần migration. Giai đoạn 3 (`import-lark`) dùng dịch vụ `eduLarkMappingToken`. Quy tắc trừ buổi chung nằm ở `server/edu/so-du.ts`; xem thêm `hoc-bu-tru-buoi`.
