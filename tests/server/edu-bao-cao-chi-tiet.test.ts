import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// The row-level reports: every attendance mark, every package, and the balances that disagree with the ledger.

type Report = { data: { columns: { key: string }[]; rows: any[] } };

async function setup(testApp: any, connection: any) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'ct-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'ct-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'ct-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'ct-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const q = connection.query;
  await q.deleteFrom('eduXuatDuLieuNhatKy').allowAllRows().execute();
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

const view = async (session: any, body: object): Promise<Report> =>
  (await (await post(session, '/baoCao/xem', body)).json()) as Report;

test('the attendance list shows the marks of the caller’s students, and taking the file needs the export action', async ({
  testApp,
  connection,
}) => {
  const { hlvA, hlvB, managerA, ids, sessionA, sessionB } = await setup(
    testApp,
    connection,
  );
  await post(hlvA.session, '/diemDanh/luu', {
    buoiHocId: sessionA,
    danhSach: [
      { hocVienId: ids.hocVienA, trangThai: 'co_mat', nhanXet: 'Tập trung' },
    ],
  });
  await post(hlvB.session, '/diemDanh/luu', {
    buoiHocId: sessionB,
    danhSach: [{ hocVienId: ids.hocVienB, trangThai: 'vang_co_phep' }],
  });
  const range = { tuNgay: '2026-11-01', denNgay: '2026-11-30' };

  const mine = await view(hlvA.session, { loai: 'diemDanhChiTiet', ...range });
  expect(mine.data.rows).toEqual([
    {
      ngay: '2026-11-02',
      gio: '17:30',
      lop: 'Lớp Mẫu A1',
      ma: 'HS-A',
      hoTen: 'Học viên Mẫu A',
      trangThai: 'Có mặt',
      btvn: 'Chưa làm',
      yThuc: null,
      nhanXet: 'Tập trung',
      soBuoiDaTru: 1,
    },
  ]);
  // One student by id: the caller's own is listed whole, another coach's is not found.
  const one = await view(hlvA.session, {
    loai: 'diemDanhChiTiet',
    hocVienId: ids.hocVienA,
  });
  expect(one.data.rows).toHaveLength(1);
  const other = await post(hlvA.session, '/baoCao/xem', {
    loai: 'diemDanhChiTiet',
    hocVienId: ids.hocVienB,
  });
  expect(other.status).toBe(404);

  // A coach sees the report on screen and may not take the file; a branch manager may, and it is logged by id.
  const refused = await post(hlvA.session, '/baoCao/xuatCsv', {
    loai: 'diemDanhChiTiet',
    ...range,
  });
  expect(refused.status).toBe(403);
  const file = await post(managerA.session, '/baoCao/xuatCsv', {
    loai: 'diemDanhChiTiet',
    hocVienId: ids.hocVienA,
  });
  expect(file.status).toBe(200);
  const csv = await file.text();
  expect(csv).toContain('HS-A');
  expect(csv).not.toContain('HS-B');
  const log = await connection.query
    .selectFrom('eduXuatDuLieuNhatKy')
    .select(['userId', 'loai', 'soDong', 'boLoc'])
    .execute();
  expect(log).toHaveLength(1);
  expect(log[0]).toMatchObject({
    userId: managerA.id,
    loai: 'bao_cao_diemDanhChiTiet',
    soDong: 1,
  });
  const filter =
    typeof log[0].boLoc === 'string' ? JSON.parse(log[0].boLoc) : log[0].boLoc;
  expect(filter.hocVienId).toBe(ids.hocVienA);
  expect(JSON.stringify(log)).not.toContain('Học viên');
});

test('the package list is for those who see packages, with what is owed for those who see payments', async ({
  testApp,
  connection,
}) => {
  const { hlvA, managerA, keToan, ids } = await setup(testApp, connection);
  const pack = (await (
    await post(keToan.session, '/goiHoc/taoMoi', {
      hocVienId: ids.hocVienA,
      soBuoi: 10,
      donGia: 100000,
      ngayMua: '2026-11-05',
    })
  ).json()) as any;
  await post(keToan.session, '/thanhToan/ghiNhan', {
    goiHocId: pack.data.id,
    soTien: 300000,
    hinhThuc: 'chuyen_khoan',
  });
  await post(keToan.session, '/goiHoc/taoMoi', {
    hocVienId: ids.hocVienB,
    soBuoi: 8,
    donGia: 100000,
    ngayMua: '2026-11-06',
  });

  const coach = await post(hlvA.session, '/baoCao/xem', {
    loai: 'goiHocChiTiet',
  });
  expect(coach.status).toBe(403);

  const all = await view(keToan.session, { loai: 'goiHocChiTiet' });
  expect(all.data.rows.map((row) => [row.ma, row.daThu, row.conNo])).toEqual([
    ['HS-B', 0, 800000],
    ['HS-A', 300000, 700000],
  ]);
  const branch = await view(managerA.session, { loai: 'goiHocChiTiet' });
  expect(branch.data.rows).toHaveLength(1);
  expect(branch.data.rows[0]).toMatchObject({
    ma: 'HS-A',
    soBuoi: 10,
    thanhTien: 1000000,
    conNo: 700000,
    soBuoiConLai: 10,
  });
});

test('a balance written beside the ledger is listed, and a balance moved through it is not', async ({
  testApp,
  connection,
}) => {
  const { hlvA, keToan, ids, sessionA } = await setup(testApp, connection);
  // Everything through the application: packages and attendance leave the balance equal to the last ledger row.
  await post(keToan.session, '/goiHoc/taoMoi', {
    hocVienId: ids.hocVienA,
    soBuoi: 10,
    donGia: 100000,
  });
  await post(hlvA.session, '/diemDanh/luu', {
    buoiHocId: sessionA,
    danhSach: [{ hocVienId: ids.hocVienA, trangThai: 'co_mat' }],
  });
  const clean = await view(keToan.session, { loai: 'lechSoDu' });
  expect(clean.data.rows).toEqual([]);

  // A balance written directly, as the old quick edit and the old file import did.
  await connection.query
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: 4 })
    .where('id', '=', ids.hocVienA)
    .execute();
  await connection.query
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: -3 })
    .where('id', '=', ids.hocVienB)
    .execute();
  const found = await view(keToan.session, { loai: 'lechSoDu' });
  expect(
    found.data.rows.map((row) => [
      row.ma,
      row.soBuoiConLai,
      row.soDuTheoSo,
      row.chenhLech,
    ]),
  ).toEqual([
    ['HS-A', 4, 9, -5],
    ['HS-B', -3, 0, -3],
  ]);
  // A coach reads the ledger of their own students only.
  const coach = await view(hlvA.session, { loai: 'lechSoDu' });
  expect(coach.data.rows.map((row) => row.ma)).toEqual(['HS-A']);
});
