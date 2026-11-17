# Hoàn thiện sau Giai đoạn 0: những mục chưa kiểm chứng

PR #43 (Giai đoạn 0 của `2026-11-17-tai-cau-truc-nocoedu.md`) đã sửa các lỗ hổng quyền và số dư. Khi bàn giao có 6 việc chưa kiểm chứng. Tài liệu này nói việc nào **cần** làm, làm ở đâu, làm thế nào và xong khi nào.

## 1. Kết luận: việc nào cần, việc nào không

| # | Mục | Cần không | Khi nào | Công sức |
|---|---|---|---|---|
| A | Đặt `EDU_CRM_WEBHOOK_TOKEN` + cập nhật NocoCRM; coi mã cũ đã lộ | **Bắt buộc** | Trước khi triển khai PR #43 | ~30 phút (vận hành) |
| B | Chạy thử thủ công 3 vai (Quản trị, QL cơ sở, HLV) | **Bắt buộc** | Trước khi triển khai | ~1 giờ |
| C | Chạy bộ test trên PostgreSQL | **Bắt buộc** | Trước khi triển khai (bản chạy thật dùng PostgreSQL) | ~½ ngày |
| D | Bản sao lưu đủ bảng + khôi phục an toàn | **Bắt buộc nếu còn dùng làm sao lưu duy nhất**; nếu không, vẫn nên làm trước GĐ 1 | Phiên riêng, trước GĐ 3 (GĐ 3 thêm bảng mới) | ~1 ngày |
| E | Đưa CI về xanh (nợ lint) | Nên làm, không chặn triển khai | PR riêng, trước GĐ 1 | ~1–2 ngày |
| F | Hiệu năng trang Đối soát với dữ liệu thật | Nên đo; chỉ sửa nếu chậm | Sau B, C | ~2 giờ đo |
| G | Test học phí đang kiểm tra tìm kiếm phía client, không phân trang server | **Không cần** làm riêng | Đã nằm trong GĐ 1 (mục 3.3) | — |
| H | Tệp cũ lệch prettier | **Không cần** làm lẻ | PR chỉ định dạng, sau khi GĐ 1–2 merge | ~30 phút |

Lý do ngắn:

- **A** — webhook từ chối mọi lời gọi cho tới khi có biến; mã `nocoedu-crm-secret` từng nằm trong mã nguồn và trên giao diện, nên coi là đã lộ.
- **B, C** — hai việc này là chỗ duy nhất mà test hiện tại chưa chạm: giao diện thật và PostgreSQL.
- **D** — bản sao lưu hiện thiếu 6 bảng (đồng ý phụ huynh, lịch sử lên cấp, tiền sách đã nộp, sách đã/đang học, hồ sơ giáo viên, người quản lý cơ sở). Khôi phục từ nó sẽ mất những dữ liệu này mà không báo.
- **E** — CI (`pnpm check`) của PR #43 đang đỏ vì lint: nhánh `main` có 154 lỗi, PR #43 còn 107 (đã giảm 47), không lỗi nào do PR này gây ra. Nhưng CI đỏ nghĩa là không còn tín hiệu nào cho các PR sau.
- **Node 24** — container dùng Node 22 nên `postinstall` không đồng bộ được `.agents/skills/`. Không cần xử lý riêng: CI chạy Node 24, và mục E làm CI xanh là xong.

## 2. Mục A — Vận hành webhook CRM

1. Sinh mã ngẫu nhiên dài (≥ 32 ký tự), đặt vào biến môi trường của máy chủ `EDU_CRM_WEBHOOK_TOKEN` (không ghi vào repo, không ghi vào `config.yml`).
2. Trong NocoCRM, cấu hình webhook gửi header `X-CRM-Token: <mã>` tới `/api/edu/crm/lead-sync`. Không gửi mã trên địa chỉ URL (máy chủ không đọc).
3. Khởi động lại ứng dụng. Kiểm tra: gọi không header → 401; gọi đúng header → 200 và thấy liên hệ mới ở trang Tuyển sinh (ghi chú bắt đầu `[NocoCRM]`).
4. Nếu bản chạy thật từng triển khai commit có mã cũ: kiểm tra bảng `eduLienHe` có dòng lạ (kênh `nococrm` ngoài các lead thật) từ khi triển khai tới nay.

**Xong khi:** lead thật từ NocoCRM vào được; gọi sai mã bị từ chối.

## 3. Mục B — Chạy thử thủ công 3 vai

Chạy `pnpm dev`, dùng địa chỉ `Local:` in ra. Với dữ liệu mẫu (`APP_SAMPLE_DATA`, tên "Học viên Mẫu"), đăng nhập lần lượt và đi qua bảng sau. Ghi kết quả vào mô tả PR #43.

