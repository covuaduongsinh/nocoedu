import type { DatabaseManager } from '@nocobase/db';

import { asText } from '../names.js';
import { dateVn, linkIds, numberOf, textOf } from './gia-tri.js';
import type { LarkData } from './nguon.js';

type Query = ReturnType<DatabaseManager['connection']>['query'];

/**
 * The books of the club (DS-61 phase E): the table `Sách` of the Base (37 rows) becomes the rows of `eduSach`.
 *
 * - A book is keyed by its symbol (`Ký hiệu sách`) and by the Lark record id (`externalId = lark:sach:<rec>`); a book
 *   already written is never edited (the catalogue is the club's from then on).
 * - A symbol that NocoEdu already holds without the Lark id (typed in by hand) is left alone and reported.
 * - A row with no symbol, a symbol twice on Lark, or a symbol or title too long is left out and reported by its Lark id;
 *   a missing title takes the symbol, a missing or invalid price is 0. Never a name or a title in the output.
 */

export interface SachRow {
  /** `lark:sach:<record id>`. */
  readonly externalId: string;
  readonly kyHieu: string;
  readonly ten: string;
  readonly giaBia: number;
  readonly giaBan: number;
}

export interface SachProblem {
  readonly id: string;
  readonly code: string;
}

/** A book handed to a student (`Từng lần phát sách`), priced from the catalogue row it points to. */
export interface PhatSachRow {
  /** `lark:phatsach:<record id>`. */
  readonly externalId: string;
  /** The `HocVien` record id (the external id of the student in NocoEdu). */
  readonly hocVienKey: string;
  /** The `Sách` record id and its symbol (the symbol finds a book typed in by hand). */
  readonly sachKey: string;
  readonly kyHieu: string;
  /** `YYYY-MM-DD`. */
  readonly ngay: string;
  readonly uuDai: number;
  /** `giaBan - uuDai` of the book on Lark. */
  readonly tienSach: number;
}

/** A book a student is learning or has finished (`HocVien`.`Sách đang học` / `Sách đã học`). */
export interface SachHocRow {
  /** `lark:sachhoc:<student record id>:<book record id>`. */
  readonly externalId: string;
  readonly hocVienKey: string;
  readonly sachKey: string;
  readonly kyHieu: string;
  readonly trangThai: 'dang_hoc' | 'da_hoc';
}

export interface SachPlan {
  /** False when the app cannot see the table `Sách`. */
  readonly doc: boolean;
  readonly rows: readonly SachRow[];
  readonly problems: readonly SachProblem[];
  readonly warnings: readonly SachProblem[];
  /** The handouts of `Từng lần phát sách` (empty when the app cannot see it: `phatDoc`). */
  readonly phatDoc: boolean;
  readonly phat: readonly PhatSachRow[];
  readonly phatProblems: readonly SachProblem[];
  /** The book money parents paid (`Tiền sách` of `Tổng Deal`), one row per payment with a student and a day. */
  readonly nop: readonly NopSachRow[];
  readonly nopProblems: readonly SachProblem[];
  /** The books of each student; `hocBoQua` counts the links to a student or a book the import does not hold. */
  readonly hoc: readonly SachHocRow[];
  readonly hocBoQua: number;
}

/** Book money paid by a parent (`Tổng Deal`.`Tiền sách`): it feeds the book fund of the student. */
export interface NopSachRow {
  /** `lark:tongdeal-sach:<record id>`. */
  readonly externalId: string;
  readonly hocVienKey: string;
  /** `YYYY-MM-DD`. */
  readonly ngay: string;
  readonly soTien: number;
}

export const EMPTY_SACH: SachPlan = {
  doc: false,
  rows: [],
  problems: [],
  warnings: [],
  phatDoc: false,
  phat: [],
  phatProblems: [],
  nop: [],
  nopProblems: [],
  hoc: [],
  hocBoQua: 0,
};

const SYMBOL_MAX = 32;
const TITLE_MAX = 191;

const price = (cell: unknown): number | null => {
  const value = numberOf(cell);
  if (value === null) return null;
  return Number.isInteger(value) && value >= 0 ? value : Number.NaN;
};

