import type { RepositoryPolicy } from '@nocobase/db';
import { buildFilter, buildSort } from '@nocobase/repository-input';

import { asText } from './names.js';
import { LOW_BALANCE_THRESHOLD } from './so-du.js';

/**
 * Who has to pay the next term, in one place. The "Cần thu" tab of the tuition page, the counters of the audit page and
 * the warning of the home page all ask this module, so they count the same students with the same threshold
 * (`LOW_BALANCE_THRESHOLD`, defined with the balance rules in `so-du.ts`).
 *
 * - `vuot_goi`: the balance is below zero (the student attended more than they paid for).
 * - `sap_het`: 0 up to `LOW_BALANCE_THRESHOLD` sessions left.
 * - `binh_thuong`: more than that.
 *
 * A student needs collecting when they are studying (`dang_hoc`) and are not `binh_thuong`; a student who left is not
 * chased for a next term.
 */
export type BalanceBand = 'vuot_goi' | 'sap_het' | 'binh_thuong';

export function balanceBand(balance: number): BalanceBand {
  if (balance < 0) return 'vuot_goi';
  return balance <= LOW_BALANCE_THRESHOLD ? 'sap_het' : 'binh_thuong';
}

interface StudentLike {
  readonly soBuoiConLai?: unknown;
  readonly trangThai?: unknown;
}

export const isStudying = (student: StudentLike): boolean =>
  asText(student.trangThai) === 'dang_hoc';

export const needsCollection = (student: StudentLike): boolean =>
  isStudying(student) &&
  balanceBand(Number(student.soBuoiConLai ?? 0)) !== 'binh_thuong';

type Row = Record<string, unknown>;

interface StudentReader {
  repository(name: string): { withPolicy(policy: RepositoryPolicy): unknown };
}

/**
 * One page of the students who need collecting, worst balance first, with the total (the page of the policy decides
 * which students are visible: a branch manager gets their branches).
 */
export async function readNeedCollection(
  database: StudentReader,
  policy: RepositoryPolicy,
  page: { readonly limit: number; readonly offset: number },
): Promise<{ rows: Row[]; total: number }> {
  const students = database.repository('eduHocVien').withPolicy(policy) as {
    findMany(input: unknown): Promise<Row[]>;
    count(input: unknown): Promise<number>;
  };
  const filter = buildFilter((f) =>
    f.and([
      f.string('trangThai').eq('dang_hoc'),
      f.number('soBuoiConLai').lte(LOW_BALANCE_THRESHOLD),
    ]),
  );
  const sort = buildSort((s) => s.field('soBuoiConLai').asc());
  const [rows, total] = await Promise.all([
    students.findMany({ filter, sort, limit: page.limit, offset: page.offset }),
    students.count({ filter }),
  ]);
  return { rows, total: Number(total) || 0 };
}
