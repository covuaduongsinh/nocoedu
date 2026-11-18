import { Database } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

/**
 * NocoEdu's administration pages in the System settings shell (`shell-routes.ts`): not a sidebar entry of their own,
 * but a card on the System category of the settings home, shown only to a person who holds the page grant. The backup
 * and restore of the whole database used to be a sidebar item (`/sao-luu`); it moved here because an administration page
 * does not belong in the working menu (AGENTS.md, "System settings"). The server decides who may use it
 * (`edu.heThong` `backup`/`restore`, administrator only); the page grant `edu.heThong` only hides the card from everybody
 * else.
 */
const eduSettingsRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    parent: 'settingsSystem',
    name: 'edu-sao-luu',
    path: '/sao-luu',
    auth: 'required',
    authz: { resource: { type: 'page', id: 'edu.heThong' }, action: 'access' },
    navigation: {
      title: 'edu.nav.saoLuu',
      description: 'edu.duLieu.description',
      icon: Database,
    },
    breadcrumb: { title: 'edu.nav.saoLuu' },
    componentLoader: () => import('../edu/sao-luu.js'),
  },
]);

export default eduSettingsRoutes;
