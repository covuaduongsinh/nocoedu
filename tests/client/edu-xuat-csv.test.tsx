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
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HocVienPage from '../../client/pages/edu/hoc-vien.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

let permissions: AuthorizationSnapshot;
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'hocVien/count') return { data: 0 };
  if (path === 'hocVien/findMany') return { data: [] };
  if (path === 'lop/findMany')
    return { data: [{ id: 1, ma: 'L1', ten: 'Lớp Mẫu 1', coSoId: 1 }] };
  if (path === 'coSo/findMany')
    return { data: [{ id: 1, ma: 'CS1', ten: 'Cơ sở Mẫu 1' }] };
  return new Response(null, { status: 404 });
});

async function render() {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/hoc-vien' element={<HocVienPage />} />
      </Routes>
    </AuthenticationProvider>,
    {
      route: '/hoc-vien',
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

describe('CSV export on the students page', () => {
  beforeEach(() => {
    api.mockClear();
    permissions = { unrestricted: false, permissions: [] };
  });

  it('offers the export only to a person who holds the export action', async () => {
    await render();
    await screen.findByText('Học viên');
    expect(
      screen.queryByRole('button', { name: 'Xuất CSV' }),
    ).not.toBeInTheDocument();
  });

  it('opens a dialog with the filters and the privacy note when the person may export', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.hocVien' },
          actions: ['export'],
        },
      ],
    };
    await render();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Xuất CSV' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Cơ sở')).toBeVisible();
    expect(within(dialog).getByLabelText('Lớp')).toBeVisible();
    expect(within(dialog).getByLabelText('Trạng thái')).toBeVisible();
    expect(
      within(dialog).getByText(/không có ngày sinh đầy đủ/u),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Tải xuống' }),
    ).toBeEnabled();
  });
});
