# Đề xuất ánh xạ Lark → NocoEdu (giai đoạn 1, chờ duyệt)

Dựa trên [schema.md](schema.md) và [quy-tac-nghiep-vu.md](quy-tac-nghiep-vu.md). Bảng NocoEdu theo `database/main/migrations/202611090001_create_edu_tables.ts`. Đây là đề xuất; giai đoạn 2 sửa theo ý kiến duyệt rồi mới thêm migration.

## Nguyên tắc

- **Khoá chống trùng là `externalId`** trên mọi bảng nhận dữ liệu: mã bản ghi Lark (`rec…`) cho bản ghi Base, `<token sheet>:<sheet_id>:<dòng>` cho một dòng Sheets, `lark:coSo:<tên lựa chọn>` cho cơ sở. Chạy lại lệnh nhập thì cập nhật hoặc bỏ qua, không tạo bản sao.
- **Chỉ nhập trường tối thiểu** của tri thức 05 (`396573995433985`). Không nhập: CCCD, tên trường và lớp ở trường, địa chỉ nơi ở, địa chỉ hóa đơn, ngày sinh đầy đủ (chỉ lấy năm), giới tính, sở thích, mong muốn khi học, ảnh, bài test đầu vào, nick Lichess/ChessKid.
- **Số dư buổi tính lại** trong NocoEdu từ gói buổi và điểm danh, không chép số dư nhập tay; số trên Lark chỉ dùng để so sánh ở bản chạy thử.
- Nhật ký nhập chỉ ghi mã (`externalId`, mã NocoEdu) và mã lý do, không tên, không số điện thoại.

## Thứ tự và bảng

| #   | NocoEdu                             | Nguồn Lark                                                                                           | Khoá `externalId`                                                                                                              |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `eduCoSo`                           | Lựa chọn của HocVien."cơ sở" và LopHoc."cơ sở" (`Kim Liên`, `Vĩnh Phúc`)                             | tên lựa chọn (`Kim Liên`, `Vĩnh Phúc`): mỗi trường chọn của Lark có bộ id lựa chọn riêng, nên ghép theo **tên**, không theo id |
| 2   | `eduLop`, `eduLopLich`              | Base LopHoc (7 bản ghi)                                                                              | `rec…` của LopHoc                                                                                                              |
| 3   | `eduPhuHuynh`, `eduHocVienPhuHuynh` | Tra cứu trên HocVien (bảng phụ huynh `tblZUIXmpdt13j4x` **chưa đọc được**)                           | `rec…` của phụ huynh trong ô liên kết, hoặc `lark:ph:<SĐT>`                                                                    |
| 4   | `eduHocVien`                        | Base HocVien (179 bản ghi)                                                                           | `rec…` của HocVien                                                                                                             |
| 5   | `eduGoiHoc` (gói mở đầu)            | HocVien."số buổi tồn update" (bảng nộp tiền `tblHp1PGPz52eZBz` **chưa đọc được**)                    | `lark:sodu:<rec học viên>`                                                                                                     |
| 6   | `eduBuoiHoc`, `eduDiemDanh`         | Base "2024/2025 Nhận xét mỗi buổi" và/hoặc Sheets KL357/VP26 ([Cần Thầy Tường xác nhận] nguồn chuẩn) | Base: `rec…`; Sheets: buổi = `<token>:<sheet_id>`, điểm danh = `<token>:<sheet_id>:<dòng>`                                     |

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
| `eduGoiHoc.donGia`, `thanhTien`           | —                                                | `0` (gói chuyển số dư, không phải bán mới); ghi chú `chuyen_tu_lark`                                                                                   |
| `eduGoiHoc.externalId`                    | —                                                | `lark:sodu:<rec học viên>`                                                                                                                             |
| `eduThanhToan`                            | —                                                | không tạo (không đọc được tiền đã nộp)                                                                                                                 |
| `eduHocVien.soBuoiConLai`                 | —                                                | = gói mở đầu − tổng `sessionsToDeduct` của điểm danh **sau** ngày chốt; bản chạy thử so số này với "Số buổi còn lại" (chữ) của buổi gần nhất trên Lark |

### Buổi học và điểm danh (`eduBuoiHoc`, `eduDiemDanh`)

**Từ Base "Nhận xét mỗi buổi"**: gom các bản ghi cùng (Lớp, "Ngày học - Day format") thành một `eduBuoiHoc`.

