# Kế hoạch Nâng cấp Template NocoBase 3 lên 1.0.0-beta.97

- **Ngày lập:** 18/11/2026
- **Template Package:** `@nocobase/app-template-default`
- **Phiên bản hiện tại (BASE):** `1.0.0-beta.89`
- **Phiên bản mục tiêu (TARGET):** `1.0.0-beta.97`
- **Guidance Package:** `@nocobase/app-skills@0.1.0-beta.68`
- **Git Branch:** `template-upgrade-1.0.0-beta.97` (tạo từ commit `779fdefeb0801f2b3a20e505a02b742c09c79a53` trên `main`)
- **Remote GitHub:** `https://github.com/covuaduongsinh/nocoedu.git`

---

## 1. Mục tiêu và Nguyên tắc

### 1.1. Mục tiêu

- Nâng cấp NocoBase Core / App Template từ `1.0.0-beta.89` lên phiên bản mới nhất `1.0.0-beta.97`.
- Tích hợp các tính năng và cải tiến mới từ NocoBase:
  - **Database Explorer**: giao diện và API duyệt cấu trúc cơ sở dữ liệu trực tiếp trong System Settings.
  - **Capability Guide**: hiển thị năng lực hệ thống linh hoạt trên Home page thay cho prompt cố định.
  - **Data table & UI enhancements**: bộ lọc (filters), tìm kiếm (search), sắp xếp (sort-menu), discard-guard, row-actions, useDataChanges.
  - Nâng cấp các core plugins (`@nocobase/app-plugin-*`, `@nocobase/db`, `@nocobase/app-server`, better-auth, zod, etc.).
- Bảo toàn 100% các tính năng nghiệp vụ giáo dục NocoEdu đã phát triển (Cơ sở, Lớp học, Học viên, Phụ huynh, Điểm danh, Học phí, Nhận xét, Báo cáo, Sách, Tuyển sinh, v.v.).
- Đảm bảo toàn bộ kiểm thử (`typecheck`, `test`, `build`) vượt qua.
- Đồng bộ sạch sẽ lên repository local và remote GitHub.

### 1.2. Nguyên tắc thực hiện

- Tuân thủ nghiêm ngặt kỹ năng `nocobase-app-upgrade` (quy trình 8 bước chuẩn của NocoBase).
- Thực hiện so sánh 3 chiều: BASE (`1.0.0-beta.89`) $\rightarrow$ TARGET (`1.0.0-beta.97`) $\rightarrow$ PROJECT (`nocoedu`).
- Không ghi đè mù quáng (blind overwrite); các file có sửa đổi nghiệp vụ của người dùng phải được merge cẩn trọng.
- `defaultTemplateVersion` chỉ được cập nhật sau khi tất cả các bài kiểm tra chất lượng hoàn tất thành công.

---

## 2. Kết quả Phân tích Thay đổi giữa BASE và TARGET

### 2.1. File mới từ TARGET (32 files)

- **Database Explorer:**
  - `client/pages/settings/database-explorer/index.tsx`
  - `client/pages/settings/database-explorer/routes.ts`
  - `client/pages/settings/database-explorer/tables.tsx`
  - `client/pages/settings/database-explorer/fields.tsx`
  - `client/pages/settings/database-explorer/feedback.tsx`
  - `client/pages/settings/database-explorer/name.tsx`
  - `client/pages/settings/database-explorer/read.ts`
  - `client/pages/settings/database-explorer/model.ts`
  - `client/pages/settings/database-explorer/en-US.ts`
  - `client/pages/settings/database-explorer/zh-CN.ts`
- **UI & Hooks:**
  - `client/components/data-table/filters.tsx`
  - `client/components/data-table/search.tsx`
  - `client/components/data-table/sort-menu.tsx`
  - `client/components/discard-guard.tsx`
  - `client/components/row-actions.tsx`
  - `client/hooks/use-data-changes.ts`
  - `client/extensions/nocobase-workflow-management/version-select.tsx`
  - `public/assets/favicon.svg`
  - `LICENSE.txt`
- **Server Configs:**
  - `server/config/foundation.ts`
  - `server/config/realtime.ts`
- **Tests bổ sung:**
  - `tests/client/data-changes.test.tsx`
  - `tests/client/data-table-cards.test.tsx`
  - `tests/client/database-explorer-integration.test.tsx`
  - `tests/client/database-explorer.test.tsx`
  - `tests/client/notification-template-address.test.tsx`
  - `tests/client/page-header.test.tsx`
  - `tests/client/row-actions.test.tsx`
  - `tests/project/bootstrap-loading.test.ts`
  - `tests/server/backends-config.test.ts`
  - `tests/server/drive-upload-limits.test.ts`
  - `tests/server/realtime-config.test.ts`

