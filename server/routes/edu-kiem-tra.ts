import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { concurrencyServiceToken } from '@nocobase/app-plugin-concurrency/server';
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
import { buildFilter, buildSort } from '@nocobase/repository-input';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import {
  MAX_CELLS_PER_ENTRY,
  MAX_SKILLS_PER_TEST,
  MAX_TOP_MARK,
  NAME_MAX,
  TEST_KINDS,
  TEST_LOCK,
  TEST_STATUSES,
  levelUpTarget,
  resultOf,
  stateOf,
  type StudentResult,
  type TestSkill,
} from '../edu/kiem-tra.js';
import { activeSkills, readCatalog } from '../edu/kien-thuc-doc.js';
import { cleanText } from '../edu/kien-thuc.js';
import { LEVEL_KEYS, levelOrder } from '../edu/levels.js';
import { asText } from '../edu/names.js';
import {
  chunksOf,
  readAllRows,
  readRowsByIds,
  type Row,
} from '../edu/read-all.js';
import {
  currentUserId,
  eduError,
  needs,
  policiesOf,
  policyOf,
  requiredPolicy,
  type EduEnv,
} from './edu-support.js';

/**
 * The tests of a level (GĐ 5 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`): make a test for a class, enter the
 * marks of each student on each skill, close it, and list the students who passed a `len_cap` test.
 *
 * Every route has `auth.required()` and a composite-action check on its own paths (`edu.kiemTra` `view` or `manage`).
 * A test is read and written through the policy of `edu.kiemTra` (a coach reaches the tests of their classes, a branch
 * manager those of their branches; a test outside the scope is "not found", exactly like one that does not exist). A
 * student is always read through the caller's `edu.hocVien` policy and must be in the class of the test. `eduBaiKiemTraKyNang`
 * (the skills of a test) has no permission of its own: it is read and written by the id of a test the policy returned,
 * as the knowledge tables are read by the ids of students a policy returned.
 *
 * Nothing here moves a student up a level: a passed `len_cap` test only **lists** the student as eligible, with the level
 * to go to; the coach confirms it with `/hocVien/lenCap`. Closing a test writes `eduHocVienKyNang` with `nguon = kiem_tra`
 * and is the one moment the tests touch what a student has learned.
 */
const Id = z.coerce.number().int().positive();
const Mark = z.number().int().min(0).max(MAX_TOP_MARK);

