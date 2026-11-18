import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

/** Groups of level inside a class (GĐ 3): the record API of the groups, the moves of a student, scope and history. */
type Json = {
  data?: Record<string, unknown> & {
    record?: Record<string, unknown>;
  };
  error?: { reason?: string; status?: string };
};
type Rows = { data: Record<string, unknown>[] };

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
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const q = connection.query;
  const groupsOf = async (lopId: number) =>
    (
      (await q
        .selectFrom('eduLopNhom')
        .select(['id', 'ten', 'thuTu', 'trangThai'])
        .where('lopId', '=', lopId)
        .orderBy('thuTu')
        .execute()) as { id: number; ten: string }[]
    ).map((g) => ({ ...g, id: Number(g.id) }));
  // `seedSchool` writes by query, so the classes have no group yet: the endpoint that gives them the defaults is used.
  for (const lopId of [ids.lopA, ids.lopB])
    await post(admin, '/lopNhom/taoMacDinh', { lopId });
  // A second class of branch A with its own student.
  await q
    .insertInto('eduLop')
    .values({
      ma: 'L-A2',
      ten: 'Lớp Mẫu A2',
      coSoId: ids.coSoA,
      hlvId: managerA.id,
      levelKey: 'tot',
      levelOrder: 1,
    })
    .execute();
  const lopA2 = Number(
    (
      await q
        .selectFrom('eduLop')
        .select('id')
        .where('ma', '=', 'L-A2')
        .executeTakeFirstOrThrow()
    ).id,
  );
  await post(admin, '/lopNhom/taoMacDinh', { lopId: lopA2 });
  return {
    admin,
    hlvA,
    hlvB,
    managerA,
    keToan,
    ids,
    lopA2,
    groupsA: await groupsOf(ids.lopA),
    groupsB: await groupsOf(ids.lopB),
    groupsA2: await groupsOf(lopA2),
    groupsOf,
  };
}

const move = async (
  session: Parameters<typeof post>[0],
  hocVienId: number,
  nhomId: number | null,
) => {
  const response = await post(session, '/hocVien/chuyenNhom', {
    hocVienId,
    nhomId,
  });
  return { status: response.status, body: (await response.json()) as Json };
};

const groupOfStudent = async (connection: any, hocVienId: number) => {
  const row = await connection.query
    .selectFrom('eduHocVien')
    .select('nhomId')
    .where('id', '=', hocVienId)
    .executeTakeFirstOrThrow();
  return row.nhomId == null ? null : Number(row.nhomId);
};
const history = (connection: any, hocVienId: number) =>
  connection.query
    .selectFrom('eduHocVienChuyenNhom')
    .select(['tuNhomId', 'denNhomId', 'nguoiThucHienId', 'ghiChu'])
    .where('hocVienId', '=', hocVienId)
    .orderBy('id')
    .execute();

test('every route answers 401 without a session and 403 to an account that may only view', async ({
  request,
  testApp,
  connection,
}) => {
  const { keToan, ids } = await setup(testApp, connection);
  for (const [path, body] of [
    ['/hocVien/chuyenNhom', { hocVienId: ids.hocVienA, nhomId: null }],
    ['/lopNhom/taoMacDinh', { lopId: ids.lopA }],
    ['/lopNhom/createOne', { values: { lopId: ids.lopA, ten: 'X' } }],
  ] as const) {
    const anonymous = await request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify(body),
    });
    expect(`${path} ${anonymous.status}`).toBe(`${path} 401`);
    const accountant = await post(keToan.session, path, body);
    expect(`${path} ${accountant.status}`).toBe(`${path} 403`);
  }
  // The accountant may view them.
  const list = await post(keToan.session, '/lopNhom/findMany', {});
  expect(list.status).toBe(200);
});

