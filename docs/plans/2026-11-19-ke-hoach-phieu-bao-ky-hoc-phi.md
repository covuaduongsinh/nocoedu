# Kế hoạch "Phiếu báo kỳ học phí" gửi phụ huynh (2026-11-19)

Trạng thái: **GĐ 1 và GĐ 2 đã gộp vào `main` (PR #54) và đã chạy trên bản thật nocoedu.dsc.edu.vn từ 22:33 ngày
19/11/2026** (mục 10). Còn hai việc cần Thầy: cấu hình tài khoản VietQR và thử gửi một phiếu qua Zalo (mục 11). GĐ 3
để sau.

Thầy chốt ngày 19/11/2026: đồng ý cả năm đề xuất ở mục 7, các điểm còn lại ủy quyền cho người triển khai chọn.

## 1. Bối cảnh

Trước đây ở Lark Base, mỗi dòng "Kỳ nộp học phí" (ví dụ `Lê Phương Huyền Anh - HP20L5 - 6/7/2026`) có: cơ sở, ngày
nộp, số buổi nộp, ngày bắt đầu, ngày kết thúc, số buổi còn tồn và **danh sách ngày học của từng buổi**. Thầy chụp
màn hình dòng đó gửi phụ huynh để họ thấy kỳ đã hết / sắp hết và nộp kỳ tiếp theo.

Cách làm đó có ba điểm yếu:

1. Ảnh chụp là giao diện quản trị: chữ nhỏ, thừa cột nội bộ, không có lời nhắn, không có tên trung tâm.
2. Phải tự tìm học viên nào sắp hết, mở từng dòng, chụp, cắt ảnh.
3. Không biết đã báo cho ai, ngày nào.

## 2. NocoEdu đã có gì

| Cần cho phiếu báo                                  | Đã có ở đâu                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| Các kỳ học phí, số buổi, đã học, còn lại, ngày nộp | `POST /hocVien/hoSo360` → `hocPhi.cacKy` (phân bổ FIFO của `phan-bo-goi.ts`)     |
| Buổi nào thuộc kỳ nào, buổi học vượt               | `buoiHoc[].kySo`, `buoiHoc[].vuotSoDu`                                           |
| Ai cần thu (một nguồn duy nhất)                    | `server/edu/can-thu.ts`, tab "Cần thu" của `/hoc-phi`, `tongHop.dai` trong hồ sơ |
| Phiếu A4 để phụ huynh ký                           | `PrintSheet` (`hoc-vien-chi-tiet/in-phieu.tsx`) — bản in, không gửi Zalo được    |

Kết luận: **dữ liệu đã đủ**, chỉ thiếu một tấm phiếu trình bày cho phụ huynh và đường đi nhanh từ "Cần thu" tới
phiếu. Không cần bảng mới, route mới hay quyền mới cho GĐ 1.

## 3. Các ý tưởng

| #   | Ý tưởng                                                                                                  | Giá trị                                        | Giai đoạn |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------- |
| A   | **Phiếu báo kỳ học phí** dạng ảnh, trình bày cho phụ huynh (tên trung tâm, học viên, kỳ, lưới ngày học)  | Thay hẳn ảnh chụp Lark, đẹp và rõ hơn          | **GĐ 1**  |
| B   | Nút **Sao chép ảnh** / **Tải ảnh** / **Chia sẻ** (điện thoại) — dán thẳng vào Zalo, không phải chụp, cắt | Từ 5 thao tác còn 2                            | **GĐ 1**  |
| C   | **Lời nhắn soạn sẵn** theo tình trạng (đã hết / sắp hết / học vượt / đang học), sửa được trước khi chép  | Lời lẽ thống nhất, không gõ lại                | **GĐ 1**  |
| D   | Phiếu tự kết luận tình trạng theo đúng nguồn "Cần thu", ghi rõ **buổi học vượt chưa có học phí**         | Phụ huynh hiểu ngay vì sao cần nộp             | **GĐ 1**  |
| E   | Ghi thêm **buổi nghỉ có phép không tính buổi** trong khoảng thời gian của kỳ                             | Minh bạch, bớt thắc mắc "con nghỉ mà vẫn trừ?" | **GĐ 1**  |
| F   | Nút **Phiếu báo** ngay trên từng dòng của tab "Cần thu"                                                  | Đi một mạch: danh sách → phiếu → gửi           | **GĐ 1**  |
| G   | **Sổ "đã báo phụ huynh"**: ghi ngày báo, ai báo; tab "Cần thu" hiện "Đã báo 18/11", lọc "chưa báo"       | Không báo sót, không báo trùng                 | **GĐ 2**  |
| H   | **Mã VietQR** của kỳ tiếp theo in ngay trên phiếu (số tiền gợi ý theo kỳ gần nhất, sửa được)             | Phụ huynh quét và chuyển khoản luôn            | **GĐ 2**  |
| I   | **Tạo hàng loạt**: chọn nhiều học viên ở "Cần thu" → tải một tệp zip ảnh / in liền nhau                  | Cuối tháng báo cả lớp trong vài phút           | GĐ 3      |
| J   | **Gửi tự động** qua Zalo OA / ZNS khi còn ≤ 2 buổi                                                       | Không cần thao tác tay                         | GĐ 3      |
| K   | **Trang tra cứu cho phụ huynh** (đường link có mã bí mật, chỉ xem kỳ học phí của con)                    | Phụ huynh tự xem bất cứ lúc nào                | GĐ 3      |

G cần bảng mới + quyền + sao lưu; H cần quy ước "kỳ tiếp theo bao nhiêu buổi, giá nào"; J, K đưa dữ liệu trẻ em
ra ngoài hệ thống. Vì vậy các ý đó dừng ở đề xuất, chờ Thầy quyết (mục 7).

## 4. Thiết kế GĐ 1

Luồng làm việc: **quick change** theo `ui-workflow.md` (một dialog trên trang có sẵn, dùng mẫu sẵn có, chỉ sửa
`client/`).

### 4.1 Dữ liệu và quyền

- Phiếu dựng **ở trình duyệt** từ đúng câu trả lời `/hocVien/hoSo360` mà trang hồ sơ đã tải. Không route mới,
  không migration, không đổi quyền.
- Chỉ hiện với người thấy cả học phí (`hocPhi` khác `null`) lẫn buổi học (`buoiHoc` khác `null`): Quản trị, Quản lý
  cơ sở, Kế toán. HLV không thấy học phí nên không có nút (đúng nguyên tắc hiện hành).
- Phiếu **không ghi số tiền** (giống dòng Lark): nhiều kỳ nạp từ Lark đang "Chưa rõ" số tiền; tiền nong xem ở
  phiếu A4 hoặc tab Học phí.
- Tình trạng "sắp hết / vượt" lấy từ `tongHop.dai` của máy chủ — không viết thêm một phép so sánh `<= 2` nào.
- Không ghi nhật ký xuất dữ liệu: phiếu là một cách xem dữ liệu đã hiển thị, như phiếu in A4 (nhật ký "đã báo"
  thuộc ý tưởng G).

### 4.2 Nội dung phiếu (ảnh 720 px, nền sáng, màu thương hiệu `#2b3990`)

1. Dải đầu: tên CLB, tiêu đề "THÔNG BÁO KỲ HỌC PHÍ", họa tiết ô cờ.
2. Học viên: họ tên, mã, lớp, cơ sở.
3. Kỳ: "Kỳ 5 (20 buổi)", ngày nộp.
4. Ba ô số: Số buổi nộp · Đã học · Còn lại; thanh tiến độ; ngày bắt đầu – ngày kết thúc (kỳ chưa hết: "Đang học").
5. "Các ngày đã học": lưới thẻ đánh số 1…n kèm ngày `dd/mm/yyyy`; buổi vắng vẫn tính buổi có dấu riêng + chú thích.
6. "Nghỉ có phép, không tính buổi": các ngày nằm giữa ngày bắt đầu và ngày kết thúc của kỳ (nếu có).
7. "Buổi học thêm, chưa có học phí": chỉ ở kỳ cuối, khi học viên đã học vượt.
8. Khung kết luận theo tình trạng:
   - `het`: kỳ cuối đã dùng hết → mời nộp kỳ tiếp theo;
   - `vuot`: kỳ cuối hết và đã học thêm n buổi → mời nộp, ghi rõ số buổi học thêm;
   - `sap_het`: còn n buổi và máy chủ xếp vào "sắp hết";
   - `dang_hoc`: còn nhiều buổi;
   - `da_sang_ky_moi`: kỳ này hết, học viên đang học kỳ sau.
9. Chân phiếu: ngày lập.

Ảnh là **SVG dựng bằng hàm thuần** rồi vẽ lên canvas để ra PNG (độ phân giải ×2). Lý do không dùng
`html-to-image`/`html2canvas`: không thêm phụ thuộc, kết quả giống nhau trên mọi máy, kiểm thử được bằng chuỗi.
Ảnh gửi ra ngoài nên dùng bảng màu cố định (như phiếu A4 "đen trên trắng"), không theo giao diện tối — ngoại lệ có
chủ đích của quy tắc "chỉ dùng token", ghi chú trong mã và trong `.agents/rules/edu.md`.

### 4.3 Dialog "Phiếu báo kỳ học phí"

- Mở bằng nút **Phiếu báo phụ huynh** ở đầu hồ sơ 360° (cạnh "In phiếu đối soát A4"), hoặc bằng địa chỉ
  `/hoc-vien/:id?phieu=hien-tai` (kỳ đang học) / `?phieu=<số kỳ>`; đóng thì bỏ tham số.
- Trong dialog: chọn kỳ (mặc định kỳ đang học: kỳ đầu tiên còn buổi, không có thì kỳ cuối) → xem trước ảnh → ô lời
  nhắn (sửa được).
- Nút: **Sao chép ảnh** (Clipboard API, cần HTTPS — thiếu thì hiện giải thích và hướng dùng "Tải ảnh"), **Tải ảnh**
  (`phieu-bao-<mã>-ky-<n>.png`), **Chia sẻ** (chỉ hiện khi trình duyệt chia sẻ được tệp, tức điện thoại), **Sao
  chép lời nhắn** (`copyText` của `@nocobase/app-client`, hỏng thì báo chép tay).
- Điện thoại: các khối xếp dọc, ảnh co theo chiều ngang, nút xếp dọc ở chân dialog.

### 4.4 Tab "Cần thu"

Mỗi dòng thêm liên kết **Phiếu báo** → `/hoc-vien/:id?tab=hoc-phi&phieu=hien-tai`.

## 5. Tệp thay đổi

| Tệp                                                        | Việc                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `client/pages/edu/hoc-vien-chi-tiet/phieu-bao/model.ts`    | Hàm thuần: hồ sơ + số kỳ → dữ liệu phiếu, tình trạng   |
| `client/pages/edu/hoc-vien-chi-tiet/phieu-bao/svg.ts`      | Hàm thuần: dữ liệu phiếu + nhãn → chuỗi SVG            |
| `client/pages/edu/hoc-vien-chi-tiet/phieu-bao/labels.ts`   | Nhãn đã dịch của phiếu và lời nhắn soạn sẵn            |
| `client/pages/edu/hoc-vien-chi-tiet/phieu-bao/image.ts`    | SVG → PNG, sao chép ảnh, chia sẻ (API trình duyệt)     |
| `client/pages/edu/hoc-vien-chi-tiet/phieu-bao/dialog.tsx`  | Dialog                                                 |
| `client/pages/edu/hoc-vien-chi-tiet/index.tsx`             | Nút mở, tham số `phieu`                                |
| `client/pages/edu/hoc-phi.tsx`                             | Liên kết "Phiếu báo" ở tab "Cần thu"                   |
| `client/locales/edu-copy-phieu-bao.ts`, `edu-copy.ts`      | Câu chữ ba ngôn ngữ                                    |
| `tests/client/edu-phieu-bao.test.ts`                       | Kiểm thử hàm thuần (dữ liệu phiếu, SVG, lời nhắn)      |
| `tests/client/edu-detail.test.tsx`, `edu-hoc-phi.test.tsx` | Nút, dialog, tham số địa chỉ, người không thấy học phí |
| `.agents/rules/edu.md`                                     | Ghi chú cho agent sau                                  |

## 6. Kiểm tra

- `pnpm exec vitest run tests/client/edu-phieu-bao.test.ts tests/client/edu-detail.test.tsx tests/client/edu-hoc-phi.test.tsx`
- `pnpm exec eslint` + `prettier --check` + kiểm kiểu, giới hạn ở các tệp đã sửa.
- Xem ảnh thật: dựng SVG mẫu (20 buổi như ảnh Lark) → chụp bằng trình duyệt → soát bằng mắt.
- Trên trình duyệt thật (cần phiên đăng nhập): mở dialog, sao chép ảnh dán vào Zalo, tải ảnh, giao diện tối, 375 px.

## 7. Quyết định đã chốt (19/11/2026: Thầy đồng ý cả năm đề xuất)

| #   | Câu hỏi                                                                                          | Đã chốt                                                                                 |
| --- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Q1  | Có làm sổ "đã báo phụ huynh" (ý tưởng G) không?                                                  | **Có.** Bảng `eduPhieuBao` (học viên, kỳ, ngày, người báo), quyền theo `edu.thanhToan`. |
| Q2  | Có in mã VietQR kỳ tiếp theo lên phiếu (H) không? Nếu có: số buổi và đơn giá mặc định lấy ở đâu? | Có, lấy theo kỳ gần nhất của học viên; kỳ "Chưa rõ" số tiền thì không in QR.            |
| Q3  | Phiếu có cần hiện số tiền đã nộp của kỳ không?                                                   | Không mặc định; thêm công tắc "Hiện số tiền" nếu Thầy cần.                              |
| Q4  | HLV có được tạo phiếu báo không (hiện HLV không thấy học phí)?                                   | Không; nếu cần thì thêm quyền riêng chỉ xem "kỳ + ngày học", không có tiền.             |
| Q5  | Lời nhắn mẫu có đúng giọng của CLB chưa?                                                         | Thầy sửa trực tiếp câu chữ trong `client/locales/edu-copy-phieu-bao.ts` hoặc báo lại.   |

## 8. Kết quả

GĐ 1 làm đúng thiết kế mục 4, ngày 19/11/2026. Không đổi máy chủ, CSDL hay quyền.

Đã kiểm:

| Kiểm tra                                                                | Kết quả                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `tests/client/edu-phieu-bao.test.ts` (dữ liệu phiếu, SVG, lời nhắn)     | 9/9 qua                                                              |
| `tests/client/edu-phieu-bao-dialog.test.tsx` (dialog, phần ảnh giả lập) | 6/6 qua                                                              |
| `tests/client/edu-detail.test.tsx` (nút, `?phieu=`, HLV không có nút)   | 11/11 qua                                                            |
| `tests/client/edu-hoc-phi.test.tsx` (liên kết ở "Cần thu")              | 7/7 qua                                                              |
| `tests/project/agents-md.test.ts`                                       | 3/3 qua                                                              |
| `prettier --check`, `eslint` (các tệp đã sửa), `tsc --noEmit` (client)  | sạch                                                                 |
| Chạy `image.ts` thật trong Edge không giao diện với phiếu mẫu 20 buổi   | ra PNG 1440×1976, 354 KB; `canCopyImage` = `true` ở ngữ cảnh bảo mật |
| Soát ảnh mẫu bằng mắt (hết kỳ + học vượt; sắp hết)                      | bố cục đúng, tiếng Việt đủ dấu                                       |

Chưa kiểm (cần phiên đăng nhập trên trình duyệt, tôi không tự nhập mật khẩu):

- Mở dialog trên ứng dụng đang chạy với dữ liệu thật; bấm "Sao chép ảnh" rồi dán vào Zalo; "Tải ảnh"; "Chia sẻ" trên
  điện thoại.
- Dialog ở giao diện tối, ở 375 px và 390–412 px.
- Trang chạy HTTP thường (IP mạng nội bộ): phải thấy dòng giải thích thay cho nút "Sao chép ảnh".

Điểm lệch so với quy ước chung, có chủ đích:

- `image.ts` dùng trực tiếp `navigator.clipboard` (eslint của dự án cấm, để mọi thao tác chép chữ đi qua
  `copyText()`). `copyText()` không chép được ảnh nên có một dòng `eslint-disable` kèm lý do, gói trong
  `pictureClipboard()`; lời nhắn vẫn chép bằng `copyText()`.
- Ảnh dùng bảng màu cố định, không theo token giao diện (mục 4.2).

Giới hạn đã biết: học viên chưa có kỳ học phí nào thì không có phiếu (kể cả khi đang âm buổi); phiếu chỉ viết theo
ngôn ngữ giao diện của người lập.

## 9. Giai đoạn 2: sổ "đã báo phụ huynh" và mã VietQR (19/11/2026)

### 9.1 Các lựa chọn người triển khai tự quyết (theo ủy quyền)

| Điểm                            | Đã chọn                                                                                                                                                | Vì sao                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Khi nào ghi "đã báo"            | Người dùng bấm **Đánh dấu đã báo** trong dialog; không tự ghi khi sao chép ảnh                                                                         | Sao chép chưa chắc đã gửi; sổ phải đúng thì bộ lọc "chưa báo" mới tin được                                             |
| "Đã báo" tính cho kỳ nào        | Chỉ tính cho **kỳ học viên đang học** (gói hiệu lực mới nhất). Bán gói mới → tự trở lại "chưa báo"                                                     | Không ai phải xoá dấu cũ; không có chuyện "đã báo" từ năm ngoái che mất lần cần báo năm nay                            |
| Quyền                           | Không thêm quyền mới: ghi / bỏ dấu cần `edu.thanhToan` `manage` (Quản trị, Quản lý cơ sở, Kế toán); xem cần `view` của `edu.thanhToan` và `edu.goiHoc` | Ba vai trò này đã thu học phí; không đụng seed quyền nên không phải chạy lại kiểm tra gán quyền; HLV vẫn không thấy gì |
| Bấm nhầm                        | Có nút **Bỏ đánh dấu**; cùng một kỳ trong một ngày chỉ ghi một lần                                                                                     | Sổ không bị bẩn vì bấm hai lần                                                                                         |
| Ai báo                          | Lưu mã tài khoản, hiển thị tên trong hồ sơ học viên                                                                                                    | Đúng đề xuất "ai báo", không lưu thêm dữ liệu cá nhân                                                                  |
| Số tiền trên mã QR              | Gợi ý = học phí của **gói gần nhất có giá** của chính học viên; sửa được ngay trong dialog; gói Lark "Chưa rõ" thì không gợi ý, phải tự nhập mới có mã | Không đoán giá; không in mã sai số tiền                                                                                |
| Khi nào in mã QR                | Mặc định bật ở phiếu **đã hết / học vượt / sắp hết**, tắt ở phiếu đang học; có ô bật tắt. Chưa cấu hình `EDU_VIETQR_*` thì không hiện gì               | Chỉ mời chuyển khoản khi thật sự cần nộp                                                                               |
| Nội dung chuyển khoản           | `HP <mã học viên>`                                                                                                                                     | Chưa có gói của kỳ mới nên không dùng được mã gói như quầy thu ngân; mã học viên đủ để kế toán đối soát                |
| Ai tải ảnh mã QR                | Trình duyệt tải thẳng từ dịch vụ VietQR (không cookie, không referrer), máy chủ chỉ dựng địa chỉ                                                       | Giống cách quầy thu ngân đang làm; máy chủ không phải gọi ra ngoài                                                     |
| Hiện số tiền đã nộp của kỳ (Q3) | Không làm công tắc                                                                                                                                     | Thầy chưa cần; nhiều kỳ Lark "Chưa rõ" sẽ gây hiểu lầm                                                                 |

### 9.2 Đã làm

- **CSDL:** migration `202611190001_create_edu_phieu_bao` (bảng `eduPhieuBao`: học viên, gói của kỳ, ngày, số buổi còn
  lại lúc báo, người báo). Bảng đã vào `BACKUP_TABLES`; bản sao lưu lên phiên bản 2.4 (tệp 1.0–2.3 vẫn khôi phục được).
- **Máy chủ:** `server/edu/phieu-bao.ts` (quy tắc "dấu nào còn hiệu lực"), `server/routes/edu-phieu-bao.ts`
  (`/phieuBao/ghi`, `/phieuBao/xoa`, `/phieuBao/vietQr`); `/soDu/canhBao` trả thêm `daBao` và nhận bộ lọc
  `baoPhuHuynh`; `/hocVien/hoSo360` trả `hocPhi.cacLanBao`.
- **Giao diện:** dialog có mục "Theo dõi báo phụ huynh" và ô "Kèm mã QR chuyển khoản kỳ tiếp theo" (kèm ô số tiền); ảnh
  và lời nhắn có thêm khối chuyển khoản; tab "Cần thu" có cột "Báo phụ huynh" và bộ lọc Tất cả / Chưa báo / Đã báo.

### 9.3 Phát hiện khi kiểm trong trình duyệt thật

Dịch vụ ảnh VietQR chuyển hướng `.png` → `.svg` với trình duyệt, và phản hồi chuyển hướng **không có header CORS**, nên
`fetch` địa chỉ `.png` bị chặn (kiểm thử bằng jsdom không thể thấy lỗi này). Route của phiếu báo vì vậy trả địa chỉ
`.svg`, vốn trả `Access-Control-Allow-Origin: *`. Quầy thu ngân dùng thẻ `<img>` nên không bị ảnh hưởng. Nếu sau này
dịch vụ đổi cách trả lời, dialog báo "Không tải được mã QR" và ảnh vẫn dùng được, chỉ thiếu mã.

### 9.4 Đã kiểm

| Kiểm tra                                                                                               | Kết quả                                                        |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `tests/server/edu-phieu-bao.test.ts` (đánh dấu, phạm vi, lọc "Cần thu", VietQR) trên ứng dụng thật     | 7/7 qua                                                        |
| `tests/server/edu-crm-backup` (14), `edu-ho-so` (5), `edu-diem-danh` (11), `edu-scope` (2)             | qua                                                            |
| `tests/server/edu-doi-soat` (5), `app-server` (28), `tests/database/edu-migrations` (17, có bảng mới)  | qua                                                            |
| `tests/client/edu-phieu-bao` (10), `edu-phieu-bao-dialog` (12), `edu-detail` (11), `edu-hoc-phi` (9)   | qua                                                            |
| `tests/client/edu-format` (3), `edu-home` (3), `tests/project/agents-md` (3)                           | qua                                                            |
| `tests/server/authorization-assignment-safety` (2): GĐ 2 không đổi quyền, chạy để chắc                 | qua                                                            |
| `eslint`, `prettier` trên các tệp đã sửa; `tsc --noEmit` cho client và cho server                      | sạch                                                           |
| Tải mã QR mẫu rồi vẽ vào phiếu trong Edge, trang chạy từ `http://127.0.0.1` (tài khoản mẫu của VietQR) | mã tải được qua CORS, ảnh cuối 1440×2570, không bị chặn canvas |
| `tests/playwright/phieu-bao.test.ts` (10 ca) trong Edge thật, trên trang mẫu không cần máy chủ         | 10/10 qua (xem dưới)                                           |
| `pnpm typecheck` (cả ba cấu hình), `pnpm lint` toàn dự án, `pnpm check:packages`                       | sạch                                                           |

Kiểm thử trình duyệt (`tests/playwright/phieu-bao.test.ts` + trang mẫu `tests/fixtures/phieu-bao.tsx`, dữ liệu giả, không
đăng nhập) xác nhận những gì jsdom không thấy được: ảnh PNG thật sự vào clipboard (rộng 1440 px), tệp tải về đúng tên
`phieu-bao-<mã>-ky-<n>.png`, lời nhắn chép được, đánh dấu "đã báo" rồi chỉ đọc lại hồ sơ khi đóng, người không có quyền
thu thì không có nút đánh dấu, dialog vừa màn hình 412 / 390 / 375 px ở cả giao diện sáng và tối, mã QR tải từ dịch vụ
thật và ảnh có mã vẫn xuất được PNG.

Kiểm thử máy chủ phải chạy bằng **Node 24** (đúng `engines`); shell mặc định của máy đang là Node 22 nên báo
`ERR_UNKNOWN_FILE_EXTENSION`. Lệnh đã dùng: `fnm exec --using=v24.18.0 -- node node_modules/vitest/vitest.mjs run <tệp>`.

### 9.5 Chưa kiểm ở thời điểm viết mã (đã xử lý ở mục 10)

- Dữ liệu thật và PostgreSQL: xem mục 10.
- Mã QR bằng tài khoản thật của CLB và việc dán ảnh vào Zalo: xem mục 11.

### 9.6 Giới hạn đã biết

- Kỳ cuối là "Điều chỉnh tay" (không có gói) trong khi học viên vẫn có gói hiệu lực: dấu "đã báo" của kỳ đó không
  được tính ở "Cần thu". Hiếm gặp; chấp nhận.
- Bộ lọc "Chưa báo / Đã báo" đọc tối đa 5.000 học viên cần thu rồi mới cắt trang.
- Tên người báo vừa đánh dấu chỉ hiện sau khi đóng dialog và mở lại (dialog không đọc lại hồ sơ khi đang mở).

## 10. Gộp mã và triển khai lên bản thật (19/11/2026)

### 10.1 Gộp mã

- PR #54 (`feat/phieu-bao-ky-hoc-phi` → `main`), CI `ds-check` xanh cả hai job: `check` (toàn bộ `pnpm check`: lint, định
  dạng, kiểm kiểu, mọi kiểm thử, build; 8 phút 14 giây) và `postgres` (PostgreSQL 16, có
  `tests/server/edu-phieu-bao.test.ts`; 1 phút 38 giây). Gộp thành commit `16daf54`.

