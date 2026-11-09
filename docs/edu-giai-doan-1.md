# NocoEdu giai đoạn 1: những gì đã có

Tài liệu này mô tả phần đã làm của DS-57 (Phần A, B1, B2 và B3: cơ sở, lớp, học viên, phụ huynh, đồng ý, buổi học, điểm danh, số dư buổi, gói buổi, thanh toán, VietQR, nhận xét tháng, báo cáo, nhập CSV, dữ liệu mẫu và các trang giao diện).

## Bảng dữ liệu

Tên bảng vật lý là `edu_*` (tên logic trong mã là `eduCoSo`, `eduHocVien`…). Ngày lưu dạng `YYYY-MM-DD`, giờ `HH:mm`, tháng `YYYY-MM`; boolean ghi `true`/`false`.

| Bảng                                                 | Nội dung                                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `edu_co_so`                                          | Cơ sở: mã, tên, địa chỉ, người phụ trách, cấu hình "vắng có phép vẫn trừ buổi"                                    |
| `edu_co_so_quan_ly`                                  | Ai quản lý cơ sở nào (nguồn của phạm vi "cơ sở của tôi")                                                          |
| `edu_lop`, `edu_lop_lich`                            | Lớp (cơ sở, HLV, cấp 1-6) và lịch học trong tuần                                                                  |
| `edu_hoc_vien`                                       | Học viên: mã `HS00001`, họ tên, năm sinh, cấp, lớp, trạng thái, ghi chú HLV, số buổi còn lại                      |
| `edu_hoc_vien_len_cap`                               | Lịch sử lên cấp (chỉ thêm): ngày, người xác nhận                                                                  |
| `edu_phu_huynh`, `edu_hoc_vien_phu_huynh`            | Phụ huynh (`PH00001`, số điện thoại, Zalo) và quan hệ nhiều-nhiều với học viên                                    |
| `edu_dong_y`                                         | Đồng ý của phụ huynh theo mục đích, có phiên bản, thời điểm, kênh; rút lại bằng cách ghi thời điểm rút, không xoá |
| `edu_buoi_hoc`, `edu_diem_danh`                      | Buổi học và điểm danh (API ở B2, trang giao diện ở B3)                                                            |
| `edu_goi_hoc`, `edu_thanh_toan`, `edu_so_du_nhat_ky` | Gói buổi, thanh toán, nhật ký số dư (API ở B2, trang giao diện ở B3)                                              |
| `edu_nhan_xet_thang`, `edu_xuat_du_lieu_nhat_ky`     | Nhận xét tháng; nhật ký ai xuất báo cáo hay văn bản nhận xét, lúc nào, bao nhiêu dòng (không ghi tên)             |

## Vai trò

Năm bộ quyền được tạo một lần bằng seed, không gán cho ai. Quản trị gán cho từng người trong "Quản lý người dùng".

| Bộ quyền            | Phạm vi dữ liệu    | Làm được                                                                                                                  |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `edu_quan_tri`      | Tất cả             | Mọi thao tác trên cơ sở, lớp, học viên, phụ huynh, đồng ý                                                                 |
| `edu_quan_ly_co_so` | Cơ sở mình quản lý | Như trên, chỉ trong cơ sở của mình                                                                                        |
| `edu_hlv`           | Lớp mình dạy       | Xem lớp, học viên; sửa ghi chú; lên cấp; tạo buổi và điểm danh lớp mình; xem số dư; không đụng tới gói buổi và thanh toán |
| `edu_ke_toan`       | Tất cả             | Xem cơ sở, lớp, học viên, phụ huynh, buổi học, điểm danh; bán gói buổi và ghi thanh toán mọi cơ sở; không sửa điểm danh   |
| `edu_api_doc`       | Tất cả             | Chỉ `GET /api/ext/*`; dành cho tài khoản dịch vụ của ứng dụng khác                                                        |

## Đường dẫn API

Đều cần đăng nhập (hoặc API key); chưa đăng nhập trả 401, thiếu quyền trả 403.

