import type { DatabaseManager } from '@nocobase/db';

import { unexcusedAbsenceDeducts } from '../so-du.js';
import {
  docTrangThaiHienCo,
  ghiKeHoach,
  moPhongGhi,
  ghiNhatKy,
  userExists,
} from './ghi.js';
import {
  lapKeHoach,
  nhomLoi,
  PLAN_TABLES,
  tongKetTheoBang,
  type BalanceRow,
  type Plan,
  type PlanTable,
  type TableTotals,
} from './ke-hoach.js';
import { LarkImportError, readLarkData, type LarkSource } from './nguon.js';

/** Tables the command could not read and skips. None now: `Contact` and `Deal HP` are read since DS-60 phase 3. */
export const SKIPPED_TABLES: readonly string[] = [];

/** Codes of mistakes in how the command is used (flags, environment): the command exits with code 2 for them. */
export const USAGE_ERROR_CODES: readonly string[] = [
  'LARK_HAI_CHE_DO',
  'LARK_THIEU_USER',
  'LARK_DELAY_SAI',
  'LARK_THIEU_BIEN',
  'LARK_USER_KHONG_TON_TAI',
];

export interface ImportOptions {
  readonly commit: boolean;
  readonly userId: string | null;
  readonly delayMs: number;
}

/**
 * The flags of `edu import-lark`. `--dry-run` is the default; `--dry-run` and `--commit` together are refused, and
 * `--commit` needs `--user` (the person who runs it, written on every row as the creator). Exit code 2 for all of them.
 */
export function parseImportOptions(flags: {
  readonly dryRun?: boolean;
  readonly commit?: boolean;
  readonly user?: string;
  readonly delayMs?: number;
}): ImportOptions {
  if (flags.dryRun && flags.commit)
    throw new LarkImportError(
      'LARK_HAI_CHE_DO',
      'Use either --dry-run or --commit, not both.',
    );
  if (flags.commit && !flags.user?.trim())
    throw new LarkImportError(
      'LARK_THIEU_USER',
      '--commit needs --user <id>: the user who runs the import.',
    );
  const delayMs = flags.delayMs ?? 1200;
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 60_000)
    throw new LarkImportError(
      'LARK_DELAY_SAI',
      '--delay-ms must be a whole number between 0 and 60000.',
    );
  return {
    commit: flags.commit === true,
    userId: flags.commit ? (flags.user as string).trim() : null,
    delayMs,
  };
}

/**
 * What the simulated write found (`moPhongGhi`): the balance of every student after the import, by Lark record id, or
 * the names of what refused the write. `null`: no simulation (a commit report, or a plan with structural errors).
 */
export type Simulation =
  | { readonly ok: true; readonly soDu: ReadonlyMap<string, number> }
  | { readonly ok: false; readonly hint: string }
  | null;

export interface ImportReport {
  readonly mode: 'dry-run' | 'commit';
  /** The simulated write of a dry run: how many students end with a balance other than the recomputed one, or why it failed. */
  readonly simulation:
    | { readonly ok: true; readonly khacTinhLai: number }
    | { readonly ok: false; readonly hint: string }
    | null;
  readonly tables: Readonly<Record<PlanTable, TableTotals>>;
  readonly problems: ReturnType<typeof nhomLoi>;
  readonly warnings: ReturnType<typeof nhomLoi>;
  readonly structural: readonly string[];
  readonly balance: {
    readonly match: number;
    readonly differ: number;
    readonly unknown: number;
    /** Codes only (`HV-…`), the balance on Lark, the recomputed one and the difference. */
    readonly rows: readonly BalanceRow[];
  };
  readonly skippedTables: readonly string[];
  readonly written?: Readonly<Record<PlanTable, number>>;
  readonly ledgerRows?: number;
  readonly boSung?: number;
}

export function taoBaoCao(
  plan: Plan,
  mode: 'dry-run' | 'commit',
  simulation: Simulation = null,
): ImportReport {
  // "Tính lại từ Lark" is what Lark alone gives; "số dư sau nhập" is what the database holds after the write, read after
  // a simulated write that was rolled back (mode dry-run) — the two differ when earlier data was changed since.
  const rows = plan.balances.map((row) => ({
    ...row,
    soDuSauNhap:
      simulation?.ok === true
        ? (simulation.soDu.get(row.hocVienKey) ?? null)
        : null,
  }));
  const differ = rows.filter(
    (row) => row.difference !== null && row.difference !== 0,
  );
  return {
    mode,
    simulation:
      simulation === null
        ? null
        : simulation.ok
          ? {
              ok: true,
              khacTinhLai: rows.filter(
                (row) =>
                  row.soDuSauNhap !== null &&
                  row.soDuSauNhap !== row.recomputed,
              ).length,
            }
          : { ok: false, hint: simulation.hint },
    tables: tongKetTheoBang(plan),
    problems: nhomLoi(plan.problems),
    warnings: nhomLoi(plan.warnings),
    structural: plan.structural,
    balance: {
      match: rows.filter((row) => row.difference === 0).length,
      differ: differ.length,
      unknown: rows.filter((row) => row.difference === null).length,
      rows,
    },
    skippedTables: SKIPPED_TABLES,
  };
}

