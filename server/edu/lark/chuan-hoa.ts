import { normalizePhone } from '../names.js';
import type { LevelKey } from '../levels.js';
import {
  LEVEL_CODES,
  RELATION_CODES,
  STATUS_CODES,
  Y_THUC_MAX,
} from './chua-xac-nhan.js';

/** A conversion either gives a value or a stable error code the dry run reports; nothing is guessed. */
export type Converted<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string };

const ok = <T>(value: T): Converted<T> => ({ ok: true, value });
const fail = (code: string): Converted<never> => ({ ok: false, code });

const key = (raw: unknown): string =>
  typeof raw === 'string' || typeof raw === 'number'
    ? String(raw).normalize('NFC').trim().toLowerCase()
    : '';

/** "  nguyễn   văn an " → "Nguyễn Văn An": Unicode NFC, single spaces, each word capitalized. */
export function normalizeFullName(raw: string): string {
  return raw
    .normalize('NFC')
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => {
      const [first = '', ...rest] = [...word.toLocaleLowerCase('vi')];
      return `${first.toLocaleUpperCase('vi')}${rest.join('')}`;
    })
    .join(' ');
}

/** A Vietnamese mobile number as ten digits (`0` + 9 digits, prefix 03/05/07/08/09); anything else is `SDT_SAI`. */
export function toVnMobile(raw: unknown): Converted<string> {
  if (typeof raw !== 'string' && typeof raw !== 'number')
    return fail('SDT_SAI');
  const phone = normalizePhone(String(raw));
  return /^0[35789]\d{8}$/u.test(phone) ? ok(phone) : fail('SDT_SAI');
}

/** The birth year in the club's calendar (UTC+7) of a Lark date (milliseconds since the epoch). */
export function birthYearVn(milliseconds: number): Converted<number> {
  if (!Number.isFinite(milliseconds)) return fail('NGAY_SINH_SAI');
  const year = new Date(milliseconds + 7 * 3_600_000).getUTCFullYear();
  return year >= 1950 && year <= new Date().getUTCFullYear()
    ? ok(year)
    : fail('NGAY_SINH_SAI');
}

export function levelFromLark(raw: unknown): Converted<LevelKey> {
  const level = LEVEL_CODES[key(raw)];
  return level ? ok(level) : fail('CAP_KHONG_RO');
}

export function relationFromLark(raw: unknown): Converted<string> {
  const relation = RELATION_CODES[key(raw)];
  return relation ? ok(relation) : fail('QUAN_HE_KHONG_RO');
}

export function statusFromLark(raw: unknown): Converted<string> {
  const status = STATUS_CODES[key(raw)];
  return status ? ok(status) : fail('TRANG_THAI_KHONG_RO');
}

/** The mindfulness score: an integer 0–`Y_THUC_MAX`; `0p`, "Xin nghỉ" or any other text → empty (`null`). */
export function mindfulnessScore(raw: unknown): number | null {
  const text = key(raw);
  if (!/^\d{1,2}$/u.test(text)) return null;
  const score = Number(text);
  return score <= Y_THUC_MAX ? score : null;
}

/** The most common level among a class's students; a tie takes the lower level; an empty class is `tot`. */
export function classLevel(
  studentLevels: readonly LevelKey[],
  order: readonly LevelKey[],
): LevelKey {
  const counts = new Map<LevelKey, number>();
  for (const level of studentLevels)
    counts.set(level, (counts.get(level) ?? 0) + 1);
  let best: LevelKey = order[0] ?? 'tot';
  let bestCount = 0;
  for (const level of order) {
    const count = counts.get(level) ?? 0;
    if (count > bestCount) {
      best = level;
      bestCount = count;
    }
  }
  return best;
}
