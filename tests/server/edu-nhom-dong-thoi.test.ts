import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

/**
 * Follow-up of GĐ 3: moves and hiding of groups never race each other, a concurrent move of the same student writes one
 * history row, and the move history can be read (action `history` of `edu.lopNhom`).
 */
async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Parameters<typeof seedSchool>[0],
) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'dt-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'dt-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'dt-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'dt-kt', 'edu_ke_toan');
  const apiDoc = await userWithRole(testApp, admin, 'dt-api', 'edu_api_doc');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  for (const lopId of [ids.lopA, ids.lopB])
    await post(admin, '/lopNhom/taoMacDinh', { lopId });
  const q = connection.query;
  const groups = async (lopId: number) =>
    (
      (await q
        .selectFrom('eduLopNhom')
        .select(['id', 'ten', 'trangThai'])
        .where('lopId', '=', lopId)
        .orderBy('thuTu')
        .execute()) as { id: number; ten: string; trangThai: string }[]
    ).map((g) => ({ ...g, id: Number(g.id) }));
  const studentGroup = async (id: number) => {
    const row = await q
      .selectFrom('eduHocVien')
      .select('nhomId')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return row.nhomId == null ? null : Number(row.nhomId);
  };
  return {
    admin,
    hlvA,
    hlvB,
    managerA,
    keToan,
    apiDoc,
    ids,
    groups,
    studentGroup,
    q,
  };
}

test('hiding a group and moving a student into it at the same time never leaves a hidden group with a student', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, groups, studentGroup, q } = await setup(
    testApp,
    connection,
  );
  for (let round = 0; round < 6; round += 1) {
    const [, target] = await groups(ids.lopA);
    await q
      .updateTable('eduLopNhom')
      .set({ trangThai: 'hoat_dong' })
      .where('id', '=', target.id)
      .execute();
    await q
      .updateTable('eduHocVien')
      .set({ nhomId: null })
      .where('id', '=', ids.hocVienA)
      .execute();
    const [hidden, moved] = await Promise.all([
      post(hlvA.session, '/lopNhom/updateOne', {
        filter: { id: target.id },
        values: { trangThai: 'an' },
      }),
      post(hlvA.session, '/hocVien/chuyenNhom', {
        hocVienId: ids.hocVienA,
        nhomId: target.id,
      }),
    ]);
    const group = (
      await q
        .selectFrom('eduLopNhom')
        .select('trangThai')
        .where('id', '=', target.id)
        .executeTakeFirstOrThrow()
    ).trangThai;
    const inside = (await studentGroup(ids.hocVienA)) === target.id;
    // Exactly one of the two won: a hidden group has nobody, a group with a student stays in use.
    expect(group === 'an' && inside).toBe(false);
    expect(hidden.status === 200 || moved.status === 200).toBe(true);
    expect(hidden.status === 200 && moved.status === 200).toBe(false);
    expect(group === 'an').toBe(hidden.status === 200);
    expect(inside).toBe(moved.status === 200);
  }
});

test('two moves of the same student at once write one history row each only for the step that happened', async ({
  testApp,
  connection,
}) => {
  const { admin, ids, groups, studentGroup, q } = await setup(
    testApp,
    connection,
  );
  const [g1, g2] = await groups(ids.lopA);
  const answers = await Promise.all(
    [g1.id, g2.id].map((nhomId) =>
      post(admin, '/hocVien/chuyenNhom', { hocVienId: ids.hocVienA, nhomId }),
    ),
  );
  const history = await q
    .selectFrom('eduHocVienChuyenNhom')
    .select(['tuNhomId', 'denNhomId'])
    .where('hocVienId', '=', ids.hocVienA)
    .orderBy('id')
    .execute();
  // The moves are serialised: each one starts from where the previous one ended, so the history is a chain.
  expect(answers.every((answer) => answer.status === 200)).toBe(true);
  expect(history).toHaveLength(2);
  expect(history[0].tuNhomId).toBeNull();
  expect(Number(history[1].tuNhomId)).toBe(Number(history[0].denNhomId));
  expect(await studentGroup(ids.hocVienA)).toBe(Number(history[1].denNhomId));
});

test('the move history is read only, and only of the students the caller sees', async ({
  request,
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB, keToan, apiDoc, ids, groups } = await setup(
    testApp,
    connection,
  );
  const [g1, g2] = await groups(ids.lopA);
  for (const nhomId of [g1.id, g2.id])
    expect(
      (
        await post(hlvA.session, '/hocVien/chuyenNhom', {
          hocVienId: ids.hocVienA,
          nhomId,
        })
      ).status,
    ).toBe(200);
  const anonymous = await request('/chuyenNhom/findMany', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({}),
  });
  expect(anonymous.status).toBe(401);
  const rowsOf = async (session: Parameters<typeof post>[0]) => {
    const response = await post(session, '/chuyenNhom/findMany', {
      limit: 100,
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as { data: { hocVienId: number }[] }).data;
  };
  expect((await rowsOf(hlvA.session)).map((r) => r.hocVienId)).toEqual([
    ids.hocVienA,
    ids.hocVienA,
  ]);
  expect(await rowsOf(hlvB.session)).toEqual([]);
  expect(await rowsOf(admin)).toHaveLength(2);
  // The accountant may see the groups but not who was moved; the read-only API account sees nothing.
  for (const denied of [keToan, apiDoc])
    expect(
      (await post(denied.session, '/chuyenNhom/findMany', {})).status,
    ).toBe(403);
  // The history is never written through the record API.
  for (const method of ['createOne', 'updateOne', 'deleteOne'])
    expect([403, 404]).toContain(
      (
        await post(admin, `/chuyenNhom/${method}`, {
          values: { hocVienId: ids.hocVienA },
          filter: { id: 1 },
        })
      ).status,
    );
});
