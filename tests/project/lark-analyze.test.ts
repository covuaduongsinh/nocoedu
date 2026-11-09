import { describe, expect, it } from 'vitest';

// The decoder is a plain Node script; its pure helpers are tested here with made-up values.
import {
  analyzeSheet,
  cellText,
  columnLetter,
  compressRows,
  isPersonalLabel,
  legendOf,
  normalizeFormula,
  readableFormula,
  sanitizeField,
  sanitizeViewFilter,
  sessionFreeHeader,
  sheetSignature,
} from '../../scripts/lark/analyze.mjs';

describe('scripts/lark/analyze', () => {
  it('turns column indexes into letters', () => {
    expect([0, 25, 26, 51, 52].map(columnLetter)).toEqual([
      'A',
      'Z',
      'AA',
      'AZ',
      'BA',
    ]);
  });

  it('collapses a formula filled down a column into one relative pattern', () => {
    expect(normalizeFormula('=E2+F2-$G$1', 2, 7)).toBe(
      normalizeFormula('=E9+F9-$G$1', 9, 7),
    );
    expect(normalizeFormula('=SUM(E2:E116)', 117, 4)).toBe(
      '=SUM(R[-115]C[0]:R[-1]C[0])',
    );
  });

  it('leaves string literals and sheet names alone', () => {
    expect(normalizeFormula('=IF(A2="B7","x",\'B7\'!C3)', 2, 1)).toBe(
      '=IF(R[0]C[-1]="B7","x",\'B7\'!C3)',
    );
  });

  it('compresses row numbers', () => {
    expect(compressRows([5, 2, 3, 4, 9, 9])).toBe('2-5, 9');
  });

  it('reads rich-text cells as text', () => {
    expect(cellText([{ text: 'Nhận xét:' }, { text: ' (B1)' }])).toBe(
      'Nhận xét: (B1)',
    );
  });

  it('describes a sheet without keeping personal values', () => {
    const values = [
      ['STT', 'Tên học viên', 'Có mặt', 'Còn lại'],
      [1, 'Học viên Mẫu 01', 1, '=D1-C2'],
      [2, 'Học viên Mẫu 02', 1, '=D2-C3'],
      [3, 'Học viên Mẫu 03', 1, 7],
      [4, 'Học viên Mẫu 04', 1, '=D4-C5'],
      [null, null, '=SUM(C2:C5)', null],
    ];
    const sheet = analyzeSheet(values, { frozenRows: 1 });
    expect(sheet.headerRow).toBe(1);
    expect(sheet.dataRange).toBe('A1:D6');
    expect(sheet.dataRows).toBe(5);
    const name = sheet.columns.find((c) => c.col === 'B');
    expect(name?.legend).toBeUndefined();
    expect(JSON.stringify(sheet)).not.toContain('Học viên Mẫu');
    const present = sheet.columns.find((c) => c.col === 'C');
    expect(present?.legend).toEqual({ '1': 4 });
    expect(present?.formulas[0]?.rows).toBe('6');
    const balance = sheet.columns.find((c) => c.col === 'D');
    expect(balance?.formulas).toHaveLength(1);
    expect(balance?.formulas[0]).toMatchObject({ count: 3, rows: '2-3, 5' });
    // A number typed over the formula in row 4.
    expect(balance?.literalInsideFormulas).toBe('4');
  });

  it('groups session tabs whose header only differs by a date', () => {
    const a = analyzeSheet(
      [
        ['Tên', 'Nhận xét (B1: 01/02/26)'],
        ['x', 'y'],
      ],
      { frozenRows: 1 },
    );
    const b = analyzeSheet(
      [
        ['Tên', 'Nhận xét (B2: 08/02/26)'],
        ['x', 'y'],
      ],
      { frozenRows: 1 },
    );
    expect(sheetSignature(a)).toBe(sheetSignature(b));
    expect(sessionFreeHeader('Nhận xét -\nB149: 01/12/25 - T2-CA1')).toBe(
      'Nhận xét',
    );
    expect(sessionFreeHeader('Nhận xét C10: 19/1/26 - T2-CA2')).toBe(
      'Nhận xét',
    );
    expect(sessionFreeHeader('T2\nCA1')).toBe('T2 CA1');
  });

  it('groups tabs whose column total moved down with more students', () => {
    const short = analyzeSheet([['Có mặt'], [1], [1], ['=SUM(A2:A3)']], {
      frozenRows: 1,
    });
    const long = analyzeSheet([['Có mặt'], [1], [1], [1], ['=SUM(A2:A4)']], {
      frozenRows: 1,
    });
    expect(sheetSignature(short)).toBe(sheetSignature(long));
  });

  it('flags personal labels', () => {
    for (const label of [
      'Tên học viên',
      'Họ tên PH',
      'SDT PH',
      'Ngày sinh',
      'Nick',
      'Ghi chú',
    ]) {
      expect(isPersonalLabel(label)).toBe(true);
    }
    for (const label of [
      'Có mặt',
      'Level',
      'Tình trạng học',
      'cơ sở',
      'Làm BTVN',
      'Phát lì xì',
    ]) {
      expect(isPersonalLabel(label)).toBe(false);
    }
  });

  it('keeps only repeated short codes as a legend', () => {
    expect(
      legendOf(
        'Có mặt',
        new Map([
          ['1', 10],
          ['0', 4],
        ]),
      ),
    ).toEqual({ '1': 10, '0': 4 });
    expect(
      legendOf(
        'Biệt danh',
        new Map([
          ['a', 1],
          ['b', 1],
          ['c', 1],
        ]),
      ),
    ).toBeNull();
    expect(legendOf('Tên', new Map([['x', 5]]))).toBeNull();
  });

  it('drops options of personal fields and values of filters', () => {
    const field = sanitizeField({
      field_id: 'fld1',
      field_name: 'Tên nền tảng',
      type: 4,
      property: { options: [{ name: 'Mẫu' }] },
    });
    expect(field).toMatchObject({ type: 'MultiSelect', optionCount: 1 });
    expect(field.options).toBeUndefined();
    const filter = sanitizeViewFilter({
      conjunction: 'and',
      conditions: [
        {
          field_id: 'fld2',
          field_type: 1,
          operator: 'contains',
          value: '["Học viên Mẫu"]',
        },
      ],
    });
    expect(JSON.stringify(filter)).not.toContain('Mẫu');
    expect(filter?.conditions[0]).toMatchObject({
      fieldId: 'fld2',
      operator: 'contains',
      hasValue: true,
    });
  });

  it('keeps the filter of a lookup field without its values', () => {
    const field = sanitizeField({
      field_id: 'fld3',
      field_name: 'Tra cứu mẫu',
      type: 19,
      property: {
        target_table: 'tblMau',
        target_field: 'fldMau',
        filter_info: {
          conjunction: 'and',
          conditions: [
            {
              field_id: 'fld4',
              field_type: 1,
              operator: 'is',
              value: '["Học viên Mẫu"]',
            },
          ],
        },
      },
    });
    expect(field.lookupFilter?.conditions).toHaveLength(1);
    expect(field.lookupFilter?.conditions[0]).toMatchObject({
      fieldId: 'fld4',
      hasValue: true,
    });
    expect(JSON.stringify(field)).not.toContain('Mẫu"]');
  });

  it('names the tables and fields of a Base formula', () => {
    const tables = [
      {
        id: 'tblA',
        name: 'HocVien',
        fields: [{ id: 'fld1', name: 'Ngày sinh' }],
      },
      { id: 'tblB', name: 'Sách', fields: [{ id: 'fld2', name: 'Giá' }] },
    ];
    expect(
      readableFormula('YEAR(bitable::$table[tblA].$field[fld1])', tables),
    ).toBe('YEAR([HocVien].[Ngày sinh])');
    expect(
      readableFormula(
        'bitable::$table[tblB].FILTER(CurrentValue.$column[fld2]>0)',
        tables,
      ),
    ).toBe('[Sách].FILTER(CurrentValue.[Giá]>0)');
  });
});
