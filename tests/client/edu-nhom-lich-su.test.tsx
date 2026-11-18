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
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HocVienChiTietPage from '../../client/pages/edu/hoc-vien-chi-tiet/index.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

/** The move history of a student on the overview of his file (action `history` of `edu.lopNhom`). */
let permissions: AuthorizationSnapshot;
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'hocVien/findOne')
    return {
      data: {
        id: 7,
        ma: 'HS00007',
        hoTen: 'Học viên Mẫu 07',
        levelKey: 'tot',
        lopId: 3,
        nhomId: 11,
        coSoId: 1,
        trangThai: 'dang_hoc',
        soBuoiConLai: 4,
      },
    };
  if (path === 'lopNhom/findMany')
    return {
      data: [
        { id: 11, lopId: 3, ten: 'Nhập môn', thuTu: 1, trangThai: 'hoat_dong' },
        { id: 12, lopId: 3, ten: 'Cơ bản', thuTu: 2, trangThai: 'hoat_dong' },
      ],
    };
  if (path === 'chuyenNhom/findMany')
    return {
      data: [
        {
          id: 3,
          hocVienId: 7,
          tuNhomId: 12,
          denNhomId: null,
          ngay: '2026-11-10',
          ghiChu: 'chuyen_lop',
        },
        {
          id: 2,
          hocVienId: 7,
          tuNhomId: 11,
          denNhomId: 12,
          ngay: '2026-11-06',
          ghiChu: 'Lên nhóm cao hơn',
        },
        {
          id: 1,
          hocVienId: 7,
          tuNhomId: null,
          denNhomId: 11,
          ngay: '2026-11-03',
          ghiChu: null,
        },
      ],
    };
  if (path === 'chuyenNhom/count') return { data: 3 };
  return new Response(null, { status: 404 });
});

const callsTo = (path: string) =>
  api.mock.calls.map(([call]) => call).filter((call) => call.path === path);

async function render() {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/hoc-vien/:id' element={<HocVienChiTietPage />} />
      </Routes>
    </AuthenticationProvider>,
    {
      route: '/hoc-vien/7',
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

describe('group history on the student file', () => {
  beforeEach(() => {
    api.mockClear();
    permissions = { unrestricted: true, permissions: [] };
  });

  it('lists the moves newest first with the group names, the class change and the coach note', async () => {
    await render();
    expect(await screen.findByText('Lịch sử chuyển nhóm')).toBeInTheDocument();
    expect(await screen.findByText('Đổi lớp')).toBeInTheDocument();
    expect(screen.getByText('Lên nhóm cao hơn')).toBeInTheDocument();
    const rows = (await screen.findAllByRole('row')).map(
      (row) => row.textContent ?? '',
    );
    const first = rows.findIndex((row) => row.includes('Đổi lớp'));
    const last = rows.findIndex((row) => row.includes('Lên nhóm cao hơn'));
    // Newest first: the class change comes before the earlier move with the coach's note.
    expect(first).toBeGreaterThan(-1);
    expect(last).toBeGreaterThan(first);
    // Read page by page for this student only, newest first.
    expect(JSON.stringify(callsTo('chuyenNhom/findMany')[0]?.json)).toContain(
      '"hocVienId"',
    );
    expect(callsTo('chuyenNhom/findMany')[0]?.json).toMatchObject({
      limit: 25,
      offset: 0,
    });
  });

  it('shows no history to a person who may only view the groups', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.lopNhom' },
          actions: ['view'],
        },
      ],
    };
    await render();
    await screen.findByRole('heading', { name: 'Học viên Mẫu 07' });
    await waitFor(() =>
      expect(screen.queryByText('Lịch sử chuyển nhóm')).not.toBeInTheDocument(),
    );
  });
});
