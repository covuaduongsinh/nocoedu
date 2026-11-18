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

import { lockSessionRule, saveAttendanceRow } from '../edu/balance.js';
import { balanceBand, isStudying } from '../edu/can-thu.js';
import { asText } from '../edu/names.js';
import {
  chunksOf,
  readAllRows,
  readRowsByIds,
  type Row,
} from '../edu/read-all.js';
import { ATTENDANCE_STATUSES, asBoolean } from '../edu/so-du.js';
import {
  currentUserId,
  eduError,
  needs,
  optionalPolicy,
  policyOf,
  requiredPolicy,
  type EduEnv,
} from './edu-support.js';

/**
 * Reconciliation of sessions, tuition and books (the "Đối soát" page).
 *
 * Everything is read through the policies of the composite actions that own the data, so a branch manager sees their
 * branches and nothing else: students (`edu.hocVien`), packages (`edu.goiHoc`), payments (`edu.thanhToan`), books handed
 * out (`edu.phatSach`), attendance (`edu.diemDanh`), sessions (`edu.buoiHoc`), and, when the caller holds them, classes,
 * branches, parents and the book catalogue. A caller without the money actions (a coach) is refused. Only sums over rows of
 * students the policy already returned are read directly (the sessions deducted, the book money paid: that table and the
 * awareness score are not permission fields).
 *
 * The page is the table of the whole centre only: one student's detail is the student file (`/hocVien/hoSo360`, in
 * `edu-ho-so.ts`). The list is read page by page (`trang`, `limit`); the counters (`thongKe`) cover everything the caller
 * sees, whatever the filter. A balance is put in its band by `server/edu/can-thu.ts`, the same module the "Cần thu" tab
 * and the home warning use, so the three agree on who is low and on the threshold.
 *
 * "Sessions studied" is the sum of `soBuoiDaTru` over the attendance rows, everywhere on the page: the same number the
 * balance is made of (a make-up session or an excused absence that is not deducted does not count).
 */