test('a class gets the three default groups once, whoever creates it', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, ids, groupsA, groupsOf } = await setup(
    testApp,
    connection,
  );
  expect(groupsA.map((g) => g.ten)).toEqual(['Nhập môn', 'Cơ bản', 'Nâng cao']);
  expect(groupsA.map((g) => g.thuTu)).toEqual([1, 2, 3]);

  // Asking again changes nothing.
  const again = await post(admin, '/lopNhom/taoMacDinh', { lopId: ids.lopA });
  expect(((await again.json()) as Json).data).toMatchObject({ created: false });
  expect(await groupsOf(ids.lopA)).toHaveLength(3);

  // A class made through the record API has its groups at once (inside the same transaction).
  const created = await post(admin, '/lop/createOne', {
    values: {
      ma: 'L-API',
      ten: 'Lớp Mẫu API',
      coSoId: ids.coSoA,
      levelKey: 'tot',
      levelOrder: 1,
      trangThai: 'dang_hoc',
    },
  });
  expect(created.status).toBe(200);
  const lopId = Number(
    (
      (await connection.query
        .selectFrom('eduLop')
        .select('id')
        .where('ma', '=', 'L-API')
        .executeTakeFirstOrThrow()) as { id: number }
    ).id,
  );
  expect((await groupsOf(lopId)).map((g) => g.ten)).toEqual([
    'Nhập môn',
    'Cơ bản',
    'Nâng cao',
  ]);

  // A class the caller does not see is "not found", and a coach may not give defaults to a class of another coach.
  const foreign = await post(hlvA.session, '/lopNhom/taoMacDinh', {
    lopId: ids.lopB,
  });
  expect(foreign.status).toBe(404);
  // A class with no group at all gets them; one whose groups are all hidden keeps its choice.
  await connection.query
    .deleteFrom('eduLopNhom')
    .where('lopId', '=', lopId)
    .execute();
  const restored = await post(admin, '/lopNhom/taoMacDinh', { lopId });
  expect(((await restored.json()) as Json).data).toMatchObject({
    created: true,
  });
});

test('groups are added, renamed, reordered and hidden, never moved to another class or deleted', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, groupsA } = await setup(testApp, connection);
  const first = groupsA[0]!;

  const added = await post(hlvA.session, '/lopNhom/createOne', {
    values: { lopId: ids.lopA, ten: '  Nhóm   thi đấu ', thuTu: 4 },
  });
  expect(added.status).toBe(400); // an untidy name is refused, not silently changed
  const tidy = await post(hlvA.session, '/lopNhom/createOne', {
    values: { lopId: ids.lopA, ten: 'Nhóm thi đấu', thuTu: 4 },
  });
  expect(tidy.status).toBe(200);

  // The name is unique inside the class.
  const duplicate = await post(hlvA.session, '/lopNhom/createOne', {
    values: { lopId: ids.lopA, ten: 'Nhóm thi đấu' },
  });
  expect(duplicate.status).toBe(409);
  expect(((await duplicate.json()) as Json).error?.reason).toBe(
    'EDU_GROUP_NAME_TAKEN',
  );
  // Renaming a group to the name of another one of the class is refused the same way.
  expect(
    (
      await post(hlvA.session, '/lopNhom/updateOne', {
        filter: { id: first.id },
        values: { ten: 'Cơ bản' },
      })
    ).status,
  ).toBe(409);
  expect(
    await connection.query
      .selectFrom('eduLopNhom')
      .select('id')
      .where('lopId', '=', ids.lopA)
      .where('ten', '=', 'Nhóm thi đấu')
      .execute(),
  ).toHaveLength(1);

  // Bad values.
  for (const values of [
    { lopId: ids.lopA, ten: '' },
    { lopId: ids.lopA, ten: 'x'.repeat(61) },
    { lopId: ids.lopA, ten: 'Tốt', trangThai: 'xoa' },
    { lopId: ids.lopA, ten: 'Tốt', thuTu: -1 },
    { lopId: ids.lopA, ten: 'Tốt', thuTu: 1.5 },
  ]) {
    const response = await post(hlvA.session, '/lopNhom/createOne', {
      values,
    });
    expect(`${JSON.stringify(values)} ${response.status}`).toBe(
      `${JSON.stringify(values)} 400`,
    );
  }

  // Rename and reorder.
  const renamed = await post(hlvA.session, '/lopNhom/updateOne', {
    filter: { id: first.id },
    values: { ten: 'Làm quen', thuTu: 9 },
  });
  expect(renamed.status).toBe(200);
  expect(
    await connection.query
      .selectFrom('eduLopNhom')
      .select(['ten', 'thuTu'])
      .where('id', '=', first.id)
      .executeTakeFirstOrThrow(),
  ).toMatchObject({ ten: 'Làm quen', thuTu: 9 });

  // The class of a group cannot change, and there is no delete.
  const moved = await post(hlvA.session, '/lopNhom/updateOne', {
    filter: { id: first.id },
    values: { lopId: ids.lopB },
  });
  expect(moved.status).toBeGreaterThanOrEqual(400);
  expect(
    Number(
      (
        (await connection.query
          .selectFrom('eduLopNhom')
          .select('lopId')
          .where('id', '=', first.id)
          .executeTakeFirstOrThrow()) as { lopId: number }
      ).lopId,
    ),
  ).toBe(ids.lopA);
  expect(
    (
      await post(hlvA.session, '/lopNhom/deleteOne', {
        filter: { id: first.id },
      })
    ).status,
  ).toBeGreaterThanOrEqual(400);

  // A group cannot be added to a class the caller does not see.
  const foreign = await post(hlvA.session, '/lopNhom/createOne', {
    values: { lopId: ids.lopB, ten: 'Lạ' },
  });
  expect(foreign.status).toBe(403);
});

