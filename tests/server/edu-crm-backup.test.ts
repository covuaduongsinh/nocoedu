import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

const LEAD = '/edu/crm/lead-sync';
const BACKUP = '/heThong/backup/exportJson';
const RESTORE = '/heThong/backup/importJson';
const ATTENDANCE_CSV = '/diemDanh/xuatCsv';
const TUITION_CSV = '/hocPhi/xuatCsv';

const VN_TODAY = () =>
  new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Parameters<typeof seedSchool>[0],
) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'cb-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'cb-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'cb-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'cb-kt', 'edu_ke_toan');
  const quanTri = await userWithRole(testApp, admin, 'cb-qt', 'edu_quan_tri');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  await connection.query
    .deleteFrom('eduXuatDuLieuNhatKy')
    .allowAllRows()
    .execute();
  return { admin, hlvA, hlvB, managerA, keToan, quanTri, ids };
}

const text = async (response: Response) => response.text();
const lines = (csv: string) =>
  csv
    .replace(/^\uFEFF/u, '')
    .split('\r\n')
    .filter(Boolean);

/** Runs `run` with the CRM secret set (or removed), and puts the environment back. */
async function withCrmToken<T>(
  token: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const before = process.env.EDU_CRM_WEBHOOK_TOKEN;
  if (token === undefined) delete process.env.EDU_CRM_WEBHOOK_TOKEN;
  else process.env.EDU_CRM_WEBHOOK_TOKEN = token;
  try {
    return await run();
  } finally {
    if (before === undefined) delete process.env.EDU_CRM_WEBHOOK_TOKEN;
    else process.env.EDU_CRM_WEBHOOK_TOKEN = before;
  }
}

const lead = (
  request: (path: string, init: RequestInit) => Promise<Response>,
  headers: Record<string, string> = {},
  path = LEAD,
) =>
  request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      ...headers,
    },
    body: JSON.stringify({
      hoTen: 'Phụ huynh Mẫu CRM',
      soDienThoai: '0900000123',
      ghiChu: 'Quan tâm lớp cờ vua',
    }),
  });

test('the CRM webhook is refused without a configured secret, and has no built-in default', async ({
  testApp,
  connection,
  request,
}) => {
  await setup(testApp, connection);
  await withCrmToken(undefined, async () => {
    // The old built-in default must not open the route.
    const response = await lead(request, {
      'x-crm-token': 'nocoedu-crm-secret',
    });
    expect(response.status).toBe(403);
    expect(
      (await response.json()) as { error: { reason?: string } },
    ).toMatchObject({});
  });
  await withCrmToken('   ', async () => {
    expect((await lead(request, { 'x-crm-token': '   ' })).status).toBe(403);
  });
  expect(
    await connection.query.selectFrom('eduLienHe').select('id').execute(),
  ).toHaveLength(0);
});

test('the CRM webhook needs the secret in the header, never in the address', async ({
  testApp,
  connection,
  request,
}) => {
  await setup(testApp, connection);
  await withCrmToken('test-crm-secret-value', async () => {
    expect((await lead(request)).status).toBe(401);
    expect(
      (await lead(request, { 'x-crm-token': 'wrong-secret' })).status,
    ).toBe(401);
    expect(
      (await lead(request, { 'x-crm-token': 'test-crm-secret-value-' })).status,
    ).toBe(401);
    // A secret in the query string is not read.
    expect(
      (await lead(request, {}, `${LEAD}?token=test-crm-secret-value`)).status,
    ).toBe(401);
    expect(
      await connection.query.selectFrom('eduLienHe').select('id').execute(),
    ).toHaveLength(0);

    const ok = await lead(request, { 'x-crm-token': 'test-crm-secret-value' });
    expect(ok.status).toBe(200);
    const rows = await connection.query
      .selectFrom('eduLienHe')
      .select(['trangThai', 'ghiChu', 'coSoId'])
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trangThai).toBe('moi');
    expect(rows[0]?.ghiChu).toBe('[NocoCRM] Quan tâm lớp cờ vua');
    await connection.query.deleteFrom('eduLienHe').allowAllRows().execute();
  });
});

