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
import { buildFilter } from '@nocobase/repository-input';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { balanceBand, needsCollection } from '../edu/can-thu.js';
import { toCsv } from '../edu/csv.js';
import { readStudentSummary } from '../edu/kien-thuc-doc.js';
import { asText } from '../edu/names.js';
import { loadAllocation } from '../edu/phan-bo-doc.js';
import {
  chunksOf,
  readAllRows,
  readRowsByIds,
  type Row,
} from '../edu/read-all.js';
import { asBoolean } from '../edu/so-du.js';
import {
  currentUserId,
  eduError,
  needs,
  optionalPolicy,
  requiredPolicy,
  type EduEnv,
} from './edu-support.js';

/**
 * The student file ("Hồ sơ 360°"): everything the page `/hoc-vien/:id` shows about one student that is worked out
 * rather than read from one record API, in one answer (`POST /hocVien/hoSo360`).
 *
 * The student must be one the caller sees (`edu.hocVien` `view`); anything else is "not found". Each section is read
 * through the policies of the composite actions that own its data and is `null` when the caller does not hold them, so
 * a coach gets the sessions and no money, an accountant gets the money and the sessions, and nobody gets more than the
 * list pages would give them:
 *
 * - `buoiHoc` needs `edu.diemDanh` and `edu.buoiHoc` (`view`);
 * - `hocPhi` (the terms, the first-in-first-out allocation of the sessions to them, the money) needs `edu.goiHoc`,
 *   `edu.thanhToan` and `edu.soDu` (`view`): the allocation is computed from the balance ledger, so without it the page
 *   would show a guess;
 * - `sach` (books handed out and the book fund) needs `edu.phatSach` (`view`).
 *
 * Which term a session belongs to is the allocation of `server/edu/phan-bo-goi.ts` (the same one `/goiHoc/chiTiet`
 * answers with), never a running total of its own. "Sessions studied" is the sum of `soBuoiDaTru`, the number the balance
 * is made of, and "need to pay" is `server/edu/can-thu.ts`, the module of the audit page and the home warning.
 *
 * The download of the sessions (`/hocVien/hoSo360/xuatCsv`) is an export: it needs `edu.baoCao` `export`, goes through
 * `csvCell` and writes one row of the export log (who, how many rows, never a name).
 */
const Id = z.coerce.number().int().positive();
const Input = z.object({ hocVienId: Id });

const declare = (summary: string, operationId: string) =>
  describeRoute({
    tags: ['NocoEdu', 'HoSo360'],
    summary,
    operationId,
    responses: {
      '200': dataResponse(z.object({}).passthrough()),
      ...apiErrorResponses,
    },
  });

