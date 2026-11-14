import { describe, expect, it } from 'vitest';

import {
  EMPTY_STATE,
  lapKeHoach,
  tongKetTheoBang,
  type ExistingState,
} from '../../server/edu/lark/ke-hoach.js';
import { chayNhap, inBaoCao, taoBaoCao } from '../../server/edu/lark/nhap.js';
import { readLarkData } from '../../server/edu/lark/nguon.js';
import { test } from '../helpers/edu.js';
import {
  buildFixture,
  fixtureData,
  fixtureSource,
  IDS,
  withDealStudents,
} from '../helpers/lark-fixture.js';

// `Contact` and `Deal HP` (DS-60 phase 3). Every value is made up (tests/helpers/lark-fixture.ts).
const data = () => fixtureData(withDealStudents(buildFixture()));
const plan = (existing: ExistingState = EMPTY_STATE) =>
  lapKeHoach(data(), existing, { unexcusedAbsenceDeducts: false });
const known = (over: Partial<ExistingState>): ExistingState => ({
  ...EMPTY_STATE,
  ...over,
});
const deal = (id: string) => `lark:deal:${id}`;

describe('Contact → parents', () => {
  it('links a parent from both "Tên con số 1" and "Tên con số 2", the first as the main contact', () => {
    const p = plan();
    const s6 = p.hocVien.find((row) => row.externalId === IDS.s6);
    // Listed second but on "Tên con số 1": the main contact. Its relation comes from the student row ("Bố"); the
    // grandparent has "ông / bà" → khac.
    expect(s6?.parents).toEqual([
      { key: 'lark:contact:recContactMau06b', quanHe: 'bo', lienHeChinh: true },
      {
        key: `lark:contact:${IDS.contactGrand}`,
        quanHe: 'khac',
        lienHeChinh: false,
      },
    ]);
    // The sibling pair of the base fixture share one parent through "Tên con số 2".
    const s2 = p.hocVien.find((row) => row.externalId === IDS.s2);
    expect(s2?.parents.map((x) => x.key)).toEqual([
      `lark:contact:${IDS.contactMe}`,
    ]);
  });

  it('leaves out a Contact without a phone (PH_THIEU_SDT) and a lead, and reads only the agreed columns', () => {
    const p = plan();
    expect(p.warnings).toContainEqual({
      table: 'phuHuynh',
      id: IDS.contactNoPhone,
      code: 'PH_THIEU_SDT',
    });
    expect(p.warnings).toContainEqual({
      table: 'phuHuynh',
      id: IDS.s4,
      code: 'THIEU_PHU_HUYNH',
    });
    expect(p.phuHuynh.map((row) => row.externalId)).not.toContain(
      `lark:contact:${IDS.contactLead}`,
    );
    // Address, notes and the like are in the made-up Contact and must not reach the plan.
    expect(JSON.stringify(p)).not.toMatch(/nhạy cảm/u);
  });

  it('matches a parent that NocoEdu already holds by phone and never creates a second one', () => {
    const p = plan(
      known({
        parentsByPhone: new Map([
          ['0900000006', { id: 40, externalId: 'lark:ph:0900000006' }],
        ]),
        externalIds: {
          ...EMPTY_STATE.externalIds,
          phuHuynh: new Set(['lark:ph:0900000006']),
        },
      }),
    );
    const grand = p.phuHuynh.find((row) => row.soDienThoai === '0900000006');
    expect(grand).toMatchObject({ action: 'ghep', existingId: 40 });
    // The earlier run keyed parents by phone: the dry run says so, once.
    expect(p.warnings).toContainEqual({
      table: 'phuHuynh',
      id: 'lark:ph:*',
      code: 'KHOA_CU_LARK_PH',
    });
    // A rerun of this version finds its own key and reports a duplicate.
    const again = plan(
      known({
        externalIds: {
          ...EMPTY_STATE.externalIds,
          phuHuynh: new Set([`lark:contact:${IDS.contactGrand}`]),
        },
      }),
    );
    expect(
      again.phuHuynh.find((row) => row.soDienThoai === '0900000006')?.action,
    ).toBe('trung');
  });
});