| Việc kiểm tra | Quản trị | QL cơ sở | HLV |
|---|---|---|---|
| Menu "Sao lưu dữ liệu" | thấy | **không thấy** | **không thấy** |
| Tải sao lưu JSON; khôi phục (gõ xác nhận) | được | — | — |
| Đối soát: bảng tổng | cả hai cơ sở | chỉ cơ sở mình | không vào được (không có quyền trang) |
| Đối soát: mở một em, sửa nhanh một buổi (đổi trạng thái) | số dư đổi 1 buổi, có dòng sổ nhật ký | như Quản trị, trong cơ sở mình | — |
| Điểm danh: nút "Xuất CSV" | thấy; file mở được trong Excel, tên có dấu đúng | thấy; chỉ cơ sở mình | **không thấy** |
| Học phí: nút "Xuất CSV" | thấy | thấy | không vào được |
| Nhập CSV điểm danh / gói học | được | chỉ cơ sở mình | điểm danh: chỉ lớp mình |
| Gọi trực tiếp API khi sai vai (ví dụ HLV gọi `/api/heThong/backup/exportJson`) | — | — | 403 |
| Tuyển sinh: hộp "Kết nối NocoCRM" | không còn mã bí mật; có hướng dẫn biến môi trường | | |
| Trang chủ: lối tắt "Hồ sơ giáo viên" | mở được `/giao-vien` | | |

**Xong khi:** mọi ô đúng như bảng; lỗi nào phát hiện được sửa trong PR #43 (kèm test) hoặc ghi thành việc riêng.

## 4. Mục C — Chạy bộ test trên PostgreSQL

Container đã cài PostgreSQL 16. Bộ test chọn cơ sở dữ liệu qua biến `NOCOBASE_TEST_DB_DIALECT=postgres` (xem `docs/ci-postgres-job.md` và `tests/server/app-server.test.ts`).

1. Dựng một cụm PostgreSQL cục bộ và đặt `POSTGRES_HOST/PORT/USER/PASSWORD/DATABASE` như trong `docs/ci-postgres-job.md`.
2. Chạy từng tệp (không chạy cả bộ một lần): `tests/server/edu-crm-backup.test.ts`, `edu-import-universal.test.ts`, `edu-doi-soat.test.ts`, rồi `edu-diem-danh`, `edu-goi-hoc-chi-tiet`, `edu-scope`, `edu-scope-writes`, `edu-actions`, `edu-bao-cao`, `edu-xuat-csv`, `authorization-assignment-safety`.
3. Chỗ có khả năng khác SQLite, kiểm tra kỹ nếu có lỗi:
   - tổng (`sum`) trả về chuỗi trên PostgreSQL (mã đã bọc `Number()`);
   - bắt lỗi trùng khóa bằng nội dung thông báo (`/unique|duplicate/`) trong `saveAttendanceRow`;
   - logic boolean (`true`/`false`) và so sánh chuỗi ngày;
   - khôi phục sao lưu với `id` ghi tay: **dãy tự tăng (sequence) của PostgreSQL không tự nhảy theo**, bản ghi mới sau khi khôi phục có thể đụng id cũ — xử lý ở mục D.
4. Sửa lỗi phát hiện trong cùng PR #43. Nếu có quyền `workflows`, thêm job PostgreSQL vào CI theo `docs/ci-postgres-job.md`, cộng các tệp test mới của GĐ 0 vào danh sách.

**Xong khi:** các tệp trên pass trên PostgreSQL, hoặc lỗi còn lại được ghi rõ kèm cách xử lý.

## 5. Mục D — Sao lưu đủ bảng và khôi phục an toàn

Hiện trạng: `BACKUP_TABLES` có 15 bảng; khôi phục ghi từng dòng, bỏ qua dòng trùng, không có transaction, không báo bảng nào bị bỏ sót.

Việc cần làm (một PR riêng, nhánh mới):

1. **Thêm bảng còn thiếu**, theo thứ tự cha trước con: `eduHocVienLenCap`, `eduDongY`, `eduNopSach`, `eduSachHoc`, `eduHoSoGv`, `eduCoSoQuanLy`. Hai bảng cuối trỏ tới tài khoản (`userId`): bản sao lưu không chứa tài khoản, nên khôi phục sang cơ sở dữ liệu mới phải có tài khoản đó; khôi phục bỏ qua và **báo** dòng nào thiếu tài khoản.
2. **Dãy tự tăng trên PostgreSQL**: sau khôi phục, đặt lại sequence của mỗi bảng bằng `max(id)` (và để SQLite không cần làm gì).
3. **Khôi phục trong một transaction**: hoặc ghi hết, hoặc không ghi gì. Bản ghi trùng id mà **khác nội dung** là lỗi cần báo (không im lặng bỏ qua).
4. **Chạy thử trước khi ghi** (`dryRun`): trả về số dòng sẽ thêm / trùng / thiếu tài khoản cho từng bảng; trang Sao lưu hiện bảng này rồi mới cho gõ xác nhận.
5. **Phiên bản và kiểm tra định dạng**: `phienBan` của tệp phải khớp; từ chối tệp có cột lạ hoặc kiểu sai (kiểm tra bằng danh sách cột của từng bảng, không tin tệp).
6. **Cảnh báo tệp chứa dữ liệu trẻ em**: bản sao lưu có `ngaySinh` đầy đủ và số điện thoại; trang Sao lưu nhắc lưu nơi an toàn, không gửi qua kênh chat. (Chữ hiển thị đi qua khoá dịch.)
7. **Test**: vòng tròn sao lưu → xoá → khôi phục → so sánh từng bảng (SQLite và PostgreSQL); khôi phục lần hai không nhân đôi; id mới sau khôi phục không đụng id cũ; tài khoản thiếu được báo; vai không phải Quản trị bị 403.
8. Cập nhật `.agents/rules/edu.md` (bỏ câu "chưa đủ bảng"), ghi hướng dẫn khôi phục vào `docs/`.

