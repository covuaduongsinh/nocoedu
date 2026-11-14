# Nhập dữ liệu Lark vào NocoEdu trên production

Lệnh: `pnpm nocobase app edu import-lark [--dry-run | --commit --user <id>] [--delay-ms <ms>] [--json]`.

Framework đặt lệnh riêng của ứng dụng dưới topic `app`, nên lệnh là `app edu import-lark` (không phải `edu import-lark` như mô tả ban đầu của issue). Trong image Docker không có pnpm: `node dist/cli/index.js app edu import-lark …`.

## Lệnh làm gì

1. Đọc danh sách bảng của Base (`GET …/tables`, theo trang), rồi đọc **LopHoc, HocVien, Contact, Deal HP, Level** (12 dòng, chỉ để biết tên cấp) và **mọi bảng tên `<năm> Nhận xét mỗi buổi`** qua `lark-cli api GET … --as bot` (app bot, không OAuth người dùng). Bắt buộc phải thấy đủ ba bảng 2024 (`tblprrzroE2NBli5`), 2025 (`tbluhrY4B8i63PAh`) và 2026 (`tbl9TTf0m2EhWV3g`); năm sau chỉ cần có bảng cùng tên, không phải sửa code. Thiếu bảng (bảng bị Base ẩn khỏi app vì quyền nâng cao cũng không hiện trong danh sách) → dừng với `LARK_KHONG_DOC_DUOC`; hai bảng cùng năm hoặc sai mã bảng → `LARK_CAU_TRUC_DOI`. Đọc theo trang 500 dòng, mỗi lần gọi `lark-cli` tối đa 120 giây và yêu cầu token tối đa 30 giây (quá hạn thì dừng với `LARK_HET_GIO` hoặc `LARK_TOKEN`), nghỉ `--delay-ms` (mặc định 1200 ms) giữa hai lần gọi, gặp lỗi tần suất `99991400` thì chờ lâu dần rồi thử lại. Khoảng 6.000 bản ghi, chừng 20 lần gọi.
2. Trước khi đọc bản ghi, kiểm danh sách trường của từng bảng. Thiếu hoặc đổi tên một trường thì dừng với `LARK_CAU_TRUC_DOI`, không đoán.
3. Dữ liệu chỉ nằm trong bộ nhớ của lệnh; không ghi ra file, CSV hay log.
4. Lập **một kế hoạch** (hàm thuần `lapKeHoach`) theo thứ tự cơ sở → lớp và lịch → phụ huynh → học viên → gói mở đầu → buổi và điểm danh. `--commit` ghi đúng kế hoạch đó. `--dry-run` in kế hoạch và **chạy thử đúng phần ghi của `--commit` trong một transaction rồi hoàn tác** để đọc số dư thật (xem "Chạy thử có mô phỏng"), nên hai chế độ không lệch nhau.
5. `Contact` (`tblZUIXmpdt13j4x`, phụ huynh) và `Deal HP` (`tblHp1PGPz52eZBz`, các lần nộp) được đọc từ giai đoạn 3 (app đọc được từ 10/11/2026). Phụ huynh lấy từ `Contact`, gói buổi từ `Deal HP`; số dư **tính lại** từ các gói và mọi buổi có mặt 2024–2026 (quyết định 11/11/2026). Một bảng bị Base ẩn khỏi app thì lệnh dừng với `LARK_KHONG_DOC_DUOC`.

### Quy tắc chính (đã duyệt, xem `anh-xa-nocoedu.md`)

- Khoá chống trùng là `externalId`. Chạy lại chỉ thêm những `externalId` chưa có; **không cập nhật** bản ghi đã nhập, nên sửa trên Lark rồi chạy lại không đổi bản đã nhập.
- Số dư buổi: học viên có `Deal HP` = Σ số buổi các gói (mỗi lần nộp có cờ `Đã nộp`, trừ "chưa thống kê") − mọi buổi bị trừ 2024–2026; học viên không có Deal = gói mở đầu − số buổi có mặt **sau** ngày chốt. Vắng (`0`) không trừ buổi; trừ khi vắng không phép bật được bằng biến `EDU_TRU_BUOI_VANG_KHONG_PHEP=true` (chốt vào từng buổi lúc nhập). Điểm danh từ ngày chốt trở về trước được lưu với `tinhVaoSoDu = false`.
- Học viên đã có trong NocoEdu: **ghép** (không nhân đôi) khi khớp đủ ba thứ: tên đã chuẩn hoá, năm sinh và SĐT phụ huynh. Chỉ gán `externalId` và `externalCode`, không ghi đè trường nào. Khớp nhiều bản ghi: lỗi `TRUNG_NHIEU`, bỏ dòng. Ghép với học viên đã có gói hoặc số dư khác 0: không cộng số dư từ Lark (`GHEP_BO_QUA_SO_DU`). Nếu production chưa có học viên thì quy tắc này không có tác dụng; `--dry-run` in riêng cột "ghép".
- Dòng lỗi bị bỏ cùng mọi dòng phụ thuộc vào nó (học viên lỗi thì điểm danh của học viên đó cũng bị bỏ). Lỗi cấu trúc thì không cho `--commit`.
- Học viên nhập vào chưa có bản ghi đồng ý `eduDongY` (Lark không có thông tin này). Mặc định là "chưa đồng ý", nên chưa công bố gì; CLB cần thu đồng ý sau.
- "GV Phụ trách" ghép với tài khoản NocoEdu theo email; không khớp thì để trống và báo `HLV_CHUA_GHEP`.