/** The report as lines of text. Only counts, Lark ids and codes: no name, phone number, email or date of birth. */
export function inBaoCao(report: ImportReport, maxBalanceRows = 200): string[] {
  const lines: string[] = [
    `Chế độ: ${report.mode === 'commit' ? 'GHI THẬT (--commit)' : 'CHẠY THỬ (--dry-run), không ghi gì'}`,
    '',
    'Tổng kết theo bảng (dòng | tạo | trùng | ghép | bổ sung | lỗi):',
  ];
  for (const table of PLAN_TABLES) {
    const t = report.tables[table];
    lines.push(
      `  ${table.padEnd(9)} ${String(t.rows).padStart(6)} | ${String(t.tao).padStart(6)} | ${String(t.trung).padStart(5)} | ${String(t.ghep).padStart(5)} | ${String(t.boSung).padStart(8)} | ${String(t.loi).padStart(5)}`,
    );
  }
  lines.push('');
  if (report.skippedTables.length > 0)
    lines.push(
      `Bảng bị bỏ qua (app không đọc được): ${report.skippedTables.join(', ')}`,
    );
  if (report.structural.length > 0)
    lines.push(
      `LỖI CẤU TRÚC (không cho --commit): ${report.structural.join(', ')}`,
    );
  const printGroups = (title: string, groups: ImportReport['problems']) => {
    if (groups.length === 0) return;
    lines.push('', title);
    for (const group of groups)
      lines.push(
        `  ${group.table} ${group.code}: ${group.count} dòng, ví dụ ${group.ids.slice(0, 5).join(', ')}`,
      );
  };
  printGroups('Dòng bị bỏ (lỗi) theo bảng và lý do:', report.problems);
  printGroups('Cảnh báo (vẫn nhập):', report.warnings);
  const kept = report.warnings
    .filter(
      (g) =>
        g.code === 'GOI_CU_LARK_SODU' || g.code === 'DIEM_DANH_CU_KHONG_TRU',
    )
    .reduce((sum, g) => sum + g.count, 0);
  if (kept > 0)
    lines.push(
      '',
      `Học viên đã nhập trước giai đoạn 3 và GIỮ số dư cũ (bỏ qua Deal HP của họ, xem docs/lark/nhap-production.md): ${kept}.`,
    );
  const changed = report.warnings
    .filter((g) => g.code === 'DEAL_DA_DOI' || g.code === 'SO_DU_LARK_DA_DOI')
    .reduce((sum, g) => sum + g.count, 0);
  if (changed > 0)
    lines.push(
      '',
      `Deal hoặc số dư trên Lark đã đổi từ lần nhập trước; gói đã ghi KHÔNG được sửa, số dư tính theo giá trị đã ghi: ${changed}.`,
    );
  lines.push(
    '',
    `So sánh số dư buổi tính lại với số dư trên Lark: ${report.balance.match} khớp, ${report.balance.differ} lệch, ${report.balance.unknown} không so được.`,
  );
  if (report.simulation?.ok === false)
    lines.push(
      '',
      `MÔ PHỎNG GHI LỖI: --commit sẽ không ghi được${report.simulation.hint ? ` (bị từ chối bởi: ${report.simulation.hint})` : ''}; không có cột "số dư sau nhập".`,
    );
  if (report.simulation?.ok === true)
    lines.push(
      `Số dư sau nhập là số dư thật --commit sẽ ghi (đọc lại từ CSDL sau một lần ghi thử đã hoàn tác). ${report.simulation.khacTinhLai} học viên có số dư sau nhập khác số tính lại từ Lark (dữ liệu đã nhập trước đó, hoặc Lark đã đổi).`,
    );
  const differing = report.balance.rows.filter(
    (row) =>
      row.difference !== 0 ||
      (row.soDuSauNhap !== null &&
        row.soDuSauNhap !== undefined &&
        row.soDuSauNhap !== row.recomputed),
  );
  if (differing.length > 0) {
    lines.push(
      '  mã học viên cũ | trên Lark | Σ tồn Deal | tính lại từ Lark | số dư sau nhập | chênh (tính lại − Lark)',
    );
    for (const row of differing.slice(0, maxBalanceRows))
      lines.push(
        `  ${row.externalCode} | ${row.larkBalance ?? '?'} | ${row.dealRemaining ?? '?'} | ${row.recomputed}${row.giuSoDuCu ? ' (giữ số dư cũ)' : ''} | ${row.soDuSauNhap ?? '?'} | ${row.difference ?? '?'}`,
      );
    if (differing.length > maxBalanceRows)
      lines.push(
        `  … còn ${differing.length - maxBalanceRows} dòng (dùng --json)`,
      );
  }
  if (report.written)
    lines.push(
      '',
      `Đã ghi: ${PLAN_TABLES.map((t) => `${t} ${report.written?.[t] ?? 0}`).join(', ')}; sổ số dư ${report.ledgerRows ?? 0} dòng; liên kết phụ huynh bổ sung ${report.boSung ?? 0}.`,
    );
  return lines;
}

