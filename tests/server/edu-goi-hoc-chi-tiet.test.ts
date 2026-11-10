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
