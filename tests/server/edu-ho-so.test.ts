import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

const HO_SO = '/hocVien/hoSo360';
const XUAT_CSV = '/hocVien/hoSo360/xuatCsv';

type Q = Parameters<typeof seedSchool>[0];
type Session = Awaited<ReturnType<typeof adminSession>>;

async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Q,
) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'hs-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'hs-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'hs-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'hs-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  await connection.query.deleteFrom('eduSach').allowAllRows().execute();
  await connection.query
    .deleteFrom('eduXuatDuLieuNhatKy')
    .allowAllRows()
    .execute();
  return { admin, hlvA, hlvB, managerA, keToan, ids };
}

/**
 * Student A: two packages (2 sessions bought in September, 10 in October; 200,000 paid for the first and 300,000 for the
 * second), four registers (three deducted in the ledger and a make-up that is not), a parent, one book handed out at
 * a net price of 40,000 of which 10,000 was paid. Student B: one deducted register in the other branch.
 */
async function fixture(
  connection: Q,
  ids: Awaited<ReturnType<typeof setup>>['ids'],
) {
  const q = connection.query;
  let balance = 12;
  const marks: number[] = [];
  const day = async (
    lopId: number,
    hocVienId: number,
    ngay: string,
    trangThai: string,
    soBuoiDaTru: number,
    nhanXet: string,
  ) => {
    await q
      .insertInto('eduBuoiHoc')
      .values({
        lopId,
        ngay,
        gioBatDau: '18:00',
        gioKetThuc: '19:30',
        trangThai: 'da_diem_danh',
      })
      .execute();
    const session = await q
      .selectFrom('eduBuoiHoc')
      .select('id')
      .where('lopId', '=', lopId)
      .where('ngay', '=', ngay)
      .executeTakeFirstOrThrow();
    await q
      .insertInto('eduDiemDanh')
      .values({
        buoiHocId: Number(session.id),
        hocVienId,
        trangThai,
        soBuoiDaTru,
        nhanXet,
        ...(ngay === '2026-10-02' ? { yThucDiem: 8 } : {}),
      })
      .execute();
    const mark = await q
      .selectFrom('eduDiemDanh')
      .select('id')
      .where('buoiHocId', '=', Number(session.id))
      .where('hocVienId', '=', hocVienId)
      .executeTakeFirstOrThrow();
    if (soBuoiDaTru > 0 && hocVienId === ids.hocVienA) {
      balance -= soBuoiDaTru;
      await q
        .insertInto('eduSoDuNhatKy')
        .values({
          hocVienId,
          thayDoi: -soBuoiDaTru,
          soDuSau: balance,
          lyDo: 'diem_danh',
          diemDanhId: Number(mark.id),
          createdAt: new Date().toISOString(),
        })
        .execute();
    }
    marks.push(Number(mark.id));
    return Number(mark.id);
  };
  const packageOf = async (soBuoi: number, ngayMua: string) => {
    await q
      .insertInto('eduGoiHoc')
      .values({
        hocVienId: ids.hocVienA,
        soBuoi,
        donGia: 100000,
        thanhTien: soBuoi * 100000,
        ngayMua,
        nguoiTaoId: 'seed',
      })
      .execute();
    const row = await q
      .selectFrom('eduGoiHoc')
      .select('id')
      .where('hocVienId', '=', ids.hocVienA)
      .where('ngayMua', '=', ngayMua)
      .executeTakeFirstOrThrow();
    return Number(row.id);
  };
  const first = await packageOf(2, '2026-09-01');
  const second = await packageOf(10, '2026-10-01');
  for (const [goiHocId, soTien] of [
    [first, 200000],
    [second, 300000],
  ] as const) {
    await q
      .insertInto('eduThanhToan')
      .values({
        goiHocId,
        hocVienId: ids.hocVienA,
        coSoId: ids.coSoA,
        soTien,
        hinhThuc: 'tien_mat',
        ngay: '2026-10-01',
        thang: '2026-10',
        nguoiGhiNhanId: 'seed',
      })
      .execute();
  }
  await day(ids.lopA, ids.hocVienA, '2026-10-02', 'co_mat', 1, '=SUM(1)');
  await day(ids.lopA, ids.hocVienA, '2026-10-09', 'co_mat', 1, 'Tốt');
  await day(ids.lopA, ids.hocVienA, '2026-10-16', 'co_mat', 1, 'Tốt');
  await day(ids.lopA, ids.hocVienA, '2026-10-23', 'hoc_bu', 0, 'Học bù');
  await day(ids.lopB, ids.hocVienB, '2026-10-03', 'co_mat', 1, 'Tốt');
  await q
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: 9 })
    .where('id', '=', ids.hocVienA)
    .execute();
  await q
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: -1 })
    .where('id', '=', ids.hocVienB)
    .execute();
  await q
    .insertInto('eduSach')
    .values({
      kyHieu: 'CT1',
      ten: 'Sách Mẫu 1',
      giaBia: 60000,
      giaBan: 50000,
      trangThai: 'dang_ban',
    })
    .execute();
  const book = await q
    .selectFrom('eduSach')
    .select('id')
    .executeTakeFirstOrThrow();
  await q
    .insertInto('eduPhatSach')
    .values({
      hocVienId: ids.hocVienA,
      sachId: Number(book.id),
      coSoId: ids.coSoA,
      ngay: '2026-10-02',
      uuDai: 10000,
      tienSach: 40000,
      createdAt: new Date(),
    })
    .execute();
  await q
    .insertInto('eduNopSach')
    .values({
      hocVienId: ids.hocVienA,
      coSoId: ids.coSoA,
      ngay: '2026-10-03',
      soTien: 10000,
      createdAt: new Date(),
    })
    .execute();
  await q
    .insertInto('eduPhuHuynh')
    .values({ ma: 'PH-A', hoTen: 'Phụ huynh Mẫu A', soDienThoai: '0900000011' })
    .execute();
  const parent = await q
    .selectFrom('eduPhuHuynh')
    .select('id')
    .executeTakeFirstOrThrow();
  await q
    .insertInto('eduHocVienPhuHuynh')
    .values({
      hocVienId: ids.hocVienA,
      phuHuynhId: Number(parent.id),
      quanHe: 'me',
      lienHeChinh: true,
    })
    .execute();
  return { first, second, marks };
}