function normalizeSearchText(str: unknown): string {
  if (typeof str !== 'string' && typeof str !== 'number') return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

const Id = z.coerce.number().int().positive();

const TongQuanInput = z.object({
  search: z.string().trim().nullish(),
  lopId: Id.nullish(),
  coSoId: Id.nullish(),
  trangThaiLoc: z
    .enum([
      'tat_ca',
      'vuot_goi',
      'sap_het',
      'binh_thuong',
      'no_hoc_phi',
      'no_sach',
    ])
    .default('tat_ca'),
  trang: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
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

/** The most rows of one collection the page reads (the whole list of one centre is far below it). */
const MAX_ROWS = 100_000;

const studentNotFound = () =>
  eduError('NOT_FOUND', 'EDU_STUDENT_NOT_FOUND', 'Student not found');

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    for (const path of ['/doiSoat/tongQuan', '/doiSoat/capNhatBuoiHoc']) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 64 * 1024 }),
      );
    }

    /** The money of a student that is not covered by a permission composite: sums only over ids a policy returned. */
    const sumBy = async (
      table: 'eduDiemDanh' | 'eduNopSach',
      column: 'soBuoiDaTru' | 'soTien',
      studentIds: readonly number[],
    ): Promise<Map<number, number>> => {
      const totals = new Map<number, number>();
      const q = database.connection().query;
      for (const part of chunksOf(studentIds, 500)) {
        const rows = await q
          .selectFrom(table as 'eduDiemDanh')
          .select(['hocVienId', column as 'soBuoiDaTru'])
          .where('hocVienId', 'in', part)
          .execute();
        for (const row of rows) {
          const id = Number(row.hocVienId);
          totals.set(id, (totals.get(id) ?? 0) + Number(row[column] ?? 0));
        }
      }
      return totals;
    };

    // 1. API Tổng quan đối soát toàn trung tâm
    router.post(
      '/doiSoat/tongQuan',
      declare('Get audit overview for all students', 'getAuditOverview'),
      needs('edu.hocVien', 'view'),
      apiValidator('json', TongQuanInput),
      async (c) => {
        const { search, lopId, coSoId, trangThaiLoc, trang, limit } =
          c.req.valid('json');
        const studentPolicy = policyOf(c, 'eduHocVien');
        // The page is about money: a role without the tuition, payment, book and attendance actions gets 403.
        const packPolicy = await requiredPolicy(
          c,
          'edu.goiHoc',
          'view',
          'eduGoiHoc',
        );
        const payPolicy = await requiredPolicy(
          c,
          'edu.thanhToan',
          'view',
          'eduThanhToan',
        );
        const bookPolicy = await requiredPolicy(
          c,
          'edu.phatSach',
          'view',
          'eduPhatSach',
        );
        await requiredPolicy(c, 'edu.diemDanh', 'view', 'eduDiemDanh');
        const classPolicy = await optionalPolicy(
          c,
          'edu.lop',
          'view',
          'eduLop',
        );
        const branchPolicy = await optionalPolicy(
          c,
          'edu.coSo',
          'view',
          'eduCoSo',
        );
        const linkPolicy = await optionalPolicy(
          c,
          'edu.lienKet',
          'view',
          'eduHocVienPhuHuynh',
        );
        const parentPolicy = await optionalPolicy(
          c,
          'edu.phuHuynh',
          'view',
          'eduPhuHuynh',
        );

        const allStudents = await readAllRows(
          database,
          'eduHocVien',
          studentPolicy,
          undefined,
          MAX_ROWS,
        );
        const studentIds = allStudents.map((s) => Number(s.id));
        const [classes, branches, allPacks, allPayments, allBooks] =
          await Promise.all([
            classPolicy
              ? readAllRows(database, 'eduLop', classPolicy, undefined, 5000)
              : Promise.resolve<Row[]>([]),
            branchPolicy
              ? readAllRows(database, 'eduCoSo', branchPolicy, undefined, 1000)
              : Promise.resolve<Row[]>([]),
            readAllRows(database, 'eduGoiHoc', packPolicy, undefined, MAX_ROWS),
            readAllRows(
              database,
              'eduThanhToan',
              payPolicy,
              undefined,
              MAX_ROWS,
            ),
            readAllRows(
              database,
              'eduPhatSach',
              bookPolicy,
              undefined,
              MAX_ROWS,
            ),
          ]);
        const deducted = await sumBy('eduDiemDanh', 'soBuoiDaTru', studentIds);
        const bookPaid = await sumBy('eduNopSach', 'soTien', studentIds);

        // The first parent of each student the caller may see.
        const studentParentMap = new Map<number, Row>();
        if (linkPolicy && parentPolicy) {
          const links = await readAllRows(
            database,
            'eduHocVienPhuHuynh',
            linkPolicy,
            undefined,
            MAX_ROWS,
          );
          const parents = await readRowsByIds(
            database,
            'eduPhuHuynh',
            parentPolicy,
            links.map((l) => Number(l.phuHuynhId)),
          );
          for (const link of links) {
            const hvId = Number(link.hocVienId);
            const parent = parents.get(Number(link.phuHuynhId));
            if (parent && !studentParentMap.has(hvId))
              studentParentMap.set(hvId, parent);
          }
        }

        const classMap = new Map(classes.map((cl) => [Number(cl.id), cl]));
        const branchMap = new Map(branches.map((b) => [Number(b.id), b]));

        const paymentMap = new Map<number, number>();
        for (const p of allPayments) {
          const hvId = Number(p.hocVienId);
          paymentMap.set(
            hvId,
            (paymentMap.get(hvId) ?? 0) + Number(p.soTien || 0),
          );
        }
        const packStats = new Map<
          number,
          { tongSoBuoiDaMua: number; tongTienHocPhi: number }
        >();
        for (const pack of allPacks) {
          const hvId = Number(pack.hocVienId);
          const s = packStats.get(hvId) ?? {
            tongSoBuoiDaMua: 0,
            tongTienHocPhi: 0,
          };
          s.tongSoBuoiDaMua += Number(pack.soBuoi || 0);
          s.tongTienHocPhi += Number(pack.thanhTien || 0);
          packStats.set(hvId, s);
        }
        // `tienSach` is already net of the discount (`tienSach = giaBan - uuDai`, see `/phatSach/ghi`).
        const bookGiven = new Map<number, number>();
        for (const b of allBooks) {
          const hvId = Number(b.hocVienId);
          bookGiven.set(
            hvId,
            (bookGiven.get(hvId) ?? 0) + Number(b.tienSach || 0),
          );
        }

        let soHocVienVuotGoi = 0;
        let soHocVienSapHet = 0;
        let soHocVienBinhThuong = 0;
        let tongCongNoHocPhi = 0;
        let tongCongNoSach = 0;
        const resultRows: Record<string, unknown>[] = [];
        const needle = search ? normalizeSearchText(search) : '';

        for (const hv of allStudents) {
          const hvId = Number(hv.id);
          const lopIdNum = hv.lopId != null ? Number(hv.lopId) : null;
          const coSoIdNum = hv.coSoId != null ? Number(hv.coSoId) : null;
          const lop = lopIdNum != null ? classMap.get(lopIdNum) : undefined;
          const lopCoSoId = lop?.coSoId != null ? Number(lop.coSoId) : null;
          const coSo =
            lopCoSoId != null
              ? branchMap.get(lopCoSoId)
              : coSoIdNum != null
                ? branchMap.get(coSoIdNum)
                : undefined;
          const ph = studentParentMap.get(hvId);

          const packs = packStats.get(hvId) ?? {
            tongSoBuoiDaMua: 0,
            tongTienHocPhi: 0,
          };
          const tongDaThanhToan = paymentMap.get(hvId) ?? 0;
          const tongTienSachDaPhat = bookGiven.get(hvId) ?? 0;
          const tongTienSachDaNop = bookPaid.get(hvId) ?? 0;

          const soBuoiConLai = Number(hv.soBuoiConLai || 0);
          const tongConNoHocPhi = Math.max(
            0,
            packs.tongTienHocPhi - tongDaThanhToan,
          );
          const tienSachTon = tongTienSachDaNop - tongTienSachDaPhat;
          const congNoSach = tienSachTon < 0 ? Math.abs(tienSachTon) : 0;

          // The bands count the students who are studying: those who left are not chased for a next term.
          const band = balanceBand(soBuoiConLai);
          const studying = isStudying(hv);
          if (studying) {
            if (band === 'vuot_goi') soHocVienVuotGoi++;
            else if (band === 'sap_het') soHocVienSapHet++;
            else soHocVienBinhThuong++;
          }
          tongCongNoHocPhi += tongConNoHocPhi;
          tongCongNoSach += congNoSach;

          if (needle) {
            const matchName = normalizeSearchText(hv.hoTen).includes(needle);
            const matchMa = normalizeSearchText(hv.ma).includes(needle);
            const matchPhone = asText(ph?.soDienThoai).includes(needle);
            if (!matchName && !matchMa && !matchPhone) continue;
          }
          if (lopId && lopIdNum !== lopId) continue;
          if (coSoId && lopCoSoId !== coSoId && coSoIdNum !== coSoId) continue;
          if (
            (trangThaiLoc === 'vuot_goi' ||
              trangThaiLoc === 'sap_het' ||
              trangThaiLoc === 'binh_thuong') &&
            (!studying || band !== trangThaiLoc)
          )
            continue;
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
            tongSoBuoiDaMua: packs.tongSoBuoiDaMua,
            tongSoBuoiDaHoc: deducted.get(hvId) ?? 0,
            tongTienHocPhi: packs.tongTienHocPhi,
            tongDaThanhToan,
            tongConNoHocPhi,
            tongTienSachDaPhat,
            tongTienSachDaNop,
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
              soHocVienCanThu: soHocVienVuotGoi + soHocVienSapHet,
              tongCongNoHocPhi,
              tongCongNoSach,
            },
            tong: resultRows.length,
            trang,
            limit,
            danhSach: resultRows.slice((trang - 1) * limit, trang * limit),
          },
        });
      },
    );

    // 2. API Sửa nhanh một buổi học: the balance moves by the difference only, with the rule fixed on the session.
    router.post(
      '/doiSoat/capNhatBuoiHoc',
      declare(
        'Quick edit session attendance and recalculate balance',
        'quickEditSession',
      ),
      needs('edu.diemDanh', 'record'),
      apiValidator('json', CapNhatBuoiHocInput),
      async (c) => {
        const { diemDanhId, trangThai, daLamBtvn, yThucDiem, nhanXet } =
          c.req.valid('json');
        const userId = currentUserId(c);
        const attendancePolicy = policyOf(c, 'eduDiemDanh');
        const studentPolicy = await requiredPolicy(
          c,
          'edu.hocVien',
          'view',
          'eduHocVien',
        );
        const sessionPolicy = await requiredPolicy(
          c,
          'edu.buoiHoc',
          'view',
          'eduBuoiHoc',
        );
        const notFound = () =>
          eduError(
            'NOT_FOUND',
            'EDU_ATTENDANCE_NOT_FOUND',
            'Attendance record not found',
          );
        const result = await database.transaction(async (connection) => {
          // The row, its student and its session must all be in the caller's scope.
          const record = await connection
            .repository('eduDiemDanh')
            .withPolicy(attendancePolicy)
            .findOne({ filter: { id: diemDanhId } });
          if (!record) throw notFound();
          const hocVienId = Number(record.hocVienId);
          const student = await connection
            .repository('eduHocVien')
            .withPolicy(studentPolicy)
            .findOne({ filter: { id: hocVienId } });
          if (!student) throw studentNotFound();
          const session = await connection
            .repository('eduBuoiHoc')
            .withPolicy(sessionPolicy)
            .findOne({ filter: { id: Number(record.buoiHocId) } });
          if (!session) throw notFound();
          const lop = await connection.query
            .selectFrom('eduLop')
            .select('coSoId')
            .where('id', '=', Number(session.lopId))
            .executeTakeFirstOrThrow();
          const rule = await lockSessionRule(
            connection,
            Number(record.buoiHocId),
            Number(lop.coSoId),
          );
          const saved = await saveAttendanceRow(
            connection,
            attendancePolicy,
            {
              buoiHocId: Number(record.buoiHocId),
              hocVienId,
              trangThai,
              daLamBtvn:
                daLamBtvn !== undefined
                  ? daLamBtvn
                  : asBoolean(record.daLamBtvn),
              nhanXet:
                nhanXet !== undefined
                  ? nhanXet
                  : record.nhanXet == null
                    ? null
                    : asText(record.nhanXet),
            },
            rule,
            userId,
          );
          if (yThucDiem !== undefined) {
            // The awareness score is not a permission field; the row above was checked against the caller's scope.
            await connection.query
              .updateTable('eduDiemDanh')
              .set({ yThucDiem })
              .where('id', '=', diemDanhId)
              .execute();
          }
          return { hocVienId, saved };
        });
        return c.json({
          data: {
            success: true,
            diemDanhId,
            hocVienId: result.hocVienId,
            soBuoiDaTru: result.saved.soBuoiDaTru,
            soBuoiConLaiMoi: result.saved.soBuoiConLai,
          },
        });
      },
    );

    return new Hono().route('/', router);
  }),
];
