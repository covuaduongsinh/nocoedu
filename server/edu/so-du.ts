/**
 * Balance rules of NocoEdu, kept free of any database access so the four attendance cases can be tested on their own.
 *
 * Attendance status → sessions deducted from the balance:
 * - `co_mat` (present): 1
 * - `vang_khong_phep` (absent without leave): 1
 * - `vang_co_phep` (excused absence): 0, or 1 when the branch sets `truBuoiVangCoPhep`
 * - `hoc_bu` (make-up session): 1 when the branch does not deduct an excused absence, otherwise 0 — the pairing that
 *   keeps an excused absence followed by a make-up from costing nothing or twice (see `.nb-studio/memory/hoc-bu-tru-buoi.md`).
 */
export const ATTENDANCE_STATUSES = [
  'co_mat',
  'vang_co_phep',
  'vang_khong_phep',
  'hoc_bu',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** A student with this many sessions left or fewer is warned about. */
export const LOW_BALANCE_THRESHOLD = 2;

export function sessionsToDeduct(
  status: AttendanceStatus,
  excusedAbsenceDeducts: boolean,
): number {
  switch (status) {
    case 'co_mat':
    case 'vang_khong_phep':
      return 1;
    case 'vang_co_phep':
      return excusedAbsenceDeducts ? 1 : 0;
    case 'hoc_bu':
      return excusedAbsenceDeducts ? 0 : 1;
  }
}

export const isLowBalance = (balance: number): boolean =>
  balance <= LOW_BALANCE_THRESHOLD;

/** A boolean column as read back from SQLite (0/1) or PostgreSQL (true/false). */
export function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/**
 * The weekday number used by `eduLopLich.thu`: 2 = Monday … 7 = Saturday, 8 = Sunday (Vietnamese convention).
 * `date` is `YYYY-MM-DD`; computed in UTC so no time zone moves it.
 */
export function weekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 8 : day + 1;
}

/** Every date from `from` to `to` (inclusive, both `YYYY-MM-DD`). */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (
    let t = new Date(`${from}T00:00:00Z`).getTime();
    t <= end;
    t += 86_400_000
  ) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

export interface VietQrConfig {
  readonly bankId: string;
  readonly accountNo: string;
  readonly accountName: string;
}

/** Bank details come from the environment only; no account number is written in the code or the repository. */
export function vietQrConfig(
  env: Readonly<Record<string, string | undefined>>,
): VietQrConfig | null {
  const bankId = env.EDU_VIETQR_BANK_ID?.trim();
  const accountNo = env.EDU_VIETQR_ACCOUNT_NO?.trim();
  const accountName = env.EDU_VIETQR_ACCOUNT_NAME?.trim() ?? '';
  return bankId && accountNo ? { bankId, accountNo, accountName } : null;
}

/** The image address of a VietQR transfer code (the public vietqr.io image service). */
export function vietQrUrl(
  config: VietQrConfig,
  amount: number,
  content: string,
): string {
  const query = new URLSearchParams({
    amount: String(amount),
    addInfo: content,
  });
  if (config.accountName) query.set('accountName', config.accountName);
  return `https://img.vietqr.io/image/${encodeURIComponent(config.bankId)}-${encodeURIComponent(config.accountNo)}-compact2.png?${query.toString()}`;
}
