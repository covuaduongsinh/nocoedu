import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

const TONG_QUAN = '/doiSoat/tongQuan';
const CAN_THU = '/soDu/canhBao';
const CAP_NHAT = '/doiSoat/capNhatBuoiHoc';
const LICH_SU = '/nhanXet/lichSuBuoiHoc';
const AI_GOI_Y = '/nhanXet/aiGoiY';

type Q = Parameters<typeof seedSchool>[0];

async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Q,
) {
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
  await connection.query.deleteFrom('eduSach').allowAllRows().execute();
  return { admin, hlvA, hlvB, managerA, keToan, ids };
}

/**
 * Student A: a 12-session package (600,000 of 1,200,000 paid), three registers (one deducted, a make-up and an excused
 * absence that are not), a parent, a book handed out at a net price of 40,000 (list 50,000 less a discount of 10,000).
 * Student B: one deducted register in the other branch.
 */
async function fixture(
  connection: Q,
  ids: Awaited<ReturnType<typeof setup>>['ids'],
) {
  const q = connection.query;
  const session = async (lopId: number, ngay: string) => {
    await q
      .insertInto('eduBuoiHoc')
      .values({
        lopId,
        ngay,
        gioBatDau: '17:30',
        gioKetThuc: '19:00',
        trangThai: 'da_diem_danh',
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
  const mark = async (
    buoiHocId: number,
    hocVienId: number,
    trangThai: string,
    soBuoiDaTru: number,
    extra: Record<string, unknown> = {},
  ) => {
    await q
      .insertInto('eduDiemDanh')
      .values({
        buoiHocId,
        hocVienId,
        trangThai,
        soBuoiDaTru,
        nhanXet: `Ghi chú ${trangThai}`,
        ...extra,
      })
      .execute();
    return Number(
      (
        await q
          .selectFrom('eduDiemDanh')
          .select('id')
          .where('buoiHocId', '=', buoiHocId)
          .where('hocVienId', '=', hocVienId)
          .executeTakeFirstOrThrow()
      ).id,
    );
  };
  const s1 = await session(ids.lopA, '2026-11-02');
  const s2 = await session(ids.lopA, '2026-11-04');
  const s3 = await session(ids.lopA, '2026-11-06');
  const sB = await session(ids.lopB, '2026-11-03');
  const markA1 = await mark(s1, ids.hocVienA, 'co_mat', 1, { yThucDiem: 8 });
  await mark(s2, ids.hocVienA, 'hoc_bu', 0);
  await mark(s3, ids.hocVienA, 'vang_co_phep', 0);
  const markB1 = await mark(sB, ids.hocVienB, 'co_mat', 1);

  await q
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: 11 })
    .where('id', '=', ids.hocVienA)
    .execute();
  await q
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: -1 })
    .where('id', '=', ids.hocVienB)
    .execute();
  await q
    .insertInto('eduGoiHoc')
    .values({
      hocVienId: ids.hocVienA,
      soBuoi: 12,
      donGia: 100000,
      thanhTien: 1200000,
      ngayMua: '2026-11-01',
      nguoiTaoId: 'x',
    })
    .execute();
  const pack = await q
    .selectFrom('eduGoiHoc')
    .select('id')
    .executeTakeFirstOrThrow();
  await q
    .insertInto('eduThanhToan')
    .values({
      goiHocId: Number(pack.id),
      hocVienId: ids.hocVienA,
      coSoId: ids.coSoA,
      soTien: 600000,
      hinhThuc: 'tien_mat',
      ngay: '2026-11-01',
      thang: '2026-11',
      nguoiGhiNhanId: 'x',
    })
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
      ngay: '2026-11-02',
      uuDai: 10000,
      tienSach: 40000,
      createdAt: new Date(),
    })
    .execute();
  await q
    .insertInto('eduPhuHuynh')
    .values({
      ma: 'PH-A',
      hoTen: 'Phụ huynh Mẫu A',
      soDienThoai: '0900000011',
    })
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
  return { s1, markA1, markB1 };
}

const json = async <T = Record<string, any>>(response: Response): Promise<T> =>
  (await response.json()) as T;

const ledger = async (connection: Q) =>
  connection.query
    .selectFrom('eduSoDuNhatKy')
    .select(['hocVienId', 'thayDoi', 'soDuSau', 'lyDo', 'diemDanhId'])
    .orderBy('id', 'asc')
    .execute();

const balance = async (connection: Q, id: number) =>
  Number(
    (
      await connection.query
        .selectFrom('eduHocVien')
        .select('soBuoiConLai')
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
    ).soBuoiConLai,
  );

