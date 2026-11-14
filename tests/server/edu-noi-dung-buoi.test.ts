import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

type Json = {
  data?: {
    noiDung?: Record<string, string>;
    yThuc?: { hocVienId: number; diem: number }[];
  };
  error?: { reason?: string };
};

async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Parameters<typeof seedSchool>[0],
) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'nd-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'nd-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'nd-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'nd-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  await connection.query
    .insertInto('eduBuoiHoc')
    .values({
      lopId: ids.lopA,
      ngay: '2026-11-02',
      gioBatDau: '17:30',
      gioKetThuc: '19:00',
    })
    .execute();
  const session = await connection.query
    .selectFrom('eduBuoiHoc')
    .select('id')
    .where('lopId', '=', ids.lopA)
    .executeTakeFirstOrThrow();
  return {
    admin,
    hlvA,
    hlvB,
    managerA,
    keToan,
    ids,
    sessionA: Number(session.id),
  };
}

const read = async (session: Parameters<typeof post>[0], buoiHocId: number) => {
  const response = await post(session, '/buoiHoc/noiDung/xem', { buoiHocId });
  return { status: response.status, body: (await response.json()) as Json };
};

test('a coach saves the session content and the awareness scores, and reads them back', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, sessionA } = await setup(testApp, connection);
  // The score needs an attendance row, so the register is taken first.
  const marked = await post(hlvA.session, '/diemDanh/luu', {
    buoiHocId: sessionA,
    danhSach: [{ hocVienId: ids.hocVienA, trangThai: 'co_mat' }],
  });
  expect(marked.status).toBe(200);

  const saved = await post(hlvA.session, '/buoiHoc/noiDung/luu', {
    buoiHocId: sessionA,
    noiDung: {
      keHoachDay: '  Chiếu hết cơ bản  ',
      kienThucMoi: 'Bắt đôi',
      giaoBtvn: '',
    },
    yThuc: [{ hocVienId: ids.hocVienA, diem: 9 }],
  });
  expect(saved.status).toBe(200);

  expect(await read(hlvA.session, sessionA)).toMatchObject({
    status: 200,
    body: {
      data: {
        noiDung: {
          keHoachDay: 'Chiếu hết cơ bản',
          kienThucMoi: 'Bắt đôi',
          giaoBtvn: '',
          keHoachBuoiSau: '',
        },
        yThuc: [{ hocVienId: ids.hocVienA, diem: 9 }],
      },
    },
  });

  // A field that is not sent stays; an empty text clears a field; a null score clears the score.
  await post(hlvA.session, '/buoiHoc/noiDung/luu', {
    buoiHocId: sessionA,
    noiDung: { kienThucMoi: '' },
    yThuc: [{ hocVienId: ids.hocVienA, diem: null }],
  });
  const after = await read(hlvA.session, sessionA);
  expect(after.body.data?.noiDung).toMatchObject({
    keHoachDay: 'Chiếu hết cơ bản',
    kienThucMoi: '',
  });
  expect(after.body.data?.yThuc).toEqual([]);
});

test('saving content never moves a balance or changes the attendance status', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, sessionA } = await setup(testApp, connection);
  await post(hlvA.session, '/diemDanh/luu', {
    buoiHocId: sessionA,
    danhSach: [{ hocVienId: ids.hocVienA, trangThai: 'co_mat' }],
  });
  const before = await connection.query
    .selectFrom('eduHocVien')
    .select('soBuoiConLai')
    .where('id', '=', ids.hocVienA)
    .executeTakeFirstOrThrow();
  const ledgerBefore = await connection.query
    .selectFrom('eduSoDuNhatKy')
    .select('id')
    .execute();
  await post(hlvA.session, '/buoiHoc/noiDung/luu', {
    buoiHocId: sessionA,
    yThuc: [{ hocVienId: ids.hocVienA, diem: 7 }],
  });
  const afterRow = await connection.query
    .selectFrom('eduHocVien')
    .select('soBuoiConLai')
    .where('id', '=', ids.hocVienA)
    .executeTakeFirstOrThrow();
  const ledgerAfter = await connection.query
    .selectFrom('eduSoDuNhatKy')
    .select('id')
    .execute();
  expect(Number(afterRow.soBuoiConLai)).toBe(Number(before.soBuoiConLai));
  expect(ledgerAfter.length).toBe(ledgerBefore.length);
  const attendance = await connection.query
    .selectFrom('eduDiemDanh')
    .select('trangThai')
    .executeTakeFirstOrThrow();
  expect(attendance.trangThai).toBe('co_mat');
});

