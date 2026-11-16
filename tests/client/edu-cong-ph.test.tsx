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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HocVienChiTietPage from '../../client/pages/edu/hoc-vien-chi-tiet.js';
import PortalPage from '../../client/pages/ph/index.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

// The parents' private link: the page a parent opens and the buttons on the student's file. Names are made up.

const TOKEN = 'A'.repeat(43);

let portalStatus = 200;
let permissions: AuthorizationSnapshot = {
  unrestricted: true,
  permissions: [],
};
let links: Record<string, unknown>[] = [];
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'congPhuHuynh/xem') {
    if (portalStatus === 404)
      return Response.json(
        {
          error: {
            code: 404,
            status: 'NOT_FOUND',
            reason: 'EDU_LINK_NOT_FOUND',
          },
        },
        { status: 404 },
      );
    if (portalStatus === 429)
      return Response.json(
        {
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            reason: 'EDU_LINK_RATE_LIMITED',
          },
        },
        { status: 429 },
      );
    return {
      data: {
        tenGoi: 'Học V. M. A',
        capDo: 'Mã',
        lop: 'Lớp Mẫu 3',
        soBuoiConLai: 7,
        cacBuoi: [
          {
            ngay: '2026-11-09',
            trangThai: 'co_mat',
            daLamBtvn: true,
            yThuc: 8,
            kienThucMoi: 'Nhập thành',
            giaoBtvn: 'Làm 5 bài chiếu hết',
            nhanXet: 'Tập trung tốt',
          },
          {
            ngay: '2026-11-02',
            trangThai: 'vang_co_phep',
            daLamBtvn: false,
            yThuc: null,
            kienThucMoi: '',
            giaoBtvn: '',
            nhanXet: '',
          },
        ],
        nhanXetThang: {
          thang: '2026-10',
          noiDung: 'Tháng này con tiến bộ rõ.',
        },
        hanLuc: '2027-02-14T00:00:00.000Z',
      },
    };
  }
  if (path === 'hocVien/findOne')
    return {
      data: {
        id: 7,
        ma: 'HS00007',
        hoTen: 'Học viên Mẫu 07',
        namSinh: 2016,
        levelKey: 'ma',
        levelOrder: 2,
        lopId: 3,
        coSoId: 1,
        trangThai: 'dang_hoc',
        soBuoiConLai: 4,
      },
    };
  if (path === 'lop/findOne')
    return { data: { id: 3, ma: 'L3', ten: 'Lớp Mẫu 3', coSoId: 1 } };
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
  if (path === 'congPhuHuynh/danhSach') return { data: links };
  if (path === 'congPhuHuynh/taoLink')
    return {
      data: { id: 5, token: TOKEN, hanLuc: '2027-02-14T00:00:00.000Z' },
    };
  if (path === 'congPhuHuynh/thuHoi') return { data: { id: 5 } };
  return new Response(null, { status: 404 });
});

