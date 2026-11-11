import type { DatabaseManager } from '@nocobase/db';

import { LEVEL_KEYS, levelOrder } from './levels.js';
import { asText, codeFromId, normalizePhone } from './names.js';

/**
 * Import of students and their parents from a CSV file, all or nothing.
 *
 * Columns (header row required): `hoTen`, `namSinh`, `coSoMa`, `lopMa` (optional), `capHienTai` (optional,
 * default `tot`), `phuHuynhHoTen`, `phuHuynhSdt`, `phuHuynhZalo` (optional), `quanHe` (optional, default `khac`).
 * A row is a duplicate when the same name, birth year and parent phone number already exist, in the database or earlier
 * in the file. Any duplicate or invalid row stops the whole import: nothing is written. The result names rows by line
 * number and reason only — never a name or a phone number — so it is safe to print or log.
 */
export const IMPORT_COLUMNS = [
  'hoTen',
  'namSinh',
  'coSoMa',
  'lopMa',
  'capHienTai',
  'phuHuynhHoTen',
  'phuHuynhSdt',
  'phuHuynhZalo',
  'quanHe',
] as const;

const RELATIONS = ['bo', 'me', 'ong', 'ba', 'nguoi_giam_ho', 'khac'];

export type ImportProblem =
  | 'MISSING_COLUMN'
  | 'MISSING_FIELD'
  | 'BAD_YEAR'
  | 'BAD_PHONE'
  | 'UNKNOWN_BRANCH'
  | 'UNKNOWN_CLASS'
  | 'CLASS_NOT_IN_BRANCH'
  | 'BAD_LEVEL'
  | 'BAD_RELATION'
  | 'DUPLICATE_IN_FILE'
  | 'DUPLICATE_EXISTING'
  // Only the web import.
  | 'BRANCH_PAUSED'
  | 'CLASS_CLOSED'
  | 'AMBIGUOUS_STUDENT'
  | 'TOO_MANY_ROWS'
  | 'FILE_TOO_LARGE'
  | 'BAD_ENCODING';

export interface ImportReport {
  readonly rows: number;
  readonly valid: number;
  readonly problems: readonly { line: number; code: ImportProblem }[];
  /** Rows written (0 on a dry run or when there are problems). */
  readonly written: number;
}

/** Parses CSV text (quotes, doubled quotes, CRLF, a leading byte order mark). Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

/** Name in a comparable form: Unicode-normalized, lower case, single spaces. */
export const nameKey = (value: string): string =>
  value.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();

const duplicateKey = (name: string, year: number, phone: string): string =>
  `${nameKey(name)}|${year}|${phone}`;

export interface Candidate {
  line: number;
  hoTen: string;
  namSinh: number;
  coSoId: number;
  lopId: number | null;
  levelKey: string;
  parentName: string;
  phone: string;
  zalo: string | null;
  quanHe: string;
}

export const REQUIRED_COLUMNS = [
  'hoTen',
  'namSinh',
  'coSoMa',
  'phuHuynhHoTen',
  'phuHuynhSdt',
] as const;

export interface RowLookups {
  readonly branches: ReadonlyMap<string, number>;
  readonly classes: ReadonlyMap<string, { id: number; coSoId: number }>;
}

/**
 * Validates and normalizes one data row (name kept as typed, phone to 10 digits, level to its key). Returns the
 * candidate, or the line and reason code of the first problem. Duplicates are decided by the caller.
 */
export function readRow(
  row: string[],
  line: number,
  column: (row: string[], name: string) => string,
  lookups: RowLookups,
): Candidate | { line: number; code: ImportProblem } {
  const fail = (code: ImportProblem) => ({ line, code });
  const hoTen = column(row, 'hoTen');
  const parentName = column(row, 'phuHuynhHoTen');
  const rawPhone = column(row, 'phuHuynhSdt');
  const coSoMa = column(row, 'coSoMa');
  if (!hoTen || !parentName || !rawPhone || !coSoMa || !column(row, 'namSinh'))
    return fail('MISSING_FIELD');
  const year = Number(column(row, 'namSinh'));
  if (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear())
    return fail('BAD_YEAR');
  const phone = normalizePhone(rawPhone);
  if (!/^0\d{8,10}$/u.test(phone)) return fail('BAD_PHONE');
  const coSoId = lookups.branches.get(coSoMa);
  if (coSoId === undefined) return fail('UNKNOWN_BRANCH');
  let lopId: number | null = null;
  const lopMa = column(row, 'lopMa');
  if (lopMa) {
    const lop = lookups.classes.get(lopMa);
    if (!lop) return fail('UNKNOWN_CLASS');
    if (lop.coSoId !== coSoId) return fail('CLASS_NOT_IN_BRANCH');
    lopId = lop.id;
  }
  const levelKey = column(row, 'capHienTai') || 'tot';
  if (!(LEVEL_KEYS as readonly string[]).includes(levelKey))
    return fail('BAD_LEVEL');
  const quanHe = column(row, 'quanHe') || 'khac';
  if (!RELATIONS.includes(quanHe)) return fail('BAD_RELATION');
  return {
    line,
    hoTen,
    namSinh: year,
    coSoId,
    lopId,
    levelKey,
    parentName,
    phone,
    zalo: column(row, 'phuHuynhZalo') || null,
    quanHe,
  };
}

