import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// The session history and the suggested comment of a student stay inside the caller's own students.

test('the session history and the suggestion are scoped to the students the caller sees', async ({
  testApp,
  request,
  connection,
}) => {
  for (const path of ['/nhanXet/lichSuBuoiHoc', '/nhanXet/aiGoiY']) {
    const anonymous = await request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: '{}',
    });
    expect(anonymous.status).toBe(401);
  }
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'ls-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'ls-hlv-b', 'edu_hlv');
  const manager = await userWithRole(
    testApp,
    admin,
    'ls-ql',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'ls-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: manager.id,
  });
  const q = connection.query;
  for (const [lopId, hocVienId, nhanXet] of [
    [ids.lopA, ids.hocVienA, 'Nhận xét của lớp A'],
    [ids.lopB, ids.hocVienB, 'Nhận xét của lớp B'],
  ] as const) {
    await q
      .insertInto('eduBuoiHoc')
      .values({
        lopId,
        ngay: '2026-11-02',
        gioBatDau: '17:30',
        gioKetThuc: '19:00',
        trangThai: 'da_diem_danh',
      })
      .execute();
    const session = await q
      .selectFrom('eduBuoiHoc')
      .select('id')
      .where('lopId', '=', lopId)
      .executeTakeFirstOrThrow();
    await q
      .insertInto('eduDiemDanh')
      .values({
        buoiHocId: Number(session.id),
        hocVienId,
        trangThai: 'co_mat',
        daLamBtvn: true,
        nhanXet,
        yThucDiem: 9,
        soBuoiDaTru: 1,
      })
      .execute();
  }

  // The coach of class A reads their own student...
  const own = await post(hlvA.session, '/nhanXet/lichSuBuoiHoc', {
    hocVienId: ids.hocVienA,
    thang: '2026-11',
  });
  expect(own.status).toBe(200);
  const history = ((await own.json()) as any).data;
  expect(history.danhSach).toHaveLength(1);
  expect(history.danhSach[0]).toMatchObject({
    ngay: '2026-11-02',
    lopTen: 'Lớp Mẫu A1',
    trangThai: 'co_mat',
    daLamBtvn: true,
    nhanXet: 'Nhận xét của lớp A',
    yThucDiem: 9,
  });
  expect(history.thongKe).toMatchObject({ tongBuoi: 1, soBuoiCoMat: 1 });

  // ...and a student of another coach is not found, by either route, whatever id is tried.
  for (const path of ['/nhanXet/lichSuBuoiHoc', '/nhanXet/aiGoiY']) {
    const other = await post(hlvA.session, path, {
      hocVienId: ids.hocVienB,
      thang: '2026-11',
    });
    expect(other.status).toBe(404);
    expect(JSON.stringify(await other.json())).not.toContain('lớp B');
  }
  const suggestion = await post(hlvA.session, '/nhanXet/aiGoiY', {
    hocVienId: ids.hocVienA,
    thang: '2026-11',
  });
  expect(suggestion.status).toBe(200);
  expect(((await suggestion.json()) as any).data.thongKe).toMatchObject({
    tongBuoi: 1,
    coMat: 1,
  });

  // An accountant holds no comment action at all.
  const denied = await post(keToan.session, '/nhanXet/lichSuBuoiHoc', {
    hocVienId: ids.hocVienA,
  });
  expect(denied.status).toBe(403);
});
