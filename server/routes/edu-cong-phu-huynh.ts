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

import {
  createLimiter,
  expiryOf,
  hashToken,
  looksLikeToken,
  newToken,
} from '../edu/cong-phu-huynh.js';
import { LEVELS } from '../edu/levels.js';
import { asText, shortName } from '../edu/names.js';
import {
  currentUserId,
  eduError,
  needs,
  policiesOf,
  policyOf,
  type EduEnv,
} from './edu-support.js';

/**
 * The private link of a parent (stage 3).
 *
 * Three routes are for staff and sit behind `edu.congPhuHuynh`: `/congPhuHuynh/taoLink` and `/thuHoi` (`manage`: the
 * administrator and the branch managers, over the students of their branches) and `/danhSach` (`view`). Making a link
 * for a parent revokes the earlier ones of that parent. The token is in the answer of `taoLink` once and nowhere else:
 * the database holds its SHA-256 only.
 *
 * One route is public by design, `/congPhuHuynh/xem`: a parent has no account. Its boundary is the token, in the body
 * (never in the address): a token that is unknown, expired or revoked is the same 404; the answer is never cached or
 * indexed; and a caller that asks too often gets 429. It shows what a family may read and nothing else: the short
 * name, the level, the class, the balance, the latest sessions and the latest monthly comment. Never a date of birth,
 * a phone number, an amount of money or the coach's private note.
 */
const SESSIONS_SHOWN = 10;

const MakeInput = z.object({
  hocVienId: z.coerce.number().int().positive(),
  phuHuynhId: z.coerce.number().int().positive(),
});
const IdInput = z.object({ id: z.coerce.number().int().positive() });
const StudentInput = z.object({
  hocVienId: z.coerce.number().int().positive(),
});
const ReadInput = z.object({ token: z.string().max(128) });

