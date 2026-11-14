# Kế hoạch phát triển NocoEdu sau DS-60 (13/11/2026)

## Bối cảnh

DS-60 đã đưa lên production hồ sơ 2024–2026 của CLB Cờ vua Dương Sinh (174 học viên, 628 buổi, 5.658 điểm danh) nhưng NocoEdu mới là "sổ điểm danh và số dư buổi". CLB đang vận hành thật bằng Lark Base `Quản lý CLB Cờ vua Dương Sinh - sửa.base` (21 bảng, 7 automation, 3 form, 5 vai trò, 1 dashboard 8 biểu đồ). Kế hoạch này đọc cách CLB làm việc từ file đó, so với NocoEdu, và chia việc còn lại thành các giai đoạn. Phạm vi chủ dự án chọn: **hồ sơ học sinh, điểm danh, nhận xét từng buổi và định kỳ; tiền học phí và doanh thu; tuyển sinh; sách và quỹ tiền sách; giáo viên, trình độ, đánh giá**. Thứ tự: **đưa vào dùng thật trước, rồi tiền**.

File "sửa" so với file cũ: không đổi trường hay công thức nào, chỉ bỏ 17 bảng ngoài đào tạo (giải đấu, task đội, chi phí, biên bản ván cờ, lưu trữ). Không có bảng nào trong 17 bảng đó nằm trong kế hoạch.

## Cách CLB làm việc (đọc từ công thức và liên kết)

1. **Học viên – phụ huynh.** `HocVien` liên kết nhiều–nhiều tới `Contact` (hai liên kết `Tên con số 1/2`); họ tên, SĐT, địa chỉ phụ huynh là trường tra cứu, nhiều phụ huynh thì bị nối thành một chuỗi.
2. **Mỗi buổi là một dòng cho mỗi học viên** trong `<năm> Nhận xét mỗi buổi`: lớp, GV phụ trách (nhiều), có mặt (`1/0`), làm BTVN, ý thức (điểm), bốn ô nội dung (`Kế hoạch dạy`, `Kiến thức/lý thuyết mới`, `Giao BTVN`, `KH buổi sau`), nhận xét, sách đang học và đã học xong, link Lichess, và **gắn tay** `Ký hiệu Lần nộp tiền` (buổi này trừ vào lần nộp nào).
3. **Số buổi còn tồn của một lần nộp** (`Deal HP`) = `Số buổi nộp` − `2024/2025/2026 Tổng số buổi đã học` − `Số buổi đã học chưa thống kê`. Mỗi "Tổng số buổi đã học" đếm các buổi có mặt **được gắn tay** (`20xx Tkê ngày học`) của đúng học viên. `HocVien."số buổi tồn update"` lấy tồn của lần nộp gần nhất.
4. **Tiền nằm ở `Tổng Deal (HP + book)`**, không phải `Deal HP`: `Tổng HP + sách = Học phí + Tiền sách + Mua khác`, kèm `HP 1 buổi` (đơn giá), ngày nộp, cơ sở, ảnh bill. Số liệu (tôi tính gộp, không đọc tên): 315 lần nộp, 270 có học phí, **tổng 511.134.000 đ**, 4.984 buổi nộp, đơn giá 1 buổi chủ yếu 120.000 (57/91 dòng có giá), 108.000 (19), 80.000 (7). Chỉ **15/315** dòng liên kết tới `Deal HP`, nên ghép phải theo học viên + ngày + số buổi. Lần nhập DS-60 đã kết luận "Lark không có số tiền" vì chỉ đọc `Deal HP`; kết luận này **sai** và là cơ hội lớn nhất.
5. **Sách.** `Sách` (37, giá bìa, giá bán cho PH), `Bài học` (10), `Từng lần phát sách` (338): `Tiền sách = Giá − Ưu đãi`. Quỹ tiền sách của học viên (`Deal book`, 10 dòng): `Cộng dồn = Số tiền nộp + Thừa thiếu`; `Còn tồn = Cộng dồn − Σ tiền sách các lần phát gắn vào`; `Tồn = Còn tồn − Chuyển sang đợt sau`.
6. **Tuyển sinh.** `Contact` (87: kênh dẫn đầu tiên, tình trạng convert, đã biết chơi, kết bạn Zalo) → `Lead` (7) → `Interaction Lead` (2) → `Trial lesson` (2); `Tương tác PH` (13: chủ đề, tình trạng xử lý). Dữ liệu còn rất ít, đây là quy trình dự kiến hơn là khối lượng.
7. **Giáo viên và trình độ.** `GiaoVien` (17, có thù lao mỗi buổi, ngân hàng, SĐT, CCCD-loại thông tin nhạy cảm), `Level` (12), trình độ ban đầu/hiện tại/đã học, test đầu vào, `Đánh giá định kỳ 5 buổi một` (10), `Cuối năm 2024 - nhận xét định kỳ` (52), `Nick Lichess - chesskid` (5).
8. **Automation (7).** (a) số buổi tồn của học viên về `0` → báo quản trị "cần thu học phí" (**đang tắt**); (b) form phụ huynh nộp → email xác nhận; (c) đổi `ID contact` → thông báo; (d) ngày follow-up của Lead → nhắc; (e)(f) sinh nhật học viên và giáo viên; (g) hạn task (bảng đã bỏ). Dashboard 8 biểu đồ lưu dạng mã hoá thêm, **chưa đọc được nội dung** (cần chủ dự án liệt kê).
9. **Vai trò Lark:** `Reader`, `Editor`, `TeamEdu`, `Team Admin`, `Chung` (không còn thành viên trong file xuất). NocoEdu đã có năm bộ quyền riêng.

