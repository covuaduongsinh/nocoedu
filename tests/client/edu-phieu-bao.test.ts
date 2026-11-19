import { describe, expect, it } from 'vitest';

import { eduViVN } from '../../client/locales/edu-copy.js';
import {
  noticeLabels,
  noticeMessage,
} from '../../client/pages/edu/hoc-vien-chi-tiet/phieu-bao/labels.js';
import {
  buildNotice,
  currentTermNo,
  formatDayVn,
  resolveTermNo,
} from '../../client/pages/edu/hoc-vien-chi-tiet/phieu-bao/model.js';
import {
  noticeSvg,
  wrap,
  wrapBalanced,
} from '../../client/pages/edu/hoc-vien-chi-tiet/phieu-bao/svg.js';
import type {
  Profile,
  SessionRow,
  Term,
} from '../../client/pages/edu/hoc-vien-chi-tiet/types.js';

/** The Vietnamese copy, read the way the page reads it (`edu.` + key, `{{name}}` filled in). */
function t(key: string, options: Record<string, unknown> = {}): string {
  let node: unknown = { edu: eduViVN };
  for (const part of key.split('.'))
    node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== 'string') throw new Error(`No copy for ${key}`);
  return node.replace(/\{\{(\w+)\}\}/gu, (_, name: string) =>
    String(options[name]),
  );
}

const term = (kySo: number, patch: Partial<Term> = {}): Term => ({
  kySo,
  goiHocId: 40 + kySo,
  loai: 'mua',
  trangThaiGoi: 'hieu_luc',
  ngayMua: '2026-01-20',
  soBuoi: 4,
  donGia: 150000,
  thanhTien: 600000,
  daThanhToan: 600000,
  conNo: 0,
  daDung: 4,
  conLai: 0,
  tienDo: 100,
  ...patch,
});

