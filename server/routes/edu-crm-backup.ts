import { createHash, timingSafeEqual } from 'node:crypto';

import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  apiErrorResponses,
  apiValidator,
  ApiError,
  dataResponse,
  defineApiRoutes,
  describeRoute,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { toCsv } from '../edu/csv.js';
import { anyOf } from '../edu/filters.js';
import { asText } from '../edu/names.js';
import { chunksOf, PAGE, readAllRows, type Row } from '../edu/read-all.js';
import { todayVn } from '../edu/so-du.js';
import {
  currentUserId,
  eduError,
  needs,
  policiesOf,
  type EduEnv,
} from './edu-support.js';

/**
 * Three unrelated things live here, each with its own guard:
 *
 * - `/edu/crm/lead-sync` is a webhook for NocoCRM. There is no signed-in user, so it is guarded by a shared secret that
 *   comes from `EDU_CRM_WEBHOOK_TOKEN` only: with no secret configured every call is refused (there is no default), and
 *   the secret travels in the `x-crm-token` header (never in the address, which ends up in logs).
 * - `/heThong/backup/*` is the whole-database snapshot and restore. Only the administrator holds `edu.heThong`
 *   (`backup`, `restore`); it is the one place that reads and writes tables directly, because a snapshot is not a report
 *   of what one branch may see. Every use writes one `eduXuatDuLieuNhatKy` row.
 * - `/diemDanh/xuatCsv` and `/hocPhi/xuatCsv` are exports: they need the `export` action of `edu.baoCao` (a coach sees
 *   attendance on screen but cannot take the file), read only through the policies of the data they list, write one
 *   `eduXuatDuLieuNhatKy` row (who, which export, how many rows, never names) and put every cell through `csvCell`.
 */

/** A snapshot or an export of more rows than this is refused: narrow it instead of building a file in memory. */
export const MAX_CSV_ROWS = 20_000;
/** Rows read from one table per query while taking a snapshot. */
const SNAPSHOT_PAGE = 5000;
/** A snapshot holds at most this many rows in all (it is built in memory and sent as one JSON document). */
export const MAX_SNAPSHOT_ROWS = 500_000;

/** The tables of a snapshot, in the order a restore writes them (parents before the rows that point at them). */
export const BACKUP_TABLES = [
  'eduCoSo',
  'eduLop',
  'eduLopLich',
  'eduHocVien',
  'eduPhuHuynh',
  'eduHocVienPhuHuynh',
  'eduBuoiHoc',
  'eduDiemDanh',
  'eduGoiHoc',
  'eduThanhToan',
  'eduSoDuNhatKy',
  'eduNhanXetThang',
  'eduSach',
  'eduPhatSach',
  'eduLienHe',
] as const;

const CrmLeadInput = z.object({
  hoTen: z.string().trim().min(1).max(191),
  soDienThoai: z.string().trim().min(8).max(20),
  coSoId: z.coerce.number().int().positive().optional(),
  kenhTiepNhan: z.string().trim().max(64).default('nococrm'),
  ghiChu: z.string().trim().max(1000).optional(),
  ngayHenHocThu: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional(),
});

const BackupImportInput = z.object({
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  xacNhan: z.literal('XAC_NHAN_KHOI_PHUC'),
});

const DiemDanhExportInput = z.object({
  lopId: z.coerce.number().int().positive().optional(),
  thang: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
    .optional(),
});

const HocPhiExportInput = z.object({
  coSoId: z.coerce.number().int().positive().optional(),
});

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

const digest = (value: string): Buffer =>
  createHash('sha256').update(value).digest();

/** Constant-time comparison of the presented secret with the configured one. */
function sameSecret(presented: string, expected: string): boolean {
  return timingSafeEqual(digest(presented), digest(expected));
}

/**
 * The guard of the CRM webhook. Runs before the input is read, so a caller without the secret learns nothing about
 * the input. No secret configured = nobody may call (503-like refusal as 403), never a built-in default.
 */
