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

import SaoLuuPage from '../../client/pages/edu/sao-luu.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

let permissions: AuthorizationSnapshot;
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path, json }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'heThong/backup/importJson') {
    const body = json as { chiKiemTra?: boolean };
    return body.chiKiemTra
      ? { data: { chiKiemTra: true, moi: 7, trung: 2 } }
      : {
          data: {
            thanhCong: true,
            tongKhoiPhuc: 7,
            thongBao: 'Đã khôi phục thành công 7 bản ghi vào hệ thống.',
            dayTuTangDaDat: true,
          },
        };
  }
  return new Response(null, { status: 404 });
});

async function render() {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/sao-luu' element={<SaoLuuPage />} />
      </Routes>
    </AuthenticationProvider>,
    {
      route: '/sao-luu',
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

describe('backup page', () => {
  beforeEach(() => {
    api.mockClear();
    permissions = { unrestricted: true, permissions: [] };
  });

  it('warns that the file holds data of children', async () => {
    await render();
    expect(
      await screen.findByText(/Tệp sao lưu chứa dữ liệu của trẻ em/u),
    ).toBeInTheDocument();
  });

  it('asks the server what a restore would do before it allows one, then restores with the file version', async () => {
    await render();
    const file = new File(
      [
        JSON.stringify({
          phienBan: '2.0',
          ngayVn: '2026-11-18',
          soBanGhi: 9,
          tongSoBang: 21,
          duLieu: { eduSach: [{ id: 1 }] },
        }),
      ],
      'sao-luu.json',
      { type: 'application/json' },
    );
    const chooser = (await screen.findByText(/Chọn file sao lưu/u))
      .parentElement as HTMLElement;
    await userEvent.upload(
      chooser.querySelector('input[type=file]') as HTMLInputElement,
      file,
    );
    // Nothing is written by the check; it only counts.
    expect(
      await screen.findByText(/Sẽ thêm 7 bản ghi; 2 bản ghi đã có/u),
    ).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'heThong/backup/importJson',
        json: expect.objectContaining({ chiKiemTra: true, phienBan: '2.0' }),
      }),
    );

    const restore = screen.getByRole('button', {
      name: /Thực Hiện Khôi Phục/u,
    });
    expect(restore).toBeDisabled();
    await userEvent.type(
      screen.getByPlaceholderText('XAC_NHAN_KHOI_PHUC'),
      'XAC_NHAN_KHOI_PHUC',
    );
    await waitFor(() => expect(restore).toBeEnabled());
    await userEvent.click(restore);
    expect(
      await screen.findByText(/Đã khôi phục thành công 7 bản ghi/u),
    ).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'heThong/backup/importJson',
        json: expect.objectContaining({ phienBan: '2.0' }),
      }),
    );
  });
});