export function lapSach(
  data: Pick<
    LarkData,
    | 'sach'
    | 'sachDoc'
    | 'phatSach'
    | 'phatSachDoc'
    | 'tongDeal'
    | 'tongDealDoc'
    | 'hocVien'
  >,
  students: ReadonlySet<string> = new Set(),
): SachPlan {
  if (!data.sachDoc) return EMPTY_SACH;
  const rows: SachRow[] = [];
  const problems: SachProblem[] = [];
  const warnings: SachProblem[] = [];
  const seen = new Map<string, string>();
  for (const record of [...data.sach].sort((a, b) =>
    a.recordId.localeCompare(b.recordId),
  )) {
    const f = record.fields;
    const kyHieu = textOf(f['Ký hiệu sách']).normalize('NFC');
    if (!kyHieu) {
      problems.push({ id: record.recordId, code: 'SACH_THIEU_KY_HIEU' });
      continue;
    }
    if (kyHieu.length > SYMBOL_MAX) {
      problems.push({ id: record.recordId, code: 'SACH_QUA_DAI' });
      continue;
    }
    const key = kyHieu.toLowerCase();
    if (seen.has(key)) {
      problems.push({ id: record.recordId, code: 'SACH_TRUNG_KY_HIEU' });
      continue;
    }
    seen.set(key, record.recordId);
    let ten = textOf(f['Tên sách']).normalize('NFC');
    if (!ten) {
      warnings.push({ id: record.recordId, code: 'SACH_THIEU_TEN' });
      ten = kyHieu;
    }
    if (ten.length > TITLE_MAX) {
      problems.push({ id: record.recordId, code: 'SACH_QUA_DAI' });
      continue;
    }
    const giaBia = price(f['Giá bìa']);
    const giaBan = price(f['Giá bán cho PH']);
    if (
      giaBia === null ||
      Number.isNaN(giaBia) ||
      giaBan === null ||
      Number.isNaN(giaBan)
    )
      warnings.push({ id: record.recordId, code: 'SACH_THIEU_GIA' });
    rows.push({
      externalId: `lark:sach:${record.recordId}`,
      kyHieu,
      ten,
      giaBia: giaBia === null || Number.isNaN(giaBia) ? 0 : giaBia,
      giaBan: giaBan === null || Number.isNaN(giaBan) ? 0 : giaBan,
    });
  }
  const phat = lapPhatSach(data, rows, students);
  return {
    doc: true,
    rows,
    problems,
    warnings,
    phatDoc: data.phatSachDoc,
    ...phat,
    ...lapNopSach(data, students),
    ...lapSachHoc(data, rows, students),
  };
}

/**
 * The books of every student: `Sách đã học` (finished) and `Sách đang học` (learning); a book in both counts as
 * finished. A link to a student or a book the import leaves out is counted, never guessed.
 */
function lapSachHoc(
  data: Pick<LarkData, 'hocVien'>,
  books: readonly SachRow[],
  students: ReadonlySet<string>,
): { hoc: SachHocRow[]; hocBoQua: number } {
  const byRecord = new Map(
    books.map((row) => [row.externalId.slice('lark:sach:'.length), row]),
  );
  const hoc: SachHocRow[] = [];
  let hocBoQua = 0;
  for (const student of [...data.hocVien].sort((a, b) =>
    a.recordId.localeCompare(b.recordId),
  )) {
    if (!students.has(student.recordId)) continue;
    const state = new Map<string, 'dang_hoc' | 'da_hoc'>();
    for (const id of linkIds(student.fields['Sách đang học']))
      state.set(id, 'dang_hoc');
    for (const id of linkIds(student.fields['Sách đã học']))
      state.set(id, 'da_hoc');
    for (const [sachKey, trangThai] of state) {
      const book = byRecord.get(sachKey);
      if (!book) {
        hocBoQua += 1;
        continue;
      }
      hoc.push({
        externalId: `lark:sachhoc:${student.recordId}:${sachKey}`,
        hocVienKey: student.recordId,
        sachKey,
        kyHieu: book.kyHieu,
        trangThai,
      });
    }
  }
  return { hoc, hocBoQua };
}

/**
 * The book money of `Tổng Deal`: `Tiền sách` of a row with one student and a day. A row without a student, a student
 * left out or a day is reported (with its Lark id), never guessed. `Mua khác` is not book money and is not read here.
 */
