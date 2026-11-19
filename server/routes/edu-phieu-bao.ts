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
import { buildFilter } from '@nocobase/repository-input';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { asText } from '../edu/names.js';
import { latestPackageId } from '../edu/phieu-bao.js';
import { readAllRows } from '../edu/read-all.js';
import { todayVn, vietQrConfig, vietQrUrl } from '../edu/so-du.js';
import {
  currentUserId,
  eduError,
  needs,
  policyOf,
  requiredPolicy,
  type EduEnv,
} from './edu-support.js';

/**
 * The notice of a tuition term for a parent, server side (docs/plans/2026-11-19-ke-hoach-phieu-bao-ky-hoc-phi.md,
 * phase 2). The picture itself is made in the browser from the student file; these routes add what it cannot know:
 *
 * - `POST /phieuBao/ghi` marks "the parent was told" for one term of one student, `POST /phieuBao/xoa` takes a mark
 *   back. Both need `edu.thanhToan` `manage` (who collects tuition is who chases it) and a student the caller sees
 *   through `edu.hocVien`; a package is checked through `edu.goiHoc` and must be the student's own. `eduPhieuBao` has
 *   no permission of its own (see `server/edu/phieu-bao.ts`).
 * - `POST /phieuBao/vietQr` builds the VietQR code of the next term: the amount the caller typed, else the price of the
 *   student's latest package (a Lark package of unknown price suggests nothing). Bank details come from the
 *   `EDU_VIETQR_*` variables only; without them the answer says so and carries no code, it is not an error.
 *
 * Outside the scope is "not found", never "forbidden": a caller cannot probe for another branch's student.
 */
const Id = z.coerce.number().int().positive();
const MarkInput = z.object({ hocVienId: Id, goiHocId: Id.nullable() });
const UnmarkInput = z.object({ id: Id });
const QrInput = z.object({
  hocVienId: Id,
  soTien: z.number().int().min(1).max(1_000_000_000).optional(),
});

const declare = (summary: string, operationId: string) =>
  describeRoute({
    tags: ['NocoEdu', 'PhieuBao'],
    summary,
    operationId,
    responses: {
      '200': dataResponse(z.object({}).passthrough()),
      ...apiErrorResponses,
    },
  });

