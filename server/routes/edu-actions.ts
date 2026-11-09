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

import { LEVEL_KEYS, levelOrder } from '../edu/levels.js';
import { asText, codeFromId, normalizePhone } from '../edu/names.js';
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
 * Business actions that are not plain record CRUD: creating a student or a parent (they get a stable code and are
 * linked), confirming a level, recording and withdrawing a consent, and a coach's note. Each route authenticates,
 * authorizes its composite action before reading the body, and runs every read and write through the policy that
 * action was granted, so a coach or a branch manager cannot reach records outside their scope.
 */
const Id = z.coerce.number().int().positive();
const Text = (max: number) => z.string().trim().min(1).max(max);

const HocVienInput = z.object({
  hoTen: Text(191),
  namSinh: z.number().int().min(1950).max(new Date().getFullYear()),
  levelKey: z.enum(LEVEL_KEYS).default('tot'),
  lopId: Id.nullish(),
  coSoId: Id,
  trangThai: z
    .enum(['dang_hoc', 'tam_nghi', 'da_nghi', 'hoc_thu'])
    .default('dang_hoc'),
  ghiChuHlv: z.string().trim().max(2000).nullish(),
});

const PhuHuynhInput = z.object({
  hocVienId: Id,
  hoTen: Text(191),
  soDienThoai: z.string().trim().min(8).max(20),
  zalo: z.string().trim().max(64).nullish(),
  ghiChu: z.string().trim().max(1000).nullish(),
  quanHe: z.enum(['bo', 'me', 'ong', 'ba', 'nguoi_giam_ho', 'khac']),
  lienHeChinh: z.boolean().default(false),
});

const GhiChuInput = z.object({
  id: Id,
  ghiChuHlv: z.string().trim().max(2000),
});

const ChuyenLopInput = z.object({ id: Id, lopId: Id.nullable() });

const LenCapInput = z.object({
  hocVienId: Id,
  denLevelKey: z.enum(LEVEL_KEYS),
  ngay: z.iso.date().optional(),
  ghiChu: z.string().trim().max(1000).nullish(),
});

const DongYInput = z.object({
  hocVienId: Id,
  phuHuynhId: Id,
  mucDich: z.enum(['hoc_tap', 'anh_video', 'xep_hang_cong_khai']),
  dongY: z.boolean(),
  treDongY: z.boolean().default(false),
  phienBanDieuKhoan: Text(32),
  kenh: z.enum(['form', 'giay', 'zalo']),
});

const RutLaiInput = z.object({
  id: Id,
  lyDo: z.string().trim().max(500).optional(),
});

const ResultSchema = z.object({ id: z.number(), ma: z.string().optional() });

const declare = (summary: string, operationId: string) =>
  describeRoute({
    tags: ['NocoEdu'],
    summary,
    operationId,
    responses: { '200': dataResponse(ResultSchema), ...apiErrorResponses },
  });

