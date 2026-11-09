import { describe, expect, it } from 'vitest';

import { LEVEL_KEYS } from '../../server/edu/levels.js';
import {
  BRANCH_EXCUSED_DEDUCTS,
  SHEETS_BRANCH,
} from '../../server/edu/lark/chua-xac-nhan.js';
import {
  birthYearVn,
  classLevel,
  levelFromLark,
  mindfulnessScore,
  normalizeFullName,
  relationFromLark,
  statusFromLark,
  toVnMobile,
} from '../../server/edu/lark/chuan-hoa.js';
import {
  attendanceFromCode,
  parseSheetsCa,
  pickSource,
  resolveSheetsClass,
  sheetsCaCell,
} from '../../server/edu/lark/diem-danh.js';
import {
  openingBalance,
  recomputeBalance,
} from '../../server/edu/lark/so-du.js';

// Every value below is made up.
describe('names, phones and years', () => {
  it('normalizes a full name', () => {
    expect(normalizeFullName('  nguyễn   VĂN an ')).toBe('Nguyễn Văn An');
    // decomposed (NFD) input comes out composed (NFC)
    const decomposed = 'Tràn Minh';
    expect(normalizeFullName(decomposed)).toBe('Tràn Minh');
  });

  it('accepts only ten-digit mobile numbers', () => {
    expect(toVnMobile('+84 912 345 678')).toEqual({
      ok: true,
      value: '0912345678',
    });
    expect(toVnMobile('0912.345.678')).toEqual({
      ok: true,
      value: '0912345678',
    });
    expect(toVnMobile(912345678)).toEqual({ ok: false, code: 'SDT_SAI' });
    expect(toVnMobile('09123456789')).toEqual({ ok: false, code: 'SDT_SAI' });
    expect(toVnMobile('0212345678')).toEqual({ ok: false, code: 'SDT_SAI' });
    expect(toVnMobile('')).toEqual({ ok: false, code: 'SDT_SAI' });
    expect(toVnMobile(null)).toEqual({ ok: false, code: 'SDT_SAI' });
  });

  it('takes the birth year in UTC+7, not UTC', () => {
    // 2015-12-31T17:00:00Z is already 1 January 2016 in Vietnam.
    expect(birthYearVn(Date.UTC(2015, 11, 31, 17, 0, 0))).toEqual({
      ok: true,
      value: 2016,
    });
    expect(birthYearVn(Date.UTC(2015, 11, 31, 16, 59, 59))).toEqual({
      ok: true,
      value: 2015,
    });
    expect(birthYearVn(Number.NaN)).toEqual({
      ok: false,
      code: 'NGAY_SINH_SAI',
    });
    expect(birthYearVn(Date.UTC(1800, 0, 1))).toEqual({
      ok: false,
      code: 'NGAY_SINH_SAI',
    });
  });

  it('maps levels, relations and statuses, and refuses the unknown', () => {
    expect(levelFromLark('NM1')).toEqual({ ok: true, value: 'tot' });
    expect(levelFromLark(' nm2 ')).toEqual({ ok: true, value: 'tot' });
    expect(levelFromLark('Mã')).toEqual({ ok: true, value: 'ma' });
    expect(levelFromLark('Tượng')).toEqual({ ok: true, value: 'tuong' });
    expect(levelFromLark('Xe')).toEqual({ ok: true, value: 'xe' });
    expect(levelFromLark('Hậu')).toEqual({ ok: true, value: 'hau' });
    expect(levelFromLark('Vua')).toEqual({ ok: true, value: 'vua' });
    expect(levelFromLark('Test')).toEqual({ ok: false, code: 'CAP_KHONG_RO' });
    expect(levelFromLark('')).toEqual({ ok: false, code: 'CAP_KHONG_RO' });

    expect(relationFromLark('Mẹ')).toEqual({ ok: true, value: 'me' });
    expect(relationFromLark('Bố')).toEqual({ ok: true, value: 'bo' });
    expect(relationFromLark('Ông/ Bà')).toEqual({ ok: true, value: 'khac' });
    expect(relationFromLark('Dì').ok).toBe(false);

    for (const trial of ['Mới học thử', 'Đăng ký học thử', 'Chưa học thử'])
      expect(statusFromLark(trial)).toEqual({ ok: true, value: 'hoc_thu' });
    expect(statusFromLark('Đang học')).toEqual({ ok: true, value: 'dang_hoc' });
    expect(statusFromLark('Tạm nghỉ')).toEqual({ ok: true, value: 'tam_nghi' });
    expect(statusFromLark('Đã nghỉ')).toEqual({ ok: true, value: 'da_nghi' });
    expect(statusFromLark('khác').ok).toBe(false);
  });

  it('keeps a mindfulness score only when it is a whole number from 0 to 10', () => {
    expect(mindfulnessScore('9')).toBe(9);
    expect(mindfulnessScore(10)).toBe(10);
    expect(mindfulnessScore('0')).toBe(0);
    expect(mindfulnessScore('11')).toBeNull();
    expect(mindfulnessScore('0p')).toBeNull();
    expect(mindfulnessScore('Xin nghỉ')).toBeNull();
  });

  it('gives a class the most common level of its students, the lower on a tie', () => {
    expect(classLevel(['ma', 'ma', 'xe'], LEVEL_KEYS)).toBe('ma');
    expect(classLevel(['xe', 'ma'], LEVEL_KEYS)).toBe('ma');
    expect(classLevel([], LEVEL_KEYS)).toBe('tot');
  });
});

