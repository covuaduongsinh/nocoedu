# NocoEdu giai đoạn 1: những gì đã có

Tài liệu này mô tả phần đã làm của DS-57 (Phần A, B1 và B2: buổi học, điểm danh, số dư buổi, gói buổi, thanh toán, VietQR). Nhận xét, báo cáo, nhập CSV, trang giao diện cho điểm danh/học phí và dữ liệu mẫu làm ở bước sau.

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
| `edu_buoi_hoc`, `edu_diem_danh`                      | Buổi học và điểm danh (API ở B2; trang giao diện ở B3)                                                            |
| `edu_goi_hoc`, `edu_thanh_toan`, `edu_so_du_nhat_ky` | Gói buổi, thanh toán, nhật ký số dư (API ở B2; trang giao diện ở B3)                                              |
| `edu_nhan_xet_thang`, `edu_xuat_du_lieu_nhat_ky`     | Nhận xét tháng; nhật ký ai xuất danh sách học viên (bước B3)                                                      |

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
  - `POST /api/diemDanh/luu` `{buoiHocId, danhSach:[{hocVienId, trangThai, daLamBtvn, nhanXet}]}`: trạng thái `co_mat | vang_co_phep | vang_khong_phep | hoc_bu`. Trừ 1 buổi khi có mặt hoặc vắng không phép; vắng có phép trừ 0, hoặc 1 nếu cơ sở bật `truBuoiVangCoPhep`; học bù trừ 1 khi cơ sở không trừ vắng có phép và 0 khi có trừ. Lưu lại chỉ ghi phần chênh so với `soBuoiDaTru`, trong một transaction, kèm một dòng `edu_so_du_nhat_ky`. Hai lần lưu cùng lúc không trừ hai lần (lỗi 400 `EDU_BALANCE_CONFLICT`, thử lại sau). Học viên phải cùng cơ sở với lớp và nằm trong phạm vi người gọi nên HLV chưa điểm danh được học viên học bù từ lớp khác.
  - `POST /api/goiHoc/taoMoi` `{hocVienId, soBuoi, donGia, ngayMua?}`: cộng số buổi vào số dư, ghi nhật ký `mua_goi`. `POST /api/thanhToan/ghiNhan` `{goiHocId, soTien, hinhThuc: tien_mat|chuyen_khoan, ngay?}`: không cho trả quá số còn nợ.
  - `POST /api/thanhToan/vietQr` `{goiHocId}`: trả số tiền còn nợ, nội dung chuyển khoản (`HS00001 G<id>`) và địa chỉ ảnh VietQR. Tài khoản ngân hàng lấy từ biến môi trường `EDU_VIETQR_BANK_ID`, `EDU_VIETQR_ACCOUNT_NO`, `EDU_VIETQR_ACCOUNT_NAME` (không ghi trong mã); thiếu thì báo lỗi.
  - `POST /api/soDu/canhBao`: học viên đang học còn từ 2 buổi trở xuống trong phạm vi người gọi.
- Cho ứng dụng khác (chỉ đọc, phân trang `page`/`pageSize` tối đa 100): `GET /api/ext/hocVien` trả mã, tên viết tắt, cấp, lớp; `GET /api/ext/phuHuynh` trả mã. Chỉ học viên có đồng ý học tập còn hiệu lực.

Tài khoản dịch vụ cho ứng dụng khác: tạo một người dùng, gán chỉ `edu_api_doc`, đăng nhập bằng tài khoản đó để tạo API key (key luôn mang quyền của chủ key).

## Điểm khác thiết kế ban đầu

- Id là số tự tăng; mã `ma` mới là khoá chia sẻ với ứng dụng khác.
- Tên trường dùng camelCase theo mẫu NocoBase (`hoTen`), cột vật lý tự thành `ho_ten`.
- Không có `createdAt`/`updatedAt` ở bảng cấu hình; chỉ nhật ký có `createdAt`.
- Giao diện NocoEdu đã có tiếng Việt; các trang người dùng và phân quyền của mẫu vẫn tiếng Anh cho tới khi có bản dịch.
- Font Roboto chỉ dùng khi máy đã cài, chưa đóng gói file font (tránh thêm phụ thuộc giấy phép OFL).
