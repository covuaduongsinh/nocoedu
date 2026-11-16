# Bàn giao để làm tiếp ở phiên khác (16/11/2026)

Tài liệu này dành cho phiên làm việc kế tiếp trên nhánh `claude/keen-wozniak-sajmjv`. Kế hoạch gốc do Thầy Tường duyệt ngày 16/11 gồm năm giai đoạn; ba giai đoạn đầu đã gần xong, phần còn lại ghi ở dưới theo đúng thứ tự làm.

## Lệnh dán vào phiên mới

```text
Tiếp tục dự án NocoEdu trên nhánh claude/keen-wozniak-sajmjv. Trả lời bằng tiếng Việt, gọi tôi là
"Thầy Tường". Đọc AGENTS.md, .agents/rules/edu.md và docs/plans/2026-11-16-ban-giao-phien-tiep.md,
rồi làm tiếp đúng thứ tự trong tài liệu bàn giao: đóng Giai đoạn 2, Giai đoạn 3 (link riêng cho
phụ huynh), Giai đoạn 4 (hồ sơ học viên và giao diện), cuối cùng soạn danh sách đưa vào dùng thật.
Mỗi mục một commit kèm test, chỉ đẩy lên nhánh này, không đẩy main, không mở pull request khi tôi
chưa yêu cầu.
```

## Quyết định của Thầy Tường (16/11/2026)

- Bản chạy thật `nocoedu.dsc.edu.vn` hiện chỉ một mình Thầy đăng nhập.
- Nhận xét mỗi buổi đến phụ huynh bằng **link riêng**.
- HLV điểm danh trên **cả điện thoại và máy tính**.
- Học phí cần đủ bốn việc: phiếu thu in được, nhắc thu tự động, điều chỉnh số dư, công nợ và doanh thu.
- Mặc định đã chốt, Thầy đổi được: gỡ "Khôi phục JSON"; điều chỉnh số dư dành cho Quản trị và Kế toán; link phụ huynh hạn 90 ngày, do Quản trị và Quản lý cơ sở tạo; mỗi học viên một lớp tại một thời điểm.

## Đã xong và đã đẩy lên nhánh

| Commit    | Nội dung                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| `a23da24` | Số dư buổi chỉ đổi trong `server/edu/ghi-so-du.ts` kèm sổ cái; Đối soát đọc đúng phạm vi, sửa buổi qua sổ cái      |
| `00ea70a` | Nhập CSV đa năng: kiểm quyền theo loại, tất cả hoặc không, số dư qua sổ cái                                        |
| `67b6862` | Khoá webhook CRM, sao lưu chỉ Quản trị, xuất CSV qua báo cáo có nhật ký, gỡ khôi phục JSON                         |
| `e91a28b` | Quy tắc mới trong `.agents/rules/edu.md`; sửa link Giáo viên                                                       |
| `2d7152d` | Điểm danh dùng được trên điện thoại và máy tính, huỷ buổi, nhắc buổi thiếu nhận xét, tab Nhận xét ở hồ sơ học viên |
| `94a8ddd` | Điều chỉnh số dư có lý do (`/soDu/dieuChinh`); số phiếu thu `PT-<năm>-<6 số>`                                      |
| `01f22ab` | Báo cáo công nợ theo học viên; doanh thu tách tiền mặt, chuyển khoản                                               |
| `5d1ac17` | Trang Học phí mới, phiếu thu in được, bán gói / thu tiền / điều chỉnh số dư ghi một lần cho mỗi mã thao tác        |
| `f474ad6` | Nhắc thu học phí hằng ngày và ngưỡng nhắc theo cơ sở (phía server)                                                 |

Kiểm chứng lần cuối trước khi bàn giao: `tests/server/edu-*.test.ts`, `tests/database/edu-migrations.test.ts`, `tests/server/notification-templates.test.ts`, `tests/server/authorization-assignment-safety.test.ts` đạt 250/250; toàn bộ `tests/client` đạt 576/576 ở commit `5d1ac17`; typecheck client và server sạch; lint sạch trên các tệp đã chạm. Trang Học phí và phiếu thu đã được chạy thử trên trình duyệt ở bề ngang 375px và 1280px; phần nhắc thu mới kiểm bằng test, chưa xem trên trình duyệt.

## Việc 1: đóng Giai đoạn 2

