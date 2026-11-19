import { renderWithApp } from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import viVN from '../../client/locales/vi-VN.js';
import { NoticeDialog } from '../../client/pages/edu/hoc-vien-chi-tiet/phieu-bao/dialog.js';
import type { Profile } from '../../client/pages/edu/hoc-vien-chi-tiet/types.js';
import packageMetadata from '../../package.json' with { type: 'json' };

// jsdom draws no picture and has no clipboard for pictures: the browser side is replaced, the dialog is real.
const image = vi.hoisted(() => ({
  canCopy: true,
  copyOk: true,
  renderOk: true,
  copyImage: vi.fn(),
  shareImage: vi.fn(),
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

const onTerm = vi.fn();
const onClose = vi.fn();
const writeText = vi.fn(async (_text: string) => {});
const createObjectURL = vi.fn((_blob: Blob) => 'blob:phieu-bao');

async function render(kySo: number) {
  return renderWithApp(
    <NoticeDialog
      profile={profile}
      kySo={kySo}
      onTerm={onTerm}
      onClose={onClose}
    />,
    {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: viVN },
    },
  );
}

describe('notice dialog', () => {
  beforeEach(() => {
    image.canCopy = true;
    image.copyOk = true;
    image.renderOk = true;
    image.copyImage.mockClear();
    onTerm.mockClear();
    onClose.mockClear();
    writeText.mockClear();
    createObjectURL.mockClear();
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
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });
    const downloads: string[] = [];
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
  });
});
