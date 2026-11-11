---
name: nhap-csv-hoc-vien
description: Cách nhập CSV học viên kèm phụ huynh trên giao diện NocoEdu (DS-60 PR 5): quyền, quy tắc trùng, giới hạn.
type: project
modified: 2026-11-11
---

Trang Học viên có nút "Nhập từ CSV": tải tệp lên, xem trước (chỉ số đếm và lỗi theo số dòng kèm mã lỗi), xác nhận thì ghi trong một transaction (hoặc ghi hết, hoặc không ghi gì).

- Quyền: action `import` của `edu.hocVien`, chỉ Quản trị và Quản lý cơ sở. Quản lý cơ sở chỉ nhập vào cơ sở và lớp của mình; server trả 403 cả khi xem trước lẫn xác nhận.
- Trùng: mỗi dòng được ghép theo SĐT của **chính dòng đó**. Học viên đã có là cùng một người khi trùng tên (chuẩn hoá) + năm sinh + cơ sở **và** có phụ huynh cùng SĐT (giống nhập Lark). Phụ huynh trùng SĐT (chỉ trong số người nhập đang thấy) thì dùng lại. Chạy lại cùng tệp không nhân đôi (dòng khớp là "không đổi").
- Các dòng cùng tên/năm/cơ sở trong một tệp: chỉ gộp khi tất cả cùng trỏ vào **một** học viên đã có, hoặc khi **không dòng nào** khớp học viên đã có (khi đó gộp thành một bé mới có nhiều phụ huynh; quyết định thiết kế vì tệp không có gì để phân biệt). Mọi trường hợp khác (hai học viên đã có khác nhau, hoặc vừa khớp học viên đã có vừa không khớp) thì cả các dòng đó báo `AMBIGUOUS_STUDENT`, không ghi gì. Hệ quả: không thêm được phụ huynh mới cho học viên đã có bằng CSV; dùng nút "Thêm phụ huynh" trên trang.
- Cảnh báo (không chặn): `STUDENT_LEFT` khi dòng khớp học viên đã nghỉ; `POSSIBLE_DUPLICATE` khi đã có học viên cùng khoá nhưng không phụ huynh nào của bé trùng SĐT của dòng, hoặc bé chưa có phụ huynh (không đối chiếu được, dòng sẽ tạo bé mới).
- Chặn: lớp `da_dong` (`CLASS_CLOSED`), cơ sở `tam_dung` (`BRANCH_PAUSED`), **chỉ với dòng sẽ tạo học viên mới**; dòng khớp đúng một học viên đã có ("trùng") không bị chặn, để nhập lại tệp vừa xuất. Dòng có mọi cột phụ huynh để trống (học viên chưa có phụ huynh trong tệp xuất): khớp đúng một học viên đã có thì chỉ cảnh báo `STUDENT_WITHOUT_PARENT` và không ghi gì; không khớp thì `MISSING_FIELD`; khớp nhiều thì `AMBIGUOUS_STUDENT`. An toàn vì dòng đó không tạo được gì.
- Phạm vi: chỉ tra mã cơ sở/lớp trong phạm vi người nhập; mã của cơ sở khác báo `UNKNOWN_*` y như mã không tồn tại, nên không dò được. Không còn 403 theo dòng.
- Xác nhận chạy trong Mutex `edu:nhap-csv` (plugin concurrency) để hai tab không tạo trùng.
- Giới hạn: 512 K ký tự và 2.000 dòng; UTF-8 có hoặc không có BOM; tệp không được lưu.
- Nhật ký: một dòng `eduNhapLarkNhatKy` mỗi lần xác nhận (`tongKet.nguon = 'csv_hoc_vien'`), chỉ số đếm, không tên, không SĐT.

**Vì sao:** chủ dự án muốn nhập học viên hàng loạt trên giao diện mà không làm lộ dữ liệu trẻ em và không cho quản lý cơ sở động vào cơ sở khác (tri thức 05).

**Cách áp dụng:** đổi quy tắc trùng hay giới hạn ở `server/edu/import-web.ts`; quyền mới thêm bằng seed mới, không sửa seed đã chạy.
