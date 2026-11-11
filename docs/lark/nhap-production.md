# Nhập dữ liệu Lark vào NocoEdu trên production

Lệnh: `pnpm nocobase app edu import-lark [--dry-run | --commit --user <id>] [--delay-ms <ms>] [--json]`.

Framework đặt lệnh riêng của ứng dụng dưới topic `app`, nên lệnh là `app edu import-lark` (không phải `edu import-lark` như mô tả ban đầu của issue). Trong image Docker không có pnpm: `node dist/cli/index.js app edu import-lark …`.

## Lệnh làm gì

1. Đọc danh sách bảng của Base (`GET …/tables`, theo trang), rồi đọc **LopHoc, HocVien, Contact, Deal HP, Level** (12 dòng, chỉ để biết tên cấp) và **mọi bảng tên `<năm> Nhận xét mỗi buổi`** qua `lark-cli api GET … --as bot` (app bot, không OAuth người dùng). Bắt buộc phải thấy đủ ba bảng 2024 (`tblprrzroE2NBli5`), 2025 (`tbluhrY4B8i63PAh`) và 2026 (`tbl9TTf0m2EhWV3g`); năm sau chỉ cần có bảng cùng tên, không phải sửa code. Thiếu bảng (bảng bị Base ẩn khỏi app vì quyền nâng cao cũng không hiện trong danh sách) → dừng với `LARK_KHONG_DOC_DUOC`; hai bảng cùng năm hoặc sai mã bảng → `LARK_CAU_TRUC_DOI`. Đọc theo trang 500 dòng, mỗi lần gọi `lark-cli` tối đa 120 giây và yêu cầu token tối đa 30 giây (quá hạn thì dừng với `LARK_HET_GIO` hoặc `LARK_TOKEN`), nghỉ `--delay-ms` (mặc định 1200 ms) giữa hai lần gọi, gặp lỗi tần suất `99991400` thì chờ lâu dần rồi thử lại. Khoảng 6.000 bản ghi, chừng 20 lần gọi.
2. Trước khi đọc bản ghi, kiểm danh sách trường của từng bảng. Thiếu hoặc đổi tên một trường thì dừng với `LARK_CAU_TRUC_DOI`, không đoán.
3. Dữ liệu chỉ nằm trong bộ nhớ của lệnh; không ghi ra file, CSV hay log.
4. Lập **một kế hoạch** (hàm thuần `lapKeHoach`) theo thứ tự cơ sở → lớp và lịch → phụ huynh → học viên → gói mở đầu → buổi và điểm danh. `--dry-run` chỉ in kế hoạch; `--commit` ghi đúng kế hoạch đó nên hai chế độ không thể lệch nhau.
5. `Contact` (`tblZUIXmpdt13j4x`, phụ huynh) và `Deal HP` (`tblHp1PGPz52eZBz`, các lần nộp) được đọc từ giai đoạn 3 (app đọc được từ 10/11/2026). Phụ huynh lấy từ `Contact`, gói buổi từ `Deal HP`; số dư **tính lại** từ các gói và mọi buổi có mặt 2024–2026 (quyết định 11/11/2026). Một bảng bị Base ẩn khỏi app thì lệnh dừng với `LARK_KHONG_DOC_DUOC`.

### Quy tắc chính (đã duyệt, xem `anh-xa-nocoedu.md`)

