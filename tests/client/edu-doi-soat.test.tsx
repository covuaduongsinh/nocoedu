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
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DoiSoatPage from '../../client/pages/edu/doi-soat.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

const permissions: AuthorizationSnapshot = {
  unrestricted: true,
  permissions: [],
};
const getSession = vi.fn(async () => ({ data: null }));
const row = {
  id: 7,
  ma: 'HS00007',
  hoTen: 'Học viên Mẫu 07',
  lopId: 3,
  lopTen: 'Lớp Mẫu 3',
  coSoId: 1,
  coSoTen: 'Cơ sở Mẫu 1',
  phuHuynhTen: 'Phụ huynh Mẫu 07',
  phuHuynhSdt: '0900000007',
  soBuoiConLai: -2,
  tongSoBuoiDaMua: 12,
  tongSoBuoiDaHoc: 14,
  tongDaThanhToan: 1000000,
  tongConNoHocPhi: 200000,
  tongTienSachDaPhat: 40000,
  tienSachTon: -30000,
};
const api = vi.fn(({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'doiSoat/tongQuan')
    return {
      data: {
        thongKe: {
          tongHocVien: 60,
          soHocVienVuotGoi: 1,
          soHocVienSapHet: 2,
          soHocVienBinhThuong: 55,
          soHocVienCanThu: 3,
          tongCongNoHocPhi: 200000,
          tongCongNoSach: 30000,
        },
        tong: 60,
        trang: 1,
        limit: 25,
        danhSach: [row],
      },
    };
  if (path === 'lop/findMany')
    return { data: [{ id: 3, ma: 'L3', ten: 'Lớp Mẫu 3', coSoId: 1 }] };
  if (path === 'coSo/findMany')
    return { data: [{ id: 1, ma: 'CS1', ten: 'Cơ sở Mẫu 1' }] };
  return new Response(null, { status: 404 });
});

function Where() {
  const location = useLocation();
  return <p data-testid='where'>{location.pathname + location.search}</p>;
}

async function render(route: string) {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/doi-soat' element={<DoiSoatPage />} />
        <Route path='/hoc-vien/:id' element={<Where />} />
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

const requests = () =>
  api.mock.calls
    .map(([call]) => call)
    .filter((call) => call.path === 'doiSoat/tongQuan')
    .map((call) => call.json as Record<string, unknown>);

describe('audit page', () => {
  beforeEach(() => {
    api.mockClear();
  });

  it('is only the table of the centre: one page of 25 from the server, with the counters', async () => {
    await render('/doi-soat');
    expect(
      await screen.findByRole('link', { name: 'Mở hồ sơ' }),
    ).toBeInTheDocument();
    expect(requests()[0]).toMatchObject({
      trang: 1,
      limit: 25,
      trangThaiLoc: 'tat_ca',
    });
    // The counters cover everyone, whatever the page.
    expect(screen.getByText('Tổng học viên').parentElement).toHaveTextContent(
      '60',
    );
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sau' }));
    await waitFor(() =>
      expect(requests().some((r) => r.trang === 2)).toBe(true),
    );
  });

  it('sends a row to the student file on the sessions tab', async () => {
    await render('/doi-soat');
    expect(
      await screen.findByRole('link', { name: 'Mở hồ sơ' }),
    ).toHaveAttribute('href', '/hoc-vien/7?tab=buoi-hoc');
    // The name and the code open the file too.
    expect(
      screen.getByRole('link', { name: 'Học viên Mẫu 07' }),
    ).toHaveAttribute('href', '/hoc-vien/7');
    // The balance uses the shared badge: over the balance by two.
    expect(screen.getByText('Vượt 2 buổi')).toBeInTheDocument();
  });

  it('keeps the filters in the address and in the request', async () => {
    await render('/doi-soat?coSoId=1&lopId=3&trangThai=vuot_goi&search=mau');
    await screen.findByRole('link', { name: 'Mở hồ sơ' });
    expect(requests()[0]).toMatchObject({
      coSoId: 1,
      lopId: 3,
      trangThaiLoc: 'vuot_goi',
      search: 'mau',
    });
    // A counter is a filter: it changes the request and is marked as pressed.
    await userEvent.click(screen.getByRole('button', { name: /Nợ học phí/u }));
    await waitFor(() =>
      expect(requests().some((r) => r.trangThaiLoc === 'no_hoc_phi')).toBe(
        true,
      ),
    );
    expect(screen.getByRole('button', { name: /Nợ học phí/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('sends an old link of one student to the student file', async () => {
    await render('/doi-soat?hocVienId=7');
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/hoc-vien/7?tab=buoi-hoc',
    );
    // Nothing of the table is asked for on the way.
    expect(requests()).toHaveLength(0);
  });

  it('ignores a hocVienId that is not a number', async () => {
    await render('/doi-soat?hocVienId=abc');
    expect(
      await screen.findByRole('link', { name: 'Mở hồ sơ' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
  });
});
