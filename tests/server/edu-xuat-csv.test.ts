import { expect } from 'vitest';

import { csvCell } from '../../server/edu/csv.js';
import { IMPORT_COLUMNS } from '../../server/edu/import-csv.js';
import { MAX_EXPORT_STUDENTS } from '../../server/routes/edu-xuat-csv.js';
import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

const EXPORT = '/hocVien/xuatCsv';
const IMPORT_PREVIEW = '/hocVien/nhapCsv/xemTruoc';
const HEADER = IMPORT_COLUMNS.join(',');

async function setup(testApp: any, connection: any) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'quanly-a',
    'edu_quan_ly_co_so',
  );
  const accountant = await userWithRole(
    testApp,
    admin,
    'ke-toan',
    'edu_ke_toan',
  );
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  return { admin, hlvA, managerA, accountant, ids };
}

const text = async (response: Response) => response.text();
const lines = (csv: string) =>
  csv
    .replace(/^\uFEFF/u, '')
    .split('\r\n')
    .filter(Boolean);

/** Adds a parent to a seeded student; the names are made up. */
async function addParent(
  connection: any,
  studentId: number,
  ma: string,
  phone: string,
  main: boolean,
  relation = 'me',
) {
  const q = connection.query;
  await q
    .insertInto('eduPhuHuynh')
    .values({
      ma,
      hoTen: `Phụ huynh ${ma}`,
      soDienThoai: phone,
      zalo: '0900000999',
    })
    .execute();
  const parent = await q
    .selectFrom('eduPhuHuynh')
    .select('id')
    .where('ma', '=', ma)
    .executeTakeFirstOrThrow();
  await q
    .insertInto('eduHocVienPhuHuynh')
    .values({
      hocVienId: studentId,
      phuHuynhId: parent.id,
      quanHe: relation,
      lienHeChinh: main,
    })
    .execute();
}

test('401 without a session, 403 for a coach and an accountant', async ({
  testApp,
  connection,
  request,
}) => {
  const { hlvA, accountant } = await setup(testApp, connection);
  const anonymous = await request(EXPORT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: '{}',
  });
  expect(anonymous.status).toBe(401);
  for (const who of [hlvA, accountant])
    expect((await post(who.session, EXPORT, {})).status).toBe(403);
});

test('an administrator gets the import columns, a byte order mark, one row per parent, and nothing more', async ({
  testApp,
  connection,
}) => {
  const { admin, ids } = await setup(testApp, connection);
  await addParent(connection, ids.hocVienA, 'PH-X1', '0900111001', true, 'me');
  await addParent(connection, ids.hocVienA, 'PH-X2', '0900111002', false, 'bo');
  await connection.query
    .updateTable('eduHocVien')
    .set({ ngaySinh: '2016-05-20', ghiChuHlv: 'Ghi chú nhạy cảm mẫu' })
    .where('id', '=', ids.hocVienA)
    .execute();

  const response = await post(admin, EXPORT, {});
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/csv');
  expect(response.headers.get('cache-control')).toBe('no-store');
  // `text()` drops a byte order mark, so look at the bytes.
  const bytes = new Uint8Array(await response.clone().arrayBuffer());
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csv = await text(response);
  const rows = lines(csv);
  expect(rows[0]).toBe(HEADER);
  // Student A has two parents (main contact first); student B has none: one row with empty parent columns.
  expect(rows).toHaveLength(4);
  expect(rows[1]).toBe(
    'Học viên Mẫu A,2016,CS-A,L-A1,tot,Phụ huynh PH-X1,0900111001,0900000999,me',
  );
  expect(rows[2]).toBe(
    'Học viên Mẫu A,2016,CS-A,L-A1,tot,Phụ huynh PH-X2,0900111002,0900000999,bo',
  );
  expect(rows[3]).toBe('Học viên Mẫu B,2015,CS-B,L-B1,tot,,,,');
  // Minimum collection: no full date of birth, no coach note.
  expect(csv).not.toContain('2016-05-20');
  expect(csv).not.toContain('nhạy cảm');
});

