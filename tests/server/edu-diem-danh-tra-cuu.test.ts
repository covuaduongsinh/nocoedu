import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

/** Attendance register: `POST /diemDanh/traCuu` and `POST /diemDanh/giaoVien` (DS-62 phase 2). */
type Register = {
  data: Record<string, unknown>[];
  meta: {
    count: number;
    tongHop: Record<string, number>;
  };
};

async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Parameters<typeof seedSchool>[0],
) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'tc-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'tc-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'tc-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'tc-kt', 'edu_ke_toan');
  const apiDoc = await userWithRole(testApp, admin, 'tc-api', 'edu_api_doc');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
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
  const hocVienA2 = Number(
    (
      await q
        .selectFrom('eduHocVien')
        .select('id')
        .where('ma', '=', 'HS-A2')
        .executeTakeFirstOrThrow()
    ).id,
  );
  const session = async (
    lopId: number,
    ngay: string,
    hlvId: string | null,
    trangThai = 'da_diem_danh',
  ) => {
    await q
      .insertInto('eduBuoiHoc')
      .values({
        lopId,
        ngay,
        gioBatDau: '17:30',
        gioKetThuc: '19:00',
        hlvId,
        trangThai,
      })
      .execute();
    return Number(
      (
        await q
          .selectFrom('eduBuoiHoc')
          .select('id')
          .where('lopId', '=', lopId)
          .where('ngay', '=', ngay)
          .executeTakeFirstOrThrow()
      ).id,
    );
  };
  // Class A: three sessions, the last taught by another coach (a substitute). Class B: two sessions.
  const a1 = await session(ids.lopA, '2026-11-02', hlvA.id);
  const a2 = await session(ids.lopA, '2026-11-09', hlvA.id);
  const a3 = await session(ids.lopA, '2026-11-16', hlvB.id, 'du_kien');
  const b1 = await session(ids.lopB, '2026-11-02', hlvB.id);
  const b2 = await session(ids.lopB, '2026-11-09', hlvB.id);
  const mark = (buoiHocId: number, hocVienId: number, trangThai: string) =>
    q
      .insertInto('eduDiemDanh')
      .values({ buoiHocId, hocVienId, trangThai })
      .execute();
  await mark(a1, ids.hocVienA, 'co_mat');
  await mark(a1, hocVienA2, 'vang_co_phep');
  await mark(a2, ids.hocVienA, 'vang_khong_phep');
  await mark(a2, hocVienA2, 'hoc_bu');
  await mark(b1, ids.hocVienB, 'co_mat');
  await mark(b2, ids.hocVienB, 'co_mat');
  return {
    admin,
    hlvA,
    hlvB,
    managerA,
    keToan,
    apiDoc,
    ids,
    hocVienA2,
    sessions: { a1, a2, a3, b1, b2 },
  };
}

const range = { tuNgay: '2026-11-01', denNgay: '2026-11-30' };

async function look(
  session: Parameters<typeof post>[0],
  body: Record<string, unknown>,
) {
  const response = await post(session, '/diemDanh/traCuu', {
    ...range,
    cheDo: 'buoi',
    ...body,
  });
  return { status: response.status, body: (await response.json()) as Register };
}

const sessionIds = (result: { body: Register }) =>
  result.body.data.map((row) => Number(row.buoiHocId)).sort((a, b) => a - b);

test('both routes answer 401 without a session and 403 to an account without attendance', async ({
  request,
  testApp,
  connection,
}) => {
  const { apiDoc } = await setup(testApp, connection);
  for (const path of ['/diemDanh/traCuu', '/diemDanh/giaoVien']) {
    const anonymous = await request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ ...range, cheDo: 'buoi' }),
    });
    expect(`${path} ${anonymous.status}`).toBe(`${path} 401`);
    const denied = await post(apiDoc.session, path, {
      ...range,
      cheDo: 'buoi',
    });
    expect(`${path} ${denied.status}`).toBe(`${path} 403`);
  }
});

