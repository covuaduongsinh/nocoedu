import { LEVEL_KEYS, levelOrder } from './levels.js';
import { normalizePhone } from './names.js';

/**
 * Checks the values of a standard `updateOne` before it reaches the repository (DS-60 PR 4). The generated route
 * only limits which fields may be written; it does not check what they hold. A pure function so it is tested without
 * a database. Returns the first problem as `{ field, reason }`, or `undefined` when the values are fine.
 */
export interface Problem {
  readonly field: string;
  readonly reason:
    'EDU_INVALID_VALUE' | 'EDU_INVALID_STATUS' | 'EDU_INVALID_PHONE';
}

/** The statuses a record may be set to by hand. "Delete" of a branch, a class or a student is one of these. */
export const STATUSES = {
  coSo: ['hoat_dong', 'tam_dung'],
  lop: ['dang_mo', 'da_dong'],
  hocVien: ['dang_hoc', 'tam_nghi', 'da_nghi', 'hoc_thu'],
} as const;

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isOptionalText = (value: unknown, max: number): boolean =>
  value === null || (typeof value === 'string' && value.length <= max);

/** A phone number is stored as it is normalised: ten digits starting with 0 (eight to ten digits after the 0). */
export function isStoredPhone(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    normalizePhone(value) === value &&
    /^0\d{8,10}$/u.test(value)
  );
}

export function checkUpdate(
  name: 'coSo' | 'lop' | 'hocVien' | 'phuHuynh',
  values: Readonly<Record<string, unknown>>,
  now: Date = new Date(),
): Problem | undefined {
  const invalid = (field: string): Problem => ({
    field,
    reason: 'EDU_INVALID_VALUE',
  });
  const has = (field: string): boolean => field in values;
  const status = (field = 'trangThai'): Problem | undefined =>
    has(field) &&
    !(STATUSES[name as keyof typeof STATUSES] as readonly unknown[]).includes(
      values[field],
    )
      ? { field, reason: 'EDU_INVALID_STATUS' }
      : undefined;

  if (name === 'coSo') {
    if (has('ma') && !isText(values.ma, 32)) return invalid('ma');
    if (has('ten') && !isText(values.ten, 191)) return invalid('ten');
    if (has('diaChi') && !isOptionalText(values.diaChi, 500))
      return invalid('diaChi');
    if (
      has('truBuoiVangCoPhep') &&
      typeof values.truBuoiVangCoPhep !== 'boolean'
    )
      return invalid('truBuoiVangCoPhep');
    return status();
  }
  if (name === 'lop') {
    if (has('ma') && !isText(values.ma, 32)) return invalid('ma');
    if (has('ten') && !isText(values.ten, 191)) return invalid('ten');
    if (has('levelKey') || has('levelOrder')) {
      // The two move together, so a class never holds a key and an order that disagree.
      const key = values.levelKey;
      if (
        typeof key !== 'string' ||
        !(LEVEL_KEYS as readonly string[]).includes(key) ||
        values.levelOrder !== levelOrder(key)
      )
        return invalid('levelKey');
    }
    return status();
  }
  if (name === 'hocVien') {
    if (has('hoTen') && !isText(values.hoTen, 191)) return invalid('hoTen');
    if (
      has('namSinh') &&
      !(
        Number.isInteger(values.namSinh) &&
        (values.namSinh as number) >= 1950 &&
        (values.namSinh as number) <= now.getFullYear()
      )
    )
      return invalid('namSinh');
    if (has('ghiChuHlv') && !isOptionalText(values.ghiChuHlv, 2000))
      return invalid('ghiChuHlv');
    return status();
  }
  if (has('hoTen') && !isText(values.hoTen, 191)) return invalid('hoTen');
  if (has('soDienThoai') && !isStoredPhone(values.soDienThoai))
    return { field: 'soDienThoai', reason: 'EDU_INVALID_PHONE' };
  if (has('zalo') && !isOptionalText(values.zalo, 64)) return invalid('zalo');
  if (has('ghiChu') && !isOptionalText(values.ghiChu, 1000))
    return invalid('ghiChu');
  return undefined;
}