1. Ô "Nhắc khi còn (buổi)" cho `eduCoSo.nguongNhacBuoi` trong form tạo cơ sở (`client/pages/edu/co-so.tsx`) và form sửa (`EditCoSo` trong `client/pages/edu/sua-xoa.tsx`), thêm cột ở danh sách cơ sở. Chữ đặt trong `client/locales/edu-copy-hoc-phi.ts`. Server đã nhận trường này (`FIELDS.coSo` trong `server/edu/permissions.ts`).
2. Bỏ hằng số `LOW_BALANCE = 2` ghi cứng trong `client/pages/edu/hoc-phi/due.tsx`: câu mô tả nói theo ngưỡng của từng cơ sở.
3. Ghi quy tắc Giai đoạn 2 vào `.agents/rules/edu.md`:
   - Bán gói, ghi thanh toán, điều chỉnh số dư đi qua `writeOnce` (`server/routes/edu-support.ts`) và bắt buộc `Idempotency-Key`; form dùng `FormDialog` với `snapshot` và truyền `operation` cho `post`.
   - Số phiếu thu do server cấp trong transaction ghi thanh toán; không client nào ghi `soPhieu`.
   - In ấn dùng `#components/print-area` và khối `@media print` trong `client/styles.css`; không trang nào tự viết CSS in riêng.
   - Ngưỡng nhắc đọc một chỗ: `server/edu/nguong-nhac.ts`.
   - Nhắc thu chỉ gồm số lượng và mã học viên; người nhận xác định bằng quyền `edu.thanhToan` `view`, không ghi tên bộ quyền trong mã.
4. Ghi vào `docs/edu-giai-doan-1.md`: job nhắc thu chỉ chạy khi cấu hình có kênh `notification.channels.<tên>` kiểu `in-app` (`config.example.yml` đã có `inbox`).
5. Bật máy chủ thử, xem thông báo trong Hộp thư và mục Cài đặt hệ thống › Mẫu thông báo. Nếu mục này xuất hiện làm lệch test ghim danh sách trang thì cập nhật `tests/client/client-routes.test.ts` và `tests/client/settings-navigation.test.ts`.

Thiết kế nhắc thu đã cài, để tham chiếu:

- `server/edu/nhac-hoc-phi.ts`: `renderTuitionReminder` (chỉ tiếng Việt, liệt kê tối đa 15 mã), `collectTuitionReminders` (ứng viên là người dùng đang hoạt động có gán bộ quyền; hỏi quyền từng người bằng `authz.for(...)`; đọc học viên qua chính policy của người đó), `sendTuitionReminders` (khoá `edu.nhac-hoc-phi:<userId>:<tuần ISO>:<băm nội dung>` nên cùng một danh sách chỉ gửi một lần mỗi tuần).
- `server/providers/edu-nhac-hoc-phi.ts`: job `nhac-hoc-phi` trong scope `nocoedu`, cron `0 8 * * *`, múi giờ `Asia/Ho_Chi_Minh`; đăng ký mẫu `edu.nhac-hoc-phi`; đặt cờ `client.notificationTemplates.tuitionReminder` mà `client/routes.ts` đọc.
- Test: `tests/server/edu-nhac-hoc-phi.test.ts`.

## Việc 2: Giai đoạn 3, link riêng cho phụ huynh

- Bảng mới `eduCongPhuHuynh`: học viên, phụ huynh, **băm** của token (không lưu token), hạn dùng 90 ngày, thời điểm thu hồi, lần xem cuối, số lần xem. Migration có `down`.
- `server/routes/edu-cong-phu-huynh.ts`: tạo, thu hồi, liệt kê link (composite mới `edu.congPhuHuynh`, seed mới cấp cho Quản trị và Quản lý cơ sở; sửa `database/seed-data/edu-permission-sets.ts` rồi chạy `scripts/generate-edu-permission-seed.mts`), và một route công khai đọc bằng token. Token sai, hết hạn hay đã thu hồi đều trả 404; có giới hạn tần suất; trả `no-store`.
- Trang `/ph`: `auth: 'optional'`, `authz: 'skip'` như trang `/device` trong `client/routes.ts`; token nằm sau dấu `#` để không vào log máy chủ; ưu tiên điện thoại; `noindex`.
- Nội dung tối thiểu: tên gọi, cấp độ, lớp, các buổi gần đây (trạng thái, BTVN, ý thức, kiến thức mới, bài về nhà, nhận xét), số buổi còn lại, nhận xét tháng. Không có ngày sinh, số điện thoại, số tiền, `ghiChuHlv`.
- Hồ sơ học viên, tab Phụ huynh: Tạo link, Sao chép, Thu hồi, kèm hạn dùng và lần xem cuối.
- Test: 401, 403, ngoài phạm vi cho ba route quản lý; token đúng, sai, hết hạn, đã thu hồi cho route công khai; test trang ở `tests/client`.

