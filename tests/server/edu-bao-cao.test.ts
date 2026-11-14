import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

type Report = {
  data: {
    columns: { key: string }[];
    rows: Record<string, string | number>[];
  };
};

const VN_TODAY = () =>
  new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Parameters<typeof seedSchool>[0],
) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'bc-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'bc-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'bc-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'bc-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  return { admin, hlvA, hlvB, managerA, keToan, ids };
}

const report = async (session: any, body: unknown) =>
  post(session, '/baoCao/xem', body);

test('every report and home route answers 401 without a session', async ({
  request,
}) => {
  for (const path of [
    '/baoCao/xem',
    '/baoCao/xuatCsv',
    '/trangChu/tomTat',
    '/nhanXet/luu',
    '/nhanXet/xuatVanBan',
    '/nhanXetThang/findMany',
    '/hlv/danhSach',
  ]) {
    const response = await request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: '{}',
    });
    expect(`${path} ${response.status}`).toBe(`${path} 401`);
  }
});

test('reports show only the scope of the role, and a coach cannot read revenue', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, managerA, keToan, ids } = await setup(
    testApp,
    connection,
  );
  const q = connection.query;
  await q
    .insertInto('eduBuoiHoc')
    .values({
      lopId: ids.lopA,
      ngay: VN_TODAY(),
      gioBatDau: '17:30',
      gioKetThuc: '19:00',
      trangThai: 'da_diem_danh',
    })
    .execute();
  const session = await q
    .selectFrom('eduBuoiHoc')
    .select('id')
    .executeTakeFirstOrThrow();
  await q
    .insertInto('eduDiemDanh')
    .values({
      buoiHocId: Number(session.id),
      hocVienId: ids.hocVienA,
      trangThai: 'co_mat',
    })
    .execute();
  await q
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: 2 })
    .where('id', '=', ids.hocVienA)
    .execute();
  await q
    .insertInto('eduGoiHoc')
    .values({
      hocVienId: ids.hocVienA,
      soBuoi: 10,
      donGia: 100000,
      thanhTien: 1000000,
      ngayMua: VN_TODAY(),
      nguoiTaoId: 'x',
    })
    .execute();
  const pack = await q
    .selectFrom('eduGoiHoc')
    .select('id')
    .executeTakeFirstOrThrow();
  const month = VN_TODAY().slice(0, 7);
  for (const [hocVienId, coSoId, soTien] of [
    [ids.hocVienA, ids.coSoA, 600000],
    [ids.hocVienB, ids.coSoB, 400000],
  ] as const) {
    await q
      .insertInto('eduThanhToan')
      .values({
        goiHocId: Number(pack.id),
        hocVienId,
        coSoId,
        soTien,
        hinhThuc: 'tien_mat',
        ngay: VN_TODAY(),
        thang: month,
        nguoiGhiNhanId: 'x',
      })
      .execute();
  }

  // Headcount: the coach sees their class, the manager their branch, the administrator both.
  const headcount = async (s: any) =>
    ((await (await report(s, { loai: 'siSo' })).json()) as Report).data.rows;
  expect(await headcount(hlvA.session)).toEqual([
    { coSo: 'Cơ sở Mẫu A', lop: 'Lớp Mẫu A1', soHocVien: 1 },
  ]);
  expect(await headcount(managerA.session)).toHaveLength(1);
  expect(await headcount(admin)).toHaveLength(2);

  // Low balance and attendance rate.
  const low = (await (
    await report(hlvA.session, { loai: 'sapHetBuoi' })
  ).json()) as Report;
  expect(low.data.rows.map((r) => r.ma)).toEqual(['HS-A']);
  const rate = (await (
    await report(hlvA.session, { loai: 'chuyenCan' })
  ).json()) as Report;
  expect(rate.data.rows).toEqual([
    {
      lop: 'Lớp Mẫu A1',
      tong: 1,
      coMat: 1,
      vangCoPhep: 0,
      vangKhongPhep: 0,
      tyLe: 100,
    },
  ]);
  // Student B never attended: away for more than two weeks (for the administrator, who sees both).
  const away = (await (
    await report(admin, { loai: 'nghiDai' })
  ).json()) as Report;
  expect(away.data.rows.map((r) => r.ma)).toEqual(['HS-B']);

  // Revenue: a coach is refused, the accountant sees every branch, the manager only theirs.
  expect((await report(hlvA.session, { loai: 'doanhThu' })).status).toBe(403);
  const revenue = async (s: any) =>
    ((await (await report(s, { loai: 'doanhThu' })).json()) as Report).data
      .rows;
  expect(await revenue(keToan.session)).toEqual([
    {
      thang: month,
      coSo: 'Cơ sở Mẫu A',
      doanhThu: 600000,
      soKhoan: 1,
      trungBinh: 600000,
    },
    {
      thang: month,
      coSo: 'Cơ sở Mẫu B',
      doanhThu: 400000,
      soKhoan: 1,
      trungBinh: 400000,
    },
  ]);
  expect(await revenue(managerA.session)).toEqual([
    {
      thang: month,
      coSo: 'Cơ sở Mẫu A',
      doanhThu: 600000,
      soKhoan: 1,
      trungBinh: 600000,
    },
  ]);
});

