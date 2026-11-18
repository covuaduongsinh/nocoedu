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

import HocVienChiTietPage from '../../client/pages/edu/hoc-vien-chi-tiet/index.js';
import KiemTraChiTietPage from '../../client/pages/edu/kiem-tra/chi-tiet.js';
import KiemTraPage from '../../client/pages/edu/kiem-tra/index.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

/** The tests of a level on the client (GĐ 5): list, new test, grid of marks, closing, results, student file. */
const lop = {
  id: 3,
  ma: 'L-03',
  ten: 'Lớp Mẫu 3',
  coSoId: 1,
  levelKey: 'tot',
  levelOrder: 1,
  trangThai: 'dang_hoat_dong',
};
const rows = [
  {
    id: 9,
    ten: 'Kiểm tra lên cấp Tốt',
    loai: 'len_cap',
    levelKey: 'tot',
    lopId: 3,
    coSoId: 1,
    ngay: '2026-11-18',
    diemDat: 70,
    trangThai: 'nhap',
    chotLuc: null,
    soKyNang: 2,
    soHocVien: 0,
  },
  {
    id: 8,
    ten: 'Kiểm tra định kỳ tháng 10',
    loai: 'dinh_ky',
    levelKey: 'tot',
    lopId: 3,
    coSoId: 1,
    ngay: '2026-10-30',
    diemDat: 60,
    trangThai: 'da_chot',
    chotLuc: '2026-10-30T10:00:00.000Z',
    soKyNang: 2,
    soHocVien: 2,
  },
];
const tree = {
  capDo: [{ key: 'tot', order: 1, title: 'Tốt' }],
  chuDe: [
    {
      id: 1,
      levelKey: 'tot',
      ma: 'T01',
      ten: 'Làm quen bàn cờ',
      thuTu: 1,
      trangThai: 'hoat_dong',
    },
  ],
  kyNang: [
    {
      id: 11,
      chuDeId: 1,
      ma: 'T01-01',
      ten: 'Nhận biết ô cờ',
      moTa: null,
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
  ],
};
const bai = (extra: Record<string, unknown>) => ({
  id: 9,
  ten: 'Kiểm tra lên cấp Tốt',
  loai: 'len_cap',
  levelKey: 'tot',
  lopId: 3,
  coSoId: 1,
  ngay: '2026-11-18',
  diemDat: 70,
  trangThai: 'nhap',
  chotLuc: null,
  ...extra,
});
const detailSkills = [
  {
    kyNangId: 11,
    ma: 'T01-01',
    ten: 'Nhận biết ô cờ',
    chuDe: 'T',
    diemToiDa: 10,
  },
  {
    kyNangId: 12,
    ma: 'T01-02',
    ten: 'Cách đi của tốt',
    chuDe: 'T',
    diemToiDa: 10,
  },
];
const detailStudents = [
  {
    id: 7,
    ma: 'HS00007',
    hoTen: 'Học viên Mẫu 07',
    levelKey: 'tot',
    trangThai: 'dang_hoc',
  },
  {
    id: 8,
    ma: 'HS00008',
    hoTen: 'Học viên Mẫu 08',
    levelKey: 'tot',
    trangThai: 'dang_hoc',
  },
];
const summary = (extra: Record<string, unknown>) => ({
  hocVienId: 7,
  diem: 0,
  toiDa: 20,
  phanTram: 0,
  dat: false,
  thieu: 2,
  daKiemTra: false,
  denLevelKey: null,
  daLenCap: false,
  ...extra,
});
const draftDetail = {
  bai: bai({}),
  coTheSua: true,
  kyNang: detailSkills,
  hocVien: detailStudents,
  diem: [],
  tongHop: [summary({ hocVienId: 7 }), summary({ hocVienId: 8 })],
};
const closedDetail = {
  bai: bai({ trangThai: 'da_chot', chotLuc: '2026-11-18T10:00:00.000Z' }),
  coTheSua: false,
  kyNang: detailSkills,
  hocVien: detailStudents,
  diem: [
    { hocVienId: 7, kyNangId: 11, diem: 10 },
    { hocVienId: 7, kyNangId: 12, diem: 9 },
    { hocVienId: 8, kyNangId: 11, diem: 3 },
    { hocVienId: 8, kyNangId: 12, diem: 4 },
  ],
  tongHop: [
    summary({
      hocVienId: 7,
      diem: 19,
      phanTram: 95,
      dat: true,
      thieu: 0,
      daKiemTra: true,
      denLevelKey: 'ma',
    }),
    summary({
      hocVienId: 8,
      diem: 7,
      phanTram: 35,
      dat: false,
      thieu: 0,
      daKiemTra: true,
    }),
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
  kienThuc: null,
};
const studentKnowledge = {
  hocVienId: 7,
  levelKey: 'tot',
  capDo: [],
  canBu: [],
};
const studentTests = {
  hocVienId: 7,
  baiKiemTra: [
    {
      ...bai({ trangThai: 'da_chot', chotLuc: '2026-11-18T10:00:00.000Z' }),
      diem: 19,
      toiDa: 20,
      phanTram: 95,
      dat: true,
      denLevelKey: 'ma',
      kyNang: [
        {
          kyNangId: 11,
          ma: 'T01-01',
          ten: 'Nhận biết ô cờ',
          diem: 10,
          diemToiDa: 10,
          mucDo: 'vung',
        },
        {
          kyNangId: 12,
          ma: 'T01-02',
          ten: 'Cách đi của tốt',
          diem: 9,
          diemToiDa: 10,
          mucDo: 'vung',
        },
      ],
    },
  ],
};

let permissions: AuthorizationSnapshot;
let detailAnswer: unknown = draftDetail;
let detailStatus = 200;
const getSession = vi.fn(async () => ({ data: null }));
const baseApi = ({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'kiemTra/danhSach')
    return { data: { tong: 2, trang: 1, limit: 25, danhSach: rows } };
  if (path === 'kiemTra/chiTiet') {
    if (detailStatus === 404)
      return new Response(
        JSON.stringify({
          error: { status: 'NOT_FOUND', reason: 'EDU_TEST_NOT_FOUND' },
        }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    return { data: detailAnswer };
  }
  if (path === 'kiemTra/luu') return { data: { id: 21 } };
  if (path === 'kiemTra/nhapDiem') return { data: { capNhat: 1, xoa: 0 } };
  if (path === 'kiemTra/chot')
    return {
      data: { id: 9, trangThai: 'da_chot', lenCap: [], capNhatMucDo: 4 },
    };
  if (path === 'kiemTra/hocVien') return { data: studentTests };
  if (path === 'hocVien/lenCap') return { data: { id: 1 } };
  if (path === 'chuongTrinh/cay') return { data: tree };
  if (path === 'kienThuc/hoSo') return { data: studentKnowledge };
  if (path === 'hocVien/findOne') return { data: student };
  if (path === 'hocVien/hoSo360') return { data: profile };
  if (path === 'lop/findMany') return { data: [lop] };
  if (path === 'coSo/findMany')
    return { data: [{ id: 1, ten: 'Cơ sở Mẫu 1' }] };
  if (path === 'lopNhom/findMany' || path === 'hocVien/findMany')
    return { data: [] };
  if (path === 'lopNhom/count' || path === 'hocVien/count') return { data: 0 };
  return new Response(null, { status: 404 });
};
const api = vi.fn(baseApi);

function Where(): React.ReactElement {
  const location = useLocation();
  return (
    <output data-testid='where'>{location.pathname + location.search}</output>
  );
}

async function render(route: string) {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route
          path='/kiem-tra'
          element={
            <>
              <KiemTraPage />
              <Where />
            </>
          }
        />
        <Route
          path='/kiem-tra/:id'
          element={
            <>
              <KiemTraChiTietPage />
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
  detailAnswer = draftDetail;
  detailStatus = 200;
  permissions = { unrestricted: false, permissions: [] };
});

describe('the list of tests', () => {
  it('reads one page of 25 on the server and keeps the filters in the address', async () => {
    permissions = grants(['edu.kiemTra', ['view']]);
    await render('/kiem-tra');
    expect(await screen.findByText('Kiểm tra lên cấp Tốt')).toBeInTheDocument();
    expect(screen.getByText('Kiểm tra định kỳ tháng 10')).toBeInTheDocument();
    expect(callsTo('kiemTra/danhSach')[0]?.json).toEqual({
      trang: 1,
      limit: 25,
    });
    // A filter is in the address and in the next request, back on page 1.
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Trạng thái' }),
      'da_chot',
    );
    await waitFor(() => expect(where()).toBe('/kiem-tra?tt=da_chot'));
    await waitFor(() =>
      expect(callsTo('kiemTra/danhSach').at(-1)?.json).toEqual({
        trangThai: 'da_chot',
        trang: 1,
        limit: 25,
      }),
    );
  });

  it('offers "Tạo bài kiểm tra" only to who may manage tests', async () => {
    permissions = grants(['edu.kiemTra', ['view']]);
    await render('/kiem-tra');
    await screen.findByText('Kiểm tra lên cấp Tốt');
    expect(
      screen.queryByRole('button', { name: 'Tạo bài kiểm tra' }),
    ).not.toBeInTheDocument();
  });

  it('makes a test with the skills of the level and opens it', async () => {
    permissions = grants(['edu.kiemTra', ['view', 'manage']]);
    await render('/kiem-tra');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Tạo bài kiểm tra' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Tên bài'), 'Bài mới');
    await userEvent.selectOptions(within(dialog).getByLabelText('Lớp'), '3');
    await userEvent.click(
      await within(dialog).findByRole('checkbox', {
        name: 'T01-01 Nhận biết ô cờ',
      }),
    );
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: 'T01-02 Cách đi của tốt' }),
    );
    // A top mark per ticked skill.
    const top = within(dialog).getByLabelText('Điểm tối đa của T01-02');
    await userEvent.clear(top);
    await userEvent.type(top, '5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(callsTo('kiemTra/luu')).toHaveLength(1));
    expect(callsTo('kiemTra/luu')[0]?.json).toMatchObject({
      ten: 'Bài mới',
      loai: 'len_cap',
      levelKey: 'tot',
      lopId: 3,
      diemDat: 70,
      kyNang: [
        { kyNangId: 11, diemToiDa: 10 },
        { kyNangId: 12, diemToiDa: 5 },
      ],
    });
    await waitFor(() => expect(where()).toBe('/kiem-tra/21'));
  });
});