test('a student is moved into a group of their own class, with a history row, and out again', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, groupsA, groupsB } = await setup(testApp, connection);
  const [a1, a2] = groupsA as [(typeof groupsA)[0], (typeof groupsA)[0]];

  expect(await groupOfStudent(connection, ids.hocVienA)).toBeNull();
  const into = await move(hlvA.session, ids.hocVienA, a1.id);
  expect(into).toMatchObject({
    status: 200,
    body: { data: { nhomId: a1.id, moved: true } },
  });
  expect(await groupOfStudent(connection, ids.hocVienA)).toBe(a1.id);

  // The same group again is not a move and writes no history.
  const same = await move(hlvA.session, ids.hocVienA, a1.id);
  expect(same.body.data).toMatchObject({ moved: false });

  await move(hlvA.session, ids.hocVienA, a2.id);
  await move(hlvA.session, ids.hocVienA, null);
  const rows = (await history(connection, ids.hocVienA)) as Record<
    string,
    unknown
  >[];
  expect(
    rows.map((r) =>
      [r.tuNhomId, r.denNhomId].map((v) => (v == null ? null : Number(v))),
    ),
  ).toEqual([
    [null, a1.id],
    [a1.id, a2.id],
    [a2.id, null],
  ]);
  expect(rows.every((r) => r.nguoiThucHienId === hlvA.id)).toBe(true);

  // A group of another class is refused; so is one that does not exist.
  expect((await move(hlvA.session, ids.hocVienA, groupsB[0]!.id)).status).toBe(
    404,
  ); // out of the coach's scope: not found
  expect((await move(hlvA.session, ids.hocVienA, 999999)).status).toBe(404);
  expect(
    (
      await post(hlvA.session, '/hocVien/chuyenNhom', {
        hocVienId: ids.hocVienA,
      })
    ).status,
  ).toBe(400);
});

