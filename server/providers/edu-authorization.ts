import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';

import { COLLECTIONS, RESOURCES } from '../edu/permissions.js';
import { registerEduRecordAccess } from '../edu/record-access.js';

/**
 * Registers what NocoEdu can authorize: its collections, composite business actions and record scopes. Registration
 * grants nothing; the permission sets in `database/main/seeds` decide who holds which action.
 */
export default class EduAuthorizationProvider extends ServiceProvider<AppPluginApplication> {
  readonly name = 'app.edu-authorization';

  override boot(): Promise<void> {
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
    for (const resource of RESOURCES) {
      authz.ui.place(authz.compositeResources.define(resource), {
        section: 'edu',
      });
    }
    return Promise.resolve();
  }
}
