import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

const VN_TODAY = () =>
  new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

type Session = Awaited<ReturnType<typeof adminSession>>;
type Preview = {
  data: {
    totalRows: number;
    validCount: number;
    errorCount: number;
    rows: { line: number; isValid: boolean; errors: string[] }[];
  };
};
type Commit = {
  data: {
    totalRows: number;
    importedCount: number;
    skipped: { line: number; code: string }[];
    message: string;
  };
};

const preview = (session: Session, entity: string, csv: string) =>
  post(session, `/edu/import/xem-truoc/${entity}`, { csv });
const commit = (session: Session, entity: string, csv: string) =>
  post(session, `/edu/import/xac-nhan/${entity}`, { csv });
const csvOf = (header: string, ...rows: string[]) =>
  [header, ...rows].join('\r\n');

async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Parameters<typeof seedSchool>[0],
) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'iu-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'iu-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'iu-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'iu-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  await connection.query.deleteFrom('eduSach').allowAllRows().execute();
  return { admin, hlvA, hlvB, managerA, keToan, ids };
}

const count = async (
  connection: Parameters<typeof seedSchool>[0],
  table: string,
): Promise<number> =>
  (await connection.query.selectFrom(table).select('id').execute()).length;

const balanceOf = async (
  connection: Parameters<typeof seedSchool>[0],
  hocVienId: number,
): Promise<number> =>
  Number(
    (
      await connection.query
        .selectFrom('eduHocVien')
        .select('soBuoiConLai')
        .where('id', '=', hocVienId)
        .executeTakeFirstOrThrow()
    ).soBuoiConLai,
  );

const CLASS_HEADER = 'ma,ten,coSoMa,levelKey,trangThai';

test('every import route answers 401 without a session', async ({
  testApp,
  connection,
  request,
}) => {
  await setup(testApp, connection);
  for (const [method, path] of [
    ['GET', '/edu/import/mau/lop'],
    ['POST', '/edu/import/xem-truoc/lop'],
    ['POST', '/edu/import/xac-nhan/lop'],
  ] as const) {
    const response = await request(path, {
      method,
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      ...(method === 'POST' ? { body: JSON.stringify({ csv: 'a\r\nb' }) } : {}),
    });
    expect(`${path} ${response.status}`).toBe(`${path} 401`);
  }
});

test('each entity needs the manage action of the resource it writes', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, managerA, keToan } = await setup(testApp, connection);
  const body = csvOf(CLASS_HEADER, 'LOP-X,Lớp Mẫu X,CS-A,tot,dang_mo');

  // [who, entity] that must be refused, on the template, the preview and the commit alike.
  const refused: [string, Session, string][] = [
    ['coach/lop', hlvA.session, 'lop'],
    ['coach/coSo', hlvA.session, 'coSo'],
    ['coach/goiHoc', hlvA.session, 'goiHoc'],
    ['coach/tuyenSinh', hlvA.session, 'tuyenSinh'],
    ['manager/coSo', managerA.session, 'coSo'],
    ['manager/hoSoGv', managerA.session, 'hoSoGv'],
    ['manager/sach', managerA.session, 'sach'],
    ['accountant/lop', keToan.session, 'lop'],
    ['accountant/diemDanh', keToan.session, 'diemDanh'],
    ['accountant/tuyenSinh', keToan.session, 'tuyenSinh'],
    // The accountant only reads the handouts; the action to hand a book out is `manage`.
    ['accountant/phatSach', keToan.session, 'phatSach'],
  ];
  for (const [who, session, entity] of refused) {
    const mau = await session.fetch(`/edu/import/mau/${entity}`);
    expect(`${who} template ${mau.status}`).toBe(`${who} template 403`);
    expect(
      `${who} preview ${(await preview(session, entity, body)).status}`,
    ).toBe(`${who} preview 403`);
    expect(
      `${who} commit ${(await commit(session, entity, body)).status}`,
    ).toBe(`${who} commit 403`);
  }
  expect(await count(connection, 'eduLop')).toBe(2);

  // Those who hold the action get the template; an unknown entity is 404.
  expect((await managerA.session.fetch('/edu/import/mau/lop')).status).toBe(
    200,
  );
  expect((await keToan.session.fetch('/edu/import/mau/goiHoc')).status).toBe(
    200,
  );
  expect((await admin.fetch('/edu/import/mau/khongCo')).status).toBe(404);
  expect((await preview(admin, 'khongCo', body)).status).toBe(404);
});

