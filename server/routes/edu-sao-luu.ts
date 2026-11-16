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

import { todayVn } from '../edu/so-du.js';
import { currentUserId, eduError, needs, type EduEnv } from './edu-support.js';

/**
 * A copy of the training data as one JSON document, for the administrator to keep off the server.
 *
 * It carries every student, parent phone number and payment, so it is its own action (`edu.heThong` `backup`), held
 * by the administrator only, and each copy leaves one row in `eduXuatDuLieuNhatKy` (who, how many rows; never the
 * content). It reads the tables whole on purpose: that is what a backup is, and the action says so.
 *
 * There is no restore here. Putting rows back table by table cannot be made safe: balances move only together with
 * their ledger rows (`server/edu/ghi-so-du.ts`), ids must not collide, and a half-applied restore is worse than none.
 * The real backup of the application is the database dump described in `docs/lark/nhap-production.md`; this file is an
 * extra copy a person can read.
 */
const TABLES = [
  'eduCoSo',
  'eduCoSoQuanLy',
  'eduLop',
  'eduLopLich',
  'eduHocVien',
  'eduHocVienLenCap',
  'eduPhuHuynh',
  'eduHocVienPhuHuynh',
  'eduDongY',
  'eduBuoiHoc',
  'eduDiemDanh',
  'eduGoiHoc',
  'eduThanhToan',
  'eduSoDuNhatKy',
  'eduNhanXetThang',
  'eduSach',
  'eduPhatSach',
  'eduNopSach',
  'eduSachHoc',
  'eduLienHe',
  'eduHoSoGv',
] as const;

const PAGE = 1000;
/** A table larger than this is refused with a clear error instead of a copy that silently stops short. */
const MAX_ROWS_PER_TABLE = 500_000;

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    router.use(
      '/heThong/backup/exportJson',
      auth.required(),
      authz.middleware(),
      bodyLimit({ maxSize: 1024 }),
    );

    router.post(
      '/heThong/backup/exportJson',
      describeRoute({
        tags: ['NocoEdu'],
        summary: 'A copy of the whole training data as JSON',
        operationId: 'exportBackupJson',
        responses: {
          '200': dataResponse(z.object({}).passthrough()),
          ...apiErrorResponses,
        },
      }),
      needs('edu.heThong', 'backup'),
      async (c) => {
        const userId = currentUserId(c);
        const q = database.connection().query;
        const duLieu: Record<string, unknown[]> = {};
        let soBanGhi = 0;
        for (const table of TABLES) {
          const rows: unknown[] = [];
          for (let offset = 0; ; offset += PAGE) {
            const page = await q
              .selectFrom(table)
              .selectAll()
              .orderBy('id', 'asc')
              .limit(PAGE)
              .offset(offset)
              .execute();
            rows.push(...page);
            if (page.length < PAGE) break;
            if (rows.length > MAX_ROWS_PER_TABLE) {
              throw eduError(
                'FAILED_PRECONDITION',
                'EDU_BACKUP_TOO_LARGE',
                'The data is too large for one JSON copy. Use the database dump.',
              );
            }
          }
          duLieu[table] = rows;
          soBanGhi += rows.length;
        }
        await q
          .insertInto('eduXuatDuLieuNhatKy')
          .values({
            userId,
            loai: 'sao_luu',
            boLoc: null,
            soDong: soBanGhi,
            createdAt: new Date(),
          })
          .execute();
        return c.json(
          {
            data: {
              phienBan: '2.0',
              thoiGianTao: new Date().toISOString(),
              ngayVn: todayVn(),
              tongSoBang: TABLES.length,
              soBanGhi,
              duLieu,
            },
          },
          200,
          { 'cache-control': 'no-store' },
        );
      },
    );

    return new Hono().route('/', router);
  }),
];
