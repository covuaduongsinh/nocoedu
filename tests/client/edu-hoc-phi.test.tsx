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

import HocPhiPage from '../../client/pages/edu/hoc-phi.js';
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
          id: 7,
          ma: 'HS7',
          hoTen: 'Học viên Mẫu 01',
          lopId: 1,
          trangThai: 'dang_hoc',
          soBuoiConLai: 3,
        },
        {
          id: 8,
          ma: 'HS8',
          hoTen: 'Học viên Mẫu 02',
          lopId: 1,
          trangThai: 'dang_hoc',
          soBuoiConLai: -2,
        },
      ],
    };
  if (path === 'lop/findMany')
    return { data: [{ id: 1, ma: 'L1', ten: 'Lớp Mẫu 01' }] };
  if (path === 'goiHoc/findMany') return { data: [] };
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

describe('tuition page', () => {
  beforeEach(() => {
    api.mockClear();
    permissions = { unrestricted: true, permissions: [] };
  });

  // The cashier looks a student up: the students are read once as a lookup (every page of 100, up to 2,000) and the
  // search box filters them on the client by name or code; nothing is listed until the person types.
  it('finds a student by name or code in the cashier search and shows nobody before that', async () => {
    await render(<HocPhiPage />, '/hoc-phi', '/hoc-phi');
    const search = await screen.findByPlaceholderText(/Nhập tên học sinh/u);
    await waitFor(() =>
      expect(
        api.mock.calls.some(([request]) => request.path === 'hocVien/findMany'),
      ).toBe(true),
    );
    const first = api.mock.calls.find(
      ([request]) => request.path === 'hocVien/findMany',
    )?.[0];
    expect(first?.json).toMatchObject({ limit: expect.any(Number), offset: 0 });
    expect(screen.queryByText('Học viên Mẫu 01')).not.toBeInTheDocument();

    await userEvent.type(search, 'mẫu 01');
    expect(await screen.findByText('Học viên Mẫu 01')).toBeInTheDocument();
    expect(screen.queryByText('Học viên Mẫu 02')).not.toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'hs8');
    expect(await screen.findByText('Học viên Mẫu 02')).toBeInTheDocument();
    expect(screen.queryByText('Học viên Mẫu 01')).not.toBeInTheDocument();
    expect(screen.getByText('Nợ 2 buổi')).toBeInTheDocument();
  });

  it('lists in "Cần thu" only the students with two sessions left or fewer', async () => {
    await render(<HocPhiPage />, '/hoc-phi', '/hoc-phi');
    const tab = await screen.findByRole('button', { name: /Cần Thu Học Phí/u });
    // One student (balance -2) is due; the one with 3 sessions left is not.
    await waitFor(() => expect(tab).toHaveTextContent('1'));
    await userEvent.click(tab);
    expect(await screen.findByText('Học viên Mẫu 02')).toBeInTheDocument();
    expect(screen.queryByText('Học viên Mẫu 01')).not.toBeInTheDocument();
  });

  it('offers the CSV export only to a person who holds the export action of the reports', async () => {
    permissions = { unrestricted: false, permissions: [] };
    await render(<HocPhiPage />, '/hoc-phi', '/hoc-phi');
    await screen.findByPlaceholderText(/Nhập tên học sinh/u);
    expect(
      screen.queryByRole('button', { name: /Xuất CSV/u }),
    ).not.toBeInTheDocument();
  });

  it('shows the CSV export when the person may export', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.baoCao' },
          actions: ['export'],
        },
      ],
    };
    await render(<HocPhiPage />, '/hoc-phi', '/hoc-phi');
    expect(
      await screen.findByRole('button', { name: /Xuất CSV/u }),
    ).toBeInTheDocument();
  });
});
