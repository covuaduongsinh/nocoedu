import { expect } from 'vitest';

import {
  adminSession,
  idByMa,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

type Json = {
  data?: {
    id?: number;
    created?: number;
    conNo?: number;
    url?: string;
    soBuoiConLai?: number;
    danhSach?: { soBuoiConLai: number; canhBao: boolean }[];
  } & Record<string, unknown>;
};

async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Parameters<typeof seedSchool>[0],
) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'dd-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'dd-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'dd-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'dd-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const q = connection.query;
  await q
    .insertInto('eduBuoiHoc')
    .values({
      lopId: ids.lopA,
      ngay: '2026-11-02',
      gioBatDau: '17:30',
      gioKetThuc: '19:00',
    })
    .execute();
  await q
    .insertInto('eduBuoiHoc')
    .values({
      lopId: ids.lopB,
      ngay: '2026-11-02',
      gioBatDau: '17:30',
      gioKetThuc: '19:00',
    })
    .execute();
  const sessions = await q
    .selectFrom('eduBuoiHoc')
    .select(['id', 'lopId'])
    .execute();
  const sessionOf = (lopId: number) =>
    Number(sessions.find((s: any) => Number(s.lopId) === lopId)!.id);
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

async function resetStudent(
  connection: any,
  hocVienId: number,
  balance: number,
) {
  const q = connection.query;
  await q.deleteFrom('eduSoDuNhatKy').allowAllRows().execute();
  await q.deleteFrom('eduDiemDanh').allowAllRows().execute();
  // The stored rule belongs to a register that was marked; a fresh register stores it again.
  await q
    .updateTable('eduBuoiHoc')
    .set({ truVangCoPhep: null, truVangKhongPhep: null })
    .allowAllRows()
    .execute();
  await q
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: balance })
    .where('id', '=', hocVienId)
    .execute();
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

const ledger = (connection: any) =>
  connection.query
    .selectFrom('eduSoDuNhatKy')
    .select(['thayDoi', 'soDuSau', 'lyDo'])
    .orderBy('id')
    .execute();

test('the balance drops correctly for each of the four attendance cases, with both branch settings', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, sessionA } = await setup(testApp, connection);
  // [status, sessions deducted when an excused absence is free, when it counts]
  const cases = [
    ['co_mat', 1, 1],
    ['vang_co_phep', 0, 1],
    // An absence without leave is not deducted yet (DS-60, confirmed by the head coach).
    ['vang_khong_phep', 0, 0],
    ['hoc_bu', 1, 0],
  ] as const;
  for (const deducts of [false, true]) {
    await connection.query
      .updateTable('eduCoSo')
      .set({ truBuoiVangCoPhep: deducts })
      .where('id', '=', ids.coSoA)
      .execute();
    for (const [status, free, counted] of cases) {
      await resetStudent(connection, ids.hocVienA, 10);
      const saved = await post(hlvA.session, '/diemDanh/luu', {
        buoiHocId: sessionA,
        danhSach: [{ hocVienId: ids.hocVienA, trangThai: status }],
      });
      expect(`${deducts} ${status} ${saved.status}`).toBe(
        `${deducts} ${status} 200`,
      );
      const expected = deducts ? counted : free;
      expect(await balance(connection, ids.hocVienA)).toBe(10 - expected);
      expect(await ledger(connection)).toHaveLength(expected === 0 ? 0 : 1);
    }
  }
});

test('changing a status refunds or deducts only the difference, and saving twice changes nothing', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, sessionA } = await setup(testApp, connection);
  await resetStudent(connection, ids.hocVienA, 10);
  const save = (trangThai: string) =>
    post(hlvA.session, '/diemDanh/luu', {
      buoiHocId: sessionA,
      danhSach: [{ hocVienId: ids.hocVienA, trangThai, nhanXet: 'Tập trung' }],
    });

  expect((await save('co_mat')).status).toBe(200);
  expect((await save('co_mat')).status).toBe(200);
  expect(await balance(connection, ids.hocVienA)).toBe(9);
  expect(await ledger(connection)).toHaveLength(1);

  expect((await save('vang_co_phep')).status).toBe(200);
  expect(await balance(connection, ids.hocVienA)).toBe(10);
  // Present again, then absent without leave: the deduction comes back, so only the difference moves.
  expect((await save('co_mat')).status).toBe(200);
  expect(await balance(connection, ids.hocVienA)).toBe(9);
  expect((await save('vang_khong_phep')).status).toBe(200);
  expect(await balance(connection, ids.hocVienA)).toBe(10);
  expect(await ledger(connection)).toEqual([
    { thayDoi: -1, soDuSau: 9, lyDo: 'diem_danh' },
    { thayDoi: 1, soDuSau: 10, lyDo: 'diem_danh_sua' },
    { thayDoi: -1, soDuSau: 9, lyDo: 'diem_danh' },
    { thayDoi: 1, soDuSau: 10, lyDo: 'diem_danh_sua' },
  ]);
  const rows = await connection.query
    .selectFrom('eduDiemDanh')
    .select('id')
    .execute();
  expect(rows).toHaveLength(1);
});