/** A student has a few hundred attendance rows at most in years; the cap keeps a runaway table from a long answer. */
const MAX_MARKS = 5000;

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    for (const path of ['/hocVien/hoSo360', '/hocVien/hoSo360/xuatCsv']) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 64 * 1024 }),
      );
    }

    async function buildProfile(c: Context<EduEnv>, hocVienId: number) {
      const studentPolicy = await requiredPolicy(
        c,
        'edu.hocVien',
        'view',
        'eduHocVien',
      );
      const student = await database
        .repository('eduHocVien')
        .withPolicy(studentPolicy)
        .findOne({ filter: { id: hocVienId } });
      if (!student) {
        throw eduError(
          'NOT_FOUND',
          'EDU_STUDENT_NOT_FOUND',
          'Student not found.',
        );
      }
      const [
        classPolicy,
        branchPolicy,
        attendancePolicy,
        sessionPolicy,
        packPolicy,
        payPolicy,
        ledgerPolicy,
        bookPolicy,
        catalogPolicy,
        linkPolicy,
        parentPolicy,
      ] = await Promise.all([
        optionalPolicy(c, 'edu.lop', 'view', 'eduLop'),
        optionalPolicy(c, 'edu.coSo', 'view', 'eduCoSo'),
        optionalPolicy(c, 'edu.diemDanh', 'view', 'eduDiemDanh'),
        optionalPolicy(c, 'edu.buoiHoc', 'view', 'eduBuoiHoc'),
        optionalPolicy(c, 'edu.goiHoc', 'view', 'eduGoiHoc'),
        optionalPolicy(c, 'edu.thanhToan', 'view', 'eduThanhToan'),
        optionalPolicy(c, 'edu.soDu', 'view', 'eduSoDuNhatKy'),
        optionalPolicy(c, 'edu.phatSach', 'view', 'eduPhatSach'),
        optionalPolicy(c, 'edu.sach', 'view', 'eduSach'),
        optionalPolicy(c, 'edu.lienKet', 'view', 'eduHocVienPhuHuynh'),
        optionalPolicy(c, 'edu.phuHuynh', 'view', 'eduPhuHuynh'),
      ]);
      const ofStudent = buildFilter((f) => f.number('hocVienId').eq(hocVienId));
      const query = database.connection().query;
      const lopId = student.lopId == null ? null : Number(student.lopId);
      const coSoId = student.coSoId == null ? null : Number(student.coSoId);

      const nhomId = student.nhomId == null ? null : Number(student.nhomId);
      const groupPolicy = await optionalPolicy(
        c,
        'edu.lopNhom',
        'view',
        'eduLopNhom',
      );
      const groups = await readRowsByIds(
        database,
        'eduLopNhom',
        groupPolicy,
        nhomId ? [nhomId] : [],
      );
      const [classes, branches] = await Promise.all([
        readRowsByIds(database, 'eduLop', classPolicy, lopId ? [lopId] : []),
        readRowsByIds(
          database,
          'eduCoSo',
          branchPolicy,
          coSoId ? [coSoId] : [],
        ),
      ]);

      // The main contact: the parent flagged as such, else the first one the caller may see.
      let phuHuynhChinh: Record<string, unknown> | null = null;
      if (linkPolicy && parentPolicy) {
        const links = await readAllRows(
          database,
          'eduHocVienPhuHuynh',
          linkPolicy,
          ofStudent,
          200,
        );
        const parents = await readRowsByIds(
          database,
          'eduPhuHuynh',
          parentPolicy,
          links.map((link) => Number(link.phuHuynhId)),
        );
        const ordered = [
          ...links.filter((link) => asBoolean(link.lienHeChinh)),
          ...links.filter((link) => !asBoolean(link.lienHeChinh)),
        ];
        for (const link of ordered) {
          const parent = parents.get(Number(link.phuHuynhId));
          if (!parent) continue;
          phuHuynhChinh = {
            id: Number(parent.id),
            hoTen: asText(parent.hoTen),
            soDienThoai: asText(parent.soDienThoai),
            quanHe: asText(link.quanHe),
          };
          break;
        }
      }

      // --- Tuition: terms, allocation, money --------------------------------------------------------------------
      let hocPhi: Record<string, unknown> | null = null;
      const termOfMark = new Map<number, number>();
      const overBalance = new Set<number>();
      if (packPolicy && payPolicy && ledgerPolicy) {
        const { packages, result } = await loadAllocation(
          database,
          hocVienId,
          packPolicy,
          ledgerPolicy,
        );
        const payments = await readAllRows(
          database,
          'eduThanhToan',
          payPolicy,
          ofStudent,
          5000,
        );
        const packageById = new Map(
          packages.map((pack) => [Number(pack.id), pack]),
        );
        const paidByPackage = new Map<number, number>();
        let unallocated = 0;
        let tongDaThanhToan = 0;
        for (const payment of payments) {
          const amount = Number(payment.soTien || 0);
          tongDaThanhToan += amount;
          const goiHocId =
            payment.goiHocId == null ? 0 : Number(payment.goiHocId);
          if (goiHocId > 0)
            paidByPackage.set(
              goiHocId,
              (paidByPackage.get(goiHocId) ?? 0) + amount,
            );
          else unallocated += amount;
        }
        let tongSoBuoiDaMua = 0;
        let tongTienHocPhi = 0;
        for (const pack of packages) {
          tongSoBuoiDaMua += Number(pack.soBuoi || 0);
          tongTienHocPhi += Number(pack.thanhTien || 0);
        }
        const cacKy = result.cacGoi.map((entry, index) => {
          const pack =
            entry.goiHocId === null
              ? undefined
              : packageById.get(entry.goiHocId);
          const thanhTien = Number(pack?.thanhTien || 0);
          let daThanhToan =
            entry.goiHocId === null
              ? 0
              : (paidByPackage.get(entry.goiHocId) ?? 0);
          // A payment that names no package covers the oldest term that is still open.
          if (pack && daThanhToan < thanhTien && unallocated > 0) {
            const part = Math.min(thanhTien - daThanhToan, unallocated);
            daThanhToan += part;
            unallocated -= part;
          }
          const conNo = Math.max(0, thanhTien - daThanhToan);
          for (const taken of entry.cacLanTru) {
            if (taken.diemDanhId !== null && !termOfMark.has(taken.diemDanhId))
              termOfMark.set(taken.diemDanhId, index + 1);
          }
          return {
            kySo: index + 1,
            goiHocId: entry.goiHocId,
            loai: entry.loai,
            trangThaiGoi: pack ? asText(pack.trangThai) : 'hieu_luc',
            ngayMua: entry.ngayMua,
            soBuoi: entry.soBuoi,
            donGia: Number(pack?.donGia || 0),
            thanhTien,
            daThanhToan,
            conNo,
            daDung: entry.daDung,
            conLai: entry.conLai,
            tienDo:
              entry.soBuoi > 0
                ? Math.round((entry.daDung / entry.soBuoi) * 100)
                : 0,
          };
        });
        let vuotSoDu = 0;
        for (const over of result.vuotSoDu) {
          vuotSoDu += over.soBuoi;
          if (over.diemDanhId !== null) overBalance.add(over.diemDanhId);
        }
        hocPhi = {
          cacKy,
          vuotSoDu,
          tongSoBuoiDaMua,
          tongTienHocPhi,
          tongDaThanhToan,
          tongConNo: Math.max(0, tongTienHocPhi - tongDaThanhToan),
        };
      }

      // --- Sessions -----------------------------------------------------------------------------------------------
      let buoiHoc: Record<string, unknown>[] | null = null;
      let tongSoBuoiDaHoc: number | null = null;
      if (attendancePolicy && sessionPolicy) {
        const marks = await readAllRows(
          database,
          'eduDiemDanh',
          attendancePolicy,
          ofStudent,
          MAX_MARKS,
        );
        const sessions = await readRowsByIds(
          database,
          'eduBuoiHoc',
          sessionPolicy,
          marks.map((mark) => Number(mark.buoiHocId)),
        );
        const sessionClasses = await readRowsByIds(
          database,
          'eduLop',
          classPolicy,
          [...sessions.values()].map((session) => Number(session.lopId)),
        );
        // The awareness score is not a permission field: it is read for the attendance rows the policy returned.
        const scores = new Map<number, number>();
        for (const part of chunksOf(
          marks.map((mark) => Number(mark.id)),
          200,
        )) {
          for (const row of await query
            .selectFrom('eduDiemDanh')
            .select(['id', 'yThucDiem'])
            .where('id', 'in', part)
            .execute()) {
            if (row.yThucDiem != null)
              scores.set(Number(row.id), Number(row.yThucDiem));
          }
        }
        const rows = marks
          .flatMap((mark) => {
            const session = sessions.get(Number(mark.buoiHocId));
            return session ? [{ mark, session }] : [];
          })
          .sort(
            (a, b) =>
              asText(a.session.ngay).localeCompare(asText(b.session.ngay)) ||
              asText(a.session.gioBatDau).localeCompare(
                asText(b.session.gioBatDau),
              ) ||
              Number(a.mark.id) - Number(b.mark.id),
          );
        let studied = 0;
        buoiHoc = rows.map(({ mark, session }, index) => {
          const markId = Number(mark.id);
          const deducted = Math.max(0, Number(mark.soBuoiDaTru || 0));
          studied += deducted;
          const lop = sessionClasses.get(Number(session.lopId));
          return {
            diemDanhId: markId,
            buoiHocId: Number(mark.buoiHocId),
            stt: index + 1,
            ngay: asText(session.ngay),
            gioBatDau: asText(session.gioBatDau),
            gioKetThuc: asText(session.gioKetThuc),
            lopId: session.lopId == null ? null : Number(session.lopId),
            lopTen: lop ? asText(lop.ten) : null,
            trangThai: asText(mark.trangThai),
            daLamBtvn: asBoolean(mark.daLamBtvn),
            yThucDiem: scores.get(markId) ?? null,
            nhanXet: mark.nhanXet ? asText(mark.nhanXet) : '',
            soBuoiDaTru: deducted,
            // `null` when the caller sees no tuition, or when the row deducted nothing (so it belongs to no term).
            kySo: termOfMark.get(markId) ?? null,
            vuotSoDu: overBalance.has(markId),
          };
        });
        tongSoBuoiDaHoc = studied;
      }

      // --- Books handed out and the book fund -----------------------------------------------------------------
      let sach: Record<string, unknown> | null = null;
      if (bookPolicy) {
        const handouts = await readAllRows(
          database,
          'eduPhatSach',
          bookPolicy,
          ofStudent,
          5000,
        );
        const catalog = await readRowsByIds(
          database,
          'eduSach',
          catalogPolicy,
          handouts.map((handout) => Number(handout.sachId)),
        );
        // `tienSach` is already net of the discount (`tienSach = giaBan - uuDai`, see `/phatSach/ghi`).
        let daPhat = 0;
        const cacLanPhat = handouts
          .sort(
            (a, b) =>
              asText(a.ngay).localeCompare(asText(b.ngay)) ||
              Number(a.id) - Number(b.id),
          )
          .map((handout) => {
            const book = catalog.get(Number(handout.sachId));
            const tienSach = Math.max(0, Number(handout.tienSach || 0));
            daPhat += tienSach;
            return {
              id: Number(handout.id),
              sachId: Number(handout.sachId),
              kyHieu: book ? asText(book.kyHieu) : '',
              tenSach: book ? asText(book.ten) : '',
              ngay: asText(handout.ngay),
              giaBia: book ? Number(book.giaBia || 0) : null,
              uuDai: Number(handout.uuDai || 0),
              tienSach,
              ghiChu: handout.ghiChu ? asText(handout.ghiChu) : '',
            };
          });
        // Book money paid is not a permission field: summed for the student the policy returned.
        const paid = await query
          .selectFrom('eduNopSach')
          .select('soTien')
          .where('hocVienId', '=', hocVienId)
          .execute();
        const daNop = paid.reduce(
          (sum, row) => sum + Number(row.soTien || 0),
          0,
        );
        sach = {
          cacLanPhat,
          daPhat,
          daNop,
          conLai: daNop - daPhat,
          congNo: Math.max(0, daPhat - daNop),
        };
      }

      // What the student has learned (GĐ 4): the share of the level and the gaps still open. `null` when the caller does
      // not hold what it takes to read them (`edu.kienThuc`, the curriculum, and the register and sessions that gaps
      // are worked out from).
      const [dataPolicy, taughtPolicy, topicPolicy, skillPolicy] =
        await Promise.all([
          optionalPolicy(c, 'edu.kienThuc', 'view', 'eduHocVienKyNang'),
          optionalPolicy(c, 'edu.kienThuc', 'view', 'eduBuoiHocKyNang'),
          optionalPolicy(c, 'edu.chuongTrinh', 'view', 'eduChuDe'),
          optionalPolicy(c, 'edu.chuongTrinh', 'view', 'eduKyNang'),
        ]);
      const kienThuc =
        dataPolicy &&
        taughtPolicy &&
        topicPolicy &&
        skillPolicy &&
        attendancePolicy &&
        sessionPolicy
          ? await readStudentSummary(
              database,
              { chuDe: topicPolicy, kyNang: skillPolicy },
              {
                id: hocVienId,
                lopId,
                nhomId,
                levelKey: asText(student.levelKey),
              },
            )
          : null;

      const soBuoiConLai = Number(student.soBuoiConLai || 0);
      const money = hocPhi as {
        tongSoBuoiDaMua: number;
        tongTienHocPhi: number;
        tongDaThanhToan: number;
        tongConNo: number;
        vuotSoDu: number;
      } | null;
      const books = sach as {
        daPhat: number;
        daNop: number;
        conLai: number;
        congNo: number;
      } | null;
      return {
        hocVien: {
          id: Number(student.id),
          ma: asText(student.ma),
          hoTen: asText(student.hoTen),
          levelKey: asText(student.levelKey),
          trangThai: asText(student.trangThai) || 'dang_hoc',
          lopId,
          lopTen: lopId
            ? classes.get(lopId)
              ? asText(classes.get(lopId)?.ten)
              : null
            : null,
          nhomId,
          nhomTen: nhomId
            ? groups.get(nhomId)
              ? asText(groups.get(nhomId)?.ten)
              : null
            : null,
          coSoId,
          coSoTen: coSoId
            ? branches.get(coSoId)
              ? asText(branches.get(coSoId)?.ten)
              : null
            : null,
        },
        phuHuynhChinh,
        tongHop: {
          soBuoiConLai,
          dai: balanceBand(soBuoiConLai),
          canThu: needsCollection(student),
          tongSoBuoiDaMua: money?.tongSoBuoiDaMua ?? null,
          tongSoBuoiDaHoc,
          vuotSoDu: money?.vuotSoDu ?? null,
          tongTienHocPhi: money?.tongTienHocPhi ?? null,
          tongDaThanhToan: money?.tongDaThanhToan ?? null,
          tongConNoHocPhi: money?.tongConNo ?? null,
          tienSachDaPhat: books?.daPhat ?? null,
          tienSachDaNop: books?.daNop ?? null,
          quySach: books?.conLai ?? null,
          congNoSach: books?.congNo ?? null,
        },
        hocPhi,
        buoiHoc,
        sach,
        kienThuc,
      };
    }

    router.post(
      '/hocVien/hoSo360',
      declare(
        'The student file: sessions, terms, tuition and books',
        'studentFile',
      ),
      needs('edu.hocVien', 'view'),
      apiValidator('json', Input),
      async (c) => {
        const { hocVienId } = c.req.valid('json');
        return c.json({ data: await buildProfile(c, hocVienId) });
      },
    );

    router.post(
      '/hocVien/hoSo360/xuatCsv',
      declare(
        'Download the sessions of one student as a CSV file',
        'studentFileCsv',
      ),
      needs('edu.baoCao', 'export'),
      apiValidator('json', Input),
      async (c) => {
        const { hocVienId } = c.req.valid('json');
        const profile = await buildProfile(c, hocVienId);
        if (!profile.buoiHoc) {
          throw eduError(
            'PERMISSION_DENIED',
            'EDU_PERMISSION_DENIED',
            'This action is not allowed.',
          );
        }
        const rows = (profile.buoiHoc as Row[]).map((session) => [
          Number(session.stt),
          asText(session.ngay),
          asText(session.gioBatDau),
          asText(session.lopTen),
          asText(session.trangThai),
          asBoolean(session.daLamBtvn) ? 1 : 0,
          session.yThucDiem == null ? '' : Number(session.yThucDiem),
          asText(session.nhanXet),
          Number(session.soBuoiDaTru),
          session.kySo == null ? '' : Number(session.kySo),
        ]);
        await database
          .connection()
          .query.insertInto('eduXuatDuLieuNhatKy')
          .values({
            userId: currentUserId(c),
            loai: 'ho_so_buoi_hoc_csv',
            boLoc: { hocVienId },
            soDong: rows.length,
            createdAt: new Date(),
          })
          .execute();
        return new Response(
          toCsv(
            [
              'stt',
              'ngay',
              'gio',
              'lop',
              'trangThai',
              'btvn',
              'yThuc',
              'nhanXet',
              'truBuoi',
              'ky',
            ],
            rows,
          ),
          {
            headers: {
              'content-type': 'text/csv; charset=utf-8',
              'content-disposition': `attachment; filename="ho-so-${profile.hocVien.ma}.csv"`,
              'cache-control': 'no-store',
            },
          },
        );
      },
    );

    return new Hono().route('/', router);
  }),
];