test('the CRM webhook refuses a branch that does not exist and validates the body after the secret', async ({
  testApp,
  connection,
  request,
}) => {
  await setup(testApp, connection);
  await withCrmToken('test-crm-secret-value', async () => {
    const missing = await request(LEAD, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        'x-crm-token': 'test-crm-secret-value',
      },
      body: JSON.stringify({
        hoTen: 'Phụ huynh Mẫu CRM',
        soDienThoai: '0900000123',
        coSoId: 999_999,
      }),
    });
    expect(missing.status).toBe(400);
    const invalid = await request(LEAD, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        'x-crm-token': 'test-crm-secret-value',
      },
      body: JSON.stringify({ hoTen: '' }),
    });
    expect(invalid.status).toBe(400);
  });
});

test('backup and restore: 401 without a session, 403 for everybody but the administrator', async ({
  testApp,
  connection,
  request,
}) => {
  const { hlvA, managerA, keToan } = await setup(testApp, connection);
  for (const path of [BACKUP, RESTORE]) {
    const anonymous = await request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: '{}',
    });
    expect(`${path} ${anonymous.status}`).toBe(`${path} 401`);
    for (const person of [hlvA, managerA, keToan]) {
      const response = await post(
        person.session,
        path,
        path === RESTORE ? { data: {}, xacNhan: 'XAC_NHAN_KHOI_PHUC' } : {},
      );
      expect(`${path} ${response.status}`).toBe(`${path} 403`);
    }
  }
  // Nothing was logged or restored by the refused calls.
  expect(
    await connection.query
      .selectFrom('eduXuatDuLieuNhatKy')
      .select('id')
      .execute(),
  ).toHaveLength(0);
});

test('the administrator takes a snapshot of every table, and the use is logged', async ({
  testApp,
  connection,
}) => {
  const { admin, quanTri, ids } = await setup(testApp, connection);
  for (const session of [admin, quanTri.session]) {
    const response = await post(session, BACKUP, {});
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        tongSoBang: number;
        soBanGhi: number;
        duLieu: Record<string, { id: number }[]>;
      };
    };
    expect(body.data.tongSoBang).toBe(Object.keys(body.data.duLieu).length);
    expect(body.data.duLieu.eduCoSo?.map((row) => row.id).sort()).toEqual(
      [ids.coSoA, ids.coSoB].sort(),
    );
    expect(body.data.duLieu.eduHocVien).toHaveLength(2);
  }
  const log = await connection.query
    .selectFrom('eduXuatDuLieuNhatKy')
    .select(['loai', 'soDong'])
    .execute();
  expect(log.map((row) => row.loai)).toEqual(['sao_luu_json', 'sao_luu_json']);
  expect(Number(log[0]?.soDong)).toBeGreaterThan(0);
});

