import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// The "sessions left" threshold is set per branch (eduCoSo.nguongNhacBuoi, 2 until changed). Names are made up.

async function setup(testApp: any, connection: any) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'ng-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'ng-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'ng-ql-a',
    'edu_quan_ly_co_so',
  );
  const quanTri = await userWithRole(testApp, admin, 'ng-qt', 'edu_quan_tri');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  await connection.query
    .insertInto('eduBuoiHoc')
    .values({
      lopId: ids.lopA,
      ngay: '2026-11-02',
      gioBatDau: '17:30',
      gioKetThuc: '19:00',
    })
    .execute();
  const session = await connection.query
    .selectFrom('eduBuoiHoc')
    .select('id')
    .where('lopId', '=', ids.lopA)
    .executeTakeFirstOrThrow();
  return { hlvA, quanTri, managerA, ids, sessionA: Number(session.id) };
}

const setBalance = (connection: any, id: number, value: number) =>
  connection.query
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: value })
    .where('id', '=', id)
    .execute();

const setThreshold = (connection: any, id: number, value: number) =>
  connection.query
    .updateTable('eduCoSo')
    .set({ nguongNhacBuoi: value })
    .where('id', '=', id)
    .execute();

test('every branch starts at 2 and the warning list, the report and the register follow the branch threshold', async ({
  testApp,
  connection,
}) => {
  const { hlvA, quanTri, ids, sessionA } = await setup(testApp, connection);
  const branch = await connection.query
    .selectFrom('eduCoSo')
    .select('nguongNhacBuoi')
    .where('id', '=', ids.coSoA)
    .executeTakeFirstOrThrow();
  expect(Number(branch.nguongNhacBuoi)).toBe(2);

  const codes = async (path: string, body: object): Promise<string[]> => {
    const response = await post(quanTri.session, path, body);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      data:
        { ma?: string; rows?: { ma: string }[] }[] | { rows: { ma: string }[] };
    };
    const rows = Array.isArray(json.data) ? json.data : json.data.rows;
    return (rows as { ma: string }[]).map((row) => row.ma).sort();
  };

  await setBalance(connection, ids.hocVienA, 3);
  await setBalance(connection, ids.hocVienB, 2);
  expect(await codes('/soDu/canhBao', {})).toEqual(['HS-B']);
  expect(await codes('/baoCao/xem', { loai: 'sapHetBuoi' })).toEqual(['HS-B']);

  // Branch A warns from 3 sessions, branch B stops warning at 1.
  await setThreshold(connection, ids.coSoA, 3);
  await setThreshold(connection, ids.coSoB, 1);
  expect(await codes('/soDu/canhBao', {})).toEqual(['HS-A']);
  expect(await codes('/baoCao/xem', { loai: 'sapHetBuoi' })).toEqual(['HS-A']);

  // The register's answer after a save uses the same threshold: 4 → present → 3 left, branch A warns from 3.
  await setBalance(connection, ids.hocVienA, 4);
  const saved = await post(hlvA.session, '/diemDanh/luu', {
    buoiHocId: sessionA,
    danhSach: [{ hocVienId: ids.hocVienA, trangThai: 'co_mat' }],
  });
  expect(saved.status).toBe(200);
  const result = (await saved.json()) as {
    data: { danhSach: { soBuoiConLai: number; canhBao: boolean }[] };
  };
  expect(result.data.danhSach[0]).toMatchObject({
    soBuoiConLai: 3,
    canhBao: true,
  });
});

test('only the administrator sets the threshold, and only a whole number from 0 to 50', async ({
  testApp,
  connection,
}) => {
  const { hlvA, managerA, quanTri, ids } = await setup(testApp, connection);
  const set = (session: any, value: unknown) =>
    post(session, '/coSo/updateOne', {
      filter: { id: ids.coSoA },
      values: { nguongNhacBuoi: value },
    });
  const read = async (): Promise<number> =>
    Number(
      (
        await connection.query
          .selectFrom('eduCoSo')
          .select('nguongNhacBuoi')
          .where('id', '=', ids.coSoA)
          .executeTakeFirstOrThrow()
      ).nguongNhacBuoi,
    );

  expect((await set(hlvA.session, 5)).status).toBe(403);
  expect((await set(managerA.session, 5)).status).toBe(403);
  expect(await read()).toBe(2);
  for (const bad of [-1, 51, 1.5, '3', null]) {
    expect([400, 422].includes((await set(quanTri.session, bad)).status)).toBe(
      true,
    );
  }
  expect(await read()).toBe(2);
  expect((await set(quanTri.session, 4)).status).toBe(200);
  expect(await read()).toBe(4);
});
