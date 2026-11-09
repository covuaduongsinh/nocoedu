// Pure helpers for scripts/lark/giai-ma.mjs: no network, no file system.
//
// Child-data rule (knowledge 05): these helpers turn Lark responses into *structure*.
// They never return a record value, except short category codes that repeat often enough to
// be a legend (attendance marks, levels) in columns whose header does not look personal.

/** Lark Base v1 field type codes. */
export const FIELD_TYPES = {
  1: 'Text',
  2: 'Number',
  3: 'SingleSelect',
  4: 'MultiSelect',
  5: 'DateTime',
  7: 'Checkbox',
  11: 'User',
  13: 'Phone',
  15: 'Url',
  17: 'Attachment',
  18: 'SingleLink',
  19: 'Lookup',
  20: 'Formula',
  21: 'DuplexLink',
  22: 'Location',
  23: 'GroupChat',
  24: 'Stage',
  1001: 'CreatedTime',
  1002: 'ModifiedTime',
  1003: 'CreatedUser',
  1004: 'ModifiedUser',
  1005: 'AutoNumber',
};

/** Headers or field names that hold personal data: never keep their values or options. */
export const PERSONAL =
  /t[êe]n|nick|(?<!\p{L})h[ọo](?!\p{L})|name|s[đd]t|phone|đi[ệe]n tho[ạa]i|zalo|e-?mail|đ[ịi]a ch[ỉi]|nh[ậa]n x[ée]t|ghi ch[úu]|tr[ưu][ờo]ng h[ọo]c|cccd|đ[ịi]nh danh|sinh|facebook|link|ảnh|lichess|chesskid|ph[ụu] huynh|(?<!\p{L})ph(?!\p{L})|(?<!\p{L})hv(?!\p{L})|h[ọo]c vi[êe]n|(?<!\p{L})con(?!\p{L})|vđv|v[ậa]n đ[ộo]ng vi[êe]n|(?<!\p{L})gv(?!\p{L})|gi[áa]o vi[êe]n|(?<!\p{L})hlv(?!\p{L})|ng[ưu][ờo]i/iu;

const MAX_OPTIONS = 40;
const LEGEND_MAX_DISTINCT = 15;
const LEGEND_MAX_LENGTH = 16;
const LEGEND_MIN_REPEAT = 3;

export function isPersonalLabel(label) {
  return PERSONAL.test(String(label ?? ''));
}

/** Text of a Sheets cell: rich-text segments are joined, mentions and links keep their text. */
export function cellText(cell) {
  if (cell === null || cell === undefined) return '';
  if (Array.isArray(cell))
    return cell.map((segment) => cellText(segment?.text ?? segment)).join('');
  if (typeof cell === 'object') return String(cell.text ?? cell.link ?? '');
  return String(cell);
}

export function cellKind(cell) {
  if (cell === null || cell === undefined || cell === '') return 'empty';
  if (typeof cell === 'string' && cell.startsWith('=')) return 'formula';
  if (Array.isArray(cell)) return 'richText';
  if (typeof cell === 'object') return 'object';
  if (typeof cell === 'number') return 'number';
  if (typeof cell === 'boolean') return 'boolean';
  return 'text';
}

export function columnLetter(index) {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function columnIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Rewrites A1 references relative to the cell (R1C1 style) so that the "same formula filled
 * down a column" collapses into one pattern. String literals and sheet names are left alone.
 * `row` is 1-based, `col` 0-based.
 */
export function normalizeFormula(formula, row, col) {
  const parts = formula.split(/("(?:[^"]|"")*")/);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(
        /(?<![A-Za-z0-9_.'!$])(\$?)([A-Z]{1,3})(\$?)([0-9]+)(?![0-9A-Za-z_(!])/g,
        (_, absCol, letters, absRow, digits) => {
          const c = columnIndex(letters);
          const r = Number(digits);
          const rPart = absRow ? `R${r}` : `R[${r - row}]`;
          const cPart = absCol ? `C${c + 1}` : `C[${c - col}]`;
          return `${rPart}${cPart}`;
        },
      );
    })
    .join('');
}

/** Compresses sorted row numbers into "2-40, 45". */
export function compressRows(rows) {
  const sorted = [...new Set(rows)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
    out.push(start === sorted[i] ? `${start}` : `${start}-${sorted[i]}`);
  }
  return out.join(', ');
}