- Bản ghi chuẩn `POST /api/<tên>/findMany|findOne|count|createOne|updateOne|deleteOne` với tên `coSo`, `coSoQuanLy`, `lop`, `lopLich`, `hocVien`, `phuHuynh`, `lienKet`, `dongY` (chỉ các thao tác mỗi tên được mở). Ghi cần header `Idempotency-Key`. `coSo` và `lop` không xoá được (đóng bằng trạng thái); `lop.hlvId` chỉ nhận người đang được gán trực tiếp bộ quyền `edu_hlv`; `lienKet` không tạo được qua đường này (dùng `/api/phuHuynh/taoMoi`); `lop` và `lopLich` chỉ tạo được khi cơ sở hoặc lớp cha nằm trong phạm vi người gọi; đổi lớp của học viên dùng `/api/hocVien/chuyenLop`. Số điện thoại trùng với phụ huynh ngoài phạm vi thì tạo bản ghi phụ huynh riêng, Quản trị gộp sau.
- Nghiệp vụ: `POST /api/hocVien/taoMoi`, `/hocVien/capNhatGhiChu`, `/hocVien/lenCap`, `/phuHuynh/taoMoi`, `/dongY/ghiNhan`, `/dongY/rutLai`.
- Buổi học và học phí (B2):
  - Chỉ đọc qua bản ghi chuẩn: `buoiHoc`, `diemDanh`, `goiHoc`, `thanhToan`, `soDuNhatKy`.
  - `POST /api/buoiHoc/taoTheoLich` `{lopId, tuNgay, denNgay}`: tạo buổi theo lịch lớp (`thu`: 2 = thứ hai … 7 = thứ bảy, 8 = chủ nhật), bỏ qua buổi đã có, tối đa 93 ngày.
  - `POST /api/diemDanh/luu` `{buoiHocId, danhSach:[{hocVienId, trangThai, daLamBtvn, nhanXet}]}`: trạng thái `co_mat | vang_co_phep | vang_khong_phep | hoc_bu`. Trừ 1 buổi khi có mặt hoặc vắng không phép; vắng có phép trừ 0, hoặc 1 nếu cơ sở bật `truBuoiVangCoPhep`; học bù trừ 1 khi cơ sở không trừ vắng có phép và 0 khi có trừ. Cấu hình `truBuoiVangCoPhep` của cơ sở được chốt vào buổi học (cột `truVangCoPhep`) ngay lần lưu điểm danh đầu tiên; đổi cấu hình sau đó chỉ áp dụng cho các buổi sau, và lưu lại sổ cũ với trạng thái không đổi thì giữ nguyên số đã trừ. Số dư được phép âm (chủ ý: học viên đi học trước khi mua gói thì nợ buổi, và hiện cảnh báo). Tổng gói buổi tối đa 2.000.000.000 đồng (cột số nguyên 32 bit). Lưu lại chỉ ghi phần chênh so với `soBuoiDaTru`, trong một transaction, kèm một dòng `edu_so_du_nhat_ky`. Hai lần lưu cùng lúc không trừ hai lần (lỗi 400 `EDU_BALANCE_CONFLICT`, thử lại sau). Học viên phải cùng cơ sở với lớp và nằm trong phạm vi người gọi nên HLV chưa điểm danh được học viên học bù từ lớp khác.
  - `POST /api/goiHoc/taoMoi` `{hocVienId, soBuoi, donGia, ngayMua?}`: cộng số buổi vào số dư, ghi nhật ký `mua_goi`. `POST /api/thanhToan/ghiNhan` `{goiHocId, soTien, hinhThuc: tien_mat|chuyen_khoan, ngay?}`: không cho trả quá số còn nợ.
  - `POST /api/thanhToan/vietQr` `{goiHocId}`: trả số tiền còn nợ, nội dung chuyển khoản (`HS00001 G<id>`) và địa chỉ ảnh VietQR. Tài khoản ngân hàng lấy từ biến môi trường `EDU_VIETQR_BANK_ID`, `EDU_VIETQR_ACCOUNT_NO`, `EDU_VIETQR_ACCOUNT_NAME` (không ghi trong mã); thiếu thì báo lỗi.
  - `POST /api/soDu/canhBao`: học viên đang học còn từ 2 buổi trở xuống trong phạm vi người gọi.
- Nhận xét tháng và báo cáo (B3):
  - `POST /api/nhanXet/luu` `{hocVienId, thang: "YYYY-MM", noiDung}`: HLV viết hoặc thay nhận xét của học viên trong lớp mình. `POST /api/nhanXet/xuatVanBan` `{thang, lopId?, hocVienId?}`: văn bản thuần để dán vào Zalo (tên viết tắt của bé, không số điện thoại); ghi nhật ký xuất. Đọc chuẩn: `nhanXetThang`.
  - `POST /api/baoCao/xem` và `/baoCao/xuatCsv` với `{loai}` là `siSo | chuyenCan | sapHetBuoi | nghiDai | doanhThu` (chuyên cần: `tuNgay`/`denNgay`, mặc định 30 ngày; doanh thu: `tuThang`/`denThang`, mặc định 6 tháng). Mỗi báo cáo chỉ đọc qua quyền của hành động tương ứng nên HLV không xem được doanh thu (403) còn Kế toán xem mọi cơ sở. Chuyên cần = (có mặt + học bù) / tổng lượt điểm danh. "Nghỉ > 2 tuần" = học viên đang học hoặc tạm nghỉ không có mặt buổi nào trong 14 ngày gần nhất. CSV có BOM UTF-8, ô bắt đầu bằng `= + - @` được thêm dấu `'` để bảng tính không chạy như công thức.
  - `POST /api/trangChu/tomTat`: buổi hôm nay (giờ Việt Nam) và buổi đã đến hạn chưa điểm danh trong phạm vi người gọi. `POST /api/hlv/danhSach`: tài khoản đang giữ bộ quyền `edu_hlv`, để chọn HLV khi tạo lớp.
