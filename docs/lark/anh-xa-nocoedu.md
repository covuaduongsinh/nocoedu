# Ánh xạ Lark → NocoEdu (giai đoạn 2: đã cài, các mặc định chờ Thầy Tường xác nhận)

Dựa trên [schema.md](schema.md) và [quy-tac-nghiep-vu.md](quy-tac-nghiep-vu.md). Bảng NocoEdu theo `database/main/migrations/202611090001_create_edu_tables.ts`. Giai đoạn 2 đã thêm migration `202611100001_edu_lark_mapping` và cài quy tắc thành code (mục dưới). Các câu chưa được Thầy Tường trả lời làm theo khuyến nghị; sửa một hằng số trong `server/edu/lark/chua-xac-nhan.ts`, không cần migration mới.

## Đã cài ở giai đoạn 2

Thầy Tường đã trả lời các câu hỏi (comment `396805820907520`, 09/11/2026); phần dưới ghi câu nào **đã xác nhận** và câu nào còn dùng **mặc định**.

- **Migration** `database/main/migrations/202611100001_edu_lark_mapping.ts` (chỉ thêm cột, có `down`): `externalId` (chuỗi 96, duy nhất khi có) trên `eduCoSo`, `eduLop`, `eduLopLich`, `eduHocVien`, `eduPhuHuynh`, `eduGoiHoc`, `eduBuoiHoc`, `eduDiemDanh`; `eduHocVien.externalCode` (mã cũ) và `eduHocVien.ngaySinh` (ngày sinh đủ, `YYYY-MM-DD`); `eduPhuHuynh.email`; `eduBuoiHoc.keHoachDay/kienThucMoi/giaoBtvn/keHoachBuoiSau`; `eduDiemDanh.yThucDiem` (điểm ý thức; tên `diemYThuc` không qua được bước đổi tên cột của framework) và `tinhVaoSoDu`; `eduGoiHoc.loai` (`mua` hoặc `chuyen_so_du`) và `ghiChu`. Không cột nào nằm trong danh sách trường quyền, nên không API bản ghi chuẩn nào trả về chúng.
- **Ngày sinh**: chỉ đọc được qua `POST /hocVien/ngaySinh`, cần hành động `edu.hocVien.manage` (quản trị và quản lý cơ sở, quản lý chỉ thấy học viên cơ sở mình); HLV, kế toán và API chỉ đọc bị từ chối. Năm sinh `namSinh` vẫn tính từ ngày sinh.
- **Quy tắc** là hàm thuần trong `server/edu/lark/` (`chuan-hoa.ts`, `diem-danh.ts`, `so-du.ts`), gom ở dịch vụ `eduLarkMappingToken` (`server/providers/edu-lark-mapping.ts`, không mở route). Hằng số ở `chua-xac-nhan.ts`, mỗi hằng số ghi số câu hỏi và đã xác nhận hay mặc định.
- **Nguồn điểm danh duy nhất là Base**, mọi năm. Sheets KL357/VP26 chỉ là danh sách dự kiến (`1` đã đăng ký, `!`/`?` dự kiến hoặc học thử, `x` đã báo nghỉ đột xuất): không nhập điểm danh từ Sheets, và không cần tìm lớp cho buổi từ Sheets.
- **Số dư buổi = số buổi đã nộp − số buổi có mặt.** Vắng (`0`) chưa trừ buổi; sau này có thể trừ khi vắng không phép bằng `EDU_TRU_BUOI_VANG_KHONG_PHEP=true` (và `eduCoSo.truBuoiVangCoPhep` cho vắng có phép). Lark không phân biệt có phép hay không, nên mọi `0` là `vang_khong_phep`.
- **Gói mở đầu** (bảng nộp tiền không đọc được): mỗi học viên có số dư chốt thì có một `eduGoiHoc` với `loai = chuyen_so_du`, `donGia = thanhTien = 0`, `ghiChu = chuyen_tu_lark`, `externalId = lark:sodu:<rec học viên>`; sổ `eduSoDuNhatKy` ghi một dòng `chuyen_tu_lark` (+N) cho gói đó. `nguoiTaoId` và `nguoiThucHienId` là người chạy lệnh nhập (giai đoạn 3 bắt buộc truyền `--user`).
- **Điểm danh trước ngày chốt**: `tinhVaoSoDu = false`, `soBuoiDaTru = 0`. Sửa trạng thái một dòng như vậy qua `/diemDanh/luu` không đổi số dư và không ghi sổ. Học viên không có số dư chốt: mọi dòng `tinhVaoSoDu = false`, số dư 0, bản chạy thử báo `KHONG_CO_SO_DU`.
- **"học lớp 2"** là tuổi đi học của học viên, không phải học bù: báo `DIEM_DANH_KHONG_RO`, không trừ buổi, không lưu lớp ở trường.

