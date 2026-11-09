import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

type Json = { data?: { id?: number; ngaySinh?: string | null } };

test('the full date of birth is read only by an administrator and the manager of the student branch', async ({
  testApp,
  connection,
  request,
}) => {
  const admin = await adminSession(testApp);
  const hlv = await userWithRole(testApp, admin, 'ns-hlv', 'edu_hlv');
  const manager = await userWithRole(
    testApp,
    admin,
    'ns-ql',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'ns-kt', 'edu_ke_toan');
  const apiReader = await userWithRole(testApp, admin, 'ns-api', 'edu_api_doc');
  const ids = await seedSchool(connection, {
    hlvA: hlv.id,
    hlvB: hlv.id,
    managerA: manager.id,
  });
  await connection.query
    .updateTable('eduHocVien')
    .set({ ngaySinh: '2016-03-05' })
    .where('id', '=', ids.hocVienA)
    .execute();
  const read = async (session: typeof admin, id: number) => {
    const response = await post(session, '/hocVien/ngaySinh', { id });
    return {
      status: response.status,
      body: (await response.json()) as Json,
    };
  };

  // An administrator reads any student; the manager of branch A reads branch A only.
  expect(await read(admin, ids.hocVienA)).toMatchObject({
    status: 200,
    body: { data: { id: ids.hocVienA, ngaySinh: '2016-03-05' } },
  });
  expect((await read(admin, ids.hocVienB)).body.data?.ngaySinh).toBeNull();
  expect(await read(manager.session, ids.hocVienA)).toMatchObject({
    status: 200,
    body: { data: { ngaySinh: '2016-03-05' } },
  });
  expect((await read(manager.session, ids.hocVienB)).status).toBe(404);

  // A coach, an accountant and the read-only API cannot.
  for (const session of [hlv.session, keToan.session, apiReader.session]) {
    expect((await read(session, ids.hocVienA)).status).toBe(403);
  }

  // No session at all.
  const anonymous = await request('/hocVien/ngaySinh', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ id: ids.hocVienA }),
  });
  expect(anonymous.status).toBe(401);

  // No standard record API returns the column, whoever asks.
  for (const session of [admin, manager.session, hlv.session]) {
    const response = await post(session, '/hocVien/findMany', {});
    expect(JSON.stringify(await response.json())).not.toContain('2016-03-05');
  }
});
