import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// Import of one kind of record from a CSV file. Every code, name and amount is made up.

type Json = { data?: any };

async function setup(testApp: any, connection: any) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'nd-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'nd-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'nd-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'nd-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  await connection.query
    .deleteFrom('eduNhapLarkNhatKy')
    .allowAllRows()
    .execute();
  return { admin, hlvA, hlvB, managerA, keToan, ids };
}

const csv = (...lines: string[]): string => `${lines.join('\r\n')}\r\n`;

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

const count = async (connection: any, table: string) =>
  (await connection.query.selectFrom(table).select('id').execute()).length;

/** The whole error body as text: the reason is looked for in it, wherever the error format puts it. */
const errorOf = async (response: Response): Promise<string> =>
  JSON.stringify(await response.json());

test('the three routes need a signed-in person and the action of the kind', async ({
  testApp,
  request,
  connection,
}) => {
  for (const path of [
    '/nhapDuLieu/mau',
    '/nhapDuLieu/xemTruoc',
    '/nhapDuLieu/xacNhan',
  ]) {
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
  const { hlvA, keToan } = await setup(testApp, connection);
  // A coach records attendance and nothing else; an accountant sells packages and neither teaches nor sets pay.
  for (const loai of ['coSo', 'lop', 'hoSoGv', 'goiHoc', 'phatSach']) {
    const denied = await post(hlvA.session, '/nhapDuLieu/mau', { loai });
    expect(denied.status).toBe(403);
  }
  for (const loai of ['diemDanh', 'hoSoGv', 'coSo', 'tuyenSinh']) {
    const denied = await post(keToan.session, '/nhapDuLieu/xacNhan', {
      loai,
      csv: 'ma\r\nX\r\n',
    });
    expect(denied.status).toBe(403);
  }
  const template = (await (
    await post(hlvA.session, '/nhapDuLieu/mau', { loai: 'diemDanh' })
  ).json()) as Json;
  expect(template.data.cot).toContain('hocVienMa');
  expect(template.data.csv).toContain('lopMa,ngay,gioBatDau');
});

test('a package file moves the balance through the ledger, all or nothing, and never twice', async ({
  testApp,
  connection,
}) => {
  const { keToan, managerA, ids } = await setup(testApp, connection);
  const file = csv(
    'hocVienMa,soBuoi,donGia,ngayMua,daThuTien,hinhThuc',
    'HS-A,10,100000,2026-11-10,true,tien_mat',
  );

  // A preview writes nothing.
  const preview = (await (
    await post(keToan.session, '/nhapDuLieu/xemTruoc', {
      loai: 'goiHoc',
      csv: file,
    })
  ).json()) as Json;
  expect(preview.data).toEqual({ tongDong: 1, hopLe: 1, loi: [] });
  expect(await count(connection, 'eduGoiHoc')).toBe(0);
  expect(await balance(connection, ids.hocVienA)).toBe(0);

  const confirmed = await post(keToan.session, '/nhapDuLieu/xacNhan', {
    loai: 'goiHoc',
    csv: file,
  });
  expect(confirmed.status).toBe(200);
  expect(((await confirmed.json()) as Json).data.daGhi).toBe(1);
  expect(await balance(connection, ids.hocVienA)).toBe(10);
  const ledger = await connection.query
    .selectFrom('eduSoDuNhatKy')
    .select(['thayDoi', 'soDuSau', 'lyDo'])
    .where('hocVienId', '=', ids.hocVienA)
    .execute();
  expect(ledger).toHaveLength(1);
  expect(ledger[0]).toMatchObject({
    thayDoi: 10,
    soDuSau: 10,
    lyDo: 'mua_goi',
  });
  const payments = await connection.query
    .selectFrom('eduThanhToan')
    .select(['soTien', 'hinhThuc', 'coSoId'])
    .execute();
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({
    soTien: 1000000,
    hinhThuc: 'tien_mat',
    coSoId: ids.coSoA,
  });

  // The same file again is refused whole: the balance stays, and the log says so with counts only.
  const again = await post(keToan.session, '/nhapDuLieu/xacNhan', {
    loai: 'goiHoc',
    csv: file,
  });
  expect(again.status).toBe(400);
  expect(await errorOf(again)).toContain('EDU_IMPORT_HAS_PROBLEMS');
  expect(await balance(connection, ids.hocVienA)).toBe(10);
  expect(await count(connection, 'eduGoiHoc')).toBe(1);

  // One good row and one bad row: nothing of the file is written.
  const mixed = csv(
    'hocVienMa,soBuoi,donGia,ngayMua',
    'HS-B,8,100000,2026-11-11',
    'HS-KHONG-CO,8,100000,2026-11-11',
  );
  const report = (await (
    await post(keToan.session, '/nhapDuLieu/xemTruoc', {
      loai: 'goiHoc',
      csv: mixed,
    })
  ).json()) as Json;
  expect(report.data).toEqual({
    tongDong: 2,
    hopLe: 1,
    loi: [{ dong: 3, ma: 'UNKNOWN_STUDENT', cot: 'hocVienMa' }],
  });
  const refused = await post(keToan.session, '/nhapDuLieu/xacNhan', {
    loai: 'goiHoc',
    csv: mixed,
  });
  expect(refused.status).toBe(400);
  expect(await balance(connection, ids.hocVienB)).toBe(0);
  expect(await count(connection, 'eduGoiHoc')).toBe(1);

  // A branch manager does not reach a student of another branch: the code reads as unknown.
  const outside = (await (
    await post(managerA.session, '/nhapDuLieu/xemTruoc', {
      loai: 'goiHoc',
      csv: csv('hocVienMa,soBuoi,donGia', 'HS-B,8,100000'),
    })
  ).json()) as Json;
  expect(outside.data.loi).toEqual([
    { dong: 2, ma: 'UNKNOWN_STUDENT', cot: 'hocVienMa' },
  ]);

  const log = await connection.query
    .selectFrom('eduNhapLarkNhatKy')
    .select(['trangThai', 'tongKet'])
    .orderBy('id')
    .execute();
  const summary = (row: any) =>
    typeof row.tongKet === 'string' ? JSON.parse(row.tongKet) : row.tongKet;
  expect(log.map((row: any) => row.trangThai)).toEqual([
    'thanh_cong',
    'tu_choi',
    'tu_choi',
  ]);
  expect(summary(log[0])).toEqual({
    nguon: 'csv_goiHoc',
    tongDong: 1,
    hopLe: 1,
    loi: 0,
  });
  expect(JSON.stringify(log)).not.toContain('HS-');
});

test('an attendance file deducts by the rule of the session, once, and stays inside the coach’s classes', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids } = await setup(testApp, connection);
  await connection.query
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: 5 })
    .where('id', '=', ids.hocVienA)
    .execute();
  const file = csv(
    'lopMa,ngay,gioBatDau,hocVienMa,trangThai,daLamBtvn,nhanXet',
    'L-A1,2026-11-03,18:00,HS-A,co_mat,true,Tập trung',
  );
  const confirmed = await post(hlvA.session, '/nhapDuLieu/xacNhan', {
    loai: 'diemDanh',
    csv: file,
  });
  expect(confirmed.status).toBe(200);
  expect(await balance(connection, ids.hocVienA)).toBe(4);
  const session = await connection.query
    .selectFrom('eduBuoiHoc')
    .select(['gioKetThuc', 'trangThai', 'hlvId'])
    .where('lopId', '=', ids.lopA)
    .executeTakeFirstOrThrow();
  expect(session).toMatchObject({
    gioKetThuc: '19:30',
    trangThai: 'da_diem_danh',
    hlvId: hlvA.id,
  });
  const mark = await connection.query
    .selectFrom('eduDiemDanh')
    .select(['trangThai', 'nhanXet', 'soBuoiDaTru'])
    .executeTakeFirstOrThrow();
  expect(mark).toMatchObject({
    trangThai: 'co_mat',
    nhanXet: 'Tập trung',
    soBuoiDaTru: 1,
  });

  // The same file again deducts nothing more.
  const again = await post(hlvA.session, '/nhapDuLieu/xacNhan', {
    loai: 'diemDanh',
    csv: file,
  });
  expect(again.status).toBe(200);
  expect(await balance(connection, ids.hocVienA)).toBe(4);
  const ledger = await connection.query
    .selectFrom('eduSoDuNhatKy')
    .select(['thayDoi', 'soDuSau', 'lyDo'])
    .where('hocVienId', '=', ids.hocVienA)
    .execute();
  expect(ledger).toHaveLength(1);
  expect(ledger[0]).toMatchObject({
    thayDoi: -1,
    soDuSau: 4,
    lyDo: 'diem_danh',
  });

  // Another coach's class and another coach's student read as unknown.
  const outside = (await (
    await post(hlvA.session, '/nhapDuLieu/xemTruoc', {
      loai: 'diemDanh',
      csv: csv(
        'lopMa,ngay,gioBatDau,hocVienMa',
        'L-B1,2026-11-03,18:00,HS-B',
        'L-A1,2026-11-03,18:00,HS-B',
        'L-A1,2026-13-40,18:00,HS-A',
      ),
    })
  ).json()) as Json;
  expect(outside.data.loi).toEqual([
    { dong: 2, ma: 'UNKNOWN_CLASS', cot: 'lopMa' },
    { dong: 3, ma: 'UNKNOWN_STUDENT', cot: 'hocVienMa' },
    { dong: 4, ma: 'INVALID_VALUE', cot: 'ngay' },
  ]);
});

