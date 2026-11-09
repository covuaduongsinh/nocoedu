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
import { z } from 'zod';

import { asText } from '../edu/names.js';
import { needs, type EduEnv } from './edu-support.js';

/**
 * Lookups for forms. `POST /api/hlv/danhSach` lists the accounts that hold the coach permission set directly, so the
 * class form offers a list instead of a typed account id. Only staff id and name; allowed to whoever may manage classes.
 */
export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();
    router.use('/hlv/danhSach', auth.required(), authz.middleware());
    router.post(
      '/hlv/danhSach',
      describeRoute({
        tags: ['NocoEdu'],
        summary: 'Accounts that hold the coach role',
        operationId: 'listCoaches',
        responses: {
          '200': dataResponse(z.object({}).passthrough()),
          ...apiErrorResponses,
        },
      }),
      needs('edu.lop', 'manage'),
      async (c) => {
        const query = database.connection().query;
        const assigned = await query
          .selectFrom('authorizationPermissionSetAssignments')
          .select('subjectId')
          .where('subjectType', '=', 'user')
          .where('permissionSetKey', '=', 'edu_hlv')
          .execute();
        const ids = assigned.map((row) => asText(row.subjectId));
        const users = ids.length
          ? await query
              .selectFrom('user')
              .select(['id', 'name'])
              .where('id', 'in', ids)
              .orderBy('name')
              .execute()
          : [];
        return c.json({
          data: users.map((user) => ({
            id: asText(user.id),
            name: asText(user.name),
          })),
        });
      },
    );
    return new Hono().route('/', router);
  }),
];
