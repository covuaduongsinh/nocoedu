import { LEVELS, levelOrder, type LevelKey } from './levels.js';

/**
 * Rules of the tests of a level (GĐ 5 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`), free of any database access so
 * they can be tested on their own. The database work is in `server/routes/edu-kiem-tra.ts`.
 *
 * - A test belongs to one class and covers a set of skills of one level; each skill has a top mark (`diemToiDa`) and a
 *   student gets a whole-number mark on each. The pass mark `diemDat` is a whole percentage and is used twice: for the
 *   test as a whole (the sum of the marks over the sum of the top marks) and for each skill (the mark over its top mark).
 * - A skill below the pass mark is `chua_vung`, at it `dat`, and from 90% on (and not below the pass mark) `vung`.
 * - A student who has no mark at all was not tested: no row is written and the student is not in the result. A skill
 *   without a mark counts 0 in the total of a student who was tested (the top mark stays in the divisor) and writes no
 *   state for that skill.
 * - Passing a `len_cap` test makes a student **eligible** for the next level when the student is still at the level the
 *   test covers. Nothing here, or anywhere in the application, moves a student up: a coach confirms it (`/hocVien/lenCap`).
 */
export const TEST_KINDS = ['dinh_ky', 'len_cap'] as const;
export type TestKind = (typeof TEST_KINDS)[number];

export const TEST_STATUSES = ['nhap', 'da_chot'] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

export const NAME_MAX = 200;
/** Most skills one test covers; most cells one request writes; the highest top mark of one skill. */
export const MAX_SKILLS_PER_TEST = 50;
export const MAX_CELLS_PER_ENTRY = 500;
export const MAX_TOP_MARK = 1000;
/** A skill at or above this percentage (and at least the pass mark) is `vung`. */
export const SOLID_PERCENT = 90;
/** The lock that entering marks, editing a test and closing it all take (see `GROUP_LOCK` for why). */
export const TEST_LOCK = 'edu:kiem-tra';

export type SkillState = 'chua_vung' | 'dat' | 'vung';

/** The state a mark earns on a skill. Integer arithmetic only: `score / max` is never compared as a float. */
export function stateOf(
  score: number,
  topMark: number,
  passPercent: number,
): SkillState {
  if (score * 100 < passPercent * topMark) return 'chua_vung';
  return score * 100 >= SOLID_PERCENT * topMark ? 'vung' : 'dat';
}

export interface TestSkill {
  readonly kyNangId: number;
  readonly diemToiDa: number;
}

export interface StudentResult {
  /** The sum of the marks the student has. */
  readonly diem: number;
  /** The sum of the top marks of every skill of the test. */
  readonly toiDa: number;
  /** `diem` over `toiDa` as a percentage with one decimal (0 when the test has no top mark). */
  readonly phanTram: number;
  /** The student reached the pass mark of the test (false for a student who was not tested). */
  readonly dat: boolean;
  /** Skills of the test the student has no mark on. */
  readonly thieu: number;
  /** The student has at least one mark. */
  readonly daKiemTra: boolean;
}

/** The result of one student: `marks` is skill id → mark of that student. */
export function resultOf(
  skills: readonly TestSkill[],
  marks: ReadonlyMap<number, number>,
  passPercent: number,
): StudentResult {
  let diem = 0;
  let toiDa = 0;
  let thieu = 0;
  let tested = 0;
  for (const skill of skills) {
    toiDa += skill.diemToiDa;
    const mark = marks.get(skill.kyNangId);
    if (mark === undefined) {
      thieu += 1;
      continue;
    }
    tested += 1;
    diem += mark;
  }
  return {
    diem,
    toiDa,
    phanTram: toiDa === 0 ? 0 : Math.round((1000 * diem) / toiDa) / 10,
    dat: tested > 0 && toiDa > 0 && diem * 100 >= passPercent * toiDa,
    thieu,
    daKiemTra: tested > 0,
  };
}

/** The level after `levelKey`, or `undefined` for the last one. */
export function nextLevel(levelKey: string): LevelKey | undefined {
  const order = levelOrder(levelKey);
  return order === undefined
    ? undefined
    : LEVELS.find((level) => level.order === order + 1)?.key;
}

/**
 * The level a student passing this test may be confirmed into, when the student is eligible: a `len_cap` test, closed,
 * passed, the student still at the level the test covers, and a level above it to go to. Otherwise `undefined`.
 */
export function levelUpTarget(input: {
  readonly loai: string;
  readonly trangThai: string;
  readonly testLevelKey: string;
  readonly studentLevelKey: string;
  readonly dat: boolean;
}): LevelKey | undefined {
  if (input.loai !== 'len_cap' || input.trangThai !== 'da_chot' || !input.dat)
    return undefined;
  if (input.studentLevelKey !== input.testLevelKey) return undefined;
  return nextLevel(input.testLevelKey);
}
