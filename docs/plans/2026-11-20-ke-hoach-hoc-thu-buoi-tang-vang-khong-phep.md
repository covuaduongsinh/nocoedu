# Kế hoạch buổi học thử, buổi tặng và trừ buổi vắng không phép (2026-11-20)

Trạng thái: **đã gộp vào `main` (PR #56) và chạy trên bản thật từ 14:17 ngày 20/11/2026** (mục 9). Còn hai việc của Thầy: đặt
ngày bắt đầu trừ vắng không phép cho từng cơ sở (Q2) và duyệt danh sách buổi học thử cũ (Q1) — mục 10.

## 1. Yêu cầu của Thầy

1. Buổi **học thử** không tính vào số buổi nộp của kỳ.
2. Đôi khi có **buổi tặng**, cũng không tính vào số buổi nộp của kỳ.
3. Sắp tới, học viên **nghỉ không phép** thì vẫn **trừ** vào số buổi nộp của kỳ.

Cả ba ảnh hưởng tới đối soát buổi nộp từng kỳ (hồ sơ 360°, phiếu báo phụ huynh, "Cần thu").

## 2. Hiện trạng (đọc mã và số liệu thật ngày 20/11/2026)

| Yêu cầu         | Đã có chưa                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Học thử         | **Chưa.** Chỉ có trạng thái _học viên_ "Học thử" (`eduHocVien.trangThai = hoc_thu`), không có trạng thái _buổi_. Điểm danh chỉ có 4 trạng thái: có mặt, vắng có phép, vắng không phép, học bù. Một buổi học thử được điểm "Có mặt" nên **bị trừ 1 buổi**. Trên bản thật: 9 học viên đang "Học thử" có 33 dòng điểm danh, 25 buổi đã bị trừ.                                                                                                                     |
| Buổi tặng       | **Chưa.** Không có trạng thái buổi, không có gói "tặng". Cách duy nhất hiện nay là sửa tay số dư, mà giao diện không có chỗ làm.                                                                                                                                                                                                                                                                                                                                |
| Vắng không phép | **Có một nửa.** `sessionsToDeduct` (`server/edu/so-du.ts`) đã biết trừ khi bật; quy tắc được **chốt vào từng buổi** ở lần lưu điểm danh đầu tiên (`eduBuoiHoc.truVangKhongPhep`), nên bật sau không làm đổi buổi cũ. Nhưng công tắc là biến môi trường `EDU_TRU_BUOI_VANG_KHONG_PHEP` cho **toàn hệ thống**: phải sửa máy chủ và khởi động lại, không chọn được ngày bắt đầu, không xem được trong giao diện. Bản thật đang tắt: 628/628 buổi chốt "không trừ". |

Ghi chú số liệu thật: buổi học mới nhất trong NocoEdu là 15/10/2026 (điểm danh vẫn đang làm ở Lark), nên chưa có buổi
nào cần đổi quy tắc ngay.

## 3. Thiết kế

### 3.1 Hai trạng thái điểm danh mới: "Học thử" và "Buổi tặng"

- `hoc_thu` (Học thử) và `tang` (Buổi tặng): học viên **có mặt**, **không trừ buổi** dù cơ sở cài đặt thế nào.
- Vì không trừ nên buổi đó không có dòng sổ số dư và **không thuộc kỳ nào** (phân bổ vào kỳ đọc từ sổ số dư,
  `server/edu/phan-bo-goi.ts`) — đúng nghĩa "không tính vào số buổi nộp của kỳ". Không phải sửa thuật toán phân bổ.
- Tính là **có mặt** ở mọi chỗ đếm chuyên cần: tỉ lệ chuyên cần của sổ điểm danh, báo cáo chuyên cần theo lớp, nhận
  xét tháng, và "đã học" kỹ năng của hệ thống kiến thức (học viên có ngồi học buổi đó).
- Chọn ngay trong sổ điểm danh (danh sách trạng thái của từng học viên), sửa lại được ở tab "Buổi học" của hồ sơ
  360°: đổi một buổi đã trừ sang "Học thử" sẽ **hoàn 1 buổi** bằng một dòng sổ số dư `diem_danh_sua` (đường sẵn có
  `saveAttendanceRow`, chỉ ghi phần chênh lệch).
- Nhập CSV điểm danh chấp nhận hai giá trị mới (`hoc_thu`, `tang`). Lệnh nhập Lark không đổi (Lark chỉ có 1/0).

Vì sao chọn "trạng thái buổi" thay vì "gói tặng N buổi": người điểm danh biết ngay buổi nào là học thử/tặng, đánh một
lần là xong, và hồ sơ/phiếu báo nói rõ **ngày nào** được miễn. Một "gói tặng" sẽ bị phân bổ vào kỳ theo thứ tự ngày
nên không chỉ được buổi cụ thể. Nếu sau này cần "tặng 2 buổi, dùng lúc nào cũng được" thì thêm loại gói `tang` (mục 7).

### 3.2 Trừ buổi vắng không phép: cài đặt theo cơ sở, có ngày bắt đầu

- Thêm vào cơ sở trường **"Trừ buổi vắng không phép từ ngày"** (`eduCoSo.truVangKhongPhepTuNgay`, `YYYY-MM-DD`, để
  trống = không trừ). Sửa trong hộp thoại sửa cơ sở (Danh mục → Cơ sở → ⋮ → Sửa); bảng cơ sở có thêm cột hiển thị.
- Buổi học có ngày **từ ngày đó trở đi** chốt "vắng không phép trừ 1 buổi" ở lần lưu điểm danh đầu tiên; buổi trước
  ngày đó chốt "không trừ". Giữ nguyên nguyên tắc cũ: quy tắc đã chốt vào một buổi thì không đổi nữa, nên đặt ngày
  về quá khứ cũng không làm thay đổi số dư của sổ đã lưu.
- Biến `EDU_TRU_BUOI_VANG_KHONG_PHEP=true` vẫn giữ nghĩa cũ (bật cho mọi cơ sở) để không phá cài đặt hiện có; bản
  thật không đặt biến này.
- Học bù sau một buổi vắng không phép **vẫn trừ** như hiện nay (học bù chỉ bù cho vắng có phép).

### 3.3 Hiển thị trong đối soát

- Hồ sơ 360°, tab "Buổi học": trạng thái mới có nhãn riêng; cột "Thuộc kỳ" của buổi không trừ ghi "Không trừ buổi"
  như trước. Bộ lọc trạng thái có hai giá trị mới.
- Sổ điểm danh: thêm hai cột đếm "Học thử", "Buổi tặng"; tỉ lệ chuyên cần tính cả hai là có mặt.
- Phiếu báo phụ huynh: thêm mục **"Học thử, buổi tặng — không tính buổi"** (ngày + loại) trong ảnh và lời nhắn. Buổi
  vắng không phép bị trừ đã có sẵn ô màu vàng "Vắng mặt, vẫn tính buổi". Mỗi buổi không tính được xếp vào đúng một
  kỳ: kỳ đầu nhận cả các buổi trước khi kỳ bắt đầu (buổi học thử thường ở đây), kỳ cuối nhận các buổi tới hôm nay.

### 3.4 Dữ liệu cũ: không tự sửa

Lịch sử nhập từ Lark không có trạng thái học thử/tặng, nên các buổi học thử cũ đang bị trừ. Đếm trên bản thật:
**86 học viên có 174 buổi có mặt đã trừ trước ngày nộp gói đầu tiên**; trong đó **55 em có đúng 1 buổi** (rất giống
một buổi học thử). Đổi các buổi này sẽ hoàn buổi và đổi số dư của nhiều học viên thật nên **không làm tự động** trong
đợt này (câu hỏi Q1, mục 6). Trong lúc chờ, từng buổi sửa được bằng tay ở hồ sơ 360° → "Buổi học" → sửa → "Học thử".

## 4. Thay đổi

| Phần      | Tệp                                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quy tắc   | `server/edu/so-du.ts` (trạng thái, `sessionsToDeduct`, `PRESENT_STATUSES`, `unexcusedAbsenceDeductsOn`), `server/edu/balance.ts` (`lockSessionRule`) |
| Đếm       | `server/edu/so-diem-danh.ts`, `server/edu/kien-thuc.ts`, `server/routes/edu-bao-cao.ts`, `server/routes/edu-nhan-xet.ts`                             |
| CSDL      | migration `202611200001_edu_co_so_tru_vang_khong_phep` (thêm cột vào `eduCoSo`)                                                                      |
| Cơ sở     | `server/edu/permissions.ts` (trường được đọc/ghi), `server/edu/sua-ban-ghi.ts` (kiểm ngày), `client/pages/edu/co-so.tsx`, `sua-xoa.tsx`              |
| Giao diện | sổ điểm danh, sổ tra cứu, hồ sơ 360° (`buoi-hoc.tsx`), huy hiệu trạng thái, phiếu báo (`phieu-bao/*`), câu chữ ba ngôn ngữ                           |
| Kiểm thử  | quy tắc trừ buổi, ngày bắt đầu theo cơ sở, migration, sổ điểm danh, phiếu báo, giao diện                                                             |
| Tài liệu  | `.agents/rules/edu.md`, `.nb-studio/memory/hoc-bu-tru-buoi.md`                                                                                       |

## 5. Kiểm tra

- Máy chủ (Node 24): `edu-diem-danh`, `edu-so-diem-danh`, `edu-diem-danh-tra-cuu`, `edu-doi-soat`, `edu-ho-so`,
  `edu-kien-thuc`, `edu-lark-rules`, `edu-import-universal`, `edu-crm-backup`, `tests/database/edu-migrations`.
- Client: `edu-diem-danh`, `edu-detail`, `edu-phieu-bao`, `edu-phieu-bao-dialog`, `edu-sua-xoa`.
- `pnpm typecheck`, `pnpm lint`; CI chạy toàn bộ và job PostgreSQL.
- Triển khai lên bản thật như PR #54 (sao lưu, build, migration tự chạy, kiểm chứng).

## 6. Câu hỏi cho Thầy

| #   | Câu hỏi                                                               | Đề xuất                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Có sửa hàng loạt các buổi học thử cũ (đang bị trừ) không?             | Có, nhưng theo danh sách Thầy duyệt: tôi xuất danh sách 55 em có đúng 1 buổi trước gói đầu tiên, Thầy đánh dấu em nào đúng là học thử, rồi mới chạy lệnh sửa (có chạy thử, sao lưu, nhật ký). |
| Q2  | Ngày bắt đầu trừ buổi vắng không phép cho từng cơ sở?                 | Thầy tự đặt trong Danh mục → Cơ sở khi chốt ngày; tôi không đặt sẵn.                                                                                                                          |
| Q3  | Có cần "gói tặng N buổi" (tặng trước, dùng buổi nào cũng được) không? | Chưa cần; dùng "Buổi tặng" từng buổi trước.                                                                                                                                                   |

## 7. Ngoài phạm vi đợt này

- Loại gói `tang` (tặng N buổi không gắn ngày).
- Sửa hàng loạt lịch sử (Q1).
- Trạng thái "học thử" của học viên tự đổi sang "đang học" khi mua gói đầu tiên.

## 8. Kết quả (20/11/2026)

Làm đúng thiết kế mục 3. Không đổi seed quyền (trường mới của cơ sở đi theo quyền `edu.coSo` sẵn có: chỉ Quản trị sửa).

| Kiểm tra                                                                                                                                                                                                                  | Kết quả    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `tests/server/edu-so-du-rules` (mới: học thử/tặng không trừ, ngày bắt đầu trừ vắng không phép, ngày hợp lệ)                                                                                                               | 6/6        |
| `tests/server/edu-diem-danh` (6 trạng thái × 2 cài đặt cơ sở; sửa "Có mặt" → "Học thử" hoàn 1 buổi qua sổ số dư; trừ vắng không phép theo ngày của cơ sở, chốt trên buổi)                                                 | 13/13      |
| `tests/server/edu-sua-xoa` (ngày không hợp lệ bị từ chối), `tests/database/edu-migrations` (migration mới lên/xuống)                                                                                                      | 4/4, 18/18 |
| `edu-so-diem-danh` (6), `edu-lark-rules` (16), `edu-diem-danh-tra-cuu` (7), `edu-doi-soat` (5), `edu-ho-so` (5), `edu-kien-thuc` (11), `edu-bao-cao` (11)                                                                 | qua        |
| `edu-import-universal` (13), `edu-crm-backup` (14), `edu-scope` (2), `edu-scope-writes` (6), `edu-actions` (4), `edu-goi-hoc-chi-tiet` (2), `edu-phieu-bao` (7), `app-server` (28), `authorization-assignment-safety` (2) | qua        |
| Client: `edu-diem-danh` (20, có ca chọn "Học thử"), `edu-phieu-bao` (12, mỗi buổi học thử/tặng vào đúng một kỳ), `edu-sua-xoa` (5, ô ngày của cơ sở), `edu-detail` (11), `edu-phieu-bao-dialog` (12), `edu-format` (3)    | qua        |
| `pnpm typecheck`, `eslint` và `prettier` trên các tệp đã sửa, `tests/project/agents-md`                                                                                                                                   | sạch       |
| Ảnh phiếu báo mẫu (có buổi học thử trước kỳ, buổi tặng trong kỳ, vắng không phép bị trừ) chụp bằng Edge, soát bằng mắt                                                                                                    | đúng       |

## 9. Gộp mã và triển khai (20/11/2026)

- PR #56, CI `ds-check` xanh: `check` (toàn bộ `pnpm check`, 6 phút 29 giây) và `postgres` (PostgreSQL 16, có
  `edu-diem-danh` với ca trừ vắng không phép theo ngày; 1 phút 43 giây). Gộp thành `64bfe91`.
