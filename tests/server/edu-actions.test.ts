import { expect } from 'vitest';

import {
  adminSession,
  post,
  idByMa,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

type Json = { data?: Record<string, unknown>; error?: { reason?: string } };

async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Parameters<typeof seedSchool>[0],
) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'act-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'act-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'act-ql-a',
    'edu_quan_ly_co_so',
  );
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  return { admin, hlvA, hlvB, managerA, ids };
}

test('creating a student gives a code, and a branch manager cannot add to another branch', async ({
  testApp,
  connection,
}) => {
  const { admin, managerA, ids } = await setup(testApp, connection);

  const ok = await post(managerA.session, '/hocVien/taoMoi', {
    hoTen: 'Học viên Mẫu Mới',
    namSinh: 2017,
    coSoId: ids.coSoA,
    lopId: ids.lopA,
  });
  expect(ok.status).toBe(201);
  const created = ((await ok.json()) as Json).data as {
    id: number;
    ma: string;
  };
  expect(created.ma).toMatch(/^HS\d{5}$/u);

  const foreign = await post(managerA.session, '/hocVien/taoMoi', {
    hoTen: 'Học viên Mẫu Lạ',
    namSinh: 2017,
    coSoId: ids.coSoB,
    lopId: ids.lopB,
  });
  expect(foreign.status).toBe(403);
  const count = await connection.query
    .selectFrom('eduHocVien')
    .select('id')
    .where('hoTen', '=', 'Học viên Mẫu Lạ')
    .execute();
  expect(count).toHaveLength(0);

  const mismatch = await post(admin, '/hocVien/taoMoi', {
    hoTen: 'Học viên Mẫu Lệch',
    namSinh: 2017,
    coSoId: ids.coSoA,
    lopId: ids.lopB,
  });
  expect(mismatch.status).toBe(400);

  const future = await post(admin, '/hocVien/taoMoi', {
    hoTen: 'Học viên Mẫu Sai',
    namSinh: 2990,
    coSoId: ids.coSoA,
  });
  expect(future.status).toBe(400);
});

test('a coach confirms a level in their class only, history is recorded, and the level cannot go down', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids } = await setup(testApp, connection);

  const up = await post(hlvA.session, '/hocVien/lenCap', {
    hocVienId: ids.hocVienA,
    denLevelKey: 'ma',
  });
  expect(up.status).toBe(201);
  const student = await connection.query
    .selectFrom('eduHocVien')
    .select(['levelKey', 'levelOrder'])
    .where('id', '=', ids.hocVienA)
    .executeTakeFirstOrThrow();
  expect(student).toMatchObject({ levelKey: 'ma', levelOrder: 2 });
  const history = await connection.query
    .selectFrom('eduHocVienLenCap')
    .select(['tuLevelKey', 'denLevelKey', 'nguoiXacNhanId'])
    .execute();
  expect(history).toEqual([
    { tuLevelKey: 'tot', denLevelKey: 'ma', nguoiXacNhanId: hlvA.id },
  ]);

  expect(
    (
      await post(hlvA.session, '/hocVien/lenCap', {
        hocVienId: ids.hocVienA,
        denLevelKey: 'tot',
      })
    ).status,
  ).toBe(400);
  // Student 2 is in another coach's class.
  const other = await post(hlvA.session, '/hocVien/lenCap', {
    hocVienId: ids.hocVienB,
    denLevelKey: 'ma',
  });
  expect([403, 404]).toContain(other.status);
  const unchanged = await connection.query
    .selectFrom('eduHocVien')
    .select('levelKey')
    .where('id', '=', ids.hocVienB)
    .executeTakeFirstOrThrow();
  expect(unchanged.levelKey).toBe('tot');
});