### Các câu hỏi

| Câu  | Trả lời / mặc định                                                                     | Trạng thái  | Hằng số                                 |
| ---- | -------------------------------------------------------------------------------------- | ----------- | --------------------------------------- |
| 1, 2 | Base là nguồn điểm danh duy nhất; Sheets chỉ là danh sách dự kiến                      | đã xác nhận | `ATTENDANCE_SOURCE`                     |
| 3    | `0` là vắng, không phân biệt có phép hay không; vắng chưa trừ buổi                     | đã xác nhận | `ATTENDANCE_CODES`                      |
| 4    | `học lớp 2` là tuổi học lớp 2, không phải học bù → `DIEM_DANH_KHONG_RO`                | đã xác nhận | `ATTENDANCE_CODES`                      |
| 5    | Số dư = số buổi đã nộp − số buổi có mặt; gói mở đầu từ "số buổi tồn update"            | đã xác nhận | `OPENING_BALANCE_RULE`                  |
| 6    | `NM1`, `NM2` → `tot`; `Mã`…`Vua` giữ tên; `Test`/trống = lỗi                           | đã xác nhận | `LEVEL_CODES`                           |
| 7    | Cấp của lớp = cấp phổ biến nhất của học viên, hoà thì lấy thấp hơn, lớp trống là `tot` | mặc định    | `classLevel()`                          |
| 8    | `KL357` → Kim Liên (`KL`), `VP26` → Vĩnh Phúc (`VP`)                                   | đã xác nhận | `SHEETS_BRANCH`                         |
| 9    | Phụ huynh từ "Họ tên PH", "SDT PH", "Quan hệ" trên HocVien; `Ông/ Bà` → `khac`         | đã xác nhận | `RELATION_CODES`                        |
| 10   | Không nhập "Ghi chú" của học viên                                                      | mặc định    | `IMPORT_STUDENT_NOTE`                   |
| 11   | Giữ mã cũ trong `externalCode`; mã mới tạo theo cách NocoEdu đang làm                  | đã xác nhận | `KEEP_OLD_STUDENT_CODE`                 |
| 12   | Ba trạng thái học thử gộp thành `hoc_thu`                                              | mặc định    | `STATUS_CODES`                          |
| 13   | Điểm ý thức là số nguyên 0–10; chữ khác để trống                                       | đã xác nhận | `Y_THUC_MAX`                            |
| 14   | Chưa trừ buổi khi vắng; sau này có thể trừ khi vắng không phép                         | đã xác nhận | `EDU_TRU_BUOI_VANG_KHONG_PHEP`          |
| 15   | Giữ cả ngày tháng năm sinh                                                             | đã xác nhận | `birthDateVn()`, `KEEP_FULL_BIRTH_DATE` |

## Nguyên tắc

- **Khoá chống trùng là `externalId`** trên mọi bảng nhận dữ liệu: mã bản ghi Lark (`rec…`) cho bản ghi Base, `lark:coSo:<tên lựa chọn>` cho cơ sở, `lark:ph:<SĐT>` cho phụ huynh, `lark:sodu:<rec học viên>` cho gói mở đầu, `lark:buoi:<rec lớp>:<ngày>` cho buổi học, `<rec lớp>:lich` cho lịch lớp. Sheets không phải nguồn nhập nên không có khoá. Chạy lại lệnh nhập chỉ thêm những `externalId` chưa có, không cập nhật bản ghi đã nhập và không tạo bản sao.
- **Chỉ nhập trường tối thiểu** của tri thức 05 (`396573995433985`). Không nhập: CCCD, tên trường và lớp ở trường, địa chỉ nơi ở, địa chỉ hóa đơn, giới tính, sở thích, mong muốn khi học, ảnh, bài test đầu vào, nick Lichess/ChessKid.
- **Số dư buổi tính lại** trong NocoEdu từ gói buổi và điểm danh, không chép số dư nhập tay; số trên Lark chỉ dùng để so sánh ở bản chạy thử.
- Nhật ký nhập chỉ ghi mã (`externalId`, mã NocoEdu) và mã lý do, không tên, không số điện thoại.