## Hiện trạng và khoảng trống

| Mảng                | NocoEdu hiện có                                                     | Còn thiếu                                                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Điểm danh           | 4 trạng thái, BTVN, nhận xét ngắn, cảnh báo ≤ 2 buổi                | Ý thức, kế hoạch dạy, kiến thức mới, giao BTVN, KH buổi sau, sách đang học, link Lichess. **Lần nhập đã ghi `yThucDiem`, `keHoachDay`, `kienThucMoi`, `giaoBtvn`, `keHoachBuoiSau` vào CSDL nhưng không có màn hình nào hiện hay sửa** (chỉ `server/edu/lark/ke-hoach.ts` và `ghi.ts` chạm tới) |
| Nhận xét            | Nhận xét tháng; xuất văn bản Zalo                                   | Nhận xét định kỳ 5 buổi, tổng kết cuối năm, nhập 52 dòng cuối năm 2024                                                                                                                                                                                                                          |
| Tiền                | `eduGoiHoc`, `eduThanhToan`, VietQR, doanh thu                      | Dữ liệu tiền thật: 58 gói đang giá 0, doanh thu rỗng; chưa nhập `Tổng Deal`                                                                                                                                                                                                                     |
| Số dư               | Sổ `eduSoDuNhatKy`, phân bổ vào trước ra trước                      | Số dư âm tổng −377 chưa có trang rà soát; 103 học viên giữ số dư cũ                                                                                                                                                                                                                             |
| Tuyển sinh          | không có                                                            | Liên hệ, lead, học thử, tương tác PH, nhắc việc                                                                                                                                                                                                                                                 |
| Sách                | không có                                                            | Danh mục, phát sách, quỹ tiền sách, sách đang/đã học                                                                                                                                                                                                                                            |
| Giáo viên, trình độ | HLV là tài khoản có bộ quyền `edu_hlv`; lên cấp có lịch sử          | Hồ sơ GV, thù lao, Level, test đầu vào, nick Lichess                                                                                                                                                                                                                                            |
| Người dùng          | **1 người dùng (Super Admin)**; 7 lớp chưa có HLV (`HLV_CHUA_GHEP`) | tài khoản HLV, kế toán, quản lý cơ sở; gán vai trò                                                                                                                                                                                                                                              |