const wrap = (route: string, children: React.ReactNode) =>
  renderWithApp(
    <AuthenticationProvider>
      <Routes>{children}</Routes>
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

const callsTo = (path: string) =>
  api.mock.calls.map(([call]) => call).filter((call) => call.path === path);

describe('the page a parent opens', () => {
  beforeEach(() => {
    api.mockClear();
    portalStatus = 200;
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('sends the token from the address in a body and shows what a family may read', async () => {
    window.location.hash = `#${TOKEN}`;
    await wrap('/ph', <Route path='/ph' element={<PortalPage />} />);
    expect(await screen.findByText('Học V. M. A')).toBeInTheDocument();
    expect(screen.getByText('Mã')).toBeInTheDocument();
    expect(screen.getByText('7 buổi')).toBeInTheDocument();
    expect(screen.getByText('09/11/2026')).toBeInTheDocument();
    expect(screen.getByText('Có mặt')).toBeInTheDocument();
    expect(screen.getByText('Vắng có phép')).toBeInTheDocument();
    expect(screen.getByText('Nhập thành')).toBeInTheDocument();
    expect(screen.getByText('Làm 5 bài chiếu hết')).toBeInTheDocument();
    expect(screen.getByText('Tập trung tốt')).toBeInTheDocument();
    expect(screen.getByText(/Ý thức học: 8\/10/u)).toBeInTheDocument();
    expect(screen.getByText('Nhận xét tháng 2026-10')).toBeInTheDocument();
    expect(screen.getByText('Tháng này con tiến bộ rõ.')).toBeInTheDocument();
    // The token travels in the body: never in the path or the query.
    const call = callsTo('congPhuHuynh/xem')[0];
    expect(call?.json).toEqual({ token: TOKEN });
    expect(JSON.stringify(call?.path)).not.toContain(TOKEN);
    // Nothing is read that the page does not need.
    expect(callsTo('hocVien/findOne')).toHaveLength(0);
    // Kept out of search engines while it is open.
    expect(document.head.querySelector('meta[name=robots]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
  });

  it('says the same thing for a link that is wrong, expired or revoked', async () => {
    portalStatus = 404;
    window.location.hash = `#${TOKEN}`;
    await wrap('/ph', <Route path='/ph' element={<PortalPage />} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đường dẫn này không còn dùng được',
    );
  });

  it('asks the parent to wait after too many requests, and does nothing without a token', async () => {
    portalStatus = 429;
    window.location.hash = `#${TOKEN}`;
    const first = await wrap(
      '/ph',
      <Route path='/ph' element={<PortalPage />} />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'thử lại sau một phút',
    );
    first.unmount();

    api.mockClear();
    window.location.hash = '';
    await wrap('/ph', <Route path='/ph' element={<PortalPage />} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Thiếu mã trong đường dẫn',
    );
    expect(callsTo('congPhuHuynh/xem')).toHaveLength(0);
  });
});

describe('the Parents tab of a student file', () => {
  const file = () =>
    wrap(
      '/hoc-vien/7',
      <Route path='/hoc-vien/:id' element={<HocVienChiTietPage />} />,
    );
  const grant = (...ids: [string, string[]][]): AuthorizationSnapshot => ({
    unrestricted: false,
    permissions: ids.map(([id, actions]) => ({
      resource: { type: 'composite' as const, id },
      actions,
    })),
  });

  beforeEach(() => {
    api.mockClear();
    links = [];
  });

  it('makes a link, shows it once with a copy button and asks for it with the parent and the student', async () => {
    permissions = grant(
      ['edu.hocVien', ['view']],
      ['edu.phuHuynh', ['view']],
      ['edu.congPhuHuynh', ['view', 'manage']],
    );
    await file();
    await userEvent.click(
      await screen.findByRole('tab', { name: 'Phụ huynh' }),
    );
    expect(
      (await screen.findAllByText('Phụ huynh Mẫu 11')).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByText('Chưa có link')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo link' }));
    const dialog = await screen.findByRole('dialog');
    const url = within(dialog).getByLabelText('Đường dẫn') as HTMLInputElement;
    expect(url.value).toMatch(new RegExp(`/ph#${TOKEN}$`, 'u'));
    expect(callsTo('congPhuHuynh/taoLink')[0]?.json).toEqual({
      hocVienId: 7,
      phuHuynhId: 11,
    });
    expect(
      within(dialog).getByRole('button', { name: 'Sao chép' }),
    ).toBeInTheDocument();
  });

  it('shows the validity and the last time a link was opened, and revokes it', async () => {
    permissions = grant(
      ['edu.hocVien', ['view']],
      ['edu.phuHuynh', ['view']],
      ['edu.congPhuHuynh', ['view', 'manage']],
    );
    links = [
      {
        id: 5,
        hocVienId: 7,
        phuHuynhId: 11,
        hanLuc: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        thuHoiLuc: null,
        xemCuoiLuc: '2026-11-10T03:00:00.000Z',
        soLanXem: 3,
        createdAt: '2026-11-01T03:00:00.000Z',
      },
    ];
    await file();
    await userEvent.click(
      await screen.findByRole('tab', { name: 'Phụ huynh' }),
    );
    expect(await screen.findByText(/Dùng được đến/u)).toBeInTheDocument();
    expect(
      screen.getByText(/Đã xem 3 lần, lần cuối 10\/11\/2026/u),
    ).toBeInTheDocument();
    // A live link offers a new one (which replaces it) and revoking.
    expect(
      screen.getByRole('button', { name: 'Tạo link mới' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thu hồi' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Thu hồi' }),
    );
    await waitFor(() =>
      expect(callsTo('congPhuHuynh/thuHoi')[0]?.json).toEqual({ id: 5 }),
    );
  });

  it('shows nothing about links to someone who does not hold the resource, and no make button to a viewer', async () => {
    permissions = grant(['edu.hocVien', ['view']], ['edu.phuHuynh', ['view']]);
    await file();
    await userEvent.click(
      await screen.findByRole('tab', { name: 'Phụ huynh' }),
    );
    expect(
      (await screen.findAllByText('Phụ huynh Mẫu 11')).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText('Link riêng cho phụ huynh'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Tạo link' }),
    ).not.toBeInTheDocument();
    expect(callsTo('congPhuHuynh/danhSach')).toHaveLength(0);
  });
});
