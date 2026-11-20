import { describe, expect, it } from 'vitest';

import {
  addMarks,
  emptyCounts,
  rateOf,
  totalOf,
} from '../../server/edu/so-diem-danh.js';
import {
  ATTENDANCE_STATUSES,
  FREE_STATUSES,
  isCalendarDay,
  isPresentStatus,
  sessionsToDeduct,
  unexcusedAbsenceDeductsOn,
} from '../../server/edu/so-du.js';

/**
 * The balance rules that do not need a database (docs/plans/2026-11-20-ke-hoach-hoc-thu-buoi-tang-vang-khong-phep.md):
 * a trial session and a free one deduct nothing, and a branch deducts an absence without leave from a day it chooses.
 */
describe('trial and free sessions', () => {
  it('deduct nothing, whatever the branch settings', () => {
    for (const status of FREE_STATUSES)
      for (const excused of [false, true])
        for (const unexcused of [false, true])
          expect(sessionsToDeduct(status, excused, unexcused)).toBe(0);
    // The other statuses keep their rule.
    expect(sessionsToDeduct('co_mat', false, false)).toBe(1);
    expect(sessionsToDeduct('vang_khong_phep', false, true)).toBe(1);
    expect(sessionsToDeduct('hoc_bu', false, false)).toBe(1);
  });

  it('count as present for attendance', () => {
    expect(ATTENDANCE_STATUSES).toEqual([
      'co_mat',
      'vang_co_phep',
      'vang_khong_phep',
      'hoc_bu',
      'hoc_thu',
      'tang',
    ]);
    expect(isPresentStatus('hoc_thu')).toBe(true);
    expect(isPresentStatus('tang')).toBe(true);
    expect(isPresentStatus('vang_khong_phep')).toBe(false);
    const counts = emptyCounts();
    addMarks(counts, 'co_mat', 2);
    addMarks(counts, 'hoc_thu', 1);
    addMarks(counts, 'tang', 1);
    addMarks(counts, 'vang_khong_phep', 1);
    expect(counts).toMatchObject({ coMat: 2, hocThu: 1, tang: 1 });
    expect(totalOf(counts)).toBe(5);
    expect(rateOf(counts)).toBe(80);
  });
});

describe('an absence without leave', () => {
  const off = {};
  const on = { EDU_TRU_BUOI_VANG_KHONG_PHEP: 'true' };

  it('deducts from the day the branch set, on that day included', () => {
    expect(unexcusedAbsenceDeductsOn('2026-11-30', '2026-12-01', off)).toBe(
      false,
    );
    expect(unexcusedAbsenceDeductsOn('2026-12-01', '2026-12-01', off)).toBe(
      true,
    );
    expect(unexcusedAbsenceDeductsOn('2027-01-05', '2026-12-01', off)).toBe(
      true,
    );
  });

  it('never deducts without a day, or with something that is not a calendar day', () => {
    for (const branch of [null, undefined, '', '2026-02-30', '01/12/2026'])
      expect(unexcusedAbsenceDeductsOn('2027-01-05', branch, off)).toBe(false);
  });

  it('deducts everywhere when the variable of the server is on', () => {
    expect(unexcusedAbsenceDeductsOn('2020-01-01', null, on)).toBe(true);
  });

  it('knows a calendar day', () => {
    expect(isCalendarDay('2028-02-29')).toBe(true);
    expect(isCalendarDay('2026-02-29')).toBe(false);
    expect(isCalendarDay('2026-1-05')).toBe(false);
    expect(isCalendarDay(20261120)).toBe(false);
  });
});
