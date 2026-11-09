#!/usr/bin/env node
// Decodes the structure of the club's Lark Base and Sheets (DS-60, phase 1).
//
//   LARK_APP_ID=… LARK_APP_SECRET=… LARK_DOMAIN=https://open.larksuite.com \
//   LARK_CLI=/path/to/lark-cli node scripts/lark/giai-ma.mjs [--out <file>] [--delay-ms 1200]
//
// Reads only structure: tables, fields, formulas, links, views, forms, workflows; sheet
// titles, headers, formulas per column and data regions. Records are only counted. The
// output is written outside the repository (default: $TMPDIR/lark-giai-ma/structure.json)
// and is refused inside it, so nothing exported from Lark can be committed by accident.
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  analyzeSheet,
  columnLetter,
  sanitizeField,
  sanitizeViewFilter,
  sheetSignature,
} from './analyze.mjs';
import { createLark, listAll, summarizeError } from './lark-cli.mjs';

export const SOURCES = {
  bases: ['V7DHb5fvQaqnrGsH6fFlysuJgme'],
  sheets: ['VHaDsts8ohJGj1tqDLtleFQOgIc', 'UKrOsarW5hnqaptCW2ilzL7zgrc'],
};

const ROWS_PER_READ = 300;
const repoRoot = path.resolve(import.meta.dirname, '..', '..');

function parseArgs(argv) {
  const args = {
    out: path.join(os.tmpdir(), 'lark-giai-ma', 'structure.json'),
    delayMs: 1200,
    only: null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
    else if (argv[i] === '--delay-ms') args.delayMs = Number(argv[++i]);
    else if (argv[i] === '--only') args.only = argv[++i];
    else throw new Error(`Unknown argument ${argv[i]}`);
  }
  const relative = path.relative(repoRoot, args.out);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    throw new Error(
      'Refusing to write Lark output inside the repository; choose a path outside it.',
    );
  }
  return args;
}

