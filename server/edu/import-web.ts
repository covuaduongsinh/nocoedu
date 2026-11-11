import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';

import {
  REQUIRED_COLUMNS,
  nameKey,
  parseCsv,
  readRow,
  type Candidate,
  type ImportProblem,
} from './import-csv.js';
import { levelOrder } from './levels.js';
import { asText, codeFromId } from './names.js';

/**
 * Import of students and their parents from a CSV file uploaded on the students page: a preview that writes nothing,
 * then a confirmation that writes everything in one transaction or nothing at all.
 *
 * Row rules are those of `import-csv.ts` (name, birth year, 10-digit phone, level key). What differs from the command
 * line import is how a repeat is treated, matching the Lark import (`lark/ke-hoach.ts`): a student or a parent that
 * already exists is never created again, only the missing link is added, so a file can be run twice.
 *
 * - A student is the same one when the normalized name, the birth year and the branch agree.
 * - A parent is the same one when the phone number agrees, but only among the parents the caller may see (a parent of
 *   another branch is never reused: that would link the caller to it; `/phuHuynh/taoMoi` does the same).
 * - A row whose student already has a parent with that phone changes nothing (`hocVienTrung`).
 * - The same student and phone twice in one file is a mistake (`DUPLICATE_IN_FILE`).
 *
 * The report holds counts and reason codes by line number — never a name or a phone number (knowledge document 05).
 */
export const MAX_IMPORT_ROWS = 2000;
/** Characters of the CSV text the server accepts (about 500 KB). */
export const MAX_IMPORT_CHARS = 512 * 1024;

export interface ImportCounts {
  /** Students that will be created. */
  readonly hocVienMoi: number;
  /** Rows whose student already has this parent: nothing changes. */
  readonly hocVienTrung: number;
  /** Rows whose student exists and only gets a new parent link. */
  readonly chiLienKet: number;
  readonly phuHuynhMoi: number;
  readonly phuHuynhDungLai: number;
  readonly lienKetMoi: number;
}

export interface WebImportReport extends ImportCounts {
  readonly rows: number;
  readonly problems: readonly { line: number; code: ImportProblem }[];
  /** CSV rows that changed data (0 on a preview or when there are problems). */
  readonly written: number;
}

export interface ImportScope {
  readonly branchIds: ReadonlySet<number>;
  readonly classIds: ReadonlySet<number>;
}

type Query = ReturnType<DatabaseManager['connection']>['query'];

interface Step {
  readonly row: Candidate;
  readonly action: 'tao' | 'lien_ket' | 'trung';
  readonly studentKey: string;
}

export interface ImportPlan {
  readonly report: WebImportReport;
  readonly steps: readonly Step[];
  readonly students: ReadonlyMap<string, number>;
  readonly parents: ReadonlyMap<string, number>;
  readonly links: ReadonlySet<string>;
}

const studentKeyOf = (c: Candidate): string =>
  `${nameKey(c.hoTen)}|${c.namSinh}|${c.coSoId}`;
const linkKey = (studentId: number, parentId: number): string =>
  `${studentId}:${parentId}`;

const empty = (
  rows: number,
  problems: WebImportReport['problems'],
): WebImportReport => ({
  rows,
  problems,
  written: 0,
  hocVienMoi: 0,
  hocVienTrung: 0,
  chiLienKet: 0,
  phuHuynhMoi: 0,
  phuHuynhDungLai: 0,
  lienKetMoi: 0,
});

/**
 * Reads the file and the database and works out what an import would do. Writes nothing.
 * `reusableParents` answers which of the phones belong to a parent the caller may see (id by phone).
 */
