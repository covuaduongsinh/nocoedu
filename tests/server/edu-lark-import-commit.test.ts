import { expect } from 'vitest';

import { chayNhap, USAGE_ERROR_CODES } from '../../server/edu/lark/nhap.js';
import { test } from '../helpers/edu.js';
import { fixtureSource, IDS } from '../helpers/lark-fixture.js';

// Runs on the real application with SQLite. Every value is made up (tests/helpers/lark-fixture.ts).

const TABLES = [
  'eduCoSo',
  'eduLop',
  'eduLopLich',
  'eduPhuHuynh',
  'eduHocVien',
  'eduHocVienPhuHuynh',
  'eduGoiHoc',
  'eduBuoiHoc',
  'eduDiemDanh',
  'eduSoDuNhatKy',
  'eduNhapLarkNhatKy',
  'eduSachHoc',
  'eduPhatSach',
  'eduNopSach',
] as const;

async function reset(connection: any): Promise<void> {
  for (const table of [
    'eduNhapLarkNhatKy',
    'eduNhanXetThang',
    'eduSoDuNhatKy',
    'eduThanhToan',
    'eduGoiHoc',
    'eduDiemDanh',
    'eduBuoiHoc',
    'eduDongY',
    'eduHocVienPhuHuynh',
    'eduPhuHuynh',
    'eduHocVienLenCap',
    'eduHocVien',
    'eduLopLich',
    'eduLop',
    'eduCoSoQuanLy',
    'eduCoSo',
  ])
    await connection.query.deleteFrom(table).allowAllRows().execute();
}

async function counts(connection: any): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of TABLES)
    out[table] = (
      await connection.query.selectFrom(table).select('id').execute()
    ).length;
  return out;
}

const adminId = async (connection: any): Promise<string> =>
  String(
    (
      await connection.query
        .selectFrom('user')
        .select('id')
        .executeTakeFirstOrThrow()
    ).id,
  );

const options = (userId: string) => ({ commit: true, userId, delayMs: 0 });
const dry = { commit: false, userId: null, delayMs: 0 };

test('a dry run reads and plans but writes nothing, not even the log', async ({
  database,
  connection,
}) => {
  await reset(connection);
  const report = await chayNhap(database, fixtureSource(), dry);
  expect(report.mode).toBe('dry-run');
  expect(report.tables.hocVien).toMatchObject({ tao: 4, loi: 1 });
  expect(report.balance).toMatchObject({ match: 0, differ: 2, unknown: 2 });
  // The two empty rows of the 2026 table are counted as warnings; the mark with no student is the one error.
  expect(report.warnings).toContainEqual(
    expect.objectContaining({
      table: 'diemDanh',
      code: 'DONG_TRONG',
      count: 2,
    }),
  );
  expect(report.problems).toContainEqual(
    expect.objectContaining({
      table: 'diemDanh',
      code: 'HOC_VIEN_KHONG_RO',
      count: 1,
    }),
  );
  expect(Object.values(await counts(connection)).every((n) => n === 0)).toBe(
    true,
  );
});

