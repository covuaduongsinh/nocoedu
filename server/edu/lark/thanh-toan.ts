import type { DatabaseManager } from '@nocobase/db';

import { asText } from '../names.js';
import { dateVn, linkIds, numberOf } from './gia-tri.js';
import type { LarkData } from './nguon.js';

type Query = ReturnType<DatabaseManager['connection']>['query'];

/**
 * The money of the club (DS-61 phase B): the tuition of `Tổng Deal (HP + book)`, one `eduThanhToan` row per payment.
 *
 * - Only the tuition (`Học phí`) is imported here. Books and "other" go with the book fund (phase E); a row with no
 *   tuition gives no payment.
 * - A payment belongs to a student (`Tên HS link`), to a package of his, and to the branch of the student. Lark does not
 *   say whether it was cash or a transfer, so `hinhThuc` is `khong_ro` (unknown), never a guess.
 * - The package is a bookkeeping link only: the revenue report adds up `soTien` by month and branch. The rules are in
 *   {@link lapThanhToan} and {@link ghiThanhToan}; the ones the club has not confirmed are listed in `chua-xac-nhan.ts`.
 * - A payment already written (`externalId = lark:tongdeal:<rec>`) is never written again or edited.
 * - Output and log hold counts, Lark record ids and reason codes, never a name; sums are in dong.
 */

export const PAYMENT_METHOD_UNKNOWN = 'khong_ro';

export interface ThanhToanRow {
  /** `lark:tongdeal:<record id>`. */
  readonly externalId: string;
  /** The `HocVien` record id (the external id of the student in NocoEdu). */
  readonly hocVienKey: string;
  /** The `Deal HP` row this payment is for, when Lark or the matching rule says; `null`: the writer picks a package. */
  readonly dealKey: string | null;
  readonly soTien: number;
  /** `YYYY-MM-DD`. */
  readonly ngay: string;
}

export interface ThanhToanProblem {
  readonly id: string;
  readonly code: string;
  /** Tuition of the row in dong: what is left out of the revenue. */
  readonly soTien: number;
}

export interface ThanhToanPlan {
  /** False when the app cannot see `Tổng Deal`: nothing to import (`tongDealDoc`). */
  readonly doc: boolean;
  readonly rows: readonly ThanhToanRow[];
  readonly problems: readonly ThanhToanProblem[];
  readonly warnings: readonly ThanhToanProblem[];
  /** Rows of the table with no tuition (books only, or empty). */
  readonly khongHocPhi: number;
}

export const EMPTY_THANH_TOAN: ThanhToanPlan = {
  doc: false,
  rows: [],
  problems: [],
  warnings: [],
  khongHocPhi: 0,
};

/**
 * Builds the payments from the rows of `Tổng Deal`. `students` are the Lark ids of the students the import holds
 * (new or already in NocoEdu); a payment of anybody else is a problem, never a guess.
 *
 * The `Deal HP` row of a payment: the link `Link với Lần nộp HP` when it has one (15 of 315 rows do); otherwise the
 * `Deal HP` row of the same student, the same day and the same number of sessions that no earlier payment took.
 */
export function lapThanhToan(
  data: Pick<LarkData, 'tongDeal' | 'tongDealDoc' | 'dealHp'>,
  students: ReadonlySet<string>,
): ThanhToanPlan {
  if (!data.tongDealDoc) return EMPTY_THANH_TOAN;

  const dealIds = new Set(data.dealHp.map((record) => record.recordId));
  const dealsByKey = new Map<string, string[]>();
  for (const deal of [...data.dealHp].sort((a, b) =>
    a.recordId.localeCompare(b.recordId),
  )) {
    const student = linkIds(deal.fields['Học viên'])[0];
    const day =
      dateVn(deal.fields['Ngày nộp HP']) ?? dateVn(deal.fields['Ngày bắt đầu']);
    const sessions = numberOf(deal.fields['Số buổi nộp']);
    if (student === undefined || !day || sessions === null) continue;
    const key = `${student}|${day}|${sessions}`;
    dealsByKey.set(key, [...(dealsByKey.get(key) ?? []), deal.recordId]);
  }

  const taken = new Set<string>();
  const rows: ThanhToanRow[] = [];
  const problems: ThanhToanProblem[] = [];
  const warnings: ThanhToanProblem[] = [];
  const seen = new Set<string>();
  let khongHocPhi = 0;

  // Oldest first, then by record id, so that a repeat run matches the same way.
  const ordered = [...data.tongDeal].sort(
    (a, b) =>
      (dateVn(a.fields['Ngày nộp']) ?? '').localeCompare(
        dateVn(b.fields['Ngày nộp']) ?? '',
      ) || a.recordId.localeCompare(b.recordId),
  );
  for (const record of ordered) {
    const f = record.fields;
    const tuition = numberOf(f['Học phí']) ?? 0;
    if (tuition <= 0) {
      khongHocPhi += 1;
      continue;
    }
    const problem = (code: string) =>
      problems.push({ id: record.recordId, code, soTien: tuition });
    if (!Number.isInteger(tuition)) {
      problem('TONG_DEAL_SO_TIEN_SAI');
      continue;
    }
    const student = linkIds(f['Tên HS link'])[0];
    if (student === undefined) {
      problem('TONG_DEAL_THIEU_HOC_VIEN');
      continue;
    }
    if (!students.has(student)) {
      problem('TONG_DEAL_HOC_VIEN_BI_BO');
      continue;
    }
    const day = dateVn(f['Ngày nộp']) ?? dateVn(f['Ngày']);
    if (!day) {
      problem('TONG_DEAL_THIEU_NGAY');
      continue;
    }
    const sessions = numberOf(f['Số buổi nộp']);

    let dealKey: string | null =
      linkIds(f['Link với Lần nộp HP']).find((id) => dealIds.has(id)) ?? null;
    if (dealKey === null && sessions !== null) {
      const candidates = dealsByKey.get(`${student}|${day}|${sessions}`) ?? [];
      dealKey = candidates.find((id) => !taken.has(id)) ?? null;
    }
    if (dealKey !== null) taken.add(dealKey);

    // The same student, day, sessions and amount twice: probably one payment typed twice, but it is the club's money
    // to decide, so both are imported and the second is reported.
    const sameness = `${student}|${day}|${sessions ?? ''}|${tuition}`;
    if (seen.has(sameness))
      warnings.push({
        id: record.recordId,
        code: 'TONG_DEAL_TRUNG_LAP',
        soTien: tuition,
      });
    seen.add(sameness);

    rows.push({
      externalId: `lark:tongdeal:${record.recordId}`,
      hocVienKey: student,
      dealKey,
      soTien: tuition,
      ngay: day,
    });
  }
  return { doc: true, rows, problems, warnings, khongHocPhi };
}

