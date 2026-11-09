import type { AttendanceStatus } from '../so-du.js';
import { ATTENDANCE_CODES } from './chua-xac-nhan.js';
import type { Converted } from './chuan-hoa.js';

const normalize = (raw: unknown): string =>
  typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
    ? String(raw).normalize('NFC').trim().toLowerCase()
    : '';

/**
 * The "present" cell of the Base → attendance status. Only `1` and `0` (or `FALSE`) are known; any other value — a
 * coach's name, "học lớp 2" (the student's school grade, not a make-up session) — is `DIEM_DANH_KHONG_RO`.
 * The Sheets are not a source of attendance (see `ATTENDANCE_SOURCE`), so there is no reader for them.
 */
export function attendanceFromCode(raw: unknown): Converted<AttendanceStatus> {
  const status = ATTENDANCE_CODES[normalize(raw)];
  return status
    ? { ok: true, value: status }
    : { ok: false, code: 'DIEM_DANH_KHONG_RO' };
}