### 10.2 Triển khai (theo đúng quy trình của `2026-11-19-ke-hoach-cap-nhat-vps-nocoedu.md`)

| Bước           | Kết quả                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sao lưu        | `/root/backups/nocoedu-20261119-truoc-phieu-bao/`: `nocoedu.dump` (708 KB, 86 bảng có dữ liệu), `storage.tgz` (14,8 MB)                                    |
| Image dự phòng | `nocoedu-app:rollback-20261119-truoc-phieu-bao` (= image đang chạy trước đó, `8da4ec23d046`)                                                               |
| Build          | `docker compose build app` từ `main@16daf54`, 23 phút (máy đang tải nặng, xem 10.4), `BUILD_EXIT=0`; nhật ký `/root/backups/redeploy-phieu-bao.log`        |
| Thay container | `docker compose up -d app` lúc 22:32; container mới báo `healthy` sau 35 giây; CSDL không khởi động lại                                                    |
| Migration      | `202611190001_create_edu_phieu_bao` chạy lúc 22:33:16 (batch 7); bảng `edu_phieu_bao` có đủ 7 cột, 0 dòng                                                  |
| Dữ liệu cũ     | Giữ nguyên trước và sau: 174 học viên, 8 lớp, 322 gói, 225 khoản thu, 5.658 dòng điểm danh, 5.686 dòng sổ số dư                                            |
| Nhật ký app    | 0 dòng mức lỗi kể từ khi khởi động                                                                                                                         |
| Từ bên ngoài   | `GET /main/api/healthz` 200; trang chủ 200; `POST /main/api/phieuBao/ghi`, `/xoa`, `/vietQr`, `/soDu/canhBao` trả 401 khi chưa đăng nhập; route lạ trả 404 |

