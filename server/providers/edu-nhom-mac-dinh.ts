import { databaseManagerToken } from '@nocobase/db';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { ensureDefaultGroups } from '../edu/nhom.js';

/**
 * A class made through a Repository write (the class form, the record API) gets its three default groups in the same
 * transaction: the head coach starts from "Nhập môn", "Cơ bản" and "Nâng cao" instead of an empty list. Classes written
 * by `query` (the imports, the sample data) call `ensureDefaultGroups` themselves, and a class that still has no group
 * can be given them with `POST /lopNhom/taoMacDinh` (the class page offers it).
 */
export default class EduDefaultGroupsProvider extends ServiceProvider<AppPluginApplication> {
  readonly name = 'app.edu-nhom-mac-dinh';

  override boot(): Promise<void> {
    const database = this.app.container.resolve(databaseManagerToken);
    database.connection().onRepositoryMutation(
      { id: 'edu-nhom-mac-dinh', collections: ['eduLop'], keys: true },
      {
        inTransaction: async (event, connection) => {
          if (event.granularity !== 'rows') return;
          for (const change of event.changes) {
            if (change.collection !== 'eduLop' || change.kind !== 'created')
              continue;
            const lopId = Number(change.key.id);
            if (Number.isInteger(lopId) && lopId > 0)
              await ensureDefaultGroups(connection.query, lopId);
          }
        },
      },
    );
    return Promise.resolve();
  }
}
