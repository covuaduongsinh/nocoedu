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
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { asText, shortName } from '../edu/names.js';
import { eduMessage } from '../edu/nhan-xet.js';
import {
  currentUserId,
  eduError,
  needs,
  policiesOf,
  policyOf,
  type EduEnv,
} from './edu-support.js';

/**
 * Monthly comments. A coach writes one comment per student and month for the classes they teach; the text is built
 * for the coach to paste into Zalo (no Zalo integration). Writing is authorized by `edu.nhanXet.write` over the
 * `edu.myClasses` scope, and the student must be one the caller sees, so a coach cannot comment on another class.
 */
const Id = z.coerce.number().int().positive();
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u);

const SaveInput = z.object({
  hocVienId: Id,
  thang: Month,
  noiDung: z.string().trim().min(1).max(3000),
});

const ExportInput = z.object({
  thang: Month,
  lopId: Id.optional(),
  hocVienId: Id.optional(),
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

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    for (const path of ['/nhanXet/luu', '/nhanXet/xuatVanBan']) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 16 * 1024 }),
      );
    }

    router.post(
      '/nhanXet/luu',
      declare(
        'Write or replace the monthly comment of a student',
        'saveComment',
      ),
      needs('edu.nhanXet', 'write'),
      apiValidator('json', SaveInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const policy = policyOf(c, 'eduNhanXetThang');
        const studentPolicy = (await policiesOf(c, 'edu.hocVien', 'view'))
          .eduHocVien;
        const result = await database.transaction(async (connection) => {
          const student = studentPolicy
            ? await connection
                .repository('eduHocVien')
                .withPolicy(studentPolicy)
                .findOne({ filter: { id: input.hocVienId } })
            : null;
          if (!student || student.lopId == null) {
            throw eduError(
              'NOT_FOUND',
              'EDU_STUDENT_NOT_FOUND',
              'Student not found.',
            );
          }
          const comments = connection
            .repository('eduNhanXetThang')
            .withPolicy(policy);
          const existing = await comments.findOne({
            filter: (f) =>
              f.and([
                f.number('hocVienId').eq(input.hocVienId),
                f.string('thang').eq(input.thang),
                f.string('hlvId').eq(userId),
              ]),
          });
          if (existing) {
            await comments.updateOne({
              filter: { id: Number(existing.id) },
              values: { noiDung: input.noiDung },
            });
            return { id: Number(existing.id) };
          }
          const created = await comments.createOne({
            values: {
              hocVienId: input.hocVienId,
              lopId: Number(student.lopId),
              hlvId: userId,
              thang: input.thang,
              noiDung: input.noiDung,
              trangThai: 'nhap',
            },
          });
          const id = Number(created.record.id);
          // The class of the new comment must be one the caller teaches (or manages).
          if (!(await comments.findOne({ filter: { id } }))) {
            throw eduError(
              'PERMISSION_DENIED',
              'EDU_OUT_OF_SCOPE',
              'You may not write a comment here.',
            );
          }
          return { id };
        });
        return c.json({ data: result }, 201);
      },
    );

    router.post(
      '/nhanXet/xuatVanBan',
      declare(
        'Plain text of the monthly comments, to paste into Zalo',
        'exportComments',
      ),
      needs('edu.nhanXet', 'view'),
      apiValidator('json', ExportInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const comments = await database
          .repository('eduNhanXetThang')
          .withPolicy(policyOf(c, 'eduNhanXetThang'))
          .findMany({
            filter: (f) =>
              f.and([
                f.string('thang').eq(input.thang),
                ...(input.lopId ? [f.number('lopId').eq(input.lopId)] : []),
                ...(input.hocVienId
                  ? [f.number('hocVienId').eq(input.hocVienId)]
                  : []),
              ]),
            sort: (s) => s.field('id').asc(),
            limit: 100,
          });
        const items: { hocVienId: number; ma: string; vanBan: string }[] = [];
        for (const comment of comments) {
          const student = await database
            .connection()
            .query.selectFrom('eduHocVien')
            .select(['id', 'ma', 'hoTen'])
            .where('id', '=', Number(comment.hocVienId))
            .executeTakeFirst();
          if (!student) continue;
          items.push({
            hocVienId: Number(student.id),
            ma: asText(student.ma),
            vanBan: eduMessage({
              studentName: shortName(asText(student.hoTen)),
              month: input.thang,
              comment: asText(comment.noiDung),
            }),
          });
        }
        // Who exported what, when and how many rows — never the names (knowledge document 05).
        await database
          .connection()
          .query.insertInto('eduXuatDuLieuNhatKy')
          .values({
            userId,
            loai: 'nhan_xet',
            boLoc: { thang: input.thang, lopId: input.lopId ?? null },
            soDong: items.length,
            createdAt: new Date(),
          })
          .execute();
        return c.json({ data: { soDong: items.length, danhSach: items } });
      },
    );

    return new Hono().route('/', router);
  }),
];
