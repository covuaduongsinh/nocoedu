import { parseCsv } from './import-csv.js';
import {
  CODE_MAX,
  DESCRIPTION_MAX,
  NAME_MAX,
  cleanCode,
  cleanText,
  levelFromCell,
} from './kien-thuc.js';
import type { LevelKey } from './levels.js';

/**
 * Import of the curriculum (topics and skills) from a CSV file, like the student import: a preview that writes nothing,
 * then a confirmation that writes everything in one transaction or nothing. The planning is a pure function of the file
 * and of what the database already holds, so it is tested without a database (`server/routes/edu-kien-thuc.ts` reads
 * the database and writes the steps).
 *
 * One row is one skill, or one topic when `maKyNang` and `tenKyNang` are both empty. A topic repeats on every row of
 * its skills and must say the same level and the same name each time. Rows are matched by code (`maChuDe`,
 * `maKyNang`), so a file can be imported again: an existing code is updated (name, description, book), never created
 * twice. The level of an existing topic and the topic of an existing skill never change, and the import never changes a
 * status (a topic or skill is hidden on the page). New topics and skills are appended after the ones already there,
 * in the order of the file. The report holds counts and reason codes by line number only.
 */
export const CURRICULUM_COLUMNS = [
  'cap',
  'maChuDe',
  'tenChuDe',
  'maKyNang',
  'tenKyNang',
  'moTa',
  'kyHieuSach',
] as const;
const REQUIRED = [
  'cap',
  'maChuDe',
  'tenChuDe',
  'maKyNang',
  'tenKyNang',
] as const;

export const MAX_CURRICULUM_ROWS = 3000;
/** Characters of the CSV text the server accepts (about 500 KB). */
export const MAX_CURRICULUM_CHARS = 512 * 1024;

export type CurriculumProblem =
  | 'FILE_TOO_LARGE'
  | 'TOO_MANY_ROWS'
  | 'BAD_ENCODING'
  | 'MISSING_COLUMN'
  | 'MISSING_FIELD'
  | 'BAD_LEVEL'
  | 'BAD_CODE'
  | 'BAD_NAME'
  | 'BAD_DESCRIPTION'
  | 'UNKNOWN_BOOK'
  | 'TOPIC_CONFLICT'
  | 'TOPIC_OTHER_LEVEL'
  | 'SKILL_OTHER_TOPIC'
  | 'DUPLICATE_SKILL_IN_FILE';

export interface CurriculumTopic {
  readonly id: number;
  readonly levelKey: string;
  readonly ma: string;
  readonly ten: string;
  readonly thuTu: number;
}
export interface CurriculumSkill {
  readonly id: number;
  readonly chuDeId: number;
  readonly ma: string;
  readonly ten: string;
  readonly moTa: string | null;
  readonly sachId: number | null;
  readonly thuTu: number;
}

export interface TopicStep {
  readonly ma: string;
  readonly levelKey: LevelKey;
  readonly ten: string;
  readonly thuTu: number;
  readonly id: number | null;
  readonly action: 'moi' | 'cap_nhat' | 'giu';
}
export interface SkillStep {
  readonly ma: string;
  readonly chuDeMa: string;
  readonly ten: string;
  readonly moTa: string | null;
  readonly sachId: number | null;
  readonly thuTu: number;
  readonly id: number | null;
  readonly action: 'moi' | 'cap_nhat' | 'giu';
}

export interface CurriculumReport {
  readonly rows: number;
  readonly problems: readonly { line: number; code: CurriculumProblem }[];
  readonly chuDeMoi: number;
  readonly chuDeCapNhat: number;
  readonly kyNangMoi: number;
  readonly kyNangCapNhat: number;
  readonly giuNguyen: number;
  /** Rows written (0 on a preview or when there are problems). */
  readonly written: number;
}

export interface CurriculumPlan {
  readonly report: CurriculumReport;
  readonly topics: readonly TopicStep[];
  readonly skills: readonly SkillStep[];
}