test('correcting a history row imported from Lark never moves the balance', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, sessionA } = await setup(testApp, connection);
  await resetStudent(connection, ids.hocVienA, 7);
  // A row before the opening balance: its status is recorded, its deduction is already inside the 7.
  await connection.query
    .insertInto('eduDiemDanh')
    .values({
      buoiHocId: sessionA,
      hocVienId: ids.hocVienA,
      trangThai: 'co_mat',
      soBuoiDaTru: 0,
      tinhVaoSoDu: false,
    })
    .execute();
  const save = (trangThai: string) =>
    post(hlvA.session, '/diemDanh/luu', {
      buoiHocId: sessionA,
      danhSach: [{ hocVienId: ids.hocVienA, trangThai }],
    });

  for (const status of ['co_mat', 'vang_co_phep', 'vang_khong_phep']) {
    expect((await save(status)).status).toBe(200);
    expect(await balance(connection, ids.hocVienA)).toBe(7);
  }
  expect(await ledger(connection)).toEqual([]);
  const row = await connection.query
    .selectFrom('eduDiemDanh')
    .select(['trangThai', 'soBuoiDaTru'])
    .executeTakeFirstOrThrow();
  expect(row).toMatchObject({ trangThai: 'vang_khong_phep', soBuoiDaTru: 0 });
});

test('the setting for an absence without leave is fixed on the session at its first save', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, sessionA } = await setup(testApp, connection);
  const save = (trangThai: string) =>
    post(hlvA.session, '/diemDanh/luu', {
      buoiHocId: sessionA,
      danhSach: [{ hocVienId: ids.hocVienA, trangThai }],
    });
  const stored = async () =>
    (
      await connection.query
        .selectFrom('eduBuoiHoc')
        .select('truVangKhongPhep')
        .where('id', '=', sessionA)
        .executeTakeFirstOrThrow()
    ).truVangKhongPhep;
  const previous = process.env.EDU_TRU_BUOI_VANG_KHONG_PHEP;
  try {
    // Setting off at the first save: fixed as "not deducted".
    delete process.env.EDU_TRU_BUOI_VANG_KHONG_PHEP;
    await resetStudent(connection, ids.hocVienA, 10);
    expect(await stored()).toBeNull();
    expect((await save('vang_khong_phep')).status).toBe(200);
    expect(Boolean(await stored())).toBe(false);
    // Turning it on afterwards does not reach this register: still not deducted, and a change to "present" costs 1.
    process.env.EDU_TRU_BUOI_VANG_KHONG_PHEP = 'true';
    expect((await save('vang_khong_phep')).status).toBe(200);
    expect(await balance(connection, ids.hocVienA)).toBe(10);
    // A session that was never saved (null) takes the setting in force at its first save.
    await resetStudent(connection, ids.hocVienA, 10);
    expect((await save('vang_khong_phep')).status).toBe(200);
    expect(Boolean(await stored())).toBe(true);
    expect(await balance(connection, ids.hocVienA)).toBe(9);
    // And switching it off later leaves that register deducting.
    delete process.env.EDU_TRU_BUOI_VANG_KHONG_PHEP;
    expect((await save('vang_khong_phep')).status).toBe(200);
    expect(await balance(connection, ids.hocVienA)).toBe(9);
  } finally {
    if (previous === undefined) delete process.env.EDU_TRU_BUOI_VANG_KHONG_PHEP;
    else process.env.EDU_TRU_BUOI_VANG_KHONG_PHEP = previous;
  }
});