const SkillInput = z.object({
  kyNangId: Id,
  diemToiDa: z.number().int().min(1).max(MAX_TOP_MARK),
});
const SaveInput = z.object({
  id: Id.optional(),
  ten: z.string().max(NAME_MAX * 2),
  loai: z.enum(TEST_KINDS),
  levelKey: z.enum(LEVEL_KEYS),
  lopId: Id,
  ngay: z.iso.date(),
  diemDat: z.number().int().min(1).max(100),
  kyNang: z.array(SkillInput).min(1).max(MAX_SKILLS_PER_TEST),
});
const ListInput = z.object({
  lopId: Id.optional(),
  coSoId: Id.optional(),
  loai: z.enum(TEST_KINDS).optional(),
  trangThai: z.enum(TEST_STATUSES).optional(),
  levelKey: z.enum(LEVEL_KEYS).optional(),
  tim: z.string().trim().max(100).optional(),
  trang: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const TestInput = z.object({ id: Id });
const EntryInput = z.object({
  id: Id,
  o: z
    .array(
      z.object({
        hocVienId: Id,
        kyNangId: Id,
        diem: Mark.nullable(),
      }),
    )
    .min(1)
    .max(MAX_CELLS_PER_ENTRY),
});
const StudentInput = z.object({ hocVienId: Id });

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
const notFound = (reason: string, message: string) =>
  eduError('NOT_FOUND', reason, message);
const invalid = (reason: string, field: string, message?: string) =>
  eduError(
    'INVALID_ARGUMENT',
    reason,
    message ?? 'The value is not valid.',
    field,
  );

const PATHS = [
  '/kiemTra/danhSach',
  '/kiemTra/chiTiet',
  '/kiemTra/luu',
  '/kiemTra/nhapDiem',
  '/kiemTra/chot',
  '/kiemTra/hocVien',
];

type Context = Parameters<typeof policiesOf>[0];
type Connection = ReturnType<DatabaseManager['connection']>;
type Reader = Pick<Connection, 'query' | 'repository'>;

/** A mark as stored. */
interface MarkRow {
  readonly id: number;
  readonly hocVienId: number;
  readonly kyNangId: number;
  readonly diem: number;
}

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const concurrency = app.container.resolve(concurrencyServiceToken);
    const router = new Hono<EduEnv>();

    for (const path of PATHS) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 128 * 1024 }),
      );
    }

    // --- Shared reading ------------------------------------------------------------------------------------------
    /** The test, only when the caller's `edu.kiemTra` scope covers it. */
    async function visibleTest(
      c: Context,
      reader: Reader,
      id: number,
    ): Promise<Row> {
      const test = await reader
        .repository('eduBaiKiemTra')
        .withPolicy(policyOf(c, 'eduBaiKiemTra'))
        .findOne({ filter: { id } });
      if (!test) throw notFound('EDU_TEST_NOT_FOUND', 'Test not found.');
      return test;
    }

    /** The class, only when the caller's `edu.lop` scope covers it. */
    async function visibleClass(
      c: Context,
      reader: Reader,
      lopId: number,
    ): Promise<Row> {
      const policy = await requiredPolicy(c, 'edu.lop', 'view', 'eduLop');
      const lop = await reader
        .repository('eduLop')
        .withPolicy(policy)
        .findOne({ filter: { id: lopId } });
      if (!lop) throw notFound('EDU_CLASS_NOT_FOUND', 'Class not found.');
      return lop;
    }

    /** The curriculum, through the policies of `edu.chuongTrinh` `view`. */
    async function catalogOf(c: Context) {
      const policies = await policiesOf(c, 'edu.chuongTrinh', 'view');
      const chuDe = policies.eduChuDe;
      const kyNang = policies.eduKyNang;
      if (!chuDe || !kyNang)
        throw eduError(
          'PERMISSION_DENIED',
          'EDU_PERMISSION_DENIED',
          'This action is not allowed.',
        );
      return readCatalog(database, { chuDe, kyNang });
    }

    /** The skills and top marks of a test the caller's policy returned. */
    async function skillsOf(
      reader: Reader,
      testId: number,
    ): Promise<TestSkill[]> {
      const rows = await reader.query
        .selectFrom('eduBaiKiemTraKyNang')
        .select(['kyNangId', 'diemToiDa'])
        .where('baiKiemTraId', '=', testId)
        .orderBy('id')
        .execute();
      return rows.map((row) => ({
        kyNangId: num(row.kyNangId),
        diemToiDa: num(row.diemToiDa),
      }));
    }

    /** Every mark of a test the caller's policy returned. */
    async function marksOf(reader: Reader, testId: number): Promise<MarkRow[]> {
      const rows = await reader.query
        .selectFrom('eduKetQuaKiemTra')
        .select(['id', 'hocVienId', 'kyNangId', 'diem'])
        .where('baiKiemTraId', '=', testId)
        .execute();
      return rows.map((row) => ({
        id: num(row.id),
        hocVienId: num(row.hocVienId),
        kyNangId: num(row.kyNangId),
        diem: num(row.diem),
      }));
    }

    async function hasMarks(reader: Reader, testId: number): Promise<boolean> {
      const row = await reader.query
        .selectFrom('eduKetQuaKiemTra')
        .select('id')
        .where('baiKiemTraId', '=', testId)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    }

    /** The caller's `edu.hocVien` policy. Resolved before a transaction opens: authorizing reads the database too. */
    const studentPolicyOf = (c: Context) =>
      requiredPolicy(c, 'edu.hocVien', 'view', 'eduHocVien');

    /** marks of a student: skill id → mark. */
    function marksByStudent(
      marks: readonly MarkRow[],
    ): Map<number, Map<number, number>> {
      const out = new Map<number, Map<number, number>>();
      for (const mark of marks) {
        const own = out.get(mark.hocVienId) ?? new Map<number, number>();
        own.set(mark.kyNangId, mark.diem);
        out.set(mark.hocVienId, own);
      }
      return out;
    }

    const testView = (test: Row) => ({
      id: num(test.id),
      ten: asText(test.ten),
      loai: asText(test.loai),
      levelKey: asText(test.levelKey),
      lopId: num(test.lopId),
      coSoId: num(test.coSoId),
      ngay: asText(test.ngay),
      diemDat: num(test.diemDat),
      trangThai: asText(test.trangThai),
      chotLuc: test.chotLuc == null ? null : test.chotLuc,
    });

    /** What a student's mark list says about passing and being eligible (the level is read live). */
    function summaryOf(
      test: Row,
      student: Row,
      skills: readonly TestSkill[],
      marks: ReadonlyMap<number, number> | undefined,
    ): StudentResult & {
      hocVienId: number;
      denLevelKey: string | null;
      daLenCap: boolean;
    } {
      const result = resultOf(
        skills,
        marks ?? new Map<number, number>(),
        num(test.diemDat),
      );
      const target = levelUpTarget({
        loai: asText(test.loai),
        trangThai: asText(test.trangThai),
        testLevelKey: asText(test.levelKey),
        studentLevelKey: asText(student.levelKey),
        dat: result.dat,
      });
      return {
        hocVienId: num(student.id),
        ...result,
        denLevelKey: target ?? null,
        // Passed and no longer at the tested level: the student has been confirmed into a higher level since.
        daLenCap:
          result.dat &&
          (levelOrder(asText(student.levelKey)) ?? 0) >
            (levelOrder(asText(test.levelKey)) ?? 0),
      };
    }

    // --- List ----------------------------------------------------------------------------------------------------
    router.post(
      '/kiemTra/danhSach',
      declare('List the tests the caller may see', 'listTests'),
      needs('edu.kiemTra', 'view'),
      apiValidator('json', ListInput),
      async (c) => {
        const input = c.req.valid('json');
        const repository = database
          .repository('eduBaiKiemTra')
          .withPolicy(policyOf(c, 'eduBaiKiemTra'));
        const filter = buildFilter((f) =>
          f.and([
            ...(input.lopId === undefined
              ? []
              : [f.number('lopId').eq(input.lopId)]),
            ...(input.coSoId === undefined
              ? []
              : [f.number('coSoId').eq(input.coSoId)]),
            ...(input.loai === undefined
              ? []
              : [f.string('loai').eq(input.loai)]),
            ...(input.trangThai === undefined
              ? []
              : [f.string('trangThai').eq(input.trangThai)]),
            ...(input.levelKey === undefined
              ? []
              : [f.string('levelKey').eq(input.levelKey)]),
            ...(input.tim
              ? [f.string('ten').includes(input.tim, { mode: 'insensitive' })]
              : []),
          ]),
        );
        const [rows, total] = await Promise.all([
          repository.findMany({
            filter,
            sort: buildSort((s) => [
              s.field('ngay').desc(),
              s.field('id').desc(),
            ]),
            limit: input.limit,
            offset: (input.trang - 1) * input.limit,
          }),
          repository.count({ filter }),
        ]);
        // How many skills and students each test of this page has, read by the ids of the tests the policy returned.
        const ids = rows.map((row) => num(row.id));
        const skillCount = new Map<number, number>();
        const studentSets = new Map<number, Set<number>>();
        if (ids.length > 0) {
          const q = database.connection().query;
          for (const row of await q
            .selectFrom('eduBaiKiemTraKyNang')
            .select(['baiKiemTraId'])
            .where('baiKiemTraId', 'in', ids)
            .execute())
            skillCount.set(
              num(row.baiKiemTraId),
              (skillCount.get(num(row.baiKiemTraId)) ?? 0) + 1,
            );
          for (const row of await q
            .selectFrom('eduKetQuaKiemTra')
            .select(['baiKiemTraId', 'hocVienId'])
            .where('baiKiemTraId', 'in', ids)
            .execute()) {
            const set =
              studentSets.get(num(row.baiKiemTraId)) ?? new Set<number>();
            set.add(num(row.hocVienId));
            studentSets.set(num(row.baiKiemTraId), set);
          }
        }
        return c.json({
          data: {
            tong: Number(total) || 0,
            trang: input.trang,
            limit: input.limit,
            danhSach: rows.map((row) => ({
              ...testView(row),
              soKyNang: skillCount.get(num(row.id)) ?? 0,
              soHocVien: studentSets.get(num(row.id))?.size ?? 0,
            })),
          },
        });
      },
    );

    // --- One test: its skills, the students, the marks and the results -------------------------------------------
    router.post(
      '/kiemTra/chiTiet',
      declare('Read one test with its marks and results', 'readTest'),
      needs('edu.kiemTra', 'view'),
      apiValidator('json', TestInput),
      async (c) => {
        const { id } = c.req.valid('json');
        const reader = database.connection();
        const test = await visibleTest(c, reader, id);
        const skills = await skillsOf(reader, id);
        const catalog = await catalogOf(c);
        const skillRows = new Map(catalog.skills.map((s) => [num(s.id), s]));
        const topics = new Map(catalog.topics.map((t) => [num(t.id), t]));
        const marks = await marksOf(reader, id);
        // The roster: the class's active students plus anybody who has a mark (moved away since), all through the
        // caller's student policy. A mark of a student the caller may not see is left out.
        const studentPolicy = await studentPolicyOf(c);
        const classmates = await readAllRows(
          database,
          'eduHocVien',
          studentPolicy,
          buildFilter((f) =>
            f.and([
              f.number('lopId').eq(num(test.lopId)),
              f.string('trangThai').eq('dang_hoc'),
            ]),
          ),
          1000,
        );
        const roster = new Map(classmates.map((s) => [num(s.id), s]));
        const missing = [...new Set(marks.map((m) => m.hocVienId))].filter(
          (studentId) => !roster.has(studentId),
        );
        for (const [studentId, row] of await readRowsByIds(
          database,
          'eduHocVien',
          studentPolicy,
          missing,
        ))
          roster.set(studentId, row);
        const visibleMarks = marks.filter((m) => roster.has(m.hocVienId));
        const byStudent = marksByStudent(visibleMarks);
        const students = [...roster.values()].sort((a, b) =>
          asText(a.hoTen).localeCompare(asText(b.hoTen), 'vi'),
        );
        const summaries = students.map((student) =>
          summaryOf(test, student, skills, byStudent.get(num(student.id))),
        );
        return c.json({
          data: {
            bai: testView(test),
            // A test may be edited only while it is a draft with no mark.
            coTheSua:
              asText(test.trangThai) === 'nhap' && visibleMarks.length === 0,
            kyNang: skills.map((skill) => {
              const row = skillRows.get(skill.kyNangId);
              const topic = row ? topics.get(num(row.chuDeId)) : undefined;
              return {
                kyNangId: skill.kyNangId,
                ma: row ? asText(row.ma) : '',
                ten: row ? asText(row.ten) : '',
                chuDe: topic ? asText(topic.ten) : '',
                diemToiDa: skill.diemToiDa,
              };
            }),
            hocVien: students.map((s) => ({
              id: num(s.id),
              ma: asText(s.ma),
              hoTen: asText(s.hoTen),
              levelKey: asText(s.levelKey),
              trangThai: asText(s.trangThai),
            })),
            diem: visibleMarks.map((m) => ({
              hocVienId: m.hocVienId,
              kyNangId: m.kyNangId,
              diem: m.diem,
            })),
            tongHop: summaries,
          },
        });
      },
    );

    // --- Make or edit a test ------------------------------------------------------------------------------------
    router.post(
      '/kiemTra/luu',
      declare('Make a test, or edit one that has no mark yet', 'saveTest'),
      needs('edu.kiemTra', 'manage'),
      apiValidator('json', SaveInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const ten = cleanText(input.ten, NAME_MAX);
        if (ten === undefined) throw invalid('EDU_NAME_INVALID', 'ten');
        const ids = input.kyNang.map((s) => s.kyNangId);
        if (new Set(ids).size !== ids.length)
          throw invalid('EDU_DUPLICATE_SKILL', 'kyNang');
        const basePolicy = policyOf(c, 'eduBaiKiemTra');

        // The class must be one the caller sees (this is what keeps the new test inside their scope).
        const lop = await visibleClass(c, database.connection(), input.lopId);
        // The skills must exist, be active, and belong to the level of the test.
        const catalog = await catalogOf(c);
        const usable = new Set(activeSkills(catalog).map((s) => num(s.id)));
        const known = new Map(catalog.skills.map((s) => [num(s.id), s]));
        const topicLevel = new Map(
          catalog.topics.map((t) => [num(t.id), asText(t.levelKey)]),
        );
        for (const id of ids) {
          const skill = known.get(id);
          if (!skill) throw notFound('EDU_SKILL_NOT_FOUND', 'Skill not found.');
          if (!usable.has(id))
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_SKILL_HIDDEN',
              'This skill is hidden.',
              'kyNang',
            );
          if (topicLevel.get(num(skill.chuDeId)) !== input.levelKey)
            throw invalid(
              'EDU_SKILL_WRONG_LEVEL',
              'kyNang',
              'The skill is not of the level of the test.',
            );
        }

        const executor = await (
          await concurrency.getManager()
        ).createSynchronous(TEST_LOCK);
        const result = await executor.run(() =>
          database.transaction(async (connection) => {
            const repository = connection
              .repository('eduBaiKiemTra')
              .withPolicy(basePolicy);
            const values = {
              ten,
              loai: input.loai,
              levelKey: input.levelKey,
              lopId: input.lopId,
              coSoId: num(lop.coSoId),
              ngay: input.ngay,
              diemDat: input.diemDat,
            };
            let testId: number;
            if (input.id === undefined) {
              const created = await repository.createOne({
                values: {
                  ...values,
                  trangThai: 'nhap',
                  nguoiTaoId: userId,
                  chotLuc: null,
                  createdAt: new Date(),
                },
              });
              testId = num(created.record.id);
            } else {
              testId = input.id;
              const current = await visibleTest(c, connection, testId);
              if (asText(current.trangThai) !== 'nhap')
                throw eduError(
                  'FAILED_PRECONDITION',
                  'EDU_TEST_CLOSED',
                  'A closed test cannot be changed.',
                );
              if (await hasMarks(connection, testId))
                throw eduError(
                  'FAILED_PRECONDITION',
                  'EDU_TEST_HAS_RESULTS',
                  'A test that has marks cannot be changed.',
                );
              await repository.updateOne({
                filter: { id: testId },
                values,
              });
              await connection.query
                .deleteFrom('eduBaiKiemTraKyNang')
                .where('baiKiemTraId', '=', testId)
                .execute();
            }
            await connection.query
              .insertInto('eduBaiKiemTraKyNang')
              .values(
                input.kyNang.map((skill) => ({
                  baiKiemTraId: testId,
                  kyNangId: skill.kyNangId,
                  diemToiDa: skill.diemToiDa,
                })),
              )
              .execute();
            return { id: testId, created: input.id === undefined };
          }),
        );
        return c.json({ data: { id: result.id } }, result.created ? 201 : 200);
      },
    );

    // --- Enter marks --------------------------------------------------------------------------------------------
    router.post(
      '/kiemTra/nhapDiem',
      declare('Enter, change or clear marks of a test', 'enterTestMarks'),
      needs('edu.kiemTra', 'manage'),
      apiValidator('json', EntryInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        const pairs = new Set<string>();
        for (const cell of input.o) {
          const key = `${cell.hocVienId}|${cell.kyNangId}`;
          if (pairs.has(key)) throw invalid('EDU_DUPLICATE_CELL', 'o');
          pairs.add(key);
        }
        const markPolicy = policyOf(c, 'eduKetQuaKiemTra');
        const studentPolicy = await studentPolicyOf(c);
        const executor = await (
          await concurrency.getManager()
        ).createSynchronous(TEST_LOCK);
        const result = await executor.run(() =>
          database.transaction(async (connection) => {
            const test = await visibleTest(c, connection, input.id);
            if (asText(test.trangThai) !== 'nhap')
              throw eduError(
                'FAILED_PRECONDITION',
                'EDU_TEST_CLOSED',
                'A closed test cannot be changed.',
              );
            const top = new Map(
              (await skillsOf(connection, input.id)).map((s) => [
                s.kyNangId,
                s.diemToiDa,
              ]),
            );
            for (const cell of input.o) {
              const max = top.get(cell.kyNangId);
              if (max === undefined)
                throw invalid(
                  'EDU_SKILL_NOT_IN_TEST',
                  'o',
                  'The skill is not part of this test.',
                );
              if (cell.diem !== null && cell.diem > max)
                throw invalid(
                  'EDU_SCORE_OUT_OF_RANGE',
                  'o',
                  'The mark is above the top mark of the skill.',
                );
            }
            // The students, through the caller's policy, and each must be in the class of the test.
            const studentIds = [
              ...new Set(input.o.map((cell) => cell.hocVienId)),
            ];
            const students = await readRowsByIds(
              connection,
              'eduHocVien',
              studentPolicy,
              studentIds,
            );
            for (const studentId of studentIds) {
              const student = students.get(studentId);
              if (!student)
                throw notFound('EDU_STUDENT_NOT_FOUND', 'Student not found.');
              if (num(student.lopId) !== num(test.lopId))
                throw invalid(
                  'EDU_STUDENT_NOT_IN_CLASS',
                  'o',
                  'The student is not in the class of this test.',
                );
            }
            const existing = new Map<string, MarkRow>();
            for (const part of chunksOf(studentIds, 100))
              for (const row of await connection.query
                .selectFrom('eduKetQuaKiemTra')
                .select(['id', 'hocVienId', 'kyNangId', 'diem'])
                .where('baiKiemTraId', '=', input.id)
                .where('hocVienId', 'in', part)
                .execute())
                existing.set(`${num(row.hocVienId)}|${num(row.kyNangId)}`, {
                  id: num(row.id),
                  hocVienId: num(row.hocVienId),
                  kyNangId: num(row.kyNangId),
                  diem: num(row.diem),
                });
            const repository = connection
              .repository('eduKetQuaKiemTra')
              .withPolicy(markPolicy);
            const now = new Date();
            let written = 0;
            let cleared = 0;
            for (const cell of input.o) {
              const before = existing.get(`${cell.hocVienId}|${cell.kyNangId}`);
              if (cell.diem === null) {
                if (before) {
                  await repository.deleteOne({ filter: { id: before.id } });
                  cleared += 1;
                }
                continue;
              }
              if (before) {
                if (before.diem === cell.diem) continue;
                await repository.updateOne({
                  filter: { id: before.id },
                  values: {
                    diem: cell.diem,
                    nguoiNhapId: userId,
                    capNhatLuc: now,
                  },
                });
              } else {
                await repository.createOne({
                  values: {
                    baiKiemTraId: input.id,
                    hocVienId: cell.hocVienId,
                    kyNangId: cell.kyNangId,
                    diem: cell.diem,
                    nguoiNhapId: userId,
                    capNhatLuc: now,
                  },
                });
              }
              written += 1;
            }
            return { written, cleared };
          }),
        );
        return c.json({
          data: { capNhat: result.written, xoa: result.cleared },
        });
      },
    );

    // --- Close a test -------------------------------------------------------------------------------------------
    router.post(
      '/kiemTra/chot',
      declare(
        'Close a test: update what each student has learned',
        'closeTest',
      ),
      needs('edu.kiemTra', 'manage'),
      apiValidator('json', TestInput),
      async (c) => {
        const { id } = c.req.valid('json');
        const userId = currentUserId(c);
        const statePolicy = policyOf(c, 'eduHocVienKyNang');
        const studentPolicy = await studentPolicyOf(c);
        const executor = await (
          await concurrency.getManager()
        ).createSynchronous(TEST_LOCK);
        const result = await executor.run(() =>
          database.transaction(async (connection) => {
            const test = await visibleTest(c, connection, id);
            if (asText(test.trangThai) !== 'nhap')
              throw eduError(
                'FAILED_PRECONDITION',
                'EDU_TEST_CLOSED',
                'The test is already closed.',
              );
            const skills = await skillsOf(connection, id);
            const marks = await marksOf(connection, id);
            if (marks.length === 0)
              throw eduError(
                'FAILED_PRECONDITION',
                'EDU_TEST_NO_RESULTS',
                'Enter at least one mark before closing the test.',
              );
            const studentIds = [...new Set(marks.map((m) => m.hocVienId))];
            const students = await readRowsByIds(
              connection,
              'eduHocVien',
              studentPolicy,
              studentIds,
            );
            const byStudent = marksByStudent(
              marks.filter((m) => students.has(m.hocVienId)),
            );
            const top = new Map(skills.map((s) => [s.kyNangId, s.diemToiDa]));
            const now = new Date();

            // The test was read through the caller's policy above (a test outside the scope never gets here). It is closed
            // first, under a guard on its status: a second close matches no row.
            const closed = await connection.query
              .updateTable('eduBaiKiemTra')
              .set({ trangThai: 'da_chot', chotLuc: now })
              .where('id', '=', id)
              .where('trangThai', '=', 'nhap')
              .execute();
            if (closed.updatedCount !== 1)
              throw eduError(
                'FAILED_PRECONDITION',
                'EDU_TEST_CLOSED',
                'The test is already closed.',
              );

            // The state of each student on each skill that has a mark: the latest assessment is the test.
            const current = new Map<
              string,
              { id: number; mucDo: string; nguon: string }
            >();
            const visibleIds = [...students.keys()];
            for (const part of chunksOf(visibleIds, 500))
              for (const row of await connection.query
                .selectFrom('eduHocVienKyNang')
                .select(['id', 'hocVienId', 'kyNangId', 'mucDo', 'nguon'])
                .where('hocVienId', 'in', part)
                .where(
                  'kyNangId',
                  'in',
                  skills.map((s) => s.kyNangId),
                )
                .execute())
                current.set(`${num(row.hocVienId)}|${num(row.kyNangId)}`, {
                  id: num(row.id),
                  mucDo: asText(row.mucDo),
                  nguon: asText(row.nguon),
                });
            const states = connection
              .repository('eduHocVienKyNang')
              .withPolicy(statePolicy);
            let changed = 0;
            for (const [studentId, own] of byStudent)
              for (const [skillId, mark] of own) {
                const max = top.get(skillId);
                if (max === undefined) continue;
                const mucDo = stateOf(mark, max, num(test.diemDat));
                const before = current.get(`${studentId}|${skillId}`);
                if (before) {
                  if (before.mucDo === mucDo && before.nguon === 'kiem_tra')
                    continue;
                  await states.updateOne({
                    filter: { id: before.id },
                    values: {
                      mucDo,
                      nguon: 'kiem_tra',
                      buoiHocId: null,
                      nguoiChamId: userId,
                      capNhatLuc: now,
                    },
                  });
                } else {
                  await states.createOne({
                    values: {
                      hocVienId: studentId,
                      kyNangId: skillId,
                      mucDo,
                      nguon: 'kiem_tra',
                      buoiHocId: null,
                      nguoiChamId: userId,
                      capNhatLuc: now,
                    },
                  });
                }
                changed += 1;
              }

            const closedTest = { ...test, trangThai: 'da_chot' };
            const passed = [...students.values()]
              .map((student) =>
                summaryOf(
                  closedTest,
                  student,
                  skills,
                  byStudent.get(num(student.id)),
                ),
              )
              .filter((summary) => summary.daKiemTra);
            return {
              changed,
              skipped: studentIds.length - students.size,
              tested: passed.length,
              passed: passed.filter((summary) => summary.dat).length,
              eligible: passed
                .filter((summary) => summary.denLevelKey !== null)
                .map((summary) => ({
                  hocVienId: summary.hocVienId,
                  phanTram: summary.phanTram,
                  denLevelKey: summary.denLevelKey,
                })),
            };
          }),
        );
        return c.json({
          data: {
            id,
            trangThai: 'da_chot',
            capNhatMucDo: result.changed,
            boQua: result.skipped,
            daKiemTra: result.tested,
            dat: result.passed,
            lenCap: result.eligible,
          },
        });
      },
    );

    // --- The tests of one student -------------------------------------------------------------------------------
    router.post(
      '/kiemTra/hocVien',
      declare('The closed tests of one student', 'studentTests'),
      needs('edu.kiemTra', 'view'),
      apiValidator('json', StudentInput),
      async (c) => {
        const { hocVienId } = c.req.valid('json');
        const reader = database.connection();
        const students = await readRowsByIds(
          database,
          'eduHocVien',
          await studentPolicyOf(c),
          [hocVienId],
        );
        const student = students.get(hocVienId);
        if (!student)
          throw notFound('EDU_STUDENT_NOT_FOUND', 'Student not found.');
        // The marks of this student, then the tests among them that the caller's policy lets through and that are closed.
        const marks = (
          await reader.query
            .selectFrom('eduKetQuaKiemTra')
            .select(['baiKiemTraId', 'kyNangId', 'diem'])
            .where('hocVienId', '=', hocVienId)
            .execute()
        ).map((row) => ({
          baiKiemTraId: num(row.baiKiemTraId),
          kyNangId: num(row.kyNangId),
          diem: num(row.diem),
        }));
        const testIds = [...new Set(marks.map((m) => m.baiKiemTraId))];
        const tests = await readRowsByIds(
          database,
          'eduBaiKiemTra',
          policyOf(c, 'eduBaiKiemTra'),
          testIds,
        );
        const closedIds = [...tests.values()]
          .filter((t) => asText(t.trangThai) === 'da_chot')
          .map((t) => num(t.id));
        const skillsByTest = new Map<number, TestSkill[]>();
        for (const part of chunksOf(closedIds, 200))
          for (const row of await reader.query
            .selectFrom('eduBaiKiemTraKyNang')
            .select(['baiKiemTraId', 'kyNangId', 'diemToiDa'])
            .where('baiKiemTraId', 'in', part)
            .orderBy('id')
            .execute()) {
            const list = skillsByTest.get(num(row.baiKiemTraId)) ?? [];
            list.push({
              kyNangId: num(row.kyNangId),
              diemToiDa: num(row.diemToiDa),
            });
            skillsByTest.set(num(row.baiKiemTraId), list);
          }
        const catalog = await catalogOf(c);
        const skillRows = new Map(catalog.skills.map((s) => [num(s.id), s]));
        const data = closedIds
          .map((testId) => {
            const test = tests.get(testId) as Row;
            const skills = skillsByTest.get(testId) ?? [];
            const own = new Map(
              marks
                .filter((m) => m.baiKiemTraId === testId)
                .map((m) => [m.kyNangId, m.diem]),
            );
            const summary = summaryOf(test, student, skills, own);
            return {
              ...testView(test),
              diem: summary.diem,
              toiDa: summary.toiDa,
              phanTram: summary.phanTram,
              dat: summary.dat,
              denLevelKey: summary.denLevelKey,
              kyNang: skills
                .filter((skill) => own.has(skill.kyNangId))
                .map((skill) => {
                  const mark = own.get(skill.kyNangId) as number;
                  const row = skillRows.get(skill.kyNangId);
                  return {
                    kyNangId: skill.kyNangId,
                    ma: row ? asText(row.ma) : '',
                    ten: row ? asText(row.ten) : '',
                    diem: mark,
                    diemToiDa: skill.diemToiDa,
                    mucDo: stateOf(mark, skill.diemToiDa, num(test.diemDat)),
                  };
                }),
            };
          })
          .sort((a, b) => b.ngay.localeCompare(a.ngay) || b.id - a.id);
        return c.json({ data: { hocVienId, baiKiemTra: data } });
      },
    );

    return new Hono().route('/', router);
  }),
];