let nextId = 1;
const session = (
  ngay: string,
  patch: Partial<SessionRow> = {},
): SessionRow => ({
  diemDanhId: nextId++,
  buoiHocId: nextId++,
  stt: 0,
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

function profile(
  terms: readonly Term[],
  sessions: readonly SessionRow[],
  sum: Partial<Profile['tongHop']> = {},
): Profile {
  return {
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
      ...sum,
    },
    hocPhi: { cacKy: terms },
    buoiHoc: sessions,
    kienThuc: null,
    sach: null,
  };
}

const TODAY = '2026-03-10';

describe('notice of a tuition term: what it says', () => {
  it('lists the sessions of the term in order, its period and says the last term is used up', () => {
    const file = profile(
      [term(1)],
      [
        session('2026-01-24'),
        session('2026-01-31'),
        // An absence with leave deducted nothing: it belongs to no term and is listed apart.
        session('2026-02-07', {
          trangThai: 'vang_co_phep',
          soBuoiDaTru: 0,
          kySo: null,
        }),
        // An absence without leave that was deducted counts as a session of the term.
        session('2026-02-14', { trangThai: 'vang_khong_phep' }),
        session('2026-02-21'),
        // After the term ended: not part of its period.
        session('2026-02-28', {
          trangThai: 'vang_co_phep',
          soBuoiDaTru: 0,
          kySo: null,
        }),
      ],
    );
    const notice = buildNotice(file, 1, TODAY);
    expect(notice).not.toBeNull();
    expect(notice?.cacBuoi).toEqual([
      { stt: 1, ngay: '2026-01-24', vang: false },
      { stt: 2, ngay: '2026-01-31', vang: false },
      { stt: 3, ngay: '2026-02-14', vang: true },
      { stt: 4, ngay: '2026-02-21', vang: false },
    ]);
    expect(notice?.batDau).toBe('2026-01-24');
    expect(notice?.ketThuc).toBe('2026-02-21');
    expect(notice?.nghiKhongTinh).toEqual(['2026-02-07']);
    expect(notice?.status).toBe('het');
    expect(notice?.hocThem).toEqual([]);
  });

  it('says the student attended beyond the last term and lists those sessions', () => {
    const file = profile(
      [term(1)],
      [
        session('2026-01-24'),
        session('2026-01-31'),
        session('2026-02-07'),
        session('2026-02-14'),
        session('2026-02-21', { kySo: null, vuotSoDu: true }),
        session('2026-02-28', { kySo: null, vuotSoDu: true }),
      ],
      { soBuoiConLai: -2, dai: 'vuot_goi', vuotSoDu: 2 },
    );
    const notice = buildNotice(file, 1, TODAY);
    expect(notice?.status).toBe('vuot');
    expect(notice?.soBuoiVuot).toBe(2);
    expect(notice?.hocThem.map((row) => row.ngay)).toEqual([
      '2026-02-21',
      '2026-02-28',
    ]);
    expect(noticeLabels(t, notice!).conclusionTitle).toBe(
      'Đã hết kỳ, con đã học thêm 2 buổi',
    );
  });

  it('takes "running out" from the band of the server, never from a threshold of its own', () => {
    const terms = [term(1, { daDung: 2, conLai: 2, tienDo: 50 })];
    const sessions = [session('2026-01-24'), session('2026-01-31')];
    const low = buildNotice(
      profile(terms, sessions, { soBuoiConLai: 2, dai: 'sap_het' }),
      1,
      TODAY,
    );
    expect(low?.status).toBe('sap_het');
    expect(low?.conLai).toBe(2);
    // A term in use has a start and no end.
    expect(low?.ketThuc).toBeNull();
    expect(noticeLabels(t, low!).period).toBe(
      'Thời gian học: bắt đầu 24/01/2026, đang học',
    );
    // The same numbers with the band "fine": the notice follows the server.
    const fine = buildNotice(
      profile(terms, sessions, { soBuoiConLai: 2, dai: 'binh_thuong' }),
      1,
      TODAY,
    );
    expect(fine?.status).toBe('dang_hoc');
  });

  it('says an earlier term is over and names the term the student moved on to', () => {
    const file = profile(
      [
        term(1),
        term(2, { ngayMua: '2026-02-20', daDung: 1, conLai: 3, tienDo: 25 }),
      ],
      [
        session('2026-01-24'),
        session('2026-01-31'),
        session('2026-02-07'),
        session('2026-02-14'),
        session('2026-02-21', { kySo: 2 }),
      ],
      { soBuoiConLai: 3, dai: 'binh_thuong' },
    );
    const first = buildNotice(file, 1, TODAY);
    expect(first?.status).toBe('da_sang_ky_moi');
    expect(first?.kyTiepTheo?.kySo).toBe(2);
    expect(noticeLabels(t, first!).conclusionBody).toBe(
      'Con đang học sang Kỳ 2 (4 buổi).',
    );
    // Sessions beyond the balance are told on the last term only.
    expect(first?.hocThem).toEqual([]);
    expect(buildNotice(file, 2, TODAY)?.status).toBe('dang_hoc');
    // The term in use is the first one with sessions left.
    expect(currentTermNo(file)).toBe(2);
    expect(resolveTermNo(file, 'hien-tai')).toBe(2);
    expect(resolveTermNo(file, '1')).toBe(1);
    expect(resolveTermNo(file, '9')).toBeNull();
    expect(resolveTermNo(file, '')).toBeNull();
  });

  it('offers no notice to a person who sees no tuition or no sessions', () => {
    const coach = { ...profile([term(1)], []), hocPhi: null };
    expect(currentTermNo(coach)).toBeNull();
    expect(resolveTermNo(coach, 'hien-tai')).toBeNull();
    expect(buildNotice(coach, 1, TODAY)).toBeNull();
    const noSessions = { ...profile([term(1)], []), buoiHoc: null };
    expect(currentTermNo(noSessions)).toBeNull();
    // A student without a term has nothing to tell either.
    expect(currentTermNo(profile([], []))).toBeNull();
  });
});

describe('notice of a tuition term: the picture and the message', () => {
  const file = profile(
    [term(1)],
    [
      session('2026-01-24'),
      session('2026-01-31'),
      session('2026-02-07'),
      session('2026-02-14'),
    ],
  );
  const notice = buildNotice(file, 1, TODAY)!;

  it('draws the student, the term, every day and the conclusion', () => {
    const { svg, width, height } = noticeSvg(notice, noticeLabels(t, notice));
    expect(width).toBe(720);
    expect(height).toBeGreaterThan(400);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(
      true,
    );
    for (const text of [
      'THÔNG BÁO KỲ HỌC PHÍ',
      'Học viên Mẫu 07',
      'HS00007 · Lớp Mẫu 3 · Cơ sở Mẫu 1',
      'Kỳ 1 (4 buổi)',
      'Ngày nộp: 20/01/2026',
      'Thời gian học: từ 24/01/2026 đến 14/02/2026',
      'Các ngày đã học (4 buổi)',
      '24/01/2026',
      '14/02/2026',
      'Kỳ học phí này đã hết',
      'Lập ngày 10/03/2026 · CLB Cờ vua Dương Sinh',
    ])
      expect(svg).toContain(text);
    // No money on a notice.
    expect(svg).not.toContain('600.000');
    expect(svg).not.toContain('150.000');
  });

  it('grows with the number of sessions and keeps a name with markup harmless', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      session(`2026-03-${String(index + 1).padStart(2, '0')}`),
    );
    const long = buildNotice(
      {
        ...profile([term(1, { soBuoi: 20, daDung: 20 })], many),
        hocVien: { ...file.hocVien, hoTen: 'A <b>&"B"' },
      },
      1,
      TODAY,
    )!;
    const picture = noticeSvg(long, noticeLabels(t, long));
    expect(picture.height).toBeGreaterThan(
      noticeSvg(notice, noticeLabels(t, notice)).height,
    );
    expect(picture.svg).toContain('A &lt;b&gt;&amp;&quot;B&quot;');
    expect(picture.svg).not.toContain('<b>');
  });

  it('writes a message that stands on its own', () => {
    expect(noticeMessage(t, notice)).toBe(
      [
        'Kính gửi phụ huynh em Học viên Mẫu 07,',
        'CLB Cờ vua Dương Sinh xin gửi thống kê Kỳ 1 (4 buổi) của con:',
        '- Ngày nộp học phí: 20/01/2026',
        '- Đã học 4/4 buổi, còn lại 0 buổi',
        '- Thời gian học: từ 24/01/2026 đến 14/02/2026',
        '- Các ngày đã học: 24/01/2026, 31/01/2026, 07/02/2026, 14/02/2026',
        '',
        'Kỳ học phí này đã hết. Kính mời phụ huynh nộp học phí kỳ tiếp theo để con tiếp tục học.',
        'Trân trọng cảm ơn phụ huynh!',
      ].join('\n'),
    );
  });

  it('formats a day the way a parent reads it and cuts long lines at spaces', () => {
    expect(formatDayVn('2026-01-24')).toBe('24/01/2026');
    expect(formatDayVn('')).toBe('');
    expect(wrap('một hai ba bốn năm', 8)).toEqual(['một hai', 'ba bốn', 'năm']);
    // Two lines of about the same length rather than a last line of one word.
    expect(wrap('một hai ba bốn năm sáu bảy', 22)).toEqual([
      'một hai ba bốn năm sáu',
      'bảy',
    ]);
    expect(wrapBalanced('một hai ba bốn năm sáu bảy', 22)).toEqual([
      'một hai ba bốn',
      'năm sáu bảy',
    ]);
    expect(wrapBalanced('một hai', 22)).toEqual(['một hai']);
  });
});