test('--commit writes the plan once, with the ledger and the log; a second run adds nothing', async ({
  database,
  connection,
}) => {
  await reset(connection);
  const userId = await adminId(connection);
  const report = await chayNhap(database, fixtureSource(), options(userId));
  expect(report.written).toMatchObject({
    coSo: 2,
    lop: 2,
    lopLich: 2,
    phuHuynh: 1,
    hocVien: 4,
    goiHoc: 2,
    buoiHoc: 6,
    diemDanh: 7,
  });

  const q = connection.query;
  const students = await q
    .selectFrom('eduHocVien')
    .select([
      'ma',
      'hoTen',
      'ngaySinh',
      'namSinh',
      'levelKey',
      'trangThai',
      'soBuoiConLai',
      'externalId',
      'externalCode',
    ])
    .execute();
  const s1 = students.find((s: any) => s.externalId === IDS.s1);
  expect(s1).toMatchObject({
    hoTen: 'Học Viên Mẫu 01',
    ngaySinh: '2016-05-20',
    namSinh: 2016,
    levelKey: 'tot',
    trangThai: 'dang_hoc',
    soBuoiConLai: 3,
    externalCode: 'HV-20240101-001',
  });
  expect(s1.ma).toMatch(/^HS\d{5}$/u);
  expect(students.find((s: any) => s.externalId === IDS.s2)).toMatchObject({
    levelKey: 'ma',
    trangThai: 'hoc_thu',
    soBuoiConLai: 2,
  });
  expect(students.find((s: any) => s.externalId === IDS.s5)).toMatchObject({
    soBuoiConLai: 0,
  });

  // Siblings share one parent; the parent's code and email were set.
  const parents = await q
    .selectFrom('eduPhuHuynh')
    .select(['ma', 'soDienThoai', 'zalo', 'email', 'externalId'])
    .execute();
  expect(parents).toHaveLength(1);
  expect(parents[0]).toMatchObject({
    soDienThoai: '0900000001',
    zalo: '0900000011',
    externalId: `lark:contact:${IDS.contactMe}`,
  });
  expect(parents[0].ma).toMatch(/^PH\d{5}$/u);
  expect(
    await q.selectFrom('eduHocVienPhuHuynh').select('id').execute(),
  ).toHaveLength(2);

  // Opening packages and the ledger: +5 then −1 −1 for the first student, +4 then −1 for the sibling.
  const packages = await q
    .selectFrom('eduGoiHoc')
    .select(['soBuoi', 'loai', 'ghiChu', 'nguoiTaoId', 'donGia', 'ngayMua'])
    .execute();
  expect(packages).toHaveLength(2);
  expect(
    packages.every(
      (p: any) =>
        p.loai === 'chuyen_so_du' && p.donGia === 0 && p.nguoiTaoId === userId,
    ),
  ).toBe(true);
  const ledger = await q
    .selectFrom('eduSoDuNhatKy')
    .select(['lyDo', 'thayDoi', 'soDuSau', 'nguoiThucHienId'])
    .orderBy('id')
    .execute();
  expect(ledger.map((l: any) => [l.lyDo, l.thayDoi, l.soDuSau])).toEqual([
    ['chuyen_tu_lark', 5, 5],
    ['diem_danh', -1, 4],
    ['diem_danh', -1, 3],
    ['chuyen_tu_lark', 4, 4],
    ['diem_danh', -1, 3],
    // The 2026 table is read like the others.
    ['diem_danh', -1, 2],
  ]);
  expect(ledger.every((l: any) => l.nguoiThucHienId === userId)).toBe(true);

  // History before the cut-off is stored but never moves the balance; the rule is fixed on each session.
  const attendance = await q
    .selectFrom('eduDiemDanh')
    .select([
      'externalId',
      'tinhVaoSoDu',
      'soBuoiDaTru',
      'yThucDiem',
      'daLamBtvn',
      'trangThai',
    ])
    .execute();
  const before = attendance.find(
    (a: any) => a.externalId === 'recNhanXet2024a',
  );
  expect(before).toMatchObject({
    soBuoiDaTru: 0,
    yThucDiem: 8,
    daLamBtvn: true,
    trangThai: 'co_mat',
  });
  expect(Boolean(before.tinhVaoSoDu)).toBe(false);
  expect(
    attendance.find((a: any) => a.externalId === 'recNhanXet2025c'),
  ).toMatchObject({ trangThai: 'vang_khong_phep', soBuoiDaTru: 0 });
  const sessions = await q
    .selectFrom('eduBuoiHoc')
    .select(['truVangCoPhep', 'truVangKhongPhep', 'trangThai', 'keHoachDay'])
    .execute();
  expect(
    sessions.every((s: any) => !s.truVangCoPhep && !s.truVangKhongPhep),
  ).toBe(true);
  expect(sessions[0]).toMatchObject({
    trangThai: 'da_diem_danh',
    keHoachDay: 'Kế hoạch mẫu',
  });

  // Branches and classes.
  const branches = await q
    .selectFrom('eduCoSo')
    .select(['ma', 'ten', 'externalId'])
    .orderBy('id')
    .execute();
  expect(branches.map((b: any) => [b.ma, b.externalId])).toEqual([
    ['KL', 'lark:coSo:Kim Liên'],
    ['VP', 'lark:coSo:Vĩnh Phúc'],
  ]);
  const classes = await q
    .selectFrom('eduLop')
    .select(['ma', 'ten', 'levelKey'])
    .execute();
  expect(classes.every((c: any) => /^L\d{5}$/u.test(c.ma))).toBe(true);

  // The log: counts and codes, no name, phone, email or date of birth.
  const logRows = await q
    .selectFrom('eduNhapLarkNhatKy')
    .select(['trangThai', 'nguoiChayId', 'tongKet'])
    .execute();
  expect(logRows).toHaveLength(1);
  expect(logRows[0]).toMatchObject({
    trangThai: 'thanh_cong',
    nguoiChayId: userId,
  });
  const logged = JSON.stringify(logRows[0].tongKet);
  expect(logged).toContain('HV-20240101-002');
  expect(logged).not.toMatch(/Mẫu 0|Phụ Huynh|0900|example\.com|2016-05-20/u);

  // Second run: everything is already there.
  const before2 = await counts(connection);
  const again = await chayNhap(database, fixtureSource(), options(userId));
  const after2 = await counts(connection);
  expect({ ...after2, eduNhapLarkNhatKy: 0 }).toEqual({
    ...before2,
    eduNhapLarkNhatKy: 0,
  });
  expect(after2.eduNhapLarkNhatKy).toBe(2);
  expect(again.tables.hocVien).toMatchObject({ tao: 0, trung: 4 });
  expect(again.tables.diemDanh).toMatchObject({ tao: 0, trung: 7 });
  const balances = await q
    .selectFrom('eduHocVien')
    .select(['externalId', 'soBuoiConLai'])
    .execute();
  expect(balances.find((s: any) => s.externalId === IDS.s1).soBuoiConLai).toBe(
    3,
  );
});

