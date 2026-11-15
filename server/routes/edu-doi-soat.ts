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
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { asText } from '../edu/names.js';
import {
  ATTENDANCE_STATUSES,
  sessionsToDeduct,
  todayVn,
} from '../edu/so-du.js';
import {
  eduError,
  needs,
  type EduEnv,
} from './edu-support.js';

const Id = z.coerce.number().int().positive();

const TongQuanInput = z.object({
  search: z.string().trim().nullish(),
  lopId: Id.nullish(),
  coSoId: Id.nullish(),
  trangThaiLoc: z.enum(['tat_ca', 'vuot_goi', 'sap_het', 'binh_thuong', 'no_hoc_phi', 'no_sach']).default('tat_ca'),
});

const ChiTietInput = z.object({
  hocVienId: Id,
});

const CapNhatBuoiHocInput = z.object({
  diemDanhId: Id,
  trangThai: z.enum(ATTENDANCE_STATUSES),
  daLamBtvn: z.boolean().optional(),
  yThucDiem: z.number().int().min(0).max(10).nullish(),
  nhanXet: z.string().trim().max(1000).nullish(),
});

const declare = (summary: string, operationId: string) =>
  describeRoute({
    tags: ['NocoEdu', 'DoiSoat'],
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
      '/doiSoat/tongQuan',
      '/doiSoat/chiTietHocVien',
      '/doiSoat/capNhatBuoiHoc',
    ]) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 64 * 1024 }),
      );
    }

    // 1. API Tổng quan đối soát toàn trung tâm
    router.post(
      '/doiSoat/tongQuan',
      declare('Get audit overview for all students', 'getAuditOverview'),
      apiValidator('json', TongQuanInput),
      async (c) => {
        needs(c, 'edu.hocPhi', 'view');
        const db = database.get();
        if (!db) throw eduError('DATABASE_ERROR', 'NO_DB', 'Database is not ready');

        const { search, lopId, coSoId, trangThaiLoc } = c.req.valid('json');

        const hocVienRepo = db.getRepository('eduHocVien');
        const lopRepo = db.getRepository('eduLop');
        const coSoRepo = db.getRepository('eduCoSo');
        const phuHuynhRepo = db.getRepository('eduPhuHuynh');
        const hocVienPhuHuynhRepo = db.getRepository('eduHocVienPhuHuynh');
        const goiHocRepo = db.getRepository('eduGoiHoc');
        const diemDanhRepo = db.getRepository('eduDiemDanh');
        const phatSachRepo = db.getRepository('eduPhatSach');
        const nopSachRepo = db.getRepository('eduNopSach');

        // Lấy danh sách học viên
        const allStudents = await hocVienRepo.find({
          order: [['id', 'ASC']],
        });

        const [classes, branches, allPacks, allAttendances, allBooks, allBookPayments, parentLinks, parents] = await Promise.all([
          lopRepo.find(),
          coSoRepo.find(),
          goiHocRepo.find(),
          diemDanhRepo.find(),
          phatSachRepo.find(),
          nopSachRepo.find(),
          hocVienPhuHuynhRepo.find(),
          phuHuynhRepo.find(),
        ]);

        const classMap = new Map(classes.map((c: any) => [c.id, c]));
        const branchMap = new Map(branches.map((b: any) => [b.id, b]));
        const parentMap = new Map(parents.map((p: any) => [p.id, p]));
        const studentParentMap = new Map<number, any>();
        for (const link of parentLinks) {
          if (!studentParentMap.has(link.hocVienId)) {
            const p = parentMap.get(link.phuHuynhId);
            if (p) studentParentMap.set(link.hocVienId, p);
          }
        }

        // Tính toán gói học theo từng học viên
        const packStats = new Map<number, { tongSoBuoiDaMua: number; tongTienHocPhi: number; tongDaThanhToan: number }>();
        for (const pack of allPacks) {
          const s = packStats.get(pack.hocVienId) ?? { tongSoBuoiDaMua: 0, tongTienHocPhi: 0, tongDaThanhToan: 0 };
          s.tongSoBuoiDaMua += Number(pack.soBuoi || 0);
          s.tongTienHocPhi += Number(pack.thanhTien || 0);
          s.tongDaThanhToan += Number(pack.daThanhToan || 0);
          packStats.set(pack.hocVienId, s);
        }

        // Tính toán điểm danh theo từng học viên
        const attendanceStats = new Map<number, { tongSoBuoiDaHoc: number; tongBuoiTru: number }>();
        for (const att of allAttendances) {
          const s = attendanceStats.get(att.hocVienId) ?? { tongSoBuoiDaHoc: 0, tongBuoiTru: 0 };
          s.tongSoBuoiDaHoc += 1;
          s.tongBuoiTru += Number(att.soBuoiDaTru || 0);
          attendanceStats.set(att.hocVienId, s);
        }

        // Tính toán sách theo từng học viên
        const bookStats = new Map<number, { tongTienSachDaPhat: number; tongTienSachDaNop: number }>();
        for (const b of allBooks) {
          const s = bookStats.get(b.hocVienId) ?? { tongTienSachDaPhat: 0, tongTienSachDaNop: 0 };
          const tien = Number(b.tienSach || 0) - Number(b.uuDai || 0);
          s.tongTienSachDaPhat += Math.max(0, tien);
          bookStats.set(b.hocVienId, s);
        }
        for (const np of allBookPayments) {
          const s = bookStats.get(np.hocVienId) ?? { tongTienSachDaPhat: 0, tongTienSachDaNop: 0 };
          s.tongTienSachDaNop += Number(np.soTien || 0);
          bookStats.set(np.hocVienId, s);
        }

        // Thống kê toàn trường
        let soHocVienVuotGoi = 0;
        let soHocVienSapHet = 0;
        let soHocVienBinhThuong = 0;
        let tongCongNoHocPhi = 0;
        let tongCongNoSach = 0;

        const resultRows: any[] = [];

        for (const hv of allStudents) {
          const lop = hv.lopId ? classMap.get(hv.lopId) : null;
          const coSo = lop?.coSoId ? branchMap.get(lop.coSoId) : (hv.coSoId ? branchMap.get(hv.coSoId) : null);
          const ph = studentParentMap.get(hv.id);

          const ps = packStats.get(hv.id) ?? { tongSoBuoiDaMua: 0, tongTienHocPhi: 0, tongDaThanhToan: 0 };
          const as = attendanceStats.get(hv.id) ?? { tongSoBuoiDaHoc: 0, tongBuoiTru: 0 };
          const bs = bookStats.get(hv.id) ?? { tongTienSachDaPhat: 0, tongTienSachDaNop: 0 };

          const soBuoiConLai = Number(hv.soBuoiConLai || 0);
          const tongConNoHocPhi = Math.max(0, ps.tongTienHocPhi - ps.tongDaThanhToan);
          const tienSachTon = bs.tongTienSachDaNop - bs.tongTienSachDaPhat;
          const congNoSach = tienSachTon < 0 ? Math.abs(tienSachTon) : 0;

          if (soBuoiConLai < 0) soHocVienVuotGoi++;
          else if (soBuoiConLai <= 2) soHocVienSapHet++;
          else soHocVienBinhThuong++;

          tongCongNoHocPhi += tongConNoHocPhi;
          tongCongNoSach += congNoSach;

          // Kiểm tra filter
          if (search) {
            const q = search.toLowerCase();
            const matchName = String(hv.hoTen || '').toLowerCase().includes(q);
            const matchMa = String(hv.ma || '').toLowerCase().includes(q);
            const matchPhone = String(ph?.soDienThoai || '').includes(q);
            if (!matchName && !matchMa && !matchPhone) continue;
          }

          if (lopId && hv.lopId !== lopId) continue;
          if (coSoId && lop?.coSoId !== coSoId && hv.coSoId !== coSoId) continue;

          if (trangThaiLoc === 'vuot_goi' && soBuoiConLai >= 0) continue;
          if (trangThaiLoc === 'sap_het' && (soBuoiConLai < 0 || soBuoiConLai > 2)) continue;
          if (trangThaiLoc === 'binh_thuong' && soBuoiConLai < 3) continue;
          if (trangThaiLoc === 'no_hoc_phi' && tongConNoHocPhi <= 0) continue;
          if (trangThaiLoc === 'no_sach' && congNoSach <= 0) continue;

          resultRows.push({
            id: hv.id,
            ma: hv.ma,
            hoTen: hv.hoTen,
            lopId: hv.lopId,
            lopTen: lop ? lop.ten : null,
            coSoId: coSo ? coSo.id : null,
            coSoTen: coSo ? coSo.ten : null,
            phuHuynhTen: ph ? ph.hoTen : null,
            phuHuynhSdt: ph ? ph.soDienThoai : null,
            soBuoiConLai,
            soBuoiVuotGoi: soBuoiConLai < 0 ? Math.abs(soBuoiConLai) : 0,
            tongSoBuoiDaMua: ps.tongSoBuoiDaMua,
            tongSoBuoiDaHoc: as.tongSoBuoiDaHoc,
            tongTienHocPhi: ps.tongTienHocPhi,
            tongDaThanhToan: ps.tongDaThanhToan,
            tongConNoHocPhi,
            tongTienSachDaPhat: bs.tongTienSachDaPhat,
            tongTienSachDaNop: bs.tongTienSachDaNop,
            tienSachTon,
            congNoSach,
            trangThai: hv.trangThai || 'dang_hoc',
          });
        }

        return c.json({
          data: {
            thongKe: {
              tongHocVien: allStudents.length,
              soHocVienVuotGoi,
              soHocVienSapHet,
              soHocVienBinhThuong,
              tongCongNoHocPhi,
              tongCongNoSach,
            },
            danhSach: resultRows,
          },
        });
      },
    );

    // 2. API Chi tiết đối soát học viên với Mapping kỳ nộp - buổi học
    router.post(
      '/doiSoat/chiTietHocVien',
      declare('Get detailed audit data for one student', 'getStudentAuditDetail'),
      apiValidator('json', ChiTietInput),
      async (c) => {
        needs(c, 'edu.hocPhi', 'view');
        const db = database.get();
        if (!db) throw eduError('DATABASE_ERROR', 'NO_DB', 'Database is not ready');

        const { hocVienId } = c.req.valid('json');

        const hocVienRepo = db.getRepository('eduHocVien');
        const lopRepo = db.getRepository('eduLop');
        const coSoRepo = db.getRepository('eduCoSo');
        const goiHocRepo = db.getRepository('eduGoiHoc');
        const diemDanhRepo = db.getRepository('eduDiemDanh');
        const buoiHocRepo = db.getRepository('eduBuoiHoc');
        const phatSachRepo = db.getRepository('eduPhatSach');
        const sachRepo = db.getRepository('eduSach');
        const nopSachRepo = db.getRepository('eduNopSach');
        const phuHuynhRepo = db.getRepository('eduPhuHuynh');
        const hocVienPhuHuynhRepo = db.getRepository('eduHocVienPhuHuynh');

        const hocVien = await hocVienRepo.findOne({ filterByTk: hocVienId });
        if (!hocVien) throw eduError('NOT_FOUND', 'STUDENT_NOT_FOUND', 'Student not found');

        const [classes, branches, goiHocs, diemDanhs, buoiHocs, phatSachs, sachs, nopSachs, parentLinks, parents] = await Promise.all([
          lopRepo.find(),
          coSoRepo.find(),
          goiHocRepo.find({ filter: { hocVienId }, order: [['ngayMua', 'ASC'], ['id', 'ASC']] }),
          diemDanhRepo.find({ filter: { hocVienId } }),
          buoiHocRepo.find(),
          phatSachRepo.find({ filter: { hocVienId }, order: [['ngay', 'ASC']] }),
          sachRepo.find(),
          nopSachRepo.find({ filter: { hocVienId }, order: [['ngay', 'ASC']] }),
          hocVienPhuHuynhRepo.find({ filter: { hocVienId } }),
          phuHuynhRepo.find(),
        ]);

        const classMap = new Map(classes.map((cl: any) => [cl.id, cl]));
        const branchMap = new Map(branches.map((b: any) => [b.id, b]));
        const buoiHocMap = new Map(buoiHocs.map((bh: any) => [bh.id, bh]));
        const sachMap = new Map(sachs.map((s: any) => [s.id, s]));
        const parentMap = new Map(parents.map((p: any) => [p.id, p]));

        const studentLop = hocVien.lopId ? classMap.get(hocVien.lopId) : null;
        const studentCoSo = studentLop?.coSoId ? branchMap.get(studentLop.coSoId) : (hocVien.coSoId ? branchMap.get(hocVien.coSoId) : null);

        let phuHuynhInfo: any = null;
        if (parentLinks.length > 0) {
          const ph = parentMap.get(parentLinks[0].phuHuynhId);
          if (ph) {
            phuHuynhInfo = {
              id: ph.id,
              hoTen: ph.hoTen,
              soDienThoai: ph.soDienThoai,
              email: ph.email,
              moiQuanHe: parentLinks[0].moiQuanHe,
            };
          }
        }

        // Danh sách kỳ nộp học phí
        let tongSoBuoiDaMua = 0;
        let tongTienHocPhi = 0;
        let tongDaThanhToan = 0;

        const cacKyNop = goiHocs.map((g: any, index: number) => {
          const soBuoi = Number(g.soBuoi || 0);
          const thanhTien = Number(g.thanhTien || 0);
          const daThanhToan = Number(g.daThanhToan || 0);
          const conNo = Math.max(0, thanhTien - daThanhToan);
          tongSoBuoiDaMua += soBuoi;
          tongTienHocPhi += thanhTien;
          tongDaThanhToan += daThanhToan;

          return {
            id: g.id,
            kySo: index + 1,
            tenKy: `Kỳ ${index + 1} (${soBuoi} buổi)`,
            ngayMua: g.ngayMua || '',
            soBuoi,
            donGia: Number(g.donGia || 0),
            thanhTien,
            daThanhToan,
            conNo,
            trangThai: conNo === 0 ? 'da_dong_du' : daThanhToan > 0 ? 'dong_mot_phan' : 'chua_dong',
          };
        });

        // Sắp xếp các buổi học theo thời gian tăng dần
        const rawSessions: any[] = [];
        for (const dd of diemDanhs) {
          const bh = buoiHocMap.get(dd.buoiHocId);
          if (!bh) continue;
          const lopOfBuoi = bh.lopId ? classMap.get(bh.lopId) : null;
          rawSessions.push({
            diemDanhId: dd.id,
            buoiHocId: bh.id,
            ngay: bh.ngay,
            gioBatDau: bh.gioBatDau || '',
            gioKetThuc: bh.gioKetThuc || '',
            lopId: bh.lopId,
            lopTen: lopOfBuoi ? lopOfBuoi.ten : '—',
            trangThai: dd.trangThai,
            daLamBtvn: Boolean(dd.daLamBtvn),
            yThucDiem: dd.yThucDiem != null ? Number(dd.yThucDiem) : null,
            nhanXet: dd.nhanXet || '',
            soBuoiDaTru: Number(dd.soBuoiDaTru || 0),
          });
        }

        rawSessions.sort((a, b) => {
          if (a.ngay !== b.ngay) return a.ngay.localeCompare(b.ngay);
          return a.gioBatDau.localeCompare(b.gioBatDau);
        });

        // Mapping Buổi học vào từng Kỳ nộp theo thứ tự thời gian (FIFO)
        let accumulatedSessions = 0;
        let tongSoBuoiDaHoc = 0;
        let currentKyIdx = 0;
        let kyAccumulatedCapacity = cacKyNop.length > 0 ? cacKyNop[0].soBuoi : 0;

        const danhSachBuoiHoc = rawSessions.map((s, idx) => {
          tongSoBuoiDaHoc += 1;
          const ded = s.soBuoiDaTru > 0 ? s.soBuoiDaTru : 0;
          accumulatedSessions += ded;

          // Tìm xem buổi này rơi vào kỳ nào
          while (currentKyIdx < cacKyNop.length - 1 && accumulatedSessions > kyAccumulatedCapacity) {
            currentKyIdx++;
            kyAccumulatedCapacity += cacKyNop[currentKyIdx].soBuoi;
          }

          const ngoaiGoi = cacKyNop.length === 0 || accumulatedSessions > kyAccumulatedCapacity;
          const ky = !ngoaiGoi && currentKyIdx < cacKyNop.length ? cacKyNop[currentKyIdx] : null;

          return {
            ...s,
            stt: idx + 1,
            buoiThu: accumulatedSessions,
            kyId: ky ? ky.id : null,
            kyTen: ky ? ky.tenKy : 'Vượt gói / Chưa nộp kỳ mới',
            ngoaiGoi,
          };
        });

        // Tính số buổi đã dùng cho từng kỳ nộp
        let usedSessions = 0;
        for (const ky of cacKyNop) {
          const sessionsInThisKy = Math.min(ky.soBuoi, Math.max(0, accumulatedSessions - usedSessions));
          usedSessions += sessionsInThisKy;
          (ky as any).daDung = sessionsInThisKy;
          (ky as any).conLai = ky.soBuoi - sessionsInThisKy;
          (ky as any).tienDo = ky.soBuoi > 0 ? Math.round((sessionsInThisKy / ky.soBuoi) * 100) : 0;
        }

        // Sách & Quỹ giáo trình
        let tongTienSachDaPhat = 0;
        const sachDaPhat = phatSachs.map((ps: any) => {
          const s = sachMap.get(ps.sachId);
          const giaBia = Number(ps.tienSach || s?.giaBia || 0);
          const uuDai = Number(ps.uuDai || 0);
          const thanhTien = Math.max(0, giaBia - uuDai);
          tongTienSachDaPhat += thanhTien;
          return {
            id: ps.id,
            sachId: ps.sachId,
            tenSach: s ? s.ten : 'Giáo trình',
            ngayPhat: ps.ngay || '',
            soLuong: 1,
            giaBia,
            uuDai,
            thanhTien,
            ghiChu: ps.ghiChu || '',
          };
        });

        let tongTienSachDaNop = 0;
        for (const ns of nopSachs) {
          tongTienSachDaNop += Number(ns.soTien || 0);
        }
        const tienSachTon = tongTienSachDaNop - tongTienSachDaPhat;

        const soBuoiConLai = Number(hocVien.soBuoiConLai || 0);
        const soBuoiVuotGoi = soBuoiConLai < 0 ? Math.abs(soBuoiConLai) : 0;
        const tongConNo = Math.max(0, tongTienHocPhi - tongDaThanhToan);

        return c.json({
          data: {
            hocVien: {
              id: hocVien.id,
              ma: hocVien.ma,
              hoTen: hocVien.hoTen,
              lopId: hocVien.lopId,
              lopTen: studentLop ? studentLop.ten : null,
              coSoId: studentCoSo ? studentCoSo.id : null,
              coSoTen: studentCoSo ? studentCoSo.ten : null,
              phuHuynh: phuHuynhInfo,
              soBuoiConLai,
              trangThai: hocVien.trangThai || 'dang_hoc',
            },
            tongHop: {
              tongSoBuoiDaMua,
              tongSoBuoiDaHoc,
              soBuoiConLai,
              soBuoiVuotGoi,
              tongTienHocPhi,
              tongDaThanhToan,
              tongConNo,
              tongTienSachDaPhat,
              tongTienSachDaNop,
              tienSachTon,
            },
            cacKyNop,
            sachDaPhat,
            danhSachBuoiHoc,
          },
        });
      },
    );

    // 3. API Sửa nhanh một buổi học (Quick Edit attendance) & Tự động tính toán lại số buổi còn lại
    router.post(
      '/doiSoat/capNhatBuoiHoc',
      declare('Quick edit session attendance and recalculate balance', 'quickEditSession'),
      apiValidator('json', CapNhatBuoiHocInput),
      async (c) => {
        needs(c, 'edu.diemDanh', 'edit');
        const db = database.get();
        if (!db) throw eduError('DATABASE_ERROR', 'NO_DB', 'Database is not ready');

        const { diemDanhId, trangThai, daLamBtvn, yThucDiem, nhanXet } = c.req.valid('json');

        const diemDanhRepo = db.getRepository('eduDiemDanh');
        const hocVienRepo = db.getRepository('eduHocVien');
        const goiHocRepo = db.getRepository('eduGoiHoc');

        const record = await diemDanhRepo.findOne({ filterByTk: diemDanhId });
        if (!record) throw eduError('NOT_FOUND', 'RECORD_NOT_FOUND', 'Attendance record not found');

        const hocVienId = record.hocVienId;

        // Tính số buổi trừ mới dựa trên trạng thái
        const soBuoiDaTruMoi = sessionsToDeduct(trangThai);

        // Update bản ghi điểm danh
        await diemDanhRepo.update({
          filterByTk: diemDanhId,
          values: {
            trangThai,
            soBuoiDaTru: soBuoiDaTruMoi,
            daLamBtvn: daLamBtvn !== undefined ? daLamBtvn : record.daLamBtvn,
            yThucDiem: yThucDiem !== undefined ? yThucDiem : record.yThucDiem,
            nhanXet: nhanXet !== undefined ? nhanXet : record.nhanXet,
          },
        });

        // Tính toán lại số buổi còn lại cho học viên
        const allPacks = await goiHocRepo.find({ filter: { hocVienId } });
        const allAttendances = await diemDanhRepo.find({ filter: { hocVienId } });

        let tongMua = 0;
        for (const p of allPacks) {
          tongMua += Number(p.soBuoi || 0);
        }

        let tongTru = 0;
        for (const att of allAttendances) {
          tongTru += Number(att.soBuoiDaTru || 0);
        }

        const soBuoiConLaiMoi = tongMua - tongTru;

        await hocVienRepo.update({
          filterByTk: hocVienId,
          values: {
            soBuoiConLai: soBuoiConLaiMoi,
          },
        });

        return c.json({
          data: {
            success: true,
            diemDanhId,
            hocVienId,
            soBuoiDaTru: soBuoiDaTruMoi,
            soBuoiConLaiMoi,
          },
        });
      },
    );
  }),
];
