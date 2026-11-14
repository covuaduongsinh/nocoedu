import { describe, expect, it } from 'vitest';
import { resolveAppRuntime } from '@nocobase/app-client/runtime';
import { defineAppRuntime } from '@nocobase/app-client/runtime';
import appRuntime from '../../client/runtime.js';
import { createApplicationRoutes } from '../../client/routes.js';
import cliPlugins from '../../cli/plugins.js';
import serverPlugins from '../../server/plugins.js';
import {
  buildRouteNavigation,
  buildSettingsCatalog,
} from '../../client/routing/route-navigation.js';

/** The sidebar of a signed-in person with every NocoEdu page granted. */
const eduMenu = [
  'home',
  'edu-coSo',
  'edu-lop',
  'edu-hocVien',
  'edu-phuHuynh',
  'edu-diemDanh',
  'edu-hocPhi',
  'edu-nhanXet',
  'edu-baoCao',
  'edu-sach',
];

describe('default Foundation integration', () => {
  it('registers the Foundation deployment evidence build hook', () => {
    expect(
      cliPlugins.plugins.filter(
        (plugin) => plugin.packageName === '@nocobase/app-plugin-foundation',
      ),
    ).toHaveLength(1);
  });
  it('exposes Foundation in System settings for an unrestricted administrator and removes the entry when denied', async () => {
    const runtime = await resolveAppRuntime(appRuntime);
    const menu = buildRouteNavigation(runtime.routes, new Set());
    // One System settings entry; Foundation is a card on its home, not a sidebar entry of its own.
    expect(menu.map(({ route }) => route.name)).toEqual([
      ...eduMenu,
      'settingsHome',
    ]);
    const category = buildSettingsCatalog(runtime.routes, new Set()).find(
      ({ route }) => route.name === 'settingsSystem',
    );
    const page = category?.modules.find(
      ({ route }) => route.name === 'foundation',
    )?.route;
    expect(page).toMatchObject({
      path: '/foundation',
      auth: 'required',
      authz: 'unrestricted',
    });
    if (!page) throw new Error('Foundation route missing');
    const denied = new Set([`${page.packageName}:${page.path}:${page.id}`]);
    expect(
      buildRouteNavigation(runtime.routes, denied).map(
        ({ route }) => route.name,
      ),
    ).toEqual([...eduMenu, 'settingsHome']);
    // Without Foundation the System settings still list Users and Permission management.
    expect(
      buildSettingsCatalog(runtime.routes, denied).map(
        (category) => category.route.name,
      ),
    ).toEqual(['settingsAccount']);
    expect(
      serverPlugins.plugins.filter(
        (plugin) => plugin.packageName === '@nocobase/app-plugin-foundation',
      ),
    ).toHaveLength(1);
  });

  it('keeps Foundation beside business settings without changing its protected URL', async () => {
    const runtime = await resolveAppRuntime(
      defineAppRuntime({
        ...appRuntime,
        routes: () => [...createApplicationRoutes()],
      }),
    );
    const menu = buildRouteNavigation(runtime.routes, new Set());
    expect(menu.some(({ route }) => route.name === 'foundationSettings')).toBe(
      false,
    );
    expect(
      buildSettingsCatalog(runtime.routes, new Set()).map((category) => [
        category.route.name,
        category.modules.map(({ route, target }) => [route.name, target.path]),
      ]),
    ).toEqual([
      [
        'settingsAccount',
        [
          ['settingsUsers', '/settings/users'],
          ['permissionManagement', '/settings/roles'],
        ],
      ],
      ['settingsSystem', [['foundation', '/foundation']]],
    ]);
  });
});
