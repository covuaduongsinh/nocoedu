import { expect } from 'vitest';

import {
  adminSession,
  idByMa,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

/**
 * The tests of a level (GĐ 5): making a test, entering marks, closing it, who is listed as eligible to move up, and who
 * may do what. Made-up data only ("Học viên Mẫu").
 */
type Json = {
  data?: Record<string, any>;
  error?: { reason?: string; status?: string };
};
type Session = Parameters<typeof post>[0];

const call = async (session: Session, path: string, body: unknown) => {
  const response = await post(session, path, body);
  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Json,
  };
};

const anonymous = (request: any, path: string, body: unknown) =>
  request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  });

async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Parameters<typeof seedSchool>[0],
) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'kt5-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'kt5-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'kt5-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'kt5-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const q = connection.query;
  // Two more students in class A: A2 is already at level "ma", A3 is at level "tot".
  for (const [ma, hoTen, levelKey, levelOrder] of [
    ['HS-A2', 'Học viên Mẫu A2', 'ma', 2],
    ['HS-A3', 'Học viên Mẫu A3', 'tot', 1],
  ] as const)
    await q
      .insertInto('eduHocVien')
      .values({
        ma,
        hoTen,
        namSinh: 2016,
        levelKey,
        levelOrder,
        lopId: ids.lopA,
        coSoId: ids.coSoA,
      })
      .execute();
  const hocVienA2 = await idByMa(connection, 'eduHocVien', 'HS-A2');
  const hocVienA3 = await idByMa(connection, 'eduHocVien', 'HS-A3');

  const topic = async (levelKey: string, ma: string, ten: string) => {
    const created = await call(admin, '/chuongTrinh/chuDe/luu', {
      levelKey,
      ma,
      ten,
    });
    expect(created.status).toBe(201);
    return Number(created.body.data?.id);
  };
  const skill = async (chuDeId: number, ma: string, ten: string) => {
    const created = await call(admin, '/chuongTrinh/kyNang/luu', {
      chuDeId,
      ma,
      ten,
    });
    expect(created.status).toBe(201);
    return Number(created.body.data?.id);
  };
  const topicTot = await topic('tot', 'T01', 'Làm quen bàn cờ');
  const s1 = await skill(topicTot, 'T01-01', 'Nhận biết ô cờ');
  const s2 = await skill(topicTot, 'T01-02', 'Cách đi của tốt');
  const s3 = await skill(topicTot, 'T01-03', 'Cách đi của vua');
  const hidden = await skill(topicTot, 'T01-99', 'Kỹ năng đã ẩn');
  expect(
    (
      await call(admin, '/chuongTrinh/kyNang/luu', {
        id: hidden,
        trangThai: 'an',
      })
    ).status,
  ).toBe(200);
  const topicMa = await topic('ma', 'M01', 'Cách đi của mã');
  const m1 = await skill(topicMa, 'M01-01', 'Nước đi hình chữ L');
  return {
    admin,
    hlvA,
    hlvB,
    managerA,
    keToan,
    ids: { ...ids, hocVienA2, hocVienA3 },
    skills: { s1, s2, s3, hidden, m1 },
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** A test of level "tot" for class A: three skills with top marks 10, 10 and 5, pass mark 70%. */
const body = (s: Setup, extra: Record<string, unknown> = {}) => ({
  ten: 'Kiểm tra lên cấp Tốt',
  loai: 'len_cap',
  levelKey: 'tot',
  lopId: s.ids.lopA,
  ngay: '2026-11-18',
  diemDat: 70,
  kyNang: [
    { kyNangId: s.skills.s1, diemToiDa: 10 },
    { kyNangId: s.skills.s2, diemToiDa: 10 },
    { kyNangId: s.skills.s3, diemToiDa: 5 },
  ],
  ...extra,
});

async function makeTest(
  s: Setup,
  session: Session = s.admin,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const created = await call(session, '/kiemTra/luu', body(s, extra));
  expect(`${created.status} ${created.body.error?.reason ?? ''}`).toBe('201 ');
  return Number(created.body.data?.id);
}

const enter = (
  session: Session,
  id: number,
  o: { hocVienId: number; kyNangId: number; diem: number | null }[],
) => call(session, '/kiemTra/nhapDiem', { id, o });

/** The states of one student, skill id → { mucDo, nguon }. */
async function states(
  connection: Parameters<typeof seedSchool>[0],
  hocVienId: number,
) {
  const rows = (await connection.query
    .selectFrom('eduHocVienKyNang')
    .select(['kyNangId', 'mucDo', 'nguon'])
    .where('hocVienId', '=', hocVienId)
    .execute()) as { kyNangId: number; mucDo: string; nguon: string }[];
  return new Map(
    rows.map((r) => [Number(r.kyNangId), { mucDo: r.mucDo, nguon: r.nguon }]),
  );
}

test('every route answers 401 without a session and 403 to a role without edu.kiemTra', async ({
  request,
  testApp,
  connection,
}) => {
  const s = await setup(testApp, connection);
  const all: [string, unknown][] = [
    ['/kiemTra/danhSach', {}],
    ['/kiemTra/chiTiet', { id: 1 }],
    ['/kiemTra/luu', body(s)],
    [
      '/kiemTra/nhapDiem',
      { id: 1, o: [{ hocVienId: 1, kyNangId: 1, diem: 1 }] },
    ],
    ['/kiemTra/chot', { id: 1 }],
    ['/kiemTra/hocVien', { hocVienId: 1 }],
  ];
  for (const [path, payload] of all) {
    expect(`${path} ${(await anonymous(request, path, payload)).status}`).toBe(
      `${path} 401`,
    );
    // The accountant holds neither the page nor the composite.
    expect(
      `${path} ${(await post(s.keToan.session, path, payload)).status}`,
    ).toBe(`${path} 403`);
  }
});

test('a test is made for a class in scope, with skills of its level, and is listed', async ({
  testApp,
  connection,
}) => {
  const s = await setup(testApp, connection);
  const id = await makeTest(s);

  const detail = await call(s.admin, '/kiemTra/chiTiet', { id });
  expect(detail.status).toBe(200);
  expect(detail.body.data).toMatchObject({
    bai: {
      id,
      ten: 'Kiểm tra lên cấp Tốt',
      loai: 'len_cap',
      levelKey: 'tot',
      lopId: s.ids.lopA,
      coSoId: s.ids.coSoA,
      diemDat: 70,
      trangThai: 'nhap',
    },
    coTheSua: true,
  });
  expect(detail.body.data?.kyNang).toHaveLength(3);
  // Only the active students of the class: A, A2, A3.
  expect(detail.body.data?.hocVien).toHaveLength(3);

  const list = await call(s.admin, '/kiemTra/danhSach', {
    trang: 1,
    limit: 25,
  });
  expect(list.body.data).toMatchObject({ tong: 1, limit: 25 });
  expect(list.body.data?.danhSach[0]).toMatchObject({
    id,
    soKyNang: 3,
    soHocVien: 0,
  });
  const filtered = await call(s.admin, '/kiemTra/danhSach', {
    trangThai: 'da_chot',
  });
  expect(filtered.body.data?.tong).toBe(0);
  const byName = await call(s.admin, '/kiemTra/danhSach', { tim: 'lên cấp' });
  expect(byName.body.data?.tong).toBe(1);
});

test('the values of a test are checked: name, class, skills and their level', async ({
  testApp,
  connection,
}) => {
  const s = await setup(testApp, connection);
  const reason = async (extra: Record<string, unknown>) => {
    const result = await call(s.admin, '/kiemTra/luu', body(s, extra));
    return `${result.status} ${result.body.error?.reason ?? ''}`;
  };
  expect(await reason({ ten: '   ' })).toBe('400 EDU_NAME_INVALID');
  expect(await reason({ lopId: 999999 })).toBe('404 EDU_CLASS_NOT_FOUND');
  // A skill of level "ma" in a test of level "tot".
  expect(
    await reason({ kyNang: [{ kyNangId: s.skills.m1, diemToiDa: 10 }] }),
  ).toBe('400 EDU_SKILL_WRONG_LEVEL');
  // A hidden skill.
  expect(
    await reason({ kyNang: [{ kyNangId: s.skills.hidden, diemToiDa: 10 }] }),
  ).toBe('400 EDU_SKILL_HIDDEN');
  expect(await reason({ kyNang: [{ kyNangId: 987654, diemToiDa: 10 }] })).toBe(
    '404 EDU_SKILL_NOT_FOUND',
  );
  expect(
    await reason({
      kyNang: [
        { kyNangId: s.skills.s1, diemToiDa: 10 },
        { kyNangId: s.skills.s1, diemToiDa: 5 },
      ],
    }),
  ).toBe('400 EDU_DUPLICATE_SKILL');
  // The shape of the input: no skill, a pass mark of 0 or 101, a top mark of 0.
  expect(
    (await call(s.admin, '/kiemTra/luu', body(s, { kyNang: [] }))).status,
  ).toBe(400);
  expect(await reason({ diemDat: 0 })).toMatch(/^400/u);
  expect(await reason({ diemDat: 101 })).toMatch(/^400/u);
  expect(
    await reason({ kyNang: [{ kyNangId: s.skills.s1, diemToiDa: 0 }] }),
  ).toMatch(/^400/u);
  expect(await reason({ levelKey: 'khong-co' })).toMatch(/^400/u);
});

test('a coach, a branch manager: only the tests of their own classes and branch', async ({
  testApp,
  connection,
}) => {
  const s = await setup(testApp, connection);
  // A coach makes a test for their own class; for the other branch's class the class is "not found".
  const mine = await makeTest(s, s.hlvA.session);
  const foreign = await call(
    s.hlvA.session,
    '/kiemTra/luu',
    body(s, { lopId: s.ids.lopB }),
  );
  expect(foreign.status).toBe(404);
  expect(foreign.body.error?.reason).toBe('EDU_CLASS_NOT_FOUND');
  // The other coach and the other branch's class: nothing of it is visible or writable.
  const other = await makeTest(s, s.hlvB.session, { lopId: s.ids.lopB });
  const seesOnlyOwn = async (session: Session, own: number, not: number) => {
    const list = await call(session, '/kiemTra/danhSach', {});
    expect(list.body.data?.danhSach.map((t: { id: number }) => t.id)).toEqual([
      own,
    ]);
    for (const [path, payload] of [
      ['/kiemTra/chiTiet', { id: not }],
      ['/kiemTra/chot', { id: not }],
      [
        '/kiemTra/nhapDiem',
        {
          id: not,
          o: [{ hocVienId: s.ids.hocVienA, kyNangId: s.skills.s1, diem: 1 }],
        },
      ],
      ['/kiemTra/luu', body(s, { id: not })],
    ] as const) {
      const result = await call(session, path, payload);
      expect(`${path} ${result.status}`).toBe(`${path} 404`);
    }
  };
  await seesOnlyOwn(s.hlvA.session, mine, other);
  await seesOnlyOwn(s.hlvB.session, other, mine);
  // The branch manager of A sees branch A's test, not branch B's.
  await seesOnlyOwn(s.managerA.session, mine, other);
  // The administrator sees both.
  const all = await call(s.admin, '/kiemTra/danhSach', {});
  expect(all.body.data?.tong).toBe(2);
  // A student of class B is invisible to coach A, and not of class A for the administrator.
  const entry = await enter(s.hlvA.session, mine, [
    { hocVienId: s.ids.hocVienB, kyNangId: s.skills.s1, diem: 5 },
  ]);
  expect(`${entry.status} ${entry.body.error?.reason}`).toBe(
    '404 EDU_STUDENT_NOT_FOUND',
  );
  const wrongClass = await enter(s.admin, mine, [
    { hocVienId: s.ids.hocVienB, kyNangId: s.skills.s1, diem: 5 },
  ]);
  expect(`${wrongClass.status} ${wrongClass.body.error?.reason}`).toBe(
    '400 EDU_STUDENT_NOT_IN_CLASS',
  );
  expect(
    (
      await connection.query
        .selectFrom('eduKetQuaKiemTra')
        .select('id')
        .execute()
    ).length,
  ).toBe(0);
});

test('marks: range, skill of the test, clearing; the test changes only while it has none', async ({
  testApp,
  connection,
}) => {
  const s = await setup(testApp, connection);
  const id = await makeTest(s, s.hlvA.session);
  const a = s.ids.hocVienA;
  const reason = async (
    o: { hocVienId: number; kyNangId: number; diem: number | null }[],
  ) => {
    const r = await enter(s.hlvA.session, id, o);
    return `${r.status} ${r.body.error?.reason ?? ''}`;
  };
  // Above the top mark (the third skill is out of 5), a negative or fractional mark, a skill the test does not cover.
  expect(await reason([{ hocVienId: a, kyNangId: s.skills.s3, diem: 6 }])).toBe(
    '400 EDU_SCORE_OUT_OF_RANGE',
  );
  expect(
    await reason([{ hocVienId: a, kyNangId: s.skills.s1, diem: -1 }]),
  ).toMatch(/^400/u);
  expect(
    await reason([{ hocVienId: a, kyNangId: s.skills.s1, diem: 2.5 }]),
  ).toMatch(/^400/u);
  expect(await reason([{ hocVienId: a, kyNangId: s.skills.m1, diem: 1 }])).toBe(
    '400 EDU_SKILL_NOT_IN_TEST',
  );
  expect(
    await reason([
      { hocVienId: a, kyNangId: s.skills.s1, diem: 1 },
      { hocVienId: a, kyNangId: s.skills.s1, diem: 2 },
    ]),
  ).toBe('400 EDU_DUPLICATE_CELL');
  expect(
    await reason([{ hocVienId: 987654, kyNangId: s.skills.s1, diem: 1 }]),
  ).toBe('404 EDU_STUDENT_NOT_FOUND');
  // Nothing was written by the refused requests.
  expect(
    (
      await connection.query
        .selectFrom('eduKetQuaKiemTra')
        .select('id')
        .execute()
    ).length,
  ).toBe(0);

  // Written, changed and cleared.
  const first = await enter(s.hlvA.session, id, [
    { hocVienId: a, kyNangId: s.skills.s1, diem: 8 },
    { hocVienId: a, kyNangId: s.skills.s2, diem: 0 },
  ]);
  expect(first.body.data).toMatchObject({ capNhat: 2, xoa: 0 });
  // The same mark again writes nothing; a new one changes the row, it does not add one.
  const again = await enter(s.hlvA.session, id, [
    { hocVienId: a, kyNangId: s.skills.s1, diem: 8 },
    { hocVienId: a, kyNangId: s.skills.s2, diem: 4 },
  ]);
  expect(again.body.data).toMatchObject({ capNhat: 1, xoa: 0 });
  expect(
    (
      await connection.query
        .selectFrom('eduKetQuaKiemTra')
        .select('id')
        .execute()
    ).length,
  ).toBe(2);

  // With a mark the test cannot be changed.
  const edit = await call(s.hlvA.session, '/kiemTra/luu', body(s, { id }));
  expect(`${edit.status} ${edit.body.error?.reason}`).toBe(
    '400 EDU_TEST_HAS_RESULTS',
  );
  const detail = await call(s.hlvA.session, '/kiemTra/chiTiet', { id });
  expect(detail.body.data?.coTheSua).toBe(false);

  // Clear every mark and it can be edited again (a new name and a lower pass mark).
  const cleared = await enter(s.hlvA.session, id, [
    { hocVienId: a, kyNangId: s.skills.s1, diem: null },
    { hocVienId: a, kyNangId: s.skills.s2, diem: null },
  ]);
  expect(cleared.body.data).toMatchObject({ capNhat: 0, xoa: 2 });
  const renamed = await call(
    s.hlvA.session,
    '/kiemTra/luu',
    body(s, { id, ten: 'Kiểm tra Tốt (sửa)', diemDat: 60 }),
  );
  expect(renamed.status).toBe(200);
  const after = await call(s.hlvA.session, '/kiemTra/chiTiet', { id });
  expect(after.body.data?.bai).toMatchObject({
    ten: 'Kiểm tra Tốt (sửa)',
    diemDat: 60,
  });
});

test('closing a test updates what the students know, lists who may move up, and moves nobody', async ({
  testApp,
  connection,
}) => {
  const s = await setup(testApp, connection);
  const id = await makeTest(s, s.hlvA.session);
  const { hocVienA: a, hocVienA2: a2, hocVienA3: a3 } = s.ids;

  // Closing a test with no mark is refused.
  const empty = await call(s.hlvA.session, '/kiemTra/chot', { id });
  expect(`${empty.status} ${empty.body.error?.reason}`).toBe(
    '400 EDU_TEST_NO_RESULTS',
  );

  // A: 10/10, 9/10, 4/5 = 23/25 = 92%: passes; skills: 100% solid, 90% solid, 80% passed.
  // A2 (already at level "ma"): 10, 10, 5: passes, but is not at the tested level.
  // A3: 5/10, 8/10, nothing on the third = 13/25 = 52%: fails; 50% weak, 80% passed, third skill untouched.
  // HS-A has an old hand-graded state on skill 1 that the test replaces.
  await connection.query
    .insertInto('eduHocVienKyNang')
    .values({
      hocVienId: a,
      kyNangId: s.skills.s1,
      mucDo: 'chua_vung',
      nguon: 'cham_tay',
      capNhatLuc: new Date('2026-11-01T00:00:00.000Z'),
    })
    .execute();
  const marks = await enter(s.hlvA.session, id, [
    { hocVienId: a, kyNangId: s.skills.s1, diem: 10 },
    { hocVienId: a, kyNangId: s.skills.s2, diem: 9 },
    { hocVienId: a, kyNangId: s.skills.s3, diem: 4 },
    { hocVienId: a2, kyNangId: s.skills.s1, diem: 10 },
    { hocVienId: a2, kyNangId: s.skills.s2, diem: 10 },
    { hocVienId: a2, kyNangId: s.skills.s3, diem: 5 },
    { hocVienId: a3, kyNangId: s.skills.s1, diem: 5 },
    { hocVienId: a3, kyNangId: s.skills.s2, diem: 8 },
  ]);
  expect(marks.body.data).toMatchObject({ capNhat: 8 });

  // Before closing, nothing of the knowledge has moved and nobody is eligible yet.
  expect((await states(connection, a3)).size).toBe(0);
  const preview = await call(s.hlvA.session, '/kiemTra/chiTiet', { id });
  const row = (hocVienId: number) =>
    preview.body.data?.tongHop.find(
      (r: { hocVienId: number }) => r.hocVienId === hocVienId,
    );
  expect(row(a)).toMatchObject({
    diem: 23,
    toiDa: 25,
    phanTram: 92,
    dat: true,
  });
  expect(row(a)?.denLevelKey).toBeNull();
  expect(row(a3)).toMatchObject({
    diem: 13,
    phanTram: 52,
    dat: false,
    thieu: 1,
  });

  const closed = await call(s.hlvA.session, '/kiemTra/chot', { id });
  expect(`${closed.status} ${closed.body.error?.reason ?? ''}`).toBe('200 ');
  expect(closed.body.data).toMatchObject({
    id,
    trangThai: 'da_chot',
    daKiemTra: 3,
    dat: 2,
    boQua: 0,
  });
  // Only A is eligible: A2 passed but is already at "ma", A3 failed. The target is the level after "tot".
  expect(closed.body.data?.lenCap).toEqual([
    { hocVienId: a, phanTram: 92, denLevelKey: 'ma' },
  ]);

  const stateA = await states(connection, a);
  expect(stateA.get(s.skills.s1)).toEqual({ mucDo: 'vung', nguon: 'kiem_tra' });
  expect(stateA.get(s.skills.s2)).toEqual({ mucDo: 'vung', nguon: 'kiem_tra' });
  expect(stateA.get(s.skills.s3)).toEqual({ mucDo: 'dat', nguon: 'kiem_tra' });
  const stateA3 = await states(connection, a3);
  expect(stateA3.get(s.skills.s1)).toEqual({
    mucDo: 'chua_vung',
    nguon: 'kiem_tra',
  });
  expect(stateA3.get(s.skills.s2)).toEqual({ mucDo: 'dat', nguon: 'kiem_tra' });
  // A skill with no mark is left alone.
  expect(stateA3.has(s.skills.s3)).toBe(false);
  // The old hand grade was replaced, not duplicated.
  expect(
    (
      await connection.query
        .selectFrom('eduHocVienKyNang')
        .select('id')
        .where('hocVienId', '=', a)
        .where('kyNangId', '=', s.skills.s1)
        .execute()
    ).length,
  ).toBe(1);

  // Nobody moved up on their own.
  const levels = (await connection.query
    .selectFrom('eduHocVien')
    .select(['id', 'levelKey'])
    .execute()) as { id: number; levelKey: string }[];
  expect(
    Object.fromEntries(levels.map((l) => [Number(l.id), l.levelKey])),
  ).toMatchObject({ [a]: 'tot', [a2]: 'ma', [a3]: 'tot' });
  expect(
    (
      await connection.query
        .selectFrom('eduHocVienLenCap')
        .select('id')
        .execute()
    ).length,
  ).toBe(0);

  // The closed test: the eligible label is on the detail and the list shows it closed.
  const detail = await call(s.hlvA.session, '/kiemTra/chiTiet', { id });
  expect(detail.body.data?.bai.trangThai).toBe('da_chot');
  expect(detail.body.data?.coTheSua).toBe(false);
  const eligible = detail.body.data?.tongHop.filter(
    (r: { denLevelKey: string | null }) => r.denLevelKey !== null,
  );
  expect(eligible.map((r: { hocVienId: number }) => r.hocVienId)).toEqual([a]);

  // A closed test takes no more marks, no edit and no second closing.
  for (const [path, payload] of [
    [
      '/kiemTra/nhapDiem',
      { id, o: [{ hocVienId: a3, kyNangId: s.skills.s3, diem: 5 }] },
    ],
    ['/kiemTra/luu', body(s, { id })],
    ['/kiemTra/chot', { id }],
  ] as const) {
    const result = await call(s.hlvA.session, path, payload);
    expect(`${path} ${result.status} ${result.body.error?.reason}`).toBe(
      `${path} 400 EDU_TEST_CLOSED`,
    );
  }

  // The coach confirms the move with the action that already exists; after it the student is no longer listed.
  const up = await call(s.hlvA.session, '/hocVien/lenCap', {
    hocVienId: a,
    denLevelKey: 'ma',
  });
  expect(up.status).toBe(201);
  const afterUp = await call(s.hlvA.session, '/kiemTra/chiTiet', { id });
  const rowA = afterUp.body.data?.tongHop.find(
    (r: { hocVienId: number }) => r.hocVienId === a,
  );
  expect(rowA).toMatchObject({ dat: true, denLevelKey: null, daLenCap: true });
});

test('a periodic test never lists anybody as eligible; the last level has nowhere to go', async ({
  testApp,
  connection,
}) => {
  const s = await setup(testApp, connection);
  const id = await makeTest(s, s.admin, { loai: 'dinh_ky' });
  await enter(s.admin, id, [
    { hocVienId: s.ids.hocVienA, kyNangId: s.skills.s1, diem: 10 },
    { hocVienId: s.ids.hocVienA, kyNangId: s.skills.s2, diem: 10 },
    { hocVienId: s.ids.hocVienA, kyNangId: s.skills.s3, diem: 5 },
  ]);
  const closed = await call(s.admin, '/kiemTra/chot', { id });
  expect(closed.body.data).toMatchObject({ dat: 1, lenCap: [] });
});

test('the closed tests of one student, for the student file', async ({
  testApp,
  connection,
}) => {
  const s = await setup(testApp, connection);
  const closedId = await makeTest(s, s.hlvA.session);
  const draftId = await makeTest(s, s.hlvA.session, { ten: 'Bài nháp' });
  for (const id of [closedId, draftId])
    await enter(s.hlvA.session, id, [
      { hocVienId: s.ids.hocVienA, kyNangId: s.skills.s1, diem: 7 },
      { hocVienId: s.ids.hocVienA, kyNangId: s.skills.s2, diem: 3 },
    ]);
  await call(s.hlvA.session, '/kiemTra/chot', { id: closedId });

  const mine = await call(s.hlvA.session, '/kiemTra/hocVien', {
    hocVienId: s.ids.hocVienA,
  });
  expect(mine.status).toBe(200);
  // Only the closed test, with each skill's mark and the state it earned (7/10 = 70% reaches the 70% pass mark).
  expect(mine.body.data?.baiKiemTra).toHaveLength(1);
  const [result] = mine.body.data?.baiKiemTra as Record<string, any>[];
  expect(result).toMatchObject({
    id: closedId,
    diem: 10,
    toiDa: 25,
    phanTram: 40,
    dat: false,
  });
  expect(
    result.kyNang.map((k: { diem: number; mucDo: string }) => [
      k.diem,
      k.mucDo,
    ]),
  ).toEqual([
    [7, 'dat'],
    [3, 'chua_vung'],
  ]);
  // The knowledge tab (edu.kienThuc) is a different action: the coach of another class cannot read this student.
  const foreign = await call(s.hlvB.session, '/kiemTra/hocVien', {
    hocVienId: s.ids.hocVienA,
  });
  expect(`${foreign.status} ${foreign.body.error?.reason}`).toBe(
    '404 EDU_STUDENT_NOT_FOUND',
  );
  // A student with no test has an empty list.
  const none = await call(s.hlvA.session, '/kiemTra/hocVien', {
    hocVienId: s.ids.hocVienA3,
  });
  expect(none.body.data?.baiKiemTra).toEqual([]);
});

test('a coach cannot confirm a level for a student of another class, and an account without levelUp cannot at all', async ({
  testApp,
  connection,
}) => {
  const s = await setup(testApp, connection);
  // The coach of branch A: a student of branch B's class is "not found" for the existing level-up action too.
  const foreign = await call(s.hlvA.session, '/hocVien/lenCap', {
    hocVienId: s.ids.hocVienB,
    denLevelKey: 'ma',
  });
  expect(foreign.status).toBe(404);
  // The accountant holds no `edu.hocVien` `levelUp` and no `edu.kiemTra`.
  const accountant = await call(s.keToan.session, '/hocVien/lenCap', {
    hocVienId: s.ids.hocVienA,
    denLevelKey: 'ma',
  });
  expect(accountant.status).toBe(403);
  // Nobody changed level.
  const row = (await connection.query
    .selectFrom('eduHocVien')
    .select('levelKey')
    .where('id', '=', s.ids.hocVienA)
    .executeTakeFirstOrThrow()) as { levelKey: string };
  expect(row.levelKey).toBe('tot');
});