test('a preview writes nothing and reports each line', async ({
  testApp,
  connection,
}) => {
  const { admin } = await setup(testApp, connection);
  const response = await preview(
    admin,
    'lop',
    csvOf(
      CLASS_HEADER,
      'LOP-P1,Lớp Mẫu P1,CS-A,ma,dang_mo',
      ',Lớp thiếu mã,CS-A,tot,dang_mo',
      'LOP-P3,Lớp Mẫu P3,CS-Z,tot,dang_mo',
      'LOP-P4,Lớp Mẫu P4,CS-A,cap-la,dang_mo',
    ),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as Preview;
  expect(body.data.totalRows).toBe(4);
  expect(body.data.validCount).toBe(1);
  expect(body.data.rows.map((row) => row.isValid)).toEqual([
    true,
    false,
    false,
    false,
  ]);
  expect(await count(connection, 'eduLop')).toBe(2);
});

test('a branch manager imports only into their own branch, and a code outside it is "not found"', async ({
  testApp,
  connection,
}) => {
  const { managerA, ids } = await setup(testApp, connection);
  const csv = csvOf(
    CLASS_HEADER,
    'LOP-M1,Lớp Mẫu M1,CS-A,ma,dang_mo',
    'LOP-M2,Lớp Mẫu M2,CS-B,tot,dang_mo',
  );
  const seen = (await (
    await preview(managerA.session, 'lop', csv)
  ).json()) as Preview;
  expect(seen.data.rows.map((row) => row.isValid)).toEqual([true, false]);

  const done = (await (
    await commit(managerA.session, 'lop', csv)
  ).json()) as Commit;
  expect(done.data.importedCount).toBe(1);
  expect(done.data.skipped).toEqual([{ line: 3, code: 'UNKNOWN_BRANCH' }]);
  const rows = await connection.query
    .selectFrom('eduLop')
    .select(['ma', 'coSoId', 'levelKey', 'levelOrder'])
    .where('ma', 'in', ['LOP-M1', 'LOP-M2'])
    .execute();
  expect(rows).toEqual([
    { ma: 'LOP-M1', coSoId: ids.coSoA, levelKey: 'ma', levelOrder: 2 },
  ]);

  // A class that exists in another branch cannot be overwritten (it is out of the manager's scope).
  const overwrite = (await (
    await commit(
      managerA.session,
      'lop',
      csvOf(CLASS_HEADER, 'L-B1,Lớp bị đổi tên,CS-A,tot,dang_mo'),
    )
  ).json()) as Commit;
  expect(overwrite.data.importedCount).toBe(0);
  expect(overwrite.data.skipped).toHaveLength(1);
  const untouched = await connection.query
    .selectFrom('eduLop')
    .select(['ten', 'coSoId'])
    .where('ma', '=', 'L-B1')
    .executeTakeFirstOrThrow();
  expect(untouched).toEqual({ ten: 'Lớp Mẫu B1', coSoId: ids.coSoB });
});

test('a package import moves the balance through the ledger, in the same transaction', async ({
  testApp,
  connection,
}) => {
  const { keToan, managerA, ids } = await setup(testApp, connection);
  const header =
    'hocVienMa,soBuoi,donGia,thanhTien,ngayMua,daThuTien,hinhThuc,ghiChu';
  const csv = csvOf(
    header,
    'HS-A,12,100000,1200000,2026-11-15,true,tien_mat,Gói mẫu',
    'HS-B,12,100000,1200000,2026-11-15,false,tien_mat,',
    'HS-KHONG-CO,12,100000,1200000,2026-11-15,false,tien_mat,',
  );

  // The manager holds both the package and the payment actions, but only for their own branch.
  const manager = (await (
    await commit(managerA.session, 'goiHoc', csv)
  ).json()) as Commit;
  expect(manager.data.importedCount).toBe(1);
  expect(manager.data.skipped.map((row) => row.code)).toEqual([
    'UNKNOWN_STUDENT',
    'UNKNOWN_STUDENT',
  ]);
  expect(await balanceOf(connection, ids.hocVienA)).toBe(12);
  expect(await balanceOf(connection, ids.hocVienB)).toBe(0);
  const ledger = await connection.query
    .selectFrom('eduSoDuNhatKy')
    .select(['hocVienId', 'thayDoi', 'soDuSau', 'lyDo', 'goiHocId'])
    .execute();
  expect(ledger).toHaveLength(1);
  expect(ledger[0]).toMatchObject({
    hocVienId: ids.hocVienA,
    thayDoi: 12,
    soDuSau: 12,
    lyDo: 'mua_goi',
  });
  const payments = await connection.query
    .selectFrom('eduThanhToan')
    .select(['soTien', 'coSoId', 'goiHocId'])
    .execute();
  expect(payments).toEqual([
    { soTien: 1200000, coSoId: ids.coSoA, goiHocId: ledger[0]?.goiHocId },
  ]);

  // The accountant sees every branch.
  const accountant = (await (
    await commit(keToan.session, 'goiHoc', csv)
  ).json()) as Commit;
  expect(accountant.data.importedCount).toBe(2);
  expect(await balanceOf(connection, ids.hocVienA)).toBe(24);
  expect(await balanceOf(connection, ids.hocVienB)).toBe(12);
  expect(await count(connection, 'eduSoDuNhatKy')).toBe(3);
});

test('a bad package row writes nothing: no package, no balance, no ledger row', async ({
  testApp,
  connection,
}) => {
  const { keToan, ids } = await setup(testApp, connection);
  const header =
    'hocVienMa,soBuoi,donGia,thanhTien,ngayMua,daThuTien,hinhThuc,ghiChu';
  const result = (await (
    await commit(
      keToan.session,
      'goiHoc',
      csvOf(
        header,
        'HS-A,0,100000,0,2026-11-15,false,tien_mat,',
        'HS-A,12,100000,1200000,15/11/2026,false,tien_mat,',
        'HS-A,12,100000,1200000,2026-11-15,false,bitcoin,',
        'HS-A,500,100000000,2000000001,2026-11-15,false,tien_mat,',
      ),
    )
  ).json()) as Commit;
  expect(result.data.importedCount).toBe(0);
  expect(result.data.skipped).toHaveLength(4);
  expect(await count(connection, 'eduGoiHoc')).toBe(0);
  expect(await count(connection, 'eduSoDuNhatKy')).toBe(0);
  expect(await balanceOf(connection, ids.hocVienA)).toBe(0);
});

const ATTENDANCE_HEADER =
  'lopMa,ngay,gioBatDau,hocVienMa,trangThai,daLamBtvn,nhanXet';

test('an attendance import creates the session as taken, deducts through the ledger and never twice', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids } = await setup(testApp, connection);
  const csv = csvOf(
    ATTENDANCE_HEADER,
    'L-A1,2026-11-16,18:00,HS-A,co_mat,true,Tập trung',
  );
  const first = (await (
    await commit(hlvA.session, 'diemDanh', csv)
  ).json()) as Commit;
  expect(first.data.importedCount).toBe(1);

  const session = await connection.query
    .selectFrom('eduBuoiHoc')
    .select(['id', 'trangThai', 'loai', 'truVangCoPhep', 'lopId', 'hlvId'])
    .executeTakeFirstOrThrow();
  // A session created by an import is a session whose register was taken, with a valid status.
  expect(session.trangThai).toBe('da_diem_danh');
  expect(session.loai).toBe('thuong');
  expect(Number(session.lopId)).toBe(ids.lopA);
  expect(session.truVangCoPhep).not.toBeNull();
  const mark = await connection.query
    .selectFrom('eduDiemDanh')
    .select(['id', 'trangThai', 'soBuoiDaTru', 'nhanXet'])
    .executeTakeFirstOrThrow();
  expect(mark).toMatchObject({
    trangThai: 'co_mat',
    soBuoiDaTru: 1,
    nhanXet: 'Tập trung',
  });
  expect(await balanceOf(connection, ids.hocVienA)).toBe(-1);
  expect(
    await connection.query
      .selectFrom('eduSoDuNhatKy')
      .select(['thayDoi', 'soDuSau', 'lyDo', 'diemDanhId'])
      .execute(),
  ).toEqual([
    { thayDoi: -1, soDuSau: -1, lyDo: 'diem_danh', diemDanhId: mark.id },
  ]);

  // The same file again changes nothing.
  await commit(hlvA.session, 'diemDanh', csv);
  expect(await balanceOf(connection, ids.hocVienA)).toBe(-1);
  expect(await count(connection, 'eduSoDuNhatKy')).toBe(1);
  expect(await count(connection, 'eduBuoiHoc')).toBe(1);
  expect(await count(connection, 'eduDiemDanh')).toBe(1);

  // A correction to an absence returns the session through the ledger and keeps the note when the file has none.
  await commit(
    hlvA.session,
    'diemDanh',
    csvOf(
      ATTENDANCE_HEADER,
      'L-A1,2026-11-16,18:00,HS-A,vang_khong_phep,false,',
    ),
  );
  expect(await balanceOf(connection, ids.hocVienA)).toBe(0);
  const ledger = await connection.query
    .selectFrom('eduSoDuNhatKy')
    .select(['thayDoi', 'lyDo'])
    .orderBy('id', 'asc')
    .execute();
  expect(ledger).toEqual([
    { thayDoi: -1, lyDo: 'diem_danh' },
    { thayDoi: 1, lyDo: 'diem_danh_sua' },
  ]);
  const corrected = await connection.query
    .selectFrom('eduDiemDanh')
    .select(['trangThai', 'soBuoiDaTru', 'nhanXet'])
    .executeTakeFirstOrThrow();
  expect(corrected).toEqual({
    trangThai: 'vang_khong_phep',
    soBuoiDaTru: 0,
    nhanXet: 'Tập trung',
  });
});

