#!/usr/bin/env node
// Renders docs/lark/schema.md from the structure files written by giai-ma.mjs.
//
//   node scripts/lark/render-schema.mjs <structure.json> [more.json …] > docs/lark/schema.md
//
// The input holds structure only (see analyze.mjs); review the output before committing it.
import { readFileSync } from 'node:fs';

import {
  isPersonalLabel,
  readableFormula,
  sheetSignature,
} from './analyze.mjs';

const inputs = process.argv
  .slice(2)
  .map((file) => JSON.parse(readFileSync(file, 'utf8')));
const bases = inputs.flatMap((input) => input.bases ?? []);
const spreadsheets = inputs.flatMap((input) => input.spreadsheets ?? []);
const commands = [
  ...new Set(inputs.flatMap((input) => input.commands ?? [])),
].sort();
const generatedAt = inputs
  .map((input) => input.generatedAt)
  .sort()
  .at(-1);

const cell = (value) =>
  String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
const code = (value) => (value ? `\`${cell(value).replace(/`/g, "'")}\`` : '');

function compressTitles(titles) {
  // "B7, B8, …, B126" → "B7–B126" when the numbers run consecutively under one prefix.
  const groups = [];
  for (const title of titles) {
    const match = /^([^\d]*)(\d+)(.*)$/.exec(title);
    const last = groups.at(-1);
    if (
      match &&
      last &&
      last.prefix === match[1] &&
      last.suffix === '' &&
      match[3] === '' &&
      Number(match[2]) === last.end + 1
    ) {
      last.end = Number(match[2]);
      last.endTitle = title;
      last.count++;
      continue;
    }
    if (
      match &&
      last &&
      last.prefix === match[1] &&
      last.suffix !== '' &&
      match[3] === '' &&
      Number(match[2]) === last.end + 1
    ) {
      last.end = Number(match[2]);
      last.endTitle = title;
      last.count++;
      continue;
    }
    groups.push({
      prefix: match?.[1],
      start: match ? Number(match[2]) : null,
      end: match ? Number(match[2]) : null,
      suffix: match?.[3] ?? '',
      title,
      endTitle: title,
      count: 1,
    });
  }
  return groups
    .map((g) => (g.count > 1 ? `${g.title}–${g.endTitle}` : g.title))
    .join(', ');
}

/**
 * Merges families that differ only by where a column total sits (older structure files grouped
 * on exact row offsets), and drops legends of columns whose header looks personal.
 */
function regroup(book) {
  const merged = new Map();
  for (const family of book.families) {
    const key = sheetSignature(family);
    const into = merged.get(key);
    if (!into) {
      merged.set(key, {
        ...family,
        sheets: [...family.sheets],
        ids: [family.id],
        columns: family.columns.map((c) => ({
          ...c,
          kinds: { ...c.kinds },
          legend: c.legend ? { ...c.legend } : undefined,
          formulas: c.formulas.map((f) => ({ ...f })),
        })),
      });
      continue;
    }
    into.sheets.push(...family.sheets);
    into.ids.push(family.id);
    for (const column of family.columns) {
      const target = into.columns.find((c) => c.col === column.col);
      if (!target) continue;
      for (const [kind, n] of Object.entries(column.kinds))
        target.kinds[kind] = (target.kinds[kind] ?? 0) + n;
      if (column.legend) {
        target.legend ??= {};
        for (const [value, n] of Object.entries(column.legend))
          target.legend[value] = (target.legend[value] ?? 0) + n;
      }
      for (const formula of column.formulas) {
        const shape = formula.pattern.replace(/R\[-?\d+\]/g, 'R[*]');
        const known = target.formulas.find(
          (f) => f.pattern.replace(/R\[-?\d+\]/g, 'R[*]') === shape,
        );
        if (known) known.count += formula.count;
        else target.formulas.push({ ...formula });
      }
    }
  }
  const families = [...merged.values()];
  families.forEach((family, i) => {
    family.id = `N${i + 1}`;
    for (const column of family.columns)
      if (isPersonalLabel(column.header)) delete column.legend;
  });
  const owner = new Map();
  for (const family of families)
    for (const title of family.sheets) owner.set(title, family.id);
  for (const sheet of book.sheets)
    if (owner.has(sheet.title)) sheet.family = owner.get(sheet.title);
  return families;
}