const studentNotFound = () =>
  eduError('NOT_FOUND', 'EDU_STUDENT_NOT_FOUND', 'Student not found.');

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    for (const path of ['/phieuBao/ghi', '/phieuBao/xoa', '/phieuBao/vietQr']) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 16 * 1024 }),
      );
    }

    router.post(
      '/phieuBao/ghi',
      declare(
        'Mark that the parent was told about a tuition term',
        'markNoticeSent',
      ),
      needs('edu.thanhToan', 'manage'),
      apiValidator('json', MarkInput),
      async (c) => {
        const { hocVienId, goiHocId } = c.req.valid('json');
        const [studentPolicy, packagePolicy] = await Promise.all([
          requiredPolicy(c, 'edu.hocVien', 'view', 'eduHocVien'),
          requiredPolicy(c, 'edu.goiHoc', 'view', 'eduGoiHoc'),
        ]);
        const student = await database
          .repository('eduHocVien')
          .withPolicy(studentPolicy)
          .findOne({ filter: { id: hocVienId } });
        if (!student) throw studentNotFound();
        if (goiHocId !== null) {
          const pack = await database
            .repository('eduGoiHoc')
            .withPolicy(packagePolicy)
            .findOne({ filter: { id: goiHocId } });
          if (!pack || Number(pack.hocVienId) !== hocVienId) {
            throw eduError(
              'NOT_FOUND',
              'EDU_PACKAGE_NOT_FOUND',
              'Package not found.',
            );
          }
        }
        const query = database.connection().query;
        const ngay = todayVn();
        const sameDay = () => {
          const rows = query
            .selectFrom('eduPhieuBao')
            .select('id')
            .where('hocVienId', '=', hocVienId)
            .where('ngay', '=', ngay);
          return goiHocId === null
            ? rows.where('goiHocId', 'is', null)
            : rows.where('goiHocId', '=', goiHocId);
        };
        // Marking the same term twice on one day is one mark: a second click writes nothing.
        const existing = await sameDay().executeTakeFirst();
        if (existing) {
          return c.json({
            data: { id: Number(existing.id), ngay, moi: false },
          });
        }
        await query
          .insertInto('eduPhieuBao')
          .values({
            hocVienId,
            goiHocId,
            ngay,
            soBuoiConLai: Number(student.soBuoiConLai || 0),
            nguoiBaoId: currentUserId(c),
            createdAt: new Date(),
          })
          .execute();
        const created = await sameDay().executeTakeFirstOrThrow();
        return c.json(
          { data: { id: Number(created.id), ngay, moi: true } },
          201,
        );
      },
    );

    router.post(
      '/phieuBao/xoa',
      declare('Take back a "the parent was told" mark', 'unmarkNoticeSent'),
      needs('edu.thanhToan', 'manage'),
      apiValidator('json', UnmarkInput),
      async (c) => {
        const { id } = c.req.valid('json');
        const studentPolicy = await requiredPolicy(
          c,
          'edu.hocVien',
          'view',
          'eduHocVien',
        );
        const query = database.connection().query;
        const mark = await query
          .selectFrom('eduPhieuBao')
          .select(['id', 'hocVienId'])
          .where('id', '=', id)
          .executeTakeFirst();
        // A mark of a student the caller does not see answers like a mark that does not exist.
        const student = mark
          ? await database
              .repository('eduHocVien')
              .withPolicy(studentPolicy)
              .findOne({ filter: { id: Number(mark.hocVienId) } })
          : null;
        if (!mark || !student) {
          throw eduError(
            'NOT_FOUND',
            'EDU_NOTICE_NOT_FOUND',
            'Notice mark not found.',
          );
        }
        await query.deleteFrom('eduPhieuBao').where('id', '=', id).execute();
        return c.json({ data: { ok: true } });
      },
    );

    router.post(
      '/phieuBao/vietQr',
      declare(
        'Build the VietQR transfer code of the next tuition term',
        'buildNoticeVietQr',
      ),
      needs('edu.goiHoc', 'view'),
      apiValidator('json', QrInput),
      async (c) => {
        const { hocVienId, soTien: asked } = c.req.valid('json');
        const studentPolicy = await requiredPolicy(
          c,
          'edu.hocVien',
          'view',
          'eduHocVien',
        );
        const student = await database
          .repository('eduHocVien')
          .withPolicy(studentPolicy)
          .findOne({ filter: { id: hocVienId } });
        if (!student) throw studentNotFound();
        const packages = await readAllRows(
          database,
          'eduGoiHoc',
          policyOf(c, 'eduGoiHoc'),
          buildFilter((f) => f.number('hocVienId').eq(hocVienId)),
          5000,
        );
        // The price of the latest package that has one: a package loaded from Lark without its payment has price 0.
        const priced = packages.filter((pack) => Number(pack.thanhTien) > 0);
        const latest = latestPackageId(priced);
        const suggested =
          latest === null
            ? null
            : Number(
                priced.find((pack) => Number(pack.id) === latest)?.thanhTien,
              );
        const config = vietQrConfig(process.env);
        const soTien = asked ?? suggested;
        const noiDungCk = `HP ${asText(student.ma)}`;
        return c.json({
          data: {
            cauHinh: config !== null,
            soTienGoiY: suggested,
            soTien: config ? soTien : null,
            noiDungCk,
            // The `svg` address: the browser fetches it to draw the code into the picture (see `vietQrUrl`).
            url:
              config && soTien !== null
                ? vietQrUrl(config, soTien, noiDungCk, 'svg')
                : null,
          },
        });
      },
    );

    return new Hono().route('/', router);
  }),
];
