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
import { buildFilter } from '@nocobase/repository-input';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import {
  CURRICULUM_COLUMNS,
  MAX_CURRICULUM_CHARS,
  MAX_CURRICULUM_ROWS,
  SAMPLE_CURRICULUM_ROWS,
  planCurriculum,
  type CurriculumPlan,
} from '../edu/chuong-trinh-csv.js';
import { toCsv } from '../edu/csv.js';
import { anyOfNode } from '../edu/filters.js';
import {
  activeSkills,
  readCatalog,
  readGaps,
  readKnown,
  refreshTaughtKnowledge,
  type KnownState,
} from '../edu/kien-thuc-doc.js';
import {
  DESCRIPTION_MAX,
  KT_STATUSES,
  MAX_CELLS_PER_GRADING,
  MAX_SKILLS_PER_SESSION,
  MUC_DO,
  NAME_MAX,
  cleanCode,
  cleanText,
  progressOf,
  type Gap,
} from '../edu/kien-thuc.js';
import { LEVELS, LEVEL_KEYS, levelOrder } from '../edu/levels.js';
import { asText } from '../edu/names.js';
import { chunksOf, readAllRows, type Row } from '../edu/read-all.js';
import {
  currentUserId,
  eduError,
  needs,
  optionalPolicy,
  policiesOf,
  policyOf,
  requiredPolicy,
  type EduEnv,
} from './edu-support.js';

/**
 * The knowledge system (GĐ 4 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`): the curriculum, the skills taught in a
 * session, the matrix of what each student has learned and the gaps to make up.
 *
 * Every route has `auth.required()` and a composite-action check on its own paths. The curriculum (`edu.chuongTrinh`) is
 * the same for every branch: everybody who holds `view` reads it, only the administrator holds `manage` (topics,
 * skills, CSV import). What a student has learned (`edu.kienThuc`) is read and written through the policies of the
 * action, so a coach reaches the students and sessions of their classes and a branch manager those of their branches;
 * a student, class, group or session outside the scope answers "not found", exactly like one that does not exist.
 *
 * A gap is not stored; `server/edu/kien-thuc.ts` (`deriveGaps`) works it out on every read.
 */
const Id = z.coerce.number().int().positive();
const Order = z.number().int().min(0).max(9999);
const Status = z.enum(KT_STATUSES);
const Level = z.enum(LEVEL_KEYS);