describe('Deal HP → packages', () => {
  it('makes one "mua" package per paid Deal: sessions paid minus "chưa thống kê", dated by payment or start day', () => {
    const p = plan();
    const packages = p.goiHoc.filter((row) => row.hocVienKey === IDS.s6);
    expect(packages).toEqual([
      expect.objectContaining({
        externalId: deal('recDealMau06a'),
        soBuoi: 8,
        ngayChot: '2025-01-10',
        loai: 'mua',
        action: 'tao',
      }),
      expect.objectContaining({
        externalId: deal('recDealMau06b'),
        soBuoi: 8,
        ngayChot: '2026-01-05',
        loai: 'mua',
      }),
    ]);
    // A student with Deals gets no opening package from the balance on his row.
    expect(p.goiHoc.map((row) => row.externalId)).not.toContain(
      `lark:sodu:${IDS.s6}`,
    );
    // Students without a Deal keep the opening package.
    expect(p.goiHoc.filter((row) => row.loai === 'chuyen_so_du').length).toBe(
      2,
    );
  });

  it('reports an empty Deal, one that was never paid and one with no date, and creates none of them', () => {
    const p = plan();
    expect(p.warnings).toContainEqual({
      table: 'goiHoc',
      id: 'recDealTrong',
      code: 'DEAL_TRONG',
    });
    expect(p.warnings).toContainEqual({
      table: 'goiHoc',
      id: 'recDealMau07a',
      code: 'DEAL_CHUA_NOP',
    });
    expect(p.problems).toContainEqual({
      table: 'goiHoc',
      id: 'recDealMau07b',
      code: 'DEAL_THIEU_NGAY',
    });
    expect(p.goiHoc.some((row) => row.hocVienKey === IDS.s7)).toBe(false);
  });

  it('recomputes the balance from every session of 2024–2026, with no cut-off date', () => {
    const p = plan();
    const rows = p.diemDanh.filter((row) => row.hocVienKey === IDS.s6);
    expect(rows.every((row) => row.tinhVaoSoDu)).toBe(true);
    expect(rows.map((row) => row.soBuoiDaTru)).toEqual([1, 0, 1, 1]);
    // 8 + 8 − 3 present (the absence costs nothing). Lark shows 3 on the student row and 1 + 6 on the Deals.
    expect(p.balances.find((row) => row.hocVienKey === IDS.s6)).toMatchObject({
      recomputed: 13,
      larkBalance: 3,
      dealRemaining: 7,
      difference: 10,
    });
  });

  it('prints the extra column and the counts, and never a name or a phone number', () => {
    const report = taoBaoCao(plan(), 'dry-run');
    const text = [...inBaoCao(report), JSON.stringify(report)].join('\n');
    expect(text).toContain('Σ tồn Deal');
    expect(text).toMatch(/HV-20240101-006 \| 3 \| 7 \| 13 \| \? \| 10/u);
    expect(text).not.toMatch(/Mẫu 0|Phụ Huynh|0900|example\.com|nhạy cảm/u);
    expect(tongKetTheoBang(plan()).goiHoc.tao).toBe(4);
  });

  it('is a duplicate when the Deal was imported before', () => {
    const p = plan(
      known({
        externalIds: {
          ...EMPTY_STATE.externalIds,
          goiHoc: new Set([deal('recDealMau06a'), deal('recDealMau06b')]),
        },
      }),
    );
    expect(
      p.goiHoc.filter((row) => row.hocVienKey === IDS.s6).map((r) => r.action),
    ).toEqual(['trung', 'trung']);
  });

  it('does not add Deal packages on top of an opening package an earlier run already wrote', () => {
    const p = plan(
      known({
        externalIds: {
          ...EMPTY_STATE.externalIds,
          goiHoc: new Set([`lark:sodu:${IDS.s6}`]),
        },
      }),
    );
    expect(p.warnings).toContainEqual({
      table: 'goiHoc',
      id: IDS.s6,
      code: 'GOI_CU_LARK_SODU',
    });
    expect(
      p.goiHoc
        .filter((row) => row.hocVienKey === IDS.s6)
        .map((row) => [row.externalId, row.action]),
    ).toEqual([[`lark:sodu:${IDS.s6}`, 'trung']]);
  });
});

describe('reading the two tables', () => {
  it('stops with LARK_KHONG_DOC_DUOC when the app cannot see Contact or Deal HP', async () => {
    for (const hide of ['contact', 'dealHp'] as const)
      await expect(
        readLarkData(fixtureSource(undefined, { hide: [hide] })),
      ).rejects.toMatchObject({ code: 'LARK_KHONG_DOC_DUOC' });
  });

  it('stops with LARK_CAU_TRUC_DOI when a field of Deal HP was renamed, before reading a record', async () => {
    const source = fixtureSource(undefined, {
      drop: { table: 'dealHp', field: 'Số buổi nộp' },
    });
    await expect(readLarkData(source)).rejects.toMatchObject({
      code: 'LARK_CAU_TRUC_DOI',
    });
    expect(source.calls.filter((call) => call.startsWith('records'))).toEqual(
      [],
    );
  });
});