function lapNopSach(
  data: Pick<LarkData, 'tongDeal' | 'tongDealDoc'>,
  students: ReadonlySet<string>,
): { nop: NopSachRow[]; nopProblems: SachProblem[] } {
  const nop: NopSachRow[] = [];
  const nopProblems: SachProblem[] = [];
  if (!data.tongDealDoc) return { nop, nopProblems };
  for (const record of [...data.tongDeal].sort((a, b) =>
    a.recordId.localeCompare(b.recordId),
  )) {
    const f = record.fields;
    const amount = numberOf(f['Tiền sách']) ?? 0;
    if (amount <= 0) continue;
    const problem = (code: string) =>
      nopProblems.push({ id: record.recordId, code });
    if (!Number.isInteger(amount)) {
      problem('NOP_SACH_SO_TIEN_SAI');
      continue;
    }
    const links = linkIds(f['Tên HS link']);
    if (links.length !== 1) {
      problem('NOP_SACH_THIEU_HOC_VIEN');
      continue;
    }
    if (!students.has(links[0])) {
      problem('NOP_SACH_HOC_VIEN_BI_BO');
      continue;
    }
    const ngay = dateVn(f['Ngày nộp']) ?? dateVn(f['Ngày']);
    if (!ngay) {
      problem('NOP_SACH_THIEU_NGAY');
      continue;
    }
    nop.push({
      externalId: `lark:tongdeal-sach:${record.recordId}`,
      hocVienKey: links[0],
      ngay,
      soTien: amount,
    });
  }
  return { nop, nopProblems };
}

/**
 * The handouts: one student and one book each (a row with none or several is left out, never guessed), a day, and a
 * whole-dong discount not above the price. The amount is the price of the book on Lark minus the discount: Lark's own
 * price looks the book up by "contains", so `CT1` also finds `CT10`; the exact symbol is used here.
 */
function lapPhatSach(
  data: Pick<LarkData, 'phatSach' | 'phatSachDoc'>,
  books: readonly SachRow[],
  students: ReadonlySet<string>,
): { phat: PhatSachRow[]; phatProblems: SachProblem[] } {
  const phat: PhatSachRow[] = [];
  const phatProblems: SachProblem[] = [];
  if (!data.phatSachDoc) return { phat, phatProblems };
  const byRecord = new Map(
    books.map((row) => [row.externalId.slice('lark:sach:'.length), row]),
  );
  for (const record of [...data.phatSach].sort((a, b) =>
    a.recordId.localeCompare(b.recordId),
  )) {
    const f = record.fields;
    const problem = (code: string) =>
      phatProblems.push({ id: record.recordId, code });
    const studentLinks = linkIds(f['Tên học sinh']);
    const bookLinks = linkIds(f['Sách dùng']);
    if (studentLinks.length !== 1) {
      problem(
        studentLinks.length === 0
          ? 'PHAT_SACH_THIEU_HOC_VIEN'
          : 'PHAT_SACH_NHIEU_HOC_VIEN',
      );
      continue;
    }
    if (bookLinks.length !== 1) {
      problem(
        bookLinks.length === 0
          ? 'PHAT_SACH_THIEU_SACH'
          : 'PHAT_SACH_NHIEU_SACH',
      );
      continue;
    }
    const student = studentLinks[0];
    if (!students.has(student)) {
      problem('PHAT_SACH_HOC_VIEN_BI_BO');
      continue;
    }
    const book = byRecord.get(bookLinks[0]);
    if (!book) {
      problem('PHAT_SACH_SACH_BI_BO');
      continue;
    }
    const ngay = dateVn(f['Ngày dùng']);
    if (!ngay) {
      problem('PHAT_SACH_THIEU_NGAY');
      continue;
    }
    const uuDai = numberOf(f['Ưu đãi']) ?? 0;
    if (!Number.isInteger(uuDai) || uuDai < 0 || uuDai > book.giaBan) {
      problem('PHAT_SACH_UU_DAI_SAI');
      continue;
    }
    phat.push({
      externalId: `lark:phatsach:${record.recordId}`,
      hocVienKey: student,
      sachKey: bookLinks[0],
      kyHieu: book.kyHieu,
      ngay,
      uuDai,
      tienSach: book.giaBan - uuDai,
    });
  }
  return { phat, phatProblems };
}

export interface SachKetQua {
  readonly tao: number;
  readonly trung: number;
  /** Symbols NocoEdu already holds without the Lark id: left alone (Lark ids of the rows). */
  readonly daCoKyHieu: readonly string[];
  /** The handouts written, the ones already there, and the ones whose student or book is not in NocoEdu. */
  readonly phatTao: number;
  readonly phatTrung: number;
  readonly phatKhongCo: number;
  /** The book money written, already there, and for a student NocoEdu does not hold. */
  readonly nopTao: number;
  readonly nopTrung: number;
  readonly nopKhongCo: number;
  /** The books of the students written, already there, and for a student or book NocoEdu does not hold. */
  readonly hocTao: number;
  readonly hocTrung: number;
  readonly hocKhongCo: number;
}

export const KHONG_GHI_SACH: SachKetQua = {
  tao: 0,
  trung: 0,
  daCoKyHieu: [],
  phatTao: 0,
  phatTrung: 0,
  phatKhongCo: 0,
  nopTao: 0,
  nopTrung: 0,
  nopKhongCo: 0,
  hocTao: 0,
  hocTrung: 0,
  hocKhongCo: 0,
};

