import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// Calling a session off, and the home summary of sessions that still miss comments. Names are made up.

async function setup(testApp: any, connection: any) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'hb-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'hb-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'hb-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'hb-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  return { admin, hlvA, hlvB, managerA, keToan, ids };
}

async function addSession(
  connection: any,
  lopId: number,
  ngay: string,
  gioBatDau = '17:30',
): Promise<number> {
  await connection.query
    .insertInto('eduBuoiHoc')
    .values({ lopId, ngay, gioBatDau, gioKetThuc: '19:00' })
    .execute();
  const row = await connection.query
    .selectFrom('eduBuoiHoc')
    .select('id')
    .where('lopId', '=', lopId)
    .where('ngay', '=', ngay)
    .where('gioBatDau', '=', gioBatDau)
    .executeTakeFirstOrThrow();
  return Number(row.id);
}

const statusOf = async (connection: any, id: number): Promise<string> =>
  (
    await connection.query
      .selectFrom('eduBuoiHoc')
      .select('trangThai')
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
  ).trangThai;

/** Today in Vietnam, as the application counts it. */
const today = (): string =>
  new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

test('a session is called off and opened again by those who manage sessions, only while nobody is marked', async ({
  testApp,
  request,
  connection,
}) => {
  const anonymous = await request('/buoiHoc/huy', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: '{}',
  });
  expect(anonymous.status).toBe(401);

  const { hlvA, hlvB, keToan, ids } = await setup(testApp, connection);
  const buoiHocId = await addSession(connection, ids.lopA, '2026-11-02');

  // An accountant sees sessions and may not manage them; another coach does not see this class.
  expect(
    (await post(keToan.session, '/buoiHoc/huy', { buoiHocId, huy: true }))
      .status,
  ).toBe(403);
  expect(
    (await post(hlvB.session, '/buoiHoc/huy', { buoiHocId, huy: true })).status,
  ).toBe(404);
  expect(await statusOf(connection, buoiHocId)).toBe('du_kien');

  const off = await post(hlvA.session, '/buoiHoc/huy', {
    buoiHocId,
    huy: true,
  });
  expect(off.status).toBe(200);
  expect(await statusOf(connection, buoiHocId)).toBe('huy');

  // No register on a session that was called off: nothing is written and no balance moves.
  const marked = await post(hlvA.session, '/diemDanh/luu', {
    buoiHocId,
    danhSach: [{ hocVienId: ids.hocVienA, trangThai: 'co_mat' }],
  });
  expect(marked.status).toBe(400);
  expect(JSON.stringify(await marked.json())).toContain(
    'EDU_SESSION_CANCELLED',
  );
  expect(
    await connection.query.selectFrom('eduDiemDanh').select('id').execute(),
  ).toEqual([]);

  // Opened again, the register can be saved; after that the session cannot be called off any more.
  expect(
    (await post(hlvA.session, '/buoiHoc/huy', { buoiHocId, huy: false }))
      .status,
  ).toBe(200);
  expect(await statusOf(connection, buoiHocId)).toBe('du_kien');
  expect(
    (
      await post(hlvA.session, '/diemDanh/luu', {
        buoiHocId,
        danhSach: [{ hocVienId: ids.hocVienA, trangThai: 'co_mat' }],
      })
    ).status,
  ).toBe(200);
  const refused = await post(hlvA.session, '/buoiHoc/huy', {
    buoiHocId,
    huy: true,
  });
  expect(refused.status).toBe(400);
  expect(JSON.stringify(await refused.json())).toContain(
    'EDU_SESSION_HAS_ATTENDANCE',
  );
  expect(await statusOf(connection, buoiHocId)).toBe('da_diem_danh');
});

test('the home summary leaves out a session that was called off and lists the ones missing comments', async ({
  testApp,
  connection,
}) => {
  const { hlvA, hlvB, ids } = await setup(testApp, connection);
  const day = today();
  const cancelled = await addSession(connection, ids.lopA, day, '08:00');
  const commented = await addSession(connection, ids.lopA, day, '10:00');
  const bare = await addSession(connection, ids.lopA, day, '14:00');
  await post(hlvA.session, '/buoiHoc/huy', { buoiHocId: cancelled, huy: true });
  await post(hlvA.session, '/diemDanh/luu', {
    buoiHocId: commented,
    danhSach: [
      { hocVienId: ids.hocVienA, trangThai: 'co_mat', nhanXet: 'Tập trung' },
    ],
  });
  await post(hlvA.session, '/diemDanh/luu', {
    buoiHocId: bare,
    danhSach: [{ hocVienId: ids.hocVienA, trangThai: 'co_mat' }],
  });

  const summary = (
    (await (await post(hlvA.session, '/trangChu/tomTat', {})).json()) as any
  ).data;
  // Called off: not a register that is still due.
  expect(summary.chuaDiemDanh.map((s: any) => s.id)).toEqual([]);
  expect(summary.thieuNhanXet).toHaveLength(1);
  expect(summary.thieuNhanXet[0]).toMatchObject({
    id: bare,
    lop: 'Lớp Mẫu A1',
    thieu: 1,
    tong: 1,
  });

  // Another coach's summary holds none of this.
  const other = (
    (await (await post(hlvB.session, '/trangChu/tomTat', {})).json()) as any
  ).data;
  expect(other.thieuNhanXet).toEqual([]);
});
