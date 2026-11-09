import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';

import * as rules from '../edu/lark/chua-xac-nhan.js';
import * as normalize from '../edu/lark/chuan-hoa.js';
import * as attendance from '../edu/lark/diem-danh.js';
import * as balance from '../edu/lark/so-du.js';

/** The rules that turn Lark values into NocoEdu values, gathered so the import (phase 3) resolves one service. */
export interface EduLarkMapping {
  readonly rules: typeof rules;
  readonly normalize: typeof normalize;
  readonly attendance: typeof attendance;
  readonly balance: typeof balance;
}

export const eduLarkMappingToken = createServiceToken<EduLarkMapping>(
  'app.edu-lark-mapping',
);

/** Pure mapping rules only: no route, no database access, no call to Lark. */
export default class EduLarkMappingProvider extends ServiceProvider<AppPluginApplication> {
  readonly name = 'app.edu-lark-mapping';

  override register(): void {
    this.app.container.singleton(eduLarkMappingToken, () => ({
      rules,
      normalize,
      attendance,
      balance,
    }));
  }
}
