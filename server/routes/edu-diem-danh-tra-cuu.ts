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
import { buildFilter, type FilterBuilder } from '@nocobase/repository-input';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { anyOfNode, anyOfText } from '../edu/filters.js';
import { asText } from '../edu/names.js';
import { chunksOf, PAGE } from '../edu/read-all.js';
import {
  addMarks,
  daysOf,
  emptyCounts,
  keepsSession,
  rangeProblem,
  rateOf,
  REGISTER_MODES,
  totalOf,
  type Counts,
} from '../edu/so-diem-danh.js';
import { ATTENDANCE_STATUSES } from '../edu/so-du.js';
import {
  eduError,
  needs,
  policiesOf,
  policyOf,
  type EduEnv,
} from './edu-support.js';

/**
 * The attendance register (`POST /diemDanh/traCuu`, DS-62 phase 2): who attended which session of a period, seen by
 * session, by student or by teacher, with filters and pages read on the server.
 *
 * Every read goes through the policy of its own composite action, so a coach sees only their classes and a branch
 * manager only their branches: attendance rows through `edu.diemDanh` `view`, sessions through `edu.buoiHoc` `view`,
 * classes through `edu.lop` `view`, student names through `edu.hocVien` `view`. A branch, class or student outside the
 * caller's scope is not an error: it simply matches nothing (no probing). Filtering by date, class or teacher happens on
 * the sessions; the attendance rows are then counted per chunk of those sessions (`groupBy`, counts only travel).
 */
type Row = Record<string, unknown>;
interface Reader {
  findMany(input: unknown): Promise<Row[]>;
  groupBy(input: unknown): Promise<Row[]>;
}

const Id = z.coerce.number().int().positive();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const Input = z
  .object({
    tuNgay: Day,
    denNgay: Day,
    coSoId: Id.optional(),
    lopId: Id.optional(),
    hlvId: z.string().trim().min(1).max(64).optional(),
    hocVienId: Id.optional(),
    trangThai: z.enum(ATTENDANCE_STATUSES).optional(),
    cheDo: z.enum(REGISTER_MODES),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
  })
  .superRefine((input, ctx) => {
    const problem = rangeProblem(input.tuNgay, input.denNgay);
    if (problem)
      ctx.addIssue({ code: 'custom', path: ['denNgay'], message: problem });
  });
type InputType = z.infer<typeof Input>;

/** Sessions whose attendance is counted in one query. */
const SESSION_CHUNK = 400;
/** The most sessions one lookup covers; a bigger period must be narrowed to a class or a branch. */
const MAX_SESSIONS = 20_000;
/** The most classes read for the filters (a club has far fewer). */
const MAX_CLASSES = 5_000;

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

const num = (value: unknown): number => Number(value);

