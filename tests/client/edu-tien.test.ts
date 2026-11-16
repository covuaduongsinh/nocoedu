import { describe, expect, it } from 'vitest';

import { amountInWords, formatVnd } from '../../client/pages/edu/tien.js';

describe('money on a receipt', () => {
  it('groups an amount by thousands', () => {
    expect(formatVnd(1440000)).toBe('1.440.000');
    expect(formatVnd(undefined)).toBe('0');
  });

  it('reads an amount in Vietnamese words', () => {
    const cases: readonly (readonly [number, string])[] = [
      [0, 'Không đồng'],
      [5, 'Năm đồng'],
      [10, 'Mười đồng'],
      [11, 'Mười một đồng'],
      [15, 'Mười lăm đồng'],
      [21, 'Hai mươi mốt đồng'],
      [25, 'Hai mươi lăm đồng'],
      [105, 'Một trăm linh năm đồng'],
      [110, 'Một trăm mười đồng'],
      [1000, 'Một nghìn đồng'],
      [150000, 'Một trăm năm mươi nghìn đồng'],
      [440000, 'Bốn trăm bốn mươi nghìn đồng'],
      [1440000, 'Một triệu bốn trăm bốn mươi nghìn đồng'],
      [1800000, 'Một triệu tám trăm nghìn đồng'],
      [2005000, 'Hai triệu không trăm linh năm nghìn đồng'],
      [1000001, 'Một triệu không trăm linh một đồng'],
      [10500000, 'Mười triệu năm trăm nghìn đồng'],
      [1000000000, 'Một tỷ đồng'],
      [
        2150075000,
        'Hai tỷ một trăm năm mươi triệu không trăm bảy mươi lăm nghìn đồng',
      ],
    ];
    for (const [value, words] of cases)
      expect(amountInWords(value)).toBe(words);
  });

  it('gives nothing for an amount a receipt cannot state', () => {
    expect(amountInWords(-1)).toBe('');
    expect(amountInWords(1.5)).toBe('');
    expect(amountInWords(Number.NaN)).toBe('');
  });
});
