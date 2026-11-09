---
name: lark-nguon-du-lieu
description: Nguồn dữ liệu Lark của CLB (1 Base, 2 Sheets) và các giới hạn quyền của app khi đọc qua lark-cli.
type: reference
modified: 2026-11-09
---

Nguồn cần nhập vào NocoEdu (DS-60): Base `V7DHb5fvQaqnrGsH6fFlysuJgme` "Quản lý CLB Cờ vua Dương Sinh", Sheets `VHaDsts8ohJGj1tqDLtleFQOgIc` (KL357, Kim Liên) và `UKrOsarW5hnqaptCW2ilzL7zgrc` (VP26, Vĩnh Phúc). Mỗi sheet là một buổi học (`B…` năm 2025, `C…` năm 2026). Cấu trúc đã giải mã: `docs/lark/schema.md`; diễn giải: `docs/lark/quy-tac-nghiep-vu.md`; ánh xạ: `docs/lark/anh-xa-nocoedu.md`.

Giới hạn của app Lark (11/2026):

- App chưa có scope `base:*`, nên lệnh tắt `lark-cli base +…` lỗi `99991672`; dùng lớp raw `lark-cli api` với `bitable/v1`, `sheets/v2|v3`.
- Base bật quyền nâng cao: vai trò của app không đọc được bảng phụ huynh `tblZUIXmpdt13j4x` và bảng nộp tiền `tblHp1PGPz52eZBz` (`1254302`).
- `lark-cli` tự lấy `tenant_access_token` mỗi lần gọi thì endpoint token trả `429`; `scripts/lark/lark-cli.mjs` lấy một lần và truyền qua `LARKSUITE_CLI_TENANT_ACCESS_TOKEN`.
- Đọc giá trị Sheets mất vài giây mỗi lần; giải mã đủ 2 Sheets mất khoảng 1 giờ.

**Vì sao:** các giới hạn này không thấy được từ mã nguồn và tốn một lượt chạy để phát hiện.

**Cách áp dụng:** trước khi đọc Lark, kiểm tra hai bảng trên đã được cấp quyền chưa (`node scripts/lark/giai-ma.mjs --only base`, xem `unreadableTables`). Không lưu file xuất từ Lark trong repo; script từ chối ghi vào repo.