function tableName(base, id) {
  return (
    base.tables.find((table) => table.id === id)?.name ??
    `${id} (không đọc được)`
  );
}

function fieldName(base, tableId, fieldId) {
  return (
    base.tables
      .find((table) => table.id === tableId)
      ?.fields.find((field) => field.id === fieldId)?.name ?? fieldId
  );
}

function requiredIn(table, field) {
  const forms = table.forms.filter((form) =>
    form.questions.some((q) => q.fieldId === field.id && q.required),
  );
  return forms.length
    ? `Có (biểu mẫu ${forms.map((form) => `"${form.name}"`).join(', ')})`
    : '';
}

function describeField(base, table, field) {
  const parts = [];
  if (field.linkTable)
    parts.push(
      `→ **${tableName(base, field.linkTable)}**${field.multiple ? ' (nhiều)' : ' (một)'}`,
    );
  if (field.lookupTable) {
    parts.push(
      `tra cứu **${tableName(base, field.lookupTable)}**.${fieldName(base, field.lookupTable, field.lookupField)}${field.rollUp ? ' (gộp: tính tổng/tổng hợp)' : ''}`,
    );
  }
  if (field.formula)
    parts.push(
      `${code(field.formula)}<br>đọc là: ${code(readableFormula(field.formula, base.tables))}`,
    );
  if (field.options)
    parts.push(
      `lựa chọn: ${field.options.map((option) => code(option)).join(', ') || '(trống)'}`,
    );
  else if (field.optionCount)
    parts.push(
      `${field.optionCount} lựa chọn (không in vì có thể là dữ liệu cá nhân)`,
    );
  if (field.autoSerial)
    parts.push(
      `mã tự tăng: ${field.autoSerial.options?.map((o) => (o.type === 'fixed_text' ? o.value : `<${o.type}${o.value ? `:${o.value}` : ''}>`)).join('') ?? field.autoSerial.type}`,
    );
  if (field.dateFormatter) parts.push(`định dạng ${code(field.dateFormatter)}`);
  return parts.join('<br>');
}

function mermaid(base) {
  const ids = new Map();
  const alias = (tableId) => {
    if (!ids.has(tableId)) ids.set(tableId, `T${ids.size + 1}`);
    return ids.get(tableId);
  };
  const lines = [];
  const seen = new Set();
  for (const table of base.tables) {
    for (const field of table.fields) {
      if (!field.linkTable) continue;
      const pair = [
        table.id,
        field.linkTable,
        field.backField ?? field.id,
      ].join(':');
      const back = [field.linkTable, table.id, field.id].join(':');
      if (seen.has(back)) continue;
      seen.add(pair);
      const many = field.multiple ? '}o--o{' : '}o--o|';
      lines.push(
        `  ${alias(table.id)} ${many} ${alias(field.linkTable)} : "${field.name.replace(/"/g, "'")}"`,
      );
    }
  }
  const entities = [...ids.entries()].map(
    ([tableId, a]) =>
      `  ${a}["${tableName(base, tableId).replace(/"/g, "'")}"]`,
  );
  return ['```mermaid', 'erDiagram', ...entities, ...lines, '```'].join('\n');
}

function viewFilter(base, table, filter) {
  if (!filter) return '';
  return filter.conditions
    .map(
      (c) =>
        `${fieldName(base, table.id, c.fieldId)} ${c.operator}${c.hasValue ? ' <giá trị>' : ''}`,
    )
    .join(filter.conjunction === 'or' ? ' HOẶC ' : ' VÀ ');
}

