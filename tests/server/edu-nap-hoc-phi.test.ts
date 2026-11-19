import { describe, expect, it } from 'vitest';

import {
  ghepTienVaoKy,
  lapKeHoachHocPhi,
  type KyLark,
  type TienLark,
  type TrangThaiHienCo,
} from '../../server/edu/lark/hoc-phi.js';
import {
  chayNapHocPhi,
  inBaoCaoHocPhi,
} from '../../server/edu/lark/nap-hoc-phi.js';
import { chayNhap } from '../../server/edu/lark/nhap.js';
import type { LarkRecord } from '../../server/edu/lark/nguon.js';
import { test } from '../helpers/edu.js';
import {
  buildFixture,
  fixtureSource,
  IDS,
  ms,
} from '../helpers/lark-fixture.js';

// Loading the tuition history of Lark (docs/plans/2026-11-19-ke-hoach-nap-lich-su-hoc-phi.md). Every value is made up.

const ky = (rec: string, over: Partial<KyLark> = {}): KyLark => ({
  rec,
  hocVienKey: 'recHV',
  ngay: '2025-01-10',
  ngayBatDau: null,
  soBuoiNop: 10,
  soBuoi: 10,
  tonLark: 0,
  ...over,
});
const tien = (rec: string, over: Partial<TienLark> = {}): TienLark => ({
  rec,
  hocVienKey: 'recHV',
  ngay: '2025-01-10',
  soBuoi: 10,
  soTien: 1_000_000,
  lienKet: [],
  ...over,
});

describe('ghepTienVaoKy', () => {
  it('tries the link, then day and sessions, then day, then sessions within 30 days', () => {
    const terms = [
      ky('kA', { ngay: '2025-01-10', soBuoiNop: 10 }),
      ky('kB', { ngay: '2025-03-01', soBuoiNop: 8 }),
      ky('kC', { ngay: '2025-05-01', soBuoiNop: 12 }),
      ky('kD', { ngay: '2025-07-01', soBuoiNop: 20 }),
    ];
    const match = ghepTienVaoKy(terms, [
      tien('t1', { ngay: '2025-01-10', soBuoi: 10 }),
      tien('t2', { ngay: '2024-12-01', soBuoi: 1, lienKet: ['kB'] }),
      tien('t3', { ngay: '2025-05-01', soBuoi: 99 }),
      tien('t4', { ngay: '2025-07-20', soBuoi: 20 }),
      tien('t5', { ngay: '2025-09-30', soBuoi: 20 }),
    ]);
    expect(Object.fromEntries(match)).toEqual({
      t1: { ky: 'kA', cach: 'ngay_so_buoi' },
      t2: { ky: 'kB', cach: 'lien_ket' },
      t3: { ky: 'kC', cach: 'ngay' },
      t4: { ky: 'kD', cach: 'so_buoi_30_ngay' },
      // kD already has a payment, and nothing else fits: no term.
      t5: null,
    });
  });

  it('gives a term one payment by rule, never one of another student', () => {
    const match = ghepTienVaoKy(
      [ky('kA')],
      [
        tien('t1'),
        tien('t2'),
        tien('t3', { hocVienKey: 'recKhac' }),
        tien('t4', { hocVienKey: null }),
      ],
    );
    expect(match.get('t1')).toEqual({ ky: 'kA', cach: 'ngay_so_buoi' });
    expect(match.get('t2')).toBeNull();
    expect(match.get('t3')).toBeNull();
    expect(match.get('t4')).toBeNull();
  });

  it('accepts the start day of a term as its day', () => {
    const match = ghepTienVaoKy(
      [ky('kA', { ngay: '2025-01-03', ngayBatDau: '2025-01-10' })],
      [tien('t1', { ngay: '2025-01-10' })],
    );
    expect(match.get('t1')).toEqual({ ky: 'kA', cach: 'ngay_so_buoi' });
  });
});

