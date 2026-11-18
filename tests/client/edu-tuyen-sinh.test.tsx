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

import TuyenSinhPage from '../../client/pages/edu/tuyen-sinh.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

let permissions: AuthorizationSnapshot;
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'lienHe/findMany') return { data: [] };
  if (path === 'lienHe/count') return { data: 0 };
  if (path === 'coSo/findMany')
    return { data: [{ id: 1, ma: 'CS1', ten: 'Cơ sở Mẫu 1' }] };
  if (path === 'lienHe/donQuaHan') return { data: { daXoa: 0 } };
  return new Response(null, { status: 404 });
});

async function render() {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/tuyen-sinh' element={<TuyenSinhPage />} />
      </Routes>
    </AuthenticationProvider>,
    {
      route: '/tuyen-sinh',
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

describe('admissions page', () => {
  beforeEach(() => {
    api.mockClear();
    permissions = { unrestricted: true, permissions: [] };
  });

  it('deletes the contacts older than a year through the route the server has', async () => {
    await render();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Xóa liên hệ quá một năm' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: 'lienHe/donQuaHan',
        }),
      ),
    );
    // The earlier address (`/lienHe/donDep`) does not exist on the server.
    expect(
      api.mock.calls.some(([request]) => request.path === 'lienHe/donDep'),
    ).toBe(false);
  });

  it('shows how the CRM webhook is guarded without ever showing a secret', async () => {
    await render();
    await userEvent.click(
      await screen.findByRole('button', { name: /Kết nối NocoCRM/u }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/EDU_CRM_WEBHOOK_TOKEN/u),
    ).toBeInTheDocument();
    expect(dialog.textContent).not.toContain('nocoedu-crm-secret');
    // The test button posted to the webhook as a signed-in user; the webhook takes the secret only.
    expect(
      within(dialog).queryByRole('button', { name: /Bắn thử/u }),
    ).not.toBeInTheDocument();
  });
});