- Cho ứng dụng khác (chỉ đọc, phân trang `page`/`pageSize` tối đa 100): `GET /api/ext/hocVien` trả mã, tên viết tắt, cấp, lớp; `GET /api/ext/phuHuynh` trả mã. Chỉ học viên có đồng ý học tập còn hiệu lực.

Tài khoản dịch vụ cho ứng dụng khác: tạo một người dùng, gán chỉ `edu_api_doc`, đăng nhập bằng tài khoản đó để tạo API key (key luôn mang quyền của chủ key).

## Điểm khác thiết kế ban đầu

- Id là số tự tăng; mã `ma` mới là khoá chia sẻ với ứng dụng khác.
- Tên trường dùng camelCase theo mẫu NocoBase (`hoTen`), cột vật lý tự thành `ho_ten`.
- Không có `createdAt`/`updatedAt` ở bảng cấu hình; chỉ nhật ký có `createdAt`.
- Giao diện NocoEdu đã có tiếng Việt; các trang người dùng và phân quyền của mẫu vẫn tiếng Anh cho tới khi có bản dịch.
- Font Roboto chỉ dùng khi máy đã cài, chưa đóng gói file font (tránh thêm phụ thuộc giấy phép OFL).

## Trang giao diện

Trang chủ (theo vai trò: lớp hôm nay, buổi chưa điểm danh, học viên sắp hết buổi), Cơ sở, Lớp (chọn HLV từ danh sách), Học viên, Phụ huynh, Điểm danh (tạo buổi theo lịch lớp, 4 trạng thái, bài tập về nhà, nhận xét ngắn, hiện cảnh báo ≤ 2 buổi), Học phí (bán gói, ghi thanh toán, mã VietQR, nhật ký số dư), Nhận xét (viết và xuất văn bản), Báo cáo (xem và tải CSV). Mỗi trang có `authz` riêng (`edu.diemDanh`, `edu.hocPhi`, `edu.nhanXet`, `edu.baoCao`).

## Nhập học viên từ CSV

`EDU_IMPORT_CSV=/đường/dẫn/tuyệt/đối/ngoài/repo/hoc-vien.csv pnpm nocobase app edu import-hoc-vien --dry-run --json`, bỏ `--dry-run` để ghi thật. Cột (dòng đầu là tiêu đề): `hoTen, namSinh, coSoMa, lopMa, capHienTai, phuHuynhHoTen, phuHuynhSdt, phuHuynhZalo, quanHe`; bắt buộc `hoTen, namSinh, coSoMa, phuHuynhHoTen, phuHuynhSdt`. Trùng = cùng tên (không phân biệt hoa thường, khoảng trắng) + năm sinh + số điện thoại phụ huynh (đã chuẩn hoá +84 → 0), so với dữ liệu có sẵn và với các dòng trước trong file. Còn dòng trùng hoặc lỗi thì không ghi dòng nào; kết quả chỉ nêu số dòng và mã lỗi, không in tên hay số điện thoại. Cùng số điện thoại thì dùng chung một phụ huynh. File nằm trong repo bị từ chối.

## Dữ liệu mẫu và tài khoản mẫu

Chỉ nạp khi cài cơ sở dữ liệu với `APP_SAMPLE_DATA=true` (hoặc `pnpm nocobase db sample` trong môi trường phát triển): 2 cơ sở, 3 lớp, 10 học viên và phụ huynh giả ("Học viên Mẫu 01", số điện thoại `09000000xx`), mỗi lớp có lịch và buổi hôm nay cùng buổi 3 ngày trước chưa điểm danh. Kèm 3 tài khoản mẫu, mỗi vai trò một người, email `@example.invalid`:

| Email                        | Vai trò             | Ghi chú                        |
| ---------------------------- | ------------------- | ------------------------------ |
| `ql-mau@example.invalid`     | `edu_quan_ly_co_so` | Quản lý Cơ sở Mẫu 1            |
| `hlv-mau@example.invalid`    | `edu_hlv`           | HLV của hai lớp ở Cơ sở Mẫu 1  |
| `ketoan-mau@example.invalid` | `edu_ke_toan`       | Mọi cơ sở, không sửa điểm danh |

Tài khoản Quản trị là tài khoản quản trị ban đầu của ứng dụng. Mật khẩu không nằm trong repo: lấy từ `EDU_SAMPLE_PASSWORD` nếu đặt, nếu không là chuỗi ngẫu nhiên và quản trị viên đặt lại trong Quản lý người dùng.

## Biến môi trường của NocoEdu

`EDU_VIETQR_BANK_ID`, `EDU_VIETQR_ACCOUNT_NO`, `EDU_VIETQR_ACCOUNT_NAME` (mã VietQR), `EDU_IMPORT_CSV` (file nhập), `EDU_SAMPLE_PASSWORD` (mật khẩu tài khoản mẫu), `APP_SAMPLE_DATA`.