describe('lapKeHoachHocPhi', () => {
  const hienCo = (over: Partial<TrangThaiHienCo> = {}): TrangThaiHienCo => ({
    hocVien: new Map([
      ['recHV', { id: 1, ma: 'HS1', coSoId: 7, soBuoiConLai: 3 }],
    ]),
    goi: [
      {
        id: 10,
        hocVienId: 1,
        externalId: 'lark:sodu:recHV',
        loai: 'chuyen_so_du',
        soBuoi: 5,
        thanhTien: 0,
        trangThai: 'hieu_luc',
        soDuDaGhi: 5,
      },
    ],
    diemDanhLichSu: [
      {
        id: 100,
        hocVienId: 1,
        trangThai: 'co_mat',
        truVangCoPhep: false,
        truVangKhongPhep: false,
      },
      {
        id: 101,
        hocVienId: 1,
        trangThai: 'vang_co_phep',
        truVangCoPhep: true,
        truVangKhongPhep: false,
      },
      {
        id: 102,
        hocVienId: 1,
        trangThai: 'vang_khong_phep',
        truVangCoPhep: false,
        truVangKhongPhep: false,
      },
    ],
    thanhToan: [],
    ...over,
  });

  it('adds the terms, cancels the opening package, counts the history and prices a term from its payment', () => {
    const plan = lapKeHoachHocPhi(
      {
        ky: [ky('kA', { soBuoi: 8, soBuoiNop: 10, tonLark: 2 })],
        tien: [tien('t1', { soTien: 1_200_000 })],
        vanDe: [],
      },
      hienCo(),
    );
    expect(plan.hocVien).toHaveLength(1);
    const student = plan.hocVien[0];
    expect(student.goiMoi).toEqual([
      {
        externalId: 'lark:deal:kA',
        hocVienId: 1,
        soBuoi: 8,
        ngayMua: '2025-01-10',
        // The price per session is over the sessions paid on Lark, not over the ones left after "chưa thống kê".
        donGia: 120_000,
        thanhTien: 1_200_000,
      },
    ]);
    expect(student.huyGoi).toEqual([{ goiHocId: 10, thayDoi: -5 }]);
    // Present: 1; excused absence on a session that deducts it: 1; absence without leave: 0.
    expect(student.diemDanh).toEqual([
      { id: 100, soBuoiDaTru: 1 },
      { id: 101, soBuoiDaTru: 1 },
      { id: 102, soBuoiDaTru: 0 },
    ]);
    // 3 + 8 − 5 − 2
    expect([student.soDuTruoc, student.soDuSau, student.tonLark]).toEqual([
      3, 4, 2,
    ]);
    expect(plan.thanhToanMoi).toEqual([
      {
        externalId: 'lark:tongdeal:t1',
        hocVienId: 1,
        coSoId: 7,
        soTien: 1_200_000,
        ngay: '2025-01-10',
        goiKey: 'lark:deal:kA',
      },
    ]);
    expect(plan.tienTheoNam).toEqual({
      '2025': { lark: 1_200_000, nocoEdu: 1_200_000 },
    });
  });

  it('reports what it cannot place and leaves a student without a paid term alone', () => {
    const plan = lapKeHoachHocPhi(
      {
        ky: [ky('kX', { hocVienKey: 'recKhongCo' })],
        tien: [
          tien('t1', { hocVienKey: null, soTien: 500_000 }),
          tien('t2', { hocVienKey: 'recKhongCo', soTien: 700_000 }),
        ],
        vanDe: [{ id: 'kY', code: 'DEAL_THIEU_NGAY' }],
      },
      hienCo(),
    );
    expect(plan.hocVien).toEqual([]);
    expect(plan.thanhToanMoi).toEqual([]);
    expect(plan.vanDe).toEqual([
      { id: 'kY', code: 'DEAL_THIEU_NGAY' },
      { id: 'kX', code: 'DEAL_HOC_VIEN_KHONG_CO' },
      { id: 't1', code: 'TONG_DEAL_THIEU_HOC_VIEN', soTien: 500_000 },
      { id: 't2', code: 'TONG_DEAL_HOC_VIEN_KHONG_CO', soTien: 700_000 },
    ]);
  });
});

// --- Against a real database ----------------------------------------------------------------------------------------

const CLEAR = [
  'eduNhapLarkNhatKy',
  'eduSachHoc',
  'eduPhatSach',
  'eduNopSach',
  'eduSoDuNhatKy',
  'eduThanhToan',
  'eduGoiHoc',
  'eduDiemDanh',
  'eduBuoiHoc',
  'eduHocVienPhuHuynh',
  'eduPhuHuynh',
  'eduHocVienChuyenNhom',
  'eduHocVien',
  'eduLopLich',
  'eduLopNhom',
  'eduLop',
  'eduCoSo',
];

async function fresh(connection: any): Promise<string> {
  for (const table of CLEAR)
    await connection.query.deleteFrom(table).allowAllRows().execute();
  return String(
    (
      await connection.query
        .selectFrom('user')
        .select('id')
        .executeTakeFirstOrThrow()
    ).id,
  );
}