const crmWebhookGuard: MiddlewareHandler<EduEnv> = async (c, next) => {
  const expected = process.env.EDU_CRM_WEBHOOK_TOKEN?.trim();
  if (!expected) {
    throw eduError(
      'PERMISSION_DENIED',
      'CRM_SYNC_NOT_CONFIGURED',
      'CRM synchronization is not configured on this server.',
    );
  }
  const presented = c.req.header('x-crm-token') ?? '';
  if (!presented || !sameSecret(presented, expected)) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'CRM_INVALID_TOKEN',
      domain: 'edu',
      message: 'Invalid CRM sync token.',
    });
  }
  await next();
};

const STATUS_LABEL: Record<string, string> = {
  co_mat: 'Có mặt',
  hoc_bu: 'Học bù',
  vang_co_phep: 'Vắng có phép',
  vang_khong_phep: 'Vắng không phép',
};

const outOfScope = () =>
  eduError(
    'PERMISSION_DENIED',
    'EDU_OUT_OF_SCOPE',
    'You may not export this branch or class.',
  );

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    // The webhook has no session: its own guard, small body.
    router.use(
      '/edu/crm/lead-sync',
      crmWebhookGuard,
      bodyLimit({ maxSize: 16 * 1024 }),
    );
    for (const path of [
      '/heThong/backup/exportJson',
      '/diemDanh/xuatCsv',
      '/hocPhi/xuatCsv',
    ]) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 4 * 1024 }),
      );
    }
    router.use(
      '/heThong/backup/importJson',
      auth.required(),
      authz.middleware(),
      bodyLimit({ maxSize: 10 * 1024 * 1024 }),
    );

    const log = async (
      userId: string,
      loai: string,
      boLoc: Record<string, unknown>,
      soDong: number,
    ): Promise<void> => {
      await database
        .connection()
        .query.insertInto('eduXuatDuLieuNhatKy')
        .values({ userId, loai, boLoc, soDong, createdAt: new Date() })
        .execute();
    };

    // --- CRM lead webhook ---------------------------------------------------------------------------------------
    router.post(
      '/edu/crm/lead-sync',
      describeRoute({
        tags: ['NocoEdu', 'NocoCRM'],
        summary: 'Synchronize a lead from NocoCRM into admissions',
        operationId: 'crmLeadSync',
        responses: {
          '200': dataResponse(z.object({}).passthrough()),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CrmLeadInput),
      async (c) => {
        const input = c.req.valid('json');
        const q = database.connection().query;
        const branch = input.coSoId
          ? await q
              .selectFrom('eduCoSo')
              .select('id')
              .where('id', '=', input.coSoId)
              .executeTakeFirst()
          : await q
              .selectFrom('eduCoSo')
              .select('id')
              .orderBy('id', 'asc')
              .executeTakeFirst();
        if (!branch) {
          throw eduError(
            'FAILED_PRECONDITION',
            'EDU_BRANCH_NOT_FOUND',
            'There is no branch to attach the lead to.',
            'coSoId',
          );
        }
        await q
          .insertInto('eduLienHe')
          .values({
            hoTen: input.hoTen,
            soDienThoai: input.soDienThoai,
            coSoId: Number(branch.id),
            trangThai: 'moi',
            kenh: input.kenhTiepNhan,
            ghiChu: input.ghiChu
              ? `[NocoCRM] ${input.ghiChu}`
              : '[NocoCRM Đồng bộ]',
            ngayNhac: input.ngayHenHocThu ?? null,
            ngayTao: todayVn(),
          })
          .execute();
        return c.json({
          data: {
            thanhCong: true,
            thongBao:
              'Đã đồng bộ lead từ NocoCRM vào NocoEdu Tuyển sinh thành công.',
          },
        });
      },
    );

    // --- Whole-database snapshot (administrator only) -----------------------------------------------------------
    router.post(
      '/heThong/backup/exportJson',
      declare(
        'Export full system database backup snapshot as JSON',
        'exportBackupJson',
      ),
      needs('edu.heThong', 'backup'),
      async (c) => {
        const userId = currentUserId(c);
        const q = database.connection().query;
        const snapshot: Record<string, unknown[]> = {};
        let total = 0;
        for (const table of BACKUP_TABLES) {
          const rows: unknown[] = [];
          for (let offset = 0; ; offset += SNAPSHOT_PAGE) {
            const page = await q
              .selectFrom(table)
              .selectAll()
              .orderBy('id', 'asc')
              .limit(SNAPSHOT_PAGE)
              .offset(offset)
              .execute();
            rows.push(...page);
            total += page.length;
            if (total > MAX_SNAPSHOT_ROWS) {
              throw eduError(
                'FAILED_PRECONDITION',
                'EDU_BACKUP_TOO_LARGE',
                'The database is too large for one JSON snapshot.',
              );
            }
            if (page.length < SNAPSHOT_PAGE) break;
          }
          snapshot[table] = rows;
        }
        await log(userId, 'sao_luu_json', {}, total);
        return c.json({
          data: {
            phienBan: '1.0',
            thoiGianTao: new Date().toISOString(),
            ngayVn: todayVn(),
            tongSoBang: BACKUP_TABLES.length,
            soBanGhi: total,
            duLieu: snapshot,
          },
        });
      },
    );

    // --- Restore from a snapshot (administrator only) -----------------------------------------------------------
    router.post(
      '/heThong/backup/importJson',
      declare(
        'Restore system database from JSON backup snapshot',
        'restoreBackupJson',
      ),
      needs('edu.heThong', 'restore'),
      apiValidator('json', BackupImportInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const q = database.connection().query;
        let tongKhoiPhuc = 0;
        let boQua = 0;
        // Only the tables of a snapshot, in the order of `BACKUP_TABLES` whatever the order in the file: an unknown
        // table name in the file is ignored, never written.
        for (const table of BACKUP_TABLES) {
          for (const row of input.data[table] ?? []) {
            try {
              await q
                .insertInto(table)
                .values(row)
                .execute();
              tongKhoiPhuc += 1;
            } catch {
              // A row that is already there (or no longer fits the schema) is left as it is.
              boQua += 1;
            }
          }
        }
        await log(userId, 'khoi_phuc_json', {}, tongKhoiPhuc);
        return c.json({
          data: {
            thanhCong: true,
            tongKhoiPhuc,
            boQua,
            thongBao: `Đã khôi phục thành công ${tongKhoiPhuc} bản ghi vào hệ thống.`,
          },
        });
      },
    );

    // --- Export attendance to CSV -------------------------------------------------------------------------------
    router.post(
      '/diemDanh/xuatCsv',
      declare('Export attendance records to CSV', 'exportAttendanceCsv'),
      needs('edu.baoCao', 'export'),
      apiValidator('json', DiemDanhExportInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        // With no class named the export is the current month: a whole history would not fit in one file.
        const thang =
          input.thang ?? (input.lopId ? undefined : todayVn().slice(0, 7));

        const attendancePolicy = (await policiesOf(c, 'edu.diemDanh', 'view'))
          .eduDiemDanh;
        const sessionPolicy = (await policiesOf(c, 'edu.buoiHoc', 'view'))
          .eduBuoiHoc;
        const studentPolicy = (await policiesOf(c, 'edu.hocVien', 'view'))
          .eduHocVien;
        const classPolicy = (await policiesOf(c, 'edu.lop', 'view')).eduLop;
        if (
          !attendancePolicy ||
          !sessionPolicy ||
          !studentPolicy ||
          !classPolicy
        ) {
          throw outOfScope();
        }

        const classes = await readAllRows(
          database,
          'eduLop',
          classPolicy,
          undefined,
          2000,
        );
        if (
          input.lopId !== undefined &&
          !classes.some((k) => Number(k.id) === input.lopId)
        ) {
          throw outOfScope();
        }
        const className = new Map(
          classes.map((k) => [Number(k.id), asText(k.ten)]),
        );

        const sessions = await readAllRows(
          database,
          'eduBuoiHoc',
          sessionPolicy,
          (f: {
            and: (nodes: unknown[]) => unknown;
            number: (n: string) => { eq: (v: number) => unknown };
            string: (n: string) => { startsWith: (v: string) => unknown };
          }) =>
            f.and([
              ...(input.lopId !== undefined
                ? [f.number('lopId').eq(input.lopId)]
                : []),
              ...(thang ? [f.string('ngay').startsWith(thang)] : []),
            ]),
          MAX_CSV_ROWS,
        );
        const sessionById = new Map(sessions.map((s) => [Number(s.id), s]));

        const marks: Row[] = [];
        for (const part of chunksOf([...sessionById.keys()], PAGE)) {
          marks.push(
            ...(await readAllRows(
              database,
              'eduDiemDanh',
              attendancePolicy,
              anyOf('buoiHocId', part),
              MAX_CSV_ROWS,
            )),
          );
          if (marks.length > MAX_CSV_ROWS) {
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_EXPORT_TOO_LARGE',
              `More than ${MAX_CSV_ROWS} records: narrow the export to one class or month.`,
            );
          }
        }

        // Students the caller may see; a row of any other student is left out, so no name leaves the scope.
        const students = new Map<number, Row>();
        const studentIds = [...new Set(marks.map((m) => Number(m.hocVienId)))];
        for (const part of chunksOf(studentIds, PAGE)) {
          for (const student of await readAllRows(
            database,
            'eduHocVien',
            studentPolicy,
            anyOf('id', part),
            PAGE,
          )) {
            students.set(Number(student.id), student);
          }
        }

        // The awareness score is not a permission field: it is read only for the rows the policy already returned.
        const scores = new Map<number, number>();
        const q = database.connection().query;
        for (const part of chunksOf(
          marks.map((m) => Number(m.id)),
          200,
        )) {
          for (const row of await q
            .selectFrom('eduDiemDanh')
            .select(['id', 'yThucDiem'])
            .where('id', 'in', part)
            .execute()) {
            if (row.yThucDiem != null) {
              scores.set(Number(row.id), Number(row.yThucDiem));
            }
          }
        }

        const lines = marks
          .map((mark) => ({
            mark,
            session: sessionById.get(Number(mark.buoiHocId)),
            student: students.get(Number(mark.hocVienId)),
          }))
          .filter(
            (item): item is { mark: Row; session: Row; student: Row } =>
              item.session !== undefined && item.student !== undefined,
          )
          .sort(
            (a, b) =>
              asText(b.session.ngay).localeCompare(asText(a.session.ngay)) ||
              asText(a.session.gioBatDau).localeCompare(
                asText(b.session.gioBatDau),
              ) ||
              asText(a.student.ma).localeCompare(asText(b.student.ma)),
          );
        const rows = lines.map(({ mark, session, student }) => [
          asText(session.ngay),
          asText(session.gioBatDau).slice(0, 5),
          className.get(Number(session.lopId)) ?? '',
          asText(student.ma),
          asText(student.hoTen),
          STATUS_LABEL[asText(mark.trangThai)] ?? asText(mark.trangThai),
          mark.daLamBtvn ? 'Đã làm' : 'Chưa làm',
          asText(mark.nhanXet),
          scores.get(Number(mark.id)) ?? '',
          Number(mark.soBuoiDaTru),
        ]);

        await log(
          userId,
          'diem_danh_csv',
          { lopId: input.lopId ?? null, thang: thang ?? null },
          rows.length,
        );
        const csv = toCsv(
          [
            'Ngày học',
            'Giờ',
            'Lớp học',
            'Mã học viên',
            'Họ và tên',
            'Trạng thái',
            'Làm BTVN',
            'Nhận xét',
            'Ý thức (0-10)',
            'Số buổi trừ',
          ],
          rows,
        );
        return new Response(csv, {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="diem-danh-${thang ?? todayVn()}.csv"`,
            'cache-control': 'no-store',
          },
        });
      },
    );

    // --- Export tuition packages to CSV -------------------------------------------------------------------------
    router.post(
      '/hocPhi/xuatCsv',
      declare('Export tuition summary and packages to CSV', 'exportTuitionCsv'),
      needs('edu.baoCao', 'export'),
      apiValidator('json', HocPhiExportInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const packagePolicy = (await policiesOf(c, 'edu.goiHoc', 'view'))
          .eduGoiHoc;
        const studentPolicy = (await policiesOf(c, 'edu.hocVien', 'view'))
          .eduHocVien;
        const classPolicy = (await policiesOf(c, 'edu.lop', 'view')).eduLop;
        const branchPolicy = (await policiesOf(c, 'edu.coSo', 'view')).eduCoSo;
        if (!packagePolicy || !studentPolicy || !classPolicy || !branchPolicy) {
          throw outOfScope();
        }

        const branches = await readAllRows(
          database,
          'eduCoSo',
          branchPolicy,
          undefined,
          1000,
        );
        if (
          input.coSoId !== undefined &&
          !branches.some((b) => Number(b.id) === input.coSoId)
        ) {
          throw outOfScope();
        }
        const classes = await readAllRows(
          database,
          'eduLop',
          classPolicy,
          undefined,
          2000,
        );
        const branchName = new Map(
          branches.map((b) => [Number(b.id), asText(b.ten)]),
        );
        const className = new Map(
          classes.map((k) => [Number(k.id), asText(k.ten)]),
        );

        // Students first (through their policy, narrowed by the branch), then the packages of exactly those students.
        const students = await readAllRows(
          database,
          'eduHocVien',
          studentPolicy,
          input.coSoId !== undefined
            ? (f: { number: (n: string) => { eq: (v: number) => unknown } }) =>
                f.number('coSoId').eq(input.coSoId as number)
            : undefined,
          MAX_CSV_ROWS,
        );
        const studentById = new Map(students.map((s) => [Number(s.id), s]));
        const packages: Row[] = [];
        for (const part of chunksOf([...studentById.keys()], PAGE)) {
          packages.push(
            ...(await readAllRows(
              database,
              'eduGoiHoc',
              packagePolicy,
              anyOf('hocVienId', part),
              MAX_CSV_ROWS,
            )),
          );
          if (packages.length > MAX_CSV_ROWS) {
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_EXPORT_TOO_LARGE',
              `More than ${MAX_CSV_ROWS} records: narrow the export to one branch.`,
            );
          }
        }
        packages.sort(
          (a, b) =>
            asText(b.ngayMua).localeCompare(asText(a.ngayMua)) ||
            Number(b.id) - Number(a.id),
        );

        const rows = packages.flatMap((pack) => {
          const student = studentById.get(Number(pack.hocVienId));
          if (!student) return [];
          return [
            [
              asText(student.ma),
              asText(student.hoTen),
              student.lopId == null
                ? ''
                : (className.get(Number(student.lopId)) ?? ''),
              branchName.get(Number(student.coSoId)) ?? '',
              asText(pack.ngayMua),
              Number(pack.soBuoi),
              Number(pack.donGia),
              Number(pack.thanhTien),
              asText(pack.trangThai),
              Number(student.soBuoiConLai),
            ],
          ];
        });

        await log(
          userId,
          'hoc_phi_csv',
          { coSoId: input.coSoId ?? null },
          rows.length,
        );
        const csv = toCsv(
          [
            'Mã học viên',
            'Họ và tên',
            'Lớp học',
            'Cơ sở',
            'Ngày mua kỳ',
            'Số buổi mua',
            'Đơn giá',
            'Thành tiền',
            'Trạng thái kỳ',
            'Số buổi còn lại hiện tại',
          ],
          rows,
        );
        return new Response(csv, {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="hoc-phi-${todayVn()}.csv"`,
            'cache-control': 'no-store',
          },
        });
      },
    );

    return new Hono().route('/', router);
  }),
];