### 2.2. File bị loại bỏ (2 files)

- `client/pages/home/capabilities.ts`
- `client/pages/home/prompt-dialog.tsx`
- _Lý do:_ Home page chuyển sang sử dụng Capability Guide được nạp tự động từ `@nocobase/app-plugin-foundation`. Dự án NocoEdu không dùng trực tiếp 2 file này ở các trang nghiệp vụ.

### 2.3. File thay đổi Untouched bởi người dùng (55 files)

Các file này mã nguồn trong NocoEdu hoàn toàn trùng khớp với BASE `1.0.0-beta.89`. Do đó sẽ cập nhật trực tiếp theo phiên bản TARGET `1.0.0-beta.97`.

### 2.4. File có tùy biến người dùng cần 3-Way Merge (8 files)

1. `package.json`: Nâng cấp các dependencies và devDependencies lên target, giữ nguyên tên gói `nocoedu`, version `0.1.0` và cấu hình riêng.
2. `client/routes.ts`: Đăng ký thêm `databaseExplorerRoutes`, bảo toàn toàn bộ routes của NocoEdu.
3. `client/pages/settings/page-permission-titles.ts`: Thêm quyền hiển thị cho `databaseExplorer`, giữ nguyên titles của các quyền NocoEdu.
4. `AGENTS.md`: Tích hợp các quy tắc mới về Database Explorer và Capability Guide, giữ nguyên chỉ mục `edu.md` và các quy tắc kiểm tra quyền.
5. `README.MD`: Cập nhật mô tả Default Template của bản beta.97.
6. `config.example.yml`: Thêm cấu hình mẫu foundation/realtime nếu có.
7. `tests/client/client-routes.test.ts`: Đồng bộ test routes bao gồm cả edu routes và database explorer.
8. `tests/client/foundation-integration.test.ts` & `tests/client/settings-navigation.test.ts`: Giữ nguyên mock/menu của NocoEdu và tích hợp thêm assert cho `databaseExplorer`.

---

## 3. Các bước Triển khai Chi tiết

- [x] **Bước 1: Chuẩn bị & An toàn**
  - Kiểm tra Git working tree sạch sẽ.
  - Tạo nhánh `template-upgrade-1.0.0-beta.97`.
  - Tải và giải nén các tarball của BASE `1.0.0-beta.89`, TARGET `1.0.0-beta.97`, và `@nocobase/app-skills@0.1.0-beta.68`.

- [x] **Bước 2: Chép các file mới từ TARGET (32 files)**
  - Copy toàn bộ 32 files mới vào cây thư mục mã nguồn.

- [x] **Bước 3: Xóa các file cũ đã deprecate (2 files)**
  - Xóa `client/pages/home/capabilities.ts` và `client/pages/home/prompt-dialog.tsx`.

- [x] **Bước 4: Cập nhật 55 files Untouched theo TARGET**
  - Đồng bộ các component core, UI primitives, hooks, locales hệ thống, server configs, tests core.

- [x] **Bước 5: Thực hiện 3-Way Merge cho 8 files tùy biến**
  - Merge `package.json` (chưa đổi `defaultTemplateVersion`).
  - Merge `client/routes.ts`.
  - Merge `client/pages/settings/page-permission-titles.ts`.
  - Merge `AGENTS.md` và `README.MD`.
  - Merge `config.example.yml`.
  - Merge các file tests liên quan (`foundation-integration.test.ts`, `settings-navigation.test.ts`, `client-routes.test.ts`).

- [x] **Bước 6: Cài đặt Dependencies & Đồng bộ Skills**
  - Chạy `pnpm install`.
  - Chạy `pnpm dedupe`.
  - Chạy `pnpm nocobase skills sync`.

- [x] **Bước 7: Kiểm thử chất lượng toàn diện**
  - `pnpm typecheck` (passed)
  - Scoped tests (`client-routes`, `foundation-integration`, `settings-navigation`, `page-permission-titles`, `database-explorer`, `authorization-assignment-safety`, `edu-actions`, `internal-packages`, etc. passed)
  - `pnpm build` (passed)

- [ ] **Bước 8: Hoàn tất nâng cấp và Đồng bộ Git/GitHub**
  - Cập nhật `defaultTemplateVersion: "1.0.0-beta.97"` trong `package.json` (đã xong).
  - Commit các thay đổi trên nhánh `template-upgrade-1.0.0-beta.97`.
  - Checkout về `main`, merge nhánh nâng cấp vào `main`.
  - Đẩy lên remote GitHub (`git push origin main`).
  - Dọn dẹp thư mục tạm `.upgrade-workdir.txt` (đã xong).