## Việc 3: Giai đoạn 4, hồ sơ học viên và giao diện

- Hồ sơ học viên là nơi làm việc chính: tab Gói buổi dùng lại `StudentTuition` (`client/pages/edu/hoc-phi/student-tuition.tsx`) và giữ hộp thoại "các buổi đã trừ"; thêm chuyển lớp và lối vào trang Phụ huynh (route `/phu-huynh` hiện không có lối vào).
- Việt hoá khung ứng dụng: `client/locales/vi-VN.ts` đang dùng `...systemEnUS`.
- Chuyển chữ ghi cứng còn lại vào `client/locales/edu-copy-*.ts`: thân trang đối soát, tuyển sinh.
- Màu về token ngữ nghĩa (`.agents/rules/components.md`), nhất là `client/pages/edu/edu-ui-parts.tsx`; đưa `--brand-gold` vào `@theme inline` của `client/styles.css`; bỏ emoji dùng làm biểu tượng.
- `index.html`: tiêu đề, `theme-color`, `lang`; chữ NocoBase ở sidebar thay bằng nhận diện Dương Sinh.
- Menu chia nhóm thật (Vận hành, Danh mục) theo `.agents/rules/shell.md`.
- Sửa kế hoạch 15/11 ở chỗ đòi lưu địa chỉ phụ huynh: trái chính sách tối thiểu dữ liệu trẻ em.

## Việc 4: Giai đoạn 5, danh sách đưa vào dùng thật

Soạn cho Thầy Tường một danh sách ngắn, gồm:

- Mở báo cáo "Lệch sổ số dư" trên bản thật và xử lý từng dòng bằng Điều chỉnh số dư.
- Tạo tài khoản HLV, kế toán, quản lý cơ sở; gán bộ quyền trong Quản lý người dùng; gán HLV cho 7 lớp đang `HLV_CHUA_GHEP`.
- Trên Dokploy: `EDU_CRM_WEBHOOK_TOKEN` (từ 24 ký tự), `EDU_VIETQR_*`, kênh `inbox` kiểu `in-app`; chạy `pg_dump` trước mỗi lần triển khai.
- Thêm job PostgreSQL vào CI theo `docs/ci-postgres-job.md`.
- Thu đồng ý của phụ huynh cho học viên nhập từ Lark.

## Cách làm và kiểm chứng

- Node 24: `export PATH=/opt/node24/bin:$PATH`. Thiếu `node_modules` hoặc `.agents/skills/` thì `pnpm install`.
- Chạy test theo phạm vi: `pnpm exec vitest run tests/server/<tệp>`. Sau thay đổi quyền: `tests/server/authorization-assignment-safety.test.ts` và `tests/server/edu-permission-sets.test.ts`. Trang mới: `tests/client/client-routes.test.ts` và `tests/client/page-permission-titles.test.ts`. Migration mới: thêm vào `tests/database/edu-migrations.test.ts`.
- Typecheck: `pnpm exec tsc --noEmit` và `pnpm exec tsc -p tsconfig.server.json --noEmit`. Lint các tệp đã chạm với `--max-warnings 0`.
- Máy chủ thử cục bộ với dữ liệu mẫu: `pnpm nocobase config init --dialect sqlite`, đặt `EDU_SAMPLE_PASSWORD` trong cùng shell, `pnpm nocobase db apply`, `pnpm dev`. Đừng nối `| head` sau `pnpm dev`: máy chủ sẽ dừng khi đủ số dòng.
- Xem giao diện bằng Playwright có sẵn (`require('playwright')` trong tệp `.cjs`), ở bề ngang 375px và 1280px.

## Nợ đã biết

- Repo chưa có tệp logo Dương Sinh: phiếu thu dùng chữ "Cờ vua Dương Sinh".
- Trên điện thoại, các bảng ở trang Học phí cuộn ngang trong khung của bảng.
- Các trang edu còn dùng ô ngày của trình duyệt và `FormDialog`, chưa chuyển sang `DatePicker`, `RouteDialog`, `DataTable` của template.
- Phiếu đối soát in ra còn chữ ghi cứng và số hotline mẫu trong `client/pages/edu/doi-soat.tsx`.
- Chưa có gì được triển khai lên bản chạy thật; chưa mở pull request.