test('a restore writes only the tables of a snapshot, needs the confirmation, and is logged', async ({
  testApp,
  connection,
}) => {
  const { admin } = await setup(testApp, connection);
  const sachId = 900_001;
  await connection.query.deleteFrom('eduSach').allowAllRows().execute();

  const unconfirmed = await post(admin, RESTORE, {
    data: {},
    xacNhan: 'yes',
  });
  expect(unconfirmed.status).toBe(400);

  const response = await post(admin, RESTORE, {
    xacNhan: 'XAC_NHAN_KHOI_PHUC',
    data: {
      eduSach: [
        {
          id: sachId,
          kyHieu: 'SACH-KP1',
          ten: 'Sách Mẫu Khôi phục',
          giaBia: 1000,
          giaBan: 800,
          trangThai: 'dang_ban',
        },
      ],
      // Not tables of a snapshot: ignored, never written.
      eduXuatDuLieuNhatKy: [
        { userId: 'x', loai: 'gia', soDong: 1, createdAt: new Date() },
      ],
      users: [{ id: 'x', email: 'x@example.com' }],
    },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: { tongKhoiPhuc: number; boQua: number };
  };
  expect(body.data.tongKhoiPhuc).toBe(1);
  expect(
    await connection.query
      .selectFrom('eduSach')
      .select('kyHieu')
      .where('kyHieu', '=', 'SACH-KP1')
      .execute(),
  ).toHaveLength(1);
  const log = await connection.query
    .selectFrom('eduXuatDuLieuNhatKy')
    .select(['loai', 'soDong'])
    .execute();
  expect(log).toEqual([{ loai: 'khoi_phuc_json', soDong: 1 }]);

  // The same snapshot again: the row is already there, so it is left as it is, not duplicated.
  const again = (await (
    await post(admin, RESTORE, {
      xacNhan: 'XAC_NHAN_KHOI_PHUC',
      data: {
        eduSach: [
          {
            id: sachId,
            kyHieu: 'SACH-KP1',
            ten: 'Sách Mẫu Khôi phục',
            giaBia: 1000,
            giaBan: 800,
            trangThai: 'dang_ban',
          },
        ],
      },
    })
  ).json()) as { data: { tongKhoiPhuc: number; boQua: number } };
  expect(again.data).toMatchObject({ tongKhoiPhuc: 0, boQua: 1 });
  await connection.query.deleteFrom('eduSach').allowAllRows().execute();
});

/** One session in each branch today, one attendance row each; the student of A has a formula for a name. */
async function attendanceFixture(
  connection: Parameters<typeof seedSchool>[0],
  ids: Awaited<ReturnType<typeof seedSchool>>,
) {
  const q = connection.query;
  await q
    .updateTable('eduHocVien')
    .set({ hoTen: '=Học viên Mẫu A' })
    .where('id', '=', ids.hocVienA)
    .execute();
  for (const [lopId, hocVienId, nhanXet] of [
    [ids.lopA, ids.hocVienA, '+gõ công thức'],
    [ids.lopB, ids.hocVienB, 'Nhận xét B'],
  ] as const) {
    await q
      .insertInto('eduBuoiHoc')
      .values({
        lopId,
        ngay: VN_TODAY(),
        gioBatDau: '17:30',
        gioKetThuc: '19:00',
        trangThai: 'da_diem_danh',
      })
      .execute();
    const session = await q
      .selectFrom('eduBuoiHoc')
      .select('id')
      .where('lopId', '=', lopId)
      .executeTakeFirstOrThrow();
    await q
      .insertInto('eduDiemDanh')
      .values({
        buoiHocId: Number(session.id),
        hocVienId,
        trangThai: 'co_mat',
        daLamBtvn: true,
        nhanXet,
        soBuoiDaTru: 1,
      })
      .execute();
  }
}

test('the attendance export needs the export action and 401 without a session', async ({
  testApp,
  connection,
  request,
}) => {
  const { hlvA, hlvB, ids } = await setup(testApp, connection);
  await attendanceFixture(connection, ids);
  const anonymous = await request(ATTENDANCE_CSV, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: '{}',
  });
  expect(anonymous.status).toBe(401);
  // A coach sees attendance on screen but may not take the file, not even of their own class.
  for (const coach of [hlvA, hlvB]) {
    expect((await post(coach.session, ATTENDANCE_CSV, {})).status).toBe(403);
    expect(
      (await post(coach.session, ATTENDANCE_CSV, { lopId: ids.lopA })).status,
    ).toBe(403);
  }
  expect(
    await connection.query
      .selectFrom('eduXuatDuLieuNhatKy')
      .select('id')
      .execute(),
  ).toHaveLength(0);
});

