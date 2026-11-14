import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  apiErrorResponses,
  dataResponse,
  defineApiRoutes,
  describeRoute,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { asText } from '../edu/names.js';
import { addDays, todayVn } from '../edu/so-du.js';
import { needs, policyOf, type EduEnv } from './edu-support.js';

/** A contact of the admissions is kept for a year at most (`.agents/rules/edu.md`): older ones are deleted on request. */
export const RETENTION_DAYS = 365;

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    router.use(
      '/lienHe/donQuaHan',
      auth.required(),
      authz.middleware(),
      bodyLimit({ maxSize: 1024 }),
    );
    router.post(
      '/lienHe/donQuaHan',
      describeRoute({
        tags: ['NocoEdu'],
        summary: 'Delete the admissions contacts older than a year',
        operationId: 'purgeOldContacts',
        responses: {
          '200': dataResponse(z.object({}).passthrough()),
          ...apiErrorResponses,
        },
      }),
      needs('edu.tuyenSinh', 'manage'),
      async (c) => {
        const cutoff = addDays(todayVn(), -RETENTION_DAYS);
        const policy = policyOf(c, 'eduLienHe');
        const removed = await database.transaction(async (connection) => {
          const contacts = connection
            .repository('eduLienHe')
            .withPolicy(policy);
          const rows = await contacts.findMany({
            sort: (s) => s.field('id').asc(),
            limit: 5000,
          });
          const old = rows.filter((row) => asText(row.ngayTao) < cutoff);
          for (const row of old)
            await contacts.deleteOne({ filter: { id: Number(row.id) } });
          return old.length;
        });
        return c.json({ data: { daXoa: removed } });
      },
    );
    return new Hono().route('/', router);
  }),
];
