---
name: hoc-bu-tru-buoi
description: Quy tắc tạm chốt cho buổi học bù khi trừ số dư buổi, chờ chủ dự án xác nhận.
type: project
modified: 2026-11-09
---

Buổi **học bù** trừ 1 buổi khi cơ sở để "vắng có phép không trừ", và trừ 0 khi cơ sở để "vắng có phép có trừ". Vắng có phép: trừ 0 hoặc 1 theo cấu hình của cơ sở (`eduCoSo.truBuoiVangCoPhep`). Có mặt luôn trừ 1. Vắng không phép **hiện không trừ** (Thầy Tường xác nhận ngày 09/11/2026, DS-60; trước đó là trừ 1); muốn trừ thì đặt `EDU_TRU_BUOI_VANG_KHONG_PHEP=true`. Lark chỉ có có mặt/vắng, không có học bù: "học lớp 2" là tuổi học viên, không phải học bù.

**Vì sao:** mô tả DS-57 chỉ nêu "có mặt hoặc vắng không phép" bị trừ, không nói về học bù. Nếu học bù luôn trừ 0, học viên vắng có phép rồi đi học bù sẽ được thêm một buổi miễn phí. Đây là mặc định do Trưởng nhóm agent chốt theo khuyến nghị của approach, chưa phải quyết định của chủ dự án.

**Cách áp dụng:** đã cài ở `server/edu/so-du.ts` (`sessionsToDeduct`) và có test cho cả hai cấu hình cơ sở; nêu lại quy tắc này trong báo cáo bàn giao để chủ dự án đổi nếu cần. Khi chủ dự án trả lời, sửa file này thay vì thêm file mới.
