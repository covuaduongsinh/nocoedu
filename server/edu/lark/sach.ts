import type { DatabaseManager } from '@nocobase/db';

import { asText } from '../names.js';
import { numberOf, textOf } from './gia-tri.js';
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

export interface SachPlan {
  /** False when the app cannot see the table `Sách`. */
  readonly doc: boolean;
  readonly rows: readonly SachRow[];
  readonly problems: readonly SachProblem[];
  readonly warnings: readonly SachProblem[];
}

export const EMPTY_SACH: SachPlan = {
  doc: false,
  rows: [],
  problems: [],
  warnings: [],
};

const SYMBOL_MAX = 32;
const TITLE_MAX = 191;

const price = (cell: unknown): number | null => {
  const value = numberOf(cell);
  if (value === null) return null;
  return Number.isInteger(value) && value >= 0 ? value : Number.NaN;
};

export function lapSach(data: Pick<LarkData, 'sach' | 'sachDoc'>): SachPlan {
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
  return { doc: true, rows, problems, warnings };
}

export interface SachKetQua {
  readonly tao: number;
  readonly trung: number;
  /** Symbols NocoEdu already holds without the Lark id: left alone (Lark ids of the rows). */
  readonly daCoKyHieu: readonly string[];
}

export const KHONG_GHI_SACH: SachKetQua = { tao: 0, trung: 0, daCoKyHieu: [] };

/** Writes the books inside the transaction of the import. Books already written, or whose symbol is taken, are skipped. */
export async function ghiSach(q: Query, plan: SachPlan): Promise<SachKetQua> {
  if (plan.rows.length === 0) return KHONG_GHI_SACH;
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
  return { tao: values.length, trung, daCoKyHieu: daCo };
}
