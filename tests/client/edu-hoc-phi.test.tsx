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

import HocPhiPage from '../../client/pages/edu/hoc-phi/index.js';
import PhieuThuPage from '../../client/pages/edu/hoc-phi/phieu-thu.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

// Made-up student, package and amounts.
const student = {
  id: 7,
  ma: 'HS7',
  hoTen: 'Học viên Mẫu 01',
  lopId: 1,
  trangThai: 'dang_hoc',
  soBuoiConLai: 3,
};
const packages = {
  goi: [
    {
      id: 21,
      ngayMua: '2026-11-01',
      soBuoi: 12,
      donGia: 120000,
      thanhTien: 1440000,
      trangThai: 'hieu_luc',
      loai: 'mua',
      daThu: 940000,
      conNo: 500000,
    },
  ],
  thanhToan: [
    {
      id: 90,
      goiHocId: 21,
      soPhieu: 'PT-2026-000001',
      ngay: '2026-11-02',
      soTien: 940000,
      hinhThuc: 'chuyen_khoan',
      noiDungCk: 'HS7 G21',
    },
  ],
};

let permissions: AuthorizationSnapshot;
let receiptFound = true;
/** The operation key each write arrived with. */
const keys: { path: string; key: string | null }[] = [];
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path, json }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'hocVien/findMany') return { data: [student] };
  if (path === 'hocVien/count') return { data: 60 };
  if (path === 'hocVien/findOne') return { data: student };
  if (path === 'lop/findMany')
    return { data: [{ id: 1, ma: 'L1', ten: 'Lớp Mẫu 1' }] };
  if (path === 'goiHoc/cuaHocVien') return { data: packages };
  if (path === 'thanhToan/ghiNhan')
    return { data: { id: 91, conNo: 0, soPhieu: 'PT-2026-000002' } };
  if (path === 'soDu/dieuChinh')
    return {
      data: { soBuoiConLai: (json as { soDuMoi: number }).soDuMoi, thayDoi: 2 },
    };
  if (path === 'soDu/canhBao')
    return {
      data: [
        {
          id: 7,
          ma: 'HS7',
          hoTen: 'Học viên Mẫu 01',
          lopId: 1,
          soBuoiConLai: -1,
        },
      ],
    };
  if (path === 'baoCao/xem')
    return {
      data: {
        columns: [],
        rows:
          (json as { loai: string }).loai === 'congNo'
            ? [
                {
                  hocVienId: 8,
                  ma: 'HS8',
                  hoTen: 'Học viên Mẫu 02',
                  lop: 'Lớp Mẫu 1',
                  soGoiNo: 1,
                  conNo: 700000,
                  noTuNgay: '2026-11-05',
                },
              ]
            : [{ doanhThu: 940000, tienMat: 0, chuyenKhoan: 940000, khac: 0 }],
      },
    };
  if (path === 'thanhToan/findMany')
    return {
      data: [
        {
          id: 90,
          hocVienId: 7,
          soPhieu: 'PT-2026-000001',
          ngay: '2026-11-02',
          soTien: 940000,
          hinhThuc: 'chuyen_khoan',
          noiDungCk: 'HS7 G21',
        },
      ],
    };
  if (path === 'thanhToan/count') return { data: 1 };
  if (path === 'thanhToan/phieuThu')
    return receiptFound
      ? {
          data: {
            id: 90,
            soPhieu: 'PT-2026-000001',
            ngay: '2026-11-02',
            soTien: 1440000,
            hinhThuc: 'chuyen_khoan',
            noiDungCk: 'HS7 G21',
            nguoiThu: 'Kế toán Mẫu',
            coSo: { ten: 'Cơ sở Mẫu A', diaChi: null },
            hocVien: { ma: 'HS7', hoTen: 'Học viên Mẫu 01', lop: 'Lớp Mẫu 1' },
            goiHoc: {
              soBuoi: 12,
              thanhTien: 1440000,
              ngayMua: '2026-11-01',
              daThu: 1440000,
              conNo: 0,
            },
          },
        }
      : new Response(
          JSON.stringify({
            error: {
              status: 'NOT_FOUND',
              code: 404,
              message: 'Payment not found.',
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                  reason: 'EDU_PAYMENT_NOT_FOUND',
                  domain: 'edu',
                },
              ],
            },
          }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
  return new Response(null, { status: 404 });
});

