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

import DiemDanhPage from '../../client/pages/edu/diem-danh/index.js';
import ChuongTrinhPage from '../../client/pages/edu/chuong-trinh/index.js';
import HocVienChiTietPage from '../../client/pages/edu/hoc-vien-chi-tiet/index.js';
import KienThucPage from '../../client/pages/edu/kien-thuc/index.js';
import { SessionSkills } from '../../client/pages/edu/kien-thuc/session-skills.js';
import LopChiTietPage from '../../client/pages/edu/lop-chi-tiet.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

/** The knowledge system on the client (GĐ 4): curriculum page, matrix, gaps, class tab, student file, session skills. */
const topics = [
  {
    id: 1,
    levelKey: 'tot',
    ma: 'T01',
    ten: 'Làm quen bàn cờ',
    thuTu: 1,
    trangThai: 'hoat_dong',
  },
  {
    id: 2,
    levelKey: 'tot',
    ma: 'T02',
    ten: 'Chiếu hết',
    thuTu: 2,
    trangThai: 'hoat_dong',
  },
];
const skills = [
  {
    id: 11,
    chuDeId: 1,
    ma: 'T01-01',
    ten: 'Nhận biết ô cờ',
    moTa: 'Gọi tên được ô',
    thuTu: 1,
    trangThai: 'hoat_dong',
    sachId: null,
  },
  {
    id: 12,
    chuDeId: 1,
    ma: 'T01-02',
    ten: 'Cách đi của tốt',
    moTa: null,
    thuTu: 2,
    trangThai: 'hoat_dong',
    sachId: null,
  },
  {
    id: 13,
    chuDeId: 2,
    ma: 'T02-01',
    ten: 'Chiếu bằng xe',
    moTa: null,
    thuTu: 1,
    trangThai: 'an',
    sachId: null,
  },
];
const tree = {
  capDo: [
    { key: 'tot', order: 1, title: 'Tốt' },
    { key: 'ma', order: 2, title: 'Mã' },
  ],
  chuDe: topics,
  kyNang: skills,
};
const lop = {
  id: 3,
  ma: 'L3',
  ten: 'Lớp Mẫu 3',
  coSoId: 1,
  levelKey: 'tot',
  trangThai: 'dang_mo',
};
const matrix = {
  lop: { id: 3, ma: 'L3', ten: 'Lớp Mẫu 3', levelKey: 'tot' },
  levelKey: 'tot',
  nhomId: null,
  chuDeId: 1,
  chuDe: topics,
  kyNang: skills.slice(0, 2),
  hocVien: [
    {
      id: 7,
      ma: 'HS00007',
      hoTen: 'Học viên Mẫu 07',
      nhomId: null,
      tong: 2,
      daHoc: 1,
      dat: 1,
      chuaVung: 0,
      phanTram: 50,
      canBu: 0,
    },
    {
      id: 8,
      ma: 'HS00008',
      hoTen: 'Học viên Mẫu 08',
      nhomId: null,
      tong: 2,
      daHoc: 0,
      dat: 0,
      chuaVung: 0,
      phanTram: 0,
      canBu: 2,
    },
  ],
  o: [{ hocVienId: 7, kyNangId: 11, mucDo: 'dat', nguon: 'cham_tay' }],
  daDay: [11],
  tong: 2,
  trang: 1,
  limit: 25,
};
const gaps = {
  che: 'lop',
  tong: 1,
  tongCap: 1,
  trang: 1,
  limit: 25,
  kyNang: [
    {
      kyNangId: 11,
      ma: 'T01-01',
      ten: 'Nhận biết ô cờ',
      chuDeId: 1,
      chuDe: 'Làm quen bàn cờ',
      levelKey: 'tot',
      hocVien: [
        {
          hocVienId: 8,
          ma: 'HS00008',
          hoTen: 'Học viên Mẫu 08',
          lyDo: 'vang_buoi_day',
          ngay: '2026-11-02',
          buoiHocId: 5,
        },
      ],
    },
  ],
};
const studentKnowledge = {
  hocVienId: 7,
  levelKey: 'tot',
  capDo: [
    {
      levelKey: 'tot',
      tong: 2,
      daHoc: 1,
      dat: 1,
      chuaVung: 0,
      phanTram: 50,
      chuDe: [
        {
          ...topics[0],
          kyNang: [
            {
              ...skills[0],
              mucDo: 'dat',
              nguon: 'cham_tay',
              canBu: null,
              ngayVang: null,
            },
            {
              ...skills[1],
              mucDo: null,
              nguon: null,
              canBu: 'vang_buoi_day',
              ngayVang: '2026-11-02',
            },
          ],
        },
      ],
    },
    {
      levelKey: 'ma',
      tong: 0,
      daHoc: 0,
      dat: 0,
      chuaVung: 0,
      phanTram: 0,
      chuDe: [],
    },
  ],
  canBu: [
    {
      kyNangId: 12,
      ma: 'T01-02',
      ten: 'Cách đi của tốt',
      chuDe: 'Làm quen bàn cờ',
      levelKey: 'tot',
      lyDo: 'vang_buoi_day',
      ngay: '2026-11-02',
    },
  ],
};
const student = {
  id: 7,
  ma: 'HS00007',
  hoTen: 'Học viên Mẫu 07',
  namSinh: 2016,
  levelKey: 'tot',
  levelOrder: 1,
  lopId: 3,
  coSoId: 1,
  trangThai: 'dang_hoc',
  ghiChuHlv: '',
  soBuoiConLai: 4,
};
const profile = {
  hocVien: {
    id: 7,
    ma: 'HS00007',
    hoTen: 'Học viên Mẫu 07',
    levelKey: 'tot',
    trangThai: 'dang_hoc',
    lopId: 3,
    lopTen: 'Lớp Mẫu 3',
    nhomId: null,
    nhomTen: null,
    coSoId: 1,
    coSoTen: 'Cơ sở Mẫu 1',
  },
  phuHuynhChinh: null,
  tongHop: {
    soBuoiConLai: 4,
    dai: 'binh_thuong',
    canThu: false,
    tongSoBuoiDaMua: null,
    tongSoBuoiDaHoc: 2,
    vuotSoDu: null,
    tongTienHocPhi: null,
    tongDaThanhToan: null,
    tongConNoHocPhi: null,
    tienSachDaPhat: null,
    tienSachDaNop: null,
    quySach: null,
    congNoSach: null,
  },
  hocPhi: null,
  buoiHoc: [],
  sach: null,
  kienThuc: {
    levelKey: 'tot',
    tong: 2,
    daHoc: 1,
    dat: 1,
    chuaVung: 0,
    phanTram: 50,
    canBu: 1,
  },
};

