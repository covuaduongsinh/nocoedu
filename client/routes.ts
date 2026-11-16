import { createAppClientConfig } from '@nocobase/app-client';
import { readAppClientRuntimeConfig } from '@nocobase/app-client/runtime';
import { includeNotificationTemplateRoutes } from './pages/settings/notification-routes.js';
import {
  BarChart3,
  BookMarked,
  BookOpen,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  Database,
  GraduationCap,
  Home,
  UserPlus,
  UserCog,
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
    | 'baoCao'
    | 'sach'
    | 'phatSach'
    | 'tuyenSinh'
    | 'hoSoGv',
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
  // --- NHÓM 1: VẬN HÀNH HÀNG NGÀY ----------------------------------------------------
  ...eduPage(
    'diemDanh',
    '/diem-danh',
    CalendarCheck,
    1,
    () => import('./pages/edu/diem-danh/index.js'),
  ),
  {
    // Its own page grant (`edu.doiSoat`, seed `202611160001_edu_doi_soat_sao_luu_grant`); what a person sees on the
    // page still follows their business actions, so a coach gets sessions and no tuition.
    auth: 'required' as const,
    authz: {
      resource: { type: 'page' as const, id: 'edu.doiSoat' },
      action: 'access',
    },
    componentLoader: () => import('./pages/edu/doi-soat.js'),
    name: 'edu-doi-soat',
    navigation: { title: 'edu.nav.doiSoat', icon: ClipboardCheck, order: 2 },
    path: '/doi-soat',
  },
  ...eduPage(
    'hocPhi',
    '/hoc-phi',
    Wallet,
    3,
    () => import('./pages/edu/hoc-phi/index.js'),
  ),
  ...eduPage(
    'nhanXet',
    '/nhan-xet',
    MessageSquareText,
    4,
    () => import('./pages/edu/nhan-xet.js'),
  ),
  ...eduPage(
    'tuyenSinh',
    '/tuyen-sinh',
    UserPlus,
    5,
    () => import('./pages/edu/tuyen-sinh.js'),
  ),
  ...eduPage(
    'hocVien',
    '/hoc-vien',
    Users,
    6,
    () => import('./pages/edu/hoc-vien.js'),
  ),
  ...eduPage(
    'baoCao',
    '/bao-cao',
    BarChart3,
    7,
    () => import('./pages/edu/bao-cao.js'),
  ),

  // --- NHÓM 2: DANH MỤC & DỮ LIỆU (ÍT THAY ĐỔI) ---------------------------------------
  ...eduPage(
    'lop',
    '/lop',
    GraduationCap,
    8,
    () => import('./pages/edu/lop.js'),
  ),
  ...eduPage(
    'coSo',
    '/co-so',
    Building2,
    9,
    () => import('./pages/edu/co-so.js'),
  ),
  ...eduPage(
    'hoSoGv',
    '/giao-vien',
    UserCog,
    10,
    () => import('./pages/edu/ho-so-gv.js'),
  ),
  ...eduPage(
    'sach',
    '/sach',
    BookOpen,
    11,
    () => import('./pages/edu/sach.js'),
  ),
  ...eduPage(
    'phatSach',
    '/phat-sach',
    BookMarked,
    12,
    () => import('./pages/edu/phat-sach.js'),
  ),
  {
    // Administrators only (`edu.saoLuu`): a backup is a copy of every student, parent and payment.
    auth: 'required' as const,
    authz: {
      resource: { type: 'page' as const, id: 'edu.saoLuu' },
      action: 'access',
    },
    componentLoader: () => import('./pages/edu/sao-luu.js'),
    name: 'edu-sao-luu',
    navigation: { title: 'edu.nav.saoLuu', icon: Database, order: 13 },
    path: '/sao-luu',
  },

  // Detail pages & secondary paths without sidebar navigation
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
  {
    // The receipt of one payment, printed from the browser. It shares the tuition page's grant; the payment itself
    // comes through the caller's payment policy, so a receipt outside the scope is "not found".
    auth: 'required' as const,
    authz: {
      resource: { type: 'page' as const, id: 'edu.hocPhi' },
      action: 'access',
    },
    breadcrumb: { title: 'edu.phieuThu.detail' },
    componentLoader: () => import('./pages/edu/hoc-phi/phieu-thu.js'),
    name: 'edu-hocPhi-phieu-thu',
    path: '/hoc-phi/phieu-thu/:id',
  },
  {
    auth: 'required' as const,
    authz: {
      resource: { type: 'page' as const, id: 'edu.phuHuynh' },
      action: 'access',
    },
    componentLoader: () => import('./pages/edu/phu-huynh.js'),
    name: 'edu-phuHuynh',
    path: '/phu-huynh',
  },
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
  // The directory of notification templates joins System settings as soon as the application sends something: an
  // invitation mailer is configured, or the daily tuition reminder has its in-app channel
  // (`server/providers/edu-nhac-hoc-phi.ts`).
  return includeNotificationTemplateRoutes(
    [appRoutes, settingsShellRoutes, systemSettingsRoutes],
    config.get<boolean>('notificationTemplates.invitationConfigured') ===
      true ||
      config.get<boolean>('notificationTemplates.tuitionReminder') === true,
  );
}

const routes: readonly AppClientRouteContribution[] = createApplicationRoutes();

export default routes;