test('a student already in NocoEdu is merged, not duplicated, and nothing of it is overwritten', async ({
  database,
  connection,
}) => {
  await reset(connection);
  const q = connection.query;
  const userId = await adminId(connection);
  await q
    .insertInto('eduCoSo')
    .values({ ma: 'KL', ten: 'Kim Liên (nhập tay)' })
    .execute();
  const branch = await q
    .selectFrom('eduCoSo')
    .select('id')
    .where('ma', '=', 'KL')
    .executeTakeFirstOrThrow();
  await q
    .insertInto('eduPhuHuynh')
    .values({
      ma: 'PH-TAY',
      hoTen: 'Phụ huynh nhập tay',
      soDienThoai: '0900000001',
    })
    .execute();
  await q
    .insertInto('eduHocVien')
    .values({
      ma: 'HS-TAY',
      hoTen: 'học viên mẫu 01',
      namSinh: 2016,
      levelKey: 'ma',
      levelOrder: 2,
      coSoId: branch.id,
    })
    .execute();
  const student = await q
    .selectFrom('eduHocVien')
    .select('id')
    .where('ma', '=', 'HS-TAY')
    .executeTakeFirstOrThrow();
  const parent = await q
    .selectFrom('eduPhuHuynh')
    .select('id')
    .where('ma', '=', 'PH-TAY')
    .executeTakeFirstOrThrow();
  await q
    .insertInto('eduHocVienPhuHuynh')
    .values({
      hocVienId: student.id,
      phuHuynhId: parent.id,
      quanHe: 'bo',
      lienHeChinh: true,
    })
    .execute();

  const report = await chayNhap(database, fixtureSource(), dry);
  expect(report.tables.hocVien).toMatchObject({ tao: 3, ghep: 1 });
  await chayNhap(database, fixtureSource(), options(userId));

  const merged = await q
    .selectFrom('eduHocVien')
    .select([
      'ma',
      'hoTen',
      'levelKey',
      'externalId',
      'externalCode',
      'soBuoiConLai',
      'ngaySinh',
    ])
    .where('id', '=', student.id)
    .executeTakeFirstOrThrow();
  // Only the Lark ids were added; the name, level and code the school had stay as they were.
  expect(merged).toMatchObject({
    ma: 'HS-TAY',
    hoTen: 'học viên mẫu 01',
    levelKey: 'ma',
    externalId: IDS.s1,
    externalCode: 'HV-20240101-001',
  });
  expect(merged.ngaySinh).toBeNull();
  expect(await q.selectFrom('eduHocVien').select('id').execute()).toHaveLength(
    4,
  );
  expect(await q.selectFrom('eduPhuHuynh').select('id').execute()).toHaveLength(
    1,
  );
  expect(
    (
      await q
        .selectFrom('eduPhuHuynh')
        .select('externalId')
        .executeTakeFirstOrThrow()
    ).externalId,
  ).toBe(`lark:contact:${IDS.contactMe}`);
  expect(
    await q
      .selectFrom('eduHocVienPhuHuynh')
      .select('id')
      .where('hocVienId', '=', student.id)
      .execute(),
  ).toHaveLength(1);
  const kl = await q
    .selectFrom('eduCoSo')
    .select(['ten', 'externalId'])
    .where('ma', '=', 'KL')
    .executeTakeFirstOrThrow();
  expect(kl).toMatchObject({
    ten: 'Kim Liên (nhập tay)',
    externalId: 'lark:coSo:Kim Liên',
  });
});