### Mã lỗi và cảnh báo

| Mã                                                                                                                    | Ý nghĩa                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `THIEU_HO_TEN`, `THIEU_NAM_SINH`, `CO_SO_KHONG_RO`, `CAP_KHONG_RO`, `TRANG_THAI_KHONG_RO`                             | học viên bị bỏ                                                                                                                                                                                               |
| `TRUNG_NHIEU`                                                                                                         | khớp nhiều học viên có sẵn, bỏ dòng                                                                                                                                                                          |
| `SDT_SAI`, `PH_THIEU_TEN`                                                                                             | Contact bị bỏ; học viên vẫn nhập với cảnh báo `THIEU_PHU_HUYNH`                                                                                                                                              |
| `SO_DU_KHONG_RO`, `THIEU_NGAY_CHOT`                                                                                   | không tạo gói mở đầu cho học viên đó                                                                                                                                                                         |
| `DIEM_DANH_KHONG_RO`                                                                                                  | ô "có mặt" không phải `1`/`0`/`FALSE` (ví dụ `học lớp 2`, tên giáo viên): không nhập, không trừ buổi                                                                                                         |
| `BUOI_DA_CO`                                                                                                          | NocoEdu đã có một buổi của lớp đó cùng ngày, cùng giờ (nhập tay, hoặc HLV đã điểm danh): buổi đó và điểm danh của nó bị bỏ, phần còn lại vẫn nhập                                                            |
| `BUOI_CUNG_NGAY_KHAC_GIO`                                                                                             | NocoEdu đã có một buổi của lớp đó cùng ngày nhưng khác giờ (học bù, đổi ca): buổi của Lark vẫn nhập, nên học viên có thể bị trừ hai buổi trong một ngày; xem lại các mã buổi này sau khi nhập                |
| `HOC_VIEN_BI_BO`, `LOP_KHONG_RO`, `LOP_BI_BO`, `NGAY_KHONG_RO`, `GIO_BUOI_KHONG_RO`, `TRUNG_DONG`                     | dòng điểm danh bị bỏ                                                                                                                                                                                         |
| `DONG_TRONG`                                                                                                          | dòng điểm danh trống hẳn (không học viên, không lớp, không ô "có mặt"; bảng 2026 có khoảng 114 dòng): bỏ qua và đếm riêng, không tính lỗi. Dòng có "có mặt" mà thiếu học viên vẫn là lỗi `HOC_VIEN_KHONG_RO` |
| `PH_THIEU_SDT`                                                                                                        | Contact có liên kết học viên nhưng không có số điện thoại: không nhập phụ huynh (cảnh báo); học viên vẫn nhập                                                                                                |
| `DEAL_TRONG`, `DEAL_CHUA_NOP`                                                                                         | cảnh báo: dòng `Deal HP` trống hẳn, hoặc có số buổi mà chưa có cờ `Đã nộp`; không tạo gói                                                                                                                    |
| `DEAL_THIEU_NGAY`, `DEAL_SO_BUOI_SAI`, `DEAL_THIEU_HOC_VIEN`                                                          | lỗi: dòng `Deal HP` đã nộp nhưng thiếu cả `Ngày nộp HP` lẫn `Ngày bắt đầu`, số buổi không phải số nguyên, hoặc không có học viên; không tạo gói                                                              |
| `DIEM_DANH_CU_KHONG_TRU`                                                                                              | cảnh báo: học viên đã có điểm danh nhập từ Lark ghi là "đã nằm trong số dư mở đầu" và chưa có gói Deal: Deal của họ bị bỏ qua, số dư giữ nguyên                                                              |
| `DEAL_DA_DOI`, `DEAL_DA_XOA`, `DEAL_DOI_HOC_VIEN`, `DIEM_DANH_DA_DOI`, `SO_DU_LARK_DA_DOI`, `SO_DU_BO_QUA_DA_CO_DEAL` | cảnh báo: Deal hoặc số dư trên Lark đã đổi sau lần nhập; gói đã ghi không được sửa, số dư tính theo giá trị đã ghi                                                                                           |
| `DEAL_HET_SAU_TRU`                                                                                                    | cảnh báo: Deal đã nộp nhưng `Số buổi nộp` trừ "chưa thống kê" bằng 0: không tạo gói                                                                                                                          |
| `KHOA_CU_LARK_PH`, `GOI_CU_LARK_SODU`                                                                                 | cảnh báo: lần nhập trước giai đoạn 3 đã ghi phụ huynh theo `lark:ph:<SĐT>` hoặc gói mở đầu `lark:sodu:<rec>`. Xem mục "Đã nhập trước giai đoạn 3" dưới đây                                                   |
| `KHONG_CO_SO_DU`, `HLV_CHUA_GHEP`, `EMAIL_SAI`, `NHAN_XET_CAT`                                                        | cảnh báo, vẫn nhập                                                                                                                                                                                           |

