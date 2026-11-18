/**
 * The periods of the attendance register. Days are `YYYY-MM-DD` text of the club's calendar (Vietnam), worked out with
 * UTC arithmetic on the numbers of the date, never from the browser's local time or `toISOString()` of a local date, so
 * "today", "this week" and the arrows give the same days in every time zone.
 */

export const PERIOD_KINDS = [
  'homNay',
  'tuan',
  'thang',
  'nam',
  'tuyChon',
] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export interface Period {
  readonly from: string;
  readonly to: string;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

const parts = (day: string): [number, number, number] => {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return [y, m, d];
};

const format = (date: Date): string =>
  `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const utc = (day: string): Date => {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d));
};

export const isDay = (value: string | null | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [y, m, d] = parts(value);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
};

export function addDays(day: string, days: number): string {
  const date = utc(day);
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
}

/** `day` moved by whole months, the day of the month kept as far as the target month allows (31 Jan + 1 → 28/29 Feb). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = parts(day);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${pad(year, 4)}-${pad(month + 1)}-${pad(Math.min(d, last))}`;
}

/** Days from `from` to `to`, both counted. */
export function spanDays(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000) + 1;
}

/** The period of this kind that holds `anchor`: a week is Monday to Sunday, a month and a year are the calendar ones. */
export function periodOf(
  kind: Exclude<PeriodKind, 'tuyChon'>,
  anchor: string,
): Period {
  switch (kind) {
    case 'homNay':
      return { from: anchor, to: anchor };
    case 'tuan': {
      const weekday = utc(anchor).getUTCDay() || 7; // Monday = 1 … Sunday = 7
      const monday = addDays(anchor, 1 - weekday);
      return { from: monday, to: addDays(monday, 6) };
    }
    case 'thang': {
      const [y, m] = parts(anchor);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return {
        from: `${pad(y, 4)}-${pad(m)}-01`,
        to: `${pad(y, 4)}-${pad(m)}-${pad(last)}`,
      };
    }
    case 'nam': {
      const [y] = parts(anchor);
      return { from: `${pad(y, 4)}-01-01`, to: `${pad(y, 4)}-12-31` };
    }
  }
}

/** The day to anchor the previous (`-1`) or next (`1`) period of this kind. */
export function shiftAnchor(
  kind: Exclude<PeriodKind, 'tuyChon'>,
  anchor: string,
  direction: -1 | 1,
): string {
  switch (kind) {
    case 'homNay':
      return addDays(anchor, direction);
    case 'tuan':
      return addDays(anchor, 7 * direction);
    case 'thang':
      return addMonths(anchor, direction);
    case 'nam':
      return addMonths(anchor, 12 * direction);
  }
}

/** A custom period moved by its own length. */
export function shiftCustom(period: Period, direction: -1 | 1): Period {
  const length = spanDays(period.from, period.to);
  return {
    from: addDays(period.from, length * direction),
    to: addDays(period.to, length * direction),
  };
}

/** `2026-11-18` → `18/11/2026`, how a person reads a date here. */
export const displayDay = (day: string): string => {
  const [y, m, d] = parts(day);
  return `${pad(d)}/${pad(m)}/${pad(y, 4)}`;
};

/** Every day from `from` to `to` (both included), for a filter on a text date. */
export function daysIn(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}