## Thứ tự và bảng

| #   | NocoEdu                             | Nguồn Lark                                                                        | Khoá `externalId`                                                                                                              |
| --- | ----------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `eduCoSo`                           | Lựa chọn của HocVien."cơ sở" và LopHoc."cơ sở" (`Kim Liên`, `Vĩnh Phúc`)          | tên lựa chọn (`Kim Liên`, `Vĩnh Phúc`): mỗi trường chọn của Lark có bộ id lựa chọn riêng, nên ghép theo **tên**, không theo id |
| 2   | `eduLop`, `eduLopLich`              | Base LopHoc (7 bản ghi)                                                           | `rec…` của LopHoc                                                                                                              |
| 3   | `eduPhuHuynh`, `eduHocVienPhuHuynh` | Tra cứu trên HocVien (bảng phụ huynh `tblZUIXmpdt13j4x` **chưa đọc được**)        | `rec…` của phụ huynh trong ô liên kết, hoặc `lark:ph:<SĐT>`                                                                    |
| 4   | `eduHocVien`                        | Base HocVien (179 bản ghi)                                                        | `rec…` của HocVien                                                                                                             |
| 5   | `eduGoiHoc` (gói mở đầu)            | HocVien."số buổi tồn update" (bảng nộp tiền `tblHp1PGPz52eZBz` **chưa đọc được**) | `lark:sodu:<rec học viên>`                                                                                                     |
| 6   | `eduBuoiHoc`, `eduDiemDanh`         | Base "2024/2025 Nhận xét mỗi buổi" (nguồn điểm danh duy nhất)                     | Base: `rec…`                                                                                                                   |

## Trường và quy tắc chuẩn hoá

### Cơ sở (`eduCoSo`)

| NocoEdu             | Lark         | Quy tắc                                                               |
| ------------------- | ------------ | --------------------------------------------------------------------- |
| `ma`                | tên lựa chọn | `Kim Liên` → `KL`, `Vĩnh Phúc` → `VP` (trùng tiền tố tên file Sheets) |
| `ten`               | tên lựa chọn | giữ nguyên                                                            |
| `truBuoiVangCoPhep` | —            | Lark không có; [Cần Thầy Tường xác nhận] giá trị mỗi cơ sở            |

### Lớp (`eduLop`, `eduLopLich`)