test('one parent can have several children, and consent is recorded then withdrawn without deleting it', async ({
  testApp,
  connection,
}) => {
  const { admin, ids } = await setup(testApp, connection);
  await connection.query
    .insertInto('eduHocVien')
    .values({
      ma: 'HS-C',
      hoTen: 'Học viên Mẫu C',
      namSinh: 2017,
      levelKey: 'tot',
      levelOrder: 1,
      lopId: ids.lopA,
      coSoId: ids.coSoA,
    })
    .execute();
  const hocVienC = await idByMa(connection, 'eduHocVien', 'HS-C');

  const first = await post(admin, '/phuHuynh/taoMoi', {
    hocVienId: ids.hocVienA,
    hoTen: 'Phụ huynh Mẫu 01',
    soDienThoai: '0900 000 001',
    quanHe: 'me',
  });
  expect(first.status).toBe(201);
  const parent = ((await first.json()) as Json).data as {
    id: number;
    ma: string;
  };
  expect(parent.ma).toMatch(/^PH\d{5}$/u);

  const second = await post(admin, '/phuHuynh/taoMoi', {
    hocVienId: hocVienC,
    hoTen: 'Phụ huynh Mẫu 01',
    soDienThoai: '+84900000001',
    quanHe: 'me',
  });
  expect(second.status).toBe(201);
  expect((((await second.json()) as Json).data as { id: number }).id).toBe(
    parent.id,
  );
  expect(
    await connection.query.selectFrom('eduPhuHuynh').select('id').execute(),
  ).toHaveLength(1);
  expect(
    await connection.query
      .selectFrom('eduHocVienPhuHuynh')
      .select('id')
      .execute(),
  ).toHaveLength(2);

  const duplicate = await post(admin, '/phuHuynh/taoMoi', {
    hocVienId: ids.hocVienA,
    hoTen: 'Phụ huynh Mẫu 01',
    soDienThoai: '0900000001',
    quanHe: 'me',
  });
  expect(duplicate.status).toBe(409);

  const consent = await post(admin, '/dongY/ghiNhan', {
    hocVienId: ids.hocVienA,
    phuHuynhId: parent.id,
    mucDich: 'hoc_tap',
    dongY: true,
    phienBanDieuKhoan: 'v1',
    kenh: 'giay',
  });
  expect(consent.status).toBe(201);
  const consentId = (((await consent.json()) as Json).data as { id: number })
    .id;

  const notLinked = await post(admin, '/dongY/ghiNhan', {
    hocVienId: ids.hocVienB,
    phuHuynhId: parent.id,
    mucDich: 'hoc_tap',
    dongY: true,
    phienBanDieuKhoan: 'v1',
    kenh: 'giay',
  });
  expect(notLinked.status).toBe(400);

  expect(
    (
      await post(admin, '/dongY/rutLai', {
        id: consentId,
        lyDo: 'Phụ huynh yêu cầu',
      })
    ).status,
  ).toBe(200);
  expect((await post(admin, '/dongY/rutLai', { id: consentId })).status).toBe(
    400,
  );
  const row = await connection.query
    .selectFrom('eduDongY')
    .select(['rutLaiLuc', 'lyDoRut'])
    .where('id', '=', consentId)
    .executeTakeFirstOrThrow();
  expect(row.rutLaiLuc).not.toBeNull();
  expect(row.lyDoRut).toBe('Phụ huynh yêu cầu');
});

test('a coach cannot create students or parents, but can update the note of their own student', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids } = await setup(testApp, connection);
  expect(
    (
      await post(hlvA.session, '/hocVien/taoMoi', {
        hoTen: 'Học viên Mẫu X',
        namSinh: 2017,
        coSoId: ids.coSoA,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await post(hlvA.session, '/phuHuynh/taoMoi', {
        hocVienId: ids.hocVienA,
        hoTen: 'Phụ huynh Mẫu X',
        soDienThoai: '0900000009',
        quanHe: 'bo',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await post(hlvA.session, '/hocVien/capNhatGhiChu', {
        id: ids.hocVienA,
        ghiChuHlv: 'Tiến bộ tốt',
      })
    ).status,
  ).toBe(200);
  const other = await post(hlvA.session, '/hocVien/capNhatGhiChu', {
    id: ids.hocVienB,
    ghiChuHlv: 'Không được',
  });
  expect([403, 404]).toContain(other.status);
});
