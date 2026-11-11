import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** A stable code the command prints; the message never carries a cell value. */
export class LarkImportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LarkImportError';
  }
}

/** The Base the club keeps its students in (`docs/lark/schema.md`). The token is an identifier, not a secret. */
export const LARK_BASE_TOKEN = 'V7DHb5fvQaqnrGsH6fFlysuJgme';

/**
 * The fixed tables the import reads: classes, students, the parents' contacts (`Contact`) and the payments (`Deal HP`).
 * `Level` (12 rows, no personal data) is read only to turn the link of a level into its name when the API sends the
 * record id alone. The attendance tables are found by name (see `NHAN_XET_TEN`). A table the app cannot see answers
 * `LARK_KHONG_DOC_DUOC`.
 */
export const LARK_TABLES = {
  lopHoc: { id: 'tblKvdbs97cDCMF9', title: 'LopHoc' },
  hocVien: { id: 'tblv524wVlgIsH5H', title: 'HocVien' },
  level: { id: 'tblvjJoqGcHsoxQr', title: 'Level' },
  contact: { id: 'tblZUIXmpdt13j4x', title: 'Contact' },
  dealHp: { id: 'tblHp1PGPz52eZBz', title: 'Deal HP' },
} as const;

export type LarkTableKey = keyof typeof LARK_TABLES;

/** The name of a yearly attendance table: `2026 Nhận xét mỗi buổi`. Compared after `normalize('NFC').trim()`. */
export const NHAN_XET_TEN = /^(\d{4}) Nhận xét mỗi buổi$/u;

/** The years that must exist, with the id each table has in the Base. A new year needs no change in the code. */
export const NHAN_XET_BAT_BUOC: Readonly<Record<number, string>> = {
  2024: 'tblprrzroE2NBli5',
  2025: 'tbluhrY4B8i63PAh',
  2026: 'tbl9TTf0m2EhWV3g',
};

/** The fields the plan reads from every yearly attendance table (`Số buổi còn lại` is empty in Lark and not read). */
export const NHAN_XET_FIELDS: readonly string[] = [
  'Ngày học - Day format',
  'Tên HS',
  'Lớp',
  'có mặt',
  'Kế hoạch dạy',
  'Làm BTVN',
  'Ý thức',
  'Kiến thức / lý thuyết mới',
  'Nhận xét',
  'Giao BTVN',
  'KH buổi sau',
];

/** The names the plan reads from each fixed table. A table missing one of them stops the import (`LARK_CAU_TRUC_DOI`). */
export const REQUIRED_FIELDS: Readonly<
  Record<LarkTableKey, readonly string[]>
> = {
  lopHoc: ['Tên lớp', 'cơ sở', 'Thứ', 'Ca dạy', 'GV Phụ trách'],
  hocVien: [
    'Học viên',
    'ID Học viên',
    'Ngày sinh',
    'email PH',
    'cơ sở',
    'Tình trạng học',
    'Quan hệ',
    'Trình độ hiện tại',
    'số buổi tồn update (vào ngày thống kê)',
    'Ngày update gần nhất về HP',
  ],
  level: [],
  // The parents. The columns of address, Facebook, job, notes and photos are never read (knowledge document 05).
  contact: [
    'Họ và tên PH contact',
    'MQH với HS',
    'Tên con số 1',
    'Tên con số 2',
    'Số đt',
    'số zalo',
    'email',
  ],
  // The payments. `Đã nộp` is a flag (1), not an amount: Lark holds no money amount.
  dealHp: [
    'Học viên',
    'Ngày nộp HP',
    'Ngày bắt đầu',
    'Đã nộp',
    'Số buổi nộp',
    'Số buổi đã học chưa thống kê',
    'Số buổi còn tồn',
  ],
};

/**
 * The fields the plan actually reads from each table; `records()` asks Lark for these and nothing else, so address,
 * Facebook, job, notes and photos never reach the memory of the command (knowledge document 05, "thu thập tối thiểu").
 * A field the plan starts to use must be added here, or the tests of the fixture source (which returns only the
 * requested fields) fail. `email PH` of the student row is not read: the email comes from `Contact`.
 */
