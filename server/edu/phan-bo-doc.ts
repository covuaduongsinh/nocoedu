import type { RepositoryPolicy } from '@nocobase/db';
import { buildFilter, buildSort } from '@nocobase/repository-input';

import { asText } from './names.js';
import {
  allocateFifo,
  fromLedger,
  type AllocationResult,
  type PackageInput,
} from './phan-bo-goi.js';
import { todayVn } from './so-du.js';

/**
 * Reads the packages and the balance ledger of one student through the policies of the caller and works out which
 * sessions were deducted from which package (`phan-bo-goi.ts`). The one place that does it: the package detail
 * (`/goiHoc/chiTiet`) and the student file (`/hocVien/hoSo360`) both call it, so they cannot disagree.
 */

type Row = Record<string, unknown>;

interface Queryable {
  query: {
    selectFrom: (table: never) => unknown;
  };
}

interface PolicyReader {
  repository(name: string): { withPolicy(policy: RepositoryPolicy): unknown };
  connection(): Queryable;
}

export interface SessionInfo {
  readonly buoiHocId: number;
  readonly lopId: number;
  readonly ngay: string;
  readonly gioBatDau: string;
  readonly trangThai: string;
}

export interface StudentAllocation {
  readonly packages: readonly Row[];
  /** The session behind each attendance row named by the ledger. */
  readonly sessions: ReadonlyMap<number, SessionInfo>;
  readonly result: AllocationResult;
}

/**
 * The club's calendar day (Vietnam time) of a stored value. A timestamp is read as UTC, so an entry made at 02:00 on
 * the 11th in Hanoi (19:00 on the 10th UTC) belongs to the 11th; a plain `YYYY-MM-DD` is already a calendar day.
 */
export const toDay = (value: unknown): string => {
  if (value instanceof Date) return todayVn(value);
  const raw = asText(value);
  if (raw.length <= 10) return raw;
  const iso = raw.replace(' ', 'T');
  const stamp = new Date(/(?:Z|[+-]\d\d:?\d\d)$/u.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(stamp.getTime()) ? raw.slice(0, 10) : todayVn(stamp);
};

/** Reads every page of a query (the server returns at most 100 rows at a time). */
export async function readAll(
  page: (limit: number, offset: number) => Promise<readonly Row[]>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; offset < 20_000; offset += 100) {
    const batch = await page(100, offset);
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows;
}

/** The session behind each attendance row: day, start time, class and status. */
export async function sessionsOf(
  connection: Queryable,
  attendanceIds: readonly number[],
): Promise<Map<number, SessionInfo>> {
  const q = connection.query as unknown as {
    selectFrom: (table: string) => {
      select: (columns: string[]) => {
        where: (
          column: string,
          op: string,
          value: unknown,
        ) => { execute: () => Promise<Row[]> };
      };
    };
  };
  const result = new Map<number, SessionInfo>();
  for (let i = 0; i < attendanceIds.length; i += 200) {
    const chunk = attendanceIds.slice(i, i + 200);
    const marks = await q
      .selectFrom('eduDiemDanh')
      .select(['id', 'buoiHocId', 'trangThai'])
      .where('id', 'in', chunk)
      .execute();
    const sessionIds = [...new Set(marks.map((row) => Number(row.buoiHocId)))];
    if (sessionIds.length === 0) continue;
    const sessions = await q
      .selectFrom('eduBuoiHoc')
      .select(['id', 'lopId', 'ngay', 'gioBatDau'])
      .where('id', 'in', sessionIds)
      .execute();
    const byId = new Map(sessions.map((row) => [Number(row.id), row]));
    for (const mark of marks) {
      const session = byId.get(Number(mark.buoiHocId));
      result.set(Number(mark.id), {
        buoiHocId: Number(mark.buoiHocId),
        lopId: Number(session?.lopId),
        ngay: asText(session?.ngay),
        gioBatDau: asText(session?.gioBatDau),
        trangThai: asText(mark.trangThai),
      });
    }
  }
  return result;
}

export async function loadAllocation(
  database: PolicyReader,
  hocVienId: number,
  packagePolicy: RepositoryPolicy,
  ledgerPolicy: RepositoryPolicy,
): Promise<StudentAllocation> {
  const filter = buildFilter((f) => f.number('hocVienId').eq(hocVienId));
  const sort = buildSort((s) => s.field('id').asc());
  const read = (name: string, policy: RepositoryPolicy) =>
    readAll(async (limit, offset) =>
      (
        database.repository(name).withPolicy(policy) as {
          findMany(input: unknown): Promise<Row[]>;
        }
      ).findMany({ filter, sort, limit, offset }),
    );
  const packages = await read('eduGoiHoc', packagePolicy);
  const ledger = await read('eduSoDuNhatKy', ledgerPolicy);
  const attendanceIds = [
    ...new Set(
      ledger
        .filter((row) => row.diemDanhId != null)
        .map((row) => Number(row.diemDanhId)),
    ),
  ];
  const sessions = await sessionsOf(database.connection(), attendanceIds);
  const sessionTime = new Map(
    [...sessions].map(([id, info]) => [id, `${info.ngay} ${info.gioBatDau}`]),
  );
  const { deductions, adjustments } = fromLedger(
    ledger.map((row) => ({
      id: Number(row.id),
      thayDoi: Number(row.thayDoi),
      lyDo: asText(row.lyDo),
      goiHocId: row.goiHocId == null ? null : Number(row.goiHocId),
      diemDanhId: row.diemDanhId == null ? null : Number(row.diemDanhId),
      ngay: toDay(row.createdAt),
    })),
    sessionTime,
  );
  const inputs: PackageInput[] = [
    ...packages.map((row) => ({
      goiHocId: Number(row.id),
      soBuoi: Number(row.soBuoi),
      ngayMua: asText(row.ngayMua),
      thuTu: Number(row.id),
      hieuLuc: asText(row.trangThai) === 'hieu_luc',
      loai:
        asText(row.loai) === 'chuyen_so_du'
          ? ('chuyen_so_du' as const)
          : ('mua' as const),
    })),
    ...adjustments,
  ];
  return { packages, sessions, result: allocateFifo(inputs, deductions) };
}
