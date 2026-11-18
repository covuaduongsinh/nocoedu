import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';

import { anyOfNode, anyOfText } from './filters.js';
import {
  ABSENT_STATUSES,
  PRESENT_STATUSES,
  deriveGaps,
  progressOf,
  type Gap,
  type GapStudent,
  type Progress,
} from './kien-thuc.js';
import { chunksOf, readAllRows, readRowsByIds, type Row } from './read-all.js';

/**
 * What the knowledge system reads and writes from the database (rules without a database are in `kien-thuc.ts`).
 *
 * Every read goes through the policy of the composite action the caller holds (`readAllRows`, `readRowsByIds`), so a
 * coach reaches the students of their classes and a branch manager their branches and nothing else. The one write
 * that does not go through a policy is `refreshTaughtKnowledge`: the register (`/diemDanh/luu`) and the choice of the
 * skills taught (`/buoiHoc/kyNang/luu`) call it in their own transaction, after they have checked the session and the
 * students against the caller's scope, exactly as the register writes the balance ledger.
 */
type Reader = Parameters<typeof readAllRows>[0];
type Query = ReturnType<DatabaseManager['connection']>['query'];

const n = (value: unknown): number => Number(value);

/** The whole curriculum, topics and skills, as stored. */
export async function readCatalog(
  database: Reader,
  policies: { chuDe: RepositoryPolicy; kyNang: RepositoryPolicy },
): Promise<{ topics: Row[]; skills: Row[] }> {
  const topics = await readAllRows(
    database,
    'eduChuDe',
    policies.chuDe,
    undefined,
    5000,
  );
  const skills = await readAllRows(
    database,
    'eduKyNang',
    policies.kyNang,
    undefined,
    20000,
  );
  return { topics, skills };
}

/** The skills a student can be taught or graded on: active, in an active topic. Ordered by topic, then skill. */
export function activeSkills(catalog: { topics: Row[]; skills: Row[] }): Row[] {
  const topics = new Map(
    catalog.topics
      .filter((topic) => topic.trangThai === 'hoat_dong')
      .map((topic) => [n(topic.id), topic]),
  );
  return catalog.skills
    .filter(
      (skill) =>
        skill.trangThai === 'hoat_dong' && topics.has(n(skill.chuDeId)),
    )
    .sort((a, b) => {
      const ta = topics.get(n(a.chuDeId));
      const tb = topics.get(n(b.chuDeId));
      return (
        String(ta?.levelKey).localeCompare(String(tb?.levelKey)) ||
        n(ta?.thuTu) - n(tb?.thuTu) ||
        n(a.chuDeId) - n(b.chuDeId) ||
        n(a.thuTu) - n(b.thuTu) ||
        n(a.id) - n(b.id)
      );
    });
}

export interface KnownState {
  readonly mucDo: string;
  readonly nguon: string;
  readonly buoiHocId: number | null;
  readonly capNhatLuc: unknown;
}

/** The states of some students: student id → skill id → state. Students with none are absent from the map. */
export async function readKnown(
  database: Reader,
  policy: RepositoryPolicy,
  studentIds: readonly number[],
  onlySkills?: ReadonlySet<number>,
): Promise<Map<number, Map<number, KnownState>>> {
  const out = new Map<number, Map<number, KnownState>>();
  for (const part of chunksOf([...new Set(studentIds)], 20)) {
    const rows = await readAllRows(
      database,
      'eduHocVienKyNang',
      policy,
      buildFilter((f) => anyOfNode(f, 'hocVienId', part)),
      20000,
    );
    for (const row of rows) {
      const skillId = n(row.kyNangId);
      if (onlySkills && !onlySkills.has(skillId)) continue;
      const states = out.get(n(row.hocVienId)) ?? new Map<number, KnownState>();
      states.set(skillId, {
        mucDo: String(row.mucDo),
        nguon: String(row.nguon),
        buoiHocId: row.buoiHocId == null ? null : n(row.buoiHocId),
        capNhatLuc: row.capNhatLuc,
      });
      out.set(n(row.hocVienId), states);
    }
  }
  return out;
}

export interface GapPolicies {
  /** `edu.diemDanh` `view`: the absences. */
  readonly diemDanh: RepositoryPolicy;
  /** `edu.buoiHoc` `view`: the sessions (class and date). */
  readonly buoiHoc: RepositoryPolicy;
  /** `edu.kienThuc` `view`: the skills taught. */
  readonly taught: RepositoryPolicy;
  /** `edu.kienThuc` `view`: the states of the students. */
  readonly data: RepositoryPolicy;
}