test('a coach imports attendance only for their own class and students', async ({
  testApp,
  connection,
}) => {
  const { hlvA } = await setup(testApp, connection);
  const result = (await (
    await commit(
      hlvA.session,
      'diemDanh',
      csvOf(
        ATTENDANCE_HEADER,
        // Another coach's class, another coach's student, a bad status and a bad time.
        'L-B1,2026-11-16,18:00,HS-B,co_mat,true,',
        'L-A1,2026-11-16,18:00,HS-B,co_mat,true,',
        'L-A1,2026-11-16,18:00,HS-A,di_muon,true,',
        'L-A1,2026-11-16,6pm,HS-A,co_mat,true,',
      ),
    )
  ).json()) as Commit;
  expect(result.data.importedCount).toBe(0);
  expect(result.data.skipped.map((row) => row.code)).toEqual([
    'UNKNOWN_CLASS',
    'UNKNOWN_STUDENT',
    'BAD_STATUS',
    'BAD_TIME',
  ]);
  expect(await count(connection, 'eduBuoiHoc')).toBe(0);
  expect(await count(connection, 'eduDiemDanh')).toBe(0);
  expect(await count(connection, 'eduSoDuNhatKy')).toBe(0);
});

test('the rule fixed on the session is the one an import uses', async ({
  testApp,
  connection,
}) => {
  const { admin, ids } = await setup(testApp, connection);
  // The branch deducts an excused absence when the session is first saved...
  await connection.query
    .updateTable('eduCoSo')
    .set({ truBuoiVangCoPhep: true })
    .where('id', '=', ids.coSoA)
    .execute();
  await commit(
    admin,
    'diemDanh',
    csvOf(ATTENDANCE_HEADER, 'L-A1,2026-11-16,18:00,HS-A,vang_co_phep,false,'),
  );
  expect(await balanceOf(connection, ids.hocVienA)).toBe(-1);
  // ...and a later change of the branch setting does not reach that session.
  await connection.query
    .updateTable('eduCoSo')
    .set({ truBuoiVangCoPhep: false })
    .where('id', '=', ids.coSoA)
    .execute();
  await commit(
    admin,
    'diemDanh',
    csvOf(ATTENDANCE_HEADER, 'L-A1,2026-11-16,18:00,HS-A,hoc_bu,false,'),
  );
  // Excused absences deduct on this session, so a make-up costs nothing more: -1 → -1 + (1 - 0)... the row goes from
  // 1 deducted to 0 deducted and the session comes back.
  expect(await balanceOf(connection, ids.hocVienA)).toBe(0);
});