Production ngày 12/11/2026: 174 học viên, 628 buổi (2024: 98, 2025: 293, 2026: 237), 5.658 điểm danh, 58 gói, 31 phụ huynh. Bị bỏ khi nhập: 5 học viên (4 `CO_SO_KHONG_RO`, 1 `THIEU_HO_TEN`) và 89 gói (87 `THIEU_NGAY_CHOT`, 2 `DEAL_THIEU_NGAY`).

## Giai đoạn A: đưa vào dùng thật (làm trước)

Mục tiêu: HLV điểm danh được thật, quản trị thấy số liệu đúng, không còn việc dở của DS-60.

- **A1. Tài khoản và vai trò (không cần code).** Lập danh sách nhân sự dùng NocoEdu (HLV, kế toán, quản lý hai cơ sở); tạo người dùng, gán bộ quyền trong "Quản lý người dùng"; gán HLV cho 7 lớp. Cần danh sách tên + email từ Thầy Tường. Quy tắc: không gán bộ quyền cho `authenticated:*` (AGENTS.md).
- **A2. Rà soát số dư (code nhỏ).** Trang/báo cáo "số dư âm và lệch" cho Quản trị (tổng −377; ví dụ có học viên âm 82 buổi), mỗi dòng dẫn tới thao tác điều chỉnh số dư sẵn có (`dieu_chinh`, `server/routes/edu-hoc-phi.ts`). Mở rộng `baoCao` loại `soDuAm` trong `server/routes/edu-bao-cao.ts`.
- **A3. Dữ liệu bị bỏ.** Báo danh sách mã (`HV-…`, `rec…`) của 5 học viên và 89 gói để Thầy Tường sửa trên Lark hoặc nhập tay, rồi chạy lại `import-lark` (chỉ thêm).
- **A4. 103 học viên giữ số dư cũ.** Quyết định với Thầy Tường: giữ nguyên, hay chuyển sang số dư tính lại từ Deal theo quy trình tay trong `docs/lark/nhap-production.md` (đã sửa SQL sang snake_case, sao lưu, dừng ứng dụng). Không làm khi chưa có đồng ý.
- **A5. Đồng ý của phụ huynh.** Học viên nhập từ Lark chưa có `edu_dong_y` (mặc định "chưa đồng ý"). Lập quy trình thu đồng ý (màn hình đã có) và danh sách học viên thiếu đồng ý.
- **A6. Hiện nội dung buổi học.** Màn hình điểm danh hiện và sửa Ý thức, bốn ô nội dung buổi (ở mức buổi) và link Lichess; trang hồ sơ học viên hiện lịch sử nhận xét. Đây là phần đã có dữ liệu mà người dùng chưa thấy. Chi tiết ở giai đoạn C.
- **A7. Vận hành.** Image production hiện cài `lark-cli` thủ công trong `/tmp` (mất khi redeploy). Đưa vào quy trình (ghi trong `docs/lark/nhap-production.md`) hoặc dựng image có `curl` và CA.

## Giai đoạn B: tiền học phí và doanh thu

