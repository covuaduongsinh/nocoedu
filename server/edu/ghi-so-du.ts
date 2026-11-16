/**
 * The only writers of a student's balance (`eduHocVien.soBuoiConLai`).
 *
 * Every route that moves a balance (taking attendance, correcting one attendance row, selling a package, importing
 * either from a file) calls a function of this file inside its own transaction, with the policies of the composite
 * action it authorized. The balance changes only in `moveBalance`, which writes the ledger row (`eduSoDuNhatKy`) in the
 * same transaction and is guarded by the balance it was computed from. Nothing else may update that column: a balance
 * written beside the ledger cannot be explained or allocated to a package afterwards (`phan-bo-goi.ts`).
 */
import type { DatabaseConnection, RepositoryPolicy } from '@nocobase/db';

import { eduError } from './errors.js';
import { asText } from './names.js';
import {
  asBoolean,
  type AttendanceStatus,
  isLowBalance,
  sessionsToDeduct,
  todayVn,
  unexcusedAbsenceDeducts,
} from './so-du.js';

type Queryable = Pick<DatabaseConnection, 'query'>;

export type BalanceReason =
  'diem_danh' | 'diem_danh_sua' | 'mua_goi' | 'chuyen_tu_lark' | 'dieu_chinh';

export const balanceConflict = () =>
  eduError(
    'FAILED_PRECONDITION',
    'EDU_BALANCE_CONFLICT',
    'The attendance or balance was changed at the same time. Reload and try again.',
  );

const notFound = (reason: string, message: string) =>
  eduError('NOT_FOUND', reason, message);

const outOfScope = (message: string) =>
  eduError('PERMISSION_DENIED', 'EDU_OUT_OF_SCOPE', message);

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

/** The money already paid for a package. */
export async function paidFor(
  connection: Queryable,
  goiHocId: number,
): Promise<number> {
  const rows = await connection.query
    .selectFrom('eduThanhToan')
    .select('soTien')
    .where('goiHocId', '=', goiHocId)
    .execute();
  return rows.reduce((sum, row) => sum + Number(row.soTien), 0);
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
    ghiChu?: string | null;
    userId: string;
  },
): Promise<void> {
  const updated = await connection.query
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: change.after })
    .where('id', '=', change.hocVienId)
    .where('soBuoiConLai', '=', change.before)
    .execute();
  if (updated.updatedCount !== 1) throw balanceConflict();
  await connection.query
    .insertInto('eduSoDuNhatKy')
    .values({
      hocVienId: change.hocVienId,
      thayDoi: change.after - change.before,
      soDuSau: change.after,
      lyDo: change.reason,
      goiHocId: change.goiHocId ?? null,
      diemDanhId: change.diemDanhId ?? null,
      ghiChu: change.ghiChu ?? null,
      nguoiThucHienId: change.userId,
      createdAt: new Date(),
    })
    .execute();
}

