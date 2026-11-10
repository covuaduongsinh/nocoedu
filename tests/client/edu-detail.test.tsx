import { apiClientToken } from '@nocobase/app-client';
import {
  AuthenticationProvider,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import {
  AuthorizationClient,
  type AuthorizationSnapshot,
  authorizationClientToken,
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

import HocVienChiTietPage from '../../client/pages/edu/hoc-vien-chi-tiet.js';
import LopChiTietPage from '../../client/pages/edu/lop-chi-tiet.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

const student = {
  id: 7,
  ma: 'HS00007',
  hoTen: 'Học viên Mẫu 07',
  namSinh: 2016,
  levelKey: 'ma',
  levelOrder: 2,
  lopId: 3,
  coSoId: 1,
  trangThai: 'dang_hoc',
  ghiChuHlv: 'Ghi chú mẫu',
  soBuoiConLai: 4,
};

let studentFound = true;
let permissions: AuthorizationSnapshot = {
  unrestricted: true,
  permissions: [],
};
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path, json }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'hocVien/findOne')
    return { data: studentFound ? student : null };
  if (path === 'lop/findOne')
    return {
      data: {
        id: 3,
        ma: 'L3',
        ten: 'Lớp Mẫu 3',
        coSoId: 1,
        levelKey: 'ma',
        trangThai: 'dang_mo',
      },
    };
  if (path === 'lop/findMany')
    return { data: [{ id: 3, ma: 'L3', ten: 'Lớp Mẫu 3', coSoId: 1 }] };
  if (path === 'coSo/findMany')
    return { data: [{ id: 1, ma: 'CS1', ten: 'Cơ sở Mẫu 1' }] };
  if (path === 'lienKet/findMany')
    return {
      data: [
        {
          id: 1,
          hocVienId: 7,
          phuHuynhId: 11,
          quanHe: 'me',
          lienHeChinh: true,
        },
      ],
    };
  if (path === 'lienKet/count') return { data: 1 };
  if (path === 'phuHuynh/findMany')
    return {
      data: [
        {
          id: 11,
          ma: 'PH00011',
          hoTen: 'Phụ huynh Mẫu 11',
          soDienThoai: '0900000011',
          zalo: null,
        },
      ],
    };
  if (path === 'diemDanh/findMany')
    return {
      data: [
        {
          id: 21,
          buoiHocId: 31,
          hocVienId: 7,
          trangThai: 'co_mat',
          daLamBtvn: true,
          nhanXet: 'Nhận xét mẫu của buổi học',
          soBuoiDaTru: 1,
        },
      ],
    };
  if (path === 'diemDanh/count') return { data: 1 };
  if (path === 'buoiHoc/findMany')
    return {
      data: [
        {
          id: 31,
          lopId: 3,
          ngay: '2026-11-03',
          gioBatDau: '18:00',
          gioKetThuc: '19:30',
          trangThai: 'da_diem_danh',
        },
      ],
    };
  if (path === 'buoiHoc/count') return { data: 1 };
  if (path === 'goiHoc/findMany')
    return {
      data: [
        {
          id: 41,
          hocVienId: 7,
          soBuoi: 12,
          donGia: 150000,
          thanhTien: 1800000,
          ngayMua: '2026-10-01',
          trangThai: 'hieu_luc',
        },
      ],
    };
  if (path === 'goiHoc/count') return { data: 1 };
  if (path === 'soDuNhatKy/findMany')
    return {
      data: [
        {
          id: 51,
          hocVienId: 7,
          thayDoi: -1,
          soDuSau: 4,
          lyDo: 'diem_danh',
          createdAt: '2026-11-03T11:00:00.000Z',
        },
      ],
    };
  if (path === 'soDuNhatKy/count') return { data: 1 };
  if (path === 'hocVien/findMany')
    return {
      data: [{ ...student, ghiChuHlv: null }],
    };
  if (path === 'hocVien/count') return { data: 1 };
  if (path === 'lopLich/findMany')
    return {
      data: [
        { id: 61, lopId: 3, thu: 3, gioBatDau: '18:00', gioKetThuc: '19:30' },
      ],
    };
  if (path === 'lopLich/count') return { data: 1 };
  void json;
  return new Response(null, { status: 404 });
});

