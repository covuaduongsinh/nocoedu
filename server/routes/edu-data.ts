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
  type CollectionKey,
} from '../edu/permissions.js';

/**
 * Standard record APIs (`POST /api/<name>/findMany|findOne|count|createOne|updateOne|deleteOne`) over the NocoEdu
 * collections. Every exposure is behind `auth.required()` and `authorizeRepository`, which binds each method to a
 * composite action of `server/edu/permissions.ts`; a method with no mapping answers 403. The record scope (all /
 * my branches / my classes) comes from the caller's permission set. Student and parent rows are created by the
 * business routes in `edu-actions.ts` instead, because they get their stable code (`ma`) there.
 */
interface Exposure {
  readonly name: string;
  readonly key: CollectionKey;
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
    remove: true,
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
    create: true,
    update: ['quanHe', 'lienHeChinh'],
    remove: true,
  },
  { name: 'dongY', key: 'dongY', resource: dongY },
];

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
    const router = new Hono<AuthorizationEnv>();

    router.use(
      '*',
      auth.required(),
      bodyLimit({ maxSize: 64 * 1024 }),
      ...EXPOSURES.map((e) =>
        // The reference types name each resource's own actions; the mapping is checked when the router is built.
        authz.database.authorizeRepository({
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
        } as never),
      ),
    );
    router.route('/', await repositoryRoutes.createRouter(app));
    return new Hono().route('/', router);
  }),
];
