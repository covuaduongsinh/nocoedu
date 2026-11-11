import { expect } from 'vitest';

import { IMPORT_COLUMNS } from '../../server/edu/import-csv.js';
import {
  MAX_IMPORT_CHARS,
  MAX_IMPORT_ROWS,
} from '../../server/edu/import-web.js';
import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

const HEADER = IMPORT_COLUMNS.join(',');
const file = (...rows: string[]) =>
  `\uFEFF${[HEADER, ...rows].join('\r\n')}\r\n`;
const PREVIEW = '/hocVien/nhapCsv/xemTruoc';
const CONFIRM = '/hocVien/nhapCsv/xacNhan';

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

const count = async (connection: any, table: string) =>
  (await connection.query.selectFrom(table).select('id').execute()).length;

async function counts(connection: any) {
  return {
    hocVien: await count(connection, 'eduHocVien'),
    phuHuynh: await count(connection, 'eduPhuHuynh'),
    lienKet: await count(connection, 'eduHocVienPhuHuynh'),
    nhatKy: await count(connection, 'eduNhapLarkNhatKy'),
  };
}

const body = async (response: Response) =>
  (await response.json()) as { data?: any; error?: any };

test('401 without a session, 403 for roles that do not hold the import action', async ({
  testApp,
  connection,
  request,
}) => {
  const { hlvA, accountant } = await setup(testApp, connection);
  for (const path of [PREVIEW, CONFIRM, '/hocVien/nhapCsv/mau']) {
    const anonymous = await request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ csv: file() }),
    });
    expect(`${path} ${anonymous.status}`).toBe(`${path} 401`);
    for (const who of [hlvA, accountant]) {
      const denied = await post((who as any).session ?? who, path, {
        csv: file(),
      });
      expect(`${path} ${denied.status}`).toBe(`${path} 403`);
    }
  }
});

test('a preview reports what would happen and writes nothing, not even a log row', async ({
  testApp,
  connection,
}) => {
  const { admin } = await setup(testApp, connection);
  const before = await counts(connection);
  const csv = file(
    'Học viên Nhập 01,2016,CS-A,L-A1,tot,Phụ huynh Nhập 01,0900 111 001,,me',
    'Học viên Nhập 02,2018,CS-A,,ma,Phụ huynh Nhập 01,+84900111001,,me',
    'Học viên Nhập 03,2015,CS-B,,,Phụ huynh Nhập 03,0900111003,,bo',
  );
  const response = await post(admin, PREVIEW, { csv });
  expect(response.status).toBe(200);
  expect((await body(response)).data).toEqual({
    rows: 3,
    problems: [],
    written: 0,
    hocVienMoi: 3,
    hocVienTrung: 0,
    chiLienKet: 0,
    phuHuynhMoi: 2,
    phuHuynhDungLai: 1,
    lienKetMoi: 3,
  });
  expect(await counts(connection)).toEqual(before);
});

test('a confirmation writes everything once, logs one row without names, and a second run adds nothing', async ({
  testApp,
  connection,
}) => {
  const { admin } = await setup(testApp, connection);
  const before = await counts(connection);
  const csv = file(
    'Học viên Nhập 01,2016,CS-A,L-A1,tot,Phụ huynh Nhập 01,0900111001,,me',
    'Học viên Nhập 02,2018,CS-A,,ma,Phụ huynh Nhập 01,0900111001,,me',
    // A second parent of the same student, on another row.
    'Học viên Nhập 01,2016,CS-A,,,Phụ huynh Nhập 02,0900111002,,bo',
  );
  const first = await post(admin, CONFIRM, { csv });
  expect(first.status).toBe(200);
  expect((await body(first)).data).toMatchObject({
    hocVienMoi: 2,
    chiLienKet: 1,
    phuHuynhMoi: 2,
    phuHuynhDungLai: 1,
    lienKetMoi: 3,
    written: 3,
  });
  const after = await counts(connection);
  expect(after).toEqual({
    hocVien: before.hocVien + 2,
    phuHuynh: before.phuHuynh + 2,
    lienKet: before.lienKet + 3,
    nhatKy: before.nhatKy + 1,
  });
  const student = await connection.query
    .selectFrom('eduHocVien')
    .select(['ma', 'levelKey', 'lopId', 'soBuoiConLai'])
    .where('hoTen', '=', 'Học viên Nhập 01')
    .executeTakeFirstOrThrow();
  expect(student.ma).toMatch(/^HS\d{5}$/u);
  expect(student.levelKey).toBe('tot');
  expect(Number(student.soBuoiConLai)).toBe(0);

  // The log row holds counts and the user, never a name or a phone number.
  const log = await connection.query
    .selectFrom('eduNhapLarkNhatKy')
    .select(['trangThai', 'tongKet', 'nguoiChayId'])
    .orderBy('id', 'desc')
    .executeTakeFirstOrThrow();
  expect(log.trangThai).toBe('thanh_cong');
  expect(log.nguoiChayId).toBe(admin.user.id);
  const text = JSON.stringify(log.tongKet);
  expect(text).not.toContain('Nhập');
  expect(text).not.toContain('0900');

  // Running the same file again creates nothing: the students and parents exist and are linked.
  const again = await post(admin, CONFIRM, {
    csv: file(
      'Học viên Nhập 01,2016,CS-A,L-A1,tot,Phụ huynh Nhập 01,0900111001,,me',
      'Học viên Nhập 02,2018,CS-A,,ma,Phụ huynh Nhập 01,0900111001,,me',
      'Học viên Nhập 01,2016,CS-A,,,Phụ huynh Nhập 02,0900111002,,bo',
    ),
  });
  expect(again.status).toBe(200);
  expect((await body(again)).data).toMatchObject({
    hocVienMoi: 0,
    hocVienTrung: 3,
    written: 0,
  });
  const afterAgain = await counts(connection);
  expect({ ...afterAgain, nhatKy: 0 }).toEqual({ ...after, nhatKy: 0 });
});

