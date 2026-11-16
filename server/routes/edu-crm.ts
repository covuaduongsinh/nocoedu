import { createHash, timingSafeEqual } from 'node:crypto';

import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  ApiError,
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

import { DOMAIN, eduError } from '../edu/errors.js';
import { todayVn } from '../edu/so-du.js';

/**
 * A family sent by NocoCRM, the club's own customer system, into admissions (`eduLienHe`).
 *
 * The route is public by design: the CRM calls it from its server and cannot present a sign-in session. Its boundary
 * is a shared secret, `EDU_CRM_WEBHOOK_TOKEN`, sent in the `x-crm-token` header:
 *
 * - while the variable is not set (or is shorter than 24 characters) the route answers 404, as if it were not there:
 *   there is no default secret, so a deployment that never configured the integration accepts nothing;
 * - a missing or wrong token is 401, compared in constant time, before the body is looked at.
 *
 * The secret is read from the header only, never from the address (an address ends up in access logs). A delivery
 * repeated by the CRM adds nobody: the same phone number in the same branch is the same family. What is stored is what
 * admissions keeps by design: the parent's name and phone, the branch, the channel, a call-back day and a short note.
 *
 * The path is kebab-case because NocoCRM already calls it by this address.
 */
const PATH = '/edu/crm/lead-sync';
const MIN_SECRET = 24;

const LeadInput = z.object({
  hoTen: z.string().trim().min(1).max(191),
  soDienThoai: z
    .string()
    .trim()
    .regex(/^[0-9+ ().-]{6,20}$/u),
  coSoId: z.coerce.number().int().positive().optional(),
  kenhTiepNhan: z.string().trim().min(1).max(64).default('nococrm'),
  ghiChu: z.string().trim().max(480).optional(),
  ngayHenHocThu: z.iso.date().optional(),
});

const digest = (value: string): Buffer =>
  createHash('sha256').update(value, 'utf8').digest();

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono();

    router.use(PATH, bodyLimit({ maxSize: 8 * 1024 }), async (c, next) => {
      const secret = process.env.EDU_CRM_WEBHOOK_TOKEN?.trim() ?? '';
      if (secret.length < MIN_SECRET) {
        throw eduError('NOT_FOUND', 'EDU_CRM_NOT_CONFIGURED', 'Not found.');
      }
      const given = c.req.header('x-crm-token') ?? '';
      if (!given || !timingSafeEqual(digest(given), digest(secret))) {
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'EDU_CRM_INVALID_TOKEN',
          domain: DOMAIN,
          message: 'The CRM token is missing or wrong.',
        });
      }
      await next();
    });

    router.post(
      PATH,
      describeRoute({
        tags: ['NocoEdu', 'NocoCRM'],
        summary: 'Receive a lead from NocoCRM into admissions',
        operationId: 'crmLeadSync',
        // No session and no API key: the caller proves itself with the shared secret in `x-crm-token`.
        security: [],
        responses: {
          '200': dataResponse(
            z.object({ thanhCong: z.boolean(), trung: z.boolean() }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', LeadInput),
      async (c) => {
        const input = c.req.valid('json');
        const result = await database.transaction(async (connection) => {
          const q = connection.query;
          const branch = input.coSoId
            ? await q
                .selectFrom('eduCoSo')
                .select('id')
                .where('id', '=', input.coSoId)
                .where('trangThai', '=', 'hoat_dong')
                .executeTakeFirst()
            : // The CRM does not always know the branch: the first one that is open takes the lead.
              await q
                .selectFrom('eduCoSo')
                .select('id')
                .where('trangThai', '=', 'hoat_dong')
                .orderBy('id', 'asc')
                .executeTakeFirst();
          if (!branch) {
            throw eduError(
              'INVALID_ARGUMENT',
              'EDU_BRANCH_NOT_FOUND',
              'The branch does not exist or is paused.',
              'coSoId',
            );
          }
          const coSoId = Number(branch.id);
          const known = await q
            .selectFrom('eduLienHe')
            .select('id')
            .where('coSoId', '=', coSoId)
            .where('soDienThoai', '=', input.soDienThoai)
            .executeTakeFirst();
          if (known) return { thanhCong: true, trung: true };
          await q
            .insertInto('eduLienHe')
            .values({
              hoTen: input.hoTen,
              soDienThoai: input.soDienThoai,
              coSoId,
              trangThai: 'moi',
              kenh: input.kenhTiepNhan,
              ghiChu: input.ghiChu ? `[NocoCRM] ${input.ghiChu}` : '[NocoCRM]',
              ngayNhac: input.ngayHenHocThu ?? null,
              ngayTao: todayVn(),
            })
            .execute();
          return { thanhCong: true, trung: false };
        });
        return c.json({ data: result });
      },
    );

    return new Hono().route('/', router);
  }),
];