function pickHeaderRow(values, frozenRows) {
  const scan = Math.min(values.length, 10);
  if (frozenRows > 0 && frozenRows <= scan) return frozenRows;
  let best = 0;
  let bestCount = 0;
  for (let i = 0; i < scan; i++) {
    const count = (values[i] ?? []).filter((cell) =>
      ['text', 'richText'].includes(cellKind(cell)),
    ).length;
    if (count > bestCount) {
      best = i + 1;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Structure of one sheet from its values read with valueRenderOption=Formula.
 * Returns headers, data region, non-empty row count and, per column, formula patterns,
 * literal cells inside formula columns (row numbers only) and value kinds.
 */
export function analyzeSheet(values, { frozenRows = 0, rowOffset = 0 } = {}) {
  const headerRow = pickHeaderRow(values, frozenRows);
  const headerCells = headerRow ? (values[headerRow - 1] ?? []) : [];
  const width = values.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
  const columns = [];
  let minRow = Infinity;
  let maxRow = 0;
  let minCol = Infinity;
  let maxCol = -1;
  let dataRows = 0;

  for (let c = 0; c < width; c++) {
    const header = cellText(headerCells[c]).trim();
    columns.push({
      col: columnLetter(c),
      header,
      kinds: {},
      patterns: new Map(),
      literalRows: [],
      formulaRows: [],
      values: new Map(),
    });
  }

  values.forEach((row, r) => {
    const rowNumber = r + 1 + rowOffset;
    let nonEmpty = false;
    (row ?? []).forEach((cell, c) => {
      const kind = cellKind(cell);
      if (kind === 'empty') return;
      nonEmpty = true;
      minRow = Math.min(minRow, rowNumber);
      maxRow = Math.max(maxRow, rowNumber);
      minCol = Math.min(minCol, c);
      maxCol = Math.max(maxCol, c);
      if (rowNumber <= headerRow) return;
      const column = columns[c];
      column.kinds[kind] = (column.kinds[kind] ?? 0) + 1;
      if (kind === 'formula') {
        const pattern = normalizeFormula(cell, rowNumber, c);
        const entry = column.patterns.get(pattern) ?? {
          pattern,
          example: cell,
          exampleCell: `${column.col}${rowNumber}`,
          rows: [],
        };
        entry.rows.push(rowNumber);
        column.patterns.set(pattern, entry);
        column.formulaRows.push(rowNumber);
      } else {
        column.literalRows.push(rowNumber);
        const text = cellText(cell).trim();
        if (text.length <= LEGEND_MAX_LENGTH)
          column.values.set(text, (column.values.get(text) ?? 0) + 1);
      }
    });
    if (nonEmpty && rowNumber > headerRow) dataRows++;
  });

  return {
    headerRow,
    dataRange: maxRow
      ? `${columnLetter(minCol)}${minRow}:${columnLetter(maxCol)}${maxRow}`
      : null,
    dataRows,
    columns: columns
      .filter((column) => column.header || Object.keys(column.kinds).length)
      .map((column) => finishColumn(column)),
  };
}

function finishColumn(column) {
  const patterns = [...column.patterns.values()]
    .sort((a, b) => b.rows.length - a.rows.length)
    .map((entry) => ({
      pattern: entry.pattern,
      example: entry.example,
      exampleCell: entry.exampleCell,
      count: entry.rows.length,
      rows: compressRows(entry.rows),
    }));
  const formulaCount = column.formulaRows.length;
  // A literal inside a column computed by formulas is a candidate hand-typed override.
  // Only rows inside the span of the formulas count, so a header/footer literal does not.
  let literalInsideFormulas = [];
  if (formulaCount) {
    const first = Math.min(...column.formulaRows);
    const last = Math.max(...column.formulaRows);
    literalInsideFormulas = column.literalRows.filter(
      (row) => row > first && row < last,
    );
  }
  const result = {
    col: column.col,
    header: column.header,
    kinds: column.kinds,
    formulas: patterns,
    literalInsideFormulas: literalInsideFormulas.length
      ? compressRows(literalInsideFormulas)
      : '',
  };
  const legend = legendOf(column.header, column.values);
  if (legend) result.legend = legend;
  return result;
}

/** Category codes of a column (attendance marks, levels), or null when they may be personal. */
export function legendOf(header, valueCounts) {
  if (isPersonalLabel(header)) return null;
  const frequent = [...valueCounts.entries()].filter(
    ([, n]) => n >= LEGEND_MIN_REPEAT,
  );
  if (!frequent.length || frequent.length > LEGEND_MAX_DISTINCT) return null;
  const rare = [...valueCounts.values()]
    .filter((n) => n < LEGEND_MIN_REPEAT)
    .reduce((a, b) => a + b, 0);
  const total = [...valueCounts.values()].reduce((a, b) => a + b, 0);
  // Mostly unique values are content, not codes.
  if (rare > total * 0.2) return null;
  return Object.fromEntries(frequent.sort((a, b) => b[1] - a[1]));
}

/** "Nhận xét -\nB149: 01/12/25 - T2-CA1" → "Nhận xét": the session code and date of a tab are not structure. */
export function sessionFreeHeader(header) {
  let text = String(header ?? '');
  if (/\d{1,2}\/\d{1,2}/.test(text)) {
    text = text
      .replace(/\(.*?\)/gs, '')
      .replace(/[\s\-–:]*(?<![\p{L}])[BC]\d+(_\d{4})?(?![\p{L}\d]).*$/su, '');
    text = text.replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?.*$/su, '');
  }
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\s\-–:]+$/u, '')
    .trim();
}

