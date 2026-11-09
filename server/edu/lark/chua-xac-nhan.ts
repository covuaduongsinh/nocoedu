import type { AttendanceStatus } from '../so-du.js';
import type { LevelKey } from '../levels.js';

/**
 * Every rule of the Lark import that the club's head coach has NOT confirmed yet (DS-60 phase 2). The numbers are the
 * questions asked on the issue; each constant holds the default that was built in. When an answer arrives, change the
 * constant here (and `.nb-studio/memory/lark-giai-doan-2-mac-dinh.md`): no migration is involved.
 */

/** Question 1 — attendance before this date is read from the Base, from it on from the Sheets (`YYYY-MM-DD`). */
export const SHEETS_FROM_DATE = '2026-01-01';

/**
 * Question 2 — in a Sheets class column (`T3`, `T2 CA1` …) the cell `1` means "the student belongs to this slot".
 * Any other mark means "does not belong"; the import counts these cells and reports them.
 */
export const SHEETS_CA_CODES = {
  belongs: ['1'],
  notBelongs: ['x', '!', '?', '-'],
} as const;

/**
 * Questions 3 and 4 — the "present" cell of the Base and the Sheets → attendance status. Keys are compared after
 * trimming and lower-casing. A value missing here (a coach's name, say) is an error, never a guess.
 */
export const ATTENDANCE_CODES: Readonly<Record<string, AttendanceStatus>> = {
  '1': 'co_mat',
  '0': 'vang_khong_phep',
  false: 'vang_khong_phep',
  x: 'vang_co_phep',
  'xin nghỉ': 'vang_co_phep',
  'học lớp 2': 'hoc_bu',
};

/** Question 5 — the opening package is the balance written on the student on the cut-off date; only later sessions deduct. */
export const OPENING_BALANCE_RULE = {
  deductAfterCutoffOnly: true,
  noOpeningBalanceCode: 'KHONG_CO_SO_DU',
} as const;

/** Question 6 — the level written on Lark → level key. Anything else (`Test`, empty) is an error. */
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

/** Question 8 — which branch a Sheets file belongs to (`ma` of the branch). */
export const SHEETS_BRANCH: Readonly<Record<string, string>> = {
  KL357: 'KL',
  VP26: 'VP',
};

/** Question 9 — "Quan hệ" on the student table → `eduHocVienPhuHuynh.quanHe`. */
export const RELATION_CODES: Readonly<Record<string, string>> = {
  mẹ: 'me',
  bố: 'bo',
  'ông/ bà': 'khac',
  'ông/bà': 'khac',
};

/** Question 10 — the free-text "Ghi chú" of a student may hold sensitive details: not imported. */
export const IMPORT_STUDENT_NOTE = false;

/** Question 12 — the three "trial" states of Lark become one status; the rest keep their meaning. */
export const STATUS_CODES: Readonly<Record<string, string>> = {
  'đang học': 'dang_hoc',
  'đã nghỉ': 'da_nghi',
  'tạm nghỉ': 'tam_nghi',
  'mới học thử': 'hoc_thu',
  'đăng ký học thử': 'hoc_thu',
  'chưa học thử': 'hoc_thu',
};

/** Question 13 — the mindfulness score is an integer from 0 to this value; anything else is left empty. */
export const Y_THUC_MAX = 10;

/** Question 14 — does an excused absence deduct a session, per branch `ma`. Missing branch: `false`. */
export const BRANCH_EXCUSED_DEDUCTS: Readonly<Record<string, boolean>> = {
  KL: false,
  VP: false,
};