Output, nhật ký và log **chỉ** có số dòng, mã học viên cũ trên Lark (`HV-…`), mã bản ghi Lark (`rec…`) và mã lỗi; không có họ tên, SĐT, email, ngày sinh hay nhận xét.

## Chạy trên production

Các bước dành cho người có quyền vào server (Dokploy). Không đưa bí mật vào dòng lệnh hay vào repo.

1. **Triển khai bản đã merge** và áp migration (có thể tự chạy khi khởi động): `node dist/cli/index.js db apply`. Hai migration của việc này: `202611100001_edu_lark_mapping`, `202611100002_edu_nhap_lark`.
2. **Cài `lark-cli`** vào một thư mục tạm trong container (không thêm vào `dependencies` của ứng dụng): `mkdir -p /tmp/lark && cd /tmp/lark && npm install @larksuite/cli`, rồi đặt `LARK_CLI=/tmp/lark/node_modules/.bin/lark-cli`.

   Image `node:24-bookworm-slim` **không có `curl` và không có bộ chứng chỉ gốc (CA)**, nên (đã gặp ngày 12/11/2026):
   - `npm install @larksuite/cli` trong container lỗi `spawnSync curl ENOENT`. Cách làm: cài trên **host** (có `curl`) vào thư mục tạm, rồi `docker cp <thư-mục> <container>:/tmp/lark` và `docker exec -u root <container> chown -R node:node /tmp/lark`.
   - `lark-cli` (binary Go) báo `x509: certificate signed by unknown authority`. Cách làm: `docker cp /etc/ssl/certs/ca-certificates.crt <container>:/tmp/ca.crt` rồi chạy lệnh với `SSL_CERT_FILE=/tmp/ca.crt` (biến này được truyền xuống `lark-cli`). Gọi thẳng API Lark bằng Node vẫn chạy được, nên lỗi này dễ bị nhầm với lỗi quyền hoặc lỗi secret.
   - `/tmp/lark` và `/tmp/ca.crt` mất khi container bị tạo lại (redeploy): làm lại hai việc trên sau lần redeploy cuối.

3. **Biến môi trường** (đặt trong Dokploy, tab Environment; không gõ secret trên dòng lệnh):

   | Biến                                            | Ý nghĩa                                                                                   |
   | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
   | `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_DOMAIN` | app Lark đã được chia sẻ quyền xem Base; `LARK_DOMAIN` ví dụ `https://open.larksuite.com` |
   | `LARK_CLI`                                      | đường dẫn `lark-cli` (mặc định tìm `lark-cli` trên `PATH`)                                |
   | `EDU_TRU_BUOI_VANG_KHONG_PHEP`                  | không đặt (mặc định không trừ buổi khi vắng)                                              |

   Secret chỉ dùng để xin token một lần; lệnh truyền token cho `lark-cli` qua biến môi trường của tiến trình con và tiến trình con `lark-cli` chỉ nhận một danh sách biến cho phép (`PATH`, `HOME`, `TMPDIR`, proxy, chứng chỉ, `LARKSUITE_CLI_*`): không có `LARK_APP_SECRET`, mật khẩu database, `APP_KEY` hay secret đăng nhập.