const emptyReport = (
  rows: number,
  problems: CurriculumReport['problems'],
): CurriculumReport => ({
  rows,
  problems,
  chuDeMoi: 0,
  chuDeCapNhat: 0,
  kyNangMoi: 0,
  kyNangCapNhat: 0,
  giuNguyen: 0,
  written: 0,
});

const refused = (
  rows: number,
  line: number,
  code: CurriculumProblem,
): CurriculumPlan => ({
  report: emptyReport(rows, [{ line, code }]),
  topics: [],
  skills: [],
});

/** The text of a CSV file the club can fill in: the header and two made-up example rows. */
export const SAMPLE_CURRICULUM_ROWS = [
  [
    'tot',
    'T01',
    'Làm quen bàn cờ',
    'T01-01',
    'Nhận biết các ô và hàng, cột',
    'Gọi tên được ô, hàng, cột và đường chéo',
    '',
  ],
  ['tot', 'T01', 'Làm quen bàn cờ', 'T01-02', 'Cách đi của con tốt', '', ''],
] as const;

export function planCurriculum(
  csvText: string,
  existing: {
    readonly topics: readonly CurriculumTopic[];
    readonly skills: readonly CurriculumSkill[];
    /** Book symbol (lower case) → book id, for the books the caller may see. */
    readonly books: ReadonlyMap<string, number>;
  },
): CurriculumPlan {
  if (csvText.length > MAX_CURRICULUM_CHARS)
    return refused(0, 1, 'FILE_TOO_LARGE');
  if (csvText.includes('\u0000') || csvText.includes('�'))
    return refused(0, 1, 'BAD_ENCODING');
  const table = parseCsv(csvText);
  const rowCount = Math.max(table.length - 1, 0);
  const header = (table[0] ?? []).map((value) => value.trim());
  if (REQUIRED.some((name) => !header.includes(name)))
    return refused(rowCount, 1, 'MISSING_COLUMN');
  if (rowCount > MAX_CURRICULUM_ROWS)
    return refused(rowCount, MAX_CURRICULUM_ROWS + 2, 'TOO_MANY_ROWS');
  const cell = (row: string[], name: string): string =>
    header.includes(name) ? (row[header.indexOf(name)] ?? '').trim() : '';

  const topicByMa = new Map(existing.topics.map((t) => [t.ma, t]));
  const skillByMa = new Map(existing.skills.map((s) => [s.ma, s]));
  const topicMaById = new Map(existing.topics.map((t) => [t.id, t.ma]));
  // Next order number per level (topics) and per topic code (skills): after what is already there.
  const nextTopicOrder = new Map<string, number>();
  for (const t of existing.topics)
    nextTopicOrder.set(
      t.levelKey,
      Math.max(nextTopicOrder.get(t.levelKey) ?? 0, t.thuTu),
    );
  const nextSkillOrder = new Map<string, number>();
  for (const s of existing.skills) {
    const topicMa = topicMaById.get(s.chuDeId);
    if (topicMa)
      nextSkillOrder.set(
        topicMa,
        Math.max(nextSkillOrder.get(topicMa) ?? 0, s.thuTu),
      );
  }

  const problems: { line: number; code: CurriculumProblem }[] = [];
  const topics = new Map<string, TopicStep>();
  const skills: SkillStep[] = [];
  const seenSkill = new Map<string, string>();

  table.slice(1).forEach((row, index) => {
    const line = index + 2;
    const fail = (code: CurriculumProblem) => {
      problems.push({ line, code });
    };
    const rawLevel = cell(row, 'cap');
    const rawTopicMa = cell(row, 'maChuDe');
    const rawTopicName = cell(row, 'tenChuDe');
    const rawSkillMa = cell(row, 'maKyNang');
    const rawSkillName = cell(row, 'tenKyNang');
    if (!rawLevel || !rawTopicMa || !rawTopicName) return fail('MISSING_FIELD');
    // A skill needs both its code and its name; a topic-only row has neither.
    if ((rawSkillMa === '') !== (rawSkillName === ''))
      return fail('MISSING_FIELD');
    const levelKey = levelFromCell(rawLevel);
    if (!levelKey) return fail('BAD_LEVEL');
    const topicMa = cleanCode(rawTopicMa);
    if (!topicMa) return fail('BAD_CODE');
    const topicName = cleanText(rawTopicName, NAME_MAX);
    if (!topicName) return fail('BAD_NAME');

    const before = topics.get(topicMa);
    if (before) {
      if (before.levelKey !== levelKey || before.ten !== topicName)
        return fail('TOPIC_CONFLICT');
    } else {
      const known = topicByMa.get(topicMa);
      if (known && known.levelKey !== levelKey)
        return fail('TOPIC_OTHER_LEVEL');
      const order = known
        ? known.thuTu
        : (nextTopicOrder.get(levelKey) ?? 0) + 1;
      if (!known) nextTopicOrder.set(levelKey, order);
      topics.set(topicMa, {
        ma: topicMa,
        levelKey,
        ten: topicName,
        thuTu: order,
        id: known?.id ?? null,
        action: !known ? 'moi' : known.ten === topicName ? 'giu' : 'cap_nhat',
      });
    }
    if (rawSkillMa === '') return;

    const skillMa = cleanCode(rawSkillMa);
    if (!skillMa || skillMa.length > CODE_MAX) return fail('BAD_CODE');
    const skillName = cleanText(rawSkillName, NAME_MAX);
    if (!skillName) return fail('BAD_NAME');
    const known = skillByMa.get(skillMa);
    // A column the file does not have leaves an existing skill's value alone; a column that is there but empty clears it.
    const rawDescription = cell(row, 'moTa');
    let description: string | null = header.includes('moTa')
      ? null
      : (known?.moTa ?? null);
    if (rawDescription) {
      description = cleanText(rawDescription, DESCRIPTION_MAX) ?? null;
      if (!description) return fail('BAD_DESCRIPTION');
    }
    const rawBook = cell(row, 'kyHieuSach');
    let sachId: number | null = header.includes('kyHieuSach')
      ? null
      : (known?.sachId ?? null);
    if (rawBook) {
      const id = existing.books.get(rawBook.toLowerCase());
      if (id === undefined) return fail('UNKNOWN_BOOK');
      sachId = id;
    }
    if (seenSkill.has(skillMa)) return fail('DUPLICATE_SKILL_IN_FILE');
    seenSkill.set(skillMa, topicMa);
    if (known && topicMaById.get(known.chuDeId) !== topicMa)
      return fail('SKILL_OTHER_TOPIC');
    const order = known ? known.thuTu : (nextSkillOrder.get(topicMa) ?? 0) + 1;
    if (!known) nextSkillOrder.set(topicMa, order);
    skills.push({
      ma: skillMa,
      chuDeMa: topicMa,
      ten: skillName,
      moTa: description,
      sachId,
      thuTu: order,
      id: known?.id ?? null,
      action: !known
        ? 'moi'
        : known.ten === skillName &&
            (known.moTa ?? null) === description &&
            (known.sachId ?? null) === sachId
          ? 'giu'
          : 'cap_nhat',
    });
  });

  const topicSteps = [...topics.values()];
  const count = (steps: readonly { action: string }[], action: string) =>
    steps.filter((step) => step.action === action).length;
  return {
    report: {
      rows: rowCount,
      problems,
      chuDeMoi: count(topicSteps, 'moi'),
      chuDeCapNhat: count(topicSteps, 'cap_nhat'),
      kyNangMoi: count(skills, 'moi'),
      kyNangCapNhat: count(skills, 'cap_nhat'),
      giuNguyen: count(topicSteps, 'giu') + count(skills, 'giu'),
      written: 0,
    },
    topics: topicSteps,
    skills,
  };
}