const notFound = () =>
  eduError('NOT_FOUND', 'EDU_LINK_NOT_FOUND', 'This link is not valid.');

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();
    // Per caller, and for everybody together: a caller's address comes from a header that a proxy sets and a client
    // may forge, so the shared counter is what bounds a flood.
    const perCaller = createLimiter({ max: 30, windowMs: 60_000 });
    const everybody = createLimiter({ max: 600, windowMs: 60_000 });

    for (const path of [
      '/congPhuHuynh/taoLink',
      '/congPhuHuynh/thuHoi',
      '/congPhuHuynh/danhSach',
    ]) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 2 * 1024 }),
      );
    }

    router.post(
      '/congPhuHuynh/taoLink',
      describeRoute({
        tags: ['NocoEdu'],
        summary: "Make a parent's private link (the token is shown once)",
        operationId: 'makeParentLink',
        responses: {
          '201': dataResponse(
            z.object({
              id: z.number(),
              token: z.string(),
              hanLuc: z.string(),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      needs('edu.congPhuHuynh', 'manage'),
      apiValidator('json', MakeInput),
      async (c) => {
        const input = c.req.valid('json');
        const students = (await policiesOf(c, 'edu.hocVien', 'view'))
          .eduHocVien;
        const student = students
          ? await database
              .repository('eduHocVien')
              .withPolicy(students)
              .findOne({ filter: { id: input.hocVienId } })
          : null;
        // A student outside the caller's scope is "not found", exactly like one that does not exist.
        if (!student) {
          throw eduError(
            'NOT_FOUND',
            'EDU_STUDENT_NOT_FOUND',
            'Student not found.',
          );
        }
        const token = newToken();
        const now = new Date();
        const hanLuc = expiryOf(now);
        const id = await database.transaction(async (connection) => {
          const q = connection.query;
          const link = await q
            .selectFrom('eduHocVienPhuHuynh')
            .select('id')
            .where('hocVienId', '=', input.hocVienId)
            .where('phuHuynhId', '=', input.phuHuynhId)
            .executeTakeFirst();
          if (!link) {
            throw eduError(
              'NOT_FOUND',
              'EDU_PARENT_LINK_NOT_FOUND',
              'This parent is not linked to the student.',
            );
          }
          // One live link per parent and child: a new one replaces the old.
          await q
            .updateTable('eduCongPhuHuynh')
            .set({ thuHoiLuc: now })
            .where('hocVienId', '=', input.hocVienId)
            .where('phuHuynhId', '=', input.phuHuynhId)
            .where('thuHoiLuc', 'is', null)
            .execute();
          await q
            .insertInto('eduCongPhuHuynh')
            .values({
              hocVienId: input.hocVienId,
              phuHuynhId: input.phuHuynhId,
              tokenHash: hashToken(token),
              hanLuc,
              soLanXem: 0,
              nguoiTaoId: currentUserId(c),
              createdAt: now,
            })
            .execute();
          const row = await q
            .selectFrom('eduCongPhuHuynh')
            .select('id')
            .where('tokenHash', '=', hashToken(token))
            .executeTakeFirstOrThrow();
          return Number(row.id);
        });
        c.header('Cache-Control', 'no-store');
        return c.json(
          { data: { id, token, hanLuc: hanLuc.toISOString() } },
          201,
        );
      },
    );

    router.post(
      '/congPhuHuynh/thuHoi',
      describeRoute({
        tags: ['NocoEdu'],
        summary: "Revoke a parent's private link",
        operationId: 'revokeParentLink',
        responses: {
          '200': dataResponse(z.object({ id: z.number() })),
          ...apiErrorResponses,
        },
      }),
      needs('edu.congPhuHuynh', 'manage'),
      apiValidator('json', IdInput),
      async (c) => {
        const { id } = c.req.valid('json');
        const link = await database
          .repository('eduCongPhuHuynh')
          .withPolicy(policyOf(c, 'eduCongPhuHuynh'))
          .findOne({ filter: { id } });
        if (!link) {
          throw eduError('NOT_FOUND', 'EDU_LINK_NOT_FOUND', 'Link not found.');
        }
        await database
          .connection()
          .query.updateTable('eduCongPhuHuynh')
          .set({ thuHoiLuc: new Date() })
          .where('id', '=', id)
          .where('thuHoiLuc', 'is', null)
          .execute();
        return c.json({ data: { id } });
      },
    );

    router.post(
      '/congPhuHuynh/danhSach',
      describeRoute({
        tags: ['NocoEdu'],
        summary: 'The private links of a student, without any token',
        operationId: 'listParentLinks',
        responses: {
          '200': dataResponse(z.array(z.object({}).passthrough())),
          ...apiErrorResponses,
        },
      }),
      needs('edu.congPhuHuynh', 'view'),
      apiValidator('json', StudentInput),
      async (c) => {
        const { hocVienId } = c.req.valid('json');
        const rows = await database
          .repository('eduCongPhuHuynh')
          .withPolicy(policyOf(c, 'eduCongPhuHuynh'))
          .findMany({
            filter: (f) => f.number('hocVienId').eq(hocVienId),
            sort: (s) => s.field('id').desc(),
            limit: 50,
          });
        return c.json({ data: rows });
      },
    );

    // --- Public: what a parent reads ------------------------------------------------------------------------------
    router.use(
      '/congPhuHuynh/xem',
      bodyLimit({ maxSize: 1024 }),
      async (c, next) => {
        c.header('Cache-Control', 'no-store');
        c.header('X-Robots-Tag', 'noindex, nofollow');
        c.header('Referrer-Policy', 'no-referrer');
        const caller =
          c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        if (!everybody.hit('*') || !perCaller.hit(caller)) {
          c.header('Retry-After', '60');
          throw eduError(
            'RESOURCE_EXHAUSTED',
            'EDU_LINK_RATE_LIMITED',
            'Too many requests. Try again in a minute.',
          );
        }
        await next();
      },
    );
    router.post(
      '/congPhuHuynh/xem',
      describeRoute({
        tags: ['NocoEdu'],
        summary: "What a parent sees through their child's private link",
        operationId: 'readParentLink',
        // No session and no API key: the token in the body is the credential.
        security: [],
        responses: {
          '200': dataResponse(z.object({}).passthrough()),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', ReadInput),
      async (c) => {
        const { token } = c.req.valid('json');
        if (!looksLikeToken(token)) throw notFound();
        const q = database.connection().query;
        const link = await q
          .selectFrom('eduCongPhuHuynh')
          .select(['id', 'hocVienId', 'hanLuc', 'thuHoiLuc', 'soLanXem'])
          .where('tokenHash', '=', hashToken(token))
          .executeTakeFirst();
        const now = new Date();
        if (
          !link ||
          link.thuHoiLuc != null ||
          new Date(link.hanLuc as string | Date).getTime() <= now.getTime()
        ) {
          throw notFound();
        }
        await q
          .updateTable('eduCongPhuHuynh')
          .set({ xemCuoiLuc: now, soLanXem: Number(link.soLanXem) + 1 })
          .where('id', '=', Number(link.id))
          .execute();

        const student = await q
          .selectFrom('eduHocVien')
          .select(['id', 'hoTen', 'levelKey', 'lopId', 'soBuoiConLai'])
          .where('id', '=', Number(link.hocVienId))
          .executeTakeFirst();
        if (!student) throw notFound();
        const lop =
          student.lopId == null
            ? undefined
            : await q
                .selectFrom('eduLop')
                .select('ten')
                .where('id', '=', Number(student.lopId))
                .executeTakeFirst();
        const marks = await q
          .selectFrom('eduDiemDanh')
          .select([
            'buoiHocId',
            'trangThai',
            'daLamBtvn',
            'nhanXet',
            'yThucDiem',
          ])
          .where('hocVienId', '=', Number(student.id))
          .execute();
        const sessions = marks.length
          ? await q
              .selectFrom('eduBuoiHoc')
              .select(['id', 'ngay', 'kienThucMoi', 'giaoBtvn', 'trangThai'])
              .where(
                'id',
                'in',
                marks.map((mark) => Number(mark.buoiHocId)),
              )
              .execute()
          : [];
        const byId = new Map(sessions.map((s) => [Number(s.id), s]));
        const recent = marks
          .map((mark) => ({ mark, session: byId.get(Number(mark.buoiHocId)) }))
          .filter(
            (
              item,
            ): item is typeof item & {
              session: NonNullable<typeof item.session>;
            } => item.session !== undefined && item.session.trangThai !== 'huy',
          )
          .sort((a, b) =>
            asText(b.session.ngay).localeCompare(asText(a.session.ngay)),
          )
          .slice(0, SESSIONS_SHOWN)
          .map(({ mark, session }) => ({
            ngay: asText(session.ngay),
            trangThai: asText(mark.trangThai),
            daLamBtvn: mark.daLamBtvn === true || mark.daLamBtvn === 1,
            yThuc: mark.yThucDiem == null ? null : Number(mark.yThucDiem),
            kienThucMoi: asText(session.kienThucMoi),
            giaoBtvn: asText(session.giaoBtvn),
            nhanXet: asText(mark.nhanXet),
          }));
        const monthly = await q
          .selectFrom('eduNhanXetThang')
          .select(['thang', 'noiDung'])
          .where('hocVienId', '=', Number(student.id))
          .orderBy('thang', 'desc')
          .limit(1)
          .executeTakeFirst();
        const level = LEVELS.find((item) => item.key === student.levelKey);
        return c.json({
          data: {
            tenGoi: shortName(asText(student.hoTen)),
            capDo: level ? level.title : '',
            lop: lop ? asText(lop.ten) : '',
            soBuoiConLai: Number(student.soBuoiConLai),
            cacBuoi: recent,
            nhanXetThang: monthly
              ? {
                  thang: asText(monthly.thang),
                  noiDung: asText(monthly.noiDung),
                }
              : null,
            hanLuc: new Date(link.hanLuc as string | Date).toISOString(),
          },
        });
      },
    );

    return new Hono().route('/', router);
  }),
];
