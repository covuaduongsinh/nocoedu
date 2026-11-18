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
import { Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BaoCaoPage from '../../client/pages/edu/bao-cao.js';
import DiemDanhPage from '../../client/pages/edu/diem-danh/index.js';
import { periodOf } from '../../client/pages/edu/diem-danh/periods.js';
import { todayVn } from '../../client/pages/edu/kit.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

let permissions: AuthorizationSnapshot;
let registerTotal = 1;
let registerFails = false;
const getSession = vi.fn(async () => ({ data: null }));
const session = {
  id: 5,
  lopId: 1,
  ngay: '2026-11-09',
  gioBatDau: '17:30',
  gioKetThuc: '19:00',
  trangThai: 'du_kien',
};
const api = vi.fn(({ method, path, json }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'buoiHoc/findMany') return { data: [session] };
  if (path === 'buoiHoc/count') return { data: 1 };
  if (path === 'buoiHoc/findOne') return { data: session };
  if (path === 'lop/findMany')
    return {
      data: [
        { id: 1, ma: 'L1', ten: 'Lớp Mẫu 1', coSoId: 1 },
        { id: 2, ma: 'L2', ten: 'Lớp Mẫu 2', coSoId: 2 },
      ],
    };
  if (path === 'coSo/findMany')
    return {
      data: [
        { id: 1, ten: 'Cơ sở Mẫu 1' },
        { id: 2, ten: 'Cơ sở Mẫu 2' },
      ],
    };
  if (path === 'hocVien/findMany')
    return {
      data: [
        {
          id: 7,
          ma: 'HS00007',
          hoTen: 'Học viên Mẫu 01',
          lopId: 1,
          trangThai: 'dang_hoc',
          soBuoiConLai: 3,
        },
      ],
    };
  if (path === 'hocVien/count') return { data: 1 };
  if (path === 'diemDanh/findMany') return { data: [] };
  if (path === 'diemDanh/luu')
    return {
      data: {
        danhSach: [{ hocVienId: 7, soBuoiConLai: 2, canhBao: true }],
      },
    };
  if (path === 'buoiHoc/noiDung/xem')
    return { data: { noiDung: {}, yThuc: [] } };
  if (path === 'diemDanh/giaoVien')
    return { data: [{ id: 'u1', ten: 'Giáo viên Mẫu 01' }] };
  if (path === 'diemDanh/traCuu') {
    if (registerFails) return new Response(null, { status: 500 });
    const mode = (json as { cheDo: string }).cheDo;
    const summary = {
      soCa: 3,
      soLuot: 6,
      coMat: 4,
      vangCoPhep: 1,
      vangKhongPhep: 1,
      hocBu: 0,
      tyLe: 67,
      soHocVien: 2,
    };
    const counts = {
      coMat: 4,
      vangCoPhep: 1,
      vangKhongPhep: 1,
      hocBu: 0,
      tong: 6,
      tyLe: 67,
    };
    const data =
      registerTotal === 0
        ? []
        : mode === 'hocVien'
          ? [
              {
                hocVienId: 7,
                ma: 'HS00007',
                hoTen: 'Học viên Mẫu 01',
                lopId: 1,
                ...counts,
              },
            ]
          : mode === 'giaoVien'
            ? [
                {
                  hlvId: 'u1',
                  hlvTen: 'Giáo viên Mẫu 01',
                  soCa: 3,
                  soCaDaDiemDanh: 2,
                  soLuot: 6,
                  ...counts,
                },
              ]
            : [
                {
                  buoiHocId: 5,
                  lopId: 1,
                  ngay: '2026-11-09',
                  gioBatDau: '17:30',
                  gioKetThuc: '19:00',
                  hlvId: 'u1',
                  loai: 'thuong',
                  trangThai: 'da_diem_danh',
                  ...counts,
                },
              ];
    return {
      data,
      meta: {
        count: registerTotal,
        cheDo: mode,
        tuNgay: '',
        denNgay: '',
        tongHop: summary,
      },
    };
  }
  if (path === 'baoCao/xem')
    return {
      data: {
        columns: [{ key: 'lop' }, { key: 'soHocVien' }],
        rows: [{ lop: 'Lớp Mẫu 1', soHocVien: 4 }],
      },
    };
  return new Response(null, { status: 404 });
});

const callsTo = (path: string) =>
  api.mock.calls.filter(([request]) => request.path === path);
const lastJson = (path: string) =>
  callsTo(path).at(-1)?.[0].json as Record<string, unknown> | undefined;

function Where(): React.ReactElement {
  const location = useLocation();
  return (
    <output data-testid='where'>{location.pathname + location.search}</output>
  );
}