const TopicInput = z.object({
  id: Id.optional(),
  levelKey: Level.optional(),
  ma: z.string().max(80).optional(),
  ten: z.string().max(400).optional(),
  thuTu: Order.optional(),
  trangThai: Status.optional(),
});
const SkillInput = z.object({
  id: Id.optional(),
  chuDeId: Id.optional(),
  ma: z.string().max(80).optional(),
  ten: z.string().max(400).optional(),
  moTa: z.string().max(2000).nullish(),
  thuTu: Order.optional(),
  trangThai: Status.optional(),
  sachId: Id.nullish(),
});
const SortInput = z.object({
  loai: z.enum(['chuDe', 'kyNang']),
  ids: z.array(Id).min(1).max(500),
});
const TreeInput = z.object({ levelKey: Level.optional() });
const CsvBody = z.object({ csv: z.string().max(MAX_CURRICULUM_CHARS) });
const SessionInput = z.object({ buoiHocId: Id });
const TaughtInput = z.object({
  buoiHocId: Id,
  nhomId: Id.nullable().default(null),
  kyNangIds: z.array(Id).max(MAX_SKILLS_PER_SESSION),
});
const MatrixInput = z.object({
  lopId: Id,
  nhomId: Id.optional(),
  levelKey: Level.optional(),
  chuDeId: Id.optional(),
  trang: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const GradeInput = z.object({
  o: z
    .array(
      z.object({
        hocVienId: Id,
        kyNangId: Id,
        mucDo: z.enum(MUC_DO).nullable(),
      }),
    )
    .min(1)
    .max(MAX_CELLS_PER_GRADING),
});
const GapInput = z
  .object({
    lopId: Id.optional(),
    hocVienId: Id.optional(),
    nhomId: Id.optional(),
    levelKey: Level.optional(),
    trang: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((v) => (v.lopId === undefined) !== (v.hocVienId === undefined), {
    message: 'Exactly one of lopId and hocVienId',
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
const nullable = (value: unknown): number | null =>
  value == null ? null : Number(value);
const notFound = (reason: string, message: string) =>
  eduError('NOT_FOUND', reason, message);
const invalid = (reason: string, field: string) =>
  eduError('INVALID_ARGUMENT', reason, 'The value is not valid.', field);

const PATHS = [
  '/chuongTrinh/cay',
  '/chuongTrinh/chuDe/luu',
  '/chuongTrinh/kyNang/luu',
  '/chuongTrinh/sapXep',
  '/chuongTrinh/nhapCsv/mau',
  '/chuongTrinh/nhapCsv/xemTruoc',
  '/chuongTrinh/nhapCsv/xacNhan',
  '/chuongTrinh/xuatCsv',
  '/buoiHoc/kyNang/xem',
  '/buoiHoc/kyNang/luu',
  '/kienThuc/maTran',
  '/kienThuc/cham',
  '/kienThuc/loHong',
  '/kienThuc/hoSo',
];

type Connection = ReturnType<DatabaseManager['connection']>;
type Context = Parameters<typeof policiesOf>[0];

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
        bodyLimit({
          maxSize: path.includes('nhapCsv') ? 2 * 1024 * 1024 : 128 * 1024,
        }),
      );
    }

    // --- Shared reading ------------------------------------------------------------------------------------------
    /** The curriculum, through the policies of `edu.chuongTrinh` `view` (or `manage`, which reads the same). */
    async function catalogOf(c: Context, action: 'view' | 'manage' = 'view') {
      const policies = await policiesOf(c, 'edu.chuongTrinh', action);
      const chuDe = policies.eduChuDe;
      const kyNang = policies.eduKyNang;
      if (!chuDe || !kyNang) throw notPermitted();
      return readCatalog(database, { chuDe, kyNang });
    }

    /** The student, only when the caller's `edu.hocVien` scope covers it. */
    async function visibleStudent(c: Context, hocVienId: number): Promise<Row> {
      const policy = await requiredPolicy(
        c,
        'edu.hocVien',
        'view',
        'eduHocVien',
      );
      const student = await database
        .repository('eduHocVien')
        .withPolicy(policy)
        .findOne({ filter: { id: hocVienId } });
      if (!student)
        throw notFound('EDU_STUDENT_NOT_FOUND', 'Student not found.');
      return student;
    }

    /** The class, only when the caller's `edu.lop` scope covers it. */
    async function visibleClass(c: Context, lopId: number): Promise<Row> {
      const policy = await requiredPolicy(c, 'edu.lop', 'view', 'eduLop');
      const lop = await database
        .repository('eduLop')
        .withPolicy(policy)
        .findOne({ filter: { id: lopId } });
      if (!lop) throw notFound('EDU_CLASS_NOT_FOUND', 'Class not found.');
      return lop;
    }

    /** The group, only when it belongs to the class and the caller's `edu.lopNhom` scope covers it. */
    async function groupOfClass(
      c: Context,
      lopId: number,
      nhomId: number,
    ): Promise<Row> {
      const policy = await optionalPolicy(
        c,
        'edu.lopNhom',
        'view',
        'eduLopNhom',
      );
      const group = policy
        ? await database
            .repository('eduLopNhom')
            .withPolicy(policy)
            .findOne({ filter: { id: nhomId } })
        : null;
      if (!group || num(group.lopId) !== lopId)
        throw notFound('EDU_GROUP_NOT_FOUND', 'Group not found.');
      return group;
    }

    /** The session, only when the caller's `edu.buoiHoc` scope covers it. */
    async function visibleSession(c: Context, buoiHocId: number): Promise<Row> {
      const policy = await requiredPolicy(
        c,
        'edu.buoiHoc',
        'view',
        'eduBuoiHoc',
      );
      const session = await database
        .repository('eduBuoiHoc')
        .withPolicy(policy)
        .findOne({ filter: { id: buoiHocId } });
      if (!session)
        throw notFound('EDU_SESSION_NOT_FOUND', 'Session not found.');
      return session;
    }

    /** The policies the gaps need, read through the composite actions that own each collection. */
    async function gapPolicies(c: Context) {
      const kt = await policiesOf(c, 'edu.kienThuc', 'view');
      const data = kt.eduHocVienKyNang;
      const taught = kt.eduBuoiHocKyNang;
      const diemDanh = await requiredPolicy(
        c,
        'edu.diemDanh',
        'view',
        'eduDiemDanh',
      );
      const buoiHoc = await requiredPolicy(
        c,
        'edu.buoiHoc',
        'view',
        'eduBuoiHoc',
      );
      if (!data || !taught) throw notPermitted();
      return { diemDanh, buoiHoc, taught, data };
    }

    /** Students of one class (active ones), optionally of one group, through the caller's student policy. */
    async function classStudents(
      c: Context,
      lopId: number,
      nhomId?: number,
    ): Promise<Row[]> {
      const policy = await requiredPolicy(
        c,
        'edu.hocVien',
        'view',
        'eduHocVien',
      );
      const rows = await readAllRows(
        database,
        'eduHocVien',
        policy,
        buildFilter((f) =>
          f.and([
            f.number('lopId').eq(lopId),
            f.string('trangThai').eq('dang_hoc'),
            ...(nhomId === undefined ? [] : [f.number('nhomId').eq(nhomId)]),
          ]),
        ),
        1000,
      );
      return rows.sort((a, b) =>
        asText(a.hoTen).localeCompare(asText(b.hoTen), 'vi'),
      );
    }

    const gapStudent = (row: Row) => ({
      id: num(row.id),
      lopId: nullable(row.lopId),
      nhomId: nullable(row.nhomId),
    });

    // --- The curriculum: read ------------------------------------------------------------------------------------
    router.post(
      '/chuongTrinh/cay',
      declare('Read the curriculum: topics and skills', 'readCurriculum'),
      needs('edu.chuongTrinh', 'view'),
      apiValidator('json', TreeInput),
      async (c) => {
        const { levelKey } = c.req.valid('json');
        const catalog = await catalogOf(c);
        const topics = catalog.topics
          .filter((t) => levelKey === undefined || t.levelKey === levelKey)
          .sort(
            (a, b) =>
              (levelOrder(asText(a.levelKey)) ?? 0) -
                (levelOrder(asText(b.levelKey)) ?? 0) ||
              num(a.thuTu) - num(b.thuTu) ||
              num(a.id) - num(b.id),
          );
        const shown = new Set(topics.map((t) => num(t.id)));
        const skills = catalog.skills
          .filter((s) => shown.has(num(s.chuDeId)))
          .sort((a, b) => num(a.thuTu) - num(b.thuTu) || num(a.id) - num(b.id));
        return c.json({
          data: {
            capDo: LEVELS.map((l) => ({
              key: l.key,
              order: l.order,
              title: l.title,
            })),
            chuDe: topics.map(topicView),
            kyNang: skills.map(skillView),
          },
        });
      },
    );

    // --- The curriculum: topics and skills (administrator) --------------------------------------------------------
    router.post(
      '/chuongTrinh/chuDe/luu',
      declare('Add or edit a topic', 'saveTopic'),
      needs('edu.chuongTrinh', 'manage'),
      apiValidator('json', TopicInput),
      async (c) => {
        const input = c.req.valid('json');
        const policy = policyOf(c, 'eduChuDe');
        const topics = database.repository('eduChuDe').withPolicy(policy);
        const ten =
          input.ten === undefined ? undefined : cleanText(input.ten, NAME_MAX);
        if (input.ten !== undefined && !ten)
          throw invalid('EDU_INVALID_VALUE', 'ten');

        if (input.id !== undefined) {
          const row = await topics.findOne({ filter: { id: input.id } });
          if (!row) throw notFound('EDU_TOPIC_NOT_FOUND', 'Topic not found.');
          if (
            (input.levelKey !== undefined && input.levelKey !== row.levelKey) ||
            (input.ma !== undefined && input.ma.trim() !== row.ma)
          )
            throw invalid('EDU_IMMUTABLE_FIELD', 'levelKey');
          const values = {
            ...(ten ? { ten } : {}),
            ...(input.thuTu === undefined ? {} : { thuTu: input.thuTu }),
            ...(input.trangThai === undefined
              ? {}
              : { trangThai: input.trangThai }),
          };
          if (Object.keys(values).length > 0)
            await topics.updateOne({ filter: { id: input.id }, values });
          return c.json({ data: { id: input.id } });
        }

        const ma = cleanCode(input.ma);
        if (!input.levelKey) throw invalid('EDU_INVALID_VALUE', 'levelKey');
        if (!ma) throw invalid('EDU_INVALID_VALUE', 'ma');
        if (!ten) throw invalid('EDU_INVALID_VALUE', 'ten');
        const created = await database.transaction(async (connection) => {
          const repository = connection
            .repository('eduChuDe')
            .withPolicy(policy);
          if (await repository.findOne({ filter: { ma } }))
            throw eduError(
              'ALREADY_EXISTS',
              'EDU_CODE_TAKEN',
              'A topic already has this code.',
              'ma',
            );
          const same = await readAllRows(
            connection,
            'eduChuDe',
            policy,
            { levelKey: input.levelKey },
            5000,
          );
          const thuTu =
            input.thuTu ??
            same.reduce((max, row) => Math.max(max, num(row.thuTu)), 0) + 1;
          const row = await repository.createOne({
            values: {
              levelKey: input.levelKey,
              ma,
              ten,
              thuTu,
              trangThai: input.trangThai ?? 'hoat_dong',
            },
          });
          return num(row.record.id);
        });
        return c.json({ data: { id: created } }, 201);
      },
    );

    router.post(
      '/chuongTrinh/kyNang/luu',
      declare('Add or edit a skill', 'saveSkill'),
      needs('edu.chuongTrinh', 'manage'),
      apiValidator('json', SkillInput),
      async (c) => {
        const input = c.req.valid('json');
        const topicPolicy = policyOf(c, 'eduChuDe');
        const policy = policyOf(c, 'eduKyNang');
        const ten =
          input.ten === undefined ? undefined : cleanText(input.ten, NAME_MAX);
        if (input.ten !== undefined && !ten)
          throw invalid('EDU_INVALID_VALUE', 'ten');
        let moTa: string | null | undefined;
        if (input.moTa !== undefined) {
          moTa =
            input.moTa === null || input.moTa.trim() === ''
              ? null
              : cleanText(input.moTa, DESCRIPTION_MAX);
          if (moTa === undefined) throw invalid('EDU_INVALID_VALUE', 'moTa');
        }
        // A book is named only when the caller may see it (the catalogue is global; an unknown one is just "not found").
        if (input.sachId) {
          const bookPolicy = await optionalPolicy(
            c,
            'edu.sach',
            'view',
            'eduSach',
          );
          const book = bookPolicy
            ? await database
                .repository('eduSach')
                .withPolicy(bookPolicy)
                .findOne({ filter: { id: input.sachId } })
            : null;
          if (!book) throw notFound('EDU_BOOK_NOT_FOUND', 'Book not found.');
        }
        const common = {
          ...(ten ? { ten } : {}),
          ...(moTa === undefined ? {} : { moTa }),
          ...(input.thuTu === undefined ? {} : { thuTu: input.thuTu }),
          ...(input.trangThai === undefined
            ? {}
            : { trangThai: input.trangThai }),
          ...(input.sachId === undefined ? {} : { sachId: input.sachId }),
        };

        if (input.id !== undefined) {
          const skills = database.repository('eduKyNang').withPolicy(policy);
          const row = await skills.findOne({ filter: { id: input.id } });
          if (!row) throw notFound('EDU_SKILL_NOT_FOUND', 'Skill not found.');
          if (
            (input.chuDeId !== undefined &&
              input.chuDeId !== num(row.chuDeId)) ||
            (input.ma !== undefined && input.ma.trim() !== row.ma)
          )
            throw invalid('EDU_IMMUTABLE_FIELD', 'chuDeId');
          if (Object.keys(common).length > 0)
            await skills.updateOne({
              filter: { id: input.id },
              values: common,
            });
          return c.json({ data: { id: input.id } });
        }

        const ma = cleanCode(input.ma);
        if (!input.chuDeId) throw invalid('EDU_INVALID_VALUE', 'chuDeId');
        if (!ma) throw invalid('EDU_INVALID_VALUE', 'ma');
        if (!ten) throw invalid('EDU_INVALID_VALUE', 'ten');
        const created = await database.transaction(async (connection) => {
          const topic = await connection
            .repository('eduChuDe')
            .withPolicy(topicPolicy)
            .findOne({ filter: { id: input.chuDeId } });
          if (!topic) throw notFound('EDU_TOPIC_NOT_FOUND', 'Topic not found.');
          const repository = connection
            .repository('eduKyNang')
            .withPolicy(policy);
          if (await repository.findOne({ filter: { ma } }))
            throw eduError(
              'ALREADY_EXISTS',
              'EDU_CODE_TAKEN',
              'A skill already has this code.',
              'ma',
            );
          const same = await readAllRows(
            connection,
            'eduKyNang',
            policy,
            { chuDeId: input.chuDeId },
            5000,
          );
          const thuTu =
            input.thuTu ??
            same.reduce((max, row) => Math.max(max, num(row.thuTu)), 0) + 1;
          const row = await repository.createOne({
            values: {
              chuDeId: input.chuDeId,
              ma,
              ten,
              moTa: moTa ?? null,
              thuTu,
              trangThai: input.trangThai ?? 'hoat_dong',
              sachId: input.sachId ?? null,
            },
          });
          return num(row.record.id);
        });
        return c.json({ data: { id: created } }, 201);
      },
    );

    router.post(
      '/chuongTrinh/sapXep',
      declare('Put topics or skills in a new order', 'sortCurriculum'),
      needs('edu.chuongTrinh', 'manage'),
      apiValidator('json', SortInput),
      async (c) => {
        const { loai, ids } = c.req.valid('json');
        if (new Set(ids).size !== ids.length)
          throw invalid('EDU_DUPLICATE_ID', 'ids');
        const collection = loai === 'chuDe' ? 'eduChuDe' : 'eduKyNang';
        const policy = policyOf(c, collection);
        await database.transaction(async (connection) => {
          const repository = connection
            .repository(collection)
            .withPolicy(policy);
          const rows: Row[] = [];
          for (const part of chunksOf(ids, 100)) {
            rows.push(
              ...(await readAllRows(
                connection,
                collection,
                policy,
                buildFilter((f) => anyOfNode(f, 'id', part)),
                100,
              )),
            );
          }
          if (rows.length !== ids.length)
            throw notFound('EDU_NOT_FOUND', 'A row was not found.');
          // All rows of one list: the topics of one level, or the skills of one topic.
          const parent = (row: Row) =>
            loai === 'chuDe' ? asText(row.levelKey) : String(row.chuDeId);
          if (new Set(rows.map(parent)).size > 1)
            throw invalid('EDU_SORT_MIXED_PARENT', 'ids');
          for (const [index, id] of ids.entries()) {
            await repository.updateOne({
              filter: { id },
              values: { thuTu: index + 1 },
            });
          }
        });
        return c.json({ data: { soDong: ids.length } });
      },
    );

    // --- The curriculum: CSV -------------------------------------------------------------------------------------
    /** What the file would do against the curriculum and the books the caller may see. Writes nothing. */
    async function planFile(c: Context, csv: string): Promise<CurriculumPlan> {
      const catalog = await catalogOf(c, 'manage');
      const bookPolicy = await optionalPolicy(c, 'edu.sach', 'view', 'eduSach');
      const books = new Map<string, number>();
      if (bookPolicy) {
        for (const book of await readAllRows(
          database,
          'eduSach',
          bookPolicy,
          undefined,
          5000,
        )) {
          const symbol = asText(book.kyHieu).toLowerCase();
          if (symbol) books.set(symbol, num(book.id));
        }
      }
      const result = planCurriculum(csv, {
        topics: catalog.topics.map((t) => ({
          id: num(t.id),
          levelKey: asText(t.levelKey),
          ma: asText(t.ma),
          ten: asText(t.ten),
          thuTu: num(t.thuTu),
        })),
        skills: catalog.skills.map((s) => ({
          id: num(s.id),
          chuDeId: num(s.chuDeId),
          ma: asText(s.ma),
          ten: asText(s.ten),
          moTa: s.moTa == null ? null : asText(s.moTa),
          sachId: nullable(s.sachId),
          thuTu: num(s.thuTu),
        })),
        books,
      });
      const codes = new Set(result.report.problems.map((p) => p.code));
      if (codes.has('FILE_TOO_LARGE') || codes.has('TOO_MANY_ROWS')) {
        throw eduError(
          'INVALID_ARGUMENT',
          'EDU_IMPORT_TOO_LARGE',
          `The file may have at most ${MAX_CURRICULUM_ROWS} rows.`,
          'csv',
        );
      }
      if (codes.has('BAD_ENCODING') || codes.has('MISSING_COLUMN')) {
        throw eduError(
          'INVALID_ARGUMENT',
          'EDU_IMPORT_BAD_FORMAT',
          'The file is not a CSV in the expected format.',
          'csv',
        );
      }
      return result;
    }

    router.post(
      '/chuongTrinh/nhapCsv/mau',
      declare('Download a sample curriculum CSV', 'curriculumImportSample'),
      needs('edu.chuongTrinh', 'manage'),
      async (c) =>
        c.json({
          data: { csv: toCsv(CURRICULUM_COLUMNS, SAMPLE_CURRICULUM_ROWS) },
        }),
    );

    router.post(
      '/chuongTrinh/nhapCsv/xemTruoc',
      declare(
        'Preview a curriculum CSV import; nothing is written',
        'previewCurriculumImport',
      ),
      needs('edu.chuongTrinh', 'manage'),
      apiValidator('json', CsvBody),
      async (c) => {
        const { csv } = c.req.valid('json');
        return c.json({ data: (await planFile(c, csv)).report });
      },
    );

    router.post(
      '/chuongTrinh/nhapCsv/xacNhan',
      declare(
        'Confirm a curriculum CSV import: all rows are written or none',
        'confirmCurriculumImport',
      ),
      needs('edu.chuongTrinh', 'manage'),
      apiValidator('json', CsvBody),
      async (c) => {
        const { csv } = c.req.valid('json');
        const userId = currentUserId(c);
        const startedAt = new Date();
        const topicPolicy = policyOf(c, 'eduChuDe');
        const skillPolicy = policyOf(c, 'eduKyNang');
        // Planning reads the database and the write follows it: two confirmations at once would both plan "create" and
        // the second would fail on the unique code. One import at a time; the plan is made inside the lock.
        const executor = await (
          await concurrency.getManager()
        ).createSynchronous('edu:nhap-chuong-trinh');
        const report = await executor.run(async () => {
          const plan = await planFile(c, csv);
          if (plan.report.problems.length > 0) {
            await logImport(
              database.connection(),
              userId,
              startedAt,
              'tu_choi',
              plan.report,
            );
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_IMPORT_HAS_PROBLEMS',
              'Some rows have a problem; nothing was written.',
            );
          }
          let written = 0;
          await database.transaction(async (connection) => {
            const topics = connection
              .repository('eduChuDe')
              .withPolicy(topicPolicy);
            const skills = connection
              .repository('eduKyNang')
              .withPolicy(skillPolicy);
            const topicId = new Map<string, number>();
            for (const step of plan.topics) {
              if (step.id !== null) topicId.set(step.ma, step.id);
              if (step.action === 'moi') {
                const row = await topics.createOne({
                  values: {
                    levelKey: step.levelKey,
                    ma: step.ma,
                    ten: step.ten,
                    thuTu: step.thuTu,
                    trangThai: 'hoat_dong',
                  },
                });
                topicId.set(step.ma, num(row.record.id));
                written += 1;
              } else if (step.action === 'cap_nhat' && step.id !== null) {
                await topics.updateOne({
                  filter: { id: step.id },
                  values: { ten: step.ten },
                });
                written += 1;
              }
            }
            for (const step of plan.skills) {
              if (step.action === 'moi') {
                const chuDeId = topicId.get(step.chuDeMa);
                if (chuDeId === undefined)
                  throw notFound('EDU_TOPIC_NOT_FOUND', 'Topic not found.');
                await skills.createOne({
                  values: {
                    chuDeId,
                    ma: step.ma,
                    ten: step.ten,
                    moTa: step.moTa,
                    thuTu: step.thuTu,
                    trangThai: 'hoat_dong',
                    sachId: step.sachId,
                  },
                });
                written += 1;
              } else if (step.action === 'cap_nhat' && step.id !== null) {
                await skills.updateOne({
                  filter: { id: step.id },
                  values: {
                    ten: step.ten,
                    moTa: step.moTa,
                    sachId: step.sachId,
                  },
                });
                written += 1;
              }
            }
            await logImport(connection, userId, startedAt, 'thanh_cong', {
              ...plan.report,
              written,
            });
          });
          return { ...plan.report, written };
        });
        return c.json({ data: report });
      },
    );

    router.post(
      '/chuongTrinh/xuatCsv',
      declare('Export the curriculum as CSV', 'exportCurriculum'),
      needs('edu.chuongTrinh', 'view'),
      async (c) => {
        const userId = currentUserId(c);
        // Downloading is its own action, as for every report: whoever may view the curriculum may not take the file.
        await policiesOf(c, 'edu.baoCao', 'export');
        const catalog = await catalogOf(c);
        const bookPolicy = await optionalPolicy(
          c,
          'edu.sach',
          'view',
          'eduSach',
        );
        const symbols = new Map<number, string>();
        if (bookPolicy) {
          for (const book of await readAllRows(
            database,
            'eduSach',
            bookPolicy,
            undefined,
            5000,
          ))
            symbols.set(num(book.id), asText(book.kyHieu));
        }
        const topics = [...catalog.topics].sort(
          (a, b) =>
            (levelOrder(asText(a.levelKey)) ?? 0) -
              (levelOrder(asText(b.levelKey)) ?? 0) ||
            num(a.thuTu) - num(b.thuTu) ||
            num(a.id) - num(b.id),
        );
        const rows: (string | null)[][] = [];
        for (const topic of topics) {
          const mine = catalog.skills
            .filter((s) => num(s.chuDeId) === num(topic.id))
            .sort(
              (a, b) => num(a.thuTu) - num(b.thuTu) || num(a.id) - num(b.id),
            );
          const head = [
            asText(topic.levelKey),
            asText(topic.ma),
            asText(topic.ten),
          ];
          if (mine.length === 0) rows.push([...head, '', '', '', '']);
          for (const skill of mine)
            rows.push([
              ...head,
              asText(skill.ma),
              asText(skill.ten),
              skill.moTa == null ? '' : asText(skill.moTa),
              skill.sachId == null
                ? ''
                : (symbols.get(num(skill.sachId)) ?? ''),
            ]);
        }
        await database
          .connection()
          .query.insertInto('eduXuatDuLieuNhatKy')
          .values({
            userId,
            loai: 'chuong_trinh_csv',
            boLoc: null,
            soDong: rows.length,
            createdAt: new Date(),
          })
          .execute();
        return new Response(toCsv(CURRICULUM_COLUMNS, rows), {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="chuong-trinh.csv"',
            'cache-control': 'no-store',
          },
        });
      },
    );

    // --- Skills taught in a session -----------------------------------------------------------------------------
    router.post(
      '/buoiHoc/kyNang/xem',
      declare('Read the skills taught in a session', 'readSessionSkills'),
      needs('edu.kienThuc', 'view'),
      apiValidator('json', SessionInput),
      async (c) => {
        const { buoiHocId } = c.req.valid('json');
        const session = await visibleSession(c, buoiHocId);
        const rows = await readAllRows(
          database,
          'eduBuoiHocKyNang',
          policyOf(c, 'eduBuoiHocKyNang'),
          { buoiHocId },
          2000,
        );
        return c.json({
          data: {
            buoiHocId,
            lopId: num(session.lopId),
            danhSach: rows.map((row) => ({
              kyNangId: num(row.kyNangId),
              nhomId: nullable(row.nhomId),
            })),
          },
        });
      },
    );

    router.post(
      '/buoiHoc/kyNang/luu',
      declare(
        'Choose the skills taught in a session, for the class or one group',
        'saveSessionSkills',
      ),
      needs('edu.kienThuc', 'record'),
      apiValidator('json', TaughtInput),
      async (c) => {
        const input = c.req.valid('json');
        const ids = [...new Set(input.kyNangIds)];
        const taughtPolicy = policyOf(c, 'eduBuoiHocKyNang');
        const session = await visibleSession(c, input.buoiHocId);
        const lopId = num(session.lopId);
        if (input.nhomId !== null) {
          const group = await groupOfClass(c, lopId, input.nhomId);
          if (group.trangThai !== 'hoat_dong')
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_GROUP_HIDDEN',
              'This group is hidden.',
              'nhomId',
            );
        }
        // Only active skills of active topics may be taught.
        const catalog = await catalogOf(c);
        const usable = new Set(activeSkills(catalog).map((s) => num(s.id)));
        const known = new Set(catalog.skills.map((s) => num(s.id)));
        for (const id of ids) {
          if (!known.has(id))
            throw notFound('EDU_SKILL_NOT_FOUND', 'Skill not found.');
          if (!usable.has(id))
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_SKILL_HIDDEN',
              'This skill is hidden.',
              'kyNangIds',
            );
        }
        const result = await database.transaction(async (connection) => {
          const repository = connection
            .repository('eduBuoiHocKyNang')
            .withPolicy(taughtPolicy);
          const current = (
            await readAllRows(
              connection,
              'eduBuoiHocKyNang',
              taughtPolicy,
              { buoiHocId: input.buoiHocId },
              2000,
            )
          ).filter((row) => nullable(row.nhomId) === input.nhomId);
          const keep = new Set(ids);
          let removed = 0;
          const present = new Set<number>();
          for (const row of current) {
            const skill = num(row.kyNangId);
            if (keep.has(skill) && !present.has(skill)) {
              present.add(skill);
              continue;
            }
            await repository.deleteOne({ filter: { id: num(row.id) } });
            removed += 1;
          }
          let added = 0;
          for (const skill of ids) {
            if (present.has(skill)) continue;
            await repository.createOne({
              values: {
                buoiHocId: input.buoiHocId,
                lopId,
                kyNangId: skill,
                nhomId: input.nhomId,
              },
            });
            added += 1;
          }
          // The students already marked present learn what was added; those of a removed skill lose the row it wrote.
          await refreshTaughtKnowledge(connection.query, input.buoiHocId);
          return { added, removed };
        });
        return c.json({
          data: {
            buoiHocId: input.buoiHocId,
            nhomId: input.nhomId,
            kyNangIds: ids,
            them: result.added,
            bo: result.removed,
          },
        });
      },
    );

    // --- The matrix ---------------------------------------------------------------------------------------------
    router.post(
      '/kienThuc/maTran',
      declare(
        'The matrix of a class: students by skills of one level',
        'knowledgeMatrix',
      ),
      needs('edu.kienThuc', 'view'),
      apiValidator('json', MatrixInput),
      async (c) => {
        const input = c.req.valid('json');
        const lop = await visibleClass(c, input.lopId);
        if (input.nhomId !== undefined)
          await groupOfClass(c, input.lopId, input.nhomId);
        const levelKey = input.levelKey ?? asText(lop.levelKey);
        const catalog = await catalogOf(c);
        const usable = activeSkills(catalog);
        const levelTopics = catalog.topics
          .filter((t) => t.trangThai === 'hoat_dong' && t.levelKey === levelKey)
          .sort((a, b) => num(a.thuTu) - num(b.thuTu) || num(a.id) - num(b.id));
        const levelTopicIds = new Set(levelTopics.map((t) => num(t.id)));
        if (input.chuDeId !== undefined && !levelTopicIds.has(input.chuDeId))
          throw notFound('EDU_TOPIC_NOT_FOUND', 'Topic not found.');
        const levelSkills = usable.filter((s) =>
          levelTopicIds.has(num(s.chuDeId)),
        );
        // The columns are the skills of one topic: the one asked for, or else the first of the level (a level may have
        // hundreds of skills, too many for one grid). The progress of each student is always over the whole level.
        const shownTopicId = input.chuDeId ?? num(levelTopics[0]?.id);
        const shownSkills = levelSkills.filter(
          (s) => num(s.chuDeId) === shownTopicId,
        );
        const levelSkillIds = new Set(levelSkills.map((s) => num(s.id)));

        const everyone = await classStudents(c, input.lopId, input.nhomId);
        const offset = (input.trang - 1) * input.limit;
        const page = everyone.slice(offset, offset + input.limit);
        const policies = await gapPolicies(c);
        const known = await readKnown(
          database,
          policies.data,
          page.map((s) => num(s.id)),
          levelSkillIds,
        );
        const shownIds = new Set(shownSkills.map((s) => num(s.id)));
        const cells = [...known.entries()].flatMap(([hocVienId, states]) =>
          [...states.entries()]
            .filter(([kyNangId]) => shownIds.has(kyNangId))
            .map(([kyNangId, state]) => ({
              hocVienId,
              kyNangId,
              mucDo: state.mucDo,
              nguon: state.nguon,
            })),
        );
        // Which skills this class has been taught at all (for the class or for the group being looked at).
        const taught = await readAllRows(
          database,
          'eduBuoiHocKyNang',
          policies.taught,
          { lopId: input.lopId },
          20000,
        );
        const daDay = [
          ...new Set(
            taught
              .filter(
                (row) =>
                  input.nhomId === undefined ||
                  row.nhomId == null ||
                  num(row.nhomId) === input.nhomId,
              )
              .map((row) => num(row.kyNangId))
              .filter((id) => shownIds.has(id)),
          ),
        ];
        const gaps = await readGaps(
          database,
          policies,
          page.map(gapStudent),
          levelSkillIds,
        );
        const gapCount = new Map<number, number>();
        for (const gap of gaps)
          gapCount.set(gap.hocVienId, (gapCount.get(gap.hocVienId) ?? 0) + 1);
        return c.json({
          data: {
            lop: {
              id: num(lop.id),
              ma: asText(lop.ma),
              ten: asText(lop.ten),
              levelKey: asText(lop.levelKey),
            },
            levelKey,
            nhomId: input.nhomId ?? null,
            chuDeId: levelTopics.length > 0 ? shownTopicId : null,
            chuDe: levelTopics.map(topicView),
            kyNang: shownSkills.map(skillView),
            hocVien: page.map((s) => ({
              id: num(s.id),
              ma: asText(s.ma),
              hoTen: asText(s.hoTen),
              nhomId: nullable(s.nhomId),
              ...progressOf(
                [...levelSkillIds],
                new Map(
                  [
                    ...(
                      known.get(num(s.id)) ?? new Map<number, KnownState>()
                    ).entries(),
                  ].map(([id, state]) => [id, state.mucDo]),
                ),
              ),
              canBu: gapCount.get(num(s.id)) ?? 0,
            })),
            o: cells,
            daDay,
            tong: everyone.length,
            trang: input.trang,
            limit: input.limit,
          },
        });
      },
    );

    // --- Grading by hand ----------------------------------------------------------------------------------------
    router.post(
      '/kienThuc/cham',
      declare('Grade cells of the matrix by hand', 'gradeKnowledge'),
      needs('edu.kienThuc', 'record'),
      apiValidator('json', GradeInput),
      async (c) => {
        const { o } = c.req.valid('json');
        const userId = currentUserId(c);
        const pairs = new Set<string>();
        for (const cell of o) {
          const key = `${cell.hocVienId}|${cell.kyNangId}`;
          if (pairs.has(key)) throw invalid('EDU_DUPLICATE_CELL', 'o');
          pairs.add(key);
        }
        const studentPolicy = await requiredPolicy(
          c,
          'edu.hocVien',
          'view',
          'eduHocVien',
        );
        const dataPolicy = policyOf(c, 'eduHocVienKyNang');
        const studentIds = [...new Set(o.map((cell) => cell.hocVienId))];
        const seen = new Set<number>();
        for (const part of chunksOf(studentIds, 100)) {
          for (const row of await readAllRows(
            database,
            'eduHocVien',
            studentPolicy,
            buildFilter((f) => anyOfNode(f, 'id', part)),
            100,
          ))
            seen.add(num(row.id));
        }
        if (studentIds.some((id) => !seen.has(id)))
          throw notFound('EDU_STUDENT_NOT_FOUND', 'Student not found.');
        const catalog = await catalogOf(c);
        const usable = new Set(activeSkills(catalog).map((s) => num(s.id)));
        const exists = new Set(catalog.skills.map((s) => num(s.id)));
        for (const cell of o) {
          if (!exists.has(cell.kyNangId))
            throw notFound('EDU_SKILL_NOT_FOUND', 'Skill not found.');
          if (!usable.has(cell.kyNangId))
            throw eduError(
              'FAILED_PRECONDITION',
              'EDU_SKILL_HIDDEN',
              'This skill is hidden.',
              'o',
            );
        }
        const result = await database.transaction(async (connection) => {
          const repository = connection
            .repository('eduHocVienKyNang')
            .withPolicy(dataPolicy);
          const current = await readKnown(
            connection,
            dataPolicy,
            studentIds,
            new Set(o.map((cell) => cell.kyNangId)),
          );
          const rows = new Map<string, number>();
          for (const part of chunksOf(studentIds, 20)) {
            for (const row of await readAllRows(
              connection,
              'eduHocVienKyNang',
              dataPolicy,
              buildFilter((f) => anyOfNode(f, 'hocVienId', part)),
              20000,
            ))
              rows.set(
                `${num(row.hocVienId)}|${num(row.kyNangId)}`,
                num(row.id),
              );
          }
          let changed = 0;
          let cleared = 0;
          const now = new Date();
          for (const cell of o) {
            const before = current.get(cell.hocVienId)?.get(cell.kyNangId);
            const rowId = rows.get(`${cell.hocVienId}|${cell.kyNangId}`);
            if (cell.mucDo === null) {
              if (rowId !== undefined) {
                await repository.deleteOne({ filter: { id: rowId } });
                cleared += 1;
              }
              continue;
            }
            if (rowId !== undefined) {
              if (before?.mucDo === cell.mucDo && before.nguon === 'cham_tay')
                continue;
              await repository.updateOne({
                filter: { id: rowId },
                values: {
                  mucDo: cell.mucDo,
                  nguon: 'cham_tay',
                  nguoiChamId: userId,
                  capNhatLuc: now,
                },
              });
            } else {
              await repository.createOne({
                values: {
                  hocVienId: cell.hocVienId,
                  kyNangId: cell.kyNangId,
                  mucDo: cell.mucDo,
                  nguon: 'cham_tay',
                  buoiHocId: null,
                  nguoiChamId: userId,
                  capNhatLuc: now,
                },
              });
            }
            changed += 1;
          }
          return { changed, cleared };
        });
        return c.json({
          data: { capNhat: result.changed, xoa: result.cleared },
        });
      },
    );

    // --- Gaps to make up ----------------------------------------------------------------------------------------
    /** The rows the gap list and the student file show, with the names of the skill and its topic. */
    function describeGaps(
      gaps: readonly Gap[],
      catalog: { topics: Row[]; skills: Row[] },
    ) {
      const topics = new Map(catalog.topics.map((t) => [num(t.id), t]));
      const skills = new Map(catalog.skills.map((s) => [num(s.id), s]));
      return gaps
        .map((gap) => {
          const skill = skills.get(gap.kyNangId);
          const topic = skill ? topics.get(num(skill.chuDeId)) : undefined;
          return { gap, skill, topic };
        })
        .filter(
          (item): item is { gap: Gap; skill: Row; topic: Row } =>
            item.skill !== undefined && item.topic !== undefined,
        );
    }

    router.post(
      '/kienThuc/loHong',
      declare(
        'The skills a class or a student has to make up',
        'knowledgeGaps',
      ),
      needs('edu.kienThuc', 'view'),
      apiValidator('json', GapInput),
      async (c) => {
        const input = c.req.valid('json');
        const catalog = await catalogOf(c);
        const usable = activeSkills(catalog);
        const topicLevel = new Map(
          catalog.topics.map((t) => [num(t.id), asText(t.levelKey)]),
        );
        const wanted = new Set(
          usable
            .filter(
              (s) =>
                input.levelKey === undefined ||
                topicLevel.get(num(s.chuDeId)) === input.levelKey,
            )
            .map((s) => num(s.id)),
        );
        let students: Row[];
        let mode: 'lop' | 'hocVien';
        if (input.lopId !== undefined) {
          await visibleClass(c, input.lopId);
          if (input.nhomId !== undefined)
            await groupOfClass(c, input.lopId, input.nhomId);
          students = await classStudents(c, input.lopId, input.nhomId);
          mode = 'lop';
        } else {
          students = [await visibleStudent(c, input.hocVienId as number)];
          mode = 'hocVien';
        }
        const gaps = await readGaps(
          database,
          await gapPolicies(c),
          students.map(gapStudent),
          wanted,
        );
        const byName = new Map(students.map((s) => [num(s.id), s]));
        const described = describeGaps(gaps, catalog);
        const bySkill = new Map<
          number,
          {
            skill: Row;
            topic: Row;
            hocVien: {
              hocVienId: number;
              ma: string;
              hoTen: string;
              lyDo: string;
              ngay: string | null;
              buoiHocId: number | null;
            }[];
          }
        >();
        for (const { gap, skill, topic } of described) {
          const entry = bySkill.get(gap.kyNangId) ?? {
            skill,
            topic,
            hocVien: [],
          };
          const student = byName.get(gap.hocVienId);
          entry.hocVien.push({
            hocVienId: gap.hocVienId,
            ma: asText(student?.ma),
            hoTen: asText(student?.hoTen),
            lyDo: gap.lyDo,
            ngay: gap.ngay,
            buoiHocId: gap.buoiHocId,
          });
          bySkill.set(gap.kyNangId, entry);
        }
        const order = new Map(usable.map((s, index) => [num(s.id), index]));
        const list = [...bySkill.entries()]
          .sort(
            ([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0) || a - b,
          )
          .map(([kyNangId, entry]) => ({
            kyNangId,
            ma: asText(entry.skill.ma),
            ten: asText(entry.skill.ten),
            chuDeId: num(entry.topic.id),
            chuDe: asText(entry.topic.ten),
            levelKey: asText(entry.topic.levelKey),
            hocVien: entry.hocVien.sort((x, y) =>
              x.hoTen.localeCompare(y.hoTen, 'vi'),
            ),
          }));
        const offset = (input.trang - 1) * input.limit;
        return c.json({
          data: {
            che: mode,
            tong: list.length,
            tongCap: gaps.length,
            trang: input.trang,
            limit: input.limit,
            kyNang: list.slice(offset, offset + input.limit),
          },
        });
      },
    );

    // --- The knowledge of one student (tab of the student file) -----------------------------------------------------
    router.post(
      '/kienThuc/hoSo',
      declare(
        'The curriculum with one student’s state on every skill',
        'studentKnowledge',
      ),
      needs('edu.kienThuc', 'view'),
      apiValidator('json', StudentInput),
      async (c) => {
        const { hocVienId } = c.req.valid('json');
        const student = await visibleStudent(c, hocVienId);
        const catalog = await catalogOf(c);
        const policies = await gapPolicies(c);
        const usable = activeSkills(catalog);
        const known =
          (await readKnown(database, policies.data, [hocVienId])).get(
            hocVienId,
          ) ?? new Map<number, KnownState>();
        const gaps = await readGaps(
          database,
          policies,
          [gapStudent(student)],
          new Set(usable.map((s) => num(s.id))),
        );
        const gapOf = new Map(gaps.map((g) => [g.kyNangId, g]));
        const topicsByLevel = new Map<string, Row[]>();
        for (const topic of catalog.topics.filter(
          (t) => t.trangThai === 'hoat_dong',
        ))
          topicsByLevel.set(asText(topic.levelKey), [
            ...(topicsByLevel.get(asText(topic.levelKey)) ?? []),
            topic,
          ]);
        const levels = LEVELS.map((level) => {
          const topics = (topicsByLevel.get(level.key) ?? []).sort(
            (a, b) => num(a.thuTu) - num(b.thuTu) || num(a.id) - num(b.id),
          );
          const topicIds = new Set(topics.map((t) => num(t.id)));
          const skills = usable.filter((s) => topicIds.has(num(s.chuDeId)));
          return {
            levelKey: level.key,
            ...progressOf(
              skills.map((s) => num(s.id)),
              new Map([...known.entries()].map(([id, st]) => [id, st.mucDo])),
            ),
            chuDe: topics.map((topic) => ({
              ...topicView(topic),
              kyNang: skills
                .filter((s) => num(s.chuDeId) === num(topic.id))
                .map((skill) => {
                  const state = known.get(num(skill.id));
                  const gap = gapOf.get(num(skill.id));
                  return {
                    ...skillView(skill),
                    mucDo: state?.mucDo ?? null,
                    nguon: state?.nguon ?? null,
                    canBu: gap?.lyDo ?? null,
                    ngayVang: gap?.ngay ?? null,
                  };
                }),
            })),
          };
        });
        const described = describeGaps(gaps, catalog).map(
          ({ gap, skill, topic }) => ({
            kyNangId: gap.kyNangId,
            ma: asText(skill.ma),
            ten: asText(skill.ten),
            chuDe: asText(topic.ten),
            levelKey: asText(topic.levelKey),
            lyDo: gap.lyDo,
            ngay: gap.ngay,
          }),
        );
        return c.json({
          data: {
            hocVienId,
            levelKey: asText(student.levelKey),
            capDo: levels,
            canBu: described,
          },
        });
      },
    );

    return new Hono().route('/', router);
  }),
];