- **B1. Đọc `Tổng Deal (HP + book)`** trong `server/edu/lark/nguon.ts` (thêm bảng `tblGDWScLLqgOR1W` vào `LARK_TABLES` và `READ_FIELDS`): `Ngày nộp`, `Số buổi nộp`, `Học phí`, `Tiền sách`, `Mua khác`, `HP 1 buổi`, `Cơ sở`, `Tên HS link`, liên kết `Link với Lần nộp HP`. Không nhập ảnh bill, tên PH dạng chữ.
- **B2. Quy tắc ghép** (thêm vào `chua-xac-nhan.ts`, đánh dấu cần Thầy Tường xác nhận): dòng có `Link với Lần nộp HP` thì ghép thẳng vào gói `lark:deal:<rec>`; còn lại ghép theo (học viên, ngày nộp gần nhất, số buổi). Không ghép được thì báo mã `TONG_DEAL_KHONG_GHEP`, không đoán. Đơn giá = `Học phí / Số buổi nộp` (đối chiếu `HP 1 buổi`). Điền `donGia` và `thanhTien` của gói; ghi `eduThanhToan` đúng số tiền Lark có, hình thức `chuyen_khoan` hay `tien_mat` **không có trên Lark** nên cần quy ước (đề xuất thêm giá trị `khong_ro`).
- **B3. Migration (chỉ thêm).** `eduGoiHoc`: `tienSach`, `muaKhac` (hoặc dòng thanh toán theo loại); khoá `externalId = lark:tongdeal:<rec>`. Không sửa migration cũ.
- **B4. Báo cáo doanh thu** theo tháng, cơ sở, loại (học phí, sách, khác) và đơn giá trung bình; `baoCao` loại `doanhThu` đã có, nhưng sẽ chỉ có ý nghĩa sau B1–B3. Đối chiếu tổng với 511.134.000 đ trong bản chạy thử.
- **B5. Nhắc thu học phí.** Thay automation (a) bằng báo cáo `sapHetBuoi` sẵn có + thông báo qua `nocobase-app-plugin-notification`; ngưỡng cấu hình theo cơ sở.

## Giai đoạn C: hồ sơ học sinh, điểm danh, nhận xét

- **C1. Điểm danh đầy đủ** (A6): trường theo học viên: Ý thức (0–10), làm BTVN, nhận xét; theo buổi: kế hoạch dạy, kiến thức mới, giao BTVN, KH buổi sau. Dùng cột đã có (`eduDiemDanh.yThucDiem`, `eduBuoiHoc.keHoachDay…`). Sửa qua `/diemDanh/luu` và API buổi; cập nhật `client/pages/edu/diem-danh.tsx`, `server/edu/permissions.ts`.
- **C2. Hồ sơ học viên**: tab nhận xét (theo buổi, tháng, định kỳ), tiến độ trình độ, sách. Mở rộng `client/pages/edu/hoc-vien-chi-tiet.tsx`.
- **C3. Nhận xét định kỳ 5 buổi và cuối năm**: bảng `eduDanhGiaDinhKy` (học viên, kỳ, GV, ý thức, nhận xét khai/trung/tàn/chiến thuật/chiến lược, ưu/nhược, kế hoạch tới); trang soạn và xuất văn bản Zalo như `nhan-xet.tsx`. Nhập 52 dòng cuối năm 2024 (cần đối chiếu tên với học viên, lệnh nhập riêng).
- **C4. Trình độ**: bảng `Level` (12 dòng) đã gộp thành 6 cấp; lịch sử lên cấp đã có (`eduHocVienLenCap`). Test đầu vào và nick Lichess/ChessKid: **quyết định chính sách dữ liệu trước** (tri thức 05 hiện không nhập các trường này; chủ dự án cần duyệt nếu muốn đổi).
- **C5. Tính lại số dư theo buổi gắn tay**: không làm; NocoEdu đã thay bằng phân bổ vào trước ra trước (`server/edu/phan-bo-goi.ts`).

## Giai đoạn D: tuyển sinh

Dữ liệu là của trẻ chưa nhập học, nên đây là mảng nhạy cảm nhất.

