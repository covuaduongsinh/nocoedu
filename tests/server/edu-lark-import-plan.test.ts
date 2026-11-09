import { describe, expect, it } from 'vitest';

import {
  EMPTY_STATE,
  lapKeHoach,
  parseCa,
  parseDayMonthYear,
  parseThu,
  tongKetTheoBang,
  type ExistingState,
} from '../../server/edu/lark/ke-hoach.js';
import { externalIdOrNull } from '../../server/edu/lark/ghi.js';
import {
  inBaoCao,
  parseImportOptions,
  taoBaoCao,
} from '../../server/edu/lark/nhap.js';
import { LarkImportError, readLarkData } from '../../server/edu/lark/nguon.js';
import { fixtureData, fixtureSource, IDS } from '../helpers/lark-fixture.js';

// Every value in the fixture is made up (tests/helpers/lark-fixture.ts).
const plan = (existing: ExistingState = EMPTY_STATE, deducts = false) =>
  lapKeHoach(fixtureData(), existing, { unexcusedAbsenceDeducts: deducts });
const codes = (items: readonly { table: string; id: string; code: string }[]) =>
  items.map((item) => `${item.table}:${item.code}`).sort();

describe('the shape of the plan', () => {
  it('follows the order branches → classes → parents → students → packages → sessions → attendance', () => {
    const p = plan();
    expect(Object.keys(p).slice(0, 8)).toEqual([
      'coSo',
      'lop',
      'lopLich',
      'phuHuynh',
      'hocVien',
      'goiHoc',
      'buoiHoc',
      'diemDanh',
    ]);
    expect(p.coSo.map((row) => [row.ma, row.action])).toEqual([
      ['KL', 'tao'],
      ['VP', 'tao'],
    ]);
    expect(p.lop).toHaveLength(2);
    expect(p.lopLich).toHaveLength(2);
    expect(p.hocVien.map((row) => row.externalId)).toEqual([
      IDS.s1,
      IDS.s2,
      IDS.s5,
    ]);
  });

  it('normalizes names, phones, dates, levels and statuses', () => {
    const p = plan();
    const [s1, s2] = p.hocVien;
    expect(s1).toMatchObject({
      hoTen: 'Học Viên Mẫu 01',
      namSinh: 2016,
      ngaySinh: '2016-05-20',
      levelKey: 'tot',
      trangThai: 'dang_hoc',
      externalCode: 'HV-20240101-001',
    });
    // NM1 is the Tốt level; "Mã" arrives through a link that carries only the record id (the Level table names it).
    expect(s2).toMatchObject({ levelKey: 'ma', trangThai: 'hoc_thu' });
    expect(p.lop[0]?.ten).toBe('Lớp Mẫu A');
    expect(
      p.lopLich.map((row) => [row.thu, row.gioBatDau, row.gioKetThuc]),
    ).toEqual([
      [2, '18:15', '19:15'],
      [3, '19:30', '20:45'],
    ]);
    // Siblings share one parent: "0900 000 001" as text and 900000001 as a number (leading 0 lost).
    expect(p.phuHuynh).toHaveLength(1);
    expect(p.phuHuynh[0]).toMatchObject({
      soDienThoai: '0900000001',
      hoTen: 'Phụ Huynh Mẫu 01',
      email: 'phuhuynh.mau01@example.com',
    });
    expect(s1?.parents).toEqual([
      { key: 'lark:ph:0900000001', quanHe: 'me', lienHeChinh: true },
    ]);
  });

  it('gives a class the most common level of its students and matches the coach by email', () => {
    const withUser: ExistingState = {
      ...EMPTY_STATE,
      usersByEmail: new Map([['gv.mau@example.com', 'user-1']]),
    };
    const p = plan(withUser);
    expect(p.lop[0]).toMatchObject({ hlvId: 'user-1', levelKey: 'tot' });
    expect(p.lop[1]?.hlvId).toBeNull();
    expect(p.warnings).toContainEqual({
      table: 'lop',
      id: IDS.lopB,
      code: 'HLV_CHUA_GHEP',
    });
  });
});

