import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// Reconciliation of sessions, tuition and books. Every name, phone number and amount is made up.

type Json = { data?: any };

async function setup(testApp: any, connection: any) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'ds-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'ds-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'ds-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'ds-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const q = connection.query;
  for (const lopId of [ids.lopA, ids.lopB]) {
    await q
      .insertInto('eduBuoiHoc')
      .values({
        lopId,
        ngay: '2026-11-02',
        gioBatDau: '17:30',
        gioKetThuc: '19:00',
      })
      .execute();
  }
  const sessions = await q
    .selectFrom('eduBuoiHoc')
    .select(['id', 'lopId'])
    .execute();
  const sessionOf = (lopId: number) =>
    Number(sessions.find((s: any) => Number(s.lopId) === lopId).id);
  // One parent each, linked to the student.
  for (const [ma, hocVienId] of [
    ['PH-A', ids.hocVienA],
    ['PH-B', ids.hocVienB],
  ] as const) {
    await q
      .insertInto('eduPhuHuynh')
      .values({
        ma,
        hoTen: `Phụ huynh Mẫu ${ma}`,
        soDienThoai: ma === 'PH-A' ? '0900000001' : '0900000002',
      })
      .execute();
    const parent = await q
      .selectFrom('eduPhuHuynh')
      .select('id')
      .where('ma', '=', ma)
      .executeTakeFirstOrThrow();
    await q
      .insertInto('eduHocVienPhuHuynh')
      .values({ hocVienId, phuHuynhId: Number(parent.id), quanHe: 'me' })
      .execute();
  }
  return {
    admin,
    hlvA,
    hlvB,
    managerA,
    keToan,
    ids,
    sessionA: sessionOf(ids.lopA),
    sessionB: sessionOf(ids.lopB),
  };
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
    .select(['thayDoi', 'soDuSau', 'lyDo'])
    .where('hocVienId', '=', hocVienId)
    .orderBy('id')
    .execute();

const attendanceId = async (connection: any, hocVienId: number) =>
  Number(
    (
      await connection.query
        .selectFrom('eduDiemDanh')
        .select('id')
        .where('hocVienId', '=', hocVienId)
        .executeTakeFirstOrThrow()
    ).id,
  );

