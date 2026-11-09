# Nguồn gốc của NocoEdu

NocoEdu là ứng dụng NocoBase 3 quản lý đào tạo của CLB Cờ vua Dương Sinh. Ứng dụng này được tạo từ mẫu chính thức,
không sao chép mã từ NocoCRM hay bất kỳ ứng dụng nào khác.

## Cách tạo

```bash
PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm create @nocobase/app@0.1.0-beta.34 nocoedu \
  --template=@nocobase/app-template-default@1.0.0-beta.89 --json
```

Chạy trong thư mục tạm, sau đó chuyển vào repo (bỏ `node_modules`) và chạy `pnpm install`.

| Mục | Giá trị |
| --- | --- |
| `@nocobase/create-app` | `0.1.0-beta.34` |
| `@nocobase/app-template-default` | `1.0.0-beta.89` (ghim chính xác, không dùng `--template-tag=beta` vì kênh này tải bản cũ nhất) |
| `@nocobase/app-skills` | `0.1.0-beta.60` (do mẫu kéo theo) |
| Ngày tạo | 2026-11-09 |
| Mốc gốc | commit đầu tiên có thông điệp `chore: scaffold NocoEdu ...` trên nhánh `main` |

Studio chưa ghi phiên bản mẫu ghim cho NocoEdu, nên chọn beta.89 là bản mới nhất lúc tạo. Cần xác nhận nếu chủ dự án muốn bản khác.

## Thay đổi sau khi tạo

- Thêm `@nocobase/db-postgres` (`0.1.0-beta.5`) vào `dependencies` để chạy trên Postgres; vẫn giữ `@nocobase/db-sqlite` cho dev và test.
  Không đổi phiên bản của bất kỳ gói `@nocobase/*` nào khác.
- `client/config/app.ts`: tên hiển thị "NocoEdu - Cờ vua Dương Sinh".
- `config.example.yml`: ghi chú cách chuyển sang Postgres bằng biến môi trường (không có mật khẩu).
- `README.md`: thay bằng README của mẫu.
- `docs/nguon-goc.md`: tệp này.

## Cấu hình và bí mật

`config.yml`, `.env`, `database.sqlite` và `storage/` nằm trong `.gitignore`; không commit. Tạo cấu hình cục bộ bằng
`pnpm nocobase config init` (SQLite) hoặc `pnpm nocobase config init --dialect postgres`, rồi `pnpm nocobase config check`.