### 10.3 Xem trên bản thật bằng phiên đăng nhập sẵn của Thầy (chỉ xem, không ghi)

- Tab "Cần thu" (`/main/hoc-phi?tab=can-thu`): hiện 73 học viên, có cột "Báo phụ huynh" (mọi dòng đang "Chưa báo"), bộ
  lọc "Tất cả" và liên kết "Phiếu báo" trên từng dòng.
- Bấm "Phiếu báo" ở một dòng: mở hồ sơ học viên với dialog phiếu báo của kỳ đang học; ảnh có đủ kỳ, số buổi, lưới ngày
  học và mục "Buổi học thêm, chưa có học phí"; lời nhắn soạn sẵn đúng học viên; mục "Theo dõi báo phụ huynh" ghi "Chưa
  đánh dấu"; ba nút Chia sẻ / Tải ảnh / Sao chép ảnh đều bật. Không có ô mã QR vì máy chủ chưa cấu hình VietQR (đúng
  thiết kế).
- Tôi không bấm "Đánh dấu đã báo", không sao chép và không tải ảnh nào của học viên thật.

### 10.4 Điều nên biết

- **VPS đang tải rất cao:** load trung bình 63 trong lúc build và vẫn 52 sau khi build xong, trên máy 6 nhân (tôi không
  đo trước khi build). Lúc xem, tốn CPU nhất là một dịch vụ khác trên cùng máy (`compose-navigate-online-bus-…-api`,
  ~129% CPU), không phải NocoEdu. NocoEdu vẫn trả lời bình thường, nhưng lần build này mất 23 phút thay vì ~15. Tôi
  không đụng tới các ứng dụng đó; Thầy nên cho người xem.
