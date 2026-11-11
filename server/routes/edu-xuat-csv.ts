import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  apiErrorResponses,
  apiValidator,
  describeRoute,
  defineApiRoutes,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import type { RepositoryPolicy } from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { toCsv } from '../edu/csv.js';
import { anyOf } from '../edu/filters.js';
import { IMPORT_COLUMNS } from '../edu/import-csv.js';
import { asText } from '../edu/names.js';
import {
  currentUserId,
  eduError,
  needs,
  policyOf,
  type EduEnv,
} from './edu-support.js';

/**
 * Export of students with their parents as a CSV file (DS-60), in the columns of the import file so it can be edited and
 * imported again. It needs the `export` action of `edu.hocVien` and reads only through the policies of that action, so a
 * branch manager gets their own branch and a branch or class outside their scope answers 403.
 *
 * Minimum collection (knowledge document 05): only the columns the import file has — name, birth year, branch and class
 * code, level, and for each linked parent name, phone, zalo and relation. Not the full date of birth (that has its own
 * route), not the coach note, not the balance. One row per (student, parent); a student without a parent is one row with
 * the parent columns empty, which the import refuses until a parent is filled in. A formula in a cell is made harmless by
 * `csvCell`. Each export writes one row of `eduXuatDuLieuNhatKy` (who, when, the filter, how many rows) and the file is
 * never stored.
 *
 * The file is built in memory, so it is capped: more than `MAX_EXPORT_STUDENTS` students answers an error asking for a
 * narrower filter, like the reports do (a stream would not change what a person can open in a spreadsheet).
 */
export const MAX_EXPORT_STUDENTS = 5000;
const PAGE = 100;

const Input = z.object({
  coSoId: z.coerce.number().int().positive().optional(),
  lopId: z.coerce.number().int().positive().optional(),
  trangThai: z.enum(['dang_hoc', 'tam_nghi', 'da_nghi', 'hoc_thu']).optional(),
});