async function render(route: string) {
  const answer = answerApi(api);
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/hoc-phi' element={<HocPhiPage />} />
        <Route path='/hoc-phi/phieu-thu/:id' element={<PhieuThuPage />} />
      </Routes>
    </AuthenticationProvider>,
    {
      route,
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: viVN },
      fetch: (request: Request) => {
        if (request.method === 'POST')
          keys.push({
            path: new URL(request.url).pathname,
            key: request.headers.get('idempotency-key'),
          });
        return answer(request);
      },
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

const grant = (...entries: [id: string, ...actions: string[]][]): void => {
  permissions = {
    unrestricted: false,
    permissions: entries.map(([id, ...actions]) => ({
      resource: { type: 'composite', id },
      actions,
    })),
  };
};

describe('tuition page', () => {
  beforeEach(() => {
    api.mockClear();
    keys.length = 0;
    receiptFound = true;
    permissions = { unrestricted: true, permissions: [] };
  });

  it('pages the students on the server and searches by name or code', async () => {
    await render('/hoc-phi');
    expect(await screen.findByText('Học viên Mẫu 01')).toBeInTheDocument();
    const first = api.mock.calls.find(
      ([request]) => request.path === 'hocVien/findMany',
    )?.[0];
    expect(first?.json).toMatchObject({ limit: 25, offset: 0 });
    await userEvent.type(screen.getByRole('searchbox'), 'mẫu');
    await waitFor(() =>
      expect(
        api.mock.calls.some(
          ([request]) =>
            request.path === 'hocVien/findMany' &&
            JSON.stringify(request.json).includes('mẫu'),
        ),
      ).toBe(true),
    );
  });

  it('starts from the search a link brought along', async () => {
    await render('/hoc-phi?search=HS7');
    await screen.findByText('Học viên Mẫu 01');
    expect(screen.getByRole('searchbox')).toHaveValue('HS7');
    expect(
      api.mock.calls.some(
        ([request]) =>
          request.path === 'hocVien/findMany' &&
          JSON.stringify(request.json).includes('HS7'),
      ),
    ).toBe(true);
  });

  it('shows what a student owes and records a payment once, with a link to its receipt', async () => {
    await render('/hoc-phi?hocVien=7');
    expect(await screen.findByText('1.440.000')).toBeInTheDocument();
    // Paid and owed are the server's figures.
    expect(screen.getByText('500.000')).toBeInTheDocument();
    expect(screen.getByText('PT-2026-000001')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thu tiền' }));
    const dialog = await screen.findByRole('dialog');
    // The amount still owed is offered as the amount to pay.
    expect(within(dialog).getByLabelText('Số tiền (đồng)')).toHaveValue(500000);
    const submit = within(dialog).getByRole('button', { name: 'Ghi nhận' });
    // A double click is one request.
    await userEvent.dblClick(submit);
    expect(
      await screen.findByText(
        /Đã ghi nhận 500\.000 đồng, phiếu PT-2026-000002/u,
      ),
    ).toBeInTheDocument();
    const sent = api.mock.calls.filter(
      ([request]) => request.path === 'thanhToan/ghiNhan',
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.[0].json).toMatchObject({
      goiHocId: 21,
      soTien: 500000,
      hinhThuc: 'chuyen_khoan',
    });
    // The write carries an operation key in the standard form.
    const key = keys.find((entry) =>
      entry.path.endsWith('/thanhToan/ghiNhan'),
    )?.key;
    expect(key).toMatch(/^\d{13}\.[0-9a-f-]{36}$/u);
    const status = screen.getByRole('status');
    expect(
      within(status).getByRole('link', { name: 'In phiếu thu' }),
    ).toHaveAttribute('href', expect.stringContaining('/hoc-phi/phieu-thu/91'));
  });

  it('offers selling, payments and adjusting only to those who hold the action', async () => {
    // Somebody who only views packages: no payments, no actions.
    grant(['edu.goiHoc', 'view'], ['edu.hocVien', 'view']);
    const view = await render('/hoc-phi?hocVien=7');
    await screen.findByText('1.440.000');
    expect(screen.queryByRole('button', { name: 'Bán gói buổi' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thu tiền' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Điều chỉnh số dư' }),
    ).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Sổ thu' })).toBeNull();
    view.unmount();

    grant(['edu.goiHoc', 'view'], ['edu.soDu', 'view', 'adjust']);
    await render('/hoc-phi?hocVien=7');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Điều chỉnh số dư' }),
    );
    const dialog = await screen.findByRole('dialog');
    const target = within(dialog).getByLabelText('Số buổi đúng');
    expect(target).toHaveValue(3);
    await userEvent.clear(target);
    await userEvent.type(target, '5');
    await userEvent.type(
      within(dialog).getByLabelText('Lý do'),
      'Tặng 2 buổi học bù',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Điều chỉnh' }),
    );
    expect(
      await screen.findByText('Đã điều chỉnh. Số buổi còn lại: 5.'),
    ).toBeInTheDocument();
    const adjusted = api.mock.calls.find(
      ([request]) => request.path === 'soDu/dieuChinh',
    )?.[0];
    // The balance the person looked at goes along, so a change made meanwhile is refused by the server.
    expect(adjusted?.json).toEqual({
      hocVienId: 7,
      soDuHienTai: 3,
      soDuMoi: 5,
      lyDo: 'Tặng 2 buổi học bù',
    });
  });

  it('lists who to collect from and opens the cashier on that student', async () => {
    await render('/hoc-phi?tab=can-thu');
    expect(await screen.findByText('Âm 1 buổi')).toBeInTheDocument();
    expect(await screen.findByText('Học viên Mẫu 02')).toBeInTheDocument();
    expect(screen.getByText('700.000')).toBeInTheDocument();
    const [open] = screen.getAllByRole('button', { name: 'Thu học phí' });
    await userEvent.click(open!);
    // The cashier shows that student's packages.
    expect(await screen.findByText('Gói buổi đã mua')).toBeInTheDocument();
    expect(
      api.mock.calls.some(
        ([request]) =>
          request.path === 'goiHoc/cuaHocVien' &&
          (request.json as { hocVienId: number }).hocVienId === 7,
      ),
    ).toBe(true);
  });

  it('shows the payments of a month with the totals of the revenue report', async () => {
    await render('/hoc-phi?tab=so-thu');
    expect(await screen.findByText('PT-2026-000001')).toBeInTheDocument();
    expect(await screen.findByText('Học viên Mẫu 01')).toBeInTheDocument();
    expect(await screen.findByText('Tổng thu trong tháng')).toBeInTheDocument();
    const page = api.mock.calls.find(
      ([request]) => request.path === 'thanhToan/findMany',
    )?.[0];
    expect(JSON.stringify(page?.json)).toMatch(/"thang".*\d{4}-\d{2}/u);
  });
});

describe('tuition receipt', () => {
  beforeEach(() => {
    api.mockClear();
    receiptFound = true;
    permissions = { unrestricted: true, permissions: [] };
  });

  it('states the payment, the amount in words and what is still owed', async () => {
    await render('/hoc-phi/phieu-thu/90');
    expect(await screen.findAllByText('PT-2026-000001')).not.toHaveLength(0);
    expect(screen.getByText('Học viên Mẫu 01')).toBeInTheDocument();
    expect(screen.getByText('1.440.000 đồng')).toBeInTheDocument();
    expect(
      screen.getByText('Một triệu bốn trăm bốn mươi nghìn đồng'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Học phí gói 12 buổi (mua ngày 01/11/2026)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Kế toán Mẫu')).toBeInTheDocument();
    // Only the receipt goes on paper.
    const area = document.querySelector('[data-print-area]');
    expect(area).not.toBeNull();
    expect(
      within(area as HTMLElement).queryByRole('button', {
        name: 'In phiếu thu',
      }),
    ).toBeNull();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'In phiếu thu' }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it('says so when the payment is not there or out of scope', async () => {
    receiptFound = false;
    await render('/hoc-phi/phieu-thu/999');
    expect(
      await screen.findByText('Không tìm thấy phiếu thu'),
    ).toBeInTheDocument();
  });
});