test('a failure rolls back everything and is logged as a failure with a code and the refused names only', async ({
  database,
  connection,
}) => {
  await reset(connection);
  const q = connection.query;
  const userId = await adminId(connection);
  // A branch typed by hand with the code "KL" but another Lark id: the plan creates "KL", and the unique index on the
  // code refuses it, after nothing else was written yet; everything done before the refusal must be undone.
  await q
    .insertInto('eduCoSo')
    .values({ ma: 'KL', ten: 'Kim Liên', externalId: 'lark:coSo:khac' })
    .execute();
  const before = await counts(connection);

  const failure = await chayNhap(
    database,
    fixtureSource(),
    options(userId),
  ).catch((error: Error & { code?: string }) => error);
  expect(failure).toMatchObject({ code: 'LARK_GHI_THAT_BAI' });
  // The message names the table and column that refused, never a value.
  expect((failure as Error).message).toMatch(/edu_co_so\.ma|uq_edu_co_so_ma/u);
  const after = await counts(connection);
  expect({ ...after, eduNhapLarkNhatKy: 0 }).toEqual({
    ...before,
    eduNhapLarkNhatKy: 0,
  });
  const logRows = await q
    .selectFrom('eduNhapLarkNhatKy')
    .select(['trangThai', 'tongKet'])
    .execute();
  expect(logRows).toHaveLength(1);
  expect(logRows[0].trangThai).toBe('that_bai');
  expect(logRows[0].tongKet.error).toBe('GHI_THAT_BAI');
  expect(logRows[0].tongKet.hint).toMatch(/edu_co_so\.ma|uq_edu_co_so_ma/u);
  expect(JSON.stringify(logRows[0])).not.toMatch(
    /Mẫu 0|0900|example\.com|constraint failed/iu,
  );
});

test('a session typed by hand does not stop the run: it is reported and its attendance is left out', async ({
  database,
  connection,
}) => {
  await reset(connection);
  const q = connection.query;
  const userId = await adminId(connection);
  await q.insertInto('eduCoSo').values({ ma: 'KL', ten: 'Kim Liên' }).execute();
  const branch = await q
    .selectFrom('eduCoSo')
    .select('id')
    .where('ma', '=', 'KL')
    .executeTakeFirstOrThrow();
  await q
    .insertInto('eduLop')
    .values({
      ma: 'L-TAY',
      ten: 'Lớp tay',
      coSoId: branch.id,
      levelKey: 'tot',
      levelOrder: 1,
      externalId: IDS.lopA,
    })
    .execute();
  const lop = await q
    .selectFrom('eduLop')
    .select('id')
    .where('ma', '=', 'L-TAY')
    .executeTakeFirstOrThrow();
  await q
    .insertInto('eduBuoiHoc')
    .values({
      lopId: lop.id,
      ngay: '2025-02-03',
      gioBatDau: '18:15',
      gioKetThuc: '19:15',
    })
    .execute();

  const report = await chayNhap(database, fixtureSource(), options(userId));
  expect(report.problems).toContainEqual(
    expect.objectContaining({ table: 'buoiHoc', code: 'BUOI_DA_CO', count: 1 }),
  );
  // 5 sessions from Lark plus the one typed by hand; the 2 attendance rows of that session were not written.
  expect(await q.selectFrom('eduBuoiHoc').select('id').execute()).toHaveLength(
    6,
  );
  expect(await q.selectFrom('eduDiemDanh').select('id').execute()).toHaveLength(
    5,
  );
  const s1 = await q
    .selectFrom('eduHocVien')
    .select('soBuoiConLai')
    .where('externalId', '=', IDS.s1)
    .executeTakeFirstOrThrow();
  // 5 − the one session attended after the cut-off that was written (02-17).
  expect(s1.soBuoiConLai).toBe(4);
});