export interface ThanhToanKetQua {
  readonly tao: number;
  readonly trung: number;
  /** Payments left out because the student is not in NocoEdu (never expected: the plan only holds students it imports); `soTien` is what is left out of the revenue. */
  readonly khongCoGoi: readonly { id: string; soTien: number }[];
  /** Payments written with no package to point to (the student has none): they count in `tao` and `tongTien`. */
  readonly khongGan: number;
  /** Sum of the payments written now, in dong. */
  readonly tongTien: number;
}

export const KHONG_GHI_THANH_TOAN: ThanhToanKetQua = {
  tao: 0,
  trung: 0,
  khongCoGoi: [],
  khongGan: 0,
  tongTien: 0,
};

const CHUNK = 50;

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
}

/**
 * Writes the payments inside the transaction of the import, after the packages. A payment points to the package of its
 * `Deal HP` row (`lark:deal:<rec>`); a payment with none, or whose package was not written (a student who keeps an
 * older balance), points to the opening package of the student (`lark:sodu:<student>`), then to his package nearest in
 * time. A student with no package at all gets no payment and is reported.
 */
export async function ghiThanhToan(
  q: Query,
  plan: ThanhToanPlan,
  options: { userId: string },
): Promise<ThanhToanKetQua> {
  if (plan.rows.length === 0) return KHONG_GHI_THANH_TOAN;
  const written = new Set(
    (
      await q
        .selectFrom('eduThanhToan')
        .select('externalId')
        .where('externalId', 'is not', null)
        .execute()
    ).map((row) => asText(row.externalId)),
  );
  const students = new Map<string, { id: number; coSoId: number }>();
  for (const row of await q
    .selectFrom('eduHocVien')
    .select(['id', 'externalId', 'coSoId'])
    .where('externalId', 'is not', null)
    .execute())
    students.set(asText(row.externalId), {
      id: Number(row.id),
      coSoId: Number(row.coSoId),
    });
  const packages = new Map<string, number>();
  const packagesOf = new Map<number, { id: number; ngayMua: string }[]>();
  for (const row of await q
    .selectFrom('eduGoiHoc')
    .select(['id', 'hocVienId', 'externalId', 'ngayMua'])
    .execute()) {
    const id = Number(row.id);
    const key = row.externalId === null ? '' : asText(row.externalId);
    if (key) packages.set(key, id);
    const holder = Number(row.hocVienId);
    packagesOf.set(holder, [
      ...(packagesOf.get(holder) ?? []),
      { id, ngayMua: asText(row.ngayMua) },
    ]);
  }

  let trung = 0;
  let tongTien = 0;
  const khongCoGoi: { id: string; soTien: number }[] = [];
  let khongGan = 0;
  const values: Record<string, unknown>[] = [];
  for (const row of plan.rows) {
    if (written.has(row.externalId)) {
      trung += 1;
      continue;
    }
    const student = students.get(row.hocVienKey);
    const pool = student ? (packagesOf.get(student.id) ?? []) : [];
    const goiHocId =
      (row.dealKey ? packages.get(`lark:deal:${row.dealKey}`) : undefined) ??
      packages.get(`lark:sodu:${row.hocVienKey}`) ??
      [...pool].sort(
        (a, b) =>
          daysBetween(a.ngayMua, row.ngay) - daysBetween(b.ngayMua, row.ngay) ||
          a.id - b.id,
      )[0]?.id;
    if (!student) {
      khongCoGoi.push({
        id: row.externalId.slice('lark:tongdeal:'.length),
        soTien: row.soTien,
      });
      continue;
    }
    // A student with no package at all (his Deal was left out, or he only has an old balance) still has paid: the payment
    // is written with no package, so the revenue is complete; the package is a bookkeeping link only.
    if (goiHocId === undefined) khongGan += 1;
    values.push({
      goiHocId: goiHocId ?? null,
      hocVienId: student.id,
      coSoId: student.coSoId,
      soTien: row.soTien,
      hinhThuc: PAYMENT_METHOD_UNKNOWN,
      ngay: row.ngay,
      thang: row.ngay.slice(0, 7),
      noiDungCk: null,
      nguoiGhiNhanId: options.userId,
      externalId: row.externalId,
    });
    tongTien += row.soTien;
  }
  for (let i = 0; i < values.length; i += CHUNK)
    await q
      .insertInto('eduThanhToan')
      .values(values.slice(i, i + CHUNK))
      .execute();
  return { tao: values.length, trung, khongCoGoi, khongGan, tongTien };
}