describe('the grid of marks', () => {
  it('sends only the cells that changed, and refuses a mark above the top mark', async () => {
    permissions = grants(['edu.kiemTra', ['view', 'manage']]);
    await render('/kiem-tra/9');
    const cell = await screen.findByLabelText(
      'Điểm của Học viên Mẫu 07 ở T01-01',
    );
    await userEvent.type(cell, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu điểm' }));
    expect(await screen.findByText(/Có ô nhập sai/u)).toBeInTheDocument();
    expect(callsTo('kiemTra/nhapDiem')).toHaveLength(0);

    await userEvent.clear(cell);
    await userEvent.type(cell, '8');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu điểm' }));
    await waitFor(() => expect(callsTo('kiemTra/nhapDiem')).toHaveLength(1));
    expect(callsTo('kiemTra/nhapDiem')[0]?.json).toEqual({
      id: 9,
      o: [{ hocVienId: 7, kyNangId: 11, diem: 8 }],
    });
  });

  it('shows no input, no save and no close button to a person who may only view', async () => {
    permissions = grants(['edu.kiemTra', ['view']]);
    await render('/kiem-tra/9');
    await screen.findByText('Học viên Mẫu 07');
    expect(
      screen.queryByLabelText('Điểm của Học viên Mẫu 07 ở T01-01'),
    ).not.toBeInTheDocument();
    for (const name of ['Lưu điểm', 'Chốt bài', 'Sửa bài'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  });

  it('does not offer closing a test before any mark exists', async () => {
    permissions = grants(['edu.kiemTra', ['view', 'manage']]);
    await render('/kiem-tra/9');
    await screen.findByText('Học viên Mẫu 07');
    // No mark yet: closing is not offered as a click.
    expect(
      await screen.findByRole('button', { name: 'Chốt bài' }),
    ).toBeDisabled();
  });

  it('asks before closing, then closes', async () => {
    permissions = grants(['edu.kiemTra', ['view', 'manage']]);
    detailAnswer = {
      ...draftDetail,
      coTheSua: false,
      diem: [{ hocVienId: 7, kyNangId: 11, diem: 8 }],
      tongHop: [
        summary({
          hocVienId: 7,
          diem: 8,
          phanTram: 40,
          daKiemTra: true,
          thieu: 1,
        }),
        summary({ hocVienId: 8 }),
      ],
    };
    await render('/kiem-tra/9');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Chốt bài' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/1 em có điểm sẽ được ghi nhận/u),
    ).toBeInTheDocument();
    expect(callsTo('kiemTra/chot')).toHaveLength(0);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Chốt bài' }),
    );
    await waitFor(() => expect(callsTo('kiemTra/chot')).toHaveLength(1));
    expect(callsTo('kiemTra/chot')[0]?.json).toEqual({ id: 9 });
  });

  it("says so when the test is not in the person's scope", async () => {
    permissions = grants(['edu.kiemTra', ['view']]);
    detailStatus = 404;
    await render('/kiem-tra/99');
    expect(
      await screen.findByText('Không tìm thấy bài kiểm tra'),
    ).toBeInTheDocument();
  });
});

describe('the results and the level-up label', () => {
  it('labels the student who passed and shows the confirm button only to who holds levelUp', async () => {
    detailAnswer = closedDetail;
    permissions = grants(
      ['edu.kiemTra', ['view', 'manage']],
      ['edu.hocVien', ['view', 'levelUp']],
    );
    await render('/kiem-tra/9');
    // A closed test opens on its results; one student passed, one did not.
    expect(await screen.findByText('Đủ điều kiện lên cấp')).toBeInTheDocument();
    expect(screen.getAllByText('Đạt').length).toBeGreaterThan(0);
    expect(screen.getByText('Chưa đạt')).toBeInTheDocument();
    expect(screen.getByText(/2 em đã kiểm tra, 1 em đạt/u)).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Xác nhận lên cấp' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Học viên Mẫu 07/u)).toBeInTheDocument();
    // Nothing moved until the coach confirms.
    expect(callsTo('hocVien/lenCap')).toHaveLength(0);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận' }),
    );
    await waitFor(() => expect(callsTo('hocVien/lenCap')).toHaveLength(1));
    expect(callsTo('hocVien/lenCap')[0]?.json).toEqual({
      hocVienId: 7,
      denLevelKey: 'ma',
    });
  });

  it('shows the label but no button when the person does not hold levelUp', async () => {
    detailAnswer = closedDetail;
    permissions = grants(['edu.kiemTra', ['view', 'manage']]);
    await render('/kiem-tra/9');
    expect(await screen.findByText('Đủ điều kiện lên cấp')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Xác nhận lên cấp' }),
    ).not.toBeInTheDocument();
    expect(callsTo('hocVien/lenCap')).toHaveLength(0);
  });

  it('shows a periodic test with no level-up column at all', async () => {
    detailAnswer = {
      ...closedDetail,
      bai: bai({ loai: 'dinh_ky', trangThai: 'da_chot' }),
    };
    permissions = grants(
      ['edu.kiemTra', ['view']],
      ['edu.hocVien', ['view', 'levelUp']],
    );
    await render('/kiem-tra/9');
    await screen.findByText(/2 em đã kiểm tra/u);
    expect(screen.queryByText('Đủ điều kiện lên cấp')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: 'Lên cấp' }),
    ).not.toBeInTheDocument();
  });
});

describe('the student file', () => {
  it('shows the results of the closed tests under the knowledge tab, for who may view the tests', async () => {
    permissions = grants(['edu.kienThuc', ['view']], ['edu.kiemTra', ['view']]);
    await render('/hoc-vien/7?tab=kien-thuc');
    expect(
      await screen.findByRole('heading', { name: 'Kết quả kiểm tra' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Kiểm tra lên cấp Tốt')).toBeInTheDocument();
    expect(screen.getByText('Đủ điều kiện lên cấp')).toBeInTheDocument();
    expect(callsTo('kiemTra/hocVien')[0]?.json).toEqual({ hocVienId: 7 });
  });

  it('asks for nothing about tests when the person may not view them', async () => {
    permissions = grants(['edu.kienThuc', ['view']]);
    await render('/hoc-vien/7?tab=kien-thuc');
    await screen.findByRole('heading', { name: 'Cần bù' });
    expect(
      screen.queryByRole('heading', { name: 'Kết quả kiểm tra' }),
    ).not.toBeInTheDocument();
    expect(callsTo('kiemTra/hocVien')).toHaveLength(0);
  });
});
