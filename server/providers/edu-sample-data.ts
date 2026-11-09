import { userManagementServiceToken } from '@nocobase/app-plugin-users/server';
import { sampleDataToken } from '@nocobase/app-server/sample-data';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { randomBytes } from 'node:crypto';

import { seedSampleData } from '../edu/sample-data.js';

const ACCOUNTS = [
  {
    email: 'ql-mau@example.invalid',
    name: 'Quản lý Mẫu',
    role: 'edu_quan_ly_co_so',
  },
  { email: 'hlv-mau@example.invalid', name: 'HLV Mẫu', role: 'edu_hlv' },
  {
    email: 'ketoan-mau@example.invalid',
    name: 'Kế toán Mẫu',
    role: 'edu_ke_toan',
  },
] as const;

/**
 * Made-up sample data (2 branches, 3 classes, 10 students and parents) and one sample account per role. It is
 * registered on the framework's sample-data service, so it loads only when the database is installed with
 * `APP_SAMPLE_DATA=true` (or later in development with `pnpm nocobase db sample`) and never on a production database.
 *
 * The sample accounts have no password in the repository: they take `EDU_SAMPLE_PASSWORD` when it is set, otherwise
 * a random one nobody sees, and an administrator then sets a password in User management.
 */
export default class EduSampleDataProvider extends ServiceProvider<AppPluginApplication> {
  readonly name = 'app.edu-sample-data';

  override boot(): Promise<void> {
    const container = this.app.container;
    if (!container.has(sampleDataToken)) return Promise.resolve();
    container.resolve(sampleDataToken).register({
      name: 'edu/mau',
      packageName: 'nocoedu',
      run: async () => {
        const database = container.resolve(databaseManagerToken);
        const ids: Record<string, string> = {};
        if (container.has(userManagementServiceToken)) {
          const users = container.resolve(userManagementServiceToken);
          for (const account of ACCOUNTS) {
            const created = await users.create({
              name: account.name,
              email: account.email,
              password:
                process.env.EDU_SAMPLE_PASSWORD ??
                randomBytes(18).toString('base64url'),
              roleScopes: { app: [account.role] },
            });
            ids[account.role] = created.id;
          }
        }
        await seedSampleData(database, {
          managerId: ids.edu_quan_ly_co_so,
          coachId: ids.edu_hlv,
        });
      },
    });
    return Promise.resolve();
  }
}
