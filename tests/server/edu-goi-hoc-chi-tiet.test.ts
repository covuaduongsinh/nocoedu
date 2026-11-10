import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

type Detail = {
  data: {
    goiHoc: { id: number; soBuoi: number };
    daDung: number;
    conLai: number;
    cacBuoi: {
      diemDanhId: number | null;
      ngay: string | null;
      soBuoi: number;
    }[];
    vuotSoDu: number;
  };
};

test('the detail of a package lists the sessions deducted from it, first in first out, and keeps to the scope', async ({
  testApp,
  connection,
  request,
}) => {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'quanly-a',
    'edu_quan_ly_co_so',
  );
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const q = connection.query;
  const packageOf = async (
    hocVienId: number,
    soBuoi: number,
    ngayMua: string,
  ) => {
    await q
      .insertInto('eduGoiHoc')
      .values({
        hocVienId,
        soBuoi,
        donGia: 100000,
        thanhTien: soBuoi * 100000,
        ngayMua,
        nguoiTaoId: 'seed',
      })
      .execute();
    const rows = await q
      .selectFrom('eduGoiHoc')
      .select('id')
      .where('hocVienId', '=', hocVienId)
      .where('ngayMua', '=', ngayMua)
      .execute();
    return Number(rows[0].id);
  };
  const first = await packageOf(ids.hocVienA, 2, '2026-09-01');
  const second = await packageOf(ids.hocVienA, 10, '2026-10-01');
  const other = await packageOf(ids.hocVienB, 5, '2026-09-01');
  // Three sessions of the class, each marked present and deducted in the ledger.
  let balance = 12;
  for (const ngay of ['2026-10-02', '2026-10-09', '2026-10-16']) {
    await q
      .insertInto('eduBuoiHoc')
      .values({
        lopId: ids.lopA,
        ngay,
        gioBatDau: '18:00',
        gioKetThuc: '19:30',
        trangThai: 'da_diem_danh',
      })
      .execute();
    const session = await q
      .selectFrom('eduBuoiHoc')
      .select('id')
      .where('lopId', '=', ids.lopA)
      .where('ngay', '=', ngay)
      .executeTakeFirstOrThrow();
    await q
      .insertInto('eduDiemDanh')
      .values({
        buoiHocId: Number(session.id),
        hocVienId: ids.hocVienA,
        trangThai: 'co_mat',
        soBuoiDaTru: 1,
      })
      .execute();
    const mark = await q
      .selectFrom('eduDiemDanh')
      .select('id')
      .where('buoiHocId', '=', Number(session.id))
      .executeTakeFirstOrThrow();
    balance -= 1;
    await q
      .insertInto('eduSoDuNhatKy')
      .values({
        hocVienId: ids.hocVienA,
        thayDoi: -1,
        soDuSau: balance,
        lyDo: 'diem_danh',
        diemDanhId: Number(mark.id),
        createdAt: new Date().toISOString(),
      })
      .execute();
  }

  const detail = async (session: typeof admin, goiHocId: number) =>
    post(session, '/goiHoc/chiTiet', { goiHocId });

  const one = await detail(admin, first);
  expect(one.status).toBe(200);
  const firstBody = ((await one.json()) as Detail).data;
  expect([firstBody.daDung, firstBody.conLai, firstBody.vuotSoDu]).toEqual([
    2, 0, 0,
  ]);
  expect(firstBody.cacBuoi.map((b) => b.ngay)).toEqual([
    '2026-10-02',
    '2026-10-09',
  ]);
  const twoBody = ((await (await detail(admin, second)).json()) as Detail).data;
  expect([twoBody.daDung, twoBody.conLai]).toEqual([1, 9]);
  expect(twoBody.cacBuoi.map((b) => b.ngay)).toEqual(['2026-10-16']);

  // The branch manager reads their own branch's package only; a coach holds no package permission at all.
  expect((await detail(managerA.session, first)).status).toBe(200);
  expect((await detail(managerA.session, other)).status).toBe(404);
  expect((await detail(hlvA.session, first)).status).toBe(403);
  expect((await detail(hlvA.session, other)).status).toBe(403);
  const anonymous = await request('/goiHoc/chiTiet', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({ goiHocId: first }),
  });
  expect(anonymous.status).toBe(401);
  expect((await post(admin, '/goiHoc/chiTiet', { goiHocId: 0 })).status).toBe(
    400,
  );
});

test('the packages add up to the balance of the student: leftover minus beyond-the-purchase equals the balance, written through the real routes', async ({
  testApp,
  connection,
}) => {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'quanly-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'ke-toan', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const q = connection.query;
  await q
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: 0 })
    .where('id', '=', ids.hocVienA)
    .execute();

  // Two packages are sold through the route of the accountant.
  const goiIds: number[] = [];
  for (const [soBuoi, ngayMua] of [
    [2, '2026-09-01'],
    [1, '2026-09-15'],
  ] as const) {
    const sold = await post(keToan.session, '/goiHoc/taoMoi', {
      hocVienId: ids.hocVienA,
      soBuoi,
      donGia: 100000,
      ngayMua,
    });
    expect(sold.status).toBe(201);
    goiIds.push(((await sold.json()) as { data: { id: number } }).data.id);
  }

  // Five sessions are marked present through the attendance route; the first is then corrected to an absence without leave (refund).
  const sessionIds: number[] = [];
  for (const ngay of [
    '2026-10-02',
    '2026-10-09',
    '2026-10-16',
    '2026-10-23',
    '2026-10-30',
  ]) {
    await q
      .insertInto('eduBuoiHoc')
      .values({
        lopId: ids.lopA,
        ngay,
        gioBatDau: '18:00',
        gioKetThuc: '19:30',
      })
      .execute();
    const row = await q
      .selectFrom('eduBuoiHoc')
      .select('id')
      .where('lopId', '=', ids.lopA)
      .where('ngay', '=', ngay)
      .executeTakeFirstOrThrow();
    sessionIds.push(Number(row.id));
  }
  const mark = (buoiHocId: number, trangThai: string) =>
    post(hlvA.session, '/diemDanh/luu', {
      buoiHocId,
      danhSach: [{ hocVienId: ids.hocVienA, trangThai }],
    });
  for (const buoiHocId of sessionIds) {
    expect((await mark(buoiHocId, 'co_mat')).status).toBe(200);
  }
  expect((await mark(sessionIds[0]!, 'vang_khong_phep')).status).toBe(200);

  const student = await q
    .selectFrom('eduHocVien')
    .select('soBuoiConLai')
    .where('id', '=', ids.hocVienA)
    .executeTakeFirstOrThrow();
  const balance = Number(student.soBuoiConLai);
  // 3 bought, 4 deducted. There is no route for a manual adjustment yet, so none is written here.
  expect(balance).toBe(-1);

  let leftover = 0;
  let beyond = 0;
  for (const goiHocId of goiIds) {
    const res = await post(admin, '/goiHoc/chiTiet', { goiHocId });
    expect(res.status).toBe(200);
    const data = ((await res.json()) as Detail).data;
    leftover += data.conLai;
    beyond = data.vuotSoDu;
  }
  expect(leftover - beyond).toBe(balance);
  expect(beyond).toBe(1);
});