4. **Chạy thử:** `node dist/cli/index.js app edu import-lark --dry-run` (thêm `--json` để lưu toàn bộ bảng so sánh số dư). Không để lại gì trong CSDL, kể cả nhật ký. Lệnh **chạy thử đúng phần ghi của `--commit` trong một transaction rồi hoàn tác** (xem "Chạy thử có mô phỏng" dưới đây). Đọc:
   - bảng tổng kết (dòng | tạo | trùng | ghép | lỗi) từng bảng;
   - các dòng lỗi và cảnh báo theo mã, có ví dụ mã bản ghi để tra trên Lark;
   - **bảng so sánh số dư**: với mỗi học viên, "Số buổi còn lại" của buổi gần nhất trên Lark, số dư tính lại và chênh lệch. Chênh lệch là chỗ cần Thầy Tường xem trước khi ghi (công thức trên Lark có thể bị nhập tay đè).
     **Dừng nếu hình dạng ô Lark lệch.** Thấy nhiều dòng `*_KHONG_RO` hoặc `THIEU_*` (ví dụ gần như mọi học viên báo `CAP_KHONG_RO`, `THIEU_NAM_SINH` hoặc `SDT_SAI`; hoặc gần như mọi dòng điểm danh báo `HOC_VIEN_KHONG_RO`, `LOP_KHONG_RO`, `NGAY_KHONG_RO`) thì **không chạy `--commit`**: cách đọc ô liên kết, tra cứu, người hoặc ngày trong mã được dựng theo tài liệu `bitable/v1` và chưa đối chiếu với một lần đọc Lark thật. Gửi lại tổng kết của `--dry-run` (chỉ có số đếm và mã, không có dữ liệu cá nhân) để chỉnh mã trước.
5. **Sao lưu ngay trước khi ghi thật.** Chạy `pg_dump` ở **container PostgreSQL** (image của ứng dụng không có `pg_dump`), ví dụ `docker exec <container-postgres> pg_dump -U <user> -Fc <tên-db> > /đường/dẫn/an/toàn/nocoedu-truoc-nhap-lark.dump`, hoặc dùng chức năng sao lưu của Dokploy cho dịch vụ database. Kiểm file không rỗng (`ls -l`) trước khi sang bước 6. Dump chứa dữ liệu trẻ em: để ngoài repo, ngoài thư mục chia sẻ.
6. **Ghi thật:** `node dist/cli/index.js app edu import-lark --commit --user <id người chạy>`. `--user` phải là id có trong bảng người dùng (xem trong Quản lý người dùng); id này ghi làm người tạo gói buổi và người điểm danh, và vào nhật ký. Nên chạy ngoài giờ học, vì lúc ghi có thể trùng với việc HLV lưu điểm danh (lệnh dừng và hoàn tác nếu số dư thay đổi giữa chừng).
7. **Kiểm tra:** bảng `edu_nhap_lark_nhat_ky` có thêm một dòng `thanh_cong` (tổng kết theo bảng, chỉ mã). Chạy lại `--dry-run`: mọi dòng phải là "trùng", số "tạo" bằng 0.

`--commit` ghi trong **một transaction**: có lỗi giữa chừng thì không có gì được ghi, một dòng `that_bai` (chỉ mã lỗi) được ghi vào nhật ký, và lệnh thoát khác 0. Nếu dữ liệu đã ghi nhưng việc ghi dòng nhật ký lỗi (`LARK_DA_GHI_LOI_NHAT_KY`) thì **không** khôi phục: dữ liệu đã nằm trong NocoEdu, chạy `--dry-run` sẽ thấy mọi dòng là "trùng". Khi ghi thất bại, thông báo nêu tên bảng hoặc ràng buộc từ chối (không có giá trị). Mã thoát 2 là dùng sai (hai cờ cùng lúc, thiếu `--user`, thiếu biến `LARK_*`, `--user` không có trong hệ thống).

### Đã nhập trước giai đoạn 3 (khoá cũ `lark:ph:*` và `lark:sodu:*`)

Nếu production đã chạy `--commit` bằng bản trước, trong CSDL có phụ huynh `externalId = lark:ph:<SĐT>` và gói mở đầu `lark:sodu:<rec học viên>`. Bản mới dùng khoá khác (`lark:contact:<rec>`, `lark:deal:<rec>`), nên lệnh **không tự xoá và không nhân đôi**:

