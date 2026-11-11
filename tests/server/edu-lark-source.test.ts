import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createLarkCliSource,
  findNhanXetTables,
  NHAN_XET_BAT_BUOC,
  readLarkData,
} from '../../server/edu/lark/nguon.js';
import {
  buildFixture,
  fixtureSource,
  fixtureTableList,
  TABLE_IDS,
} from '../helpers/lark-fixture.js';

/**
 * The reader of the Base, tested against a fake `lark-cli` binary (a small Node script): pagination, the pause
 * between calls, the retry on `99991400`, a refused table, and the rule that the app secret never reaches a command
 * line. Nothing here calls Lark.
 */

const SECRET = 'fake-app-secret-value-for-tests';
const TOKEN = 'fake-tenant-token-for-tests';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'fake-lark-cli-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const TABLE_NAMES = Object.fromEntries(
  fixtureTableList().map((entry) => [entry.key, entry.name]),
);

/** Writes the fake binary, the data it serves and the files it records into; returns the paths. */
async function fakeCli(options: {
  rateLimitOnce?: boolean;
  hang?: boolean;
  refuse?: string;
}): Promise<{ bin: string; log: string }> {
  const data = buildFixture();
  const tables: Record<string, unknown> = {};
  for (const { key, id, fields } of fixtureTableList()) {
    tables[id] = {
      name: TABLE_NAMES[key],
      fields: fields.map((field_name) => ({ field_name })),
      records: data[key].map((r) => ({
        record_id: r.recordId,
        fields: r.fields,
      })),
    };
  }
  const state = path.join(dir, 'state.json');
  const log = path.join(dir, 'calls.jsonl');
  await writeFile(path.join(dir, 'tables.json'), JSON.stringify(tables));
  await writeFile(state, JSON.stringify({ limited: false }));
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const tables = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(dir, 'tables.json'))}, 'utf8'));
const args = process.argv.slice(2);
const apiPath = args[2];
const params = JSON.parse(args[args.indexOf('--params') + 1] || '{}');
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({
  args,
  token: process.env.LARKSUITE_CLI_TENANT_ACCESS_TOKEN,
  configDir: process.env.LARKSUITE_CLI_CONFIG_DIR,
  envNames: Object.keys(process.env),
  hasSecretEnv: Object.values(process.env).some((v) => String(v).includes(${JSON.stringify(SECRET)})),
}) + '\\n');
if (${JSON.stringify(options.hang ?? false)}) setTimeout(() => {}, 60000);
const out = (body) => process.stdout.write(JSON.stringify(body));
if (/\\/tables$/.test(apiPath)) {
  const all = Object.entries(tables).map(([table_id, t]) => ({ table_id, name: t.name }));
  const start = params.page_token ? Number(params.page_token) : 0;
  out({ ok: true, data: { items: all.slice(start, start + 2), has_more: start + 2 < all.length, page_token: String(start + 2) } });
  process.exit(0);
}
const match = /tables\\/(tbl\\w+)\\/(fields|records)$/.exec(apiPath);
if (!match || !tables[match[1]]) { out({ ok: false, error: { code: 1254041 } }); process.exit(1); }
if (${JSON.stringify(options.refuse ?? '')} === match[1]) { out({ ok: false, error: { code: 1254302 } }); process.exit(1); }
const state = JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'));
if (${JSON.stringify(options.rateLimitOnce ?? false)} && match[2] === 'records' && !state.limited) {
  fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify({ limited: true }));
  out({ ok: false, error: { code: 99991400, subtype: 'rate_limit' } });
  process.exit(1);
}
const all = tables[match[1]][match[2]];
// The fake serves at most two items a page, whatever page_size says, to force pagination.
const start = params.page_token ? Number(params.page_token) : 0;
const items = all.slice(start, start + 2);
out({ ok: true, data: { items, has_more: start + 2 < all.length, page_token: String(start + 2) } });
`;
  const bin = path.join(dir, 'lark-cli');
  await writeFile(bin, script);
  await chmod(bin, 0o755);
  return { bin, log };
}

const env = (bin: string) => ({
  LARK_APP_ID: 'cli_fake_app_id',
  LARK_APP_SECRET: SECRET,
  LARK_DOMAIN: 'https://example.invalid',
  LARK_CLI: bin,
});

const calls = async (log: string) =>
  (await readFile(log, 'utf8'))
    .trim()
    .split('\n')
    .map(
      (line) =>
        JSON.parse(line) as {
          args: string[];
          token: string;
          configDir: string;
          hasSecretEnv: boolean;
          envNames: string[];
        },
    );

describe('reading the Base through lark-cli', () => {
  it('reads every table page by page, pauses between calls, and keeps the secret off the command line', async () => {
    const { bin, log } = await fakeCli({});
    const waits: number[] = [];
    const logged: string[] = [];
    const source = await createLarkCliSource({
      env: env(bin),
      delayMs: 40,
      sleep: async (ms) => void waits.push(ms),
      fetchToken: async () => ({ token: TOKEN, expiresInSeconds: 7200 }),
      log: (line) => logged.push(line),
    });
    const data = await readLarkData(source);
    await source.close();

    expect(data.hocVien).toHaveLength(5);
    expect(data.nhanXet).toHaveLength(12);
    expect(data.hocVien[0]?.fields['Học viên']).toBe(' học  viên mẫu 01 ');
    const made = await calls(log);
    // The list of tables, then 6 tables × (fields + records), each cut into pages of two.
    expect(made.length).toBeGreaterThan(15);
    expect(made[0]?.args[2]).toMatch(/\/tables$/u);
    expect(
      made.every((call) => call.args.slice(0, 2).join(' ') === 'api GET'),
    ).toBe(true);
    expect(
      made.every(
        (call) => call.args.at(-2) === '--as' && call.args.at(-1) === 'bot',
      ),
    ).toBe(true);
    // A pause before the calls that follow the first one.
    expect(waits.length).toBeGreaterThan(0);
    expect(Math.max(...waits)).toBeLessThanOrEqual(40);
    // The tenant token reaches lark-cli through the environment; the app secret reaches neither argv nor the child.
    expect(made.every((call) => call.token === TOKEN)).toBe(true);
    expect(JSON.stringify(made.map((call) => call.args))).not.toContain(SECRET);
    expect(made.some((call) => call.hasSecretEnv)).toBe(false);
    expect(logged.join('\n')).not.toContain(SECRET);
    // The log has the path template and the status, never a record.
    expect(logged.join('\n')).not.toMatch(/Mẫu|0900/u);
  });

  it('retries a rate-limited call with a growing wait', async () => {
    const { bin } = await fakeCli({ rateLimitOnce: true });
    const waits: number[] = [];
    const source = await createLarkCliSource({
      env: env(bin),
      delayMs: 0,
      sleep: async (ms) => void waits.push(ms),
      fetchToken: async () => ({ token: TOKEN, expiresInSeconds: 7200 }),
    });
    const data = await readLarkData(source);
    await source.close();
    expect(data.lopHoc).toHaveLength(2);
    expect(waits).toContain(2000);
  });

  it('reports a table the app may not read as LARK_KHONG_DOC_DUOC (1254302)', async () => {
    const { bin } = await fakeCli({ refuse: TABLE_IDS.hocVien });
    const source = await createLarkCliSource({
      env: env(bin),
      delayMs: 0,
      sleep: async () => {},
      fetchToken: async () => ({ token: TOKEN, expiresInSeconds: 7200 }),
    });
    await expect(
      source.records(TABLE_IDS.hocVien as string),
    ).rejects.toMatchObject({
      code: 'LARK_KHONG_DOC_DUOC',
    });
    await source.close();
  });

  it('reads the 2026 table through the same call as the other years', async () => {
    const { bin, log } = await fakeCli({});
    const source = await createLarkCliSource({
      env: env(bin),
      delayMs: 0,
      sleep: async () => {},
      fetchToken: async () => ({ token: TOKEN, expiresInSeconds: 7200 }),
    });
    const data = await readLarkData(source);
    await source.close();
    expect(data.nhanXet.map((r) => r.recordId)).toContain('recNhanXet2026a');
    const paths = (await calls(log)).map((call) => call.args[2]);
    expect(paths).toContain(
      `/open-apis/bitable/v1/apps/V7DHb5fvQaqnrGsH6fFlysuJgme/tables/${NHAN_XET_BAT_BUOC[2026]}/records`,
    );
  });

  it('removes its temporary directory', async () => {
    const { bin, log } = await fakeCli({});
    const source = await createLarkCliSource({
      env: env(bin),
      delayMs: 0,
      sleep: async () => {},
      fetchToken: async () => ({ token: TOKEN, expiresInSeconds: 7200 }),
    });
    await source.fieldNames(TABLE_IDS.lopHoc as string);
    const [first] = await calls(log);
    const workDir = path.dirname(first?.configDir ?? '');
    expect((await stat(workDir)).isDirectory()).toBe(true);
    await source.close();
    await expect(stat(workDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses to start without the credentials or without the binary', async () => {
    await expect(
      createLarkCliSource({ env: { LARK_APP_ID: 'x' } }),
    ).rejects.toMatchObject({ code: 'LARK_THIEU_BIEN' });
    const source = await createLarkCliSource({
      env: { ...env(path.join(dir, 'does-not-exist')) },
      delayMs: 0,
      sleep: async () => {},
      fetchToken: async () => ({ token: TOKEN, expiresInSeconds: 7200 }),
    });
    await expect(
      source.fieldNames(TABLE_IDS.lopHoc as string),
    ).rejects.toMatchObject({
      code: 'LARK_CLI_THIEU',
    });
    await source.close();
  });
});

describe('what the child process may see and how long it may take', () => {
  it('gets an allow-list of environment variables, never the secrets of the application', async () => {
    const { bin, log } = await fakeCli({});
    const secrets = {
      DATABASE_PASSWORD: 'db-password-for-tests',
      APP_KEY: 'app-key-for-tests',
      BETTER_AUTH_SECRET: 'auth-secret-for-tests',
      LARK_APP_SECRET: SECRET,
    };
    const previous = Object.fromEntries(
      Object.keys(secrets).map((name) => [name, process.env[name]]),
    );
    Object.assign(process.env, secrets);
    try {
      const source = await createLarkCliSource({
        env: env(bin),
        delayMs: 0,
        sleep: async () => {},
        fetchToken: async () => ({ token: TOKEN, expiresInSeconds: 7200 }),
      });
      await source.fieldNames(TABLE_IDS.lopHoc as string);
      await source.close();
    } finally {
      for (const [name, value] of Object.entries(previous))
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
    const [first] = await calls(log);
    const names = first?.envNames ?? [];
    for (const secret of Object.keys(secrets))
      expect(names).not.toContain(secret);
    expect(names).toContain('PATH');
    expect(names).toContain('LARKSUITE_CLI_TENANT_ACCESS_TOKEN');
    const allowed =
      /^(LARKSUITE_CLI_.*|PWD|PATH|HOME|TMPDIR|TMP|TEMP|LANG|LC_ALL|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/iu;
    expect(names.filter((name) => !allowed.test(name))).toEqual([]);
  });

  it('stops a lark-cli run that does not answer in time', async () => {
    const { bin } = await fakeCli({ hang: true });
    const source = await createLarkCliSource({
      env: env(bin),
      delayMs: 0,
      callTimeoutMs: 300,
      sleep: async () => {},
      fetchToken: async () => ({ token: TOKEN, expiresInSeconds: 7200 }),
    });
    await expect(
      source.fieldNames(TABLE_IDS.lopHoc as string),
    ).rejects.toMatchObject({
      code: 'LARK_HET_GIO',
    });
    await source.close();
  });
});

describe('finding the yearly attendance tables', () => {
  const named = (year: number, id = NHAN_XET_BAT_BUOC[year] as string) => ({
    id,
    name: `${year} Nhận xét mỗi buổi`,
  });
  const required = [2024, 2025, 2026].map((year) => named(year));

  it('finds them by name, oldest year first, and accepts a later year without a change in the code', () => {
    expect(
      findNhanXetTables([
        named(2026),
        { id: 'tblOther', name: 'Level' },
        named(2025),
        named(2024),
        named(2027, 'tblFuture'),
        { id: 'tblNote', name: '2026 Nhận xét mỗi buổi (bản sao)' },
      ]).map((table) => table.year),
    ).toEqual([2024, 2025, 2026, 2027]);
  });

  it('stops with LARK_KHONG_DOC_DUOC when a required year is hidden from the app', () => {
    expect(() => findNhanXetTables(required.slice(0, 2))).toThrowError(
      expect.objectContaining({ code: 'LARK_KHONG_DOC_DUOC' }),
    );
  });

  it('stops with LARK_CAU_TRUC_DOI for two tables of one year or another id than expected', () => {
    expect(() =>
      findNhanXetTables([...required, named(2025, 'tblCopy')]),
    ).toThrowError(expect.objectContaining({ code: 'LARK_CAU_TRUC_DOI' }));
    expect(() =>
      findNhanXetTables([required[0], required[1], named(2026, 'tblWrong')]),
    ).toThrowError(expect.objectContaining({ code: 'LARK_CAU_TRUC_DOI' }));
  });

  it('reads nothing when the 2026 table is hidden, and also when a fixed table is', async () => {
    for (const hide of ['nhanXet2026', 'lopHoc'] as const) {
      const source = fixtureSource(undefined, { hide: [hide] });
      await expect(readLarkData(source)).rejects.toMatchObject({
        code: 'LARK_KHONG_DOC_DUOC',
      });
      expect(source.calls.filter((c) => c.startsWith('records'))).toEqual([]);
    }
  });

  it('checks the fields of every year before reading, and reads a later year found by name', async () => {
    const renamed = fixtureSource(undefined, {
      drop: { table: 'nhanXet2026', field: 'Tên HS' },
    });
    await expect(readLarkData(renamed)).rejects.toMatchObject({
      code: 'LARK_CAU_TRUC_DOI',
    });
    const withFuture = fixtureSource(undefined, {
      extra: [
        {
          ...named(2027, 'tblFuture'),
          fields: ['Ngày học - Day format'],
        },
      ],
    });
    // The new year is missing most fields: found by name, and checked like the others.
    await expect(readLarkData(withFuture)).rejects.toMatchObject({
      code: 'LARK_CAU_TRUC_DOI',
    });
  });

  it('does not ask for "Số buổi còn lại": a table without it is accepted', async () => {
    const data = await readLarkData(fixtureSource());
    expect(data.nhanXet.length).toBeGreaterThan(0);
  });
});
