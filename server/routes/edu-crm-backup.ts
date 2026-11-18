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
import { asText } from '../edu/names.js';
import { chunksOf, readAllRows, type Row } from '../edu/read-all.js';
import { asBoolean, todayVn } from '../edu/so-du.js';
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
export const MAX_CSV_ROWS = 100_000;
/** Rows read from one table per query while taking a snapshot. */
const SNAPSHOT_PAGE = 5000;
/** A snapshot holds at most this many rows in all (it is built in memory and sent as one JSON document). */
export const MAX_SNAPSHOT_ROWS = 500_000;

/**
 * The tables of a snapshot, in the order a restore writes them (parents before the rows that point at them). Every table
 * the application keeps its own data in is here except the export log and the Lark import log (a record of what was done,
 * not of the club). A new table of a later phase is added here, in the same change that creates it.
 *
 * `eduCoSoQuanLy` and `eduHoSoGv` name accounts (`userId`) that a snapshot does not hold: a restore into a database
 * without those accounts brings the rows back, and they work again once the same accounts exist.
 */
export const BACKUP_TABLES = [
  'eduCoSo',
  'eduCoSoQuanLy',
  'eduLop',
  'eduLopLich',
  // A student points at a group, so the groups come before the students.
  'eduLopNhom',
  'eduHocVien',
  'eduHocVienChuyenNhom',
  'eduHocVienLenCap',
  'eduPhuHuynh',
  'eduHocVienPhuHuynh',
  'eduDongY',
  'eduBuoiHoc',
  'eduDiemDanh',
  'eduGoiHoc',
  'eduThanhToan',
  'eduSoDuNhatKy',
  'eduNhanXetThang',
  'eduSach',
  'eduPhatSach',
  'eduNopSach',
  'eduSachHoc',
  'eduLienHe',
  'eduHoSoGv',
] as const;

