---
name: lark-giai-doan-2-mac-dinh
description: Câu trả lời của Thầy Tường cho 15 câu hỏi nhập Lark và các mặc định còn lại (câu 7, 10, 12).
type: project
modified: 2026-11-09
---

Thầy Tường đã trả lời (comment `396805820907520` trên DS-60, 09/11/2026):

- Nguồn điểm danh duy nhất là **Base**, mọi năm. Sheets KL357/VP26 (Kim Liên, Vĩnh Phúc) chỉ là danh sách dự kiến: `1` đã đăng ký, `!`/`?` dự kiến hoặc học thử, `x` đã báo nghỉ đột xuất. Không nhập điểm danh từ Sheets.
- Cột "có mặt": `1` có mặt, `0` vắng (không phân biệt có phép). "học lớp 2" là tuổi của học viên, **không** phải học bù: báo lỗi, không trừ buổi, không lưu lớp ở trường.
- Số dư = số buổi đã nộp − số buổi có mặt. **Chưa trừ buổi khi vắng**; sau này có thể trừ khi vắng không phép (`EDU_TRU_BUOI_VANG_KHONG_PHEP=true`, mặc định tắt).
- `NM1`/`NM2` → `tot`; phụ huynh lấy từ "Họ tên PH", "SDT PH", "Quan hệ"; điểm Ý thức thang 10; giữ mã học viên cũ trong `externalCode`; giữ cả **ngày sinh** (`eduHocVien.ngaySinh`, chỉ quản trị và quản lý cơ sở đọc qua `/hocVien/ngaySinh`).

Còn dùng mặc định (chưa hỏi lại): câu 7 cấp của lớp = cấp phổ biến nhất của học viên; câu 10 không nhập "Ghi chú"; câu 12 gộp ba trạng thái học thử thành `hoc_thu`.

**Vì sao:** các quy tắc này quyết định số dư buổi của học viên; sai thì sai tiền học.

**Cách áp dụng:** sửa hằng số ở `server/edu/lark/chua-xac-nhan.ts` (mỗi hằng số ghi đã xác nhận hay mặc định) và bảng ở `docs/lark/anh-xa-nocoedu.md`; không cần migration. Giai đoạn 3 (`import-lark`) dùng dịch vụ `eduLarkMappingToken`. Quy tắc trừ buổi chung nằm ở `server/edu/so-du.ts`; xem thêm `hoc-bu-tru-buoi`.