test('exporting is its own action: a coach can view a report but not download it', async ({
  testApp,
  connection,
}) => {
  const { hlvA, managerA, keToan, ids } = await setup(testApp, connection);
  await connection.query
    .updateTable('eduHocVien')
    .set({ hoTen: '=HYPERLINK("x")', soBuoiConLai: 1 })
    .where('id', '=', ids.hocVienA)
    .execute();

  // The coach sees the report on screen but is refused the file; nothing is logged.
  expect((await report(hlvA.session, { loai: 'sapHetBuoi' })).status).toBe(200);
  expect(
    (await post(hlvA.session, '/baoCao/xuatCsv', { loai: 'sapHetBuoi' }))
      .status,
  ).toBe(403);
  expect(
    await connection.query
      .selectFrom('eduXuatDuLieuNhatKy')
      .select('id')
      .execute(),
  ).toHaveLength(0);

  const csv = await post(managerA.session, '/baoCao/xuatCsv', {
    loai: 'sapHetBuoi',
  });
  expect(csv.status).toBe(200);
  expect(csv.headers.get('content-type')).toContain('text/csv');
  const body = await csv.text();
  expect(body.split('\r\n')[0]).toContain('Số buổi còn lại');
  expect(body).toContain("'=HYPERLINK");
  const log = await connection.query
    .selectFrom('eduXuatDuLieuNhatKy')
    .select(['userId', 'loai', 'soDong'])
    .execute();
  expect(log).toEqual([
    { userId: managerA.id, loai: 'bao_cao_sapHetBuoi', soDong: 1 },
  ]);
  // The log never holds a name.
  expect(JSON.stringify(log)).not.toContain('HYPERLINK');

  // The accountant may export, and sees revenue.
  expect(
    (await post(keToan.session, '/baoCao/xuatCsv', { loai: 'doanhThu' }))
      .status,
  ).toBe(200);
});

test('the attendance report leaves out classes the caller may not see, and a huge report is refused', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, ids } = await setup(testApp, connection);
  const q = connection.query;
  // Student A once attended a session of class B (a make-up).
  await q
    .insertInto('eduBuoiHoc')
    .values({
      lopId: ids.lopB,
      ngay: VN_TODAY(),
      gioBatDau: '17:30',
      gioKetThuc: '19:00',
    })
    .execute();
  const sessionB = await q
    .selectFrom('eduBuoiHoc')
    .select('id')
    .where('lopId', '=', ids.lopB)
    .executeTakeFirstOrThrow();
  await q
    .insertInto('eduDiemDanh')
    .values({
      buoiHocId: Number(sessionB.id),
      hocVienId: ids.hocVienA,
      trangThai: 'hoc_bu',
    })
    .execute();
  const mine = (await (
    await report(hlvA.session, { loai: 'chuyenCan' })
  ).json()) as Report;
  expect(mine.data.rows).toEqual([]);
  const all = (await (
    await report(admin, { loai: 'chuyenCan' })
  ).json()) as Report;
  expect(all.data.rows.map((r) => r.lop)).toEqual(['Lớp Mẫu B1']);

  // More rows than a report reads: a clear error, never a short report.
  for (let from = 0; from < 5001; from += 100) {
    await q
      .insertInto('eduHocVien')
      .values(
        Array.from({ length: Math.min(100, 5001 - from) }, (_, i) => ({
          ma: `HS-BIG-${from + i}`,
          hoTen: `Học viên Mẫu ${from + i}`,
          namSinh: 2016,
          levelKey: 'tot',
          levelOrder: 1,
          lopId: ids.lopA,
          coSoId: ids.coSoA,
        })),
      )
      .execute();
  }
  const big = await report(admin, { loai: 'siSo' });
  expect(big.status).toBe(400);
  expect(
    ((await big.json()) as { error: { reason: string } }).error.reason,
  ).toBe('EDU_REPORT_TOO_LARGE');
});

