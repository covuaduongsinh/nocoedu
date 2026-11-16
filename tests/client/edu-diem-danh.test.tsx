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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BaoCaoPage from '../../client/pages/edu/bao-cao.js';
import DiemDanhPage from '../../client/pages/edu/diem-danh/index.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

let permissions: AuthorizationSnapshot;
/** What `/buoiHoc/noiDung/xem` answers: a response, or a refusal. */
let storedContent: unknown;
let sessionStatus: string;
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
          trangThai: sessionStatus,
        },
      ],
    };
  if (path === 'buoiHoc/noiDung/xem') return storedContent as object;
  if (path === 'buoiHoc/noiDung/luu') return { data: { buoiHocId: 5 } };
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
  const width = window.innerWidth;
  beforeEach(() => {
    api.mockClear();
    permissions = { unrestricted: false, permissions: [] };
    storedContent = { data: { noiDung: {}, yThuc: [] } };
    sessionStatus = 'du_kien';
    // jsdom has no `matchMedia`; the register reads the width to choose cards (a phone) or a table.
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.innerWidth = width;
  });

  const recorder = (): void => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.diemDanh' },
          actions: ['record'],
        },
      ],
    };
  };

  it('is a table on a wide screen', async () => {
    recorder();
    await render(<DiemDanhPage />, '/diem-danh?buoi=5', '/diem-danh');
    await screen.findByText('Học viên Mẫu 01');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('is one card per student on a phone, with the same fields and no table to scroll sideways', async () => {
    recorder();
    window.innerWidth = 375;
    await render(<DiemDanhPage />, '/diem-danh?buoi=5', '/diem-danh');
    await screen.findByText('Học viên Mẫu 01');
    await waitFor(() =>
      expect(screen.queryByRole('table')).not.toBeInTheDocument(),
    );
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(
      screen.getByRole('checkbox', { name: /Làm bài tập/u }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Ý thức/u })).toBeEnabled();
    expect(
      screen.getByRole('textbox', { name: /Nhận xét ngắn/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Lưu điểm danh' }),
    ).toBeInTheDocument();
  });

  it('lists the sessions to choose from when none is in the address', async () => {
    await render(<DiemDanhPage />, '/diem-danh', '/diem-danh');
    // The session is in "all sessions" behind the period filter; "All" shows it.
    await userEvent.click(
      await screen.findByRole('button', { name: 'Tất cả' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Lớp Mẫu 1/u }),
    );
    expect(await screen.findByText('Học viên Mẫu 01')).toBeInTheDocument();
  });

  it('saves a changed status, a quick comment and a score, the content only when it changed', async () => {
    recorder();
    await render(<DiemDanhPage />, '/diem-danh?buoi=5', '/diem-danh');
    await userEvent.click(
      await screen.findByRole('radio', { name: /Vắng có phép/u }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Chưa làm bài tập về nhà' }),
    );
    await userEvent.type(screen.getByRole('textbox', { name: /Ý thức/u }), '8');
    await userEvent.click(
      screen.getByRole('button', { name: 'Lưu điểm danh' }),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'buoiHoc/noiDung/luu',
          json: expect.objectContaining({
            buoiHocId: 5,
            yThuc: [{ hocVienId: 7, diem: 8 }],
          }),
        }),
      ),
    );
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'diemDanh/luu',
        json: {
          buoiHocId: 5,
          danhSach: [
            {
              hocVienId: 7,
              trangThai: 'vang_co_phep',
              daLamBtvn: false,
              nhanXet: 'Chưa làm bài tập về nhà',
            },
          ],
        },
      }),
    );
  });

  it('never writes the session content when it could not be read', async () => {
    recorder();
    storedContent = new Response(null, { status: 500 });
    await render(<DiemDanhPage />, '/diem-danh?buoi=5', '/diem-danh');
    expect(
      await screen.findByText(/Chưa tải được nội dung buổi học/u),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Ý thức/u })).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Lưu điểm danh' }),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'diemDanh/luu' }),
      ),
    );
    expect(
      api.mock.calls.some(([call]) => call.path === 'buoiHoc/noiDung/luu'),
    ).toBe(false);
  });

  it('shows no register for a session that was called off', async () => {
    recorder();
    sessionStatus = 'huy';
    await render(<DiemDanhPage />, '/diem-danh?buoi=5', '/diem-danh');
    expect(
      await screen.findByText('Buổi học này đã huỷ nên không có sổ điểm danh.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Lưu điểm danh' }),
    ).not.toBeInTheDocument();
  });

  it('shows no save button without the attendance action', async () => {
    await render(<DiemDanhPage />, '/diem-danh?buoi=5', '/diem-danh');
    expect(await screen.findByText('Học viên Mẫu 01')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Lưu điểm danh' }),
    ).not.toBeInTheDocument();
  });

  it('reads the sessions newest first, so the cap on a lookup never drops the newest ones', async () => {
    await render(<DiemDanhPage />, '/diem-danh?buoi=5', '/diem-danh');
    await screen.findByText('Học viên Mẫu 01');
    const call = api.mock.calls.find(
      ([request]) => request.path === 'buoiHoc/findMany',
    )?.[0];
    expect(JSON.stringify(call?.json)).toContain('desc');
  });

  it('saves the register through the business route and warns when few sessions are left', async () => {
    recorder();
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
    // Nothing of the session content was typed, so it is not written.
    expect(
      api.mock.calls.some(([call]) => call.path === 'buoiHoc/noiDung/luu'),
    ).toBe(false);
  });

  it('shows a report with Vietnamese column names', async () => {
    await render(<BaoCaoPage />, '/bao-cao', '/bao-cao');
    expect((await screen.findAllByText('Lớp Mẫu 1'))[0]).toBeInTheDocument();
    expect(screen.getByText('Sĩ số')).toBeInTheDocument();
    // Viewing a report does not allow downloading it.
    expect(
      screen.queryByRole('button', { name: 'Tải CSV' }),
    ).not.toBeInTheDocument();
  });

  it('offers the CSV download only to a person who holds the export action', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.baoCao' },
          actions: ['export'],
        },
      ],
    };
    await render(<BaoCaoPage />, '/bao-cao', '/bao-cao');
    expect(
      await screen.findByRole('button', { name: 'Tải CSV' }),
    ).toBeInTheDocument();
  });
});