export async function importStudents(
  database: DatabaseManager,
  csvText: string,
  options: { dryRun: boolean },
): Promise<ImportReport> {
  const table = parseCsv(csvText);
  const header = (table[0] ?? []).map((value) => value.trim());
  const missing = REQUIRED_COLUMNS.filter((name) => !header.includes(name));
  if (missing.length > 0) {
    return {
      rows: Math.max(table.length - 1, 0),
      valid: 0,
      problems: [{ line: 1, code: 'MISSING_COLUMN' }],
      written: 0,
    };
  }
  const column = (row: string[], name: string): string =>
    (row[header.indexOf(name)] ?? '').trim();

  const query = database.connection().query;
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

  // Students already known, by name + birth year + phone of a linked parent.
  const known = new Set<string>();
  const students = await query
    .selectFrom('eduHocVien')
    .select(['id', 'hoTen', 'namSinh'])
    .execute();
  const byId = new Map(students.map((s) => [Number(s.id), s]));
  const links = await query
    .selectFrom('eduHocVienPhuHuynh')
    .select(['hocVienId', 'phuHuynhId'])
    .execute();
  const parents = new Map<number, string>();
  for (const row of await query
    .selectFrom('eduPhuHuynh')
    .select(['id', 'soDienThoai'])
    .execute())
    parents.set(Number(row.id), asText(row.soDienThoai));
  for (const link of links) {
    const student = byId.get(Number(link.hocVienId));
    const phone = parents.get(Number(link.phuHuynhId));
    if (student && phone)
      known.add(
        duplicateKey(asText(student.hoTen), Number(student.namSinh), phone),
      );
  }

  const problems: { line: number; code: ImportProblem }[] = [];
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  table.slice(1).forEach((row, index) => {
    const line = index + 2;
    const read = readRow(row, line, column, { branches, classes });
    if ('code' in read) {
      problems.push(read);
      return;
    }
    const key = duplicateKey(read.hoTen, read.namSinh, read.phone);
    if (seen.has(key)) {
      problems.push({ line, code: 'DUPLICATE_IN_FILE' });
      return;
    }
    if (known.has(key)) {
      problems.push({ line, code: 'DUPLICATE_EXISTING' });
      return;
    }
    seen.add(key);
    candidates.push(read);
  });

  const rows = Math.max(table.length - 1, 0);
  if (problems.length > 0 || options.dryRun) {
    return { rows, valid: candidates.length, problems, written: 0 };
  }

  await database.transaction(async (connection) => {
    const parentIds = new Map<string, number>();
    for (const [id, phone] of parents) parentIds.set(phone, id);
    for (const item of candidates) {
      const student = await connection.repository('eduHocVien').createOne({
        values: {
          ma: `TMP-${crypto.randomUUID()}`,
          hoTen: item.hoTen,
          namSinh: item.namSinh,
          levelKey: item.levelKey,
          levelOrder: levelOrder(item.levelKey) ?? 1,
          lopId: item.lopId,
          coSoId: item.coSoId,
          trangThai: 'dang_hoc',
          ghiChuHlv: null,
          soBuoiConLai: 0,
        },
      });
      const studentId = Number(student.record.id);
      await connection.query
        .updateTable('eduHocVien')
        .set({ ma: codeFromId('HS', studentId) })
        .where('id', '=', studentId)
        .execute();
      let parentId = parentIds.get(item.phone);
      if (parentId === undefined) {
        const parent = await connection.repository('eduPhuHuynh').createOne({
          values: {
            ma: `TMP-${crypto.randomUUID()}`,
            hoTen: item.parentName,
            soDienThoai: item.phone,
            zalo: item.zalo,
            ghiChu: null,
          },
        });
        parentId = Number(parent.record.id);
        await connection.query
          .updateTable('eduPhuHuynh')
          .set({ ma: codeFromId('PH', parentId) })
          .where('id', '=', parentId)
          .execute();
        parentIds.set(item.phone, parentId);
      }
      await connection.repository('eduHocVienPhuHuynh').createOne({
        values: {
          hocVienId: studentId,
          phuHuynhId: parentId,
          quanHe: item.quanHe,
          lienHeChinh: true,
        },
      });
    }
  });
  return {
    rows,
    valid: candidates.length,
    problems,
    written: candidates.length,
  };
}
