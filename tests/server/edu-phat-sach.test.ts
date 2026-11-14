import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// Books handed out (DS-61 phase E2). Every name, symbol and amount is made up.

test('a handout takes its price and branch from the book and the student, and is scoped to the branch', async ({
  testApp,
  request,
  connection,
}) => {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'ps-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'ps-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'ps-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'ps-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const book = await connection.query
    .insertInto('eduSach')
    .values({
      kyHieu: 'PS1',
      ten: 'Sách phát 1',
      giaBia: 90000,
      giaBan: 80000,
      trangThai: 'dang_ban',
    })
    .execute();
  void book;
  const sach = await connection.query
    .selectFrom('eduSach')
    .select('id')
    .where('kyHieu', '=', 'PS1')
    .executeTakeFirstOrThrow();
  const sachId = Number(sach.id);

  const anonymous = await request('/phatSach/ghi', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: '{}',
  });
  expect(anonymous.status).toBe(401);

  // A coach and an accountant may not hand a book out.
  for (const person of [hlvA, keToan]) {
    const denied = await post(person.session, '/phatSach/ghi', {
      hocVienId: ids.hocVienA,
      sachId,
    });
    expect(denied.status).toBe(403);
  }

  // The manager of branch A hands a book out to a student of branch A: price 80000 - discount 5000.
  const ok = await post(managerA.session, '/phatSach/ghi', {
    hocVienId: ids.hocVienA,
    sachId,
    ngay: '2026-05-10',
    uuDai: 5000,
  });
  expect(ok.status).toBe(201);
  expect(
    ((await ok.json()) as { data: { tienSach: number } }).data,
  ).toMatchObject({ tienSach: 75000 });
  const stored = await connection.query
    .selectFrom('eduPhatSach')
    .selectAll()
    .where('hocVienId', '=', ids.hocVienA)
    .executeTakeFirstOrThrow();
  expect(stored).toMatchObject({
    coSoId: ids.coSoA,
    ngay: '2026-05-10',
    uuDai: 5000,
    tienSach: 75000,
  });

  // Not a student of another branch, a discount above the price, or a book that is no longer sold.
  const other = await post(managerA.session, '/phatSach/ghi', {
    hocVienId: ids.hocVienB,
    sachId,
  });
  expect(other.status).toBe(404);
  const toomuch = await post(admin, '/phatSach/ghi', {
    hocVienId: ids.hocVienA,
    sachId,
    uuDai: 80001,
  });
  expect(toomuch.status).toBeGreaterThanOrEqual(400);
  await connection.query
    .updateTable('eduSach')
    .set({ trangThai: 'ngung' })
    .where('id', '=', sachId)
    .execute();
  const withdrawn = await post(admin, '/phatSach/ghi', {
    hocVienId: ids.hocVienA,
    sachId,
  });
  expect(withdrawn.status).toBeGreaterThanOrEqual(400);

  // Reading is scoped: the manager of A and the accountant see the row, the coach sees nothing.
  const seen = async (session: typeof admin) =>
    (
      (await (await post(session, '/phatSach/findMany', {})).json()) as {
        data: unknown[];
      }
    ).data.length;
  expect(await seen(managerA.session)).toBe(1);
  expect(await seen(keToan.session)).toBe(1);
  expect((await post(hlvA.session, '/phatSach/findMany', {})).status).toBe(403);
  // The book fund: paid minus handed out, per student of the caller's scope.
  await connection.query
    .insertInto('eduNopSach')
    .values({
      hocVienId: ids.hocVienA,
      coSoId: ids.coSoA,
      ngay: '2026-05-09',
      soTien: 100000,
      createdAt: new Date(),
    })
    .execute();
  const fund = async (session: typeof admin) =>
    (
      (await (await post(session, '/quySach/xem', {})).json()) as {
        data: { rows: { hocVienId: number; conLai: number }[] };
      }
    ).data.rows;
  expect(await fund(managerA.session)).toMatchObject([
    { hocVienId: ids.hocVienA, daNop: 100000, daPhat: 75000, conLai: 25000 },
  ]);
  expect((await post(hlvA.session, '/quySach/xem', {})).status).toBe(403);
  // Recording book money paid: the manager of A for a student of A only; a coach, never.
  const paid = await post(managerA.session, '/nopSach/ghi', {
    hocVienId: ids.hocVienA,
    soTien: 50000,
    ngay: '2026-05-12',
  });
  expect(paid.status).toBe(201);
  expect(
    (
      await post(managerA.session, '/nopSach/ghi', {
        hocVienId: ids.hocVienB,
        soTien: 1000,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await post(hlvA.session, '/nopSach/ghi', {
        hocVienId: ids.hocVienA,
        soTien: 1000,
      })
    ).status,
  ).toBe(403);
  expect(
    (await post(admin, '/nopSach/ghi', { hocVienId: ids.hocVienA, soTien: 0 }))
      .status,
  ).toBe(400);
  expect(await fund(managerA.session)).toMatchObject([
    { hocVienId: ids.hocVienA, daNop: 150000, daPhat: 75000, conLai: 75000 },
  ]);
  // A handout is never edited or deleted through the record API.
  const edit = await post(admin, '/phatSach/updateOne', {
    filter: { id: Number(stored.id) },
    values: { uuDai: 0 },
  });
  expect(edit.status).toBeGreaterThanOrEqual(400);
});
