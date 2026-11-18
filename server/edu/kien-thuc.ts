import { LEVELS, type LevelKey } from './levels.js';

/**
 * Rules of the knowledge system (GĐ 4 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`), free of any database access
 * so they can be tested on their own. The database helpers are in `kien-thuc-doc.ts`.
 *
 * - A student's state on a skill is one row (`eduHocVienKyNang`): `da_hoc` (taught while present), `chua_vung` (graded
 *   "not solid yet"), `dat` or `vung` (graded). No row means the skill has not been learned.
 * - A **gap** is never stored. It is a skill that was taught to the student's class (or the student's group of it)
 *   in a session the student was absent from and that the student has no row for (a make-up session or a grading
 *   writes the row, which closes the gap), or a skill graded `chua_vung`.
 */

export const MUC_DO = ['da_hoc', 'chua_vung', 'dat', 'vung'] as const;
export type MucDo = (typeof MUC_DO)[number];

export const NGUON = ['buoi_hoc', 'cham_tay', 'kiem_tra'] as const;
export type Nguon = (typeof NGUON)[number];

export const KT_STATUSES = ['hoat_dong', 'an'] as const;
export type KtStatus = (typeof KT_STATUSES)[number];

/** Attendance statuses that count as having been taught. */
export const PRESENT_STATUSES = ['co_mat', 'hoc_bu'] as const;
/** Attendance statuses that make a taught skill a gap. */
export const ABSENT_STATUSES = ['vang_co_phep', 'vang_khong_phep'] as const;

export const CODE_MAX = 40;
export const NAME_MAX = 200;
export const DESCRIPTION_MAX = 1000;
/** Most skills one session may list, most cells one grading request may carry. */
export const MAX_SKILLS_PER_SESSION = 50;
export const MAX_CELLS_PER_GRADING = 500;

/** A code as stored: trimmed, letters, digits, dot, dash, underscore, starting with a letter or digit. */
export function cleanCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const code = value.trim();
  return /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(code) && code.length <= CODE_MAX
    ? code
    : undefined;
}

/** A name or description as stored: trimmed, inner whitespace collapsed. Empty or too long is `undefined`. */
export function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().replace(/\s+/gu, ' ');
  return text.length > 0 && text.length <= max ? text : undefined;
}

const lower = (value: string): string =>
  value.normalize('NFC').toLowerCase().trim();

/**
 * A level written as its key (`tuong`) or its exact title (`Tượng`, `TƯỢNG`): the key, or `undefined`. Accents are not
 * stripped from a title: `Tướng` is not `Tượng`.
 */
export function levelFromCell(value: string): LevelKey | undefined {
  const wanted = lower(value);
  return LEVELS.find(
    (level) => level.key === wanted || lower(level.title) === wanted,
  )?.key;
}

/** Whether a state counts toward "learned and not weak": everything but `chua_vung`. */
export const isLearned = (mucDo: string): boolean =>
  mucDo === 'da_hoc' || mucDo === 'dat' || mucDo === 'vung';

export interface Progress {
  /** Active skills of the level. */
  readonly tong: number;
  /** Learned and not weak (`da_hoc`, `dat`, `vung`). */
  readonly daHoc: number;
  /** Graded `dat` or `vung`. */
  readonly dat: number;
  readonly chuaVung: number;
  /** `daHoc` as a whole percentage of `tong` (0 when the level has no skill). */
  readonly phanTram: number;
}

/** The progress of one student over a set of skill ids, from the states the student has (`known`: skill id → state). */
export function progressOf(
  skillIds: readonly number[],
  known: ReadonlyMap<number, string>,
): Progress {
  let daHoc = 0;
  let dat = 0;
  let chuaVung = 0;
  for (const id of skillIds) {
    const state = known.get(id);
    if (state === undefined) continue;
    if (state === 'chua_vung') chuaVung += 1;
    else if (isLearned(state)) daHoc += 1;
    if (state === 'dat' || state === 'vung') dat += 1;
  }
  const tong = skillIds.length;
  return {
    tong,
    daHoc,
    dat,
    chuaVung,
    phanTram: tong === 0 ? 0 : Math.round((100 * daHoc) / tong),
  };
}

