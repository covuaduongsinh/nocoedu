import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import eduActions from './edu-actions.js';
import eduData from './edu-data.js';
import eduExt from './edu-ext.js';
import eduHocPhi from './edu-hoc-phi.js';

const routes: readonly AppRouteContribution<Application>[] = [
  ...eduData,
  ...eduActions,
  ...eduHocPhi,
  ...eduExt,
];

export default routes;
