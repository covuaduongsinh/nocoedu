import type {
  DatabaseManager,
  RepositoryPolicy,
  DatabaseConnection,
} from '@nocobase/db';

import { eduError } from '../routes/edu-support.js';
import {
  asBoolean,
  sessionsToDeduct,
  unexcusedAbsenceDeductsOn,
  type AttendanceStatus,
} from './so-du.js';

/**
 * The only code that changes `eduHocVien.soBuoiConLai`. Every route that moves a balance (attendance, selling a package,
 * the quick edit of the reconciliation page, the CSV import) goes through `moveBalance`, so a move always has its ledger
 * row (`eduSoDuNhatKy`) in the same transaction and is guarded by the balance it was computed from.
 */
type Query = ReturnType<DatabaseManager['connection']>['query'];
export type Queryable = { readonly query: Query };

export const conflict = () =>
  eduError(
    'FAILED_PRECONDITION',
    'EDU_BALANCE_CONFLICT',
    'The attendance or balance was changed at the same time. Reload and try again.',
  );

/** The ledger reasons a route may write (`eduSoDuNhatKy.lyDo`, at most 32 characters). */
export type BalanceReason =
  'diem_danh' | 'diem_danh_sua' | 'mua_goi' | 'chuyen_tu_lark';

export async function balanceOf(
  connection: Queryable,
  hocVienId: number,
): Promise<number> {
  const row = await connection.query
    .selectFrom('eduHocVien')
    .select('soBuoiConLai')
    .where('id', '=', hocVienId)
    .executeTakeFirstOrThrow();
  return Number(row.soBuoiConLai);
}

/**
 * Moves a student's balance from `before` to `after` and writes the ledger row, in the caller's transaction. The
 * update names the balance it was computed from: if another request changed it first no row matches, and the whole
 * transaction stops instead of applying a stale difference.
 */
export async function moveBalance(
  connection: Queryable,
  change: {
    hocVienId: number;
    before: number;
    after: number;
    reason: BalanceReason;
    diemDanhId?: number;
    goiHocId?: number;
    userId: string;
  },
): Promise<void> {
  const updated = await connection.query
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: change.after })
    .where('id', '=', change.hocVienId)
    .where('soBuoiConLai', '=', change.before)
    .execute();
  if (updated.updatedCount !== 1) throw conflict();
  await connection.query
    .insertInto('eduSoDuNhatKy')
    .values({
      hocVienId: change.hocVienId,
      thayDoi: change.after - change.before,
      soDuSau: change.after,
      lyDo: change.reason,
      goiHocId: change.goiHocId ?? null,
      diemDanhId: change.diemDanhId ?? null,
      nguoiThucHienId: change.userId,
      createdAt: new Date(),
    })
    .execute();
}

/**
 * Moves the balance by `-difference` sessions (a positive difference deducts) for one attendance row, writing the
 * ledger row. Nothing happens when the difference is 0. Returns the balance afterwards.
 */
export async function applyDeductionDifference(
  connection: Queryable,
  change: {
    hocVienId: number;
    diemDanhId: number;
    difference: number;
    userId: string;
  },
): Promise<number> {
  const before = await balanceOf(connection, change.hocVienId);
  if (change.difference === 0) return before;
  const after = before - change.difference;
  await moveBalance(connection, {
    hocVienId: change.hocVienId,
    before,
    after,
    reason: change.difference > 0 ? 'diem_danh' : 'diem_danh_sua',
    diemDanhId: change.diemDanhId,
    userId: change.userId,
  });
  return after;
}

/** `eduDiemDanh.tinhVaoSoDu`: `false` for history already contained in an opening balance; a missing value counts. */
export async function rowCountsTowardBalance(
  connection: Queryable,
  diemDanhId: number,
): Promise<boolean> {
  const row = await connection.query
    .selectFrom('eduDiemDanh')
    .select('tinhVaoSoDu')
    .where('id', '=', diemDanhId)
    .executeTakeFirst();
  return row?.tinhVaoSoDu === undefined || row.tinhVaoSoDu === null
    ? true
    : asBoolean(row.tinhVaoSoDu);
}

/**
 * The deduction rule in force for a session. It is fixed on the session the first time its register is saved
 * (`truVangCoPhep` from the branch setting; `truVangKhongPhep` from the day the branch deducts an absence without leave
 * from, `eduCoSo.truVangKhongPhepTuNgay`, compared with the day of the session, or from `EDU_TRU_BUOI_VANG_KHONG_PHEP`);
 * a later change of either setting applies to the next sessions only, so saving an old register again never moves a
 * balance. A value still `null` (a session saved before the column existed, or not saved yet) takes the current setting
 * now.
 */