interface Session {
  readonly id: number;
  readonly lopId: number;
  readonly ngay: string;
  readonly gioBatDau: string;
  readonly gioKetThuc: string;
  readonly hlvId: string | null;
  readonly loai: string;
  readonly trangThai: string;
}

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();

    for (const path of ['/diemDanh/traCuu', '/diemDanh/giaoVien']) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 16 * 1024 }),
      );
    }

    const reader = (collection: string, policy: unknown): Reader =>
      database
        .repository(collection)
        .withPolicy(policy as never) as unknown as Reader;

    const byId = (s: { field: (n: string) => { asc: () => unknown } }) =>
      s.field('id').asc();

    /** Every row the policy lets through, page by page, ordered by id. Throws when there are more than `cap`. */
    async function readAll(
      repository: Reader,
      filter: unknown,
      cap: number,
    ): Promise<Row[]> {
      const rows: Row[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = await repository.findMany({
          ...(filter ? { filter } : {}),
          sort: byId,
          limit: PAGE,
          offset,
        });
        rows.push(...page);
        if (page.length < PAGE) break;
        if (rows.length >= cap) {
          throw eduError(
            'FAILED_PRECONDITION',
            'EDU_RANGE_TOO_LARGE',
            'The period covers too many records. Narrow it to a branch, a class or fewer days.',
          );
        }
      }
      return rows;
    }

    async function policyFor(
      c: Parameters<typeof policiesOf>[0],
      resource: string,
      collection: string,
    ): Promise<unknown> {
      const policy = (await policiesOf(c, resource, 'view'))[collection];
      if (!policy) {
        throw eduError(
          'PERMISSION_DENIED',
          'EDU_PERMISSION_DENIED',
          'This action is not allowed.',
        );
      }
      return policy;
    }

    /** The classes the caller may see, narrowed by the branch and class filters. */
    async function visibleClasses(
      c: Parameters<typeof policiesOf>[0],
      input: Pick<InputType, 'coSoId' | 'lopId'>,
    ): Promise<Row[]> {
      const classes = reader('eduLop', await policyFor(c, 'edu.lop', 'eduLop'));
      const conditions = (f: FilterBuilder) => [
        ...(input.coSoId ? [f.number('coSoId').eq(input.coSoId)] : []),
        ...(input.lopId ? [f.number('id').eq(input.lopId)] : []),
      ];
      const filter =
        input.coSoId || input.lopId
          ? buildFilter((f) => f.and(conditions(f)))
          : undefined;
      return readAll(classes, filter, MAX_CLASSES);
    }

    /** `id` and `name` of staff accounts: nothing else of a user is read. */
    async function staffNames(
      ids: readonly string[],
    ): Promise<Map<string, string>> {
      const names = new Map<string, string>();
      for (const part of chunksOf([...new Set(ids)], 200)) {
        const users = await database
          .connection()
          .query.selectFrom('user')
          .select(['id', 'name'])
          .where('id', 'in', part)
          .execute();
        for (const user of users) names.set(asText(user.id), asText(user.name));
      }
      return names;
    }

    router.post(
      '/diemDanh/traCuu',
      declare(
        'Attendance register: sessions, students or teachers of a period',
        'lookUpAttendance',
      ),
      needs('edu.diemDanh', 'view'),
      apiValidator('json', Input),
      async (c) => {
        const input = c.req.valid('json');
        const attendance = reader('eduDiemDanh', policyOf(c, 'eduDiemDanh'));
        const sessionsPolicy = await policyFor(c, 'edu.buoiHoc', 'eduBuoiHoc');
        const hasAttendanceFilter = Boolean(input.hocVienId || input.trangThai);

        const classes = await visibleClasses(c, input);
        const empty = {
          data: [] as unknown[],
          meta: {
            count: 0,
            cheDo: input.cheDo,
            tuNgay: input.tuNgay,
            denNgay: input.denNgay,
            tongHop: summary(0, emptyCounts()),
          },
        };
        // A branch or class that is not visible matches nothing; with neither filter the session policy alone decides.
        if ((input.coSoId || input.lopId) && classes.length === 0)
          return c.json(empty);

        const classIds = classes.map((row) => num(row.id));
        const sessions: Session[] = (
          await readAll(
            reader('eduBuoiHoc', sessionsPolicy),
            buildFilter((f) =>
              f.and([
                anyOfText(f, 'ngay', daysOf(input.tuNgay, input.denNgay)),
                ...(input.coSoId || input.lopId
                  ? [anyOfNode(f, 'lopId', classIds)]
                  : []),
                ...(input.hlvId ? [f.string('hlvId').eq(input.hlvId)] : []),
              ]),
            ),
            MAX_SESSIONS,
          )
        ).map((row) => ({
          id: num(row.id),
          lopId: num(row.lopId),
          ngay: asText(row.ngay),
          gioBatDau: asText(row.gioBatDau),
          gioKetThuc: asText(row.gioKetThuc),
          hlvId: row.hlvId == null ? null : asText(row.hlvId),
          loai: asText(row.loai),
          trangThai: asText(row.trangThai),
        }));
        if (sessions.length === 0) return c.json(empty);

        // Marks of those sessions, counted by the database: per session, or per student for the student view.
        const by = input.cheDo === 'hocVien' ? 'hocVienId' : 'buoiHocId';
        const marks = new Map<number, Counts>();
        for (const part of chunksOf(sessions, SESSION_CHUNK)) {
          const filter = buildFilter((f) =>
            f.and([
              anyOfNode(
                f,
                'buoiHocId',
                part.map((session) => session.id),
              ),
              ...(input.hocVienId
                ? [f.number('hocVienId').eq(input.hocVienId)]
                : []),
              ...(input.trangThai
                ? [f.string('trangThai').eq(input.trangThai)]
                : []),
            ]),
          );
          const groups = await attendance.groupBy({
            by: [by, 'trangThai'],
            aggregate: (a: { count: () => unknown }) => ({ n: a.count() }),
            filter,
          });
          for (const group of groups) {
            const key = num(group[by]);
            const counts = marks.get(key) ?? emptyCounts();
            addMarks(counts, asText(group.trangThai), num(group.n));
            marks.set(key, counts);
          }
        }

        const kept = sessions.filter((session) =>
          input.cheDo === 'hocVien'
            ? true
            : keepsSession(hasAttendanceFilter, marks.get(session.id)),
        );
        const all = emptyCounts();
        for (const counts of marks.values()) {
          all.coMat += counts.coMat;
          all.vangCoPhep += counts.vangCoPhep;
          all.vangKhongPhep += counts.vangKhongPhep;
          all.hocBu += counts.hocBu;
        }
        const tongHop = summary(kept.length, all);

        if (input.cheDo === 'buoi') {
          const ordered = [...kept].sort(
            (a, b) =>
              b.ngay.localeCompare(a.ngay) ||
              a.gioBatDau.localeCompare(b.gioBatDau) ||
              a.id - b.id,
          );
          const page = ordered.slice(input.offset, input.offset + input.limit);
          return c.json({
            data: page.map((session) => {
              const counts = marks.get(session.id) ?? emptyCounts();
              return {
                buoiHocId: session.id,
                lopId: session.lopId,
                ngay: session.ngay,
                gioBatDau: session.gioBatDau,
                gioKetThuc: session.gioKetThuc,
                hlvId: session.hlvId,
                loai: session.loai,
                trangThai: session.trangThai,
                ...counts,
                tong: totalOf(counts),
              };
            }),
            meta: meta(input, ordered.length, tongHop),
          });
        }

        if (input.cheDo === 'giaoVien') {
          const perTeacher = new Map<
            string,
            { soCa: number; soCaDaDiemDanh: number; counts: Counts }
          >();
          for (const session of kept) {
            const key = session.hlvId ?? '';
            const entry = perTeacher.get(key) ?? {
              soCa: 0,
              soCaDaDiemDanh: 0,
              counts: emptyCounts(),
            };
            entry.soCa += 1;
            if (session.trangThai === 'da_diem_danh') entry.soCaDaDiemDanh += 1;
            const counts = marks.get(session.id);
            if (counts) {
              entry.counts.coMat += counts.coMat;
              entry.counts.vangCoPhep += counts.vangCoPhep;
              entry.counts.vangKhongPhep += counts.vangKhongPhep;
              entry.counts.hocBu += counts.hocBu;
            }
            perTeacher.set(key, entry);
          }
          const ordered = [...perTeacher.entries()].sort(
            (a, b) => b[1].soCa - a[1].soCa || a[0].localeCompare(b[0]),
          );
          const page = ordered.slice(input.offset, input.offset + input.limit);
          const names = await staffNames(
            page.map(([id]) => id).filter(Boolean),
          );
          return c.json({
            data: page.map(([id, entry]) => ({
              hlvId: id || null,
              hlvTen: id ? (names.get(id) ?? '') : '',
              soCa: entry.soCa,
              soCaDaDiemDanh: entry.soCaDaDiemDanh,
              soLuot: totalOf(entry.counts),
              ...entry.counts,
              tyLe: rateOf(entry.counts),
            })),
            meta: meta(input, ordered.length, tongHop),
          });
        }

        // By student: one row per student who has a mark in the period.
        const students = [...marks.entries()]
          .filter(([, counts]) => totalOf(counts) > 0)
          .sort((a, b) => a[0] - b[0]);
        const page = students.slice(input.offset, input.offset + input.limit);
        const named = new Map<number, Row>();
        if (page.length > 0) {
          const rows = await reader(
            'eduHocVien',
            await policyFor(c, 'edu.hocVien', 'eduHocVien'),
          ).findMany({
            filter: buildFilter((f) =>
              anyOfNode(
                f,
                'id',
                page.map(([id]) => id),
              ),
            ),
            limit: PAGE,
          });
          for (const row of rows) named.set(num(row.id), row);
        }
        return c.json({
          data: page.map(([id, counts]) => ({
            hocVienId: id,
            ma: asText(named.get(id)?.ma),
            hoTen: asText(named.get(id)?.hoTen),
            lopId:
              named.get(id)?.lopId == null ? null : num(named.get(id)?.lopId),
            ...counts,
            tong: totalOf(counts),
            tyLe: rateOf(counts),
          })),
          meta: meta(input, students.length, {
            ...tongHop,
            soHocVien: students.length,
          }),
        });
      },
    );

    // The teachers a caller may filter by: those of the classes the caller sees (a coach: themselves).
    router.post(
      '/diemDanh/giaoVien',
      declare(
        'Teachers of the classes the caller may see',
        'listAttendanceTeachers',
      ),
      needs('edu.diemDanh', 'view'),
      async (c) => {
        const classes = await visibleClasses(c, {});
        const ids = [
          ...new Set(
            classes
              .map((row) => (row.hlvId == null ? '' : asText(row.hlvId)))
              .filter(Boolean),
          ),
        ];
        const names = await staffNames(ids);
        return c.json({
          data: ids
            .map((id) => ({ id, ten: names.get(id) ?? '' }))
            .sort((a, b) => a.ten.localeCompare(b.ten, 'vi')),
        });
      },
    );

    return new Hono().route('/', router);
  }),
];

function summary(soCa: number, counts: Counts) {
  return {
    soCa,
    soLuot: totalOf(counts),
    ...counts,
    tyLe: rateOf(counts),
  };
}

function meta(
  input: InputType,
  count: number,
  tongHop: ReturnType<typeof summary> & { soHocVien?: number },
) {
  return {
    count,
    cheDo: input.cheDo,
    tuNgay: input.tuNgay,
    denNgay: input.denNgay,
    tongHop,
  };
}
