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
import { asText } from '../edu/names.js';
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

export default defineApiRoutes((app: AppPluginApplication) => {
  const router = new Hono<EduEnv>();
  const dbManager = app.container.get<DatabaseManager>(databaseManagerToken);
  const auth = app.container.get(authenticationToken);

  router.use('*', auth.required());

  // 1. Tải mẫu CSV
  router.get(
    '/mau/:entity',
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
        throw eduError(c, 'NOT_FOUND', `Không hỗ trợ import cho mục "${entity}"`);
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
    '/xem-truoc/:entity',
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
        throw eduError(c, 'NOT_FOUND', `Không hỗ trợ import cho mục "${entity}"`);
      }

      const { csv } = c.req.valid('json');
      const parsedRows = parseCsv(csv);
      if (parsedRows.length <= 1) {
        throw eduError(c, 'BAD_REQUEST', 'Tập tin CSV không có dòng dữ liệu nào');
      }

      const headers = parsedRows[0].map((h) => h.trim());
      const rawRows = parsedRows.slice(1);

      const db = dbManager.get('main');
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
            const cs = await db.getRepository('eduCoSo').findOne({
              filter: { ma: rowData.coSoMa },
            });
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
            const hv = await db.getRepository('eduHocVien').findOne({
              filter: { ma: rowData.hocVienMa },
            });
            if (!hv) errors.push(`Không tìm thấy học viên có mã: ${rowData.hocVienMa}`);
          }
          if (!rowData.kyHieuSach) errors.push('Thiếu ký hiệu sách');
          else {
            const s = await db.getRepository('eduSach').findOne({
              filter: { kyHieu: rowData.kyHieuSach },
            });
            if (!s) errors.push(`Không tìm thấy sách có ký hiệu: ${rowData.kyHieuSach}`);
          }
        } else if (entity === 'goiHoc') {
          if (!rowData.hocVienMa) errors.push('Thiếu mã học viên');
          else {
            const hv = await db.getRepository('eduHocVien').findOne({
              filter: { ma: rowData.hocVienMa },
            });
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
    '/xac-nhan/:entity',
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
        throw eduError(c, 'NOT_FOUND', `Không hỗ trợ import cho mục "${entity}"`);
      }

      const { csv } = c.req.valid('json');
      const parsedRows = parseCsv(csv);
      if (parsedRows.length <= 1) {
        throw eduError(c, 'BAD_REQUEST', 'Tập tin CSV không có dòng dữ liệu nào');
      }

      const headers = parsedRows[0].map((h) => h.trim());
      const rawRows = parsedRows.slice(1);
      const db = dbManager.get('main');
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
            const cs = await db.getRepository('eduCoSo').findOne({
              filter: { ma: rowData.coSoMa },
            });
            if (!cs) continue;

            const existing = await db.getRepository('eduLop').findOne({
              filter: { ma: rowData.ma },
            });
            const values = {
              ma: rowData.ma,
              ten: rowData.ten,
              coSoId: cs.id,
              levelKey: rowData.levelKey || 'tot',
              levelOrder: 1,
              trangThai: rowData.trangThai || 'dang_mo',
            };
            if (existing) {
              await db.getRepository('eduLop').update({
                filterByTk: existing.id,
                values,
              });
            } else {
              await db.getRepository('eduLop').create({ values });
            }
            importedCount++;
          } else if (entity === 'coSo') {
            if (!rowData.ma || !rowData.ten) continue;
            const existing = await db.getRepository('eduCoSo').findOne({
              filter: { ma: rowData.ma },
            });
            const values = {
              ma: rowData.ma,
              ten: rowData.ten,
              diaChi: rowData.diaChi || null,
              truBuoiVangCoPhep: rowData.truBuoiVangCoPhep === 'true',
              trangThai: rowData.trangThai || 'hoat_dong',
            };
            if (existing) {
              await db.getRepository('eduCoSo').update({
                filterByTk: existing.id,
                values,
              });
            } else {
              await db.getRepository('eduCoSo').create({ values });
            }
            importedCount++;
          } else if (entity === 'sach') {
            if (!rowData.kyHieu || !rowData.ten) continue;
            const existing = await db.getRepository('eduSach').findOne({
              filter: { kyHieu: rowData.kyHieu },
            });
            const values = {
              kyHieu: rowData.kyHieu,
              ten: rowData.ten,
              giaBia: Number(rowData.giaBia) || 0,
              giaBan: Number(rowData.giaBan) || 0,
              trangThai: rowData.trangThai || 'dang_ban',
            };
            if (existing) {
              await db.getRepository('eduSach').update({
                filterByTk: existing.id,
                values,
              });
            } else {
              await db.getRepository('eduSach').create({ values });
            }
            importedCount++;
          } else if (entity === 'hoSoGv') {
            if (!rowData.emailOrUserId) continue;
            let targetUserId = rowData.emailOrUserId;
            // Tìm trong users
            const u = await db.getRepository('users').findOne({
              filter: {
                $or: [{ id: targetUserId }, { email: targetUserId }, { username: targetUserId }],
              },
            });
            if (u) {
              targetUserId = String(u.id);
            }
            const existing = await db.getRepository('eduHoSoGv').findOne({
              filter: { userId: targetUserId },
            });
            const values = {
              userId: targetUserId,
              tenVietTat: rowData.tenVietTat || null,
              viTri: rowData.viTri || null,
              thuLaoMotBuoi: Number(rowData.thuLaoMotBuoi) || 0,
              tinhTrang: rowData.tinhTrang || 'dang_lam',
            };
            if (existing) {
              await db.getRepository('eduHoSoGv').update({
                filterByTk: existing.id,
                values,
              });
            } else {
              await db.getRepository('eduHoSoGv').create({ values });
            }
            importedCount++;
          } else if (entity === 'phatSach') {
            if (!rowData.hocVienMa || !rowData.kyHieuSach) continue;
            const hv = await db.getRepository('eduHocVien').findOne({
              filter: { ma: rowData.hocVienMa },
            });
            const sach = await db.getRepository('eduSach').findOne({
              filter: { kyHieu: rowData.kyHieuSach },
            });
            if (!hv || !sach) continue;

            let coSoId = hv.coSoId;
            if (rowData.coSoMa) {
              const cs = await db.getRepository('eduCoSo').findOne({
                filter: { ma: rowData.coSoMa },
              });
              if (cs) coSoId = cs.id;
            }

            const uuDai = Number(rowData.uuDai) || 0;
            const tienSach = Number(rowData.tienSach) || Math.max(0, (sach.giaBan ?? 0) - uuDai);

            await db.getRepository('eduPhatSach').create({
              values: {
                hocVienId: hv.id,
                sachId: sach.id,
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
            const hv = await db.getRepository('eduHocVien').findOne({
              filter: { ma: rowData.hocVienMa },
            });
            if (!hv) continue;

            const soBuoi = Number(rowData.soBuoi);
            if (isNaN(soBuoi) || soBuoi <= 0) continue;
            const donGia = Number(rowData.donGia) || 0;
            const thanhTien = Number(rowData.thanhTien) || soBuoi * donGia;
            const ngayMua = rowData.ngayMua || todayVn();
            const daThuTien = rowData.daThuTien === 'true' || rowData.daThuTien === '1';

            const goiHoc = await db.getRepository('eduGoiHoc').create({
              values: {
                hocVienId: hv.id,
                soBuoi,
                donGia,
                thanhTien,
                ngayMua,
                trangThai: 'hieu_luc',
                nguoiTaoId: userId,
              },
            });

            // Cộng số buổi còn lại cho học viên
            await db.getRepository('eduHocVien').update({
              filterByTk: hv.id,
              values: {
                soBuoiConLai: (hv.soBuoiConLai ?? 0) + soBuoi,
              },
            });

            // Nếu đã thu tiền, tạo bản ghi thanh toán
            if (daThuTien && thanhTien > 0) {
              await db.getRepository('eduThanhToan').create({
                values: {
                  goiHocId: goiHoc.id,
                  hocVienId: hv.id,
                  coSoId: hv.coSoId,
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
            const lop = await db.getRepository('eduLop').findOne({
              filter: { ma: rowData.lopMa },
            });
            const hv = await db.getRepository('eduHocVien').findOne({
              filter: { ma: rowData.hocVienMa },
            });
            if (!lop || !hv) continue;

            // Tìm hoặc tạo buoiHoc
            let buoiHoc = await db.getRepository('eduBuoiHoc').findOne({
              filter: {
                lopId: lop.id,
                ngay: rowData.ngay,
                gioBatDau: rowData.gioBatDau,
              },
            });
            if (!buoiHoc) {
              buoiHoc = await db.getRepository('eduBuoiHoc').create({
                values: {
                  lopId: lop.id,
                  ngay: rowData.ngay,
                  gioBatDau: rowData.gioBatDau,
                  gioKetThuc: rowData.gioKetThuc || '20:00',
                  trangThai: 'da_hoc',
                  loai: 'thuong',
                },
              });
            }

            const trangThai = rowData.trangThai || 'co_mat';
            const daLamBtvn = rowData.daLamBtvn === 'true' || rowData.daLamBtvn === '1';

            // Kiểm tra điểm danh cũ
            const existingDd = await db.getRepository('eduDiemDanh').findOne({
              filter: {
                buoiHocId: buoiHoc.id,
                hocVienId: hv.id,
              },
            });

            const cs = await db.getRepository('eduCoSo').findOne({
              filterByTk: hv.coSoId,
            });
            const truVangCoPhep = cs?.truBuoiVangCoPhep === true;
            const newToDeduct = sessionsToDeduct(trangThai as any, truVangCoPhep);

            if (existingDd) {
              const diff = newToDeduct - (existingDd.soBuoiDaTru ?? 0);
              await db.getRepository('eduDiemDanh').update({
                filterByTk: existingDd.id,
                values: {
                  trangThai,
                  daLamBtvn,
                  nhanXet: rowData.nhanXet || existingDd.nhanXet,
                  soBuoiDaTru: newToDeduct,
                  nguoiDiemDanhId: userId,
                },
              });
              if (diff !== 0) {
                await db.getRepository('eduHocVien').update({
                  filterByTk: hv.id,
                  values: {
                    soBuoiConLai: (hv.soBuoiConLai ?? 0) - diff,
                  },
                });
              }
            } else {
              await db.getRepository('eduDiemDanh').create({
                values: {
                  buoiHocId: buoiHoc.id,
                  hocVienId: hv.id,
                  trangThai,
                  daLamBtvn,
                  nhanXet: rowData.nhanXet || null,
                  soBuoiDaTru: newToDeduct,
                  nguoiDiemDanhId: userId,
                },
              });
              if (newToDeduct > 0) {
                await db.getRepository('eduHocVien').update({
                  filterByTk: hv.id,
                  values: {
                    soBuoiConLai: (hv.soBuoiConLai ?? 0) - newToDeduct,
                  },
                });
              }
            }
            importedCount++;
          } else if (entity === 'tuyenSinh') {
            if (!rowData.hoTen || !rowData.coSoMa) continue;
            const cs = await db.getRepository('eduCoSo').findOne({
              filter: { ma: rowData.coSoMa },
            });
            if (!cs) continue;

            await db.getRepository('eduLienHe').create({
              values: {
                hoTen: rowData.hoTen,
                soDienThoai: rowData.soDienThoai || null,
                coSoId: cs.id,
                kenh: rowData.kenh || 'Trực tiếp',
                trangThai: rowData.trangThai || 'moi',
                ngayNhac: rowData.ngayNhac || null,
                ghiChu: rowData.ghiChu || null,
                ngayTao: todayVn(),
              },
            });
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

  return router;
});