- Khoá chống trùng là `externalId`. Chạy lại chỉ thêm những `externalId` chưa có; **không cập nhật** bản ghi đã nhập, nên sửa trên Lark rồi chạy lại không đổi bản đã nhập.
- Số dư buổi: học viên có `Deal HP` = Σ số buổi các gói (mỗi lần nộp có cờ `Đã nộp`, trừ "chưa thống kê") − mọi buổi bị trừ 2024–2026; học viên không có Deal = gói mở đầu − số buổi có mặt **sau** ngày chốt. Vắng (`0`) không trừ buổi; trừ khi vắng không phép bật được bằng biến `EDU_TRU_BUOI_VANG_KHONG_PHEP=true` (chốt vào từng buổi lúc nhập). Điểm danh từ ngày chốt trở về trước được lưu với `tinhVaoSoDu = false`.
- Học viên đã có trong NocoEdu: **ghép** (không nhân đôi) khi khớp đủ ba thứ: tên đã chuẩn hoá, năm sinh và SĐT phụ huynh. Chỉ gán `externalId` và `externalCode`, không ghi đè trường nào. Khớp nhiều bản ghi: lỗi `TRUNG_NHIEU`, bỏ dòng. Ghép với học viên đã có gói hoặc số dư khác 0: không cộng số dư từ Lark (`GHEP_BO_QUA_SO_DU`). Nếu production chưa có học viên thì quy tắc này không có tác dụng; `--dry-run` in riêng cột "ghép".
- Dòng lỗi bị bỏ cùng mọi dòng phụ thuộc vào nó (học viên lỗi thì điểm danh của học viên đó cũng bị bỏ). Lỗi cấu trúc thì không cho `--commit`.
- Học viên nhập vào chưa có bản ghi đồng ý `eduDongY` (Lark không có thông tin này). Mặc định là "chưa đồng ý", nên chưa công bố gì; CLB cần thu đồng ý sau.
- "GV Phụ trách" ghép với tài khoản NocoEdu theo email; không khớp thì để trống và báo `HLV_CHUA_GHEP`.

### Mã lỗi và cảnh báo

| Mã                                                                                                | Ý nghĩa                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `THIEU_HO_TEN`, `THIEU_NAM_SINH`, `CO_SO_KHONG_RO`, `CAP_KHONG_RO`, `TRANG_THAI_KHONG_RO`         | học viên bị bỏ                                                                                                                                                                                               |
| `TRUNG_NHIEU`                                                                                     | khớp nhiều học viên có sẵn, bỏ dòng                                                                                                                                                                          |
| `SDT_SAI`, `PH_THIEU_TEN`                                                                         | Contact bị bỏ; học viên vẫn nhập với cảnh báo `THIEU_PHU_HUYNH`                                                                                                                                              |
| `SO_DU_KHONG_RO`, `THIEU_NGAY_CHOT`                                                               | không tạo gói mở đầu cho học viên đó                                                                                                                                                                         |
| `DIEM_DANH_KHONG_RO`                                                                              | ô "có mặt" không phải `1`/`0`/`FALSE` (ví dụ `học lớp 2`, tên giáo viên): không nhập, không trừ buổi                                                                                                         |
| `BUOI_DA_CO`                                                                                      | NocoEdu đã có một buổi của lớp đó cùng ngày, cùng giờ (nhập tay, hoặc HLV đã điểm danh): buổi đó và điểm danh của nó bị bỏ, phần còn lại vẫn nhập                                                            |
| `BUOI_CUNG_NGAY_KHAC_GIO`                                                                         | NocoEdu đã có một buổi của lớp đó cùng ngày nhưng khác giờ (học bù, đổi ca): buổi của Lark vẫn nhập, nên học viên có thể bị trừ hai buổi trong một ngày; xem lại các mã buổi này sau khi nhập                |
| `HOC_VIEN_BI_BO`, `LOP_KHONG_RO`, `LOP_BI_BO`, `NGAY_KHONG_RO`, `GIO_BUOI_KHONG_RO`, `TRUNG_DONG` | dòng điểm danh bị bỏ                                                                                                                                                                                         |
| `DONG_TRONG`                                                                                      | dòng điểm danh trống hẳn (không học viên, không lớp, không ô "có mặt"; bảng 2026 có khoảng 114 dòng): bỏ qua và đếm riêng, không tính lỗi. Dòng có "có mặt" mà thiếu học viên vẫn là lỗi `HOC_VIEN_KHONG_RO` |
| `PH_THIEU_SDT`                                                                                    | Contact có liên kết học viên nhưng không có số điện thoại: không nhập phụ huynh (cảnh báo); học viên vẫn nhập                                                                                                |
| `DEAL_TRONG`, `DEAL_CHUA_NOP`                                                                     | cảnh báo: dòng `Deal HP` trống hẳn, hoặc có số buổi mà chưa có cờ `Đã nộp`; không tạo gói                                                                                                                    |
| `DEAL_THIEU_NGAY`, `DEAL_SO_BUOI_SAI`, `DEAL_THIEU_HOC_VIEN`                                      | lỗi: dòng `Deal HP` đã nộp nhưng thiếu cả `Ngày nộp HP` lẫn `Ngày bắt đầu`, số buổi không phải số nguyên, hoặc không có học viên; không tạo gói                                                              |
| `DIEM_DANH_CU_KHONG_TRU`                                                                          | cảnh báo: học viên đã có điểm danh nhập từ Lark ghi là "đã nằm trong số dư mở đầu" và chưa có gói Deal: Deal của họ bị bỏ qua, số dư giữ nguyên                                                              |
| `DEAL_DA_DOI`, `SO_DU_LARK_DA_DOI`                                                                | cảnh báo: Deal hoặc số dư trên Lark đã đổi sau lần nhập; gói đã ghi không được sửa, số dư tính theo giá trị đã ghi                                                                                           |
| `DEAL_HET_SAU_TRU`                                                                                | cảnh báo: Deal đã nộp nhưng `Số buổi nộp` trừ "chưa thống kê" bằng 0: không tạo gói                                                                                                                          |
| `KHOA_CU_LARK_PH`, `GOI_CU_LARK_SODU`                                                             | cảnh báo: lần nhập trước giai đoạn 3 đã ghi phụ huynh theo `lark:ph:<SĐT>` hoặc gói mở đầu `lark:sodu:<rec>`. Xem mục "Đã nhập trước giai đoạn 3" dưới đây                                                   |
| `KHONG_CO_SO_DU`, `HLV_CHUA_GHEP`, `EMAIL_SAI`, `NHAN_XET_CAT`                                    | cảnh báo, vẫn nhập                                                                                                                                                                                           |

