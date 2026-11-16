# NocoEdu: danh sách đưa vào dùng thật

Dành cho Thầy Tường. Bản chạy thật `nocoedu.dsc.edu.vn` hiện chỉ một mình Thầy đăng nhập, và **chưa có gì từ nhánh `claude/keen-wozniak-sajmjv` được triển khai lên đó**. Làm lần lượt từ trên xuống; mỗi mục ghi rõ việc gì, ở đâu và cách biết đã xong.

## A. Trước khi triển khai (không đụng dữ liệu thật)

1. **Gộp nhánh.** Nhánh `claude/keen-wozniak-sajmjv` chưa mở pull request. Khi Thầy đồng ý nội dung, nhờ mở PR và gộp vào `main`; CI chạy các kiểm tra hiện có.
2. **Thêm job PostgreSQL vào CI.** Trình chạy tự động không có quyền `workflows` nên không tự thêm được. Người có quyền chép khối YAML trong `docs/ci-postgres-job.md` vào `.github/workflows/ds-check.yml`. Xong khi một lần chạy CI có job `postgres` xanh (kiểm migration và phạm vi dữ liệu trên PostgreSQL thật, vì bản chạy thật dùng PostgreSQL còn máy phát triển dùng SQLite).

## B. Cấu hình trên máy chủ (Dokploy)

Đặt các biến môi trường của dịch vụ ứng dụng, **không ghi vào repo**:

| Biến                                                                     | Việc                                             | Ghi chú                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EDU_CRM_WEBHOOK_TOKEN`                                                  | Mã bí mật để NocoCRM đẩy liên hệ tuyển sinh sang | Ít nhất 24 ký tự, ví dụ sinh bằng `openssl rand -base64 36`. Đặt **cùng giá trị** ở NocoCRM (gửi trong header `x-crm-token`). Chưa đặt thì đường nhận liên hệ trả 404 và không nhận gì. |
| `EDU_VIETQR_BANK_ID`, `EDU_VIETQR_ACCOUNT_NO`, `EDU_VIETQR_ACCOUNT_NAME` | Mã VietQR trên trang Học phí                     | Thiếu một biến thì nút VietQR báo lỗi, các phần khác vẫn chạy.                                                                                                                          |
| `EDU_TRU_BUOI_VANG_KHONG_PHEP`                                           | Vắng không phép có trừ 1 buổi không              | Không đặt = không trừ (đang là quy định hiện hành). Chỉ đặt `true` khi Thầy chốt đổi quy định; quy định được chốt vào từng buổi ở lần điểm danh đầu tiên của buổi đó.                   |

**Kênh Hộp thư (bắt buộc để nhắc thu chạy).** Trong `config.yml` của máy chủ phải có kênh thông báo kiểu trong ứng dụng:

```yaml
notification:
  channels:
    inbox:
      type: in-app