- **Phụ huynh:** ghép theo số điện thoại với phụ huynh đã có (kể cả khoá cũ), chỉ bổ sung liên kết còn thiếu. Bản chạy thử báo `KHOA_CU_LARK_PH` để bạn biết có khoá cũ; cột "ghép" của bảng `phuHuynh` là số phụ huynh được ghép.
- **Gói buổi:** học viên đã có gói `lark:sodu:*` mà nay có `Deal HP` **giữ nguyên gói cũ**, các Deal của họ bị bỏ qua và báo `GOI_CU_LARK_SODU` (thêm Deal vào sẽ đếm buổi hai lần). Muốn chuyển học viên đó sang số dư tính lại từ Deal, phải làm tay trên bản sao lưu: xoá gói `lark:sodu:*`, các dòng sổ số dư và điểm danh `lark:` của học viên đó rồi nhập lại. Chưa có lệnh làm việc này, nên hỏi trước khi làm; không xoá dữ liệu cũ khi chưa có sao lưu.
- **Học viên đã có điểm danh nhập từ Lark nhưng chưa có gói Deal nào** (lần nhập trước ghi điểm danh của họ là "đã nằm trong số dư mở đầu", `tinhVaoSoDu = false`, kể cả khi họ chưa có số dư) cũng **giữ nguyên số dư cũ**: Deal của họ bị bỏ qua và báo `DIEM_DANH_CU_KHONG_TRU`. Lý do: thêm gói mà không trừ lại các buổi cũ thì bản chạy thử (đếm mọi buổi) và `--commit` (chỉ trừ buổi mới) cho hai số dư khác nhau. Tổng kết chạy thử in một dòng "Học viên đã nhập trước giai đoạn 3 và GIỮ số dư cũ: N" cộng cả `GOI_CU_LARK_SODU` và `DIEM_DANH_CU_KHONG_TRU`.
- Học viên **chưa** từng được nhập điểm danh và có Deal thì được nhập theo cách mới đầy đủ.
- **Bước 0 (riêng, làm trước hết): dừng ứng dụng** để không ai ghi điểm danh hay bán gói, **trước khi sao lưu**, và giữ nguyên trạng thái dừng đến hết bước 5. Sao lưu lúc ứng dụng còn chạy có thể thiếu những gì HLV ghi giữa lúc sao lưu và lúc xoá.
- **Chuyển nhóm học viên giữ số dư cũ sang số dư tính lại từ Deal (làm tay, chỉ khi Thầy Tường đồng ý).** Chưa có lệnh tự động; không làm khi chưa có bản sao lưu. Chỉ xoá những gì lệnh nhập đã ghi; mọi gói, điểm danh và dòng sổ do người dùng nhập tay được giữ, và số dư được **trừ đi đúng phần đã xoá**, không đặt về 0.
  1. Chạy `--dry-run --json` và lưu danh sách mã học viên cũ (`HV-…`) bị `GOI_CU_LARK_SODU`/`DIEM_DANH_CU_KHONG_TRU`; đổi sang `id` của `eduHocVien` qua cột `externalCode`.
  2. **Sao lưu** bằng `pg_dump` ở container PostgreSQL như bước 5 ở trên (ứng dụng đã dừng ở bước 0).
  3. **Kiểm trước khi xoá** (chỉ đọc; tên bảng và cột là snake_case thật trên PostgreSQL, đã đối chiếu với production ngày 12/11/2026). Các dòng sổ sẽ bị xoá là dòng `chuyen_tu_lark` hoặc dòng gắn với điểm danh nhập từ Lark (`edu_diem_danh.external_id` không rỗng); `se_xoa` là tổng `thay_doi` của chúng:

     ```sql
     SELECT l.hoc_vien_id, COUNT(*) AS so_dong, SUM(l.thay_doi) AS se_xoa
     FROM edu_so_du_nhat_ky l
     LEFT JOIN edu_diem_danh d ON d.id = l.diem_danh_id
     WHERE l.hoc_vien_id IN (/* id học viên */)
       AND (l.ly_do = 'chuyen_tu_lark' OR d.external_id IS NOT NULL)
     GROUP BY l.hoc_vien_id;
     ```

     Đối chiếu từng học viên với số dư hiện có: `so_buoi_con_lai − se_xoa` là số dư còn lại sau khi xoá (chính là phần do người dùng nhập tay). Lệch với kỳ vọng thì dừng.

  4. **Xoá và chỉnh số dư trong một transaction**, theo thứ tự này (dòng sổ trước vì nó tham chiếu điểm danh và gói):

     ```sql
     BEGIN;
     UPDATE edu_hoc_vien h SET so_buoi_con_lai = h.so_buoi_con_lai - COALESCE((
       SELECT SUM(l.thay_doi) FROM edu_so_du_nhat_ky l
       LEFT JOIN edu_diem_danh d ON d.id = l.diem_danh_id
       WHERE l.hoc_vien_id = h.id AND (l.ly_do = 'chuyen_tu_lark' OR d.external_id IS NOT NULL)), 0)
     WHERE h.id IN (/* id học viên */);
     DELETE FROM edu_so_du_nhat_ky l USING edu_hoc_vien h
       WHERE l.hoc_vien_id = h.id AND h.id IN (/* id học viên */)
       AND (l.ly_do = 'chuyen_tu_lark'
            OR l.diem_danh_id IN (SELECT id FROM edu_diem_danh WHERE external_id IS NOT NULL));
     DELETE FROM edu_diem_danh WHERE external_id IS NOT NULL AND hoc_vien_id IN (/* id học viên */);
     DELETE FROM edu_goi_hoc WHERE external_id LIKE 'lark:sodu:%' AND hoc_vien_id IN (/* id học viên */);
     -- kiểm lại câu truy vấn ở bước 3: không còn dòng nào; rồi COMMIT; (hoặc ROLLBACK;)
     ```

     Buổi học `edu_buoi_hoc` được giữ nguyên (nhập lại sẽ thấy "trùng"). Điểm danh và gói do HLV hoặc kế toán nhập tay (không có `externalId`) không bị đụng tới.

  5. Chạy `--dry-run`: các học viên đó không còn cảnh báo, có gói `lark:deal:*` ở cột "tạo" và điểm danh của họ ở cột "tạo"; rồi `--commit --user <id>`; rồi mở lại ứng dụng.
  6. **Rollback:** khôi phục bản `pg_dump` ở bước 2 (khi ứng dụng còn dừng). Không có cách hoàn tác từng phần sau khi đã mở lại ứng dụng và có người ghi dữ liệu mới.