test('admissions: a branch manager imports into their branch only; the accountant is refused', async ({
  testApp,
  connection,
}) => {
  const { managerA, ids } = await setup(testApp, connection);
  const header = 'hoTen,soDienThoai,coSoMa,kenh,trangThai,ghiChu,ngayNhac';
  const result = (await (
    await commit(
      managerA.session,
      'tuyenSinh',
      csvOf(
        header,
        'Phụ huynh Mẫu 01,0900000001,CS-A,Facebook,moi,,2026-11-20',
        'Phụ huynh Mẫu 02,0900000002,CS-B,Facebook,moi,,',
        'Phụ huynh Mẫu 03,0900000003,CS-A,Facebook,xin-chao,,',
      ),
    )
  ).json()) as Commit;
  expect(result.data.importedCount).toBe(1);
  expect(result.data.skipped.map((row) => row.code)).toEqual([
    'UNKNOWN_BRANCH',
    'BAD_STATUS',
  ]);
  // The reply carries lines and codes, never a name or a phone number.
  expect(result.data.message).not.toContain('Phụ huynh');
  expect(result.data.message).not.toContain('0900000');
  const rows = await connection.query
    .selectFrom('eduLienHe')
    .select(['coSoId'])
    .execute();
  expect(rows).toEqual([{ coSoId: ids.coSoA }]);
});

