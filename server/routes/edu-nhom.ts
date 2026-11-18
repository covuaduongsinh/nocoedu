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

import { ensureDefaultGroups } from '../edu/nhom.js';
import { todayVn } from '../edu/so-du.js';
import {
  currentUserId,
  eduError,
  needs,
  policiesOf,
  policyOf,
  type EduEnv,
} from './edu-support.js';

/**
 * Groups of level inside a class (GĐ 3 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`).
 *
 * The groups themselves (`lopNhom`) are read, added, renamed and hidden through the standard record API in
 * `edu-data.ts`. Two things are not plain CRUD and live here, both behind `edu.lopNhom` `manage`:
 *
 * - `POST /hocVien/chuyenNhom` moves one student into a group of the student's own class (or out of every group) and
 *   writes the history row in the same transaction. The student and the group are read through the caller's own
 *   policies, so a coach reaches only their classes and a branch manager only their branches; a group of another class
 *   is refused. `eduHocVien.nhomId` is not writable through any record API.
 * - `POST /lopNhom/taoMacDinh` gives a class that has no group the three default groups (a class imported or restored
 *   without them).
 */
const Id = z.coerce.number().int().positive();

const MoveInput = z.object({
  hocVienId: Id,
  nhomId: Id.nullable(),
  ghiChu: z.string().trim().max(500).nullish(),
});
const DefaultsInput = z.object({ lopId: Id });

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

    for (const path of ['/hocVien/chuyenNhom', '/lopNhom/taoMacDinh']) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 16 * 1024 }),
      );
    }

    router.post(
      '/hocVien/chuyenNhom',
      declare('Move a student to a group of their class', 'moveStudentGroup'),
      needs('edu.lopNhom', 'manage'),
      apiValidator('json', MoveInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const groupPolicy = policyOf(c, 'eduLopNhom');
        const studentPolicy = (await policiesOf(c, 'edu.hocVien', 'view'))
          .eduHocVien;
        if (!studentPolicy) {
          throw eduError(
            'PERMISSION_DENIED',
            'EDU_PERMISSION_DENIED',
            'This action is not allowed.',
          );
        }
        const result = await database.transaction(async (connection) => {
          const student = await connection
            .repository('eduHocVien')
            .withPolicy(studentPolicy)
            .findOne({ filter: { id: input.hocVienId } });
          if (!student) {
            throw eduError(
              'NOT_FOUND',
              'EDU_STUDENT_NOT_FOUND',
              'Student not found.',
            );
          }
          if (input.nhomId !== null) {
            const group = await connection
              .repository('eduLopNhom')
              .withPolicy(groupPolicy)
              .findOne({ filter: { id: input.nhomId } });
            if (!group) {
              throw eduError(
                'NOT_FOUND',
                'EDU_GROUP_NOT_FOUND',
                'Group not found.',
              );
            }
            if (
              student.lopId == null ||
              Number(group.lopId) !== Number(student.lopId)
            ) {
              throw eduError(
                'INVALID_ARGUMENT',
                'EDU_GROUP_NOT_IN_CLASS',
                'The group does not belong to the class of this student.',
                'nhomId',
              );
            }
            if (group.trangThai !== 'hoat_dong') {
              throw eduError(
                'FAILED_PRECONDITION',
                'EDU_GROUP_HIDDEN',
                'This group is hidden.',
                'nhomId',
              );
            }
          }
          const before = student.nhomId == null ? null : Number(student.nhomId);
          if (before === input.nhomId) {
            return { hocVienId: input.hocVienId, nhomId: before, moved: false };
          }
          // The policy of `manage` does not let this column change through the repository; the checks above are
          // what make the write safe.
          await connection.query
            .updateTable('eduHocVien')
            .set({ nhomId: input.nhomId })
            .where('id', '=', input.hocVienId)
            .execute();
          await connection.query
            .insertInto('eduHocVienChuyenNhom')
            .values({
              hocVienId: input.hocVienId,
              tuNhomId: before,
              denNhomId: input.nhomId,
              ngay: todayVn(),
              nguoiThucHienId: userId,
              ghiChu: input.ghiChu ?? null,
            })
            .execute();
          return {
            hocVienId: input.hocVienId,
            nhomId: input.nhomId,
            moved: true,
          };
        });
        return c.json({ data: result });
      },
    );

    router.post(
      '/lopNhom/taoMacDinh',
      declare(
        'Give a class that has no group the default groups',
        'createDefaultGroups',
      ),
      needs('edu.lopNhom', 'manage'),
      apiValidator('json', DefaultsInput),
      async (c) => {
        const { lopId } = c.req.valid('json');
        const classPolicy = (await policiesOf(c, 'edu.lop', 'view')).eduLop;
        const created = await database.transaction(async (connection) => {
          const lop = classPolicy
            ? await connection
                .repository('eduLop')
                .withPolicy(classPolicy)
                .findOne({ filter: { id: lopId } })
            : null;
          if (!lop) {
            throw eduError(
              'NOT_FOUND',
              'EDU_CLASS_NOT_FOUND',
              'Class not found.',
            );
          }
          return ensureDefaultGroups(connection.query, lopId);
        });
        return c.json({ data: { lopId, created } });
      },
    );

    return new Hono().route('/', router);
  }),
];
