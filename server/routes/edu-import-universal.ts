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
import type { DatabaseManager } from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { parseCsv } from '../edu/import-csv.js';
import { sessionsToDeduct, todayVn } from '../edu/so-du.js';
import { currentUserId, eduError, type EduEnv } from './edu-support.js';

const MAX_CSV_SIZE = 5 * 1024 * 1024; // 5MB

const ENTITY_CONFIGS: Record<
  string,
  {
    name: string;
    sampleHeader: string;
    sampleRows: string[];
    columns: string[];
  }
> = {
  lop: {
    name: 'Lớp học',
    sampleHeader: 'ma,ten,coSoMa,levelKey,trangThai',
    sampleRows: [
      'LOP-01,Lớp Cờ Vua Cơ Bản K1,CS01,tot,dang_mo',
      'LOP-02,Lớp Cờ Vua Nâng Cao K2,CS01,ma,dang_mo',
    ],
    columns: ['ma', 'ten', 'coSoMa', 'levelKey', 'trangThai'],
  },
  coSo: {
    name: 'Cơ sở đào tạo',
    sampleHeader: 'ma,ten,diaChi,truBuoiVangCoPhep,trangThai',
    sampleRows: [
      'CS01,Cơ sở Cầu Giấy,Số 10 Dịch Vọng Hậu Cầu Giấy Hà Nội,false,hoat_dong',
      'CS02,Cơ sở Thanh Xuân,Số 20 Nguyễn Trãi Thanh Xuân Hà Nội,false,hoat_dong',
    ],
    columns: ['ma', 'ten', 'diaChi', 'truBuoiVangCoPhep', 'trangThai'],
  },
  hoSoGv: {
    name: 'Hồ sơ giáo viên / HLV',
    sampleHeader: 'emailOrUserId,tenVietTat,viTri,thuLaoMotBuoi,tinhTrang',
    sampleRows: [
      'admin,Thầy Minh,HLV Trưởng,250000,dang_lam',
      'gv01,Cô Lan,HLV Trợ giảng,150000,dang_lam',
    ],
    columns: ['emailOrUserId', 'tenVietTat', 'viTri', 'thuLaoMotBuoi', 'tinhTrang'],
  },
  sach: {
    name: 'Danh mục sách',
    sampleHeader: 'kyHieu,ten,giaBia,giaBan,trangThai',
    sampleRows: [
      'CT1,Giáo trình Cờ Vua Tập 1,60000,50000,dang_ban',
      'CT2,Giáo trình Cờ Vua Tập 2,70000,60000,dang_ban',
    ],
    columns: ['kyHieu', 'ten', 'giaBia', 'giaBan', 'trangThai'],
  },
  phatSach: {
    name: 'Phát sách học sinh',
    sampleHeader: 'hocVienMa,kyHieuSach,coSoMa,ngay,uuDai,tienSach,ghiChu',
    sampleRows: [
      'HV-0001,CT1,CS01,2026-11-15,0,50000,Phát sách nhập học',
      'HV-0002,CT2,CS01,2026-11-15,10000,50000,Giảm giá 10k',
    ],
    columns: ['hocVienMa', 'kyHieuSach', 'coSoMa', 'ngay', 'uuDai', 'tienSach', 'ghiChu'],
  },
  goiHoc: {
    name: 'Gói học & Học phí',
    sampleHeader: 'hocVienMa,soBuoi,donGia,thanhTien,ngayMua,daThuTien,hinhThuc,ghiChu',
    sampleRows: [
      'HV-0001,12,150000,1800000,2026-11-15,true,chuyen_khoan,Nộp học phí quý 4',
      'HV-0002,24,140000,3360000,2026-11-15,true,tien_mat,Gói ưu đãi 24 buổi',
    ],
    columns: ['hocVienMa', 'soBuoi', 'donGia', 'thanhTien', 'ngayMua', 'daThuTien', 'hinhThuc', 'ghiChu'],
  },
  diemDanh: {
    name: 'Điểm danh buổi học',
    sampleHeader: 'lopMa,ngay,gioBatDau,hocVienMa,trangThai,daLamBtvn,nhanXet',
    sampleRows: [
      'LOP-01,2026-11-15,18:00,HV-0001,co_mat,true,Học tập tích cực',
      'LOP-01,2026-11-15,18:00,HV-0002,vang_co_phep,false,Bị ốm',
    ],
    columns: ['lopMa', 'ngay', 'gioBatDau', 'hocVienMa', 'trangThai', 'daLamBtvn', 'nhanXet'],
  },
  tuyenSinh: {
    name: 'Tuyển sinh & Khách hàng tiềm năng',
    sampleHeader: 'hoTen,soDienThoai,coSoMa,kenh,trangThai,ghiChu,ngayNhac',
    sampleRows: [
      'Nguyễn Văn A,0987654321,CS01,Facebook,moi,Quan tâm lớp U8,2026-11-20',
      'Trần Thị B,0912345678,CS01,GioiThieu,dang_cham_soc,Hẹn test cờ thứ 7,2026-11-18',
    ],
    columns: ['hoTen', 'soDienThoai', 'coSoMa', 'kenh', 'trangThai', 'ghiChu', 'ngayNhac'],
  },
};

