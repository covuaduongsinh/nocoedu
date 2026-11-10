import { expect } from 'vitest';

import {
  adminSession,
  idByMa,
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
  const accountant = await userWithRole(
    testApp,
    admin,
    'ke-toan',
    'edu_ke_toan',
  );
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  return { admin, hlvA, managerA, accountant, ids };
}

const update = (session: any, name: string, id: number, values: object) =>
  post(session, `/${name}/updateOne`, { filter: { id }, values });

test('editing a student, class or branch is limited by role and by branch', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, managerA, accountant, ids } = await setup(
    testApp,
    connection,
  );

  // A branch manager edits a student of their own branch, not one of another.
  expect(
    (
      await update(managerA.session, 'hocVien', ids.hocVienA, {
        hoTen: 'Học viên Mẫu Sửa',
      })
    ).status,
  ).toBe(200);
  expect(
    [403, 404].includes(
      (
        await update(managerA.session, 'hocVien', ids.hocVienB, {
          hoTen: 'Học viên Mẫu Sai',
        })
      ).status,
    ),
  ).toBe(true);
  const shown = await connection.query
    .selectFrom('eduHocVien')
    .select('hoTen')
    .where('id', '=', ids.hocVienB)
    .executeTakeFirstOrThrow();
  expect(shown.hoTen).not.toBe('Học viên Mẫu Sai');

  // A coach and an accountant cannot edit a student through the record API: a coach has only the note route.
  for (const session of [hlvA.session, accountant.session]) {
    expect(
      (
        await update(session, 'hocVien', ids.hocVienA, {
          hoTen: 'Học viên Mẫu Khác',
        })
      ).status,
    ).toBe(403);
    expect(
      (await update(session, 'lop', ids.lopA, { ten: 'Lớp Mẫu Khác' })).status,
    ).toBe(403);
    expect(
      (await update(session, 'coSo', ids.coSoA, { ten: 'Cơ sở Mẫu Khác' }))
        .status,
    ).toBe(403);
  }
  const note = await post(hlvA.session, '/hocVien/capNhatGhiChu', {
    id: ids.hocVienA,
    ghiChuHlv: 'Ghi chú mẫu',
  });
  expect(note.status).toBe(200);

  // A branch manager does not edit a branch, an administrator does; the external code cannot be set.
  expect(
    (
      await update(managerA.session, 'coSo', ids.coSoA, {
        ten: 'Cơ sở Mẫu Sửa',
      })
    ).status,
  ).toBe(403);
  expect(
    (await update(admin, 'coSo', ids.coSoA, { ten: 'Cơ sở Mẫu Sửa' })).status,
  ).toBe(200);
  expect(
    (await update(admin, 'hocVien', ids.hocVienA, { externalId: 'recX' }))
      .status,
  ).toBeGreaterThanOrEqual(400);

  // A manager cannot move a class of their branch into another branch, and cannot edit one of another branch.
  expect(
    (await update(managerA.session, 'lop', ids.lopA, { coSoId: ids.coSoB }))
      .status,
  ).toBe(403);
  expect(
    (await update(managerA.session, 'lop', ids.lopA, { ten: 'Lớp Mẫu Sửa' }))
      .status,
  ).toBe(200);
  expect(
    [403, 404].includes(
      (await update(managerA.session, 'lop', ids.lopB, { ten: 'Lớp Mẫu Sai' }))
        .status,
    ),
  ).toBe(true);
});

test('an edit with a value that is not valid is refused', async ({
  testApp,
  connection,
}) => {
  const { admin, ids } = await setup(testApp, connection);
  const refused = async (name: string, id: number, values: object) =>
    (await update(admin, name, id, values)).status;
  expect(await refused('hocVien', ids.hocVienA, { trangThai: 'xoa_roi' })).toBe(
    400,
  );
  expect(await refused('hocVien', ids.hocVienA, { namSinh: 1800 })).toBe(400);
  expect(await refused('hocVien', ids.hocVienA, { hoTen: '   ' })).toBe(400);
  expect(await refused('lop', ids.lopA, { trangThai: 'dang_hoc' })).toBe(400);
  expect(
    await refused('lop', ids.lopA, { levelKey: 'vua', levelOrder: 1 }),
  ).toBe(400);
  expect(await refused('coSo', ids.coSoA, { trangThai: 'da_nghi' })).toBe(400);
  // The three "delete" forms are plain status changes that keep the history.
  expect(await refused('hocVien', ids.hocVienA, { trangThai: 'da_nghi' })).toBe(
    200,
  );
  expect(await refused('lop', ids.lopA, { trangThai: 'da_dong' })).toBe(200);
  expect(await refused('coSo', ids.coSoA, { trangThai: 'tam_dung' })).toBe(200);
  const student = await connection.query
    .selectFrom('eduHocVien')
    .select(['trangThai', 'soBuoiConLai'])
    .where('id', '=', ids.hocVienA)
    .executeTakeFirstOrThrow();
  expect(student.trangThai).toBe('da_nghi');
});

test('a parent phone is stored in its normal form and a parent is deleted only when nothing points at it', async ({
  testApp,
  connection,
}) => {
  const { admin, managerA, hlvA, ids } = await setup(testApp, connection);
  await connection.query
    .insertInto('eduPhuHuynh')
    .values({ ma: 'PH-A', hoTen: 'Phụ huynh Mẫu A', soDienThoai: '0900000001' })
    .execute();
  const parent = await idByMa(connection, 'eduPhuHuynh', 'PH-A');
  await connection.query
    .insertInto('eduHocVienPhuHuynh')
    .values({
      hocVienId: ids.hocVienA,
      phuHuynhId: parent,
      quanHe: 'me',
      lienHeChinh: true,
    })
    .execute();

  expect(
    (
      await update(managerA.session, 'phuHuynh', parent, {
        soDienThoai: '+84 90 000 0003',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await update(managerA.session, 'phuHuynh', parent, {
        soDienThoai: '0900000003',
      })
    ).status,
  ).toBe(200);

  // A coach has no parent permission at all.
  expect(
    (await post(hlvA.session, '/phuHuynh/xoa', { id: parent })).status,
  ).toBe(403);
  expect(
    (
      await update(hlvA.session, 'phuHuynh', parent, {
        hoTen: 'Phụ huynh Mẫu Khác',
      })
    ).status,
  ).toBe(403);
  // Still linked to a student: refused, nothing deleted.
  expect((await post(admin, '/phuHuynh/xoa', { id: parent })).status).toBe(400);
  expect(
    (
      await connection.query
        .selectFrom('eduPhuHuynh')
        .select('id')
        .where('id', '=', parent)
        .execute()
    ).length,
  ).toBe(1);
  // Unlink, then delete.
  const link = await connection.query
    .selectFrom('eduHocVienPhuHuynh')
    .select('id')
    .where('phuHuynhId', '=', parent)
    .executeTakeFirstOrThrow();
  expect(
    (
      await post(admin, '/lienKet/deleteOne', {
        filter: { id: Number(link.id) },
      })
    ).status,
  ).toBe(200);
  expect((await post(admin, '/phuHuynh/xoa', { id: parent })).status).toBe(200);
  expect((await post(admin, '/phuHuynh/xoa', { id: parent })).status).toBe(404);
});
