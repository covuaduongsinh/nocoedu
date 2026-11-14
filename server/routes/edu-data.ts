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
  buoiHoc,
  coSo,
  coSoQuanLy,
  diemDanh,
  dongY,
  goiHoc,
  hocVien,
  lienKet,
  lop,
  lopLich,
  nhanXet,
  phatSach,
  phuHuynh,
  sach,
  sachHoc,
  hoSoGv,
  soDu,
  tuyenSinh,
  thanhToan,
} from '../edu/permissions.js';
import { checkUpdate } from '../edu/sua-ban-ghi.js';
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
  { name: 'buoiHoc', key: 'buoiHoc', resource: buoiHoc },
  { name: 'diemDanh', key: 'diemDanh', resource: diemDanh },
  { name: 'goiHoc', key: 'goiHoc', resource: goiHoc },
  { name: 'thanhToan', key: 'thanhToan', resource: thanhToan },
  { name: 'nhanXetThang', key: 'nhanXetThang', resource: nhanXet },
  { name: 'soDuNhatKy', key: 'soDuNhatKy', resource: soDu },
  // Books handed out: created by `/phatSach/ghi` (it takes the price and the branch from the book and the student).
  { name: 'phatSach', key: 'phatSach', resource: phatSach },
  // The books a student learns or has learned: read only (the Lark import writes it).
  { name: 'sachHoc', key: 'sachHoc', resource: sachHoc },
  // Coach profile and pay: the administrator only; the account of a profile never changes.
  {
    name: 'hoSoGv',
    key: 'hoSoGv',
    resource: hoSoGv,
    create: true,
    update: ['tenVietTat', 'viTri', 'tinhTrang', 'thuLaoMotBuoi'],
  },
  // Admissions: a family that has not enrolled; created, edited and deleted through the record API.
  {
    name: 'lienHe',
    key: 'lienHe',
    resource: tuyenSinh,
    create: true,
    update: FIELDS.lienHe.write,
    remove: true,
  },
  // The books catalogue: a book is withdrawn by its status, never deleted.
  {
    name: 'sach',
    key: 'sach',
    resource: sach,
    create: true,
    update: FIELDS.sach.write,
  },
];

/**
 * A record created through the standard `createOne` must point at a parent the caller may see. The generated route
 * scopes reads and edits but not the parent a new row names, so these checks run before it: a new class needs a
 * branch in scope, a new timetable row needs a class in scope.
 */
const PARENT_OF_CREATE = {
  lop: { field: 'coSoId', resource: 'edu.coSo', collection: 'eduCoSo' },
  lopLich: { field: 'lopId', resource: 'edu.lop', collection: 'eduLop' },
  lienHe: { field: 'coSoId', resource: 'edu.coSo', collection: 'eduCoSo' },
} as const;

const LIEN_HE_STATUSES = ['moi', 'dang_cham_soc', 'da_chot', 'khong_chot'];

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
    // A new class or timetable row must name a parent in scope; so must an edit that moves it to another parent
    // (a branch manager must not move a class into a branch they do not manage).
    for (const [name, parent] of Object.entries(PARENT_OF_CREATE)) {
      for (const method of ['createOne', 'updateOne']) {
        router.use(
          `/${name}/${method}`,
          authz.middleware(),
          async (c, next) => {
            const body = (await c.req.raw
              .clone()
              .json()
              .catch(() => null)) as {
              values?: Record<string, unknown>;
            } | null;
            const named = body?.values?.[parent.field];
            // An edit that leaves the parent alone has nothing to check here.
            if (method === 'updateOne' && named === undefined) {
              await next();
              return;
            }
            const parentId = Number(named);
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
          },
        );
      }
    }
    // What an edit holds: a status from the allowed list, a phone number in its stored form, a level key that agrees
    // with its order. The field list of the generated route says which fields may change, not what they may become.
    for (const name of ['coSo', 'lop', 'hocVien', 'phuHuynh'] as const) {
      router.use(`/${name}/updateOne`, authz.middleware(), async (c, next) => {
        const body = (await c.req.raw
          .clone()
          .json()
          .catch(() => null)) as { values?: Record<string, unknown> } | null;
        const problem = checkUpdate(name, body?.values ?? {});
        if (problem) {
          throw eduError(
            'INVALID_ARGUMENT',
            problem.reason,
            'The value is not valid.',
            problem.field,
          );
        }
        await next();
      });
    }
    // What an admissions record holds: a known status, a phone with digits only, a reminder day that is a date.
    for (const method of ['createOne', 'updateOne']) {
      router.use(`/lienHe/${method}`, authz.middleware(), async (c, next) => {
        const body = (await c.req.raw
          .clone()
          .json()
          .catch(() => null)) as { values?: Record<string, unknown> } | null;
        const values = body?.values ?? {};
        const bad = (field: string, reason: string) =>
          eduError(
            'INVALID_ARGUMENT',
            reason,
            'The value is not valid.',
            field,
          );
        if (
          values.trangThai !== undefined &&
          !LIEN_HE_STATUSES.includes(values.trangThai as never)
        )
          throw bad('trangThai', 'EDU_INVALID_STATUS');
        if (
          typeof values.soDienThoai === 'string' &&
          values.soDienThoai !== '' &&
          !/^[0-9+ ().-]{6,20}$/u.test(values.soDienThoai)
        )
          throw bad('soDienThoai', 'EDU_INVALID_PHONE');
        if (
          typeof values.ngayNhac === 'string' &&
          values.ngayNhac !== '' &&
          !/^\d{4}-\d{2}-\d{2}$/u.test(values.ngayNhac)
        )
          throw bad('ngayNhac', 'EDU_INVALID_VALUE');
        await next();
      });
    }
    // `lop.hlvId` names a coach: only a person who holds the coach permission set may be named. Without this a branch
    // manager could make any account the coach of a class and so give it that class's students.
    for (const method of ['createOne', 'updateOne']) {
      router.use(`/lop/${method}`, authz.middleware(), async (c, next) => {
        const body = (await c.req.raw
          .clone()
          .json()
          .catch(() => null)) as { values?: Record<string, unknown> } | null;
        const hlvId = body?.values?.hlvId;
        if (hlvId !== undefined && hlvId !== null) {
          const assigned =
            typeof hlvId === 'string' && hlvId.length > 0
              ? await database
                  .connection()
                  .query.selectFrom('authorizationPermissionSetAssignments')
                  .select('id')
                  .where('subjectType', '=', 'user')
                  .where('subjectId', '=', hlvId)
                  .where('permissionSetKey', '=', 'edu_hlv')
                  .executeTakeFirst()
              : null;
          if (!assigned) {
            throw eduError(
              'INVALID_ARGUMENT',
              'EDU_NOT_A_COACH',
              'The coach must be a person who holds the coach role.',
              'hlvId',
            );
          }
        }
        await next();
      });
    }
    router.route('/', await repositoryRoutes.createRouter(app));
    return new Hono().route('/', router);
  }),
];
