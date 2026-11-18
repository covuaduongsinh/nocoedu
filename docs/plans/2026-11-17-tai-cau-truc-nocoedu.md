# Tái cấu trúc NocoEdu: menu, Hồ sơ 360°, tra cứu điểm danh, nhóm trình độ, hệ thống kiến thức

> **Trạng thái (18/11/2026): hoàn tất cả 6 giai đoạn (GĐ 0–5).** GĐ 5 (Kiểm tra cấp) gộp qua PR #51. Chi tiết cách vận hành từng phần nằm ở `.agents/rules/edu.md`. Chưa làm, để dành cho kế hoạch sau: xoá bài kiểm tra nháp nhập nhầm; chạy tay 3 tài khoản mẫu (Quản trị, QL cơ sở, HLV) theo mục 7.

## 1. Bối cảnh

Thầy Tường thấy app đang rối: Điểm danh chỉ lọc được Hôm nay/Hôm qua/Tuần này; từ "Đối soát buổi học" lại bấm "Đối soát"; Đối soát – Học viên – Học phí trùng nội dung; chưa có hệ thống kiến thức chuyên môn để biết từng em nắm gì, hổng gì; chưa có nhóm trình độ trong lớp.

Rà soát mã nguồn xác nhận và bổ sung:

- **Trùng lặp thật**: `/doi-soat?hocVienId=` và `/hoc-vien/:id` (Hồ sơ 360°) cùng hiện buổi học, kỳ học phí, sách/quỹ, số dư của một em, do 2 bộ API khác nhau tính (kết quả "đã học" có thể lệch nhau). "Ai cần thu tiền" đang tính ở 4 nơi với ngưỡng khác nhau.
- **Điểm danh** tải toàn bộ buổi học (tối đa 2.000) rồi lọc trên trình duyệt, không phân trang, không lưu bộ lọc trên URL; "Hôm qua/Tuần này" tính theo giờ UTC nên lệch ngày so với giờ VN. Server chưa có endpoint tra cứu theo ngày/giáo viên/học viên.
- **Chưa có** bảng nhóm trong lớp, chương trình/kỹ năng, đánh giá, kiểm tra. Có sẵn 6 cấp cố định trong `server/edu/levels.ts`, 4 ô văn bản nội dung buổi dạy trên `eduBuoiHoc`.
- **Lỗi nền phát hiện thêm (cần sửa trước khi xây tiếp)** — nằm ở các route mới thêm gần đây, chưa có test:
  - `/edu/crm/lead-sync` không bắt đăng nhập, secret mặc định viết cứng trong mã.
  - `/heThong/backup/exportJson|importJson`, `/edu/import/*`, `/diemDanh/xuatCsv`, `/hocPhi/xuatCsv` không kiểm tra quyền nghiệp vụ → bất kỳ tài khoản đăng nhập nào cũng tải/ghi được toàn bộ dữ liệu.
  - `/doiSoat/*` và `/nhanXet/lichSuBuoiHoc|aiGoiY` đọc thô, bỏ qua phạm vi cơ sở/lớp (HLV xem được học viên lớp khác).
  - `/doiSoat/capNhatBuoiHoc` và import đa năng ghi thẳng `soBuoiConLai` không qua sổ nhật ký (trái quy tắc số dư trong `.agents/rules/edu.md`).
  - Link hỏng: `home.tsx` → `/ho-so-gv` (đúng là `/giao-vien`); `/hoc-phi?search=` bị bỏ qua; `tuyen-sinh.tsx` gọi `/lienHe/donDep` (server là `/lienHe/donQuaHan`).
  - Test cũ đã lệch với giao diện: `tests/client/edu-hoc-phi.test.tsx`, `edu-diem-danh.test.tsx`, `client-routes.test.ts` (đọc mã, chưa chạy).

Quyết định Thầy đã chọn: (1) khung kiến thức 6 cấp + nhập CSV; (2) gắn bài vào buổi + GV chấm tay theo ma trận + bài kiểm tra cấp; (3) mỗi lớp 3 nhóm chuẩn, đổi tên/thêm bớt được; (4) Hồ sơ 360° thành mục menu riêng, giữ Đối soát và Học viên.

## 2. Cấu trúc tổng thể (menu)

