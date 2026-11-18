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
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DiemDanhPage from '../../client/pages/edu/diem-danh/index.js';
import HocVienChiTietPage from '../../client/pages/edu/hoc-vien-chi-tiet/index.js';
import HocVienPage from '../../client/pages/edu/hoc-vien.js';
import LopChiTietPage from '../../client/pages/edu/lop-chi-tiet.js';
import { rosterSections } from '../../client/pages/edu/nhom.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

/** Groups inside a class (phase 3): the "Nhóm" tab of the class page, the register in blocks, the register filter. */
const groups = [
  { id: 11, lopId: 3, ten: 'Nhập môn', thuTu: 1, trangThai: 'hoat_dong' },
  { id: 12, lopId: 3, ten: 'Cơ bản', thuTu: 2, trangThai: 'hoat_dong' },
  { id: 13, lopId: 3, ten: 'Nâng cao', thuTu: 3, trangThai: 'an' },
];
const students = [
  {
    id: 7,
    ma: 'HS00007',
    hoTen: 'Học viên Mẫu 01',
    lopId: 3,
    nhomId: 11,
    trangThai: 'dang_hoc',
    soBuoiConLai: 5,
  },
  {
    id: 8,
    ma: 'HS00008',
    hoTen: 'Học viên Mẫu 02',
    lopId: 3,
    nhomId: 12,
    trangThai: 'dang_hoc',
    soBuoiConLai: 5,
  },
  {
    id: 9,
    ma: 'HS00009',
    hoTen: 'Học viên Mẫu 03',
    lopId: 3,
    nhomId: null,
    trangThai: 'dang_hoc',
    soBuoiConLai: 5,
  },
];

