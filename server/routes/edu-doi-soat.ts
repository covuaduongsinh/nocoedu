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
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { databaseManagerToken } from '@nocobase/db';
import type { RepositoryPolicy } from '@nocobase/db';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { lockSessionRule, saveAttendanceRow } from '../edu/balance.js';
import { anyOf } from '../edu/filters.js';
import { asText } from '../edu/names.js';
import { chunksOf, PAGE, readAllRows, type Row } from '../edu/read-all.js';
import { ATTENDANCE_STATUSES, asBoolean } from '../edu/so-du.js';
import {
  currentUserId,
  eduError,
  needs,
  policiesOf,
  policyOf,
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

    /** A policy the page needs: refused (403) when the caller does not hold the action. */
    async function required(
      c: Context<EduEnv>,
      resource: string,
      action: string,
      collection: string,
    ): Promise<RepositoryPolicy> {
      const policy = (await policiesOf(c, resource, action))[collection];
      if (!policy) {
        throw eduError(
          'PERMISSION_DENIED',
          'EDU_PERMISSION_DENIED',
          'This action is not allowed.',
        );
      }
      return policy;
    }

    /** A policy that only adds names (class, branch, parent, book): without it the names are left out. */
    async function optional(
      c: Context<EduEnv>,
      resource: string,
      collection: string,
    ): Promise<RepositoryPolicy | undefined> {
      try {
        return (await policiesOf(c, resource, 'view'))[collection];
      } catch (error) {
        if (error instanceof AuthorizationDeniedError) return undefined;
        throw error;
      }
    }

    const readIds = async (
      collection: string,
      policy: RepositoryPolicy | undefined,
      ids: readonly number[],
    ): Promise<Map<number, Row>> => {
      const map = new Map<number, Row>();
      if (!policy) return map;
      for (const part of chunksOf([...new Set(ids)], PAGE)) {
        for (const row of await readAllRows(
          database,
          collection,
          policy,
          anyOf('id', part),
          PAGE,
        )) {
          map.set(Number(row.id), row);
        }
      }
      return map;
    };

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
          totals.set(
            id,
            (totals.get(id) ?? 0) + Number((row)[column] ?? 0),
          );
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
        const { search, lopId, coSoId, trangThaiLoc } = c.req.valid('json');
        const studentPolicy = policyOf(c, 'eduHocVien');
        // The page is about money: a role without the tuition, payment, book and attendance actions gets 403.
        const packPolicy = await required(c, 'edu.goiHoc', 'view', 'eduGoiHoc');
        const payPolicy = await required(
          c,
          'edu.thanhToan',
          'view',
          'eduThanhToan',
        );
        const bookPolicy = await required(
          c,
          'edu.phatSach',
          'view',
          'eduPhatSach',
        );
        await required(c, 'edu.diemDanh', 'view', 'eduDiemDanh');
        const classPolicy = await optional(c, 'edu.lop', 'eduLop');
        const branchPolicy = await optional(c, 'edu.coSo', 'eduCoSo');
        const linkPolicy = await optional(
          c,
          'edu.lienKet',
          'eduHocVienPhuHuynh',
        );
        const parentPolicy = await optional(c, 'edu.phuHuynh', 'eduPhuHuynh');

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
          const parents = await readIds(
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

          if (soBuoiConLai < 0) soHocVienVuotGoi++;
          else if (soBuoiConLai <= 2) soHocVienSapHet++;
          else soHocVienBinhThuong++;
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
          if (trangThaiLoc === 'vuot_goi' && soBuoiConLai >= 0) continue;
          if (
            trangThaiLoc === 'sap_het' &&
            (soBuoiConLai < 0 || soBuoiConLai > 2)
          )
            continue;
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
      declare(
        'Get detailed audit data for one student',
        'getStudentAuditDetail',
      ),
      needs('edu.hocVien', 'view'),
      apiValidator('json', ChiTietInput),
      async (c) => {
        const { hocVienId } = c.req.valid('json');
        const studentPolicy = policyOf(c, 'eduHocVien');
        const packPolicy = await required(c, 'edu.goiHoc', 'view', 'eduGoiHoc');
        const payPolicy = await required(
          c,
          'edu.thanhToan',
          'view',
          'eduThanhToan',
        );
        const bookPolicy = await required(
          c,
          'edu.phatSach',
          'view',
          'eduPhatSach',
        );
        const attendancePolicy = await required(
          c,
          'edu.diemDanh',
          'view',
          'eduDiemDanh',
        );
        const sessionPolicy = await required(
          c,
          'edu.buoiHoc',
          'view',
          'eduBuoiHoc',
        );
        const classPolicy = await optional(c, 'edu.lop', 'eduLop');
        const branchPolicy = await optional(c, 'edu.coSo', 'eduCoSo');
        const linkPolicy = await optional(
          c,
          'edu.lienKet',
          'eduHocVienPhuHuynh',
        );
        const parentPolicy = await optional(c, 'edu.phuHuynh', 'eduPhuHuynh');
        const catalogPolicy = await optional(c, 'edu.sach', 'eduSach');

        // The student must be one the caller sees; anything else is "not found".
        const hocVien = await database
          .repository('eduHocVien')
          .withPolicy(studentPolicy)
          .findOne({ filter: { id: hocVienId } });
        if (!hocVien) throw studentNotFound();

        const ofStudent = anyOf('hocVienId', [hocVienId]);
        const [goiHocs, allPayments, phatSachs, links, marks] =
          await Promise.all([
            readAllRows(database, 'eduGoiHoc', packPolicy, ofStudent, 5000),
            readAllRows(database, 'eduThanhToan', payPolicy, ofStudent, 5000),
            readAllRows(database, 'eduPhatSach', bookPolicy, ofStudent, 5000),
            linkPolicy
              ? readAllRows(
                  database,
                  'eduHocVienPhuHuynh',
                  linkPolicy,
                  ofStudent,
                  200,
                )
              : Promise.resolve<Row[]>([]),
            readAllRows(
              database,
              'eduDiemDanh',
              attendancePolicy,
              ofStudent,
              MAX_ROWS,
            ),
          ]);
        goiHocs.sort(
          (a, b) =>
            asText(a.ngayMua).localeCompare(asText(b.ngayMua)) ||
            Number(a.id) - Number(b.id),
        );
        allPayments.sort((a, b) =>
          asText(a.ngay).localeCompare(asText(b.ngay)),
        );

        const sessions = await readIds(
          'eduBuoiHoc',
          sessionPolicy,
          marks.map((m) => Number(m.buoiHocId)),
        );
        const classes = await readIds(
          'eduLop',
          classPolicy,
          [
            ...sessions.values(),
            ...(hocVien.lopId != null ? [{ lopId: hocVien.lopId }] : []),
          ].map((s) => Number(s.lopId)),
        );
        const branches = await readIds(
          'eduCoSo',
          branchPolicy,
          hocVien.coSoId != null ? [Number(hocVien.coSoId)] : [],
        );
        const catalog = await readIds(
          'eduSach',
          catalogPolicy,
          phatSachs.map((p) => Number(p.sachId)),
        );
        const parents = await readIds(
          'eduPhuHuynh',
          parentPolicy,
          links.map((l) => Number(l.phuHuynhId)),
        );

        // The awareness score is not a permission field: it is read for the attendance rows the policy returned.
        const q = database.connection().query;
        const scores = new Map<number, number>();
        for (const part of chunksOf(
          marks.map((m) => Number(m.id)),
          200,
        )) {
          for (const row of await q
            .selectFrom('eduDiemDanh')
            .select(['id', 'yThucDiem'])
            .where('id', 'in', part)
            .execute()) {
            if (row.yThucDiem != null) {
              scores.set(Number(row.id), Number(row.yThucDiem));
            }
          }
        }
        const nopSachs = await q
          .selectFrom('eduNopSach')
          .select(['soTien'])
          .where('hocVienId', '=', hocVienId)
          .execute();

        const rawSessions = marks
          .flatMap((mark) => {
            const session = sessions.get(Number(mark.buoiHocId));
            return session ? [{ mark, session }] : [];
          })
          .sort(
            (a, b) =>
              asText(a.session.ngay).localeCompare(asText(b.session.ngay)) ||
              asText(a.session.gioBatDau).localeCompare(
                asText(b.session.gioBatDau),
              ),
          );

        const lopIdNum = hocVien.lopId != null ? Number(hocVien.lopId) : null;
        const studentLop = lopIdNum != null ? classes.get(lopIdNum) : undefined;
        const coSoIdNum =
          hocVien.coSoId != null
            ? Number(hocVien.coSoId)
            : studentLop?.coSoId != null
              ? Number(studentLop.coSoId)
              : null;
        const studentCoSo =
          coSoIdNum != null ? branches.get(coSoIdNum) : undefined;

        let phuHuynhInfo: Record<string, unknown> | null = null;
        const firstLink = links[0];
        if (firstLink) {
          const ph = parents.get(Number(firstLink.phuHuynhId));
          if (ph) {
            phuHuynhInfo = {
              id: Number(ph.id),
              hoTen: asText(ph.hoTen),
              soDienThoai: asText(ph.soDienThoai),
              // A parent has no e-mail address in NocoEdu; the field stays for the page.
              email: null,
              moiQuanHe: firstLink.quanHe ? asText(firstLink.quanHe) : null,
            };
          }
        }

        const paidByGoiHoc = new Map<number, number>();
        let unallocatedPayment = 0;
        for (const pm of allPayments) {
          const st = Number(pm.soTien || 0);
          if (pm.goiHocId != null && Number(pm.goiHocId) > 0) {
            const gid = Number(pm.goiHocId);
            paidByGoiHoc.set(gid, (paidByGoiHoc.get(gid) ?? 0) + st);
          } else {
            unallocatedPayment += st;
          }
        }

        let tongSoBuoiDaMua = 0;
        let tongTienHocPhi = 0;
        let tongDaThanhToan = 0;

        const cacKyNop = goiHocs.map((g, index) => {
          const gId = Number(g.id);
          const soBuoi = Number(g.soBuoi || 0);
          const thanhTien = Number(g.thanhTien || 0);
          let daThanhToan = paidByGoiHoc.get(gId) ?? 0;
          if (daThanhToan < thanhTien && unallocatedPayment > 0) {
            const diff = Math.min(thanhTien - daThanhToan, unallocatedPayment);
            daThanhToan += diff;
            unallocatedPayment -= diff;
          }
          const conNo = Math.max(0, thanhTien - daThanhToan);
          tongSoBuoiDaMua += soBuoi;
          tongTienHocPhi += thanhTien;
          tongDaThanhToan += daThanhToan;

          return {
            id: gId,
            kySo: index + 1,
            tenKy: `Kỳ ${index + 1} (${soBuoi} buổi)`,
            ngayMua: asText(g.ngayMua) || '',
            soBuoi,
            donGia: Number(g.donGia || 0),
            thanhTien,
            daThanhToan,
            conNo,
            trangThai:
              conNo === 0
                ? 'da_dong_du'
                : daThanhToan > 0
                  ? 'dong_mot_phan'
                  : 'chua_dong',
            daDung: 0,
            conLai: soBuoi,
            tienDo: 0,
          };
        });
        tongDaThanhToan += unallocatedPayment;

        let accumulatedSessions = 0;
        let currentKyIdx = 0;
        let kyAccumulatedCapacity = cacKyNop[0]?.soBuoi ?? 0;

        const danhSachBuoiHoc = rawSessions.map(({ mark, session }, idx) => {
          accumulatedSessions += Math.max(0, Number(mark.soBuoiDaTru || 0));
          while (
            currentKyIdx < cacKyNop.length - 1 &&
            accumulatedSessions > kyAccumulatedCapacity
          ) {
            currentKyIdx++;
            kyAccumulatedCapacity += cacKyNop[currentKyIdx]?.soBuoi ?? 0;
          }
          const ngoaiGoi =
            cacKyNop.length === 0 ||
            accumulatedSessions > kyAccumulatedCapacity;
          const ky =
            !ngoaiGoi && currentKyIdx < cacKyNop.length
              ? cacKyNop[currentKyIdx]
              : null;
          const lop = classes.get(Number(session.lopId));
          const score = scores.get(Number(mark.id));
          return {
            diemDanhId: Number(mark.id),
            buoiHocId: Number(mark.buoiHocId),
            stt: idx + 1,
            buoiThu: accumulatedSessions,
            ngay: asText(session.ngay),
            gioBatDau: asText(session.gioBatDau),
            gioKetThuc: asText(session.gioKetThuc),
            lopId: session.lopId != null ? Number(session.lopId) : null,
            lopTen: lop ? asText(lop.ten) : '—',
            trangThai: asText(mark.trangThai),
            daLamBtvn: asBoolean(mark.daLamBtvn),
            yThucDiem: score ?? null,
            nhanXet: mark.nhanXet ? asText(mark.nhanXet) : '',
            soBuoiDaTru: Number(mark.soBuoiDaTru || 0),
            kyId: ky ? ky.id : null,
            kyTen: ky ? ky.tenKy : 'Vượt gói / Chưa nộp kỳ mới',
            ngoaiGoi,
          };
        });
        // "Sessions studied" is what was deducted, the same figure the balance is made of.
        const tongSoBuoiDaHoc = accumulatedSessions;

        let usedSessions = 0;
        for (const ky of cacKyNop) {
          const sessionsInThisKy = Math.min(
            ky.soBuoi,
            Math.max(0, accumulatedSessions - usedSessions),
          );
          usedSessions += sessionsInThisKy;
          ky.daDung = sessionsInThisKy;
          ky.conLai = ky.soBuoi - sessionsInThisKy;
          ky.tienDo =
            ky.soBuoi > 0
              ? Math.round((sessionsInThisKy / ky.soBuoi) * 100)
              : 0;
        }

        // `tienSach` is already net of the discount (`tienSach = giaBan - uuDai`).
        let tongTienSachDaPhat = 0;
        const sachDaPhat = phatSachs
          .sort((a, b) => asText(a.ngay).localeCompare(asText(b.ngay)))
          .map((ps) => {
            const book = catalog.get(Number(ps.sachId));
            const uuDai = Number(ps.uuDai || 0);
            const thanhTien = Math.max(0, Number(ps.tienSach || 0));
            tongTienSachDaPhat += thanhTien;
            return {
              id: Number(ps.id),
              sachId: Number(ps.sachId),
              tenSach: book ? asText(book.ten) : '',
              ngayPhat: asText(ps.ngay) || '',
              soLuong: 1,
              giaBia: Number(book?.giaBia ?? thanhTien + uuDai),
              uuDai,
              thanhTien,
              ghiChu: ps.ghiChu ? asText(ps.ghiChu) : '',
            };
          });
        const tongTienSachDaNop = nopSachs.reduce(
          (sum, ns) => sum + Number(ns.soTien || 0),
          0,
        );
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

    // 3. API Sửa nhanh một buổi học: the balance moves by the difference only, with the rule fixed on the session.
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
        const studentPolicy = await required(
          c,
          'edu.hocVien',
          'view',
          'eduHocVien',
        );
        const sessionPolicy = await required(
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
