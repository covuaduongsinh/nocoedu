import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  daysIn,
  displayDay,
  isDay,
  periodOf,
  shiftAnchor,
  shiftCustom,
  spanDays,
} from '../../client/pages/edu/diem-danh/periods.js';

describe('periods of the attendance register', () => {
  it('works in whole days of the calendar, over month and year ends and leap years', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(spanDays('2026-11-01', '2026-11-30')).toBe(30);
    expect(spanDays('2025-11-01', '2026-11-01')).toBe(366);
    expect(daysIn('2026-11-29', '2026-12-02')).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ]);
  });

  it('recognises only real days', () => {
    expect(isDay('2026-11-18')).toBe(true);
    expect(isDay('2026-02-29')).toBe(false);
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay(null)).toBe(false);
    expect(isDay('18/11/2026')).toBe(false);
  });

  it('a week is Monday to Sunday', () => {
    // 18 Nov 2026 is a Wednesday; Sunday 22 Nov belongs to the week of Monday 16 Nov.
    expect(periodOf('tuan', '2026-11-18')).toEqual({
      from: '2026-11-16',
      to: '2026-11-22',
    });
    expect(periodOf('tuan', '2026-11-22')).toEqual({
      from: '2026-11-16',
      to: '2026-11-22',
    });
    expect(periodOf('tuan', '2026-11-16')).toEqual({
      from: '2026-11-16',
      to: '2026-11-22',
    });
    // A week across a year end.
    expect(periodOf('tuan', '2027-01-01')).toEqual({
      from: '2026-12-28',
      to: '2027-01-03',
    });
  });

  it('a month and a year are the calendar ones', () => {
    expect(periodOf('thang', '2026-11-18')).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(periodOf('thang', '2024-02-10')).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });
    expect(periodOf('nam', '2026-11-18')).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(periodOf('homNay', '2026-11-18')).toEqual({
      from: '2026-11-18',
      to: '2026-11-18',
    });
  });

  it('the arrows move a period by its own length', () => {
    expect(shiftAnchor('homNay', '2026-11-18', -1)).toBe('2026-11-17');
    expect(periodOf('tuan', shiftAnchor('tuan', '2026-11-18', -1))).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(periodOf('thang', shiftAnchor('thang', '2026-01-31', -1))).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(periodOf('thang', shiftAnchor('thang', '2026-01-31', 1))).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(periodOf('nam', shiftAnchor('nam', '2024-02-29', 1))).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
    expect(shiftCustom({ from: '2026-11-02', to: '2026-11-15' }, 1)).toEqual({
      from: '2026-11-16',
      to: '2026-11-29',
    });
    expect(shiftCustom({ from: '2026-11-02', to: '2026-11-15' }, -1)).toEqual({
      from: '2026-10-19',
      to: '2026-11-01',
    });
  });

  it('shows a day the way people here write it', () => {
    expect(displayDay('2026-11-09')).toBe('09/11/2026');
  });
});
