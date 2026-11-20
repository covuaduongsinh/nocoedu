import {
  ATTENDANCE_STATUSES,
  addDays,
  type AttendanceStatus,
} from './so-du.js';

/**
 * The attendance register (`POST /diemDanh/traCuu`): the rules that need no database, so they are tested on their own.
 */

/** The longest period one lookup covers, in days (both ends counted). */
export const MAX_RANGE_DAYS = 366;

export const REGISTER_MODES = ['buoi', 'hocVien', 'giaoVien'] as const;
export type RegisterMode = (typeof REGISTER_MODES)[number];

/** Whether `value` is a real calendar day written `YYYY-MM-DD`. */
export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  // A month 13 is an invalid date (no ISO string); the 30th of February rolls over to March.
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** Days from `from` to `to`, both counted; `to` before `from` is 0. */
export function daysInRange(from: string, to: string): number {
  const span =
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
    86_400_000;
  return span < 0 ? 0 : Math.round(span) + 1;
}

/** Why a period is refused, or `undefined` when it is fine. */
export function rangeProblem(from: string, to: string): string | undefined {
  if (!isDay(from) || !isDay(to)) return 'The dates must be YYYY-MM-DD.';
  if (to < from) return 'The end date is before the start date.';
  if (daysInRange(from, to) > MAX_RANGE_DAYS)
    return `A lookup covers at most ${MAX_RANGE_DAYS} days.`;
  return undefined;
}

export interface Counts {
  coMat: number;
  vangCoPhep: number;
  vangKhongPhep: number;
  hocBu: number;
  /** Trial sessions and sessions given for free: present, nothing deducted. */
  hocThu: number;
  tang: number;
}

export const emptyCounts = (): Counts => ({
  coMat: 0,
  vangCoPhep: 0,
  vangKhongPhep: 0,
  hocBu: 0,
  hocThu: 0,
  tang: 0,
});

const FIELD_OF: Record<AttendanceStatus, keyof Counts> = {
  co_mat: 'coMat',
  vang_co_phep: 'vangCoPhep',
  vang_khong_phep: 'vangKhongPhep',
  hoc_bu: 'hocBu',
  hoc_thu: 'hocThu',
  tang: 'tang',
};

export const isStatus = (value: string): value is AttendanceStatus =>
  (ATTENDANCE_STATUSES as readonly string[]).includes(value);

/** Adds `n` marks of `status` to `counts`; an unknown status is ignored. */
export function addMarks(counts: Counts, status: string, n: number): void {
  if (isStatus(status)) counts[FIELD_OF[status]] += n;
}

export const totalOf = (c: Counts): number =>
  c.coMat + c.vangCoPhep + c.vangKhongPhep + c.hocBu + c.hocThu + c.tang;

/** Attendance rate in percent: present (also making up, on trial or on a free session), over every mark. 0 when there is no mark. */
export function rateOf(c: Counts): number {
  const total = totalOf(c);
  const present = c.coMat + c.hocBu + c.hocThu + c.tang;
  return total === 0 ? 0 : Math.round((present / total) * 100);
}

/** Sessions in `list` that the register keeps: every one, or only those with a mark that matched the filters. */
export const keepsSession = (
  hasAttendanceFilter: boolean,
  counts: Counts | undefined,
): boolean =>
  !hasAttendanceFilter || (counts !== undefined && totalOf(counts) > 0);

/** The days of the period, for a filter on `ngay` (a text column has no range operator in the filter language). */
export function daysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) out.push(day);
  return out;
}

/** `ids` as closed ranges of consecutive numbers, in order: `[1,2,3,7,9,10]` → `1–3`, `7`, `9–10`. Duplicates are ignored. */
export function runsOf(ids: readonly number[]): { from: number; to: number }[] {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const runs: { from: number; to: number }[] = [];
  for (const id of sorted) {
    const last = runs[runs.length - 1];
    if (last && id === last.to + 1) last.to = id;
    else runs.push({ from: id, to: id });
  }
  return runs;
}