/**
 * Runs the import. Reads Lark into memory, builds the plan, and either returns the report (`--dry-run`: nothing is
 * written, not even the log) or writes the same plan in one transaction and logs the run (`--commit`).
 */
export async function chayNhap(
  database: DatabaseManager,
  source: LarkSource,
  options: ImportOptions,
  log: (line: string) => void = () => {},
): Promise<ImportReport> {
  if (options.commit && !(await userExists(database, options.userId ?? ''))) {
    throw new LarkImportError(
      'LARK_USER_KHONG_TON_TAI',
      '--user does not match any user of this application.',
    );
  }
  const data = await readLarkData(source, log);
  const existing = await docTrangThaiHienCo(database);
  const plan = lapKeHoach(data, existing, {
    unexcusedAbsenceDeducts: unexcusedAbsenceDeducts(process.env),
  });
  if (!options.commit) {
    // The dry run runs the write of `--commit` inside a transaction and rolls it back, so "số dư sau nhập" is the
    // balance the commit leaves. Nothing stays, not even the log row. A plan with structural errors is not written.
    let simulation: Simulation = null;
    if (plan.structural.length === 0) {
      try {
        const result = await moPhongGhi(database, plan, {
          userId: 'dry-run',
        });
        simulation = { ok: true, soDu: result.soDu };
      } catch (error) {
        simulation = { ok: false, hint: identifiersOf(error) };
      }
    }
    return taoBaoCao(plan, 'dry-run', simulation);
  }
  const report = taoBaoCao(plan, 'commit');
  if (plan.structural.length > 0)
    throw new LarkImportError(
      'LARK_KE_HOACH_LOI_CAU_TRUC',
      `The plan has structural errors (${plan.structural.join(', ')}); nothing was written.`,
    );

  const startedAt = new Date();
  const userId = options.userId as string;
  let result: Awaited<ReturnType<typeof ghiKeHoach>>;
  try {
    result = await ghiKeHoach(database, plan, { userId });
  } catch (error) {
    // The transaction rolled back. The failure is kept in its own row as codes and identifiers only (no message that
    // could hold a value), and the command names the table or constraint that refused the write.
    const hint = identifiersOf(error);
    try {
      await ghiNhatKy(database, {
        batDauLuc: startedAt,
        nguoiChayId: userId,
        trangThai: 'that_bai',
        tongKet: {
          ...report,
          // the balance table is left out of a failure row: it is large and says nothing about the failure
          balance: { ...report.balance, rows: [] },
          error: error instanceof LarkImportError ? error.code : 'GHI_THAT_BAI',
          ...(hint ? { hint } : {}),
        },
      });
    } catch {
      // The write failed first; a log row that cannot be written changes nothing for the person reading the error.
    }
    throw error instanceof LarkImportError
      ? error
      : new LarkImportError(
          'LARK_GHI_THAT_BAI',
          `The write failed and was rolled back${hint ? ` (refused by: ${hint})` : ''}; see the log row of this run.`,
        );
  }

  // The data is committed from here on. A failure to write the log row must not be reported as a rollback, and it
  // must not add a "failed" row: running the command again shows every row as a duplicate.
  const done = {
    ...report,
    written: result.written,
    ledgerRows: result.ledgerRows,
    boSung: result.boSung,
  };
  try {
    await ghiNhatKy(database, {
      batDauLuc: startedAt,
      nguoiChayId: userId,
      trangThai: 'thanh_cong',
      tongKet: done,
    });
  } catch {
    throw new LarkImportError(
      'LARK_DA_GHI_LOI_NHAT_KY',
      'The data was written and committed, but the log row could not be written. Nothing was rolled back; run --dry-run to see every row as a duplicate.',
    );
  }
  return done;
}

/**
 * Names of the tables, columns or constraints in a database error, never the values: `UNIQUE constraint failed:
 * eduCoSo.ma` (SQLite) or `constraint "uq_edu_co_so_ma"` (PostgreSQL). Anything else gives an empty string.
 */
export function identifiersOf(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const names: string[] = [];
  const sqlite =
    /(?:UNIQUE|NOT NULL|FOREIGN KEY|CHECK) constraint failed: ([\w.]+(?:, [\w.]+)*)/u.exec(
      message,
    );
  if (sqlite?.[1]) names.push(sqlite[1]);
  for (const match of message.matchAll(
    /(?:constraint|relation|table|column) "(\w+)"/gu,
  ))
    if (match[1]) names.push(match[1]);
  return [...new Set(names)].join('; ');
}