type Row = Record<string, unknown>;

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    router.use(
      '/hocVien/xuatCsv',
      auth.required(),
      authz.middleware(),
      bodyLimit({ maxSize: 4 * 1024 }),
    );

    async function readAll(
      collection: string,
      policy: RepositoryPolicy,
      filter?: unknown,
      max = MAX_EXPORT_STUDENTS,
    ): Promise<Row[]> {
      const repository = database
        .repository(collection)
        .withPolicy(policy) as unknown as {
        findMany(input: unknown): Promise<Row[]>;
      };
      const rows: Row[] = [];
      for (let offset = 0; offset <= max; offset += PAGE) {
        const page = await repository.findMany({
          ...(filter ? { filter } : {}),
          sort: (s: { field: (n: string) => { asc: () => unknown } }) =>
            s.field('id').asc(),
          limit: PAGE,
          offset,
        });
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      return rows;
    }

    router.post(
      '/hocVien/xuatCsv',
      describeRoute({
        tags: ['NocoEdu'],
        summary: 'Export students with their parents as CSV',
        operationId: 'exportStudents',
        responses: { ...apiErrorResponses },
      }),
      needs('edu.hocVien', 'export'),
      apiValidator('json', Input),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);

        // The branch and class in the filter must be ones the caller may see; otherwise it is not theirs to ask for.
        const branches = await readAll(
          'eduCoSo',
          policyOf(c, 'eduCoSo'),
          undefined,
          1000,
        );
        const classes = await readAll(
          'eduLop',
          policyOf(c, 'eduLop'),
          undefined,
          2000,
        );
        if (
          (input.coSoId !== undefined &&
            !branches.some((b) => Number(b.id) === input.coSoId)) ||
          (input.lopId !== undefined &&
            !classes.some((k) => Number(k.id) === input.lopId))
        ) {
          throw eduError(
            'PERMISSION_DENIED',
            'EDU_OUT_OF_SCOPE',
            'You may not export this branch or class.',
          );
        }
        const branchCode = new Map(
          branches.map((b) => [Number(b.id), asText(b.ma)]),
        );
        const classCode = new Map(
          classes.map((k) => [Number(k.id), asText(k.ma)]),
        );

        const students = await readAll(
          'eduHocVien',
          policyOf(c, 'eduHocVien'),
          (f: {
            and: (nodes: unknown[]) => unknown;
            number: (n: string) => { eq: (v: number) => unknown };
            string: (n: string) => { eq: (v: string) => unknown };
          }) =>
            f.and([
              ...(input.coSoId !== undefined
                ? [f.number('coSoId').eq(input.coSoId)]
                : []),
              ...(input.lopId !== undefined
                ? [f.number('lopId').eq(input.lopId)]
                : []),
              ...(input.trangThai !== undefined
                ? [f.string('trangThai').eq(input.trangThai)]
                : []),
            ]),
        );
        if (students.length > MAX_EXPORT_STUDENTS) {
          throw eduError(
            'FAILED_PRECONDITION',
            'EDU_EXPORT_TOO_LARGE',
            `More than ${MAX_EXPORT_STUDENTS} students: narrow the export to one branch or class.`,
          );
        }

        // Links and parents of those students, through the policies of the action.
        const linkPolicy = policyOf(c, 'eduHocVienPhuHuynh');
        const parentPolicy = policyOf(c, 'eduPhuHuynh');
        const links: Row[] = [];
        const parents = new Map<number, Row>();
        for (let i = 0; i < students.length; i += PAGE) {
          const ids = students.slice(i, i + PAGE).map((s) => Number(s.id));
          links.push(
            ...(await readAll(
              'eduHocVienPhuHuynh',
              linkPolicy,
              anyOf('hocVienId', ids),
              10 * PAGE,
            )),
          );
        }
        const parentIds = [...new Set(links.map((l) => Number(l.phuHuynhId)))];
        for (let i = 0; i < parentIds.length; i += PAGE) {
          for (const parent of await readAll(
            'eduPhuHuynh',
            parentPolicy,
            anyOf('id', parentIds.slice(i, i + PAGE)),
          ))
            parents.set(Number(parent.id), parent);
        }
        const linksOf = new Map<number, Row[]>();
        for (const link of links)
          linksOf.set(Number(link.hocVienId), [
            ...(linksOf.get(Number(link.hocVienId)) ?? []),
            link,
          ]);

        const rows: (string | number)[][] = [];
        for (const student of students) {
          const own = (linksOf.get(Number(student.id)) ?? [])
            .map((link) => ({
              link,
              parent: parents.get(Number(link.phuHuynhId)),
            }))
            .filter(
              (item): item is { link: Row; parent: Row } =>
                item.parent !== undefined,
            )
            .sort(
              (a, b) =>
                Number(b.link.lienHeChinh === true) -
                  Number(a.link.lienHeChinh === true) ||
                Number(a.link.id) - Number(b.link.id),
            );
          const base = [
            asText(student.hoTen),
            asText(student.namSinh),
            branchCode.get(Number(student.coSoId)) ?? '',
            student.lopId == null
              ? ''
              : (classCode.get(Number(student.lopId)) ?? ''),
            asText(student.levelKey),
          ];
          if (own.length === 0) rows.push([...base, '', '', '', '']);
          for (const { link, parent } of own)
            rows.push([
              ...base,
              asText(parent.hoTen),
              asText(parent.soDienThoai),
              asText(parent.zalo),
              asText(link.quanHe),
            ]);
        }

        await database
          .connection()
          .query.insertInto('eduXuatDuLieuNhatKy')
          .values({
            userId,
            loai: 'hoc_vien_csv',
            boLoc: {
              coSoId: input.coSoId ?? null,
              lopId: input.lopId ?? null,
              trangThai: input.trangThai ?? null,
            },
            soDong: rows.length,
            createdAt: new Date(),
          })
          .execute();
        return new Response(toCsv(IMPORT_COLUMNS, rows), {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="hoc-vien.csv"',
            'cache-control': 'no-store',
          },
        });
      },
    );

    return new Hono().route('/', router);
  }),
];
