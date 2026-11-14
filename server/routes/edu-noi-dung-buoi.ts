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

import { asText } from '../edu/names.js';
import {
  eduError,
  needs,
  policiesOf,
  policyOf,
  type EduEnv,
} from './edu-support.js';

/**
 * What was taught in a session and how mindful each student was (DS-61).
 *
 * The four content columns of `eduBuoiHoc` (`keHoachDay`, `kienThucMoi`, `giaoBtvn`, `keHoachBuoiSau`) and the score
 * `eduDiemDanh.yThucDiem` were added for the Lark import (DS-60). None is a permission field, so no standard record
 * API returns or writes them (the same choice as `eduHocVien.ngaySinh`). These two routes are the only way in:
 *
 * - `POST /buoiHoc/noiDung/xem` needs `edu.diemDanh` `view` and a session inside the caller's scope;
 * - `POST /buoiHoc/noiDung/luu` needs `edu.diemDanh` `record`, the same scope, and writes the score only for a student
 *   who already has an attendance row in that session. It never touches the balance or the attendance status.
 */
const Id = z.coerce.number().int().positive();
const Text = z.string().trim().max(2000).nullish();

const ViewInput = z.object({ buoiHocId: Id });
const SaveInput = z.object({
  buoiHocId: Id,
  noiDung: z
    .object({
      keHoachDay: Text,
      kienThucMoi: Text,
      giaoBtvn: Text,
      keHoachBuoiSau: Text,
    })
    .optional(),
  yThuc: z
    .array(
      z.object({
        hocVienId: Id,
        diem: z.number().int().min(0).max(10).nullable(),
      }),
    )
    .max(200)
    .optional(),
});

const CONTENT_FIELDS = [
  'keHoachDay',
  'kienThucMoi',
  'giaoBtvn',
  'keHoachBuoiSau',
] as const;

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

const sessionNotFound = () =>
  eduError('NOT_FOUND', 'EDU_SESSION_NOT_FOUND', 'Session not found.');

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    for (const path of ['/buoiHoc/noiDung/xem', '/buoiHoc/noiDung/luu']) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 64 * 1024 }),
      );
    }

    /** The session, only when the caller's `edu.buoiHoc` scope covers it. */
    async function visibleSession(
      c: Parameters<typeof policiesOf>[0],
      buoiHocId: number,
    ): Promise<void> {
      const policy = (await policiesOf(c, 'edu.buoiHoc', 'view')).eduBuoiHoc;
      const session = policy
        ? await database
            .repository('eduBuoiHoc')
            .withPolicy(policy)
            .findOne({ filter: { id: buoiHocId } })
        : null;
      if (!session) throw sessionNotFound();
    }

    router.post(
      '/buoiHoc/noiDung/xem',
      declare(
        'Read the content of a session and the awareness scores',
        'readSessionContent',
      ),
      needs('edu.diemDanh', 'view'),
      apiValidator('json', ViewInput),
      async (c) => {
        const input = c.req.valid('json');
        await visibleSession(c, input.buoiHocId);
        const attendancePolicy = policyOf(c, 'eduDiemDanh');
        const q = database.connection().query;
        const content = await q
          .selectFrom('eduBuoiHoc')
          .select([...CONTENT_FIELDS])
          .where('id', '=', input.buoiHocId)
          .executeTakeFirstOrThrow();
        // The rows of this session the caller may see; the score is read for those rows only.
        const rows = await database
          .repository('eduDiemDanh')
          .withPolicy(attendancePolicy)
          .findMany({
            filter: { buoiHocId: input.buoiHocId },
            limit: 200,
          });
        const ids = rows.map((row) => Number(row.id));
        const scores =
          ids.length === 0
            ? []
            : await q
                .selectFrom('eduDiemDanh')
                .select(['id', 'hocVienId', 'yThucDiem'])
                .where('id', 'in', ids)
                .execute();
        return c.json({
          data: {
            buoiHocId: input.buoiHocId,
            noiDung: Object.fromEntries(
              CONTENT_FIELDS.map((field) => [
                field,
                content[field] == null ? '' : asText(content[field]),
              ]),
            ),
            yThuc: scores
              .filter((row) => row.yThucDiem != null)
              .map((row) => ({
                hocVienId: Number(row.hocVienId),
                diem: Number(row.yThucDiem),
              })),
          },
        });
      },
    );

    router.post(
      '/buoiHoc/noiDung/luu',
      declare(
        'Save the content of a session and the awareness scores',
        'saveSessionContent',
      ),
      needs('edu.diemDanh', 'record'),
      apiValidator('json', SaveInput),
      async (c) => {
        const input = c.req.valid('json');
        await visibleSession(c, input.buoiHocId);
        const attendancePolicy = policyOf(c, 'eduDiemDanh');
        const scores = input.yThuc ?? [];
        if (new Set(scores.map((s) => s.hocVienId)).size !== scores.length) {
          throw eduError(
            'INVALID_ARGUMENT',
            'EDU_DUPLICATE_STUDENT',
            'A student appears twice in the list.',
            'yThuc',
          );
        }
        await database.transaction(async (connection) => {
          if (input.noiDung) {
            // Only the fields that were sent change; an empty text clears a field.
            const values: Record<string, string | null> = {};
            for (const field of CONTENT_FIELDS) {
              const value = input.noiDung[field];
              if (value !== undefined) values[field] = value || null;
            }
            if (Object.keys(values).length > 0) {
              await connection.query
                .updateTable('eduBuoiHoc')
                .set(values)
                .where('id', '=', input.buoiHocId)
                .execute();
            }
          }
          const attendance = connection
            .repository('eduDiemDanh')
            .withPolicy(attendancePolicy);
          for (const score of scores) {
            const row = await attendance.findOne({
              filter: (f) =>
                f.and([
                  f.number('buoiHocId').eq(input.buoiHocId),
                  f.number('hocVienId').eq(score.hocVienId),
                ]),
            });
            if (!row) {
              throw eduError(
                'NOT_FOUND',
                'EDU_ATTENDANCE_NOT_FOUND',
                'Take the attendance of this student first.',
                'yThuc',
              );
            }
            await connection.query
              .updateTable('eduDiemDanh')
              .set({ yThucDiem: score.diem })
              .where('id', '=', Number(row.id))
              .execute();
          }
        });
        return c.json({ data: { buoiHocId: input.buoiHocId } });
      },
    );

    return new Hono().route('/', router);
  }),
];
