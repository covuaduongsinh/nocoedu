import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
} from '@nocobase/app-server/router';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { asText } from '../edu/names.js';
import {
  allocateFifo,
  fromLedger,
  type PackageInput,
} from '../edu/phan-bo-goi.js';
import {
  ATTENDANCE_STATUSES,
  asBoolean,
  datesBetween,
  isLowBalance,
  LOW_BALANCE_THRESHOLD,
  sessionsToDeduct,
  unexcusedAbsenceDeducts,
  todayVn,
  vietQrConfig,
  vietQrUrl,
  weekdayOf,
} from '../edu/so-du.js';
import {
  currentUserId,
  eduError,
  needs,
  policiesOf,
  policyOf,
  type EduEnv,
} from './edu-support.js';

/**
 * Sessions, attendance, balance and tuition.
 *
 * Every route authenticates, authorizes its composite action first and then reads and writes only through the policy
 * that action was granted. The balance of a student (`eduHocVien.soBuoiConLai`) is never written by a client: it moves
 * only here, inside the transaction that also writes the ledger row (`eduSoDuNhatKy`), and every move is guarded by
 * the balance it was computed from, so two requests at once cannot both apply the same change.
 */
const Id = z.coerce.number().int().positive();
const SessionDate = z.iso.date();

const GenerateInput = z.object({
  lopId: Id,
  tuNgay: SessionDate,
  denNgay: SessionDate,
});

const AttendanceInput = z.object({
  buoiHocId: Id,
  danhSach: z
    .array(
      z.object({
        hocVienId: Id,
        trangThai: z.enum(ATTENDANCE_STATUSES),
        daLamBtvn: z.boolean().default(false),
        nhanXet: z.string().trim().max(500).nullish(),
      }),
    )
    .min(1)
    .max(200),
});

/** The total is stored in a 32-bit integer column (PostgreSQL `integer`), so a package stays below its range. */
const MAX_PACKAGE_TOTAL = 2_000_000_000;

const PackageInput = z
  .object({
    hocVienId: Id,
    soBuoi: z.number().int().min(1).max(500),
    donGia: z.number().int().min(0).max(100_000_000),
    ngayMua: SessionDate.optional(),
  })
  .refine((value) => value.soBuoi * value.donGia <= MAX_PACKAGE_TOTAL, {
    path: ['donGia'],
    message: 'The total of a package is too large.',
  });

const PaymentInput = z.object({
  goiHocId: Id,
  soTien: z.number().int().min(1).max(1_000_000_000),
  hinhThuc: z.enum(['tien_mat', 'chuyen_khoan']),
  ngay: SessionDate.optional(),
  noiDungCk: z.string().trim().max(191).nullish(),
});

const QrInput = z.object({ goiHocId: Id });
const DetailInput = z.object({ goiHocId: Id });
const DoiSoatInput = z.object({ hocVienId: Id });

const today = (): string => todayVn();

const declare = (summary: string, operationId: string) =>
  describeRoute({
    tags: ['NocoEdu'],
    summary,
    operationId,
    responses: {
      '200': dataResponse(z.object({}).passthrough()),
      ...apiErrorResponses,
    },
  });