test('the reconciliation and history routes answer 401 without a session', async ({
  testApp,
  connection,
  request,
}) => {
  await setup(testApp, connection);
  for (const path of [TONG_QUAN, CAP_NHAT, LICH_SU, AI_GOI_Y, CAN_THU]) {
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

test('the overview shows the scope of the caller, sums the sessions deducted and takes the net price of a book', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, managerA, keToan, ids } = await setup(
    testApp,
    connection,
  );
  await fixture(connection, ids);

  // A coach holds none of the money actions: refused, whatever the class.
  expect((await post(hlvA.session, TONG_QUAN, {})).status).toBe(403);

  const manager = await json(await post(managerA.session, TONG_QUAN, {}));
  expect(manager.data.thongKe.tongHocVien).toBe(1);
  expect(manager.data.danhSach.map((row: { ma: string }) => row.ma)).toEqual([
    'HS-A',
  ]);
  const row = manager.data.danhSach[0];
  // "Studied" is what was deducted: the make-up and the excused absence are not counted.
  expect(row.tongSoBuoiDaHoc).toBe(1);
  expect(row.tongSoBuoiDaMua).toBe(12);
  expect(row.tongTienHocPhi).toBe(1200000);
  expect(row.tongDaThanhToan).toBe(600000);
  expect(row.tongConNoHocPhi).toBe(600000);
  // `tienSach` is already net of the discount: nothing is subtracted twice.
  expect(row.tongTienSachDaPhat).toBe(40000);
  expect(row.congNoSach).toBe(40000);
  expect(row.phuHuynhTen).toBe('Phụ huynh Mẫu A');
  expect(row.lopTen).toBe('Lớp Mẫu A1');
  expect(row.coSoTen).toBe('Cơ sở Mẫu A');

  // The administrator and the accountant see both branches; a filter the manager has no right to is just empty.
  for (const session of [admin, keToan.session]) {
    const all = await json(await post(session, TONG_QUAN, {}));
    expect(all.data.thongKe.tongHocVien).toBe(2);
    expect(all.data.thongKe.soHocVienVuotGoi).toBe(1);
    expect(all.data.danhSach).toHaveLength(2);
  }
  const other = await json(
    await post(managerA.session, TONG_QUAN, { lopId: ids.lopB }),
  );
  expect(other.data.danhSach).toEqual([]);
  const searched = await json(
    await post(admin, TONG_QUAN, { search: 'mau b' }),
  );
  expect(searched.data.danhSach.map((r: { ma: string }) => r.ma)).toEqual([
    'HS-B',
  ]);
});

test('the overview pages the list, keeps the counters whole and agrees with the "need to pay" list', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, managerA, ids } = await setup(testApp, connection);
  await fixture(connection, ids);

  // Page size 1: the list is cut on the server, the counters still cover everyone the caller sees.
  const first = await json(await post(admin, TONG_QUAN, { limit: 1 }));
  expect(first.data.danhSach).toHaveLength(1);
  expect(first.data.tong).toBe(2);
  expect(first.data.thongKe.tongHocVien).toBe(2);
  const second = await json(
    await post(admin, TONG_QUAN, { limit: 1, trang: 2 }),
  );
  expect(second.data.danhSach).toHaveLength(1);
  expect(second.data.danhSach[0].id).not.toBe(first.data.danhSach[0].id);
  expect(
    (await json(await post(admin, TONG_QUAN, { limit: 1, trang: 3 }))).data
      .danhSach,
  ).toEqual([]);
  expect((await post(admin, TONG_QUAN, { limit: 101 })).status).toBe(400);

  // Filtering by a band and the "need to pay" list name the same students with the same threshold.
  const owing = await json(
    await post(admin, TONG_QUAN, { trangThaiLoc: 'vuot_goi' }),
  );
  expect(owing.data.danhSach.map((r: { ma: string }) => r.ma)).toEqual([
    'HS-B',
  ]);
  const collect = await json(await post(admin, CAN_THU, {}));
  expect(collect.data.nguong).toBe(2);
  expect(collect.data.tong).toBe(first.data.thongKe.soHocVienCanThu);
  expect(collect.data.hocVien.map((r: { ma: string }) => r.ma)).toEqual([
    'HS-B',
  ]);
  // A student who left is not chased for a next term, and the list is cut by `limit`.
  await connection.query
    .updateTable('eduHocVien')
    .set({ trangThai: 'da_nghi' })
    .where('id', '=', ids.hocVienB)
    .execute();
  const left = await json(await post(admin, CAN_THU, {}));
  expect(left.data).toMatchObject({ tong: 0, hocVien: [] });
  const stats = await json(await post(admin, TONG_QUAN, {}));
  expect(stats.data.thongKe).toMatchObject({
    soHocVienVuotGoi: 0,
    soHocVienCanThu: 0,
  });

  // The branch manager gets their own branch; a coach is refused the overview.
  expect(
    (await json(await post(managerA.session, CAN_THU, {}))).data.hocVien,
  ).toEqual([]);
  expect((await post(hlvA.session, TONG_QUAN, {})).status).toBe(403);
});

