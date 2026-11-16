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

import { asText, shortName } from '../edu/names.js';
import { eduMessage, PERIOD_PATTERN } from '../edu/nhan-xet.js';
import { asBoolean } from '../edu/so-du.js';
import {
  currentUserId,
  eduError,
  needs,
  policiesOf,
  policyOf,
  type EduEnv,
} from './edu-support.js';

/**
 * Monthly comments. A coach writes one comment per student and month for the classes they teach; the text is built
 * for the coach to paste into Zalo (no Zalo integration). Writing is authorized by `edu.nhanXet.write` over the
 * `edu.myClasses` scope, and the student must be one the caller sees, so a coach cannot comment on another class.
 */
const Id = z.coerce.number().int().positive();
const Month = z.string().regex(PERIOD_PATTERN);

const SaveInput = z.object({
  hocVienId: Id,
  thang: Month,
  noiDung: z.string().trim().min(1).max(3000),
});

const ExportInput = z.object({
  thang: Month,
  lopId: Id.optional(),
  hocVienId: Id.optional(),
});

const HistoryInput = z.object({
  hocVienId: Id,
  thang: z.string().optional(),
});

const AiPromptInput = z.object({
  hocVienId: Id,
  thang: z.string(),
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
      '/nhanXet/luu',
      '/nhanXet/xuatVanBan',
      '/nhanXet/lichSuBuoiHoc',
      '/nhanXet/aiGoiY',
    ]) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 32 * 1024 }),
      );
    }

    router.post(
      '/nhanXet/luu',
      declare(
        'Write or replace the monthly comment of a student',
        'saveComment',
      ),
      needs('edu.nhanXet', 'write'),
      apiValidator('json', SaveInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const policy = policyOf(c, 'eduNhanXetThang');
        const studentPolicy = (await policiesOf(c, 'edu.hocVien', 'view'))
          .eduHocVien;
        const result = await database.transaction(async (connection) => {
          const student = studentPolicy
            ? await connection
                .repository('eduHocVien')
                .withPolicy(studentPolicy)
                .findOne({ filter: { id: input.hocVienId } })
            : null;
          if (!student || student.lopId == null) {
            throw eduError(
              'NOT_FOUND',
              'EDU_STUDENT_NOT_FOUND',
              'Student not found.',
            );
          }
          const comments = connection
            .repository('eduNhanXetThang')
            .withPolicy(policy);
          const existing = await comments.findOne({
            filter: (f) =>
              f.and([
                f.number('hocVienId').eq(input.hocVienId),
                f.string('thang').eq(input.thang),
                f.string('hlvId').eq(userId),
              ]),
          });
          if (existing) {
            await comments.updateOne({
              filter: { id: Number(existing.id) },
              values: { noiDung: input.noiDung },
            });
            return { id: Number(existing.id) };
          }
          const created = await comments.createOne({
            values: {
              hocVienId: input.hocVienId,
              lopId: Number(student.lopId),
              hlvId: userId,
              thang: input.thang,
              noiDung: input.noiDung,
              trangThai: 'nhap',
            },
          });
          const id = Number(created.record.id);
          // The class of the new comment must be one the caller teaches (or manages).
          if (!(await comments.findOne({ filter: { id } }))) {
            throw eduError(
              'PERMISSION_DENIED',
              'EDU_OUT_OF_SCOPE',
              'You may not write a comment here.',
            );
          }
          return { id };
        });
        return c.json({ data: result }, 201);
      },
    );

    router.post(
      '/nhanXet/xuatVanBan',
      declare(
        'Plain text of the monthly comments, to paste into Zalo',
        'exportComments',
      ),
      needs('edu.nhanXet', 'view'),
      apiValidator('json', ExportInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const comments = await database
          .repository('eduNhanXetThang')
          .withPolicy(policyOf(c, 'eduNhanXetThang'))
          .findMany({
            filter: (f) =>
              f.and([
                f.string('thang').eq(input.thang),
                ...(input.lopId ? [f.number('lopId').eq(input.lopId)] : []),
                ...(input.hocVienId
                  ? [f.number('hocVienId').eq(input.hocVienId)]
                  : []),
              ]),
            sort: (s) => s.field('id').asc(),
            limit: 100,
          });
        const items: { hocVienId: number; ma: string; vanBan: string }[] = [];
        for (const comment of comments) {
          const student = await database
            .connection()
            .query.selectFrom('eduHocVien')
            .select(['id', 'ma', 'hoTen'])
            .where('id', '=', Number(comment.hocVienId))
            .executeTakeFirst();
          if (!student) continue;
          items.push({
            hocVienId: Number(student.id),
            ma: asText(student.ma),
            vanBan: eduMessage({
              studentName: shortName(asText(student.hoTen)),
              month: input.thang,
              comment: asText(comment.noiDung),
            }),
          });
        }
        // Who exported what, when and how many rows — never the names (knowledge document 05).
        await database
          .connection()
          .query.insertInto('eduXuatDuLieuNhatKy')
          .values({
            userId,
            loai: 'nhan_xet',
            boLoc: { thang: input.thang, lopId: input.lopId ?? null },
            soDong: items.length,
            createdAt: new Date(),
          })
          .execute();
        return c.json({ data: { soDong: items.length, danhSach: items } });
      },
    );

    /**
     * The attendance marks of one student, newest first, for a caller who sees that student (`edu.hocVien` `view`)
     * and may see attendance (`edu.diemDanh` `view`). The marks come through the attendance policy; the day, the
     * class and the awareness score (not a permission field) are then read for exactly those rows. A student outside
     * the caller's scope is "not found".
     */
    async function marksOf(
      c: Parameters<typeof policiesOf>[0],
      hocVienId: number,
      thang: string | undefined,
    ) {
      const studentPolicy = (await policiesOf(c, 'edu.hocVien', 'view'))
        .eduHocVien;
      const student = studentPolicy
        ? await database
            .repository('eduHocVien')
            .withPolicy(studentPolicy)
            .findOne({ filter: { id: hocVienId } })
        : null;
      if (!student) {
        throw eduError(
          'NOT_FOUND',
          'EDU_STUDENT_NOT_FOUND',
          'Student not found.',
        );
      }
      const attendancePolicy = (await policiesOf(c, 'edu.diemDanh', 'view'))
        .eduDiemDanh;
      if (!attendancePolicy) {
        throw eduError(
          'PERMISSION_DENIED',
          'EDU_PERMISSION_DENIED',
          'This action is not allowed.',
        );
      }
      const attendance = database
        .repository('eduDiemDanh')
        .withPolicy(attendancePolicy);
      const marks: Record<string, unknown>[] = [];
      for (let offset = 0; offset < 5000; offset += 100) {
        const page = await attendance.findMany({
          filter: (f) => f.number('hocVienId').eq(hocVienId),
          sort: (sort) => sort.field('id').asc(),
          limit: 100,
          offset,
        });
        marks.push(...page);
        if (page.length < 100) break;
      }
      const q = database.connection().query;
      const sessions = new Map<number, Record<string, unknown>>();
      const scores = new Map<number, number | null>();
      for (let i = 0; i < marks.length; i += 200) {
        const part = marks.slice(i, i + 200);
        const found = await q
          .selectFrom('eduBuoiHoc')
          .select(['id', 'ngay', 'gioBatDau', 'lopId'])
          .where('id', 'in', [...new Set(part.map((m) => Number(m.buoiHocId)))])
          .execute();
        for (const session of found) sessions.set(Number(session.id), session);
        const scored = await q
          .selectFrom('eduDiemDanh')
          .select(['id', 'yThucDiem'])
          .where(
            'id',
            'in',
            part.map((m) => Number(m.id)),
          )
          .execute();
        for (const row of scored)
          scores.set(
            Number(row.id),
            row.yThucDiem == null ? null : Number(row.yThucDiem),
          );
      }
      const classIds = [
        ...new Set([...sessions.values()].map((s) => Number(s.lopId))),
      ];
      const classes = new Map<number, string>();
      for (let i = 0; i < classIds.length; i += 200) {
        const found = await q
          .selectFrom('eduLop')
          .select(['id', 'ten'])
          .where('id', 'in', classIds.slice(i, i + 200))
          .execute();
        for (const lop of found) classes.set(Number(lop.id), asText(lop.ten));
      }
      const month = thang && /^\d{4}-\d{2}$/u.test(thang) ? thang : undefined;
      const rows = marks
        .map((mark) => {
          const session = sessions.get(Number(mark.buoiHocId));
          return {
            diemDanhId: Number(mark.id),
            buoiHocId: Number(mark.buoiHocId),
            ngay: asText(session?.ngay),
            gioBatDau: asText(session?.gioBatDau),
            lopTen: classes.get(Number(session?.lopId)) ?? '',
            trangThai: asText(mark.trangThai),
            daLamBtvn: asBoolean(mark.daLamBtvn),
            nhanXet: mark.nhanXet ? asText(mark.nhanXet) : '',
            yThucDiem: scores.get(Number(mark.id)) ?? null,
            soBuoiDaTru: Number(mark.soBuoiDaTru),
          };
        })
        .filter((row) => !month || row.ngay.startsWith(month))
        .sort(
          (a, b) =>
            `${b.ngay} ${b.gioBatDau}`.localeCompare(
              `${a.ngay} ${a.gioBatDau}`,
            ) || b.diemDanhId - a.diemDanhId,
        );
      return { student, rows };
    }

    router.post(
      '/nhanXet/lichSuBuoiHoc',
      declare(
        'Session remarks and attendance history of a student',
        'studentSessionHistory',
      ),
      needs('edu.nhanXet', 'view'),
      apiValidator('json', HistoryInput),
      async (c) => {
        const input = c.req.valid('json');
        const { rows } = await marksOf(c, input.hocVienId, input.thang);
        const tongBuoi = rows.length;
        const soBuoiCoMat = rows.filter(
          (r) => r.trangThai === 'co_mat' || r.trangThai === 'hoc_bu',
        ).length;
        const soBuoiVang = rows.filter(
          (r) =>
            r.trangThai === 'vang_co_phep' || r.trangThai === 'vang_khong_phep',
        ).length;
        const soLamBtvn = rows.filter((r) => Boolean(r.daLamBtvn)).length;
        const tyLeLamBtvn =
          tongBuoi > 0 ? Math.round((soLamBtvn / tongBuoi) * 100) : 0;
        const scores = rows
          .map((r) => r.yThucDiem)
          .filter((s): s is number => s != null);
        const diemYThucTb =
          scores.length > 0
            ? Number(
                (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1),
              )
            : null;
        const cacNhanXet = rows
          .map((r) => (r.nhanXet ? asText(r.nhanXet).trim() : ''))
          .filter((t) => t.length > 0);

        return c.json({
          data: {
            danhSach: rows,
            thongKe: {
              tongBuoi,
              soBuoiCoMat,
              soBuoiVang,
              tyLeLamBtvn,
              diemYThucTb,
              cacNhanXet,
            },
          },
        });
      },
    );

    router.post(
      '/nhanXet/aiGoiY',
      declare(
        'Generate smart periodic review recommendation based on session history',
        'aiReviewRecommendation',
      ),
      needs('edu.nhanXet', 'write'),
      apiValidator('json', AiPromptInput),
      async (c) => {
        const input = c.req.valid('json');
        const found = await marksOf(c, input.hocVienId, input.thang);
        const student = found.student;
        // The twenty most recent sessions of the period.
        const rows = found.rows.slice(0, 20);
        const name = shortName(asText(student.hoTen));
        const coMat = rows.filter(
          (r) => r.trangThai === 'co_mat' || r.trangThai === 'hoc_bu',
        ).length;
        const tongBuoi = rows.length;
        const vang = tongBuoi - coMat;
        const btvn = rows.filter((r) => Boolean(r.daLamBtvn)).length;
        const notes = rows
          .map((r) => (r.nhanXet ? asText(r.nhanXet).trim() : ''))
          .filter((t) => t.length > 0);
        const scores = rows
          .map((r) => r.yThucDiem)
          .filter((s): s is number => s != null);
        const avgScore =
          scores.length > 0
            ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
            : null;

        const phanChuyenCan =
          tongBuoi > 0 && vang === 0
            ? `Trong đợt học vừa qua (${input.thang}), con ${name} đi học rất chuyên cần (tham gia đủ ${tongBuoi}/${tongBuoi} buổi).`
            : tongBuoi > 0
              ? `Trong đợt học vừa qua (${input.thang}), con ${name} tham gia ${coMat}/${tongBuoi} buổi học.`
              : `Trong đợt học (${input.thang}), con ${name} duy trì việc học tập tại câu lạc bộ.`;

        const phanYThuc =
          avgScore && Number(avgScore) >= 8.5
            ? `Trên lớp con có ý thức học tập rất tốt (điểm ý thức trung bình ${avgScore}/10), chăm chú nghe giảng và tích cực tham gia các bài thực hành.`
            : avgScore && Number(avgScore) >= 7.0
              ? `Ý thức học tập trên lớp khá tốt, con hòa đồng và chủ động tương tác với thầy cô và các bạn.`
              : `Con cần tập trung hơn trong giờ học, hạn chế nói chuyện riêng để theo kịp toàn bộ các nội dung bài giảng.`;

        const phanKienThuc =
          notes.length > 0
            ? `Ghi nhận qua các buổi học: ${notes.slice(0, 3).join('. ')}.`
            : `Con nắm được các kiến thức trọng tâm của bài học và vận dụng vào các thế trận thực tế.`;

        const phanBtvn =
          tongBuoi > 0 && btvn >= Math.floor(tongBuoi * 0.7)
            ? `Con hoàn thành tốt các bài tập về nhà được giao.`
            : `Con cần chủ động hoàn thành đầy đủ bài tập về nhà hơn để củng cố kỹ năng.`;

        const phanDinhHuong = `Định hướng thời gian tới: Thầy cô sẽ tiếp tục rèn luyện cho con tính cẩn thận, tư duy chiến thuật sâu hơn và khuyến khích con tự tin thi đấu. Chúc con ngày càng tiến bộ!`;

        const banNhanXet = `${phanChuyenCan} ${phanYThuc} ${phanKienThuc} ${phanBtvn} ${phanDinhHuong}`;

        return c.json({
          data: {
            goiY: banNhanXet,
            thongKe: {
              tongBuoi,
              coMat,
              vang,
              btvn,
              avgScore,
              ghiChuBuoiHoc: notes,
            },
          },
        });
      },
    );

    return new Hono().route('/', router);
  }),
];