Output, nhật ký và log **chỉ** có số dòng, mã học viên cũ trên Lark (`HV-…`), mã bản ghi Lark (`rec…`) và mã lỗi; không có họ tên, SĐT, email, ngày sinh hay nhận xét.

## Chạy trên production

Các bước dành cho người có quyền vào server (Dokploy). Không đưa bí mật vào dòng lệnh hay vào repo.

1. **Triển khai bản đã merge** và áp migration (có thể tự chạy khi khởi động): `node dist/cli/index.js db apply`. Hai migration của việc này: `202611100001_edu_lark_mapping`, `202611100002_edu_nhap_lark`.
2. **Cài `lark-cli`** vào một thư mục tạm trong container (không thêm vào `dependencies` của ứng dụng): `mkdir -p /tmp/lark && cd /tmp/lark && npm install @larksuite/cli`, rồi đặt `LARK_CLI=/tmp/lark/node_modules/.bin/lark-cli`.
3. **Biến môi trường** (đặt trong Dokploy, tab Environment; không gõ secret trên dòng lệnh):

   | Biến                                            | Ý nghĩa                                                                                   |
   | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
   | `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_DOMAIN` | app Lark đã được chia sẻ quyền xem Base; `LARK_DOMAIN` ví dụ `https://open.larksuite.com` |
   | `LARK_CLI`                                      | đường dẫn `lark-cli` (mặc định tìm `lark-cli` trên `PATH`)                                |
   | `EDU_TRU_BUOI_VANG_KHONG_PHEP`                  | không đặt (mặc định không trừ buổi khi vắng)                                              |

   Secret chỉ dùng để xin token một lần; lệnh truyền token cho `lark-cli` qua biến môi trường của tiến trình con và tiến trình con `lark-cli` chỉ nhận một danh sách biến cho phép (`PATH`, `HOME`, `TMPDIR`, proxy, chứng chỉ, `LARKSUITE_CLI_*`): không có `LARK_APP_SECRET`, mật khẩu database, `APP_KEY` hay secret đăng nhập.

