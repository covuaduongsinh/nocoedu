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
import DiemDanhPage from '../../client/pages/edu/diem-danh.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

let permissions: AuthorizationSnapshot;
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'buoiHoc/findMany')
    return {
      data: [
        {
          id: 5,
          lopId: 1,
          ngay: '2026-11-09',
          gioBatDau: '17:30',
          gioKetThuc: '19:00',
          trangThai: 'du_kien',
        },
      ],
    };
  if (path === 'lop/findMany')
    return { data: [{ id: 1, ma: 'L1', ten: 'Lớp Mẫu 1', coSoId: 1 }] };
  if (path === 'hocVien/findMany')
    return {
      data: [
        {
          id: 7,
          hoTen: 'Học viên Mẫu 01',
          lopId: 1,
          trangThai: 'dang_hoc',
          soBuoiConLai: 3,
        },
      ],
    };
  if (path === 'diemDanh/findMany') return { data: [] };
  if (path === 'diemDanh/luu')
    return {
      data: {
        danhSach: [{ hocVienId: 7, soBuoiConLai: 2, canhBao: true }],
      },
    };
  if (path === 'baoCao/xem')
    return {
      data: {
        columns: [{ key: 'lop' }, { key: 'soHocVien' }],
        rows: [{ lop: 'Lớp Mẫu 1', soHocVien: 4 }],
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

describe('attendance and report pages', () => {
  beforeEach(() => {
    api.mockClear();
    permissions = { unrestricted: false, permissions: [] };
  });

  it('shows no save button without the attendance action', async () => {
    await render(<DiemDanhPage />, '/diem-danh?buoi=5', '/diem-danh');
    expect(await screen.findByText('Học viên Mẫu 01')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Lưu điểm danh' }),
    ).not.toBeInTheDocument();
  });

  it('saves the register through the business route and warns when few sessions are left', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.diemDanh' },
          actions: ['record'],
        },
      ],
    };
    await render(<DiemDanhPage />, '/diem-danh?buoi=5', '/diem-danh');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Lưu điểm danh' }),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: 'diemDanh/luu',
          json: {
            buoiHocId: 5,
            danhSach: [
              {
                hocVienId: 7,
                trangThai: 'co_mat',
                daLamBtvn: false,
                nhanXet: null,
              },
            ],
          },
        }),
      ),
    );
    expect(await screen.findByText('Sắp hết: còn 2 buổi')).toBeInTheDocument();
  });

  it('shows a report with Vietnamese column names', async () => {
    await render(<BaoCaoPage />, '/bao-cao', '/bao-cao');
    expect(await screen.findByText('Lớp Mẫu 1')).toBeInTheDocument();
    expect(screen.getByText('Sĩ số')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải CSV' })).toBeInTheDocument();
  });
});
