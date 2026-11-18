import { describe, expect, it } from 'vitest';

import {
  addMarks,
  daysInRange,
  daysOf,
  emptyCounts,
  isDay,
  keepsSession,
  rangeProblem,
  rateOf,
  runsOf,
  totalOf,
} from '../../server/edu/so-diem-danh.js';

describe('attendance register rules', () => {
  it('knows real days only', () => {
    expect(isDay('2026-11-18')).toBe(true);
    expect(isDay('2024-02-29')).toBe(true);
    expect(isDay('2026-02-29')).toBe(false);
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay('18/11/2026')).toBe(false);
  });

  it('counts both ends of a period and refuses a bad one', () => {
    expect(daysInRange('2026-11-01', '2026-11-01')).toBe(1);
    expect(daysInRange('2026-11-01', '2026-11-30')).toBe(30);
    expect(daysInRange('2026-11-02', '2026-11-01')).toBe(0);
    expect(rangeProblem('2025-11-01', '2026-11-01')).toBeUndefined();
    expect(rangeProblem('2025-10-31', '2026-11-01')).toMatch(/366/u);
    expect(rangeProblem('2026-11-02', '2026-11-01')).toMatch(/before/u);
    expect(rangeProblem('2026-02-30', '2026-03-01')).toMatch(/YYYY-MM-DD/u);
  });

  it('lists the days of a period across a month end and a year end', () => {
    expect(daysOf('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('counts the marks and the rate (present or making up, over every mark)', () => {
    const counts = emptyCounts();
    addMarks(counts, 'co_mat', 3);
    addMarks(counts, 'hoc_bu', 1);
    addMarks(counts, 'vang_co_phep', 1);
    addMarks(counts, 'vang_khong_phep', 1);
    addMarks(counts, 'khong_biet', 9);
    expect(totalOf(counts)).toBe(6);
    expect(rateOf(counts)).toBe(67);
    expect(rateOf(emptyCounts())).toBe(0);
  });

  it('keeps every session unless a mark filter is on, then only those with a matching mark', () => {
    const marked = emptyCounts();
    addMarks(marked, 'co_mat', 1);
    expect(keepsSession(false, undefined)).toBe(true);
    expect(keepsSession(true, undefined)).toBe(false);
    expect(keepsSession(true, emptyCounts())).toBe(false);
    expect(keepsSession(true, marked)).toBe(true);
  });

  it('turns a list of session ids into ranges of consecutive ids, whatever the order', () => {
    expect(runsOf([])).toEqual([]);
    expect(runsOf([5])).toEqual([{ from: 5, to: 5 }]);
    expect(runsOf([9, 1, 2, 3, 7, 10, 2])).toEqual([
      { from: 1, to: 3 },
      { from: 7, to: 7 },
      { from: 9, to: 10 },
    ]);
    // Every id is inside exactly one range and nothing else is.
    const ids = [4, 5, 6, 20, 21, 40];
    const covered = runsOf(ids).flatMap((r) =>
      Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i),
    );
    expect(covered).toEqual(ids);
  });
});