Sidebar hỗ trợ nhóm tiêu đề (route có `navigation` + `children`, không `componentLoader` — mẫu ở `client/pages/settings/shell-routes.ts`). Chia 5 nhóm:

| Nhóm                 | Mục                                         | Vai trò của trang                                           |
| -------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| —                    | Trang chủ                                   | Việc hôm nay, cảnh báo                                      |
| **Hằng ngày**        | Điểm danh · Nhận xét · Tuyển sinh           | Thao tác lặp lại mỗi ngày                                   |
| **Học viên**         | Học viên · **Hồ sơ 360°** (mới)             | Danh sách để quản lý · Tra cứu sâu một em                   |
| **Học phí & sách**   | Học phí · Đối soát buổi học · Phát sách     | Thu tiền · Soát toàn trung tâm · Sách                       |
| **Chuyên môn** (mới) | Chương trình · Tiến độ kiến thức · Kiểm tra | Khung kiến thức · Ma trận lớp × kỹ năng · Sát hạch          |
| **Danh mục**         | Lớp học · Cơ sở · Giáo viên · Sách          | Dữ liệu nền                                                 |
| —                    | Báo cáo                                     |                                                             |
| System settings      | Sao lưu dữ liệu chuyển vào đây              | Theo quy định AGENTS.md: trang quản trị không nằm ở sidebar |

Nguyên tắc chống trùng: **mỗi câu hỏi chỉ có một trang trả lời**.

- "Em này thế nào?" → chỉ **Hồ sơ 360°** (`/hoc-vien/:id`). Mọi nút "Đối soát", "Xem phiếu", tên học viên ở trang khác đều dẫn về đây, đúng tab.
- "Toàn trung tâm ai vượt buổi, ai nợ?" → chỉ **Đối soát** (bảng tổng). Tab "Cần thu" của Học phí và cảnh báo Trang chủ dùng chung một nguồn tính của server, một ngưỡng.
- "Thu tiền, bán gói" → chỉ **Học phí**.

## 3. Cấu trúc từng trang

### 3.1 Hồ sơ 360° — trang chi tiết duy nhất của học viên

- **Mục menu `/ho-so-360`**: ô tìm lớn (tên / mã HV / SĐT phụ huynh), lọc cơ sở–lớp, kết quả phân trang server → mở `/hoc-vien/:id`. Dùng lại quyền trang `edu.hocVien`.
- **`/hoc-vien/:id`**, tab lưu trên URL `?tab=`:
  1. **Tổng quan** — thẻ: buổi còn lại, đã học, đã nộp, nợ học phí/sách, cấp, nhóm, % kiến thức cấp hiện tại, số lỗ hổng cần bù; cột mốc theo kỳ nộp (chuyển từ Đối soát).
  2. **Buổi học** — lịch sử điểm danh, lọc theo kỳ/trạng thái, **sửa nhanh** (chuyển từ Đối soát, chỉ hiện khi có `edu.diemDanh.record`).
  3. **Học phí** — kỳ nộp + phân bổ FIFO + sổ số dư (gộp tab packages và ledger cũ).
  4. **Sách & quỹ**.
  5. **Kiến thức** (mới) — cây Cấp → Chủ đề → Kỹ năng, mỗi kỹ năng một trạng thái; khối "Cần bù" trên đầu.
  6. **Nhận xét** — nhận xét tháng/định kỳ đã lưu.
  7. **Phụ huynh**.
- Nút đầu trang: Thu phí (→ `/hoc-phi?search=`), In phiếu đối soát A4, Xuất CSV (chuyển từ Đối soát).
- Mỗi tab chỉ hiện khi người dùng có quyền `view` composite tương ứng (giữ quy tắc hiện có).

### 3.2 Đối soát buổi học — chỉ còn bảng tổng

- Giữ 6 thẻ KPI + bộ lọc + bảng; thêm phân trang server, bộ lọc lên URL.
- Nút mỗi dòng đổi thành **"Mở hồ sơ"** → `/hoc-vien/:id?tab=buoi-hoc`. Bỏ chế độ chi tiết; `/doi-soat?hocVienId=X` tự chuyển hướng sang Hồ sơ 360°.

### 3.3 Học phí

- 3 tab giữ nguyên (lưu trên URL): Quầy thu ngân · Sổ quỹ (thêm lọc tháng, hiện tên học viên thay vì "#id") · Cần thu (lấy từ nguồn chung với Đối soát).
- Đọc `?search=` để mở sẵn học viên. Bỏ nút "Xem phiếu đối soát", thay bằng link Hồ sơ 360°.

