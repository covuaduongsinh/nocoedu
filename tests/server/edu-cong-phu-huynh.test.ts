import { describe, expect, it } from 'vitest';

import {
  createLimiter,
  expiryOf,
  hashToken,
  looksLikeToken,
  newToken,
} from '../../server/edu/cong-phu-huynh.js';
import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

// The private link of a parent. Names are made up.

describe('token helpers', () => {
  it('makes a 43-character token whose hash is never the token', () => {
    const token = newToken();
    expect(looksLikeToken(token)).toBe(true);
    expect(newToken()).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/u);
    expect(hashToken(token)).not.toContain(token);
    expect(looksLikeToken('short')).toBe(false);
    expect(looksLikeToken(`${token}!`)).toBe(false);
    expect(looksLikeToken('')).toBe(false);
  });

  it('expires 90 days after it was made', () => {
    const now = new Date('2026-11-16T00:00:00Z');
    expect(expiryOf(now).toISOString()).toBe('2027-02-14T00:00:00.000Z');
  });

  it('allows max requests a window per key, then again in the next window', () => {
    let clock = 0;
    const limiter = createLimiter({ max: 2, windowMs: 1000, now: () => clock });
    expect(limiter.hit('a')).toBe(true);
    expect(limiter.hit('a')).toBe(true);
    expect(limiter.hit('a')).toBe(false);
    expect(limiter.hit('b')).toBe(true);
    clock = 1001;
    expect(limiter.hit('a')).toBe(true);
  });
});

async function setup(testApp: any, connection: any) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'ph-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'ph-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'ph-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'ph-kt', 'edu_ke_toan');
  const quanTri = await userWithRole(testApp, admin, 'ph-qt', 'edu_quan_tri');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const q = connection.query;
  // A parent linked to each student, a session with attendance and a monthly comment for student A.
  for (const [ma, hocVienId, phone] of [
    ['PH-A', ids.hocVienA, '0900000001'],
    ['PH-B', ids.hocVienB, '0900000002'],
  ] as const) {
    await q
      .insertInto('eduPhuHuynh')
      .values({ ma, hoTen: `Phụ huynh Mẫu ${ma}`, soDienThoai: phone })
      .execute();
    const parent = await q
      .selectFrom('eduPhuHuynh')
      .select('id')
      .where('ma', '=', ma)
      .executeTakeFirstOrThrow();
    await q
      .insertInto('eduHocVienPhuHuynh')
      .values({
        hocVienId,
        phuHuynhId: Number(parent.id),
        quanHe: 'me',
        lienHeChinh: true,
      })
      .execute();
  }
  const parentOf = async (ma: string) =>
    Number(
      (
        await q
          .selectFrom('eduPhuHuynh')
          .select('id')
          .where('ma', '=', ma)
          .executeTakeFirstOrThrow()
      ).id,
    );
  await q
    .insertInto('eduBuoiHoc')
    .values({
      lopId: ids.lopA,
      ngay: '2026-11-09',
      gioBatDau: '17:30',
      gioKetThuc: '19:00',
      kienThucMoi: 'Nhập thành',
      giaoBtvn: 'Làm 5 bài chiếu hết',
      trangThai: 'da_diem_danh',
    })
    .execute();
  const session = await q
    .selectFrom('eduBuoiHoc')
    .select('id')
    .where('lopId', '=', ids.lopA)
    .executeTakeFirstOrThrow();
  await q
    .insertInto('eduDiemDanh')
    .values({
      buoiHocId: Number(session.id),
      hocVienId: ids.hocVienA,
      trangThai: 'co_mat',
      daLamBtvn: true,
      nhanXet: 'Tập trung tốt',
      yThucDiem: 8,
    })
    .execute();
  await q
    .insertInto('eduNhanXetThang')
    .values({
      hocVienId: ids.hocVienA,
      lopId: ids.lopA,
      hlvId: hlvA.id,
      thang: '2026-10',
      noiDung: 'Tháng này con tiến bộ rõ.',
    })
    .execute();
  await q
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: 7, ghiChuHlv: 'GHI CHÚ RIÊNG CỦA HLV' })
    .where('id', '=', ids.hocVienA)
    .execute();
  return {
    admin,
    hlvA,
    hlvB,
    managerA,
    keToan,
    quanTri,
    ids,
    parentA: await parentOf('PH-A'),
    parentB: await parentOf('PH-B'),
  };
}