export const READ_FIELDS: Readonly<Record<LarkTableKey, readonly string[]>> = {
  lopHoc: REQUIRED_FIELDS.lopHoc,
  hocVien: [
    ...REQUIRED_FIELDS.hocVien.filter((name) => name !== 'email PH'),
    'Các trình độ đã học tại CLB',
  ],
  level: ['Tên viết tắt level'],
  contact: REQUIRED_FIELDS.contact,
  dealHp: REQUIRED_FIELDS.dealHp,
};

/** The fields read from a yearly attendance table: `NHAN_XET_FIELDS` and the day as text (used when the date field is empty). */
export const NHAN_XET_READ_FIELDS: readonly string[] = [
  ...NHAN_XET_FIELDS,
  'Ngày học',
];

export interface LarkRecord {
  readonly recordId: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface LarkTableInfo {
  readonly id: string;
  readonly name: string;
}

/** Where the plan reads Lark from. The command uses `lark-cli`; the tests use a fixture with the same shape. */
export interface LarkSource {
  /**
   * The tables the app can see. A table the Base hides from the app (advanced permissions) is not in the list, and
   * asking for its fields answers `1254302`.
   */
  tables(): Promise<readonly LarkTableInfo[]>;
  /** The field names of a table, so a renamed or removed field is found before any record is read. */
  fieldNames(tableId: string): Promise<readonly string[]>;
  /** The records of a table. `fields` names the only fields to fetch; a source must not return others. */
  records(
    tableId: string,
    fields?: readonly string[],
  ): Promise<readonly LarkRecord[]>;
}

/** The records of every table the plan needs, read once and kept in memory only. */
export interface LarkData {
  readonly lopHoc: readonly LarkRecord[];
  readonly hocVien: readonly LarkRecord[];
  readonly level: readonly LarkRecord[];
  readonly contact: readonly LarkRecord[];
  readonly dealHp: readonly LarkRecord[];
  /** The rows of every yearly attendance table, oldest year first. */
  readonly nhanXet: readonly LarkRecord[];
}

/**
 * Finds the yearly attendance tables by name and checks them against `NHAN_XET_BAT_BUOC`: a required year that is
 * missing from the list is a table the app cannot see (`LARK_KHONG_DOC_DUOC`); a year with two tables, or with another
 * id than expected, means the Base changed (`LARK_CAU_TRUC_DOI`).
 */
export function findNhanXetTables(
  tables: readonly LarkTableInfo[],
): { year: number; id: string }[] {
  const byYear = new Map<number, string[]>();
  for (const table of tables) {
    const match = NHAN_XET_TEN.exec(table.name.normalize('NFC').trim());
    if (!match) continue;
    const year = Number(match[1]);
    byYear.set(year, [...(byYear.get(year) ?? []), table.id]);
  }
  const duplicated = [...byYear].filter(([, ids]) => ids.length > 1);
  if (duplicated.length > 0)
    throw new LarkImportError(
      'LARK_CAU_TRUC_DOI',
      `More than one attendance table for the year(s): ${duplicated.map(([year]) => year).join(', ')}`,
    );
  const missing = Object.keys(NHAN_XET_BAT_BUOC)
    .map(Number)
    .filter((year) => !byYear.has(year));
  if (missing.length > 0)
    throw new LarkImportError(
      'LARK_KHONG_DOC_DUOC',
      `The attendance table of the year(s) ${missing.join(', ')} is not in the list of tables the app can read.`,
    );
  const wrong = Object.entries(NHAN_XET_BAT_BUOC).filter(
    ([year, id]) => byYear.get(Number(year))?.[0] !== id,
  );
  if (wrong.length > 0)
    throw new LarkImportError(
      'LARK_CAU_TRUC_DOI',
      `The attendance table of the year(s) ${wrong.map(([year]) => year).join(', ')} has another id than expected.`,
    );
  return [...byYear]
    .map(([year, ids]) => ({ year, id: ids[0] }))
    .sort((a, b) => a.year - b.year);
}

/** Checks the field list of every table, then reads the records. Nothing is written anywhere. */
export async function readLarkData(
  source: LarkSource,
  log: (line: string) => void = () => {},
): Promise<LarkData> {
  const listed = await source.tables();
  const listedIds = new Set(listed.map((table) => table.id));
  const hidden = (Object.keys(LARK_TABLES) as LarkTableKey[]).filter(
    (key) => !listedIds.has(LARK_TABLES[key].id),
  );
  if (hidden.length > 0)
    throw new LarkImportError(
      'LARK_KHONG_DOC_DUOC',
      `Tables not in the list the app can read: ${hidden.join(', ')}`,
    );
  const yearly = findNhanXetTables(listed);

  const checks: { label: string; id: string; required: readonly string[] }[] = [
    ...(Object.keys(LARK_TABLES) as LarkTableKey[]).map((key) => ({
      label: key,
      id: LARK_TABLES[key].id,
      required: REQUIRED_FIELDS[key],
    })),
    ...yearly.map(({ year, id }) => ({
      label: `nhanXet${year}`,
      id,
      required: NHAN_XET_FIELDS,
    })),
  ];
  const changed: string[] = [];
  for (const check of checks) {
    const names = new Set(await source.fieldNames(check.id));
    for (const field of check.required)
      if (!names.has(field)) changed.push(`${check.label}: ${field}`);
  }
  if (changed.length > 0)
    throw new LarkImportError(
      'LARK_CAU_TRUC_DOI',
      `The Lark structure changed; missing or renamed fields: ${changed.join('; ')}`,
    );

  const read = async (label: string, id: string, fields: readonly string[]) => {
    const records = await source.records(id, fields);
    log(`read ${label}: ${records.length} records`);
    return records;
  };
  const lopHoc = await read(
    'lopHoc',
    LARK_TABLES.lopHoc.id,
    READ_FIELDS.lopHoc,
  );
  const hocVien = await read(
    'hocVien',
    LARK_TABLES.hocVien.id,
    READ_FIELDS.hocVien,
  );
  const level = await read('level', LARK_TABLES.level.id, READ_FIELDS.level);
  const contact = await read(
    'contact',
    LARK_TABLES.contact.id,
    READ_FIELDS.contact,
  );
  const dealHp = await read(
    'dealHp',
    LARK_TABLES.dealHp.id,
    READ_FIELDS.dealHp,
  );
  const nhanXet: LarkRecord[] = [];
  for (const { year, id } of yearly)
    nhanXet.push(...(await read(`nhanXet${year}`, id, NHAN_XET_READ_FIELDS)));
  return { lopHoc, hocVien, level, contact, dealHp, nhanXet };
}

export interface LarkCliOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Milliseconds a single `lark-cli` run may take before it is stopped. */
  readonly callTimeoutMs?: number;
  /** Milliseconds to wait between two calls. */
  readonly delayMs?: number;
  /** Test hook: replaces the real wait. */
  readonly sleep?: (milliseconds: number) => Promise<void>;
  /** Test hook: replaces the request that fetches the tenant access token. */
  readonly fetchToken?: (credentials: {
    appId: string;
    appSecret: string;
    domain: string;
  }) => Promise<{ token: string; expiresInSeconds: number }>;
  /** One line per call: method, path template and status, never a body. */
  readonly log?: (line: string) => void;
}

