import type { AttendanceStatus } from '../so-du.js';
import {
  ATTENDANCE_CODES,
  SHEETS_CA_CODES,
  SHEETS_FROM_DATE,
} from './chua-xac-nhan.js';
import type { Converted } from './chuan-hoa.js';

const normalize = (raw: unknown): string =>
  typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
    ? String(raw).normalize('NFC').trim().toLowerCase()
    : '';

/** The "present" cell of the Base or the Sheets → attendance status; an unknown mark is `DIEM_DANH_KHONG_RO`. */
export function attendanceFromCode(raw: unknown): Converted<AttendanceStatus> {
  const status = ATTENDANCE_CODES[normalize(raw)];
  return status
    ? { ok: true, value: status }
    : { ok: false, code: 'DIEM_DANH_KHONG_RO' };
}

/** Which source holds the session of this date (`YYYY-MM-DD`): the Base before the cut-over, the Sheets from it on. */
export function pickSource(date: string): 'base' | 'sheets' {
  return date < SHEETS_FROM_DATE ? 'base' : 'sheets';
}

/** A Sheets class cell: does the student belong to the slot, or is the mark not one the club has explained? */
export function sheetsCaCell(raw: unknown): 'belongs' | 'notBelongs' | 'empty' {
  const text = normalize(raw);
  if (!text) return 'empty';
  if ((SHEETS_CA_CODES.belongs as readonly string[]).includes(text))
    return 'belongs';
  return 'notBelongs';
}

/** A Sheets slot name: `T3` → Tuesday-style weekday 3, `T2 CA1` → weekday 2, slot 1. `thu` follows `eduLopLich.thu`. */
export function parseSheetsCa(
  raw: string,
): { thu: number; ca: number | null } | null {
  const match = /^T([2-7])(?:\s*CA\s*([1-9]))?$/iu.exec(raw.trim());
  if (!match?.[1]) return null;
  return { thu: Number(match[1]), ca: match[2] ? Number(match[2]) : null };
}

export interface ScheduleRow {
  readonly lopId: number;
  readonly coSoId: number;
  readonly thu: number;
  readonly gioBatDau: string;
}

/**
 * The class a Sheets slot belongs to: the schedule rows of that branch and weekday; `CA<n>` keeps the n-th earliest
 * start time of that day. Exactly one class must remain, otherwise `LOP_KHONG_RO` — never a guess.
 */
export function resolveSheetsClass(
  schedule: readonly ScheduleRow[],
  slot: { coSoId: number; thu: number; ca: number | null },
): Converted<number> {
  let rows = schedule.filter(
    (row) => row.coSoId === slot.coSoId && row.thu === slot.thu,
  );
  if (slot.ca !== null) {
    const starts = [...new Set(rows.map((row) => row.gioBatDau))].sort();
    const start = starts[slot.ca - 1];
    rows = start === undefined ? [] : rows.filter((r) => r.gioBatDau === start);
  }
  const classes = new Set(rows.map((row) => row.lopId));
  const [only] = [...classes];
  return classes.size === 1 && only !== undefined
    ? { ok: true, value: only }
    : { ok: false, code: 'LOP_KHONG_RO' };
}