const notFound = (reason: string, message: string) =>
  eduError('NOT_FOUND', reason, message);

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    for (const path of [
      '/buoiHoc/taoTheoLich',
      '/diemDanh/luu',
      '/goiHoc/taoMoi',
      '/goiHoc/chiTiet',
      '/thanhToan/ghiNhan',
      '/thanhToan/vietQr',
      '/soDu/canhBao',
      '/hocVien/doiSoatTongThe',
    ]) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 64 * 1024 }),
      );
    }

    // --- Sessions generated from the timetable of a class -------------------------------------------------------
    router.post(
      '/buoiHoc/taoTheoLich',
      declare(
        'Create the sessions of a class from its timetable',
        'generateSessions',
      ),
      needs('edu.buoiHoc', 'manage'),
      apiValidator('json', GenerateInput),
      async (c) => {
        const input = c.req.valid('json');
        const dates = datesBetween(input.tuNgay, input.denNgay);
        if (dates.length === 0 || dates.length > 93) {
          throw eduError(
            'INVALID_ARGUMENT',
            'EDU_DATE_RANGE',
            'The date range must be between 1 and 93 days.',
            'denNgay',
          );
        }
        const classPolicy = (await policiesOf(c, 'edu.lop', 'view')).eduLop;
        const sessionPolicy = policyOf(c, 'eduBuoiHoc');
        const result = await database.transaction(async (connection) => {
          const lop = classPolicy
            ? await connection
                .repository('eduLop')
                .withPolicy(classPolicy)
                .findOne({ filter: { id: input.lopId } })
            : null;
          if (!lop) throw notFound('EDU_CLASS_NOT_FOUND', 'Class not found.');
          const slots = await connection.query
            .selectFrom('eduLopLich')
            .select(['thu', 'gioBatDau', 'gioKetThuc'])
            .where('lopId', '=', input.lopId)
            .execute();
          const existing = await connection.query
            .selectFrom('eduBuoiHoc')
            .select(['ngay', 'gioBatDau'])
            .where('lopId', '=', input.lopId)
            .where('ngay', '>=', input.tuNgay)
            .where('ngay', '<=', input.denNgay)
            .execute();
          const taken = new Set(
            existing.map(
              (row) => `${asText(row.ngay)}|${asText(row.gioBatDau)}`,
            ),
          );
          const sessions = connection
            .repository('eduBuoiHoc')
            .withPolicy(sessionPolicy);
          let created = 0;
          for (const date of dates) {
            const weekday = weekdayOf(date);
            for (const slot of slots) {
              if (Number(slot.thu) !== weekday) continue;
              const start = asText(slot.gioBatDau);
              if (taken.has(`${date}|${start}`)) continue;
              const row = await sessions.createOne({
                values: {
                  lopId: input.lopId,
                  ngay: date,
                  gioBatDau: start,
                  gioKetThuc: asText(slot.gioKetThuc),
                  hlvId: lop.hlvId ?? null,
                  loai: 'thuong',
                  trangThai: 'du_kien',
                },
              });
              if (
                !(await sessions.findOne({
                  filter: { id: Number(row.record.id) },
                }))
              ) {
                throw eduError(
                  'PERMISSION_DENIED',
                  'EDU_OUT_OF_SCOPE',
                  'You may not create sessions here.',
                );
              }
              created += 1;
            }
          }
          return { created };
        });
        return c.json({ data: result }, 201);
      },
    );

    // --- Attendance and the balance deduction -------------------------------------------------------------------
    router.post(
      '/diemDanh/luu',
      declare('Save the attendance of a session', 'saveAttendance'),
      needs('edu.diemDanh', 'record'),
      apiValidator('json', AttendanceInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const attendancePolicy = policyOf(c, 'eduDiemDanh');
        const sessionPolicy = (await policiesOf(c, 'edu.buoiHoc', 'view'))
          .eduBuoiHoc;
        const studentPolicy = (await policiesOf(c, 'edu.hocVien', 'view'))
          .eduHocVien;
        if (
          new Set(input.danhSach.map((e) => e.hocVienId)).size !==
          input.danhSach.length
        ) {
          throw eduError(
            'INVALID_ARGUMENT',
            'EDU_DUPLICATE_STUDENT',
            'A student appears twice in the list.',
            'danhSach',
          );
        }
        const result = await database.transaction(async (connection) => {
          const session = sessionPolicy
            ? await connection
                .repository('eduBuoiHoc')
                .withPolicy(sessionPolicy)
                .findOne({ filter: { id: input.buoiHocId } })
            : null;
          if (!session)
            throw notFound('EDU_SESSION_NOT_FOUND', 'Session not found.');
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
            .where('id', '=', input.buoiHocId)
            .executeTakeFirstOrThrow();
          let excusedDeducts: boolean;
          if (
            stored.truVangCoPhep === null ||
            stored.truVangCoPhep === undefined
          ) {
            excusedDeducts = asBoolean(branch.truBuoiVangCoPhep);
            await connection.query
              .updateTable('eduBuoiHoc')
              .set({ truVangCoPhep: excusedDeducts })
              .where('id', '=', input.buoiHocId)
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
            unexcusedDeducts = unexcusedAbsenceDeducts(process.env);
            await connection.query
              .updateTable('eduBuoiHoc')
              .set({ truVangKhongPhep: unexcusedDeducts })
              .where('id', '=', input.buoiHocId)
              .where('truVangKhongPhep', 'is', null)
              .execute();
          } else {
            unexcusedDeducts = asBoolean(stored.truVangKhongPhep);
          }
          const attendance = connection
            .repository('eduDiemDanh')
            .withPolicy(attendancePolicy);
          const students = studentPolicy
            ? connection.repository('eduHocVien').withPolicy(studentPolicy)
            : null;
          const rows: {
            hocVienId: number;
            diemDanhId: number;
            soBuoiDaTru: number;
            soBuoiConLai: number;
            canhBao: boolean;
          }[] = [];

          for (const entry of input.danhSach) {
            const student = students
              ? await students.findOne({ filter: { id: entry.hocVienId } })
              : null;
            if (!student)
              throw notFound('EDU_STUDENT_NOT_FOUND', 'Student not found.');
            if (Number(student.coSoId) !== Number(lop.coSoId)) {
              throw eduError(
                'INVALID_ARGUMENT',
                'EDU_STUDENT_OTHER_BRANCH',
                'The student does not belong to the branch of this class.',
                'danhSach',
              );
            }
            const existing = await attendance.findOne({
              filter: (f) =>
                f.and([
                  f.number('buoiHocId').eq(input.buoiHocId),
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
              existing &&
              (existing.trangThai === entry.trangThai || !countsTowardBalance)
                ? Number(existing.soBuoiDaTru)
                : sessionsToDeduct(
                    entry.trangThai,
                    excusedDeducts,
                    unexcusedDeducts,
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
                  nhanXet: entry.nhanXet ?? null,
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
                    buoiHocId: input.buoiHocId,
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
                throw error instanceof Error &&
                  /unique|duplicate/iu.test(error.message)
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
            .where('id', '=', input.buoiHocId)
            .execute();
          return { buoiHocId: input.buoiHocId, danhSach: rows };
        });
        return c.json({ data: result });
      },
    );

    // --- Packages and payments ----------------------------------------------------------------------------------
    router.post(
      '/goiHoc/taoMoi',
      declare('Sell a package of sessions to a student', 'createPackage'),
      needs('edu.goiHoc', 'manage'),
      apiValidator('json', PackageInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const packagePolicy = policyOf(c, 'eduGoiHoc');
        const studentPolicy = (await policiesOf(c, 'edu.hocVien', 'view'))
          .eduHocVien;
        const result = await database.transaction(async (connection) => {
          const student = studentPolicy
            ? await connection
                .repository('eduHocVien')
                .withPolicy(studentPolicy)
                .findOne({ filter: { id: input.hocVienId } })
            : null;
          if (!student)
            throw notFound('EDU_STUDENT_NOT_FOUND', 'Student not found.');
          const packages = connection
            .repository('eduGoiHoc')
            .withPolicy(packagePolicy);
          const thanhTien = input.soBuoi * input.donGia;
          const created = await packages.createOne({
            values: {
              hocVienId: input.hocVienId,
              soBuoi: input.soBuoi,
              donGia: input.donGia,
              thanhTien,
              ngayMua: input.ngayMua ?? today(),
              trangThai: 'hieu_luc',
              nguoiTaoId: userId,
            },
          });
          const id = Number(created.record.id);
          if (!(await packages.findOne({ filter: { id } }))) {
            throw eduError(
              'PERMISSION_DENIED',
              'EDU_OUT_OF_SCOPE',
              'You may not sell a package here.',
            );
          }
          const before = await balanceOf(connection, input.hocVienId);
          const after = before + input.soBuoi;
          await moveBalance(connection, {
            hocVienId: input.hocVienId,
            before,
            after,
            reason: 'mua_goi',
            goiHocId: id,
            userId,
          });
          return { id, thanhTien, soBuoiConLai: after };
        });
        return c.json({ data: result }, 201);
      },
    );

    router.post(
      '/thanhToan/ghiNhan',
      declare('Record a payment for a package', 'recordPayment'),
      needs('edu.thanhToan', 'manage'),
      apiValidator('json', PaymentInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const paymentPolicy = policyOf(c, 'eduThanhToan');
        const packagePolicy = (await policiesOf(c, 'edu.goiHoc', 'view'))
          .eduGoiHoc;
        if (!packagePolicy) {
          throw eduError(
            'PERMISSION_DENIED',
            'EDU_OUT_OF_SCOPE',
            'You may not record a payment here.',
          );
        }
        const result = await database.transaction(async (connection) => {
          const pack = await connection
            .repository('eduGoiHoc')
            .withPolicy(packagePolicy)
            .findOne({ filter: { id: input.goiHocId } });
          if (!pack)
            throw notFound('EDU_PACKAGE_NOT_FOUND', 'Package not found.');
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
          const date = input.ngay ?? today();
          const payments = connection
            .repository('eduThanhToan')
            .withPolicy(paymentPolicy);
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
              nguoiGhiNhanId: userId,
            },
          });
          const id = Number(created.record.id);
          if (!(await payments.findOne({ filter: { id } }))) {
            throw eduError(
              'PERMISSION_DENIED',
              'EDU_OUT_OF_SCOPE',
              'You may not record a payment here.',
            );
          }
          return { id, conNo: due - input.soTien };
        });
        return c.json({ data: result }, 201);
      },
    );

    router.post(
      '/thanhToan/vietQr',
      declare('Build the VietQR transfer code of a package', 'buildVietQr'),
      needs('edu.goiHoc', 'view'),
      apiValidator('json', QrInput),
      async (c) => {
        const { goiHocId } = c.req.valid('json');
        const config = vietQrConfig(process.env);
        if (!config) {
          throw eduError(
            'FAILED_PRECONDITION',
            'EDU_VIETQR_NOT_CONFIGURED',
            'The bank account for VietQR is not configured.',
          );
        }
        const pack = await database
          .repository('eduGoiHoc')
          .withPolicy(policyOf(c, 'eduGoiHoc'))
          .findOne({ filter: { id: goiHocId } });
        if (!pack)
          throw notFound('EDU_PACKAGE_NOT_FOUND', 'Package not found.');
        const student = await database
          .connection()
          .query.selectFrom('eduHocVien')
          .select('ma')
          .where('id', '=', Number(pack.hocVienId))
          .executeTakeFirstOrThrow();
        const due =
          Number(pack.thanhTien) -
          (await paidFor(database.connection(), goiHocId));
        const content = `${asText(student.ma)} G${goiHocId}`;
        return c.json({
          data: {
            soTien: due,
            noiDungCk: content,
            url: vietQrUrl(config, due, content),
          },
        });
      },
    );

    // --- Which sessions were deducted from a package (first in, first out), worked out when read ------------------
    router.post(
      '/goiHoc/chiTiet',
      declare(
        'The sessions deducted from a package, first in first out',
        'packageDetail',
      ),
      needs('edu.goiHoc', 'view'),
      apiValidator('json', DetailInput),
      async (c) => {
        const { goiHocId } = c.req.valid('json');
        const packagePolicy = policyOf(c, 'eduGoiHoc');
        const pack = await database
          .repository('eduGoiHoc')
          .withPolicy(packagePolicy)
          .findOne({ filter: { id: goiHocId } });
        if (!pack)
          throw notFound('EDU_PACKAGE_NOT_FOUND', 'Package not found.');
        const hocVienId = Number(pack.hocVienId);
        // The ledger needs its own permission: whoever may see packages but not the ledger is refused here.
        const ledgerPolicy = (await policiesOf(c, 'edu.soDu', 'view'))[
          'eduSoDuNhatKy'
        ];
        if (!ledgerPolicy)
          throw eduError(
            'PERMISSION_DENIED',
            'EDU_PERMISSION_DENIED',
            'This action is not allowed.',
          );
        const packages = await readAll(async (limit, offset) =>
          database
            .repository('eduGoiHoc')
            .withPolicy(packagePolicy)
            .findMany({
              filter: (f) => f.number('hocVienId').eq(hocVienId),
              sort: (s) => s.field('id').asc(),
              limit,
              offset,
            }),
        );
        const ledger = await readAll(async (limit, offset) =>
          database
            .repository('eduSoDuNhatKy')
            .withPolicy(ledgerPolicy)
            .findMany({
              filter: (f) => f.number('hocVienId').eq(hocVienId),
              sort: (s) => s.field('id').asc(),
              limit,
              offset,
            }),
        );
        const attendanceIds = [
          ...new Set(
            ledger
              .filter((row) => row.diemDanhId != null)
              .map((row) => Number(row.diemDanhId)),
          ),
        ];
        const sessions = await sessionsOf(database.connection(), attendanceIds);
        const sessionTime = new Map(
          [...sessions].map(([id, info]) => [
            id,
            `${info.ngay} ${info.gioBatDau}`,
          ]),
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
        const result = allocateFifo(inputs, deductions);
        const mine = result.cacGoi.find((entry) => entry.goiHocId === goiHocId);
        if (!mine)
          throw notFound('EDU_PACKAGE_NOT_FOUND', 'Package not found.');
        const describe = (diemDanhId: number | null, soBuoi: number) => {
          const info =
            diemDanhId === null ? undefined : sessions.get(diemDanhId);
          return {
            diemDanhId,
            soBuoi,
            buoiHocId: info?.buoiHocId ?? null,
            lopId: info?.lopId ?? null,
            ngay: info?.ngay ?? null,
            gioBatDau: info?.gioBatDau ?? null,
            trangThai: info?.trangThai ?? null,
          };
        };
        return c.json({
          data: {
            goiHoc: {
              id: goiHocId,
              hocVienId,
              soBuoi: mine.soBuoi,
              ngayMua: mine.ngayMua,
              loai: mine.loai,
              trangThai: asText(pack.trangThai),
            },
            daDung: mine.daDung,
            conLai: mine.conLai,
            cacBuoi: mine.cacLanTru.map((entry, index) => ({
              stt: index + 1,
              ...describe(entry.diemDanhId, entry.soBuoi),
            })),
            // Sessions the student attended beyond everything they paid for.
            vuotSoDu: result.vuotSoDu.reduce(
              (sum, entry) => sum + entry.soBuoi,
              0,
            ),
          },
        });
      },
    );

    // --- Student full audit trail (Tuition cycles, sessions, books) --------------------------------------------
    router.post(
      '/hocVien/doiSoatTongThe',
      declare('Full audit trail of sessions, tuition cycles and books', 'studentAuditTrail'),
      needs('edu.hocVien', 'view'),
      apiValidator('json', DoiSoatInput),
      async (c) => {
        const input = c.req.valid('json');
        const hocVienId = input.hocVienId;
        const studentPolicy = (await policiesOf(c, 'edu.hocVien', 'view')).eduHocVien;
        const connection = database.connection();
        const student = studentPolicy
          ? await database
              .repository('eduHocVien')
              .withPolicy(studentPolicy)
              .findOne({ filter: { id: hocVienId } })
          : null;
        if (!student) throw notFound('EDU_STUDENT_NOT_FOUND', 'Student not found.');

        let lopTen: string | null = null;
        if (student.lopId) {
          const lop = await connection.query
            .selectFrom('eduLop')
            .select('ten')
            .where('id', '=', Number(student.lopId))
            .executeTakeFirst();
          if (lop) lopTen = asText(lop.ten);
        }
        let coSoTen: string | null = null;
        if (student.coSoId) {
          const coSo = await connection.query
            .selectFrom('eduCoSo')
            .select('ten')
            .where('id', '=', Number(student.coSoId))
            .executeTakeFirst();
          if (coSo) coSoTen = asText(coSo.ten);
        }

        const packages = await connection.query
          .selectFrom('eduGoiHoc')
          .selectAll()
          .where('hocVienId', '=', hocVienId)
          .orderBy('id', 'asc')
          .execute();

        const payments = await connection.query
          .selectFrom('eduThanhToan')
          .selectAll()
          .where('hocVienId', '=', hocVienId)
          .execute();

        const issuedBooks = await connection.query
          .selectFrom('eduPhatSach')
          .innerJoin('eduSach', 'eduSach.id', 'eduPhatSach.sachId')
          .select([
            'eduPhatSach.id',
            'eduPhatSach.ngayPhat',
            'eduPhatSach.soLuong',
            'eduPhatSach.trangThaiThanhToan',
            'eduSach.ten as tenSach',
            'eduSach.giaBia',
          ])
          .where('eduPhatSach.hocVienId', '=', hocVienId)
          .orderBy('eduPhatSach.ngayPhat', 'desc')
          .execute();

        const ledger = await readAll(async (limit, offset) =>
          connection.query
            .selectFrom('eduSoDuNhatKy')
            .selectAll()
            .where('hocVienId', '=', hocVienId)
            .orderBy('id', 'asc')
            .limit(limit)
            .offset(offset)
            .execute(),
        );

        const attendanceIds = [
          ...new Set(
            ledger
              .filter((row) => row.diemDanhId != null)
              .map((row) => Number(row.diemDanhId)),
          ),
        ];
        const sessions = await sessionsOf(connection, attendanceIds);
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
            loai: asText(row.loai) === 'chuyen_so_du' ? ('chuyen_so_du' as const) : ('mua' as const),
          })),
          ...adjustments,
        ];
        const fifoResult = allocateFifo(inputs, deductions);
        const fifoByGoi = new Map(fifoResult.cacGoi.map((g) => [g.goiHocId, g]));

        const attendanceRows = await connection.query
          .selectFrom('eduDiemDanh')
          .innerJoin('eduBuoiHoc', 'eduBuoiHoc.id', 'eduDiemDanh.buoiHocId')
          .leftJoin('eduLop', 'eduLop.id', 'eduBuoiHoc.lopId')
          .select([
            'eduDiemDanh.id as diemDanhId',
            'eduDiemDanh.buoiHocId',
            'eduDiemDanh.trangThai',
            'eduDiemDanh.daLamBtvn',
            'eduDiemDanh.nhanXet',
            'eduDiemDanh.soBuoiDaTru',
            'eduDiemDanh.yThucDiem',
            'eduBuoiHoc.ngay',
            'eduBuoiHoc.gioBatDau',
            'eduBuoiHoc.gioKetThuc',
            'eduLop.ten as lopTen',
          ])
          .where('eduDiemDanh.hocVienId', '=', hocVienId)
          .orderBy('eduBuoiHoc.ngay', 'desc')
          .orderBy('eduBuoiHoc.gioBatDau', 'desc')
          .execute();

        let tongTienHocPhi = 0;
        let tongDaThanhToanHocPhi = 0;
        const cacKyNop = packages.map((pack) => {
          const packId = Number(pack.id);
          const thanhTien = Number(pack.thanhTien);
          tongTienHocPhi += thanhTien;
          const paid = payments
            .filter((p) => Number(p.goiHocId) === packId)
            .reduce((sum, p) => sum + Number(p.soTien), 0);
          tongDaThanhToanHocPhi += paid;
          const fifo = fifoByGoi.get(packId);
          return {
            id: packId,
            tenKy: `Gói ${pack.soBuoi} buổi (${asText(pack.ngayMua)})`,
            ngayMua: asText(pack.ngayMua),
            soBuoi: Number(pack.soBuoi),
            donGia: Number(pack.donGia),
            thanhTien,
            daThanhToan: paid,
            conNo: Math.max(0, thanhTien - paid),
            daDung: fifo?.daDung ?? 0,
            conLai: fifo?.conLai ?? 0,
            trangThai: asText(pack.trangThai),
          };
        });

        const tongTienSach = issuedBooks.reduce(
          (sum, b) => sum + Number(b.soLuong) * Number(b.giaBia),
          0,
        );
        const tongSoBuoiDaMua = packages.reduce((sum, p) => sum + Number(p.soBuoi), 0);
        const tongSoBuoiDaHoc = attendanceRows.reduce(
          (sum, a) => sum + Number(a.soBuoiDaTru),
          0,
        );
        const vuotSoDu = fifoResult.vuotSoDu.reduce((sum, e) => sum + e.soBuoi, 0);

        return c.json({
          data: {
            hocVien: {
              id: Number(student.id),
              ma: asText(student.ma),
              hoTen: asText(student.hoTen),
              lopId: student.lopId ? Number(student.lopId) : null,
              lopTen,
              coSoId: student.coSoId ? Number(student.coSoId) : null,
              coSoTen,
              soBuoiConLai: Number(student.soBuoiConLai),
              trangThai: asText(student.trangThai),
            },
            tongHop: {
              tongSoBuoiDaMua,
              tongSoBuoiDaHoc,
              soBuoiConLai: Number(student.soBuoiConLai),
              soBuoiVuotGoi: vuotSoDu,
              tongTienHocPhi,
              tongTienSach,
              tongDaThanhToan: tongDaThanhToanHocPhi,
              tongConNo: Math.max(0, tongTienHocPhi - tongDaThanhToanHocPhi),
            },
            cacKyNop,
            sachDaPhat: issuedBooks.map((b) => ({
              id: Number(b.id),
              tenSach: asText(b.tenSach),
              ngayPhat: asText(b.ngayPhat),
              soLuong: Number(b.soLuong),
              giaBia: Number(b.giaBia),
              thanhTien: Number(b.soLuong) * Number(b.giaBia),
              trangThaiThanhToan: asText(b.trangThaiThanhToan),
            })),
            danhSachBuoiHoc: attendanceRows.map((a) => ({
              diemDanhId: Number(a.diemDanhId),
              buoiHocId: Number(a.buoiHocId),
              ngay: asText(a.ngay),
              gioBatDau: asText(a.gioBatDau),
              gioKetThuc: asText(a.gioKetThuc),
              lopTen: asText(a.lopTen),
              trangThai: asText(a.trangThai),
              daLamBtvn: Boolean(a.daLamBtvn),
              nhanXet: a.nhanXet ? asText(a.nhanXet) : '',
              yThucDiem: a.yThucDiem != null ? Number(a.yThucDiem) : null,
              soBuoiDaTru: Number(a.soBuoiDaTru),
            })),
          },
        });
      },
    );

    // --- Low balance --------------------------------------------------------------------------------------------
    router.post(
      '/soDu/canhBao',
      declare('Students with few sessions left', 'lowBalance'),
      needs('edu.hocVien', 'view'),
      async (c) => {
        const rows = await database
          .repository('eduHocVien')
          .withPolicy(policyOf(c, 'eduHocVien'))
          .findMany({
            filter: (f) =>
              f.and([
                f.string('trangThai').eq('dang_hoc'),
                f.number('soBuoiConLai').lte(LOW_BALANCE_THRESHOLD),
              ]),
            sort: (s) => s.field('soBuoiConLai').asc(),
            limit: 200,
          });
        return c.json({
          data: rows.map((row) => ({
            id: Number(row.id),
            ma: asText(row.ma),
            hoTen: asText(row.hoTen),
            lopId: row.lopId == null ? null : Number(row.lopId),
            soBuoiConLai: Number(row.soBuoiConLai),
          })),
        });
      },
    );

    return new Hono().route('/', router);
  }),
];

