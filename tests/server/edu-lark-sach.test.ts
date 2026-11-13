import { describe, expect, it } from 'vitest';

import type { LarkRecord } from '../../server/edu/lark/nguon.js';
import { chayNhap, inBaoCao } from '../../server/edu/lark/nhap.js';
import { lapSach } from '../../server/edu/lark/sach.js';
import { test } from '../helpers/edu.js';
import {
  buildFixture,
  fixtureData,
  fixtureSource,
} from '../helpers/lark-fixture.js';

// The books of the club (`Sách`, DS-61 phase E). Every symbol, title and price is made up.

const book = (id: string, fields: Record<string, unknown>): LarkRecord => ({
  recordId: id,
  fields,
});

const books = (): LarkRecord[] => [
  book('recSachMau1', {
    'Ký hiệu sách': [{ type: 'text', text: 'MAU1' }],
    'Tên sách': [{ type: 'text', text: 'Sách Mẫu 1' }],
    'Giá bìa': 120000,
    'Giá bán cho PH': 100000,
  }),
  // No title and no price: the symbol stands in for the title, the prices are 0, both reported.
  book('recSachMau2', {
    'Ký hiệu sách': [{ type: 'text', text: 'MAU2' }],
  }),
  // The same symbol again (other case), a row with no symbol: left out.
  book('recSachMau3', {
    'Ký hiệu sách': [{ type: 'text', text: 'mau1' }],
    'Tên sách': [{ type: 'text', text: 'Trùng' }],
  }),
  book('recSachMau4', {
    'Tên sách': [{ type: 'text', text: 'Không ký hiệu' }],
  }),
];

const withBooks = () => {
  const tables = buildFixture();
  tables.sach.push(...books());
  return tables;
};

describe('lapSach', () => {
  const plan = () => lapSach(fixtureData(withBooks()));

  it('makes one book per symbol with its prices', () => {
    expect(plan().rows[0]).toEqual({
      externalId: 'lark:sach:recSachMau1',
      kyHieu: 'MAU1',
      ten: 'Sách Mẫu 1',
      giaBia: 120000,
      giaBan: 100000,
    });
  });

  it('reports a missing title or price, a symbol twice and a row without symbol', () => {
    const p = plan();
    expect(p.rows.map((r) => r.kyHieu)).toEqual(['MAU1', 'MAU2']);
    expect(p.rows[1]).toMatchObject({ ten: 'MAU2', giaBia: 0, giaBan: 0 });
    expect(p.warnings.map((w) => w.code).sort()).toEqual([
      'SACH_THIEU_GIA',
      'SACH_THIEU_TEN',
    ]);
    expect(p.problems).toEqual([
      { id: 'recSachMau3', code: 'SACH_TRUNG_KY_HIEU' },
      { id: 'recSachMau4', code: 'SACH_THIEU_KY_HIEU' },
    ]);
  });

  it('does nothing when the app cannot see the table', () => {
    const p = lapSach({
      ...fixtureData(withBooks()),
      sachDoc: false,
      sach: [],
    });
    expect(p.doc).toBe(false);
    expect(p.rows).toEqual([]);
  });
});

test('a dry run writes no book; the commit writes them once, and keeps a symbol typed by hand', async ({
  database,
  connection,
}) => {
  const userId = String(
    (
      await connection.query
        .selectFrom('user')
        .select('id')
        .executeTakeFirstOrThrow()
    ).id,
  );
  for (const table of ['eduSach'])
    await connection.query.deleteFrom(table).allowAllRows().execute();
  const rows = async () =>
    connection.query
      .selectFrom('eduSach')
      .select(['kyHieu', 'ten', 'giaBan', 'trangThai', 'externalId'])
      .execute();
  const run = (commit: boolean, tables = withBooks()) =>
    chayNhap(database, fixtureSource(tables), {
      commit,
      userId: commit ? userId : null,
      delayMs: 0,
    });

  const dry = await run(false);
  expect(await rows()).toEqual([]);
  expect(dry.sach).toMatchObject({
    doc: true,
    dong: 2,
    ghi: { tao: 2, trung: 0, daCoKyHieu: 0 },
  });
  const text = inBaoCao(dry).join('\n');
  expect(text).toContain('SACH_TRUNG_KY_HIEU');
  expect(text).not.toMatch(/Sách Mẫu/u);

  const done = await run(true);
  expect(done.sach?.ghi).toMatchObject({ tao: 2 });
  expect(await rows()).toEqual([
    {
      kyHieu: 'MAU1',
      ten: 'Sách Mẫu 1',
      giaBan: 100000,
      trangThai: 'dang_ban',
      externalId: 'lark:sach:recSachMau1',
    },
    {
      kyHieu: 'MAU2',
      ten: 'MAU2',
      giaBan: 0,
      trangThai: 'dang_ban',
      externalId: 'lark:sach:recSachMau2',
    },
  ]);

  // A repeat writes nothing, and a book edited since is not overwritten.
  await connection.query
    .updateTable('eduSach')
    .set({ giaBan: 90000 })
    .where('kyHieu', '=', 'MAU1')
    .execute();
  const again = await run(true);
  expect(again.sach?.ghi).toMatchObject({ tao: 0, trung: 2 });
  expect((await rows())[0]?.giaBan).toBe(90000);

  // A symbol typed in by hand is left alone and reported.
  await connection.query.deleteFrom('eduSach').allowAllRows().execute();
  await connection.query
    .insertInto('eduSach')
    .values({ kyHieu: 'MAU1', ten: 'Nhập tay' })
    .execute();
  const hand = await run(false);
  expect(hand.sach?.ghi).toMatchObject({ tao: 1, daCoKyHieu: 1 });
});
