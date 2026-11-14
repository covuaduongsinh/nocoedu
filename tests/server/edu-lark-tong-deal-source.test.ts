import { describe, expect, it } from 'vitest';

import { readLarkData } from '../../server/edu/lark/nguon.js';
import { buildFixture, fixtureSource, ms } from '../helpers/lark-fixture.js';
import type { LarkRecord } from '../../server/edu/lark/nguon.js';

/** Reading `Tổng Deal (HP + book)`: the only table with money. Nothing here calls Lark. */

const payment = (): LarkRecord => ({
  recordId: 'recTongDealMau01',
  fields: {
    'Tên HS link': { link_record_ids: ['recHocVienMau01'] },
    'Ngày nộp': ms('2026-02-03'),
    'Số buổi nộp': 12,
    'Học phí': 1440000,
    'Tiền sách': 0,
    'Mua khác': 0,
    'Link với Lần nộp HP': { link_record_ids: [] },
    'HP 1 buổi': 120000,
    // Never read: the plan has no use for them and the bill photo is a document of the family.
    'Tên PH': 'Phụ huynh Mẫu',
    'Ảnh chụp bill': [{ name: 'bill.jpg' }],
    'Ghi chú': 'ghi chú mẫu',
  },
});

describe('đọc Tổng Deal', () => {
  it('reads the payments with the fields the plan needs and nothing else', async () => {
    const tables = buildFixture();
    tables.tongDeal.push(payment());
    const data = await readLarkData(fixtureSource(tables));
    expect(data.tongDealDoc).toBe(true);
    expect(data.tongDeal).toHaveLength(1);
    const fields = Object.keys(data.tongDeal[0]?.fields ?? {});
    expect(fields).toContain('Học phí');
    expect(fields).toContain('HP 1 buổi');
    expect(fields).not.toContain('Tên PH');
    expect(fields).not.toContain('Ảnh chụp bill');
    expect(fields).not.toContain('Ghi chú');
  });

  it('still works when the app cannot see the table: no payments, and it says so', async () => {
    const data = await readLarkData(
      fixtureSource(undefined, { hide: ['tongDeal'] }),
    );
    expect(data.tongDealDoc).toBe(false);
    expect(data.tongDeal).toEqual([]);
    expect(data.dealHp).toBeDefined();
  });

  it('stops when a field the plan needs is renamed (LARK_CAU_TRUC_DOI)', async () => {
    await expect(
      readLarkData(
        fixtureSource(undefined, {
          drop: { table: 'tongDeal', field: 'Học phí' },
        }),
      ),
    ).rejects.toMatchObject({ code: 'LARK_CAU_TRUC_DOI' });
  });
});