let permissions: AuthorizationSnapshot;
let classGroups: typeof groups = groups;
let rosterRows: typeof students = students;
let hideAnswer: Response | { data: unknown } = { data: { id: 11 } };
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path, json }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
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
  if (path === 'lopNhom/findMany') return { data: classGroups };
  if (path === 'lopNhom/count') return { data: classGroups.length };
  if (path === 'lopNhom/updateOne') return hideAnswer;
  if (path === 'lopNhom/createOne') return { data: { record: { id: 14 } } };
  if (path === 'lopNhom/taoMacDinh') return { data: { id: 3, taoMoi: true } };
  if (path === 'hocVien/chuyenNhom')
    return { data: { id: (json as { hocVienId: number }).hocVienId } };
  if (path === 'hocVien/findMany') {
    // A count of one group is a page of one row; the class roster is the list.
    const filter = JSON.stringify((json as { filter?: unknown }).filter ?? '');
    const wantedGroup = /"nhomId"[^}]*?(\d+)/u.exec(filter)?.[1];
    return {
      data: wantedGroup
        ? rosterRows.filter((row) => String(row.nhomId) === wantedGroup)
        : rosterRows,
    };
  }
  if (path === 'hocVien/count') {
    const filter = JSON.stringify((json as { filter?: unknown }).filter ?? '');
    const wantedGroup = /"nhomId"[^}]*?(\d+)/u.exec(filter)?.[1];
    return {
      data: wantedGroup
        ? rosterRows.filter((row) => String(row.nhomId) === wantedGroup).length
        : rosterRows.length,
    };
  }
  if (path === 'chuyenNhom/findMany')
    return {
      data: [
        {
          id: 2,
          hocVienId: 7,
          tuNhomId: 11,
          denNhomId: null,
          ngay: '2026-11-10',
          ghiChu: 'chuyen_lop',
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
  if (path === 'chuyenNhom/count') return { data: 2 };
  if (path === 'hocVien/findOne')
    return { data: { ...students[0], levelKey: 'ma', levelOrder: 2 } };
  if (path === 'hocVien/hoSo360') return new Response(null, { status: 404 });
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
  if (path === 'buoiHoc/findMany' || path === 'buoiHoc/count')
    return { data: path.endsWith('count') ? 0 : [] };
  if (path === 'diemDanh/findMany') return { data: [] };
  if (path === 'buoiHoc/noiDung/xem')
    return { data: { noiDung: {}, yThuc: [] } };
  if (path === 'diemDanh/giaoVien') return { data: [] };
  if (path === 'diemDanh/traCuu')
    return {
      data: [],
      meta: {
        count: 0,
        cheDo: 'buoi',
        tuNgay: '',
        denNgay: '',
        tongHop: {
          soCa: 0,
          soLuot: 0,
          coMat: 0,
          vangCoPhep: 0,
          vangKhongPhep: 0,
          hocBu: 0,
          tyLe: 0,
        },
      },
    };
  return new Response(null, { status: 404 });
});

const callsTo = (path: string) =>
  api.mock.calls.map(([call]) => call).filter((call) => call.path === path);

async function render(route: string) {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/lop/:id' element={<LopChiTietPage />} />
        <Route path='/diem-danh' element={<DiemDanhPage />} />
        <Route path='/hoc-vien' element={<HocVienPage />} />
        <Route path='/hoc-vien/:id' element={<HocVienChiTietPage />} />
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

beforeEach(() => {
  api.mockClear();
  classGroups = groups;
  rosterRows = students;
  hideAnswer = { data: { id: 11 } };
  permissions = { unrestricted: true, permissions: [] };
});

describe('rosterSections', () => {
  const rows = students as never;
  it('splits a roster into blocks in the order of the groups, the students without a group last', () => {
    const sections = rosterSections(rows, groups as never, 'Chưa xếp nhóm');
    expect(sections.map((s) => [s.title, s.students.map((x) => x.id)])).toEqual(
      [
        ['Nhập môn', [7]],
        ['Cơ bản', [8]],
        ['Chưa xếp nhóm', [9]],
      ],
    );
  });

  it('keeps one block without a heading when nobody sits in a group', () => {
    const none = students.map((s) => ({ ...s, nhomId: null })) as never;
    expect(rosterSections(none, groups as never, 'x')).toEqual([
      { key: 'all', nhomId: null, title: null, students: none },
    ]);
    expect(rosterSections(rows, [], 'x')).toHaveLength(1);
  });
});

describe('the Nhóm tab of a class', () => {
  it('lists the groups with their students, keeps the tab in the address and moves a student', async () => {
    await render('/lop/3?tab=nhom');
    expect(await screen.findByRole('tab', { name: 'Nhóm' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      await screen.findByRole('cell', { name: 'Nâng cao' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Đã ẩn')).toBeInTheDocument();
    // The groups of this class only, in the order the server sorts them.
    expect(callsTo('lopNhom/findMany')[0]?.json).toMatchObject({
      filter: expect.anything(),
      limit: 100,
    });
    expect(JSON.stringify(callsTo('lopNhom/findMany')[0]?.json)).toContain(
      '"lopId"',
    );

    // A student moves with the select of his row: the business route, one student, one group.
    const select = await screen.findByLabelText('Nhóm: Học viên Mẫu 03');
    // Only the groups in use are offered (the hidden one is not).
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Chưa xếp nhóm', 'Nhập môn', 'Cơ bản']);
    await userEvent.selectOptions(select, '12');
    await waitFor(() =>
      expect(callsTo('hocVien/chuyenNhom')[0]?.json).toEqual({
        hocVienId: 9,
        nhomId: 12,
      }),
    );
    expect(await screen.findByText('Đã chuyển nhóm.')).toBeInTheDocument();
    // He can also be taken out of every group.
    await userEvent.selectOptions(
      await screen.findByLabelText('Nhóm: Học viên Mẫu 01'),
      '',
    );
    await waitFor(() =>
      expect(callsTo('hocVien/chuyenNhom')[1]?.json).toEqual({
        hocVienId: 7,
        nhomId: null,
      }),
    );
  });

  it('hides a group through the record API and says why the server refused a group that still has students', async () => {
    await render('/lop/3?tab=nhom');
    await screen.findByRole('cell', { name: 'Nâng cao' });
    const hideButtons = await screen.findAllByRole('button', { name: 'Ẩn' });
    hideAnswer = Response.json(
      { error: { reason: 'EDU_GROUP_HAS_STUDENTS' } },
      { status: 400 },
    );
    await userEvent.click(hideButtons[0] as HTMLElement);
    await waitFor(() =>
      expect(callsTo('lopNhom/updateOne')[0]?.json).toMatchObject({
        filter: { id: 11 },
        values: { trangThai: 'an' },
      }),
    );
    expect(
      await screen.findByText(
        'Nhóm còn học viên. Hãy chuyển các em sang nhóm khác trước khi ẩn.',
      ),
    ).toBeInTheDocument();
    // A hidden group can be shown again.
    expect(screen.getByRole('button', { name: 'Hiện lại' })).toBeVisible();
  });

  it('renames and adds a group with a clean name', async () => {
    await render('/lop/3?tab=nhom');
    await screen.findByRole('cell', { name: 'Nâng cao' });
    await userEvent.click(
      (
        await screen.findAllByRole('button', { name: 'Đổi tên' })
      )[0] as HTMLElement,
    );
    const name = await screen.findByLabelText('Tên nhóm');
    await userEvent.clear(name);
    await userEvent.type(name, '  Khởi   động ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(callsTo('lopNhom/updateOne')[0]?.json).toMatchObject({
        filter: { id: 11 },
        values: { ten: 'Khởi động', thuTu: 1 },
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Thêm nhóm' }));
    await userEvent.type(await screen.findByLabelText('Tên nhóm'), 'Nhóm Phụ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(callsTo('lopNhom/createOne')[0]?.json).toMatchObject({
        values: { lopId: 3, ten: 'Nhóm Phụ', thuTu: 4 },
      }),
    );
  });

  it('offers the standard groups to a class that has none', async () => {
    classGroups = [];
    await render('/lop/3?tab=nhom');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Tạo 3 nhóm mặc định' }),
    );
    await waitFor(() =>
      expect(callsTo('lopNhom/taoMacDinh')[0]?.json).toEqual({ lopId: 3 }),
    );
  });

  it('shows a person who may only view the groups as plain text, with no button and no select', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.lopNhom' },
          actions: ['view'],
        },
      ],
    };
    await render('/lop/3?tab=nhom');
    await screen.findByRole('cell', { name: 'Nâng cao' });
    // The permissions arrive after the page: wait for them to settle before asserting that nothing is offered.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Thêm nhóm' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: 'Ẩn' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Đổi tên' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Nhóm: Học viên Mẫu 01'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Chưa xếp nhóm').length).toBeGreaterThan(0);
    expect(callsTo('hocVien/chuyenNhom')).toHaveLength(0);
  });

  it('filters the students of the class by group on the server, with the group in the address', async () => {
    await render('/lop/3?tab=nhom&nhom=12');
    await screen.findByText('Học viên Mẫu 02');
    const last = callsTo('hocVien/findMany').at(-1)?.json as {
      filter: unknown;
    };
    expect(JSON.stringify(last.filter)).toContain('"nhomId"');
    expect(JSON.stringify(last.filter)).toContain('12');
  });
});

describe('attendance register in blocks by group', () => {
  it('draws a heading for every group of the class and one for the students without a group', async () => {
    await render('/diem-danh?buoi=5');
    expect(await screen.findByText('Học viên Mẫu 01')).toBeInTheDocument();
    expect(
      await screen.findByText('Nhập môn · 1 học viên'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cơ bản · 1 học viên')).toBeInTheDocument();
    expect(screen.getByText('Chưa xếp nhóm · 1 học viên')).toBeInTheDocument();
    // The hidden group has no student: no block for it.
    expect(screen.queryByText(/^Nâng cao/u)).not.toBeInTheDocument();
  });

  it('stays one block, with no heading, for a class whose students have no group', async () => {
    rosterRows = students.map((s) => ({ ...s, nhomId: null }));
    await render('/diem-danh?buoi=5');
    expect(await screen.findByText('Học viên Mẫu 01')).toBeInTheDocument();
    expect(screen.queryByText(/ · \d+ học viên$/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Nhập môn ·/u)).not.toBeInTheDocument();
  });
});

describe('the group filter of the register', () => {
  it('is offered once a class is chosen, sends nhomId and is cleared with the class', async () => {
    await render('/diem-danh?tab=so');
    const filter = await screen.findByLabelText('Nhóm');
    // Without a class there is nothing to choose.
    expect(within(filter).getAllByRole('option')).toHaveLength(1);
    await userEvent.selectOptions(screen.getByLabelText('Lớp'), '3');
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Nhóm'))
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Tất cả nhóm', 'Nhập môn', 'Cơ bản', 'Nâng cao']),
    );
    await userEvent.selectOptions(screen.getByLabelText('Nhóm'), '12');
    await waitFor(() =>
      expect(callsTo('diemDanh/traCuu').at(-1)?.json).toMatchObject({
        lopId: 3,
        nhomId: 12,
      }),
    );
    // Another class: the group of the old one no longer applies.
    await userEvent.selectOptions(screen.getByLabelText('Lớp'), '');
    await waitFor(() =>
      expect(callsTo('diemDanh/traCuu').at(-1)?.json).not.toHaveProperty(
        'nhomId',
      ),
    );
  });

  it('opens with the group named by the address', async () => {
    await render('/diem-danh?tab=so&lop=3&nhom=11');
    await waitFor(() =>
      expect(callsTo('diemDanh/traCuu').at(-1)?.json).toMatchObject({
        lopId: 3,
        nhomId: 11,
      }),
    );
    // The page says whose marks are counted: the students who sit in the group now.
    expect(
      await screen.findByText(/Chỉ tính học viên của nhóm này hiện nay/u),
    ).toBeInTheDocument();
  });
});

describe('the group shown on a student', () => {
  it('names the group in the list of students, and says there is none for a student without one', async () => {
    await render('/hoc-vien');
    expect(await screen.findByText('Học viên Mẫu 01')).toBeInTheDocument();
    expect(
      await screen.findByRole('columnheader', { name: 'Nhóm' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('cell', { name: 'Nhập môn' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Cơ bản' })).toBeInTheDocument();
    expect(
      screen.getByRole('cell', { name: 'Chưa xếp nhóm' }),
    ).toBeInTheDocument();
    // The names of the groups are read in one request for the page, by id.
    expect(JSON.stringify(callsTo('lopNhom/findMany')[0]?.json)).toContain(
      '"id"',
    );
  });

  it('lists the moves of the student on his overview, newest first, to who may view the history', async () => {
    await render('/hoc-vien/7');
    expect(await screen.findByText('Lịch sử chuyển nhóm')).toBeInTheDocument();
    expect(await screen.findByText('Đổi lớp')).toBeInTheDocument();
    const rows = await screen.findAllByRole('row');
    const text = rows.map((row) => row.textContent ?? '');
    // The class change took him out of "Nhập môn" (newest first); the first placement came from no group.
    expect(
      text.some(
        (row) =>
          row.includes('Nhập môn') &&
          row.includes('Chưa xếp nhóm') &&
          row.includes('Đổi lớp'),
      ),
    ).toBe(true);
    expect(callsTo('chuyenNhom/findMany')[0]?.json).toMatchObject({
      filter: expect.anything(),
    });
  });

  it('shows no history to a person who may not view it', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.lopNhom' },
          actions: ['view'],
        },
      ],
    };
    await render('/hoc-vien/7');
    await screen.findByText('Nhóm: Nhập môn');
    await waitFor(() =>
      expect(screen.queryByText('Lịch sử chuyển nhóm')).not.toBeInTheDocument(),
    );
  });

  it('names the group in the header of the student file', async () => {
    await render('/hoc-vien/7');
    expect(await screen.findByText('Nhóm: Nhập môn')).toBeInTheDocument();
  });
});
