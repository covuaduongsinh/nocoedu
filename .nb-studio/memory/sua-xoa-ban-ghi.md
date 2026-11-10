---
name: sua-xoa-ban-ghi
description: Cách NocoEdu sửa và "xoá" cơ sở, lớp, học viên, phụ huynh (DS-60 PR 4).
type: project
modified: 2026-11-10
---

Xoá học viên = chuyển sang "Đã nghỉ" (`da_nghi`); lớp = "Đã đóng" (`da_dong`); cơ sở = "Tạm dừng" (`tam_dung`). Không xoá cứng ba loại này. Chỉ phụ huynh được xoá cứng, khi không còn liên kết học viên và không có bản ghi đồng ý. Quản trị và Quản lý cơ sở sửa trong phạm vi cơ sở của mình; Quản lý cơ sở không sửa cơ sở; HLV chỉ sửa ghi chú và nhận xét; Kế toán không sửa.

**Vì sao:** lịch sử điểm danh, gói buổi và sổ số dư của trẻ không được mất; số dư buổi phải tính lại được.

**Cách áp dụng:** thêm thao tác ghi mới thì đi qua `updateOne` có kiểm giá trị (`server/edu/sua-ban-ghi.ts`), đổi lớp qua `/hocVien/chuyenLop`, không sửa thẳng `soBuoiConLai`. Chưa có huỷ gói; khi làm phải ghi dòng sổ trả lại số buổi.
