import { apiClientToken } from '@nocobase/app-client';
import {
  AuthenticationProvider,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import {
  AuthorizationClient,
  authorizationClientToken,
  type AuthorizationSnapshot,
} from '@nocobase/app-plugin-authorization/client';
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BaoCaoPage from '../../client/pages/edu/bao-cao.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

let permissions: AuthorizationSnapshot;
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path, json }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'baoCao/xem' && json?.loai === 'siSo')
    return {
      data: {
        columns: [{ key: 'coSo' }, { key: 'lop' }, { key: 'soHocVien' }],
        rows: [{ coSo: 'A', lop: 'Lớp Một', soHocVien: 12 }],
      },
    };
  if (path === 'baoCao/xem')
    return {
      data: {
        columns: [{ key: 'thang' }, { key: 'coSo' }, { key: 'doanhThu' }],
        rows: [
          { thang: '2026-04', coSo: 'Cơ sở A', doanhThu: 1000000 },
          { thang: '2026-04', coSo: 'Cơ sở B', doanhThu: 500000 },
          { thang: '2026-05', coSo: 'Cơ sở A', doanhThu: 2000000 },
        ],
      },
    };
  return new Response(null, { status: 404 });
});

async function render(
  element: React.ReactElement,
  route: string,
  path: string,
) {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </AuthenticationProvider>,
    {
      route,
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: viVN },
      fetch: answerApi(api),
      services: (app) => {
        app.container.instance(authenticationClientToken, { getSession });
        app.container.singleton(
          authorizationClientToken,
          (resolver) =>
            new AuthorizationClient(resolver.resolve(apiClientToken)),
        );
      },
    },
  );
}

describe('reports page', () => {
  beforeEach(() => {
    api.mockClear();
    permissions = { unrestricted: true, permissions: [] };
  });

  it('draws revenue by month with the branches of a month added up', async () => {
    await render(<BaoCaoPage />, '/bao-cao', '/bao-cao');
    await waitFor(() =>
      expect(
        api.mock.calls.some(([request]) => request.path === 'baoCao/xem'),
      ).toBe(true),
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'doanhThu');
    expect(
      await screen.findByRole('img', { name: '04: 2026-04 1.500.000' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '05: 2026-05 2.000.000' }),
    ).toBeInTheDocument();
  });

  it('draws the headcount of each class on the first report', async () => {
    await render(<BaoCaoPage />, '/bao-cao', '/bao-cao');
    expect(
      await screen.findByRole('img', { name: 'Lớp Một: 12' }),
    ).toBeInTheDocument();
  });
});