/**
 * The gaps of students the caller already sees (`students` come from the policy of `edu.hocVien`). Starts from the
 * absences, so the work follows the number of absences and not the number of sessions: the sessions of those absences,
 * the skills they taught, and the states the students already have. See `deriveGaps` for the rule.
 */
export async function readGaps(
  database: Reader,
  policies: GapPolicies,
  students: readonly GapStudent[],
  skillIds?: ReadonlySet<number>,
): Promise<Gap[]> {
  if (students.length === 0) return [];
  const absences: { buoiHocId: number; hocVienId: number }[] = [];
  for (const part of chunksOf(
    students.map((s) => s.id),
    100,
  )) {
    const rows = await readAllRows(
      database,
      'eduDiemDanh',
      policies.diemDanh,
      buildFilter((f) =>
        f.and([
          anyOfNode(f, 'hocVienId', part),
          anyOfText(f, 'trangThai', ABSENT_STATUSES),
        ]),
      ),
      20000,
    );
    for (const row of rows)
      absences.push({
        buoiHocId: n(row.buoiHocId),
        hocVienId: n(row.hocVienId),
      });
  }
  const sessionRows = await readRowsByIds(
    database,
    'eduBuoiHoc',
    policies.buoiHoc,
    absences.map((a) => a.buoiHocId),
  );
  const sessions = [...sessionRows.values()].map((row) => ({
    id: n(row.id),
    lopId: n(row.lopId),
    ngay: String(row.ngay),
  }));
  const taught: {
    buoiHocId: number;
    kyNangId: number;
    nhomId: number | null;
  }[] = [];
  for (const part of chunksOf(
    sessions.map((s) => s.id),
    100,
  )) {
    const rows = await readAllRows(
      database,
      'eduBuoiHocKyNang',
      policies.taught,
      buildFilter((f) => anyOfNode(f, 'buoiHocId', part)),
      20000,
    );
    for (const row of rows)
      taught.push({
        buoiHocId: n(row.buoiHocId),
        kyNangId: n(row.kyNangId),
        nhomId: row.nhomId == null ? null : n(row.nhomId),
      });
  }
  const known = await readKnown(
    database,
    policies.data,
    students.map((s) => s.id),
  );
  return deriveGaps({
    students,
    sessions,
    taught,
    absences,
    known: [...known.entries()].flatMap(([hocVienId, states]) =>
      [...states.entries()].map(([kyNangId, state]) => ({
        hocVienId,
        kyNangId,
        mucDo: state.mucDo,
      })),
    ),
    ...(skillIds ? { skillIds } : {}),
  });
}

/**
 * Brings the `da_hoc` rows that the register writes into line with a session: the skills taught in it and the students
 * marked present (`co_mat`, `hoc_bu`). Idempotent, never overwrites a state a coach graded or another session wrote.
 *
 * 1. The rows this session wrote (`nguon = buoi_hoc`, `mucDo = da_hoc`, `buoiHocId` = the session) are removed: a skill
 *    taken off the list, or a student corrected to absent, no longer counts.
 * 2. Every session that teaches one of the skills involved (this one's and the removed rows') is walked again, and a
 *    student present there who has no state for the skill gets `da_hoc`, pointing at that session. So a skill that a
 *    later make-up session also taught still counts for the student who was present at it.
 *
 * A skill listed for a group (`nhomId`) counts only for the students who are in that group now; one with no group
 * counts for every student present. Does nothing, with two small reads, for a session that teaches nothing and wrote
 * nothing (the case of every register before a coach uses the feature).
 */