/** Version written into a snapshot. 1.0 files (15 tables) and 2.0 files (21 tables, before the groups of GĐ 3) are still accepted by a restore. */
export const BACKUP_VERSION = '2.1';
const SUPPORTED_VERSIONS = ['1.0', '2.0', '2.1'];
/** Rows written per insert while restoring. */
const RESTORE_BATCH = 200;

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
  phienBan: z.string().max(16).optional(),
  /** Only count what a restore would add and skip, write nothing. */
  chiKiemTra: z.boolean().default(false),
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
            phienBan: BACKUP_VERSION,
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
    /** The fields a row of `table` may carry (`id` included); a snapshot is not trusted to name its own columns. */
    const fieldsOf = async (table: string): Promise<Set<string>> => {
      const definition = await database.connection().collections.get(table);
      return new Set([
        'id',
        ...(definition?.fields ?? []).map((field) => field.name),
      ]);
    };

    /**
     * PostgreSQL does not move the sequence of an `id` column when a row is written with its id, so the next ordinary
     * insert would meet an id that was restored. Sets every restored table's sequence to its highest id. The query
     * adapter has no raw SQL, so this uses the connection's own client, only on PostgreSQL. Returns whether it ran.
     */
    const resetSequences = async (
      connection: ReturnType<typeof database.connection>,
      tables: readonly string[],
    ): Promise<boolean> => {
      if (connection.dialect !== 'postgres') return true;
      const client = await (
        connection as unknown as {
          resolveClient?: () => Promise<{
            raw: (sql: string, bindings: unknown[]) => Promise<unknown>;
          }>;
        }
      ).resolveClient?.();
      if (!client) return false;
      for (const table of tables) {
        const physical = await connection.collections.getPhysical(table);
        if (!physical) return false;
        const quoted = `"${physical.schema}"."${physical.tableName}"`;
        await client.raw(
          `select setval(pg_get_serial_sequence(?, 'id'), greatest((select coalesce(max(id), 1) from ${quoted}), 1))`,
          [quoted],
        );
      }
      return true;
    };

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
        if (
          input.phienBan !== undefined &&
          !SUPPORTED_VERSIONS.includes(input.phienBan)
        ) {
          throw eduError(
            'INVALID_ARGUMENT',
            'EDU_BACKUP_VERSION',
            'This backup file was made by a version this application cannot read.',
            'phienBan',
          );
        }
        const q = database.connection().query;
        const invalid = (table: string, index: number) =>
          eduError(
            'INVALID_ARGUMENT',
            'EDU_BACKUP_INVALID',
            `Table ${table}, record ${index + 1} is not a record of this application.`,
            'data',
          );

        // 1. Check every row before anything is written: only tables of a snapshot, only known columns, a whole-number
        //    id, no id twice. A table name outside `BACKUP_TABLES` in the file is ignored, never written.
        const plan: Record<string, { moi: number; trung: number }> = {};
        const toWrite: Record<string, Record<string, unknown>[]> = {};
        let total = 0;
        for (const table of BACKUP_TABLES) {
          const rows = input.data[table] ?? [];
          plan[table] = { moi: 0, trung: 0 };
          if (rows.length === 0) continue;
          total += rows.length;
          if (total > MAX_SNAPSHOT_ROWS) {
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_BACKUP_TOO_LARGE',
              'The snapshot is too large to restore in one request.',
            );
          }
          const fields = await fieldsOf(table);
          const seen = new Set<number>();
          rows.forEach((row, index) => {
            const id = Number(row.id);
            if (
              !Number.isInteger(id) ||
              id <= 0 ||
              seen.has(id) ||
              Object.keys(row).some((key) => !fields.has(key))
            ) {
              throw invalid(table, index);
            }
            seen.add(id);
          });
          // 2. A row whose id is already there is left as it is (a restore never overwrites); the rest is new.
          const existing = new Set<number>();
          for (const part of chunksOf([...seen], 500)) {
            for (const found of await q
              .selectFrom(table)
              .select('id')
              .where('id', 'in', part)
              .execute()) {
              existing.add(Number(found.id));
            }
          }
          toWrite[table] = rows.filter((row) => !existing.has(Number(row.id)));
          plan[table] = {
            moi: toWrite[table].length,
            trung: rows.length - toWrite[table].length,
          };
        }
        const moi = Object.values(plan).reduce((sum, t) => sum + t.moi, 0);
        const trung = Object.values(plan).reduce((sum, t) => sum + t.trung, 0);
        if (input.chiKiemTra) {
          return c.json({
            data: {
              chiKiemTra: true,
              soBang: BACKUP_TABLES.length,
              moi,
              trung,
              bang: plan,
            },
          });
        }

        // 3. One transaction: everything is written, or nothing is.
        let sequencesReset = true;
        try {
          await database.transaction(async (connection) => {
            for (const table of BACKUP_TABLES) {
              for (const part of chunksOf(
                toWrite[table] ?? [],
                RESTORE_BATCH,
              )) {
                await connection.query.insertInto(table).values(part).execute();
              }
            }
            sequencesReset = await resetSequences(
              connection,
              BACKUP_TABLES.filter(
                (table) => (toWrite[table]?.length ?? 0) > 0,
              ),
            );
          });
        } catch {
          throw eduError(
            'FAILED_PRECONDITION',
            'EDU_BACKUP_RESTORE_FAILED',
            'The snapshot could not be restored. Nothing was written.',
          );
        }
        await log(userId, 'khoi_phuc_json', { moi, trung }, moi);
        return c.json({
          data: {
            thanhCong: true,
            chiKiemTra: false,
            tongKhoiPhuc: moi,
            boQua: trung,
            moi,
            trung,
            bang: plan,
            // false: the sequences of PostgreSQL could not be moved; see `.agents/rules/edu.md` for the statement to run.
            dayTuTangDaDat: sequencesReset,
            thongBao: `Đã khôi phục thành công ${moi} bản ghi vào hệ thống.`,
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

        // The register of the sessions the policy returned, and the students the caller may see (read once through
        // their policy). Reading the register page by page through its own policy costs a scope lookup per page,
        // which for a branch manager took half a minute a month; the caller's `edu.diemDanh` `view` was checked above.
        const students = new Map<number, Row>();
        for (const student of await readAllRows(
          database,
          'eduHocVien',
          studentPolicy,
          undefined,
          MAX_CSV_ROWS,
        )) {
          students.set(Number(student.id), student);
        }
        const q = database.connection().query;
        const marks: Row[] = [];
        const scores = new Map<number, number>();
        for (const part of chunksOf([...sessionById.keys()], 500)) {
          const found: Row[] = await q
            .selectFrom('eduDiemDanh')
            .select([
              'id',
              'buoiHocId',
              'hocVienId',
              'trangThai',
              'daLamBtvn',
              'nhanXet',
              'soBuoiDaTru',
              'yThucDiem',
            ])
            .where('buoiHocId', 'in', part)
            .execute();
          for (const row of found) {
            // A row of a student the caller does not see is left out, so no name leaves the scope.
            if (!students.has(Number(row.hocVienId))) continue;
            marks.push(row);
            if (row.yThucDiem != null) {
              scores.set(Number(row.id), Number(row.yThucDiem));
            }
          }
          if (marks.length > MAX_CSV_ROWS) {
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_EXPORT_TOO_LARGE',
              `More than ${MAX_CSV_ROWS} records: narrow the export to one class or month.`,
            );
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
          asBoolean(mark.daLamBtvn) ? 'Đã làm' : 'Chưa làm',
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
        // The packages of exactly those students (the caller's `edu.goiHoc` `view` was checked above); one policy page
        // per hundred packages would cost a scope lookup each time.
        const packages: Row[] = [];
        const q = database.connection().query;
        for (const part of chunksOf([...studentById.keys()], 500)) {
          const found: Row[] = await q
            .selectFrom('eduGoiHoc')
            .select([
              'id',
              'hocVienId',
              'soBuoi',
              'donGia',
              'thanhTien',
              'ngayMua',
              'trangThai',
            ])
            .where('hocVienId', 'in', part)
            .execute();
          packages.push(...found);
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