const out = [];
out.push('# Cấu trúc dữ liệu trên Lark (giải mã giai đoạn 1)');
out.push('');
out.push(
  `Sinh bằng \`scripts/lark/giai-ma.mjs\` và \`scripts/lark/render-schema.mjs\` lúc ${generatedAt}. Chỉ có cấu trúc và số bản ghi; không có nội dung bản ghi nào của học viên (tri thức 05). Các giá trị trong bộ lọc view bị thay bằng \`<giá trị>\`; lựa chọn của trường có tên giống dữ liệu cá nhân không được in.`,
);
out.push('');
out.push(
  'Diễn giải nghiệp vụ, mâu thuẫn và đề xuất ánh xạ: [quy-tac-nghiep-vu.md](quy-tac-nghiep-vu.md).',
);
out.push('');

for (const base of bases) {
  out.push(`## Base "${base.name}"`);
  out.push('');
  out.push(
    `- Token: \`${base.token}\`, múi giờ \`${base.timeZone}\`, quyền nâng cao: ${base.advanced ? 'bật' : 'tắt'}.`,
  );
  out.push(
    `- App đọc được ${base.tables.length} bảng. Base không có cờ "bắt buộc" ở mức trường; cột "Bắt buộc" dưới đây lấy từ câu hỏi bắt buộc của biểu mẫu (form view), ô trống là không bắt buộc.`,
  );
  for (const table of base.unreadableTables ?? []) {
    const reason =
      table.error?.code === 1254302
        ? 'quyền nâng cao của Base không cấp cho app (`1254302 The role has no permissions`)'
        : table.error?.code === 1254041
          ? 'bảng không còn tồn tại (`1254041 TableIdNotFound`), liên kết cũ còn sót'
          : `lỗi \`${table.error?.code}\``;
    out.push(
      `- **Không đọc được** \`${table.id}\`: ${reason}. Cấu trúc **chưa giải mã**, không đoán.`,
    );
  }
  const wf = Array.isArray(base.workflows)
    ? `${base.workflows.length} workflow`
    : `API trả lỗi \`${base.workflows?.error?.code}\` (${cell(base.workflows?.error?.message).slice(0, 60)}…), chưa liệt kê được`;
  out.push(
    `- Automation/workflow: ${wf}. Dashboard: ${Array.isArray(base.dashboards) ? base.dashboards.length : 'lỗi'}. Vai trò quyền nâng cao: ${Array.isArray(base.roles) ? base.roles.length : `API trả lỗi \`${base.roles?.error?.code}\``}.`,
  );
  out.push('');
  out.push('### Sơ đồ quan hệ');
  out.push('');
  out.push(mermaid(base));
  out.push('');
  out.push('### Danh sách bảng');
  out.push('');
  out.push('| Bảng | Id | Số bản ghi | Số trường | View |');
  out.push('| --- | --- | ---: | ---: | --- |');
  for (const table of base.tables) {
    out.push(
      `| ${cell(table.name)} | \`${table.id}\` | ${table.recordCount ?? '?'} | ${table.fields.length} | ${table.views.map((v) => `${cell(v.name)} (${v.type})`).join(', ')} |`,
    );
  }
  out.push('');
  for (const table of base.tables) {
    out.push(`### ${cell(table.name)}`);
    out.push('');
    out.push(
      `\`${table.id}\` · ${table.recordCount ?? '?'} bản ghi · trường chính (primary) là trường đánh dấu ★.`,
    );
    out.push('');
    out.push('| Trường | Loại | Bắt buộc | Chi tiết |');
    out.push('| --- | --- | --- | --- |');
    for (const field of table.fields) {
      out.push(
        `| ${field.primary ? '★ ' : ''}${cell(field.name)} | ${field.type} | ${requiredIn(table, field)} | ${describeField(base, table, field)} |`,
      );
    }
    const filtered = table.views.filter((view) => view.filter);
    if (filtered.length) {
      out.push('');
      out.push(
        `View có bộ lọc: ${filtered.map((view) => `"${cell(view.name)}": ${viewFilter(base, table, view.filter)}`).join('; ')}.`,
      );
    }
    out.push('');
  }
}