const json = async <T = Record<string, any>>(response: Response): Promise<T> =>
  (await response.json()) as T;

test('the student file answers 401 without a session', async ({
  testApp,
  connection,
  request,
}) => {
  await setup(testApp, connection);
  for (const path of [HO_SO, XUAT_CSV]) {
    const response = await request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: '{}',
    });
    expect(`${path} ${response.status}`).toBe(`${path} 401`);
  }
});

test('the student file allocates sessions to terms first in first out and adds up the money', async ({
  testApp,
  connection,
}) => {
  const { admin, ids } = await setup(testApp, connection);
  const { first, second, marks } = await fixture(connection, ids);

  const answer = await post(admin, HO_SO, { hocVienId: ids.hocVienA });
  expect(answer.status).toBe(200);
  const { data } = await json(answer);
  expect(data.hocVien).toMatchObject({
    ma: 'HS-A',
    lopTen: 'Lớp Mẫu A1',
    coSoTen: 'Cơ sở Mẫu A',
  });
  expect(data.phuHuynhChinh).toMatchObject({
    hoTen: 'Phụ huynh Mẫu A',
    quanHe: 'me',
  });

  // Terms: the first holds 2 sessions and is full, the third session goes to the second term.
  expect(
    data.hocPhi.cacKy.map(
      (k: Record<string, number>) =>
        [k.goiHocId, k.daDung, k.conLai, k.daThanhToan, k.conNo] as number[],
    ),
  ).toEqual([
    [first, 2, 0, 200000, 0],
    [second, 1, 9, 300000, 700000],
  ]);
  expect(
    data.buoiHoc.map((s: { ngay: string; kySo: number | null }) => [
      s.ngay,
      s.kySo,
    ]),
  ).toEqual([
    ['2026-10-02', 1],
    ['2026-10-09', 1],
    ['2026-10-16', 2],
    // The make-up deducted nothing, so it belongs to no term.
    ['2026-10-23', null],
  ]);
  expect(data.buoiHoc[0]).toMatchObject({
    diemDanhId: marks[0],
    yThucDiem: 8,
    lopTen: 'Lớp Mẫu A1',
  });
  expect(data.tongHop).toMatchObject({
    soBuoiConLai: 9,
    dai: 'binh_thuong',
    canThu: false,
    tongSoBuoiDaMua: 12,
    tongSoBuoiDaHoc: 3,
    tongTienHocPhi: 1200000,
    tongDaThanhToan: 500000,
    tongConNoHocPhi: 700000,
    tienSachDaPhat: 40000,
    tienSachDaNop: 10000,
    quySach: -30000,
    congNoSach: 30000,
  });
  expect(data.sach.cacLanPhat).toMatchObject([
    { kyHieu: 'CT1', tenSach: 'Sách Mẫu 1', tienSach: 40000, uuDai: 10000 },
  ]);

  // The same answer as the package detail for the same package.
  const detail = await json(
    await post(admin, '/goiHoc/chiTiet', { goiHocId: second }),
  );
  expect([detail.data.daDung, detail.data.conLai]).toEqual([
    data.hocPhi.cacKy[1].daDung,
    data.hocPhi.cacKy[1].conLai,
  ]);

  // Student B owes sessions (balance below zero) and needs collecting.
  const b = await json(await post(admin, HO_SO, { hocVienId: ids.hocVienB }));
  expect(b.data.tongHop).toMatchObject({ dai: 'vuot_goi', canThu: true });
  expect((await post(admin, HO_SO, { hocVienId: 999_999 })).status).toBe(404);
  expect((await post(admin, HO_SO, {})).status).toBe(400);
});