- Trong danh sách "Cần thu" nhiều học viên đang âm rất sâu (vài chục buổi). Phiếu báo của các em này liệt kê toàn bộ
  buổi học thêm nên ảnh khá dài. Đây là số liệu sau lần nạp lịch sử học phí, không phải lỗi của phiếu báo; nếu Thầy
  muốn ảnh gọn hơn (ví dụ chỉ hiện 10 buổi gần nhất kèm "và n buổi khác") thì đó là một chỉnh sửa nhỏ.

### 10.5 Hoàn tác (nếu cần)

1. Trên VPS: `docker tag nocoedu-app:rollback-20261119-truoc-phieu-bao nocoedu-app:main`, rồi trong thư mục compose
   `docker compose -p compose-synthesize-online-firewall-897jlk up -d app`. Mã cũ không dùng bảng `edu_phieu_bao`; bảng
   thừa không gây hại.
2. Chỉ khi dữ liệu cũ bị ảnh hưởng (hiện không có dấu hiệu nào): dừng app, `pg_restore --clean -d nocoedu` từ
   `/root/backups/nocoedu-20261119-truoc-phieu-bao/nocoedu.dump`, rồi chạy image cũ.

## 11. Việc cần Thầy làm nốt

### 11.1 Bật mã VietQR (cần số tài khoản của CLB, tôi không có)

