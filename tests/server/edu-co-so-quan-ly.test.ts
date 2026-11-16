import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// Naming a branch manager: the administrator picks from the accounts that hold the branch manager set, and the
// manager's data scope follows at once. Names are made up.

test('only the administrator lists and names branch managers, and the named manager then sees their branch', async ({
  testApp,
  request,
  connection,
}) => {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'qlc-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'qlc-hlv-b', 'edu_hlv');
  const named = await userWithRole(
    testApp,
    admin,
    'qlc-ql-a',
    'edu_quan_ly_co_so',
  );
  const fresh = await userWithRole(
    testApp,
    admin,
    'qlc-ql-new',
    'edu_quan_ly_co_so',
  );
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: named.id,
  });

  const anonymous = await request('/quanLy/danhSach', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: '{}',
  });
  expect(anonymous.status).toBe(401);
  for (const who of [hlvA, named]) {
    expect((await post(who.session, '/quanLy/danhSach', {})).status).toBe(403);
  }
  const listed = (await (await post(admin, '/quanLy/danhSach', {})).json()) as {
    data: { id: string; name: string }[];
  };
  expect(listed.data.map((row) => row.id).sort()).toEqual(
    [named.id, fresh.id].sort(),
  );
  // Coaches are not offered as managers.
  expect(listed.data.some((row) => row.id === hlvA.id)).toBe(false);

  // A manager who is not named anywhere sees no student.
  const students = async (who: typeof fresh) =>
    (
      (await (
        await post(who.session, '/hocVien/findMany', { limit: 10 })
      ).json()) as {
        data?: unknown[];
      }
    ).data ?? [];
  expect(await students(fresh)).toEqual([]);

  // A manager cannot name themselves; the administrator can.
  expect(
    [403, 404].includes(
      (
        await post(fresh.session, '/coSoQuanLy/createOne', {
          values: { coSoId: ids.coSoA, userId: fresh.id },
        })
      ).status,
    ),
  ).toBe(true);
  expect(await students(fresh)).toEqual([]);
  const made = await post(admin, '/coSoQuanLy/createOne', {
    values: { coSoId: ids.coSoA, userId: fresh.id },
  });
  expect(made.status).toBe(200);
  expect(await students(fresh)).toHaveLength(1);

  // Removing the row takes the scope away again.
  const row = await connection.query
    .selectFrom('eduCoSoQuanLy')
    .select('id')
    .where('userId', '=', fresh.id)
    .executeTakeFirstOrThrow();
  expect(
    (
      await post(admin, '/coSoQuanLy/deleteOne', {
        filter: { id: Number(row.id) },
      })
    ).status,
  ).toBe(200);
  expect(await students(fresh)).toEqual([]);
});