test('a group of another class of the same branch is refused for the student, and a hidden group too', async ({
  testApp,
  connection,
}) => {
  const { admin, managerA, ids, groupsA, groupsA2 } = await setup(
    testApp,
    connection,
  );
  // The branch manager sees both classes of the branch, but a student takes a group of the student's own class only.
  const wrongClass = await move(
    managerA.session,
    ids.hocVienA,
    groupsA2[0]!.id,
  );
  expect(wrongClass.status).toBe(400);
  expect(wrongClass.body.error?.reason).toBe('EDU_GROUP_NOT_IN_CLASS');

  expect(
    (await move(managerA.session, ids.hocVienA, groupsA[0]!.id)).status,
  ).toBe(200);
  // Hiding the group while a student is in it is refused; after the student leaves it is allowed.
  const blocked = await post(admin, '/lopNhom/updateOne', {
    filter: { id: groupsA[0]!.id },
    values: { trangThai: 'an' },
  });
  expect(blocked.status).toBe(400);
  expect(((await blocked.json()) as Json).error?.reason).toBe(
    'EDU_GROUP_NOT_EMPTY',
  );
  await move(managerA.session, ids.hocVienA, null);
  expect(
    (
      await post(admin, '/lopNhom/updateOne', {
        filter: { id: groupsA[0]!.id },
        values: { trangThai: 'an' },
      })
    ).status,
  ).toBe(200);
  const hidden = await move(managerA.session, ids.hocVienA, groupsA[0]!.id);
  expect(hidden.status).toBe(400);
  expect(hidden.body.error?.reason).toBe('EDU_GROUP_HIDDEN');
});

test('scope: a coach and a branch manager reach only their own classes, an accountant can only look', async ({
  testApp,
  connection,
}) => {
  const { hlvA, hlvB, managerA, keToan, ids, groupsA, groupsB, groupsA2 } =
    await setup(testApp, connection);
  const idsOf = async (session: Parameters<typeof post>[0]) =>
    (
      (await (
        await post(session, '/lopNhom/findMany', { limit: 100 })
      ).json()) as Rows
    ).data
      .map((row) => Number(row.id))
      .sort((a, b) => a - b);
  const all = (...lists: { id: number }[][]) =>
    lists
      .flat()
      .map((g) => g.id)
      .sort((a, b) => a - b);
  expect(await idsOf(hlvA.session)).toEqual(all(groupsA));
  expect(await idsOf(hlvB.session)).toEqual(all(groupsB));
  expect(await idsOf(managerA.session)).toEqual(all(groupsA, groupsA2));
  expect(await idsOf(keToan.session)).toEqual(all(groupsA, groupsB, groupsA2));

  // A student of another class or branch is "not found" for a coach and for a manager.
  expect((await move(hlvA.session, ids.hocVienB, groupsB[0]!.id)).status).toBe(
    404,
  );
  expect((await move(hlvB.session, ids.hocVienA, groupsA[0]!.id)).status).toBe(
    404,
  );
  expect(
    (await move(managerA.session, ids.hocVienB, groupsB[0]!.id)).status,
  ).toBe(404);
  // The field itself is readable by the one who sees the student, never writable through the student record API.
  const edit = await post(hlvA.session, '/hocVien/updateOne', {
    filter: { id: ids.hocVienA },
    values: { nhomId: groupsA[0]!.id },
  });
  expect(edit.status).toBeGreaterThanOrEqual(400);
  expect(await groupOfStudent(connection, ids.hocVienA)).toBeNull();
});