### 3.4 Điểm danh — 2 tab

- **Điểm danh** (mặc định): ca hôm nay + bảng điểm danh như hiện tại; bảng chia khối theo **nhóm**; phần "Nội dung buổi học" thêm chọn **kỹ năng đã dạy** cho từng nhóm.
- **Sổ điểm danh** (tra cứu):
  - Tab thời gian dựng sẵn: Hôm nay · Tuần này · Tháng này · Năm nay · Tuỳ chọn, có nút ‹ › lùi/tiến một kỳ.
  - Bộ lọc: Cơ sở · Lớp · Giáo viên · Học viên · Nhóm · Trạng thái.
  - 3 cách xem: **Theo buổi** (danh sách ca, sĩ số có mặt/vắng) · **Theo học viên** (mỗi em một dòng: có mặt / vắng phép / vắng không phép / học bù / tỉ lệ) · **Theo giáo viên** (số ca, số lượt học viên).
  - Lọc và phân trang trên server; toàn bộ trạng thái nằm trên URL; ngày tính theo giờ VN (`todayVn`).

### 3.5 Lớp học (`/lop/:id`)

- Thêm tab **Nhóm**: 3 nhóm mặc định Nhập môn / Cơ bản / Nâng cao; đổi tên, thêm, ẩn; chuyển học viên giữa các nhóm (ghi lịch sử).
- Thêm tab **Tiến độ kiến thức**: ma trận của lớp (dùng chung component với 3.6).

### 3.6 Chuyên môn (mới)

- **Chương trình `/chuong-trinh`**: cây 6 cấp (cố định) → Chủ đề → Kỹ năng/bài; thêm–sửa–ẩn–sắp thứ tự; nhập/xuất CSV. Chỉ Quản trị sửa, vai trò khác xem.
- **Tiến độ kiến thức `/kien-thuc`**: chọn lớp (+ nhóm, cấp) → ma trận Học viên × Kỹ năng; bấm ô để chấm tay (Chưa học / Chưa vững / Đạt / Vững); chế độ xem **"Lỗ hổng cần bù"** liệt kê theo kỹ năng những em vắng buổi dạy hoặc chưa vững.
- **Kiểm tra `/kiem-tra`**: danh sách bài kiểm tra (định kỳ / lên cấp) → tạo bài (chọn cấp, lớp, các kỹ năng, điểm tối đa, ngưỡng đạt) → nhập điểm theo kỹ năng cho từng em → kết quả tự cập nhật mức nắm; em đạt bài lên cấp được gắn nhãn "Đủ điều kiện lên cấp" kèm nút gọi `/hocVien/lenCap` sẵn có (không tự động lên cấp).

## 4. Mô hình dữ liệu mới

Mọi bảng là migration mới, tự chứa, có `down` (mẫu: `database/main/migrations/202611090003_edu_buoi_hoc_rule_snapshot.ts`). Ngày dạng chữ `YYYY-MM-DD`.