| NocoEdu                              | Lark LopHoc                                                              | Quy tắc                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ma`                                 | —                                                                        | sinh mới (`L` + số)                                                                                                                         |
| `ten`                                | "Tên lớp"                                                                | chuẩn hoá khoảng trắng                                                                                                                      |
| `coSoId`                             | "cơ sở"                                                                  | theo bảng cơ sở ở trên                                                                                                                      |
| `hlvId`                              | "GV Phụ trách" (người dùng Lark)                                         | cần bảng ghép người dùng Lark → tài khoản NocoEdu (theo email); thiếu thì để trống                                                          |
| `levelKey`, `levelOrder`             | —                                                                        | **Lark không có cấp của lớp**, NocoEdu bắt buộc. Đề xuất lấy cấp phổ biến nhất của học viên trong lớp, hoặc `tot` [Cần Thầy Tường xác nhận] |
| `eduLopLich.thu`                     | "Thứ" (`Thứ 2`…`Thứ 7`)                                                  | `Thứ N` → `N` (2 = thứ hai … 7 = thứ bảy)                                                                                                   |
| `eduLopLich.gioBatDau`, `gioKetThuc` | "Ca dạy" (`Ca1 (18h15-19h15)`, `Ca2 (19h15-20h30)`, `Ca2 (19h30-20h45)`) | tách giờ trong ngoặc: `18h15` → `18:15`. Hai lựa chọn cùng tên `Ca2` khác giờ: giữ theo giờ, không theo tên                                 |
| `externalId`                         | `rec…`                                                                   | mới                                                                                                                                         |

### Học viên (`eduHocVien`)

| NocoEdu                  | Lark HocVien                                      | Quy tắc                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hoTen`                  | "Học viên" (trường chính)                         | Unicode NFC, bỏ khoảng trắng đầu cuối và gộp khoảng trắng giữa, viết hoa chữ đầu mỗi từ (`nguyễn  minh an` → `Nguyễn Minh An`); không đổi thứ tự họ tên                                                                              |
| `ngaySinh`               | "Ngày sinh"                                       | ngày đủ `YYYY-MM-DD` theo UTC+7; chỉ đọc qua `/hocVien/ngaySinh` (câu 15)                                                                                                                                                            |
| `namSinh`                | "Ngày sinh"                                       | năm của ngày theo múi giờ Base `Asia/Bangkok` (UTC+7). Thiếu ngày sinh → lỗi `THIEU_NAM_SINH`, không đoán                                                                                                                            |
| `levelKey`, `levelOrder` | "Trình độ hiện tại" → Level                       | `NM1`, `NM2` → `tot`; `Mã` → `ma`; `Tượng` → `tuong`; `Xe` → `xe`; `Hậu` → `hau`; `Vua` → `vua`; `Test` hoặc trống → lỗi `CAP_KHONG_RO`. [Cần Thầy Tường xác nhận] Nhập môn 1–2 có phải cấp Tốt không; 12 bản ghi Level gồm những gì |
| `coSoId`                 | "cơ sở"                                           | theo bảng cơ sở; trống → lỗi                                                                                                                                                                                                         |
| `lopId`                  | lớp của buổi điểm danh gần nhất (Nhận xét."Lớp")  | HocVien."Lớp" là **lớp ở trường phổ thông**, không dùng                                                                                                                                                                              |
| `trangThai`              | "Tình trạng học"                                  | `Đang học` → `dang_hoc`; `Tạm nghỉ` → `tam_nghi`; `Đã nghỉ` → `da_nghi`; `Mới học thử`, `Đăng ký học thử`, `Chưa học thử` → NocoEdu chưa có trạng thái học thử (xem "Còn thiếu")                                                     |
| `ghiChuHlv`              | "Ghi chú"                                         | [Cần Thầy Tường xác nhận] có nhập không (có thể chứa thông tin nhạy cảm)                                                                                                                                                             |
| `soBuoiConLai`           | —                                                 | tính lại, không chép                                                                                                                                                                                                                 |
| `ma`                     | —                                                 | NocoEdu tự sinh `HS00001`; mã Lark `HV-yyyyMMdd-NNN` lưu vào `externalCode` (xem "Còn thiếu")                                                                                                                                        |
| `eduHocVienLenCap`       | "Trình độ ban đầu", "Các trình độ đã học tại CLB" | Lark không có ngày lên cấp: đề xuất **không** tạo lịch sử, chỉ đặt cấp hiện tại                                                                                                                                                      |

### Phụ huynh (`eduPhuHuynh`, `eduHocVienPhuHuynh`)

