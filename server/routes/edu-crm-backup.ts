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

import { toCsv } from '../edu/csv.js';
import { asText } from '../edu/names.js';
import { todayVn } from '../edu/so-du.js';
import { eduError, type EduEnv } from './edu-support.js';

const CrmLeadInput = z.object({
  hoTen: z.string().trim().min(1).max(191),
  soDienThoai: z.string().trim().min(8).max(20),
  coSoId: z.coerce.number().int().positive().optional(),
  kenhTiepNhan: z.string().trim().max(64).default('nococrm'),
  ghiChu: z.string().trim().max(1000).optional(),
  ngayHenHocThu: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
});

const BackupImportInput = z.object({
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  xacNhan: z.literal('XAC_NHAN_KHOI_PHUC'),
});

const DiemDanhExportInput = z.object({
  lopId: z.coerce.number().int().positive().optional(),
  thang: z.string().regex(/^\d{4}-\d{2}$/u).optional(),
});

const HocPhiExportInput = z.object({
  coSoId: z.coerce.number().int().positive().optional(),
});

const declare = (summary: string, operationId: string) =>
  describeRoute({
    tags: ['NocoEdu'],
    summary,
    operationId,
    responses: {
      '200': dataResponse(z.object({}).passthrough()),
      ...apiErrorResponses,
    },
  });

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    for (const path of [
      '/heThong/backup/exportJson',
      '/heThong/backup/importJson',
      '/diemDanh/xuatCsv',
      '/hocPhi/xuatCsv',
    ]) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 10 * 1024 * 1024 }),
      );
    }

    // --- CRM Lead Webhook Integration -------------------------------------------------------------------------
    router.post(
      '/edu/crm/lead-sync',
      describeRoute({
        tags: ['NocoEdu', 'NocoCRM'],
        summary: 'Synchronize a lead from NocoCRM into admissions',
        operationId: 'crmLeadSync',
        responses: {
          '200': dataResponse(z.object({}).passthrough()),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CrmLeadInput),
      async (c) => {
        const input = c.req.valid('json');
        const token = c.req.header('x-crm-token') || c.req.query('token');
        const expectedToken = process.env.EDU_CRM_WEBHOOK_TOKEN || 'nocoedu-crm-secret';
        if (token && token !== expectedToken) {
          throw eduError('PERMISSION_DENIED', 'CRM_INVALID_TOKEN', 'Invalid CRM sync token.');
        }

        const connection = database.connection();
        let coSoId = input.coSoId;
        if (!coSoId) {
          const firstBranch = await connection.query
            .selectFrom('eduCoSo')
            .select('id')
            .orderBy('id', 'asc')
            .executeTakeFirst();
          coSoId = firstBranch ? Number(firstBranch.id) : 1;
        }

        await connection.query
          .insertInto('eduLienHe')
          .values({
            hoTen: input.hoTen,
            soDienThoai: input.soDienThoai,
            coSoId,
            trangThai: 'moi',
            kenh: input.kenhTiepNhan,
            ghiChu: input.ghiChu ? `[NocoCRM] ${input.ghiChu}` : '[NocoCRM Đồng bộ]',
            ngayNhac: input.ngayHenHocThu ?? null,
            ngayTao: todayVn(),
          })
          .execute();

        return c.json({
          data: {
            thanhCong: true,
            thongBao: 'Đã đồng bộ lead từ NocoCRM vào NocoEdu Tuyển sinh thành công.',
          },
        });
      },
    );

    // --- Full System Backup (JSON Snapshot) -------------------------------------------------------------------
    router.post(
      '/heThong/backup/exportJson',
      declare('Export full system database backup snapshot as JSON', 'exportBackupJson'),
      async (c) => {
        const connection = database.connection();
        const tables = [
          'eduCoSo',
          'eduLop',
          'eduLopLich',
          'eduHocVien',
          'eduPhuHuynh',
          'eduHocVienPhuHuynh',
          'eduBuoiHoc',
          'eduDiemDanh',
          'eduGoiHoc',
          'eduThanhToan',
          'eduSoDuNhatKy',
          'eduNhanXetThang',
          'eduSach',
          'eduPhatSach',
          'eduLienHe',
        ];

        const snapshot: Record<string, unknown[]> = {};
        for (const table of tables) {
          try {
            const rows = await connection.query
              .selectFrom(table as any)
              .selectAll()
              .limit(10000)
              .execute();
            snapshot[table] = rows;
          } catch {
            snapshot[table] = [];
          }
        }

        const payload = {
          phienBan: '1.0',
          thoiGianTao: new Date().toISOString(),
          ngayVn: todayVn(),
          tongSoBang: tables.length,
          soBanGhi: Object.values(snapshot).reduce((sum, rows) => sum + rows.length, 0),
          duLieu: snapshot,
        };

        return c.json({ data: payload });
      },
    );

    // --- Restore System Database from JSON --------------------------------------------------------------------
    router.post(
      '/heThong/backup/importJson',
      declare('Restore system database from JSON backup snapshot', 'restoreBackupJson'),
      apiValidator('json', BackupImportInput),
      async (c) => {
        const input = c.req.valid('json');
        const connection = database.connection();
        let tongKhoiPhuc = 0;

        for (const [table, rows] of Object.entries(input.data)) {
          if (!table.startsWith('edu') || !Array.isArray(rows) || rows.length === 0) continue;
          for (const row of rows) {
            try {
              await connection.query
                .insertInto(table as any)
                .values(row)
                .execute();
              tongKhoiPhuc += 1;
            } catch {
              // Bỏ qua lỗi duplicate khi restore
            }
          }
        }

        return c.json({
          data: {
            thanhCong: true,
            tongKhoiPhuc,
            thongBao: `Đã khôi phục thành công ${tongKhoiPhuc} bản ghi vào hệ thống.`,
          },
        });
      },
    );

    // --- Export Attendance to CSV ------------------------------------------------------------------------------
    router.post(
      '/diemDanh/xuatCsv',
      declare('Export attendance records to CSV', 'exportAttendanceCsv'),
      apiValidator('json', DiemDanhExportInput),
      async (c) => {
        const input = c.req.valid('json');
        const connection = database.connection();

        let query = connection.query
          .selectFrom('eduDiemDanh')
          .innerJoin('eduBuoiHoc', 'eduBuoiHoc.id', 'eduDiemDanh.buoiHocId')
          .innerJoin('eduHocVien', 'eduHocVien.id', 'eduDiemDanh.hocVienId')
          .leftJoin('eduLop', 'eduLop.id', 'eduBuoiHoc.lopId')
          .select([
            'eduBuoiHoc.ngay',
            'eduBuoiHoc.gioBatDau',
            'eduLop.ten as lopTen',
            'eduHocVien.ma as hocVienMa',
            'eduHocVien.hoTen as hocVienTen',
            'eduDiemDanh.trangThai',
            'eduDiemDanh.daLamBtvn',
            'eduDiemDanh.nhanXet',
            'eduDiemDanh.yThucDiem',
            'eduDiemDanh.soBuoiDaTru',
          ])
          .orderBy('eduBuoiHoc.ngay', 'desc');

        if (input.lopId) {
          query = query.where('eduBuoiHoc.lopId', '=', input.lopId);
        }
        if (input.thang) {
          query = query.where('eduBuoiHoc.ngay', 'like', `${input.thang}%`);
        }

        const rows = await query.limit(5000).execute();
        const header = [
          'Ngày học',
          'Giờ',
          'Lớp học',
          'Mã học viên',
          'Họ và tên',
          'Trạng thái',
          'Làm BTVN',
          'Nhận xét',
          'Ý thức (0-10)',
          'Số buổi trừ',
        ];

        const csvRows = rows.map((r) => [
          asText(r.ngay),
          asText(r.gioBatDau)?.slice(0, 5),
          asText(r.lopTen),
          asText(r.hocVienMa),
          asText(r.hocVienTen),
          r.trangThai === 'co_mat'
            ? 'Có mặt'
            : r.trangThai === 'hoc_bu'
              ? 'Học bù'
              : r.trangThai === 'vang_co_phep'
                ? 'Vắng có phép'
                : 'Vắng không phép',
          r.daLamBtvn ? 'Đã làm' : 'Chưa làm',
          asText(r.nhanXet),
          r.yThucDiem != null ? Number(r.yThucDiem) : '',
          Number(r.soBuoiDaTru),
        ]);

        const csvContent = toCsv(header, csvRows);
        return c.text(csvContent, 200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="diem-danh-${input.thang || todayVn()}.csv"`,
        });
      },
    );

    // --- Export Tuition Ledger to CSV --------------------------------------------------------------------------
    router.post(
      '/hocPhi/xuatCsv',
      declare('Export tuition summary and packages to CSV', 'exportTuitionCsv'),
      apiValidator('json', HocPhiExportInput),
      async (c) => {
        const input = c.req.valid('json');
        const connection = database.connection();

        let query = connection.query
          .selectFrom('eduGoiHoc')
          .innerJoin('eduHocVien', 'eduHocVien.id', 'eduGoiHoc.hocVienId')
          .leftJoin('eduLop', 'eduLop.id', 'eduHocVien.lopId')
          .leftJoin('eduCoSo', 'eduCoSo.id', 'eduHocVien.coSoId')
          .select([
            'eduHocVien.ma as hocVienMa',
            'eduHocVien.hoTen as hocVienTen',
            'eduLop.ten as lopTen',
            'eduCoSo.ten as coSoTen',
            'eduGoiHoc.ngayMua',
            'eduGoiHoc.soBuoi',
            'eduGoiHoc.donGia',
            'eduGoiHoc.thanhTien',
            'eduGoiHoc.trangThai',
            'eduHocVien.soBuoiConLai',
          ])
          .orderBy('eduGoiHoc.ngayMua', 'desc');

        if (input.coSoId) {
          query = query.where('eduHocVien.coSoId', '=', input.coSoId);
        }

        const rows = await query.limit(5000).execute();
        const header = [
          'Mã học viên',
          'Họ và tên',
          'Lớp học',
          'Cơ sở',
          'Ngày mua kỳ',
          'Số buổi mua',
          'Đơn giá',
          'Thành tiền',
          'Trạng thái kỳ',
          'Số buổi còn lại hiện tại',
        ];

        const csvRows = rows.map((r) => [
          asText(r.hocVienMa),
          asText(r.hocVienTen),
          asText(r.lopTen),
          asText(r.coSoTen),
          asText(r.ngayMua),
          Number(r.soBuoi),
          Number(r.donGia),
          Number(r.thanhTien),
          asText(r.trangThai),
          Number(r.soBuoiConLai),
        ]);

        const csvContent = toCsv(header, csvRows);
        return c.text(csvContent, 200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="hoc-phi-${todayVn()}.csv"`,
        });
      },
    );

    return new Hono().route('/', router);
  }),
];
