import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// Setting a balance by hand, with a reason. Names are made up.

async function setup(testApp: any, connection: any) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'dc-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'dc-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'dc-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'dc-kt', 'edu_ke_toan');
  const quanTri = await userWithRole(testApp, admin, 'dc-qt', 'edu_quan_tri');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  return { hlvA, managerA, keToan, quanTri, ids };
}

const balance = async (connection: any, hocVienId: number) =>
  Number(
    (
      await connection.query
        .selectFrom('eduHocVien')
        .select('soBuoiConLai')
        .where('id', '=', hocVienId)
        .executeTakeFirstOrThrow()
    ).soBuoiConLai,
  );

const ledger = (connection: any, hocVienId: number) =>
  connection.query
    .selectFrom('eduSoDuNhatKy')
    .select(['thayDoi', 'soDuSau', 'lyDo', 'ghiChu', 'nguoiThucHienId'])
    .where('hocVienId', '=', hocVienId)
    .orderBy('id')
    .execute();

test('only those who hold the adjust action set a balance, and every change leaves a ledger row with its reason', async ({
  testApp,
  request,
  connection,
}) => {
  const anonymous = await request('/soDu/dieuChinh', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: '{}',
  });
  expect(anonymous.status).toBe(401);

  const { hlvA, managerA, keToan, quanTri, ids } = await setup(
    testApp,
    connection,
  );
  const body = {
    hocVienId: ids.hocVienA,
    soDuHienTai: 0,
    soDuMoi: 3,
    lyDo: 'Tặng 3 buổi học bù đợt nghỉ lễ',
  };
  // A coach reads the ledger and a branch manager manages the branch; neither sets a balance by hand.
  for (const person of [hlvA, managerA]) {
    expect((await post(person.session, '/soDu/dieuChinh', body)).status).toBe(
      403,
    );
  }
  expect(await balance(connection, ids.hocVienA)).toBe(0);

  // A reason is required.
  expect(
    (await post(keToan.session, '/soDu/dieuChinh', { ...body, lyDo: ' ' }))
      .status,
  ).toBe(400);

  const done = await post(keToan.session, '/soDu/dieuChinh', body);
  expect(done.status).toBe(200);
  expect(((await done.json()) as any).data).toEqual({
    soBuoiConLai: 3,
    thayDoi: 3,
  });
  expect(await balance(connection, ids.hocVienA)).toBe(3);

  // The form was filled in against an older balance: nothing is written.
  const stale = await post(quanTri.session, '/soDu/dieuChinh', {
    ...body,
    soDuMoi: 10,
  });
  expect(stale.status).toBe(400);
  expect(JSON.stringify(await stale.json())).toContain('EDU_BALANCE_CONFLICT');
  // Nothing to change and nothing to settle.
  const same = await post(quanTri.session, '/soDu/dieuChinh', {
    ...body,
    soDuHienTai: 3,
    soDuMoi: 3,
  });
  expect(same.status).toBe(400);
  expect(JSON.stringify(await same.json())).toContain('EDU_NO_CHANGE');

  const down = await post(quanTri.session, '/soDu/dieuChinh', {
    hocVienId: ids.hocVienA,
    soDuHienTai: 3,
    soDuMoi: 1,
    lyDo: 'Hoàn 2 buổi cho phụ huynh',
  });
  expect(down.status).toBe(200);
  expect(await ledger(connection, ids.hocVienA)).toEqual([
    {
      thayDoi: 3,
      soDuSau: 3,
      lyDo: 'dieu_chinh',
      ghiChu: 'Tặng 3 buổi học bù đợt nghỉ lễ',
      nguoiThucHienId: keToan.id,
    },
    {
      thayDoi: -2,
      soDuSau: 1,
      lyDo: 'dieu_chinh',
      ghiChu: 'Hoàn 2 buổi cho phụ huynh',
      nguoiThucHienId: quanTri.id,
    },
  ]);
});

test('a balance that was written beside the ledger is settled by one adjustment, also when it is confirmed as right', async ({
  testApp,
  connection,
}) => {
  const { keToan, ids } = await setup(testApp, connection);
  // Balances written directly, as the old quick edit did: the ledger still says 0 for both.
  for (const [hocVienId, value] of [
    [ids.hocVienA, 7],
    [ids.hocVienB, -4],
  ] as const) {
    await connection.query
      .updateTable('eduHocVien')
      .set({ soBuoiConLai: value })
      .where('id', '=', hocVienId)
      .execute();
  }
  const listed = async (): Promise<string[]> =>
    (
      (await (
        await post(keToan.session, '/baoCao/xem', { loai: 'lechSoDu' })
      ).json()) as any
    ).data.rows.map((row: any) => row.ma);
  expect(await listed()).toEqual(['HS-A', 'HS-B']);

  // Student A: 7 is right. Confirming it writes what the ledger was missing.
  const confirmed = await post(keToan.session, '/soDu/dieuChinh', {
    hocVienId: ids.hocVienA,
    soDuHienTai: 7,
    soDuMoi: 7,
    lyDo: 'Đối chiếu với sổ giấy: số dư 7 buổi là đúng',
  });
  expect(confirmed.status).toBe(200);
  expect(((await confirmed.json()) as any).data).toEqual({
    soBuoiConLai: 7,
    thayDoi: 7,
  });
  // Student B: it should be 0. One row takes the ledger from 0 to 0 and the balance with it.
  const fixed = await post(keToan.session, '/soDu/dieuChinh', {
    hocVienId: ids.hocVienB,
    soDuHienTai: -4,
    soDuMoi: 2,
    lyDo: 'Đối chiếu: còn 2 buổi',
  });
  expect(fixed.status).toBe(200);
  expect(await balance(connection, ids.hocVienA)).toBe(7);
  expect(await balance(connection, ids.hocVienB)).toBe(2);
  expect(
    (await ledger(connection, ids.hocVienB)).map((row: any) => [
      Number(row.thayDoi),
      Number(row.soDuSau),
    ]),
  ).toEqual([[2, 2]]);
  expect(await listed()).toEqual([]);
});