test('the attendance export holds only what the caller sees, is logged, and neutralizes formulas', async ({
  testApp,
  connection,
}) => {
  const { admin, managerA, keToan, ids } = await setup(testApp, connection);
  await attendanceFixture(connection, ids);

  const manager = await post(managerA.session, ATTENDANCE_CSV, {});
  expect(manager.status).toBe(200);
  expect(manager.headers.get('content-type')).toContain('text/csv');
  const managerLines = lines(await text(manager));
  expect(managerLines).toHaveLength(2);
  expect(managerLines[1]).toContain('HS-A');
  // A formula in a name or a note is written as text, never as a formula.
  expect(managerLines[1]).toContain("'=Học viên Mẫu A");
  expect(managerLines[1]).toContain("'+gõ công thức");
  expect(managerLines.join('\n')).not.toContain('HS-B');
  expect(managerLines.join('\n')).not.toContain('Nhận xét B');

  // A class or a branch outside the scope is refused, not silently empty.
  expect(
    (await post(managerA.session, ATTENDANCE_CSV, { lopId: ids.lopB })).status,
  ).toBe(403);

  // The accountant and the administrator see both branches; one class narrows it.
  for (const session of [keToan.session, admin]) {
    expect(
      lines(await text(await post(session, ATTENDANCE_CSV, {}))),
    ).toHaveLength(3);
  }
  const oneClass = lines(
    await text(await post(admin, ATTENDANCE_CSV, { lopId: ids.lopB })),
  );
  expect(oneClass).toHaveLength(2);
  expect(oneClass[1]).toContain('HS-B');

  // Each successful export is one log row: who, which export, how many rows; never a name.
  const log = await connection.query
    .selectFrom('eduXuatDuLieuNhatKy')
    .select(['userId', 'loai', 'soDong', 'boLoc'])
    .where('loai', '=', 'diem_danh_csv')
    .execute();
  expect(log).toHaveLength(4);
  const managerLog = log.find((row) => row.userId === managerA.id);
  expect(Number(managerLog?.soDong)).toBe(1);
  expect(JSON.stringify(log)).not.toContain('Học viên');
  expect(JSON.stringify(log)).not.toContain('HS-');
});

test('the attendance export defaults to the current month and rejects a malformed month', async ({
  testApp,
  connection,
}) => {
  const { admin, ids } = await setup(testApp, connection);
  await attendanceFixture(connection, ids);
  // An old session is outside the default month.
  await connection.query
    .insertInto('eduBuoiHoc')
    .values({
      lopId: ids.lopA,
      ngay: '2020-01-05',
      gioBatDau: '17:30',
      gioKetThuc: '19:00',
      trangThai: 'da_diem_danh',
    })
    .execute();
  const old = await connection.query
    .selectFrom('eduBuoiHoc')
    .select('id')
    .where('ngay', '=', '2020-01-05')
    .executeTakeFirstOrThrow();
  await connection.query
    .insertInto('eduDiemDanh')
    .values({
      buoiHocId: Number(old.id),
      hocVienId: ids.hocVienA,
      trangThai: 'vang_co_phep',
      soBuoiDaTru: 0,
    })
    .execute();
  expect(lines(await text(await post(admin, ATTENDANCE_CSV, {})))).toHaveLength(
    3,
  );
  const january = lines(
    await text(await post(admin, ATTENDANCE_CSV, { thang: '2020-01' })),
  );
  expect(january).toHaveLength(2);
  expect(january[1]).toContain('Vắng có phép');
  expect((await post(admin, ATTENDANCE_CSV, { thang: '2020-13' })).status).toBe(
    400,
  );
});

async function tuitionFixture(
  connection: Parameters<typeof seedSchool>[0],
  ids: Awaited<ReturnType<typeof seedSchool>>,
) {
  const q = connection.query;
  await q
    .updateTable('eduHocVien')
    .set({ hoTen: '@Học viên Mẫu A' })
    .where('id', '=', ids.hocVienA)
    .execute();
  for (const hocVienId of [ids.hocVienA, ids.hocVienB]) {
    await q
      .insertInto('eduGoiHoc')
      .values({
        hocVienId,
        soBuoi: 12,
        donGia: 100000,
        thanhTien: 1200000,
        ngayMua: VN_TODAY(),
        nguoiTaoId: 'x',
      })
      .execute();
  }
}