export interface GapStudent {
  readonly id: number;
  readonly lopId: number | null;
  readonly nhomId: number | null;
}
export interface GapSession {
  readonly id: number;
  readonly lopId: number;
  readonly ngay: string;
}
export interface GapTaught {
  readonly buoiHocId: number;
  readonly kyNangId: number;
  readonly nhomId: number | null;
}
export interface GapAbsence {
  readonly buoiHocId: number;
  readonly hocVienId: number;
}
export interface GapKnown {
  readonly hocVienId: number;
  readonly kyNangId: number;
  readonly mucDo: string;
}

export type GapReason = 'vang_buoi_day' | 'chua_vung';
export interface Gap {
  readonly hocVienId: number;
  readonly kyNangId: number;
  readonly lyDo: GapReason;
  /** The earliest session of the class that taught the skill while the student was absent (`vang_buoi_day`). */
  readonly buoiHocId: number | null;
  readonly ngay: string | null;
}

/**
 * The gaps of a set of students.
 *
 * - `vang_buoi_day`: the student has an absence row in a session of the student's own class that taught the skill to
 *   the whole class or to the student's group, and the student has no state for the skill. A student who has no row for
 *   a session at all (joined later) is not counted: only an explicit absence is. The gap is dated by the earliest such
 *   session.
 * - `chua_vung`: the student's state for the skill is `chua_vung`, whether or not the student was absent.
 *
 * `skillIds` limits the result to those skills (the active ones of a level, say); leave it out for all. The result is
 * ordered by skill, then student.
 */
export function deriveGaps(input: {
  readonly students: readonly GapStudent[];
  readonly sessions: readonly GapSession[];
  readonly taught: readonly GapTaught[];
  readonly absences: readonly GapAbsence[];
  readonly known: readonly GapKnown[];
  readonly skillIds?: ReadonlySet<number>;
}): Gap[] {
  const students = new Map(input.students.map((s) => [s.id, s]));
  const sessions = new Map(input.sessions.map((s) => [s.id, s]));
  const state = new Map<string, string>();
  for (const k of input.known)
    state.set(`${k.hocVienId}|${k.kyNangId}`, k.mucDo);
  const taughtBySession = new Map<number, GapTaught[]>();
  for (const t of input.taught) {
    const list = taughtBySession.get(t.buoiHocId) ?? [];
    list.push(t);
    taughtBySession.set(t.buoiHocId, list);
  }
  const wanted = (skillId: number) =>
    input.skillIds === undefined || input.skillIds.has(skillId);

  const gaps = new Map<string, Gap>();
  for (const k of input.known) {
    if (k.mucDo !== 'chua_vung' || !students.has(k.hocVienId)) continue;
    if (!wanted(k.kyNangId)) continue;
    gaps.set(`${k.hocVienId}|${k.kyNangId}`, {
      hocVienId: k.hocVienId,
      kyNangId: k.kyNangId,
      lyDo: 'chua_vung',
      buoiHocId: null,
      ngay: null,
    });
  }
  for (const absence of input.absences) {
    const student = students.get(absence.hocVienId);
    const session = sessions.get(absence.buoiHocId);
    if (!student || !session) continue;
    // Only the sessions of the class the student is in now: a skill taught to a class the student has left is not theirs.
    if (student.lopId === null || session.lopId !== student.lopId) continue;
    for (const t of taughtBySession.get(session.id) ?? []) {
      if (t.nhomId !== null && t.nhomId !== student.nhomId) continue;
      if (!wanted(t.kyNangId)) continue;
      const key = `${student.id}|${t.kyNangId}`;
      // A state of any kind closes the gap: a make-up session or a grading wrote it, `chua_vung` is already listed.
      if (state.has(key)) continue;
      const before = gaps.get(key);
      if (
        before &&
        before.ngay !== null &&
        (before.ngay < session.ngay ||
          (before.ngay === session.ngay &&
            (before.buoiHocId ?? 0) < session.id))
      ) {
        continue;
      }
      gaps.set(key, {
        hocVienId: student.id,
        kyNangId: t.kyNangId,
        lyDo: 'vang_buoi_day',
        buoiHocId: session.id,
        ngay: session.ngay,
      });
    }
  }
  return [...gaps.values()].sort(
    (a, b) => a.kyNangId - b.kyNangId || a.hocVienId - b.hocVienId,
  );
}
