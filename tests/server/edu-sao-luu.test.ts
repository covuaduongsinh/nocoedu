import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// The JSON copy of the training data: administrators only, logged; no restore and no unguarded CSV routes.

test('a backup is for the administrator, is logged, and nothing restores from a file', async ({
  testApp,
  request,
  connection,
}) => {
  const anonymous = await request('/heThong/backup/exportJson', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: '{}',
  });
  expect(anonymous.status).toBe(401);

  const admin = await adminSession(testApp);
  const quanTri = await userWithRole(testApp, admin, 'sl-qt', 'edu_quan_tri');
  const hlv = await userWithRole(testApp, admin, 'sl-hlv', 'edu_hlv');
  const manager = await userWithRole(
    testApp,
    admin,
    'sl-ql',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'sl-kt', 'edu_ke_toan');
  await seedSchool(connection, {
    hlvA: hlv.id,
    hlvB: hlv.id,
    managerA: manager.id,
  });
  await connection.query
    .deleteFrom('eduXuatDuLieuNhatKy')
    .allowAllRows()
    .execute();

  // Signing in is not enough: a coach, a branch manager and an accountant get nothing.
  for (const person of [hlv, manager, keToan]) {
    const denied = await post(person.session, '/heThong/backup/exportJson', {});
    expect(denied.status).toBe(403);
  }
  expect(
    await connection.query
      .selectFrom('eduXuatDuLieuNhatKy')
      .select('id')
      .execute(),
  ).toEqual([]);

  const taken = await post(quanTri.session, '/heThong/backup/exportJson', {});
  expect(taken.status).toBe(200);
  const backup = ((await taken.json()) as any).data;
  expect(backup.duLieu.eduHocVien).toHaveLength(2);
  expect(backup.duLieu.eduCoSo).toHaveLength(2);
  expect(Object.keys(backup.duLieu)).toContain('eduSoDuNhatKy');
  expect(backup.soBanGhi).toBeGreaterThanOrEqual(6);
  const log = await connection.query
    .selectFrom('eduXuatDuLieuNhatKy')
    .select(['userId', 'loai', 'soDong'])
    .execute();
  expect(log).toEqual([
    { userId: quanTri.id, loai: 'sao_luu', soDong: backup.soBanGhi },
  ]);

  // The restore route and the two export routes that asked for no permission are gone.
  for (const path of [
    '/heThong/backup/importJson',
    '/diemDanh/xuatCsv',
    '/hocPhi/xuatCsv',
    '/hocVien/doiSoatTongThe',
    '/edu/import/xac-nhan/goiHoc',
  ]) {
    const gone = await post(quanTri.session, path, {});
    expect(gone.status).toBe(404);
  }
});