Bảng phụ huynh **chưa đọc được** (`1254302`, xem [quy-tac-nghiep-vu.md#chưa-đọc-được](quy-tac-nghiep-vu.md#chưa-đọc-được)). Toàn bộ mục này là đề xuất dựa trên các trường tra cứu của HocVien ("Họ tên PH", "SDT PH", "Quan hệ", "email PH") và trường liên kết "ID contact PH" [Cần Thầy Tường xác nhận]. `externalId` lấy từ mã bản ghi phụ huynh mà ô liên kết "ID contact PH" trả về; nếu API không trả mã khi bảng đích bị chặn thì dùng `lark:ph:<SĐT đã chuẩn hoá>`. Khi một học viên có nhiều phụ huynh, các giá trị tra cứu bị nối thành một chuỗi: tách theo dấu phân cách, ghép họ tên với SĐT theo thứ tự; số phần tử lệch nhau → lỗi `PH_KHONG_GHEP_DUOC`.

| NocoEdu                          | Lark                     | Quy tắc                                                                                                                                                                                                                   |
| -------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hoTen`                          | họ tên PH (`fldCyV9C6F`) | như họ tên học viên                                                                                                                                                                                                       |
| `soDienThoai`                    | SĐT PH (`fldGZHpThh`)    | bỏ mọi ký tự không phải số; `+84`/`84` đầu → `0`; phải đúng **10 số** bắt đầu bằng `0` (đầu số di động `03`, `05`, `07`, `08`, `09`); sai → lỗi `SDT_SAI`. Dùng `normalizePhone` ở `server/edu/names.ts`, thêm kiểm 10 số |
| `zalo`                           | —                        | Lark không có; để trống                                                                                                                                                                                                   |
| `eduHocVienPhuHuynh.quanHe`      | HocVien."Quan hệ"        | `Mẹ` → `me`; `Bố` → `bo`; `Ông/ Bà` → `khac` (không biết ông hay bà) [Cần Thầy Tường xác nhận]                                                                                                                            |
| `eduHocVienPhuHuynh.lienHeChinh` | —                        | phụ huynh đầu tiên của "ID contact PH" là liên hệ chính                                                                                                                                                                   |
| email                            | HocVien."email PH"       | NocoEdu chưa có (xem "Còn thiếu")                                                                                                                                                                                         |
| Gộp trùng                        | —                        | hai bản ghi phụ huynh cùng số điện thoại sau chuẩn hoá → một `eduPhuHuynh`                                                                                                                                                |

### Gói buổi (`eduGoiHoc`, `eduThanhToan`)

Bảng nộp tiền **chưa đọc được** (`1254302`), nên không dựng lại được lịch sử nộp tiền, số tiền, đơn giá hay công thức số dư. Đề xuất thay thế [Cần Thầy Tường xác nhận]:

| NocoEdu                                   | Lark                                             | Quy tắc                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `eduGoiHoc` (một gói mở đầu mỗi học viên) | HocVien."số buổi tồn update (vào ngày thống kê)" | `soBuoi` = số buổi tồn; nhiều giá trị (danh sách) → lỗi `SO_DU_KHONG_RO`; trống → không tạo gói                                                        |
| `eduGoiHoc.ngayMua`                       | HocVien."Ngày update gần nhất về HP"             | `YYYY-MM-DD` theo UTC+7; trống → lỗi `THIEU_NGAY_CHOT`                                                                                                 |
| `eduGoiHoc.donGia`, `thanhTien`           | —                                                | `0` (gói chuyển số dư, không phải bán mới); `loai = chuyen_so_du`, `ghiChu = chuyen_tu_lark`                                                           |
| `eduGoiHoc.externalId`                    | —                                                | `lark:sodu:<rec học viên>`                                                                                                                             |
| `eduThanhToan`                            | —                                                | không tạo (không đọc được tiền đã nộp)                                                                                                                 |
| `eduHocVien.soBuoiConLai`                 | —                                                | = gói mở đầu − tổng `sessionsToDeduct` của điểm danh **sau** ngày chốt; bản chạy thử so số này với "Số buổi còn lại" (chữ) của buổi gần nhất trên Lark |

### Buổi học và điểm danh (`eduBuoiHoc`, `eduDiemDanh`)

**Từ Base "Nhận xét mỗi buổi"**: gom các bản ghi cùng (Lớp, "Ngày học - Day format") thành một `eduBuoiHoc`.

| NocoEdu                        | Lark                    | Quy tắc                                                                                                                                                                                         |
| ------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eduBuoiHoc.ngay`              | "Ngày học - Day format" | `YYYY-MM-DD` theo UTC+7; trống → thử đọc "Ngày học" dạng `dd/MM/yyyy`; vẫn không được → lỗi                                                                                                     |
| `eduBuoiHoc.gioBatDau/KetThuc` | lịch lớp                | lấy từ `eduLopLich` của thứ đó                                                                                                                                                                  |
| `eduDiemDanh.trangThai`        | "có mặt"                | `1` → `co_mat`; `0` và `FALSE` → `vang_khong_phep` (Lark không phân biệt có phép; chưa trừ buổi); mọi giá trị khác (tên giáo viên, `học lớp 2` là tuổi của học viên) → lỗi `DIEM_DANH_KHONG_RO` |
| `eduDiemDanh.daLamBtvn`        | "Làm BTVN"              | `1` → `true`, còn lại `false`                                                                                                                                                                   |
| `eduDiemDanh.nhanXet`          | "Nhận xét"              | cắt 500 ký tự (giới hạn cột); dài hơn → báo số dòng bị cắt                                                                                                                                      |
| `eduDiemDanh.soBuoiDaTru`      | —                       | `sessionsToDeduct` cho buổi **sau** ngày chốt; `0` và `tinhVaoSoDu = false` cho buổi từ ngày chốt trở về trước                                                                                  |

**Sheets KL357/VP26** không phải nguồn điểm danh (Thầy Tường, câu 1–2): chỉ là danh sách dự kiến, nên không nhập `eduBuoiHoc` hay `eduDiemDanh` từ đó.

## NocoEdu còn thiếu

| Bảng                                                                                                     | Trường / tính năng                                                        | Lý do                                                                           |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `eduCoSo`, `eduLop`, `eduLopLich`, `eduHocVien`, `eduPhuHuynh`, `eduGoiHoc`, `eduBuoiHoc`, `eduDiemDanh` | `externalId` (chuỗi, duy nhất khi có)                                     | khoá chống trùng khi nhập lại                                                   |
| `eduHocVien`                                                                                             | `externalCode` (mã `HV-yyyyMMdd-NNN` cũ)                                  | để tra cứu ngược với Lark khi đối chiếu; [Cần Thầy Tường xác nhận] có cần không |
| `eduHocVien`                                                                                             | trạng thái học thử (`hoc_thu`, `dang_ky_hoc_thu`)                         | Lark có 3 giá trị học thử; [Cần Thầy Tường xác nhận] gộp hay giữ                |
| `eduDiemDanh`                                                                                            | `yThucDiem` (số, 0–10)                                                    | Lark chấm "Ý thức" mỗi buổi                                                     |
| `eduBuoiHoc`                                                                                             | `keHoachDay`, `kienThucMoi`, `giaoBtvn`, `keHoachBuoiSau` (chữ)           | nội dung buổi đang ghi ở từng dòng học viên; nên thuộc về buổi                  |
| `eduPhuHuynh`                                                                                            | `email`                                                                   | HocVien."email PH"                                                              |
| `eduLop`                                                                                                 | `levelKey` cho phép trống, hoặc quy tắc mặc định                          | lớp trên Lark không có cấp                                                      |
| (mới) sách                                                                                               | bảng sách, lần phát sách, sách đang học của học viên                      | 37 sách, 338 lần phát; ngoài phạm vi DS-60, đề xuất làm sau                     |
| (mới) nhật ký nhập                                                                                       | `eduNhapLarkNhatKy`: lần chạy, ai chạy, chế độ, số dòng theo bảng, số lỗi | yêu cầu "có nhật ký" của giai đoạn 3                                            |

## Cần làm trước giai đoạn 2

1. Hai bảng phụ huynh và nộp tiền **bỏ qua** theo quyết định của chủ dự án (09/11/2026), sau hai lần thử đều lỗi `1254302`; phụ huynh và gói buổi dùng đề xuất thay thế ở trên. Nếu sau này app đọc được, chạy lại `node scripts/lark/giai-ma.mjs --only base` và thay đề xuất bằng ánh xạ thật.
2. (Tuỳ chọn) Cấp scope `base:app:read`, `base:table:read`, `base:field:read`, `base:view:read`, `base:workflow:read` để dùng lệnh `lark-cli base +…` và đọc được automation.
3. Thầy Tường đã trả lời phần lớn các câu (xem bảng ở đầu tài liệu); còn mặc định ở câu 7, 10, 12.

## Đã cài ở giai đoạn 3

Lệnh `pnpm nocobase app edu import-lark` (xem [nhap-production.md](nhap-production.md)). Mã: `server/edu/lark/nguon.ts` (đọc Lark), `ke-hoach.ts` (lập kế hoạch, hàm thuần), `ghi.ts` (ghi trong một transaction), `nhap.ts` (điều phối và báo cáo). Khác với bảng ánh xạ ở trên:

- Đọc thêm bảng `Level` (12 bản ghi, không có dữ liệu cá nhân) chỉ để đổi mã bản ghi của "Trình độ hiện tại" thành tên khi API không gửi kèm chữ.
- Buổi học gom theo (lớp, ngày); giờ lấy từ lịch của lớp. Lớp không có lịch đọc được (`LICH_KHONG_RO`) thì điểm danh của lớp đó bị bỏ với `GIO_BUOI_KHONG_RO`.
- Học viên đã có trong NocoEdu được **ghép** khi khớp đủ ba thứ: tên đã chuẩn hoá, năm sinh và SĐT phụ huynh; chỉ gán `externalId` và `externalCode`, không ghi đè trường nào. Khớp nhiều bản ghi: `TRUNG_NHIEU`, bỏ dòng. Ghép với học viên đã có gói hoặc số dư khác 0: không cộng số dư Lark (`GHEP_BO_QUA_SO_DU`).
- SĐT lấy từ ô số bị mất số 0 đầu (9 chữ số) được thêm lại số 0 trước khi kiểm 10 số.
