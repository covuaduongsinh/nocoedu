import { describe, expect, it } from 'vitest';

import {
  countByStatus,
  inTimeFilter,
  NEW_MARK,
  parseScore,
  rosterOf,
  sessionState,
  weekOf,
  withTag,
  type Mark,
} from '../../client/pages/edu/diem-danh/model.js';

// The rules of the attendance page that need no React. Names are made up.

describe('attendance page rules', () => {
  it('takes a week as Monday to Sunday, also when today is a Sunday', () => {
    // 2026-11-09 is a Monday, 2026-11-15 a Sunday.
    expect(weekOf('2026-11-11')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(weekOf('2026-11-15')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(weekOf('2026-11-09')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
  });

  it('filters a day by today, yesterday and this week across a month end', () => {
    expect(inTimeFilter('2026-12-01', 'today', '2026-12-01')).toBe(true);
    expect(inTimeFilter('2026-11-30', 'yesterday', '2026-12-01')).toBe(true);
    expect(inTimeFilter('2026-11-30', 'week', '2026-12-01')).toBe(true);
    expect(inTimeFilter('2026-11-29', 'week', '2026-12-01')).toBe(false);
    expect(inTimeFilter('2020-01-01', 'all', '2026-12-01')).toBe(true);
  });

  it('tells a register that is due from one still to come, a saved one and one called off', () => {
    const session = (ngay: string, trangThai: string) => ({
      id: 1,
      ngay,
      trangThai,
    });
    expect(sessionState(session('2026-11-09', 'du_kien'), '2026-11-09')).toBe(
      'due',
    );
    expect(sessionState(session('2026-11-08', 'du_kien'), '2026-11-09')).toBe(
      'due',
    );
    expect(sessionState(session('2026-11-10', 'du_kien'), '2026-11-09')).toBe(
      'planned',
    );
    expect(
      sessionState(session('2026-11-08', 'da_diem_danh'), '2026-11-09'),
    ).toBe('done');
    expect(sessionState(session('2026-11-08', 'huy'), '2026-11-09')).toBe(
      'cancelled',
    );
  });

  it('lists the students studying in the class and anyone already marked, by name', () => {
    const students = [
      { id: 1, hoTen: 'Học viên Mẫu C', lopId: 1, trangThai: 'dang_hoc' },
      { id: 2, hoTen: 'Học viên Mẫu A', lopId: 1, trangThai: 'da_nghi' },
      // Moved to another class since, but marked in this session: the history stays editable.
      { id: 3, hoTen: 'Học viên Mẫu B', lopId: 2, trangThai: 'dang_hoc' },
      { id: 4, hoTen: 'Học viên Mẫu D', lopId: 2, trangThai: 'dang_hoc' },
    ];
    expect(
      rosterOf({ id: 9, lopId: 1 }, students, new Set([3])).map((s) => s.id),
    ).toEqual([3, 1]);
  });

  it('counts present and make-up as came, the two absences as away', () => {
    const marks: Record<number, Mark> = {
      1: { ...NEW_MARK, trangThai: 'hoc_bu' },
      2: { ...NEW_MARK, trangThai: 'vang_co_phep' },
      3: { ...NEW_MARK, trangThai: 'vang_khong_phep' },
    };
    const roster = [1, 2, 3, 4].map((id) => ({ id }));
    // Student 4 is not marked yet: taken as present.
    expect(countByStatus(roster, (id) => marks[id] ?? NEW_MARK)).toEqual({
      present: 2,
      away: 2,
    });
  });

  it('reads a score as empty, a whole number from 0 to 10, or not valid', () => {
    expect(parseScore('')).toBeNull();
    expect(parseScore('  ')).toBeNull();
    expect(parseScore('0')).toBe(0);
    expect(parseScore('10')).toBe(10);
    expect(parseScore('11')).toBeUndefined();
    expect(parseScore('7.5')).toBeUndefined();
    expect(parseScore('-1')).toBeUndefined();
    expect(parseScore('tốt')).toBeUndefined();
  });

  it('adds a quick comment once, after what is already written', () => {
    expect(withTag('', 'Có tiến bộ')).toBe('Có tiến bộ');
    expect(withTag('Tập trung.', 'Có tiến bộ')).toBe('Tập trung. Có tiến bộ');
    expect(withTag('Tập trung. Có tiến bộ', 'Có tiến bộ')).toBe(
      'Tập trung. Có tiến bộ',
    );
    expect(withTag('x'.repeat(495), 'Có tiến bộ')).toHaveLength(500);
  });
});