test('classes are imported into the manager’s own branch only, and a wrong header is refused', async ({
  testApp,
  connection,
}) => {
  const { managerA, ids } = await setup(testApp, connection);
  const header = await post(managerA.session, '/nhapDuLieu/xemTruoc', {
    loai: 'lop',
    csv: csv('ma,ten,coSoMa,hlvId', 'L-A2,Lớp Mẫu A2,CS-A,abc'),
  });
  expect(header.status).toBe(400);
  expect(await errorOf(header)).toContain('EDU_IMPORT_UNKNOWN_COLUMN');

  const file = csv(
    'ma,ten,coSoMa,levelKey',
    'L-A2,Lớp Mẫu A2,CS-A,ma',
    'L-B2,Lớp Mẫu B2,CS-B,tot',
  );
  const report = (await (
    await post(managerA.session, '/nhapDuLieu/xemTruoc', {
      loai: 'lop',
      csv: file,
    })
  ).json()) as Json;
  expect(report.data.loi).toEqual([
    { dong: 3, ma: 'UNKNOWN_BRANCH', cot: 'coSoMa' },
  ]);

  const confirmed = await post(managerA.session, '/nhapDuLieu/xacNhan', {
    loai: 'lop',
    csv: csv('ma,ten,coSoMa,levelKey', 'L-A2,Lớp Mẫu A2,CS-A,ma'),
  });
  expect(confirmed.status).toBe(200);
  const created = await connection.query
    .selectFrom('eduLop')
    .select(['coSoId', 'levelKey', 'levelOrder', 'trangThai'])
    .where('ma', '=', 'L-A2')
    .executeTakeFirstOrThrow();
  expect(created).toMatchObject({
    coSoId: ids.coSoA,
    levelKey: 'ma',
    levelOrder: 2,
    trangThai: 'dang_mo',
  });

  // A second import renames it and leaves the level alone: the file has no level column.
  const renamed = await post(managerA.session, '/nhapDuLieu/xacNhan', {
    loai: 'lop',
    csv: csv('ma,ten,coSoMa', 'L-A2,Lớp Mẫu A2 mới,CS-A'),
  });
  expect(renamed.status).toBe(200);
  const after = await connection.query
    .selectFrom('eduLop')
    .select(['ten', 'levelKey'])
    .where('ma', '=', 'L-A2')
    .executeTakeFirstOrThrow();
  expect(after).toMatchObject({ ten: 'Lớp Mẫu A2 mới', levelKey: 'ma' });
});
