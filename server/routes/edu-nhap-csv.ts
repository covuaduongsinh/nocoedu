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
import { concurrencyServiceToken } from '@nocobase/app-plugin-concurrency/server';
import { databaseManagerToken } from '@nocobase/db';
import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { anyOf } from '../edu/filters.js';
import { IMPORT_COLUMNS } from '../edu/import-csv.js';
import {
  MAX_IMPORT_CHARS,
  MAX_IMPORT_ROWS,
  applyImport,
  planImport,
  type ImportPlan,
} from '../edu/import-web.js';
import { toCsv } from '../edu/csv.js';
import { asText } from '../edu/names.js';
import {
  currentUserId,
  eduError,
  needs,
  policyOf,
  type EduEnv,
} from './edu-support.js';

/**
 * Import of students and their parents from a CSV file uploaded on the students page (DS-60).
 *
 * `xemTruoc` reads the file and answers what an import would do, writing nothing. `xacNhan` plans again from the same
 * text (the database may have changed since the preview) and writes everything in one transaction, or nothing when any
 * row has a problem. Both need the `import` action of `edu.hocVien`. Only the branches and classes in the caller's
 * scope are looked up, so one outside it is reported as an unknown code, exactly like one that does not exist: a branch
 * manager cannot import into another branch, and cannot learn which codes it uses.
 * The file is read from the request body and is never stored. The answer and the log row (`eduNhapLarkNhatKy`, the same
 * table the Lark import writes) hold counts and reason codes by line number, never a name or a phone number.
 */
const Body = z.object({ csv: z.string().max(MAX_IMPORT_CHARS) });

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

const PATHS = [
  '/hocVien/nhapCsv/xemTruoc',
  '/hocVien/nhapCsv/xacNhan',
  '/hocVien/nhapCsv/mau',
];

/** Fake rows only. `CS01` and `L01` are branch and class codes the school replaces with its own. */
const SAMPLE_ROWS = [
  [
    'Học viên Mẫu 01',
    '2016',
    'CS01',
    'L01',
    'tot',
    'Phụ huynh Mẫu 01',
    '0900000001',
    '',
    'me',
  ],
  [
    'Học viên Mẫu 02',
    '2018',
    'CS01',
    '',
    'ma',
    'Phụ huynh Mẫu 01',
    '0900000001',
    '',
    'me',
  ],
] as const;

