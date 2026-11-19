/**
 * Small formatting helpers every NocoEdu page shares, so a number or a date looks the same everywhere.
 */

/**
 * The balance at or under which a student is warned about and chased for the next term. It mirrors
 * `LOW_BALANCE_THRESHOLD` of the server (`server/edu/so-du.ts`); `tests/client/edu-format.test.ts` fails when they
 * differ, so the badge, the audit page and the "Cần thu" tab never disagree.
 */
export const LOW_BALANCE_THRESHOLD = 2;

export type BalanceBand = 'vuot_goi' | 'sap_het' | 'binh_thuong';

/** `server/edu/can-thu.ts` puts a balance in the same three bands. */
export function balanceBand(balance: number): BalanceBand {
  if (balance < 0) return 'vuot_goi';
  return balance <= LOW_BALANCE_THRESHOLD ? 'sap_het' : 'binh_thuong';
}

/** An amount of money or a count with the thousands separated the Vietnamese way: `1.200.000`. */
export function formatMoney(value: unknown): string {
  const amount = Number(value ?? 0);
  return (Number.isFinite(amount) ? amount : 0).toLocaleString('vi-VN');
}

/** A date or a timestamp as the calendar day `YYYY-MM-DD` (the first ten characters). */
export function formatDay(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).slice(0, 10)
    : '';
}

/**
 * `2026-01-24` as `24/01/2026`, the way a parent reads a date (the notice of a tuition term, "told on …"); anything
 * that does not start with a calendar day is returned as it is.
 */
export function formatDayVn(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}

/** A start time `HH:mm:ss` or `HH:mm` as `HH:mm`. */
export function formatTime(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 5) : '';
}
