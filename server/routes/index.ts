import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import eduActions from './edu-actions.js';
import eduData from './edu-data.js';
import eduExt from './edu-ext.js';

const routes: readonly AppRouteContribution<Application>[] = [
  ...eduData,
  ...eduActions,
  ...eduExt,
];

export default routes;
