# Kế hoạch cập nhật bản chạy thật nocoedu.dsc.edu.vn (2026-11-19)

Trạng thái: **đã hoàn tất**

## 1. Hiện trạng (đã khảo sát)

| Mục                     | Giá trị                                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VPS                     | `217.15.160.118` (x86_64, RAM 11 GiB, đĩa còn ~62 GB), SSH `root`                                                                                                           |
| Cách triển khai         | Dokploy compose `compose-synthesize-online-firewall-897jlk`, thư mục `/etc/dokploy/compose/compose-synthesize-online-firewall-897jlk/code/` (`docker-compose.yml` + `.env`) |
| Build                   | `build.context: https://github.com/covuaduongsinh/nocoedu.git#main` → image `nocoedu-app:main` (Dockerfile của repo, build từ nguồn)                                        |
| Dịch vụ                 | `app` (node 24, cổng 13000, `APP_BASE_PATH=/main`, Traefik `Host(nocoedu.dsc.edu.vn)`), `db` (postgres:16-alpine)                                                           |
| Dữ liệu                 | volume `…_nocoedu-pg` (Postgres), `…_nocoedu-storage` (`/app/storage`, gồm `config.yml`)                                                                                    |
| Bản đang chạy           | image build 2026-11-15 20:09 (giờ VN) ≈ commit `779fdef`, template `1.0.0-beta.89`                                                                                          |
| Migration cuối trong DB | `202611140007_create_edu_sach_hoc`                                                                                                                                          |
| Migration               | `migrations.autoRun: true`, `seeds.autoRun: true` → chạy khi app khởi động                                                                                                  |

## 2. Thay đổi sẽ lên (`779fdef..c795b94`, 46 commit)

- GĐ 0–5 tái cấu trúc: gia cố route, sổ điểm danh, Hồ sơ 360°, nhóm trình độ trong lớp, hệ thống kiến thức, bài kiểm tra theo cấp.
- Nâng template NocoBase lên `1.0.0-beta.97` (plugin `@nocobase/*` mới; có thể kèm migration của plugin).
- Migration mới (chỉ **thêm**, không sửa migration cũ → không lệch checksum):
  `202611180001_edu_diem_danh_hoc_vien_index`, `202611180002_create_edu_lop_nhom`,
  `202611180004_create_edu_kien_thuc`, `202611180005_create_edu_kiem_tra`.
- Seed quyền mới: `202611170001_edu_he_thong_grant`, `202611180003…180006_*_grant`.
- `config.example.yml` chỉ đổi phần chú thích → `config.yml` trên VPS không cần sửa.

Rủi ro đã biết: CI của PR #51 hỏng 1/174 tệp test (`tests/client/settings-navigation.test.ts`, so thứ tự thẻ System settings) — không chặn chức năng, ghi nhận để sửa sau.

## 3. Các bước

1. **Sao lưu** vào `/root/backups/nocoedu-<thời điểm>/`:
   - `pg_dump -Fc` CSDL `nocoedu`;
   - tar volume storage;
   - gắn tag image đang chạy `nocoedu-app:rollback-20261119`.
2. **Build image mới** trong thư mục compose (app cũ vẫn chạy trong lúc build):
   `docker compose -p compose-synthesize-online-firewall-897jlk build app`
3. **Thay container**: `docker compose -p compose-synthesize-online-firewall-897jlk up -d app` (DB giữ nguyên).
4. **Theo dõi log** đến khi app healthy; xác nhận migration/seed chạy xong, không lỗi.
5. **Kiểm chứng**:
   - `__nocobase_migrations` có 4 migration mới (+ migration plugin nếu có);
   - `GET https://nocoedu.dsc.edu.vn/main/api/healthz` trả 200;
   - mở trình duyệt `https://nocoedu.dsc.edu.vn/main`, đăng nhập, xem menu mới (Sổ điểm danh, Kiến thức, Kiểm tra…).

## 4. Hoàn tác (nếu bước 3–5 lỗi)

1. `docker tag nocoedu-app:rollback-20261119 nocoedu-app:main && docker compose -p … up -d app`.
2. Nếu migration đã chạy dở/làm hỏng dữ liệu: dừng app, `pg_restore --clean -d nocoedu` từ bản dump bước 1, rồi mới chạy image cũ (code cũ không hiểu bảng mới nhưng bảng thừa không làm hỏng; chỉ restore khi dữ liệu cũ bị ảnh hưởng).

## 5. Kết quả (2026-11-19, ~07:28 giờ VN)

- Sao lưu: `/root/backups/nocoedu-20261119-0052/` — `nocoedu.dump` (595K, 77 bảng dữ liệu), `storage.tgz` (15M); image cũ tag `nocoedu-app:rollback-20261119`.
- Build `nocoedu-app:main` từ `main@c795b94` thành công (~15 phút trên VPS).
- Container mới healthy sau ~40 giây; log không có dòng lỗi (`level 50`).
- Migration đã chạy (batch 6): `@nocobase/app-plugin-users 202611110001_user_invitation_locale`, `202611180001_edu_diem_danh_hoc_vien_index`, `202611180002_create_edu_lop_nhom`, `202611180004_create_edu_kien_thuc`, `202611180005_create_edu_kiem_tra`.
- Dữ liệu giữ nguyên: 174 học viên, 8 lớp như trước.
- `GET /main/api/healthz` → 200; trang chủ và trang mới `/main/kiem-tra` hiển thị đúng, menu mới có Hồ sơ 360°, Chương trình, Tiến độ kiến thức, Kiểm tra.
- Chưa kiểm: đăng nhập bằng tài khoản QL cơ sở/HLV để soát quyền trên bản thật.
