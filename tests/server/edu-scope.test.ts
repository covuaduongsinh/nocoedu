import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

test('every NocoEdu record route answers 401 without a session', async ({
  request,
}) => {
  for (const path of [
    '/coSo/findMany',
    '/lop/findMany',
    '/hocVien/findMany',
    '/phuHuynh/findMany',
    '/dongY/findMany',
    '/hocVien/taoMoi',
    '/hocVien/lenCap',
    '/phuHuynh/taoMoi',
    '/dongY/ghiNhan',
  ]) {
    const response = await request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: '{}',
    });
    expect(response.status, path).toBe(401);
  }
  for (const path of ['/ext/hocVien', '/ext/phuHuynh']) {
    expect((await request(path)).status, path).toBe(401);
  }
});

test('a coach sees only the class they teach, a branch manager only their branch', async ({
  testApp,
  connection,
}) => {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'quanly-a',
    'edu_quan_ly_co_so',
  );
  await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });

  const coachList = await post(hlvA.session, '/hocVien/findMany', {});
  expect(coachList.status).toBe(200);
  const coachRows = ((await coachList.json()) as { data: { ma: string }[] })
    .data;
  expect(coachRows.map((r) => r.ma)).toEqual(['HS-A']);

  // Another class: not found or forbidden, never the record.
  const other = await post(hlvA.session, '/hocVien/findOne', {
    filter: { id: 2 },
  });
  if (other.status === 200) {
    expect(((await other.json()) as { data: unknown }).data ?? null).toBeNull();
  } else {
    expect([403, 404]).toContain(other.status);
  }

  // A coach cannot write: no create/update/delete mapping.
  const write = await post(hlvA.session, '/hocVien/updateOne', {
    filter: { id: 1 },
    values: { hoTen: 'Đổi tên' },
  });
  expect(write.status).toBe(403);

  const classes = await post(hlvA.session, '/lop/findMany', {});
  expect(
    ((await classes.json()) as { data: { ma: string }[] }).data.map(
      (r) => r.ma,
    ),
  ).toEqual(['L-A1']);

  const managerRows = await post(managerA.session, '/hocVien/findMany', {});
  expect(
    ((await managerRows.json()) as { data: { ma: string }[] }).data.map(
      (r) => r.ma,
    ),
  ).toEqual(['HS-A']);
  const branches = await post(managerA.session, '/coSo/findMany', {});
  expect(
    ((await branches.json()) as { data: { ma: string }[] }).data.map(
      (r) => r.ma,
    ),
  ).toEqual(['CS-A']);

  const adminRows = await post(admin, '/hocVien/findMany', {});
  expect(((await adminRows.json()) as { data: unknown[] }).data).toHaveLength(
    2,
  );
});