// Two answers are the same when only the request id differs.
const same = (text: string): string => text.replace(/"requestId":"[^"]+"/u, '');

const read = (request: any, token: string) =>
  request('/congPhuHuynh/xem', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ token }),
  });

test('only the administrator and a branch manager make, list and revoke links, over their own students', async ({
  testApp,
  request,
  connection,
}) => {
  const { hlvA, keToan, managerA, quanTri, ids, parentA, parentB } =
    await setup(testApp, connection);

  const anonymous = await request('/congPhuHuynh/taoLink', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ hocVienId: ids.hocVienA, phuHuynhId: parentA }),
  });
  expect(anonymous.status).toBe(401);

  const body = { hocVienId: ids.hocVienA, phuHuynhId: parentA };
  for (const who of [hlvA, keToan]) {
    expect(
      (await post(who.session, '/congPhuHuynh/taoLink', body)).status,
    ).toBe(403);
    expect(
      (
        await post(who.session, '/congPhuHuynh/danhSach', {
          hocVienId: ids.hocVienA,
        })
      ).status,
    ).toBe(403);
    expect(
      (await post(who.session, '/congPhuHuynh/thuHoi', { id: 1 })).status,
    ).toBe(403);
  }

  // A branch manager makes one for their own branch, not for another's.
  const own = await post(managerA.session, '/congPhuHuynh/taoLink', body);
  expect(own.status).toBe(201);
  const made = (await own.json()) as {
    data: { id: number; token: string; hanLuc: string };
  };
  expect(looksLikeToken(made.data.token)).toBe(true);
  const other = await post(managerA.session, '/congPhuHuynh/taoLink', {
    hocVienId: ids.hocVienB,
    phuHuynhId: parentB,
  });
  expect(other.status).toBe(404);
  // A parent that is not linked to the student is refused, whoever asks.
  expect(
    (
      await post(quanTri.session, '/congPhuHuynh/taoLink', {
        hocVienId: ids.hocVienA,
        phuHuynhId: parentB,
      })
    ).status,
  ).toBe(404);

  // The list never carries a token or a hash, and a manager sees only their own students' links.
  const list = await post(managerA.session, '/congPhuHuynh/danhSach', {
    hocVienId: ids.hocVienA,
  });
  expect(list.status).toBe(200);
  const listed = JSON.stringify(await list.json());
  expect(listed).not.toContain(made.data.token);
  expect(listed).not.toContain(hashToken(made.data.token));
  expect(listed).not.toContain('tokenHash');
  const adminMade = await post(quanTri.session, '/congPhuHuynh/taoLink', {
    hocVienId: ids.hocVienB,
    phuHuynhId: parentB,
  });
  expect(adminMade.status).toBe(201);
  const hiddenFromManager = (await (
    await post(managerA.session, '/congPhuHuynh/danhSach', {
      hocVienId: ids.hocVienB,
    })
  ).json()) as { data: unknown[] };
  expect(hiddenFromManager.data).toEqual([]);
  const adminId = ((await adminMade.json()) as { data: { id: number } }).data
    .id;
  expect(
    (await post(managerA.session, '/congPhuHuynh/thuHoi', { id: adminId }))
      .status,
  ).toBe(404);
  expect(
    (await post(quanTri.session, '/congPhuHuynh/thuHoi', { id: adminId }))
      .status,
  ).toBe(200);
});