test('a log row that cannot be written after the commit is reported as such, not as a rollback', async ({
  database,
  connection,
}) => {
  await reset(connection);
  const userId = await adminId(connection);
  // The first transaction writes the data; the second (the log row) fails.
  let transactions = 0;
  const flaky = new Proxy(database, {
    get(target, property) {
      if (property === 'transaction')
        return (run: never) =>
          ++transactions === 2
            ? Promise.reject(new Error('the log could not be written'))
            : target.transaction(run);
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await expect(
    chayNhap(flaky, fixtureSource(), options(userId)),
  ).rejects.toMatchObject({
    code: 'LARK_DA_GHI_LOI_NHAT_KY',
  });
  // The data is there, no "failed" row was added, and a second run finds only duplicates.
  expect(
    await connection.query.selectFrom('eduHocVien').select('id').execute(),
  ).toHaveLength(4);
  expect(
    await connection.query
      .selectFrom('eduNhapLarkNhatKy')
      .select('id')
      .execute(),
  ).toHaveLength(0);
  const again = await chayNhap(database, fixtureSource(), dry);
  expect(again.tables.hocVien).toMatchObject({ tao: 0, trung: 4 });
});

test('--commit refuses a user that does not exist and a structure that changed, writing nothing', async ({
  database,
  connection,
}) => {
  await reset(connection);
  await expect(
    chayNhap(database, fixtureSource(), options('khong-co-nguoi-dung-nay')),
  ).rejects.toMatchObject({ code: 'LARK_USER_KHONG_TON_TAI' });
  await expect(
    chayNhap(
      database,
      fixtureSource(undefined, {
        drop: { table: 'nhanXet2026', field: 'có mặt' },
      }),
      options(await adminId(connection)),
    ),
  ).rejects.toMatchObject({ code: 'LARK_CAU_TRUC_DOI' });
  expect(Object.values(await counts(connection)).every((n) => n === 0)).toBe(
    true,
  );
  // Mistakes in how the command is used end with exit code 2.
  expect(USAGE_ERROR_CODES).toEqual(
    expect.arrayContaining([
      'LARK_THIEU_USER',
      'LARK_HAI_CHE_DO',
      'LARK_THIEU_BIEN',
    ]),
  );
});

test('a second run adds the missing parent links to imported students and then adds nothing', async ({
  database,
  connection,
}) => {
  await reset(connection);
  const userId = await adminId(connection);
  await chayNhap(database, fixtureSource(), options(userId));
  const q = connection.query;
  const linkCount = async () =>
    (await q.selectFrom('eduHocVienPhuHuynh').select('id').execute()).length;
  const whole = await linkCount();
  expect(whole).toBeGreaterThan(0);
  // Like a run made before the phone cells were read correctly: the students exist, the links do not.
  await q.deleteFrom('eduHocVienPhuHuynh').allowAllRows().execute();
  const parentsBefore = (
    await q.selectFrom('eduPhuHuynh').select('id').execute()
  ).length;

  const preview = await chayNhap(database, fixtureSource(), dry);
  expect(preview.tables.hocVien).toMatchObject({ tao: 0, trung: 4 });
  expect(preview.tables.hocVien.boSung).toBeGreaterThan(0);
  expect(await linkCount()).toBe(0);

  const filled = await chayNhap(database, fixtureSource(), options(userId));
  expect(filled.boSung).toBe(whole);
  expect(await linkCount()).toBe(whole);
  expect(
    (await q.selectFrom('eduPhuHuynh').select('id').execute()).length,
  ).toBe(parentsBefore);

  const again = await chayNhap(database, fixtureSource(), options(userId));
  expect(again.boSung).toBe(0);
  expect(await linkCount()).toBe(whole);
});
