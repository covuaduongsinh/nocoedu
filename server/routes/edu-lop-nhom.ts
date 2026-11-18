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

import { ensureDefaultGroups } from '../edu/lop-nhom.js';
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
 * Business actions on the groups of a class (phase 3 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`). Adding,
 * renaming and hiding a group is the record API of `lopNhom` (`edu-data.ts`); these two routes are what that API cannot
 * express:
 *
 * - `POST /hocVien/chuyenNhom` moves one student to a group of his own class (or out of every group) and writes the
 *   history. `eduHocVien.nhomId` is not a writable field of any permission, so this route is the only writer.
 * - `POST /lopNhom/taoMacDinh` gives a class that has no group the three standard groups (a class that came from an
 *   import, or one whose creation stopped half way).
 *
 * Both authenticate, authorize `edu.lopNhom` before the body is read, and read every row through the policy of that
 * action: a student or class outside the caller's scope is "not found".
 */
const Id = z.coerce.number().int().positive();

const ChuyenNhomInput = z.object({
  hocVienId: Id,
  nhomId: Id.nullable(),
  ghiChu: z.string().trim().max(500).nullish(),
});

const ResultSchema = z.object({ id: z.number() }).passthrough();

const declare = (summary: string, operationId: string) =>
  describeRoute({
    tags: ['NocoEdu'],
    summary,
    operationId,
    responses: { '200': dataResponse(ResultSchema), ...apiErrorResponses },
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
      declare('Move a student to a group of his class', 'moveStudentGroup'),
      needs('edu.lopNhom', 'moveStudent'),
      apiValidator('json', ChuyenNhomInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const studentPolicy = policyOf(c, 'eduHocVien');
        const groupPolicy = policyOf(c, 'eduLopNhom');
        const historyPolicy = policyOf(c, 'eduHocVienChuyenNhom');
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
          if (student.lopId == null) {
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_STUDENT_HAS_NO_CLASS',
              'The student is not in a class.',
            );
          }
          const current =
            student.nhomId == null ? null : Number(student.nhomId);
          if (input.nhomId !== null) {
            // The group must be one the caller sees, of the student's own class, and not hidden.
            const group = await connection
              .repository('eduLopNhom')
              .withPolicy(groupPolicy)
              .findOne({ filter: { id: input.nhomId } });
            if (!group) {
              throw eduError(
                'NOT_FOUND',
                'EDU_GROUP_NOT_FOUND',
                'Group not found.',
                'nhomId',
              );
            }
            if (Number(group.lopId) !== Number(student.lopId)) {
              throw eduError(
                'INVALID_ARGUMENT',
                'EDU_GROUP_NOT_IN_CLASS',
                'The group does not belong to the class of the student.',
                'nhomId',
              );
            }
            if (group.trangThai !== 'hoat_dong') {
              throw eduError(
                'FAILED_PRECONDITION',
                'EDU_GROUP_HIDDEN',
                'The group is hidden.',
                'nhomId',
              );
            }
          }
          if (current === input.nhomId) {
            return { id: input.hocVienId, thayDoi: false };
          }
          // The expected current group is part of the predicate: a concurrent move matches no row and stops here
          // instead of writing a second history row for the same step.
          const query = connection.query.updateTable('eduHocVien');
          const updated = await query
            .set({ nhomId: input.nhomId })
            .where('id', '=', input.hocVienId)
            .where('nhomId', current === null ? 'is' : '=', current)
            .execute();
          if (updated.updatedCount !== 1) {
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_GROUP_CHANGED',
              'The group of the student has just changed. Reload and try again.',
            );
          }
          await connection
            .repository('eduHocVienChuyenNhom')
            .withPolicy(historyPolicy)
            .createOne({
              values: {
                hocVienId: input.hocVienId,
                tuNhomId: current,
                denNhomId: input.nhomId,
                ngay: todayVn(),
                nguoiThucHienId: userId,
                ghiChu: input.ghiChu ?? null,
              },
            });
          return { id: input.hocVienId, thayDoi: true };
        });
        return c.json({ data: result });
      },
    );

    router.post(
      '/lopNhom/taoMacDinh',
      declare(
        'Give a class without groups the three standard groups',
        'createDefaultGroups',
      ),
      needs('edu.lopNhom', 'manage'),
      apiValidator('json', z.object({ lopId: Id })),
      async (c) => {
        const { lopId } = c.req.valid('json');
        // The class must be one the caller sees (edu.lop view): a class of another branch or coach is not found.
        const classPolicy = (await policiesOf(c, 'edu.lop', 'view')).eduLop;
        const lop = classPolicy
          ? await database
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
        const created = await database.transaction(async (connection) =>
          ensureDefaultGroups(connection.query, lopId),
        );
        return c.json({ data: { id: lopId, taoMoi: created } });
      },
    );

    return new Hono().route('/', router);
  }),
];