test('an existing student only gets the missing parent link, and an existing parent is reused', async ({
  testApp,
  connection,
}) => {
  const { admin } = await setup(testApp, connection);
  await post(admin, CONFIRM, {
    csv: file('Học viên Cũ,2016,CS-A,,,Phụ huynh Cũ,0900222001,,me'),
  });
  const before = await counts(connection);
  const response = await post(admin, CONFIRM, {
    csv: file(
      // Same student (different case and spacing), a new parent.
      'học  viên cũ,2016,CS-A,,,Phụ huynh Mới,0900222002,,bo',
      // A new student sharing the first parent's phone.
      'Học viên Em,2019,CS-A,,,Phụ huynh Cũ,0900222001,,me',
    ),
  });
  expect(response.status).toBe(200);
  expect((await body(response)).data).toMatchObject({
    hocVienMoi: 1,
    chiLienKet: 1,
    phuHuynhMoi: 1,
    phuHuynhDungLai: 1,
    lienKetMoi: 2,
  });
  const after = await counts(connection);
  expect(after.hocVien).toBe(before.hocVien + 1);
  expect(after.phuHuynh).toBe(before.phuHuynh + 1);
  expect(after.lienKet).toBe(before.lienKet + 2);
});

test('one bad row stops the whole import and the answer names lines and codes only', async ({
  testApp,
  connection,
}) => {
  const { admin } = await setup(testApp, connection);
  const before = await counts(connection);
  const csv = file(
    // A valid row first: it must not be written because a later row is wrong.
    'Học viên Mới 01,2017,CS-A,,,Phụ huynh Mới 01,0900333001,,me',
    'Học viên Sai 01,1800,CS-A,,,Phụ huynh Sai,0900333002,,me',
    'Học viên Sai 02,2016,CS-A,L-B1,,Phụ huynh Sai,0900333003,,me',
    'Học viên Sai 03,2016,CS-A,,,Phụ huynh Sai,12,,me',
    'Học viên Mới 01,2017,CS-A,,,Phụ huynh Mới 01,0900333001,,me',
  );
  const preview = await post(admin, PREVIEW, { csv });
  expect(preview.status).toBe(200);
  expect((await body(preview)).data.problems).toEqual([
    { line: 3, code: 'BAD_YEAR' },
    { line: 4, code: 'CLASS_NOT_IN_BRANCH' },
    { line: 5, code: 'BAD_PHONE' },
    { line: 6, code: 'DUPLICATE_IN_FILE' },
  ]);
  const response = await post(admin, CONFIRM, { csv });
  expect(response.status).toBeGreaterThanOrEqual(400);
  const failed = await body(response);
  expect(
    failed.error?.details?.[0]?.reason ?? JSON.stringify(failed),
  ).toContain('EDU_IMPORT_HAS_PROBLEMS');
  expect(JSON.stringify(failed)).not.toContain('Sai');
  const after = await counts(connection);
  expect({ ...after, nhatKy: 0 }).toEqual({ ...before, nhatKy: 0 });
  // The refusal is logged as one row with counts only.
  expect(after.nhatKy).toBe(before.nhatKy + 1);
  const log = await connection.query
    .selectFrom('eduNhapLarkNhatKy')
    .select(['trangThai', 'tongKet'])
    .orderBy('id', 'desc')
    .executeTakeFirstOrThrow();
  expect(log.trangThai).toBe('tu_choi');
  expect(JSON.stringify(log.tongKet)).not.toContain('Sai');
});