export interface LarkCliSource extends LarkSource {
  /** Removes the temporary directory the CLI used for its configuration and logs. */
  close(): Promise<void>;
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Variables a child process may inherit: where to find programs, temporary files, proxies and certificates. */
const CHILD_ENV_ALLOWED = new Set([
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
]);

export function childEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (
      CHILD_ENV_ALLOWED.has(name.toUpperCase()) ||
      name.startsWith('LARKSUITE_CLI_')
    )
      out[name] = value;
  }
  return out;
}

/** A call that does not answer in this time is abandoned: the token request and each `lark-cli` run. */
export const LARK_TOKEN_TIMEOUT_MS = 30_000;
export const LARK_CALL_TIMEOUT_MS = 120_000;

async function fetchTenantToken(credentials: {
  appId: string;
  appSecret: string;
  domain: string;
}): Promise<{ token: string; expiresInSeconds: number }> {
  const response = await fetch(
    new URL(
      '/open-apis/auth/v3/tenant_access_token/internal',
      credentials.domain,
    ),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        app_id: credentials.appId,
        app_secret: credentials.appSecret,
      }),
      signal: AbortSignal.timeout(LARK_TOKEN_TIMEOUT_MS),
    },
  ).catch(() => {
    throw new LarkImportError(
      'LARK_TOKEN',
      'The request for the tenant access token failed or timed out.',
    );
  });
  const body = (await response.json()) as {
    code?: number;
    tenant_access_token?: string;
    expire?: number;
  };
  if (body.code !== 0 || !body.tenant_access_token)
    throw new LarkImportError(
      'LARK_TOKEN',
      `Lark refused the tenant access token (code ${body.code ?? '?'}).`,
    );
  return {
    token: body.tenant_access_token,
    expiresInSeconds: body.expire ?? 3600,
  };
}