/** Writes the books inside the transaction of the import. Books already written, or whose symbol is taken, are skipped. */
export async function ghiSach(q: Query, plan: SachPlan): Promise<SachKetQua> {
  if (
    plan.rows.length === 0 &&
    plan.phat.length === 0 &&
    plan.nop.length === 0 &&
    plan.hoc.length === 0
  )
    return KHONG_GHI_SACH;
  const existing = await q
    .selectFrom('eduSach')
    .select(['kyHieu', 'externalId'])
    .execute();
  const keys = new Set(
    existing.flatMap((row) =>
      row.externalId === null ? [] : [asText(row.externalId)],
    ),
  );
  const symbols = new Set(
    existing.map((row) => asText(row.kyHieu).toLowerCase()),
  );
  let trung = 0;
  const daCo: string[] = [];
  const values: Record<string, unknown>[] = [];
  for (const row of plan.rows) {
    if (keys.has(row.externalId)) {
      trung += 1;
      continue;
    }
    if (symbols.has(row.kyHieu.toLowerCase())) {
      daCo.push(row.externalId.slice('lark:sach:'.length));
      continue;
    }
    values.push({
      kyHieu: row.kyHieu,
      ten: row.ten,
      giaBia: row.giaBia,
      giaBan: row.giaBan,
      trangThai: 'dang_ban',
      externalId: row.externalId,
    });
  }
  for (let i = 0; i < values.length; i += 50)
    await q
      .insertInto('eduSach')
      .values(values.slice(i, i + 50))
      .execute();
  const phatKet = await ghiPhatSach(q, plan.phat);
  const nopKet = await ghiNopSach(q, plan.nop);
  const hocKet = await ghiSachHoc(q, plan.hoc);
  return {
    tao: values.length,
    trung,
    daCoKyHieu: daCo,
    ...phatKet,
    ...nopKet,
    ...hocKet,
  };
}

/** Writes the books of the students; one already there (by its key) is skipped, never edited. */
async function ghiSachHoc(
  q: Query,
  hoc: readonly SachHocRow[],
): Promise<Pick<SachKetQua, 'hocTao' | 'hocTrung' | 'hocKhongCo'>> {
  if (hoc.length === 0) return { hocTao: 0, hocTrung: 0, hocKhongCo: 0 };
  const done = new Set(
    (
      await q
        .selectFrom('eduSachHoc')
        .select('externalId')
        .where('externalId', 'is not', null)
        .execute()
    ).map((row) => asText(row.externalId)),
  );
  const students = new Map<string, number>();
  for (const row of await q
    .selectFrom('eduHocVien')
    .select(['id', 'externalId'])
    .where('externalId', 'is not', null)
    .execute())
    students.set(asText(row.externalId), Number(row.id));
  const byRecord = new Map<string, number>();
  const bySymbol = new Map<string, number>();
  for (const row of await q
    .selectFrom('eduSach')
    .select(['id', 'kyHieu', 'externalId'])
    .execute()) {
    bySymbol.set(asText(row.kyHieu).toLowerCase(), Number(row.id));
    if (row.externalId !== null)
      byRecord.set(asText(row.externalId), Number(row.id));
  }
  let hocTrung = 0;
  let hocKhongCo = 0;
  const values: Record<string, unknown>[] = [];
  const pairs = new Set<string>();
  for (const row of hoc) {
    if (done.has(row.externalId)) {
      hocTrung += 1;
      continue;
    }
    const hocVienId = students.get(row.hocVienKey);
    const sachId =
      byRecord.get(`lark:sach:${row.sachKey}`) ??
      bySymbol.get(row.kyHieu.toLowerCase());
    if (hocVienId === undefined || sachId === undefined) {
      hocKhongCo += 1;
      continue;
    }
    // One row per student and book (the unique index): a pair already written by hand or twice in the plan is skipped.
    const pair = `${hocVienId}|${sachId}`;
    if (pairs.has(pair)) {
      hocTrung += 1;
      continue;
    }
    pairs.add(pair);
    values.push({
      hocVienId,
      sachId,
      trangThai: row.trangThai,
      externalId: row.externalId,
    });
  }
  const existing = new Set(
    (
      await q.selectFrom('eduSachHoc').select(['hocVienId', 'sachId']).execute()
    ).map((row) => `${Number(row.hocVienId)}|${Number(row.sachId)}`),
  );
  const fresh = values.filter(
    (value) =>
      !existing.has(`${String(value.hocVienId)}|${String(value.sachId)}`),
  );
  hocTrung += values.length - fresh.length;
  for (let i = 0; i < fresh.length; i += 50)
    await q
      .insertInto('eduSachHoc')
      .values(fresh.slice(i, i + 50))
      .execute();
  return { hocTao: fresh.length, hocTrung, hocKhongCo };
}