| Bảng                   | Cột chính                                                                                                                                                                              | Ghi chú                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `eduLopNhom`           | `lopId` FK, `ten`, `thuTu`, `trangThai`                                                                                                                                                | Migration kèm tạo 3 nhóm cho mọi lớp đang có; tạo lớp mới thì tự sinh 3 nhóm |
| `eduHocVien.nhomId`    | FK nullable → `eduLopNhom`                                                                                                                                                             | Chỉ đổi qua `POST /hocVien/chuyenNhom`; `/hocVien/chuyenLop` đặt về null     |
| `eduHocVienChuyenNhom` | `hocVienId`, `tuNhomId`, `denNhomId`, `ngay`, `nguoiThucHienId`, `ghiChu`                                                                                                              | Lịch sử, chỉ thêm                                                            |
| `eduChuDe`             | `levelKey`, `ma` unique, `ten`, `thuTu`, `trangThai`                                                                                                                                   | Cấp lấy từ `server/edu/levels.ts`, không tạo bảng cấp                        |
| `eduKyNang`            | `chuDeId` FK, `ma` unique, `ten`, `moTa`, `thuTu`, `trangThai`, `sachId` nullable                                                                                                      | Đơn vị kiến thức nhỏ nhất                                                    |
| `eduBuoiHocKyNang`     | `buoiHocId` FK, `lopId` FK, `kyNangId` FK, `nhomId` nullable; unique                                                                                                                   | Bài đã dạy trong buổi, theo nhóm                                             |
| `eduHocVienKyNang`     | `hocVienId` FK, `kyNangId` FK (unique cặp), `mucDo` (`da_hoc`/`chua_vung`/`dat`/`vung`), `nguon` (`buoi_hoc`/`cham_tay`/`kiem_tra`), `buoiHocId` nullable, `nguoiChamId`, `capNhatLuc` | Trạng thái hiện tại                                                          |
| `eduBaiKiemTra`        | `ten`, `loai` (`dinh_ky`/`len_cap`), `levelKey`, `lopId` FK, `coSoId` FK, `ngay`, `diemDat` (%), `trangThai`, `nguoiTaoId`                                                             |                                                                              |
| `eduBaiKiemTraKyNang`  | `baiKiemTraId` FK, `kyNangId` FK, `diemToiDa`                                                                                                                                          |                                                                              |
| `eduKetQuaKiemTra`     | `baiKiemTraId`, `hocVienId`, `kyNangId` (unique bộ ba), `diem`                                                                                                                         |                                                                              |
| Chỉ mục                | `eduDiemDanh(hocVienId)`                                                                                                                                                               | Phục vụ tra cứu theo học viên                                                |

**Quy tắc suy ra "lỗ hổng"** (tính khi đọc, không lưu): kỹ năng đã dạy cho lớp/nhóm của em (`eduBuoiHocKyNang`) mà em không `co_mat`/`hoc_bu` ở buổi đó và chưa có bản ghi `eduHocVienKyNang` từ nguồn khác; hoặc `mucDo = chua_vung`. Khi lưu điểm danh, em có mặt được ghi `da_hoc` cho các kỹ năng của buổi (không ghi đè mức cao hơn đã có).

**Quyền** (thêm vào `server/edu/permissions.ts`, `server/edu/pages.ts`, `database/seed-data/edu-permission-sets.ts`; cấp quyền bằng **seed mới**, không sửa seed cũ):

| Composite                       | Quản trị | QL cơ sở            | HLV               | Kế toán |
| ------------------------------- | -------- | ------------------- | ----------------- | ------- |
| `edu.chuongTrinh` view / manage | cả hai   | view                | view              | view    |
| `edu.lopNhom` view / manage     | cả hai   | cả hai (cơ sở mình) | cả hai (lớp mình) | view    |
| `edu.kienThuc` view / record    | cả hai   | cả hai              | cả hai (lớp mình) | —       |
| `edu.kiemTra` view / manage     | cả hai   | cả hai              | cả hai (lớp mình) | —       |

Trang: `edu.chuongTrinh`, `edu.kienThuc`, `edu.kiemTra`. Không gán cho `authenticated:*` hay vai `member`.

## 5. Kế hoạch 6 giai đoạn (mỗi giai đoạn một phiên, một PR)