describe('rows that fail, and what goes with them', () => {
  it('leaves out a student with no level or birth date, and the attendance of that student', () => {
    const p = plan();
    expect(p.problems).toContainEqual({
      table: 'hocVien',
      id: IDS.s3,
      code: 'CAP_KHONG_RO',
    });
    expect(p.problems).toContainEqual({
      table: 'hocVien',
      id: IDS.s4,
      code: 'THIEU_NAM_SINH',
    });
    expect(p.problems).toContainEqual({
      table: 'diemDanh',
      id: 'recNhanXet2025g',
      code: 'HOC_VIEN_BI_BO',
    });
    // The parent of a student who is left out is not written either.
    expect(p.phuHuynh.map((row) => row.externalId)).toEqual([
      'lark:ph:0900000001',
    ]);
  });

  it('reports "học lớp 2" as DIEM_DANH_KHONG_RO and never as a make-up', () => {
    const p = plan();
    expect(p.problems).toContainEqual({
      table: 'diemDanh',
      id: 'recNhanXet2025e',
      code: 'DIEM_DANH_KHONG_RO',
    });
    expect(p.diemDanh.map((row) => row.trangThai)).not.toContain('hoc_bu');
    expect(
      p.diemDanh.find((row) => row.externalId === 'recNhanXet2025e'),
    ).toBeUndefined();
  });

  it('imports a student without a parent or a balance with a warning, not an error', () => {
    const p = plan();
    expect(codes(p.warnings)).toEqual(
      expect.arrayContaining([
        'phuHuynh:THIEU_PHU_HUYNH',
        'goiHoc:KHONG_CO_SO_DU',
      ]),
    );
    expect(p.hocVien.find((row) => row.externalId === IDS.s5)?.parents).toEqual(
      [],
    );
    expect(p.goiHoc.map((row) => row.hocVienKey)).toEqual([IDS.s1, IDS.s2]);
  });

  it('gives every problem as table, Lark id and code only', () => {
    const p = plan();
    for (const item of [...p.problems, ...p.warnings])
      expect(Object.keys(item).sort()).toEqual(['code', 'id', 'table']);
    const text = JSON.stringify(p.problems) + JSON.stringify(p.warnings);
    expect(text).not.toMatch(/Mẫu 0|0900|example\.com|2016-05-20/u);
  });
});

describe('the balance', () => {
  it('is the opening package minus the sessions attended after the cut-off date', () => {
    const p = plan();
    const s1 = p.balances.find((row) => row.hocVienKey === IDS.s1);
    // 5 − (02-03 present, 02-17 present); the absence of 02-10 costs nothing; 2024-12-02 and 01-27 are before the cut-off.
    expect(s1).toMatchObject({
      externalCode: 'HV-20240101-001',
      larkBalance: 3,
      recomputed: 3,
      difference: 0,
    });
    const rows = p.diemDanh.filter((row) => row.hocVienKey === IDS.s1);
    expect(
      rows.map((row) => [row.externalId, row.tinhVaoSoDu, row.soBuoiDaTru]),
    ).toEqual([
      ['recNhanXet2024a', false, 0],
      ['recNhanXet2025a', false, 0],
      ['recNhanXet2025b', true, 1],
      ['recNhanXet2025c', true, 0],
      ['recNhanXet2025d', true, 1],
    ]);
    expect(p.balances.find((row) => row.hocVienKey === IDS.s2)).toMatchObject({
      recomputed: 3,
      larkBalance: 2,
      difference: 1,
    });
    expect(p.balances.find((row) => row.hocVienKey === IDS.s5)).toMatchObject({
      larkBalance: null,
      difference: null,
    });
  });

  it('deducts an absence without leave only when the setting is on, and fixes the setting on the session', () => {
    expect(
      plan(EMPTY_STATE, true).balances.find((r) => r.hocVienKey === IDS.s1)
        ?.recomputed,
    ).toBe(2);
    expect(
      plan(EMPTY_STATE, false).buoiHoc.every((row) => !row.truVangKhongPhep),
    ).toBe(true);
    expect(
      plan(EMPTY_STATE, true).buoiHoc.every((row) => row.truVangKhongPhep),
    ).toBe(true);
  });

  it('groups the attendance of one class and day into one session and keeps its content', () => {
    const p = plan();
    expect(p.buoiHoc).toHaveLength(5);
    const shared = p.buoiHoc.find(
      (row) => row.externalId === `lark:buoi:${IDS.lopA}:2025-02-03`,
    );
    expect(shared).toMatchObject({
      gioBatDau: '18:15',
      keHoachDay: 'Kế hoạch mẫu',
      giaoBtvn: 'Bài mẫu',
    });
    expect(
      p.diemDanh.filter((row) => row.buoiKey === shared?.externalId),
    ).toHaveLength(2);
  });
});