```

Không có kênh này, ứng dụng vẫn chạy nhưng **không có thông báo nhắc thu** nào được gửi. Xong khi vào Cài đặt hệ thống › Quản lý thông báo › Mẫu thông báo thấy "Nhắc thu học phí hằng ngày" với kênh `in-app` ở trạng thái đã cấu hình. Đổi cấu hình thì khởi động lại dịch vụ.

## C. Ngày triển khai

1. **Sao lưu trước, không bỏ qua.** Chạy `pg_dump` ở **container PostgreSQL** (image ứng dụng không có `pg_dump`), hoặc dùng sao lưu của Dokploy cho dịch vụ database. Ví dụ: `docker exec <container-postgres> pg_dump -U <user> -Fc <tên-db> > /đường/dẫn/an/toàn/nocoedu-truoc-trien-khai.dump`. Kiểm tệp không rỗng bằng `ls -l`. Dump chứa dữ liệu trẻ em: để ngoài repo và ngoài thư mục chia sẻ. Cách khôi phục: `pg_restore --clean --if-exists -d <db> <tệp>` khi ứng dụng đang dừng.
2. **Triển khai bản mới**, rồi chạy cập nhật cơ sở dữ liệu: `node dist/cli/index.js db apply` (cũng có thể tự chạy khi khởi động, như `docs/lark/nhap-production.md` mô tả). Lần này thêm: bảng số thứ tự phiếu thu và cột `soPhieu`, cột `nguongNhacBuoi` của cơ sở, bảng `eduCongPhuHuynh`, và các quyền mới cho bộ quyền Quản trị, Kế toán, Quản lý cơ sở (đối soát, sao lưu, điều chỉnh số dư, link phụ huynh). Lệnh chỉ thêm, không xoá dữ liệu. **Không dùng `db rollback`** trên bản đã có người ghi dữ liệu.
3. Mở ứng dụng, đăng nhập bằng tài khoản Quản trị, mở **Cơ sở** và kiểm cột "Nhắc khi còn (buổi)" (mọi cơ sở mặc định 2).

## D. Sau khi triển khai (làm trong ứng dụng)

1. **Lệch sổ số dư.** Vào Báo cáo, chọn "Lệch sổ số dư". Mỗi dòng là một học viên có số buổi còn lại khác con số trên dòng sổ cuối (số buổi từng bị ghi ngoài sổ). Khác với báo cáo "Số dư âm", là danh sách học viên đang nợ buổi để báo phụ huynh đóng học phí kỳ mới. Xử lý từng dòng bằng **Điều chỉnh số dư** ở trang Học phí (chỉ Quản trị và Kế toán, bắt buộc ghi lý do). Xong khi báo cáo trống.
2. **Tài khoản và bộ quyền.** Vào Quản lý người dùng, tạo tài khoản cho HLV, kế toán, quản lý cơ sở rồi gán **một** bộ quyền cho mỗi người: `NocoEdu - Huấn luyện viên`, `NocoEdu - Kế toán`, `NocoEdu - Quản lý cơ sở` (riêng Quản lý cơ sở còn phải được ghi tên là người quản lý của cơ sở: vào trang **Cơ sở**, nút **Người quản lý** ở dòng cơ sở, chọn tài khoản; chỉ Quản trị làm được. Chưa ghi tên thì tài khoản đó không thấy dữ liệu nào). Các bộ quyền không tự gán cho ai. Kiểm: đăng nhập thử từng vai, HLV chỉ thấy lớp mình, quản lý chỉ thấy cơ sở mình.
3. **Gán HLV cho 7 lớp** đang thiếu HLV (`HLV_CHUA_GHEP` khi nhập từ Lark): trang Lớp học, sửa lớp, chọn HLV. Chỉ HLV đã có tài khoản mới chọn được, nên làm sau bước 2. Lớp chưa có HLV thì không ai điểm danh được.
4. **Thu đồng ý của phụ huynh** cho các học viên nhập từ Lark (việc Thầy đã đưa vào kế hoạch). Nên có đồng ý của phụ huynh trước khi gửi link riêng cho họ.
5. **Chạy thử một vòng đủ:** điểm danh một buổi bằng điện thoại, bán gói, thu tiền, in phiếu thu, tạo link cho một phụ huynh (nhờ họ mở thử), và chờ 08:00 hôm sau để thấy thông báo nhắc thu trong Hộp thư của Kế toán và Quản lý.

## E. Còn nợ

- Trên điện thoại, các bảng ở trang Học phí cuộn ngang trong khung.
- Khung ứng dụng đã có tiếng Việt và tên Dương Sinh, logo Dương Sinh đã thay logo NocoBase (menu, phiếu thu, phiếu đối soát in, trang phụ huynh, biểu tượng tab); hotline trên phiếu là 0983 119 819. Trên máy chủ, mở `config.yml` và kiểm `client.app.title` (nếu còn `NocoBase` thì đổi thành `NocoEdu - Cờ vua Dương Sinh`).
- Chưa làm: `DatePicker`/`DataTable` của mẫu cho các trang edu (các trang vẫn dùng ô ngày của trình duyệt và `FormDialog`).
- Chạy nhiều bản ứng dụng cùng lúc thì job nhắc thu cần Redis (`jobs.default`); một bản thì không cần.
- Phiếu đối soát in ra còn chữ ghi cứng và số hotline mẫu (`client/pages/edu/doi-soat.tsx`).
