import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// Admissions (DS-61 phase D). Every name and phone is made up.

test('admissions belong to a branch: its manager works there, nobody else sees them', async ({
  testApp,
  request,
  connection,
}) => {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'ts-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'ts-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'ts-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'ts-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const anonymous = await request('/lienHe/findMany', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: '{}',
  });
  expect(anonymous.status).toBe(401);

  const values = (coSoId: number, extra: object = {}) => ({
    values: {
      hoTen: 'Phụ huynh Mẫu',
      soDienThoai: '0900000001',
      coSoId,
      trangThai: 'moi',
      ngayTao: '2026-05-01',
      ...extra,
    },
  });

  // The manager of A creates a contact in A, never in B.
  const created = await post(
    managerA.session,
    '/lienHe/createOne',
    values(ids.coSoA),
  );
  expect([200, 201]).toContain(created.status);
  const elsewhere = await post(
    managerA.session,
    '/lienHe/createOne',
    values(ids.coSoB),
  );
  expect(elsewhere.status).toBe(403);
  // The administrator creates one in B.
  expect([200, 201]).toContain(
    (await post(admin, '/lienHe/createOne', values(ids.coSoB))).status,
  );

  // A status outside the list, a phone that is not a phone and a bad day are refused.
  for (const extra of [
    { trangThai: 'la' },
    { soDienThoai: 'abc' },
    { ngayNhac: '10/05/2026' },
  ]) {
    const bad = await post(
      managerA.session,
      '/lienHe/createOne',
      values(ids.coSoA, extra),
    );
    expect(bad.status).toBe(400);
  }

  // Coaches and accountants hold nothing here; the manager sees A only; the administrator sees both.
  for (const person of [hlvA, keToan]) {
    expect((await post(person.session, '/lienHe/findMany', {})).status).toBe(
      403,
    );
    expect(
      (await post(person.session, '/lienHe/createOne', values(ids.coSoA)))
        .status,
    ).toBe(403);
  }
  const count = async (session: typeof admin) =>
    (
      (await (await post(session, '/lienHe/findMany', {})).json()) as {
        data: { id: number }[];
      }
    ).data.length;
  expect(await count(managerA.session)).toBe(1);
  expect(await count(admin)).toBe(2);

  // The manager moves a contact to "da_chot", and deletes it; the contact of B is out of reach.
  const mine = (
    (await (await post(managerA.session, '/lienHe/findMany', {})).json()) as {
      data: { id: number }[];
    }
  ).data[0];
  const edit = await post(managerA.session, '/lienHe/updateOne', {
    filter: { id: mine?.id },
    values: { trangThai: 'da_chot' },
  });
  expect(edit.status).toBe(200);
  const del = await post(managerA.session, '/lienHe/deleteOne', {
    filter: { id: mine?.id },
  });
  expect(del.status).toBe(200);
  expect(await count(managerA.session)).toBe(0);
  expect(await count(admin)).toBe(1);
});