describe('attendance codes and sources', () => {
  it('maps every mark of the Base and the Sheets', () => {
    expect(attendanceFromCode('1')).toEqual({ ok: true, value: 'co_mat' });
    expect(attendanceFromCode(1)).toEqual({ ok: true, value: 'co_mat' });
    expect(attendanceFromCode('0')).toEqual({
      ok: true,
      value: 'vang_khong_phep',
    });
    expect(attendanceFromCode(false)).toEqual({
      ok: true,
      value: 'vang_khong_phep',
    });
    expect(attendanceFromCode('x')).toEqual({
      ok: true,
      value: 'vang_co_phep',
    });
    expect(attendanceFromCode('Xin nghỉ')).toEqual({
      ok: true,
      value: 'vang_co_phep',
    });
    expect(attendanceFromCode('học lớp 2')).toEqual({
      ok: true,
      value: 'hoc_bu',
    });
    // a coach's name, "!" and "?" are not explained: an error, never a guess
    for (const mark of ['Giáo viên Mẫu', '!', '?', '', null])
      expect(attendanceFromCode(mark)).toEqual({
        ok: false,
        code: 'DIEM_DANH_KHONG_RO',
      });
  });

  it('picks the source by date', () => {
    expect(pickSource('2025-12-31')).toBe('base');
    expect(pickSource('2026-01-01')).toBe('sheets');
  });

  it('reads a Sheets class cell and slot name', () => {
    expect(sheetsCaCell('1')).toBe('belongs');
    expect(sheetsCaCell('x')).toBe('notBelongs');
    expect(sheetsCaCell('')).toBe('empty');
    expect(parseSheetsCa('T3')).toEqual({ thu: 3, ca: null });
    expect(parseSheetsCa('T2 CA1')).toEqual({ thu: 2, ca: 1 });
    expect(parseSheetsCa('Ghi chú')).toBeNull();
  });

  it('finds the class of a Sheets slot, or says it cannot', () => {
    const schedule = [
      { lopId: 1, coSoId: 1, thu: 2, gioBatDau: '18:15' },
      { lopId: 2, coSoId: 1, thu: 2, gioBatDau: '19:15' },
      { lopId: 3, coSoId: 1, thu: 3, gioBatDau: '18:15' },
      { lopId: 4, coSoId: 1, thu: 3, gioBatDau: '18:15' },
      { lopId: 5, coSoId: 2, thu: 2, gioBatDau: '18:15' },
    ];
    expect(resolveSheetsClass(schedule, { coSoId: 1, thu: 2, ca: 1 })).toEqual({
      ok: true,
      value: 1,
    });
    expect(resolveSheetsClass(schedule, { coSoId: 1, thu: 2, ca: 2 })).toEqual({
      ok: true,
      value: 2,
    });
    // two classes at the same time: not guessed
    expect(
      resolveSheetsClass(schedule, { coSoId: 1, thu: 3, ca: null }),
    ).toEqual({
      ok: false,
      code: 'LOP_KHONG_RO',
    });
    // two slots and no CA given
    expect(
      resolveSheetsClass(schedule, { coSoId: 1, thu: 2, ca: null }),
    ).toEqual({
      ok: false,
      code: 'LOP_KHONG_RO',
    });
    // no such class
    expect(
      resolveSheetsClass(schedule, { coSoId: 1, thu: 7, ca: null }).ok,
    ).toBe(false);
    expect(resolveSheetsClass(schedule, { coSoId: 1, thu: 2, ca: 3 }).ok).toBe(
      false,
    );
  });

  it('knows both Sheets files and both branches', () => {
    expect(SHEETS_BRANCH).toEqual({ KL357: 'KL', VP26: 'VP' });
    expect(Object.keys(BRANCH_EXCUSED_DEDUCTS).sort()).toEqual(['KL', 'VP']);
  });
});

