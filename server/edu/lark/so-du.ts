import { sessionsToDeduct, type AttendanceStatus } from '../so-du.js';
import { OPENING_BALANCE_RULE } from './chua-xac-nhan.js';
import type { Converted } from './chuan-hoa.js';

export interface OpeningBalance {
  readonly soBuoi: number;
  /** `YYYY-MM-DD`, the day the balance was written on Lark; sessions on or before it are already inside `soBuoi`. */
  readonly ngayChot: string;
}

/**
 * The opening package of a student from the two Lark cells. Empty balance → `null` (no package). Several values in
 * one cell (a lookup that matched more than one row) → `SO_DU_KHONG_RO`; a balance without its date → `THIEU_NGAY_CHOT`.
 */
export function openingBalance(
  rawBalance: unknown,
  rawDate: unknown,
): Converted<OpeningBalance | null> {
  if (rawBalance === null || rawBalance === undefined || rawBalance === '')
    return { ok: true, value: null };
  if (Array.isArray(rawBalance))
    return rawBalance.length === 1
      ? openingBalance(rawBalance[0], rawDate)
      : rawBalance.length === 0
        ? { ok: true, value: null }
        : { ok: false, code: 'SO_DU_KHONG_RO' };
  const text = typeof rawBalance === 'string' ? rawBalance.trim() : rawBalance;
  const soBuoi = typeof text === 'number' ? text : Number(text);
  if (text === '' || !Number.isInteger(soBuoi))
    return { ok: false, code: 'SO_DU_KHONG_RO' };
  const date: unknown = Array.isArray(rawDate) ? rawDate[0] : rawDate;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date))
    return { ok: false, code: 'THIEU_NGAY_CHOT' };
  return { ok: true, value: { soBuoi, ngayChot: date } };
}

export interface AttendanceInput {
  readonly ngay: string;
  readonly trangThai: AttendanceStatus;
}

export interface AttendanceOutcome {
  readonly ngay: string;
  /** `false`: history already inside the opening balance — it never moves the balance, not even when corrected. */
  readonly tinhVaoSoDu: boolean;
  readonly soBuoiDaTru: number;
}

export interface RecomputedBalance {
  readonly soBuoiConLai: number;
  readonly rows: readonly AttendanceOutcome[];
  /** `KHONG_CO_SO_DU` when the student has no opening balance: nothing is deducted and the balance is 0. */
  readonly warnings: readonly string[];
}

/**
 * Balance after an import = opening package − Σ `sessionsToDeduct` of the sessions after the cut-off date. The
 * deduction rule itself is `sessionsToDeduct`; it is not repeated here.
 */
export function recomputeBalance(
  opening: OpeningBalance | null,
  attendance: readonly AttendanceInput[],
  excusedAbsenceDeducts: boolean,
  unexcusedAbsenceDeducts = false,
): RecomputedBalance {
  if (!opening) {
    return {
      soBuoiConLai: 0,
      rows: attendance.map((row) => ({
        ngay: row.ngay,
        tinhVaoSoDu: false,
        soBuoiDaTru: 0,
      })),
      warnings: [OPENING_BALANCE_RULE.noOpeningBalanceCode],
    };
  }
  let balance = opening.soBuoi;
  const rows = attendance.map((row): AttendanceOutcome => {
    if (row.ngay <= opening.ngayChot)
      return { ngay: row.ngay, tinhVaoSoDu: false, soBuoiDaTru: 0 };
    const deducted = sessionsToDeduct(
      row.trangThai,
      excusedAbsenceDeducts,
      unexcusedAbsenceDeducts,
    );
    balance -= deducted;
    return { ngay: row.ngay, tinhVaoSoDu: true, soBuoiDaTru: deducted };
  });
  return { soBuoiConLai: balance, rows, warnings: [] };
}

/**
 * Balance of a student who has packages from `Deal HP`: Σ package sessions − Σ `sessionsToDeduct` of every session
 * (there is no cut-off date: the packages hold what was paid, the attendance holds what was taught). Which package a
 * session comes out of is not decided here but on every read, first in first out (`../phan-bo-goi.ts`).
 */
export function recomputeFromPackages(
  totalSessions: number,
  attendance: readonly AttendanceInput[],
  excusedAbsenceDeducts: boolean,
  unexcusedAbsenceDeducts = false,
): RecomputedBalance {
  let balance = totalSessions;
  const rows = attendance.map((row): AttendanceOutcome => {
    const deducted = sessionsToDeduct(
      row.trangThai,
      excusedAbsenceDeducts,
      unexcusedAbsenceDeducts,
    );
    balance -= deducted;
    return { ngay: row.ngay, tinhVaoSoDu: true, soBuoiDaTru: deducted };
  });
  return { soBuoiConLai: balance, rows, warnings: [] };
}
