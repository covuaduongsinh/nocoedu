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
    expect(text).toMatch(/HV-20240101-006 \| 3 \| 7 \| 13 \| 10/u);
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
