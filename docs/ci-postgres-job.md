# Job PostgreSQL cho CI (cần người có quyền `workflows` thêm vào `.github/workflows/ds-check.yml`)

Runner không có quyền `workflows` nên không đẩy được file workflow. Thêm job sau vào `jobs:`:

```yaml
postgres:
  runs-on: ubuntu-latest
  timeout-minutes: 30
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_USER: nocoedu
        POSTGRES_PASSWORD: nocoedu-ci-only
        POSTGRES_DB: postgres
      ports:
        - 5432:5432
      options: >-
        --health-cmd "pg_isready -U nocoedu" --health-interval 5s --health-timeout 5s --health-retries 10
  env:
    NOCOBASE_TEST_DB_DIALECT: postgres
    POSTGRES_HOST: localhost
    POSTGRES_PORT: '5432'
    POSTGRES_USER: nocoedu
    POSTGRES_PASSWORD: nocoedu-ci-only
    POSTGRES_DATABASE: postgres
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 24
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - name: Migrations and record scope on PostgreSQL
      run: pnpm exec vitest run tests/database/edu-migrations.test.ts tests/server/edu-scope.test.ts tests/server/edu-scope-writes.test.ts tests/server/edu-actions.test.ts
```