describe('opening balance and recomputed balance', () => {
  it('reads the opening package from the two Lark cells', () => {
    expect(openingBalance('12', '2026-02-10')).toEqual({
      ok: true,
      value: { soBuoi: 12, ngayChot: '2026-02-10' },
    });
    expect(openingBalance([5], ['2026-02-10'])).toEqual({
      ok: true,
      value: { soBuoi: 5, ngayChot: '2026-02-10' },
    });
    expect(openingBalance('', '2026-02-10')).toEqual({ ok: true, value: null });
    expect(openingBalance(null, null)).toEqual({ ok: true, value: null });
    expect(openingBalance([1, 2], '2026-02-10')).toEqual({
      ok: false,
      code: 'SO_DU_KHONG_RO',
    });
    expect(openingBalance('mười', '2026-02-10')).toEqual({
      ok: false,
      code: 'SO_DU_KHONG_RO',
    });
    expect(openingBalance('3', '')).toEqual({
      ok: false,
      code: 'THIEU_NGAY_CHOT',
    });
  });

  const opening = { soBuoi: 10, ngayChot: '2026-02-10' };
  const sessions = [
    { ngay: '2026-02-03', trangThai: 'co_mat' as const },
    { ngay: '2026-02-10', trangThai: 'co_mat' as const },
    { ngay: '2026-02-12', trangThai: 'co_mat' as const },
    { ngay: '2026-02-14', trangThai: 'vang_co_phep' as const },
    { ngay: '2026-02-17', trangThai: 'vang_khong_phep' as const },
    { ngay: '2026-02-19', trangThai: 'hoc_bu' as const },
  ];

  it('deducts only the sessions after the cut-off date', () => {
    const result = recomputeBalance(opening, sessions, false);
    expect(result.rows.map((row) => row.tinhVaoSoDu)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
    // present 1 + excused 0 + unexcused 1 + make-up 1 = 3
    expect(result.soBuoiConLai).toBe(7);
    expect(result.rows.map((row) => row.soBuoiDaTru)).toEqual([
      0, 0, 1, 0, 1, 1,
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('follows the branch setting for an excused absence', () => {
    // excused absence deducts 1 and the make-up then deducts 0
    const result = recomputeBalance(opening, sessions, true);
    expect(result.rows.map((row) => row.soBuoiDaTru)).toEqual([
      0, 0, 1, 1, 1, 0,
    ]);
    expect(result.soBuoiConLai).toBe(7);
  });

  it('can go below zero and keeps going', () => {
    const result = recomputeBalance(
      { soBuoi: 1, ngayChot: '2026-02-10' },
      sessions,
      false,
    );
    expect(result.soBuoiConLai).toBe(-2);
  });

  it('deducts nothing for a student without an opening balance', () => {
    const result = recomputeBalance(null, sessions, false);
    expect(result.soBuoiConLai).toBe(0);
    expect(
      result.rows.every((row) => !row.tinhVaoSoDu && row.soBuoiDaTru === 0),
    ).toBe(true);
    expect(result.warnings).toEqual(['KHONG_CO_SO_DU']);
  });
});
