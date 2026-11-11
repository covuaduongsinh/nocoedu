---
name: lark-nguon-du-lieu
description: Nguồn dữ liệu Lark của CLB (1 Base, 2 Sheets) và các giới hạn quyền của app khi đọc qua lark-cli.
type: reference
modified: 2026-11-11
---

Nguồn cần nhập vào NocoEdu (DS-60): Base `V7DHb5fvQaqnrGsH6fFlysuJgme` "Quản lý CLB Cờ vua Dương Sinh", Sheets `VHaDsts8ohJGj1tqDLtleFQOgIc` (KL357, Kim Liên) và `UKrOsarW5hnqaptCW2ilzL7zgrc` (VP26, Vĩnh Phúc). Mỗi sheet là một buổi học (`B…` năm 2025, `C…` năm 2026). Cấu trúc đã giải mã: `docs/lark/schema.md`; diễn giải: `docs/lark/quy-tac-nghiep-vu.md`; ánh xạ: `docs/lark/anh-xa-nocoedu.md`.

Giới hạn của app Lark (11/2026):

- App chưa có scope `base:*`, nên lệnh tắt `lark-cli base +…` lỗi `99991672`; dùng lớp raw `lark-cli api` với `bitable/v1`, `sheets/v2|v3`.
- Base bật quyền nâng cao: ngày 09/11/2026 vai trò của app không đọc được `Contact` (`tblZUIXmpdt13j4x`, phụ huynh) và `Deal HP` (`tblHp1PGPz52eZBz`, các lần nộp) (`1254302`); từ 10/11/2026 đọc được cả hai và lệnh nhập đọc chúng.
- `lark-cli` tự lấy `tenant_access_token` mỗi lần gọi thì endpoint token trả `429`; `scripts/lark/lark-cli.mjs` lấy một lần và truyền qua `LARKSUITE_CLI_TENANT_ACCESS_TOKEN`.
- Đọc giá trị Sheets mất vài giây mỗi lần; giải mã đủ 2 Sheets mất khoảng 1 giờ.

Bảng bị chặn do quyền nâng cao sẽ **ẩn khỏi danh sách bảng** (không chỉ trả `1254302`), nên lệnh nhập coi bảng bắt buộc không có trong danh sách là `LARK_KHONG_DOC_DUOC`. Ngày 10/11/2026, sau lần cấp quyền thứ ba, app đọc được bảng 2026 (`tbl9TTf0m2EhWV3g`), `Contact` và `Deal HP`; từ DS-60 phần `Contact`/`Deal HP` lệnh nhập dùng cả hai (phụ huynh theo `lark:contact:<rec>`, gói buổi theo `lark:deal:<rec>`). `Đã nộp` của `Deal HP` là cờ, **Lark không có số tiền**, nên gói có `donGia = thanhTien = 0` và không tạo thanh toán. Điểm danh nhập đến 15/10/2026 (chủ dự án chốt), cột "Số buổi còn lại" trống ở mọi dòng nên không đọc.

Quyết định cũ của chủ dự án (09/11/2026): bảng nào app không đọc được thì bỏ qua và ghi lại ở mục "Chưa đọc được" của `docs/lark/quy-tac-nghiep-vu.md`; không xin quyền thêm, không đoán cấu trúc.

**Vì sao:** các giới hạn này không thấy được từ mã nguồn và tốn một lượt chạy để phát hiện; chủ dự án đã cấp quyền mà app vẫn bị chặn, nên không chờ thêm.

**Cách áp dụng:** khi đọc Lark, xem `unreadableTables` trong kết quả của `node scripts/lark/giai-ma.mjs --only base`; bảng còn bị chặn thì làm theo quyết định trên. Đề xuất thay thế (gói mở đầu từ số dư chốt trên HocVien) nằm ở `docs/lark/anh-xa-nocoedu.md`, chờ duyệt. Không lưu file xuất từ Lark trong repo; script từ chối ghi vào repo.

**Nhập vào NocoEdu (giai đoạn 3):** `pnpm nocobase app edu import-lark [--dry-run|--commit --user <id>]`, đọc LopHoc, HocVien, Contact, Deal HP, Level và **tự tìm mọi bảng `<năm> Nhận xét mỗi buổi`** (bắt buộc đủ 2024, 2025, 2026 đúng mã bảng) qua `lark-cli`, chỉ trong bộ nhớ. Chỉ nhập thêm, không cập nhật. Học viên đã có trong NocoEdu được **ghép** (không nhân đôi) khi khớp đủ tên đã chuẩn hoá, năm sinh và SĐT phụ huynh: chỉ gán `externalId`/`externalCode`. Gói đã ghi (`lark:deal:*`, `lark:sodu:*`) **không bao giờ được sửa**: Lark đổi sau đó thì báo `DEAL_DA_DOI`/`SO_DU_LARK_DA_DOI` và số dư tính theo giá trị đã ghi. Hướng dẫn chạy production và rollback: `docs/lark/nhap-production.md`. Rollback sau khi nhập là khôi phục bản sao lưu, không dùng `db rollback`.