export async function refreshTaughtKnowledge(
  query: Query,
  buoiHocId: number,
): Promise<void> {
  const taughtHere = await query
    .selectFrom('eduBuoiHocKyNang')
    .select('kyNangId')
    .where('buoiHocId', '=', buoiHocId)
    .execute();
  const written = await query
    .selectFrom('eduHocVienKyNang')
    .select(['id', 'kyNangId'])
    .where('buoiHocId', '=', buoiHocId)
    .where('nguon', '=', 'buoi_hoc')
    .where('mucDo', '=', 'da_hoc')
    .execute();
  if (taughtHere.length === 0 && written.length === 0) return;
  const skills = [
    ...new Set([...taughtHere, ...written].map((row) => n(row.kyNangId))),
  ];
  for (const part of chunksOf(
    written.map((row) => n(row.id)),
    200,
  )) {
    await query
      .deleteFrom('eduHocVienKyNang')
      .where('id', 'in', part)
      .execute();
  }

  // Every session that teaches one of these skills, with the group each one was taught to.
  const lessons: {
    buoiHocId: number;
    kyNangId: number;
    nhomId: number | null;
  }[] = [];
  for (const part of chunksOf(skills, 200)) {
    const rows = await query
      .selectFrom('eduBuoiHocKyNang')
      .select(['buoiHocId', 'kyNangId', 'nhomId'])
      .where('kyNangId', 'in', part)
      .orderBy('buoiHocId')
      .execute();
    for (const row of rows)
      lessons.push({
        buoiHocId: n(row.buoiHocId),
        kyNangId: n(row.kyNangId),
        nhomId: row.nhomId == null ? null : n(row.nhomId),
      });
  }
  if (lessons.length === 0) return;
  const sessionIds = [...new Set(lessons.map((l) => l.buoiHocId))];
  const present = new Map<number, number[]>();
  for (const part of chunksOf(sessionIds, 200)) {
    const rows = await query
      .selectFrom('eduDiemDanh')
      .select(['buoiHocId', 'hocVienId'])
      .where('buoiHocId', 'in', part)
      .where('trangThai', 'in', [...PRESENT_STATUSES])
      .execute();
    for (const row of rows) {
      const list = present.get(n(row.buoiHocId)) ?? [];
      list.push(n(row.hocVienId));
      present.set(n(row.buoiHocId), list);
    }
  }
  const studentIds = [...new Set([...present.values()].flat())];
  if (studentIds.length === 0) return;
  const groupOf = new Map<number, number | null>();
  const have = new Set<string>();
  for (const part of chunksOf(studentIds, 200)) {
    for (const row of await query
      .selectFrom('eduHocVien')
      .select(['id', 'nhomId'])
      .where('id', 'in', part)
      .execute())
      groupOf.set(n(row.id), row.nhomId == null ? null : n(row.nhomId));
    for (const skillPart of chunksOf(skills, 200)) {
      for (const row of await query
        .selectFrom('eduHocVienKyNang')
        .select(['hocVienId', 'kyNangId'])
        .where('hocVienId', 'in', part)
        .where('kyNangId', 'in', skillPart)
        .execute())
        have.add(`${n(row.hocVienId)}|${n(row.kyNangId)}`);
    }
  }
  const now = new Date();
  const fresh: Record<string, unknown>[] = [];
  for (const lesson of lessons) {
    for (const hocVienId of present.get(lesson.buoiHocId) ?? []) {
      if (lesson.nhomId !== null && groupOf.get(hocVienId) !== lesson.nhomId)
        continue;
      const key = `${hocVienId}|${lesson.kyNangId}`;
      if (have.has(key)) continue;
      have.add(key);
      fresh.push({
        hocVienId,
        kyNangId: lesson.kyNangId,
        mucDo: 'da_hoc',
        nguon: 'buoi_hoc',
        buoiHocId: lesson.buoiHocId,
        nguoiChamId: null,
        capNhatLuc: now,
      });
    }
  }
  for (const part of chunksOf(fresh, 200)) {
    await query.insertInto('eduHocVienKyNang').values(part).execute();
  }
}

export interface StudentSummary extends Progress {
  /** The level the percentage is over: the student's own. */
  readonly levelKey: string;
  /** Gaps over every active skill (a gap from a lower level still counts). */
  readonly canBu: number;
}

/**
 * The two figures of the student file: how much of the student's level has been learned, and how many gaps are open.
 * `policies` are those of the caller; the student must already be one the caller sees.
 */
export async function readStudentSummary(
  database: Reader,
  policies: GapPolicies & { chuDe: RepositoryPolicy; kyNang: RepositoryPolicy },
  student: GapStudent & { levelKey: string },
): Promise<StudentSummary> {
  const catalog = await readCatalog(database, policies);
  const skills = activeSkills(catalog);
  const topicLevel = new Map(
    catalog.topics.map((topic) => [n(topic.id), String(topic.levelKey)]),
  );
  const ofLevel = skills
    .filter((skill) => topicLevel.get(n(skill.chuDeId)) === student.levelKey)
    .map((skill) => n(skill.id));
  const known = (await readKnown(database, policies.data, [student.id])).get(
    student.id,
  );
  const states = new Map(
    [...(known ?? new Map<number, KnownState>()).entries()].map(
      ([id, state]) => [id, state.mucDo],
    ),
  );
  const gaps = await readGaps(
    database,
    policies,
    [student],
    new Set(skills.map((skill) => n(skill.id))),
  );
  return {
    ...progressOf(ofLevel, states),
    levelKey: student.levelKey,
    canBu: gaps.length,
  };
}