test('the period must be real, ordered and at most 366 days; the mode must be known', async ({
  testApp,
  connection,
}) => {
  const { admin } = await setup(testApp, connection);
  const bad = [
    { tuNgay: '2026-11-10', denNgay: '2026-11-01' },
    { tuNgay: '2026-02-30', denNgay: '2026-03-01' },
    { tuNgay: '2026-13-01', denNgay: '2026-13-02' },
    { tuNgay: '2025-10-31', denNgay: '2026-11-01' },
    { tuNgay: '2026-11-01', denNgay: 'hôm nay' },
    { cheDo: 'tuyChon' },
    { limit: 101 },
    { limit: 0 },
    { offset: -1 },
    { trangThai: 'di_muon' },
    { lopId: 'abc' },
  ];
  for (const patch of bad) {
    expect(
      `${JSON.stringify(patch)} ${(await look(admin, patch)).status}`,
    ).toBe(`${JSON.stringify(patch)} 400`);
  }
  // 366 days (both ends counted) is the longest accepted.
  expect(
    (await look(admin, { tuNgay: '2025-11-01', denNgay: '2026-11-01' })).status,
  ).toBe(200);
  expect(
    (await look(admin, { tuNgay: '2024-01-01', denNgay: '2024-12-31' })).status,
  ).toBe(200);
});

test('by session: every filter narrows the list and the counts follow it', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB, ids, hocVienA2, sessions } = await setup(
    testApp,
    connection,
  );
  const { a1, a2, a3, b1, b2 } = sessions;

  const all = await look(admin, {});
  expect(all.status).toBe(200);
  expect(sessionIds(all)).toEqual([a1, a2, a3, b1, b2]);
  expect(all.body.meta.count).toBe(5);
  // Newest day first; the same day by start time then id.
  expect(all.body.data.map((row) => row.ngay)).toEqual([
    '2026-11-16',
    '2026-11-09',
    '2026-11-09',
    '2026-11-02',
    '2026-11-02',
  ]);
  expect(all.body.meta.tongHop).toMatchObject({
    soCa: 5,
    soLuot: 6,
    coMat: 3,
    vangCoPhep: 1,
    vangKhongPhep: 1,
    hocBu: 1,
    tyLe: 67,
  });
  const first = all.body.data.find((row) => row.buoiHocId === a1);
  expect(first).toMatchObject({
    lopId: ids.lopA,
    ngay: '2026-11-02',
    gioBatDau: '17:30',
    hlvId: hlvA.id,
    trangThai: 'da_diem_danh',
    coMat: 1,
    vangCoPhep: 1,
    tong: 2,
  });

  // Dates: both ends are inside the period.
  expect(
    sessionIds(
      await look(admin, { tuNgay: '2026-11-09', denNgay: '2026-11-09' }),
    ),
  ).toEqual([a2, b2]);
  expect(
    sessionIds(
      await look(admin, { tuNgay: '2026-11-03', denNgay: '2026-11-15' }),
    ),
  ).toEqual([a2, b2]);
  expect(
    (await look(admin, { tuNgay: '2026-12-01', denNgay: '2026-12-31' })).body
      .meta.count,
  ).toBe(0);

  // Branch, class, teacher (the teacher of the session, not of the class).
  expect(sessionIds(await look(admin, { coSoId: ids.coSoA }))).toEqual([
    a1,
    a2,
    a3,
  ]);
  expect(sessionIds(await look(admin, { coSoId: ids.coSoB }))).toEqual([
    b1,
    b2,
  ]);
  expect(sessionIds(await look(admin, { lopId: ids.lopB }))).toEqual([b1, b2]);
  expect(
    (await look(admin, { coSoId: ids.coSoA, lopId: ids.lopB })).body.meta.count,
  ).toBe(0);
  expect(sessionIds(await look(admin, { hlvId: hlvA.id }))).toEqual([a1, a2]);
  expect(sessionIds(await look(admin, { hlvId: hlvB.id }))).toEqual([
    a3,
    b1,
    b2,
  ]);
  expect((await look(admin, { hlvId: 'khong-co' })).body.meta.count).toBe(0);

  // A student or a status keeps only the sessions with a matching mark, and counts only those marks.
  const byStudent = await look(admin, { hocVienId: ids.hocVienA });
  expect(sessionIds(byStudent)).toEqual([a1, a2]);
  expect(byStudent.body.meta.tongHop).toMatchObject({
    soCa: 2,
    soLuot: 2,
    coMat: 1,
    vangKhongPhep: 1,
  });
  expect(sessionIds(await look(admin, { hocVienId: hocVienA2 }))).toEqual([
    a1,
    a2,
  ]);
  const present = await look(admin, { trangThai: 'co_mat' });
  expect(sessionIds(present)).toEqual([a1, b1, b2]);
  expect(present.body.meta.tongHop).toMatchObject({
    soLuot: 3,
    coMat: 3,
    tyLe: 100,
  });
  expect(sessionIds(await look(admin, { trangThai: 'hoc_bu' }))).toEqual([a2]);
  expect(
    sessionIds(await look(admin, { trangThai: 'co_mat', coSoId: ids.coSoA })),
  ).toEqual([a1]);
  expect(
    (await look(admin, { hocVienId: ids.hocVienA, trangThai: 'hoc_bu' })).body
      .meta.count,
  ).toBe(0);

  // Pages: `count` is the total, `data` one page.
  const page = await look(admin, { limit: 2, offset: 2 });
  expect(page.body.meta.count).toBe(5);
  expect(page.body.data).toHaveLength(2);
  expect(
    (await look(admin, { limit: 2, offset: 4 })).body.data.map(
      (row) => row.ngay,
    ),
  ).toEqual(['2026-11-02']);
  expect((await look(admin, { limit: 2, offset: 6 })).body.data).toEqual([]);
});

