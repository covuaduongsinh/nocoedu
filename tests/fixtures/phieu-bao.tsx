import {
  AppClientProviders,
  ClientApplication,
  apiClientToken,
  createAppClientConfig,
  defineAppClientRenderConfig,
  toasterToken,
} from '@nocobase/app-client';
import { defineClientPlugins } from '@nocobase/app-client/plugins';
import {
  defineAppRuntime,
  resolveAppRuntime,
} from '@nocobase/app-client/runtime';
import {
  AuthenticationProvider,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { I18nProvider, NamespaceScope } from '@nocobase/i18n/client';
import { createTestI18nRuntime } from '@nocobase/i18n/testing';
import { ServiceProvider } from '@nocobase/service-provider';
import { createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';

import { createToaster } from '../../client/lib/toaster';
import viVN from '../../client/locales/vi-VN';
import { NoticeDialog } from '../../client/pages/edu/hoc-vien-chi-tiet/phieu-bao/dialog';
import type { Profile } from '../../client/pages/edu/hoc-vien-chi-tiet/types';
import '../../client/styles.css';

/**
 * A server-free browser fixture of the notice of a tuition term (`tests/playwright/phieu-bao.test.ts`): the real
 * dialog, stylesheet and browser code (canvas, clipboard), a made-up student and an API answered here. Run `pnpm dev`
 * and open `<Local address>/tests/fixtures/phieu-bao.html`.
 *
 * - `?dark` switches to the dark theme, `?preset=default` to the other preset;
 * - `?bank` answers as if a bank account were configured, so the VietQR code of the next term is fetched from the
 *   public image service with the sample account of its documentation (no data of the club);
 * - `?role=xem` answers the permissions of a person who may not collect tuition.
 */
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('preset') ?? 'compact';
document.documentElement.classList.toggle('dark', params.has('dark'));

const NAMESPACE = 'nocoedu-fixture';
const days = [
  '2026-01-24',
  '2026-02-28',
  '2026-03-07',
  '2026-03-14',
  '2026-03-28',
  '2026-04-04',
  '2026-04-11',
  '2026-04-18',
  '2026-04-25',
  '2026-05-16',
  '2026-05-23',
  '2026-06-02',
  '2026-06-16',
  '2026-06-18',
  '2026-06-20',
  '2026-06-23',
  '2026-06-25',
  '2026-06-27',
  '2026-06-30',
  '2026-07-02',
];
const session = (
  index: number,
  ngay: string,
  patch: Partial<NonNullable<Profile['buoiHoc']>[number]> = {},
) => ({
  diemDanhId: 100 + index,
  buoiHocId: 200 + index,
  stt: index + 1,
  ngay,
  gioBatDau: '18:00',
  gioKetThuc: '19:30',
  lopId: 3,
  lopTen: 'Lớp Mẫu 3',
  trangThai: 'co_mat',
  daLamBtvn: false,
  yThucDiem: null,
  nhanXet: '',
  soBuoiDaTru: 1,
  kySo: 1,
  vuotSoDu: false,
  ...patch,
});
const profile: Profile = {
  hocVien: {
    id: 7,
    ma: 'HS00007',
    hoTen: 'Học viên Mẫu Số Bảy',
    levelKey: 'ma',
    trangThai: 'dang_hoc',
    lopId: 3,
    lopTen: 'Lớp Mẫu 3',
    nhomId: null,
    nhomTen: null,
    coSoId: 1,
    coSoTen: 'Cơ sở Mẫu 1',
  },
  phuHuynhChinh: null,
  tongHop: {
    soBuoiConLai: -2,
    dai: 'vuot_goi',
    canThu: true,
    tongSoBuoiDaMua: 20,
    tongSoBuoiDaHoc: 22,
    vuotSoDu: 2,
    tongTienHocPhi: 3000000,
    tongDaThanhToan: 3000000,
    tongConNoHocPhi: 0,
    tienSachDaPhat: null,
    tienSachDaNop: null,
    quySach: null,
    congNoSach: null,
  },
  hocPhi: {
    cacKy: [
      {
        kySo: 1,
        goiHocId: 41,
        loai: 'mua',
        trangThaiGoi: 'hieu_luc',
        ngayMua: '2026-01-20',
        soBuoi: 20,
        donGia: 150000,
        thanhTien: 3000000,
        daThanhToan: 3000000,
        conNo: 0,
        daDung: 20,
        conLai: 0,
        tienDo: 100,
      },
    ],
    cacLanBao: [],
  },
  buoiHoc: [
    ...days.map((ngay, index) =>
      session(index, ngay, index === 7 ? { trangThai: 'vang_khong_phep' } : {}),
    ),
    session(20, '2026-03-21', {
      trangThai: 'vang_co_phep',
      soBuoiDaTru: 0,
      kySo: null,
    }),
    session(21, '2026-07-04', { kySo: null, vuotSoDu: true }),
    session(22, '2026-07-07', { kySo: null, vuotSoDu: true }),
  ],
  kienThuc: null,
  sach: null,
};

// The sample account of the VietQR documentation; `.svg` is the address a page may fetch (`server/edu/so-du.ts`).
const qrAddress = (amount: number): string =>
  `https://img.vietqr.io/image/970415-113366668888-compact2.svg?amount=${amount}&addInfo=HP+HS00007`;
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

/** Answers the API the dialog uses; what it was asked is kept on `window` for the browser test to read. */
const calls: { path: string; json: unknown }[] = [];
Object.assign(window, { fixtureCalls: calls });
async function answer(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^.*\/api\//u, '');
  const json: unknown =
    request.method === 'POST' ? await request.json().catch(() => null) : null;
  calls.push({ path, json });
  if (path === 'authorization/permissions')
    return Response.json({
      data:
        params.get('role') === 'xem'
          ? {
              unrestricted: false,
              permissions: [
                {
                  resource: { type: 'composite', id: 'edu.goiHoc' },
                  actions: ['view'],
                },
              ],
            }
          : { unrestricted: true, permissions: [] },
    });
  if (path === 'phieuBao/vietQr') {
    const asked = (json as { soTien?: number } | null)?.soTien;
    const amount = asked ?? 3000000;
    return Response.json({
      data: params.has('bank')
        ? {
            cauHinh: true,
            soTienGoiY: 3000000,
            soTien: amount,
            noiDungCk: 'HP HS00007',
            url: qrAddress(amount),
          }
        : {
            cauHinh: false,
            soTienGoiY: 3000000,
            soTien: null,
            noiDungCk: 'HP HS00007',
            url: null,
          },
    });
  }
  if (path === 'phieuBao/ghi')
    return Response.json({ data: { id: 91, ngay: today, moi: true } });
  if (path === 'phieuBao/xoa') return Response.json({ data: { ok: true } });
  return new Response(null, { status: 404 });
}

class FixtureServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = 'nocoedu/fixture-phieu-bao';

  public override register(): void {
    this.app.container.instance(toasterToken, createToaster());
    this.app.container.instance(authenticationClientToken, {
      getSession: () => Promise.resolve({ data: null }),
    } as never);
    this.app.container.singleton(
      authorizationClientToken,
      (resolver) => new AuthorizationClient(resolver.resolve(apiClientToken)),
    );
  }
}

const apiRoot = `${location.origin}/fixture/api`;
const rawConfig = { app: { basePath: '/' }, api: { baseURL: apiRoot } };
const i18n = await createTestI18nRuntime({
  locale: 'vi-VN',
  namespaces: { [NAMESPACE]: viVN },
});
const runtime = await resolveAppRuntime(
  defineAppRuntime({
    packageName: NAMESPACE,
    createAppConfig: createAppClientConfig,
    serviceProviders: [FixtureServiceProvider],
    plugins: defineClientPlugins([]),
  }),
  { rawConfig, rawPublicConfig: {}, i18n },
);
const application = new ClientApplication({
  runtime,
  fetch: (input, init) =>
    answer(
      input instanceof Request
        ? new Request(input, init)
        : new Request(new URL(String(input), apiRoot), init),
    ),
  createRenderConfig: () =>
    defineAppClientRenderConfig({
      basename: runtime.basename,
      reactProviders: [
        ({ children }: { children?: ReactNode }) =>
          createElement(I18nProvider, { runtime: i18n }, children),
        ...runtime.reactProviders.map((provider) => provider.component),
      ],
      routes: null,
    }),
});
runtime.app = application;
await application.start();

export default function Fixture() {
  const [kySo, setKySo] = useState<number | null>(1);
  const [reloads, setReloads] = useState(0);
  return (
    <main className='p-6'>
      <h1 className='text-xl font-semibold'>
        Phiếu báo kỳ học phí (trang mẫu)
      </h1>
      <p data-testid='state'>
        {kySo === null ? 'đã đóng' : `kỳ ${kySo}`} · đọc lại hồ sơ {reloads} lần
      </p>
      {kySo === null ? null : (
        <NoticeDialog
          profile={profile}
          kySo={kySo}
          onTerm={setKySo}
          onClose={() => setKySo(null)}
          onChanged={() => setReloads((count) => count + 1)}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <AppClientProviders app={application}>
      <NamespaceScope ns={NAMESPACE}>
        <AuthenticationProvider>
          <Fixture />
        </AuthenticationProvider>
      </NamespaceScope>
    </AppClientProviders>
  </MemoryRouter>,
);