4. **Chạy thử:** `node dist/cli/index.js app edu import-lark --dry-run` (thêm `--json` để lưu toàn bộ bảng so sánh số dư). Không ghi gì, kể cả nhật ký. Đọc:
   - bảng tổng kết (dòng | tạo | trùng | ghép | lỗi) từng bảng;
   - các dòng lỗi và cảnh báo theo mã, có ví dụ mã bản ghi để tra trên Lark;
   - **bảng so sánh số dư**: với mỗi học viên, "Số buổi còn lại" của buổi gần nhất trên Lark, số dư tính lại và chênh lệch. Chênh lệch là chỗ cần Thầy Tường xem trước khi ghi (công thức trên Lark có thể bị nhập tay đè).
     **Dừng nếu hình dạng ô Lark lệch.** Thấy nhiều dòng `*_KHONG_RO` hoặc `THIEU_*` (ví dụ gần như mọi học viên báo `CAP_KHONG_RO`, `THIEU_NAM_SINH` hoặc `SDT_SAI`; hoặc gần như mọi dòng điểm danh báo `HOC_VIEN_KHONG_RO`, `LOP_KHONG_RO`, `NGAY_KHONG_RO`) thì **không chạy `--commit`**: cách đọc ô liên kết, tra cứu, người hoặc ngày trong mã được dựng theo tài liệu `bitable/v1` và chưa đối chiếu với một lần đọc Lark thật. Gửi lại tổng kết của `--dry-run` (chỉ có số đếm và mã, không có dữ liệu cá nhân) để chỉnh mã trước.
5. **Sao lưu ngay trước khi ghi thật.** Chạy `pg_dump` ở **container PostgreSQL** (image của ứng dụng không có `pg_dump`), ví dụ `docker exec <container-postgres> pg_dump -U <user> -Fc <tên-db> > /đường/dẫn/an/toàn/nocoedu-truoc-nhap-lark.dump`, hoặc dùng chức năng sao lưu của Dokploy cho dịch vụ database. Kiểm file không rỗng (`ls -l`) trước khi sang bước 6. Dump chứa dữ liệu trẻ em: để ngoài repo, ngoài thư mục chia sẻ.
6. **Ghi thật:** `node dist/cli/index.js app edu import-lark --commit --user <id người chạy>`. `--user` phải là id có trong bảng người dùng (xem trong Quản lý người dùng); id này ghi làm người tạo gói buổi và người điểm danh, và vào nhật ký. Nên chạy ngoài giờ học, vì lúc ghi có thể trùng với việc HLV lưu điểm danh (lệnh dừng và hoàn tác nếu số dư thay đổi giữa chừng).
7. **Kiểm tra:** bảng `eduNhapLarkNhatKy` có thêm một dòng `thanh_cong` (tổng kết theo bảng, chỉ mã). Chạy lại `--dry-run`: mọi dòng phải là "trùng", số "tạo" bằng 0.

`--commit` ghi trong **một transaction**: có lỗi giữa chừng thì không có gì được ghi, một dòng `that_bai` (chỉ mã lỗi) được ghi vào nhật ký, và lệnh thoát khác 0. Nếu dữ liệu đã ghi nhưng việc ghi dòng nhật ký lỗi (`LARK_DA_GHI_LOI_NHAT_KY`) thì **không** khôi phục: dữ liệu đã nằm trong NocoEdu, chạy `--dry-run` sẽ thấy mọi dòng là "trùng". Khi ghi thất bại, thông báo nêu tên bảng hoặc ràng buộc từ chối (không có giá trị). Mã thoát 2 là dùng sai (hai cờ cùng lúc, thiếu `--user`, thiếu biến `LARK_*`, `--user` không có trong hệ thống).

### Đã nhập trước giai đoạn 3 (khoá cũ `lark:ph:*` và `lark:sodu:*`)

