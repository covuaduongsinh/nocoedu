import { describe, expect, it } from 'vitest';

import { chayNhap, inBaoCao } from '../../server/edu/lark/nhap.js';
import type { LarkRecord } from '../../server/edu/lark/nguon.js';
import { lapThanhToan } from '../../server/edu/lark/thanh-toan.js';
import { test } from '../helpers/edu.js';
import {
  buildFixture,
  fixtureData,
  fixtureSource,
  IDS,
  ms,
  withDealStudents,
} from '../helpers/lark-fixture.js';

// The tuition of `Tổng Deal (HP + book)` (DS-61 phase B). Every name, number and code is made up.

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

/** s6 has two Deals: 10 sessions on 2025-01-10 (`recDealMau06a`) and 8 on 2026-01-05 (`recDealMau06b`). */
function tongDeal(): LarkRecord[] {
  return [
    // Same student, day and sessions as `recDealMau06a`, no link: matched by the rule.
    payment('recTD1', IDS.s6, {
      'Ngày nộp': ms('2025-01-10'),
      'Số buổi nộp': 10,
      'Học phí': 1_200_000,
    }),
    // A link to the Deal row wins over the rule.
    payment('recTD2', IDS.s6, {
      'Ngày nộp': ms('2026-01-05'),
      'Số buổi nộp': 8,
      'Học phí': 960_000,
      'Link với Lần nộp HP': link('recDealMau06b'),
    }),
    // No Deal row of his matches: the writer falls back to a package of his.
    payment('recTD3', IDS.s6, {
      'Ngày nộp': ms('2025-06-01'),
      'Số buổi nộp': 4,
      'Học phí': 480_000,
    }),
    // A row with no student: only reported, with its amount.
    payment('recTD4', null, {
      'Ngày nộp': ms('2024-12-01'),
      'Số buổi nộp': 12,
      'Học phí': 1_440_000,
    }),
    // Books only: no payment of tuition.
    payment('recTD5', IDS.s6, {
      'Ngày nộp': ms('2025-03-01'),
      'Tiền sách': 300_000,
    }),
  ];
}

const withMoney = () => {
  const tables = withDealStudents(buildFixture());
  tables.tongDeal.push(...tongDeal());
  return tables;
};

describe('lapThanhToan', () => {
  const students = new Set<string>([IDS.s6]);
  const plan = () => lapThanhToan(fixtureData(withMoney()), students);

  it('matches a payment to its Deal by link, then by student, day and sessions', () => {
    const rows = plan().rows;
    expect(rows.find((r) => r.externalId.endsWith('recTD1'))?.dealKey).toBe(
      'recDealMau06a',
    );
    expect(rows.find((r) => r.externalId.endsWith('recTD2'))?.dealKey).toBe(
      'recDealMau06b',
    );
    expect(
      rows.find((r) => r.externalId.endsWith('recTD3'))?.dealKey,
    ).toBeNull();
  });

  it('reports what it leaves out with its amount and counts a books-only row apart', () => {
    const p = plan();
    expect(p.rows.map((r) => r.soTien)).toEqual([1_200_000, 480_000, 960_000]);
    expect(p.problems).toEqual([
      { id: 'recTD4', code: 'TONG_DEAL_THIEU_HOC_VIEN', soTien: 1_440_000 },
    ]);
    expect(p.khongHocPhi).toBe(1);
  });

  it('leaves out a payment of a student the import does not hold', () => {
    const p = lapThanhToan(fixtureData(withMoney()), new Set());
    expect(p.rows).toEqual([]);
    expect(p.problems.map((x) => x.code)).toContain('TONG_DEAL_HOC_VIEN_BI_BO');
  });

  it('warns about a payment typed twice but keeps both', () => {
    const tables = withMoney();
    tables.tongDeal.push(
      payment('recTD6', IDS.s6, {
        'Ngày nộp': ms('2025-01-10'),
        'Số buổi nộp': 10,
        'Học phí': 1_200_000,
      }),
    );
    const p = lapThanhToan(fixtureData(tables), students);
    expect(p.rows).toHaveLength(4);
    expect(p.warnings.map((w) => w.code)).toEqual(['TONG_DEAL_TRUNG_LAP']);
  });

  it('does nothing when the app cannot see the table', () => {
    const p = lapThanhToan(
      { ...fixtureData(withMoney()), tongDealDoc: false, tongDeal: [] },
      students,
    );
    expect(p.doc).toBe(false);
    expect(p.rows).toEqual([]);
  });
});

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
  'eduHocVien',
  'eduLopLich',
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