test('a score needs an attendance row, and stays in 0 to 10', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, sessionA } = await setup(testApp, connection);
  const noRow = await post(hlvA.session, '/buoiHoc/noiDung/luu', {
    buoiHocId: sessionA,
    yThuc: [{ hocVienId: ids.hocVienA, diem: 5 }],
  });
  expect(noRow.status).toBe(404);
  expect(((await noRow.json()) as Json).error?.reason).toBe(
    'EDU_ATTENDANCE_NOT_FOUND',
  );
  for (const diem of [11, -1, 2.5]) {
    const bad = await post(hlvA.session, '/buoiHoc/noiDung/luu', {
      buoiHocId: sessionA,
      yThuc: [{ hocVienId: ids.hocVienA, diem }],
    });
    expect(bad.status).toBe(400);
  }
  const twice = await post(hlvA.session, '/buoiHoc/noiDung/luu', {
    buoiHocId: sessionA,
    yThuc: [
      { hocVienId: ids.hocVienA, diem: 5 },
      { hocVienId: ids.hocVienA, diem: 6 },
    ],
  });
  expect(twice.status).toBe(400);
});

test('only people with the right action and scope read or save', async ({
  testApp,
  connection,
  request,
}) => {
  const { admin, hlvA, hlvB, managerA, keToan, ids, sessionA } = await setup(
    testApp,
    connection,
  );
  await post(hlvA.session, '/diemDanh/luu', {
    buoiHocId: sessionA,
    danhSach: [{ hocVienId: ids.hocVienA, trangThai: 'co_mat' }],
  });
  const body = {
    buoiHocId: sessionA,
    noiDung: { keHoachDay: 'x' },
  };

  // A coach of another class and a manager of another branch do not see the session at all.
  expect((await read(hlvB.session, sessionA)).status).toBe(404);
  expect((await post(hlvB.session, '/buoiHoc/noiDung/luu', body)).status).toBe(
    404,
  );

  // The manager of the branch and an administrator may do both.
  expect((await read(managerA.session, sessionA)).status).toBe(200);
  expect(
    (await post(managerA.session, '/buoiHoc/noiDung/luu', body)).status,
  ).toBe(200);
  expect((await read(admin, sessionA)).status).toBe(200);

  // An accountant may read but holds no `record` action.
  expect((await read(keToan.session, sessionA)).status).toBe(200);
  expect(
    (await post(keToan.session, '/buoiHoc/noiDung/luu', body)).status,
  ).toBe(403);

  // No session at all.
  for (const path of ['/buoiHoc/noiDung/xem', '/buoiHoc/noiDung/luu']) {
    const anonymous = await request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify(body),
    });
    expect(anonymous.status).toBe(401);
  }
});

test('no standard record API returns the score or the content', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, ids, sessionA } = await setup(testApp, connection);
  await post(hlvA.session, '/diemDanh/luu', {
    buoiHocId: sessionA,
    danhSach: [{ hocVienId: ids.hocVienA, trangThai: 'co_mat' }],
  });
  await post(hlvA.session, '/buoiHoc/noiDung/luu', {
    buoiHocId: sessionA,
    noiDung: { keHoachDay: 'noi-dung-bi-mat' },
    yThuc: [{ hocVienId: ids.hocVienA, diem: 8 }],
  });
  for (const path of ['/diemDanh/findMany', '/buoiHoc/findMany']) {
    for (const session of [admin, hlvA.session]) {
      const response = await post(session, path, {});
      const text = JSON.stringify(await response.json());
      expect(text).not.toContain('noi-dung-bi-mat');
      expect(text).not.toContain('yThucDiem');
    }
  }
});
