import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// Coach profiles and pay (DS-61 phase F). Every name and amount is made up.

test('pay is the administrator only: profiles, the sessions taught in a month and the sum', async ({
  testApp,
  request,
  connection,
}) => {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'gv-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'gv-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'gv-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'gv-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const anonymous = await request('/hoSoGv/thuLao', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: '{"thang":"2026-05"}',
  });
  expect(anonymous.status).toBe(401);

  // Nobody but the administrator reads or writes a profile or the pay.
  for (const person of [hlvA, managerA, keToan]) {
    expect((await post(person.session, '/hoSoGv/findMany', {})).status).toBe(
      403,
    );
    expect(
      (
        await post(person.session, '/hoSoGv/createOne', {
          values: { userId: hlvA.id, thuLaoMotBuoi: 1 },
        })
      ).status,
    ).toBe(403);
    expect(
      (await post(person.session, '/hoSoGv/thuLao', { thang: '2026-05' }))
        .status,
    ).toBe(403);
  }

  const made = await post(admin, '/hoSoGv/createOne', {
    values: {
      userId: hlvA.id,
      tenVietTat: 'GV A',
      viTri: 'Giáo viên',
      thuLaoMotBuoi: 150000,
    },
  });
  expect([200, 201]).toContain(made.status);
  // One profile per account.
  expect(
    (
      await post(admin, '/hoSoGv/createOne', {
        values: { userId: hlvA.id, thuLaoMotBuoi: 1 },
      })
    ).status,
  ).toBeGreaterThanOrEqual(400);

  // Two sessions of May with attendance taken, one still planned, one of April: only the first two count.
  const session = (ngay: string, trangThai: string) =>
    connection.query
      .insertInto('eduBuoiHoc')
      .values({
        lopId: ids.lopA,
        ngay,
        gioBatDau: '17:30',
        gioKetThuc: '19:00',
        hlvId: hlvA.id,
        trangThai,
      })
      .execute();
  await session('2026-05-04', 'da_diem_danh');
  await session('2026-05-11', 'da_diem_danh');
  await session('2026-05-18', 'du_kien');
  await session('2026-04-27', 'da_diem_danh');

  const pay = (await (
    await post(admin, '/hoSoGv/thuLao', { thang: '2026-05' })
  ).json()) as {
    data: {
      rows: { ten: string; soBuoi: number; tong: number }[];
      tong: number;
    };
  };
  expect(pay.data.rows).toEqual([
    expect.objectContaining({ ten: 'GV A', soBuoi: 2, tong: 300000 }),
  ]);
  expect(pay.data.tong).toBe(300000);
  expect(
    (await post(admin, '/hoSoGv/thuLao', { thang: '2026-13' })).status,
  ).toBe(400);

  // The account of a profile never changes.
  const rows = (await (await post(admin, '/hoSoGv/findMany', {})).json()) as {
    data: { id: number }[];
  };
  const moved = await post(admin, '/hoSoGv/updateOne', {
    filter: { id: rows.data[0]?.id },
    values: { userId: hlvB.id },
  });
  expect(moved.status).toBeGreaterThanOrEqual(400);
});
