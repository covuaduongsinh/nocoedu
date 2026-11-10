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

import HocPhiPage from '../../client/pages/edu/hoc-phi.js';
import viVN from '../../client/locales/vi-VN.js';
import packageMetadata from '../../package.json' with { type: 'json' };

let permissions: AuthorizationSnapshot;
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'hocVien/findMany')
    return {
      data: [
        {
          id: 7,
          ma: 'HS7',
          hoTen: 'Học viên Mẫu 01',
          lopId: 1,
          trangThai: 'dang_hoc',
          soBuoiConLai: 3,
        },
      ],
    };
  if (path === 'hocVien/count') return { data: 60 };
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

  it('pages the students on the server and searches by name or code', async () => {
    await render(<HocPhiPage />, '/hoc-phi', '/hoc-phi');
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
});
