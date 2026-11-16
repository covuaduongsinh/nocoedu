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

import CoSoPage from '../../client/pages/edu/co-so.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

// The branch form carries the sessions-left threshold ("Nhắc khi còn (buổi)"). Names are made up.

let permissions: AuthorizationSnapshot;
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'coSo/count') return { data: 1 };
  if (path === 'coSo/findMany')
    return {
      data: [
        {
          id: 1,
          ma: 'CS1',
          ten: 'Cơ sở Mẫu 1',
          diaChi: null,
          truBuoiVangCoPhep: false,
          nguongNhacBuoi: 3,
          trangThai: 'hoat_dong',
        },
      ],
    };
  if (path === 'coSo/createOne' || path === 'coSo/updateOne')
    return { data: { id: 1 } };
  return new Response(null, { status: 404 });
});

async function render() {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/co-so' element={<CoSoPage />} />
      </Routes>
    </AuthenticationProvider>,
    {
      route: '/co-so',
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

describe('the threshold on the branch form', () => {
  beforeEach(() => {
    api.mockClear();
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.coSo' },
          actions: ['manage', 'view'],
        },
      ],
    };
  });

  it('shows the threshold of each branch in the list', async () => {
    await render();
    expect(await screen.findByText('Cơ sở Mẫu 1')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Nhắc khi còn (buổi)' }),
    ).toBeInTheDocument();
  });

  it('creates a branch with the threshold as a number, 2 by default', async () => {
    await render();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Thêm cơ sở' }),
    );
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText('Nhắc khi còn (buổi)');
    expect(field).toHaveValue(2);
    await userEvent.type(within(dialog).getByLabelText('Mã'), 'CS9');
    await userEvent.type(
      within(dialog).getByLabelText('Tên cơ sở'),
      'Cơ sở Mẫu 9',
    );
    await userEvent.clear(field);
    await userEvent.type(field, '4');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'coSo/createOne',
          json: expect.objectContaining({
            values: expect.objectContaining({ nguongNhacBuoi: 4 }),
          }),
        }),
      ),
    );
  });

  it('edits the threshold of an existing branch', async () => {
    await render();
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa' }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText('Nhắc khi còn (buổi)');
    expect(field).toHaveValue(3);
    await userEvent.clear(field);
    await userEvent.type(field, '5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'coSo/updateOne',
          json: expect.objectContaining({
            filter: { id: 1 },
            values: expect.objectContaining({ nguongNhacBuoi: 5 }),
          }),
        }),
      ),
    );
  });
});