- Sao lưu: `/root/backups/nocoedu-20261120-truoc-hoc-thu/` (`nocoedu.dump` 711 KB, `storage.tgz` 14,7 MB); image dự
  phòng `nocoedu-app:rollback-20261120-truoc-hoc-thu` (`a58d12ae0f2f`).
- Build từ `main@64bfe91` mất 35 phút (VPS tải trung bình 50–68 trên 6 nhân, do ứng dụng khác); nhật ký
  `/root/backups/redeploy-hoc-thu.log`. Container mới khoẻ sau 45 giây.
- Migration `202611200001_edu_co_so_tru_vang_khong_phep` chạy lúc 14:17 (batch 8); cột `tru_vang_khong_phep_tu_ngay`
  có, cả hai cơ sở (KL, VP) đang để trống → **chưa trừ vắng không phép ở đâu**.
- Số liệu trước = sau: 174 học viên, 5.658 dòng điểm danh, tổng số dư 106 buổi, 5.686 dòng sổ số dư. Nhật ký app: 0
  dòng lỗi. `healthz` 200, trang chủ 200, `/api/diemDanh/luu` khi chưa đăng nhập 401.
- Hoàn tác: `docker tag nocoedu-app:rollback-20261120-truoc-hoc-thu nocoedu-app:main` rồi
  `docker compose -p compose-synthesize-online-firewall-897jlk up -d app` trong thư mục compose; cột thừa không gây hại.

