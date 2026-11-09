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
import { screen, waitFor, within } from '@testing-library/react';
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
  if (path === 'hocVien/findMany')
    return {
      data: [
        {
          id: 1,
          ma: 'HS00001',
          hoTen: 'Học viên Mẫu 01',
          namSinh: 2016,
          levelKey: 'tot',
          levelOrder: 1,
          lopId: 1,
          coSoId: 1,
          trangThai: 'dang_hoc',
        },
      ],
    };
  if (path === 'lop/findMany')
    return { data: [{ id: 1, ma: 'L1', ten: 'Lớp Mẫu 1', coSoId: 1 }] };
  if (path === 'coSo/findMany')
    return { data: [{ id: 1, ma: 'CS1', ten: 'Cơ sở Mẫu 1' }] };
  if (path === 'hocVien/lenCap') return { data: { id: 9 } };
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

describe('students page', () => {
  beforeEach(() => {
    api.mockClear();
    permissions = { unrestricted: false, permissions: [] };
  });

  it('lists students in Vietnamese and offers no write action without a grant', async () => {
    await render();
    expect(await screen.findByText('Học viên Mẫu 01')).toBeInTheDocument();
    expect(screen.getByText('Tốt')).toBeInTheDocument();
    expect(screen.getByText('Lớp Mẫu 1')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Thêm học viên' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Lên cấp' }),
    ).not.toBeInTheDocument();
  });

  it('confirms a level-up through the business route when the person holds the action', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.hocVien' },
          actions: ['levelUp'],
        },
      ],
    };
    await render();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Lên cấp' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: 'hocVien/lenCap',
          json: { hocVienId: 1, denLevelKey: 'ma' },
        }),
      ),
    );
  });
});