for (const book of spreadsheets) {
  out.push(`## Sheet "${book.title}"`);
  out.push('');
  out.push(
    `Token \`${book.token}\` · ${book.sheets.length} sheet${book.error ? ` · lỗi ${book.error.code}` : ''}.`,
  );
  out.push('');
  out.push(
    'Các sheet được gom thành **nhóm** khi có cùng tiêu đề cột và cùng mẫu công thức (bỏ qua ngày/số buổi trong tiêu đề). Công thức ghi ở dạng nguyên văn (ô ví dụ) và dạng tương đối `R[dòng]C[cột]` để thấy cùng một công thức kéo xuống.',
  );
  out.push('');
  for (const family of regroup(book)) {
    const members = book.sheets.filter((sheet) => sheet.family === family.id);
    const rows = members.map((sheet) => sheet.dataRows ?? 0);
    out.push(`### Nhóm ${family.id}: ${members.length} sheet`);
    out.push('');
    out.push(`Sheet: ${compressTitles(family.sheets)}.`);
    out.push('');
    out.push(
      `Số dòng dữ liệu (không kể tiêu đề) mỗi sheet: ${Math.min(...rows)}–${Math.max(...rows)}. Dòng tiêu đề: ${[...new Set(members.map((s) => s.headerRow))].join(', ')}.`,
    );
    out.push('');
    out.push(
      '| Cột | Tiêu đề (sheet đầu) | Kiểu ô (tổng cả nhóm) | Công thức | Mã giá trị lặp lại |',
    );
    out.push('| --- | --- | --- | --- | --- |');
    for (const column of family.columns) {
      const kinds = Object.entries(column.kinds)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ');
      const formulas = column.formulas
        .slice(0, 4)
        .map((f) => `${code(f.example)} (${f.exampleCell}; ${f.count} ô)`)
        .join('<br>');
      const more =
        column.formulas.length > 4
          ? `<br>… và ${column.formulas.length - 4} mẫu khác`
          : '';
      const legend = column.legend
        ? Object.entries(column.legend)
            .map(([v, n]) => `${code(v)}×${n}`)
            .join(', ')
        : '';
      out.push(
        `| ${column.col} | ${cell(column.header)} | ${kinds} | ${formulas}${more} | ${legend} |`,
      );
    }
    const overrides = members.filter(
      (sheet) => sheet.columnsWithLiteralOverFormula?.length,
    );
    if (overrides.length) {
      out.push('');
      out.push(
        `Ô giá trị nằm giữa vùng công thức (có thể nhập tay đè): ${overrides
          .slice(0, 30)
          .map(
            (sheet) =>
              `${sheet.title} ${sheet.columnsWithLiteralOverFormula.map((c) => `${c.col}[${c.rows}]`).join(' ')}`,
          )
          .join(
            '; ',
          )}${overrides.length > 30 ? `; … và ${overrides.length - 30} sheet khác` : ''}.`,
      );
    }
    out.push('');
  }
  out.push('<details><summary>Từng sheet</summary>');
  out.push('');
  out.push(
    '| Sheet | Id | Ẩn | Kích thước | Dòng tiêu đề | Vùng dữ liệu | Dòng dữ liệu | Ô công thức | Nhóm |',
  );
  out.push('| --- | --- | --- | --- | ---: | --- | ---: | ---: | --- |');
  for (const sheet of book.sheets) {
    out.push(
      `| ${cell(sheet.title)} | \`${sheet.id}\` | ${sheet.hidden ? 'ẩn' : ''} | ${sheet.grid?.row_count}×${sheet.grid?.column_count} | ${sheet.headerRow ?? ''} | ${sheet.dataRange ?? ''} | ${sheet.dataRows ?? ''} | ${sheet.formulaCells ?? ''} | ${sheet.family ?? sheet.type} |`,
    );
  }
  out.push('');
  out.push('</details>');
  out.push('');
}

out.push('## Lệnh đã dùng');
out.push('');
out.push(
  'Mọi lệnh chạy qua `lark-cli` 1.0.99 chính chủ với `--as bot`. Các lệnh tắt `lark-cli base +…` cần scope `base:*` mà app chưa được cấp, nên script dùng lớp raw `lark-cli api` gọi OpenAPI `bitable/v1` và `sheets/v2|v3`:',
);
out.push('');
out.push('```text');
for (const command of commands) out.push(command);
out.push('```');
out.push('');
process.stdout.write(`${out.join('\n')}\n`);
