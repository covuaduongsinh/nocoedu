# Giải mã cấu trúc Lark (DS-60)

Script đọc **cấu trúc** Base và Sheets của CLB trên Lark rồi sinh [docs/lark/schema.md](../../docs/lark/schema.md). Không đọc, không lưu nội dung bản ghi học viên: bản ghi chỉ được đếm (`page_size=1`, bản ghi trả về bị bỏ). Ô Sheets phải đọc để tìm công thức, nhưng chỉ giữ lại tiêu đề, công thức, kiểu ô và các mã ngắn lặp lại ít nhất 3 lần ở cột không mang dữ liệu cá nhân (`analyze.mjs`).

| File                | Việc                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `lark-cli.mjs`      | Gọi `lark-cli api … --as bot`, nghỉ giữa các lần gọi, thử lại khi bị giới hạn tần suất                      |
| `analyze.mjs`       | Hàm thuần: chuẩn hoá công thức, gom sheet, lọc dữ liệu cá nhân (test: `tests/project/lark-analyze.test.ts`) |
| `giai-ma.mjs`       | Đọc nguồn, ghi `structure.json` **ngoài repo**                                                              |
| `render-schema.mjs` | Dựng `docs/lark/schema.md` từ `structure.json`                                                              |

## Cài lark-cli

Chỉ dùng `lark-cli` chính chủ ([github.com/larksuite/cli](https://github.com/larksuite/cli), MIT), không cài `lark-openapi-mcp` hay `yjwong/lark-cli`. Cài trong một thư mục tạm, không cài toàn máy:

```sh
mkdir -p "$TMPDIR/larkcli" && cd "$TMPDIR/larkcli"
npm init -y && npm install @larksuite/cli@latest   # postinstall tải binary lark-cli theo checksum
export LARK_CLI="$TMPDIR/larkcli/node_modules/@larksuite/cli/bin/lark-cli"
"$LARK_CLI" --version
```

(`npx @larksuite/cli@latest install` cũng được nếu máy cho cài vào thư mục người dùng.)

## Chạy

Cần ba biến môi trường của app Lark (lấy từ biến dự án, không ghi vào file): `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_DOMAIN` (`https://open.larksuite.com`). Không dùng OAuth người dùng.

```sh
node scripts/lark/giai-ma.mjs --out "$TMPDIR/lark/structure.json"            # Base + 2 Sheets, khoảng 1 giờ
node scripts/lark/giai-ma.mjs --only base --out "$TMPDIR/lark/base.json"     # chỉ Base, vài phút
node scripts/lark/render-schema.mjs "$TMPDIR/lark/base.json" "$TMPDIR/lark/sheets.json" > docs/lark/schema.md
npx prettier --write docs/lark/schema.md
```

- `--delay-ms` (mặc định 1200): thời gian nghỉ tối thiểu giữa hai lần gọi. Lệnh đọc giá trị Sheets phía Lark mất vài giây mỗi lần.
- Script lấy `tenant_access_token` một lần bằng `fetch` (secret đi trong thân yêu cầu, không qua dòng lệnh) và đưa cho `lark-cli` qua `LARKSUITE_CLI_TENANT_ACCESS_TOKEN`. Nếu để `lark-cli` tự lấy token mỗi lần gọi, endpoint token trả `429`.
- Script **từ chối** ghi kết quả vào trong repo. Không commit `structure.json` hay bất cứ file nào xuất từ Lark.
- Đọc lại `schema.md` trước khi commit: bộ lọc view, lựa chọn của trường có tên giống dữ liệu cá nhân (tên, SĐT, ngày sinh, nick…) đã bị lược, nhưng chữ trong tiêu đề cột và lựa chọn khác được in nguyên văn.

## Vì sao dùng lớp raw `lark-cli api`

Các lệnh tắt `lark-cli base +table-list`, `+field-list`… gọi API `base/v3` và cần scope `base:app:read`, `base:table:read`… mà app chưa được cấp (`99991672 app_scope_not_applied`). Lớp raw gọi API `bitable/v1` và `sheets/v2`, `sheets/v3` với quyền xem đã chia sẻ cho app. Danh sách lệnh đã dùng nằm ở cuối `docs/lark/schema.md`.

## Giới hạn hiện tại

- Base bật quyền nâng cao: vai trò của app không đọc được bảng `tblZUIXmpdt13j4x` (phụ huynh) và `tblHp1PGPz52eZBz` (nộp tiền). Cấp quyền rồi chạy lại.
- `bitable/v1/…/workflows` trả `1254200`; automation chưa liệt kê được.
- Base không có cờ bắt buộc ở mức trường; "bắt buộc" lấy từ câu hỏi bắt buộc của biểu mẫu.