test('the filters narrow the file, and the file can be imported again', async ({
  testApp,
  connection,
}) => {
  const { admin, ids } = await setup(testApp, connection);
  await addParent(connection, ids.hocVienA, 'PH-Y1', '0900222001', true);
  await addParent(connection, ids.hocVienB, 'PH-Y2', '0900222002', true);
  await connection.query
    .updateTable('eduHocVien')
    .set({ trangThai: 'tam_nghi' })
    .where('id', '=', ids.hocVienB)
    .execute();

  expect(
    lines(await text(await post(admin, EXPORT, { coSoId: ids.coSoA }))),
  ).toHaveLength(2);
  expect(
    lines(await text(await post(admin, EXPORT, { lopId: ids.lopB }))),
  ).toHaveLength(2);
  const paused = lines(
    await text(await post(admin, EXPORT, { trangThai: 'tam_nghi' })),
  );
  expect(paused).toHaveLength(2);
  expect(paused[1]).toContain('Học viên Mẫu B');

  // The exported file, imported again, finds every row already there: nothing to create, no problem.
  const csv = await text(await post(admin, EXPORT, {}));
  const preview = (await (
    await post(admin, IMPORT_PREVIEW, { csv })
  ).json()) as { data: any };
  expect(preview.data).toMatchObject({
    problems: [],
    hocVienMoi: 0,
    hocVienTrung: 2,
  });
});

test('a branch manager exports their own branch only, and a branch or class of another is refused', async ({
  testApp,
  connection,
}) => {
  const { managerA, ids } = await setup(testApp, connection);
  await addParent(connection, ids.hocVienA, 'PH-Z1', '0900333001', true);
  await addParent(connection, ids.hocVienB, 'PH-Z2', '0900333002', true);
  const own = lines(await text(await post(managerA.session, EXPORT, {})));
  expect(own).toHaveLength(2);
  expect(own.join('\n')).toContain('Học viên Mẫu A');
  expect(own.join('\n')).not.toContain('Học viên Mẫu B');
  expect(own.join('\n')).not.toContain('0900333002');
  for (const filter of [{ coSoId: ids.coSoB }, { lopId: ids.lopB }]) {
    const refused = await post(managerA.session, EXPORT, filter);
    expect(refused.status).toBe(403);
    expect(await refused.text()).not.toContain('Học viên Mẫu B');
  }
});

test('a cell that would run as a formula is made harmless', async ({
  testApp,
  connection,
}) => {
  const { admin, ids } = await setup(testApp, connection);
  await connection.query
    .updateTable('eduHocVien')
    .set({ hoTen: '=HYPERLINK("http://x","a")' })
    .where('id', '=', ids.hocVienA)
    .execute();
  await addParent(connection, ids.hocVienA, 'PH-W1', '0900444001', true);
  await connection.query
    .updateTable('eduPhuHuynh')
    .set({ hoTen: '+cmd|calc' })
    .where('ma', '=', 'PH-W1')
    .execute();
  const csv = await text(await post(admin, EXPORT, {}));
  expect(csv).toContain(`"'=HYPERLINK(""http://x"",""a"")"`);
  expect(csv).toContain("'+cmd|calc");
  expect(csv).not.toMatch(/(^|,)[=+@]/mu);
});

test('every export writes one log row with the filter and the count, and no name or phone number', async ({
  testApp,
  connection,
}) => {
  const { admin, managerA, ids } = await setup(testApp, connection);
  await addParent(connection, ids.hocVienA, 'PH-V1', '0900555001', true);
  const count = async () =>
    (
      await connection.query
        .selectFrom('eduXuatDuLieuNhatKy')
        .select('id')
        .where('loai', '=', 'hoc_vien_csv')
        .execute()
    ).length;
  const before = await count();
  await post(admin, EXPORT, { coSoId: ids.coSoA, trangThai: 'dang_hoc' });
  await post(managerA.session, EXPORT, {});
  expect(await count()).toBe(before + 2);
  const last = await connection.query
    .selectFrom('eduXuatDuLieuNhatKy')
    .selectAll()
    .where('loai', '=', 'hoc_vien_csv')
    .orderBy('id', 'desc')
    .execute();
  expect(last[1]).toMatchObject({ userId: admin.user.id, soDong: 1 });
  expect(last[0]).toMatchObject({ userId: managerA.id });
  const stored = JSON.stringify(last);
  expect(stored).not.toMatch(/Mẫu|0900|Phụ huynh/u);
  // A refused request writes nothing.
  await post(managerA.session, EXPORT, { coSoId: ids.coSoB });
  expect(await count()).toBe(before + 2);
});

