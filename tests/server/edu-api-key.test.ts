import { expect } from 'vitest';

import {
  adminSession,
  jsonHeaders,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

type List = {
  data: Record<string, unknown>[];
  meta: { page: number; pageSize: number; total: number };
};

test('an API key of the read-only role reads the ext API and nothing else', async ({
  testApp,
  connection,
  request,
}) => {
  const admin = await adminSession(testApp);
  const service = await userWithRole(
    testApp,
    admin,
    'svc-mau-api',
    'edu_api_doc',
  );
  await seedSchool(connection, { hlvA: 'a', hlvB: 'b', managerA: 'c' });
  // Student 1 has a learning consent, student 2 has none; student 3 consented and then withdrew.
  await connection.query
    .insertInto('eduHocVien')
    .values({
      id: 3,
      ma: 'HS-C',
      hoTen: 'Học viên Mẫu Rút',
      namSinh: 2016,
      levelKey: 'ma',
      levelOrder: 2,
      coSoId: 1,
    })
    .execute();
  await connection.query
    .insertInto('eduPhuHuynh')
    .values({
      id: 1,
      ma: 'PH-1',
      hoTen: 'Phụ huynh Mẫu 01',
      soDienThoai: '0900000001',
    })
    .execute();
  for (const hocVienId of [1, 3]) {
    await connection.query
      .insertInto('eduHocVienPhuHuynh')
      .values({ hocVienId, phuHuynhId: 1, quanHe: 'me', lienHeChinh: true })
      .execute();
  }
  const consent = (hocVienId: number, rutLaiLuc: Date | null) => ({
    hocVienId,
    phuHuynhId: 1,
    mucDich: 'hoc_tap',
    dongY: true,
    treDongY: false,
    phienBanDieuKhoan: 'v1',
    thoiDiem: new Date(),
    kenh: 'giay',
    nguoiGhiNhanId: 'x',
    rutLaiLuc,
  });
  await connection.query
    .insertInto('eduDongY')
    .values(consent(1, null))
    .execute();
  await connection.query
    .insertInto('eduDongY')
    .values(consent(3, new Date()))
    .execute();

  const created = await service.session.fetch('/auth/api-key/create', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ name: 'svc-test', expiresIn: 86400 }),
  });
  expect(created.status).toBe(200);
  const key = ((await created.json()) as { key: string }).key;
  const withKey = (extra: RequestInit = {}) => ({
    ...extra,
    headers: { 'x-api-key': key, ...jsonHeaders(), ...(extra.headers ?? {}) },
  });

  const students = await request('/ext/hocVien', withKey({ method: 'GET' }));
  expect(students.status).toBe(200);
  const body = (await students.json()) as List;
  expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  expect(body.data).toEqual([
    {
      ma: 'HS-A',
      tenVietTat: 'Học V. M. A',
      levelKey: 'tot',
      levelOrder: 1,
      lop: { ma: 'L-A1', ten: 'Lớp Mẫu A1' },
    },
  ]);

  const parents = await request(
    '/ext/phuHuynh?pageSize=1',
    withKey({ method: 'GET' }),
  );
  expect(parents.status).toBe(200);
  expect(((await parents.json()) as List).data).toEqual([{ ma: 'PH-1' }]);

  expect(
    (await request('/ext/hocVien?pageSize=1000', withKey({ method: 'GET' })))
      .status,
  ).toBe(400);

  // It cannot read the internal APIs, and every write is refused.
  for (const path of [
    '/hocVien/findMany',
    '/phuHuynh/findMany',
    '/coSo/findMany',
    '/dongY/findMany',
  ]) {
    expect(
      (await request(path, withKey({ method: 'POST', body: '{}' }))).status,
      path,
    ).toBe(403);
  }
  for (const path of [
    '/hocVien/taoMoi',
    '/hocVien/updateOne',
    '/hocVien/lenCap',
    '/phuHuynh/taoMoi',
    '/dongY/ghiNhan',
    '/lop/createOne',
  ]) {
    const response = await request(
      path,
      withKey({
        method: 'POST',
        body: JSON.stringify({
          hoTen: 'Học viên Mẫu X',
          namSinh: 2017,
          coSoId: 1,
        }),
      }),
    );
    expect(response.status, path).toBe(403);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await request(
      '/ext/hocVien',
      withKey({ method, body: method === 'DELETE' ? undefined : '{}' }),
    );
    expect([403, 404, 405], method).toContain(response.status);
  }
  expect(
    await connection.query.selectFrom('eduHocVien').select('id').execute(),
  ).toHaveLength(3);

  // Without the key the same route answers 401.
  expect((await request('/ext/hocVien')).status).toBe(401);
});