test('the tuition export: 401, 403 without the export action, scope and log', async ({
  testApp,
  connection,
  request,
}) => {
  const { admin, hlvA, managerA, keToan, ids } = await setup(
    testApp,
    connection,
  );
  await tuitionFixture(connection, ids);
  const anonymous = await request(TUITION_CSV, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: '{}',
  });
  expect(anonymous.status).toBe(401);
  expect((await post(hlvA.session, TUITION_CSV, {})).status).toBe(403);

  const manager = lines(
    await text(await post(managerA.session, TUITION_CSV, {})),
  );
  expect(manager).toHaveLength(2);
  expect(manager[1]).toContain('HS-A');
  expect(manager[1]).toContain("'@Học viên Mẫu A");
  expect(manager.join('\n')).not.toContain('HS-B');
  expect(
    (await post(managerA.session, TUITION_CSV, { coSoId: ids.coSoB })).status,
  ).toBe(403);

  for (const session of [keToan.session, admin]) {
    expect(
      lines(await text(await post(session, TUITION_CSV, {}))),
    ).toHaveLength(3);
  }
  const branchB = lines(
    await text(await post(admin, TUITION_CSV, { coSoId: ids.coSoB })),
  );
  expect(branchB).toHaveLength(2);
  expect(branchB[1]).toContain('HS-B');

  const log = await connection.query
    .selectFrom('eduXuatDuLieuNhatKy')
    .select(['userId', 'soDong', 'boLoc'])
    .where('loai', '=', 'hoc_phi_csv')
    .execute();
  expect(log).toHaveLength(4);
  expect(JSON.stringify(log)).not.toContain('Học viên');
});

type Snapshot = {
  data: {
    phienBan: string;
    tongSoBang: number;
    soBanGhi: number;
    duLieu: Record<string, Record<string, unknown>[]>;
  };
};

