import { apiClientToken } from '@nocobase/app-client';
import {
  AuthenticationProvider,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import {
  AuthorizationClient,
  type AuthorizationSnapshot,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import viVN from '../../client/locales/vi-VN.js';
import { NoticeDialog } from '../../client/pages/edu/hoc-vien-chi-tiet/phieu-bao/dialog.js';
import type { Profile } from '../../client/pages/edu/hoc-vien-chi-tiet/types.js';
import { formatDayVn } from '../../client/pages/edu/format.js';
import { todayVn } from '../../client/pages/edu/kit.js';
import packageMetadata from '../../package.json' with { type: 'json' };

// jsdom draws no picture and has no clipboard for pictures: the browser side is replaced, the dialog is real.
const image = vi.hoisted(() => ({
  canCopy: true,
  copyOk: true,
  renderOk: true,
  qrOk: true,
  copyImage: vi.fn(),
  loadQrImage: vi.fn(),
}));
vi.mock(
  '../../client/pages/edu/hoc-vien-chi-tiet/phieu-bao/image.js',
  async (original) => ({
    ...(await original<
      typeof import('../../client/pages/edu/hoc-vien-chi-tiet/phieu-bao/image.js')
    >()),
    renderPng: () =>
      image.renderOk
        ? Promise.resolve(new Blob(['png'], { type: 'image/png' }))
        : Promise.reject(new Error('no canvas')),
    canCopyImage: () => image.canCopy,
    canShareImage: () => false,
    copyImage: (blob: Blob) => {
      image.copyImage(blob);
      return Promise.resolve(image.copyOk);
    },
    loadQrImage: (url: string) => {
      image.loadQrImage(url);
      return image.qrOk
        ? Promise.resolve({
            dataUrl: 'data:image/png;base64,QUJD',
            width: 540,
            height: 640,
          })
        : Promise.reject(new Error('offline'));
    },
  }),
);

const profile: Profile = {
  hocVien: {
    id: 7,
    ma: 'HS00007',
    hoTen: 'Học viên Mẫu 07',
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
    soBuoiConLai: 0,
    dai: 'sap_het',
    canThu: true,
    tongSoBuoiDaMua: 4,
    tongSoBuoiDaHoc: 4,
    vuotSoDu: 0,
    tongTienHocPhi: 600000,
    tongDaThanhToan: 600000,
    tongConNoHocPhi: 0,
    tienSachDaPhat: null,
    tienSachDaNop: null,
    quySach: null,
    congNoSach: null,
  },
  hocPhi: {
    cacKy: [1, 2].map((kySo) => ({
      kySo,
      goiHocId: 40 + kySo,
      loai: 'mua' as const,
      trangThaiGoi: 'hieu_luc',
      ngayMua: kySo === 1 ? '2026-01-20' : '2026-02-20',
      soBuoi: 2,
      donGia: 150000,
      thanhTien: 300000,
      daThanhToan: 300000,
      conNo: 0,
      daDung: 2,
      conLai: 0,
      tienDo: 100,
    })),
  },
  buoiHoc: ['2026-01-24', '2026-01-31', '2026-02-21', '2026-02-28'].map(
    (ngay, index) => ({
      diemDanhId: 21 + index,
      buoiHocId: 31 + index,
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
      kySo: index < 2 ? 1 : 2,
      vuotSoDu: false,
    }),
  ),
  kienThuc: null,
  sach: null,
};

const NO_BANK = {
  cauHinh: false,
  soTienGoiY: 300000,
  soTien: null,
  noiDungCk: 'HP HS00007',
  url: null,
};
const address = (amount: number): string =>
  `https://img.vietqr.io/image/TESTBANK-0000000000-compact2.png?amount=${amount}`;

let permissions: AuthorizationSnapshot;
let qrAnswer: Record<string, unknown>;
const getSession = vi.fn(async () => ({ data: null }));
const api = vi.fn(({ method, path, json }: ApiCall) => {
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: permissions };
  if (path === 'phieuBao/vietQr') {
    const asked = (json as { soTien?: number }).soTien;
    return {
      data:
        asked === undefined
          ? qrAnswer
          : { ...qrAnswer, soTien: asked, url: address(asked) },
    };
  }
  if (path === 'phieuBao/ghi')
    return { data: { id: 91, ngay: todayVn(), moi: true } };
  if (path === 'phieuBao/xoa') return { data: { ok: true } };
  return new Response(null, { status: 404 });
});
const callsTo = (path: string) =>
  api.mock.calls.map(([call]) => call).filter((call) => call.path === path);

const onTerm = vi.fn();
const onClose = vi.fn();
const onChanged = vi.fn();
const writeText = vi.fn(async (_text: string) => {});
const createObjectURL = vi.fn((_blob: Blob) => 'blob:phieu-bao');

async function render(kySo: number, file: Profile = profile) {
  return renderWithApp(
    <AuthenticationProvider>
      <NoticeDialog
        profile={file}
        kySo={kySo}
        onTerm={onTerm}
        onClose={onClose}
        onChanged={onChanged}
      />
    </AuthenticationProvider>,
    {
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

/** The SVG the preview shows, as text. */
const pictureText = (): string =>
  decodeURIComponent(
    screen.getByRole('img', { name: /^Phiếu báo/u }).getAttribute('src') ?? '',
  );

/** The message as it stands in its box (`toHaveValue` takes no partial matcher). */
const messageText = (): string =>
  (screen.getByLabelText('Lời nhắn gửi kèm') as HTMLTextAreaElement).value;

describe('notice dialog', () => {
  beforeEach(() => {
    image.canCopy = true;
    image.copyOk = true;
    image.renderOk = true;
    image.qrOk = true;
    image.copyImage.mockClear();
    image.loadQrImage.mockClear();
    api.mockClear();
    onTerm.mockClear();
    onClose.mockClear();
    onChanged.mockClear();
    writeText.mockClear();
    createObjectURL.mockClear();
    permissions = { unrestricted: true, permissions: [] };
    qrAnswer = NO_BANK;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
  });

  it('shows the picture of the term and copies it for the chat with the parent', async () => {
    await render(2);
    expect(
      await screen.findByRole('img', {
        name: 'Phiếu báo Kỳ 2 (2 buổi) của Học viên Mẫu 07',
      }),
    ).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml'));
    const copy = await screen.findByRole('button', { name: 'Sao chép ảnh' });
    await waitFor(() => expect(copy).toBeEnabled());
    await userEvent.click(copy);
    expect(
      await screen.findByText(
        'Đã sao chép ảnh. Dán vào Zalo để gửi phụ huynh.',
      ),
    ).toBeInTheDocument();
    expect(image.copyImage).toHaveBeenCalledTimes(1);
    expect(image.copyImage.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
  });

  it('downloads the picture under the code of the student and the number of the term', async () => {
    const downloads: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });
    await render(2);
    const download = await screen.findByRole('button', { name: 'Tải ảnh' });
    await waitFor(() => expect(download).toBeEnabled());
    await userEvent.click(download);
    expect(downloads).toEqual(['phieu-bao-HS00007-ky-2.png']);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it('copies the message as the person edited it', async () => {
    await render(2);
    const message = await screen.findByLabelText('Lời nhắn gửi kèm');
    expect(message).toHaveValue(
      [
        'Kính gửi phụ huynh em Học viên Mẫu 07,',
        'CLB Cờ vua Dương Sinh xin gửi thống kê Kỳ 2 (2 buổi) của con:',
        '- Ngày nộp học phí: 20/02/2026',
        '- Đã học 2/2 buổi, còn lại 0 buổi',
        '- Thời gian học: từ 21/02/2026 đến 28/02/2026',
        '- Các ngày đã học: 21/02/2026, 28/02/2026',
        '',
        'Kỳ học phí này đã hết. Kính mời phụ huynh nộp học phí kỳ tiếp theo để con tiếp tục học.',
        'Trân trọng cảm ơn phụ huynh!',
      ].join('\n'),
    );
    await userEvent.clear(message);
    await userEvent.type(message, 'Lời nhắn đã sửa');
    await userEvent.click(
      screen.getByRole('button', { name: 'Sao chép lời nhắn' }),
    );
    expect(
      await screen.findByText('Đã sao chép lời nhắn.'),
    ).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('Lời nhắn đã sửa');
  });

  it('explains what to do where a picture cannot be copied, and still downloads', async () => {
    image.canCopy = false;
    await render(2);
    expect(
      await screen.findByText(
        'Sao chép ảnh cần trang chạy trên HTTPS và trình duyệt mới. Hãy dùng “Tải ảnh” rồi gửi tệp.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sao chép ảnh' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tải ảnh' })).toBeEnabled(),
    );
  });

  it('says so when the browser refuses the copy or cannot make the file', async () => {
    image.copyOk = false;
    const first = await render(2);
    const copy = await screen.findByRole('button', { name: 'Sao chép ảnh' });
    await waitFor(() => expect(copy).toBeEnabled());
    await userEvent.click(copy);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Trình duyệt không cho sao chép ảnh. Hãy bấm “Tải ảnh” rồi gửi tệp.',
    );
    first.unmount();

    image.renderOk = false;
    await render(2);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tạo được tệp ảnh trên trình duyệt này.',
    );
    expect(screen.getByRole('button', { name: 'Tải ảnh' })).toBeDisabled();
  });

  it('lets the person pick another term and close', async () => {
    await render(2);
    const select = await screen.findByLabelText('Kỳ học phí');
    expect(select).toHaveValue('2');
    await userEvent.selectOptions(select, '1');
    expect(onTerm).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // Nothing was marked, so the student file is not read again.
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('notice dialog: the transfer code of the next term', () => {
  beforeEach(() => {
    image.qrOk = true;
    image.renderOk = true;
    image.canCopy = true;
    image.loadQrImage.mockClear();
    api.mockClear();
    permissions = { unrestricted: true, permissions: [] };
    qrAnswer = {
      cauHinh: true,
      soTienGoiY: 300000,
      soTien: 300000,
      noiDungCk: 'HP HS00007',
      url: address(300000),
    };
  });

  it('draws the code of the suggested amount on a term that asks to pay, and says so in the message', async () => {
    await render(2);
    await waitFor(() =>
      expect(pictureText()).toContain('Chuyển khoản học phí kỳ tiếp theo'),
    );
    const picture = pictureText();
    expect(picture).toContain('300.000 đ');
    expect(picture).toContain('Nội dung: HP HS00007');
    expect(picture).toContain('data:image/png;base64,QUJD');
    // The address the server built is fetched as it is; the amount was not asked for again.
    expect(image.loadQrImage).toHaveBeenCalledWith(address(300000));
    expect(callsTo('phieuBao/vietQr')).toHaveLength(1);
    expect(callsTo('phieuBao/vietQr')[0]?.json).toEqual({ hocVienId: 7 });
    expect(messageText()).toContain(
      'Học phí kỳ tiếp theo: 300.000 đ. Nội dung chuyển khoản: HP HS00007 (mã QR có trong ảnh).',
    );
  });

  it('asks the server for the code of another amount, and leaves it out when unticked', async () => {
    await render(2);
    await waitFor(() => expect(pictureText()).toContain('300.000 đ'));
    const amount = screen.getByLabelText('Học phí kỳ tiếp theo (đồng)');
    await userEvent.clear(amount);
    // No amount: no code, and the field says what to do.
    expect(
      await screen.findByText('Nhập số tiền để tạo mã QR.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(pictureText()).not.toContain('Chuyển khoản học phí'),
    );
    await userEvent.type(amount, '250000');
    await waitFor(() => expect(pictureText()).toContain('250.000 đ'));
    expect(callsTo('phieuBao/vietQr').at(-1)?.json).toEqual({
      hocVienId: 7,
      soTien: 250000,
    });
    expect(image.loadQrImage).toHaveBeenLastCalledWith(address(250000));

    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'Kèm mã QR chuyển khoản kỳ tiếp theo',
      }),
    );
    await waitFor(() =>
      expect(pictureText()).not.toContain('Chuyển khoản học phí'),
    );
    expect(messageText()).not.toContain('mã QR');
  });

  it('keeps the code off a term that asks nothing, offers nothing without a bank account and says when it fails', async () => {
    // Term 1 is over and the student moved on: no payment is asked, so the box starts unticked.
    const first = await render(1);
    const box = await screen.findByRole('checkbox', {
      name: 'Kèm mã QR chuyển khoản kỳ tiếp theo',
    });
    expect(box).not.toBeChecked();
    expect(image.loadQrImage).not.toHaveBeenCalled();
    first.unmount();

    qrAnswer = NO_BANK;
    const second = await render(2);
    await screen.findByLabelText('Lời nhắn gửi kèm');
    await waitFor(() => expect(callsTo('phieuBao/vietQr')).toHaveLength(2));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    second.unmount();

    qrAnswer = {
      cauHinh: true,
      soTienGoiY: 300000,
      soTien: 300000,
      noiDungCk: 'HP HS00007',
      url: address(300000),
    };
    image.qrOk = false;
    await render(2);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tải được mã QR nên ảnh chưa có mã.',
    );
    expect(pictureText()).not.toContain('Chuyển khoản học phí');
  });
});

describe('notice dialog: the parent was told', () => {
  beforeEach(() => {
    image.renderOk = true;
    api.mockClear();
    onClose.mockClear();
    onChanged.mockClear();
    permissions = { unrestricted: true, permissions: [] };
    qrAnswer = NO_BANK;
  });

  it('marks the term, shows it at once, takes it back and reads the file again on closing', async () => {
    await render(2);
    expect(
      await screen.findByText('Chưa đánh dấu đã báo cho kỳ này.'),
    ).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Đánh dấu đã báo' }),
    );
    expect(
      await screen.findByText(
        `Đã báo phụ huynh ngày ${formatDayVn(todayVn())}.`,
      ),
    ).toBeInTheDocument();
    // The package of the term the picture is about.
    expect(callsTo('phieuBao/ghi')[0]?.json).toEqual({
      hocVienId: 7,
      goiHocId: 42,
    });
    expect(
      screen.getByRole('button', { name: 'Đã đánh dấu hôm nay' }),
    ).toBeDisabled();
    // The file is not read while the dialog is open.
    expect(onChanged).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Bỏ đánh dấu' }));
    expect(
      await screen.findByText('Chưa đánh dấu đã báo cho kỳ này.'),
    ).toBeInTheDocument();
    expect(callsTo('phieuBao/xoa')[0]?.json).toEqual({ id: 91 });

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows who told the parent, for the term of the picture only', async () => {
    const told: Profile = {
      ...profile,
      hocPhi: {
        cacKy: profile.hocPhi?.cacKy ?? [],
        cacLanBao: [
          {
            id: 5,
            goiHocId: 42,
            ngay: '2026-11-10',
            soBuoiConLai: 1,
            nguoiBao: 'Cô Mẫu',
          },
        ],
      },
    };
    const second = await render(2, told);
    expect(
      await screen.findByText('Đã báo phụ huynh ngày 10/11/2026 (Cô Mẫu).'),
    ).toBeInTheDocument();
    // An older day can be marked again today.
    expect(
      await screen.findByRole('button', { name: 'Đánh dấu đã báo' }),
    ).toBeEnabled();
    second.unmount();
    // The mark names the package of term 2: term 1 was not told.
    await render(1, told);
    expect(
      await screen.findByText('Chưa đánh dấu đã báo cho kỳ này.'),
    ).toBeInTheDocument();
  });

  it('offers no mark button to a person who may not collect tuition', async () => {
    permissions = {
      unrestricted: false,
      permissions: [
        {
          resource: { type: 'composite', id: 'edu.goiHoc' },
          actions: ['view'],
        },
      ],
    };
    await render(2);
    expect(
      await screen.findByText('Chưa đánh dấu đã báo cho kỳ này.'),
    ).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Tải ảnh' });
    expect(
      screen.queryByRole('button', { name: 'Đánh dấu đã báo' }),
    ).not.toBeInTheDocument();
  });
});