describe('what NocoEdu already holds', () => {
  const existing = (over: Partial<ExistingState>): ExistingState => ({
    ...EMPTY_STATE,
    ...over,
  });

  it('marks rows whose Lark id is known as duplicates and writes nothing for them', () => {
    const first = plan();
    const known = existing({
      branches: [{ id: 1, ma: 'KL', externalId: 'lark:coSo:Kim Liên' }],
      externalIds: {
        ...EMPTY_STATE.externalIds,
        hocVien: new Set([IDS.s1]),
        diemDanh: new Set(['recNhanXet2025b']),
        goiHoc: new Set([`lark:sodu:${IDS.s1}`]),
      },
      students: [
        {
          id: 7,
          hoTen: 'x',
          namSinh: 2016,
          externalId: IDS.s1,
          phones: [],
          coSoDu: true,
        },
      ],
    });
    const again = plan(known);
    expect(again.coSo[0]).toMatchObject({ action: 'trung', existingId: 1 });
    expect(again.hocVien[0]).toMatchObject({ action: 'trung', existingId: 7 });
    expect(again.goiHoc[0]?.action).toBe('trung');
    expect(
      again.diemDanh.find((r) => r.externalId === 'recNhanXet2025b')?.action,
    ).toBe('trung');
    const totals = tongKetTheoBang(again);
    expect(totals.hocVien).toMatchObject({ tao: 2, trung: 1 });
    expect(tongKetTheoBang(first).hocVien.trung).toBe(0);
  });

  it('merges a student that matches by name, birth year and parent phone, and only then', () => {
    const matching = {
      id: 9,
      hoTen: 'học viên mẫu 01',
      namSinh: 2016,
      externalId: null,
      phones: ['0900000001'],
      coSoDu: false,
    };
    const merged = plan(existing({ students: [matching] }));
    expect(merged.hocVien[0]).toMatchObject({ action: 'ghep', existingId: 9 });
    // Another year, another phone: not the same child.
    for (const other of [
      { ...matching, namSinh: 2017 },
      { ...matching, phones: ['0900000099'] },
    ])
      expect(plan(existing({ students: [other] })).hocVien[0]?.action).toBe(
        'tao',
      );
  });

  it('refuses to guess when two students match', () => {
    const base = {
      hoTen: 'Học Viên Mẫu 01',
      namSinh: 2016,
      externalId: null,
      phones: ['0900000001'],
      coSoDu: false,
    };
    const p = plan(
      existing({
        students: [
          { id: 1, ...base },
          { id: 2, ...base },
        ],
      }),
    );
    expect(p.problems).toContainEqual({
      table: 'hocVien',
      id: IDS.s1,
      code: 'TRUNG_NHIEU',
    });
    expect(p.hocVien.map((row) => row.externalId)).not.toContain(IDS.s1);
  });

  it('does not add the Lark balance on top of a merged student who already has a package', () => {
    const p = plan(
      existing({
        students: [
          {
            id: 9,
            hoTen: 'Học Viên Mẫu 01',
            namSinh: 2016,
            externalId: null,
            phones: ['0900000001'],
            coSoDu: true,
          },
        ],
      }),
    );
    expect(p.goiHoc.map((row) => row.hocVienKey)).toEqual([IDS.s2]);
    expect(p.warnings).toContainEqual({
      table: 'goiHoc',
      id: IDS.s1,
      code: 'GHEP_BO_QUA_SO_DU',
    });
    expect(
      p.diemDanh
        .filter((row) => row.hocVienKey === IDS.s1)
        .every((row) => !row.tinhVaoSoDu),
    ).toBe(true);
  });

  it('matches an existing branch by its code and gives it the Lark id', () => {
    const p = plan(
      existing({ branches: [{ id: 3, ma: 'VP', externalId: null }] }),
    );
    expect(p.coSo.find((row) => row.ma === 'VP')).toMatchObject({
      action: 'ghep',
      existingId: 3,
    });
  });
});