- **D1. Quyết định trước khi code:** có lưu liên hệ chưa nhập học không, lưu những trường nào (chỉ tên phụ huynh, SĐT, cơ sở mong muốn, kênh dẫn, ngày follow-up), lưu bao lâu, ai xem. Đề xuất tối thiểu hoá giống học viên: không địa chỉ, Facebook, nghề nghiệp.
- **D2. Bảng mới (migration):** `eduLienHe` (lead, trạng thái `moi/dang_cham_soc/da_chot/khong_chot`, kênh, cơ sở mong muốn, người phụ trách, `ngayFollowUp`), `eduHocThu` (lịch, kết quả, đã học thử), `eduTuongTac` (ngày, chủ đề, mô tả, tình trạng xử lý). Chuyển lead → học viên giữ liên kết.
- **D3. Màn hình và quyền:** thêm bộ quyền hoặc hành động `edu.tuyenSinh`; phạm vi theo cơ sở. Pipeline dạng danh sách theo trạng thái.
- **D4. Nhắc việc:** follow-up đến hạn (thay automation d), sinh nhật (đọc `ngaySinh` qua đường có kiểm soát), email/Zalo xác nhận đăng ký (thay automation b) qua `nocobase-app-plugin-mail` hoặc `-notification`.
- **D5. Nhập dữ liệu:** 87 contact, 7 lead, 2 tương tác lead, 2 học thử, 13 tương tác PH: chỉ khi D1 được duyệt.

## Giai đoạn E: sách và quỹ tiền sách

- **E1. Danh mục:** `eduSach` (ký hiệu, tên, giá bìa, giá bán cho PH), `eduBaiHoc` (10, thuộc sách). Nhập 37 + 10 dòng.
- **E2. Phát sách:** `eduPhatSach` (học viên, sách, ngày, cơ sở, ưu đãi, `tienSach = giá − ưu đãi`, ghi chú). 338 dòng; sửa lỗi khớp "chứa" của Lark (ký hiệu `CT1` khớp `CT10`) bằng khoá sách chính xác.
- **E3. Quỹ tiền sách** của học viên: sổ cái giống `eduSoDuNhatKy` (nộp, phát, thừa thiếu, chuyển đợt sau) thay công thức ba tầng của Lark; nhập 10 dòng `Deal book`. Số tiền sách trong `Tổng Deal` (31.240.000 đ) nối vào đây.
- **E4. Sách đang học / đã học** của học viên (bảng nối), hiện ở hồ sơ học viên.
- **E5. Tồn kho sách** (Sheets "Tồn kho"): nhập tay, không có công thức; để sau, chỉ khi CLB cần.

## Giai đoạn F: giáo viên, trình độ, đánh giá

- **F1. Hồ sơ GV:** giữ GV là tài khoản (`edu_hlv`), thêm bảng hồ sơ tối thiểu: tên viết tắt, vị trí, tình trạng làm việc, **thù lao mỗi buổi** (hạn chế quyền: chỉ Quản trị/kế toán). Không nhập CCCD, ngân hàng, Facebook, quê quán, sở thích. 17 dòng.
- **F2. Gán HLV cho lớp/buổi:** `GV phụ trách` là nhiều–nhiều ở mỗi dòng điểm danh trên Lark; NocoEdu có `hlvId` ở lớp và buổi. Quyết định có cần nhiều GV mỗi buổi.
- **F3. Báo cáo thù lao:** Σ buổi dạy × thù lao theo tháng cho từng GV, xuất CSV qua `csvCell` và nhật ký xuất.
- **F4. Ghép tài khoản:** ghép GV Lark với người dùng NocoEdu theo email (đã có đường ghép `HLV_CHUA_GHEP`).

## Làm xuyên suốt

- Mỗi mảng: migration chỉ thêm (tên khớp tên file), `down` tường minh; seed và bộ quyền mới theo quy trình `scripts/generate-edu-permission-seed.mts` (seed mới, không sửa seed cũ); chuỗi giao diện trong `client/locales/edu-copy.ts` ba ngôn ngữ; trang khai báo trong `client/routes.ts` với `authz`; route có `auth.required()` và kiểm hành động; ghi qua `Idempotency-Key`.
- Dữ liệu trẻ em: nhập tối thiểu; nhật ký và đầu ra chỉ có đếm và mã, không tên, SĐT, ngày sinh.
- Nhập từ Lark chỉ thêm, không cập nhật (`externalId` chống trùng); mỗi lệnh mới có `--dry-run` mô phỏng ghi như `import-lark`.
- Kiểm thử: `tests/server/…`, `tests/client/…`, `tests/database/edu-migrations.test.ts` cho từng PR, chạy từng file (`pnpm exec vitest run <file>`), không chạy cả workspace.

