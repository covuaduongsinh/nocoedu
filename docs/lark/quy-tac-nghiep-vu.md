# Quy tắc nghiệp vụ đọc ra từ Lark (giai đoạn 1)

> **Giai đoạn 2:** Thầy Tường đã trả lời hầu hết các câu hỏi (09/11/2026): nguồn điểm danh chuẩn là Base, Sheets chỉ là danh sách dự kiến; `0` là vắng và chưa trừ buổi; số dư = số buổi đã nộp − số buổi có mặt; `học lớp 2` là tuổi của học viên, không phải học bù; `NM1`/`NM2` là cấp Tốt; giữ cả ngày sinh. Bảng câu hỏi và hằng số ở [anh-xa-nocoedu.md](anh-xa-nocoedu.md#các-câu-hỏi); các nhãn `[Cần Thầy Tường xác nhận]` bên dưới là nhận định của giai đoạn 1, phần nào mâu thuẫn với câu trả lời thì câu trả lời được ưu tiên. Còn mặc định ở câu 7, 10, 12.

Tài liệu này diễn giải từng công thức và trường tra cứu trong [schema.md](schema.md) thành câu tiếng Việt, rồi nêu chỗ công thức mâu thuẫn nhau và chỗ dữ liệu được nhập tay thay cho công thức. Đề xuất ánh xạ sang NocoEdu ở [anh-xa-nocoedu.md](anh-xa-nocoedu.md).

Nhãn **[Cần Thầy Tường xác nhận]** đánh dấu chỗ suy ra từ tên trường, kiểu ô hay mã giá trị lặp lại, không có công thức nào nói rõ. Không có nội dung bản ghi nào của học viên được đọc để viết tài liệu này: chỉ cấu trúc, số bản ghi và các mã ngắn lặp lại (như `1`, `x`, `Mã`).

## 0. Điều cần biết trước

- **Automation chưa đọc được** (`1254200`). `Contact` và `Deal HP` đọc được từ 10/11/2026 và được giải mã ở [schema.md](schema.md); mục [Chưa đọc được](#chưa-đọc-được-đã-giải-quyết) giữ lại lịch sử hai lần thử bị chặn.
- **Sheets không tính số dư.** Hai file KL357 (2026) và VP26 (2026) chỉ có công thức cộng cột ở dòng cuối mỗi sheet; không có công thức nào tính số buổi còn lại.

## 1. Học viên, phụ huynh, cơ sở (Base)

| Trường                                                                         | Diễn giải                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HocVien."ID Học viên"                                                          | Mã học viên = `HV-` + ngày tạo bản ghi dạng `yyyyMMdd` + `-` + số thứ tự 3 chữ số do Lark tự cấp. Mã đổi theo ngày tạo, không theo ngày nhập học.                                                                                                                                            |
| HocVien."Nhắc sinh nhật"                                                       | Nhắc sinh nhật = "Hôm nay sinh nhật" nếu ngày và tháng của Ngày sinh trùng hôm nay, ngược lại để trống. Cần **ngày sinh đầy đủ**; NocoEdu chỉ lưu năm sinh (tri thức 05) nên tính năng này mất khi chuyển. [Cần Thầy Tường xác nhận] có cần giữ không.                                       |
| HocVien."Họ tên PH", "SDT PH", "Địa chỉ nơi ở"                                 | Họ tên PH = danh sách họ tên của mọi phụ huynh có mã (trường tự tăng `fld6W8Uuwl` của bảng phụ huynh) bằng giá trị trường liên kết "ID contact PH" của học viên, nối lại. Tương tự cho số điện thoại và địa chỉ. Một học viên có nhiều phụ huynh thì các giá trị bị **nối thành một chuỗi**. |
| HocVien."cơ sở"                                                                | Chọn một trong `Kim Liên`, `Vĩnh Phúc`, nhập tay. Lớp (LopHoc."cơ sở") cũng nhập tay riêng: không có ràng buộc học viên cùng cơ sở với lớp.                                                                                                                                                  |
| HocVien."Tình trạng học"                                                       | Một trong `Đang học`, `Đã nghỉ`, `Tạm nghỉ`, `Mới học thử`, `Đăng ký học thử`, `Chưa học thử`. View "Đang học" lọc đúng giá trị `Đang học`.                                                                                                                                                  |
| HocVien."Trình độ ban đầu", "Trình độ hiện tại", "Các trình độ đã học tại CLB" | Liên kết sang bảng Level (12 bản ghi). Không có lịch sử lên cấp có ngày: "Các trình độ đã học" chỉ là danh sách. Trong Sheets, cột Level dùng các mã `NM1`, `NM2`, `Mã`, `Tượng`, `Xe` (và `Test`). [Cần Thầy Tường xác nhận] 12 bản ghi Level gồm những cấp nào.                            |
| Tương tác PH."Tên HS"                                                          | Tên HS = danh sách con của phụ huynh được chọn ở "Tên PH tương tác" (lấy từ trường ngược `HocVien` của bảng phụ huynh).                                                                                                                                                                      |

## 2. Lớp, buổi học, điểm danh

### Base: "2024 Nhận xét mỗi buổi" (723 bản ghi) và "2025 Nhận xét mỗi buổi" (2525 bản ghi)

Mỗi bản ghi là **một học viên trong một buổi**: ngày, lớp, học viên, có mặt, BTVN, ý thức, nội dung buổi, nhận xét.

| Trường                                                           | Diễn giải                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Ngày học" (trường chính, chữ) và "Ngày học - Day format" (ngày) | Ngày buổi học được nhập **hai lần**: một lần dạng chữ (trường chính), một lần dạng ngày. Hai trường không ràng buộc nhau.                                                                                                                                                                |
| "Tháng"                                                          | Tháng = tháng của "Ngày học - Day format".                                                                                                                                                                                                                                               |
| "Năm"                                                            | Năm = năm của "Ngày học - Day format". View "Sort theo cơ sở ba tháng cuối" lọc Tháng là 10, 11 hoặc 12.                                                                                                                                                                                 |
| "cơ sở" (tra cứu)                                                | Cơ sở của buổi = cơ sở của học viên có **tên** (trường chính "Học viên") bằng học viên của bản ghi. So theo tên, không theo mã: hai học viên trùng tên thì ra hai cơ sở.                                                                                                                 |
| "Lớp"                                                            | Liên kết một lớp LopHoc.                                                                                                                                                                                                                                                                 |
| "có mặt"                                                         | 2025: số (`1` có mặt, `0` vắng). 2024: chọn một trong `1`, `0`, `học lớp 2`, `FALSE` và ba lựa chọn là tên giáo viên. Không phân biệt vắng có phép với vắng không phép. [Cần Thầy Tường xác nhận] `học lớp 2` có phải học bù ở lớp khác không, và ba lựa chọn tên giáo viên nghĩa là gì. |
| "Làm BTVN", "Ý thức"                                             | Số. "Ý thức" là điểm, giá trị thường gặp trong Sheets là `9`, `10`. [Cần Thầy Tường xác nhận] thang điểm.                                                                                                                                                                                |
| "Tổng số buổi" (tra cứu)                                         | Tổng số buổi = danh sách "số buổi" (trường `fldHfG75tb`) của **mọi** lần nộp tiền có học viên (trường `fldeLNzRvl`) bằng học viên của bản ghi, nối lại.                                                                                                                                  |
| "Số buổi còn lại"                                                | **Chữ, nhập tay.** Không có công thức.                                                                                                                                                                                                                                                   |
| "Ký hiệu Lần nộp tiền"                                           | Liên kết một lần nộp tiền, chọn tay ở từng buổi.                                                                                                                                                                                                                                         |

### Sheets: KL357 (2026) và VP26 (2026)

Mỗi file là một cơ sở (KL = Kim Liên, VP = Vĩnh Phúc) [Cần Thầy Tường xác nhận]. **Mỗi sheet là một buổi học của cả cơ sở**: tên sheet là mã buổi (`B7`… `B166` năm 2025, `C1_2026`… `C158` năm 2026), tiêu đề cột "Nhận xét" ghi mã buổi, ngày và thứ, ví dụ `(B7: 16/01 - T5)` hay `C10: 19/1/26 - T2-CA2`. Mỗi dòng là một học viên (cột "Tên học viên", "Nick", "Level").

| Cột                                                                                         | Diễn giải                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| KL357: `T3`, `T5`, `T7` · VP26: `T2 CA1`, `T2 CA2`, `T6 CA1`, `T6 CA2`                      | Một cột cho mỗi ca học trong tuần; ô `1` đánh dấu học viên thuộc (hoặc học) ca đó. Mã khác gặp nhiều: `x`, `!`, `?`, `-`. [Cần Thầy Tường xác nhận] `1` là "đăng ký ca này" hay "có mặt ở ca này", và nghĩa của `x`, `!`, `?`. |
| `Có mặt`                                                                                    | `1` có mặt, `0` vắng; còn gặp `x` và chữ `xin nghỉ`. [Cần Thầy Tường xác nhận] `x` là vắng có phép?                                                                                                                            |
| Dòng cuối: `=SUM(E2:E…)` ở mỗi cột ca và cột Có mặt                                         | Sĩ số ca = tổng số ô `1` của cột ca; Số có mặt = tổng cột Có mặt. Ô chữ (`x`, `!`) không được cộng.                                                                                                                            |
| Dòng cuối: `=COUNTA(I2:I…)` ở cột "GV phụ trách"                                            | Số học viên đã có giáo viên phụ trách trong buổi = số ô không trống của cột.                                                                                                                                                   |
| `Làm BTVN`                                                                                  | `1` đã làm, `0` chưa; còn gặp chữ `Đã làm`, `đã làm`, `không mang`.                                                                                                                                                            |
| `Ý thức`                                                                                    | Điểm `9`, `10`; có lúc `0p`, `Xin nghỉ`.                                                                                                                                                                                       |
| `Kế hoạch dạy hôm nay`, `Kiến thức / lý thuyết mới`, `Giao BTVN`, `KH buổi sau`, `Nhận xét` | Chữ tự do. "Kế hoạch dạy hôm nay" hay chứa `xin nghỉ hôm nay`, `xn hn`, `học bù thứ hai` và tiền tố tên giáo viên (`Tường: …`).                                                                                                |
| `Sách đang học`                                                                             | Mã sách: `CT1`–`CT4`, `TG2`, `S3`, `S4`, `VQ4`–`VQ6`, `CH1`, `CH2`.                                                                                                                                                            |
| Sheet "Tồn kho sách 1", "Tồn kho 3"                                                         | Tồn kho sách theo đầu sách, mỗi cặp cột là "Xuất (-)/Nhập (+) ngày …" và "Tồn ở thùng đến cuối ca ngày …". **Không có công thức**: tồn sau mỗi đợt được nhập tay, không tính bằng tồn trước cộng xuất/nhập.                    |
| Sheet "Phát lì xì", "mời workshop", "mau"                                                   | Danh sách phụ, không liên quan điểm danh ("mời workshop" và "mau" đang ẩn).                                                                                                                                                    |

## 3. Gói buổi, số dư buổi, học phí

- **Số buổi còn tồn của một lần nộp (`Deal HP`) = `Số buổi nộp` − `2024 Tổng số buổi đã học` − `2025 Tổng số buổi đã học` − `2026 Tổng số buổi đã học` − `Số buổi đã học chưa thống kê`.** Công thức tính đúng ở mọi dòng. Các "Tổng số buổi đã học" chỉ đếm những buổi có mặt **được gắn tay** vào lần nộp (cột `20xx Tkê ngày học`), nên số tồn của Lark không phải số buổi còn lại thật: năm 2026 có 827/2.491 buổi có mặt chưa gắn vào lần nộp nào.
- **Số dư buổi của một học viên trong NocoEdu = Σ `Số buổi nộp` − Σ `Số buổi đã học chưa thống kê` − số buổi bị trừ của mọi buổi có mặt 2024–2026**, cộng dồn qua các lần nộp đã có cờ `Đã nộp`; không có ngày chốt, không dùng phần gắn tay. Đây là quyết định của chủ dự án (11/11/2026). Buổi nào trừ vào gói nào do NocoEdu tính khi đọc, vào trước ra trước. Hệ quả: số dư tính lại **lệch** `số buổi tồn update` của HocVien ở phần lớn học viên (114/124 khi Opus thử), phần lớn là thấp hơn vì buổi chưa gắn tay.
- [Cần Thầy Tường xác nhận] "Số buổi đã học chưa thống kê" là buổi học trước khi có bảng điểm danh nên được trừ khỏi số buổi nộp (mặc định); nếu là điều chỉnh khác thì đổi `DEAL_RULES.subtractUnrecorded` trong `server/edu/lark/chua-xac-nhan.ts`.
- [Cần Thầy Tường xác nhận] Dòng `Deal HP` chưa có cờ `Đã nộp` (37 dòng) không thành gói; báo `DEAL_CHUA_NOP` (có số buổi) hoặc `DEAL_TRONG` (trống hẳn).
- **Mâu thuẫn:** nhãn `Đã Hết / còn số buổi` chọn tay mâu thuẫn với công thức ở 34 dòng (ghi "Đã hết số buổi" mà số tồn còn dương); 35 dòng có số tồn âm. Không dùng nhãn này.
- HocVien."số buổi tồn update (vào ngày thống kê)" = danh sách "số buổi tồn" (trường `fldBCMdh5j`) của lần nộp tiền có mã (trường chữ `fld40HQwi0`) bằng "Lần nộp tiền gần nhất" của học viên. Tên trường và trường ngày nhập tay đi kèm "Ngày update gần nhất về HP" cho thấy đây là **số dư chốt tay vào một ngày thống kê**, không phải số dư tính liên tục từ điểm danh. [Cần Thầy Tường xác nhận]
- Cách trừ buổi theo điểm danh: **không có công thức nào trên Lark nối "có mặt" với số dư**. Số dư ở từng buổi ("Số buổi còn lại") là chữ nhập tay. Quy tắc trừ buổi hiện dùng trong NocoEdu (`server/edu/so-du.ts`, ghi nhớ `hoc-bu-tru-buoi`) vì vậy không đối chiếu được với Lark; cần Thầy Tường mô tả cách đang trừ: vắng có phép có trừ không, học bù trừ thế nào, `x`/`xin nghỉ` tính là gì. [Cần Thầy Tường xác nhận]

## 4. Sách

| Trường                         | Diễn giải                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Từng lần phát sách."Giá"       | Giá = danh sách "Giá bán cho PH" của mọi sách có "Ký hiệu sách" **chứa** ký hiệu của sách được phát, nối lại. So bằng "chứa" chứ không bằng "bằng": ký hiệu `CT1` cũng khớp `CT10` nếu có. |
| Từng lần phát sách."Tiền sách" | Tiền sách = Giá − Ưu đãi. Nếu "Giá" khớp hai sách thì phép trừ trên một danh sách cho kết quả sai hoặc lỗi.                                                                                |

## 5. Giải đấu nội bộ (ngoài phạm vi NocoEdu, ghi lại để đủ)

| Trường                                                 | Diễn giải                                                                                                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kết quả từng ván."Đạt số điểm là"                      | Điểm ván = "Cách tính điểm số" của dòng trong bảng "Cách tính điểm" có "Kết quả ván đấu" bằng kết quả ván (`Thắng`, `Hòa`, `Thua`).                                                     |
| Kết quả từng ván."Tên HS", Tổng điểm cộng dồn."Tên HS" | Tên kỳ thủ = "Tên HS" của dòng Tham gia giải đấu có "ID HS đấu giải" bằng kỳ thủ của bản ghi.                                                                                           |
| Tổng điểm cộng dồn."Tổng điểm"                         | Tổng điểm = tổng "Đạt số điểm là" của mọi ván có kỳ thủ là "ID Kỳ thủ", **qua mọi giải** (không lọc theo giải). Đối chiếu tri thức 07 (thể thức giải nội bộ) khi làm ứng dụng giải đấu. |

## 6. Việc của đội (ngoài phạm vi NocoEdu)

- Team meeting, Task Team EDU/ADMIN/EVENT, Lưu trữ."Thời gian còn lại" = trống nếu chưa có Deadline; nếu Deadline còn ở tương lai thì "Còn lại N ngày h:mm giờ"; nếu đã qua thì "Đã qua Deadline N ngày h:mm giờ".
- Lưu trữ."TỔNG TASK PHÁT SINH" = số task có "Task cha" là task này; "TỔNG TASK CON finished" = số task con có Status bằng một lựa chọn cố định (id `optdeXXOkS`); "Tỷ lệ hoàn thành" = finished / phát sinh, để trống khi chia cho 0.
- Task Team EDU."Parent items" trỏ tới bảng `tblwsn0VJepwqi2q` đã bị xoá (`1254041`).

## 7. Mâu thuẫn và chỗ nhập tay đè công thức

1. **Số dư buổi có ba nguồn không khớp nhau**: "Số buổi còn lại" (chữ nhập tay ở từng buổi), "số buổi tồn update (vào ngày thống kê)" (lấy từ lần nộp tiền gần nhất, chốt tay theo ngày), và "Tổng số buổi" (danh sách số buổi của **mọi** lần nộp tiền). Không công thức nào trừ buổi theo điểm danh. Khi nhập sang NocoEdu, số dư phải **tính lại** từ gói buổi và điểm danh, rồi so với số trên Lark (giai đoạn 3 có bảng so sánh).
2. **"Tổng số buổi" không theo lần nộp tiền đã chọn.** Bản ghi buổi có "Ký hiệu Lần nộp tiền" chọn tay, nhưng "Tổng số buổi" lọc mọi lần nộp tiền theo học viên, nên học viên đã đóng nhiều lần thấy một danh sách nhiều số.
3. **Tra cứu theo tên thay vì theo mã.** "cơ sở" của buổi học so tên học viên dạng chữ; học viên trùng tên (hoặc đổi tên) cho cơ sở sai. Phụ huynh thì so theo mã tự tăng (đúng hơn).
4. **Ngày buổi học nhập hai lần** ("Ngày học" chữ và "Ngày học - Day format" ngày); "Tháng"/"Năm" chỉ tính theo trường ngày.
5. **Điểm danh có hai nơi**: Base "2025 Nhận xét mỗi buổi" (2525 bản ghi, ngày, lớp, có mặt) và Sheets KL357/VP26 (một sheet mỗi buổi từ 2025 đến 2026). [Cần Thầy Tường xác nhận] nguồn nào là chuẩn cho từng giai đoạn, và hai nguồn có trùng buổi không.
6. **Mã trạng thái lẫn chữ trong cột số**: cột ca và cột "Có mặt" của Sheets có ô chữ (`x`, `!`, `?`, `xin nghỉ`) mà công thức `SUM` bỏ qua; "Làm BTVN" có cả `1` lẫn `đã làm`; Base 2024 "có mặt" có lựa chọn `FALSE` và tên giáo viên. Ghi chú vắng ("xin nghỉ hôm nay") còn nằm ở cột "Kế hoạch dạy hôm nay".
7. **Vùng `SUM` và `COUNTA` lệch nhau** trong cùng sheet ở một số nhóm (ví dụ KL357 nhóm N5: `SUM(E2:E77)` nhưng `COUNTA(I2:I74)`), nên học viên ở mấy dòng cuối không được đếm giáo viên phụ trách. Số học viên trong sheet tăng dần (32 → 114 dòng) mà công thức tổng được chép theo sheet trước.
8. **Tồn kho sách nhập tay** dù là phép cộng trừ đơn giản (xem phần 2).
9. **Ràng buộc cơ sở**: học viên và lớp chọn cơ sở độc lập, nên một học viên Kim Liên có thể có buổi ở lớp Vĩnh Phúc mà không có cảnh báo.
10. **Dữ liệu ngoài phạm vi tối thiểu** (tri thức 05) đang có trên Lark: CCCD, tên trường và lớp ở trường, địa chỉ nơi ở và địa chỉ hóa đơn, ngày sinh đầy đủ, ảnh buổi đầu, ảnh bài test đầu vào, sở thích. NocoEdu **không nhập** các trường này (xem đề xuất ánh xạ).

## Chưa đọc được (đã giải quyết)

Đến 09/11/2026 app bị chặn ở `Contact` và `Deal HP`; từ 10/11/2026 đã đọc được cả hai, giai đoạn 3 nhập chúng. Bảng dưới giữ lại lịch sử hai lần thử.

Đã thử hai lần với app `--as bot`, lần 1 lúc 2026-11-09T12:55Z, lần 2 lúc 2026-11-09T13:48Z, sau khi chủ dự án báo đã cấp quyền tối đa. Theo quyết định của chủ dự án, không thử thêm; các phần dưới chỉ là đề xuất dựa trên trường tra cứu ở bảng khác.

| Nguồn                                                               | Lệnh                                                                                      | Lỗi                                   | Ảnh hưởng                                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bảng `tblZUIXmpdt13j4x` (suy ra là **phụ huynh**)                   | `lark-cli api GET /open-apis/bitable/v1/apps/:app_token/tables/:table_id/fields --as bot` | `1254302 The role has no permissions` | Ánh xạ phụ huynh: chỉ biết các trường họ tên (`fldCyV9C6F`), SĐT (`fldGZHpThh`), địa chỉ (`fldq03LG65`), mã tự tăng (`fld6W8Uuwl`), trường ngược `HocVien` (`fld1EEysvi`). Không biết Zalo, email, quan hệ, số bản ghi     |
| Bảng `tblHp1PGPz52eZBz` (suy ra là **các lần nộp tiền / gói buổi**) | như trên                                                                                  | `1254302 The role has no permissions` | Ánh xạ gói buổi và **số dư**: chỉ biết số buổi (`fldHfG75tb`), số buổi tồn (`fldBCMdh5j`), một mã chữ (`fld40HQwi0`), liên kết học viên (`fldeLNzRvl`). Không biết số tiền, đơn giá, ngày nộp, công thức số dư, số bản ghi |
| Automation/workflow của Base                                        | `lark-cli api GET /open-apis/bitable/v1/apps/:app_token/workflows --as bot`               | `1254200` (lỗi chung phía Lark)       | Không biết có automation nào tự trừ buổi hay tự cập nhật số dư không                                                                                                                                                       |

Có thể quyền "tối đa" được cấp ở mức chia sẻ tài liệu, còn quyền nâng cao của Base vẫn giới hạn vai trò của app; muốn app đọc được thì cần thêm app vào một vai trò quyền nâng cao có quyền xem hai bảng này. [suy đoán, Cần Thầy Tường xác nhận]

Đề xuất thay thế (chờ duyệt ở giai đoạn 2, chi tiết trong [anh-xa-nocoedu.md](anh-xa-nocoedu.md)):

- **Phụ huynh**: tạo từ các trường tra cứu trên HocVien ("Họ tên PH", "SDT PH") và lựa chọn "Quan hệ"; khi học viên có nhiều phụ huynh thì Lark nối giá trị thành một chuỗi, phải tách theo dấu phân cách và ghép cặp họ tên – SĐT theo thứ tự. [Cần Thầy Tường xác nhận]
- **Gói buổi và số dư**: không dựng lại lịch sử nộp tiền. Mỗi học viên nhận **một gói mở đầu** bằng "số buổi tồn update (vào ngày thống kê)" vào ngày "Ngày update gần nhất về HP"; số dư NocoEdu = gói mở đầu − số buổi bị trừ theo điểm danh sau ngày đó (`sessionsToDeduct`). [Cần Thầy Tường xác nhận]