const link = (id: string) => ({ link_record_ids: [id] });
const payment = (
  id: string,
  student: string | null,
  fields: Record<string, unknown>,
): LarkRecord => ({
  recordId: id,
  fields: {
    ...(student ? { 'Tên HS link': link(student) } : {}),
    'Tiền sách': 0,
    'Mua khác': 0,
    ...fields,
  },
});

test('loads the terms of a student imported with an opening balance and recomputes his balance, once', async ({
  database,
  connection,
}) => {
  const userId = await fresh(connection);
  const q = connection.query;

  // The state of production: s1 was imported before `Deal HP` could be read — an opening balance of 5 on 2025-02-01,
  // his two earlier sessions written as history (`tinhVaoSoDu = false`), two later ones deducted: balance 3. One
  // payment of his was written then and linked to the opening package.
  const tables = buildFixture();
  tables.tongDeal.push(
    payment('recTD1', IDS.s1, {
      'Ngày nộp': ms('2025-01-10'),
      'Số buổi nộp': 10,
      'Học phí': 1_200_000,
    }),
  );
  await chayNhap(database, fixtureSource(tables), {
    commit: true,
    userId,
    delayMs: 0,
  });
  const s1 = await q
    .selectFrom('eduHocVien')
    .select(['id', 'ma', 'soBuoiConLai'])
    .where('externalId', '=', IDS.s1)
    .executeTakeFirstOrThrow();
  const s2Before = await q
    .selectFrom('eduHocVien')
    .select('soBuoiConLai')
    .where('externalId', '=', IDS.s2)
    .executeTakeFirstOrThrow();
  expect(Number(s1.soBuoiConLai)).toBe(3);

  // Lark now: two paid terms of s1, and the payments.
  const deal = (id: string, fields: Record<string, unknown>): LarkRecord => ({
    recordId: id,
    fields: { 'Học viên': link(IDS.s1), 'Đã nộp': 1, ...fields },
  });
  tables.dealHp.push(
    deal('recDealA', {
      'Ngày nộp HP': ms('2025-01-10'),
      'Số buổi nộp': 10,
      'Số buổi còn tồn': 4,
    }),
    deal('recDealB', {
      'Ngày bắt đầu': ms('2026-01-05'),
      'Số buổi nộp': 8,
      'Số buổi còn tồn': 8,
    }),
  );
  tables.tongDeal.push(
    payment('recTD2', IDS.s1, {
      'Ngày nộp': ms('2025-12-20'),
      'Số buổi nộp': 8,
      'Học phí': 960_000,
      'Link với Lần nộp HP': link('recDealB'),
    }),
    payment('recTD3', IDS.s1, {
      'Ngày nộp': ms('2025-06-01'),
      'Số buổi nộp': 4,
      'Học phí': 480_000,
    }),
    payment('recTD4', null, {
      'Ngày nộp': ms('2024-12-01'),
      'Học phí': 1_440_000,
    }),
  );

  const dry = await chayNapHocPhi(database, fixtureSource(tables), {
    commit: false,
    userId: null,
  });
  // Nothing stays after the dry run.
  expect(
    await q
      .selectFrom('eduGoiHoc')
      .select('id')
      .where('externalId', 'like', 'lark:deal:%')
      .execute(),
  ).toHaveLength(0);
  expect(dry).toMatchObject({
    mode: 'dry-run',
    hocVien: 1,
    goiMoi: 2,
    huyGoi: 1,
    diemDanh: 2,
    buoiTru: 2,
    thanhToanMoi: 2,
    tienMoi: 1_440_000,
    ganLai: 1,
    kyChuaRoTien: 0,
    ghep: {
      lien_ket: 1,
      ngay_so_buoi: 1,
      ngay: 0,
      so_buoi_30_ngay: 0,
      khong_gan: 1,
    },
    soDuKiemTra: 'khop',
  });
  // 3 + 10 + 8 − 5 (opening package taken back) − 2 (history now counted)
  expect(dry.soDu).toEqual([
    { ma: String(s1.ma), truoc: 3, sau: 14, lark: 12 },
  ]);
  expect(dry.vanDe).toMatchObject({
    TONG_DEAL_THIEU_HOC_VIEN: { n: 1, soTien: 1_440_000, ids: ['recTD4'] },
  });
  expect(dry.tienTheoNam['2025']).toEqual({
    lark: 2_640_000,
    nocoEdu: 2_640_000,
  });
  expect(dry.tienTheoNam['2024']).toEqual({ lark: 1_440_000, nocoEdu: 0 });
  // The printed report holds codes and amounts, never a name.
  const printed = inBaoCaoHocPhi(dry).join('\n');
  expect(printed).toContain(`${String(s1.ma)}: 3 → 14 | 12`);
  expect(printed).not.toMatch(/Học Viên Mẫu|Phụ huynh/iu);

  const done = await chayNapHocPhi(database, fixtureSource(tables), {
    commit: true,
    userId,
  });
  expect(done.soDu).toEqual(dry.soDu);
  expect(done.soDuKiemTra).toBe('khop');

  const after = await q
    .selectFrom('eduHocVien')
    .select('soBuoiConLai')
    .where('id', '=', s1.id)
    .executeTakeFirstOrThrow();
  expect(Number(after.soBuoiConLai)).toBe(14);
  // The ledger adds up to the balance.
  const ledger = await q
    .selectFrom('eduSoDuNhatKy')
    .select(['thayDoi', 'lyDo'])
    .where('hocVienId', '=', s1.id)
    .execute();
  expect(
    ledger.reduce((sum: number, row: any) => sum + Number(row.thayDoi), 0),
  ).toBe(14);
  expect(
    ledger.filter((row: any) => row.lyDo === 'huy_goi_mo_dau'),
  ).toHaveLength(1);

  const packages = await q
    .selectFrom('eduGoiHoc')
    .select(['id', 'externalId', 'soBuoi', 'thanhTien', 'donGia', 'trangThai'])
    .where('hocVienId', '=', s1.id)
    .orderBy('id')
    .execute();
  const byKey = new Map(packages.map((row: any) => [row.externalId, row]));
  expect(byKey.get(`lark:sodu:${IDS.s1}`)).toMatchObject({
    trangThai: 'da_huy',
  });
  expect(byKey.get('lark:deal:recDealA')).toMatchObject({
    soBuoi: 10,
    thanhTien: 1_200_000,
    donGia: 120_000,
    trangThai: 'hieu_luc',
  });
  expect(byKey.get('lark:deal:recDealB')).toMatchObject({
    soBuoi: 8,
    thanhTien: 960_000,
  });
  const goiOf = new Map(
    (
      await q
        .selectFrom('eduThanhToan')
        .select(['externalId', 'goiHocId'])
        .where('hocVienId', '=', s1.id)
        .execute()
    ).map((row: any) => [row.externalId, row.goiHocId]),
  );
  expect(goiOf.get('lark:tongdeal:recTD1')).toBe(
    (byKey.get('lark:deal:recDealA') as any).id,
  );
  expect(goiOf.get('lark:tongdeal:recTD2')).toBe(
    (byKey.get('lark:deal:recDealB') as any).id,
  );
  expect(goiOf.get('lark:tongdeal:recTD3')).toBeNull();
  // Every attendance row of s1 now counts.
  const marks = await q
    .selectFrom('eduDiemDanh')
    .select('tinhVaoSoDu')
    .where('hocVienId', '=', s1.id)
    .execute();
  expect(
    marks.every(
      (row: any) => row.tinhVaoSoDu === true || row.tinhVaoSoDu === 1,
    ),
  ).toBe(true);
  // A student with no paid term is left alone.
  const s2After = await q
    .selectFrom('eduHocVien')
    .select('soBuoiConLai')
    .where('externalId', '=', IDS.s2)
    .executeTakeFirstOrThrow();
  expect(Number(s2After.soBuoiConLai)).toBe(Number(s2Before.soBuoiConLai));
  // One log row, counts and codes only.
  const log = await q
    .selectFrom('eduNhapLarkNhatKy')
    .select(['trangThai', 'tongKet'])
    .orderBy('id', 'desc')
    .executeTakeFirstOrThrow();
  const tongKet =
    typeof log.tongKet === 'string' ? JSON.parse(log.tongKet) : log.tongKet;
  expect([log.trangThai, tongKet.nguon, tongKet.goiMoi]).toEqual([
    'thanh_cong',
    'nap_hoc_phi',
    2,
  ]);

  // Running it again finds nothing to do.
  const again = await chayNapHocPhi(database, fixtureSource(tables), {
    commit: false,
    userId: null,
  });
  expect(again).toMatchObject({
    hocVien: 0,
    goiMoi: 0,
    thanhToanMoi: 0,
    ganLai: 0,
  });
});
