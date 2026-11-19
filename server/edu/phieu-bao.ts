import type { Queryable } from './balance.js';
import { asText } from './names.js';
import { chunksOf } from './read-all.js';

/**
 * "Was the parent told?" (docs/plans/2026-11-19-ke-hoach-phieu-bao-ky-hoc-phi.md, phase 2).
 *
 * `eduPhieuBao` is a log: a row each time a person marks that the notice of a tuition term was sent. A student is chased
 * once per term, so a mark counts only for **the term the student is on now**: the mark that names the student's
 * latest package in effect. When the parent pays and a new package is sold, the latest package changes and the student
 * is "not told yet" again the next time they run out, without anybody clearing anything.
 *
 * The table has no permission of its own. It is read and written by the ids of students the caller's `edu.hocVien`
 * policy returned, by a caller who holds the tuition actions (`edu.thanhToan`, `edu.goiHoc`), the same pattern as
 * `eduNopSach` and `rowsForStudents` of the audit page.
 */
export interface PackageLike {
  readonly id?: unknown;
  readonly ngayMua?: unknown;
  readonly trangThai?: unknown;
}

export interface NoticeLike {
  readonly id?: unknown;
  readonly goiHocId?: unknown;
  readonly ngay?: unknown;
}

export interface NoticeMark {
  readonly id: number;
  readonly ngay: string;
}

const numberOrNull = (value: unknown): number | null =>
  value == null ? null : Number(value);

/**
 * The package of the term a student is on: the last one in effect, in the order the allocation uses (`ngayMua`, then
 * id). `null` for a student without a package in effect.
 */
export function latestPackageId(
  packages: readonly PackageLike[],
): number | null {
  let latest: PackageLike | null = null;
  for (const pack of packages) {
    if (asText(pack.trangThai) !== 'hieu_luc') continue;
    if (
      latest === null ||
      asText(pack.ngayMua) > asText(latest.ngayMua) ||
      (asText(pack.ngayMua) === asText(latest.ngayMua) &&
        Number(pack.id) > Number(latest.id))
    )
      latest = pack;
  }
  return latest === null ? null : Number(latest.id);
}

/** The newest mark that names the term the student is on; `null` when the parent was not told for this term. */
export function currentMark(
  notices: readonly NoticeLike[],
  packageId: number | null,
): NoticeMark | null {
  let newest: NoticeLike | null = null;
  for (const notice of notices) {
    if (numberOrNull(notice.goiHocId) !== packageId) continue;
    if (
      newest === null ||
      asText(notice.ngay) > asText(newest.ngay) ||
      (asText(notice.ngay) === asText(newest.ngay) &&
        Number(notice.id) > Number(newest.id))
    )
      newest = notice;
  }
  return newest === null
    ? null
    : { id: Number(newest.id), ngay: asText(newest.ngay) };
}

/**
 * For each of these students, the mark of the term they are on (or `null`). The ids must be ones a student policy
 * returned: the two tables are read by them, without a policy of their own.
 */
export async function readCurrentMarks(
  connection: Queryable,
  studentIds: readonly number[],
): Promise<Map<number, NoticeMark | null>> {
  const packages = new Map<number, PackageLike[]>();
  const notices = new Map<number, NoticeLike[]>();
  const push = <T>(map: Map<number, T[]>, key: number, row: T): void => {
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  };
  for (const part of chunksOf([...new Set(studentIds)], 200)) {
    const [packRows, noticeRows] = await Promise.all([
      connection.query
        .selectFrom('eduGoiHoc')
        .select(['id', 'hocVienId', 'ngayMua', 'trangThai'])
        .where('hocVienId', 'in', part)
        .execute(),
      connection.query
        .selectFrom('eduPhieuBao')
        .select(['id', 'hocVienId', 'goiHocId', 'ngay'])
        .where('hocVienId', 'in', part)
        .execute(),
    ]);
    for (const row of packRows) push(packages, Number(row.hocVienId), row);
    for (const row of noticeRows) push(notices, Number(row.hocVienId), row);
  }
  return new Map(
    studentIds.map((id) => [
      id,
      currentMark(
        notices.get(id) ?? [],
        latestPackageId(packages.get(id) ?? []),
      ),
    ]),
  );
}