let permissions: AuthorizationSnapshot;
let matrixAnswer: unknown = matrix;
const getSession = vi.fn(async () => ({ data: null }));
const baseApi = ({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'chuongTrinh/cay') return { data: tree };
  if (path === 'chuongTrinh/chuDe/luu') return { data: { id: 3 } };
  if (path === 'chuongTrinh/kyNang/luu') return { data: { id: 14 } };
  if (path === 'chuongTrinh/sapXep') return { data: { soDong: 2 } };
  if (path === 'chuongTrinh/nhapCsv/xemTruoc')
    return {
      data: {
        rows: 3,
        problems: [],
        chuDeMoi: 1,
        chuDeCapNhat: 0,
        kyNangMoi: 2,
        kyNangCapNhat: 0,
        giuNguyen: 0,
        written: 0,
      },
    };
  if (path === 'chuongTrinh/nhapCsv/xacNhan')
    return {
      data: {
        rows: 3,
        problems: [],
        chuDeMoi: 1,
        chuDeCapNhat: 0,
        kyNangMoi: 2,
        kyNangCapNhat: 0,
        giuNguyen: 0,
        written: 3,
      },
    };
  if (path === 'kienThuc/maTran') return { data: matrixAnswer };
  if (path === 'kienThuc/loHong') return { data: gaps };
  if (path === 'kienThuc/cham') return { data: { capNhat: 1, xoa: 0 } };
  if (path === 'kienThuc/hoSo') return { data: studentKnowledge };
  if (path === 'buoiHoc/kyNang/xem')
    return {
      data: {
        buoiHocId: 5,
        lopId: 3,
        danhSach: [{ kyNangId: 11, nhomId: null }],
      },
    };
  if (path === 'buoiHoc/kyNang/luu') return { data: { them: 1, bo: 0 } };
  if (path === 'hocVien/findOne') return { data: student };
  if (path === 'hocVien/hoSo360') return { data: profile };
  if (path === 'lop/findOne') return { data: lop };
  if (path === 'lop/findMany') return { data: [lop] };
  if (path === 'coSo/findMany')
    return { data: [{ id: 1, ten: 'Cơ sở Mẫu 1' }] };
  if (path === 'buoiHoc/findOne')
    return {
      data: {
        id: 5,
        lopId: 3,
        ngay: '2026-11-09',
        gioBatDau: '17:30',
        gioKetThuc: '19:00',
        trangThai: 'du_kien',
      },
    };
  if (path === 'diemDanh/findMany') return { data: [] };
  if (path === 'buoiHoc/noiDung/xem')
    return { data: { noiDung: {}, yThuc: [] } };
  if (path === 'lopNhom/findMany') return { data: [] };
  if (path === 'lopNhom/count') return { data: 0 };
  if (path === 'hocVien/findMany') return { data: [] };
  if (path === 'hocVien/count') return { data: 0 };
  if (path === 'lopLich/findMany' || path === 'buoiHoc/findMany')
    return { data: [] };
  if (path === 'lopLich/count' || path === 'buoiHoc/count') return { data: 0 };
  return new Response(null, { status: 404 });
};
const api = vi.fn(baseApi);

