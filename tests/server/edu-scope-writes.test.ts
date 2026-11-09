import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

async function setup(testApp: any, connection: any) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'quanly-a',
    'edu_quan_ly_co_so',
  );
  await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  // A made-up parent of the student of branch B.
  await connection.query
    .insertInto('eduPhuHuynh')
    .values({
      id: 1,
      ma: 'PH-B',
      hoTen: 'Phụ huynh Mẫu B',
      soDienThoai: '0900000002',
    })
    .execute();
  await connection.query
    .insertInto('eduHocVienPhuHuynh')
    .values({ hocVienId: 2, phuHuynhId: 1, quanHe: 'me', lienHeChinh: true })
    .execute();
  return { admin, hlvA, hlvB, managerA };
}

test('a branch manager cannot create branches or records in another branch', async ({
  testApp,
  connection,
}) => {
  const { admin, managerA } = await setup(testApp, connection);

  const newBranch = await post(managerA.session, '/coSo/createOne', {
    values: { ma: 'CS-X', ten: 'Cơ sở Mẫu X' },
  });
  expect(newBranch.status).toBe(403);
  expect([403, 404]).toContain(
    (await post(managerA.session, '/coSo/deleteOne', { filter: { id: 1 } }))
      .status,
  );

  const foreignClass = await post(managerA.session, '/lop/createOne', {
    values: {
      ma: 'L-X',
      ten: 'Lớp Mẫu X',
      coSoId: 2,
      levelKey: 'tot',
      levelOrder: 1,
    },
  });
  expect(foreignClass.status).toBe(403);
  const ownClass = await post(managerA.session, '/lop/createOne', {
    values: {
      ma: 'L-A2',
      ten: 'Lớp Mẫu A2',
      coSoId: 1,
      levelKey: 'tot',
      levelOrder: 1,
    },
  });
  expect(ownClass.status).toBe(200);

  const foreignSlot = await post(managerA.session, '/lopLich/createOne', {
    values: { lopId: 2, thu: 2, gioBatDau: '17:30', gioKetThuc: '19:00' },
  });
  expect(foreignSlot.status).toBe(403);
  const ownSlot = await post(managerA.session, '/lopLich/createOne', {
    values: { lopId: 1, thu: 2, gioBatDau: '17:30', gioKetThuc: '19:00' },
  });
  expect(ownSlot.status).not.toBe(403);

  // The administrator can still create a branch.
  const adminBranch = await post(admin, '/coSo/createOne', {
    values: { ma: 'CS-Y', ten: 'Cơ sở Mẫu Y' },
  });
  expect(adminBranch.status).toBe(200);
});

test('a branch manager cannot reach the parents of another branch', async ({
  testApp,
  connection,
}) => {
  const { managerA } = await setup(testApp, connection);

  // Linking an arbitrary parent through the standard route is not offered.
  const link = await post(managerA.session, '/lienKet/createOne', {
    values: { hocVienId: 1, phuHuynhId: 1, quanHe: 'me', lienHeChinh: false },
  });
  expect([403, 404]).toContain(link.status);

  // A phone number that belongs to a parent outside the scope creates a separate record.
  const created = await post(managerA.session, '/phuHuynh/taoMoi', {
    hocVienId: 1,
    hoTen: 'Phụ huynh Mẫu A',
    soDienThoai: '0900000002',
    quanHe: 'bo',
  });
  expect(created.status).toBe(201);
  const body = (await created.json()) as { data: { id: number; ma: string } };
  expect(body.data.id).not.toBe(1);
  expect(body.data.ma).not.toBe('PH-B');

  const visible = await post(managerA.session, '/phuHuynh/findMany', {});
  const names = (
    (await visible.json()) as { data: { hoTen: string }[] }
  ).data.map((r) => r.hoTen);
  expect(names).toEqual(['Phụ huynh Mẫu A']);
});

test('a student cannot be moved to a class outside the caller scope', async ({
  testApp,
  connection,
}) => {
  const { hlvB, managerA } = await setup(testApp, connection);

  const direct = await post(managerA.session, '/hocVien/updateOne', {
    filter: { id: 1 },
    values: { lopId: 2 },
  });
  expect(direct.status).toBeGreaterThanOrEqual(400);
  expect(direct.status).toBeLessThan(500);

  const moved = await post(managerA.session, '/hocVien/chuyenLop', {
    id: 1,
    lopId: 2,
  });
  expect(moved.status).toBe(403);

  const coachB = await post(hlvB.session, '/hocVien/findMany', {});
  expect(
    ((await coachB.json()) as { data: { ma: string }[] }).data.map((r) => r.ma),
  ).toEqual(['HS-B']);

  const [row] = await connection.query
    .selectFrom('eduHocVien')
    .select('lopId')
    .where('id', '=', 1)
    .execute();
  expect(Number(row.lopId)).toBe(1);
});

test('two level-up confirmations at once write one history row', async ({
  testApp,
  connection,
}) => {
  const { managerA } = await setup(testApp, connection);
  const confirm = () =>
    post(managerA.session, '/hocVien/lenCap', {
      hocVienId: 1,
      denLevelKey: 'ma',
    });
  const results = await Promise.all([confirm(), confirm()]);
  expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  const history = await connection.query
    .selectFrom('eduHocVienLenCap')
    .select('id')
    .where('hocVienId', '=', 1)
    .execute();
  expect(history).toHaveLength(1);
});