test('--commit writes the packages without a price or a payment, recomputes the balance, and a second run adds nothing', async ({
  database,
  connection,
}) => {
  for (const table of [
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
  ])
    await connection.query.deleteFrom(table).allowAllRows().execute();
  const userId = String(
    (
      await connection.query
        .selectFrom('user')
        .select('id')
        .executeTakeFirstOrThrow()
    ).id,
  );
  const tables = withDealStudents(buildFixture());
  const run = () =>
    chayNhap(database, fixtureSource(tables), {
      commit: true,
      userId,
      delayMs: 0,
    });
  const first = await run();
  const q = connection.query;

  const s6 = await q
    .selectFrom('eduHocVien')
    .select(['id', 'soBuoiConLai'])
    .where('externalId', '=', IDS.s6)
    .executeTakeFirstOrThrow();
  expect(Number(s6.soBuoiConLai)).toBe(13);
  const packages = await q
    .selectFrom('eduGoiHoc')
    .select(['externalId', 'soBuoi', 'donGia', 'thanhTien', 'loai', 'ngayMua'])
    .where('hocVienId', '=', s6.id)
    .orderBy('ngayMua')
    .execute();
  expect(packages).toEqual([
    expect.objectContaining({
      externalId: deal('recDealMau06a'),
      soBuoi: 8,
      donGia: 0,
      thanhTien: 0,
      loai: 'mua',
      ngayMua: '2025-01-10',
    }),
    expect.objectContaining({
      externalId: deal('recDealMau06b'),
      soBuoi: 8,
      loai: 'mua',
    }),
  ]);
  // Lark holds no amount: no payment is invented.
  expect(
    await q.selectFrom('eduThanhToan').select('id').execute(),
  ).toHaveLength(0);
  const ledger = await q
    .selectFrom('eduSoDuNhatKy')
    .select(['thayDoi', 'soDuSau', 'lyDo'])
    .where('hocVienId', '=', s6.id)
    .orderBy('id')
    .execute();
  expect(ledger.map((row: any) => Number(row.thayDoi))).toEqual([
    8, 8, -1, -1, -1,
  ]);
  expect(Number(ledger.at(-1)?.soDuSau)).toBe(13);

  // The parents come from the Contacts, with the zalo number and the relation.
  const parents = await q
    .selectFrom('eduHocVienPhuHuynh')
    .select(['quanHe', 'lienHeChinh'])
    .where('hocVienId', '=', s6.id)
    .orderBy('id')
    .execute();
  expect(parents.map((row: any) => [row.quanHe, row.lienHeChinh])).toEqual([
    ['bo', true],
    ['khac', false],
  ]);

  const before = await q.selectFrom('eduGoiHoc').select('id').execute();
  const second = await run();
  expect(second.written).toMatchObject({ goiHoc: 0, phuHuynh: 0, hocVien: 0 });
  expect(await q.selectFrom('eduGoiHoc').select('id').execute()).toHaveLength(
    before.length,
  );
  expect(first.written?.goiHoc).toBe(4);
});

describe('students imported before the Deal packages', () => {
  const student = (over: object) => ({
    id: 7,
    hoTen: 'x',
    namSinh: 2014,
    externalId: IDS.s6,
    phones: [] as string[],
    coSoDu: false,
    ...over,
  });
  const imported = (over: object): ExistingState =>
    known({
      externalIds: { ...EMPTY_STATE.externalIds, hocVien: new Set([IDS.s6]) },
      students: [student(over)],
    });

  it('keeps the balance of a student whose attendance was written as history, and says so once', () => {
    const p = plan(imported({ diemDanhCuKhongTru: true }));
    expect(p.warnings).toContainEqual({
      table: 'goiHoc',
      id: IDS.s6,
      code: 'DIEM_DANH_CU_KHONG_TRU',
    });
    // No Deal package for him; he falls back to what he had (here the opening balance of his row).
    expect(
      p.goiHoc.some((row) => row.loai === 'mua' && row.hocVienKey === IDS.s6),
    ).toBe(false);
    const report = taoBaoCao(p, 'dry-run');
    expect(inBaoCao(report).join('\n')).toMatch(/GIỮ số dư cũ.*: 1\./u);
  });

  it('adds Deal packages when he already holds one (the attendance is then counted)', () => {
    const p = plan(imported({ diemDanhCuKhongTru: true, coGoiDeal: true }));
    expect(p.warnings.some((w) => w.code === 'DIEM_DANH_CU_KHONG_TRU')).toBe(
      false,
    );
    expect(
      p.goiHoc.filter((row) => row.loai === 'mua' && row.hocVienKey === IDS.s6),
    ).toHaveLength(2);
  });

  it('warns GHEP_BO_QUA_SO_DU once for a merged student who already has a balance', () => {
    const p = plan(
      known({
        students: [
          student({
            externalId: null,
            hoTen: 'Học Viên Mẫu 06',
            phones: ['0900000066'],
            coSoDu: true,
          }),
        ],
      }),
    );
    expect(
      p.warnings.filter(
        (w) => w.code === 'GHEP_BO_QUA_SO_DU' && w.id === IDS.s6,
      ),
    ).toHaveLength(1);
  });

  it('reports a Deal that is empty after "chưa thống kê" instead of dropping it silently', () => {
    const tables = withDealStudents(buildFixture());
    tables.dealHp.push({
      recordId: 'recDealMau06c',
      fields: {
        'Học viên': [
          {
            record_ids: [IDS.s6],
            table_id: 't',
            text: 'x',
            text_arr: ['x'],
            type: 'text',
          },
        ],
        'Ngày nộp HP': Date.parse('2025-06-01T00:00:00+07:00'),
        'Đã nộp': 1,
        'Số buổi nộp': 3,
        'Số buổi đã học chưa thống kê': 3,
      },
    });
    const p = lapKeHoach(fixtureData(tables), EMPTY_STATE, {
      unexcusedAbsenceDeducts: false,
    });
    expect(p.warnings).toContainEqual({
      table: 'goiHoc',
      id: 'recDealMau06c',
      code: 'DEAL_HET_SAU_TRU',
    });
    expect(p.goiHoc.map((row) => row.externalId)).not.toContain(
      'lark:deal:recDealMau06c',
    );
  });
});