| GĐ                        | Nội dung                                                                                                                                                                                                                                                                                                                      | Tệp chính                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Gia cố nền**         | Thêm kiểm tra quyền + phạm vi cho `edu-crm-backup.ts`, `edu-import-universal.ts`, `edu-doi-soat.ts`, `edu-nhan-xet.ts` (2 route); mọi thay đổi số dư đi qua `moveBalance`; ghi nhật ký xuất + `csvCell`; sửa 3 link hỏng; cập nhật 3 test lệch; thêm test cho các route chưa có                                               | `server/routes/edu-*.ts`, `tests/server/`, `tests/client/`                                                                                           |
| **1. Menu + Hồ sơ 360°**  | Nhóm menu; `/ho-so-360`; gộp chi tiết Đối soát vào `/hoc-vien/:id` (một endpoint tổng hợp duy nhất, dùng `server/edu/phan-bo-goi.ts`); chuyển hướng link cũ; tab trên URL; Học phí đọc `?search=`; một nguồn "cần thu"; gom tiện ích dùng chung (định dạng tiền, tải CSV, `SessionBalanceBadge`); Sao lưu vào System settings | `client/routes.ts`, `client/pages/edu/{hoc-vien-chi-tiet,doi-soat,hoc-phi}.tsx`, `client/lib/navigation-transform.ts`, `client/locales/edu-copy*.ts` |
| **2. Sổ điểm danh**       | `POST /diemDanh/traCuu` (lọc ngày/cơ sở/lớp/GV/HV/trạng thái, 3 chế độ, phân trang, qua policy); tab Sổ điểm danh; sửa lệch ngày UTC                                                                                                                                                                                          | `server/routes/edu-hoc-phi.ts` hoặc tệp mới `edu-diem-danh-tra-cuu.ts`, `client/pages/edu/diem-danh.tsx` (tách thư mục)                              |
| **3. Nhóm trình độ**      | 3 bảng/cột nhóm; `/hocVien/chuyenNhom`; tab Nhóm ở lớp; chia khối + lọc nhóm ở Điểm danh và Sổ điểm danh                                                                                                                                                                                                                      | migrations, `server/routes/edu-actions.ts`, `client/pages/edu/lop-chi-tiet.tsx`                                                                      |
| **4. Hệ thống kiến thức** | Bảng chủ đề/kỹ năng + nhập CSV; chọn kỹ năng đã dạy khi điểm danh; ma trận chấm tay; tab Kiến thức ở Hồ sơ 360°; xem "Lỗ hổng cần bù"; loại báo cáo mới                                                                                                                                                                       | migrations, `server/routes/edu-kien-thuc.ts`, `client/pages/edu/{chuong-trinh,kien-thuc}/`                                                           |
| **5. Kiểm tra cấp**       | 3 bảng kiểm tra; trang Kiểm tra; cập nhật mức nắm; gợi ý lên cấp                                                                                                                                                                                                                                                              | migrations, `server/routes/edu-kiem-tra.ts`, `client/pages/edu/kiem-tra/`                                                                            |

GĐ 0 phải xong trước; GĐ 1 và 2 độc lập nhau; GĐ 3 → 4 → 5 theo thứ tự.

**Dùng lại, không viết mới**: `usePagedRows`/`useRowsByIds`/`useRequest` (`client/pages/edu/kit.ts`), `ListPage`/`RowsTable` (`list-page.tsx`), `FormDialog` (`form-parts.tsx`), `GenericImportDialog`, `useTableUrlState` + `useListTabs` (`client/hooks/`), `DataTable` (`client/components/data-table/`), `needs`/`policyOf` (`server/routes/edu-support.ts`), `anyOf` (`server/edu/filters.ts`), `todayVn`/`datesBetween` (`server/edu/so-du.ts`), `moveBalance` (`server/routes/edu-hoc-phi.ts`), `seedSchool`/`userWithRole` (`tests/helpers/edu.ts`).

## 6. Bộ prompt cho các phiên triển khai

Mỗi prompt dưới đây trỏ về chính tệp này (`docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`); thay `[Phần chung]` bằng khối "Phần chung" rồi dán vào phiên mới.

**Phần chung — dán ở đầu mọi prompt:**

```
Bạn làm việc trong repo covuaduongsinh/nocoedu (NocoBase 3). Trước khi sửa, đọc: AGENTS.md,
.agents/rules/edu.md, .agents/rules/shell.md, .agents/rules/components.md và
docs/plans/2026-11-17-tai-cau-truc-nocoedu.md (kế hoạch tổng — mục 2, 3, 4 là thiết kế đã chốt,
không thiết kế lại). Chạy `pnpm install` nếu thiếu .agents/skills/.
Ràng buộc bắt buộc:
- Mọi route /api: auth.required() + needs('edu.x','action') trên đúng path của nó, đọc/ghi qua
  policy (policyOf + withPolicy), không đọc bảng thô, không router.use('*').
- soBuoiConLai chỉ đổi qua moveBalance, cùng transaction với dòng sổ nhật ký.
- Migration mới, tự chứa, có down; không sửa migration/seed đã merge; cấp quyền bằng seed mới và
  chạy `pnpm exec tsx scripts/generate-edu-permission-seed.mts` nếu đổi tệp nguồn permission set.
- Danh sách phân trang server 25 dòng (usePagedRows); bộ lọc và tab lưu trên URL.
- Mọi chữ hiển thị đi qua khoá dịch trong client/locales/edu-copy*.ts (vi/en/zh); chỉ dùng
  component shadcn có sẵn và token màu ngữ nghĩa.
- Dữ liệu trẻ em: test/seed dùng tên giả "Học viên Mẫu 01".
- Viết test trong tests/ (server: đã đăng nhập / chưa đăng nhập / sai quyền / sai phạm vi;
  migration up+down; client từ tests/client/page-harness.test.tsx). Chạy từng tệp test liên quan,
  không chạy pnpm check toàn bộ. Luôn chạy tests/server/authorization-assignment-safety.test.ts
  khi đụng tới quyền.
- Cập nhật .agents/rules/edu.md cho phần vừa thêm. Commit, push lên nhánh được giao, mở PR nháp.
- Cuối phiên báo: đã làm gì, test nào đã chạy và kết quả, phần nào chưa kiểm chứng.
```

