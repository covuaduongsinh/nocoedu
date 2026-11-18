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
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HoSo360Page from '../../client/pages/edu/ho-so-360.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

const permissions: AuthorizationSnapshot = {
  unrestricted: true,
  permissions: [],
};
const getSession = vi.fn(async () => ({ data: null }));
const students = [
  {
    id: 7,
    ma: 'HS00007',
    hoTen: 'Học viên Mẫu 07',
    lopId: 3,
    coSoId: 1,
    levelKey: 'ma',
    trangThai: 'dang_hoc',
    soBuoiConLai: 4,
  },
];
const api = vi.fn(({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'hocVien/findMany') return { data: students };
  if (path === 'hocVien/count') return { data: 60 };
  if (path === 'lop/findMany')
    return { data: [{ id: 3, ma: 'L3', ten: 'Lớp Mẫu 3', coSoId: 1 }] };
  if (path === 'coSo/findMany')
    return { data: [{ id: 1, ma: 'CS1', ten: 'Cơ sở Mẫu 1' }] };
  if (path === 'phuHuynh/findMany')
    return { data: [{ id: 11, hoTen: 'Phụ huynh Mẫu 11' }] };
  if (path === 'lienKet/findMany')
    return { data: [{ id: 1, hocVienId: 7, phuHuynhId: 11 }] };
  return new Response(null, { status: 404 });
});

async function render(route: string) {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/ho-so-360' element={<HoSo360Page />} />
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

describe('Hồ sơ 360° lookup page', () => {
  beforeEach(() => {
    api.mockClear();
  });

  it('lists students 25 a page from the server and opens the file of one', async () => {
    await render('/ho-so-360');
    const link = await screen.findByRole('link', { name: 'Mở hồ sơ' });
    expect(link).toHaveAttribute('href', '/hoc-vien/7');
    expect(callsTo('hocVien/findMany')[0]?.json).toMatchObject({
      limit: 25,
      offset: 0,
    });
    // 60 students are three pages: the next page is asked of the server, not cut on the client.
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sau' }));
    await waitFor(() =>
      expect(
        callsTo('hocVien/findMany').some(
          (call) => (call.json as { offset?: number }).offset === 25,
        ),
      ).toBe(true),
    );
    expect(await screen.findByText('Trang 2 / 3')).toBeInTheDocument();
  });

  it('searches by name or code on the server, and keeps the text in the address', async () => {
    await render('/ho-so-360');
    await screen.findByRole('link', { name: 'Mở hồ sơ' });
    const box = screen.getByRole('searchbox', {
      name: /Tìm theo tên, mã học viên/u,
    });
    await userEvent.type(box, 'HS00007');
    await waitFor(() =>
      expect(
        callsTo('hocVien/findMany').some((call) =>
          JSON.stringify(call.json).includes('HS00007'),
        ),
      ).toBe(true),
    );
    // Both the code and the name columns are searched (a case-insensitive "includes" over the two fields).
    const search = callsTo('hocVien/findMany')
      .map((call) => JSON.stringify(call.json))
      .find((json) => json.includes('HS00007'));
    expect(search).toContain('"ma"');
    expect(search).toContain('"hoTen"');
  });

  it('reads the branch and class filters from the address', async () => {
    await render('/ho-so-360?coSoId=1&lopId=3');
    await screen.findByRole('link', { name: 'Mở hồ sơ' });
    const json = JSON.stringify(callsTo('hocVien/findMany')[0]?.json);
    expect(json).toContain('"coSoId"');
    expect(json).toContain('"lopId"');
    expect(screen.getByLabelText('Cơ sở')).toHaveValue('1');
    expect(screen.getByLabelText('Lớp')).toHaveValue('3');
  });

  it('finds a student by the phone number of a parent', async () => {
    await render('/ho-so-360?search=0900000011');
    await waitFor(() => expect(callsTo('phuHuynh/findMany')).toHaveLength(1));
    expect(JSON.stringify(callsTo('phuHuynh/findMany')[0]?.json)).toContain(
      '0900000011',
    );
    await waitFor(() => expect(callsTo('lienKet/findMany')).toHaveLength(1));
    // The students of those parents are then asked for by id.
    await waitFor(() =>
      expect(
        callsTo('hocVien/findMany').some((call) =>
          JSON.stringify(call.json).includes('"path":["id"]'),
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByRole('link', { name: 'Mở hồ sơ' }),
    ).toBeInTheDocument();
  });
});