test('a coach writes monthly comments for their own class only, and exports them as text', async ({
  testApp,
  connection,
}) => {
  const { hlvA, hlvB, keToan, ids } = await setup(testApp, connection);

  const saved = await post(hlvA.session, '/nhanXet/luu', {
    hocVienId: ids.hocVienA,
    thang: '2026-10',
    noiDung: 'Bé tập trung, nắm chắc cách chiếu hết.',
  });
  expect(saved.status).toBe(201);
  // Writing again replaces the comment instead of adding a second one.
  expect(
    (
      await post(hlvA.session, '/nhanXet/luu', {
        hocVienId: ids.hocVienA,
        thang: '2026-10',
        noiDung: 'Bé tập trung, tiến bộ rõ.',
      })
    ).status,
  ).toBe(201);
  const rows = await connection.query
    .selectFrom('eduNhanXetThang')
    .select(['noiDung', 'hlvId', 'lopId'])
    .execute();
  expect(rows).toEqual([
    { noiDung: 'Bé tập trung, tiến bộ rõ.', hlvId: hlvA.id, lopId: ids.lopA },
  ]);

  // Another class, and an accountant, are refused.
  expect([403, 404]).toContain(
    (
      await post(hlvA.session, '/nhanXet/luu', {
        hocVienId: ids.hocVienB,
        thang: '2026-10',
        noiDung: 'Không được viết.',
      })
    ).status,
  );
  expect(
    (
      await post(keToan.session, '/nhanXet/luu', {
        hocVienId: ids.hocVienA,
        thang: '2026-10',
        noiDung: 'Kế toán không viết.',
      })
    ).status,
  ).toBe(403);

  const text = await post(hlvA.session, '/nhanXet/xuatVanBan', {
    thang: '2026-10',
  });
  expect(text.status).toBe(200);
  const data = (
    (await text.json()) as {
      data: { soDong: number; danhSach: { vanBan: string }[] };
    }
  ).data;
  expect(data.soDong).toBe(1);
  expect(data.danhSach[0]!.vanBan).toContain('Nhận xét tháng 10/2026');
  expect(data.danhSach[0]!.vanBan).toContain('tiến bộ rõ');
  // Another coach sees nothing of this class.
  const other = (await (
    await post(hlvB.session, '/nhanXet/xuatVanBan', { thang: '2026-10' })
  ).json()) as { data: { soDong: number } };
  expect(other.data.soDong).toBe(0);
});

test('a periodic review and a year-end summary are comments of their own, apart from the month', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids } = await setup(testApp, connection);
  for (const [thang, noiDung] of [
    ['2026-K3', 'Ý thức: tốt.'],
    ['2026-CN', 'Ưu điểm: bền bỉ.'],
    ['2026-10', 'Nhận xét tháng.'],
  ] as const)
    expect(
      (
        await post(hlvA.session, '/nhanXet/luu', {
          hocVienId: ids.hocVienA,
          thang,
          noiDung,
        })
      ).status,
    ).toBe(201);
  // Three comments, no replacement: each key is its own comment.
  expect(
    (
      await connection.query
        .selectFrom('eduNhanXetThang')
        .select('id')
        .execute()
    ).length,
  ).toBe(3);
  const text = async (thang: string) =>
    (
      (await (
        await post(hlvA.session, '/nhanXet/xuatVanBan', { thang })
      ).json()) as { data: { danhSach: { vanBan: string }[] } }
    ).data.danhSach.map((x) => x.vanBan);
  expect((await text('2026-K3'))[0]).toContain(
    'Nhận xét định kỳ lần 3 năm 2026',
  );
  expect((await text('2026-CN'))[0]).toContain('Tổng kết cuối năm 2026');
  // Keys that are neither a month nor a review are refused.
  for (const thang of ['2026-13', '2026-K0', '2026-K10', '2026-XX'])
    expect(
      (
        await post(hlvA.session, '/nhanXet/luu', {
          hocVienId: ids.hocVienA,
          thang,
          noiDung: 'x',
        })
      ).status,
    ).toBe(400);
});

test('the home summary lists today sessions and unmarked ones for the coach only', async ({
  testApp,
  connection,
}) => {
  const { hlvA, hlvB, ids } = await setup(testApp, connection);
  await connection.query
    .insertInto('eduBuoiHoc')
    .values({
      lopId: ids.lopA,
      ngay: VN_TODAY(),
      gioBatDau: '17:30',
      gioKetThuc: '19:00',
    })
    .execute();
  const mine = (await (
    await post(hlvA.session, '/trangChu/tomTat', {})
  ).json()) as {
    data: {
      homNay: { lop: string; daDiemDanh: boolean }[];
      chuaDiemDanh: unknown[];
    };
  };
  expect(mine.data.homNay).toMatchObject([
    { lop: 'Lớp Mẫu A1', daDiemDanh: false },
  ]);
  expect(mine.data.chuaDiemDanh).toHaveLength(1);
  const theirs = (await (
    await post(hlvB.session, '/trangChu/tomTat', {})
  ).json()) as {
    data: { homNay: unknown[] };
  };
  expect(theirs.data.homNay).toEqual([]);
});

