---
name: lark-giai-doan-2-mac-dinh
description: Giai đoạn 2 nhập Lark làm theo khuyến nghị cho 15 câu hỏi chưa được Thầy Tường trả lời; chỗ sửa là một file.
type: project
modified: 2026-11-09
---

Giai đoạn 2 của DS-60 đã cài quy tắc ánh xạ Lark → NocoEdu theo khuyến nghị, vì chủ dự án chuyển issue sang `in_progress` mà chưa trả lời 15 câu hỏi. Mặc định chính:

- Điểm danh: Base trước 2026-01-01, Sheets từ ngày đó (câu 1). `0` = vắng không phép, `x`/`xin nghỉ` = vắng có phép, `học lớp 2` = học bù (câu 3–4).
- Số dư: gói mở đầu = "số buổi tồn update" tại "Ngày update gần nhất về HP"; chỉ trừ buổi sau ngày đó (câu 5). Dòng cũ có `tinhVaoSoDu = false`.
- `NM1`/`NM2` → `tot`; ba trạng thái học thử → `hoc_thu`; không nhập "Ghi chú"; vắng có phép không trừ buổi ở cả hai cơ sở (câu 6, 10, 12, 14).
- Câu 2, 3, 4, 12, 14 do agent tự đề xuất mặc định (không có khuyến nghị sẵn).

**Vì sao:** chưa có người trả lời; các quy tắc phải đổi được mà không cần migration.

**Cách áp dụng:** khi Thầy Tường trả lời, sửa hằng số tương ứng trong `server/edu/lark/chua-xac-nhan.ts` (mỗi hằng số ghi số câu), cập nhật file này và bảng ở `docs/lark/anh-xa-nocoedu.md`. Không thêm migration. Giai đoạn 3 (`import-lark`) dùng dịch vụ `eduLarkMappingToken`.
