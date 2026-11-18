import { describe, expect, it } from 'vitest';

import {
  levelUpTarget,
  nextLevel,
  resultOf,
  stateOf,
} from '../../server/edu/kiem-tra.js';

/** The rules of the tests of a level that need no database (GĐ 5): the state a mark earns, the result, the level-up. */
describe('the state a mark earns on a skill', () => {
  it('is weak under the pass mark, passed from it, solid from 90%', () => {
    // Pass mark 70%, top mark 10: 6 is weak, 7 passes, 8 passes, 9 is solid, 10 is solid.
    expect(stateOf(6, 10, 70)).toBe('chua_vung');
    expect(stateOf(7, 10, 70)).toBe('dat');
    expect(stateOf(8, 10, 70)).toBe('dat');
    expect(stateOf(9, 10, 70)).toBe('vung');
    expect(stateOf(10, 10, 70)).toBe('vung');
  });

  it('compares with whole numbers, not fractions', () => {
    // 0.9 * 10 and 9/10 are the classic float traps; 9 of 10 is exactly 90%.
    expect(stateOf(9, 10, 90)).toBe('vung');
    expect(stateOf(8, 10, 90)).toBe('chua_vung');
    // 7 of 9 is 77.78%, 14 of 15 is 93.33%.
    expect(stateOf(7, 9, 78)).toBe('chua_vung');
    expect(stateOf(7, 9, 77)).toBe('dat');
    expect(stateOf(14, 15, 70)).toBe('vung');
  });

  it('is never solid below a pass mark that is above 90%', () => {
    // A pass mark of 95% turns 92% into "weak", not "solid".
    expect(stateOf(92, 100, 95)).toBe('chua_vung');
    expect(stateOf(95, 100, 95)).toBe('vung');
  });

  it('a mark of 0 is weak and a top mark of 1 is all or nothing', () => {
    expect(stateOf(0, 10, 1)).toBe('chua_vung');
    expect(stateOf(1, 1, 100)).toBe('vung');
    expect(stateOf(0, 1, 100)).toBe('chua_vung');
  });
});

describe('the result of one student', () => {
  const skills = [
    { kyNangId: 1, diemToiDa: 10 },
    { kyNangId: 2, diemToiDa: 10 },
    { kyNangId: 3, diemToiDa: 5 },
  ];

  it('sums the marks over the sum of every top mark', () => {
    const result = resultOf(
      skills,
      new Map([
        [1, 10],
        [2, 9],
        [3, 4],
      ]),
      70,
    );
    expect(result).toEqual({
      diem: 23,
      toiDa: 25,
      phanTram: 92,
      dat: true,
      thieu: 0,
      daKiemTra: true,
    });
  });

  it('counts a skill without a mark as 0 in the total and reports it', () => {
    const result = resultOf(
      skills,
      new Map([
        [1, 10],
        [2, 10],
      ]),
      80,
    );
    // 20 of 25 is exactly 80%: it passes, one skill is missing.
    expect(result).toMatchObject({ diem: 20, thieu: 1, dat: true });
    expect(
      resultOf(
        skills,
        new Map([
          [1, 10],
          [2, 9],
        ]),
        80,
      ).dat,
    ).toBe(false);
  });

  it('is not tested, and never passes, with no mark at all', () => {
    expect(resultOf(skills, new Map(), 1)).toMatchObject({
      daKiemTra: false,
      dat: false,
      thieu: 3,
      phanTram: 0,
    });
    expect(resultOf([], new Map(), 1)).toMatchObject({
      dat: false,
      phanTram: 0,
    });
  });

  it('rounds the percentage to one decimal', () => {
    expect(
      resultOf([{ kyNangId: 1, diemToiDa: 3 }], new Map([[1, 1]]), 10).phanTram,
    ).toBe(33.3);
  });
});

describe('who may be confirmed into the next level', () => {
  const base = {
    loai: 'len_cap',
    trangThai: 'da_chot',
    testLevelKey: 'tot',
    studentLevelKey: 'tot',
    dat: true,
  };

  it('names the next level of a student who passed a closed level-up test at their own level', () => {
    expect(levelUpTarget(base)).toBe('ma');
    expect(
      levelUpTarget({ ...base, testLevelKey: 'hau', studentLevelKey: 'hau' }),
    ).toBe('vua');
  });

  it('names nobody otherwise', () => {
    expect(levelUpTarget({ ...base, loai: 'dinh_ky' })).toBeUndefined();
    expect(levelUpTarget({ ...base, trangThai: 'nhap' })).toBeUndefined();
    expect(levelUpTarget({ ...base, dat: false })).toBeUndefined();
    // Already moved up, or not yet at the tested level.
    expect(levelUpTarget({ ...base, studentLevelKey: 'ma' })).toBeUndefined();
    expect(
      levelUpTarget({ ...base, testLevelKey: 'ma', studentLevelKey: 'tot' }),
    ).toBeUndefined();
    // The last level has nowhere to go.
    expect(
      levelUpTarget({ ...base, testLevelKey: 'vua', studentLevelKey: 'vua' }),
    ).toBeUndefined();
  });

  it('knows the order of the six levels', () => {
    expect(nextLevel('tot')).toBe('ma');
    expect(nextLevel('xe')).toBe('hau');
    expect(nextLevel('vua')).toBeUndefined();
    expect(nextLevel('khong-co')).toBeUndefined();
  });
});