test('more than the limit is refused with a message to narrow the export', async ({
  testApp,
  connection,
}) => {
  const { admin, ids } = await setup(testApp, connection);
  const q = connection.query;
  for (let start = 0; start < MAX_EXPORT_STUDENTS + 1; start += 100) {
    await q
      .insertInto('eduHocVien')
      .values(
        Array.from(
          { length: Math.min(100, MAX_EXPORT_STUDENTS + 1 - start) },
          (_, i) => ({
            ma: `HS-BULK-${start + i}`,
            hoTen: `Học viên Mẫu ${start + i}`,
            namSinh: 2016,
            levelKey: 'tot',
            levelOrder: 1,
            coSoId: ids.coSoA,
          }),
        ),
      )
      .execute();
  }
  const refused = await post(admin, EXPORT, {});
  expect(refused.status).toBeGreaterThanOrEqual(400);
  expect(await refused.text()).toContain('EDU_EXPORT_TOO_LARGE');
});

test('a file exported from a school with a closed class, a paused branch and a student without a parent can be imported again: every row is a duplicate, nothing is written', async ({
  testApp,
  connection,
}) => {
  const { admin, ids } = await setup(testApp, connection);
  await addParent(connection, ids.hocVienA, 'PH-R1', '0900666001', true);
  await addParent(connection, ids.hocVienB, 'PH-R2', '0900666002', true);
  // A third student without any parent, in the class that is closed below.
  await connection.query
    .insertInto('eduHocVien')
    .values({
      ma: 'HS-NP',
      hoTen: 'Học viên Chưa Có PH',
      namSinh: 2014,
      levelKey: 'tot',
      levelOrder: 1,
      lopId: ids.lopA,
      coSoId: ids.coSoA,
    })
    .execute();
  await connection.query
    .updateTable('eduLop')
    .set({ trangThai: 'da_dong' })
    .where('id', '=', ids.lopA)
    .execute();
  await connection.query
    .updateTable('eduCoSo')
    .set({ trangThai: 'tam_dung' })
    .where('id', '=', ids.coSoB)
    .execute();

  const csv = await text(await post(admin, EXPORT, {}));
  expect(lines(csv)).toHaveLength(4);
  const count = async (table: string) =>
    (await connection.query.selectFrom(table).select('id').execute()).length;
  const before = [
    await count('eduHocVien'),
    await count('eduPhuHuynh'),
    await count('eduHocVienPhuHuynh'),
  ];

  const preview = (await (
    await post(admin, IMPORT_PREVIEW, { csv })
  ).json()) as { data: any };
  expect(preview.data.problems).toEqual([]);
  expect(preview.data).toMatchObject({ hocVienMoi: 0, hocVienTrung: 3 });
  expect(preview.data.warnings).toEqual([
    { line: 4, code: 'STUDENT_WITHOUT_PARENT' },
  ]);
  const confirm = await post(admin, '/hocVien/nhapCsv/xacNhan', { csv });
  expect(confirm.status).toBe(200);
  expect(((await confirm.json()) as { data: any }).data.written).toBe(0);
  expect([
    await count('eduHocVien'),
    await count('eduPhuHuynh'),
    await count('eduHocVienPhuHuynh'),
  ]).toEqual(before);

  // The block still stops a row that would create a student in the closed class or the paused branch...
  const created = (await (
    await post(admin, IMPORT_PREVIEW, {
      csv: `${HEADER}\r\nHọc viên Mới,2017,CS-A,L-A1,tot,Phụ huynh Mới,0900666003,,me\r\nHọc viên Mới 2,2017,CS-B,,tot,Phụ huynh Mới,0900666004,,me\r\n`,
    })
  ).json()) as { data: any };
  expect(created.data.problems).toEqual([
    { line: 2, code: 'CLASS_CLOSED' },
    { line: 3, code: 'BRANCH_PAUSED' },
  ]);
  // ...and a row with no parent that matches no student is still refused.
  const orphan = (await (
    await post(admin, IMPORT_PREVIEW, {
      csv: `${HEADER}\r\nHọc viên Lạ,2017,CS-A,,tot,,,,\r\n`,
    })
  ).json()) as { data: any };
  expect(orphan.data.problems).toEqual([{ line: 2, code: 'MISSING_FIELD' }]);
});

test('a cell that starts with a blank before the formula sign is made harmless too', () => {
  expect(csvCell(' =1+1')).toBe("' =1+1");
  expect(csvCell('  @SUM(A1)')).toBe("'  @SUM(A1)");
  expect(csvCell('\t=1')).toBe(`'\t=1`);
  expect(csvCell('\r1')).toContain("'");
  expect(csvCell('a =1')).toBe('a =1');
  expect(csvCell(-5)).toBe('-5');
  expect(csvCell('Nguyễn Văn An')).toBe('Nguyễn Văn An');
});
