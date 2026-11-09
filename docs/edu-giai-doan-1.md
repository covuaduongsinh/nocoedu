# NocoEdu giai đoạn 1: những gì đã có

Tài liệu này mô tả phần đã làm của DS-57 (Phần A và B1). Điểm danh, học phí, nhận xét, báo cáo, nhập CSV và dữ liệu mẫu làm ở các bước sau.

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
| `edu_buoi_hoc`, `edu_diem_danh`                      | Buổi học và điểm danh (bảng đã tạo, giao diện ở bước B2)                                                          |
| `edu_goi_hoc`, `edu_thanh_toan`, `edu_so_du_nhat_ky` | Gói buổi, thanh toán, nhật ký số dư (bảng đã tạo, xử lý ở bước B2)                                                |
| `edu_nhan_xet_thang`, `edu_xuat_du_lieu_nhat_ky`     | Nhận xét tháng; nhật ký ai xuất danh sách học viên (bước B3)                                                      |

## Vai trò

Năm bộ quyền được tạo một lần bằng seed, không gán cho ai. Quản trị gán cho từng người trong "Quản lý người dùng".

| Bộ quyền            | Phạm vi dữ liệu    | Làm được                                                                  |
| ------------------- | ------------------ | ------------------------------------------------------------------------- |
| `edu_quan_tri`      | Tất cả             | Mọi thao tác trên cơ sở, lớp, học viên, phụ huynh, đồng ý                 |
| `edu_quan_ly_co_so` | Cơ sở mình quản lý | Như trên, chỉ trong cơ sở của mình                                        |
| `edu_hlv`           | Lớp mình dạy       | Xem lớp, học viên; sửa ghi chú; xác nhận lên cấp; không tạo hay sửa hồ sơ |
| `edu_ke_toan`       | Tất cả             | Chỉ xem cơ sở, lớp, học viên, phụ huynh (học phí thêm ở bước B2)          |
| `edu_api_doc`       | Tất cả             | Chỉ `GET /api/ext/*`; dành cho tài khoản dịch vụ của ứng dụng khác        |

## Đường dẫn API

Đều cần đăng nhập (hoặc API key); chưa đăng nhập trả 401, thiếu quyền trả 403.

- Bản ghi chuẩn `POST /api/<tên>/findMany|findOne|count|createOne|updateOne|deleteOne` với tên `coSo`, `coSoQuanLy`, `lop`, `lopLich`, `hocVien`, `phuHuynh`, `lienKet`, `dongY` (chỉ các thao tác mỗi tên được mở). Ghi cần header `Idempotency-Key`.
- Nghiệp vụ: `POST /api/hocVien/taoMoi`, `/hocVien/capNhatGhiChu`, `/hocVien/lenCap`, `/phuHuynh/taoMoi`, `/dongY/ghiNhan`, `/dongY/rutLai`.
- Cho ứng dụng khác (chỉ đọc, phân trang `page`/`pageSize` tối đa 100): `GET /api/ext/hocVien` trả mã, tên viết tắt, cấp, lớp; `GET /api/ext/phuHuynh` trả mã. Chỉ học viên có đồng ý học tập còn hiệu lực.

Tài khoản dịch vụ cho ứng dụng khác: tạo một người dùng, gán chỉ `edu_api_doc`, đăng nhập bằng tài khoản đó để tạo API key (key luôn mang quyền của chủ key).

## Điểm khác thiết kế ban đầu

- Id là số tự tăng; mã `ma` mới là khoá chia sẻ với ứng dụng khác.
- Tên trường dùng camelCase theo mẫu NocoBase (`hoTen`), cột vật lý tự thành `ho_ten`.
- Không có `createdAt`/`updatedAt` ở bảng cấu hình; chỉ nhật ký có `createdAt`.
- Giao diện NocoEdu đã có tiếng Việt; các trang người dùng và phân quyền của mẫu vẫn tiếng Anh cho tới khi có bản dịch.
- Font Roboto chỉ dùng khi máy đã cài, chưa đóng gói file font (tránh thêm phụ thuộc giấy phép OFL).