test('two identical saves at once deduct one session', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, sessionA } = await setup(testApp, connection);
  await resetStudent(connection, ids.hocVienA, 10);
  const save = () =>
    post(hlvA.session, '/diemDanh/luu', {
      buoiHocId: sessionA,
      danhSach: [{ hocVienId: ids.hocVienA, trangThai: 'co_mat' }],
    });
  const results = await Promise.all([save(), save()]);
  expect(results.some((r) => r.status === 200)).toBe(true);
  for (const r of results) expect(r.status).toBeLessThan(500);
  expect(await balance(connection, ids.hocVienA)).toBe(9);
  expect(await ledger(connection)).toHaveLength(1);
});

test('a student with two sessions left or fewer is warned about', async ({
  testApp,
  connection,
}) => {
  const { hlvA, hlvB, ids, sessionA } = await setup(testApp, connection);
  await resetStudent(connection, ids.hocVienA, 3);
  await connection.query
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: 1 })
    .where('id', '=', ids.hocVienB)
    .execute();

  const saved = await post(hlvA.session, '/diemDanh/luu', {
    buoiHocId: sessionA,
    danhSach: [{ hocVienId: ids.hocVienA, trangThai: 'co_mat' }],
  });
  const body = (await saved.json()) as Json;
  expect(body.data?.danhSach?.[0]).toMatchObject({
    soBuoiConLai: 2,
    canhBao: true,
  });

  const warned = await post(hlvA.session, '/soDu/canhBao', {});
  expect(warned.status).toBe(200);
  const list = ((await warned.json()) as { data: { ma: string }[] }).data;
  // Only the coach's own class: student B (1 left) is in another class.
  expect(list.map((r) => r.ma)).toEqual(['HS-A']);
  const other = (
    (await (await post(hlvB.session, '/soDu/canhBao', {})).json()) as {
      data: { ma: string }[];
    }
  ).data;
  expect(other.map((r) => r.ma)).toEqual(['HS-B']);

  // Above the threshold: not listed.
  await resetStudent(connection, ids.hocVienA, 6);
  const none = await post(hlvA.session, '/soDu/canhBao', {});
  expect(((await none.json()) as { data: unknown[] }).data).toEqual([]);
});

test('an accountant cannot change attendance and a coach cannot change tuition or reach another class', async ({
  testApp,
  connection,
}) => {
  const { hlvA, hlvB, managerA, keToan, ids, sessionA, sessionB } = await setup(
    testApp,
    connection,
  );
  await resetStudent(connection, ids.hocVienA, 5);
  const register = (sessionId: number) => ({
    buoiHocId: sessionId,
    danhSach: [{ hocVienId: ids.hocVienA, trangThai: 'co_mat' }],
  });

  expect(
    (await post(keToan.session, '/diemDanh/luu', register(sessionA))).status,
  ).toBe(403);
  expect(
    (
      await post(keToan.session, '/buoiHoc/taoTheoLich', {
        lopId: ids.lopA,
        tuNgay: '2026-11-02',
        denNgay: '2026-11-08',
      })
    ).status,
  ).toBe(403);
  // The accountant may read attendance.
  expect((await post(keToan.session, '/diemDanh/findMany', {})).status).toBe(
    200,
  );
  expect(await balance(connection, ids.hocVienA)).toBe(5);

  // A coach of another class: the session is not theirs.
  expect([403, 404]).toContain(
    (await post(hlvB.session, '/diemDanh/luu', register(sessionA))).status,
  );
  expect([403, 404]).toContain(
    (
      await post(hlvA.session, '/diemDanh/luu', {
        buoiHocId: sessionB,
        danhSach: [{ hocVienId: ids.hocVienB, trangThai: 'co_mat' }],
      })
    ).status,
  );

  // A coach neither sells packages nor sees tuition.
  for (const [path, body] of [
    ['/goiHoc/taoMoi', { hocVienId: ids.hocVienA, soBuoi: 10, donGia: 100000 }],
    ['/thanhToan/ghiNhan', { goiHocId: 1, soTien: 1, hinhThuc: 'tien_mat' }],
    ['/goiHoc/findMany', {}],
    ['/thanhToan/findMany', {}],
  ] as const) {
    expect(`${path} ${(await post(hlvA.session, path, body)).status}`).toBe(
      `${path} 403`,
    );
  }
  // A coach does see the ledger of the balance.
  expect((await post(hlvA.session, '/soDuNhatKy/findMany', {})).status).toBe(
    200,
  );
  // A branch manager cannot sell to a student of another branch.
  expect(
    (
      await post(managerA.session, '/goiHoc/taoMoi', {
        hocVienId: ids.hocVienB,
        soBuoi: 10,
        donGia: 100000,
      })
    ).status,
  ).toBe(404);
});