const today = (): string => todayVn();

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    // Only the paths this router owns are guarded: a global `*` guard would answer 401 for paths no route owns.
    for (const path of [
      '/hocVien/taoMoi',
      '/hocVien/capNhatGhiChu',
      '/hocVien/ngaySinh',
      '/hocVien/chuyenLop',
      '/hocVien/lenCap',
      '/phuHuynh/taoMoi',
      '/dongY/ghiNhan',
      '/dongY/rutLai',
    ]) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 16 * 1024 }),
      );
    }

    // --- Student -----------------------------------------------------------------------------------------------
    router.post(
      '/hocVien/taoMoi',
      declare('Create a student', 'createStudent'),
      needs('edu.hocVien', 'manage'),
      apiValidator('json', HocVienInput),
      async (c) => {
        const input = c.req.valid('json');
        const policy = policyOf(c, 'eduHocVien');
        const created = await database.transaction(async (connection) => {
          if (input.lopId != null) {
            const lop = await connection.query
              .selectFrom('eduLop')
              .select('coSoId')
              .where('id', '=', input.lopId)
              .executeTakeFirst();
            if (!lop || Number(lop.coSoId) !== input.coSoId) {
              throw eduError(
                'INVALID_ARGUMENT',
                'EDU_CLASS_NOT_IN_BRANCH',
                'The class does not belong to this branch.',
                'lopId',
              );
            }
          }
          const repository = connection
            .repository('eduHocVien')
            .withPolicy(policy);
          const result = await repository.createOne({
            values: {
              // Placeholder until the row id is known; replaced below inside the same transaction.
              ma: `TMP-${crypto.randomUUID()}`,
              hoTen: input.hoTen,
              namSinh: input.namSinh,
              levelKey: input.levelKey,
              levelOrder: levelOrder(input.levelKey) ?? 1,
              lopId: input.lopId ?? null,
              coSoId: input.coSoId,
              trangThai: input.trangThai,
              ghiChuHlv: input.ghiChuHlv ?? null,
              soBuoiConLai: 0,
            },
          });
          const id = Number(result.record.id);
          // The caller must be able to see the row it created; otherwise it targeted a branch or class it does not own.
          const visible = await repository.findOne({ filter: { id } });
          if (!visible) {
            throw eduError(
              'PERMISSION_DENIED',
              'EDU_OUT_OF_SCOPE',
              'You may not add a student here.',
            );
          }
          const ma = codeFromId('HS', id);
          await connection.query
            .updateTable('eduHocVien')
            .set({ ma })
            .where('id', '=', id)
            .execute();
          return { id, ma };
        });
        return c.json({ data: created }, 201);
      },
    );

    router.post(
      '/hocVien/capNhatGhiChu',
      declare('Update the coach note of a student', 'updateStudentNote'),
      needs('edu.hocVien', 'updateNote'),
      apiValidator('json', GhiChuInput),
      async (c) => {
        const { id, ghiChuHlv } = c.req.valid('json');
        const repository = database
          .repository('eduHocVien')
          .withPolicy(policyOf(c, 'eduHocVien'));
        if (!(await repository.findOne({ filter: { id } }))) {
          throw eduError(
            'NOT_FOUND',
            'EDU_STUDENT_NOT_FOUND',
            'Student not found.',
          );
        }
        await repository.updateOne({ filter: { id }, values: { ghiChuHlv } });
        return c.json({ data: { id } });
      },
    );

    // The full date of birth is personal data of a child (knowledge document 05). It is not in any permission field list,
    // so no standard record API returns it. This route is the only reader: it needs the `manage` action, which an
    // administrator and a branch manager hold and a coach, an accountant and the read-only API do not, and it finds the
    // student through that action's own record scope first (a manager sees only their branch).
    router.post(
      '/hocVien/ngaySinh',
      declare("Read a student's full date of birth", 'readBirthDate'),
      needs('edu.hocVien', 'manage'),
      apiValidator('json', z.object({ id: Id })),
      async (c) => {
        const { id } = c.req.valid('json');
        const visible = await database
          .connection()
          .repository('eduHocVien')
          .withPolicy(policyOf(c, 'eduHocVien'))
          .findOne({ filter: { id } });
        if (!visible) {
          throw eduError(
            'NOT_FOUND',
            'EDU_STUDENT_NOT_FOUND',
            'Student not found.',
          );
        }
        const row = await database
          .connection()
          .query.selectFrom('eduHocVien')
          .select('ngaySinh')
          .where('id', '=', id)
          .executeTakeFirst();
        return c.json({
          data: { id, ngaySinh: row?.ngaySinh ?? null },
        });
      },
    );

    router.post(
      '/hocVien/chuyenLop',
      declare(
        'Move a student to another class of the same branch',
        'moveStudent',
      ),
      needs('edu.hocVien', 'manage'),
      apiValidator('json', ChuyenLopInput),
      async (c) => {
        const { id, lopId } = c.req.valid('json');
        const classPolicy = (await policiesOf(c, 'edu.lop', 'view')).eduLop;
        await database.transaction(async (connection) => {
          const student = await connection
            .repository('eduHocVien')
            .withPolicy(policyOf(c, 'eduHocVien'))
            .findOne({ filter: { id } });
          if (!student) {
            throw eduError(
              'NOT_FOUND',
              'EDU_STUDENT_NOT_FOUND',
              'Student not found.',
            );
          }
          if (lopId != null) {
            // The class must be one the caller sees and must belong to the student's own branch.
            const lop = classPolicy
              ? await connection
                  .repository('eduLop')
                  .withPolicy(classPolicy)
                  .findOne({ filter: { id: lopId } })
              : null;
            if (!lop) {
              throw eduError(
                'PERMISSION_DENIED',
                'EDU_OUT_OF_SCOPE',
                'You may not move a student to this class.',
              );
            }
            if (Number(lop.coSoId) !== Number(student.coSoId)) {
              throw eduError(
                'INVALID_ARGUMENT',
                'EDU_CLASS_NOT_IN_BRANCH',
                'The class does not belong to this branch.',
                'lopId',
              );
            }
          }
          // The policy of the manage action does not let the class column change through the repository; the
          // checks above are what make this write safe.
          await connection.query
            .updateTable('eduHocVien')
            .set({ lopId })
            .where('id', '=', id)
            .execute();
        });
        return c.json({ data: { id } });
      },
    );

    router.post(
      '/hocVien/lenCap',
      declare('Confirm that a student moved up a level', 'confirmLevelUp'),
      needs('edu.hocVien', 'levelUp'),
      apiValidator('json', LenCapInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const studentPolicy = policyOf(c, 'eduHocVien');
        const historyPolicy = policyOf(c, 'eduHocVienLenCap');
        const row = await database.transaction(async (connection) => {
          const students = connection
            .repository('eduHocVien')
            .withPolicy(studentPolicy);
          const student = await students.findOne({
            filter: { id: input.hocVienId },
          });
          if (!student) {
            throw eduError(
              'NOT_FOUND',
              'EDU_STUDENT_NOT_FOUND',
              'Student not found.',
            );
          }
          const current = asText(student.levelKey);
          const target = levelOrder(input.denLevelKey) ?? 0;
          if (target <= Number(student.levelOrder)) {
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_LEVEL_NOT_HIGHER',
              'The new level must be higher than the current level.',
              'denLevelKey',
            );
          }
          // The expected current level is part of the predicate: a concurrent confirmation matches no row, and the
          // transaction stops here instead of writing a second history row.
          const updated = await connection.query
            .updateTable('eduHocVien')
            .set({ levelKey: input.denLevelKey, levelOrder: target })
            .where('id', '=', input.hocVienId)
            .where('levelKey', '=', current)
            .execute();
          if (updated.updatedCount !== 1) {
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_LEVEL_CHANGED',
              'The level of the student has just changed. Reload and try again.',
              'denLevelKey',
            );
          }
          const history = await connection
            .repository('eduHocVienLenCap')
            .withPolicy(historyPolicy)
            .createOne({
              values: {
                hocVienId: input.hocVienId,
                tuLevelKey: current,
                denLevelKey: input.denLevelKey,
                ngay: input.ngay ?? today(),
                nguoiXacNhanId: userId,
                ghiChu: input.ghiChu ?? null,
              },
            });
          return { id: Number(history.record.id) };
        });
        return c.json({ data: row }, 201);
      },
    );

    // --- Parent ------------------------------------------------------------------------------------------------
    router.post(
      '/phuHuynh/taoMoi',
      declare('Add a parent to a student', 'createParent'),
      needs('edu.phuHuynh', 'manage'),
      apiValidator('json', PhuHuynhInput),
      async (c) => {
        const input = c.req.valid('json');
        const phone = normalizePhone(input.soDienThoai);
        if (!/^0\d{8,10}$/u.test(phone)) {
          throw eduError(
            'INVALID_ARGUMENT',
            'EDU_INVALID_PHONE',
            'The phone number is not valid.',
            'soDienThoai',
          );
        }
        // The student must be one the caller may see; this is what keeps the new link inside the caller's scope.
        const studentPolicies = await policiesOf(c, 'edu.hocVien', 'view');
        const studentPolicy = studentPolicies.eduHocVien;
        if (!studentPolicy) {
          throw eduError(
            'PERMISSION_DENIED',
            'EDU_OUT_OF_SCOPE',
            'You may not add a parent here.',
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
          // One parent, several children: the same phone number reuses the existing parent record, but only one
          // the caller may already see. A parent of another branch is never reused (that would link the caller to
          // it and expose its details); a separate record is created instead and an administrator merges them.
          const existing = await connection
            .repository('eduPhuHuynh')
            .withPolicy(policyOf(c, 'eduPhuHuynh'))
            .findOne({ filter: { soDienThoai: phone } });
          let id: number;
          let ma: string;
          if (existing) {
            id = Number(existing.id);
            ma = asText(existing.ma);
          } else {
            const created = await connection
              .repository('eduPhuHuynh')
              .createOne({
                values: {
                  ma: `TMP-${crypto.randomUUID()}`,
                  hoTen: input.hoTen,
                  soDienThoai: phone,
                  zalo: input.zalo ?? null,
                  ghiChu: input.ghiChu ?? null,
                },
              });
            id = Number(created.record.id);
            ma = codeFromId('PH', id);
            await connection.query
              .updateTable('eduPhuHuynh')
              .set({ ma })
              .where('id', '=', id)
              .execute();
          }
          const linked = await connection.query
            .selectFrom('eduHocVienPhuHuynh')
            .select('id')
            .where('hocVienId', '=', input.hocVienId)
            .where('phuHuynhId', '=', id)
            .executeTakeFirst();
          if (linked) {
            throw eduError(
              'ALREADY_EXISTS',
              'EDU_PARENT_ALREADY_LINKED',
              'This parent is already linked to the student.',
            );
          }
          await connection.repository('eduHocVienPhuHuynh').createOne({
            values: {
              hocVienId: input.hocVienId,
              phuHuynhId: id,
              quanHe: input.quanHe,
              lienHeChinh: input.lienHeChinh,
            },
          });
          return { id, ma };
        });
        return c.json({ data: result }, 201);
      },
    );

    // --- Consent -----------------------------------------------------------------------------------------------
    router.post(
      '/dongY/ghiNhan',
      declare('Record a consent of a parent', 'recordConsent'),
      needs('edu.dongY', 'record'),
      apiValidator('json', DongYInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const policy = policyOf(c, 'eduDongY');
        const result = await database.transaction(async (connection) => {
          const link = await connection.query
            .selectFrom('eduHocVienPhuHuynh')
            .select('id')
            .where('hocVienId', '=', input.hocVienId)
            .where('phuHuynhId', '=', input.phuHuynhId)
            .executeTakeFirst();
          if (!link) {
            throw eduError(
              'INVALID_ARGUMENT',
              'EDU_PARENT_NOT_LINKED',
              'The parent is not linked to this student.',
              'phuHuynhId',
            );
          }
          const repository = connection
            .repository('eduDongY')
            .withPolicy(policy);
          const created = await repository.createOne({
            values: {
              hocVienId: input.hocVienId,
              phuHuynhId: input.phuHuynhId,
              mucDich: input.mucDich,
              dongY: input.dongY,
              treDongY: input.treDongY,
              phienBanDieuKhoan: input.phienBanDieuKhoan,
              thoiDiem: new Date(),
              kenh: input.kenh,
              nguoiGhiNhanId: userId,
              rutLaiLuc: null,
              lyDoRut: null,
            },
          });
          const id = Number(created.record.id);
          if (!(await repository.findOne({ filter: { id } }))) {
            throw eduError(
              'PERMISSION_DENIED',
              'EDU_OUT_OF_SCOPE',
              'You may not record a consent here.',
            );
          }
          return { id };
        });
        return c.json({ data: result }, 201);
      },
    );

    router.post(
      '/dongY/rutLai',
      declare('Withdraw a consent', 'withdrawConsent'),
      needs('edu.dongY', 'record'),
      apiValidator('json', RutLaiInput),
      async (c) => {
        const { id, lyDo } = c.req.valid('json');
        const repository = database
          .repository('eduDongY')
          .withPolicy(policyOf(c, 'eduDongY'));
        const consent = await repository.findOne({ filter: { id } });
        if (!consent) {
          throw eduError(
            'NOT_FOUND',
            'EDU_CONSENT_NOT_FOUND',
            'Consent not found.',
          );
        }
        if (consent.rutLaiLuc != null) {
          throw eduError(
            'FAILED_PRECONDITION',
            'EDU_CONSENT_ALREADY_WITHDRAWN',
            'This consent was already withdrawn.',
          );
        }
        // The record is kept: a withdrawal only sets the time and the reason.
        await repository.updateOne({
          filter: (f) =>
            f.and([f.number('id').eq(id), f.date('rutLaiLuc').empty()]),
          values: { rutLaiLuc: new Date(), lyDoRut: lyDo ?? null },
        });
        return c.json({ data: { id } });
      },
    );

    return new Hono().route('/', router);
  }),
];