/** `eduDiemDanh.tinhVaoSoDu`: `false` for history already contained in an opening balance; a missing value counts. */
async function rowCountsTowardBalance(
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

export interface AttendanceEntry {
  readonly hocVienId: number;
  readonly trangThai: AttendanceStatus;
  /** Not sent: an existing row keeps its value, a new row starts at `false`. */
  readonly daLamBtvn?: boolean;
  /** Not sent: an existing row keeps its comment, a new row has none. `null` clears it. */
  readonly nhanXet?: string | null;
}

export interface AttendanceResultRow {
  readonly hocVienId: number;
  readonly diemDanhId: number;
  readonly soBuoiDaTru: number;
  readonly soBuoiConLai: number;
  readonly canhBao: boolean;
}

/**
 * Saves the register of one session and moves each balance by the difference only, so saving the same register again
 * changes nothing. Runs in the caller's transaction.
 *
 * `policies` are those of the caller's composite actions: the session must be visible through `session`, every student
 * through `student`, and every attendance row is read and created through `attendance`. A missing policy means the
 * caller may not see that kind of record, which answers "not found".
 */
export async function saveAttendance(
  connection: DatabaseConnection,
  input: {
    readonly buoiHocId: number;
    readonly danhSach: readonly AttendanceEntry[];
    readonly userId: string;
    readonly policies: {
      readonly attendance: RepositoryPolicy;
      readonly session: RepositoryPolicy | undefined;
      readonly student: RepositoryPolicy | undefined;
    };
    /**
     * Correcting a row that already exists does not ask again whether the student still belongs to the branch of the
     * class: a student who moved since keeps a history that can be corrected. A new row always needs the same branch.
     */
    readonly existingRowsAnyBranch?: boolean;
    readonly env?: Readonly<Record<string, string | undefined>>;
  },
): Promise<{ buoiHocId: number; danhSach: AttendanceResultRow[] }> {
  const { policies, userId, buoiHocId } = input;
  const session = policies.session
    ? await connection
        .repository('eduBuoiHoc')
        .withPolicy(policies.session)
        .findOne({ filter: { id: buoiHocId } })
    : null;
  if (!session) throw notFound('EDU_SESSION_NOT_FOUND', 'Session not found.');
  if (session.trangThai === 'huy') {
    // A session that was called off (a holiday, a day the coach was away) has no register.
    throw eduError(
      'FAILED_PRECONDITION',
      'EDU_SESSION_CANCELLED',
      'This session was cancelled. Open it again before taking attendance.',
    );
  }
  const lop = await connection.query
    .selectFrom('eduLop')
    .select('coSoId')
    .where('id', '=', Number(session.lopId))
    .executeTakeFirstOrThrow();
  const branch = await connection.query
    .selectFrom('eduCoSo')
    .select('truBuoiVangCoPhep')
    .where('id', '=', Number(lop.coSoId))
    .executeTakeFirstOrThrow();
  // The rule in force is fixed on the session the first time its register is saved. A later change of the
  // branch setting applies to the next sessions only, so saving an old register again never moves a balance.
  const stored = await connection.query
    .selectFrom('eduBuoiHoc')
    .select(['truVangCoPhep', 'truVangKhongPhep'])
    .where('id', '=', buoiHocId)
    .executeTakeFirstOrThrow();
  let excusedDeducts: boolean;
  if (stored.truVangCoPhep === null || stored.truVangCoPhep === undefined) {
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
  // The same for an absence without leave: `EDU_TRU_BUOI_VANG_KHONG_PHEP` is read once, on the first save of a
  // session (DS-60). A session saved before this column existed (`null`) takes the setting on its next save, so
  // turning the setting on later never reaches a register that was already marked.
  let unexcusedDeducts: boolean;
  if (
    stored.truVangKhongPhep === null ||
    stored.truVangKhongPhep === undefined
  ) {
    unexcusedDeducts = unexcusedAbsenceDeducts(input.env ?? process.env);
    await connection.query
      .updateTable('eduBuoiHoc')
      .set({ truVangKhongPhep: unexcusedDeducts })
      .where('id', '=', buoiHocId)
      .where('truVangKhongPhep', 'is', null)
      .execute();
  } else {
    unexcusedDeducts = asBoolean(stored.truVangKhongPhep);
  }
  const attendance = connection
    .repository('eduDiemDanh')
    .withPolicy(policies.attendance);
  const students = policies.student
    ? connection.repository('eduHocVien').withPolicy(policies.student)
    : null;
  const rows: AttendanceResultRow[] = [];

  for (const entry of input.danhSach) {
    const student = students
      ? await students.findOne({ filter: { id: entry.hocVienId } })
      : null;
    if (!student) throw notFound('EDU_STUDENT_NOT_FOUND', 'Student not found.');
    const existing = await attendance.findOne({
      filter: (f) =>
        f.and([
          f.number('buoiHocId').eq(buoiHocId),
          f.number('hocVienId').eq(entry.hocVienId),
        ]),
    });
    if (
      Number(student.coSoId) !== Number(lop.coSoId) &&
      !(existing && input.existingRowsAnyBranch)
    ) {
      throw eduError(
        'INVALID_ARGUMENT',
        'EDU_STUDENT_OTHER_BRANCH',
        'The student does not belong to the branch of this class.',
        'danhSach',
      );
    }
    // A row imported from Lark that lies before the opening balance is already inside that balance: it is not a
    // permission field, so it is read directly. Correcting such a row never moves the balance.
    const countsTowardBalance = existing
      ? await rowCountsTowardBalance(connection, Number(existing.id))
      : true;
    // An unchanged status keeps what was deducted (also for registers saved before the rule was stored).
    const target =
      existing &&
      (existing.trangThai === entry.trangThai || !countsTowardBalance)
        ? Number(existing.soBuoiDaTru)
        : sessionsToDeduct(entry.trangThai, excusedDeducts, unexcusedDeducts);
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
          ...(entry.daLamBtvn === undefined
            ? {}
            : { daLamBtvn: entry.daLamBtvn }),
          ...(entry.nhanXet === undefined ? {} : { nhanXet: entry.nhanXet }),
          soBuoiDaTru: target,
          nguoiDiemDanhId: userId,
        })
        .where('id', '=', diemDanhId)
        .where('soBuoiDaTru', '=', alreadyDeducted)
        .execute();
      if (updated.updatedCount !== 1) throw balanceConflict();
    } else {
      alreadyDeducted = 0;
      try {
        const created = await attendance.createOne({
          values: {
            buoiHocId,
            hocVienId: entry.hocVienId,
            trangThai: entry.trangThai,
            daLamBtvn: entry.daLamBtvn ?? false,
            nhanXet: entry.nhanXet ?? null,
            soBuoiDaTru: target,
            nguoiDiemDanhId: userId,
          },
        });
        diemDanhId = Number(created.record.id);
      } catch (error) {
        // The unique pair (session, student) refuses a second row written at the same moment.
        throw error instanceof Error && /unique|duplicate/iu.test(error.message)
          ? balanceConflict()
          : error;
      }
      if (!(await attendance.findOne({ filter: { id: diemDanhId } }))) {
        throw outOfScope('You may not take attendance here.');
      }
    }

    // Only the difference moves the balance, so saving the same register again changes nothing.
    const difference = target - alreadyDeducted;
    const before = await balanceOf(connection, entry.hocVienId);
    let after = before;
    if (difference !== 0) {
      after = before - difference;
      await moveBalance(connection, {
        hocVienId: entry.hocVienId,
        before,
        after,
        reason: difference > 0 ? 'diem_danh' : 'diem_danh_sua',
        diemDanhId,
        userId,
      });
    }
    rows.push({
      hocVienId: entry.hocVienId,
      diemDanhId,
      soBuoiDaTru: target,
      soBuoiConLai: after,
      canhBao: isLowBalance(after),
    });
  }
  await connection.query
    .updateTable('eduBuoiHoc')
    .set({ trangThai: 'da_diem_danh' })
    .where('id', '=', buoiHocId)
    .execute();
  return { buoiHocId, danhSach: rows };
}

