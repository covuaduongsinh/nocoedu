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

import { asText } from '../edu/names.js';
import {
  ATTENDANCE_STATUSES,
  sessionsToDeduct,
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
      needs('edu.hocVien', 'view'),
      apiValidator('json', TongQuanInput),
      async (c) => {
        const connection = database.connection();
        const { search, lopId, coSoId, trangThaiLoc } = c.req.valid('json');

        const allStudents = await connection.query
          .selectFrom('eduHocVien')
          .selectAll()
          .orderBy('id', 'asc')
          .execute();

        const [classes, branches, allPacks, allAttendances, allBooks, allBookPayments, parentLinks, parents] = await Promise.all([
          connection.query.selectFrom('eduLop').select(['id', 'ten', 'coSoId']).execute(),
          connection.query.selectFrom('eduCoSo').select(['id', 'ten']).execute(),
          connection.query.selectFrom('eduGoiHoc').select(['id', 'hocVienId', 'soBuoi', 'thanhTien', 'daThanhToan']).execute(),
          connection.query.selectFrom('eduDiemDanh').select(['id', 'hocVienId', 'soBuoiDaTru']).execute(),
          connection.query.selectFrom('eduPhatSach').select(['id', 'hocVienId', 'tienSach', 'uuDai']).execute(),
          connection.query.selectFrom('eduNopSach').select(['id', 'hocVienId', 'soTien']).execute(),
          connection.query.selectFrom('eduHocVienPhuHuynh').select(['hocVienId', 'phuHuynhId']).execute(),
          connection.query.selectFrom('eduPhuHuynh').select(['id', 'hoTen', 'soDienThoai']).execute(),
        ]);

        const classMap = new Map(classes.map((cl) => [Number(cl.id), cl]));
        const branchMap = new Map(branches.map((b) => [Number(b.id), b]));
        const parentMap = new Map(parents.map((p) => [Number(p.id), p]));
        const studentParentMap = new Map<number, any>();
        for (const link of parentLinks) {
          const hvId = Number(link.hocVienId);
          if (!studentParentMap.has(hvId)) {
            const p = parentMap.get(Number(link.phuHuynhId));
            if (p) studentParentMap.set(hvId, p);
          }
        }

        const packStats = new Map<number, { tongSoBuoiDaMua: number; tongTienHocPhi: number; tongDaThanhToan: number }>();
        for (const pack of allPacks) {
          const hvId = Number(pack.hocVienId);
          const s = packStats.get(hvId) ?? { tongSoBuoiDaMua: 0, tongTienHocPhi: 0, tongDaThanhToan: 0 };
          s.tongSoBuoiDaMua += Number(pack.soBuoi || 0);
          s.tongTienHocPhi += Number(pack.thanhTien || 0);
          s.tongDaThanhToan += Number(pack.daThanhToan || 0);
          packStats.set(hvId, s);
        }

        const attendanceStats = new Map<number, { tongSoBuoiDaHoc: number }>();
        for (const att of allAttendances) {
          const hvId = Number(att.hocVienId);
          const s = attendanceStats.get(hvId) ?? { tongSoBuoiDaHoc: 0 };
          s.tongSoBuoiDaHoc += 1;
          attendanceStats.set(hvId, s);
        }

        const bookStats = new Map<number, { tongTienSachDaPhat: number; tongTienSachDaNop: number }>();
        for (const b of allBooks) {
          const hvId = Number(b.hocVienId);
          const s = bookStats.get(hvId) ?? { tongTienSachDaPhat: 0, tongTienSachDaNop: 0 };
          const tien = Number(b.tienSach || 0) - Number(b.uuDai || 0);
          s.tongTienSachDaPhat += Math.max(0, tien);
          bookStats.set(hvId, s);
        }
        for (const np of allBookPayments) {
          const hvId = Number(np.hocVienId);
          const s = bookStats.get(hvId) ?? { tongTienSachDaPhat: 0, tongTienSachDaNop: 0 };
          s.tongTienSachDaNop += Number(np.soTien || 0);
          bookStats.set(hvId, s);
        }

        let soHocVienVuotGoi = 0;
        let soHocVienSapHet = 0;
        let soHocVienBinhThuong = 0;
        let tongCongNoHocPhi = 0;
        let tongCongNoSach = 0;

        const resultRows: any[] = [];

        for (const hv of allStudents) {
          const hvId = Number(hv.id);
          const lopIdNum = hv.lopId != null ? Number(hv.lopId) : null;
          const coSoIdNum = hv.coSoId != null ? Number(hv.coSoId) : null;

          const lop = lopIdNum != null ? classMap.get(lopIdNum) : null;
          const lopCoSoId = lop?.coSoId != null ? Number(lop.coSoId) : null;
          const coSo = lopCoSoId != null ? branchMap.get(lopCoSoId) : (coSoIdNum != null ? branchMap.get(coSoIdNum) : null);
          const ph = studentParentMap.get(hvId);

          const ps = packStats.get(hvId) ?? { tongSoBuoiDaMua: 0, tongTienHocPhi: 0, tongDaThanhToan: 0 };
          const asStat = attendanceStats.get(hvId) ?? { tongSoBuoiDaHoc: 0 };
          const bs = bookStats.get(hvId) ?? { tongTienSachDaPhat: 0, tongTienSachDaNop: 0 };

          const soBuoiConLai = Number(hv.soBuoiConLai || 0);
          const tongConNoHocPhi = Math.max(0, ps.tongTienHocPhi - ps.tongDaThanhToan);
          const tienSachTon = bs.tongTienSachDaNop - bs.tongTienSachDaPhat;
          const congNoSach = tienSachTon < 0 ? Math.abs(tienSachTon) : 0;

          if (soBuoiConLai < 0) soHocVienVuotGoi++;
          else if (soBuoiConLai <= 2) soHocVienSapHet++;
          else soHocVienBinhThuong++;

          tongCongNoHocPhi += tongConNoHocPhi;
          tongCongNoSach += congNoSach;

          if (search) {
            const q = search.toLowerCase();
            const matchName = String(hv.hoTen || '').toLowerCase().includes(q);
            const matchMa = String(hv.ma || '').toLowerCase().includes(q);
            const matchPhone = String(ph?.soDienThoai || '').includes(q);
            if (!matchName && !matchMa && !matchPhone) continue;
          }

          if (lopId && lopIdNum !== lopId) continue;
          if (coSoId && lopCoSoId !== coSoId && coSoIdNum !== coSoId) continue;

          if (trangThaiLoc === 'vuot_goi' && soBuoiConLai >= 0) continue;
          if (trangThaiLoc === 'sap_het' && (soBuoiConLai < 0 || soBuoiConLai > 2)) continue;
          if (trangThaiLoc === 'binh_thuong' && soBuoiConLai < 3) continue;
          if (trangThaiLoc === 'no_hoc_phi' && tongConNoHocPhi <= 0) continue;
          if (trangThaiLoc === 'no_sach' && congNoSach <= 0) continue;

          resultRows.push({
            id: hvId,
            ma: asText(hv.ma),
            hoTen: asText(hv.hoTen),
            lopId: lopIdNum,
            lopTen: lop ? asText(lop.ten) : null,
            coSoId: coSo ? Number(coSo.id) : null,
            coSoTen: coSo ? asText(coSo.ten) : null,
            phuHuynhTen: ph ? asText(ph.hoTen) : null,
            phuHuynhSdt: ph ? asText(ph.soDienThoai) : null,
            soBuoiConLai,
            soBuoiVuotGoi: soBuoiConLai < 0 ? Math.abs(soBuoiConLai) : 0,
            tongSoBuoiDaMua: ps.tongSoBuoiDaMua,
            tongSoBuoiDaHoc: asStat.tongSoBuoiDaHoc,
            tongTienHocPhi: ps.tongTienHocPhi,
            tongDaThanhToan: ps.tongDaThanhToan,
            tongConNoHocPhi,
            tongTienSachDaPhat: bs.tongTienSachDaPhat,
            tongTienSachDaNop: bs.tongTienSachDaNop,
            tienSachTon,
            congNoSach,
            trangThai: asText(hv.trangThai) || 'dang_hoc',
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
      needs('edu.hocVien', 'view'),
      apiValidator('json', ChiTietInput),
      async (c) => {
        const connection = database.connection();
        const { hocVienId } = c.req.valid('json');

        const hocVien = await connection.query
          .selectFrom('eduHocVien')
          .selectAll()
          .where('id', '=', hocVienId)
          .executeTakeFirst();
        if (!hocVien) throw eduError('NOT_FOUND', 'STUDENT_NOT_FOUND', 'Student not found');

        const [classes, branches, goiHocs, rawSessions, phatSachs, nopSachs, parentLinks, parents] = await Promise.all([
          connection.query.selectFrom('eduLop').select(['id', 'ten', 'coSoId']).execute(),
          connection.query.selectFrom('eduCoSo').select(['id', 'ten']).execute(),
          connection.query
            .selectFrom('eduGoiHoc')
            .selectAll()
            .where('hocVienId', '=', hocVienId)
            .orderBy('ngayMua', 'asc')
            .orderBy('id', 'asc')
            .execute(),
          connection.query
            .selectFrom('eduDiemDanh')
            .innerJoin('eduBuoiHoc', 'eduBuoiHoc.id', 'eduDiemDanh.buoiHocId')
            .leftJoin('eduLop', 'eduLop.id', 'eduBuoiHoc.lopId')
            .select([
              'eduDiemDanh.id as diemDanhId',
              'eduDiemDanh.buoiHocId',
              'eduDiemDanh.trangThai',
              'eduDiemDanh.daLamBtvn',
              'eduDiemDanh.nhanXet',
              'eduDiemDanh.soBuoiDaTru',
              'eduDiemDanh.yThucDiem',
              'eduBuoiHoc.ngay',
              'eduBuoiHoc.gioBatDau',
              'eduBuoiHoc.gioKetThuc',
              'eduBuoiHoc.lopId',
              'eduLop.ten as lopTen',
            ])
            .where('eduDiemDanh.hocVienId', '=', hocVienId)
            .orderBy('eduBuoiHoc.ngay', 'asc')
            .orderBy('eduBuoiHoc.gioBatDau', 'asc')
            .execute(),
          connection.query
            .selectFrom('eduPhatSach')
            .innerJoin('eduSach', 'eduSach.id', 'eduPhatSach.sachId')
            .select([
              'eduPhatSach.id',
              'eduPhatSach.sachId',
              'eduPhatSach.ngay',
              'eduPhatSach.uuDai',
              'eduPhatSach.tienSach',
              'eduPhatSach.ghiChu',
              'eduSach.ten as tenSach',
              'eduSach.giaBia',
            ])
            .where('eduPhatSach.hocVienId', '=', hocVienId)
            .orderBy('eduPhatSach.ngay', 'asc')
            .execute(),
          connection.query
            .selectFrom('eduNopSach')
            .selectAll()
            .where('hocVienId', '=', hocVienId)
            .orderBy('ngay', 'asc')
            .execute(),
          connection.query
            .selectFrom('eduHocVienPhuHuynh')
            .selectAll()
            .where('hocVienId', '=', hocVienId)
            .execute(),
          connection.query.selectFrom('eduPhuHuynh').selectAll().execute(),
        ]);

        const classMap = new Map(classes.map((cl) => [Number(cl.id), cl]));
        const branchMap = new Map(branches.map((b) => [Number(b.id), b]));
        const parentMap = new Map(parents.map((p) => [Number(p.id), p]));

        const lopIdNum = hocVien.lopId != null ? Number(hocVien.lopId) : null;
        const studentLop = lopIdNum != null ? classMap.get(lopIdNum) : null;
        const coSoIdNum = hocVien.coSoId != null ? Number(hocVien.coSoId) : (studentLop?.coSoId != null ? Number(studentLop.coSoId) : null);
        const studentCoSo = coSoIdNum != null ? branchMap.get(coSoIdNum) : null;

        let phuHuynhInfo: any = null;
        if (parentLinks.length > 0) {
          const ph = parentMap.get(Number(parentLinks[0].phuHuynhId));
          if (ph) {
            phuHuynhInfo = {
              id: Number(ph.id),
              hoTen: asText(ph.hoTen),
              soDienThoai: asText(ph.soDienThoai),
              email: ph.email ? asText(ph.email) : null,
              moiQuanHe: parentLinks[0].moiQuanHe ? asText(parentLinks[0].moiQuanHe) : null,
            };
          }
        }

        let tongSoBuoiDaMua = 0;
        let tongTienHocPhi = 0;
        let tongDaThanhToan = 0;

        const cacKyNop = goiHocs.map((g, index) => {
          const soBuoi = Number(g.soBuoi || 0);
          const thanhTien = Number(g.thanhTien || 0);
          const daThanhToan = Number(g.daThanhToan || 0);
          const conNo = Math.max(0, thanhTien - daThanhToan);
          tongSoBuoiDaMua += soBuoi;
          tongTienHocPhi += thanhTien;
          tongDaThanhToan += daThanhToan;

          return {
            id: Number(g.id),
            kySo: index + 1,
            tenKy: `Kỳ ${index + 1} (${soBuoi} buổi)`,
            ngayMua: asText(g.ngayMua) || '',
            soBuoi,
            donGia: Number(g.donGia || 0),
            thanhTien,
            daThanhToan,
            conNo,
            trangThai: conNo === 0 ? 'da_dong_du' : daThanhToan > 0 ? 'dong_mot_phan' : 'chua_dong',
          };
        });

        let accumulatedSessions = 0;
        let tongSoBuoiDaHoc = 0;
        let currentKyIdx = 0;
        let kyAccumulatedCapacity = cacKyNop.length > 0 ? cacKyNop[0].soBuoi : 0;

        const danhSachBuoiHoc = rawSessions.map((s, idx) => {
          tongSoBuoiDaHoc += 1;
          const ded = Number(s.soBuoiDaTru || 0) > 0 ? Number(s.soBuoiDaTru) : 0;
          accumulatedSessions += ded;

          while (currentKyIdx < cacKyNop.length - 1 && accumulatedSessions > kyAccumulatedCapacity) {
            currentKyIdx++;
            kyAccumulatedCapacity += cacKyNop[currentKyIdx].soBuoi;
          }

          const ngoaiGoi = cacKyNop.length === 0 || accumulatedSessions > kyAccumulatedCapacity;
          const ky = !ngoaiGoi && currentKyIdx < cacKyNop.length ? cacKyNop[currentKyIdx] : null;

          return {
            diemDanhId: Number(s.diemDanhId),
            buoiHocId: Number(s.buoiHocId),
            stt: idx + 1,
            buoiThu: accumulatedSessions,
            ngay: asText(s.ngay),
            gioBatDau: asText(s.gioBatDau),
            gioKetThuc: asText(s.gioKetThuc),
            lopId: s.lopId != null ? Number(s.lopId) : null,
            lopTen: s.lopTen ? asText(s.lopTen) : '—',
            trangThai: asText(s.trangThai),
            daLamBtvn: Boolean(s.daLamBtvn),
            yThucDiem: s.yThucDiem != null ? Number(s.yThucDiem) : null,
            nhanXet: s.nhanXet ? asText(s.nhanXet) : '',
            soBuoiDaTru: Number(s.soBuoiDaTru || 0),
            kyId: ky ? ky.id : null,
            kyTen: ky ? ky.tenKy : 'Vượt gói / Chưa nộp kỳ mới',
            ngoaiGoi,
          };
        });

        let usedSessions = 0;
        for (const ky of cacKyNop) {
          const sessionsInThisKy = Math.min(ky.soBuoi, Math.max(0, accumulatedSessions - usedSessions));
          usedSessions += sessionsInThisKy;
          (ky as any).daDung = sessionsInThisKy;
          (ky as any).conLai = ky.soBuoi - sessionsInThisKy;
          (ky as any).tienDo = ky.soBuoi > 0 ? Math.round((sessionsInThisKy / ky.soBuoi) * 100) : 0;
        }

        let tongTienSachDaPhat = 0;
        const sachDaPhat = phatSachs.map((ps) => {
          const giaBia = Number(ps.giaBia || ps.tienSach || 0);
          const uuDai = Number(ps.uuDai || 0);
          const thanhTien = Math.max(0, Number(ps.tienSach || 0) - uuDai);
          tongTienSachDaPhat += thanhTien;
          return {
            id: Number(ps.id),
            sachId: Number(ps.sachId),
            tenSach: asText(ps.tenSach),
            ngayPhat: asText(ps.ngay) || '',
            soLuong: 1,
            giaBia,
            uuDai,
            thanhTien,
            ghiChu: ps.ghiChu ? asText(ps.ghiChu) : '',
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
              id: Number(hocVien.id),
              ma: asText(hocVien.ma),
              hoTen: asText(hocVien.hoTen),
              lopId: lopIdNum,
              lopTen: studentLop ? asText(studentLop.ten) : null,
              coSoId: coSoIdNum,
              coSoTen: studentCoSo ? asText(studentCoSo.ten) : null,
              phuHuynh: phuHuynhInfo,
              soBuoiConLai,
              trangThai: asText(hocVien.trangThai) || 'dang_hoc',
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

    // 3. API Sửa nhanh một buổi học & Tự động tính toán lại số buổi còn lại
    router.post(
      '/doiSoat/capNhatBuoiHoc',
      declare('Quick edit session attendance and recalculate balance', 'quickEditSession'),
      needs('edu.diemDanh', 'record'),
      apiValidator('json', CapNhatBuoiHocInput),
      async (c) => {
        const connection = database.connection();
        const { diemDanhId, trangThai, daLamBtvn, yThucDiem, nhanXet } = c.req.valid('json');

        const record = await connection.query
          .selectFrom('eduDiemDanh')
          .selectAll()
          .where('id', '=', diemDanhId)
          .executeTakeFirst();
        if (!record) throw eduError('NOT_FOUND', 'RECORD_NOT_FOUND', 'Attendance record not found');

        const hocVienId = Number(record.hocVienId);
        const soBuoiDaTruMoi = sessionsToDeduct(trangThai, false, false);

        await connection.query
          .updateTable('eduDiemDanh')
          .set({
            trangThai,
            soBuoiDaTru: soBuoiDaTruMoi,
            daLamBtvn: daLamBtvn !== undefined ? (daLamBtvn ? 1 : 0) : record.daLamBtvn,
            yThucDiem: yThucDiem !== undefined ? yThucDiem : record.yThucDiem,
            nhanXet: nhanXet !== undefined ? nhanXet : record.nhanXet,
          })
          .where('id', '=', diemDanhId)
          .execute();

        const allPacks = await connection.query
          .selectFrom('eduGoiHoc')
          .select(['soBuoi'])
          .where('hocVienId', '=', hocVienId)
          .execute();

        const allAttendances = await connection.query
          .selectFrom('eduDiemDanh')
          .select(['soBuoiDaTru'])
          .where('hocVienId', '=', hocVienId)
          .execute();

        let tongMua = 0;
        for (const p of allPacks) {
          tongMua += Number(p.soBuoi || 0);
        }

        let tongTru = 0;
        for (const att of allAttendances) {
          tongTru += Number(att.soBuoiDaTru || 0);
        }

        const soBuoiConLaiMoi = tongMua - tongTru;

        await connection.query
          .updateTable('eduHocVien')
          .set({
            soBuoiConLai: soBuoiConLaiMoi,
          })
          .where('id', '=', hocVienId)
          .execute();

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

    return new Hono().route('/', router);
  }),
];