export async function lockSessionRule(
  connection: Queryable,
  buoiHocId: number,
  coSoId: number,
): Promise<{ excusedDeducts: boolean; unexcusedDeducts: boolean }> {
  const stored = await connection.query
    .selectFrom('eduBuoiHoc')
    .select(['ngay', 'truVangCoPhep', 'truVangKhongPhep'])
    .where('id', '=', buoiHocId)
    .executeTakeFirstOrThrow();
  const unset = (value: unknown): boolean =>
    value === null || value === undefined;
  // The branch is read only when one of the two rules is still to be fixed.
  const branch =
    unset(stored.truVangCoPhep) || unset(stored.truVangKhongPhep)
      ? await connection.query
          .selectFrom('eduCoSo')
          .select(['truBuoiVangCoPhep', 'truVangKhongPhepTuNgay'])
          .where('id', '=', coSoId)
          .executeTakeFirstOrThrow()
      : undefined;
  let excusedDeducts: boolean;
  if (branch && unset(stored.truVangCoPhep)) {
    excusedDeducts = asBoolean(branch.truBuoiVangCoPhep);
    await connection.query
      .updateTable('eduBuoiHoc')
      .set({ truVangCoPhep: excusedDeducts })
      .where('id', '=', buoiHocId)
      .where('truVangCoPhep', 'is', null)
      .execute();
  } else {
    excusedDeducts = asBoolean(stored.truVangCoPhep);
  }
  let unexcusedDeducts: boolean;
  if (branch && unset(stored.truVangKhongPhep)) {
    unexcusedDeducts = unexcusedAbsenceDeductsOn(
      String(stored.ngay),
      branch.truVangKhongPhepTuNgay,
      process.env,
    );
    await connection.query
      .updateTable('eduBuoiHoc')
      .set({ truVangKhongPhep: unexcusedDeducts })
      .where('id', '=', buoiHocId)
      .where('truVangKhongPhep', 'is', null)
      .execute();
  } else {
    unexcusedDeducts = asBoolean(stored.truVangKhongPhep);
  }
  return { excusedDeducts, unexcusedDeducts };
}

/**
 * Saves one attendance row of a session and moves the balance by the difference, in the caller's transaction. Shared by
 * the register (`/diemDanh/luu`), the quick edit of the reconciliation page and the CSV import, so all three apply the
 * same rule: the one fixed on the session (`lockSessionRule`), an unchanged status keeps what was deducted, a row
 * already inside an opening balance (`tinhVaoSoDu = false`) never moves it, and only the difference is written.
 * The student must already be checked against the caller's scope by the caller.
 */
export async function saveAttendanceRow(
  connection: DatabaseConnection,
  attendancePolicy: RepositoryPolicy,
  entry: {
    buoiHocId: number;
    hocVienId: number;
    trangThai: AttendanceStatus;
    daLamBtvn: boolean;
    nhanXet?: string | null;
    /** The CSV import leaves an existing note alone when the file has none; the register always replaces it. */
    keepNote?: boolean;
  },
  rule: { excusedDeducts: boolean; unexcusedDeducts: boolean },
  userId: string,
): Promise<{ diemDanhId: number; soBuoiDaTru: number; soBuoiConLai: number }> {
  const attendance = connection
    .repository('eduDiemDanh')
    .withPolicy(attendancePolicy);
  const existing = await attendance.findOne({
    filter: (f) =>
      f.and([
        f.number('buoiHocId').eq(entry.buoiHocId),
        f.number('hocVienId').eq(entry.hocVienId),
      ]),
  });
  // A row imported from Lark that lies before the opening balance is already inside that balance: it is not a
  // permission field, so it is read directly. Correcting such a row never moves the balance.
  const countsTowardBalance = existing
    ? await rowCountsTowardBalance(connection, Number(existing.id))
    : true;
  // An unchanged status keeps what was deducted (also for registers saved before the rule was stored).
  const target =
    existing && (existing.trangThai === entry.trangThai || !countsTowardBalance)
      ? Number(existing.soBuoiDaTru)
      : sessionsToDeduct(
          entry.trangThai,
          rule.excusedDeducts,
          rule.unexcusedDeducts,
        );
  let diemDanhId: number;
  let alreadyDeducted: number;
  if (existing) {
    diemDanhId = Number(existing.id);
    alreadyDeducted = Number(existing.soBuoiDaTru);
    // Guarded by the amount already deducted: a concurrent save that changed it matches no row.
    const updated = await connection.query
      .updateTable('eduDiemDanh')
      .set({
        trangThai: entry.trangThai,
        daLamBtvn: entry.daLamBtvn,
        nhanXet:
          entry.keepNote && !entry.nhanXet
            ? (existing.nhanXet ?? null)
            : (entry.nhanXet ?? null),
        soBuoiDaTru: target,
        nguoiDiemDanhId: userId,
      })
      .where('id', '=', diemDanhId)
      .where('soBuoiDaTru', '=', alreadyDeducted)
      .execute();
    if (updated.updatedCount !== 1) throw conflict();
  } else {
    alreadyDeducted = 0;
    try {
      const created = await attendance.createOne({
        values: {
          buoiHocId: entry.buoiHocId,
          hocVienId: entry.hocVienId,
          trangThai: entry.trangThai,
          daLamBtvn: entry.daLamBtvn,
          nhanXet: entry.nhanXet ?? null,
          soBuoiDaTru: target,
          nguoiDiemDanhId: userId,
        },
      });
      diemDanhId = Number(created.record.id);
    } catch (error) {
      // The unique pair (session, student) refuses a second row written at the same moment.
      throw error instanceof Error && /unique|duplicate/iu.test(error.message)
        ? conflict()
        : error;
    }
    if (!(await attendance.findOne({ filter: { id: diemDanhId } }))) {
      throw eduError(
        'PERMISSION_DENIED',
        'EDU_OUT_OF_SCOPE',
        'You may not take attendance here.',
      );
    }
  }
  // Only the difference moves the balance, so saving the same register again changes nothing.
  const soBuoiConLai = await applyDeductionDifference(connection, {
    hocVienId: entry.hocVienId,
    diemDanhId,
    difference: target - alreadyDeducted,
    userId,
  });
  return { diemDanhId, soBuoiDaTru: target, soBuoiConLai };
}