/** Groups sheets that share headers and formula patterns, so 200 session tabs read as one. */
export function sheetSignature(analysis) {
  return JSON.stringify(
    analysis.columns.map((column) => [
      column.col,
      sessionFreeHeader(column.header),
      // A total under the last student moves down as the class grows: ignore row offsets.
      [
        ...new Set(
          column.formulas.map((formula) =>
            formula.pattern.replace(/R\[-?\d+\]/g, 'R[*]'),
          ),
        ),
      ].sort(),
    ]),
  );
}

/** Field metadata without record values; options of personal-looking fields are dropped. */
export function sanitizeField(field) {
  const out = {
    id: field.field_id,
    name: field.field_name,
    type: FIELD_TYPES[field.type] ?? String(field.type),
    uiType: field.ui_type,
    primary: Boolean(field.is_primary),
  };
  const p = field.property ?? {};
  if (p.formula_expression) out.formula = p.formula_expression;
  if (p.formula) out.formula = p.formula;
  if (p.table_id) out.linkTable = p.table_id;
  if (p.multiple !== undefined) out.multiple = p.multiple;
  if (p.back_field_id) out.backField = p.back_field_id;
  if (p.target_table || p.filter_info?.target_table)
    out.lookupTable = p.target_table ?? p.filter_info.target_table;
  if (p.target_field) out.lookupField = p.target_field;
  if (p.roll_up !== undefined) out.rollUp = p.roll_up;
  if (p.filter_info?.conditions)
    out.lookupFilter = sanitizeViewFilter(p.filter_info.conditions);
  if (p.formatter) out.formatter = p.formatter;
  if (p.date_formatter) out.dateFormatter = p.date_formatter;
  if (p.auto_fill !== undefined) out.autoFill = p.auto_fill;
  if (p.auto_serial) out.autoSerial = p.auto_serial;
  if (Array.isArray(p.options)) {
    out.optionCount = p.options.length;
    if (!isPersonalLabel(field.field_name) && p.options.length <= MAX_OPTIONS)
      out.options = p.options.map((option) => option.name);
  }
  return out;
}

/**
 * Replaces Lark's internal references with names:
 * `bitable::$table[tblA].$field[fldB]` → `[Bảng A].[Trường B]`, `$column[fldC]` → `[Trường C]`.
 */
export function readableFormula(expression, tables) {
  if (!expression) return '';
  const byId = new Map(tables.map((table) => [table.id, table]));
  let current = null;
  return expression.replace(
    /bitable::\$table\[(tbl[A-Za-z0-9]+)\](?:\.\$field\[(fld[A-Za-z0-9]+)\])?|\$column\[(fld[A-Za-z0-9]+)\]|\$field\[(fld[A-Za-z0-9]+)\]/g,
    (match, tableId, fieldId, columnId, bareFieldId) => {
      if (tableId) {
        const table = byId.get(tableId);
        current = table ?? null;
        const tableName = table?.name ?? tableId;
        if (!fieldId) return `[${tableName}]`;
        return `[${tableName}].[${fieldName(table, fieldId)}]`;
      }
      const id = columnId ?? bareFieldId;
      return `[${fieldName(current, id, tables)}]`;
    },
  );
}

function fieldName(table, fieldId, tables = []) {
  const own = table?.fields?.find((field) => field.id === fieldId);
  if (own) return own.name;
  for (const other of tables) {
    const found = other.fields?.find((field) => field.id === fieldId);
    if (found) return found.name;
  }
  return fieldId;
}

/**
 * A view filter without its values: views such as "filter học sinh" store a student's name
 * or record id as the value. Only the field, the operator and whether a value is set remain.
 */
export function sanitizeViewFilter(filterInfo) {
  if (!filterInfo?.conditions?.length) return undefined;
  return {
    conjunction: filterInfo.conjunction,
    conditions: filterInfo.conditions.map((condition) => ({
      fieldId: condition.field_id,
      fieldType: FIELD_TYPES[condition.field_type] ?? condition.field_type,
      operator: condition.operator,
      hasValue:
        condition.value !== null &&
        condition.value !== undefined &&
        condition.value !== '[]',
    })),
  };
}