function Where(): React.ReactElement {
  const location = useLocation();
  return (
    <output data-testid='where'>{location.pathname + location.search}</output>
  );
}

async function render(route: string, element?: React.ReactElement) {
  return renderWithApp(
    <AuthenticationProvider>
      {element ?? (
        <Routes>
          <Route
            path='/chuong-trinh'
            element={
              <>
                <ChuongTrinhPage />
                <Where />
              </>
            }
          />
          <Route path='/diem-danh' element={<DiemDanhPage />} />
          <Route
            path='/kien-thuc'
            element={
              <>
                <KienThucPage />
                <Where />
              </>
            }
          />
          <Route
            path='/lop/:id'
            element={
              <>
                <LopChiTietPage />
                <Where />
              </>
            }
          />
          <Route
            path='/hoc-vien/:id'
            element={
              <>
                <HocVienChiTietPage />
                <Where />
              </>
            }
          />
        </Routes>
      )}
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

const grants = (...entries: [string, string[]][]): AuthorizationSnapshot => ({
  unrestricted: false,
  permissions: entries.map(([id, actions]) => ({
    resource: { type: 'composite' as const, id },
    actions,
  })),
});
const callsTo = (path: string) =>
  api.mock.calls.map(([call]) => call).filter((call) => call.path === path);
const where = () => screen.getByTestId('where').textContent ?? '';

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(baseApi);
  matrixAnswer = matrix;
  permissions = { unrestricted: false, permissions: [] };
});