test('each role sees only its scope and only the sections its permissions open', async ({
  testApp,
  connection,
}) => {
  const { hlvA, hlvB, managerA, keToan, ids } = await setup(
    testApp,
    connection,
  );
  await fixture(connection, ids);
  const file = (session: Session, hocVienId: number) =>
    post(session, HO_SO, { hocVienId });

  // The branch manager: their branch only, every section.
  const manager = await json(await file(managerA.session, ids.hocVienA));
  expect(manager.data.hocPhi).not.toBeNull();
  expect(manager.data.buoiHoc).toHaveLength(4);
  expect(manager.data.sach).not.toBeNull();
  expect((await file(managerA.session, ids.hocVienB)).status).toBe(404);

  // The accountant: both branches, money and sessions.
  const accountant = await json(await file(keToan.session, ids.hocVienB));
  expect(accountant.data.hocPhi).not.toBeNull();
  expect(accountant.data.buoiHoc).toHaveLength(1);
  expect((await file(keToan.session, ids.hocVienA)).status).toBe(200);

  // A coach: the students of their class, the sessions, and no money and no books.
  const coach = await json(await file(hlvA.session, ids.hocVienA));
  expect(coach.data.buoiHoc).toHaveLength(4);
  expect(coach.data.hocPhi).toBeNull();
  expect(coach.data.sach).toBeNull();
  expect(coach.data.tongHop).toMatchObject({
    soBuoiConLai: 9,
    tongSoBuoiDaHoc: 3,
    tongTienHocPhi: null,
    tienSachDaPhat: null,
  });
  // Another coach, and a student of another class, are "not found".
  expect((await file(hlvB.session, ids.hocVienA)).status).toBe(404);
  expect((await file(hlvA.session, ids.hocVienB)).status).toBe(404);
});

