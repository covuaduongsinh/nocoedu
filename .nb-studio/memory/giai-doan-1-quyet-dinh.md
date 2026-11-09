---
name: giai-doan-1-quyet-dinh
description: Các quyết định thiết kế giai đoạn 1 của NocoEdu mà chủ dự án có thể muốn đổi.
type: project
modified: 2026-11-09
---

Quyết định tạm chốt ở giai đoạn 1 (chưa phải ý kiến của chủ dự án):

- Tỷ lệ chuyên cần = (có mặt + học bù) / tổng lượt điểm danh, tính theo lớp trong 30 ngày gần nhất.
- "Nghỉ > 2 tuần" = học viên đang học hoặc tạm nghỉ không có mặt (hoặc học bù) buổi nào trong 14 ngày gần nhất.
- Phụ huynh trùng số điện thoại với phụ huynh ở cơ sở ngoài phạm vi của người nhập thì tạo bản ghi riêng; chưa có công cụ gộp.
- HLV chỉ điểm danh học viên thuộc lớp mình, chưa điểm danh học bù cho học viên lớp khác.
- Ngày "hôm nay" tính theo giờ Việt Nam (UTC+7).

**Vì sao:** mô tả công việc không nêu các điểm này và không được hỏi giữa chừng.

**Cách áp dụng:** nêu lại trong báo cáo bàn giao; khi chủ dự án trả lời, sửa file này và mã tương ứng (`server/routes/edu-bao-cao.ts`, `server/edu/so-du.ts`).