export async function planImport(
  query: Query,
  csvText: string,
  scope: ImportScope,
  reusableParents: (
    phones: readonly string[],
  ) => Promise<ReadonlyMap<string, number>>,
): Promise<ImportPlan> {
  const none = {
    steps: [],
    students: new Map<string, number>(),
    parents: new Map<string, number>(),
    links: new Set<string>(),
  };
  if (csvText.length > MAX_IMPORT_CHARS) {
    return {
      ...none,
      report: empty(0, [{ line: 1, code: 'FILE_TOO_LARGE' }]),
    };
  }
  if (csvText.includes('\u0000')) {
    return {
      ...none,
      report: empty(0, [{ line: 1, code: 'BAD_ENCODING' }]),
    };
  }
  const table = parseCsv(csvText);
  const rowCount = Math.max(table.length - 1, 0);
  const header = (table[0] ?? []).map((value) => value.trim());
  if (
    REQUIRED_COLUMNS.some((name) => !header.includes(name)) ||
    csvText.includes('\uFFFD')
  ) {
    return {
      ...none,
      report: empty(rowCount, [
        {
          line: 1,
          code: csvText.includes('\uFFFD') ? 'BAD_ENCODING' : 'MISSING_COLUMN',
        },
      ]),
    };
  }
  if (rowCount > MAX_IMPORT_ROWS) {
    return {
      ...none,
      report: empty(rowCount, [
        { line: MAX_IMPORT_ROWS + 2, code: 'TOO_MANY_ROWS' },
      ]),
    };
  }
  const column = (row: string[], name: string): string =>
    (row[header.indexOf(name)] ?? '').trim();

  const branches = new Map<string, number>();
  for (const row of await query
    .selectFrom('eduCoSo')
    .select(['id', 'ma'])
    .execute())
    branches.set(asText(row.ma), Number(row.id));
  const classes = new Map<string, { id: number; coSoId: number }>();
  for (const row of await query
    .selectFrom('eduLop')
    .select(['id', 'ma', 'coSoId'])
    .execute())
    classes.set(asText(row.ma), {
      id: Number(row.id),
      coSoId: Number(row.coSoId),
    });

  // Pass 1: validate every row.
  const problems: { line: number; code: ImportProblem }[] = [];
  const candidates: Candidate[] = [];
  table.slice(1).forEach((row, index) => {
    const read = readRow(row, index + 2, column, { branches, classes });
    if ('code' in read) {
      problems.push(read);
      return;
    }
    // The branch and class exist; the caller may import only into those in their own scope.
    if (!scope.branchIds.has(read.coSoId)) {
      problems.push({ line: read.line, code: 'OUT_OF_SCOPE_BRANCH' });
      return;
    }
    if (read.lopId !== null && !scope.classIds.has(read.lopId)) {
      problems.push({ line: read.line, code: 'OUT_OF_SCOPE_CLASS' });
      return;
    }
    candidates.push(read);
  });

  // The students already in the branches of the file, with the phones of their parents.
  const branchIds = [...new Set(candidates.map((c) => c.coSoId))];
  const students = new Map<string, number>();
  const idsOfStudents = new Set<number>();
  for (const part of chunks(branchIds, 200)) {
    for (const row of await query
      .selectFrom('eduHocVien')
      .select(['id', 'hoTen', 'namSinh', 'coSoId'])
      .where('coSoId', 'in', part)
      .execute()) {
      students.set(
        `${nameKey(asText(row.hoTen))}|${Number(row.namSinh)}|${Number(row.coSoId)}`,
        Number(row.id),
      );
      idsOfStudents.add(Number(row.id));
    }
  }
  const phoneOfParent = new Map<number, string>();
  const links = new Set<string>();
  const phonesLinked = new Map<number, Set<string>>();
  for (const part of chunks([...idsOfStudents], 200)) {
    for (const link of await query
      .selectFrom('eduHocVienPhuHuynh')
      .select(['hocVienId', 'phuHuynhId'])
      .where('hocVienId', 'in', part)
      .execute()) {
      links.add(linkKey(Number(link.hocVienId), Number(link.phuHuynhId)));
      phoneOfParent.set(Number(link.phuHuynhId), '');
    }
  }
  for (const part of chunks([...phoneOfParent.keys()], 200)) {
    for (const row of await query
      .selectFrom('eduPhuHuynh')
      .select(['id', 'soDienThoai'])
      .where('id', 'in', part)
      .execute())
      phoneOfParent.set(Number(row.id), asText(row.soDienThoai));
  }
  for (const key of links) {
    const [studentId, parentId] = key.split(':').map(Number) as [
      number,
      number,
    ];
    const set = phonesLinked.get(studentId) ?? new Set<string>();
    set.add(phoneOfParent.get(parentId) ?? '');
    phonesLinked.set(studentId, set);
  }
  const parents = new Map(
    await reusableParents([...new Set(candidates.map((c) => c.phone))]),
  );

  // Pass 2: decide what each row does, in file order, so a later row sees what an earlier row creates.
  const steps: Step[] = [];
  const counts = {
    hocVienMoi: 0,
    hocVienTrung: 0,
    chiLienKet: 0,
    phuHuynhMoi: 0,
    phuHuynhDungLai: 0,
    lienKetMoi: 0,
  };
  const createdStudents = new Set<string>();
  // Phones that earlier rows of this file already attached to a student.
  const phonesInFile = new Map<string, Set<string>>();
  const parentSeen = new Set<string>();
  for (const row of candidates) {
    const studentKey = studentKeyOf(row);
    const studentId = students.get(studentKey);
    if (phonesInFile.get(studentKey)?.has(row.phone)) {
      problems.push({ line: row.line, code: 'DUPLICATE_IN_FILE' });
      continue;
    }
    if (
      studentId !== undefined &&
      phonesLinked.get(studentId)?.has(row.phone)
    ) {
      counts.hocVienTrung += 1;
      steps.push({ row, action: 'trung', studentKey });
      continue;
    }
    const exists = studentId !== undefined || createdStudents.has(studentKey);
    if (exists) counts.chiLienKet += 1;
    else {
      counts.hocVienMoi += 1;
      createdStudents.add(studentKey);
    }
    if (parents.has(row.phone) || parentSeen.has(row.phone)) {
      counts.phuHuynhDungLai += 1;
    } else {
      counts.phuHuynhMoi += 1;
    }
    parentSeen.add(row.phone);
    counts.lienKetMoi += 1;
    const set = phonesInFile.get(studentKey) ?? new Set<string>();
    set.add(row.phone);
    phonesInFile.set(studentKey, set);
    steps.push({ row, action: exists ? 'lien_ket' : 'tao', studentKey });
  }
  problems.sort((a, b) => a.line - b.line);
  return {
    report: { ...empty(rowCount, problems), ...counts },
    steps,
    students,
    parents,
    links,
  };
}

