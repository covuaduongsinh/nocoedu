import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  defineRepositoryApiRoutes,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import {
  COLLECTIONS,
  FIELDS,
  coSo,
  coSoQuanLy,
  dongY,
  hocVien,
  lienKet,
  lop,
  lopLich,
  phuHuynh,
} from '../edu/permissions.js';
import { eduError, policiesOf, type EduEnv } from './edu-support.js';

/**
 * Standard record APIs (`POST /api/<name>/findMany|findOne|count|createOne|updateOne|deleteOne`) over the NocoEdu
 * collections. Every exposure is behind `auth.required()` and `authorizeRepository`, which binds each method to a
 * composite action of `server/edu/permissions.ts`; a method with no mapping answers 403. The record scope (all /
 * my branches / my classes) comes from the caller's permission set. Student and parent rows are created by the
 * business routes in `edu-actions.ts` instead, because they get their stable code (`ma`) there.
 */
interface Exposure {
  readonly name: string;
  readonly key: keyof typeof FIELDS;
  readonly resource: { reference(): unknown };
  readonly create?: boolean;
  readonly update?: readonly string[];
  readonly remove?: boolean;
}

const EXPOSURES: readonly Exposure[] = [
  {
    name: 'coSo',
    key: 'coSo',
    resource: coSo,
    create: true,
    update: FIELDS.coSo.write,
  },
  {
    name: 'coSoQuanLy',
    key: 'coSoQuanLy',
    resource: coSoQuanLy,
    create: true,
    update: ['coSoId', 'userId'],
    remove: true,
  },
  {
    name: 'lop',
    key: 'lop',
    resource: lop,
    create: true,
    update: FIELDS.lop.write,
    remove: true,
  },
  {
    name: 'lopLich',
    key: 'lopLich',
    resource: lopLich,
    create: true,
    update: FIELDS.lopLich.write,
    remove: true,
  },
  {
    name: 'hocVien',
    key: 'hocVien',
    resource: hocVien,
    update: FIELDS.hocVien.edit,
  },
  {
    name: 'phuHuynh',
    key: 'phuHuynh',
    resource: phuHuynh,
    update: FIELDS.phuHuynh.edit,
  },
  {
    name: 'lienKet',
    key: 'lienKet',
    resource: lienKet,
    update: ['quanHe', 'lienHeChinh'],
    remove: true,
  },
  { name: 'dongY', key: 'dongY', resource: dongY },
];

/**
 * A record created through the standard `createOne` must point at a parent the caller may see. The generated route
 * scopes reads and edits but not the parent a new row names, so these checks run before it: a new class needs a
 * branch in scope, a new timetable row needs a class in scope.
 */
const PARENT_OF_CREATE = {
  lop: { field: 'coSoId', resource: 'edu.coSo', collection: 'eduCoSo' },
  lopLich: { field: 'lopId', resource: 'edu.lop', collection: 'eduLop' },
} as const;

const repositoryRoutes = defineRepositoryApiRoutes({
  repositories: EXPOSURES.map((e) => ({
    name: e.name,
    collection: COLLECTIONS[e.key].name,
    policy: {
      read: { scope: true, fields: [...FIELDS[e.key].read] },
      create: e.create
        ? { scope: true, fields: [...FIELDS[e.key].write] }
        : false,
      update: e.update ? { scope: true, fields: [...e.update] } : false,
      delete: e.remove ? { scope: true } : false,
    },
    actions: {
      findMany: { maxLimit: 100 },
      findOne: {},
      count: {},
      ...(e.create ? { createOne: {} } : {}),
      ...(e.update ? { updateOne: {} } : {}),
      ...(e.remove ? { deleteOne: {} } : {}),
    },
  })),
});

export default [
  defineApiRoutes<AppPluginApplication>(async (app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<AuthorizationEnv & EduEnv>();

    for (const e of EXPOSURES) {
      // Only the generated method paths: the business routes in `edu-actions.ts` share the first path segment and
      // carry their own authorization.
      const methods = [
        'findMany',
        'findOne',
        'count',
        ...(e.create ? ['createOne'] : []),
        ...(e.update ? ['updateOne'] : []),
        ...(e.remove ? ['deleteOne'] : []),
      ];
      // The reference types name each resource's own actions; the mapping is checked when the router is built.
      const guard = authz.database.authorizeRepository({
        repository: e.name,
        resource: e.resource.reference(),
        actions: {
          findMany: 'view',
          findOne: 'view',
          count: 'view',
          ...(e.create ? { createOne: 'manage' } : {}),
          ...(e.update ? { updateOne: 'manage' } : {}),
          ...(e.remove ? { deleteOne: 'manage' } : {}),
        },
      } as never);
      // Scoped to the exposure's own method paths: a global `*` guard would answer 401 for paths no route owns.
      for (const method of methods) {
        router.use(
          `/${e.name}/${method}`,
          auth.required(),
          bodyLimit({ maxSize: 64 * 1024 }),
          guard,
        );
      }
    }
    for (const [name, parent] of Object.entries(PARENT_OF_CREATE)) {
      router.use(`/${name}/createOne`, authz.middleware(), async (c, next) => {
        const body = (await c.req.raw
          .clone()
          .json()
          .catch(() => null)) as {
          values?: Record<string, unknown>;
        } | null;
        const parentId = Number(body?.values?.[parent.field]);
        const policy = (await policiesOf(c, parent.resource, 'view'))[
          parent.collection
        ];
        const visible =
          policy && Number.isInteger(parentId) && parentId > 0
            ? await database
                .repository(parent.collection)
                .withPolicy(policy)
                .findOne({ filter: { id: parentId } })
            : null;
        if (!visible) {
          throw eduError(
            'PERMISSION_DENIED',
            'EDU_OUT_OF_SCOPE',
            'You may not create a record here.',
          );
        }
        await next();
      });
    }
    router.route('/', await repositoryRoutes.createRouter(app));
    return new Hono().route('/', router);
  }),
];