## Thứ tự PR đề xuất (mỗi PR nhỏ, tách rời)

1. A2 báo cáo số dư âm; A6/C1 màn hình điểm danh đủ trường (không cần dữ liệu mới).
2. B1–B3 nhập Tổng Deal (đọc, ghép, ghi, `--dry-run`), rồi chạy trên production theo `nhap-production.md` (sao lưu, dry-run, duyệt, commit).
3. B4–B5 báo cáo doanh thu, nhắc thu học phí.
4. C2–C3 hồ sơ học viên và đánh giá định kỳ.
5. E1–E4 sách và quỹ tiền sách.
6. D1 quyết định → D2–D4 tuyển sinh.
7. F1–F4 giáo viên.

Phần A1, A3, A4, A5 là việc vận hành với Thầy Tường, làm song song, không cần PR.

## Câu hỏi cần Thầy Tường / chủ dự án

1. Danh sách nhân sự dùng hệ thống (A1) và email.
2. 103 học viên giữ số dư cũ: giữ hay chuyển (A4).
3. Số dư âm (−377): cách xử lý chung (điều chỉnh về 0, hay giữ như nợ buổi).
4. `Tổng Deal`: hình thức thanh toán (tiền mặt hay chuyển khoản) và quy tắc ghép (B2); "Mua khác" là gì.
5. Tuyển sinh: có lưu liên hệ chưa nhập học không, lưu gì, bao lâu (D1).
6. Test đầu vào, nick Lichess/ChessKid: có đưa vào không (C4).
7. Thù lao GV: ai được xem (F1).
8. Dashboard 8 biểu đồ trên Lark: mỗi biểu đồ đo gì? (file không đọc được nội dung) để làm báo cáo tương đương.

## Kiểm chứng

- Mỗi PR: test mới trong `tests/` (đúng, chưa đăng nhập, không đủ quyền; migration `up`/`down` trên cơ sở dữ liệu thật; trang qua `tests/client/page-harness.test.tsx`), chạy từng file.
- Nhập từ Lark: `--dry-run` trên production phải khớp số kỳ vọng (ví dụ tổng học phí 511.134.000 đ, số lần nộp 315, số dòng không ghép được được liệt kê bằng mã); chạy lại sau `--commit` phải ra "tạo = 0" (như lần DS-60 ngày 12/11).
- Quyền: kiểm bằng người dùng chỉ có một bộ quyền, cả nút ẩn lẫn gọi API trực tiếp (`tests/server/authorization-assignment-safety.test.ts` sau mỗi thay đổi quyền).
- Báo cáo: so tổng với Lark (doanh thu), với số dư trong `edu_so_du_nhat_ky` (số dư), và với các view Lark đang dùng.

## File chính sẽ chạm

`server/edu/lark/nguon.ts`, `ke-hoach.ts`, `ghi.ts`, `chua-xac-nhan.ts`; `server/routes/edu-hoc-phi.ts`, `edu-bao-cao.ts`, `edu-data.ts`; `server/edu/permissions.ts`, `database/seed-data/edu-permission-sets.ts`; `client/pages/edu/diem-danh.tsx`, `hoc-vien-chi-tiet.tsx`, `bao-cao.tsx`, `nhan-xet.tsx`; `client/routes.ts`, `client/locales/edu-copy.ts`; migration mới dưới `database/main/migrations/`; tài liệu `docs/lark/` và `.agents/rules/edu.md`.