test('moving a student to another class clears the group and keeps the history', async ({
  testApp,
  connection,
}) => {
  const { managerA, ids, lopA2, groupsA } = await setup(testApp, connection);
  await move(managerA.session, ids.hocVienA, groupsA[1]!.id);

  // Into the same class: the group stays.
  const same = await post(managerA.session, '/hocVien/chuyenLop', {
    id: ids.hocVienA,
    lopId: ids.lopA,
  });
  expect(same.status).toBe(200);
  expect(await groupOfStudent(connection, ids.hocVienA)).toBe(groupsA[1]!.id);

  const changed = await post(managerA.session, '/hocVien/chuyenLop', {
    id: ids.hocVienA,
    lopId: lopA2,
  });
  expect(changed.status).toBe(200);
  expect(await groupOfStudent(connection, ids.hocVienA)).toBeNull();
  const rows = (await history(connection, ids.hocVienA)) as Record<
    string,
    unknown
  >[];
  expect(rows.at(-1)).toMatchObject({ ghiChu: 'chuyen_lop' });
  expect(Number(rows.at(-1)!.tuNhomId)).toBe(groupsA[1]!.id);
  expect(rows.at(-1)!.denNhomId).toBeNull();
});

test('the attendance register can be filtered by group, inside the caller scope', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, ids, groupsA, groupsB } = await setup(
    testApp,
    connection,
  );
  const q = connection.query;
  await q
    .insertInto('eduHocVien')
    .values({
      ma: 'HS-A2',
      hoTen: 'Học viên Mẫu 01',
      namSinh: 2016,
      levelKey: 'tot',
      levelOrder: 1,
      lopId: ids.lopA,
      coSoId: ids.coSoA,
    })
    .execute();
  const second = Number(
    (
      (await q
        .selectFrom('eduHocVien')
        .select('id')
        .where('ma', '=', 'HS-A2')
        .executeTakeFirstOrThrow()) as { id: number }
    ).id,
  );
  await q
    .insertInto('eduBuoiHoc')
    .values({
      lopId: ids.lopA,
      ngay: '2026-11-02',
      gioBatDau: '17:30',
      gioKetThuc: '19:00',
      trangThai: 'da_diem_danh',
    })
    .execute();
  const session = Number(
    (
      (await q
        .selectFrom('eduBuoiHoc')
        .select('id')
        .where('lopId', '=', ids.lopA)
        .executeTakeFirstOrThrow()) as { id: number }
    ).id,
  );
  for (const [hocVienId, trangThai] of [
    [ids.hocVienA, 'co_mat'],
    [second, 'vang_co_phep'],
  ] as const)
    await q
      .insertInto('eduDiemDanh')
      .values({ buoiHocId: session, hocVienId, trangThai })
      .execute();
  await move(admin, ids.hocVienA, groupsA[0]!.id);
  await move(admin, second, groupsA[1]!.id);

  const look = async (
    who: Parameters<typeof post>[0],
    body: Record<string, unknown>,
  ) =>
    (await (
      await post(who, '/diemDanh/traCuu', {
        tuNgay: '2026-11-01',
        denNgay: '2026-11-30',
        cheDo: 'hocVien',
        ...body,
      })
    ).json()) as { data: { hocVienId: number }[]; meta: { count: number } };

  const everyone = await look(admin, {});
  expect(everyone.meta.count).toBe(2);
  const first = await look(admin, { nhomId: groupsA[0]!.id });
  expect(first.data.map((row) => row.hocVienId)).toEqual([ids.hocVienA]);
  const other = await look(admin, { nhomId: groupsA[1]!.id });
  expect(other.data.map((row) => row.hocVienId)).toEqual([second]);
  // By session: only the marks of that group are counted, and an empty group matches nothing.
  const bySession = (await look(admin, {
    nhomId: groupsA[1]!.id,
    cheDo: 'buoi',
  })) as unknown as { data: { vangCoPhep: number; coMat: number }[] };
  expect(bySession.data[0]).toMatchObject({ vangCoPhep: 1, coMat: 0 });
  expect((await look(admin, { nhomId: groupsA[2]!.id })).meta.count).toBe(0);
  // A group outside the caller's scope matches nothing (no probing).
  expect(
    (await look(hlvA.session, { nhomId: groupsB[0]!.id })).meta.count,
  ).toBe(0);
  expect(
    (await look(hlvA.session, { nhomId: groupsA[0]!.id })).meta.count,
  ).toBe(1);
});
