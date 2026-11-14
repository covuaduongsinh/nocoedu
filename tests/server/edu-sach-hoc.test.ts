import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// The books a student learns (DS-61 phase E4). Every name and symbol is made up.

test('the books of a student follow the student: read-only, and only for who sees the student', async ({
  testApp,
  connection,
}) => {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'sh-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'sh-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'sh-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'sh-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  await connection.query
    .insertInto('eduSach')
    .values({ kyHieu: 'SH1', ten: 'Sách học 1' })
    .execute();
  const book = await connection.query
    .selectFrom('eduSach')
    .select('id')
    .where('kyHieu', '=', 'SH1')
    .executeTakeFirstOrThrow();
  await connection.query
    .insertInto('eduSachHoc')
    .values([
      {
        hocVienId: ids.hocVienA,
        sachId: Number(book.id),
        trangThai: 'dang_hoc',
      },
      { hocVienId: ids.hocVienB, sachId: Number(book.id), trangThai: 'da_hoc' },
    ])
    .execute();

  const count = async (session: typeof admin.session | typeof admin) =>
    (
      (await (await post(session, '/sachHoc/findMany', {})).json()) as {
        data: unknown[];
      }
    ).data.length;
  // Coach and manager of branch A see the student of A only; the accountant and the administrator see both.
  expect(await count(hlvA.session)).toBe(1);
  expect(await count(managerA.session)).toBe(1);
  expect(await count(hlvB.session)).toBe(1);
  expect(await count(keToan.session)).toBe(2);
  expect(await count(admin)).toBe(2);

  // Nobody writes it through the API.
  for (const session of [admin, managerA.session, hlvA.session]) {
    const created = await post(session, '/sachHoc/createOne', {
      values: {
        hocVienId: ids.hocVienA,
        sachId: Number(book.id),
        trangThai: 'da_hoc',
      },
    });
    expect(created.status).toBeGreaterThanOrEqual(400);
  }
});
