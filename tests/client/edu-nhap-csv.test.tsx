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
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HocVienPage from '../../client/pages/edu/hoc-vien.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

let permissions: AuthorizationSnapshot;
let previewAnswer: object;
const getSession = vi.fn(async () => ({ data: null }));
const COUNTS = {
  rows: 2,
  written: 0,
  hocVienMoi: 1,
  hocVienTrung: 0,
  chiLienKet: 1,
  phuHuynhMoi: 1,
  phuHuynhDungLai: 1,
  lienKetMoi: 2,
  problems: [],
};
const api = vi.fn(({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'hocVien/count') return { data: 1 };
  if (path === 'hocVien/findMany') return { data: [] };
  if (path === 'lop/findMany' || path === 'coSo/findMany') return { data: [] };
  if (path === 'hocVien/nhapCsv/xemTruoc') return { data: previewAnswer };
  if (path === 'hocVien/nhapCsv/xacNhan')
    return { data: { ...COUNTS, written: 2 } };
  return new Response(null, { status: 404 });
});

async function render() {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/hoc-vien' element={<HocVienPage />} />
      </Routes>
    </AuthenticationProvider>,
    {
      route: '/hoc-vien',
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

const grant = (action: string): AuthorizationSnapshot => ({
  unrestricted: false,
  permissions: [
    { resource: { type: 'composite', id: 'edu.hocVien' }, actions: [action] },
  ],
});

async function openAndChoose(content: string) {
  await userEvent.click(
    await screen.findByRole('button', { name: 'Nhập từ CSV' }),
  );
  const dialog = await screen.findByRole('dialog');
  await userEvent.upload(
    within(dialog).getByLabelText('Tệp CSV'),
    new File([content], 'hoc-vien.csv', { type: 'text/csv' }),
  );
  return dialog;
}

describe('CSV import on the students page', () => {
  beforeEach(() => {
    api.mockClear();
    previewAnswer = COUNTS;
    permissions = { unrestricted: false, permissions: [] };
  });

  it('offers the import only to a person who holds the import action', async () => {
    await render();
    await screen.findByText('Học viên');
    expect(
      screen.queryByRole('button', { name: 'Nhập từ CSV' }),
    ).not.toBeInTheDocument();
  });

  it('previews first, writes only after confirmation, and sends the file text to the server', async () => {
    permissions = grant('import');
    await render();
    const dialog = await openAndChoose('hoTen,namSinh\nHọc viên Mẫu 01,2016');
    expect(
      within(dialog).getByRole('button', { name: 'Xác nhận nhập' }),
    ).toBeDisabled();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Xem trước' }),
    );
    expect(
      await within(dialog).findByText('Học viên sẽ tạo mới'),
    ).toBeVisible();
    // Nothing is written by the preview.
    expect(
      api.mock.calls.some(([call]) => call.path === 'hocVien/nhapCsv/xacNhan'),
    ).toBe(false);
    const sent = api.mock.calls
      .map(([call]) => call)
      .find((call) => call.path === 'hocVien/nhapCsv/xemTruoc');
    expect(sent?.json).toEqual({ csv: 'hoTen,namSinh\nHọc viên Mẫu 01,2016' });

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận nhập' }),
    );
    expect(
      await within(dialog).findByText('Đã nhập xong 2 dòng.'),
    ).toBeVisible();
  });

  it('shows problems by line and reason and does not allow confirming', async () => {
    permissions = grant('import');
    previewAnswer = {
      ...COUNTS,
      hocVienMoi: 0,
      chiLienKet: 0,
      problems: [
        { line: 3, code: 'BAD_YEAR' },
        { line: 5, code: 'BAD_PHONE' },
      ],
    };
    await render();
    const dialog = await openAndChoose('x');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Xem trước' }),
    );
    expect(
      await within(dialog).findByText(/Dòng 3: Năm sinh không hợp lệ/u),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/Dòng 5: Số điện thoại không hợp lệ/u),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Xác nhận nhập' }),
    ).toBeDisabled();
  });

  it('refuses a file over the size limit without reading it', async () => {
    permissions = grant('import');
    await render();
    const dialog = await openAndChoose('x'.repeat(600 * 1024));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'lớn hơn 500 KB',
    );
    expect(
      within(dialog).getByRole('button', { name: 'Xem trước' }),
    ).toBeDisabled();
  });
});