async function render(
  element: React.ReactElement,
  route: string,
  path: string,
) {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route
          path={path}
          element={
            <>
              {element}
              <Where />
            </>
          }
        />
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

const where = () => screen.getByTestId('where').textContent ?? '';

describe('attendance tab', () => {
  beforeEach(() => {
    api.mockClear();
    registerTotal = 1;
    registerFails = false;
    permissions = { unrestricted: false, permissions: [] };
  });

  it('shows no save button without the attendance action', async () => {
    await render(<DiemDanhPage />, '/diem-danh?buoi=5', '/diem-danh');
    expect(await screen.findByText('Học viên Mẫu 01')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Lưu điểm danh' }),
    ).not.toBeInTheDocument();
  });

  it('loads today, one session and one class on the server, never every session or every student', async () => {
    await render(<DiemDanhPage />, '/diem-danh?buoi=5', '/diem-danh');
    await screen.findByText('Học viên Mẫu 01');
    // Today's sessions: a filter on the day, in the club's calendar.
    const today = (callsTo('buoiHoc/findMany') as [ApiCall][])
      .map(([request]) => request.json as { filter?: unknown; limit?: number })
      .find((json) => JSON.stringify(json.filter).includes(todayVn()));
    expect(today).toBeDefined();
    // The chosen session is read by its id.
    expect(lastJson('buoiHoc/findOne')).toEqual({ filter: { id: 5 } });
    // The students are the active ones of that class only.
    const students = lastJson('hocVien/findMany');
    expect(students).toMatchObject({
      filter: { lopId: 1, trangThai: 'dang_hoc' },
    });
    // No request reads sessions without a filter or with the 100-row lookup paging.
    for (const [request] of callsTo('buoiHoc/findMany') as [ApiCall][]) {
      const json = request.json as { filter?: unknown; limit?: number };
      expect(json.filter).toBeDefined();
      expect(json.limit).toBeLessThanOrEqual(100);
    }
  });

  it('lists the sessions of a class and a status page by page, on the server', async () => {
    await render(<DiemDanhPage />, '/diem-danh', '/diem-danh');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Tất cả' }),
    );
    await userEvent.selectOptions(screen.getByLabelText('Lớp học'), '1');
    await userEvent.selectOptions(
      screen.getByLabelText('Trạng thái điểm danh'),
      'da_diem_danh',
    );
    await waitFor(() => {
      const json = JSON.stringify(lastJson('buoiHoc/findMany'));
      expect(json).toContain('da_diem_danh');
      expect(json).toContain('"lopId"');
    });
    expect(lastJson('buoiHoc/findMany')).toMatchObject({
      limit: 25,
      offset: 0,
    });
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
    const [save] = await screen.findAllByRole('button', {
      name: 'Lưu điểm danh',
    });
    await userEvent.click(save as HTMLElement);
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
    expect(
      await screen.findByText(/Sắp hết buổi \(2 buổi\)/u),
    ).toBeInTheDocument();
  });
  it('offers the attendance CSV only to a person who holds the export action of the reports', async () => {
    await render(<DiemDanhPage />, '/diem-danh?buoi=5', '/diem-danh');
    await screen.findByText('Học viên Mẫu 01');
    expect(
      screen.queryByRole('button', { name: /Xuất CSV/u }),
    ).not.toBeInTheDocument();
  });

  it('shows the attendance CSV button when the person may export', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.baoCao' },
          actions: ['export'],
        },
      ],
    };
    await render(<DiemDanhPage />, '/diem-danh?buoi=5', '/diem-danh');
    expect(
      await screen.findByRole('button', { name: /Xuất CSV/u }),
    ).toBeInTheDocument();
  });
});