test('a branch manager imports into their own branch only; the server refuses another branch or class', async ({
  testApp,
  connection,
}) => {
  const { managerA } = await setup(testApp, connection);
  const before = await counts(connection);

  const own = await post(managerA.session, CONFIRM, {
    csv: file('Học viên Cơ sở A,2016,CS-A,L-A1,,Phụ huynh A,0900444001,,me'),
  });
  expect(own.status).toBe(200);
  expect((await body(own)).data).toMatchObject({ hocVienMoi: 1, written: 1 });

  const mid = await counts(connection);
  for (const row of [
    'Học viên Cơ sở B,2016,CS-B,,,Phụ huynh B,0900444002,,me',
    'Học viên Lớp B,2016,CS-B,L-B1,,Phụ huynh B,0900444003,,me',
  ]) {
    // A valid row of their own branch in the same file is not written either.
    const csv = file(
      'Học viên Cơ sở A2,2016,CS-A,,,Phụ huynh A2,0900444004,,me',
      row,
    );
    for (const path of [PREVIEW, CONFIRM]) {
      const refused = await post(managerA.session, path, { csv });
      expect(`${path} ${refused.status}`).toBe(`${path} 403`);
    }
  }
  expect(await counts(connection)).toEqual(mid);
  expect(mid.hocVien).toBe(before.hocVien + 1);
});

test('a parent of another branch is not reused by a branch manager', async ({
  testApp,
  connection,
}) => {
  const { admin, managerA } = await setup(testApp, connection);
  await post(admin, CONFIRM, {
    csv: file('Học viên B,2015,CS-B,,,Phụ huynh B,0900555001,,me'),
  });
  const before = await counts(connection);
  const response = await post(managerA.session, CONFIRM, {
    csv: file('Học viên A,2016,CS-A,,,Phụ huynh A,0900555001,,me'),
  });
  expect(response.status).toBe(200);
  expect((await body(response)).data).toMatchObject({
    phuHuynhMoi: 1,
    phuHuynhDungLai: 0,
  });
  expect((await counts(connection)).phuHuynh).toBe(before.phuHuynh + 1);
});

test('a file that is too large, has too many rows or is not in the expected format is refused', async ({
  testApp,
  connection,
}) => {
  const { admin } = await setup(testApp, connection);
  const before = await counts(connection);

  const huge = await post(admin, CONFIRM, {
    csv: 'a'.repeat(MAX_IMPORT_CHARS + 1),
  });
  expect(huge.status).toBeGreaterThanOrEqual(400);

  const manyRows = await post(admin, PREVIEW, {
    csv: file(
      ...Array.from(
        { length: MAX_IMPORT_ROWS + 1 },
        (_, i) =>
          `H${i},2016,CS-A,,,P${i},09000${String(i).padStart(5, '0')},,me`,
      ),
    ),
  });
  expect(manyRows.status).toBe(400);
  expect(JSON.stringify(await body(manyRows))).toContain(
    'EDU_IMPORT_TOO_LARGE',
  );

  for (const csv of [
    'tên,năm\r\nA,2016\r\n',
    'not a csv at all',
    `${HEADER}\r\nH\u0000,2016,CS-A,,,P,0900666001,,me\r\n`,
    `${HEADER}\r\nH\uFFFD,2016,CS-A,,,P,0900666001,,me\r\n`,
  ]) {
    for (const path of [PREVIEW, CONFIRM]) {
      const refused = await post(admin, path, { csv });
      expect(`${path} ${refused.status}`).toBe(`${path} 400`);
    }
  }
  expect((await post(admin, PREVIEW, { csv: 5 })).status).toBe(400);
  expect(await counts(connection)).toEqual(before);
});

test('the sample file holds the columns and made-up data only', async ({
  testApp,
  connection,
}) => {
  const { admin, managerA } = await setup(testApp, connection);
  for (const who of [admin, managerA]) {
    const response = await post(
      (who as any).session ?? who,
      '/hocVien/nhapCsv/mau',
      {},
    );
    expect(response.status).toBe(200);
    const { csv } = (await body(response)).data as { csv: string };
    expect(csv.startsWith(`\uFEFF${HEADER}`)).toBe(true);
    expect(csv).toContain('Học viên Mẫu 01');
    expect(csv).toContain('0900000001');
  }
});