Cần ba giá trị: mã ngân hàng (tên viết tắt hoặc mã BIN mà vietqr.io nhận, ví dụ `vietinbank` hoặc `970415`), số tài
khoản, tên chủ tài khoản (chữ in hoa không dấu). Có hai cách:

**Cách A — gửi ba giá trị đó cho người triển khai** (Claude hoặc kỹ thuật viên) để làm các bước của cách B.

**Cách B — tự làm trên VPS:**

1. `ssh root@217.15.160.118`
2. `cd /etc/dokploy/compose/compose-synthesize-online-firewall-897jlk/code`
3. Sao lưu hai tệp: `cp docker-compose.yml docker-compose.yml.bak-vietqr && cp .env .env.bak-vietqr`
4. Thêm vào cuối tệp `.env` (thay giá trị thật):

   ```
   EDU_VIETQR_BANK_ID=vietinbank
   EDU_VIETQR_ACCOUNT_NO=0000000000
   EDU_VIETQR_ACCOUNT_NAME=CONG TY CP CO VUA DUONG SINH
   ```

5. Trong `docker-compose.yml`, ở dịch vụ `app`, mục `environment:`, ngay dưới dòng `LARK_DOMAIN: …`, thêm ba dòng
   (thụt lề đúng 6 dấu cách như các dòng bên trên):

   ```
         EDU_VIETQR_BANK_ID: ${EDU_VIETQR_BANK_ID:-}
         EDU_VIETQR_ACCOUNT_NO: ${EDU_VIETQR_ACCOUNT_NO:-}
         EDU_VIETQR_ACCOUNT_NAME: ${EDU_VIETQR_ACCOUNT_NAME:-}
   ```