test('the sessions download is an export: permission, formula guard and one log row', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, managerA, keToan, ids } = await setup(
    testApp,
    connection,
  );
  await fixture(connection, ids);
  const download = (session: Session, hocVienId: number) =>
    post(session, XUAT_CSV, { hocVienId });
  const logRows = () =>
    connection.query
      .selectFrom('eduXuatDuLieuNhatKy')
      .select(['userId', 'loai', 'boLoc', 'soDong'])
      .execute();

  // A coach holds no export action: refused, nothing logged.
  expect((await download(hlvA.session, ids.hocVienA)).status).toBe(403);
  expect(await logRows()).toEqual([]);
  // A student outside the scope is "not found" and is not logged.
  expect((await download(managerA.session, ids.hocVienB)).status).toBe(404);
  expect(await logRows()).toEqual([]);

  const response = await download(managerA.session, ids.hocVienA);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/csv');
  const body = await response.text();
  // A comment that starts with "=" is made harmless.
  expect(body).toContain("'=SUM(1)");
  expect(body.trim().split('\r\n')).toHaveLength(5);
  const log = await logRows();
  expect(log).toHaveLength(1);
  expect(log[0]).toMatchObject({
    userId: managerA.id,
    loai: 'ho_so_buoi_hoc_csv',
    soDong: 4,
  });
  expect(JSON.stringify(log[0])).not.toContain('Học viên Mẫu');

  expect((await download(keToan.session, ids.hocVienA)).status).toBe(200);
  expect((await download(admin, ids.hocVienA)).status).toBe(200);
});

test('the tuition tab lists every payment, hides a cancelled opening package and marks a Lark term of unknown price', async ({
  testApp,
  connection,
}) => {
  const { admin, ids } = await setup(testApp, connection);
  const { first, second } = await fixture(connection, ids);
  const q = connection.query;
  // An opening package replaced by the terms of Lark (cancelled), and a Lark term whose payment was not found.
  for (const row of [
    {
      soBuoi: 5,
      ngayMua: '2026-08-01',
      trangThai: 'da_huy',
      loai: 'chuyen_so_du',
      externalId: 'lark:sodu:recMau',
    },
    {
      soBuoi: 4,
      ngayMua: '2026-11-01',
      trangThai: 'hieu_luc',
      loai: 'mua',
      externalId: 'lark:deal:recMau',
    },
  ])
    await q
      .insertInto('eduGoiHoc')
      .values({
        hocVienId: ids.hocVienA,
        donGia: 0,
        thanhTien: 0,
        nguoiTaoId: 'seed',
        ghiChu: 'chuyen_tu_lark',
        ...row,
      })
      .execute();
  // A payment Lark could not place in a term.
  await q
    .insertInto('eduThanhToan')
    .values({
      goiHocId: null,
      hocVienId: ids.hocVienA,
      coSoId: ids.coSoA,
      soTien: 150000,
      hinhThuc: 'khong_ro',
      ngay: '2026-11-02',
      thang: '2026-11',
      nguoiGhiNhanId: 'seed',
    })
    .execute();

  const { data } = await json(
    await post(admin, HO_SO, { hocVienId: ids.hocVienA }),
  );
  const terms = data.hocPhi.cacKy as Record<string, unknown>[];
  expect(
    terms.map((k) => [
      k.goiHocId === first || k.goiHocId === second,
      k.soBuoi,
      k.chuaRoTien,
    ]),
  ).toEqual([
    [true, 2, false],
    [true, 10, false],
    [false, 4, true],
  ]);
  expect(data.tongHop.tongSoBuoiDaMua).toBe(16);
  expect(
    (data.hocPhi.cacLanNop as Record<string, unknown>[]).map((p) => [
      p.ngay,
      p.soTien,
      p.hinhThuc,
      p.kySo,
    ]),
  ).toEqual([
    ['2026-11-02', 150000, 'khong_ro', null],
    ['2026-10-01', 300000, 'tien_mat', 2],
    ['2026-10-01', 200000, 'tien_mat', 1],
  ]);
});