test('an accountant sells a package, records payments and gets a transfer code from the environment', async ({
  testApp,
  connection,
}) => {
  const { keToan, ids } = await setup(testApp, connection);
  await resetStudent(connection, ids.hocVienA, 1);

  const sold = await post(keToan.session, '/goiHoc/taoMoi', {
    hocVienId: ids.hocVienA,
    soBuoi: 10,
    donGia: 150000,
    ngayMua: '2026-11-03',
  });
  expect(sold.status).toBe(201);
  const pack = ((await sold.json()) as Json).data!;
  expect(pack.soBuoiConLai).toBe(11);
  expect(pack.thanhTien).toBe(1_500_000);
  expect(await ledger(connection)).toEqual([
    { thayDoi: 10, soDuSau: 11, lyDo: 'mua_goi' },
  ]);

  const goiHocId = pack.id!;
  const first = await post(keToan.session, '/thanhToan/ghiNhan', {
    goiHocId,
    soTien: 1_000_000,
    hinhThuc: 'chuyen_khoan',
    ngay: '2026-11-04',
  });
  expect(first.status).toBe(201);
  expect(((await first.json()) as Json).data?.conNo).toBe(500_000);
  expect(
    (
      await post(keToan.session, '/thanhToan/ghiNhan', {
        goiHocId,
        soTien: 600_000,
        hinhThuc: 'tien_mat',
      })
    ).status,
  ).toBe(400);

  const saved = await connection.query
    .selectFrom('eduThanhToan')
    .select(['thang', 'hinhThuc', 'coSoId'])
    .execute();
  expect(saved).toEqual([
    { thang: '2026-11', hinhThuc: 'chuyen_khoan', coSoId: ids.coSoA },
  ]);

  // No bank account in the environment: no code. With one: the code carries the amount still due.
  const env = process.env;
  const keep = {
    bank: env.EDU_VIETQR_BANK_ID,
    no: env.EDU_VIETQR_ACCOUNT_NO,
  };
  delete env.EDU_VIETQR_BANK_ID;
  delete env.EDU_VIETQR_ACCOUNT_NO;
  expect(
    (await post(keToan.session, '/thanhToan/vietQr', { goiHocId })).status,
  ).toBe(400);
  env.EDU_VIETQR_BANK_ID = 'TESTBANK';
  env.EDU_VIETQR_ACCOUNT_NO = '0000000000';
  try {
    const qr = await post(keToan.session, '/thanhToan/vietQr', { goiHocId });
    expect(qr.status).toBe(200);
    const data = ((await qr.json()) as Json).data!;
    expect(data.soTien).toBe(500_000);
    expect(String(data.url)).toContain('amount=500000');
    expect(String(data.url)).toContain('TESTBANK-0000000000');
    expect(await idByMa(connection, 'eduHocVien', 'HS-A')).toBe(ids.hocVienA);
  } finally {
    if (keep.bank === undefined) delete env.EDU_VIETQR_BANK_ID;
    else env.EDU_VIETQR_BANK_ID = keep.bank;
    if (keep.no === undefined) delete env.EDU_VIETQR_ACCOUNT_NO;
    else env.EDU_VIETQR_ACCOUNT_NO = keep.no;
  }
});

