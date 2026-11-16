import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { concurrencyServiceToken } from '@nocobase/app-plugin-concurrency/server';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { parseCsv } from '../edu/import-csv.js';
import {
  headerProblem,
  IMPORT_KINDS,
  IMPORTS,
  type ImportKind,
  type ImportPolicies,
  type ImportReport,
  MAX_IMPORT_ROWS,
  runImport,
  templateOf,
} from '../edu/import-da-nang.js';
import {
  currentUserId,
  eduError,
  optionalPoliciesOf,
  policiesOf,
  type EduEnv,
} from './edu-support.js';

/**
 * Import of one kind of record from a CSV file: `/nhapDuLieu/mau` (the template), `/xemTruoc` (what would happen,
 * nothing written) and `/xacNhan` (written, all or nothing).
 *
 * The kind travels in the body, so the permission is checked in the handler as its first step: each kind is opened by
 * the action that guards that kind of record (`IMPORTS[kind].gate`: a class by `edu.lop` `manage`, a coach profile by
 * `edu.hoSoGv` `manage`, attendance by `edu.diemDanh` `record`…). What the rows refer to is looked up through the
 * caller's own `view` policies, so a branch or a student outside the scope is reported as unknown.
 *
 * A preview runs the very same writes in a transaction that is always rolled back; a confirmation keeps the
 * transaction only when no row has a problem. Confirmations run one at a time (`edu:nhap-du-lieu`): two at once would
 * both pass the "not there yet" checks. The file travels in the JSON body and is never stored; each confirmation
 * leaves one `eduNhapLarkNhatKy` row with counts and reason codes only.
 */
const MAX_CSV_CHARACTERS = 512_000;