const ALL_TABLES = [
  'eduNhapLarkNhatKy',
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

async function freshDatabase(connection: any): Promise<string> {
  for (const table of ALL_TABLES)
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

/**
 * "Số dư sau nhập" of the dry run — read after a simulated write that was rolled back — against what the database holds
 * after the real `--commit`, for every student the dry run knows.
 */
async function balancesAgree(
  connection: any,
  report: Awaited<ReturnType<typeof chayNhap>>,
) {
  expect(report.simulation).toMatchObject({ ok: true });
  const rows = await connection.query
    .selectFrom('eduHocVien')
    .select(['externalCode', 'soBuoiConLai'])
    .execute();
  const stored = new Map(
    rows.map((row: any) => [row.externalCode, Number(row.soBuoiConLai)]),
  );
  expect(report.balance.rows.length).toBeGreaterThan(0);
  for (const row of report.balance.rows)
    expect([row.externalCode, stored.get(row.externalCode)]).toEqual([
      row.externalCode,
      row.soDuSauNhap,
    ]);
}

test('for every student the dry run balance is the balance --commit writes', async ({
  database,
  connection,
}) => {
  const userId = await freshDatabase(connection);
  const tables = withDealStudents(buildFixture());
  const dry = await chayNhap(database, fixtureSource(tables), {
    commit: false,
    userId: null,
    delayMs: 0,
  });
  await chayNhap(database, fixtureSource(tables), {
    commit: true,
    userId,
    delayMs: 0,
  });
  await balancesAgree(connection, dry);
});

test('Deals that appear after a first commit never make the dry run and the commit disagree', async ({
  database,
  connection,
}) => {
  const userId = await freshDatabase(connection);
  const options = { commit: true, userId, delayMs: 0 };
  // First run: s5 has attendance and no opening balance, so his history is written as "inside the balance".
  const tables = buildFixture();
  tables.nhanXet2025.push({
    recordId: 'recNhanXet2025s5a',
    fields: {
      ...tables.nhanXet2025[0]?.fields,
      'Tên HS': tables.nhanXet2025[0]?.fields['Tên HS'],
    },
  });
  const first = tables.nhanXet2025.at(-1);
  if (first) {
    first.fields = {
      ...first.fields,
      'Tên HS': [
        {
          record_ids: [IDS.s5],
          table_id: 't',
          text: 'x',
          text_arr: ['x'],
          type: 'text',
        },
      ],
      Lớp: [
        {
          record_ids: [IDS.lopB],
          table_id: 't',
          text: 'x',
          text_arr: ['x'],
          type: 'text',
        },
      ],
      'Ngày học': '10/03/2025',
      'Ngày học - Day format': Date.parse('2025-03-10T00:00:00+07:00'),
    };
  }
  await chayNhap(database, fixtureSource(tables), options);

  // Second run: the same Base, now with a paid Deal for s5.
  tables.dealHp.push({
    recordId: 'recDealMau05',
    fields: {
      'Học viên': [
        {
          record_ids: [IDS.s5],
          table_id: 't',
          text: 'x',
          text_arr: ['x'],
          type: 'text',
        },
      ],
      'Ngày nộp HP': Date.parse('2025-01-01T00:00:00+07:00'),
      'Đã nộp': 1,
      'Số buổi nộp': 10,
    },
  });
  const dry = await chayNhap(database, fixtureSource(tables), {
    commit: false,
    userId: null,
    delayMs: 0,
  });
  expect(dry.warnings).toContainEqual(
    expect.objectContaining({
      table: 'goiHoc',
      code: 'DIEM_DANH_CU_KHONG_TRU',
      count: 1,
    }),
  );
  await chayNhap(database, fixtureSource(tables), options);
  const s5 = await connection.query
    .selectFrom('eduHocVien')
    .select(['id', 'soBuoiConLai'])
    .where('externalId', '=', IDS.s5)
    .executeTakeFirstOrThrow();
  expect(Number(s5.soBuoiConLai)).toBe(0);
  expect(
    await connection.query
      .selectFrom('eduGoiHoc')
      .select('id')
      .where('hocVienId', '=', s5.id)
      .execute(),
  ).toHaveLength(0);
  await balancesAgree(connection, dry);
});

describe('rows Lark edited after the first --commit', () => {
  const written = (entries: [string, number, string][]): ExistingState =>
    known({
      externalIds: {
        ...EMPTY_STATE.externalIds,
        goiHoc: new Set(entries.map(([key]) => key)),
      },
      packages: new Map(
        entries.map(([key, soBuoi, ngayMua]) => [key, { soBuoi, ngayMua }]),
      ),
    });

  it('keeps the sessions that were written when a Deal was edited, and says so', () => {
    // Written as 6 sessions; Lark now gives 8.
    const p = plan(written([[deal('recDealMau06a'), 6, '2025-01-10']]));
    expect(p.warnings).toContainEqual({
      table: 'goiHoc',
      id: 'recDealMau06a',
      code: 'DEAL_DA_DOI',
    });
    const a = p.goiHoc.find((row) => row.externalId === deal('recDealMau06a'));
    expect(a).toMatchObject({ soBuoi: 6, action: 'trung' });
    // 6 + 8 − 3 sessions attended.
    expect(
      p.balances.find((row) => row.hocVienKey === IDS.s6)?.recomputed,
    ).toBe(11);
    expect(inBaoCao(taoBaoCao(p, 'dry-run')).join('\n')).toMatch(
      /đã đổi từ lần nhập trước.*: 1\./u,
    );
  });

  it('keeps a written package whose Deal lost the "Đã nộp" flag', () => {
    const tables = withDealStudents(buildFixture());
    const row = tables.dealHp.find((r) => r.recordId === 'recDealMau06b');
    delete (row?.fields as Record<string, unknown>)['Đã nộp'];
    const p = lapKeHoach(
      fixtureData(tables),
      written([[deal('recDealMau06b'), 8, '2026-01-05']]),
      { unexcusedAbsenceDeducts: false },
    );
    expect(p.warnings).toContainEqual({
      table: 'goiHoc',
      id: 'recDealMau06b',
      code: 'DEAL_DA_DOI',
    });
    expect(
      p.goiHoc.find((r) => r.externalId === deal('recDealMau06b')),
    ).toMatchObject({ soBuoi: 8, action: 'trung' });
  });

  it('does not report a Deal that is unchanged', () => {
    const p = plan(
      written([
        [deal('recDealMau06a'), 8, '2025-01-10'],
        [deal('recDealMau06b'), 8, '2026-01-05'],
      ]),
    );
    expect(p.warnings.some((w) => w.code === 'DEAL_DA_DOI')).toBe(false);
  });

  it('keeps the opening package that was written when the balance or its date changed on Lark', () => {
    // Lark says 5 on 2025-02-01; the package written was 4 on 2025-01-01.
    const p = plan(written([[`lark:sodu:${IDS.s1}`, 4, '2025-01-01']]));
    expect(p.warnings).toContainEqual({
      table: 'goiHoc',
      id: IDS.s1,
      code: 'SO_DU_LARK_DA_DOI',
    });
    expect(
      p.goiHoc.find((r) => r.externalId === `lark:sodu:${IDS.s1}`),
    ).toMatchObject({ soBuoi: 4, ngayChot: '2025-01-01', action: 'trung' });
    // 4 − the three sessions attended after 2025-01-01 (01-27, 02-03, 02-17; the absence costs nothing).
    expect(p.balances.find((r) => r.hocVienKey === IDS.s1)?.recomputed).toBe(1);
  });
});

describe('a student merged with one that already has a balance', () => {
  it('shows the balance he has, marked as kept, instead of a 0 nothing computed', () => {
    const p = plan(
      known({
        students: [
          {
            id: 9,
            hoTen: 'Học Viên Mẫu 01',
            namSinh: 2016,
            externalId: null,
            phones: ['0900000001'],
            coSoDu: true,
            soBuoiConLai: 9,
          },
        ],
      }),
    );
    expect(p.balances.find((r) => r.hocVienKey === IDS.s1)).toMatchObject({
      recomputed: 9,
      giuSoDuCu: true,
      larkBalance: 5,
      difference: 4,
    });
    expect(inBaoCao(taoBaoCao(p, 'dry-run')).join('\n')).toContain(
      '(giữ số dư cũ)',
    );
  });
});

test('after rows are edited on Lark, a second --commit on a database that already has data still writes the balance the dry run showed', async ({
  database,
  connection,
}) => {
  const userId = await freshDatabase(connection);
  const tables = withDealStudents(buildFixture());
  const cycle = async () => {
    const dry = await chayNhap(database, fixtureSource(tables), {
      commit: false,
      userId: null,
      delayMs: 0,
    });
    await chayNhap(database, fixtureSource(tables), {
      commit: true,
      userId,
      delayMs: 0,
    });
    await balancesAgree(connection, dry);
    return dry;
  };
  const packageOf = async (key: string) =>
    Number(
      (
        await connection.query
          .selectFrom('eduGoiHoc')
          .select('soBuoi')
          .where('externalId', '=', key)
          .executeTakeFirstOrThrow()
      ).soBuoi,
    );
  await cycle();
  expect(await packageOf(deal('recDealMau06a'))).toBe(8);

  // (a) "chưa thống kê" of a written Deal goes from 2 to 4.
  const a = tables.dealHp.find((r) => r.recordId === 'recDealMau06a');
  (a?.fields as Record<string, unknown>)['Số buổi đã học chưa thống kê'] = 4;
  const second = await cycle();
  expect(second.warnings).toContainEqual(
    expect.objectContaining({ code: 'DEAL_DA_DOI', count: 1 }),
  );
  expect(await packageOf(deal('recDealMau06a'))).toBe(8);

  // (b) a written Deal loses its "Đã nộp" flag.
  const b = tables.dealHp.find((r) => r.recordId === 'recDealMau06b');
  delete (b?.fields as Record<string, unknown>)['Đã nộp'];
  const third = await cycle();
  expect(third.warnings).toContainEqual(
    expect.objectContaining({ code: 'DEAL_DA_DOI', count: 2 }),
  );
  expect(await packageOf(deal('recDealMau06b'))).toBe(8);

  // (c) the opening balance of a student written by the first run changes on Lark.
  const s1 = tables.hocVien.find((r) => r.recordId === IDS.s1);
  (s1?.fields as Record<string, unknown>)[
    'số buổi tồn update (vào ngày thống kê)'
  ] = { type: 2, value: [9] };
  const fourth = await cycle();
  expect(fourth.warnings).toContainEqual(
    expect.objectContaining({ code: 'SO_DU_LARK_DA_DOI', count: 1 }),
  );
  expect(await packageOf(`lark:sodu:${IDS.s1}`)).toBe(5);
});

/** A dry run leaves nothing behind: the same rows, the same balances, no log row. */
async function snapshot(connection: any) {
  const out: Record<string, unknown> = {};
  for (const table of [
    'eduHocVien',
    'eduGoiHoc',
    'eduDiemDanh',
    'eduSoDuNhatKy',
    'eduPhuHuynh',
    'eduNhapLarkNhatKy',
  ])
    out[table] = (
      await connection.query.selectFrom(table).select('id').execute()
    ).length;
  out.balances = (
    await connection.query
      .selectFrom('eduHocVien')
      .select(['id', 'soBuoiConLai'])
      .orderBy('id')
      .execute()
  ).map((row: any) => `${row.id}:${row.soBuoiConLai}`);
  return out;
}

const link = (id: string) => [
  { record_ids: [id], table_id: 't', text: 'x', text_arr: ['x'], type: 'text' },
];

/** The ways Lark can differ from what an earlier run wrote. Each one tolerates the row being gone already. */
const MUTATIONS: Record<
  string,
  (tables: ReturnType<typeof buildFixture>) => void
> = {
  'delete one Deal': (t) => {
    t.dealHp = t.dealHp.filter((r) => r.recordId !== 'recDealMau06a');
  },
  'delete both Deals of a student': (t) => {
    t.dealHp = t.dealHp.filter(
      (r) => !['recDealMau06a', 'recDealMau06b'].includes(r.recordId),
    );
  },
  'move a Deal to another student': (t) => {
    const row = t.dealHp.find((r) => r.recordId === 'recDealMau06b');
    if (row) row.fields['Học viên'] = link(IDS.s1);
  },
  'flip an attendance mark 1 → 0': (t) => {
    const row = t.nhanXet2025.find((r) => r.recordId === 'recNhanXet2025s6a');
    if (row) row.fields['có mặt'] = '0';
  },
  'delete an attendance row': (t) => {
    t.nhanXet2025 = t.nhanXet2025.filter(
      (r) => r.recordId !== 'recNhanXet2025s6c',
    );
  },
  'change "chưa thống kê"': (t) => {
    const row = t.dealHp.find((r) => r.recordId === 'recDealMau06a');
    if (row) row.fields['Số buổi đã học chưa thống kê'] = 4;
  },
  'change an opening balance': (t) => {
    const row = t.hocVien.find((r) => r.recordId === IDS.s1);
    if (row)
      row.fields['số buổi tồn update (vào ngày thống kê)'] = {
        type: 2,
        value: [9],
      };
  },
  'change nothing': () => {},
};

test('the six scenarios that made a dry run disagree with --commit, one after the other on a database that holds data', async ({
  database,
  connection,
}) => {
  const userId = await freshDatabase(connection);
  for (const [name, mutate] of Object.entries(MUTATIONS)) {
    // Every scenario starts from a database written by a first run from the unchanged Lark.
    await freshDatabase(connection);
    const tables = withDealStudents(buildFixture());
    await chayNhap(database, fixtureSource(tables), {
      commit: true,
      userId,
      delayMs: 0,
    });
    mutate(tables);
    const before = await snapshot(connection);
    const dry = await chayNhap(database, fixtureSource(tables), {
      commit: false,
      userId: null,
      delayMs: 0,
    });
    expect([name, await snapshot(connection)]).toEqual([name, before]);
    await chayNhap(database, fixtureSource(tables), {
      commit: true,
      userId,
      delayMs: 0,
    });
    await balancesAgree(connection, dry);
  }
});

test('random edits of Lark over several runs never make the dry run and --commit disagree', async ({
  database,
  connection,
}) => {
  const userId = await freshDatabase(connection);
  const tables = withDealStudents(buildFixture());
  await chayNhap(database, fixtureSource(tables), {
    commit: true,
    userId,
    delayMs: 0,
  });
  // A small deterministic generator, so a failure can be replayed.
  let seed = 20261111;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  const names = Object.keys(MUTATIONS);
  for (let round = 0; round < 12; round += 1) {
    const picked = names[next() % names.length] as string;
    MUTATIONS[picked]?.(tables);
    const dry = await chayNhap(database, fixtureSource(tables), {
      commit: false,
      userId: null,
      delayMs: 0,
    });
    await chayNhap(database, fixtureSource(tables), {
      commit: true,
      userId,
      delayMs: 0,
    });
    await balancesAgree(connection, dry);
  }
});

describe('Lark differs from the database', () => {
  it('reports a Deal that is gone, a Deal moved to another student and an attendance that changed, and edits nothing', () => {
    const tables = withDealStudents(buildFixture());
    const flipped = tables.nhanXet2025.find(
      (r) => r.recordId === 'recNhanXet2025s6a',
    );
    if (flipped) flipped.fields['có mặt'] = '0';
    const moved = tables.dealHp.find((r) => r.recordId === 'recDealMau06b');
    if (moved)
      moved.fields['Học viên'] = [
        {
          record_ids: [IDS.s1],
          table_id: 't',
          text: 'x',
          text_arr: ['x'],
          type: 'text',
        },
      ];
    const p = lapKeHoach(
      fixtureData(tables),
      known({
        externalIds: {
          ...EMPTY_STATE.externalIds,
          hocVien: new Set([IDS.s1, IDS.s6]),
          goiHoc: new Set([deal('recDealMau06b'), deal('recDealGone')]),
          diemDanh: new Set(['recNhanXet2025s6a', 'recNhanXet2025s6gone']),
        },
        students: [
          {
            id: 1,
            hoTen: 'x',
            namSinh: 2016,
            externalId: IDS.s1,
            phones: [],
            coSoDu: false,
          },
          {
            id: 6,
            hoTen: 'y',
            namSinh: 2014,
            externalId: IDS.s6,
            phones: [],
            coSoDu: false,
          },
        ],
        packages: new Map([
          [
            deal('recDealMau06b'),
            { soBuoi: 8, ngayMua: '2026-01-05', hocVienId: 6 },
          ],
          [
            deal('recDealGone'),
            { soBuoi: 3, ngayMua: '2025-05-05', hocVienId: 6 },
          ],
        ]),
        attendance: new Map([
          ['recNhanXet2025s6a', { trangThai: 'co_mat' }],
          ['recNhanXet2025s6gone', { trangThai: 'co_mat' }],
        ]),
      }),
      { unexcusedAbsenceDeducts: false },
    );
    const codes = p.warnings.map((w) => `${w.code}:${w.id}`);
    expect(codes).toContain('DEAL_DA_XOA:recDealGone');
    expect(codes).toContain('DEAL_DOI_HOC_VIEN:recDealMau06b');
    expect(codes).toContain('DIEM_DANH_DA_DOI:recNhanXet2025s6a');
    expect(codes).toContain('DIEM_DANH_DA_DOI:recNhanXet2025s6gone');
  });

  it('never makes an opening package for a student who already holds a Deal package', () => {
    const tables = withDealStudents(buildFixture());
    // His Deals are gone from Lark but the packages are in the database; his row still shows a balance.
    tables.dealHp = tables.dealHp.filter((r) =>
      r.recordId.startsWith('recDealMau07'),
    );
    const p = lapKeHoach(
      fixtureData(tables),
      known({
        externalIds: { ...EMPTY_STATE.externalIds, hocVien: new Set([IDS.s6]) },
        students: [
          {
            id: 6,
            hoTen: 'y',
            namSinh: 2014,
            externalId: IDS.s6,
            phones: [],
            coSoDu: true,
            coGoiDeal: true,
          },
        ],
      }),
      { unexcusedAbsenceDeducts: false },
    );
    expect(p.goiHoc.some((row) => row.hocVienKey === IDS.s6)).toBe(false);
    expect(p.warnings).toContainEqual({
      table: 'goiHoc',
      id: IDS.s6,
      code: 'SO_DU_BO_QUA_DA_CO_DEAL',
    });
  });
});

describe('the report of the simulated write', () => {
  it('says so when the simulated write fails, naming only what refused it', () => {
    const report = taoBaoCao(plan(), 'dry-run', {
      ok: false,
      hint: 'uq_edu_hoc_vien_external_id',
    });
    const text = inBaoCao(report).join('\n');
    expect(text).toContain('MÔ PHỎNG GHI LỖI');
    expect(text).toContain('uq_edu_hoc_vien_external_id');
    expect(report.simulation).toEqual({
      ok: false,
      hint: 'uq_edu_hoc_vien_external_id',
    });
  });

  it('prints both columns and how many students end with a balance other than the recomputed one', () => {
    const p = plan();
    const soDu = new Map(
      p.balances.map((row) => [row.hocVienKey, row.recomputed]),
    );
    soDu.set(IDS.s1, 99);
    const report = taoBaoCao(p, 'dry-run', { ok: true, soDu });
    const text = inBaoCao(report).join('\n');
    expect(text).toContain('tính lại từ Lark | số dư sau nhập');
    expect(text).toMatch(/1 học viên có số dư sau nhập khác số tính lại/u);
    expect(text).toMatch(/HV-20240101-001 \| 5 \| \? \| 3 \| 99 \|/u);
  });
});

describe('a written Deal whose student changed on Lark', () => {
  const holder = (id: number) =>
    known({
      externalIds: {
        ...EMPTY_STATE.externalIds,
        hocVien: new Set([IDS.s6]),
        goiHoc: new Set([deal('recDealMau06a')]),
      },
      students: [
        {
          id,
          hoTen: 'y',
          namSinh: 2014,
          externalId: IDS.s6,
          phones: [],
          coSoDu: false,
        },
      ],
      packages: new Map([
        [
          deal('recDealMau06a'),
          { soBuoi: 8, ngayMua: '2025-01-10', hocVienId: 6 },
        ],
      ]),
    });

  it('warns DEAL_DOI_HOC_VIEN, not an error, when the link to the student was removed', () => {
    const tables = withDealStudents(buildFixture());
    const row = tables.dealHp.find((r) => r.recordId === 'recDealMau06a');
    delete (row?.fields as Record<string, unknown>)['Học viên'];
    const p = lapKeHoach(fixtureData(tables), holder(6), {
      unexcusedAbsenceDeducts: false,
    });
    expect(p.warnings).toContainEqual({
      table: 'goiHoc',
      id: 'recDealMau06a',
      code: 'DEAL_DOI_HOC_VIEN',
    });
    expect(p.problems.some((x) => x.id === 'recDealMau06a')).toBe(false);
  });

  it('warns DEAL_DOI_HOC_VIEN when the Deal now points at a student who is new in NocoEdu', () => {
    // The package is held by student 6, but the student of this Lark record has no row in NocoEdu yet.
    const p = lapKeHoach(
      fixtureData(withDealStudents(buildFixture())),
      known({
        externalIds: {
          ...EMPTY_STATE.externalIds,
          goiHoc: new Set([deal('recDealMau06a')]),
        },
        packages: new Map([
          [
            deal('recDealMau06a'),
            { soBuoi: 8, ngayMua: '2025-01-10', hocVienId: 6 },
          ],
        ]),
      }),
      { unexcusedAbsenceDeducts: false },
    );
    expect(p.warnings).toContainEqual({
      table: 'goiHoc',
      id: 'recDealMau06a',
      code: 'DEAL_DOI_HOC_VIEN',
    });
  });
});