const run = (
  database: any,
  tables: ReturnType<typeof withMoney>,
  user?: string,
) =>
  chayNhap(database, fixtureSource(tables), {
    commit: user !== undefined,
    userId: user ?? null,
    delayMs: 0,
  });

test('a dry run writes no payment and says what the commit writes; the commit and a repeat agree', async ({
  database,
  connection,
}) => {
  const userId = await fresh(connection);
  const tables = withMoney();
  const count = async (): Promise<number> =>
    (await connection.query.selectFrom('eduThanhToan').select('id').execute())
      .length;

  const dry = await run(database, tables);
  expect(await count()).toBe(0);
  expect(dry.thanhToan).toMatchObject({
    doc: true,
    dong: 3,
    tongTien: 2_640_000,
    ghi: { tao: 3, trung: 0, khongCoGoi: 0, tongTien: 2_640_000 },
  });
  expect(dry.thanhToan?.problems).toEqual([
    expect.objectContaining({
      code: 'TONG_DEAL_THIEU_HOC_VIEN',
      count: 1,
      tongTien: 1_440_000,
    }),
  ]);
  const text = inBaoCao(dry).join('\n');
  expect(text).toContain('TONG_DEAL_THIEU_HOC_VIEN');
  expect(text).not.toMatch(/Mẫu/u);

  const done = await run(database, tables, userId);
  expect(done.thanhToan?.ghi).toMatchObject({ tao: 3, tongTien: 2_640_000 });
  const rows = await connection.query
    .selectFrom('eduThanhToan')
    .selectAll()
    .execute();
  expect(rows).toHaveLength(3);
  const packages = new Map(
    (
      await connection.query
        .selectFrom('eduGoiHoc')
        .select(['id', 'externalId'])
        .execute()
    ).map((row: any) => [row.externalId, row.id]),
  );
  const of = (key: string) =>
    rows.find((row: any) => row.externalId === `lark:tongdeal:${key}`);
  expect(of('recTD1')).toMatchObject({
    goiHocId: packages.get('lark:deal:recDealMau06a'),
    soTien: 1_200_000,
    ngay: '2025-01-10',
    thang: '2025-01',
    hinhThuc: 'khong_ro',
    nguoiGhiNhanId: userId,
  });
  expect(of('recTD2')?.goiHocId).toBe(packages.get('lark:deal:recDealMau06b'));
  // The unmatched payment points to a package of the same student (the nearest in time).
  expect(of('recTD3')?.goiHocId).toBeDefined();
  expect(rows.every((row: any) => row.coSoId > 0)).toBe(true);

  // A repeat writes nothing and the dry run says every payment is there.
  const again = await run(database, tables, userId);
  expect(again.thanhToan?.ghi).toMatchObject({ tao: 0, trung: 3 });
  expect(await count()).toBe(3);
  const dryAgain = await run(database, tables);
  expect(dryAgain.thanhToan?.ghi).toMatchObject({ tao: 0, trung: 3 });
});

test('without Tổng Deal the import works as before and writes no payment', async ({
  database,
  connection,
}) => {
  const userId = await fresh(connection);
  const report = await chayNhap(
    database,
    fixtureSource(withMoney(), { hide: ['tongDeal'] }),
    { commit: true, userId, delayMs: 0 },
  );
  expect(report.thanhToan?.doc).toBe(false);
  expect(
    (await connection.query.selectFrom('eduThanhToan').select('id').execute())
      .length,
  ).toBe(0);
});