6. Kiểm tra cú pháp: `docker compose -p compose-synthesize-online-firewall-897jlk config --quiet && echo OK`
7. Áp dụng (app khởi động lại khoảng 40 giây, không build lại):
   `docker compose -p compose-synthesize-online-firewall-897jlk up -d app`
8. Kiểm tra: mở một phiếu báo của học viên đã hết kỳ; phải thấy ô "Kèm mã QR chuyển khoản kỳ tiếp theo" và khối mã QR
   trong ảnh. Quét thử bằng ứng dụng ngân hàng: đúng tên chủ tài khoản, số tiền và nội dung `HP <mã học viên>`. Quầy
   thu ngân (nút "Mã QR" của một gói) cũng bắt đầu dùng được.

Lưu ý: nếu sau này Thầy bấm "Deploy" trong bảng điều khiển Dokploy, Dokploy có thể ghi lại `docker-compose.yml` từ bản
nó lưu. Để chắc, dán ba dòng ở bước 5 vào cả phần Compose của ứng dụng trong Dokploy, và ba dòng ở bước 4 vào phần
Environment.

### 11.2 Gửi thử một phiếu qua Zalo

1. Vào `https://nocoedu.dsc.edu.vn/main/hoc-phi?tab=can-thu`, chọn một học viên, bấm **Phiếu báo**.
2. Đọc lại ảnh và lời nhắn (sửa lời nhắn nếu cần), bấm **Sao chép ảnh**, sang Zalo dán (Ctrl+V) vào cuộc trò chuyện
   với phụ huynh; quay lại bấm **Sao chép lời nhắn** rồi dán tiếp. Trên điện thoại dùng nút **Chia sẻ** → Zalo.
3. Gửi xong bấm **Đánh dấu đã báo**. Đóng dialog; ở tab "Cần thu" dòng đó phải đổi thành "Đã báo dd/mm", và bộ lọc
   "Chưa báo" không còn em đó.
4. Nếu câu chữ chưa đúng giọng của CLB, báo lại câu cần sửa (tệp `client/locales/edu-copy-phieu-bao.ts`).

### 11.3 Máy lập trình

- `main` cục bộ đã cập nhật tới `16daf54`. Lần chạy `pnpm dev` tới sẽ tự tạo bảng mới trong CSDL dev.
- Shell mặc định đang là Node 22, dự án cần Node 24: `fnm default v24.18.0` (đã cài sẵn) để kiểm thử máy chủ chạy được
  bằng `pnpm exec vitest run …` như thường.
