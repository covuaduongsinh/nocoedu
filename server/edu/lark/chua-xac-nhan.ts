import type { AttendanceStatus } from '../so-du.js';
import type { LevelKey } from '../levels.js';

/**
 * The rules of the Lark import (DS-60 phase 2). The head coach answered the open questions on the issue
 * (comment `396805820907520`, 2026-11-09); each constant says whether it is CONFIRMED by that answer or still a
 * DEFAULT taken from the recommendation. The numbers are the question numbers. When an answer changes, change the
 * constant here (and `.nb-studio/memory/lark-giai-doan-2-mac-dinh.md`): no migration is involved.
 */

/**
 * CONFIRMED, questions 1–2 — the Base is the only source of attendance, for every year. A Sheets file is only a list
 * of who registered or is expected (`1` registered, `!`/`?` expected or trial, `x` told about a sudden absence);
 * only a student marked `1` in the "present" column attends and is entered in the Base. Attendance is therefore never
 * imported from the Sheets.
 */
export const ATTENDANCE_SOURCE = 'base' as const;

/**
 * CONFIRMED, questions 3 and 4 — the "present" cell of the Base → attendance status. `1` present, `0` absent: Lark does
 * not tell an excused absence from an unexcused one, so every `0` is `vang_khong_phep`, which deducts nothing for now
 * (see `unexcusedAbsenceDeducts`). Keys are compared after trimming and lower-casing.
 *
 * Anything else is `DIEM_DANH_KHONG_RO`: a coach's name, and also "học lớp 2", which is the age of the student (the
 * second school grade), NOT a make-up session — it must be reviewed by a person, deducts nothing, and the school
 * grade is never stored (knowledge document 05).
 */
export const ATTENDANCE_CODES: Readonly<Record<string, AttendanceStatus>> = {
  '1': 'co_mat',
  '0': 'vang_khong_phep',
  false: 'vang_khong_phep',
};

/**
 * CONFIRMED, question 5 — balance = sessions paid − sessions attended. The payment table cannot be read, so the opening
 * package is the balance written on the student on the cut-off date ("số buổi tồn update" at "Ngày update gần nhất về
 * HP"); only sessions after that date deduct.
 */
export const OPENING_BALANCE_RULE = {
  deductAfterCutoffOnly: true,
  noOpeningBalanceCode: 'KHONG_CO_SO_DU',
} as const;

/** CONFIRMED, question 6 — the level written on Lark → level key. Anything else (`Test`, empty) is an error. */
export const LEVEL_CODES: Readonly<Record<string, LevelKey>> = {
  nm1: 'tot',
  nm2: 'tot',
  tốt: 'tot',
  mã: 'ma',
  tượng: 'tuong',
  xe: 'xe',
  hậu: 'hau',
  vua: 'vua',
};

/** DEFAULT, question 7 — a class has no level on Lark; `classLevel()` takes the most common level of its students. */

/** CONFIRMED, question 8 — which branch a Sheets file belongs to (`ma` of the branch). */
export const SHEETS_BRANCH: Readonly<Record<string, string>> = {
  KL357: 'KL',
  VP26: 'VP',
};

/** CONFIRMED, question 9 — "Quan hệ" on the student table → `eduHocVienPhuHuynh.quanHe`. */
export const RELATION_CODES: Readonly<Record<string, string>> = {
  mẹ: 'me',
  bố: 'bo',
  'ông/ bà': 'khac',
  'ông/bà': 'khac',
};

/** DEFAULT, question 10 — the free-text "Ghi chú" of a student may hold sensitive details: not imported. */
export const IMPORT_STUDENT_NOTE = false;

/** CONFIRMED, question 11 — the old student code is kept in `externalCode`; a new code is made the way NocoEdu does. */
export const KEEP_OLD_STUDENT_CODE = true;

/** DEFAULT, question 12 — the three "trial" states of Lark become one status; the rest keep their meaning. */
export const STATUS_CODES: Readonly<Record<string, string>> = {
  'đang học': 'dang_hoc',
  'đã nghỉ': 'da_nghi',
  'tạm nghỉ': 'tam_nghi',
  'mới học thử': 'hoc_thu',
  'đăng ký học thử': 'hoc_thu',
  'chưa học thử': 'hoc_thu',
};

/** CONFIRMED, question 13 — the mindfulness score is an integer from 0 to 10; anything else is left empty. */
export const Y_THUC_MAX = 10;

/**
 * CONFIRMED, question 14 — an absence is not deducted yet. An excused absence follows the branch setting
 * (`eduCoSo.truBuoiVangCoPhep`, default off); an unexcused one follows `EDU_TRU_BUOI_VANG_KHONG_PHEP` (default off).
 * Per branch `ma`; a missing branch is `false`.
 */
export const BRANCH_EXCUSED_DEDUCTS: Readonly<Record<string, boolean>> = {
  KL: false,
  VP: false,
};

/** CONFIRMED, question 15 — the full date of birth is kept (`eduHocVien.ngaySinh`) next to the birth year. */
export const KEEP_FULL_BIRTH_DATE = true;