/**
 * Reads the Base through the official `lark-cli` (`lark-cli api GET … --as bot`), the way `scripts/lark/lark-cli.mjs`
 * does for the decoding scripts. The app credentials come from `LARK_APP_ID`, `LARK_APP_SECRET` and `LARK_DOMAIN`
 * only; the secret is used once to fetch a tenant access token and is never put on a command line. The token goes to
 * `lark-cli` through `LARKSUITE_CLI_TENANT_ACCESS_TOKEN` (otherwise `lark-cli` asks for a new one on every call and the
 * token endpoint answers 429). `LARK_CLI` names the binary. Pages of 500 records, a pause between calls, and a retry
 * with growing waits on `99991400` (rate limit).
 */
export async function createLarkCliSource(
  options: LarkCliOptions = {},
): Promise<LarkCliSource> {
  const env = options.env ?? process.env;
  const missing = ['LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_DOMAIN'].filter(
    (name) => !env[name],
  );
  if (missing.length > 0)
    throw new LarkImportError(
      'LARK_THIEU_BIEN',
      `Missing environment variables: ${missing.join(', ')}`,
    );
  const credentials = {
    appId: env.LARK_APP_ID as string,
    appSecret: env.LARK_APP_SECRET as string,
    domain: env.LARK_DOMAIN as string,
  };
  const bin = env.LARK_CLI || 'lark-cli';
  const delayMs = options.delayMs ?? 1200;
  const sleep = options.sleep ?? defaultSleep;
  const log = options.log ?? (() => {});
  const getToken = options.fetchToken ?? fetchTenantToken;
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'lark-cli-'));

  // The child gets an allow-list, not the whole environment: it must never see the app secret, the database password,
  // `APP_KEY` or any auth secret of the application. It gets the tenant token through `LARKSUITE_CLI_*` below.
  const childEnv = childEnvironment(process.env);
  let token = '';
  let tokenExpiresAt = 0;
  let lastCall = 0;

  async function call(
    apiPath: string,
    params: Record<string, string | number>,
    template: string,
  ): Promise<{
    items: unknown[];
    hasMore: boolean;
    pageToken?: string;
  }> {
    for (let attempt = 0; ; attempt += 1) {
      const wait = lastCall + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      if (Date.now() > tokenExpiresAt) {
        const fresh = await getToken(credentials);
        token = fresh.token;
        tokenExpiresAt =
          Date.now() + Math.max(fresh.expiresInSeconds - 300, 60) * 1000;
      }
      let stdout: string;
      try {
        const child = await execFileAsync(
          bin,
          [
            'api',
            'GET',
            apiPath,
            '--params',
            JSON.stringify(params),
            '--as',
            'bot',
          ],
          {
            encoding: 'utf8',
            maxBuffer: 256 * 1024 * 1024,
            timeout: options.callTimeoutMs ?? LARK_CALL_TIMEOUT_MS,
            env: {
              ...childEnv,
              LARKSUITE_CLI_APP_ID: credentials.appId,
              LARKSUITE_CLI_TENANT_ACCESS_TOKEN: token,
              LARKSUITE_CLI_BRAND: /larksuite\.com/iu.test(credentials.domain)
                ? 'lark'
                : 'feishu',
              LARKSUITE_CLI_CONFIG_DIR: path.join(workDir, 'config'),
              LARKSUITE_CLI_DATA_DIR: path.join(workDir, 'data'),
              LARKSUITE_CLI_LOG_DIR: path.join(workDir, 'log'),
              LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
              LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
            },
          },
        );
        stdout = child.stdout;
      } catch (error) {
        // `lark-cli` exits non-zero with the JSON error on stdout when Lark refuses; anything else is a real failure.
        const failed = error as {
          stdout?: string;
          stderr?: string;
          code?: string;
          killed?: boolean;
        };
        if (failed.killed === true)
          throw new LarkImportError(
            'LARK_HET_GIO',
            `lark-cli did not answer in time for GET ${template}.`,
          );
        if (failed.code === 'ENOENT')
          throw new LarkImportError(
            'LARK_CLI_THIEU',
            `lark-cli was not found (looked for "${bin}"); set LARK_CLI to its path.`,
          );
        stdout =
          failed.stdout && failed.stdout.trim() !== ''
            ? failed.stdout
            : (failed.stderr ?? '');
      }
      lastCall = Date.now();
      let body: {
        ok?: boolean;
        data?: { items?: unknown[]; has_more?: boolean; page_token?: string };
        error?: { code?: number; subtype?: string };
      };
      try {
        body = JSON.parse(stdout) as typeof body;
      } catch {
        throw new LarkImportError(
          'LARK_LOI',
          `lark-cli returned output that is not JSON for GET ${template}.`,
        );
      }
      log(`GET ${template} -> ${body.ok ? 'ok' : `error ${body.error?.code}`}`);
      if (body.ok)
        return {
          items: body.data?.items ?? [],
          hasMore: body.data?.has_more === true,
          pageToken: body.data?.page_token,
        };
      const rateLimited =
        body.error?.subtype === 'rate_limit' || body.error?.code === 99991400;
      if (rateLimited && attempt < 6) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      throw new LarkImportError(
        body.error?.code === 1254302 ? 'LARK_KHONG_DOC_DUOC' : 'LARK_LOI',
        `Lark answered error ${body.error?.code ?? '?'} for GET ${template}.`,
      );
    }
  }

  async function listAll(
    suffix: 'tables' | 'fields' | 'records',
    tableId: string | null,
    pageSize: number,
    extra: Record<string, string> = {},
  ): Promise<unknown[]> {
    const template =
      tableId === null
        ? '/open-apis/bitable/v1/apps/:app_token/tables'
        : `/open-apis/bitable/v1/apps/:app_token/tables/:table_id/${suffix}`;
    const apiPath =
      tableId === null
        ? `/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables`
        : `/open-apis/bitable/v1/apps/${LARK_BASE_TOKEN}/tables/${tableId}/${suffix}`;
    const items: unknown[] = [];
    let pageToken: string | undefined;
    for (;;) {
      const page = await call(
        apiPath,
        {
          page_size: pageSize,
          ...extra,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
        template,
      );
      items.push(...page.items);
      if (!page.hasMore || !page.pageToken) return items;
      pageToken = page.pageToken;
    }
  }

  return {
    async tables() {
      const items = (await listAll('tables', null, 100)) as {
        table_id?: string;
        name?: string;
      }[];
      return items
        .filter(
          (item) =>
            typeof item.table_id === 'string' && typeof item.name === 'string',
        )
        .map((item) => ({
          id: item.table_id as string,
          name: item.name as string,
        }));
    },
    async fieldNames(tableId) {
      const items = (await listAll('fields', tableId, 100)) as {
        field_name?: string;
      }[];
      return items
        .map((item) => item.field_name)
        .filter((name): name is string => typeof name === 'string');
    },
    async records(tableId, fields) {
      // `field_names` is a JSON array in a string; the same list is sent with every page.
      const items = (await listAll(
        'records',
        tableId,
        500,
        fields ? { field_names: JSON.stringify(fields) } : {},
      )) as {
        record_id?: string;
        fields?: Record<string, unknown>;
      }[];
      return items
        .filter((item) => typeof item.record_id === 'string')
        .map((item) => ({
          recordId: item.record_id as string,
          fields: item.fields ?? {},
        }));
    },
    async close() {
      await rm(workDir, { recursive: true, force: true });
    },
  };
}