type Row = Record<string, unknown>;

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const concurrency = app.container.resolve(concurrencyServiceToken);
    const router = new Hono<EduEnv>();

    for (const path of PATHS) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        // A limit on the request; the text itself is limited again by `Body`.
        bodyLimit({ maxSize: 2 * 1024 * 1024 }),
      );
    }

    /** Ids of every row the policy lets through. */
    async function visibleIds(
      collection: string,
      policy: RepositoryPolicy,
      filter?: unknown,
    ): Promise<number[]> {
      const repository = database
        .repository(collection)
        .withPolicy(policy) as unknown as {
        findMany(input: unknown): Promise<Row[]>;
      };
      const ids: number[] = [];
      for (let offset = 0; offset < 20000; offset += 100) {
        const page = await repository.findMany({
          ...(filter ? { filter } : {}),
          sort: (s: { field: (n: string) => { asc: () => unknown } }) =>
            s.field('id').asc(),
          limit: 100,
          offset,
        });
        ids.push(...page.map((row) => Number(row.id)));
        if (page.length < 100) break;
      }
      return ids;
    }

    async function plan(
      c: Parameters<ReturnType<typeof needs>>[0],
      csv: string,
    ): Promise<ImportPlan> {
      const branchIds = await visibleIds('eduCoSo', policyOf(c, 'eduCoSo'));
      const classIds = await visibleIds('eduLop', policyOf(c, 'eduLop'));
      const parentPolicy = policyOf(c, 'eduPhuHuynh');
      const query = database.connection().query;
      const result = await planImport(
        query,
        csv,
        { branchIds: new Set(branchIds), classIds: new Set(classIds) },
        // Only a parent the caller already sees is reused; a parent of another branch is never linked.
        async (phones) => {
          const out = new Map<string, number>();
          for (let i = 0; i < phones.length; i += 100) {
            const rows = await query
              .selectFrom('eduPhuHuynh')
              .select(['id', 'soDienThoai'])
              .where('soDienThoai', 'in', phones.slice(i, i + 100))
              .orderBy('id')
              .execute();
            if (rows.length === 0) continue;
            const seen = new Set(
              await visibleIds(
                'eduPhuHuynh',
                parentPolicy,
                anyOf(
                  'id',
                  rows.map((row) => Number(row.id)),
                ),
              ),
            );
            for (const row of rows) {
              const phone = asText(row.soDienThoai);
              if (seen.has(Number(row.id)) && !out.has(phone)) {
                out.set(phone, Number(row.id));
              }
            }
          }
          return out;
        },
      );
      const codes = new Set(result.report.problems.map((p) => p.code));
      if (codes.has('FILE_TOO_LARGE') || codes.has('TOO_MANY_ROWS')) {
        throw eduError(
          'INVALID_ARGUMENT',
          'EDU_IMPORT_TOO_LARGE',
          `The file may have at most ${MAX_IMPORT_ROWS} rows.`,
          'csv',
        );
      }
      if (codes.has('BAD_ENCODING') || codes.has('MISSING_COLUMN')) {
        throw eduError(
          'INVALID_ARGUMENT',
          'EDU_IMPORT_BAD_FORMAT',
          'The file is not a CSV in the expected format.',
          'csv',
        );
      }
      return result;
    }

    router.post(
      '/hocVien/nhapCsv/mau',
      declare('Download a sample CSV with made-up data', 'importSample'),
      needs('edu.hocVien', 'import'),
      async (c) => {
        const csv = toCsv(IMPORT_COLUMNS, SAMPLE_ROWS);
        return c.json({ data: { csv } });
      },
    );

    router.post(
      '/hocVien/nhapCsv/xemTruoc',
      declare(
        'Preview a student CSV import; nothing is written',
        'previewImport',
      ),
      needs('edu.hocVien', 'import'),
      apiValidator('json', Body),
      async (c) => {
        const { csv } = c.req.valid('json');
        const result = await plan(c, csv);
        return c.json({ data: result.report });
      },
    );

    router.post(
      '/hocVien/nhapCsv/xacNhan',
      declare(
        'Confirm a student CSV import: all rows are written or none',
        'confirmImport',
      ),
      needs('edu.hocVien', 'import'),
      apiValidator('json', Body),
      async (c) => {
        const { csv } = c.req.valid('json');
        const userId = currentUserId(c);
        const startedAt = new Date();
        // Planning reads the database and the write follows it, so two confirmations at once (two tabs) would both plan
        // "create" and create the student twice. One import at a time per process; the plan is made inside the lock, so
        // the second one sees what the first wrote and finds every row already there. The students table has no unique
        // key to fall back on.
        const executor = await (
          await concurrency.getManager()
        ).createSynchronous('edu:nhap-csv');
        const report = await executor.run(async () => {
          const result = await plan(c, csv);
          if (result.report.problems.length > 0) {
            await logRun(
              database.connection().query,
              userId,
              startedAt,
              'tu_choi',
              result.report,
            );
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_IMPORT_HAS_PROBLEMS',
              'Some rows have a problem; nothing was written.',
            );
          }
          return applyImport(
            database,
            result,
            { hocVien: policyOf(c, 'eduHocVien') },
            (query) =>
              logRun(query, userId, startedAt, 'thanh_cong', {
                ...result.report,
                written: result.steps.filter((s) => s.action !== 'trung')
                  .length,
              }),
          );
        });
        return c.json({ data: report });
      },
    );

    return new Hono().route('/', router);
  }),
];

/** One log row per confirmation: who, when, outcome and counts. Never a name, a phone number or the file. */
async function logRun(
  query: ReturnType<DatabaseManager['connection']>['query'],
  userId: string,
  startedAt: Date,
  trangThai: 'thanh_cong' | 'tu_choi',
  report: object,
): Promise<void> {
  await query
    .insertInto('eduNhapLarkNhatKy')
    .values({
      batDauLuc: startedAt,
      ketThucLuc: new Date(),
      nguoiChayId: userId,
      trangThai,
      tongKet: { nguon: 'csv_hoc_vien', ...report },
    })
    .execute();
}
