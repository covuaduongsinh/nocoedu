import { createAppClientConfig } from '@nocobase/app-client';
import { readAppClientRuntimeConfig } from '@nocobase/app-client/runtime';
import { includeNotificationTemplateRoutes } from './pages/settings/notification-routes.js';
import {
  BarChart3,
  Building2,
  CalendarCheck,
  Contact,
  GraduationCap,
  Home,
  MessageSquareText,
  Users,
  Wallet,
} from 'lucide-react';
import systemSettingsRoutes from './pages/settings/routes.js';
import settingsShellRoutes from './pages/settings/shell-routes.js';
import {
  defineAppRoutes,
  type AppClientRouteComponentLoader,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

/**
 * A NocoEdu page. `authz` names the page grant (`server/edu/pages.ts`); what a person may do on it is decided by the
 * business actions of the server, so a page grant alone opens no data.
 */
function eduPage(
  id:
    | 'coSo'
    | 'lop'
    | 'hocVien'
    | 'phuHuynh'
    | 'diemDanh'
    | 'hocPhi'
    | 'nhanXet'
    | 'baoCao',
  path: string,
  icon: typeof Home,
  order: number,
  componentLoader: AppClientRouteComponentLoader,
) {
  return [
    {
      auth: 'required' as const,
      authz: {
        resource: { type: 'page' as const, id: `edu.${id}` },
        action: 'access',
      },
      componentLoader,
      name: `edu-${id}`,
      navigation: { title: `edu.nav.${id}`, icon, order },
      path,
    },
  ];
}

function eduDetailPage(
  id: 'lop' | 'hocVien',
  path: string,
  componentLoader: AppClientRouteComponentLoader,
) {
  return [
    {
      auth: 'required' as const,
      authz: {
        resource: { type: 'page' as const, id: `edu.${id}` },
        action: 'access',
      },
      breadcrumb: { title: `edu.${id}.detail` },
      componentLoader,
      name: `edu-${id}-chi-tiet`,
      path,
    },
  ];
}

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/edu/home.js'),
    name: 'home',
    navigation: { title: 'edu.nav.home', icon: Home, order: 0 },
    path: '/',
  },
  ...eduPage(
    'coSo',
    '/co-so',
    Building2,
    1,
    () => import('./pages/edu/co-so.js'),
  ),
  ...eduPage(
    'lop',
    '/lop',
    GraduationCap,
    2,
    () => import('./pages/edu/lop.js'),
  ),
  ...eduPage(
    'hocVien',
    '/hoc-vien',
    Users,
    3,
    () => import('./pages/edu/hoc-vien.js'),
  ),
  // Detail pages share the grant of their list (`edu.lop`, `edu.hocVien`): what a person sees is decided by the record
  // APIs, so these open no data the list does not. They carry no navigation; the shell trail comes from the page.
  ...eduDetailPage(
    'lop',
    '/lop/:id',
    () => import('./pages/edu/lop-chi-tiet.js'),
  ),
  ...eduDetailPage(
    'hocVien',
    '/hoc-vien/:id',
    () => import('./pages/edu/hoc-vien-chi-tiet.js'),
  ),
  ...eduPage(
    'phuHuynh',
    '/phu-huynh',
    Contact,
    4,
    () => import('./pages/edu/phu-huynh.js'),
  ),
  ...eduPage(
    'diemDanh',
    '/diem-danh',
    CalendarCheck,
    5,
    () => import('./pages/edu/diem-danh.js'),
  ),
  ...eduPage(
    'hocPhi',
    '/hoc-phi',
    Wallet,
    6,
    () => import('./pages/edu/hoc-phi.js'),
  ),
  ...eduPage(
    'nhanXet',
    '/nhan-xet',
    MessageSquareText,
    7,
    () => import('./pages/edu/nhan-xet.js'),
  ),
  ...eduPage(
    'baoCao',
    '/bao-cao',
    BarChart3,
    8,
    () => import('./pages/edu/bao-cao.js'),
  ),
  {
    // Declares no navigation, so the application decides where its entry goes (for example a sidebar item with an
    // unread badge). The plugin's API answers each person's own messages only, so the page needs no authorization of
    // its own.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/inbox.js'),
    name: 'inbox',
    path: '/inbox',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/login.js'),
    name: 'login',
    path: '/login',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/register.js'),
    name: 'register',
    path: '/register',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/forgot-password.js'),
    name: 'forgot-password',
    path: '/forgot-password',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/reset-password.js'),
    name: 'reset-password',
    path: '/reset-password',
  },
  {
    // Where a command line's sign-in sends the person to approve it (`pages/auth/device.tsx`). Optional rather than
    // required so it renders outside the shell, like the sign-in pages; the page sends a guest to sign in and back.
    auth: 'optional',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/device.js'),
    name: 'device',
    path: '/device',
  },
]);

// The System settings shell stays registered: it shows only the modules a viewer may open, and none until the
// application or its plugins contribute one. Business administration such as `./pages/settings/routes.js` joins it.
export function createApplicationRoutes(
  rawConfig: unknown = readAppClientRuntimeConfig(),
): readonly AppClientRouteContribution[] {
  const config = createAppClientConfig({ rawConfig });
  return includeNotificationTemplateRoutes(
    [appRoutes, settingsShellRoutes, systemSettingsRoutes],
    config.get<boolean>('notificationTemplates.invitationConfigured') === true,
  );
}

const routes: readonly AppClientRouteContribution[] = createApplicationRoutes();

export default routes;