**Prompt GĐ 0 — Gia cố nền**

```
[Phần chung]
Nhiệm vụ: thực hiện Giai đoạn 0 trong kế hoạch. Cụ thể:
1. server/routes/edu-crm-backup.ts: /edu/crm/lead-sync phải xác thực chữ ký/token bắt buộc, secret
   chỉ lấy từ biến môi trường (không có thì từ chối); /heThong/backup/* chỉ Quản trị; /diemDanh/xuatCsv
   và /hocPhi/xuatCsv kiểm tra composite, đọc qua policy, ghi eduXuatDuLieuNhatKy, dùng csvCell.
2. server/routes/edu-import-universal.ts: mỗi entity kiểm tra composite manage tương ứng; phần ghi số dư
   đi qua moveBalance; buổi học tạo ra dùng trạng thái hợp lệ (da_diem_danh).
3. server/routes/edu-doi-soat.ts: tongQuan và chiTietHocVien đọc qua policy (đúng phạm vi cơ sở/lớp),
   sửa cột quanHe; capNhatBuoiHoc kiểm tra phạm vi, dùng quy tắc trừ buổi đã chốt trên buổi học và
   moveBalance. Thống nhất "đã học" = tổng soBuoiDaTru.
4. server/routes/edu-nhan-xet.ts: lichSuBuoiHoc và aiGoiY kiểm tra phạm vi học viên.
5. Sửa link hỏng: home.tsx (/ho-so-gv → /giao-vien), tuyen-sinh.tsx (/lienHe/donDep → /lienHe/donQuaHan).
6. Cập nhật test lệch (tests/client/edu-hoc-phi.test.tsx, edu-diem-danh.test.tsx, client-routes.test.ts)
   theo hành vi đúng; thêm test server cho mọi route ở mục 1–4.
Không đổi giao diện ngoài mục 5. Nếu sửa một route làm hỏng trang đang dùng, sửa trang cho khớp.
```

**Prompt GĐ 1 — Menu + Hồ sơ 360°**

```
[Phần chung]
Nhiệm vụ: Giai đoạn 1 (mục 2, 3.1, 3.2, 3.3 của kế hoạch).
1. client/routes.ts: nhóm menu theo bảng mục 2 (mẫu nhóm: client/pages/settings/shell-routes.ts);
   giữ nguyên id trang và authz hiện có; thêm /ho-so-360 dùng quyền trang edu.hocVien; chuyển
   Sao lưu dữ liệu vào System settings. Thêm khoá edu.nav.* cho tiêu đề nhóm.
2. Hồ sơ 360° (client/pages/edu/hoc-vien-chi-tiet.tsx → tách thành thư mục): 7 tab theo mục 3.1,
   tab trên URL ?tab=. Chuyển từ doi-soat.tsx sang: cột mốc theo kỳ, sửa nhanh buổi học, in phiếu A4,
   xuất CSV. Server: một endpoint tổng hợp duy nhất cho hồ sơ (qua policy, phân bổ kỳ dùng
   server/edu/phan-bo-goi.ts); bỏ /hocVien/doiSoatTongThe và /doiSoat/chiTietHocVien sau khi chuyển.
   Tab Kiến thức và Nhận xét: Nhận xét làm ngay; Kiến thức để trạng thái rỗng "sẽ có ở GĐ 4".
3. Đối soát: chỉ còn bảng tổng, phân trang server, bộ lọc trên URL, nút dòng "Mở hồ sơ"
   → /hoc-vien/:id?tab=buoi-hoc; /doi-soat?hocVienId=X chuyển hướng sang hồ sơ.
4. Học phí: tab trên URL; đọc ?search=; Sổ quỹ lọc tháng + hiện tên học viên; "Cần thu", KPI Đối soát
   và cảnh báo Trang chủ dùng chung một hàm server và ngưỡng LOW_BALANCE_THRESHOLD.
5. Gom tiện ích trùng: định dạng tiền, tải CSV, nhãn trạng thái điểm danh, SessionBalanceBadge.
6. Test: client-routes, tests/client/page-permission-titles.test.ts, edu-detail, trang ho-so-360,
   chuyển hướng doi-soat; test server cho endpoint hồ sơ (4 vai trò, đúng phạm vi).
```