test('sessions are created from the timetable of a class, once', async ({
  testApp,
  connection,
}) => {
  const { hlvA, hlvB, ids } = await setup(testApp, connection);
  await connection.query.deleteFrom('eduBuoiHoc').allowAllRows().execute();
  // 2 = Monday, 4 = Wednesday.
  for (const thu of [2, 4]) {
    await connection.query
      .insertInto('eduLopLich')
      .values({
        lopId: ids.lopA,
        thu,
        gioBatDau: '17:30',
        gioKetThuc: '19:00',
      })
      .execute();
  }
  const range = {
    lopId: ids.lopA,
    tuNgay: '2026-11-02',
    denNgay: '2026-11-15',
  };
  const first = await post(hlvA.session, '/buoiHoc/taoTheoLich', range);
  expect(first.status).toBe(201);
  expect(((await first.json()) as Json).data?.created).toBe(4);
  const dates = (
    await connection.query
      .selectFrom('eduBuoiHoc')
      .select('ngay')
      .orderBy('ngay')
      .execute()
  ).map((r: { ngay: string }) => r.ngay);
  expect(dates).toEqual([
    '2026-11-02',
    '2026-11-04',
    '2026-11-09',
    '2026-11-11',
  ]);

  const again = await post(hlvA.session, '/buoiHoc/taoTheoLich', range);
  expect(((await again.json()) as Json).data?.created).toBe(0);
  expect([403, 404]).toContain(
    (await post(hlvB.session, '/buoiHoc/taoTheoLich', range)).status,
  );
});

test('changing the branch setting does not move the balance of a register that was already marked', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, sessionA } = await setup(testApp, connection);
  const setRule = (deducts: boolean) =>
    connection.query
      .updateTable('eduCoSo')
      .set({ truBuoiVangCoPhep: deducts })
      .where('id', '=', ids.coSoA)
      .execute();
  const save = (trangThai: string) =>
    post(hlvA.session, '/diemDanh/luu', {
      buoiHocId: sessionA,
      danhSach: [{ hocVienId: ids.hocVienA, trangThai }],
    });

  // Excused absence under "not deducted"; the setting is then switched on and the same register saved again.
  await setRule(false);
  await resetStudent(connection, ids.hocVienA, 10);
  expect((await save('vang_co_phep')).status).toBe(200);
  expect(await balance(connection, ids.hocVienA)).toBe(10);
  await setRule(true);
  expect((await save('vang_co_phep')).status).toBe(200);
  expect(await balance(connection, ids.hocVienA)).toBe(10);
  expect(await ledger(connection)).toHaveLength(0);
  // A new status on that register uses the rule stored on the session (not deducted), so a make-up costs 1, not 0.
  expect((await save('hoc_bu')).status).toBe(200);
  expect(await balance(connection, ids.hocVienA)).toBe(9);

  // The other way round: a make-up under "deducted" costs 0 and stays 0 when the setting is switched off.
  await connection.query
    .updateTable('eduBuoiHoc')
    .set({ truVangCoPhep: null, truVangKhongPhep: null })
    .where('id', '=', sessionA)
    .execute();
  await setRule(true);
  await resetStudent(connection, ids.hocVienA, 10);
  expect((await save('hoc_bu')).status).toBe(200);
  expect(await balance(connection, ids.hocVienA)).toBe(10);
  await setRule(false);
  expect((await save('hoc_bu')).status).toBe(200);
  expect(await balance(connection, ids.hocVienA)).toBe(10);
  expect(await ledger(connection)).toHaveLength(0);
});

test('a package total stays inside a 32-bit column, and two payments at once never exceed the amount due', async ({
  testApp,
  connection,
}) => {
  const { keToan, ids } = await setup(testApp, connection);
  await resetStudent(connection, ids.hocVienA, 0);
  expect(
    (
      await post(keToan.session, '/goiHoc/taoMoi', {
        hocVienId: ids.hocVienA,
        soBuoi: 500,
        donGia: 100_000_000,
      })
    ).status,
  ).toBe(400);
  const sold = await post(keToan.session, '/goiHoc/taoMoi', {
    hocVienId: ids.hocVienA,
    soBuoi: 15,
    donGia: 100_000_000,
  });
  expect(sold.status).toBe(201);
  const goiHocId = ((await sold.json()) as Json).data!.id!;

  const pay = () =>
    post(keToan.session, '/thanhToan/ghiNhan', {
      goiHocId,
      soTien: 1_000_000_000,
      hinhThuc: 'chuyen_khoan',
    });
  const results = await Promise.all([pay(), pay()]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
  const paid = await connection.query
    .selectFrom('eduThanhToan')
    .select('soTien')
    .execute();
  expect(paid.reduce((sum: number, r: any) => sum + Number(r.soTien), 0)).toBe(
    1_000_000_000,
  );
});