/** Writes the book money paid; one already written (by its key) is skipped, never edited. */
async function ghiNopSach(
  q: Query,
  nop: readonly NopSachRow[],
): Promise<Pick<SachKetQua, 'nopTao' | 'nopTrung' | 'nopKhongCo'>> {
  if (nop.length === 0) return { nopTao: 0, nopTrung: 0, nopKhongCo: 0 };
  const done = new Set(
    (
      await q
        .selectFrom('eduNopSach')
        .select('externalId')
        .where('externalId', 'is not', null)
        .execute()
    ).map((row) => asText(row.externalId)),
  );
  const students = new Map<string, { id: number; coSoId: number }>();
  for (const row of await q
    .selectFrom('eduHocVien')
    .select(['id', 'externalId', 'coSoId'])
    .where('externalId', 'is not', null)
    .execute())
    students.set(asText(row.externalId), {
      id: Number(row.id),
      coSoId: Number(row.coSoId),
    });
  let nopTrung = 0;
  let nopKhongCo = 0;
  const now = new Date();
  const values: Record<string, unknown>[] = [];
  for (const row of nop) {
    if (done.has(row.externalId)) {
      nopTrung += 1;
      continue;
    }
    const student = students.get(row.hocVienKey);
    if (!student) {
      nopKhongCo += 1;
      continue;
    }
    values.push({
      hocVienId: student.id,
      coSoId: student.coSoId,
      ngay: row.ngay,
      soTien: row.soTien,
      nguoiTaoId: null,
      externalId: row.externalId,
      createdAt: now,
    });
  }
  for (let i = 0; i < values.length; i += 50)
    await q
      .insertInto('eduNopSach')
      .values(values.slice(i, i + 50))
      .execute();
  return { nopTao: values.length, nopTrung, nopKhongCo };
}

/** Writes the handouts after the books: a handout already written (by its key) is skipped, never edited. */
async function ghiPhatSach(
  q: Query,
  phat: readonly PhatSachRow[],
): Promise<Pick<SachKetQua, 'phatTao' | 'phatTrung' | 'phatKhongCo'>> {
  if (phat.length === 0) return { phatTao: 0, phatTrung: 0, phatKhongCo: 0 };
  const done = new Set(
    (
      await q
        .selectFrom('eduPhatSach')
        .select('externalId')
        .where('externalId', 'is not', null)
        .execute()
    ).map((row) => asText(row.externalId)),
  );
  const students = new Map<string, { id: number; coSoId: number }>();
  for (const row of await q
    .selectFrom('eduHocVien')
    .select(['id', 'externalId', 'coSoId'])
    .where('externalId', 'is not', null)
    .execute())
    students.set(asText(row.externalId), {
      id: Number(row.id),
      coSoId: Number(row.coSoId),
    });
  const byRecord = new Map<string, number>();
  const bySymbol = new Map<string, number>();
  for (const row of await q
    .selectFrom('eduSach')
    .select(['id', 'kyHieu', 'externalId'])
    .execute()) {
    bySymbol.set(asText(row.kyHieu).toLowerCase(), Number(row.id));
    if (row.externalId !== null)
      byRecord.set(asText(row.externalId), Number(row.id));
  }
  let phatTrung = 0;
  let phatKhongCo = 0;
  const now = new Date();
  const values: Record<string, unknown>[] = [];
  for (const row of phat) {
    if (done.has(row.externalId)) {
      phatTrung += 1;
      continue;
    }
    const student = students.get(row.hocVienKey);
    const sachId =
      byRecord.get(`lark:sach:${row.sachKey}`) ??
      bySymbol.get(row.kyHieu.toLowerCase());
    if (!student || sachId === undefined) {
      phatKhongCo += 1;
      continue;
    }
    values.push({
      hocVienId: student.id,
      sachId,
      coSoId: student.coSoId,
      ngay: row.ngay,
      uuDai: row.uuDai,
      tienSach: row.tienSach,
      ghiChu: null,
      nguoiTaoId: null,
      externalId: row.externalId,
      createdAt: now,
    });
  }
  for (let i = 0; i < values.length; i += 50)
    await q
      .insertInto('eduPhatSach')
      .values(values.slice(i, i + 50))
      .execute();
  return { phatTao: values.length, phatTrung, phatKhongCo };
}