/**
 * Sells a package of sessions to a student the caller sees and adds its sessions to the balance (ledger reason
 * `mua_goi`), in the caller's transaction.
 */
export async function sellPackage(
  connection: DatabaseConnection,
  input: {
    readonly hocVienId: number;
    readonly soBuoi: number;
    readonly donGia: number;
    /** Left out: `soBuoi * donGia`. */
    readonly thanhTien?: number;
    readonly ngayMua?: string;
    readonly userId: string;
    readonly policies: {
      readonly package: RepositoryPolicy;
      readonly student: RepositoryPolicy | undefined;
    };
  },
): Promise<{ id: number; thanhTien: number; soBuoiConLai: number }> {
  const student = input.policies.student
    ? await connection
        .repository('eduHocVien')
        .withPolicy(input.policies.student)
        .findOne({ filter: { id: input.hocVienId } })
    : null;
  if (!student) throw notFound('EDU_STUDENT_NOT_FOUND', 'Student not found.');
  const packages = connection
    .repository('eduGoiHoc')
    .withPolicy(input.policies.package);
  const thanhTien = input.thanhTien ?? input.soBuoi * input.donGia;
  const created = await packages.createOne({
    values: {
      hocVienId: input.hocVienId,
      soBuoi: input.soBuoi,
      donGia: input.donGia,
      thanhTien,
      ngayMua: input.ngayMua ?? todayVn(),
      trangThai: 'hieu_luc',
      nguoiTaoId: input.userId,
    },
  });
  const id = Number(created.record.id);
  if (!(await packages.findOne({ filter: { id } }))) {
    throw outOfScope('You may not sell a package here.');
  }
  const before = await balanceOf(connection, input.hocVienId);
  const after = before + input.soBuoi;
  await moveBalance(connection, {
    hocVienId: input.hocVienId,
    before,
    after,
    reason: 'mua_goi',
    goiHocId: id,
    userId: input.userId,
  });
  return { id, thanhTien, soBuoiConLai: after };
}