**Prompt GĐ 2 — Sổ điểm danh**

```
[Phần chung]
Nhiệm vụ: Giai đoạn 2 (mục 3.4 phần "Sổ điểm danh").
1. Server: POST /diemDanh/traCuu, input {tuNgay, denNgay, coSoId?, lopId?, hlvId?, hocVienId?,
   trangThai?, cheDo: 'buoi'|'hocVien'|'giaoVien', limit, offset}; khoảng tối đa 366 ngày; cần
   edu.diemDanh.view; lọc ngày qua eduBuoiHoc.ngay, giáo viên qua eduBuoiHoc.hlvId; mọi truy vấn qua
   policy; trả {data, meta:{count}} và tổng hợp theo chế độ. Migration thêm chỉ mục eduDiemDanh(hocVienId).
2. Client: tách client/pages/edu/diem-danh.tsx thành thư mục; 2 tab (Điểm danh / Sổ điểm danh) trên URL.
   Sổ điểm danh: tab thời gian Hôm nay · Tuần này · Tháng này · Năm nay · Tuỳ chọn + nút ‹ ›;
   bộ lọc Cơ sở · Lớp · Giáo viên · Học viên · Trạng thái; 3 cách xem; phân trang; trạng thái trên URL
   (client/hooks/use-table-url-state.ts). Ngày tính theo giờ VN, bỏ toISOString().
   Bấm một buổi → mở tab Điểm danh với ?buoi=.
3. Tab Điểm danh giữ nguyên chức năng; chỉ thay cách tải buổi học (không tải cả 2.000 dòng).
4. Test server (lọc từng tham số, phạm vi HLV chỉ thấy lớp mình, 401/403) và test client.
Bộ lọc Nhóm sẽ thêm ở GĐ 3 — chừa chỗ, chưa làm.
```

**Prompt GĐ 3 — Nhóm trình độ trong lớp**

```
[Phần chung]
Nhiệm vụ: Giai đoạn 3 (mục 3.5 tab Nhóm, mục 4 các dòng eduLopNhom, eduHocVien.nhomId,
eduHocVienChuyenNhom, composite edu.lopNhom).
1. Migration tạo bảng/cột; cùng migration tạo 3 nhóm "Nhập môn", "Cơ bản", "Nâng cao" cho mọi lớp
   đang có. Tạo lớp mới tự sinh 3 nhóm.
2. Server: record API cho lopNhom (kiểm tra lớp cha trong phạm vi như edu-data.ts làm với lopLich);
   POST /hocVien/chuyenNhom (nhóm phải thuộc lớp hiện tại của em, ghi lịch sử);
   /hocVien/chuyenLop đặt nhomId về null; không cho ẩn nhóm còn học viên.
3. Quyền theo bảng mục 4, cấp bằng seed mới.
4. Client: tab Nhóm ở /lop/:id (đổi tên, thêm, ẩn, chuyển học viên); bảng điểm danh chia khối theo
   nhóm; thêm bộ lọc Nhóm vào Sổ điểm danh và tham số nhomId cho /diemDanh/traCuu; hiện nhóm ở
   Hồ sơ 360° và danh sách Học viên.
5. Test: migration up/down, phạm vi (HLV lớp khác bị từ chối), chuyển nhóm, client.
```

**Prompt GĐ 4 — Hệ thống kiến thức**

