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
import { needs, type EduEnv } from './edu-support.js';

/**
 * Pay of the coaches for a month (DS-61 phase F): for every profile, the sessions it taught that month (taken
 * attendance, `trangThai = da_diem_danh`) times its pay for one session. Only who holds `edu.hoSoGv` (the
 * administrator) may ask. The answer holds the account name, counts and sums in dong.
 */
const MonthInput = z.object({
  thang: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
});

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    router.use(
      '/hoSoGv/*',
      auth.required(),
      authz.middleware(),
      bodyLimit({ maxSize: 4 * 1024 }),
    );
    router.post(
      '/hoSoGv/thuLao',
      describeRoute({
        tags: ['NocoEdu'],
        summary: 'Pay of the coaches for a month',
        operationId: 'coachPay',
        responses: {
          '200': dataResponse(z.object({}).passthrough()),
          ...apiErrorResponses,
        },
      }),
      needs('edu.hoSoGv', 'view'),
      apiValidator('json', MonthInput),
      async (c) => {
        const { thang } = c.req.valid('json');
        const q = database.connection().query;
        const profiles = await q
          .selectFrom('eduHoSoGv')
          .select(['userId', 'tenVietTat', 'thuLaoMotBuoi'])
          .orderBy('id')
          .execute();
        const sessions = await q
          .selectFrom('eduBuoiHoc')
          .select(['hlvId'])
          .where('ngay', 'like', `${thang}-%`)
          .where('trangThai', '=', 'da_diem_danh')
          .where('hlvId', 'is not', null)
          .execute();
        const taught = new Map<string, number>();
        for (const row of sessions)
          taught.set(
            asText(row.hlvId),
            (taught.get(asText(row.hlvId)) ?? 0) + 1,
          );
        const ids = profiles.map((p) => asText(p.userId));
        const users = ids.length
          ? await q
              .selectFrom('user')
              .select(['id', 'name'])
              .where('id', 'in', ids)
              .execute()
          : [];
        const names = new Map(users.map((u) => [asText(u.id), asText(u.name)]));
        const rows = profiles.map((p) => {
          const soBuoi = taught.get(asText(p.userId)) ?? 0;
          const thuLaoMotBuoi = Number(p.thuLaoMotBuoi);
          return {
            userId: asText(p.userId),
            ten: asText(p.tenVietTat) || (names.get(asText(p.userId)) ?? ''),
            soBuoi,
            thuLaoMotBuoi,
            tong: soBuoi * thuLaoMotBuoi,
          };
        });
        return c.json({
          data: {
            rows,
            tong: rows.reduce((sum, row) => sum + row.tong, 0),
          },
        });
      },
    );

    const CoachSessionsInput = z.object({
      thang: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
      userId: z.string().min(1),
    });

    router.post(
      '/hoSoGv/chiTietBuoiDay',
      describeRoute({
        tags: ['NocoEdu'],
        summary: 'Sessions taught by a coach in a month',
        operationId: 'coachSessionsDetail',
        responses: {
          '200': dataResponse(z.object({}).passthrough()),
          ...apiErrorResponses,
        },
      }),
      needs('edu.hoSoGv', 'view'),
      apiValidator('json', CoachSessionsInput),
      async (c) => {
        const { thang, userId } = c.req.valid('json');
        const q = database.connection().query;
        const sessions = await q
          .selectFrom('eduBuoiHoc')
          .select(['id', 'lopId', 'ngay', 'gioBatDau', 'gioKetThuc', 'trangThai'])
          .where('ngay', 'like', `${thang}-%`)
          .where('trangThai', '=', 'da_diem_danh')
          .where('hlvId', '=', userId)
          .orderBy('ngay', 'asc')
          .execute();
        const lopIds = [
          ...new Set(sessions.map((s) => Number(s.lopId)).filter(Boolean)),
        ];
        const lops = lopIds.length
          ? await q
              .selectFrom('eduLop')
              .select(['id', 'ten', 'ma'])
              .where('id', 'in', lopIds)
              .execute()
          : [];
        const lopMap = new Map(lops.map((l) => [Number(l.id), asText(l.ten)]));
        const rows = sessions.map((s) => ({
          id: Number(s.id),
          lopId: Number(s.lopId),
          lopTen: lopMap.get(Number(s.lopId)) ?? '',
          ngay: asText(s.ngay),
          gioBatDau: asText(s.gioBatDau),
          gioKetThuc: asText(s.gioKetThuc),
          trangThai: asText(s.trangThai),
        }));
        return c.json({ data: { rows } });
      },
    );
    return new Hono().route('/', router);
  }),
];