test('by student: one row per student with the four counts and the rate', async ({
  testApp,
  connection,
}) => {
  const { admin, ids, hocVienA2 } = await setup(testApp, connection);
  const result = await look(admin, { cheDo: 'hocVien' });
  expect(result.status).toBe(200);
  expect(result.body.meta.count).toBe(3);
  const row = (id: number) => result.body.data.find((r) => r.hocVienId === id);
  expect(row(ids.hocVienA)).toMatchObject({
    ma: 'HS-A',
    hoTen: 'Học viên Mẫu A',
    lopId: ids.lopA,
    coMat: 1,
    vangKhongPhep: 1,
    tong: 2,
    tyLe: 50,
  });
  expect(row(hocVienA2)).toMatchObject({
    hoTen: 'Học viên Mẫu 01',
    vangCoPhep: 1,
    hocBu: 1,
    tong: 2,
    tyLe: 50,
  });
  expect(row(ids.hocVienB)).toMatchObject({ coMat: 2, tong: 2, tyLe: 100 });
  expect(result.body.meta.tongHop).toMatchObject({
    soCa: 5,
    soLuot: 6,
    soHocVien: 3,
  });

  const one = await look(admin, { cheDo: 'hocVien', hocVienId: ids.hocVienB });
  expect(one.body.data).toHaveLength(1);
  expect(one.body.meta.count).toBe(1);
  const absent = await look(admin, {
    cheDo: 'hocVien',
    trangThai: 'vang_khong_phep',
  });
  expect(absent.body.data.map((r) => r.hocVienId)).toEqual([ids.hocVienA]);
  expect(
    (await look(admin, { cheDo: 'hocVien', lopId: ids.lopB })).body.data.map(
      (r) => r.hocVienId,
    ),
  ).toEqual([ids.hocVienB]);
  const paged = await look(admin, { cheDo: 'hocVien', limit: 2, offset: 2 });
  expect(paged.body.data).toHaveLength(1);
  expect(paged.body.meta.count).toBe(3);
});