/**
 * Records a payment for a package the caller sees, never more than what is still due, in the caller's transaction.
 * A payment does not move the balance: the sessions were added when the package was sold.
 */
export async function recordPayment(
  connection: DatabaseConnection,
  input: {
    readonly goiHocId: number;
    readonly soTien: number;
    readonly hinhThuc: 'tien_mat' | 'chuyen_khoan';
    readonly ngay?: string;
    readonly noiDungCk?: string | null;
    readonly userId: string;
    readonly policies: {
      readonly payment: RepositoryPolicy;
      readonly package: RepositoryPolicy | undefined;
    };
  },
): Promise<{ id: number; conNo: number }> {
  if (!input.policies.package) {
    throw outOfScope('You may not record a payment here.');
  }
  const pack = await connection
    .repository('eduGoiHoc')
    .withPolicy(input.policies.package)
    .findOne({ filter: { id: input.goiHocId } });
  if (!pack) throw notFound('EDU_PACKAGE_NOT_FOUND', 'Package not found.');
  const student = await connection.query
    .selectFrom('eduHocVien')
    .select('coSoId')
    .where('id', '=', Number(pack.hocVienId))
    .executeTakeFirstOrThrow();
  // Lock the package row for this transaction before the paid total is read, so two payments at once on
  // PostgreSQL cannot both pass the "not more than due" check.
  await connection.query
    .updateTable('eduGoiHoc')
    .set({ trangThai: asText(pack.trangThai) })
    .where('id', '=', input.goiHocId)
    .execute();
  const paid = await paidFor(connection, input.goiHocId);
  const due = Number(pack.thanhTien) - paid;
  if (input.soTien > due) {
    throw eduError(
      'FAILED_PRECONDITION',
      'EDU_OVERPAYMENT',
      'The payment is more than the amount still due.',
      'soTien',
    );
  }
  const date = input.ngay ?? todayVn();
  const payments = connection
    .repository('eduThanhToan')
    .withPolicy(input.policies.payment);
  const created = await payments.createOne({
    values: {
      goiHocId: input.goiHocId,
      hocVienId: Number(pack.hocVienId),
      coSoId: Number(student.coSoId),
      soTien: input.soTien,
      hinhThuc: input.hinhThuc,
      ngay: date,
      thang: date.slice(0, 7),
      noiDungCk: input.noiDungCk ?? null,
      nguoiGhiNhanId: input.userId,
    },
  });
  const id = Number(created.record.id);
  if (!(await payments.findOne({ filter: { id } }))) {
    throw outOfScope('You may not record a payment here.');
  }
  return { id, conNo: due - input.soTien };
}
