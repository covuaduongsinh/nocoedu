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
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HocPhiPage from '../../client/pages/edu/hoc-phi.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

let permissions: AuthorizationSnapshot;
const getSession = vi.fn(async () => ({ data: null }));
const students = [
  {
    id: 7,
    ma: 'HS7',
    hoTen: 'Học viên Mẫu 01',
    lopId: 1,
    trangThai: 'dang_hoc',
    soBuoiConLai: 3,
  },
  {
    id: 8,
    ma: 'HS8',
    hoTen: 'Học viên Mẫu 02',
    lopId: 1,
    trangThai: 'dang_hoc',
    soBuoiConLai: -2,
  },
];
const api = vi.fn(({ method, path, json }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'hocVien/findMany') {
    // The search text is read by the server: the answer holds the students whose name or code contains it.
    const needle = JSON.stringify(json).toLowerCase();
    // A lookup by ids (the names a page of payments needs) answers with the students of those ids.
    if (needle.includes('"path":["id"],"operator":"$eq"'))
      return { data: students };
    return {
      data: students.filter(
        (row) =>
          needle.includes(row.ma.toLowerCase()) ||
          needle.includes(row.hoTen.toLowerCase()) ||
          needle.includes('mẫu 0' + (row.id === 7 ? '1' : '2')),
      ),
    };
  }
  if (path === 'hocVien/count') return { data: 1 };
  if (path === 'hocVien/findOne') {
    const id = (json as { filter: { id: number } }).filter.id;
    return { data: students.find((row) => row.id === id) ?? null };
  }
  if (path === 'lop/findMany')
    return { data: [{ id: 1, ma: 'L1', ten: 'Lớp Mẫu 01' }] };
  if (path === 'goiHoc/findMany' || path === 'goiHoc/count')
    return { data: path.endsWith('count') ? 0 : [] };
  if (path === 'soDu/canhBao') {
    const { trang, limit } = json as { trang: number; limit: number };
    return {
      data: {
        nguong: 2,
        tong: 1,
        hocVien: trang === 1 && limit > 0 ? [students[1]] : [],
      },
    };
  }
  if (path === 'thanhToan/findMany')
    return {
      data: [
        {
          id: 1,
          hocVienId: 8,
          soTien: 600000,
          hinhThuc: 'chuyen_khoan',
          ngay: '2026-11-02',
          thang: '2026-11',
          noiDungCk: 'HP HS8',
        },
      ],
    };
  if (path === 'thanhToan/count') return { data: 1 };
  if (path === 'baoCao/xem')
    return { data: { rows: [{ doanhThu: 600000, soKhoan: 1 }] } };
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

describe('tuition page', () => {
  beforeEach(() => {
    api.mockClear();
    permissions = { unrestricted: true, permissions: [] };
  });

  const callsTo = (path: string) =>
    api.mock.calls.map(([call]) => call).filter((call) => call.path === path);

  // The cashier looks a student up on the server (25 a page), nothing is read until the person types, and the text is
  // kept in the address.
  it('finds a student by name or code on the server and shows nobody before that', async () => {
    await render(<HocPhiPage />, '/hoc-phi', '/hoc-phi');
    const search = await screen.findByPlaceholderText(
      /Nhập tên hoặc mã học viên/u,
    );
    expect(callsTo('hocVien/findMany')).toHaveLength(0);
    expect(screen.queryByText('Học viên Mẫu 01')).not.toBeInTheDocument();

    await userEvent.type(search, 'mẫu 01');
    expect(await screen.findByText('Học viên Mẫu 01')).toBeInTheDocument();
    expect(screen.queryByText('Học viên Mẫu 02')).not.toBeInTheDocument();
    expect(callsTo('hocVien/findMany')[0]?.json).toMatchObject({
      limit: 25,
      offset: 0,
    });

    await userEvent.clear(search);
    await userEvent.type(search, 'hs8');
    expect(await screen.findByText('Học viên Mẫu 02')).toBeInTheDocument();
    expect(screen.getAllByText('Vượt 2 buổi').length).toBeGreaterThan(0);
  });

  it('opens on the student a link names: ?search= with a full code serves that student', async () => {
    await render(<HocPhiPage />, '/hoc-phi?search=HS8', '/hoc-phi');
    expect(
      await screen.findByRole('heading', { name: 'Học viên Mẫu 02' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở hồ sơ' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/hoc-vien\/8$/u),
    );
    // The old "Xem phiếu đối soát" button is a link to the student file now.
    expect(screen.queryByText(/phiếu đối soát/u)).not.toBeInTheDocument();
  });

  it('lists in "Cần thu" what the server lists, the same students and threshold as the home page', async () => {
    await render(<HocPhiPage />, '/hoc-phi?tab=can-thu', '/hoc-phi');
    expect(await screen.findByText('Học viên Mẫu 02')).toBeInTheDocument();
    expect(screen.queryByText('Học viên Mẫu 01')).not.toBeInTheDocument();
    // The tab carries the total of that list, and asks for 25 a page.
    expect(screen.getByRole('tab', { name: /Cần thu/u })).toHaveTextContent(
      '1',
    );
    expect(callsTo('soDu/canhBao')[0]?.json).toMatchObject({
      trang: 1,
      limit: 25,
    });
    // The list is not computed from every student on the client.
    expect(callsTo('hocVien/findMany')).toHaveLength(0);
  });

  it('keeps the tab in the address', async () => {
    await render(<HocPhiPage />, '/hoc-phi', '/hoc-phi');
    await userEvent.click(await screen.findByRole('tab', { name: 'Sổ quỹ' }));
    expect(screen.getByRole('tab', { name: 'Sổ quỹ' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('HP HS8')).toBeInTheDocument();
  });

  it('shows the cash book of a month with the name of the student', async () => {
    await render(
      <HocPhiPage />,
      '/hoc-phi?tab=ledger&thang=2026-11',
      '/hoc-phi',
    );
    // The month is a filter of the server read; the payment names its student instead of "#id".
    expect(
      await screen.findByRole('link', { name: 'Học viên Mẫu 02 (HS8)' }),
    ).toBeInTheDocument();
    expect(callsTo('thanhToan/findMany')[0]?.json).toMatchObject({
      limit: 25,
      offset: 0,
    });
    expect(JSON.stringify(callsTo('thanhToan/findMany')[0]?.json)).toContain(
      '2026-11',
    );
    expect(
      await screen.findByText('Tổng thu tháng 2026-11'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Học viên #8/u)).not.toBeInTheDocument();
  });

  it('offers the CSV export only to a person who holds the export action of the reports', async () => {
    permissions = { unrestricted: false, permissions: [] };
    await render(<HocPhiPage />, '/hoc-phi', '/hoc-phi');
    await screen.findByPlaceholderText(/Nhập tên hoặc mã học viên/u);
    expect(
      screen.queryByRole('button', { name: /Xuất CSV/u }),
    ).not.toBeInTheDocument();
  });

  it('shows the CSV export when the person may export', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.baoCao' },
          actions: ['export'],
        },
      ],
    };
    await render(<HocPhiPage />, '/hoc-phi', '/hoc-phi');
    expect(
      await screen.findByRole('button', { name: /Xuất CSV/u }),
    ).toBeInTheDocument();
  });
});
