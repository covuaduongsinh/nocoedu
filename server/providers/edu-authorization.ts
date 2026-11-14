import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';

import {
  COLLECTIONS,
  baoCao,
  buoiHoc,
  coSo,
  coSoQuanLy,
  diemDanh,
  dongY,
  ext,
  goiHoc,
  hocVien,
  lienKet,
  lop,
  lopLich,
  nhanXet,
  phatSach,
  phuHuynh,
  sach,
  sachHoc,
  hoSoGv,
  tuyenSinh,
  soDu,
  thanhToan,
} from '../edu/permissions.js';
import { registerEduRecordAccess } from '../edu/record-access.js';

/**
 * Registers what NocoEdu can authorize: its collections, composite business actions and record scopes. Registration
 * grants nothing; the permission sets in `database/main/seeds` decide who holds which action.
 */
export default class EduAuthorizationProvider extends ServiceProvider<AppPluginApplication> {
  readonly name = 'app.edu-authorization';

  override boot(): Promise<void> {
    // Without the authorization plugin (a runtime composed without it) there is nothing to register with.
    if (!this.app.container.has(authorizationToken)) return Promise.resolve();
    const authz: AppAuthorization =
      this.app.container.resolve(authorizationToken);
    const database = this.app.container.resolve(databaseManagerToken);

    for (const { name, title } of Object.values(COLLECTIONS)) {
      authz.database.collections.add({ name, title });
    }
    registerEduRecordAccess(authz, database);

    authz.ui.sections.add({
      name: 'edu',
      title: 'NocoEdu',
      parent: 'business',
    });
    // One call per resource: each has its own action names, so they do not share a type to loop over.
    const section = { section: 'edu' };
    authz.ui.place(authz.compositeResources.define(coSo), section);
    authz.ui.place(authz.compositeResources.define(coSoQuanLy), section);
    authz.ui.place(authz.compositeResources.define(lop), section);
    authz.ui.place(authz.compositeResources.define(lopLich), section);
    authz.ui.place(authz.compositeResources.define(hocVien), section);
    authz.ui.place(authz.compositeResources.define(phuHuynh), section);
    authz.ui.place(authz.compositeResources.define(lienKet), section);
    authz.ui.place(authz.compositeResources.define(dongY), section);
    authz.ui.place(authz.compositeResources.define(buoiHoc), section);
    authz.ui.place(authz.compositeResources.define(diemDanh), section);
    authz.ui.place(authz.compositeResources.define(goiHoc), section);
    authz.ui.place(authz.compositeResources.define(thanhToan), section);
    authz.ui.place(authz.compositeResources.define(soDu), section);
    authz.ui.place(authz.compositeResources.define(nhanXet), section);
    authz.ui.place(authz.compositeResources.define(baoCao), section);
    authz.ui.place(authz.compositeResources.define(sach), section);
    authz.ui.place(authz.compositeResources.define(phatSach), section);
    authz.ui.place(authz.compositeResources.define(tuyenSinh), section);
    authz.ui.place(authz.compositeResources.define(hoSoGv), section);
    authz.ui.place(authz.compositeResources.define(sachHoc), section);
    authz.ui.place(authz.compositeResources.define(ext), section);
    return Promise.resolve();
  }
}