test('by teacher: sessions, sessions marked and marks per teacher, with names', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB } = await setup(testApp, connection);
  const result = await look(admin, { cheDo: 'giaoVien' });
  expect(result.status).toBe(200);
  expect(result.body.meta.count).toBe(2);
  const of = (id: string) => result.body.data.find((r) => r.hlvId === id);
  expect(of(hlvA.id)).toMatchObject({
    hlvTen: 'tc-hlv-a',
    soCa: 2,
    soCaDaDiemDanh: 2,
    soLuot: 4,
    coMat: 1,
    vangCoPhep: 1,
    vangKhongPhep: 1,
    hocBu: 1,
    tyLe: 50,
  });
  // The substitute session (not marked yet) counts for the coach who teaches it.
  expect(of(hlvB.id)).toMatchObject({
    hlvTen: 'tc-hlv-b',
    soCa: 3,
    soCaDaDiemDanh: 2,
    soLuot: 2,
    coMat: 2,
    tyLe: 100,
  });
  const one = await look(admin, { cheDo: 'giaoVien', hlvId: hlvA.id });
  expect(one.body.data.map((r) => r.hlvId)).toEqual([hlvA.id]);
  expect(
    (await look(admin, { cheDo: 'giaoVien', trangThai: 'hoc_bu' })).body.data,
  ).toMatchObject([{ hlvId: hlvA.id, soCa: 1, soLuot: 1, hocBu: 1 }]);
});

test('a coach sees only their own classes, a branch manager only their branch', async ({
  testApp,
  connection,
}) => {
  const { hlvA, hlvB, managerA, keToan, ids, sessions } = await setup(
    testApp,
    connection,
  );
  const { a1, a2, a3, b1, b2 } = sessions;

  expect(sessionIds(await look(hlvA.session, {}))).toEqual([a1, a2, a3]);
  expect(sessionIds(await look(hlvB.session, {}))).toEqual([b1, b2]);
  expect(sessionIds(await look(managerA.session, {}))).toEqual([a1, a2, a3]);
  expect(sessionIds(await look(keToan.session, {}))).toEqual([
    a1,
    a2,
    a3,
    b1,
    b2,
  ]);

  // Asking for another class, branch, teacher or student is not an error: it matches nothing.
  for (const patch of [
    { lopId: ids.lopB },
    { coSoId: ids.coSoB },
    { hocVienId: ids.hocVienB },
    { lopId: ids.lopB, coSoId: ids.coSoB, hocVienId: ids.hocVienB },
  ]) {
    const result = await look(hlvA.session, patch);
    expect([result.status, result.body.meta.count]).toEqual([200, 0]);
    expect(result.body.data).toEqual([]);
    expect((await look(managerA.session, patch)).body.meta.count).toBe(0);
  }
  // The coach of class B is not offered the substitute session of class A even when filtering by themselves.
  expect(sessionIds(await look(hlvB.session, { hlvId: hlvB.id }))).toEqual([
    b1,
    b2,
  ]);
  expect(sessionIds(await look(hlvA.session, { hlvId: hlvB.id }))).toEqual([
    a3,
  ]);

  // The student and the teacher views are scoped the same way.
  const students = await look(hlvA.session, { cheDo: 'hocVien' });
  expect(students.body.data.map((r) => r.hocVienId)).not.toContain(
    ids.hocVienB,
  );
  expect(students.body.meta.count).toBe(2);
  const teachers = await look(hlvA.session, { cheDo: 'giaoVien' });
  expect(teachers.body.data.map((r) => r.hlvId)).toEqual(
    expect.not.arrayContaining([undefined]),
  );
  expect(teachers.body.data.reduce((sum, r) => sum + Number(r.soCa), 0)).toBe(
    3,
  );
});

test('the teacher filter offers the teachers of the classes the caller sees', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB, managerA, keToan } = await setup(
    testApp,
    connection,
  );
  const list = async (session: Parameters<typeof post>[0]) =>
    (
      (await (await post(session, '/diemDanh/giaoVien', {})).json()) as {
        data: { id: string; ten: string }[];
      }
    ).data;
  expect(await list(admin)).toEqual([
    { id: hlvA.id, ten: 'tc-hlv-a' },
    { id: hlvB.id, ten: 'tc-hlv-b' },
  ]);
  expect(await list(keToan.session)).toHaveLength(2);
  expect(await list(hlvA.session)).toEqual([{ id: hlvA.id, ten: 'tc-hlv-a' }]);
  expect(await list(managerA.session)).toEqual([
    { id: hlvA.id, ten: 'tc-hlv-a' },
  ]);
});