Nếu production đã chạy `--commit` bằng bản trước, trong CSDL có phụ huynh `externalId = lark:ph:<SĐT>` và gói mở đầu `lark:sodu:<rec học viên>`. Bản mới dùng khoá khác (`lark:contact:<rec>`, `lark:deal:<rec>`), nên lệnh **không tự xoá và không nhân đôi**:

- **Phụ huynh:** ghép theo số điện thoại với phụ huynh đã có (kể cả khoá cũ), chỉ bổ sung liên kết còn thiếu. Bản chạy thử báo `KHOA_CU_LARK_PH` để bạn biết có khoá cũ; cột "ghép" của bảng `phuHuynh` là số phụ huynh được ghép.
- **Gói buổi:** học viên đã có gói `lark:sodu:*` mà nay có `Deal HP` **giữ nguyên gói cũ**, các Deal của họ bị bỏ qua và báo `GOI_CU_LARK_SODU` (thêm Deal vào sẽ đếm buổi hai lần). Muốn chuyển học viên đó sang số dư tính lại từ Deal, phải làm tay trên bản sao lưu: xoá gói `lark:sodu:*`, các dòng sổ số dư và điểm danh `lark:` của học viên đó rồi nhập lại. Chưa có lệnh làm việc này, nên hỏi trước khi làm; không xoá dữ liệu cũ khi chưa có sao lưu.
- **Học viên đã có điểm danh nhập từ Lark nhưng chưa có gói Deal nào** (lần nhập trước ghi điểm danh của họ là "đã nằm trong số dư mở đầu", `tinhVaoSoDu = false`, kể cả khi họ chưa có số dư) cũng **giữ nguyên số dư cũ**: Deal của họ bị bỏ qua và báo `DIEM_DANH_CU_KHONG_TRU`. Lý do: thêm gói mà không trừ lại các buổi cũ thì bản chạy thử (đếm mọi buổi) và `--commit` (chỉ trừ buổi mới) cho hai số dư khác nhau. Tổng kết chạy thử in một dòng "Học viên đã nhập trước giai đoạn 3 và GIỮ số dư cũ: N" cộng cả `GOI_CU_LARK_SODU` và `DIEM_DANH_CU_KHONG_TRU`.
- Học viên **chưa** từng được nhập điểm danh và có Deal thì được nhập theo cách mới đầy đủ.
- **Chuyển nhóm học viên giữ số dư cũ sang số dư tính lại từ Deal (làm tay, chỉ khi Thầy Tường đồng ý).** Chưa có lệnh tự động; không làm khi chưa có bản sao lưu. Chỉ xoá những gì lệnh nhập đã ghi; mọi gói, điểm danh và dòng sổ do người dùng nhập tay được giữ, và số dư được **trừ đi đúng phần đã xoá**, không đặt về 0. 0. **Dừng ứng dụng** (không ai ghi điểm danh hay bán gói) **trước khi sao lưu**, và giữ nguyên trạng thái dừng đến hết bước 5. Sao lưu lúc ứng dụng còn chạy có thể thiếu những gì HLV ghi giữa lúc sao lưu và lúc xoá.
  1. Chạy `--dry-run --json` và lưu danh sách mã học viên cũ (`HV-…`) bị `GOI_CU_LARK_SODU`/`DIEM_DANH_CU_KHONG_TRU`; đổi sang `id` của `eduHocVien` qua cột `externalCode`.
  2. **Sao lưu** bằng `pg_dump` ở container PostgreSQL như bước 5 ở trên.
  3. **Kiểm trước khi xoá** (chỉ đọc; tên bảng và cột như trong migration, trên PostgreSQL phải đặt trong dấu nháy kép). Các dòng sổ sẽ bị xoá là dòng `chuyen_tu_lark` hoặc dòng gắn với điểm danh nhập từ Lark (`eduDiemDanh.externalId` không rỗng); `se_xoa` là tổng `thayDoi` của chúng:

     ```sql
     SELECT l."hocVienId", COUNT(*) AS so_dong, SUM(l."thayDoi") AS se_xoa
     FROM "eduSoDuNhatKy" l
     LEFT JOIN "eduDiemDanh" d ON d."id" = l."diemDanhId"
     WHERE l."hocVienId" IN (/* id học viên */)
       AND (l."lyDo" = 'chuyen_tu_lark' OR d."externalId" IS NOT NULL)
     GROUP BY l."hocVienId";
     ```

     Đối chiếu từng học viên với số dư hiện có: `soBuoiConLai − se_xoa` là số dư còn lại sau khi xoá (chính là phần do người dùng nhập tay). Lệch với kỳ vọng thì dừng.

  4. **Xoá và chỉnh số dư trong một transaction**, theo thứ tự này (dòng sổ trước vì nó tham chiếu điểm danh và gói):

     ```sql
     BEGIN;
     UPDATE "eduHocVien" h SET "soBuoiConLai" = h."soBuoiConLai" - COALESCE((
       SELECT SUM(l."thayDoi") FROM "eduSoDuNhatKy" l
       LEFT JOIN "eduDiemDanh" d ON d."id" = l."diemDanhId"
       WHERE l."hocVienId" = h."id" AND (l."lyDo" = 'chuyen_tu_lark' OR d."externalId" IS NOT NULL)), 0)
     WHERE h."id" IN (/* id học viên */);
     DELETE FROM "eduSoDuNhatKy" l USING "eduHocVien" h
       WHERE l."hocVienId" = h."id" AND h."id" IN (/* id học viên */)
       AND (l."lyDo" = 'chuyen_tu_lark'
            OR l."diemDanhId" IN (SELECT "id" FROM "eduDiemDanh" WHERE "externalId" IS NOT NULL));
     DELETE FROM "eduDiemDanh" WHERE "externalId" IS NOT NULL AND "hocVienId" IN (/* id học viên */);
     DELETE FROM "eduGoiHoc" WHERE "externalId" LIKE 'lark:sodu:%' AND "hocVienId" IN (/* id học viên */);
     -- kiểm lại câu truy vấn ở bước 3: không còn dòng nào; rồi COMMIT; (hoặc ROLLBACK;)
     ```

     Buổi học `eduBuoiHoc` được giữ nguyên (nhập lại sẽ thấy "trùng"). Điểm danh và gói do HLV hoặc kế toán nhập tay (không có `externalId`) không bị đụng tới.

  5. Chạy `--dry-run`: các học viên đó không còn cảnh báo, có gói `lark:deal:*` ở cột "tạo" và điểm danh của họ ở cột "tạo"; rồi `--commit --user <id>`; rồi mở lại ứng dụng.
  6. **Rollback:** khôi phục bản `pg_dump` ở bước 2 (khi ứng dụng còn dừng). Không có cách hoàn tác từng phần sau khi đã mở lại ứng dụng và có người ghi dữ liệu mới.
