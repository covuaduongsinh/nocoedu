import { expect } from 'vitest';

import {
  adminSession,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// A package sold, a payment recorded and a balance set by hand are written once per operation key: the second
// request of a double click answers the first result. Amounts are made up.

type Session = Awaited<ReturnType<typeof adminSession>>;

const send = (session: Session, path: string, body: unknown, key?: string) =>
  session.fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      ...(key ? { 'idempotency-key': key } : {}),
    },
    body: JSON.stringify(body),
  });

const newKey = (): string => `${Date.now()}.${crypto.randomUUID()}`;

const count = async (connection: any, table: string): Promise<number> =>
  (await connection.query.selectFrom(table).select('id').execute()).length;

async function setup(testApp: any, connection: any) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'ml-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'ml-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'ml-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'ml-kt', 'edu_ke_toan');
  const keToan2 = await userWithRole(testApp, admin, 'ml-kt-2', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  return { keToan, keToan2, ids };
}

test('the same operation key sells one package, records one payment and adjusts a balance once', async ({
  testApp,
  connection,
}) => {
  const { keToan, keToan2, ids } = await setup(testApp, connection);

  // Without a key nothing is written.
  const keyless = await send(keToan.session, '/goiHoc/taoMoi', {
    hocVienId: ids.hocVienA,
    soBuoi: 10,
    donGia: 100000,
  });
  expect(keyless.status).toBe(400);
  expect(JSON.stringify(await keyless.json())).toContain(
    'OPERATION_KEY_REQUIRED',
  );
  expect(await count(connection, 'eduGoiHoc')).toBe(0);

  // Two requests at once and a third later, all with one key: one package, ten sessions.
  const sellBody = { hocVienId: ids.hocVienA, soBuoi: 10, donGia: 100000 };
  const sellKey = newKey();
  const [first, second] = await Promise.all([
    send(keToan.session, '/goiHoc/taoMoi', sellBody, sellKey),
    send(keToan.session, '/goiHoc/taoMoi', sellBody, sellKey),
  ]);
  const third = await send(keToan.session, '/goiHoc/taoMoi', sellBody, sellKey);
  expect([first.status, second.status, third.status]).toEqual([201, 201, 201]);
  const sold = [
    ((await first.json()) as any).data,
    ((await second.json()) as any).data,
    ((await third.json()) as any).data,
  ];
  expect(new Set(sold.map((entry) => entry.id)).size).toBe(1);
  expect(third.headers.get('idempotency-replayed')).toBe('true');
  expect(await count(connection, 'eduGoiHoc')).toBe(1);
  const student = await connection.query
    .selectFrom('eduHocVien')
    .select('soBuoiConLai')
    .where('id', '=', ids.hocVienA)
    .executeTakeFirstOrThrow();
  expect(Number(student.soBuoiConLai)).toBe(10);
  expect(await count(connection, 'eduSoDuNhatKy')).toBe(1);

  // The key belongs to that request: other values under it are refused, not written.
  const changed = await send(
    keToan.session,
    '/goiHoc/taoMoi',
    { ...sellBody, soBuoi: 20 },
    sellKey,
  );
  expect(changed.status).toBe(409);
  // Somebody else's request with the same key is their own operation.
  const other = await send(
    keToan2.session,
    '/goiHoc/taoMoi',
    sellBody,
    sellKey,
  );
  expect(other.status).toBe(201);
  expect(await count(connection, 'eduGoiHoc')).toBe(2);

  // A payment: one row and one receipt number, however often the request arrives.
  const payBody = {
    goiHocId: sold[0].id,
    soTien: 400000,
    hinhThuc: 'tien_mat',
    ngay: '2026-11-16',
  };
  const payKey = newKey();
  const paid = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await send(
      keToan.session,
      '/thanhToan/ghiNhan',
      payBody,
      payKey,
    );
    expect(response.status).toBe(201);
    paid.push(((await response.json()) as any).data);
  }
  expect(new Set(paid.map((entry) => entry.soPhieu)).size).toBe(1);
  expect(paid[2]).toEqual(paid[0]);
  expect(await count(connection, 'eduThanhToan')).toBe(1);
  // A deliberate second payment of the same amount is a new key and a new receipt.
  const again = await send(
    keToan.session,
    '/thanhToan/ghiNhan',
    payBody,
    newKey(),
  );
  expect(again.status).toBe(201);
  expect(((await again.json()) as any).data.soPhieu).not.toBe(paid[0].soPhieu);
  expect(await count(connection, 'eduThanhToan')).toBe(2);

  // An adjustment: the replay answers the first result instead of a balance conflict.
  const adjustBody = {
    hocVienId: ids.hocVienB,
    soDuHienTai: 0,
    soDuMoi: 4,
    lyDo: 'Tặng 4 buổi học thử',
  };
  const adjustKey = newKey();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await send(
      keToan.session,
      '/soDu/dieuChinh',
      adjustBody,
      adjustKey,
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as any).data).toEqual({
      soBuoiConLai: 4,
      thayDoi: 4,
    });
  }
  const ledgerB = await connection.query
    .selectFrom('eduSoDuNhatKy')
    .select('id')
    .where('hocVienId', '=', ids.hocVienB)
    .execute();
  expect(ledgerB.length).toBe(1);
});