## 10. Việc của Thầy

### 10.1 Q2 — Bật trừ buổi vắng không phép

1. Vào **Danh mục → Cơ sở**, ở dòng cơ sở cần bật bấm **⋮ → Sửa**.
2. Ô **"Trừ buổi vắng không phép từ ngày"**: chọn ngày bắt đầu áp dụng (ví dụ ngày đầu tháng sau, và đã báo phụ
   huynh trước). Bấm **Lưu**. Bảng cơ sở hiện "Từ dd/mm/yyyy".
3. Từ đó, buổi học có ngày ≥ ngày đã chọn, khi điểm danh lần đầu, vắng không phép sẽ trừ 1 buổi; ở phiếu báo phụ
   huynh buổi đó có ô màu vàng "Vắng mặt, vẫn tính buổi". Buổi đã điểm danh trước đó giữ nguyên.
4. Muốn dừng: xoá trống ô ngày và lưu (buổi đã trừ không được hoàn tự động; sửa từng buổi nếu cần).

### 10.2 Dùng "Học thử" và "Buổi tặng" từ nay

- Khi điểm danh, ở cột trạng thái của học viên chọn **Học thử** hoặc **Buổi tặng** thay cho "Có mặt". Buổi đó không
  trừ và không nằm trong kỳ nào; phiếu báo ghi ở mục "Học thử, buổi tặng: không tính buổi".