- Chạy lại `--dry-run` sau khi ghi: mọi dòng phải là "trùng", số "tạo" bằng 0, các cảnh báo `GOI_CU_LARK_SODU` không đổi.

### Deal hoặc số dư bị sửa trên Lark sau lần nhập

Lệnh chỉ thêm, không sửa gói đã ghi. Nếu sau lần `--commit` đầu, trên Lark một Deal đã nhập bị đổi số buổi, "chưa thống kê" hoặc bị bỏ cờ `Đã nộp`, bản chạy thử báo `DEAL_DA_DOI`; nếu `số buổi tồn update` hoặc `Ngày update gần nhất về HP` của học viên có gói `lark:sodu:*` bị đổi thì báo `SO_DU_LARK_DA_DOI`. Gói trong CSDL **giữ nguyên** và số dư tính lại dùng giá trị **đã ghi**, nên bản chạy thử và `--commit` ra cùng một số dư. Tổng kết có dòng "Deal hoặc số dư trên Lark đã đổi từ lần nhập trước: N". Muốn áp giá trị mới, sửa tay gói đó bằng thao tác điều chỉnh số dư của ứng dụng sau khi hỏi Thầy Tường.

Với học viên được ghép (`ghep`) với học viên đã có gói hoặc số dư (`GHEP_BO_QUA_SO_DU`), bảng so sánh in số dư hiện có trong NocoEdu kèm "(giữ số dư cũ)", không in 0.