async function render(route: string) {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/hoc-vien/:id' element={<HocVienChiTietPage />} />
        <Route path='/lop/:id' element={<LopChiTietPage />} />
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

const callsTo = (path: string) =>
  api.mock.calls.map(([call]) => call).filter((call) => call.path === path);

describe('student file', () => {
  beforeEach(() => {
    api.mockClear();
    studentFound = true;
    permissions = { unrestricted: true, permissions: [] };
  });

  it('shows the details, the parents, every session with its comment, the packages and the balance history', async () => {
    await render('/hoc-vien/7');
    expect(
      await screen.findByRole('heading', { name: 'Học viên Mẫu 07' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ghi chú mẫu')).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Lớp Mẫu 3' }),
    ).toHaveAttribute('href', expect.stringMatching(/\/lop\/3$/));
    // The student is read by id, never as one of a list.
    expect(callsTo('hocVien/findOne')[0]?.json).toMatchObject({
      filter: { id: 7 },
    });

    await userEvent.click(screen.getByRole('tab', { name: 'Phụ huynh' }));
    expect(await screen.findByText('Phụ huynh Mẫu 11')).toBeInTheDocument();
    expect(screen.getByText('Mẹ')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('tab', { name: 'Buổi học và nhận xét' }),
    );
    expect(
      await screen.findByText('Nhận xét mẫu của buổi học'),
    ).toBeInTheDocument();
    expect(screen.getByText('2026-11-03')).toBeInTheDocument();
    expect(screen.getByText('Có mặt')).toBeInTheDocument();
    // Attendance is asked for this student only, newest first, a page at a time.
    expect(JSON.stringify(callsTo('diemDanh/findMany')[0]?.json)).toContain(
      '"value":7',
    );
    expect(callsTo('diemDanh/findMany')[0]?.json).toMatchObject({
      limit: 25,
      offset: 0,
    });

    await userEvent.click(screen.getByRole('tab', { name: 'Gói học' }));
    expect(await screen.findByText('Còn hiệu lực')).toBeInTheDocument();
    expect(screen.getByText('1.800.000')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Sổ số dư' }));
    expect(await screen.findByText('-1')).toBeInTheDocument();
    expect(screen.getByText('Điểm danh')).toBeInTheDocument();
  });

  it('offers a coach only the tabs they may view, and asks for no tuition', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.diemDanh' },
          actions: ['view'],
        },
      ],
    };
    await render('/hoc-vien/7');
    expect(await screen.findByRole('tab', { name: 'Thông tin' })).toBeVisible();
    expect(
      await screen.findByRole('tab', { name: 'Buổi học và nhận xét' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('tab', { name: 'Phụ huynh' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Gói học' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Sổ số dư' }),
    ).not.toBeInTheDocument();
    expect(callsTo('goiHoc/findMany')).toHaveLength(0);
    expect(callsTo('soDuNhatKy/findMany')).toHaveLength(0);
    expect(callsTo('lienKet/findMany')).toHaveLength(0);
  });

  it('says "not found" for a student the person may not see, and keeps the other tabs closed', async () => {
    studentFound = false;
    await render('/hoc-vien/9');
    expect(
      await screen.findByRole('heading', { name: 'Không tìm thấy học viên' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(callsTo('diemDanh/findMany')).toHaveLength(0);
    expect(callsTo('goiHoc/findMany')).toHaveLength(0);
  });
});

describe('class page', () => {
  beforeEach(() => {
    api.mockClear();
  });

  it('shows the timetable, the students with links to their files and the sessions', async () => {
    await render('/lop/3');
    expect(
      await screen.findByRole('heading', { name: 'Lớp Mẫu 3' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Cơ sở Mẫu 1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Lịch học' }));
    expect(await screen.findByText('Thứ 3')).toBeInTheDocument();
    expect(screen.getByText('18:00 – 19:30')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Học viên' }));
    const link = await screen.findByRole('link', { name: 'Học viên Mẫu 07' });
    expect(link).toHaveAttribute(
      'href',
      expect.stringMatching(/\/hoc-vien\/7$/),
    );
    expect(JSON.stringify(callsTo('hocVien/findMany')[0]?.json)).toContain(
      '"value":3',
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Các buổi học' }));
    const row = (await screen.findByText('2026-11-03')).closest('tr');
    expect(row).not.toBeNull();
    await waitFor(() =>
      expect(
        within(row as HTMLElement).getByText('Đã điểm danh'),
      ).toBeInTheDocument(),
    );
  });
});