export const hasScopeProblem = (report: WebImportReport): boolean =>
  report.problems.some((p) => p.code.startsWith('OUT_OF_SCOPE'));

export interface ImportRepositories {
  readonly hocVien: RepositoryPolicy;
}

/**
 * Writes a plan with no problems in one transaction and returns the report with `written` set. Each collection is
 * written through the policy of the `import` action; parents and links are created like `/phuHuynh/taoMoi` does,
 * after the scope checks of the plan.
 */
export async function applyImport(
  database: DatabaseManager,
  plan: ImportPlan,
  policies: ImportRepositories,
  log: (query: Query) => Promise<void>,
): Promise<WebImportReport> {
  const studentIds = new Map(plan.students);
  const parentIds = new Map(plan.parents);
  const links = new Set(plan.links);
  let written = 0;
  await database.transaction(async (connection) => {
    for (const { row, action, studentKey } of plan.steps) {
      if (action === 'trung') continue;
      let studentId = studentIds.get(studentKey);
      if (studentId === undefined) {
        const student = await connection
          .repository('eduHocVien')
          .withPolicy(policies.hocVien)
          .createOne({
            values: {
              ma: `TMP-${crypto.randomUUID()}`,
              hoTen: row.hoTen,
              namSinh: row.namSinh,
              levelKey: row.levelKey,
              levelOrder: levelOrder(row.levelKey) ?? 1,
              lopId: row.lopId,
              coSoId: row.coSoId,
              trangThai: 'dang_hoc',
              ghiChuHlv: null,
              soBuoiConLai: 0,
            },
          });
        studentId = Number(student.record.id);
        await connection.query
          .updateTable('eduHocVien')
          .set({ ma: codeFromId('HS', studentId) })
          .where('id', '=', studentId)
          .execute();
        studentIds.set(studentKey, studentId);
      }
      let parentId = parentIds.get(row.phone);
      if (parentId === undefined) {
        const parent = await connection.repository('eduPhuHuynh').createOne({
          values: {
            ma: `TMP-${crypto.randomUUID()}`,
            hoTen: row.parentName,
            soDienThoai: row.phone,
            zalo: row.zalo,
            ghiChu: null,
          },
        });
        parentId = Number(parent.record.id);
        await connection.query
          .updateTable('eduPhuHuynh')
          .set({ ma: codeFromId('PH', parentId) })
          .where('id', '=', parentId)
          .execute();
        parentIds.set(row.phone, parentId);
      }
      if (!links.has(linkKey(studentId, parentId))) {
        await connection.repository('eduHocVienPhuHuynh').createOne({
          values: {
            hocVienId: studentId,
            phuHuynhId: parentId,
            quanHe: row.quanHe,
            // The first parent of a student is the main contact; later rows add contacts.
            lienHeChinh: action === 'tao',
          },
        });
        links.add(linkKey(studentId, parentId));
      }
      written += 1;
    }
    await log(connection.query);
  });
  return { ...plan.report, written };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}
