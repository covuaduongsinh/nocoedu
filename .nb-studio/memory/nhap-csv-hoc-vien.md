---
name: nhap-csv-hoc-vien
description: Cách nhập CSV học viên kèm phụ huynh trên giao diện NocoEdu (DS-60 PR 5): quyền, quy tắc trùng, giới hạn.
type: project
modified: 2026-11-11
---

Trang Học viên có nút "Nhập từ CSV": tải tệp lên, xem trước (chỉ số đếm và lỗi theo số dòng kèm mã lỗi), xác nhận thì ghi trong một transaction (hoặc ghi hết, hoặc không ghi gì).

- Quyền: action `import` của `edu.hocVien`, chỉ Quản trị và Quản lý cơ sở. Quản lý cơ sở chỉ nhập vào cơ sở và lớp của mình; server trả 403 cả khi xem trước lẫn xác nhận.
- Trùng: học viên là cùng một người khi trùng tên (chuẩn hoá) + năm sinh + cơ sở **và** có một phụ huynh cùng SĐT với dòng (giống nhập Lark). Không có SĐT trùng thì là bé khác, tạo mới, không gắn phụ huynh vào bé cũ. Nhiều bé khớp thì dòng lỗi `AMBIGUOUS_STUDENT`, không đoán. Phụ huynh trùng SĐT (chỉ trong số người nhập đang thấy) thì dùng lại. Đã có thì chỉ thêm liên kết còn thiếu; chạy lại cùng tệp không nhân đôi. Khác lệnh `import-hoc-vien` (coi trùng là lỗi). Các dòng cùng tên/năm/cơ sở trong một tệp vẫn gộp thành một bé.
- Chặn: lớp `da_dong` (`CLASS_CLOSED`), cơ sở `tam_dung` (`BRANCH_PAUSED`). Gắn phụ huynh vào học viên `da_nghi` chỉ cảnh báo `STUDENT_LEFT` khi xem trước.
- Phạm vi: chỉ tra mã cơ sở/lớp trong phạm vi người nhập; mã của cơ sở khác báo `UNKNOWN_*` y như mã không tồn tại, nên không dò được. Không còn 403 theo dòng.
- Xác nhận chạy trong Mutex `edu:nhap-csv` (plugin concurrency) để hai tab không tạo trùng.
- Giới hạn: 512 K ký tự và 2.000 dòng; UTF-8 có hoặc không có BOM; tệp không được lưu.
- Nhật ký: một dòng `eduNhapLarkNhatKy` mỗi lần xác nhận (`tongKet.nguon = 'csv_hoc_vien'`), chỉ số đếm, không tên, không SĐT.

**Vì sao:** chủ dự án muốn nhập học viên hàng loạt trên giao diện mà không làm lộ dữ liệu trẻ em và không cho quản lý cơ sở động vào cơ sở khác (tri thức 05).

**Cách áp dụng:** đổi quy tắc trùng hay giới hạn ở `server/edu/import-web.ts`; quyền mới thêm bằng seed mới, không sửa seed đã chạy.
