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

import HocVienChiTietPage from '../../client/pages/edu/hoc-vien-chi-tiet/index.js';
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

const profile = {
  hocVien: {
    id: 7,
    ma: 'HS00007',
    hoTen: 'Học viên Mẫu 07',
    levelKey: 'ma',
    trangThai: 'dang_hoc',
    lopId: 3,
    lopTen: 'Lớp Mẫu 3',
    coSoId: 1,
    coSoTen: 'Cơ sở Mẫu 1',
  },
  phuHuynhChinh: {
    id: 11,
    hoTen: 'Phụ huynh Mẫu 11',
    soDienThoai: '0900000011',
    quanHe: 'me',
  },
  tongHop: {
    soBuoiConLai: 4,
    dai: 'binh_thuong',
    canThu: false,
    tongSoBuoiDaMua: 12,
    tongSoBuoiDaHoc: 8,
    vuotSoDu: 0,
    tongTienHocPhi: 1800000,
    tongDaThanhToan: 1000000,
    tongConNoHocPhi: 800000,
    tienSachDaPhat: 40000,
    tienSachDaNop: 10000,
    quySach: -30000,
    congNoSach: 30000,
  },
  hocPhi: {
    cacKy: [
      {
        kySo: 1,
        goiHocId: 41,
        loai: 'mua',
        trangThaiGoi: 'hieu_luc',
        ngayMua: '2026-10-01',
        soBuoi: 12,
        donGia: 150000,
        thanhTien: 1800000,
        daThanhToan: 1000000,
        conNo: 800000,
        daDung: 8,
        conLai: 4,
        tienDo: 67,
      },
    ],
  },
  buoiHoc: [
    {
      diemDanhId: 21,
      buoiHocId: 31,
      stt: 1,
      ngay: '2026-11-03',
      gioBatDau: '18:00',
      gioKetThuc: '19:30',
      lopId: 3,
      lopTen: 'Lớp Mẫu 3',
      trangThai: 'co_mat',
      daLamBtvn: true,
      yThucDiem: 8,
      nhanXet: 'Nhận xét mẫu của buổi học',
      soBuoiDaTru: 1,
      kySo: 1,
      vuotSoDu: false,
    },
    {
      diemDanhId: 22,
      buoiHocId: 32,
      stt: 2,
      ngay: '2026-11-05',
      gioBatDau: '18:00',
      gioKetThuc: '19:30',
      lopId: 3,
      lopTen: 'Lớp Mẫu 3',
      trangThai: 'vang_co_phep',
      daLamBtvn: false,
      yThucDiem: null,
      nhanXet: '',
      soBuoiDaTru: 0,
      kySo: null,
      vuotSoDu: false,
    },
  ],
  sach: {
    cacLanPhat: [
      {
        id: 1,
        sachId: 5,
        kyHieu: 'CT1',
        tenSach: 'Sách Mẫu 1',
        ngay: '2026-10-02',
        giaBia: 60000,
        uuDai: 10000,
        tienSach: 40000,
        ghiChu: '',
      },
    ],
    daPhat: 40000,
    daNop: 10000,
    conLai: -30000,
    congNo: 30000,
  },
};

