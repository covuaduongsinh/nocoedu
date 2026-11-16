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
import { reminderThresholds } from '../edu/nguong-nhac.js';
import {
  allocateFifo,
  fromLedger,
  type PackageInput,
} from '../edu/phan-bo-goi.js';
import {
  adjustBalance,
  paidFor,
  recordPayment,
  saveAttendance,
  sellPackage,
} from '../edu/ghi-so-du.js';
import {
  ATTENDANCE_STATUSES,
  datesBetween,
  todayVn,
  vietQrConfig,
  vietQrUrl,
  weekdayOf,
} from '../edu/so-du.js';
import {
  currentUserId,
  eduError,
  needs,
  optionalPoliciesOf,
  policiesOf,
  policyOf,
  writeOnce,
  type EduEnv,
} from './edu-support.js';

/**
 * Sessions, attendance, balance and tuition.
 *
 * Every route authenticates, authorizes its composite action first and then reads and writes only through the policy
 * that action was granted. The balance of a student (`eduHocVien.soBuoiConLai`) is never written by a client: it moves
 * only in `server/edu/ghi-so-du.ts`, inside the transaction that also writes the ledger row (`eduSoDuNhatKy`), and
 * every move is guarded by the balance it was computed from, so two requests at once cannot both apply the same change.
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

/** `huy: true` calls a session off; `false` opens it again. */
const CancelInput = z.object({ buoiHocId: Id, huy: z.boolean() });

/** A balance set by hand: what the person saw, what it should be, and why. */
const AdjustInput = z.object({
  hocVienId: Id,
  soDuHienTai: z.number().int().min(-10_000).max(10_000),
  soDuMoi: z.number().int().min(-1000).max(5000),
  lyDo: z.string().trim().min(3).max(500),
});