async function decodeBase(lark, token) {
  const base = `/open-apis/bitable/v1/apps/${token}`;
  const meta = await lark.call('GET', base, {
    template: '/open-apis/bitable/v1/apps/:app_token',
  });
  const result = {
    token,
    name: meta.data?.app?.name,
    timeZone: meta.data?.app?.time_zone,
    advanced: meta.data?.app?.is_advanced,
    error: meta.ok ? undefined : summarizeError(meta.error),
    tables: [],
  };
  if (!meta.ok) return result;

  const tables = await listAll(lark, `${base}/tables`, {
    template: '/open-apis/bitable/v1/apps/:app_token/tables',
  });
  if (tables.error) result.tablesError = tables.error;

  for (const table of tables.items) {
    const tablePath = `${base}/tables/${table.table_id}`;
    const fields = await listAll(lark, `${tablePath}/fields`, {
      template: '/open-apis/bitable/v1/apps/:app_token/tables/:table_id/fields',
    });
    const views = await listAll(lark, `${tablePath}/views`, {
      template: '/open-apis/bitable/v1/apps/:app_token/tables/:table_id/views',
    });
    // Count only: page_size 1, and the one returned item is dropped unread.
    const count = await lark.call('GET', `${tablePath}/records`, {
      params: { page_size: 1 },
      template:
        '/open-apis/bitable/v1/apps/:app_token/tables/:table_id/records',
    });
    const entry = {
      id: table.table_id,
      name: table.name,
      recordCount: count.ok ? (count.data?.total ?? null) : null,
      countError: count.ok ? undefined : summarizeError(count.error),
      fieldsError: fields.error ?? undefined,
      fields: fields.items.map(sanitizeField),
      views: [],
      forms: [],
    };
    for (const view of views.items) {
      const detail = await lark.call(
        'GET',
        `${tablePath}/views/${view.view_id}`,
        {
          template:
            '/open-apis/bitable/v1/apps/:app_token/tables/:table_id/views/:view_id',
        },
      );
      const property = detail.data?.view?.property ?? {};
      entry.views.push({
        id: view.view_id,
        name: view.view_name,
        type: view.view_type,
        filter: sanitizeViewFilter(property.filter_info),
        hiddenFields: property.hidden_fields?.length ?? undefined,
      });
      if (view.view_type === 'form') {
        const questions = await listAll(
          lark,
          `${tablePath}/forms/${view.view_id}/fields`,
          {
            template:
              '/open-apis/bitable/v1/apps/:app_token/tables/:table_id/forms/:form_id/fields',
          },
        );
        entry.forms.push({
          viewId: view.view_id,
          name: view.view_name,
          error: questions.error ?? undefined,
          questions: questions.items.map((q) => ({
            fieldId: q.field_id,
            title: q.title,
            required: Boolean(q.required),
            visible: q.visible,
          })),
        });
      }
    }
    result.tables.push(entry);
  }

  // Tables other tables point to but the list did not return: probe why (permission or deleted).
  const listed = new Set(result.tables.map((table) => table.id));
  const referenced = new Set();
  for (const table of result.tables) {
    for (const field of table.fields) {
      for (const id of [
        field.linkTable,
        field.lookupTable,
        ...(field.formula?.match(/tbl[A-Za-z0-9]+/g) ?? []),
      ]) {
        if (id && !listed.has(id)) referenced.add(id);
      }
    }
  }
  result.unreadableTables = [];
  for (const id of referenced) {
    const probe = await lark.call('GET', `${base}/tables/${id}/fields`, {
      params: { page_size: 1 },
      template: '/open-apis/bitable/v1/apps/:app_token/tables/:table_id/fields',
    });
    result.unreadableTables.push({
      id,
      error: probe.ok ? null : summarizeError(probe.error),
    });
  }

  const workflows = await lark.call('GET', `${base}/workflows`, {
    template: '/open-apis/bitable/v1/apps/:app_token/workflows',
  });
  result.workflows = workflows.ok
    ? (workflows.data?.workflows ?? workflows.data?.items ?? []).map((w) => ({
        id: w.workflow_id,
        title: w.title,
        status: w.status,
      }))
    : { error: summarizeError(workflows.error) };
  const dashboards = await lark.call('GET', `${base}/dashboards`, {
    template: '/open-apis/bitable/v1/apps/:app_token/dashboards',
  });
  result.dashboards = dashboards.ok
    ? (dashboards.data?.dashboards ?? []).map((d) => ({
        id: d.block_id,
        name: d.name,
      }))
    : { error: summarizeError(dashboards.error) };
  const roles = await listAll(lark, `${base}/roles`, {
    template: '/open-apis/bitable/v1/apps/:app_token/roles',
  });
  result.roles = roles.error
    ? { error: roles.error }
    : roles.items.map((r) => ({ id: r.role_id, name: r.role_name }));
  return result;
}

async function readSheetValues(lark, token, sheet) {
  const rowCount = sheet.grid_properties?.row_count ?? 0;
  const lastCol = columnLetter(
    Math.max((sheet.grid_properties?.column_count ?? 1) - 1, 0),
  );
  const values = [];
  for (let start = 1; start <= rowCount; start += ROWS_PER_READ) {
    const end = Math.min(rowCount, start + ROWS_PER_READ - 1);
    const body = await lark.call(
      'GET',
      `/open-apis/sheets/v2/spreadsheets/${token}/values/${sheet.sheet_id}!A${start}:${lastCol}${end}`,
      {
        params: {
          valueRenderOption: 'Formula',
          dateTimeRenderOption: 'FormattedString',
        },
        template:
          '/open-apis/sheets/v2/spreadsheets/:token/values/:sheet_id!A1:<lastCol><n>',
      },
    );
    if (!body.ok) return { error: summarizeError(body.error) };
    const chunk = body.data?.valueRange?.values ?? [];
    for (let i = 0; i < end - start + 1; i++) values.push(chunk[i] ?? []);
  }
  return { values };
}

