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
import LopChiTietPage from '../../client/pages/edu/lop-chi-tiet.js';
import { groupBlocks } from '../../client/pages/edu/nhom.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

const groups = [
  { id: 31, lopId: 3, ten: 'Nhập môn', thuTu: 1, trangThai: 'hoat_dong' },
  { id: 32, lopId: 3, ten: 'Cơ bản', thuTu: 2, trangThai: 'hoat_dong' },
  { id: 33, lopId: 3, ten: 'Nâng cao cũ', thuTu: 3, trangThai: 'an' },
];
const students = [
  {
    id: 7,
    ma: 'HS00007',
    hoTen: 'Học viên Mẫu 07',
    lopId: 3,
    nhomId: 31,
    trangThai: 'dang_hoc',
    soBuoiConLai: 5,
  },
  {
    id: 8,
    ma: 'HS00008',
    hoTen: 'Học viên Mẫu 08',
    lopId: 3,
    nhomId: 32,
    trangThai: 'dang_hoc',
    soBuoiConLai: 5,
  },
  {
    id: 9,
    ma: 'HS00009',
    hoTen: 'Học viên Mẫu 09',
    lopId: 3,
    nhomId: null,
    trangThai: 'dang_hoc',
    soBuoiConLai: 5,
  },
];

let permissions: AuthorizationSnapshot;
let groupRows: typeof groups = groups;
let updateFails: string | undefined;
const getSession = vi.fn(async () => ({ data: null }));
const lop = {
  id: 3,
  ma: 'L3',
  ten: 'Lớp Mẫu 3',
  coSoId: 1,
  levelKey: 'ma',
  trangThai: 'dang_mo',
};
const api = vi.fn(({ method, path, json }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'lop/findOne') return { data: lop };
  if (path === 'lop/findMany') return { data: [lop] };
  if (path === 'coSo/findMany')
    return { data: [{ id: 1, ten: 'Cơ sở Mẫu 1' }] };
  if (path === 'lopNhom/findMany') {
    const filter = JSON.stringify((json as { filter?: unknown })?.filter ?? '');
    // The groups of one class, or the groups with these ids (a list showing the group of its rows).
    return {
      data: filter.includes('"lopId"')
        ? groupRows
        : groupRows.filter((g) => filter.includes(`"value":${g.id}`)),
    };
  }
  if (path === 'lopNhom/count') return { data: groupRows.length };
  if (path === 'lopNhom/updateOne') {
    if (updateFails)
      return Response.json({ error: { reason: updateFails } }, { status: 400 });
    return { data: { record: {} } };
  }
  if (path === 'lopNhom/createOne') return { data: { record: {} } };
  if (path === 'hocVien/findMany') return { data: students };
  if (path === 'hocVien/count') return { data: students.length };
  if (path === '/hocVien/chuyenNhom' || path === 'hocVien/chuyenNhom')
    return { data: { moved: true } };
  if (path === 'lopNhom/taoMacDinh' || path === '/lopNhom/taoMacDinh')
    return { data: { created: true } };
  if (path === 'lopLich/findMany' || path === 'buoiHoc/findMany')
    return { data: [] };
  if (path === 'lopLich/count' || path === 'buoiHoc/count') return { data: 0 };
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
  if (path === 'diemDanh/giaoVien') return { data: [] };
  if (path === 'diemDanh/traCuu')
    return {
      data: [],
      meta: {
        count: 0,
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
          path='/lop/:id'
          element={
            <>
              <LopChiTietPage />
              <Where />
            </>
          }
        />
        <Route
          path='/diem-danh'
          element={
            <>
              <DiemDanhPage />
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

const grant = (action: string) => ({
  resource: { type: 'composite' as const, id: 'edu.lopNhom' },
  actions: [action],
});
/** The first table of the tab: the groups (the second one lists the students). */
const groupTable = async () =>
  within((await screen.findAllByRole('table'))[0] as HTMLElement);
const callsTo = (path: string) =>
  api.mock.calls.map(([call]) => call).filter((call) => call.path === path);
const where = () => screen.getByTestId('where').textContent ?? '';

describe('the groups tab of a class', () => {
  beforeEach(() => {
    api.mockClear();
    groupRows = groups;
    updateFails = undefined;
    permissions = { unrestricted: false, permissions: [grant('view')] };
  });

  it('is offered only to a person who may view groups, and lives in the address', async () => {
    permissions = { unrestricted: false, permissions: [] };
    await render('/lop/3?tab=groups');
    await screen.findByRole('tab', { name: 'Thông tin' });
    expect(screen.queryByRole('tab', { name: 'Nhóm' })).not.toBeInTheDocument();
  });

  it('lists the groups with their size and status, and the students with their group, without buttons for a viewer', async () => {
    await render('/lop/3?tab=groups');
    const table = await groupTable();
    expect(
      await table.findByRole('cell', { name: 'Nhập môn' }),
    ).toBeInTheDocument();
    expect(table.getByRole('cell', { name: 'Cơ bản' })).toBeInTheDocument();
    expect(screen.getByText('Đã ẩn')).toBeInTheDocument();
    expect(screen.getAllByText('Đang dùng')).toHaveLength(2);
    expect(await screen.findByText('Học viên Mẫu 09')).toBeInTheDocument();
    // A viewer cannot add, edit, hide or place anybody.
    expect(
      screen.queryByRole('button', { name: 'Thêm nhóm' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ẩn' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(where()).toBe('/lop/3?tab=groups');
  });

  it('adds, hides and shows a group through the record API', async () => {
    permissions = {
      unrestricted: false,
      permissions: [grant('view'), grant('manage')],
    };
    await render('/lop/3?tab=groups');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Thêm nhóm' }),
    );
    await userEvent.type(
      await screen.findByLabelText('Tên nhóm'),
      '  Thi đấu ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(callsTo('lopNhom/createOne')[0]?.json).toMatchObject({
        values: { lopId: 3, ten: 'Thi đấu', thuTu: 4 },
      }),
    );

    const row = (
      await (await groupTable()).findByRole('cell', { name: 'Cơ bản' })
    ).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Ẩn' }));
    await waitFor(() =>
      expect(callsTo('lopNhom/updateOne')[0]?.json).toMatchObject({
        filter: { id: 32 },
        values: { trangThai: 'an' },
      }),
    );
    const hidden = (await groupTable())
      .getByRole('cell', { name: 'Nâng cao cũ' })
      .closest('tr') as HTMLElement;
    await userEvent.click(
      within(hidden).getByRole('button', { name: 'Hiện lại' }),
    );
    await waitFor(() =>
      expect(callsTo('lopNhom/updateOne').at(-1)?.json).toMatchObject({
        filter: { id: 33 },
        values: { trangThai: 'hoat_dong' },
      }),
    );
  });

  it('says why a group with students cannot be hidden', async () => {
    permissions = {
      unrestricted: false,
      permissions: [grant('view'), grant('manage')],
    };
    updateFails = 'EDU_GROUP_NOT_EMPTY';
    await render('/lop/3?tab=groups');
    const row = (
      await (await groupTable()).findByRole('cell', { name: 'Nhập môn' })
    ).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Ẩn' }));
    expect(
      await screen.findByText(
        'Hãy chuyển hết học viên ra khỏi nhóm trước khi ẩn.',
      ),
    ).toBeInTheDocument();
  });

  it('places a student in a group, or in none, through the business route', async () => {
    permissions = {
      unrestricted: false,
      permissions: [grant('view'), grant('manage')],
    };
    await render('/lop/3?tab=groups');
    const select = (await screen.findByLabelText(
      'Nhóm – Học viên Mẫu 09',
    )) as HTMLSelectElement;
    // Only groups in use are offered.
    expect([...select.options].map((o) => o.text)).toEqual([
      'Chưa phân nhóm',
      'Nhập môn',
      'Cơ bản',
    ]);
    await userEvent.selectOptions(select, '31');
    await waitFor(() =>
      expect(callsTo('hocVien/chuyenNhom')[0]?.json).toEqual({
        hocVienId: 9,
        nhomId: 31,
      }),
    );
    expect(await screen.findByText('Đã chuyển nhóm.')).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByLabelText('Nhóm – Học viên Mẫu 07'),
      '',
    );
    await waitFor(() =>
      expect(callsTo('hocVien/chuyenNhom').at(-1)?.json).toEqual({
        hocVienId: 7,
        nhomId: null,
      }),
    );
  });

  it('offers the default groups for a class that has none', async () => {
    groupRows = [];
    permissions = {
      unrestricted: false,
      permissions: [grant('view'), grant('manage')],
    };
    await render('/lop/3?tab=groups');
    await userEvent.click(
      await screen.findByRole('button', {
        name: /Tạo 3 nhóm mặc định/u,
      }),
    );
    await waitFor(() =>
      expect(callsTo('lopNhom/taoMacDinh')[0]?.json).toEqual({ lopId: 3 }),
    );
  });
});

describe('attendance blocks by group and the group filter of the register', () => {
  beforeEach(() => {
    api.mockClear();
    groupRows = groups;
    permissions = { unrestricted: false, permissions: [] };
  });

  it('draws one header per group, the unsorted students last', async () => {
    await render('/diem-danh?buoi=5');
    expect(await screen.findByText('Học viên Mẫu 07')).toBeInTheDocument();
    const headers = ['Nhập môn', 'Cơ bản', 'Chưa phân nhóm'].map((name) =>
      screen.getByText(name, { selector: 'td' }),
    );
    // In order on the page: the groups by their order, then the unsorted ones.
    const text = document.body.textContent ?? '';
    expect(headers).toHaveLength(3);
    expect(text.indexOf('Nhập môn')).toBeLessThan(text.indexOf('Cơ bản'));
    expect(text.indexOf('Cơ bản')).toBeLessThan(text.indexOf('Chưa phân nhóm'));
    expect(text.indexOf('Học viên Mẫu 09')).toBeGreaterThan(
      text.indexOf('Chưa phân nhóm'),
    );
  });

  it('shows the group filter once a class is chosen, and sends it', async () => {
    await render('/diem-danh?tab=so&lop=3&nhom=32');
    await waitFor(() =>
      expect(callsTo('diemDanh/traCuu').at(-1)?.json).toMatchObject({
        lopId: 3,
        nhomId: 32,
      }),
    );
    const filter = (await screen.findByLabelText('Nhóm')) as HTMLSelectElement;
    // Only the groups in use of that class; hidden ones are not offered.
    expect([...filter.options].map((o) => o.text)).toEqual([
      'Tất cả nhóm',
      'Nhập môn',
      'Cơ bản',
    ]);
    await userEvent.selectOptions(filter, '31');
    await waitFor(() => expect(where()).toContain('nhom=31'));
    // Changing the class drops the group (a group belongs to one class).
    await userEvent.selectOptions(screen.getByLabelText('Lớp'), '');
    await waitFor(() => expect(where()).not.toContain('nhom='));
    expect(screen.queryByLabelText('Nhóm')).not.toBeInTheDocument();
  });

  it('does not offer the group filter without a class', async () => {
    await render('/diem-danh?tab=so');
    await screen.findByLabelText('Lớp');
    expect(screen.queryByLabelText('Nhóm')).not.toBeInTheDocument();
  });
});

describe('groupBlocks', () => {
  const rows = (...ids: (number | null)[]) =>
    ids.map((nhomId, index) => ({ id: index + 1, nhomId }));
  const named = groups.map((g) => ({ ...g }));

  it('is one plain list when nobody is in a group', () => {
    expect(groupBlocks(rows(null, null), named, 'Chưa')).toEqual([
      { key: 'all', title: undefined, students: rows(null, null) },
    ]);
  });

  it('orders blocks like the groups, keeps unsorted students last and never loses one', () => {
    const roster = rows(32, null, 31, 99, 32);
    const blocks = groupBlocks(roster, named, 'Chưa phân nhóm');
    expect(blocks.map((b) => b.title)).toEqual([
      'Nhập môn',
      'Cơ bản',
      'Chưa phân nhóm',
    ]);
    expect(blocks.map((b) => b.students.length)).toEqual([1, 2, 2]);
    // A student of a group the caller cannot read stays in the roster, with the unsorted ones.
    expect(blocks.flatMap((b) => b.students)).toHaveLength(roster.length);
  });

  it('keeps a hidden group while a student is still in it, and drops empty groups', () => {
    const blocks = groupBlocks(rows(33), named, 'Chưa');
    expect(blocks.map((b) => b.title)).toEqual(['Nâng cao cũ']);
  });
});