describe('attendance register tab', () => {
  beforeEach(() => {
    api.mockClear();
    registerTotal = 1;
    registerFails = false;
    permissions = { unrestricted: false, permissions: [] };
  });

  it('is the second tab of the page and reads this week by session, 25 rows at a time', async () => {
    await render(<DiemDanhPage />, '/diem-danh?tab=so', '/diem-danh');
    const row = await screen.findByRole('link', { name: '09/11/2026' });
    expect(row).toHaveAttribute('href', '/diem-danh?buoi=5');
    const week = periodOf('tuan', todayVn());
    expect(lastJson('diemDanh/traCuu')).toEqual({
      tuNgay: week.from,
      denNgay: week.to,
      cheDo: 'buoi',
      limit: 25,
      offset: 0,
    });
    // The teacher of the session is named, the totals are shown.
    expect(
      screen.getByText('Giáo viên Mẫu 01', { selector: 'td' }),
    ).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sổ điểm danh' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('keeps tab, period, view and filters in the address, and the arrows move the period', async () => {
    await render(<DiemDanhPage />, '/diem-danh?tab=so', '/diem-danh');
    await screen.findByRole('link', { name: '09/11/2026' });

    await userEvent.click(screen.getByRole('tab', { name: 'Tháng này' }));
    const month = periodOf('thang', todayVn());
    await waitFor(() =>
      expect(lastJson('diemDanh/traCuu')).toMatchObject({
        tuNgay: month.from,
        denNgay: month.to,
      }),
    );
    expect(where()).toContain('ky=thang');

    await userEvent.click(screen.getByRole('button', { name: 'Kỳ trước' }));
    await waitFor(() => expect(where()).toContain('ngay='));
    const previous = lastJson('diemDanh/traCuu') as {
      tuNgay: string;
      denNgay: string;
    };
    await waitFor(() => expect(previous.denNgay < month.from).toBe(true));

    await userEvent.selectOptions(screen.getByLabelText('Lớp'), '2');
    await userEvent.selectOptions(screen.getByLabelText('Giáo viên'), 'u1');
    await userEvent.selectOptions(
      screen.getByLabelText('Trạng thái', { selector: 'select' }),
      'vang_co_phep',
    );
    await waitFor(() =>
      expect(lastJson('diemDanh/traCuu')).toMatchObject({
        lopId: 2,
        hlvId: 'u1',
        trangThai: 'vang_co_phep',
      }),
    );
    expect(where()).toContain('lop=2');
    expect(where()).toContain('gv=u1');
    expect(where()).toContain('tt=vang_co_phep');
  });

  it('opens the same state again from the address (period, filters and view)', async () => {
    await render(
      <DiemDanhPage />,
      '/diem-danh?tab=so&ky=tuyChon&tu=2026-11-02&den=2026-11-15&xem=hocVien&coSo=1&hv=7&tt=co_mat',
      '/diem-danh',
    );
    expect(
      await screen.findByText('Học viên Mẫu 01', { selector: 'a' }),
    ).toBeInTheDocument();
    expect(lastJson('diemDanh/traCuu')).toEqual({
      tuNgay: '2026-11-02',
      denNgay: '2026-11-15',
      cheDo: 'hocVien',
      coSoId: 1,
      hocVienId: 7,
      trangThai: 'co_mat',
      limit: 25,
      offset: 0,
    });
  });

  it('switches between the three views', async () => {
    await render(<DiemDanhPage />, '/diem-danh?tab=so', '/diem-danh');
    await screen.findByRole('link', { name: '09/11/2026' });
    await userEvent.click(screen.getByRole('tab', { name: 'Theo học viên' }));
    expect(
      await screen.findByRole('link', { name: 'Học viên Mẫu 01' }),
    ).toHaveAttribute('href', '/hoc-vien/7');
    expect(lastJson('diemDanh/traCuu')).toMatchObject({ cheDo: 'hocVien' });
    await userEvent.click(screen.getByRole('tab', { name: 'Theo giáo viên' }));
    await waitFor(() =>
      expect(lastJson('diemDanh/traCuu')).toMatchObject({ cheDo: 'giaoVien' }),
    );
    expect(
      await screen.findByText('Giáo viên Mẫu 01', { selector: 'td' }),
    ).toBeInTheDocument();
    expect(where()).toContain('xem=giaoVien');
  });

  it('pages on the server and keeps the page in the address', async () => {
    registerTotal = 60;
    await render(<DiemDanhPage />, '/diem-danh?tab=so', '/diem-danh');
    await screen.findByRole('link', { name: '09/11/2026' });
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sau' }));
    await waitFor(() =>
      expect(lastJson('diemDanh/traCuu')).toMatchObject({ offset: 25 }),
    );
    expect(where()).toContain('page=2');
  });

  it('refuses a period over 366 days without asking the server', async () => {
    await render(
      <DiemDanhPage />,
      '/diem-danh?tab=so&ky=tuyChon&tu=2025-01-01&den=2026-11-01',
      '/diem-danh',
    );
    expect(
      await screen.findByText('Khoảng ngày tối đa 366 ngày.'),
    ).toBeInTheDocument();
    expect(callsTo('diemDanh/traCuu')).toHaveLength(0);
  });

  it('says so when nothing matches, and offers a retry when the server fails', async () => {
    registerTotal = 0;
    await render(<DiemDanhPage />, '/diem-danh?tab=so', '/diem-danh');
    expect(
      await screen.findByText('Không có dữ liệu điểm danh trong kỳ này'),
    ).toBeInTheDocument();
  });

  it('shows a retry button when the lookup fails', async () => {
    registerFails = true;
    await render(<DiemDanhPage />, '/diem-danh?tab=so', '/diem-danh');
    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByRole('button', { name: 'Thử lại' }),
    ).toBeInTheDocument();
  });

  it('explains that a student or status filter keeps only the sessions with a matching mark, and only then', async () => {
    const note = /chỉ gồm các ca có điểm danh khớp/u;
    await render(<DiemDanhPage />, '/diem-danh?tab=so&lop=2', '/diem-danh');
    await screen.findByRole('link', { name: '09/11/2026' });
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });

  it('shows that note once a status is chosen', async () => {
    await render(<DiemDanhPage />, '/diem-danh?tab=so&tt=co_mat', '/diem-danh');
    expect(
      await screen.findByText(/chỉ gồm các ca có điểm danh khớp/u),
    ).toBeInTheDocument();
  });

  it('switches back to the attendance tab with a clean address', async () => {
    await render(
      <DiemDanhPage />,
      '/diem-danh?tab=so&lop=2&xem=hocVien',
      '/diem-danh',
    );
    await screen.findByRole('tab', { name: 'Điểm danh', selected: false });
    await userEvent.click(screen.getByRole('tab', { name: 'Điểm danh' }));
    await waitFor(() => expect(where()).toBe('/diem-danh'));
  });
});

describe('report page', () => {
  beforeEach(() => {
    api.mockClear();
    permissions = { unrestricted: false, permissions: [] };
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