const KindInput = z.object({ loai: z.enum(IMPORT_KINDS) });
const FileInput = z.object({
  loai: z.enum(IMPORT_KINDS),
  csv: z.string().min(1).max(MAX_CSV_CHARACTERS),
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

/** Thrown inside the transaction to undo a preview, or a confirmation that found a problem. */
class Undo extends Error {
  constructor(readonly report: ImportReport) {
    super('undo');
  }
}

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const concurrency = app.container.resolve(concurrencyServiceToken);
    const router = new Hono<EduEnv>();

    for (const path of [
      '/nhapDuLieu/mau',
      '/nhapDuLieu/xemTruoc',
      '/nhapDuLieu/xacNhan',
    ]) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 1024 * 1024 }),
      );
    }

    type Ctx = Parameters<typeof policiesOf>[0];

    /** Refuses a caller who does not hold the action of this kind, and gathers the policies the rows need. */
    async function policiesFor(
      c: Ctx,
      kind: ImportKind,
    ): Promise<ImportPolicies> {
      const { gate } = IMPORTS[kind];
      const write = (await policiesOf(c, gate.resource, gate.action))[
        gate.collection
      ];
      if (!write) {
        throw eduError(
          'PERMISSION_DENIED',
          'EDU_PERMISSION_DENIED',
          'This action is not allowed.',
        );
      }
      const view = async (resource: string, collection: string) =>
        (await optionalPoliciesOf(c, resource, 'view'))?.[collection];
      const manage = async (resource: string, collection: string) =>
        (await optionalPoliciesOf(c, resource, 'manage'))?.[collection];
      switch (kind) {
        case 'lop':
        case 'tuyenSinh':
          return { write, branchView: await view('edu.coSo', 'eduCoSo') };
        case 'phatSach':
          return {
            write,
            studentView: await view('edu.hocVien', 'eduHocVien'),
          };
        case 'goiHoc':
          return {
            write,
            studentView: await view('edu.hocVien', 'eduHocVien'),
            packageView: await view('edu.goiHoc', 'eduGoiHoc'),
            paymentManage: await manage('edu.thanhToan', 'eduThanhToan'),
          };
        case 'diemDanh':
          return {
            write,
            classView: await view('edu.lop', 'eduLop'),
            studentView: await view('edu.hocVien', 'eduHocVien'),
            sessionView: await view('edu.buoiHoc', 'eduBuoiHoc'),
            sessionManage: await manage('edu.buoiHoc', 'eduBuoiHoc'),
          };
        default:
          return { write };
      }
    }

    function parse(kind: ImportKind, csv: string) {
      const rows = parseCsv(csv);
      const header = (rows[0] ?? []).map((cell) => cell.trim());
      const lines = rows.slice(1);
      if (lines.length === 0) {
        throw eduError(
          'INVALID_ARGUMENT',
          'EDU_IMPORT_EMPTY',
          'The file has no data rows.',
          'csv',
        );
      }
      if (lines.length > MAX_IMPORT_ROWS) {
        throw eduError(
          'INVALID_ARGUMENT',
          'EDU_IMPORT_TOO_LARGE',
          'The file has too many rows.',
          'csv',
        );
      }
      const problem = headerProblem(kind, header);
      if (problem) {
        throw eduError(
          'INVALID_ARGUMENT',
          `EDU_IMPORT_${problem.ma}`,
          'The header of the file is not the one of the template.',
          'csv',
        );
      }
      return { header, lines };
    }

    /** Runs the import in a transaction; `keep` decides from the report whether it is committed. */
    async function run(
      kind: ImportKind,
      file: ReturnType<typeof parse>,
      options: { userId: string; policies: ImportPolicies },
      keep: (report: ImportReport) => boolean,
    ): Promise<{ report: ImportReport; written: boolean }> {
      try {
        const report = await database.transaction(async (tx) => {
          const result = await runImport(
            tx,
            kind,
            file.header,
            file.lines,
            options,
          );
          if (!keep(result)) throw new Undo(result);
          return result;
        });
        return { report, written: true };
      } catch (error) {
        if (error instanceof Undo)
          return { report: error.report, written: false };
        throw error;
      }
    }

    router.post(
      '/nhapDuLieu/mau',
      declare('The CSV template of one kind of record', 'importTemplate'),
      apiValidator('json', KindInput),
      async (c) => {
        const { loai } = c.req.valid('json');
        await policiesFor(c, loai);
        return c.json({
          data: {
            loai,
            cot: IMPORTS[loai].columns,
            batBuoc: IMPORTS[loai].required,
            csv: templateOf(loai),
          },
        });
      },
    );

    router.post(
      '/nhapDuLieu/xemTruoc',
      declare(
        'What importing this file would do; nothing is written',
        'previewImport',
      ),
      apiValidator('json', FileInput),
      async (c) => {
        const { loai, csv } = c.req.valid('json');
        const policies = await policiesFor(c, loai);
        const file = parse(loai, csv);
        const { report } = await run(
          loai,
          file,
          { userId: currentUserId(c), policies },
          () => false,
        );
        return c.json({ data: report });
      },
    );

    router.post(
      '/nhapDuLieu/xacNhan',
      declare('Import the file: every row or none', 'confirmImport'),
      apiValidator('json', FileInput),
      async (c) => {
        const { loai, csv } = c.req.valid('json');
        const policies = await policiesFor(c, loai);
        const file = parse(loai, csv);
        const userId = currentUserId(c);
        const startedAt = new Date();
        const executor = await (
          await concurrency.getManager()
        ).createSynchronous('edu:nhap-du-lieu');
        const { report, written } = await executor.run(() =>
          run(
            loai,
            file,
            { userId, policies },
            (result) => result.loi.length === 0,
          ),
        );
        // Who imported what and how it ended: counts and reason codes, never the content of a row.
        await database
          .connection()
          .query.insertInto('eduNhapLarkNhatKy')
          .values({
            batDauLuc: startedAt,
            ketThucLuc: new Date(),
            nguoiChayId: userId,
            trangThai: written ? 'thanh_cong' : 'tu_choi',
            tongKet: {
              nguon: `csv_${loai}`,
              tongDong: report.tongDong,
              hopLe: report.hopLe,
              loi: report.loi.length,
            },
          })
          .execute();
        if (!written) {
          throw eduError(
            'FAILED_PRECONDITION',
            'EDU_IMPORT_HAS_PROBLEMS',
            'Some rows have a problem; nothing was written.',
          );
        }
        return c.json({ data: { ...report, daGhi: report.hopLe } });
      },
    );

    return new Hono().route('/', router);
  }),
];
