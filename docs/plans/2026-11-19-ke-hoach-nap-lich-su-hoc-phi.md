# Kế hoạch nạp chính xác lịch sử thu học phí từ Lark (2026-11-19)

Trạng thái: **đã duyệt Q1, Q2, Q5 (19/11/2026); Q3, Q4 theo đề xuất — chờ triển khai code**

Đã chốt ngày 19/11/2026: **Q1** tính lại số dư; **Q2** kế toán gắn `Tên HS link` cho 45 khoản trên Lark rồi mới
nạp (dòng còn trống thì chỉ báo cáo); **Q5** đồng ý sửa một lần các bản ghi đã nhập, có sao lưu và nhật ký.

## 1. Vấn đề

Tab "Học phí" của hồ sơ học viên (ví dụ HS00001) báo "Chưa có gói học" dù trên Lark học viên đó đã nộp 3 lần.
Tab dựng "Các kỳ học phí" từ gói học (`eduGoiHoc`); khoản tiền (`eduThanhToan`) chỉ hiện khi gắn được vào một gói.

## 2. Số liệu đo được (đọc thẳng Lark và CSDL production ngày 19/11/2026)

Nguồn Lark (Base `V7DHb5fvQaqnrGsH6fFlysuJgme`):

| Bảng                                         | Nội dung                          | Số liệu                                                                                                                          |
| -------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Deal HP` (`tblHp1PGPz52eZBz`)               | mỗi dòng = một kỳ (số buổi, ngày) | 354 dòng, **317 dòng `Đã nộp`** (2022: 5, 2023: 4, 2024: 84, 2025: 142, 2026: 80, không ngày: 2), 132 học viên                   |
| `Tổng Deal (HP + book)` (`tblGDWScLLqgOR1W`) | mỗi dòng = một lần nộp tiền       | 315 dòng, **270 dòng có `Học phí`, tổng 511.134.000 đ** (2024: 146 dòng/231.808.000; 2025: 103/220.326.000; 2026: 21/59.000.000) |

CSDL production:

| Bảng           | Hiện có                                                                                           | So với Lark                                                |
| -------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `eduGoiHoc`    | 58 gói: 47 gói `mua` (`lark:deal:*`, chỉ năm 2026, `thanhTien = 0`) + 11 gói mở đầu `lark:sodu:*` | **thiếu 270/317 kỳ**, 104 học viên; 93 em không có gói nào |
| `eduThanhToan` | 225 khoản, 445.870.000 đ (`lark:tongdeal:*`), **chỉ 41 khoản gắn gói**                            | thiếu 45 khoản = 65.264.000 đ                              |
| `eduDiemDanh`  | 5.658 dòng, trong đó 4.693 dòng `tinhVaoSoDu = false` (coi là "đã nằm trong số dư mở đầu")        | —                                                          |

## 3. Nguyên nhân

1. **Kỳ học phí bị chặn khi nhập.** Lần nhập đầu (10/11) chưa đọc được `Deal HP`, nên ghi điểm danh với
   `tinhVaoSoDu = false` và gói mở đầu `lark:sodu:*`. Các lần nhập sau gặp `DIEM_DANH_CU_KHONG_TRU` /
   `GOI_CU_LARK_SODU` (`server/edu/lark/ke-hoach.ts` ~dòng 940–960) nên **bỏ toàn bộ Deal** của 104 học viên để
   tránh trừ buổi hai lần. Hệ quả: không có kỳ, và số dư của các em này sai (ví dụ HS00043 đang học: NocoEdu 0,
   Lark còn 59).
2. **45 khoản tiền năm 2024 không có `Tên HS link`** trên Lark → lệnh nhập không biết của ai, bỏ (đúng quy tắc
   "không đoán").
3. **Giao diện giấu tiền không gắn kỳ.** `server/routes/edu-ho-so.ts` (~dòng 220–255) chỉ chia khoản chưa gắn gói
   vào kỳ đang mở; học viên không có gói thì khoản tiền không hiện ở đâu cả.
4. **Ghép tiền ↔ kỳ yếu.** Chỉ 15/270 khoản tiền có liên kết `Link với Lần nộp HP`; gói nhập từ `Deal HP` có
   `donGia = thanhTien = 0` nên cột "Thành tiền / Đã nộp / Còn nợ" vô nghĩa.

Thử ghép 270 khoản tiền với 317 kỳ (theo thứ tự ưu tiên ở mục 5): 15 qua liên kết, 171 cùng học viên + cùng ngày

- cùng số buổi, 8 cùng ngày, 1 cùng số buổi trong ±30 ngày, **75 khoản không ghép được**; **122 kỳ không có dòng
  tiền** (đa số 2025–2026, hoặc tiền ghi ở dòng có `Học phí` trống).

Ví dụ HS00001 (Lark): kỳ 10/10/2024 24 buổi — 2.880.000 đ; kỳ 09/01/2025 40 buổi — 4.400.000 đ; kỳ 09/11/2025
15 buổi — dòng `Tổng Deal` không có số tiền. 78 buổi có mặt đều đang `tinhVaoSoDu = false`.

## 4. Quyết định cần Thầy chốt

| #   | Câu hỏi                                                                                                                                                | Đề xuất                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Nạp đủ 317 kỳ và **tính lại số dư** của 104 học viên (Σ buổi các kỳ − mọi buổi có mặt 2024–2026, trừ theo thứ tự kỳ cũ trước — quy tắc đã duyệt 11/11) | **Có.** Số dư hiện tại của nhóm này đang sai; tính lại cho tổng 112 buổi tồn (Lark ghi 947 vì Lark chỉ trừ buổi gắn tay vào Deal). |
| Q2  | 45 khoản 2024 thiếu học viên (65.264.000 đ)                                                                                                            | Thầy/kế toán gắn `Tên HS link` trên Lark trước ngày chạy; dòng nào vẫn trống thì báo cáo, không nhập.                              |
| Q3  | 122 kỳ không có dòng tiền                                                                                                                              | Vẫn tạo kỳ (số buổi đúng), cột tiền hiện "Chưa rõ" — **không** tính là nợ.                                                         |
| Q4  | 75 khoản tiền không ghép được kỳ                                                                                                                       | Vẫn ghi đủ vào doanh thu; hiện ở mục mới "Các lần nộp tiền" trong tab, gắn nhãn "chưa gắn kỳ".                                     |
| Q5  | Cho phép **sửa** bản ghi đã nhập (gắn `goiHocId` cho khoản tiền, đổi `tinhVaoSoDu`, đóng gói mở đầu `lark:sodu:*`)                                     | Có, một lần, có nhật ký đếm số dòng; trái nguyên tắc "đã nhập thì không sửa" nên cần Thầy đồng ý rõ.                               |

## 5. Thiết kế

### 5.1 Lệnh mới `pnpm nocobase app edu nap-hoc-phi [--dry-run | --commit --user <id>]`

Tách khỏi `import-lark` để không đụng các bảng khác. Cấu trúc như `import-lark`: đọc Lark (`nguon.ts`, thêm
`Tổng Deal` + `Deal HP` + `HocVien`), **lập kế hoạch bằng hàm thuần**, `--dry-run` chạy đúng đường ghi trong một
transaction rồi hoàn tác, `--commit` ghi trong **một** transaction dưới mutex `edu:nap-hoc-phi`. Báo cáo và nhật
ký (`eduNhapLarkNhatKy`, `tongKet.nguon = 'nap_hoc_phi'`) chỉ có số đếm, mã `rec…`, mã HV và mã lý do — không tên,
không SĐT.

Với mỗi học viên có `Deal HP` đã nộp:

1. **Kỳ** = mỗi dòng `Deal HP` có `Đã nộp = 1` → `eduGoiHoc` (`externalId = lark:deal:<rec>`, đã có thì giữ):
   `soBuoi = Số buổi nộp − Số buổi đã học chưa thống kê`, `ngayMua = Ngày nộp HP` (không có thì `Ngày bắt đầu`).
2. **Ghép tiền** (`eduThanhToan` theo `lark:tongdeal:<rec>`; khoản mới thì tạo, khoản đã có chỉ gắn `goiHocId`),
   theo thứ tự, mỗi kỳ nhận nhiều nhất một khoản ghép tự động:
   a. `Link với Lần nộp HP`; b. cùng học viên + cùng ngày (`Ngày nộp HP` hoặc `Ngày bắt đầu`) + cùng số buổi;
   c. cùng học viên + cùng ngày; d. cùng học viên + cùng số buổi, lệch ≤ 30 ngày; e. không ghép (`goiHocId = null`).
3. **Giá kỳ**: có khoản ghép thì `thanhTien = Học phí`, `donGia = round(thanhTien / soBuoi)`; không có thì
   `thanhTien = 0` và đánh dấu "chưa rõ tiền" (cột mới hoặc `ghiChu = chua_ro_tien` — chọn khi làm, ưu tiên cột
   boolean qua migration mới).
4. **Gói mở đầu `lark:sodu:*`** của học viên này: chuyển `trangThai` sang trạng thái không tính (kiểm tập trạng
   thái hợp lệ trong migration `202611090001`; nếu chưa có thì thêm bằng migration mới, không sửa migration cũ).
5. **Điểm danh**: mọi dòng `tinhVaoSoDu = false` của học viên → `true`, `soBuoiDaTru = sessionsToDeduct(...)` theo
   quy tắc trừ buổi đã chốt trên từng buổi (`truVangCoPhep`, `truVangKhongPhep`).
6. **Sổ số dư**: viết lại sổ của học viên bằng đúng hàm đang dùng (`server/edu/phan-bo-goi.ts`, `balance.ts`) —
   +N cho mỗi kỳ, −1 cho mỗi buổi bị trừ, theo thời gian — rồi cập nhật `eduHocVien.soBuoiConLai`. Không tự tính
   tay ở chỗ khác.

Học viên không có Deal: giữ nguyên. Khoản tiền có học viên mà không có Deal: vẫn ghi, `goiHocId = null`.

### 5.2 Giao diện tab "Học phí"

- `server/routes/edu-ho-so.ts`: trả thêm `cacLanNop` (mọi khoản `eduThanhToan` của học viên: ngày, số tiền, kỳ
  gắn, hình thức), kể cả khi không có kỳ nào.
- `client/pages/edu/hoc-vien-chi-tiet/hoc-phi.tsx`: bảng kỳ hiện "Chưa rõ" thay cho 0 ở kỳ chưa rõ tiền; thêm mục
  "Các lần nộp tiền" bên dưới bảng kỳ; chuỗi mới vào `client/locales/` (vi/en/zh).

### 5.3 Kiểm thử (trong `tests/`)

- `tests/server/edu-nap-hoc-phi.test.ts` với fixture Lark (`tests/helpers/lark-fixture.ts`): ghép tiền a–e, kỳ chưa
  rõ tiền, khoản không có học viên, gói mở đầu bị đóng, điểm danh chuyển `true`, số dư sau ghi = mô phỏng
  `--dry-run`, chạy lại lần hai không thêm gì (idempotent).
- Route hồ sơ: trả `cacLanNop` cho người có `edu.thanhToan view`, không trả cho HLV; 401/403 như cũ.
- Trang: `tests/client/` cho tab Học phí (học viên không kỳ nhưng có tiền; kỳ chưa rõ tiền).
- Chạy cả job PostgreSQL của CI.

## 6. Chạy trên production

1. Merge, triển khai như `docs/plans/2026-11-19-ke-hoach-cap-nhat-vps-nocoedu.md` (sao lưu → build → up).
2. Sao lưu riêng ngay trước khi nạp: `pg_dump -Fc` vào `/root/backups/nocoedu-<thời điểm>-truoc-nap-hoc-phi/`.
3. `node dist/cli/index.js app edu nap-hoc-phi --dry-run` (biến `LARK_APP_ID/SECRET` đã có trong container; đọc
   Lark bằng `fetch` của Node như lần khảo sát này nên không cần cài `lark-cli`/CA).
4. **Thầy duyệt báo cáo chạy thử**:
   - tổng tiền học phí theo năm = Lark (511.134.000 đ trừ các khoản vẫn thiếu học viên);
   - số kỳ tạo mới, số khoản gắn kỳ theo từng cách a–e, số kỳ chưa rõ tiền;
   - danh sách mã HV có số dư đổi: cũ → mới → Lark, nhóm "đang học" xem kỹ.
5. `--commit --user <id quản trị>`; đọc lại số dư và nhật ký.
6. Kiểm trên web: HS00001 hiện 3 kỳ (24 buổi/2.880.000; 40 buổi/4.400.000; 15 buổi/chưa rõ) và mục "Các lần nộp
   tiền"; trang chủ "Học viên sắp hết buổi" giảm về số hợp lý; báo cáo doanh thu theo tháng khớp Lark.

Hoàn tác: `pg_restore --clean` từ bản sao lưu ở bước 2 (không dùng `db rollback`).

## 7. Tiêu chí xong

- 100% dòng `Deal HP` đã nộp của học viên có trong NocoEdu đều là một kỳ.
- Tổng `eduThanhToan` học phí = tổng `Học phí` của `Tổng Deal` (phần chênh chỉ còn các khoản Thầy chưa gắn học viên,
  liệt kê theo mã `rec…`).
- Không học viên nào có tiền mà tab Học phí trống.
- Số dư sau nạp đúng bằng số `--dry-run` đã duyệt.

## 8. Ước lượng

Code + test: ~1 ngày làm việc (lệnh nạp ~60%, giao diện ~20%, test ~20%). Production: ~30 phút + thời gian Thầy
duyệt báo cáo.

## 9. Kết quả chạy thử trên production (19/11/2026, `--dry-run`, không lưu gì)

Image `nocoedu-app:nap-hoc-phi` (nhánh `feat/nap-lich-su-hoc-phi`) chạy trong container tạm nối CSDL thật; web đang
chạy không đổi. Báo cáo đầy đủ (mã HV, số dư, mã `rec…`, không tên): `/root/nap-dry-run.txt` trên VPS.

- 112 học viên được sửa; 264 kỳ mới (82 kỳ chưa rõ tiền), 10 kỳ cũ được gắn giá, 11 gói mở đầu huỷ.
- 4.395 dòng điểm danh chuyển sang tính số dư (trừ 4.394 buổi).
- Ghép tiền ↔ kỳ: liên kết 14, cùng ngày + số buổi 170, cùng ngày 7, cùng số buổi ±30 ngày 1, không gắn kỳ 33.
- Học phí 2025 và 2026 khớp Lark; 2024 thiếu đúng 65.264.000 đ của 45 khoản chưa gắn học viên (Q2).
- Số dư đọc lại sau khi ghi khớp kế hoạch.
- **Số dư sau nạp: 56/112 học viên âm** (31 đang học), tổng −702 buổi. Đã soát mẫu (HS00098, HS00064, HS00073,
  HS00008): tính đúng theo Lark — các em có mặt nhiều buổi hơn tổng buổi các kỳ đã nộp; Lark che chỗ này vì chỉ trừ
  buổi được gắn tay vào Deal và để âm ở dòng Deal chưa nộp. So với Lark (cột "còn tồn" đã gồm Deal chưa nộp): khớp 19,
  lệch ≤ 2: 32, lệch 3–10: 37, lệch > 10: 24.

Trước `--commit` cần: kế toán gắn 45 khoản 2024; Thầy duyệt danh sách học viên âm / lệch lớn (thiếu kỳ nộp trên Lark
hay thật sự nợ buổi).