test('a parent reads what a family may read with a good token, and a wrong, expired or revoked one is the same 404', async ({
  testApp,
  request,
  connection,
}) => {
  const { managerA, ids, parentA } = await setup(testApp, connection);
  const made = await post(managerA.session, '/congPhuHuynh/taoLink', {
    hocVienId: ids.hocVienA,
    phuHuynhId: parentA,
  });
  const { id, token } = (
    (await made.json()) as {
      data: { id: number; token: string };
    }
  ).data;

  const stored = await connection.query
    .selectFrom('eduCongPhuHuynh')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  expect(stored.tokenHash).toBe(hashToken(token));
  expect(JSON.stringify(stored)).not.toContain(token);

  const response = await read(request, token);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('x-robots-tag')).toContain('noindex');
  const text = await response.text();
  const body = JSON.parse(text) as { data: Record<string, any> };
  expect(body.data).toMatchObject({
    tenGoi: 'Học V. M. A',
    capDo: 'Tốt',
    lop: 'Lớp Mẫu A1',
    soBuoiConLai: 7,
    nhanXetThang: { thang: '2026-10', noiDung: 'Tháng này con tiến bộ rõ.' },
  });
  expect(body.data.cacBuoi).toEqual([
    {
      ngay: '2026-11-09',
      trangThai: 'co_mat',
      daLamBtvn: true,
      yThuc: 8,
      kienThucMoi: 'Nhập thành',
      giaoBtvn: 'Làm 5 bài chiếu hết',
      nhanXet: 'Tập trung tốt',
    },
  ]);
  // Nothing a family must not see: the private note, a phone number, a date of birth, money.
  for (const secret of [
    'GHI CHÚ RIÊNG',
    '0900000001',
    'ngaySinh',
    'soDienThoai',
    'soTien',
    'thanhTien',
    'ghiChuHlv',
    'HS-A',
    'hoTen',
  ]) {
    expect(text).not.toContain(secret);
  }
  const after = await connection.query
    .selectFrom('eduCongPhuHuynh')
    .select(['soLanXem', 'xemCuoiLuc'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  expect(Number(after.soLanXem)).toBe(1);
  expect(after.xemCuoiLuc).not.toBeNull();

  // Wrong, malformed and empty tokens are indistinguishable.
  const wrong = await read(request, newToken());
  expect(wrong.status).toBe(404);
  const wrongBody = same(await wrong.text());
  expect((await read(request, 'abc')).status).toBe(404);
  expect((await read(request, '')).status).toBe(404);
  expect(same(await (await read(request, 'abc')).text())).toBe(wrongBody);

  // Expired.
  await connection.query
    .updateTable('eduCongPhuHuynh')
    .set({ hanLuc: new Date(Date.now() - 1000) })
    .where('id', '=', id)
    .execute();
  const expired = await read(request, token);
  expect(expired.status).toBe(404);
  expect(same(await expired.text())).toBe(wrongBody);
  await connection.query
    .updateTable('eduCongPhuHuynh')
    .set({ hanLuc: new Date(Date.now() + 86_400_000) })
    .where('id', '=', id)
    .execute();
  expect((await read(request, token)).status).toBe(200);

  // Revoked, by the manager of the branch.
  expect(
    (await post(managerA.session, '/congPhuHuynh/thuHoi', { id })).status,
  ).toBe(200);
  const revoked = await read(request, token);
  expect(revoked.status).toBe(404);
  expect(same(await revoked.text())).toBe(wrongBody);
});

test('a new link replaces the old one of the same parent, and a cancelled session is not shown', async ({
  testApp,
  request,
  connection,
}) => {
  const { quanTri, ids, parentA } = await setup(testApp, connection);
  const make = async (): Promise<string> =>
    (
      (await (
        await post(quanTri.session, '/congPhuHuynh/taoLink', {
          hocVienId: ids.hocVienA,
          phuHuynhId: parentA,
        })
      ).json()) as { data: { token: string } }
    ).data.token;
  const first = await make();
  const second = await make();
  expect((await read(request, first)).status).toBe(404);
  expect((await read(request, second)).status).toBe(200);

  await connection.query
    .updateTable('eduBuoiHoc')
    .set({ trangThai: 'huy' })
    .where('lopId', '=', ids.lopA)
    .execute();
  const shown = (await (await read(request, second)).json()) as {
    data: { cacBuoi: unknown[] };
  };
  expect(shown.data.cacBuoi).toEqual([]);
});

test('too many requests are answered 429, and the left-over tokens stay valid', async ({
  testApp,
  request,
  connection,
}) => {
  const { quanTri, ids, parentA } = await setup(testApp, connection);
  const token = (
    (await (
      await post(quanTri.session, '/congPhuHuynh/taoLink', {
        hocVienId: ids.hocVienA,
        phuHuynhId: parentA,
      })
    ).json()) as { data: { token: string } }
  ).data.token;
  let limited = 0;
  for (let i = 0; i < 40; i += 1) {
    const response = await request('/congPhuHuynh/xem', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        'x-forwarded-for': '203.0.113.9',
      },
      body: JSON.stringify({ token: newToken() }),
    });
    if (response.status === 429) {
      limited += 1;
      expect(response.headers.get('retry-after')).toBe('60');
    }
  }
  expect(limited).toBeGreaterThan(0);
  // Another caller is not held back by the first one.
  const other = await request('/congPhuHuynh/xem', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      'x-forwarded-for': '203.0.113.77',
    },
    body: JSON.stringify({ token }),
  });
  expect(other.status).toBe(200);
});