### Bảng so sánh số dư của bản chạy thử

Cột: mã học viên cũ | **trên Lark** (`số buổi tồn update` của HocVien) | **Σ tồn Deal** (tổng `Số buổi còn tồn` các Deal của học viên) | **tính lại** | **chênh** (tính lại − trên Lark). Dòng tổng: bao nhiêu học viên khớp, lệch, không so được (không có số trên Lark). Lệch là chuyện thường: Lark chỉ trừ buổi được gắn tay vào Deal nên số tồn của Lark thường cao hơn số tính lại. Chỉ nhập khi Thầy Tường đã xem bảng này.

### Bổ sung phụ huynh sau lần nhập đầu

Lần nhập đầu đọc sai ô "SDT PH" (`[{ fullPhoneNum }]`), nên các học viên đã nhập chưa có phụ huynh. Bản sửa không cần migration. Cách bổ sung:

1. Deploy bản mới, rồi chạy `--dry-run`. Cột "bổ sung" của bảng `hocVien` là số học viên đã có trong NocoEdu sẽ được thêm liên kết tới phụ huynh; cột "tạo" của `phuHuynh` là số phụ huynh mới. Chỉ khoảng 30/179 học viên có SĐT phụ huynh trên Lark, nên số này nhỏ là bình thường; số còn lại nhập tay.
2. Sao lưu bằng `pg_dump` như ở bước 5 phía trên.
3. Chạy `--commit --user <id>`. Lệnh chỉ thêm phụ huynh mới và liên kết còn thiếu (theo số điện thoại); không sửa, không xoá phụ huynh hoặc liên kết đã có, kể cả loại nhập tay.
4. Chạy lại `--dry-run`: cột "bổ sung" phải bằng 0 (chạy lại `--commit` cũng không tạo thêm dòng).

Rollback bằng cách khôi phục bản `pg_dump` ở bước 2.

### Rollback

- **Lệnh dừng giữa chừng:** không cần làm gì, transaction đã hoàn tác.
- **Đã ghi xong và muốn quay lại:** khôi phục bản `pg_dump` ở bước 5 (`pg_restore --clean --if-exists -d <db> <file>`), sau khi dừng ứng dụng. **Không** dùng `db rollback` sau khi đã nhập: gỡ migration làm mất `externalId` và lần nhập lại sẽ tạo bản ghi trùng. Mọi thay đổi người dùng làm trong NocoEdu sau lần nhập cũng mất theo bản khôi phục.
- **Sau `--commit`, NocoEdu là nguồn chính.** Chạy lại lệnh chỉ để bổ sung dòng mới trên Lark; không đồng bộ hai chiều và không cập nhật dòng đã nhập.

## Chưa làm

Lệnh `--undo <lần chạy>`; đồng bộ định kỳ hoặc hai chiều; sách, giải đấu, đánh giá định kỳ; lịch sử thanh toán bằng tiền (Lark không có số tiền); quy trình xoá hoặc ẩn danh học viên (khi làm phải xử lý cả `ngaySinh`, `externalCode` và `email` phụ huynh); migration mới chỉ được kiểm trên SQLite, chưa kiểm trên PostgreSQL; hình dạng giá trị ô (liên kết, tra cứu, người) được dựng theo tài liệu `bitable/v1`, chưa kiểm bằng lần đọc Lark thật — xem điều kiện dừng ở bước 4.

**Số dư Lark:** cột "Số buổi còn lại" của các bảng Nhận xét mỗi buổi trống ở mọi dòng (2025 là Text, 2026 là Attachment), nên lệnh không đọc nó; cột "trên Lark" của bảng so sánh lấy từ `số buổi tồn update` của HocVien (`?` khi học viên không có). Điểm danh được nhập đến hết ngày cuối cùng có trong bảng (15/10/2026), không lọc theo ngày.