async function decodeSpreadsheet(lark, token) {
  const meta = await lark.call(
    'GET',
    `/open-apis/sheets/v3/spreadsheets/${token}`,
    { template: '/open-apis/sheets/v3/spreadsheets/:token' },
  );
  const list = await lark.call(
    'GET',
    `/open-apis/sheets/v3/spreadsheets/${token}/sheets/query`,
    {
      template: '/open-apis/sheets/v3/spreadsheets/:token/sheets/query',
    },
  );
  const result = {
    token,
    title: meta.data?.spreadsheet?.title,
    error: list.ok ? undefined : summarizeError(list.error),
    sheets: [],
    families: [],
  };
  if (!list.ok) return result;
  const families = new Map();
  for (const sheet of list.data.sheets ?? []) {
    const entry = {
      id: sheet.sheet_id,
      title: sheet.title,
      index: sheet.index,
      hidden: Boolean(sheet.hidden),
      type: sheet.resource_type,
      grid: sheet.grid_properties,
      merges: sheet.merges?.length ?? 0,
    };
    if (sheet.resource_type === 'sheet') {
      const read = await readSheetValues(lark, token, sheet);
      if (read.error) entry.error = read.error;
      else {
        const analysis = analyzeSheet(read.values, {
          frozenRows: sheet.grid_properties?.frozen_row_count ?? 0,
        });
        entry.headerRow = analysis.headerRow;
        entry.dataRange = analysis.dataRange;
        entry.dataRows = analysis.dataRows;
        const signature = sheetSignature(analysis);
        let family = families.get(signature);
        if (!family) {
          family = {
            id: `F${families.size + 1}`,
            sheets: [],
            columns: analysis.columns,
          };
          families.set(signature, family);
        } else {
          mergeColumns(family.columns, analysis.columns);
        }
        family.sheets.push(sheet.title);
        entry.family = family.id;
        entry.columnsWithLiteralOverFormula = analysis.columns
          .filter((column) => column.literalInsideFormulas)
          .map((column) => ({
            col: column.col,
            header: column.header,
            rows: column.literalInsideFormulas,
          }));
        entry.formulaCells = analysis.columns.reduce(
          (n, column) => n + (column.kinds.formula ?? 0),
          0,
        );
      }
    }
    result.sheets.push(entry);
  }
  result.families = [...families.values()];
  return result;
}

/** Keeps the first sheet's column description, summing kinds and joining legends. */
function mergeColumns(target, extra) {
  for (const column of extra) {
    const into = target.find((c) => c.col === column.col);
    if (!into) continue;
    for (const [kind, n] of Object.entries(column.kinds))
      into.kinds[kind] = (into.kinds[kind] ?? 0) + n;
    if (column.legend) {
      into.legend ??= {};
      for (const [value, n] of Object.entries(column.legend))
        into.legend[value] = (into.legend[value] ?? 0) + n;
    }
    for (const formula of column.formulas) {
      const known = into.formulas.find((f) => f.pattern === formula.pattern);
      if (known) known.count += formula.count;
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const calls = [];
  const lark = await createLark({
    delayMs: args.delayMs,
    log: (line) => {
      calls.push(line);
      process.stderr.write(`${line}\n`);
    },
  });
  const output = {
    generatedAt: new Date().toISOString(),
    bases: [],
    spreadsheets: [],
  };
  try {
    if (!args.only || args.only === 'base')
      for (const token of SOURCES.bases)
        output.bases.push(await decodeBase(lark, token));
    if (!args.only || args.only === 'sheets')
      for (const token of SOURCES.sheets)
        output.spreadsheets.push(await decodeSpreadsheet(lark, token));
  } finally {
    // lark-cli keeps its own config and logs under the temporary directory: nothing of Lark stays on disk.
    lark.close();
  }
  // Every call passes a path template, so the list holds no token or record id.
  output.commands = [...lark.commands];
  output.callCount = calls.length;
  output.failedCalls = calls.filter((line) => !line.endsWith('-> ok')).length;
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`);
  process.stderr.write(
    `Wrote ${args.out} (${calls.length} calls, ${output.failedCalls} failed)\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