- Chạy lại `--dry-run` sau khi ghi: mọi dòng phải là "trùng", số "tạo" bằng 0, các cảnh báo `GOI_CU_LARK_SODU` không đổi.

### Deal hoặc số dư bị sửa trên Lark sau lần nhập

Lệnh chỉ thêm, không sửa gói đã ghi. Nếu sau lần `--commit` đầu, trên Lark một Deal đã nhập bị đổi số buổi, "chưa thống kê" hoặc bị bỏ cờ `Đã nộp`, bản chạy thử báo `DEAL_DA_DOI`; nếu `số buổi tồn update` hoặc `Ngày update gần nhất về HP` của học viên có gói `lark:sodu:*` bị đổi thì báo `SO_DU_LARK_DA_DOI`. Gói trong CSDL **giữ nguyên** và số dư tính lại dùng giá trị **đã ghi**, nên bản chạy thử và `--commit` ra cùng một số dư. Tổng kết có dòng "Deal hoặc số dư trên Lark đã đổi từ lần nhập trước: N". Muốn áp giá trị mới, sửa tay gói đó bằng thao tác điều chỉnh số dư của ứng dụng sau khi hỏi Thầy Tường.

Với học viên được ghép (`ghep`) với học viên đã có gói hoặc số dư (`GHEP_BO_QUA_SO_DU`), bảng so sánh in số dư hiện có trong NocoEdu kèm "(giữ số dư cũ)", không in 0.

### Chạy thử có mô phỏng và bảng so sánh số dư

Sau mỗi lần Lark hoặc dữ liệu đã nhập thay đổi lại có thêm một trường hợp khiến số dư tính trên giấy khác số dư thật. Vì vậy `--dry-run` không tự tính số dư "sau nhập" nữa: nó **chạy đúng phần ghi của `--commit` trong một transaction, đọc lại `soBuoiConLai` của từng học viên từ CSDL, rồi hoàn tác**. Không dòng nào ở lại (kể cả nhật ký `edu_nhap_lark_nhat_ky`). Nếu việc ghi thử lỗi (ràng buộc, xung đột số dư) thì bản chạy thử in "MÔ PHỎNG GHI LỖI" kèm tên ràng buộc, và `--commit` cũng sẽ lỗi như vậy.

Hai điều cần biết:

- Trên PostgreSQL, bộ đếm `id` tự tăng **không** được hoàn tác: mỗi lần chạy thử làm các `id` bản ghi thật về sau nhảy cách một đoạn. Vì mã `HS…`, `PH…`, `L…` sinh từ `id` (ví dụ `HS00175`), **các mã này cũng nhảy cách sau mỗi lần chạy thử**: mã học viên đầu tiên sau khi nhập thật có thể không phải `HS00001` hay số liền sau mã cuối. Mã vẫn duy nhất và ổn định; chỉ không liên tục. Ai cần mã liên tục thì không chạy `--dry-run` trên production nhiều lần.
- Bản chạy thử ghi tạm vào các bảng thật nên nên chạy lúc ít người dùng; transaction ngắn (vài giây) và hoàn tác ngay.

Cột của bảng so sánh: mã học viên cũ | **trên Lark** (`số buổi tồn update` của HocVien) | **Σ tồn Deal** (tổng `Số buổi còn tồn` các Deal của học viên) | **tính lại từ Lark** | **số dư sau nhập** | **chênh** (tính lại − trên Lark). Dòng tổng: bao nhiêu học viên khớp, lệch, không so được, và bao nhiêu học viên có số dư sau nhập khác số tính lại từ Lark.

- **Tính lại từ Lark** là số dư nếu chỉ dựa vào Lark hiện tại (các gói và điểm danh như Lark đang ghi) để Thầy Tường so với số trên Lark. Nó **không** gồm phần nhập tay trong ứng dụng và không gồm chỗ HLV đã sửa điểm danh nhập từ Lark: sau khi chuyển tay hoặc sau khi ứng dụng đã dùng một thời gian, hai phần đó bị bỏ khỏi cột này.
- **Số dư sau nhập** là số dư thật `--commit` sẽ để lại trong CSDL (đã gồm dữ liệu cũ, phần nhập tay và những gì Lark đã đổi). Đây là cột để kiểm tra trước khi ghi; hai cột khác nhau là bình thường khi dữ liệu đã nhập trước đó.

