import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

/** Groups inside a class (phase 3): record API of `lopNhom`, `/hocVien/chuyenNhom`, `/lopNhom/taoMacDinh`, the register filter. */
async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Parameters<typeof seedSchool>[0],
) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'nh-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'nh-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'nh-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'nh-kt', 'edu_ke_toan');
  const apiDoc = await userWithRole(testApp, admin, 'nh-api', 'edu_api_doc');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const q = connection.query;
  const groups = async (lopId: number) =>
    (
      await q
        .selectFrom('eduLopNhom')
        .select(['id', 'ten', 'thuTu', 'trangThai'])
        .where('lopId', '=', lopId)
        .orderBy('thuTu')
        .execute()
    ).map((g: Record<string, unknown>) => ({
      id: Number(g.id),
      ten: String(g.ten),
      trangThai: String(g.trangThai),
    }));
  return { admin, hlvA, hlvB, managerA, keToan, apiDoc, ids, groups, q };
}

const studentGroup = async (q: any, id: number) => {
  const row = await q
    .selectFrom('eduHocVien')
    .select(['nhomId', 'lopId'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  return {
    nhomId: row.nhomId == null ? null : Number(row.nhomId),
    lopId: row.lopId == null ? null : Number(row.lopId),
  };
};

test('seeded classes have the three standard groups; a new class gets them too', async ({
  testApp,
  connection,
}) => {
  const { managerA, groups, ids } = await setup(testApp, connection);
  expect((await groups(ids.lopA)).map((g: { ten: string }) => g.ten)).toEqual([
    'Nhập môn',
    'Cơ bản',
    'Nâng cao',
  ]);
  const created = await post(managerA.session, '/lop/createOne', {
    values: {
      ma: 'L-NH1',
      ten: 'Lớp Mẫu Nhóm',
      coSoId: ids.coSoA,
      levelKey: 'tot',
      levelOrder: 1,
    },
  });
  expect(created.status).toBe(200);
  const row = await connection.query
    .selectFrom('eduLop')
    .select('id')
    .where('ma', '=', 'L-NH1')
    .executeTakeFirstOrThrow();
  const made = await groups(Number(row.id));
  expect(made.map((g: { ten: string }) => g.ten)).toEqual([
    'Nhập môn',
    'Cơ bản',
    'Nâng cao',
  ]);
  expect(
    made.every((g: { trangThai: string }) => g.trangThai === 'hoat_dong'),
  ).toBe(true);
});

test('the record API needs a session and edu.lopNhom, and keeps to the scope', async ({
  request,
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB, managerA, keToan, apiDoc, ids, groups } =
    await setup(testApp, connection);
  const anonymous = await request('/lopNhom/findMany', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({}),
  });
  expect(anonymous.status).toBe(401);
  expect((await post(apiDoc.session, '/lopNhom/findMany', {})).status).toBe(
    403,
  );

  const idsOf = async (session: Parameters<typeof post>[0]) => {
    const response = await post(session, '/lopNhom/findMany', { limit: 100 });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { lopId: number }[] };
    return [...new Set(body.data.map((g) => Number(g.lopId)))].sort();
  };
  expect(await idsOf(admin)).toEqual([ids.lopA, ids.lopB].sort());
  expect(await idsOf(hlvA.session)).toEqual([ids.lopA]);
  expect(await idsOf(hlvB.session)).toEqual([ids.lopB]);
  expect(await idsOf(managerA.session)).toEqual([ids.lopA]);
  expect(await idsOf(keToan.session)).toEqual([ids.lopA, ids.lopB].sort());

  const own = (await groups(ids.lopA))[0];
  const foreign = (await groups(ids.lopB))[0];
  // The accountant reads but cannot change.
  expect(
    (
      await post(keToan.session, '/lopNhom/updateOne', {
        filter: { id: own.id },
        values: { ten: 'Đổi tên' },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await post(keToan.session, '/lopNhom/createOne', {
        values: { lopId: ids.lopA, ten: 'Nhóm Mới' },
      })
    ).status,
  ).toBe(403);
  // A coach of another class cannot rename, add to or read the group of a class that is not theirs.
  const otherRename = await post(hlvA.session, '/lopNhom/updateOne', {
    filter: { id: foreign.id },
    values: { ten: 'Đổi tên' },
  });
  expect([403, 404]).toContain(otherRename.status);
  expect(
    (
      await post(hlvA.session, '/lopNhom/createOne', {
        values: { lopId: ids.lopB, ten: 'Nhóm Lạ' },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await post(managerA.session, '/lopNhom/createOne', {
        values: { lopId: ids.lopB, ten: 'Nhóm Lạ' },
      })
    ).status,
  ).toBe(403);
  expect((await groups(ids.lopB)).map((g: { ten: string }) => g.ten)).toEqual([
    'Nhập môn',
    'Cơ bản',
    'Nâng cao',
  ]);
  // A group cannot be deleted through the record API, nor moved to another class.
  expect([403, 404]).toContain(
    (await post(admin, '/lopNhom/deleteOne', { filter: { id: own.id } }))
      .status,
  );
  const moved = await post(admin, '/lopNhom/updateOne', {
    filter: { id: own.id },
    values: { lopId: ids.lopB },
  });
  expect(moved.status).not.toBe(200);
  expect((await groups(ids.lopA)).length).toBe(3);
});

test('a coach renames and adds groups of their class; names are clean and unique; at most 12', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, groups } = await setup(testApp, connection);
  const [first, second] = await groups(ids.lopA);
  const rename = await post(hlvA.session, '/lopNhom/updateOne', {
    filter: { id: first.id },
    values: { ten: 'Khởi động' },
  });
  expect(rename.status).toBe(200);
  expect((await groups(ids.lopA))[0].ten).toBe('Khởi động');

  const duplicate = await post(hlvA.session, '/lopNhom/updateOne', {
    filter: { id: first.id },
    values: { ten: second.ten },
  });
  expect(duplicate.status).toBe(409);
  for (const ten of ['', '  ', ' Nhóm A', 'Nhóm  A', 'x'.repeat(101)]) {
    const bad = await post(hlvA.session, '/lopNhom/updateOne', {
      filter: { id: first.id },
      values: { ten },
    });
    expect(`${ten.length} ${bad.status}`).toBe(`${ten.length} 400`);
  }
  expect(
    (
      await post(hlvA.session, '/lopNhom/updateOne', {
        filter: { id: first.id },
        values: { trangThai: 'xoa' },
      })
    ).status,
  ).toBe(400);

  const added = await post(hlvA.session, '/lopNhom/createOne', {
    values: { lopId: ids.lopA, ten: 'Nhóm Phụ', thuTu: 4 },
  });
  expect(added.status).toBe(200);
  expect(
    (
      await post(hlvA.session, '/lopNhom/createOne', {
        values: { lopId: ids.lopA, ten: 'Nhóm Phụ', thuTu: 5 },
      })
    ).status,
  ).toBe(409);
  // 4 groups so far: eight more reach 12, the next one is refused.
  for (let i = 1; i <= 8; i += 1) {
    expect(
      (
        await post(hlvA.session, '/lopNhom/createOne', {
          values: { lopId: ids.lopA, ten: `Nhóm Thêm ${i}`, thuTu: 5 + i },
        })
      ).status,
    ).toBe(200);
  }
  expect(
    (
      await post(hlvA.session, '/lopNhom/createOne', {
        values: { lopId: ids.lopA, ten: 'Nhóm Thừa', thuTu: 99 },
      })
    ).status,
  ).toBe(400);
});

test('moving a student: own class only, history written, hidden groups and foreign groups refused', async ({
  request,
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB, managerA, keToan, apiDoc, ids, groups, q } =
    await setup(testApp, connection);
  const [gA1, gA2] = await groups(ids.lopA);
  const [gB1] = await groups(ids.lopB);

  const anonymous = await request('/hocVien/chuyenNhom', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ hocVienId: ids.hocVienA, nhomId: gA1.id }),
  });
  expect(anonymous.status).toBe(401);
  for (const denied of [keToan, apiDoc]) {
    expect(
      (
        await post(denied.session, '/hocVien/chuyenNhom', {
          hocVienId: ids.hocVienA,
          nhomId: gA1.id,
        })
      ).status,
    ).toBe(403);
  }
  // Out of scope: the coach of class B cannot move the student of class A (not found, not an error that describes him).
  expect(
    (
      await post(hlvB.session, '/hocVien/chuyenNhom', {
        hocVienId: ids.hocVienA,
        nhomId: gB1.id,
      })
    ).status,
  ).toBe(404);
  expect((await studentGroup(q, ids.hocVienA)).nhomId).toBeNull();

  // Own student, own group.
  const first = await post(hlvA.session, '/hocVien/chuyenNhom', {
    hocVienId: ids.hocVienA,
    nhomId: gA1.id,
  });
  expect(first.status).toBe(200);
  expect(
    ((await first.json()) as { data: { thayDoi: boolean } }).data.thayDoi,
  ).toBe(true);
  expect((await studentGroup(q, ids.hocVienA)).nhomId).toBe(gA1.id);
  // The same group again changes nothing and writes no second history row.
  const again = await post(hlvA.session, '/hocVien/chuyenNhom', {
    hocVienId: ids.hocVienA,
    nhomId: gA1.id,
  });
  expect(
    ((await again.json()) as { data: { thayDoi: boolean } }).data.thayDoi,
  ).toBe(false);
  // A group of another class is refused, even one the caller sees (administrator).
  const wrongClass = await post(admin, '/hocVien/chuyenNhom', {
    hocVienId: ids.hocVienA,
    nhomId: gB1.id,
  });
  expect(wrongClass.status).toBe(400);
  // A group the caller does not see is not found.
  expect(
    (
      await post(hlvA.session, '/hocVien/chuyenNhom', {
        hocVienId: ids.hocVienA,
        nhomId: gB1.id,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await post(managerA.session, '/hocVien/chuyenNhom', {
        hocVienId: ids.hocVienA,
        nhomId: gA2.id,
      })
    ).status,
  ).toBe(200);
  // Unknown ids and bad input.
  expect(
    (
      await post(hlvA.session, '/hocVien/chuyenNhom', {
        hocVienId: ids.hocVienA,
        nhomId: 999999,
      })
    ).status,
  ).toBe(404);
  expect(
    (await post(hlvA.session, '/hocVien/chuyenNhom', { hocVienId: 'x' }))
      .status,
  ).toBe(400);

  // Hiding a group that still has a student is refused; once he leaves, it is allowed; a hidden group takes nobody.
  const hide = (id: number) =>
    post(hlvA.session, '/lopNhom/updateOne', {
      filter: { id },
      values: { trangThai: 'an' },
    });
  const refused = await hide(gA2.id);
  expect(refused.status).toBe(400);
  expect(JSON.stringify(await refused.json())).toContain(
    'EDU_GROUP_HAS_STUDENTS',
  );
  expect(
    (
      await post(hlvA.session, '/hocVien/chuyenNhom', {
        hocVienId: ids.hocVienA,
        nhomId: null,
      })
    ).status,
  ).toBe(200);
  expect((await hide(gA2.id)).status).toBe(200);
  expect(
    (
      await post(hlvA.session, '/hocVien/chuyenNhom', {
        hocVienId: ids.hocVienA,
        nhomId: gA2.id,
      })
    ).status,
  ).toBe(400);

  const history = await q
    .selectFrom('eduHocVienChuyenNhom')
    .select(['tuNhomId', 'denNhomId', 'nguoiThucHienId'])
    .where('hocVienId', '=', ids.hocVienA)
    .orderBy('id')
    .execute();
  expect(
    history.map((h: Record<string, unknown>) => [
      h.tuNhomId == null ? null : Number(h.tuNhomId),
      h.denNhomId == null ? null : Number(h.denNhomId),
    ]),
  ).toEqual([
    [null, gA1.id],
    [gA1.id, gA2.id],
    [gA2.id, null],
  ]);
  expect(String(history[0].nguoiThucHienId)).toBe(hlvA.id);
  expect(String(history[1].nguoiThucHienId)).toBe(managerA.id);
});

test('moving a student to another class puts him out of his group', async ({
  testApp,
  connection,
}) => {
  const { admin, ids, groups, q } = await setup(testApp, connection);
  const [gA1] = await groups(ids.lopA);
  expect(
    (
      await post(admin, '/hocVien/chuyenNhom', {
        hocVienId: ids.hocVienA,
        nhomId: gA1.id,
      })
    ).status,
  ).toBe(200);
  // A second class of the same branch.
  await q
    .insertInto('eduLop')
    .values({
      ma: 'L-A2',
      ten: 'Lớp Mẫu A2',
      coSoId: ids.coSoA,
      levelKey: 'tot',
      levelOrder: 1,
    })
    .execute();
  const other = Number(
    (
      await q
        .selectFrom('eduLop')
        .select('id')
        .where('ma', '=', 'L-A2')
        .executeTakeFirstOrThrow()
    ).id,
  );
  // Putting him in the class he is already in keeps his group.
  expect(
    (
      await post(admin, '/hocVien/chuyenLop', {
        id: ids.hocVienA,
        lopId: ids.lopA,
      })
    ).status,
  ).toBe(200);
  expect((await studentGroup(q, ids.hocVienA)).nhomId).toBe(gA1.id);
  expect(
    (
      await post(admin, '/hocVien/chuyenLop', {
        id: ids.hocVienA,
        lopId: other,
      })
    ).status,
  ).toBe(200);
  expect(await studentGroup(q, ids.hocVienA)).toEqual({
    nhomId: null,
    lopId: other,
  });
  const history = await q
    .selectFrom('eduHocVienChuyenNhom')
    .select(['tuNhomId', 'denNhomId', 'ghiChu'])
    .where('hocVienId', '=', ids.hocVienA)
    .orderBy('id')
    .execute();
  expect(history.length).toBe(2);
  expect(Number(history[1].tuNhomId)).toBe(gA1.id);
  expect(history[1].denNhomId).toBeNull();
  expect(history[1].ghiChu).toBe('chuyen_lop');
});

test('the standard groups are created for a class without any, only inside the caller scope', async ({
  testApp,
  connection,
}) => {
  const { hlvA, managerA, keToan, ids, groups, q } = await setup(
    testApp,
    connection,
  );
  await q.deleteFrom('eduLopNhom').where('lopId', '=', ids.lopA).execute();
  expect((await groups(ids.lopA)).length).toBe(0);
  // Not for the accountant (view only), nor for a coach or manager of another class or branch.
  expect(
    (await post(keToan.session, '/lopNhom/taoMacDinh', { lopId: ids.lopA }))
      .status,
  ).toBe(403);
  const hlvB = await userWithRole(
    testApp,
    await adminSession(testApp),
    'nh-hlv-c',
    'edu_hlv',
  );
  expect(
    (await post(hlvB.session, '/lopNhom/taoMacDinh', { lopId: ids.lopA }))
      .status,
  ).toBe(404);
  expect(
    (await post(managerA.session, '/lopNhom/taoMacDinh', { lopId: ids.lopB }))
      .status,
  ).toBe(404);
  expect((await groups(ids.lopA)).length).toBe(0);

  const done = await post(hlvA.session, '/lopNhom/taoMacDinh', {
    lopId: ids.lopA,
  });
  expect(done.status).toBe(200);
  expect((await groups(ids.lopA)).length).toBe(3);
  // A second call adds nothing.
  const twice = await post(hlvA.session, '/lopNhom/taoMacDinh', {
    lopId: ids.lopA,
  });
  expect(
    ((await twice.json()) as { data: { taoMoi: boolean } }).data.taoMoi,
  ).toBe(false);
  expect((await groups(ids.lopA)).length).toBe(3);
});

test('the register filter keeps the students of a group, inside the group class and the caller scope', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB, ids, groups, q } = await setup(
    testApp,
    connection,
  );
  await q
    .insertInto('eduHocVien')
    .values({
      ma: 'HS-A2',
      hoTen: 'Học viên Mẫu 02',
      namSinh: 2016,
      levelKey: 'tot',
      levelOrder: 1,
      lopId: ids.lopA,
      coSoId: ids.coSoA,
    })
    .execute();
  const hocVienA2 = Number(
    (
      await q
        .selectFrom('eduHocVien')
        .select('id')
        .where('ma', '=', 'HS-A2')
        .executeTakeFirstOrThrow()
    ).id,
  );
  await q
    .insertInto('eduBuoiHoc')
    .values({
      lopId: ids.lopA,
      ngay: '2026-11-02',
      gioBatDau: '17:30',
      gioKetThuc: '19:00',
      hlvId: hlvA.id,
      trangThai: 'da_diem_danh',
    })
    .execute();
  const buoi = Number(
    (
      await q
        .selectFrom('eduBuoiHoc')
        .select('id')
        .where('lopId', '=', ids.lopA)
        .executeTakeFirstOrThrow()
    ).id,
  );
  await q
    .insertInto('eduDiemDanh')
    .values([
      { buoiHocId: buoi, hocVienId: ids.hocVienA, trangThai: 'co_mat' },
      { buoiHocId: buoi, hocVienId: hocVienA2, trangThai: 'vang_khong_phep' },
    ])
    .execute();
  const [gA1, gA2] = await groups(ids.lopA);
  await post(admin, '/hocVien/chuyenNhom', {
    hocVienId: ids.hocVienA,
    nhomId: gA1.id,
  });
  await post(admin, '/hocVien/chuyenNhom', {
    hocVienId: hocVienA2,
    nhomId: gA2.id,
  });

  const look = async (
    session: Parameters<typeof post>[0],
    body: Record<string, unknown>,
  ) => {
    const response = await post(session, '/diemDanh/traCuu', {
      tuNgay: '2026-11-01',
      denNgay: '2026-11-30',
      cheDo: 'hocVien',
      ...body,
    });
    return {
      status: response.status,
      body: (await response.json()) as {
        data: Record<string, unknown>[];
        meta: { count: number };
      },
    };
  };
  const everyone = await look(admin, {});
  expect(everyone.body.data.length).toBe(2);
  const only = await look(hlvA.session, { nhomId: gA1.id });
  expect(only.status).toBe(200);
  expect(only.body.data.map((r) => Number(r.hocVienId))).toEqual([
    ids.hocVienA,
  ]);
  expect(Number(only.body.data[0].nhomId)).toBe(gA1.id);
  // By session the group filter leaves the session with the group's marks only.
  const bySession = await look(hlvA.session, { nhomId: gA2.id, cheDo: 'buoi' });
  expect(bySession.body.data.length).toBe(1);
  expect(Number(bySession.body.data[0].vangKhongPhep)).toBe(1);
  expect(Number(bySession.body.data[0].coMat)).toBe(0);
  // A class filter that is not the group's class matches nothing; so does a student outside the group.
  expect(
    (await look(admin, { nhomId: gA1.id, lopId: ids.lopB })).body.data,
  ).toEqual([]);
  expect(
    (await look(admin, { nhomId: gA1.id, hocVienId: hocVienA2 })).body.data,
  ).toEqual([]);
  // The coach of class B does not see the group of class A: it matches nothing, no error.
  const foreign = await look(hlvB.session, { nhomId: gA1.id });
  expect(foreign.status).toBe(200);
  expect(foreign.body.data).toEqual([]);
  // An unknown group matches nothing too.
  expect((await look(admin, { nhomId: 999999 })).body.data).toEqual([]);
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
  const [gA1, gA2] = await groups(ids.lopA);
  for (const nhomId of [gA1.id, gA2.id])
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
  expect((await rowsOf(admin)).length).toBe(2);
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

test('hiding a group and moving a student into it at the same time never leaves a hidden group with a student', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, groups, q } = await setup(testApp, connection);
  for (let round = 0; round < 6; round += 1) {
    const [, target] = await groups(ids.lopA);
    // Start from a visible, empty group and a student in none.
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
    const inside = (await studentGroup(q, ids.hocVienA)).nhomId === target.id;
    // Exactly one of the two won: a hidden group has nobody, a group with a student is in use.
    expect(group === 'an' && inside).toBe(false);
    expect(hidden.status === 200 || moved.status === 200).toBe(true);
    expect(hidden.status === 200 && moved.status === 200).toBe(false);
    expect(group === 'an').toBe(hidden.status === 200);
    expect(inside).toBe(moved.status === 200);
  }
});