- Sửa buổi đã lỡ trừ: hồ sơ 360° → tab **Buổi học** → nút sửa ở dòng buổi đó → **Trạng thái điểm danh** = "Học thử"
  hoặc "Buổi tặng" → Lưu. Hệ thống hoàn 1 buổi và ghi vào sổ số dư.

### 10.3 Q1 — Buổi học thử cũ đang bị trừ

Danh sách 55 học viên có **đúng 1 buổi** bị trừ trước ngày nộp gói đầu tiên (chỉ mã học viên, ngày buổi đó, ngày nộp
gói đầu, trạng thái, số dư hiện tại) đã được lập từ bản thật. **53/55 em có buổi đó cách ngày nộp gói đầu không quá 7
ngày**, 1 em 8–30 ngày, 1 em hơn 30 ngày — rất giống "học thử rồi đăng ký". Thầy chọn một trong hai:

- **Sửa tay** những em Thầy chắc chắn, theo mục 10.2 (mỗi em một buổi, mất khoảng 30 giây/em).
- **Sửa hàng loạt**: Thầy xác nhận "đổi cả 53 buổi (cách ≤ 7 ngày) sang Học thử"; người triển khai viết lệnh có chạy
  thử, sao lưu và nhật ký, chạy trong một giao dịch, mỗi em được hoàn 1 buổi qua sổ số dư. Số dư của 53 em sẽ tăng 1.
  31 em còn lại (có 2 buổi trở lên trước gói đầu) cần Thầy xem từng em.
