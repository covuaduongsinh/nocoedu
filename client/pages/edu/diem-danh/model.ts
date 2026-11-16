import { text, type Row } from '../kit.js';

/** What the attendance page works with, kept free of React so the rules can be tested on their own. */
export const STATUSES = [
  'co_mat',
  'vang_co_phep',
  'vang_khong_phep',
  'hoc_bu',
] as const;
export type Status = (typeof STATUSES)[number];

export interface Mark {
  readonly trangThai: Status;
  readonly daLamBtvn: boolean;
  readonly nhanXet: string;
}

/** A student nobody marked yet is taken as present: the coach only touches the ones who are away. */
export const NEW_MARK: Mark = {
  trangThai: 'co_mat',
  daLamBtvn: false,
  nhanXet: '',
};

export const CONTENT_FIELDS = [
  'keHoachDay',
  'kienThucMoi',
  'giaoBtvn',
  'keHoachBuoiSau',
] as const;
export type Content = Record<(typeof CONTENT_FIELDS)[number], string>;
export const EMPTY_CONTENT: Content = {
  keHoachDay: '',
  kienThucMoi: '',
  giaoBtvn: '',
  keHoachBuoiSau: '',
};

/** Short comments a coach adds with one tap; the wording is `edu.diemDanh.tag.<key>`. */
export const QUICK_TAGS = [
  'tiepThu',
  'tapTrung',
  'tienBo',
  'canChuY',
  'chuaBtvn',
  'canThan',
] as const;

/** The comment column holds 500 characters (`eduDiemDanh.nhanXet`). */
export const MAX_COMMENT = 500;

export type TimeFilter = 'today' | 'yesterday' | 'week' | 'all';
export const TIME_FILTERS: readonly TimeFilter[] = [
  'today',
  'yesterday',
  'week',
  'all',
];

/** `date` moved by `days`; `YYYY-MM-DD` in and out, computed in UTC so no time zone moves it. */
export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Monday to Sunday of the week `today` is in. */
export function weekOf(today: string): { from: string; to: string } {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
  return { from: addDays(today, 1 - weekday), to: addDays(today, 7 - weekday) };
}

export function inTimeFilter(
  day: string,
  filter: TimeFilter,
  today: string,
): boolean {
  if (filter === 'today') return day === today;
  if (filter === 'yesterday') return day === addDays(today, -1);
  if (filter === 'week') {
    const { from, to } = weekOf(today);
    return day >= from && day <= to;
  }
  return true;
}

/**
 * Where a session stands for the coach: its register is saved, it was called off, it is still to come, or it is a
 * session of today or earlier whose register is still due.
 */
export type SessionState = 'done' | 'cancelled' | 'due' | 'planned';

export function sessionState(session: Row, today: string): SessionState {
  if (session.trangThai === 'da_diem_danh') return 'done';
  if (session.trangThai === 'huy') return 'cancelled';
  return text(session.ngay) <= today ? 'due' : 'planned';
}

/** Newest day first; within a day the earlier session first. */
export function bySessionTime(a: Row, b: Row): number {
  return (
    text(b.ngay).localeCompare(text(a.ngay)) ||
    text(a.gioBatDau).localeCompare(text(b.gioBatDau))
  );
}

/** The students of a register: those studying in the class, and anyone already marked in this session. */
export function rosterOf(
  session: Row,
  students: readonly Row[],
  marked: ReadonlySet<number>,
): Row[] {
  return students
    .filter(
      (student) =>
        marked.has(student.id) ||
        (student.lopId === session.lopId && student.trangThai === 'dang_hoc'),
    )
    .sort((a, b) => text(a.hoTen).localeCompare(text(b.hoTen), 'vi'));
}

export function countByStatus(
  roster: readonly Row[],
  markOf: (id: number) => Mark,
): { present: number; away: number } {
  let present = 0;
  for (const student of roster) {
    const status = markOf(student.id).trangThai;
    if (status === 'co_mat' || status === 'hoc_bu') present += 1;
  }
  return { present, away: roster.length - present };
}

/** A typed score: empty stays empty, anything else is an integer from 0 to 10 or not valid. */
export function parseScore(raw: string): number | null | undefined {
  const value = raw.trim();
  if (value === '') return null;
  if (!/^\d{1,2}$/u.test(value)) return undefined;
  const score = Number(value);
  return score <= 10 ? score : undefined;
}

/** Adds a quick comment to what is already written, without writing the same one twice. */
export function withTag(comment: string, tag: string): string {
  const current = comment.trim();
  if (current.includes(tag)) return current;
  const next = current ? `${current.replace(/[.;,]\s*$/u, '')}. ${tag}` : tag;
  return next.slice(0, MAX_COMMENT);
}