Lệch giữa "tính lại" và "trên Lark" là chuyện thường: Lark chỉ trừ buổi được gắn tay vào Deal nên số tồn của Lark thường cao hơn. Chỉ nhập khi Thầy Tường đã xem bảng này.

### Dữ liệu trên Lark khác dữ liệu đã nhập

Lệnh không sửa và không xoá gì đã ghi; khi Lark khác CSDL, nó chỉ báo, và số dư dùng dữ liệu trong CSDL:

| Mã                        | Ý nghĩa                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `DEAL_DA_DOI`             | Deal đã nhập bị sửa số buổi hoặc "chưa thống kê", hoặc bỏ cờ `Đã nộp`                           |
| `DEAL_DA_XOA`             | gói `lark:deal:*` không còn dòng Deal trên Lark; gói vẫn ở CSDL                                 |
| `DEAL_DOI_HOC_VIEN`       | dòng Deal nay trỏ sang học viên khác; gói vẫn tính cho học viên đang giữ nó                     |
| `DIEM_DANH_DA_DOI`        | điểm danh `lark:` đã nhập có `có mặt` khác giá trị đã ghi, hoặc không còn trên Lark             |
| `SO_DU_LARK_DA_DOI`       | `số buổi tồn update` hoặc `Ngày update gần nhất về HP` của học viên có gói `lark:sodu:*` đã đổi |
| `SO_DU_BO_QUA_DA_CO_DEAL` | học viên đã có gói Deal thì không bao giờ tạo thêm gói `lark:sodu:*` (sẽ đếm buổi hai lần)      |

Muốn áp giá trị mới của Lark cho những dòng này phải sửa tay trong ứng dụng sau khi hỏi Thầy Tường.

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

## Tiền học phí từ `Tổng Deal (HP + book)` (DS-61)

Từ bản này `import-lark` đọc thêm bảng `Tổng Deal (HP + book)` (`tblGDWScLLqgOR1W`) và ghi **học phí** thành các dòng `eduThanhToan` (`externalId = lark:tongdeal:<rec>`, `hinhThuc = khong_ro`). Chạy lại không ghi trùng.

- **Cần làm trước khi chạy `--commit` lần đầu:** migration `202611130001_edu_thanh_toan_external_id` (thêm cột `externalId`) phải chạy trên production, tức là deploy bản này rồi để ứng dụng khởi động xong.
- **Quyền đọc bảng:** nếu app Lark không thấy bảng này thì lệnh vẫn chạy như cũ và in "app KHÔNG đọc được bảng này, không nhập khoản nào"; khi đó mở quyền cho app rồi chạy lại.
- **Luôn chạy `--dry-run` trước** (mục "Tiền học phí (Tổng Deal)" trong báo cáo): số khoản, tổng tiền, các khoản bị bỏ kèm số tiền (`TONG_DEAL_THIEU_HOC_VIEN`, `TONG_DEAL_HOC_VIEN_BI_BO`, `TONG_DEAL_THIEU_NGAY`), cảnh báo `TONG_DEAL_TRUNG_LAP`, và "không có gói để gắn". Số này là kết quả ghi thử đã hoàn tác, chính là số `--commit` sẽ ghi.
- **Số kỳ vọng (đọc từ file `.base` ngày 13/11/2026):** 270 khoản có học phí, tổng 511.134.000 đ; 225 khoản có học viên (445.870.000 đ), 45 khoản (65.264.000 đ, toàn bộ năm 2024) chưa gắn học viên trên Lark nên sẽ bị bỏ cho tới khi điền cột `Tên HS link`. Tiền sách và `Mua khác` chưa nhập (giai đoạn sách).
- **Đối chiếu sau khi ghi:** báo cáo doanh thu theo tháng phải cộng đúng tổng đã nhập (`SELECT sum(so_tien) FROM edu_thanh_toan`).
- **Hoàn tác:** `DELETE FROM edu_thanh_toan WHERE external_id LIKE 'lark:tongdeal:%'` (không động tới gói hay số dư; thanh toán không đổi số dư buổi).

## Sách từ bảng `Sách` (DS-61 phase E)

`import-lark` đọc thêm bảng `Sách` (`tbl324dOlvbf3BUu`, 37 cuốn) và ghi vào danh mục `eduSach` (`externalId = lark:sach:<rec>`): ký hiệu, tên, giá bìa, giá bán cho phụ huynh. Cần migration `202611130002_create_edu_sach` đã chạy (deploy bản có PR danh mục sách trước).