const notPermitted = () =>
  eduError(
    'PERMISSION_DENIED',
    'EDU_PERMISSION_DENIED',
    'This action is not allowed.',
  );

function topicView(topic: Row) {
  return {
    id: num(topic.id),
    levelKey: asText(topic.levelKey),
    ma: asText(topic.ma),
    ten: asText(topic.ten),
    thuTu: num(topic.thuTu),
    trangThai: asText(topic.trangThai),
  };
}

function skillView(skill: Row) {
  return {
    id: num(skill.id),
    chuDeId: num(skill.chuDeId),
    ma: asText(skill.ma),
    ten: asText(skill.ten),
    moTa: skill.moTa == null ? null : asText(skill.moTa),
    thuTu: num(skill.thuTu),
    trangThai: asText(skill.trangThai),
    sachId: nullable(skill.sachId),
  };
}

/** One log row per confirmation: who, when, outcome and counts. Never the file. */
async function logImport(
  connection: Pick<Connection, 'query'>,
  userId: string,
  startedAt: Date,
  trangThai: 'thanh_cong' | 'tu_choi',
  report: object,
): Promise<void> {
  await connection.query
    .insertInto('eduNhapLarkNhatKy')
    .values({
      batDauLuc: startedAt,
      ketThucLuc: new Date(),
      nguoiChayId: userId,
      trangThai,
      tongKet: { nguon: 'csv_chuong_trinh', ...report },
    })
    .execute();
}
