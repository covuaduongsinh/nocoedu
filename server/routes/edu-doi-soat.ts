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
import { databaseManagerToken, type RepositoryPolicy } from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { saveAttendance } from '../edu/ghi-so-du.js';
import { asText } from '../edu/names.js';
import { asBoolean, ATTENDANCE_STATUSES } from '../edu/so-du.js';
import {
  currentUserId,
  eduError,
  needs,
  optionalPoliciesOf,
  policiesOf,
  policyOf,
  type EduEnv,
} from './edu-support.js';

/**
 * Reconciliation of sessions, tuition and books.
 *
 * The page lists students, so `edu.hocVien` `view` opens it and decides which students show. Every other kind of data
 * is added only when the caller also holds the action that guards it, and is read through that action's policy or
 * summed over the students the student policy returned (`.agents/rules/edu.md`, "Reports and exports"): a coach sees
 * the sessions of their own students and no money or parent phone number. `quyen` tells the page which parts it got.
 *
 * Correcting one attendance row goes through `saveAttendance`, like the register itself: the session's own deduction
 * rule, the ledger row and the guarded balance move, in one transaction.
 */
function normalizeSearchText(str: unknown): string {
  if (!str) return '';
  return asText(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .toLowerCase()
    .trim();
}

const Id = z.coerce.number().int().positive();

const TongQuanInput = z.object({
  search: z.string().trim().max(100).nullish(),
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
  // `eduDiemDanh.nhanXet` holds 500 characters.
  nhanXet: z.string().trim().max(500).nullish(),
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

type Row = Record<string, unknown>;
type Policies = Readonly<Record<string, RepositoryPolicy>> | null;

const PAGE = 100;
/** The page covers at most this many rows of one kind; more is refused instead of showing a short list. */
const MAX_ROWS = 5000;
const PRESENT = new Set(['co_mat', 'hoc_bu']);
const num = (value: unknown): number => Number(value || 0);

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
};

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();
    const q = () => database.connection().query;

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

    /** Every row the policy lets through (of one student when `hocVienId` is given), page by page. */
    async function readAll(
      collection: string,
      policy: RepositoryPolicy,
      hocVienId?: number,
    ): Promise<Row[]> {
      const repository = database.repository(collection).withPolicy(policy);
      const rows: Row[] = [];
      for (let offset = 0; offset <= MAX_ROWS; offset += PAGE) {
        const page = (await repository.findMany({
          ...(hocVienId === undefined
            ? {}
            : { filter: (f) => f.number('hocVienId').eq(hocVienId) }),
          sort: (s) => s.field('id').asc(),
          limit: PAGE,
          offset,
        })) as Row[];
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      if (rows.length > MAX_ROWS) {
        throw eduError(
          'FAILED_PRECONDITION',
          'EDU_REPORT_TOO_LARGE',
          'The reconciliation covers too many records. Narrow it to one branch or class.',
        );
      }
      return rows;
    }

    /** What the caller may see besides the students themselves. */
    async function partsOf(c: Parameters<typeof policiesOf>[0]): Promise<{
      packages: Policies;
      payments: Policies;
      attendance: Policies;
      books: Policies;
      parents: Policies;
      links: Policies;
    }> {
      const [packages, payments, attendance, books, parents, links] =
        await Promise.all([
          optionalPoliciesOf(c, 'edu.goiHoc', 'view'),
          optionalPoliciesOf(c, 'edu.thanhToan', 'view'),
          optionalPoliciesOf(c, 'edu.diemDanh', 'view'),
          optionalPoliciesOf(c, 'edu.phatSach', 'view'),
          optionalPoliciesOf(c, 'edu.phuHuynh', 'view'),
          optionalPoliciesOf(c, 'edu.lienKet', 'view'),
        ]);
      return { packages, payments, attendance, books, parents, links };
    }

    async function names(
      table: 'eduLop' | 'eduCoSo',
      ids: readonly number[],
    ): Promise<Map<number, Row>> {
      const map = new Map<number, Row>();
      for (const part of chunks([...new Set(ids)], 200)) {
        const rows = await q()
          .selectFrom(table)
          .select(table === 'eduLop' ? ['id', 'ten', 'coSoId'] : ['id', 'ten'])
          .where('id', 'in', part)
          .execute();
        for (const row of rows) map.set(num(row.id), row);
      }
      return map;
    }

    // 1. Overview of every student the caller sees
    router.post(
      '/doiSoat/tongQuan',
      declare('Get audit overview for all students', 'getAuditOverview'),
      needs('edu.hocVien', 'view'),
      apiValidator('json', TongQuanInput),
      async (c) => {
        const { search, lopId, coSoId, trangThaiLoc } = c.req.valid('json');
        const may = await partsOf(c);
        const mayMoney = Boolean(
          may.packages?.eduGoiHoc && may.payments?.eduThanhToan,
        );
        const mayBooks = Boolean(may.books?.eduPhatSach);
        const mayParents = Boolean(
          may.parents?.eduPhuHuynh && may.links?.eduHocVienPhuHuynh,
        );

        const students = await readAll('eduHocVien', policyOf(c, 'eduHocVien'));
        const studentIds = students.map((s) => num(s.id));
        const visible = new Set(studentIds);

        const classMap = await names(
          'eduLop',
          students.filter((s) => s.lopId != null).map((s) => num(s.lopId)),
        );
        const branchMap = await names(
          'eduCoSo',
          students.map((s) => num(s.coSoId)),
        );

        const packStats = new Map<
          number,
          { tongSoBuoiDaMua: number; tongTienHocPhi: number }
        >();
        if (may.packages?.eduGoiHoc) {
          for (const pack of await readAll(
            'eduGoiHoc',
            may.packages.eduGoiHoc,
          )) {
            const id = num(pack.hocVienId);
            if (!visible.has(id)) continue;
            const s = packStats.get(id) ?? {
              tongSoBuoiDaMua: 0,
              tongTienHocPhi: 0,
            };
            s.tongSoBuoiDaMua += num(pack.soBuoi);
            s.tongTienHocPhi += num(pack.thanhTien);
            packStats.set(id, s);
          }
        }
        const paid = new Map<number, number>();
        if (mayMoney && may.payments?.eduThanhToan) {
          for (const p of await readAll(
            'eduThanhToan',
            may.payments.eduThanhToan,
          )) {
            const id = num(p.hocVienId);
            if (!visible.has(id)) continue;
            paid.set(id, (paid.get(id) ?? 0) + num(p.soTien));
          }
        }

        // Attendance is summed over the students the student policy returned, never over the whole table.
        const attended = new Map<number, number>();
        if (may.attendance?.eduDiemDanh) {
          for (const part of chunks(studentIds, 200)) {
            const rows = await q()
              .selectFrom('eduDiemDanh')
              .select(['hocVienId', 'trangThai'])
              .where('hocVienId', 'in', part)
              .execute();
            for (const row of rows) {
              if (!PRESENT.has(asText(row.trangThai))) continue;
              const id = num(row.hocVienId);
              attended.set(id, (attended.get(id) ?? 0) + 1);
            }
          }
        }

        const bookGiven = new Map<number, number>();
        const bookPaid = new Map<number, number>();
        if (mayBooks) {
          for (const part of chunks(studentIds, 200)) {
            const given = await q()
              .selectFrom('eduPhatSach')
              .select(['hocVienId', 'tienSach'])
              .where('hocVienId', 'in', part)
              .execute();
            // `tienSach` is already the price minus the discount (`/phatSach/ghi`).
            for (const row of given) {
              const id = num(row.hocVienId);
              bookGiven.set(id, (bookGiven.get(id) ?? 0) + num(row.tienSach));
            }
            const paidRows = await q()
              .selectFrom('eduNopSach')
              .select(['hocVienId', 'soTien'])
              .where('hocVienId', 'in', part)
              .execute();
            for (const row of paidRows) {
              const id = num(row.hocVienId);
              bookPaid.set(id, (bookPaid.get(id) ?? 0) + num(row.soTien));
            }
          }
        }

        const parentOf = new Map<number, Row>();
        if (
          mayParents &&
          may.parents?.eduPhuHuynh &&
          may.links?.eduHocVienPhuHuynh
        ) {
          const parents = new Map(
            (await readAll('eduPhuHuynh', may.parents.eduPhuHuynh)).map((p) => [
              num(p.id),
              p,
            ]),
          );
          for (const link of await readAll(
            'eduHocVienPhuHuynh',
            may.links.eduHocVienPhuHuynh,
          )) {
            const id = num(link.hocVienId);
            if (!visible.has(id)) continue;
            const parent = parents.get(num(link.phuHuynhId));
            // The main contact wins; otherwise the first parent linked.
            if (parent && (!parentOf.has(id) || asBoolean(link.lienHeChinh))) {
              parentOf.set(id, parent);
            }
          }
        }

        let soHocVienVuotGoi = 0;
        let soHocVienSapHet = 0;
        let soHocVienBinhThuong = 0;
        let tongCongNoHocPhi = 0;
        let tongCongNoSach = 0;
        const needle = search ? normalizeSearchText(search) : '';
        const danhSach: Row[] = [];

        for (const hv of students) {
          const id = num(hv.id);
          const lopIdNum = hv.lopId != null ? num(hv.lopId) : null;
          const coSoIdNum = hv.coSoId != null ? num(hv.coSoId) : null;
          const lop = lopIdNum != null ? classMap.get(lopIdNum) : undefined;
          const coSo = coSoIdNum != null ? branchMap.get(coSoIdNum) : undefined;
          const parent = parentOf.get(id);
          const pack = packStats.get(id) ?? {
            tongSoBuoiDaMua: 0,
            tongTienHocPhi: 0,
          };
          const tongDaThanhToan = paid.get(id) ?? 0;
          const soBuoiConLai = num(hv.soBuoiConLai);
          const tongConNoHocPhi = mayMoney
            ? Math.max(0, pack.tongTienHocPhi - tongDaThanhToan)
            : 0;
          const tongTienSachDaPhat = bookGiven.get(id) ?? 0;
          const tongTienSachDaNop = bookPaid.get(id) ?? 0;
          const tienSachTon = tongTienSachDaNop - tongTienSachDaPhat;
          const congNoSach = tienSachTon < 0 ? -tienSachTon : 0;

          if (soBuoiConLai < 0) soHocVienVuotGoi += 1;
          else if (soBuoiConLai <= 2) soHocVienSapHet += 1;
          else soHocVienBinhThuong += 1;
          tongCongNoHocPhi += tongConNoHocPhi;
          tongCongNoSach += congNoSach;

          if (needle) {
            const hit =
              normalizeSearchText(hv.hoTen).includes(needle) ||
              normalizeSearchText(hv.ma).includes(needle) ||
              (parent ? asText(parent.soDienThoai).includes(needle) : false);
            if (!hit) continue;
          }
          if (lopId && lopIdNum !== lopId) continue;
          if (coSoId && coSoIdNum !== coSoId) continue;
          if (trangThaiLoc === 'vuot_goi' && soBuoiConLai >= 0) continue;
          if (
            trangThaiLoc === 'sap_het' &&
            (soBuoiConLai < 0 || soBuoiConLai > 2)
          )
            continue;
          if (trangThaiLoc === 'binh_thuong' && soBuoiConLai < 3) continue;
          if (trangThaiLoc === 'no_hoc_phi' && tongConNoHocPhi <= 0) continue;
          if (trangThaiLoc === 'no_sach' && congNoSach <= 0) continue;

          danhSach.push({
            id,
            ma: asText(hv.ma),
            hoTen: asText(hv.hoTen),
            lopId: lopIdNum,
            lopTen: lop ? asText(lop.ten) : null,
            coSoId: coSoIdNum,
            coSoTen: coSo ? asText(coSo.ten) : null,
            phuHuynhTen: parent ? asText(parent.hoTen) : null,
            phuHuynhSdt: parent ? asText(parent.soDienThoai) : null,
            soBuoiConLai,
            soBuoiVuotGoi: soBuoiConLai < 0 ? -soBuoiConLai : 0,
            tongSoBuoiDaMua: pack.tongSoBuoiDaMua,
            tongSoBuoiDaHoc: attended.get(id) ?? 0,
            tongTienHocPhi: mayMoney ? pack.tongTienHocPhi : 0,
            tongDaThanhToan: mayMoney ? tongDaThanhToan : 0,
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
            quyen: { hocPhi: mayMoney, sach: mayBooks, phuHuynh: mayParents },
            thongKe: {
              tongHocVien: students.length,
              soHocVienVuotGoi,
              soHocVienSapHet,
              soHocVienBinhThuong,
              tongCongNoHocPhi,
              tongCongNoSach,
            },
            danhSach,
          },
        });
      },
    );

    // 2. One student: sessions mapped onto the packages they paid for
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
        const hocVien = await database
          .repository('eduHocVien')
          .withPolicy(policyOf(c, 'eduHocVien'))
          .findOne({ filter: { id: hocVienId } });
        // A student outside the caller's scope is "not found", like everywhere else.
        if (!hocVien)
          throw eduError(
            'NOT_FOUND',
            'EDU_STUDENT_NOT_FOUND',
            'Student not found.',
          );
        const may = await partsOf(c);
        const mayMoney = Boolean(
          may.packages?.eduGoiHoc && may.payments?.eduThanhToan,
        );
        const mayBooks = Boolean(may.books?.eduPhatSach);
        const mayParents = Boolean(
          may.parents?.eduPhuHuynh && may.links?.eduHocVienPhuHuynh,
        );
        const mayRecord =
          (await optionalPoliciesOf(c, 'edu.diemDanh', 'record')) !== null;
        const ofStudent = hocVienId;

        const goiHocs = may.packages?.eduGoiHoc
          ? (
              await readAll('eduGoiHoc', may.packages.eduGoiHoc, ofStudent)
            ).sort(
              (a, b) =>
                asText(a.ngayMua).localeCompare(asText(b.ngayMua)) ||
                num(a.id) - num(b.id),
            )
          : [];
        const allPayments =
          mayMoney && may.payments?.eduThanhToan
            ? await readAll(
                'eduThanhToan',
                may.payments.eduThanhToan,
                ofStudent,
              )
            : [];

        // Attendance rows come through the policy; the session, the class name and the awareness score (not a
        // permission field) are then read for exactly those rows.
        const marks = may.attendance?.eduDiemDanh
          ? await readAll('eduDiemDanh', may.attendance.eduDiemDanh, ofStudent)
          : [];
        const sessionById = new Map<number, Row>();
        const scoreById = new Map<number, number | null>();
        for (const part of chunks(marks, 200)) {
          const sessions = await q()
            .selectFrom('eduBuoiHoc')
            .select(['id', 'ngay', 'gioBatDau', 'gioKetThuc', 'lopId'])
            .where('id', 'in', [...new Set(part.map((m) => num(m.buoiHocId)))])
            .execute();
          for (const session of sessions)
            sessionById.set(num(session.id), session);
          const scores = await q()
            .selectFrom('eduDiemDanh')
            .select(['id', 'yThucDiem'])
            .where(
              'id',
              'in',
              part.map((m) => num(m.id)),
            )
            .execute();
          for (const score of scores)
            scoreById.set(
              num(score.id),
              score.yThucDiem == null ? null : num(score.yThucDiem),
            );
        }
        const classMap = await names('eduLop', [
          ...[...sessionById.values()].map((s) => num(s.lopId)),
          ...(hocVien.lopId != null ? [num(hocVien.lopId)] : []),
        ]);
        const branchMap = await names('eduCoSo', [num(hocVien.coSoId)]);
        const sessionKey = (mark: Row): string => {
          const session = sessionById.get(num(mark.buoiHocId));
          return `${asText(session?.ngay)} ${asText(session?.gioBatDau)}`;
        };
        marks.sort(
          (a, b) =>
            sessionKey(a).localeCompare(sessionKey(b)) || num(a.id) - num(b.id),
        );

        let phuHuynh: Row | null = null;
        if (
          mayParents &&
          may.parents?.eduPhuHuynh &&
          may.links?.eduHocVienPhuHuynh
        ) {
          const links = await readAll(
            'eduHocVienPhuHuynh',
            may.links.eduHocVienPhuHuynh,
            ofStudent,
          );
          const link =
            links.find((row) => asBoolean(row.lienHeChinh)) ?? links[0];
          const parent = link
            ? await database
                .repository('eduPhuHuynh')
                .withPolicy(may.parents.eduPhuHuynh)
                .findOne({ filter: { id: num(link.phuHuynhId) } })
            : null;
          if (link && parent) {
            phuHuynh = {
              id: num(parent.id),
              hoTen: asText(parent.hoTen),
              soDienThoai: asText(parent.soDienThoai),
              email: parent.email ? asText(parent.email) : null,
              moiQuanHe: link.quanHe ? asText(link.quanHe) : null,
            };
          }
        }

        const paidByGoiHoc = new Map<number, number>();
        let unallocatedPayment = 0;
        for (const pm of allPayments) {
          const amount = num(pm.soTien);
          if (pm.goiHocId != null && num(pm.goiHocId) > 0) {
            const id = num(pm.goiHocId);
            paidByGoiHoc.set(id, (paidByGoiHoc.get(id) ?? 0) + amount);
          } else {
            unallocatedPayment += amount;
          }
        }

        let tongSoBuoiDaMua = 0;
        let tongTienHocPhi = 0;
        let tongDaThanhToan = 0;
        const cacKyNop = goiHocs.map((g, index) => {
          const id = num(g.id);
          const soBuoi = num(g.soBuoi);
          const thanhTien = mayMoney ? num(g.thanhTien) : 0;
          let daThanhToan = paidByGoiHoc.get(id) ?? 0;
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
            id,
            kySo: index + 1,
            ngayMua: asText(g.ngayMua),
            soBuoi,
            donGia: mayMoney ? num(g.donGia) : 0,
            thanhTien,
            daThanhToan,
            conNo,
            daDung: 0,
            conLai: soBuoi,
            tienDo: 0,
            trangThai:
              conNo === 0
                ? 'da_dong_du'
                : daThanhToan > 0
                  ? 'dong_mot_phan'
                  : 'chua_dong',
          };
        });
        tongDaThanhToan += unallocatedPayment;

        let accumulated = 0;
        let tongSoBuoiDaHoc = 0;
        let kyIndex = 0;
        let capacity = cacKyNop[0]?.soBuoi ?? 0;
        const danhSachBuoiHoc = marks.map((mark, index) => {
          const status = asText(mark.trangThai);
          if (PRESENT.has(status)) tongSoBuoiDaHoc += 1;
          accumulated += Math.max(0, num(mark.soBuoiDaTru));
          while (kyIndex < cacKyNop.length - 1 && accumulated > capacity) {
            kyIndex += 1;
            capacity += cacKyNop[kyIndex]?.soBuoi ?? 0;
          }
          const ngoaiGoi = cacKyNop.length === 0 || accumulated > capacity;
          const ky = ngoaiGoi ? undefined : cacKyNop[kyIndex];
          const session = sessionById.get(num(mark.buoiHocId));
          const lop =
            session?.lopId != null ? classMap.get(num(session.lopId)) : null;
          return {
            diemDanhId: num(mark.id),
            buoiHocId: num(mark.buoiHocId),
            stt: index + 1,
            buoiThu: accumulated,
            ngay: asText(session?.ngay),
            gioBatDau: asText(session?.gioBatDau),
            gioKetThuc: asText(session?.gioKetThuc),
            lopId: session?.lopId != null ? num(session.lopId) : null,
            lopTen: lop ? asText(lop.ten) : null,
            trangThai: status,
            daLamBtvn: asBoolean(mark.daLamBtvn),
            yThucDiem: scoreById.get(num(mark.id)) ?? null,
            nhanXet: mark.nhanXet ? asText(mark.nhanXet) : '',
            soBuoiDaTru: num(mark.soBuoiDaTru),
            kyId: ky ? ky.id : null,
            kySo: ky ? ky.kySo : null,
            ngoaiGoi,
          };
        });

        let used = 0;
        for (const ky of cacKyNop) {
          const inThis = Math.min(ky.soBuoi, Math.max(0, accumulated - used));
          used += inThis;
          ky.daDung = inThis;
          ky.conLai = ky.soBuoi - inThis;
          ky.tienDo =
            ky.soBuoi > 0 ? Math.round((inThis / ky.soBuoi) * 100) : 0;
        }

        let tongTienSachDaPhat = 0;
        let tongTienSachDaNop = 0;
        let sachDaPhat: Row[] = [];
        if (mayBooks && may.books?.eduPhatSach) {
          const handed = (
            await readAll('eduPhatSach', may.books.eduPhatSach, ofStudent)
          ).sort((a, b) => asText(a.ngay).localeCompare(asText(b.ngay)));
          const bookIds = [...new Set(handed.map((row) => num(row.sachId)))];
          const books = new Map<number, Row>();
          for (const part of chunks(bookIds, 200)) {
            const rows = await q()
              .selectFrom('eduSach')
              .select(['id', 'ten', 'giaBia'])
              .where('id', 'in', part)
              .execute();
            for (const row of rows) books.set(num(row.id), row);
          }
          sachDaPhat = handed.map((row) => {
            const book = books.get(num(row.sachId));
            // `tienSach` is what the family owes for this book: the price minus the discount, fixed when handed out.
            const thanhTien = num(row.tienSach);
            const uuDai = num(row.uuDai);
            tongTienSachDaPhat += thanhTien;
            return {
              id: num(row.id),
              sachId: num(row.sachId),
              tenSach: book ? asText(book.ten) : '',
              ngayPhat: asText(row.ngay),
              soLuong: 1,
              giaBia: thanhTien + uuDai,
              uuDai,
              thanhTien,
              ghiChu: row.ghiChu ? asText(row.ghiChu) : '',
            };
          });
          const paidRows = await q()
            .selectFrom('eduNopSach')
            .select('soTien')
            .where('hocVienId', '=', hocVienId)
            .execute();
          for (const row of paidRows) tongTienSachDaNop += num(row.soTien);
        }

        const lopIdNum = hocVien.lopId != null ? num(hocVien.lopId) : null;
        const studentLop = lopIdNum != null ? classMap.get(lopIdNum) : null;
        const coSoIdNum = hocVien.coSoId != null ? num(hocVien.coSoId) : null;
        const studentCoSo = coSoIdNum != null ? branchMap.get(coSoIdNum) : null;
        const soBuoiConLai = num(hocVien.soBuoiConLai);

        return c.json({
          data: {
            quyen: {
              hocPhi: mayMoney,
              sach: mayBooks,
              phuHuynh: mayParents,
              suaBuoi: mayRecord,
            },
            hocVien: {
              id: num(hocVien.id),
              ma: asText(hocVien.ma),
              hoTen: asText(hocVien.hoTen),
              lopId: lopIdNum,
              lopTen: studentLop ? asText(studentLop.ten) : null,
              coSoId: coSoIdNum,
              coSoTen: studentCoSo ? asText(studentCoSo.ten) : null,
              phuHuynh,
              soBuoiConLai,
              trangThai: asText(hocVien.trangThai) || 'dang_hoc',
            },
            tongHop: {
              tongSoBuoiDaMua,
              tongSoBuoiDaHoc,
              soBuoiConLai,
              soBuoiVuotGoi: soBuoiConLai < 0 ? -soBuoiConLai : 0,
              tongTienHocPhi,
              tongDaThanhToan,
              tongConNo: Math.max(0, tongTienHocPhi - tongDaThanhToan),
              tongTienSachDaPhat,
              tongTienSachDaNop,
              tienSachTon: tongTienSachDaNop - tongTienSachDaPhat,
            },
            cacKyNop,
            sachDaPhat,
            danhSachBuoiHoc,
          },
        });
      },
    );

    // 3. Correct one attendance row; the balance moves through the ledger like a saved register
    router.post(
      '/doiSoat/capNhatBuoiHoc',
      declare(
        'Correct one attendance row and move the balance through the ledger',
        'quickEditSession',
      ),
      needs('edu.diemDanh', 'record'),
      apiValidator('json', CapNhatBuoiHocInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const attendancePolicy = policyOf(c, 'eduDiemDanh');
        const sessionPolicy = (await policiesOf(c, 'edu.buoiHoc', 'view'))
          .eduBuoiHoc;
        const studentPolicy = (await policiesOf(c, 'edu.hocVien', 'view'))
          .eduHocVien;
        const result = await database.transaction(async (connection) => {
          // The row is looked up through the caller's own attendance policy: one outside their scope is not found.
          const record = await connection
            .repository('eduDiemDanh')
            .withPolicy(attendancePolicy)
            .findOne({ filter: { id: input.diemDanhId } });
          if (!record) {
            throw eduError(
              'NOT_FOUND',
              'EDU_ATTENDANCE_NOT_FOUND',
              'Attendance record not found.',
            );
          }
          const hocVienId = Number(record.hocVienId);
          const saved = await saveAttendance(connection, {
            buoiHocId: Number(record.buoiHocId),
            danhSach: [
              {
                hocVienId,
                trangThai: input.trangThai,
                daLamBtvn: input.daLamBtvn,
                // Not sent keeps the comment; an empty text clears it.
                nhanXet:
                  input.nhanXet === undefined
                    ? undefined
                    : input.nhanXet || null,
              },
            ],
            userId,
            policies: {
              attendance: attendancePolicy,
              session: sessionPolicy,
              student: studentPolicy,
            },
            existingRowsAnyBranch: true,
          });
          if (input.yThucDiem !== undefined) {
            await connection.query
              .updateTable('eduDiemDanh')
              .set({ yThucDiem: input.yThucDiem })
              .where('id', '=', input.diemDanhId)
              .execute();
          }
          const row = saved.danhSach[0];
          return {
            success: true,
            diemDanhId: input.diemDanhId,
            hocVienId,
            soBuoiDaTru: row?.soBuoiDaTru ?? 0,
            soBuoiConLaiMoi: row?.soBuoiConLai ?? 0,
          };
        });
        return c.json({ data: result });
      },
    );

    return new Hono().route('/', router);
  }),
];