- Bảng này là tùy chọn: app không thấy thì lệnh vẫn chạy như cũ và in "app KHÔNG đọc được bảng Sách".
- `--dry-run` in mục "Sách": số cuốn hợp lệ, các dòng bị bỏ theo mã (`SACH_THIEU_KY_HIEU`, `SACH_TRUNG_KY_HIEU`, `SACH_QUA_DAI`), cảnh báo (`SACH_THIEU_TEN`, `SACH_THIEU_GIA`) và số cuốn sẽ tạo. Số kỳ vọng từ file `.base`: 37 cuốn, không trùng ký hiệu; 1 cuốn thiếu giá bán và 1 cuốn thiếu tên (cảnh báo, vẫn nhập, giá 0, tên lấy theo ký hiệu).
- Sách đã ghi không bao giờ bị sửa lại; ký hiệu đã có trong NocoEdu (nhập tay) được giữ nguyên và báo `daCoKyHieu`.
- Hoàn tác: `DELETE FROM edu_sach WHERE external_id LIKE 'lark:sach:%'` (chỉ sau khi đã xoá các lần phát sách bên dưới).

### Lần phát sách từ bảng `Từng lần phát sách`

Cùng lệnh, cần migration `202611140001_create_edu_phat_sach` (deploy bản có PR phát sách trước). Bảng `tblU8nwesckl40Ff` (338 lượt) ghi vào `eduPhatSach` (`externalId = lark:phatsach:<rec>`) sau khi ghi sách, trong cùng giao dịch; chỉ đọc học viên, ngày, sách và ưu đãi (không đọc ghi chú).

- Mỗi lượt phải có đúng một học viên và đúng một sách. Tiền sách = giá bán của đúng cuốn sách đó − ưu đãi (Lark tra giá theo "chứa" nên `CT1` có thể khớp nhầm `CT10`; ở đây khớp chính xác theo liên kết).
- `--dry-run` in mục "Phát sách": số lượt hợp lệ và các dòng bị bỏ theo mã `PHAT_SACH_THIEU_HOC_VIEN`, `PHAT_SACH_NHIEU_HOC_VIEN`, `PHAT_SACH_THIEU_SACH`, `PHAT_SACH_NHIEU_SACH`, `PHAT_SACH_HOC_VIEN_BI_BO` (học viên không được nhập), `PHAT_SACH_SACH_BI_BO` (sách bị bỏ), `PHAT_SACH_THIEU_NGAY`, `PHAT_SACH_UU_DAI_SAI` (không phải số nguyên đồng, âm hoặc lớn hơn giá); và số sẽ tạo. Số kỳ vọng: 338 lượt; số lượt bị bỏ chỉ biết sau lần chạy thử đầu tiên.
- Lượt đã ghi không bao giờ bị sửa; chạy lại không trùng.
- Hoàn tác: `DELETE FROM edu_phat_sach WHERE external_id LIKE 'lark:phatsach:%'`.

### Sách đang học và đã học (DS-61 E4)

Cần migration `202611140007_create_edu_sach_hoc`. Cột `Sách đang học` và `Sách đã học` của bảng `HocVien` ghi vào `eduSachHoc` (`externalId = lark:sachhoc:<học viên>:<sách>`), cùng giao dịch với sách; một cuốn nằm ở cả hai cột thì tính là đã học. Liên kết tới sách không được nhập (trùng ký hiệu, thiếu ký hiệu) được đếm và bỏ qua; học viên bị bỏ không có dòng nào. Hiện ở tab "Sách" của hồ sơ học viên. Hoàn tác: `DELETE FROM edu_sach_hoc WHERE external_id LIKE 'lark:sachhoc:%'`.

### Tiền sách đã nộp (quỹ tiền sách, DS-61 E3)

Cần migration `202611140003_create_edu_nop_sach`. Cột `Tiền sách` của `Tổng Deal` (khoảng 31.240.000 đ) ghi vào `eduNopSach` (`externalId = lark:tongdeal-sach:<rec>`), cùng giao dịch với sách. Quỹ của một học viên = tiền sách đã nộp − tiền sách đã phát, hiện ở cuối trang "Phát sách" (số âm: phụ huynh còn thiếu). Mã bỏ: `NOP_SACH_SO_TIEN_SAI`, `NOP_SACH_THIEU_HOC_VIEN`, `NOP_SACH_HOC_VIEN_BI_BO`, `NOP_SACH_THIEU_NGAY`. Cột `Mua khác` không phải tiền sách và chưa nhập. Hoàn tác: `DELETE FROM edu_nop_sach WHERE external_id LIKE 'lark:tongdeal-sach:%'`. Công thức "thừa thiếu" và "chuyển sang đợt sau" của `Deal book` Lark (10 dòng) không nhập: quỹ được tính thẳng từ hai sổ.
