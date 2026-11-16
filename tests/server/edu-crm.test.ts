import { afterEach, expect } from 'vitest';

import {
  adminSession,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// Leads sent by NocoCRM into admissions. The route is public by design; its boundary is the shared secret.

const PATH = '/edu/crm/lead-sync';
const SECRET = 'test-crm-secret-with-enough-characters';
const lead = { hoTen: 'Phụ huynh Mẫu CRM', soDienThoai: '0900000009' };

afterEach(() => {
  delete process.env.EDU_CRM_WEBHOOK_TOKEN;
});

function send(
  request: (path: string, init: RequestInit) => Promise<Response>,
  body: unknown,
  headers: Record<string, string> = {},
  path = PATH,
) {
  return request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const contacts = (connection: any) =>
  connection.query
    .selectFrom('eduLienHe')
    .select(['hoTen', 'soDienThoai', 'coSoId', 'trangThai', 'kenh'])
    .execute();

test('the route is off until a secret is configured, and a short secret counts as none', async ({
  testApp,
  request,
  connection,
}) => {
  const admin = await adminSession(testApp);
  const hlv = await userWithRole(testApp, admin, 'crm-hlv', 'edu_hlv');
  await seedSchool(connection, {
    hlvA: hlv.id,
    hlvB: hlv.id,
    managerA: hlv.id,
  });

  // No secret configured: nothing is accepted, not even with the old default value.
  const off = await send(request, lead, {
    'x-crm-token': 'nocoedu-crm-secret',
  });
  expect(off.status).toBe(404);
  const bare = await send(request, lead);
  expect(bare.status).toBe(404);

  process.env.EDU_CRM_WEBHOOK_TOKEN = 'too-short';
  const short = await send(request, lead, { 'x-crm-token': 'too-short' });
  expect(short.status).toBe(404);
  expect(await contacts(connection)).toEqual([]);
});

test('a lead needs the secret in the header, is validated, and is stored once', async ({
  testApp,
  request,
  connection,
}) => {
  const admin = await adminSession(testApp);
  const hlv = await userWithRole(testApp, admin, 'crm-hlv', 'edu_hlv');
  const ids = await seedSchool(connection, {
    hlvA: hlv.id,
    hlvB: hlv.id,
    managerA: hlv.id,
  });
  process.env.EDU_CRM_WEBHOOK_TOKEN = SECRET;

  // Missing, wrong, and a secret put in the address instead of the header: all refused, nothing stored.
  expect((await send(request, lead)).status).toBe(401);
  expect((await send(request, lead, { 'x-crm-token': 'wrong' })).status).toBe(
    401,
  );
  expect(
    (await send(request, lead, {}, `${PATH}?token=${SECRET}`)).status,
  ).toBe(401);
  // The token is checked before the body: an anonymous caller learns nothing about what a valid body looks like.
  expect((await send(request, {})).status).toBe(401);
  expect(await contacts(connection)).toEqual([]);

  const headers = { 'x-crm-token': SECRET };
  expect((await send(request, { hoTen: '' }, headers)).status).toBe(400);
  expect(
    (await send(request, { ...lead, coSoId: 999999 }, headers)).status,
  ).toBe(400);

  const stored = await send(
    request,
    { ...lead, coSoId: ids.coSoB, ghiChu: 'Quan tâm lớp cuối tuần' },
    headers,
  );
  expect(stored.status).toBe(200);
  expect(((await stored.json()) as any).data).toEqual({
    thanhCong: true,
    trung: false,
  });
  // The CRM delivers the same lead again: accepted, and nobody is added.
  const again = await send(request, { ...lead, coSoId: ids.coSoB }, headers);
  expect(again.status).toBe(200);
  expect(((await again.json()) as any).data.trung).toBe(true);
  expect(await contacts(connection)).toEqual([
    {
      hoTen: 'Phụ huynh Mẫu CRM',
      soDienThoai: '0900000009',
      coSoId: ids.coSoB,
      trangThai: 'moi',
      kenh: 'nococrm',
    },
  ]);

  // Without a branch the first open one takes the lead.
  const other = await send(
    request,
    { hoTen: 'Phụ huynh Mẫu CRM 2', soDienThoai: '0900000010' },
    headers,
  );
  expect(other.status).toBe(200);
  const rows = await contacts(connection);
  expect(rows).toHaveLength(2);
  expect(rows[1].coSoId).toBe(ids.coSoA);
});