type Query = ReturnType<DatabaseManager['connection']>['query'];
type Queryable = { readonly query: Query };

const conflict = () =>
  eduError(
    'FAILED_PRECONDITION',
    'EDU_BALANCE_CONFLICT',
    'The attendance or balance was changed at the same time. Reload and try again.',
  );

/**
 * The club's calendar day (Vietnam time) of a stored value. A timestamp is read as UTC, so an entry made at 02:00 on
 * the 11th in Hanoi (19:00 on the 10th UTC) belongs to the 11th; a plain `YYYY-MM-DD` is already a calendar day.
 */
const toDay = (value: unknown): string => {
  if (value instanceof Date) return todayVn(value);
  const raw = asText(value);
  if (raw.length <= 10) return raw;
  const iso = raw.replace(' ', 'T');
  const stamp = new Date(/(?:Z|[+-]\d\d:?\d\d)$/u.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(stamp.getTime()) ? raw.slice(0, 10) : todayVn(stamp);
};

/** Reads every page of a query (the server returns at most 100 rows at a time). */
async function readAll(
  page: (
    limit: number,
    offset: number,
  ) => Promise<readonly Record<string, unknown>[]>,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 20_000; offset += 100) {
    const batch = await page(100, offset);
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows;
}

/** The session behind each attendance row: day, start time, class and status. */
async function sessionsOf(
  connection: Queryable,
  attendanceIds: readonly number[],
): Promise<
  Map<
    number,
    {
      buoiHocId: number;
      lopId: number;
      ngay: string;
      gioBatDau: string;
      trangThai: string;
    }
  >
> {
  const result = new Map<
    number,
    {
      buoiHocId: number;
      lopId: number;
      ngay: string;
      gioBatDau: string;
      trangThai: string;
    }
  >();
  for (let i = 0; i < attendanceIds.length; i += 200) {
    const chunk = attendanceIds.slice(i, i + 200);
    const marks = await connection.query
      .selectFrom('eduDiemDanh')
      .select(['id', 'buoiHocId', 'trangThai'])
      .where('id', 'in', chunk)
      .execute();
    const sessionIds = [...new Set(marks.map((row) => Number(row.buoiHocId)))];
    if (sessionIds.length === 0) continue;
    const sessions = await connection.query
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

async function balanceOf(
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

async function paidFor(
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
async function moveBalance(
  connection: Queryable,
  change: {
    hocVienId: number;
    before: number;
    after: number;
    reason: 'diem_danh' | 'diem_danh_sua' | 'mua_goi' | 'chuyen_tu_lark';
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
