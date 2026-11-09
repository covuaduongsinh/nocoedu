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
  LARK_TABLES,
  readLarkData,
  REQUIRED_FIELDS,
  type LarkTableKey,
} from '../../server/edu/lark/nguon.js';
import { fixtureData, TABLE_IDS } from '../helpers/lark-fixture.js';

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

/** Writes the fake binary, the data it serves and the files it records into; returns the paths. */
async function fakeCli(options: {
  rateLimitOnce?: boolean;
  refuse?: string;
}): Promise<{ bin: string; log: string }> {
  const data = fixtureData();
  const tables: Record<string, unknown> = {};
  for (const key of Object.keys(LARK_TABLES) as LarkTableKey[]) {
    tables[TABLE_IDS[key] as string] = {
      fields: REQUIRED_FIELDS[key].map((field_name) => ({ field_name })),
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
  hasSecretEnv: Object.values(process.env).some((v) => String(v).includes(${JSON.stringify(SECRET)})),
}) + '\\n');
const match = /tables\\/(tbl\\w+)\\/(fields|records)$/.exec(apiPath);
const out = (body) => process.stdout.write(JSON.stringify(body));
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
    expect(data.nhanXet2025).toHaveLength(7);
    expect(data.hocVien[0]?.fields['Học viên']).toBe(' học  viên mẫu 01 ');
    const made = await calls(log);
    // 5 tables × (fields + records), each cut into pages of two.
    expect(made.length).toBeGreaterThan(10);
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
    await expect(source.records('hocVien')).rejects.toMatchObject({
      code: 'LARK_KHONG_DOC_DUOC',
    });
    await source.close();
  });

  it('removes its temporary directory', async () => {
    const { bin, log } = await fakeCli({});
    const source = await createLarkCliSource({
      env: env(bin),
      delayMs: 0,
      sleep: async () => {},
      fetchToken: async () => ({ token: TOKEN, expiresInSeconds: 7200 }),
    });
    await source.fieldNames('lopHoc');
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
    await expect(source.fieldNames('lopHoc')).rejects.toMatchObject({
      code: 'LARK_CLI_THIEU',
    });
    await source.close();
  });
});