test('the class form lists coaches by name, for those who manage classes', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB, keToan } = await setup(testApp, connection);
  const list = (await (await post(admin, '/hlv/danhSach', {})).json()) as {
    data: { id: string; name: string }[];
  };
  const listed = list.data.map((u) => u.id);
  expect(listed).toContain(hlvA.id);
  expect(listed).toContain(hlvB.id);
  expect(listed).not.toContain(keToan.id);
  expect((await post(keToan.session, '/hlv/danhSach', {})).status).toBe(403);
  expect((await post(hlvA.session, '/hlv/danhSach', {})).status).toBe(403);
});

test('the negative-balance report lists only studying students who owe sessions, inside the caller scope', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, managerA, keToan, ids } = await setup(
    testApp,
    connection,
  );
  const q = connection.query;
  await q
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: -3 })
    .where('id', '=', ids.hocVienA)
    .execute();
  await q
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: -1 })
    .where('id', '=', ids.hocVienB)
    .execute();

  const rows = async (s: any) =>
    ((await (await report(s, { loai: 'soDuAm' })).json()) as Report).data.rows;
  // The coach sees their class, the manager their branch, the administrator both (worst balance first).
  expect((await rows(hlvA.session)).map((r) => r.ma)).toEqual(['HS-A']);
  expect(await rows(hlvA.session)).toMatchObject([
    { soBuoiConLai: -3, buoiNo: 3 },
  ]);
  expect((await rows(managerA.session)).map((r) => r.ma)).toEqual(['HS-A']);
  expect((await rows(admin)).map((r) => r.ma)).toEqual(['HS-A', 'HS-B']);
  // The accountant sees every branch, like the other balance reports.
  expect((await rows(keToan.session)).length).toBe(2);

  // A student who left, or whose balance is zero or positive, is not listed.
  await q
    .updateTable('eduHocVien')
    .set({ trangThai: 'da_nghi' })
    .where('id', '=', ids.hocVienA)
    .execute();
  await q
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: 0 })
    .where('id', '=', ids.hocVienB)
    .execute();
  expect(await rows(admin)).toEqual([]);

  // It exports like the other reports, and the export is logged without names.
  const exported = await post(admin, '/baoCao/xuatCsv', { loai: 'soDuAm' });
  expect(exported.status).toBe(200);
});

test('the missing-consent report lists studying students with no learning consent in force', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, ids } = await setup(testApp, connection);
  const q = connection.query;
  await q
    .insertInto('eduPhuHuynh')
    .values({ ma: 'PH-MAU', hoTen: 'Phụ huynh Mẫu', soDienThoai: '0900000001' })
    .execute();
  const parent = await q
    .selectFrom('eduPhuHuynh')
    .select('id')
    .where('ma', '=', 'PH-MAU')
    .executeTakeFirstOrThrow();
  const consent = (
    hocVienId: number,
    over: Record<string, unknown> = {},
  ): Promise<unknown> =>
    q
      .insertInto('eduDongY')
      .values({
        hocVienId,
        phuHuynhId: Number(parent.id),
        mucDich: 'hoc_tap',
        dongY: true,
        phienBanDieuKhoan: 'v1',
        thoiDiem: new Date(),
        kenh: 'giay',
        nguoiGhiNhanId: 'x',
        ...over,
      })
      .execute();
  const rows = async (s: any) =>
    ((await (await report(s, { loai: 'thieuDongY' })).json()) as Report).data
      .rows;

  // Nobody consented yet: both students, the coach only their own.
  expect((await rows(admin)).map((r) => r.ma)).toEqual(['HS-A', 'HS-B']);
  expect((await rows(hlvA.session)).map((r) => r.ma)).toEqual(['HS-A']);

  // A consent for another purpose, a refusal and a withdrawn consent do not count; a valid one does.
  await consent(ids.hocVienA, { mucDich: 'anh_video' });
  await consent(ids.hocVienA, { dongY: false });
  await consent(ids.hocVienA, { rutLaiLuc: new Date() });
  expect((await rows(admin)).map((r) => r.ma)).toEqual(['HS-A', 'HS-B']);
  await consent(ids.hocVienA);
  expect((await rows(admin)).map((r) => r.ma)).toEqual(['HS-B']);
});
