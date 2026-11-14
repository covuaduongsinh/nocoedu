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
 * Books handed out to students (DS-61 phase E2). The caller must be allowed `edu.phatSach.manage` and must see the
 * student; the branch comes from the student and the price from the book (`giaBan`) at this moment, so the row says
 * what the parent was asked to pay even if the catalogue changes later. A handout is never edited or deleted here.
 */
const Id = z.coerce.number().int().positive();

const HandoutInput = z.object({
  hocVienId: Id,
  sachId: Id,
  ngay: z.iso.date().optional(),
  uuDai: z.number().int().min(0).max(100_000_000).default(0),
  ghiChu: z.string().trim().max(500).nullish(),
});

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    router.use(
      '/phatSach/ghi',
      auth.required(),
      authz.middleware(),
      bodyLimit({ maxSize: 16 * 1024 }),
    );

    router.post(
      '/phatSach/ghi',
      describeRoute({
        tags: ['NocoEdu'],
        summary: 'Hand a book out to a student',
        operationId: 'handOutBook',
        responses: {
          '200': dataResponse(z.object({}).passthrough()),
          ...apiErrorResponses,
        },
      }),
      needs('edu.phatSach', 'manage'),
      apiValidator('json', HandoutInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const policy = policyOf(c, 'eduPhatSach');
        const studentPolicy = (await policiesOf(c, 'edu.hocVien', 'view'))
          .eduHocVien;
        if (!studentPolicy) {
          throw eduError(
            'PERMISSION_DENIED',
            'EDU_OUT_OF_SCOPE',
            'You may not hand a book out here.',
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
          const book = await connection.query
            .selectFrom('eduSach')
            .select(['id', 'giaBan', 'trangThai'])
            .where('id', '=', input.sachId)
            .executeTakeFirst();
          if (!book) {
            throw eduError(
              'NOT_FOUND',
              'EDU_BOOK_NOT_FOUND',
              'Book not found.',
            );
          }
          if (book.trangThai !== 'dang_ban') {
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_BOOK_WITHDRAWN',
              'This book is no longer sold.',
              'sachId',
            );
          }
          const price = Number(book.giaBan);
          if (input.uuDai > price) {
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_DISCOUNT_TOO_LARGE',
              'The discount is more than the price of the book.',
              'uuDai',
            );
          }
          const handouts = connection
            .repository('eduPhatSach')
            .withPolicy(policy);
          const created = await handouts.createOne({
            values: {
              hocVienId: input.hocVienId,
              sachId: input.sachId,
              coSoId: Number(student.coSoId),
              ngay: input.ngay ?? todayVn(),
              uuDai: input.uuDai,
              tienSach: price - input.uuDai,
              ghiChu: input.ghiChu ?? null,
              nguoiTaoId: userId,
              createdAt: new Date(),
            },
          });
          const id = Number(created.record.id);
          if (!(await handouts.findOne({ filter: { id } }))) {
            throw eduError(
              'PERMISSION_DENIED',
              'EDU_OUT_OF_SCOPE',
              'You may not hand a book out here.',
            );
          }
          return { id, tienSach: price - input.uuDai };
        });
        return c.json({ data: result }, 201);
      },
    );

    return new Hono().route('/', router);
  }),
];