/** A row in every one of the 21 tables of a snapshot (made-up data), on top of what `seedSchool` made. */
async function everyTable(
  connection: Parameters<typeof seedSchool>[0],
  ids: Awaited<ReturnType<typeof seedSchool>>,
  hlvId: string,
) {
  const q = connection.query;
  const one = async (table: string, where: [string, string | number]) =>
    Number(
      (
        await q
          .selectFrom(table)
          .select('id')
          .where(where[0], '=', where[1])
          .executeTakeFirstOrThrow()
      ).id,
    );
  await q
    .insertInto('eduLopLich')
    .values({
      lopId: ids.lopA,
      thu: 2,
      gioBatDau: '17:30',
      gioKetThuc: '19:00',
    })
    .execute();
  await q
    .insertInto('eduHocVienLenCap')
    .values({
      hocVienId: ids.hocVienA,
      tuLevelKey: 'tot',
      denLevelKey: 'ma',
      ngay: '2026-11-01',
      nguoiXacNhanId: hlvId,
    })
    .execute();
  await q
    .insertInto('eduPhuHuynh')
    .values({ ma: 'PH-X', hoTen: 'Phụ huynh Mẫu X', soDienThoai: '0900000077' })
    .execute();
  const parentId = await one('eduPhuHuynh', ['ma', 'PH-X']);
  await q
    .insertInto('eduHocVienPhuHuynh')
    .values({
      hocVienId: ids.hocVienA,
      phuHuynhId: parentId,
      quanHe: 'me',
      lienHeChinh: true,
    })
    .execute();
  await q
    .insertInto('eduDongY')
    .values({
      hocVienId: ids.hocVienA,
      phuHuynhId: parentId,
      mucDich: 'hoc_tap',
      dongY: true,
      treDongY: false,
      phienBanDieuKhoan: 'v1',
      thoiDiem: new Date('2026-11-01T03:00:00.000Z'),
      kenh: 'giay',
      nguoiGhiNhanId: hlvId,
    })
    .execute();
  await q
    .insertInto('eduBuoiHoc')
    .values({
      lopId: ids.lopA,
      ngay: '2026-11-02',
      gioBatDau: '17:30',
      gioKetThuc: '19:00',
      trangThai: 'da_diem_danh',
    })
    .execute();
  const sessionId = await one('eduBuoiHoc', ['lopId', ids.lopA]);
  await q
    .insertInto('eduDiemDanh')
    .values({
      buoiHocId: sessionId,
      hocVienId: ids.hocVienA,
      trangThai: 'co_mat',
      daLamBtvn: true,
      nhanXet: 'Ghi chú mẫu',
      soBuoiDaTru: 1,
    })
    .execute();
  const markId = await one('eduDiemDanh', ['buoiHocId', sessionId]);
  await q
    .insertInto('eduGoiHoc')
    .values({
      hocVienId: ids.hocVienA,
      soBuoi: 12,
      donGia: 100000,
      thanhTien: 1200000,
      ngayMua: '2026-11-01',
      nguoiTaoId: hlvId,
    })
    .execute();
  const packId = await one('eduGoiHoc', ['hocVienId', ids.hocVienA]);
  await q
    .insertInto('eduThanhToan')
    .values({
      goiHocId: packId,
      hocVienId: ids.hocVienA,
      coSoId: ids.coSoA,
      soTien: 600000,
      hinhThuc: 'tien_mat',
      ngay: '2026-11-01',
      thang: '2026-11',
      nguoiGhiNhanId: hlvId,
    })
    .execute();
  await q
    .insertInto('eduSoDuNhatKy')
    .values({
      hocVienId: ids.hocVienA,
      thayDoi: -1,
      soDuSau: 11,
      lyDo: 'diem_danh',
      diemDanhId: markId,
      nguoiThucHienId: hlvId,
      createdAt: new Date('2026-11-02T10:30:00.000Z'),
    })
    .execute();
  await q
    .insertInto('eduNhanXetThang')
    .values({
      hocVienId: ids.hocVienA,
      lopId: ids.lopA,
      hlvId,
      thang: '2026-11',
      noiDung: 'Nhận xét mẫu',
      trangThai: 'nhap',
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
  const bookId = await one('eduSach', ['kyHieu', 'CT1']);
  await q
    .insertInto('eduPhatSach')
    .values({
      hocVienId: ids.hocVienA,
      sachId: bookId,
      coSoId: ids.coSoA,
      ngay: '2026-11-02',
      uuDai: 10000,
      tienSach: 40000,
      createdAt: new Date('2026-11-02T10:00:00.000Z'),
    })
    .execute();
  await q
    .insertInto('eduNopSach')
    .values({
      hocVienId: ids.hocVienA,
      coSoId: ids.coSoA,
      ngay: '2026-11-03',
      soTien: 40000,
      createdAt: new Date('2026-11-03T10:00:00.000Z'),
    })
    .execute();
  await q
    .insertInto('eduSachHoc')
    .values({ hocVienId: ids.hocVienA, sachId: bookId, trangThai: 'dang_hoc' })
    .execute();
  await q
    .insertInto('eduLienHe')
    .values({
      hoTen: 'Phụ huynh Mẫu Y',
      soDienThoai: '0900000088',
      coSoId: ids.coSoA,
      kenh: 'Facebook',
      trangThai: 'moi',
      ngayTao: '2026-11-04',
    })
    .execute();
  await q
    .insertInto('eduHoSoGv')
    .values({
      userId: hlvId,
      tenVietTat: 'HLV Mẫu',
      viTri: 'HLV',
      tinhTrang: 'dang_lam',
      thuLaoMotBuoi: 150000,
    })
    .execute();
}

test('a snapshot holds all 21 tables and restoring it brings every one of them back', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, ids } = await setup(testApp, connection);
  await everyTable(connection, ids, hlvA.id);

  const before = (await (await post(admin, BACKUP, {})).json()) as Snapshot;
  expect(before.data.phienBan).toBe('2.0');
  expect(before.data.tongSoBang).toBe(21);
  for (const table of Object.keys(before.data.duLieu)) {
    expect(
      before.data.duLieu[table]?.length,
      `${table} has a row in the snapshot`,
    ).toBeGreaterThan(0);
  }

  // Empty the database table by table, children first.
  for (const table of [...Object.keys(before.data.duLieu)].reverse()) {
    await connection.query.deleteFrom(table).allowAllRows().execute();
  }

  const check = (await (
    await post(admin, RESTORE, {
      xacNhan: 'XAC_NHAN_KHOI_PHUC',
      phienBan: before.data.phienBan,
      data: before.data.duLieu,
      chiKiemTra: true,
    })
  ).json()) as { data: { moi: number; trung: number; chiKiemTra: boolean } };
  // A check writes nothing.
  expect(check.data).toMatchObject({
    chiKiemTra: true,
    moi: before.data.soBanGhi,
    trung: 0,
  });
  expect(
    await connection.query.selectFrom('eduHocVien').select('id').execute(),
  ).toHaveLength(0);

  const restored = (await (
    await post(admin, RESTORE, {
      xacNhan: 'XAC_NHAN_KHOI_PHUC',
      phienBan: before.data.phienBan,
      data: before.data.duLieu,
    })
  ).json()) as {
    data: { tongKhoiPhuc: number; boQua: number; dayTuTangDaDat: boolean };
  };
  expect(restored.data).toMatchObject({
    tongKhoiPhuc: before.data.soBanGhi,
    boQua: 0,
    dayTuTangDaDat: true,
  });
  const after = (await (await post(admin, BACKUP, {})).json()) as Snapshot;
  expect(after.data.duLieu).toEqual(before.data.duLieu);

  // A second restore of the same file adds nothing.
  const twice = (await (
    await post(admin, RESTORE, {
      xacNhan: 'XAC_NHAN_KHOI_PHUC',
      data: before.data.duLieu,
    })
  ).json()) as { data: { tongKhoiPhuc: number; boQua: number } };
  expect(twice.data).toMatchObject({
    tongKhoiPhuc: 0,
    boQua: before.data.soBanGhi,
  });

  // The ids of new rows go on after the restored ones (on PostgreSQL the sequences were moved).
  const maxBefore = Math.max(
    ...before.data.duLieu.eduPhuHuynh.map((row) => Number(row.id)),
  );
  await connection.query
    .insertInto('eduPhuHuynh')
    .values({
      ma: 'PH-MOI',
      hoTen: 'Phụ huynh Mẫu Mới',
      soDienThoai: '0900000099',
    })
    .execute();
  const created = await connection.query
    .selectFrom('eduPhuHuynh')
    .select('id')
    .where('ma', '=', 'PH-MOI')
    .executeTakeFirstOrThrow();
  expect(Number(created.id)).toBeGreaterThan(maxBefore);
  expect(
    await connection.query
      .selectFrom('eduXuatDuLieuNhatKy')
      .select('loai')
      .where('loai', '=', 'khoi_phuc_json')
      .execute(),
  ).toHaveLength(2);
});

