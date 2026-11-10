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

import HocVienPage from '../../client/pages/edu/hoc-vien.js';
import PhuHuynhPage from '../../client/pages/edu/phu-huynh.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

let permissions: AuthorizationSnapshot;
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'hocVien/count' || path === 'phuHuynh/count') return { data: 1 };
  if (path === 'hocVien/findMany')
    return {
      data: [
        {
          id: 1,
          ma: 'HS00001',
          hoTen: 'Học viên Mẫu 01',
          namSinh: 2016,
          levelKey: 'tot',
          levelOrder: 1,
          lopId: 1,
          coSoId: 1,
          trangThai: 'dang_hoc',
        },
      ],
    };
  if (path === 'phuHuynh/findMany')
    return {
      data: [
        {
          id: 7,
          ma: 'PH00007',
          hoTen: 'Phụ huynh Mẫu 07',
          soDienThoai: '0900000007',
          zalo: null,
        },
      ],
    };
  if (path === 'lop/findMany')
    return {
      data: [
        { id: 1, ma: 'L1', ten: 'Lớp Mẫu 1', coSoId: 1 },
        { id: 2, ma: 'L2', ten: 'Lớp Mẫu 2', coSoId: 1 },
      ],
    };
  if (path === 'coSo/findMany')
    return { data: [{ id: 1, ma: 'CS1', ten: 'Cơ sở Mẫu 1' }] };
  if (
    ['hocVien/updateOne', 'hocVien/chuyenLop', 'phuHuynh/updateOne'].includes(
      path,
    ) ||
    path === 'phuHuynh/xoa'
  )
    return { data: { id: 1 } };
  return new Response(null, { status: 404 });
});

async function render(route: string) {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/hoc-vien' element={<HocVienPage />} />
        <Route path='/phu-huynh' element={<PhuHuynhPage />} />
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

const grant = (id: string) => ({
  resource: { type: 'composite' as const, id },
  actions: ['manage', 'view'],
});

describe('edit and remove', () => {
  beforeEach(() => {
    api.mockClear();
    permissions = { unrestricted: false, permissions: [] };
  });

  it('shows no edit or remove button without the manage grant', async () => {
    await render('/hoc-vien');
    expect(await screen.findByText('Học viên Mẫu 01')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sửa' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cho nghỉ học' }),
    ).not.toBeInTheDocument();
  });

  it('edits a student with updateOne and moves the class through chuyenLop', async () => {
    permissions = {
      unrestricted: false,
      permissions: [grant('edu.hocVien')],
    };
    await render('/hoc-vien');
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Họ và tên');
    await userEvent.clear(name);
    await userEvent.type(name, 'Học viên Mẫu 02');
    await userEvent.selectOptions(within(dialog).getByLabelText('Lớp'), '2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'hocVien/updateOne',
          json: expect.objectContaining({
            filter: { id: 1 },
            values: expect.objectContaining({ hoTen: 'Học viên Mẫu 02' }),
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'hocVien/chuyenLop',
          json: { id: 1, lopId: 2 },
        }),
      ),
    );
  });

  it('"removes" a student by setting the status to left, never by deleting', async () => {
    permissions = {
      unrestricted: false,
      permissions: [grant('edu.hocVien')],
    };
    await render('/hoc-vien');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cho nghỉ học' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cho nghỉ học' }),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'hocVien/updateOne',
          json: expect.objectContaining({ values: { trangThai: 'da_nghi' } }),
        }),
      ),
    );
    expect(
      api.mock.calls.some(([call]) => call.path === 'hocVien/deleteOne'),
    ).toBe(false);
  });

  it('edits a parent with the phone number in its stored form and deletes through the guarded route', async () => {
    permissions = {
      unrestricted: false,
      permissions: [grant('edu.phuHuynh')],
    };
    await render('/phu-huynh');
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa' }));
    const dialog = await screen.findByRole('dialog');
    const phone = within(dialog).getByLabelText('Số điện thoại');
    await userEvent.clear(phone);
    await userEvent.type(phone, '+84 90 000 0008');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'phuHuynh/updateOne',
          json: expect.objectContaining({
            values: expect.objectContaining({ soDienThoai: '0900000008' }),
          }),
        }),
      ),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Xóa phụ huynh' }),
    );
    const confirm = await screen.findByRole('dialog');
    await userEvent.click(
      within(confirm).getByRole('button', { name: 'Xóa phụ huynh' }),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'phuHuynh/xoa', json: { id: 7 } }),
      ),
    );
  });
});
