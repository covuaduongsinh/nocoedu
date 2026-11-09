// Thin wrapper around the official lark-cli (github.com/larksuite/cli, MIT).
//
// Every Lark call in scripts/lark/ goes through `lark-cli api <METHOD> <path> --as bot`.
// Credentials come only from the environment (LARK_APP_ID, LARK_APP_SECRET, LARK_DOMAIN):
// the secret is never put on a command line. The tenant access token is fetched once per
// run and handed to lark-cli through LARKSUITE_CLI_TENANT_ACCESS_TOKEN, because lark-cli
// otherwise requests a new token for every call and the token endpoint answers 429.
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function requireEnv() {
  const missing = ['LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_DOMAIN'].filter(
    (name) => !process.env[name],
  );
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  return {
    appId: process.env.LARK_APP_ID,
    appSecret: process.env.LARK_APP_SECRET,
    domain: process.env.LARK_DOMAIN,
  };
}

export function brandOf(domain) {
  return /larksuite\.com/i.test(domain) ? 'lark' : 'feishu';
}

async function fetchTenantToken({ appId, appSecret, domain }) {
  const response = await fetch(
    new URL('/open-apis/auth/v3/tenant_access_token/internal', domain),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
  );
  const body = await response.json();
  if (body.code !== 0 || !body.tenant_access_token) {
    throw new Error(
      `tenant_access_token failed: code ${body.code} ${body.msg ?? ''}`,
    );
  }
  return {
    token: body.tenant_access_token,
    expiresAt: Date.now() + (body.expire - 300) * 1000,
  };
}

/**
 * Creates a caller that runs `lark-cli api ... --as bot`, waits `delayMs` between calls and
 * retries rate-limited calls with exponential backoff. `log` receives one line per call
 * (method, path template, status) and never the response body.
 */
export async function createLark({ delayMs = 1200, log = () => {} } = {}) {
  const credentials = requireEnv();
  const bin = process.env.LARK_CLI || 'lark-cli';
  const workDir = mkdtempSync(path.join(os.tmpdir(), 'lark-cli-'));
  let tat = await fetchTenantToken(credentials);
  let last = 0;
  const commands = new Set();

  async function call(method, apiPath, { params, data, template } = {}) {
    for (let attempt = 0; ; attempt++) {
      const wait = last + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      if (Date.now() > tat.expiresAt) tat = await fetchTenantToken(credentials);
      const args = ['api', method, apiPath, '--as', 'bot'];
      if (params) args.push('--params', JSON.stringify(params));
      if (data) args.push('--data', JSON.stringify(data));
      commands.add(
        `lark-cli api ${method} ${template ?? apiPath}${params ? ` --params '${JSON.stringify(redactParams(params))}'` : ''} --as bot`,
      );
      const child = spawnSync(bin, args, {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        env: {
          ...process.env,
          LARKSUITE_CLI_APP_ID: credentials.appId,
          LARKSUITE_CLI_TENANT_ACCESS_TOKEN: tat.token,
          LARKSUITE_CLI_BRAND: brandOf(credentials.domain),
          LARKSUITE_CLI_CONFIG_DIR: path.join(workDir, 'config'),
          LARKSUITE_CLI_DATA_DIR: path.join(workDir, 'data'),
          LARKSUITE_CLI_LOG_DIR: path.join(workDir, 'log'),
          LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
          LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
        },
      });
      last = Date.now();
      if (child.error) throw child.error;
      let body;
      try {
        body = JSON.parse(child.stdout || child.stderr);
      } catch {
        throw new Error(
          `lark-cli returned non-JSON output for ${method} ${template ?? apiPath}`,
        );
      }
      const rateLimited =
        !body.ok &&
        (body.error?.subtype === 'rate_limit' || body.error?.code === 99991400);
      log(
        `${method} ${template ?? apiPath} -> ${body.ok ? 'ok' : `error ${body.error?.code}`}`,
      );
      if (rateLimited && attempt < 6) {
        await sleep(2000 * 2 ** attempt + Math.floor(Math.random() * 500));
        continue;
      }
      return body;
    }
  }

  return { call, commands };
}

function redactParams(params) {
  const copy = { ...params };
  if (copy.page_token) copy.page_token = '<page_token>';
  return copy;
}

/** Calls a paginated v1 list endpoint and returns every item. */
export async function listAll(
  lark,
  apiPath,
  { template, pageSize = 100, extra = {} } = {},
) {
  const items = [];
  let pageToken;
  for (;;) {
    const params = {
      page_size: pageSize,
      ...extra,
      ...(pageToken ? { page_token: pageToken } : {}),
    };
    const body = await lark.call('GET', apiPath, { params, template });
    if (!body.ok) return { items, error: summarizeError(body.error) };
    items.push(...(body.data?.items ?? []));
    if (!body.data?.has_more || !body.data?.page_token) return { items };
    pageToken = body.data.page_token;
  }
}

export function summarizeError(error) {
  if (!error) return null;
  return {
    code: error.code,
    subtype: error.subtype,
    message: String(error.message ?? '').slice(0, 200),
    missingScopes: error.missing_scopes,
  };
}