test('books handed out take the branch of the student', async ({
  testApp,
  connection,
}) => {
  const { admin, managerA, ids } = await setup(testApp, connection);
  await connection.query
    .insertInto('eduSach')
    .values({
      kyHieu: 'CT1',
      ten: 'Sách Mẫu 1',
      giaBia: 60000,
      giaBan: 50000,
      trangThai: 'dang_ban',
    })
    .execute();
  const header = 'hocVienMa,kyHieuSach,coSoMa,ngay,uuDai,tienSach,ghiChu';
  const result = (await (
    await commit(
      managerA.session,
      'phatSach',
      csvOf(
        header,
        'HS-A,CT1,CS-A,2026-11-15,10000,,',
        // The branch of the file must agree with the student's.
        'HS-A,CT1,CS-B,2026-11-15,0,,',
        // A student of another branch is not found.
        'HS-B,CT1,CS-B,2026-11-15,0,,',
        'HS-A,KHONG-CO,CS-A,2026-11-15,0,,',
      ),
    )
  ).json()) as Commit;
  expect(result.data.importedCount).toBe(1);
  expect(result.data.skipped.map((row) => row.code)).toEqual([
    'BRANCH_MISMATCH',
    'UNKNOWN_STUDENT',
    'UNKNOWN_BOOK',
  ]);
  const handed = await connection.query
    .selectFrom('eduPhatSach')
    .select(['hocVienId', 'coSoId', 'uuDai', 'tienSach'])
    .execute();
  // The price is the book's at that moment minus the discount.
  expect(handed).toEqual([
    {
      hocVienId: ids.hocVienA,
      coSoId: ids.coSoA,
      uuDai: 10000,
      tienSach: 40000,
    },
  ]);
  expect(admin).toBeDefined();
});

test('the administrator imports branches, books and coach profiles', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA } = await setup(testApp, connection);
  const branch = (await (
    await commit(
      admin,
      'coSo',
      csvOf(
        'ma,ten,diaChi,truBuoiVangCoPhep,trangThai',
        'CS-N1,Cơ sở Mẫu N1,Địa chỉ mẫu,true,hoat_dong',
        'CS-N2,Cơ sở Mẫu N2,,false,dong-cua',
      ),
    )
  ).json()) as Commit;
  expect(branch.data.importedCount).toBe(1);
  expect(branch.data.skipped).toEqual([{ line: 3, code: 'BAD_STATUS' }]);
  expect(
    (
      await connection.query
        .selectFrom('eduCoSo')
        .select('truBuoiVangCoPhep')
        .where('ma', '=', 'CS-N1')
        .executeTakeFirstOrThrow()
    ).truBuoiVangCoPhep,
  ).toBeTruthy();

  const books = (await (
    await commit(
      admin,
      'sach',
      csvOf(
        'kyHieu,ten,giaBia,giaBan,trangThai',
        'CT9,Sách Mẫu 9,60000,50000,dang_ban',
        'CT9,Sách Mẫu 9 (sửa),70000,60000,ngung',
      ),
    )
  ).json()) as Commit;
  expect(books.data.importedCount).toBe(2);
  expect(
    await connection.query
      .selectFrom('eduSach')
      .select(['ten', 'giaBan', 'trangThai'])
      .where('kyHieu', '=', 'CT9')
      .execute(),
  ).toEqual([{ ten: 'Sách Mẫu 9 (sửa)', giaBan: 60000, trangThai: 'ngung' }]);

  const profiles = (await (
    await commit(
      admin,
      'hoSoGv',
      csvOf(
        'emailOrUserId,tenVietTat,viTri,thuLaoMotBuoi,tinhTrang',
        `${hlvA.id},HLV Mẫu,HLV,150000,dang_lam`,
        'khong-co-tai-khoan,HLV Ma,HLV,150000,dang_lam',
      ),
    )
  ).json()) as Commit;
  expect(profiles.data.importedCount).toBe(1);
  expect(profiles.data.skipped).toEqual([{ line: 3, code: 'UNKNOWN_USER' }]);
  expect(await count(connection, 'eduHoSoGv')).toBe(1);
});

test('a file with too many rows is refused before anything is read', async ({
  testApp,
  connection,
}) => {
  const { admin } = await setup(testApp, connection);
  const rows = Array.from(
    { length: 5001 },
    (_, i) => `LOP-${i},Lớp Mẫu ${i},CS-A,tot,dang_mo`,
  );
  const response = await commit(admin, 'lop', csvOf(CLASS_HEADER, ...rows));
  expect(response.status).toBe(400);
  expect(await count(connection, 'eduLop')).toBe(2);
  expect(VN_TODAY()).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
});