```
[Phần chung]
Nhiệm vụ: Giai đoạn 4 (mục 3.6 Chương trình + Tiến độ kiến thức, mục 3.1 tab Kiến thức, mục 4).
1. Migration: eduChuDe, eduKyNang, eduBuoiHocKyNang, eduHocVienKyNang. Không seed nội dung chủ đề/
   kỹ năng (Thầy Tường nhập bằng CSV); 6 cấp lấy từ server/edu/levels.ts.
2. Server (tệp mới edu-kien-thuc.ts): CRUD chủ đề/kỹ năng (manage chỉ Quản trị); nhập/xuất CSV theo
   mẫu của edu-nhap-csv.ts (xem trước → xác nhận, mutex, giới hạn dòng); /buoiHoc/kyNang/luu|xem
   (kỹ năng đã dạy theo nhóm); khi /diemDanh/luu chạy, em có mặt/học bù được ghi da_hoc cho kỹ năng
   của buổi, không ghi đè mức cao hơn; /kienThuc/maTran {lopId, nhomId?, levelKey?};
   /kienThuc/cham (chấm tay 1 ô hoặc hàng loạt); /kienThuc/loHong {lopId|hocVienId} theo quy tắc mục 4.
3. Quyền edu.chuongTrinh, edu.kienThuc + trang edu.chuongTrinh, edu.kienThuc, seed mới.
4. Client: /chuong-trinh (cây + nhập CSV); /kien-thuc (ma trận, chấm nhanh, chế độ "Lỗ hổng cần bù");
   tab Tiến độ kiến thức ở /lop/:id; tab Kiến thức ở Hồ sơ 360°; ô chọn kỹ năng đã dạy trong phần
   Nội dung buổi học của Điểm danh; thẻ "% kiến thức" và "cần bù" ở tab Tổng quan hồ sơ.
5. Báo cáo: thêm loại "loHongKienThuc" vào /baoCao/xem (gating edu.kienThuc.view).
6. Test đầy đủ: suy ra lỗ hổng (vắng buổi dạy, chưa vững, đã học bù), phạm vi, CSV, client.
Kèm tệp CSV mẫu (chỉ tiêu đề cột + 2 dòng ví dụ) trong docs/ để Thầy điền.
```

**Prompt GĐ 5 — Kiểm tra cấp**

```
[Phần chung]
Nhiệm vụ: Giai đoạn 5 (mục 3.6 Kiểm tra, mục 4 các bảng eduBaiKiemTra*, eduKetQuaKiemTra).
1. Migration 3 bảng; composite edu.kiemTra + trang edu.kiemTra; seed quyền mới.
2. Server (edu-kiem-tra.ts): tạo/sửa bài (chỉ sửa khi chưa có kết quả), nhập điểm theo kỹ năng cho
   từng em (học viên phải thuộc lớp của bài và trong phạm vi), chốt bài → cập nhật eduHocVienKyNang
   (nguon='kiem_tra': dưới ngưỡng → chua_vung, đạt → dat, ≥ 90% → vung); trả danh sách em đạt bài
   len_cap. Không tự lên cấp.
3. Client: /kiem-tra (danh sách, tạo bài, lưới nhập điểm, trang kết quả); nhãn "Đủ điều kiện lên cấp"
   + nút gọi /hocVien/lenCap sẵn có (chỉ hiện khi có edu.hocVien.levelUp); kết quả kiểm tra hiện ở
   tab Kiến thức của Hồ sơ 360°.
4. Test server + client; kiểm tra người dùng chỉ có vai HLV: nút ẩn và gọi API trực tiếp bị từ chối.
```

## 7. Kiểm chứng

- Mỗi giai đoạn triển khai: chạy từng tệp test liên quan (`pnpm exec vitest run tests/server/<tệp>`), `tests/server/authorization-assignment-safety.test.ts` khi đổi quyền, `tests/client/client-routes.test.ts` + `page-permission-titles.test.ts` khi đổi route; chạy `pnpm dev`, đăng nhập lần lượt 3 tài khoản mẫu (Quản trị, QL cơ sở, HLV) để xác nhận menu, tab, nút ẩn đúng quyền và gọi API trực tiếp bị từ chối khi sai vai.

## 8. Điểm cần Thầy lưu ý

- Các lỗ hổng ở GĐ 0 đang tồn tại trên bản chạy thật `nocoedu.dsc.edu.vn` nếu bản đó đã triển khai các commit gần nhất; nên làm GĐ 0 trước mọi việc khác.
- Nhận định "test đã lệch" dựa trên đọc mã, chưa chạy test (container chưa cài `node_modules`).
- Nội dung chủ đề/kỹ năng do Thầy cung cấp qua CSV; app chỉ dựng khung.
