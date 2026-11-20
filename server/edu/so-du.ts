/**
 * Balance rules of NocoEdu, kept free of any database access so the attendance cases can be tested on their own.
 *
 * Balance = sessions paid − sessions attended. Attendance status → sessions deducted from the balance:
 * - `co_mat` (present): 1
 * - `vang_co_phep` (excused absence): 0, or 1 when the branch sets `truBuoiVangCoPhep`
 * - `vang_khong_phep` (absent without leave): 0 until the branch deducts it — from the day in
 *   `eduCoSo.truVangKhongPhepTuNgay` on (`unexcusedAbsenceDeductsOn`), or everywhere with
 *   `EDU_TRU_BUOI_VANG_KHONG_PHEP=true`. The head coach decided (DS-60, 09/11/2026) not to deduct it yet and (20/11/2026)
 *   to deduct it from a day of his choosing.
 * - `hoc_bu` (make-up session): 1 when the branch does not deduct an excused absence, otherwise 0 — the pairing that
 *   keeps an excused absence followed by a make-up from costing nothing or twice (see `.nb-studio/memory/hoc-bu-tru-buoi.md`).
 *   A make-up after an absence without leave is deducted like any other (a make-up makes up an excused absence only).
 * - `hoc_thu` (trial session) and `tang` (session given for free): the student is present and nothing is deducted,
 *   whatever the branch setting, so the session belongs to no term (20/11/2026,
 *   `docs/plans/2026-11-20-ke-hoach-hoc-thu-buoi-tang-vang-khong-phep.md`).
 */
export const ATTENDANCE_STATUSES = [
  'co_mat',
  'vang_co_phep',
  'vang_khong_phep',
  'hoc_bu',
  'hoc_thu',
  'tang',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** The statuses in which the student sat in the session: attendance rates, monthly comments, skills learned. */
export const PRESENT_STATUSES = [
  'co_mat',
  'hoc_bu',
  'hoc_thu',
  'tang',
] as const;
/** The statuses of an absence. */
export const ABSENT_STATUSES = ['vang_co_phep', 'vang_khong_phep'] as const;
/** Present, and never deducted: they are not part of any term. */
export const FREE_STATUSES = ['hoc_thu', 'tang'] as const;

export const isPresentStatus = (status: string): boolean =>
  (PRESENT_STATUSES as readonly string[]).includes(status);

/** A student with this many sessions left or fewer is warned about. */
export const LOW_BALANCE_THRESHOLD = 2;

/** Whether an absence without leave deducts a session everywhere: off by default, on with `EDU_TRU_BUOI_VANG_KHONG_PHEP=true`. */
export function unexcusedAbsenceDeducts(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return env.EDU_TRU_BUOI_VANG_KHONG_PHEP?.trim().toLowerCase() === 'true';
}

/** A calendar day `YYYY-MM-DD` that exists (`2026-02-30` does not). */
export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
    return false;
  const day = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value
  );
}

/**
 * Whether an absence without leave in a session held on `sessionDay` deducts a session: everywhere when the variable is
 * on, otherwise from the day the branch set (`eduCoSo.truVangKhongPhepTuNgay`, empty = never). Called once per session,
 * at the first save of its register, and the answer is then fixed on the session (`lockSessionRule`).
 */
export function unexcusedAbsenceDeductsOn(
  sessionDay: string,
  branchFromDay: unknown,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  if (unexcusedAbsenceDeducts(env)) return true;
  return isCalendarDay(branchFromDay) && sessionDay >= branchFromDay;
}

export function sessionsToDeduct(
  status: AttendanceStatus,
  excusedAbsenceDeducts: boolean,
  unexcusedAbsenceDeduct = false,
): number {
  switch (status) {
    case 'co_mat':
      return 1;
    case 'vang_khong_phep':
      return unexcusedAbsenceDeduct ? 1 : 0;
    case 'vang_co_phep':
      return excusedAbsenceDeducts ? 1 : 0;
    case 'hoc_bu':
      return excusedAbsenceDeducts ? 0 : 1;
    case 'hoc_thu':
    case 'tang':
      return 0;
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

/**
 * The image address of a VietQR transfer code (the public vietqr.io image service).
 *
 * `png` is the address an `<img>` shows (the cashier). `svg` is the one a page may `fetch` to draw the code into a
 * picture of its own (the tuition notice): for a browser the service redirects `.png` to `.svg`, and that redirect
 * carries no CORS header, so a `fetch` of the `.png` address is refused while the `.svg` address answers any origin
 * (checked 19/11/2026).
 */
export function vietQrUrl(
  config: VietQrConfig,
  amount: number,
  content: string,
  format: 'png' | 'svg' = 'png',
): string {
  const query = new URLSearchParams({
    amount: String(amount),
    addInfo: content,
  });
  if (config.accountName) query.set('accountName', config.accountName);
  return `https://img.vietqr.io/image/${encodeURIComponent(config.bankId)}-${encodeURIComponent(config.accountNo)}-compact2.${format}?${query.toString()}`;
}

/** Today in Vietnam (UTC+7) as `YYYY-MM-DD`: the club's calendar day, whatever the server's time zone. */
export function todayVn(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** `date` moved by `days` (negative goes back); `YYYY-MM-DD` in, `YYYY-MM-DD` out. */
export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