test('a snapshot that is not valid is refused before anything is written', async ({
  testApp,
  connection,
}) => {
  const { admin } = await setup(testApp, connection);
  await connection.query.deleteFrom('eduSach').allowAllRows().execute();
  const book = {
    id: 910_001,
    kyHieu: 'SACH-LOI',
    ten: 'Sách Mẫu Lỗi',
    giaBia: 1,
    giaBan: 1,
    trangThai: 'dang_ban',
  };
  const send = (data: unknown, extra: Record<string, unknown> = {}) =>
    post(admin, RESTORE, { xacNhan: 'XAC_NHAN_KHOI_PHUC', data, ...extra });
  const count = async () =>
    (await connection.query.selectFrom('eduSach').select('id').execute())
      .length;

  // An unknown column, a missing id, an id twice, and a file from a version this application cannot read.
  expect((await send({ eduSach: [{ ...book, cotLa: 1 }] })).status).toBe(400);
  expect(
    (
      await send({
        eduSach: [
          {
            kyHieu: 'X',
            ten: 'X',
            giaBia: 1,
            giaBan: 1,
            trangThai: 'dang_ban',
          },
        ],
      })
    ).status,
  ).toBe(400);
  expect(
    (await send({ eduSach: [book, { ...book, kyHieu: 'SACH-LOI-2' }] })).status,
  ).toBe(400);
  expect((await send({ eduSach: [book] }, { phienBan: '9.9' })).status).toBe(
    400,
  );
  expect(await count()).toBe(0);
});