| NocoEdu                        | Lark                    | Quy tắc                                                                                                                                                                                    |
| ------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `eduBuoiHoc.ngay`              | "Ngày học - Day format" | `YYYY-MM-DD` theo UTC+7; trống → thử đọc "Ngày học" dạng `dd/MM/yyyy`; vẫn không được → lỗi                                                                                                |
| `eduBuoiHoc.gioBatDau/KetThuc` | lịch lớp                | lấy từ `eduLopLich` của thứ đó                                                                                                                                                             |
| `eduDiemDanh.trangThai`        | "có mặt"                | `1` → `co_mat`; `0` → `vang_khong_phep` hay `vang_co_phep` [Cần Thầy Tường xác nhận]; 2024: `học lớp 2` → `hoc_bu` [Cần xác nhận], `FALSE` → `0`, tên giáo viên → lỗi `DIEM_DANH_KHONG_RO` |
| `eduDiemDanh.daLamBtvn`        | "Làm BTVN"              | `1` → `true`, còn lại `false`                                                                                                                                                              |
| `eduDiemDanh.nhanXet`          | "Nhận xét"              | cắt 500 ký tự (giới hạn cột); dài hơn → báo số dòng bị cắt                                                                                                                                 |
| `eduDiemDanh.soBuoiDaTru`      | —                       | tính bằng `sessionsToDeduct` khi nhập                                                                                                                                                      |

**Từ Sheets KL357/VP26**: một sheet = một `eduBuoiHoc` của mỗi ca có học viên trong sheet; cột ca (`T3`… hoặc `T2 CA1`…) cho biết học viên thuộc ca nào, cột "Có mặt" cho trạng thái. Ngày và ca đọc từ tiêu đề cột "Nhận xét" (`C10: 19/1/26 - T2-CA2`). Ghép học viên theo **tên** (Sheets không có mã) với chuẩn hoá họ tên ở trên; trùng tên → lỗi `TRUNG_TEN`, không đoán. Mã `x`, `!`, `?`, `xin nghỉ` chờ Thầy Tường giải nghĩa.

## NocoEdu còn thiếu

| Bảng                                                                                                       | Trường / tính năng                                                        | Lý do                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `eduCoSo`, `eduLop`, `eduHocVien`, `eduPhuHuynh`, `eduGoiHoc`, `eduThanhToan`, `eduBuoiHoc`, `eduDiemDanh` | `externalId` (chuỗi, duy nhất khi có)                                     | khoá chống trùng khi nhập lại                                                   |
| `eduHocVien`                                                                                               | `externalCode` (mã `HV-yyyyMMdd-NNN` cũ)                                  | để tra cứu ngược với Lark khi đối chiếu; [Cần Thầy Tường xác nhận] có cần không |
| `eduHocVien`                                                                                               | trạng thái học thử (`hoc_thu`, `dang_ky_hoc_thu`)                         | Lark có 3 giá trị học thử; [Cần Thầy Tường xác nhận] gộp hay giữ                |
| `eduDiemDanh`                                                                                              | `diemYThuc` (số, 0–10)                                                    | Lark và Sheets chấm "Ý thức" mỗi buổi                                           |
| `eduBuoiHoc`                                                                                               | `keHoachDay`, `kienThucMoi`, `giaoBtvn`, `keHoachBuoiSau` (chữ)           | nội dung buổi đang ghi ở từng dòng học viên; nên thuộc về buổi                  |
| `eduPhuHuynh`                                                                                              | `email`                                                                   | HocVien."email PH"                                                              |
| `eduLop`                                                                                                   | `levelKey` cho phép trống, hoặc quy tắc mặc định                          | lớp trên Lark không có cấp                                                      |
| (mới) sách                                                                                                 | bảng sách, lần phát sách, sách đang học của học viên                      | 37 sách, 338 lần phát; ngoài phạm vi DS-60, đề xuất làm sau                     |
| (mới) nhật ký nhập                                                                                         | `eduNhapLarkNhatKy`: lần chạy, ai chạy, chế độ, số dòng theo bảng, số lỗi | yêu cầu "có nhật ký" của giai đoạn 3                                            |

## Cần làm trước giai đoạn 2

1. Hai bảng phụ huynh và nộp tiền **bỏ qua** theo quyết định của chủ dự án (09/11/2026), sau hai lần thử đều lỗi `1254302`; phụ huynh và gói buổi dùng đề xuất thay thế ở trên. Nếu sau này app đọc được, chạy lại `node scripts/lark/giai-ma.mjs --only base` và thay đề xuất bằng ánh xạ thật.
2. (Tuỳ chọn) Cấp scope `base:app:read`, `base:table:read`, `base:field:read`, `base:view:read`, `base:workflow:read` để dùng lệnh `lark-cli base +…` và đọc được automation.
3. Thầy Tường trả lời các nhãn **[Cần Thầy Tường xác nhận]** ở hai tài liệu, quan trọng nhất: nguồn điểm danh chuẩn (Base hay Sheets), nghĩa của `0`/`x`/`!`/`?`, cách đang trừ buổi, cấp của `NM1`/`NM2`.