**Xong khi:** vòng tròn sao lưu–khôi phục khôi phục đúng toàn bộ 21 bảng trên cả hai cơ sở dữ liệu.

Lưu ý quản lý: mỗi GĐ về sau thêm bảng mới (GĐ 3–5) phải thêm bảng đó vào `BACKUP_TABLES` trong cùng PR, kèm một dòng kiểm tra trong test vòng tròn.

## 6. Mục E — Đưa CI về xanh

Hiện `pnpm check` đỏ ở bước lint: `main` có 154 lỗi, PR #43 còn 107 (log CI cho thấy nhiều lỗi ở `client/pages/edu/hoc-phi.tsx`, `sao-luu.tsx`, `client/routes.ts`; cần chạy `pnpm exec eslint .` để có danh sách đủ).

1. PR riêng, không trộn với tính năng. Chia theo thư mục để dễ duyệt: (a) lỗi tự sửa được bằng `eslint --fix` (54 lỗi); (b) `no-floating-promises` / `no-misused-promises` (bọc `void`, hoặc hàm async có `catch`); (c) `no-explicit-any` và `no-unsafe-*` (khai báo kiểu cho dòng dữ liệu); (d) quy tắc React (`set-state-in-effect`).
2. Không tắt quy tắc, không thêm `eslint-disable` hàng loạt.
3. Sau mỗi nhóm chạy `pnpm exec eslint <thư mục>`, tsc và các test client của trang đã đổi.
4. Khi xanh, bật bắt buộc check `ds-check` cho nhánh `main` (cài đặt GitHub, cần quyền quản trị repo).

**Xong khi:** `pnpm check` xanh trên Node 24 ở CI.

## 7. Mục F — Đo hiệu năng trang Đối soát

`/doiSoat/tongQuan` đọc tất cả học viên, gói, thanh toán, phát sách qua policy, 100 dòng một lần (trần 100.000 dòng mỗi bảng); import đa năng xem trước tra từng dòng.

1. Với dữ liệu thật hoặc dữ liệu mẫu nhân lên (≈ 2.000 học viên, 10.000 dòng thanh toán), đo thời gian `tongQuan` cho Quản trị và cho QL cơ sở, trên SQLite và PostgreSQL.
2. Ngưỡng chấp nhận: dưới 3 giây cho Quản trị. Nếu vượt: phân trang phía server (nằm sẵn trong GĐ 1, mục 3.2) thay vì tối ưu vá.
3. Đo xem trước import 5.000 dòng; nếu quá 30 giây, gom tra cứu theo lô (tra theo tập mã thay vì từng dòng).

**Xong khi:** có con số đo ghi vào PR; chỉ sửa khi vượt ngưỡng.

## 8. Thứ tự và cách chia PR

1. **Ngay (trong PR #43):** B → C (sửa lỗi nếu có) → A (vận hành khi triển khai).
2. **PR riêng, trước GĐ 1:** E (CI xanh).
3. **PR riêng, trước GĐ 3:** D (sao lưu đủ bảng). Nên làm trước GĐ 1 nếu sao lưu JSON vẫn là bản sao lưu duy nhất đang dùng.
4. **Sau B, C:** F (đo).
5. **Sau GĐ 1–2 merge:** H (PR chỉ định dạng).
6. G không cần việc riêng.

Mỗi PR theo quy tắc chung của kế hoạch tổng: test trong `tests/`, chạy từng tệp liên quan, chạy `authorization-assignment-safety` khi đụng quyền, cập nhật `.agents/rules/edu.md`.

## 9. Điểm cần Thầy quyết

- Bản chạy thật `nocoedu.dsc.edu.vn` đang dùng PostgreSQL hay SQLite? Nếu SQLite thì mục C hạ xuống "nên làm".
- Có còn dùng sao lưu JSON làm bản sao lưu duy nhất không? Nếu có, mục D phải làm **trước** GĐ 1; nếu đã có sao lưu cơ sở dữ liệu ở tầng máy chủ (pg_dump hằng ngày), mục D làm sau đều được.
- Ai có quyền `workflows` trên GitHub để thêm job PostgreSQL vào CI (mục C) và bật check bắt buộc (mục E)?