let studentFound = true;
let profileAnswer: unknown = profile;
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
  if (path === 'hocVien/hoSo360') return { data: profileAnswer };
  if (path === 'kienThuc/hoSo')
    return {
      data: {
        hocVienId: 7,
        levelKey: 'ma',
        capDo: [],
        canBu: [],
      },
    };
  if (path === 'doiSoat/capNhatBuoiHoc') return { data: { success: true } };
  if (path === 'nhanXetThang/findMany')
    return {
      data: [
        {
          id: 1,
          hocVienId: 7,
          thang: '2026-10',
          noiDung: 'Con tiến bộ rõ rệt',
          trangThai: 'nhap',
        },
      ],
    };
  if (path === 'nhanXetThang/count') return { data: 1 };
  if (path === 'sachHoc/findMany') return { data: [] };
  if (path === 'sachHoc/count') return { data: 0 };
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
  if (path === 'goiHoc/chiTiet')
    return {
      data: {
        goiHoc: { id: 41, soBuoi: 12 },
        daDung: 1,
        conLai: 11,
        vuotSoDu: 0,
        cacBuoi: [
          {
            stt: 1,
            diemDanhId: 21,
            buoiHocId: 31,
            lopId: 3,
            ngay: '2026-11-03',
            gioBatDau: '18:00',
            trangThai: 'co_mat',
            soBuoi: 1,
          },
        ],
      },
    };
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
    profileAnswer = profile;
    permissions = { unrestricted: true, permissions: [] };
  });

  it('opens on the overview with the numbers of the server and the milestones of each term', async () => {
    await render('/hoc-vien/7');
    expect(
      await screen.findByRole('heading', { name: 'Học viên Mẫu 07' }),
    ).toBeInTheDocument();
    // The student is read by id, never as one of a list; the numbers come from the one answer of the file.
    expect(callsTo('hocVien/findOne')[0]?.json).toMatchObject({
      filter: { id: 7 },
    });
    expect(callsTo('hocVien/hoSo360')[0]?.json).toEqual({ hocVienId: 7 });
    // The A4 sheet is in the page too (shown on paper only), so look inside the open tab.
    const overview = within(await screen.findByRole('tabpanel'));
    expect(await overview.findByText('Kỳ 1 (12 buổi)')).toBeInTheDocument();
    expect(overview.getByText('Đã học 8 / 12 buổi')).toBeInTheDocument();
    expect(overview.getByText('Đã nộp: 1.000.000 đ')).toBeInTheDocument();
    expect(overview.getByText('Còn nợ: 800.000 đ')).toBeInTheDocument();
    // Seven tabs for a person who may view everything (the permissions arrive after the page, so wait for them).
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Tổng quan',
        'Buổi học',
        'Học phí',
        'Sách & quỹ',
        'Kiến thức',
        'Nhận xét',
        'Phụ huynh',
      ]),
    );
  });

  it('keeps the active tab in the address and opens a tab named by it', async () => {
    await render('/hoc-vien/7?tab=buoi-hoc&ky=1');
    // The term filter of the address applies: the session of term 1 is there, the one that deducted nothing is not.
    const link = await screen.findByText('2026-11-03', { selector: 'a' });
    const sessions = within(link.closest('[role="tabpanel"]') as HTMLElement);
    expect(
      await sessions.findByText('Nhận xét mẫu của buổi học'),
    ).toBeInTheDocument();
    expect(sessions.getByText('2026-11-03')).toBeInTheDocument();
    expect(sessions.queryByText('2026-11-05')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Buổi học' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Học phí' }));
    expect(await screen.findByText('1.800.000')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Học phí' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // The balance history is read page by page, newest first.
    expect(callsTo('soDuNhatKy/findMany')[0]?.json).toMatchObject({
      limit: 25,
      offset: 0,
    });
    expect(await screen.findByText('Điểm danh')).toBeInTheDocument();
    // A term opens its sessions on the sessions tab, filtered to it.
    expect(screen.getByRole('link', { name: 'Xem buổi' })).toHaveAttribute(
      'href',
      expect.stringContaining('tab=buoi-hoc&ky=1'),
    );
  });

  it('shows the books and the fund, the comments, the parents and the knowledge tab', async () => {
    await render('/hoc-vien/7?tab=sach-quy');
    expect(
      await screen.findByText('Sách Mẫu 1', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('-30.000')).toBeInTheDocument();
    // The fund is part of the student file: the report of every student's fund is not asked for.
    expect(callsTo('quySach/xem')).toHaveLength(0);

    await userEvent.click(screen.getByRole('tab', { name: 'Nhận xét' }));
    expect(await screen.findByText('Con tiến bộ rõ rệt')).toBeInTheDocument();
    expect(callsTo('nhanXetThang/findMany')[0]?.json).toMatchObject({
      limit: 25,
    });

    await userEvent.click(screen.getByRole('tab', { name: 'Phụ huynh' }));
    expect(await screen.findByText('Phụ huynh Mẫu 11')).toBeInTheDocument();
    expect(screen.getByText('Mẹ')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Kiến thức' }));
    // The knowledge tab asks for the student's own tree, not for the profile again.
    expect(await screen.findByText('Cần bù')).toBeInTheDocument();
    expect(callsTo('kienThuc/hoSo')[0]?.json).toEqual({ hocVienId: 7 });
  });

  it('quick-edits a session and reads the file again', async () => {
    await render('/hoc-vien/7?tab=buoi-hoc');
    const row = (
      await screen.findByText('2026-11-03', { selector: 'a' })
    ).closest('tr') as HTMLElement;
    await userEvent.click(
      await within(row).findByRole('button', {
        name: 'Sửa thông tin buổi học',
      }),
    );
    const comment = await screen.findByLabelText('Nhận xét của giáo viên');
    await userEvent.clear(comment);
    await userEvent.type(comment, 'Con làm bài tốt');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(callsTo('doiSoat/capNhatBuoiHoc')).toHaveLength(1),
    );
    expect(callsTo('doiSoat/capNhatBuoiHoc')[0]?.json).toMatchObject({
      diemDanhId: 21,
      trangThai: 'co_mat',
      nhanXet: 'Con làm bài tốt',
    });
    await waitFor(() => expect(callsTo('hocVien/hoSo360')).toHaveLength(2));
  });

  it('offers a coach only the tabs they may view and shows no tuition', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.diemDanh' },
          actions: ['view'],
        },
      ],
    };
    profileAnswer = { ...profile, hocPhi: null, sach: null };
    await render('/hoc-vien/7');
    expect(await screen.findByRole('tab', { name: 'Tổng quan' })).toBeVisible();
    expect(await screen.findByRole('tab', { name: 'Buổi học' })).toBeVisible();
    for (const hidden of ['Học phí', 'Sách & quỹ', 'Nhận xét', 'Phụ huynh'])
      expect(
        screen.queryByRole('tab', { name: hidden }),
      ).not.toBeInTheDocument();
    // A tab the person may not open falls back to the overview, whatever the address says.
    expect(callsTo('goiHoc/findMany')).toHaveLength(0);
    expect(callsTo('soDuNhatKy/findMany')).toHaveLength(0);
    expect(callsTo('lienKet/findMany')).toHaveLength(0);
    expect(
      screen.queryByRole('link', { name: 'Thu phí' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Xuất CSV' }),
    ).not.toBeInTheDocument();
  });

  it('falls back to the overview when the address names a tab the person may not open', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.diemDanh' },
          actions: ['view'],
        },
      ],
    };
    profileAnswer = { ...profile, hocPhi: null, sach: null };
    await render('/hoc-vien/7?tab=hoc-phi');
    expect(
      await screen.findByRole('tab', { name: 'Tổng quan' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(callsTo('soDuNhatKy/findMany')).toHaveLength(0);
  });

  it('says "not found" for a student the person may not see, and keeps the other tabs closed', async () => {
    studentFound = false;
    await render('/hoc-vien/9');
    expect(
      await screen.findByRole('heading', { name: 'Không tìm thấy học viên' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(callsTo('hocVien/hoSo360')).toHaveLength(0);
    expect(callsTo('diemDanh/findMany')).toHaveLength(0);
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
