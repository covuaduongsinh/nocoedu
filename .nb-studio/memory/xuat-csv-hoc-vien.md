---
name: xuat-csv-hoc-vien
description: Cách xuất CSV học viên kèm phụ huynh trên NocoEdu (DS-60 PR 6): quyền, cột, giới hạn, nhật ký.
type: project
modified: 2026-11-11
---

Trang Học viên có nút "Xuất CSV": chọn cơ sở, lớp, trạng thái (bỏ trống = tất cả những gì người xuất được thấy), tải tệp UTF-8 có BOM. Tệp có **đúng các cột của tệp nhập** (`hoTen,namSinh,coSoMa,lopMa,capHienTai,phuHuynhHoTen,phuHuynhSdt,phuHuynhZalo,quanHe`) để sửa rồi nhập lại.

- Quyền: action `export` của `edu.hocVien`, chỉ Quản trị và Quản lý cơ sở (seed `202611110002_edu_hoc_vien_export_grant`). Quản lý cơ sở chỉ xuất học viên cơ sở mình; cơ sở hoặc lớp ngoài phạm vi trong bộ lọc trả 403. HLV, kế toán 403; chưa đăng nhập 401.
- Thu thập tối thiểu (tri thức 05): chỉ các cột trên. **Không** xuất ngày sinh đầy đủ (chỉ `/hocVien/ngaySinh`), ghi chú HLV, số dư, địa chỉ. Học viên có nhiều phụ huynh = nhiều dòng (liên hệ chính trước); học viên chưa có phụ huynh = một dòng cột phụ huynh để trống, nhập lại sẽ bị từ chối cho tới khi điền.
- Ô bắt đầu bằng `=`, `+`, `-`, `@`, tab, CR được thêm `'` ở đầu (`csvCell`).
- Nhật ký: mỗi lần xuất một dòng `eduXuatDuLieuNhatKy` (`loai = hoc_vien_csv`, người, thời điểm, bộ lọc, số dòng), không tên. Tệp không lưu trên server.
- Giới hạn: tối đa 5.000 học viên mỗi lần (`MAX_EXPORT_STUDENTS`), vượt thì lỗi `EDU_EXPORT_TOO_LARGE` bảo chọn một cơ sở hoặc lớp. Lý do: tệp dựng trong bộ nhớ và bảng tính khó mở hơn nữa; stream không đổi điều đó.

**Vì sao:** dữ liệu trẻ em chỉ được rời hệ thống có kiểm soát và có dấu vết.

**Cách áp dụng:** thêm cột thì phải xét lại ba chỗ: tệp mẫu nhập, `IMPORT_COLUMNS` và tri thức 05; quyền mới thêm bằng seed mới.