test('the three routes need a signed-in person', async ({ request }) => {
  for (const path of [
    '/doiSoat/tongQuan',
    '/doiSoat/chiTietHocVien',
    '/doiSoat/capNhatBuoiHoc',
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
});

test('the overview lists only the students in scope, and money and parents only to those who may see them', async ({
  testApp,
  connection,
}) => {
  const { hlvA, managerA, keToan, ids } = await setup(testApp, connection);
  // Student A buys 10 sessions at 100,000 and pays 400,000; student B buys 8 and pays nothing.
  const packA = (await (
    await post(keToan.session, '/goiHoc/taoMoi', {
      hocVienId: ids.hocVienA,
      soBuoi: 10,
      donGia: 100000,
    })
  ).json()) as Json;
  await post(keToan.session, '/thanhToan/ghiNhan', {
    goiHocId: packA.data.id,
    soTien: 400000,
    hinhThuc: 'tien_mat',
  });
  await post(keToan.session, '/goiHoc/taoMoi', {
    hocVienId: ids.hocVienB,
    soBuoi: 8,
    donGia: 100000,
  });

  // The coach of class A: their own student, sessions, and neither tuition nor a parent's phone number.
  const coach = (await (
    await post(hlvA.session, '/doiSoat/tongQuan', {})
  ).json()) as Json;
  expect(coach.data.quyen).toEqual({
    hocPhi: false,
    sach: false,
    phuHuynh: false,
  });
  expect(coach.data.danhSach.map((row: any) => row.ma)).toEqual(['HS-A']);
  expect(coach.data.thongKe.tongHocVien).toBe(1);
  expect(coach.data.thongKe.tongCongNoHocPhi).toBe(0);
  expect(coach.data.danhSach[0]).toMatchObject({
    tongTienHocPhi: 0,
    tongDaThanhToan: 0,
    tongConNoHocPhi: 0,
    phuHuynhTen: null,
    phuHuynhSdt: null,
    soBuoiConLai: 10,
  });
  expect(JSON.stringify(coach.data)).not.toContain('0900000001');

  // The manager of branch A: branch A only, with money and the parent.
  const manager = (await (
    await post(managerA.session, '/doiSoat/tongQuan', {})
  ).json()) as Json;
  expect(manager.data.danhSach.map((row: any) => row.ma)).toEqual(['HS-A']);
  expect(manager.data.danhSach[0]).toMatchObject({
    tongSoBuoiDaMua: 10,
    tongTienHocPhi: 1000000,
    tongDaThanhToan: 400000,
    tongConNoHocPhi: 600000,
    phuHuynhSdt: '0900000001',
  });
  expect(JSON.stringify(manager.data)).not.toContain('0900000002');

  // The accountant: every branch.
  const all = (await (
    await post(keToan.session, '/doiSoat/tongQuan', {})
  ).json()) as Json;
  expect(all.data.danhSach.map((row: any) => row.ma)).toEqual(['HS-A', 'HS-B']);
  expect(all.data.thongKe.tongCongNoHocPhi).toBe(600000 + 800000);
  const owing = (await (
    await post(keToan.session, '/doiSoat/tongQuan', {
      trangThaiLoc: 'no_hoc_phi',
      search: 'mau b',
    })
  ).json()) as Json;
  expect(owing.data.danhSach.map((row: any) => row.ma)).toEqual(['HS-B']);
});

test('the detail of a student outside the scope is not found, and a coach gets no tuition in it', async ({
  testApp,
  connection,
}) => {
  const { hlvA, keToan, ids, sessionA } = await setup(testApp, connection);
  await post(keToan.session, '/goiHoc/taoMoi', {
    hocVienId: ids.hocVienA,
    soBuoi: 2,
    donGia: 100000,
  });
  const saved = await post(hlvA.session, '/diemDanh/luu', {
    buoiHocId: sessionA,
    danhSach: [
      { hocVienId: ids.hocVienA, trangThai: 'co_mat', nhanXet: 'Tập trung' },
    ],
  });
  expect(saved.status).toBe(200);

  const other = await post(hlvA.session, '/doiSoat/chiTietHocVien', {
    hocVienId: ids.hocVienB,
  });
  expect(other.status).toBe(404);

  const coach = (await (
    await post(hlvA.session, '/doiSoat/chiTietHocVien', {
      hocVienId: ids.hocVienA,
    })
  ).json()) as Json;
  expect(coach.data.quyen).toEqual({
    hocPhi: false,
    sach: false,
    phuHuynh: false,
    suaBuoi: true,
  });
  expect(coach.data.cacKyNop).toEqual([]);
  expect(coach.data.hocVien.phuHuynh).toBeNull();
  expect(coach.data.tongHop).toMatchObject({
    tongSoBuoiDaHoc: 1,
    tongTienHocPhi: 0,
    soBuoiConLai: 1,
  });
  expect(coach.data.danhSachBuoiHoc).toHaveLength(1);
  expect(coach.data.danhSachBuoiHoc[0]).toMatchObject({
    ngay: '2026-11-02',
    trangThai: 'co_mat',
    nhanXet: 'Tập trung',
    soBuoiDaTru: 1,
  });

  const accountant = (await (
    await post(keToan.session, '/doiSoat/chiTietHocVien', {
      hocVienId: ids.hocVienA,
    })
  ).json()) as Json;
  expect(accountant.data.quyen).toMatchObject({
    hocPhi: true,
    phuHuynh: true,
    suaBuoi: false,
  });
  expect(accountant.data.cacKyNop).toHaveLength(1);
  expect(accountant.data.cacKyNop[0]).toMatchObject({
    kySo: 1,
    soBuoi: 2,
    thanhTien: 200000,
    conNo: 200000,
    daDung: 1,
    conLai: 1,
  });
  expect(accountant.data.hocVien.phuHuynh).toMatchObject({
    soDienThoai: '0900000001',
    moiQuanHe: 'me',
  });
  expect(accountant.data.danhSachBuoiHoc[0]).toMatchObject({
    kySo: 1,
    ngoaiGoi: false,
  });
});

test('correcting one row moves the balance through the ledger, by the rule fixed on the session', async ({
  testApp,
  connection,
}) => {
  const { hlvA, hlvB, keToan, ids, sessionA } = await setup(
    testApp,
    connection,
  );
  // This branch deducts an excused absence; the rule is fixed on the session by its first save.
  await connection.query
    .updateTable('eduCoSo')
    .set({ truBuoiVangCoPhep: true })
    .where('id', '=', ids.coSoA)
    .execute();
  await connection.query
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: 10 })
    .where('id', '=', ids.hocVienA)
    .execute();
  await post(hlvA.session, '/diemDanh/luu', {
    buoiHocId: sessionA,
    danhSach: [{ hocVienId: ids.hocVienA, trangThai: 'co_mat' }],
  });
  expect(await balance(connection, ids.hocVienA)).toBe(9);
  const diemDanhId = await attendanceId(connection, ids.hocVienA);

  // An accountant may not record attendance; another coach does not see this row.
  const denied = await post(keToan.session, '/doiSoat/capNhatBuoiHoc', {
    diemDanhId,
    trangThai: 'vang_khong_phep',
  });
  expect(denied.status).toBe(403);
  const hidden = await post(hlvB.session, '/doiSoat/capNhatBuoiHoc', {
    diemDanhId,
    trangThai: 'vang_khong_phep',
  });
  expect(hidden.status).toBe(404);
  expect(await balance(connection, ids.hocVienA)).toBe(9);

  // Present -> absent without leave: nothing is deducted for it, so the session comes back.
  const back = (await (
    await post(hlvA.session, '/doiSoat/capNhatBuoiHoc', {
      diemDanhId,
      trangThai: 'vang_khong_phep',
    })
  ).json()) as Json;
  expect(back.data).toMatchObject({ soBuoiDaTru: 0, soBuoiConLaiMoi: 10 });
  expect(await balance(connection, ids.hocVienA)).toBe(10);

  // -> excused absence: this session deducts it (the branch rule stored at its first save), not a fixed "never".
  const excused = (await (
    await post(hlvA.session, '/doiSoat/capNhatBuoiHoc', {
      diemDanhId,
      trangThai: 'vang_co_phep',
    })
  ).json()) as Json;
  expect(excused.data).toMatchObject({ soBuoiDaTru: 1, soBuoiConLaiMoi: 9 });

  // A comment and a score alone change no balance and write no ledger row; a field not sent stays.
  const noted = await post(hlvA.session, '/doiSoat/capNhatBuoiHoc', {
    diemDanhId,
    trangThai: 'vang_co_phep',
    yThucDiem: 8,
    nhanXet: 'Xin nghỉ ốm',
  });
  expect(noted.status).toBe(200);
  const kept = await post(hlvA.session, '/doiSoat/capNhatBuoiHoc', {
    diemDanhId,
    trangThai: 'vang_co_phep',
  });
  expect(kept.status).toBe(200);
  const row = await connection.query
    .selectFrom('eduDiemDanh')
    .select(['trangThai', 'nhanXet', 'yThucDiem', 'soBuoiDaTru'])
    .where('id', '=', diemDanhId)
    .executeTakeFirstOrThrow();
  expect(row).toMatchObject({
    trangThai: 'vang_co_phep',
    nhanXet: 'Xin nghỉ ốm',
    yThucDiem: 8,
    soBuoiDaTru: 1,
  });

  // Every move left a ledger row, and the balance equals the last one.
  const rows = await ledger(connection, ids.hocVienA);
  expect(rows.map((entry: any) => [Number(entry.thayDoi), entry.lyDo])).toEqual(
    [
      [-1, 'diem_danh'],
      [1, 'diem_danh_sua'],
      [-1, 'diem_danh'],
    ],
  );
  expect(Number(rows.at(-1).soDuSau)).toBe(
    await balance(connection, ids.hocVienA),
  );
});

test('a row already inside an opening balance is corrected without moving the balance', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, sessionA } = await setup(testApp, connection);
  await connection.query
    .insertInto('eduDiemDanh')
    .values({
      buoiHocId: sessionA,
      hocVienId: ids.hocVienA,
      trangThai: 'co_mat',
      soBuoiDaTru: 1,
      tinhVaoSoDu: false,
    })
    .execute();
  await connection.query
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: 5 })
    .where('id', '=', ids.hocVienA)
    .execute();
  const diemDanhId = await attendanceId(connection, ids.hocVienA);
  const edited = await post(hlvA.session, '/doiSoat/capNhatBuoiHoc', {
    diemDanhId,
    trangThai: 'vang_khong_phep',
  });
  expect(edited.status).toBe(200);
  expect(await balance(connection, ids.hocVienA)).toBe(5);
  expect(await ledger(connection, ids.hocVienA)).toEqual([]);
});