const ReceiptInput = z.object({ thanhToanId: Id });
const QrInput = z.object({ goiHocId: Id });
const DetailInput = z.object({ goiHocId: Id });
const StudentInput = z.object({ hocVienId: Id });

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
      '/buoiHoc/huy',
      '/diemDanh/luu',
      '/goiHoc/taoMoi',
      '/goiHoc/chiTiet',
      '/goiHoc/cuaHocVien',
      '/thanhToan/ghiNhan',
      '/thanhToan/vietQr',
      '/thanhToan/phieuThu',
      '/soDu/canhBao',
      '/soDu/dieuChinh',
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

    // --- A session that is not held (a holiday, the coach away) -------------------------------------------------
    // It is called off rather than deleted, so the timetable does not create it again and it stops counting as a
    // register that is still due. Only a session nobody was marked in can be called off: marks moved balances.
    router.post(
      '/buoiHoc/huy',
      declare('Call a session off, or open it again', 'cancelSession'),
      needs('edu.buoiHoc', 'manage'),
      apiValidator('json', CancelInput),
      async (c) => {
        const input = c.req.valid('json');
        const policy = policyOf(c, 'eduBuoiHoc');
        const result = await database.transaction(async (connection) => {
          const session = await connection
            .repository('eduBuoiHoc')
            .withPolicy(policy)
            .findOne({ filter: { id: input.buoiHocId } });
          if (!session)
            throw notFound('EDU_SESSION_NOT_FOUND', 'Session not found.');
          const from = input.huy ? 'du_kien' : 'huy';
          const to = input.huy ? 'huy' : 'du_kien';
          if (session.trangThai === to) {
            return { buoiHocId: input.buoiHocId, trangThai: to };
          }
          const refused = () =>
            eduError(
              'FAILED_PRECONDITION',
              'EDU_SESSION_HAS_ATTENDANCE',
              'A session with attendance cannot be called off.',
            );
          const marked = await connection.query
            .selectFrom('eduDiemDanh')
            .select('id')
            .where('buoiHocId', '=', input.buoiHocId)
            .executeTakeFirst();
          if (marked || session.trangThai !== from) throw refused();
          // Guarded by the status it was read with: a register saved at the same moment wins.
          const updated = await connection.query
            .updateTable('eduBuoiHoc')
            .set({ trangThai: to })
            .where('id', '=', input.buoiHocId)
            .where('trangThai', '=', from)
            .execute();
          if (updated.updatedCount !== 1) throw refused();
          return { buoiHocId: input.buoiHocId, trangThai: to };
        });
        return c.json({ data: result });
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
        const result = await database.transaction((connection) =>
          saveAttendance(connection, {
            buoiHocId: input.buoiHocId,
            danhSach: input.danhSach.map((entry) => ({
              hocVienId: entry.hocVienId,
              trangThai: entry.trangThai,
              daLamBtvn: entry.daLamBtvn,
              nhanXet: entry.nhanXet ?? null,
            })),
            userId,
            policies: {
              attendance: attendancePolicy,
              session: sessionPolicy,
              student: studentPolicy,
            },
          }),
        );
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
        const result = await writeOnce(c, {
          database,
          appName: app.appName,
          operation: `edu/goiHoc/taoMoi/${input.hocVienId}`,
          input,
          execute: (connection) =>
            sellPackage(connection, {
              hocVienId: input.hocVienId,
              soBuoi: input.soBuoi,
              donGia: input.donGia,
              ngayMua: input.ngayMua,
              userId,
              policies: { package: packagePolicy, student: studentPolicy },
            }),
          stillVisible: async (sold) =>
            Boolean(
              await database
                .repository('eduGoiHoc')
                .withPolicy(packagePolicy)
                .findOne({ filter: { id: sold.id } }),
            ),
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
        const result = await writeOnce(c, {
          database,
          appName: app.appName,
          operation: `edu/thanhToan/ghiNhan/${input.goiHocId}`,
          input,
          execute: (connection) =>
            recordPayment(connection, {
              goiHocId: input.goiHocId,
              soTien: input.soTien,
              hinhThuc: input.hinhThuc,
              ngay: input.ngay,
              noiDungCk: input.noiDungCk ?? null,
              userId,
              policies: { payment: paymentPolicy, package: packagePolicy },
            }),
          stillVisible: async (paid) =>
            Boolean(
              await database
                .repository('eduThanhToan')
                .withPolicy(paymentPolicy)
                .findOne({ filter: { id: paid.id } }),
            ),
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

    // --- What a receipt shows ----------------------------------------------------------------------------------
    // The payment comes through the caller's payment policy; the student, the package and the branch it names are
    // then read for exactly that payment. A payment outside the scope is "not found".
    router.post(
      '/thanhToan/phieuThu',
      declare('What the receipt of a payment shows', 'paymentReceipt'),
      needs('edu.thanhToan', 'view'),
      apiValidator('json', ReceiptInput),
      async (c) => {
        const { thanhToanId } = c.req.valid('json');
        const payment = await database
          .repository('eduThanhToan')
          .withPolicy(policyOf(c, 'eduThanhToan'))
          .findOne({ filter: { id: thanhToanId } });
        if (!payment)
          throw notFound('EDU_PAYMENT_NOT_FOUND', 'Payment not found.');
        const q = database.connection().query;
        const [student, branch, pack, collector] = await Promise.all([
          q
            .selectFrom('eduHocVien')
            .select(['ma', 'hoTen', 'lopId'])
            .where('id', '=', Number(payment.hocVienId))
            .executeTakeFirst(),
          q
            .selectFrom('eduCoSo')
            .select(['ten', 'diaChi'])
            .where('id', '=', Number(payment.coSoId))
            .executeTakeFirst(),
          payment.goiHocId == null
            ? undefined
            : q
                .selectFrom('eduGoiHoc')
                .select(['id', 'soBuoi', 'donGia', 'thanhTien', 'ngayMua'])
                .where('id', '=', Number(payment.goiHocId))
                .executeTakeFirst(),
          q
            .selectFrom('user')
            .select('name')
            .where('id', '=', asText(payment.nguoiGhiNhanId))
            .executeTakeFirst(),
        ]);
        const lop =
          student?.lopId == null
            ? undefined
            : await q
                .selectFrom('eduLop')
                .select('ten')
                .where('id', '=', Number(student.lopId))
                .executeTakeFirst();
        // What was paid for the package up to and including this payment, and what is still owed after it.
        const earlier = pack
          ? await q
              .selectFrom('eduThanhToan')
              .select(['id', 'soTien'])
              .where('goiHocId', '=', Number(pack.id))
              .execute()
          : [];
        const daThu = earlier
          .filter((row) => Number(row.id) <= thanhToanId)
          .reduce((sum, row) => sum + Number(row.soTien), 0);
        return c.json({
          data: {
            id: thanhToanId,
            soPhieu: payment.soPhieu ? asText(payment.soPhieu) : null,
            ngay: asText(payment.ngay),
            soTien: Number(payment.soTien),
            hinhThuc: asText(payment.hinhThuc),
            noiDungCk: payment.noiDungCk ? asText(payment.noiDungCk) : null,
            nguoiThu: collector ? asText(collector.name) : null,
            coSo: branch
              ? {
                  ten: asText(branch.ten),
                  diaChi: branch.diaChi ? asText(branch.diaChi) : null,
                }
              : null,
            hocVien: student
              ? {
                  ma: asText(student.ma),
                  hoTen: asText(student.hoTen),
                  lop: lop ? asText(lop.ten) : null,
                }
              : null,
            goiHoc: pack
              ? {
                  id: Number(pack.id),
                  soBuoi: Number(pack.soBuoi),
                  donGia: Number(pack.donGia),
                  thanhTien: Number(pack.thanhTien),
                  ngayMua: asText(pack.ngayMua),
                  daThu,
                  conNo: Math.max(0, Number(pack.thanhTien) - daThu),
                }
              : null,
          },
        });
      },
    );

    // --- The packages of one student with what was paid for each ------------------------------------------------
    // Packages come through the caller's package policy, so a student outside the scope simply has none. Amounts
    // paid and the payments themselves are added only for a caller who may view payments.
    router.post(
      '/goiHoc/cuaHocVien',
      declare(
        'The packages of a student, what was paid for each and the payments',
        'studentPackages',
      ),
      needs('edu.goiHoc', 'view'),
      apiValidator('json', StudentInput),
      async (c) => {
        const { hocVienId } = c.req.valid('json');
        const packagePolicy = policyOf(c, 'eduGoiHoc');
        const paymentPolicy = (
          await optionalPoliciesOf(c, 'edu.thanhToan', 'view')
        )?.eduThanhToan;
        const packs = await readAll(async (limit, offset) =>
          database
            .repository('eduGoiHoc')
            .withPolicy(packagePolicy)
            .findMany({
              filter: (f) => f.number('hocVienId').eq(hocVienId),
              sort: (s) => s.field('id').desc(),
              limit,
              offset,
            }),
        );
        const payments = paymentPolicy
          ? await readAll(async (limit, offset) =>
              database
                .repository('eduThanhToan')
                .withPolicy(paymentPolicy)
                .findMany({
                  filter: (f) => f.number('hocVienId').eq(hocVienId),
                  sort: (s) => s.field('id').desc(),
                  limit,
                  offset,
                }),
            )
          : null;
        const paid = new Map<number, number>();
        for (const payment of payments ?? []) {
          if (payment.goiHocId == null) continue;
          const id = Number(payment.goiHocId);
          paid.set(id, (paid.get(id) ?? 0) + Number(payment.soTien));
        }
        return c.json({
          data: {
            goi: packs.map((pack) => {
              const daThu = payments ? (paid.get(Number(pack.id)) ?? 0) : null;
              return {
                id: Number(pack.id),
                ngayMua: asText(pack.ngayMua),
                soBuoi: Number(pack.soBuoi),
                donGia: Number(pack.donGia),
                thanhTien: Number(pack.thanhTien),
                trangThai: asText(pack.trangThai),
                loai: asText(pack.loai),
                daThu,
                conNo:
                  daThu === null
                    ? null
                    : Math.max(0, Number(pack.thanhTien) - daThu),
              };
            }),
            thanhToan: payments
              ? payments.map((payment) => ({
                  id: Number(payment.id),
                  goiHocId:
                    payment.goiHocId == null ? null : Number(payment.goiHocId),
                  soPhieu: payment.soPhieu ? asText(payment.soPhieu) : null,
                  ngay: asText(payment.ngay),
                  soTien: Number(payment.soTien),
                  hinhThuc: asText(payment.hinhThuc),
                  noiDungCk: payment.noiDungCk
                    ? asText(payment.noiDungCk)
                    : null,
                }))
              : null,
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

    // --- A balance set by hand, with a reason -----------------------------------------------------------------
    // Its own action (`edu.soDu` `adjust`): it is how a refund of sessions, a correction and a balance that
    // disagrees with the ledger are settled, and every one leaves a ledger row with the reason and who did it.
    router.post(
      '/soDu/dieuChinh',
      declare('Set a balance by hand, with a reason', 'adjustBalance'),
      needs('edu.soDu', 'adjust'),
      apiValidator('json', AdjustInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const studentPolicy = (await policiesOf(c, 'edu.hocVien', 'view'))
          .eduHocVien;
        const result = await writeOnce(c, {
          database,
          appName: app.appName,
          operation: `edu/soDu/dieuChinh/${input.hocVienId}`,
          input,
          execute: (connection) =>
            adjustBalance(connection, {
              hocVienId: input.hocVienId,
              soDuHienTai: input.soDuHienTai,
              soDuMoi: input.soDuMoi,
              lyDo: input.lyDo,
              userId,
              policies: { student: studentPolicy },
            }),
          stillVisible: async () =>
            Boolean(
              studentPolicy &&
              (await database
                .repository('eduHocVien')
                .withPolicy(studentPolicy)
                .findOne({ filter: { id: input.hocVienId } })),
            ),
        });
        return c.json({ data: result });
      },
    );

    // --- Low balance --------------------------------------------------------------------------------------------
    router.post(
      '/soDu/canhBao',
      declare('Students with few sessions left', 'lowBalance'),
      needs('edu.hocVien', 'view'),
      async (c) => {
        // Each branch says at which balance it starts reminding; the query asks up to the highest of them.
        const thresholds = await reminderThresholds(database.connection());
        const rows = await database
          .repository('eduHocVien')
          .withPolicy(policyOf(c, 'eduHocVien'))
          .findMany({
            filter: (f) =>
              f.and([
                f.string('trangThai').eq('dang_hoc'),
                f.number('soBuoiConLai').lte(thresholds.highest),
              ]),
            sort: (s) => s.field('soBuoiConLai').asc(),
            limit: 200,
          });
        return c.json({
          data: rows
            .filter((row) => thresholds.isLow(row))
            .map((row) => ({
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