describe('the curriculum page', () => {
  it('shows the topics and skills of a level to a viewer, who has no button to change them', async () => {
    permissions = grants(['edu.chuongTrinh', ['view']]);
    await render('/chuong-trinh');
    expect(await screen.findByText('Làm quen bàn cờ')).toBeInTheDocument();
    expect(screen.getByText('Nhận biết ô cờ')).toBeInTheDocument();
    expect(screen.getByText('Gọi tên được ô')).toBeInTheDocument();
    // A hidden skill is not listed to a viewer; nobody can add, edit, import or export.
    expect(screen.queryByText('Chiếu bằng xe')).not.toBeInTheDocument();
    for (const name of ['Thêm chủ đề', 'Nhập CSV', 'Xuất CSV', 'Thêm kỹ năng'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(callsTo('chuongTrinh/cay')[0]?.json).toEqual({ levelKey: 'tot' });
    // The level is the tab in the address.
    await userEvent.click(screen.getByRole('tab', { name: 'Mã' }));
    await waitFor(() => expect(where()).toBe('/chuong-trinh?cap=ma'));
    await waitFor(() =>
      expect(callsTo('chuongTrinh/cay').at(-1)?.json).toEqual({
        levelKey: 'ma',
      }),
    );
  });

  it('lets the administrator add a topic, hide a skill and reorder topics', async () => {
    permissions = grants(['edu.chuongTrinh', ['view', 'manage']]);
    await render('/chuong-trinh?an=1');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Thêm chủ đề' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Mã'), 'T03');
    await userEvent.type(
      within(dialog).getByLabelText('Tên chủ đề'),
      '  Chiếu hết hậu ',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(callsTo('chuongTrinh/chuDe/luu')[0]?.json).toEqual({
        levelKey: 'tot',
        ma: 'T03',
        ten: 'Chiếu hết hậu',
        thuTu: 3,
      }),
    );

    // The hidden skill is listed (the address asks for them) and can be shown again; a visible one is hidden.
    expect(await screen.findByText('Chiếu bằng xe')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ẩn – T01-01' }));
    await waitFor(() =>
      expect(callsTo('chuongTrinh/kyNang/luu').at(-1)?.json).toEqual({
        id: 11,
        trangThai: 'an',
      }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Hiện lại – T02-01' }),
    );
    await waitFor(() =>
      expect(callsTo('chuongTrinh/kyNang/luu').at(-1)?.json).toEqual({
        id: 13,
        trangThai: 'hoat_dong',
      }),
    );
    // Moving the first topic down swaps the two ids; the first topic cannot go up.
    expect(screen.getByRole('button', { name: 'Lên – T01' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Xuống – T01' }));
    await waitFor(() =>
      expect(callsTo('chuongTrinh/sapXep')[0]?.json).toEqual({
        loai: 'chuDe',
        ids: [2, 1],
      }),
    );
  });

  it('previews a CSV before writing and sends the file text; the file is confirmed only after the preview', async () => {
    permissions = grants(['edu.chuongTrinh', ['view', 'manage']]);
    await render('/chuong-trinh');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nhập CSV' }),
    );
    const dialog = await screen.findByRole('dialog');
    const csv =
      'cap,maChuDe,tenChuDe,maKyNang,tenKyNang\ntot,T09,Chín,T09-1,Một';
    await userEvent.upload(
      within(dialog).getByLabelText('Tệp CSV'),
      new File([csv], 'chuong-trinh.csv', { type: 'text/csv' }),
    );
    expect(
      within(dialog).getByRole('button', { name: 'Xác nhận nhập' }),
    ).toBeDisabled();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Xem trước' }),
    );
    expect(await within(dialog).findByText('Chủ đề mới')).toBeVisible();
    expect(callsTo('chuongTrinh/nhapCsv/xacNhan')).toHaveLength(0);
    expect(callsTo('chuongTrinh/nhapCsv/xemTruoc')[0]?.json).toEqual({ csv });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận nhập' }),
    );
    await waitFor(() =>
      expect(callsTo('chuongTrinh/nhapCsv/xacNhan')[0]?.json).toEqual({ csv }),
    );
    expect(await within(dialog).findByText(/3 mục được thêm/u)).toBeVisible();
  });
});

describe('the knowledge page and the class tab', () => {
  const recorder = () =>
    grants(['edu.kienThuc', ['view', 'record']], ['edu.lopNhom', ['view']]);

  it('asks for a class first, then shows the matrix of that class with the page and filters in the address', async () => {
    permissions = grants(['edu.kienThuc', ['view']]);
    await render('/kien-thuc');
    expect(await screen.findByText(/Chọn một lớp/u)).toBeInTheDocument();
    expect(callsTo('kienThuc/maTran')).toHaveLength(0);
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Chọn lớp' }),
      '3',
    );
    expect(await screen.findByText('Học viên Mẫu 08')).toBeInTheDocument();
    expect(where()).toBe('/kien-thuc?lop=3');
    expect(callsTo('kienThuc/maTran')[0]?.json).toEqual({
      lopId: 3,
      trang: 1,
      limit: 25,
    });
    // A viewer sees each state as a label, not a control; the gap count and the progress of a student are shown.
    expect(
      screen.queryByRole('combobox', { name: /Học viên Mẫu 07 – T01-01/u }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).getByText('Đạt'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cần bù 2')).toBeInTheDocument();
    expect(screen.getByText('50% (1/2 kỹ năng)')).toBeInTheDocument();
    expect(screen.getByText(/Bạn chỉ có quyền xem/u)).toBeInTheDocument();
    // The skill nobody has been taught is marked.
    expect(screen.getByText('T01-02').closest('th')).toHaveTextContent(
      'Chưa dạy cho lớp',
    );
  });

  it('grades one cell and a whole column by hand, and reloads the matrix', async () => {
    permissions = recorder();
    await render('/kien-thuc?lop=3');
    const cell = await screen.findByRole('combobox', {
      name: 'Học viên Mẫu 08 – T01-01',
    });
    expect(cell).toHaveValue('');
    await userEvent.selectOptions(cell, 'vung');
    await waitFor(() =>
      expect(callsTo('kienThuc/cham')[0]?.json).toEqual({
        o: [{ hocVienId: 8, kyNangId: 11, mucDo: 'vung' }],
      }),
    );
    // Clearing a graded cell sends null.
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Học viên Mẫu 07 – T01-01' }),
      '',
    );
    await waitFor(() =>
      expect(callsTo('kienThuc/cham').at(-1)?.json).toEqual({
        o: [{ hocVienId: 7, kyNangId: 11, mucDo: null }],
      }),
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Chấm cả cột – T01-02' }),
      'da_hoc',
    );
    await waitFor(() =>
      expect(callsTo('kienThuc/cham').at(-1)?.json).toEqual({
        o: [
          { hocVienId: 7, kyNangId: 12, mucDo: 'da_hoc' },
          { hocVienId: 8, kyNangId: 12, mucDo: 'da_hoc' },
        ],
      }),
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Chấm cả hàng – Học viên Mẫu 08' }),
      'chua_vung',
    );
    await waitFor(() =>
      expect(callsTo('kienThuc/cham').at(-1)?.json).toEqual({
        o: [
          { hocVienId: 8, kyNangId: 11, mucDo: 'chua_vung' },
          { hocVienId: 8, kyNangId: 12, mucDo: 'chua_vung' },
        ],
      }),
    );
    // The matrix was asked for again after each grading.
    expect(callsTo('kienThuc/maTran').length).toBeGreaterThan(3);
  });

  it('shows the error of a refused grading instead of losing it', async () => {
    permissions = recorder();
    await render('/kien-thuc?lop=3');
    await screen.findByRole('combobox', { name: 'Học viên Mẫu 08 – T01-01' });
    const before = callsTo('kienThuc/maTran').length;
    api.mockImplementation((call) =>
      call.path === 'kienThuc/cham'
        ? Response.json(
            { error: { reason: 'EDU_SKILL_HIDDEN' } },
            { status: 400 },
          )
        : baseApi(call),
    );
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Học viên Mẫu 08 – T01-01' }),
      'dat',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kỹ năng này đã bị ẩn.',
    );
    expect(callsTo('kienThuc/maTran').length).toBe(before);
  });

  it('lists the gaps to make up of the class, in the address, with the reason and the date', async () => {
    permissions = recorder();
    await render('/kien-thuc?lop=3&che=lo-hong');
    expect(
      await screen.findByText('T01-01 · Nhận biết ô cờ'),
    ).toBeInTheDocument();
    expect(screen.getByText('Vắng buổi dạy')).toBeInTheDocument();
    expect(screen.getByText('từ 2026-11-02')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Học viên Mẫu 08' }),
    ).toHaveAttribute('href', '/hoc-vien/8?tab=kien-thuc');
    expect(callsTo('kienThuc/loHong')[0]?.json).toEqual({
      lopId: 3,
      trang: 1,
      limit: 25,
    });
    expect(callsTo('kienThuc/maTran')).toHaveLength(0);
    expect(screen.getByRole('tab', { name: 'Lỗ hổng cần bù' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Ma trận' }));
    await waitFor(() => expect(where()).toBe('/kien-thuc?lop=3'));
  });

  it('shows the matrix as a tab of the class page, only to who may view the knowledge', async () => {
    permissions = grants();
    await render('/lop/3?tab=knowledge');
    await screen.findByRole('tab', { name: 'Thông tin' });
    expect(
      screen.queryByRole('tab', { name: 'Tiến độ kiến thức' }),
    ).not.toBeInTheDocument();
    expect(callsTo('kienThuc/maTran')).toHaveLength(0);
  });

  it('opens the class tab with the same matrix and no class picker', async () => {
    permissions = grants(['edu.kienThuc', ['view']]);
    await render('/lop/3?tab=knowledge');
    expect(await screen.findByText('Học viên Mẫu 08')).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Tiến độ kiến thức' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(callsTo('kienThuc/maTran')[0]?.json).toEqual({
      lopId: 3,
      trang: 1,
      limit: 25,
    });
    expect(
      screen.queryByRole('combobox', { name: 'Chọn lớp' }),
    ).not.toBeInTheDocument();
  });

  it('says so when the level has no curriculum yet', async () => {
    permissions = grants(['edu.kienThuc', ['view']]);
    matrixAnswer = { ...matrix, chuDeId: null, chuDe: [], kyNang: [] };
    await render('/kien-thuc?lop=3');
    expect(
      await screen.findByText(/Chưa có chương trình cho cấp Tốt/u),
    ).toBeInTheDocument();
  });
});

describe('the student file', () => {
  it('shows the share of the level and the gaps in the overview, and the tree in the knowledge tab', async () => {
    permissions = grants(
      ['edu.kienThuc', ['view']],
      ['edu.diemDanh', ['view']],
    );
    await render('/hoc-vien/7');
    expect(await screen.findByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Cấp Tốt: 1/2 kỹ năng')).toBeInTheDocument();
    expect(screen.getByText('Kiến thức cần bù')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Kiến thức' }));
    expect(
      await screen.findByRole('heading', { name: 'Cần bù' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('T01-02 · Cách đi của tốt'),
    ).toBeInTheDocument();
    expect(screen.getByText('Vắng buổi dạy')).toBeInTheDocument();
    expect(callsTo('kienThuc/hoSo')[0]?.json).toEqual({ hocVienId: 7 });
    // The student's own level is open in its summary; a topic opens to show one state per skill.
    expect(
      screen.getByText(/Cấp Tốt: đã học 1\/2 kỹ năng \(50%\)/u),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /T01 · Làm quen bàn cờ/u }),
    );
    expect(await screen.findByText('Nhận biết ô cờ')).toBeInTheDocument();
    expect(screen.getAllByText('Đạt').length).toBeGreaterThan(0);
    // Another level, kept in the address.
    await userEvent.click(screen.getByRole('button', { name: /Mã/u }));
    await waitFor(() => expect(where()).toContain('cap=ma'));
    expect(
      await screen.findByText(/Chưa có chương trình cho cấp Mã/u),
    ).toBeInTheDocument();
  });

  it('hides the knowledge tab and the two figures from a person who may not view the knowledge', async () => {
    permissions = grants(['edu.diemDanh', ['view']]);
    await render('/hoc-vien/7?tab=kien-thuc');
    await screen.findByRole('tab', { name: 'Tổng quan' });
    expect(
      screen.queryByRole('tab', { name: 'Kiến thức' }),
    ).not.toBeInTheDocument();
    // An address that names a closed tab opens the overview, and nothing asked for the knowledge.
    expect(callsTo('kienThuc/hoSo')).toHaveLength(0);
  });
});

describe('the skills taught in a session', () => {
  it('sits in the block "Nội dung buổi học" of the register, for the class level of the session', async () => {
    permissions = grants(
      ['edu.kienThuc', ['view', 'record']],
      ['edu.diemDanh', ['view', 'record']],
    );
    await render('/diem-danh?buoi=5');
    expect(
      await screen.findByText('Kỹ năng đã dạy trong buổi'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('T01-01 · Nhận biết ô cờ'),
    ).toBeInTheDocument();
    expect(callsTo('buoiHoc/kyNang/xem')[0]?.json).toEqual({ buoiHocId: 5 });
    // The choices are those of the level of the class of the session.
    expect(callsTo('chuongTrinh/cay')[0]?.json).toEqual({ levelKey: 'tot' });
  });

  it('is not in the register of a person without the knowledge permission', async () => {
    permissions = grants(['edu.diemDanh', ['view', 'record']]);
    await render('/diem-danh?buoi=5');
    await screen.findByText(/Nội dung buổi học/u);
    expect(
      screen.queryByText('Kỹ năng đã dạy trong buổi'),
    ).not.toBeInTheDocument();
    expect(callsTo('buoiHoc/kyNang/xem')).toHaveLength(0);
  });

  const element = (levelKey = 'tot') => (
    <SessionSkills
      buoiHocId={5}
      levelKey={levelKey}
      groups={[
        { id: 31, ten: 'Cơ bản', lopId: 3, thuTu: 1, trangThai: 'hoat_dong' },
      ]}
    />
  );

  it('lists what was taught to the class and to each group, and offers nothing to a viewer', async () => {
    permissions = grants(['edu.kienThuc', ['view']]);
    await render('/', element());
    expect(
      await screen.findByText('Kỹ năng đã dạy trong buổi'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('T01-01 · Nhận biết ô cờ'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cơ bản')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Chọn kỹ năng/u }),
    ).not.toBeInTheDocument();
    expect(callsTo('buoiHoc/kyNang/xem')[0]?.json).toEqual({ buoiHocId: 5 });
    expect(callsTo('chuongTrinh/cay')[0]?.json).toEqual({ levelKey: 'tot' });
  });

  it('shows nothing, and asks for nothing, to a person without the knowledge permission', async () => {
    permissions = grants();
    const { container } = await render('/', element());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('chooses skills for the whole class or one group, hidden ones left out, and saves them in one request', async () => {
    permissions = grants(['edu.kienThuc', ['view', 'record']]);
    await render('/', element());
    await userEvent.click(
      await screen.findByRole('button', { name: 'Chọn kỹ năng – Cả lớp' }),
    );
    const dialog = await screen.findByRole('dialog');
    // The hidden skill (and the topic that holds only it) are not offered.
    expect(within(dialog).queryByText(/T02-01/u)).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('checkbox', { name: /T01-01/u }),
    ).toBeChecked();
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: /T01-02/u }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(callsTo('buoiHoc/kyNang/luu')[0]?.json).toEqual({
        buoiHocId: 5,
        nhomId: null,
        kyNangIds: [11, 12],
      }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Chọn kỹ năng – Cơ bản' }),
    );
    const groupDialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(groupDialog).getByRole('checkbox', { name: /T01-02/u }),
    );
    await userEvent.click(
      within(groupDialog).getByRole('button', { name: 'Lưu' }),
    );
    await waitFor(() =>
      expect(callsTo('buoiHoc/kyNang/luu')[1]?.json).toEqual({
        buoiHocId: 5,
        nhomId: 31,
        kyNangIds: [12],
      }),
    );
  });
});
