import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  apiErrorResponses,
  apiValidator,
  defineApiRoutes,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { z } from 'zod';

import { anyOf, byId } from '../edu/filters.js';
import { shortName } from '../edu/names.js';
import { needs, policyOf, type EduEnv } from './edu-support.js';

/**
 * Read-only API for the other applications of the club (NocoLMS, NocoFEN). NocoEdu owns student and parent data;
 * they only read what they need: a student code, a short name, the level and the class, and a parent code. Only
 * students with a valid learning consent are listed. The routes are GET only and paginated; the callers are service
 * accounts that hold nothing but the `edu_api_doc` permission set, so every other NocoEdu route answers them 403.
 */
const Page = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const StudentSchema = z.object({
  ma: z.string(),
  tenVietTat: z.string(),
  levelKey: z.string(),
  levelOrder: z.number(),
  lop: z.object({ ma: z.string(), ten: z.string() }).nullable(),
});
const ParentSchema = z.object({ ma: z.string() });

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    router.use('/ext/*', auth.required(), authz.middleware());

    /** Student ids with a learning consent that was given and not withdrawn. */
    const consentedStudentIds = async (): Promise<number[]> => {
      const rows = await database
        .query()
        .selectFrom('eduDongY')
        .select('hocVienId')
        .where('mucDich', '=', 'hoc_tap')
        .where('dongY', '=', true)
        .where('rutLaiLuc', 'is', null)
        .execute();
      return [...new Set(rows.map((row) => Number(row.hocVienId)))];
    };

    router.get(
      '/ext/hocVien',
      describeRoute({
        tags: ['NocoEdu API'],
        summary: 'List students for other applications',
        operationId: 'extListStudents',
        responses: { '200': listResponse(StudentSchema), ...apiErrorResponses },
      }),
      needs('edu.ext', 'readStudents'),
      apiValidator('query', Page),
      async (c) => {
        const { page, pageSize } = c.req.valid('query');
        const ids = await consentedStudentIds();
        if (!ids.length)
          return c.json({ data: [], meta: { page, pageSize, total: 0 } });
        const students = database
          .repository('eduHocVien')
          .withPolicy(policyOf(c, 'eduHocVien'));
        const filter = anyOf('id', ids);
        const [rows, total] = await Promise.all([
          students.findMany({
            filter,
            sort: byId,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          }),
          students.count({ filter }),
        ]);
        const lopIds = [
          ...new Set(
            rows
              .map((row) => row.lopId)
              .filter((v) => v != null)
              .map(Number),
          ),
        ];
        const lops = new Map<number, { ma: string; ten: string }>();
        if (lopIds.length) {
          const found = await database
            .repository('eduLop')
            .withPolicy(policyOf(c, 'eduLop'))
            .findMany({ filter: anyOf('id', lopIds) });
          for (const lop of found)
            lops.set(Number(lop.id), {
              ma: String(lop.ma),
              ten: String(lop.ten),
            });
        }
        return c.json({
          data: rows.map((row) => ({
            ma: String(row.ma),
            tenVietTat: shortName(String(row.hoTen)),
            levelKey: String(row.levelKey),
            levelOrder: Number(row.levelOrder),
            lop:
              row.lopId == null ? null : (lops.get(Number(row.lopId)) ?? null),
          })),
          meta: { page, pageSize, total },
        });
      },
    );

    router.get(
      '/ext/phuHuynh',
      describeRoute({
        tags: ['NocoEdu API'],
        summary: 'List parent codes for other applications',
        operationId: 'extListParents',
        responses: { '200': listResponse(ParentSchema), ...apiErrorResponses },
      }),
      needs('edu.ext', 'readParents'),
      apiValidator('query', Page),
      async (c) => {
        const { page, pageSize } = c.req.valid('query');
        const studentIds = await consentedStudentIds();
        if (!studentIds.length)
          return c.json({ data: [], meta: { page, pageSize, total: 0 } });
        const links = await database
          .query()
          .selectFrom('eduHocVienPhuHuynh')
          .select('phuHuynhId')
          .where('hocVienId', 'in', studentIds)
          .execute();
        const ids = [...new Set(links.map((row) => Number(row.phuHuynhId)))];
        if (!ids.length)
          return c.json({ data: [], meta: { page, pageSize, total: 0 } });
        const parents = database
          .repository('eduPhuHuynh')
          .withPolicy(policyOf(c, 'eduPhuHuynh'));
        const filter = anyOf('id', ids);
        const [rows, total] = await Promise.all([
          parents.findMany({
            filter,
            sort: byId,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          }),
          parents.count({ filter }),
        ]);
        return c.json({
          data: rows.map((row) => ({ ma: String(row.ma) })),
          meta: { page, pageSize, total },
        });
      },
    );

    return router;
  }),
];