test('a restore that cannot be completed writes nothing at all', async ({
  testApp,
  connection,
}) => {
  const { admin, ids } = await setup(testApp, connection);
  await connection.query.deleteFrom('eduSach').allowAllRows().execute();
  // A valid book first, then a class that points at a branch that does not exist: the whole restore is refused.
  const response = await post(admin, RESTORE, {
    xacNhan: 'XAC_NHAN_KHOI_PHUC',
    data: {
      eduLop: [
        {
          id: 920_001,
          ma: 'L-MA-COI',
          ten: 'Lớp Mẫu Mồ Côi',
          coSoId: 999_999,
          levelKey: 'tot',
          levelOrder: 1,
          trangThai: 'dang_mo',
        },
      ],
      eduSach: [
        {
          id: 920_002,
          kyHieu: 'SACH-KO',
          ten: 'Sách Mẫu',
          giaBia: 1,
          giaBan: 1,
          trangThai: 'dang_ban',
        },
      ],
    },
  });
  expect(response.status).toBe(400);
  expect(await response.text()).toContain('EDU_BACKUP_RESTORE_FAILED');
  expect(
    await connection.query.selectFrom('eduSach').select('id').execute(),
  ).toHaveLength(0);
  expect(
    await connection.query
      .selectFrom('eduLop')
      .select('id')
      .where('ma', '=', 'L-MA-COI')
      .execute(),
  ).toHaveLength(0);
  expect(ids.coSoA).toBeGreaterThan(0);
});

test('after a restore with high ids, the next row gets a higher id (the sequences move on PostgreSQL)', async ({
  testApp,
  connection,
}) => {
  const { admin } = await setup(testApp, connection);
  await connection.query.deleteFrom('eduSach').allowAllRows().execute();
  const response = await post(admin, RESTORE, {
    xacNhan: 'XAC_NHAN_KHOI_PHUC',
    data: {
      eduSach: [
        {
          id: 5000,
          kyHieu: 'SACH-ID-CAO',
          ten: 'Sách Mẫu Id Cao',
          giaBia: 1,
          giaBan: 1,
          trangThai: 'dang_ban',
        },
      ],
    },
  });
  expect(response.status).toBe(200);
  expect(
    ((await response.json()) as { data: { dayTuTangDaDat: boolean } }).data
      .dayTuTangDaDat,
  ).toBe(true);
  await connection.query
    .insertInto('eduSach')
    .values({
      kyHieu: 'SACH-MOI',
      ten: 'Sách Mẫu Mới',
      giaBia: 1,
      giaBan: 1,
      trangThai: 'dang_ban',
    })
    .execute();
  const created = await connection.query
    .selectFrom('eduSach')
    .select('id')
    .where('kyHieu', '=', 'SACH-MOI')
    .executeTakeFirstOrThrow();
  expect(Number(created.id)).toBeGreaterThan(5000);
  await connection.query.deleteFrom('eduSach').allowAllRows().execute();
});
