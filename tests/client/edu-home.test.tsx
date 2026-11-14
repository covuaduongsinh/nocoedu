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

import EduHome from '../../client/pages/edu/home.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

let permissions: AuthorizationSnapshot;
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'trangChu/tomTat')
    return { data: { homNay: [], chuaDiemDanh: [] } };
  if (path === 'soDu/canhBao') return { data: [] };
  if (path === 'hocVien/count' || path === 'lop/count') return { data: 3 };
  if (path === 'lienHe/findMany')
    return {
      data: [
        {
          id: 1,
          hoTen: 'Phụ huynh Đến Hạn',
          soDienThoai: '0900000001',
          trangThai: 'moi',
          ngayNhac: '2000-01-01',
        },
        {
          id: 2,
          hoTen: 'Phụ huynh Chưa Đến',
          soDienThoai: '0900000002',
          trangThai: 'moi',
          ngayNhac: '2999-01-01',
        },
        {
          id: 3,
          hoTen: 'Phụ huynh Đã Chốt',
          soDienThoai: '0900000003',
          trangThai: 'da_chot',
          ngayNhac: '2000-01-01',
        },
      ],
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

describe('home page', () => {
  beforeEach(() => {
    api.mockClear();
    permissions = { unrestricted: true, permissions: [] };
  });

  it('lists only the open admissions contacts whose call-back day has come', async () => {
    await render(<EduHome />, '/', '/');
    expect(await screen.findByText(/Phụ huynh Đến Hạn/u)).toBeInTheDocument();
    expect(screen.queryByText(/Phụ huynh Chưa Đến/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/Phụ huynh Đã Chốt/u)).not.toBeInTheDocument();
  });

  it('leaves the card out for a role without the admissions permission', async () => {
    permissions = { unrestricted: false, permissions: [] };
    await render(<EduHome />, '/', '/');
    await waitFor(() =>
      expect(
        api.mock.calls.some(([request]) => request.path === 'trangChu/tomTat'),
      ).toBe(true),
    );
    expect(
      api.mock.calls.some(([request]) => request.path === 'lienHe/findMany'),
    ).toBe(false);
  });
});
