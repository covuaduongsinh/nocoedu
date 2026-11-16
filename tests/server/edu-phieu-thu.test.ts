import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// Receipts: a number for every payment recorded in the application, and what a receipt shows. Amounts are made up.

async function setup(testApp: any, connection: any) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'pt-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'pt-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'pt-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'pt-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  await connection.query.deleteFrom('eduSoPhieu').allowAllRows().execute();
  return { hlvA, managerA, keToan, ids };
}

const pay = async (session: any, body: object) =>
  ((await (await post(session, '/thanhToan/ghiNhan', body)).json()) as any)
    .data;

test('receipts are numbered per year of the payment day, without a gap or a repeat', async ({
  testApp,
  connection,
}) => {
  const { keToan, ids } = await setup(testApp, connection);
  const pack = (
    (await (
      await post(keToan.session, '/goiHoc/taoMoi', {
        hocVienId: ids.hocVienA,
        soBuoi: 10,
        donGia: 100000,
      })
    ).json()) as any
  ).data;
  const first = await pay(keToan.session, {
    goiHocId: pack.id,
    soTien: 200000,
    hinhThuc: 'tien_mat',
    ngay: '2026-11-10',
  });
  const second = await pay(keToan.session, {
    goiHocId: pack.id,
    soTien: 300000,
    hinhThuc: 'chuyen_khoan',
    ngay: '2026-11-12',
  });
  // A payment dated in another year starts that year's own count.
  const other = await pay(keToan.session, {
    goiHocId: pack.id,
    soTien: 100000,
    hinhThuc: 'tien_mat',
    ngay: '2027-01-05',
  });
  expect([first.soPhieu, second.soPhieu, other.soPhieu]).toEqual([
    'PT-2026-000001',
    'PT-2026-000002',
    'PT-2027-000001',
  ]);
  // A refused payment takes no number.
  const refused = await post(keToan.session, '/thanhToan/ghiNhan', {
    goiHocId: pack.id,
    soTien: 900000,
    hinhThuc: 'tien_mat',
    ngay: '2026-11-13',
  });
  expect(refused.status).toBe(400);
  const next = await pay(keToan.session, {
    goiHocId: pack.id,
    soTien: 100000,
    hinhThuc: 'tien_mat',
    ngay: '2026-11-14',
  });
  expect(next.soPhieu).toBe('PT-2026-000003');
  const stored = await connection.query
    .selectFrom('eduThanhToan')
    .select('soPhieu')
    .orderBy('id')
    .execute();
  expect(stored.map((row: any) => row.soPhieu)).toEqual([
    'PT-2026-000001',
    'PT-2026-000002',
    'PT-2027-000001',
    'PT-2026-000003',
  ]);
});

test('a receipt shows the payment, the student, the package and what is still owed, to those who see the payment', async ({
  testApp,
  request,
  connection,
}) => {
  const anonymous = await request('/thanhToan/phieuThu', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: '{}',
  });
  expect(anonymous.status).toBe(401);

  const { hlvA, managerA, keToan, ids } = await setup(testApp, connection);
  const packOf = async (hocVienId: number) =>
    (
      (await (
        await post(keToan.session, '/goiHoc/taoMoi', {
          hocVienId,
          soBuoi: 12,
          donGia: 120000,
          ngayMua: '2026-11-01',
        })
      ).json()) as any
    ).data;
  const packA = await packOf(ids.hocVienA);
  const packB = await packOf(ids.hocVienB);
  const paidA1 = await pay(keToan.session, {
    goiHocId: packA.id,
    soTien: 440000,
    hinhThuc: 'chuyen_khoan',
    ngay: '2026-11-02',
    noiDungCk: 'HS-A G1',
  });
  const paidA2 = await pay(keToan.session, {
    goiHocId: packA.id,
    soTien: 500000,
    hinhThuc: 'tien_mat',
    ngay: '2026-11-09',
  });
  const paidB = await pay(keToan.session, {
    goiHocId: packB.id,
    soTien: 100000,
    hinhThuc: 'tien_mat',
    ngay: '2026-11-09',
  });

  // A coach holds no payment action.
  expect(
    (
      await post(hlvA.session, '/thanhToan/phieuThu', {
        thanhToanId: paidA1.id,
      })
    ).status,
  ).toBe(403);
  // The manager of branch A reads the receipts of branch A; one of branch B is not found.
  expect(
    (
      await post(managerA.session, '/thanhToan/phieuThu', {
        thanhToanId: paidB.id,
      })
    ).status,
  ).toBe(404);

  const receipt = (
    (await (
      await post(managerA.session, '/thanhToan/phieuThu', {
        thanhToanId: paidA1.id,
      })
    ).json()) as any
  ).data;
  expect(receipt).toMatchObject({
    soPhieu: paidA1.soPhieu,
    ngay: '2026-11-02',
    soTien: 440000,
    hinhThuc: 'chuyen_khoan',
    noiDungCk: 'HS-A G1',
    coSo: { ten: 'Cơ sở Mẫu A' },
    hocVien: { ma: 'HS-A', hoTen: 'Học viên Mẫu A', lop: 'Lớp Mẫu A1' },
    // The first receipt says what was owed after it, not after the later payment.
    goiHoc: { soBuoi: 12, thanhTien: 1440000, daThu: 440000, conNo: 1000000 },
  });
  expect(typeof receipt.nguoiThu).toBe('string');

  const later = (
    (await (
      await post(keToan.session, '/thanhToan/phieuThu', {
        thanhToanId: paidA2.id,
      })
    ).json()) as any
  ).data;
  expect(later.goiHoc).toMatchObject({ daThu: 940000, conNo: 500000 });

  // The packages of one student with what was paid for each, newest first.
  expect(
    (
      await post(hlvA.session, '/goiHoc/cuaHocVien', {
        hocVienId: ids.hocVienA,
      })
    ).status,
  ).toBe(403);
  const packagesOf = async (session: any, hocVienId: number) =>
    (
      (await (
        await post(session, '/goiHoc/cuaHocVien', { hocVienId })
      ).json()) as any
    ).data;
  const own = await packagesOf(managerA.session, ids.hocVienA);
  expect(own.goi).toEqual([
    expect.objectContaining({
      id: packA.id,
      soBuoi: 12,
      thanhTien: 1440000,
      daThu: 940000,
      conNo: 500000,
    }),
  ]);
  expect(
    own.thanhToan.map((row: any) => [row.soPhieu, row.soTien, row.hinhThuc]),
  ).toEqual([
    [paidA2.soPhieu, 500000, 'tien_mat'],
    [paidA1.soPhieu, 440000, 'chuyen_khoan'],
  ]);
  // A student of another branch has nothing to show to this manager.
  expect(await packagesOf(managerA.session, ids.hocVienB)).toEqual({
    goi: [],
    thanhToan: [],
  });
});
