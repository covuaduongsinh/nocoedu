import { describe, expect, it } from 'vitest';

import { LEVEL_KEYS } from '../../server/edu/levels.js';
import {
  sessionsToDeduct,
  unexcusedAbsenceDeducts,
} from '../../server/edu/so-du.js';
import {
  ATTENDANCE_SOURCE,
  BRANCH_EXCUSED_DEDUCTS,
  SHEETS_BRANCH,
} from '../../server/edu/lark/chua-xac-nhan.js';
import {
  birthDateVn,
  birthYearVn,
  classLevel,
  levelFromLark,
  mindfulnessScore,
  normalizeFullName,
  relationFromLark,
  statusFromLark,
  toVnMobile,
} from '../../server/edu/lark/chuan-hoa.js';
import { attendanceFromCode } from '../../server/edu/lark/diem-danh.js';
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

  it('keeps the full date of birth in UTC+7', () => {
    expect(birthDateVn(Date.UTC(2015, 11, 31, 17, 0, 0))).toEqual({
      ok: true,
      value: '2016-01-01',
    });
    expect(birthDateVn(Date.UTC(2015, 11, 31, 16, 59, 59))).toEqual({
      ok: true,
      value: '2015-12-31',
    });
    expect(birthDateVn(Number.NaN)).toEqual({
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
  it('maps the marks of the Base: 1 is present, 0 is absent', () => {
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
  });

  it('refuses every other mark, including "học lớp 2" (a school grade, not a make-up)', () => {
    for (const mark of [
      'Giáo viên Mẫu',
      'học lớp 2',
      'x',
      'xin nghỉ',
      '!',
      '?',
      '',
      null,
    ])
      expect(attendanceFromCode(mark)).toEqual({
        ok: false,
        code: 'DIEM_DANH_KHONG_RO',
      });
  });

  it('takes attendance from the Base only and knows the two Sheets files', () => {
    expect(ATTENDANCE_SOURCE).toBe('base');
    expect(SHEETS_BRANCH).toEqual({ KL357: 'KL', VP26: 'VP' });
    expect(Object.keys(BRANCH_EXCUSED_DEDUCTS).sort()).toEqual(['KL', 'VP']);
  });

  it('does not deduct an absence by default and can deduct an unexcused one later', () => {
    expect(sessionsToDeduct('co_mat', false)).toBe(1);
    expect(sessionsToDeduct('vang_khong_phep', false)).toBe(0);
    expect(sessionsToDeduct('vang_khong_phep', false, true)).toBe(1);
    expect(sessionsToDeduct('vang_co_phep', false, true)).toBe(0);
    expect(unexcusedAbsenceDeducts({})).toBe(false);
    expect(
      unexcusedAbsenceDeducts({ EDU_TRU_BUOI_VANG_KHONG_PHEP: 'true' }),
    ).toBe(true);
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
  // Lark gives only present (1) and absent (0); an absence is `vang_khong_phep`.
  const sessions = [
    { ngay: '2026-02-03', trangThai: 'co_mat' as const },
    { ngay: '2026-02-10', trangThai: 'co_mat' as const },
    { ngay: '2026-02-12', trangThai: 'co_mat' as const },
    { ngay: '2026-02-14', trangThai: 'vang_khong_phep' as const },
    { ngay: '2026-02-17', trangThai: 'co_mat' as const },
  ];

  it('deducts only the attended sessions after the cut-off date', () => {
    const result = recomputeBalance(opening, sessions, false);
    expect(result.rows.map((row) => row.tinhVaoSoDu)).toEqual([
      false,
      false,
      true,
      true,
      true,
    ]);
    // balance = 10 paid − 2 attended after the cut-off; the absence costs nothing for now
    expect(result.soBuoiConLai).toBe(8);
    expect(result.rows.map((row) => row.soBuoiDaTru)).toEqual([0, 0, 1, 0, 1]);
    expect(result.warnings).toEqual([]);
  });

  it('can deduct an absence without leave once the club decides so', () => {
    const result = recomputeBalance(opening, sessions, false, true);
    expect(result.rows.map((row) => row.soBuoiDaTru)).toEqual([0, 0, 1, 1, 1]);
    expect(result.soBuoiConLai).toBe(7);
  });

  it('can go below zero and keeps going', () => {
    const result = recomputeBalance(
      { soBuoi: 1, ngayChot: '2026-02-10' },
      sessions,
      false,
    );
    expect(result.soBuoiConLai).toBe(-1);
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