test('the quick edit is limited to the scope, moves the balance only through the ledger and keeps the rule of the session', async ({
  testApp,
  connection,
}) => {
  const { hlvA, managerA, keToan, ids } = await setup(testApp, connection);
  const { markA1, markB1, s1 } = await fixture(connection, ids);

  // An accountant cannot take attendance; a coach or a manager of another class or branch finds nothing.
  expect(
    (
      await post(keToan.session, CAP_NHAT, {
        diemDanhId: markA1,
        trangThai: 'co_mat',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await post(hlvA.session, CAP_NHAT, {
        diemDanhId: markB1,
        trangThai: 'vang_khong_phep',
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await post(managerA.session, CAP_NHAT, {
        diemDanhId: markB1,
        trangThai: 'vang_khong_phep',
      })
    ).status,
  ).toBe(404);
  expect(await balance(connection, ids.hocVienB)).toBe(-1);
  expect(await ledger(connection)).toEqual([]);

  // Editing a note only: the balance of 11 is not recomputed from packages and registers.
  const note = await post(hlvA.session, CAP_NHAT, {
    diemDanhId: markA1,
    trangThai: 'co_mat',
    nhanXet: 'Con làm bài tốt',
    yThucDiem: 9,
  });
  expect(note.status).toBe(200);
  expect((await json(note)).data.soBuoiConLaiMoi).toBe(11);
  expect(await balance(connection, ids.hocVienA)).toBe(11);
  expect(await ledger(connection)).toEqual([]);
  const edited = await connection.query
    .selectFrom('eduDiemDanh')
    .select(['nhanXet', 'yThucDiem', 'soBuoiDaTru'])
    .where('id', '=', markA1)
    .executeTakeFirstOrThrow();
  expect(edited).toEqual({
    nhanXet: 'Con làm bài tốt',
    yThucDiem: 9,
    soBuoiDaTru: 1,
  });

  // A present student becomes an absence without leave: one session comes back, with its ledger row.
  const absent = await json(
    await post(hlvA.session, CAP_NHAT, {
      diemDanhId: markA1,
      trangThai: 'vang_khong_phep',
    }),
  );
  expect(absent.data).toMatchObject({ soBuoiDaTru: 0, soBuoiConLaiMoi: 12 });
  expect(await balance(connection, ids.hocVienA)).toBe(12);
  expect(await ledger(connection)).toEqual([
    {
      hocVienId: ids.hocVienA,
      thayDoi: 1,
      soDuSau: 12,
      lyDo: 'diem_danh_sua',
      diemDanhId: markA1,
    },
  ]);

  // The rule fixed on the session applies: this session deducts an excused absence.
  await connection.query
    .updateTable('eduBuoiHoc')
    .set({ truVangCoPhep: true })
    .where('id', '=', s1)
    .execute();
  await post(managerA.session, CAP_NHAT, {
    diemDanhId: markA1,
    trangThai: 'vang_co_phep',
  });
  expect(await balance(connection, ids.hocVienA)).toBe(11);
  expect((await ledger(connection)).map((row) => row.thayDoi)).toEqual([1, -1]);
});

test('the session history and the review suggestion check the student first', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB, managerA, keToan, ids } = await setup(
    testApp,
    connection,
  );
  await fixture(connection, ids);

  for (const path of [LICH_SU, AI_GOI_Y]) {
    const body = { hocVienId: ids.hocVienA, thang: '2026-11' };
    // Another coach, an accountant and a student of another branch are all refused or "not found".
    expect((await post(hlvB.session, path, body)).status).toBe(404);
    expect(
      (await post(hlvA.session, path, { ...body, hocVienId: ids.hocVienB }))
        .status,
    ).toBe(404);
    expect(
      (await post(managerA.session, path, { ...body, hocVienId: ids.hocVienB }))
        .status,
    ).toBe(404);
    expect((await post(keToan.session, path, body)).status).toBe(403);
    expect((await post(hlvA.session, path, body)).status).toBe(200);
    expect((await post(managerA.session, path, body)).status).toBe(200);
    expect((await post(admin, path, body)).status).toBe(200);
  }

  const history = await json(
    await post(hlvA.session, LICH_SU, {
      hocVienId: ids.hocVienA,
      thang: '2026-11',
    }),
  );
  expect(history.data.thongKe.tongBuoi).toBe(3);
  expect(history.data.thongKe.soBuoiCoMat).toBe(2);
  expect(history.data.thongKe.soBuoiVang).toBe(1);
  // Newest first, with the awareness score of the row the coach may read.
  expect(history.data.danhSach.map((s: { ngay: string }) => s.ngay)).toEqual([
    '2026-11-06',
    '2026-11-04',
    '2026-11-02',
  ]);
  expect(history.data.danhSach[2].yThucDiem).toBe(8);
  expect(history.data.danhSach[0].lopTen).toBe('Lớp Mẫu A1');

  const none = await json(
    await post(hlvA.session, LICH_SU, {
      hocVienId: ids.hocVienA,
      thang: '2026-10',
    }),
  );
  expect(none.data.thongKe.tongBuoi).toBe(0);

  const suggestion = await json(
    await post(hlvA.session, AI_GOI_Y, {
      hocVienId: ids.hocVienA,
      thang: '2026-11',
    }),
  );
  expect(suggestion.data.thongKe).toMatchObject({
    tongBuoi: 3,
    coMat: 2,
    vang: 1,
  });
  expect(suggestion.data.goiY).toContain('2026-11');
});