describe('the report and the options', () => {
  it('prints counts, codes and Lark ids, never a name, phone, email or date of birth', () => {
    const report = taoBaoCao(plan(), 'dry-run');
    const text = [...inBaoCao(report), JSON.stringify(report)].join('\n');
    expect(text).toContain('CHẠY THỬ');
    expect(text).toContain('HV-20240101-002');
    expect(text).toContain('tblHp1PGPz52eZBz');
    expect(text).not.toMatch(
      /Mẫu 0|Phụ Huynh|0900|example\.com|2016-05-20|Ghi chú nhạy cảm/u,
    );
    expect(report.balance).toMatchObject({ match: 1, differ: 1, unknown: 1 });
  });

  it('refuses --dry-run with --commit, --commit without --user, and a bad delay', () => {
    const code = (flags: Parameters<typeof parseImportOptions>[0]) => {
      try {
        parseImportOptions(flags);
      } catch (error) {
        return (error as LarkImportError).code;
      }
      return 'ok';
    };
    expect(code({ dryRun: true, commit: true, user: 'u' })).toBe(
      'LARK_HAI_CHE_DO',
    );
    expect(code({ commit: true })).toBe('LARK_THIEU_USER');
    expect(code({ commit: true, user: '  ' })).toBe('LARK_THIEU_USER');
    expect(code({ delayMs: -1 })).toBe('LARK_DELAY_SAI');
    expect(parseImportOptions({})).toEqual({
      commit: false,
      userId: null,
      delayMs: 1200,
    });
    expect(parseImportOptions({ commit: true, user: ' u1 ' })).toMatchObject({
      commit: true,
      userId: 'u1',
    });
  });

  it('stops with LARK_CAU_TRUC_DOI when a field was renamed, before reading any record', async () => {
    const source = fixtureSource(fixtureData(), {
      table: 'hocVien',
      field: 'SDT PH',
    });
    await expect(readLarkData(source)).rejects.toMatchObject({
      code: 'LARK_CAU_TRUC_DOI',
    });
    expect(source.calls.filter((call) => call.startsWith('records'))).toEqual(
      [],
    );
  });

  it('stores an empty external id as NULL, never as an empty string', () => {
    expect(externalIdOrNull('')).toBeNull();
    expect(externalIdOrNull('   ')).toBeNull();
    expect(externalIdOrNull(undefined)).toBeNull();
    expect(externalIdOrNull(' recX ')).toBe('recX');
  });
});

describe('small parsers', () => {
  it('reads the weekday, the shift hours and a dd/MM/yyyy day', () => {
    expect(parseThu('Thứ 7')).toBe(7);
    expect(parseThu('Chủ nhật')).toBeNull();
    expect(parseCa('Ca2 (19h15-20h30)')).toEqual({
      gioBatDau: '19:15',
      gioKetThuc: '20:30',
    });
    expect(parseCa('Ca9')).toBeNull();
    expect(parseDayMonthYear('3/2/2025')).toBe('2025-02-03');
    expect(parseDayMonthYear('31/02/2025')).toBeNull();
  });
});