const BodySchema = z.object({
  csv: z.string().min(1).max(MAX_CSV_SIZE),
});

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const router = new Hono<EduEnv>();
    const database = app.container.resolve<DatabaseManager>(databaseManagerToken);
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);

    for (const path of [
      '/edu/import/mau/:entity',
      '/edu/import/xem-truoc/:entity',
      '/edu/import/xac-nhan/:entity',
    ]) {
      router.use(path, auth.required(), authz.middleware());
    }

    // 1. Tải mẫu CSV
    router.get(
      '/edu/import/mau/:entity',
      describeRoute({
        tags: ['NocoEdu Universal Import'],
        summary: 'Tải nội dung CSV mẫu theo entity',
        operationId: 'getImportCsvTemplate',
        responses: {
          '200': dataResponse(
            z.object({
              entity: z.string(),
              name: z.string(),
              csv: z.string(),
              columns: z.array(z.string()),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (c) => {
        const entity = c.req.param('entity');
        const cfg = ENTITY_CONFIGS[entity];
        if (!cfg) {
          throw eduError('NOT_FOUND', 'EDU_IMPORT_UNKNOWN', `Không hỗ trợ import cho mục "${entity}"`);
        }
        const csvContent = '\uFEFF' + [cfg.sampleHeader, ...cfg.sampleRows].join('\r\n');
        return c.json({
          data: {
            entity,
            name: cfg.name,
            csv: csvContent,
            columns: cfg.columns,
          },
        });
      },
    );

    // 2. Xem trước (Preview & Validate)
    router.post(
      '/edu/import/xem-truoc/:entity',
      bodyLimit({ maxSize: MAX_CSV_SIZE }),
      apiValidator('json', BodySchema),
      describeRoute({
        tags: ['NocoEdu Universal Import'],
        summary: 'Xem trước và validate dữ liệu CSV trước khi import',
        operationId: 'previewImportCsv',
        responses: {
          '200': dataResponse(
            z.object({
              totalRows: z.number(),
              validCount: z.number(),
              errorCount: z.number(),
              rows: z.array(z.any()),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (c) => {
        const entity = c.req.param('entity');
        const cfg = ENTITY_CONFIGS[entity];
        if (!cfg) {
          throw eduError('NOT_FOUND', 'EDU_IMPORT_UNKNOWN', `Không hỗ trợ import cho mục "${entity}"`);
        }

        const { csv } = c.req.valid('json');
        const parsedRows = parseCsv(csv);
        if (parsedRows.length <= 1) {
          throw eduError('INVALID_ARGUMENT', 'EDU_IMPORT_EMPTY', 'Tập tin CSV không có dòng dữ liệu nào');
        }

        const headers = parsedRows[0].map((h) => h.trim());
        const rawRows = parsedRows.slice(1);
        const connection = database.connection();

        const previewRows: any[] = [];
        let validCount = 0;
        let errorCount = 0;

        for (let i = 0; i < rawRows.length; i++) {
          const line = i + 2;
          const r = rawRows[i];
          const rowData: Record<string, string> = {};
          for (let j = 0; j < headers.length; j++) {
            rowData[headers[j]] = (r[j] ?? '').trim();
          }

          const errors: string[] = [];

          // Kiểm tra validate theo entity
          if (entity === 'lop') {
            if (!rowData.ma) errors.push('Thiếu mã lớp');
            if (!rowData.ten) errors.push('Thiếu tên lớp');
            if (!rowData.coSoMa) errors.push('Thiếu mã cơ sở');
            else {
              const cs = await connection.query
                .selectFrom('eduCoSo')
                .select('id')
                .where('ma', '=', rowData.coSoMa)
                .executeTakeFirst();
              if (!cs) errors.push(`Không tìm thấy cơ sở có mã: ${rowData.coSoMa}`);
            }
          } else if (entity === 'coSo') {
            if (!rowData.ma) errors.push('Thiếu mã cơ sở');
            if (!rowData.ten) errors.push('Thiếu tên cơ sở');
          } else if (entity === 'sach') {
            if (!rowData.kyHieu) errors.push('Thiếu ký hiệu sách');
            if (!rowData.ten) errors.push('Thiếu tên sách');
          } else if (entity === 'hoSoGv') {
            if (!rowData.emailOrUserId) errors.push('Thiếu email hoặc userId của giáo viên');
          } else if (entity === 'phatSach') {
            if (!rowData.hocVienMa) errors.push('Thiếu mã học viên');
            else {
              const hv = await connection.query
                .selectFrom('eduHocVien')
                .select('id')
                .where('ma', '=', rowData.hocVienMa)
                .executeTakeFirst();
              if (!hv) errors.push(`Không tìm thấy học viên có mã: ${rowData.hocVienMa}`);
            }
            if (!rowData.kyHieuSach) errors.push('Thiếu ký hiệu sách');
            else {
              const s = await connection.query
                .selectFrom('eduSach')
                .select('id')
                .where('kyHieu', '=', rowData.kyHieuSach)
                .executeTakeFirst();
              if (!s) errors.push(`Không tìm thấy sách có ký hiệu: ${rowData.kyHieuSach}`);
            }
          } else if (entity === 'goiHoc') {
            if (!rowData.hocVienMa) errors.push('Thiếu mã học viên');
            else {
              const hv = await connection.query
                .selectFrom('eduHocVien')
                .select('id')
                .where('ma', '=', rowData.hocVienMa)
                .executeTakeFirst();
              if (!hv) errors.push(`Không tìm thấy học viên có mã: ${rowData.hocVienMa}`);
            }
            const sb = Number(rowData.soBuoi);
            if (isNaN(sb) || sb <= 0) errors.push('Số buổi học phải là số dương');
          } else if (entity === 'diemDanh') {
            if (!rowData.lopMa) errors.push('Thiếu mã lớp');
            if (!rowData.ngay) errors.push('Thiếu ngày học (YYYY-MM-DD)');
            if (!rowData.gioBatDau) errors.push('Thiếu giờ bắt đầu (HH:mm)');
            if (!rowData.hocVienMa) errors.push('Thiếu mã học viên');
          } else if (entity === 'tuyenSinh') {
            if (!rowData.hoTen) errors.push('Thiếu họ tên khách hàng');
            if (!rowData.coSoMa) errors.push('Thiếu mã cơ sở');
          }

          const isValid = errors.length === 0;
          if (isValid) validCount++;
          else errorCount++;

          previewRows.push({
            line,
            data: rowData,
            isValid,
            errors,
          });
        }

        return c.json({
          data: {
            totalRows: rawRows.length,
            validCount,
            errorCount,
            rows: previewRows,
          },
        });
      },
    );

    // 3. Xác nhận nạp dữ liệu (Commit)
    router.post(
      '/edu/import/xac-nhan/:entity',
      bodyLimit({ maxSize: MAX_CSV_SIZE }),
      apiValidator('json', BodySchema),
      describeRoute({
        tags: ['NocoEdu Universal Import'],
        summary: 'Xác nhận ghi dữ liệu CSV vào database',
        operationId: 'commitImportCsv',
        responses: {
          '200': dataResponse(
            z.object({
              totalRows: z.number(),
              importedCount: z.number(),
              message: z.string(),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (c) => {
        const entity = c.req.param('entity');
        const cfg = ENTITY_CONFIGS[entity];
        if (!cfg) {
          throw eduError('NOT_FOUND', 'EDU_IMPORT_UNKNOWN', `Không hỗ trợ import cho mục "${entity}"`);
        }

        const { csv } = c.req.valid('json');
        const parsedRows = parseCsv(csv);
        if (parsedRows.length <= 1) {
          throw eduError('INVALID_ARGUMENT', 'EDU_IMPORT_EMPTY', 'Tập tin CSV không có dòng dữ liệu nào');
        }

        const headers = parsedRows[0].map((h) => h.trim());
        const rawRows = parsedRows.slice(1);
        const connection = database.connection();
        const userId = currentUserId(c);

        let importedCount = 0;

        for (let i = 0; i < rawRows.length; i++) {
          const r = rawRows[i];
          const rowData: Record<string, string> = {};
          for (let j = 0; j < headers.length; j++) {
            rowData[headers[j]] = (r[j] ?? '').trim();
          }

          try {
            if (entity === 'lop') {
              if (!rowData.ma || !rowData.ten || !rowData.coSoMa) continue;
              const cs = await connection.query
                .selectFrom('eduCoSo')
                .select('id')
                .where('ma', '=', rowData.coSoMa)
                .executeTakeFirst();
              if (!cs) continue;

              const existing = await connection.query
                .selectFrom('eduLop')
                .select('id')
                .where('ma', '=', rowData.ma)
                .executeTakeFirst();

              if (existing) {
                await connection.query
                  .updateTable('eduLop')
                  .set({
                    ten: rowData.ten,
                    coSoId: cs.id,
                    levelKey: rowData.levelKey || 'tot',
                    trangThai: rowData.trangThai || 'dang_mo',
                  })
                  .where('id', '=', existing.id)
                  .execute();
              } else {
                await connection.query
                  .insertInto('eduLop')
                  .values({
                    ma: rowData.ma,
                    ten: rowData.ten,
                    coSoId: cs.id,
                    levelKey: rowData.levelKey || 'tot',
                    levelOrder: 1,
                    trangThai: rowData.trangThai || 'dang_mo',
                  } as any)
                  .execute();
              }
              importedCount++;
            } else if (entity === 'coSo') {
              if (!rowData.ma || !rowData.ten) continue;
              const existing = await connection.query
                .selectFrom('eduCoSo')
                .select('id')
                .where('ma', '=', rowData.ma)
                .executeTakeFirst();

              if (existing) {
                await connection.query
                  .updateTable('eduCoSo')
                  .set({
                    ten: rowData.ten,
                    diaChi: rowData.diaChi || null,
                    truBuoiVangCoPhep: rowData.truBuoiVangCoPhep === 'true',
                    trangThai: rowData.trangThai || 'hoat_dong',
                  })
                  .where('id', '=', existing.id)
                  .execute();
              } else {
                await connection.query
                  .insertInto('eduCoSo')
                  .values({
                    ma: rowData.ma,
                    ten: rowData.ten,
                    diaChi: rowData.diaChi || null,
                    truBuoiVangCoPhep: rowData.truBuoiVangCoPhep === 'true',
                    trangThai: rowData.trangThai || 'hoat_dong',
                  } as any)
                  .execute();
              }
              importedCount++;
            } else if (entity === 'sach') {
              if (!rowData.kyHieu || !rowData.ten) continue;
              const existing = await connection.query
                .selectFrom('eduSach')
                .select('id')
                .where('kyHieu', '=', rowData.kyHieu)
                .executeTakeFirst();

              if (existing) {
                await connection.query
                  .updateTable('eduSach')
                  .set({
                    ten: rowData.ten,
                    giaBia: Number(rowData.giaBia) || 0,
                    giaBan: Number(rowData.giaBan) || 0,
                    trangThai: rowData.trangThai || 'dang_ban',
                  })
                  .where('id', '=', existing.id)
                  .execute();
              } else {
                await connection.query
                  .insertInto('eduSach')
                  .values({
                    kyHieu: rowData.kyHieu,
                    ten: rowData.ten,
                    giaBia: Number(rowData.giaBia) || 0,
                    giaBan: Number(rowData.giaBan) || 0,
                    trangThai: rowData.trangThai || 'dang_ban',
                  } as any)
                  .execute();
              }
              importedCount++;
            } else if (entity === 'hoSoGv') {
              if (!rowData.emailOrUserId) continue;
              let targetUserId = rowData.emailOrUserId;
              const u = await connection.query
                .selectFrom('users')
                .select('id')
                .where((eb: any) =>
                  eb.or([
                    eb('id', '=', targetUserId),
                    eb('email', '=', targetUserId),
                    eb('username', '=', targetUserId),
                  ]),
                )
                .executeTakeFirst();
              if (u) {
                targetUserId = String(u.id);
              }
              const existing = await connection.query
                .selectFrom('eduHoSoGv')
                .select('id')
                .where('userId', '=', targetUserId)
                .executeTakeFirst();

              if (existing) {
                await connection.query
                  .updateTable('eduHoSoGv')
                  .set({
                    tenVietTat: rowData.tenVietTat || null,
                    viTri: rowData.viTri || null,
                    thuLaoMotBuoi: Number(rowData.thuLaoMotBuoi) || 0,
                    tinhTrang: rowData.tinhTrang || 'dang_lam',
                  })
                  .where('id', '=', existing.id)
                  .execute();
              } else {
                await connection.query
                  .insertInto('eduHoSoGv')
                  .values({
                    userId: targetUserId,
                    tenVietTat: rowData.tenVietTat || null,
                    viTri: rowData.viTri || null,
                    thuLaoMotBuoi: Number(rowData.thuLaoMotBuoi) || 0,
                    tinhTrang: rowData.tinhTrang || 'dang_lam',
                  } as any)
                  .execute();
              }
              importedCount++;
            } else if (entity === 'phatSach') {
              if (!rowData.hocVienMa || !rowData.kyHieuSach) continue;
              const hv = await connection.query
                .selectFrom('eduHocVien')
                .select(['id', 'coSoId'])
                .where('ma', '=', rowData.hocVienMa)
                .executeTakeFirst();
              const sach = await connection.query
                .selectFrom('eduSach')
                .select(['id', 'giaBan'])
                .where('kyHieu', '=', rowData.kyHieuSach)
                .executeTakeFirst();
              if (!hv || !sach) continue;

              let coSoId = Number(hv.coSoId);
              if (rowData.coSoMa) {
                const cs = await connection.query
                  .selectFrom('eduCoSo')
                  .select('id')
                  .where('ma', '=', rowData.coSoMa)
                  .executeTakeFirst();
                if (cs) coSoId = Number(cs.id);
              }

              const uuDai = Number(rowData.uuDai) || 0;
              const giaBan = Number(sach.giaBan) || 0;
              const tienSach = Number(rowData.tienSach) || Math.max(0, giaBan - uuDai);

              await connection.repository('eduPhatSach').createOne({
                values: {
                  hocVienId: Number(hv.id),
                  sachId: Number(sach.id),
                  coSoId,
                  ngay: rowData.ngay || todayVn(),
                  uuDai,
                  tienSach,
                  ghiChu: rowData.ghiChu || null,
                  nguoiTaoId: userId,
                  createdAt: new Date(),
                },
              });
              importedCount++;
            } else if (entity === 'goiHoc') {
              if (!rowData.hocVienMa) continue;
              const hv = await connection.query
                .selectFrom('eduHocVien')
                .select(['id', 'coSoId', 'soBuoiConLai'])
                .where('ma', '=', rowData.hocVienMa)
                .executeTakeFirst();
              if (!hv) continue;

              const soBuoi = Number(rowData.soBuoi);
              if (isNaN(soBuoi) || soBuoi <= 0) continue;
              const donGia = Number(rowData.donGia) || 0;
              const thanhTien = Number(rowData.thanhTien) || soBuoi * donGia;
              const ngayMua = rowData.ngayMua || todayVn();
              const daThuTien = rowData.daThuTien === 'true' || rowData.daThuTien === '1';

              const createdGoiHoc = await connection.repository('eduGoiHoc').createOne({
                values: {
                  hocVienId: Number(hv.id),
                  soBuoi,
                  donGia,
                  thanhTien,
                  ngayMua,
                  trangThai: 'hieu_luc',
                  nguoiTaoId: userId,
                },
              });

              // Cộng số buổi còn lại cho học viên
              const curSessions = Number(hv.soBuoiConLai) || 0;
              await connection.query
                .updateTable('eduHocVien')
                .set({
                  soBuoiConLai: curSessions + soBuoi,
                })
                .where('id', '=', hv.id)
                .execute();

              // Nếu đã thu tiền, tạo bản ghi thanh toán
              if (daThuTien && thanhTien > 0 && createdGoiHoc?.record?.id) {
                await connection.repository('eduThanhToan').createOne({
                  values: {
                    goiHocId: Number(createdGoiHoc.record.id),
                    hocVienId: Number(hv.id),
                    coSoId: Number(hv.coSoId),
                    soTien: thanhTien,
                    hinhThuc: rowData.hinhThuc || 'chuyen_khoan',
                    ngay: ngayMua,
                    thang: ngayMua.slice(0, 7),
                    noiDungCk: rowData.ghiChu || `Thu học phí gói ${soBuoi} buổi`,
                    nguoiGhiNhanId: userId,
                  },
                });
              }
              importedCount++;
            } else if (entity === 'diemDanh') {
              if (!rowData.lopMa || !rowData.ngay || !rowData.gioBatDau || !rowData.hocVienMa) continue;
              const lop = await connection.query
                .selectFrom('eduLop')
                .select('id')
                .where('ma', '=', rowData.lopMa)
                .executeTakeFirst();
              const hv = await connection.query
                .selectFrom('eduHocVien')
                .select(['id', 'coSoId', 'soBuoiConLai'])
                .where('ma', '=', rowData.hocVienMa)
                .executeTakeFirst();
              if (!lop || !hv) continue;

              let buoiHocId: number | null = null;
              const buoiHoc = await connection.query
                .selectFrom('eduBuoiHoc')
                .select('id')
                .where('lopId', '=', lop.id)
                .where('ngay', '=', rowData.ngay)
                .where('gioBatDau', '=', rowData.gioBatDau)
                .executeTakeFirst();

              if (!buoiHoc) {
                const createdBuoi = await connection.repository('eduBuoiHoc').createOne({
                  values: {
                    lopId: Number(lop.id),
                    ngay: rowData.ngay,
                    gioBatDau: rowData.gioBatDau,
                    gioKetThuc: rowData.gioKetThuc || '20:00',
                    trangThai: 'da_hoc',
                    loai: 'thuong',
                  },
                });
                buoiHocId = Number(createdBuoi?.record?.id);
              } else {
                buoiHocId = Number(buoiHoc.id);
              }
              if (!buoiHocId) continue;

              const trangThai = rowData.trangThai || 'co_mat';
              const daLamBtvn = rowData.daLamBtvn === 'true' || rowData.daLamBtvn === '1';

              const existingDd = await connection.query
                .selectFrom('eduDiemDanh')
                .select(['id', 'soBuoiDaTru', 'nhanXet'])
                .where('buoiHocId', '=', buoiHocId)
                .where('hocVienId', '=', hv.id)
                .executeTakeFirst();

              const cs = await connection.query
                .selectFrom('eduCoSo')
                .select('truBuoiVangCoPhep')
                .where('id', '=', hv.coSoId)
                .executeTakeFirst();

              const truVangCoPhep = cs?.truBuoiVangCoPhep === true;
              const newToDeduct = sessionsToDeduct(trangThai as any, truVangCoPhep);
              const hvSessions = Number(hv.soBuoiConLai) || 0;

              if (existingDd) {
                const diff = newToDeduct - (Number(existingDd.soBuoiDaTru) || 0);
                await connection.query
                  .updateTable('eduDiemDanh')
                  .set({
                    trangThai,
                    daLamBtvn,
                    nhanXet: rowData.nhanXet || existingDd.nhanXet,
                    soBuoiDaTru: newToDeduct,
                    nguoiDiemDanhId: userId,
                  })
                  .where('id', '=', existingDd.id)
                  .execute();

                if (diff !== 0) {
                  await connection.query
                    .updateTable('eduHocVien')
                    .set({
                      soBuoiConLai: hvSessions - diff,
                    })
                    .where('id', '=', hv.id)
                    .execute();
                }
              } else {
                await connection.repository('eduDiemDanh').createOne({
                  values: {
                    buoiHocId,
                    hocVienId: Number(hv.id),
                    trangThai,
                    daLamBtvn,
                    nhanXet: rowData.nhanXet || null,
                    soBuoiDaTru: newToDeduct,
                    nguoiDiemDanhId: userId,
                  },
                });

                if (newToDeduct > 0) {
                  await connection.query
                    .updateTable('eduHocVien')
                    .set({
                      soBuoiConLai: hvSessions - newToDeduct,
                    })
                    .where('id', '=', hv.id)
                    .execute();
                }
              }
              importedCount++;
            } else if (entity === 'tuyenSinh') {
              if (!rowData.hoTen || !rowData.coSoMa) continue;
              const cs = await connection.query
                .selectFrom('eduCoSo')
                .select('id')
                .where('ma', '=', rowData.coSoMa)
                .executeTakeFirst();
              if (!cs) continue;

              await connection.query
                .insertInto('eduLienHe')
                .values({
                  hoTen: rowData.hoTen,
                  soDienThoai: rowData.soDienThoai || null,
                  coSoId: cs.id,
                  kenh: rowData.kenh || 'Trực tiếp',
                  trangThai: rowData.trangThai || 'moi',
                  ngayNhac: rowData.ngayNhac || null,
                  ghiChu: rowData.ghiChu || null,
                  ngayTao: todayVn(),
                } as any)
                .execute();
              importedCount++;
            }
          } catch (err) {
            console.error(`Import error row ${i + 2}:`, err);
          }
        }

        return c.json({
          data: {
            totalRows: rawRows.length,
            importedCount,
            message: `Đã nhập thành công ${importedCount}/${rawRows.length} dòng dữ liệu vào ${cfg.name}.`,
          },
        });
      },
    );

    return new Hono().route('/', router);
  }),
];
