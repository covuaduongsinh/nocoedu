import { buildSort } from '@nocobase/repository-input';
import { expect } from 'vitest';

import { pageFilter } from '../../client/pages/edu/kit.js';
import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

type Json = {
  data: Record<string, unknown>[] | Record<string, unknown> | number | null;
};
const read = async (response: Response): Promise<Json> =>
  (await response.json()) as Json;

test('the student file and class page read only what the coach may see, also when the record API is called directly', async ({
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
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const q = connection.query;
  // One session, mark, package and balance row for each class: made-up data only.
  for (const [lopId, hocVienId, coSoId] of [
    [ids.lopA, ids.hocVienA, ids.coSoA],
    [ids.lopB, ids.hocVienB, ids.coSoB],
  ] as const) {
    await q
      .insertInto('eduBuoiHoc')
      .values({
        lopId,
        ngay: '2026-11-03',
        gioBatDau: '18:00',
        gioKetThuc: '19:30',
        trangThai: 'da_diem_danh',
      })
      .execute();
    const session = await q
      .selectFrom('eduBuoiHoc')
      .select('id')
      .where('lopId', '=', lopId)
      .executeTakeFirstOrThrow();
    await q
      .insertInto('eduDiemDanh')
      .values({
        buoiHocId: Number(session.id),
        hocVienId,
        trangThai: 'co_mat',
        nhanXet: 'Nhận xét mẫu',
      })
      .execute();
    await q
      .insertInto('eduGoiHoc')
      .values({
        hocVienId,
        soBuoi: 12,
        donGia: 100000,
        thanhTien: 1200000,
        ngayMua: '2026-10-01',
        nguoiTaoId: 'seed',
      })
      .execute();
    const pack = await q
      .selectFrom('eduGoiHoc')
      .select('id')
      .where('hocVienId', '=', hocVienId)
      .executeTakeFirstOrThrow();
    await q
      .insertInto('eduSoDuNhatKy')
      .values({
        hocVienId,
        thayDoi: 12,
        soDuSau: 12,
        lyDo: 'mua_goi',
        goiHocId: Number(pack.id),
        createdAt: new Date().toISOString(),
      })
      .execute();
    void coSoId;
  }

  // The register of the other class's student: nothing comes back, neither rows nor a count.
  const attendanceOf = (hocVienId: number) =>
    pageFilter({ page: 1, where: { hocVienId } });
  const own = await read(
    await post(hlvA.session, '/diemDanh/findMany', {
      filter: attendanceOf(ids.hocVienA),
    }),
  );
  expect(own.data).toHaveLength(1);
  const other = await post(hlvA.session, '/diemDanh/findMany', {
    filter: attendanceOf(ids.hocVienB),
  });
  expect(other.status).toBe(200);
  expect((await read(other)).data).toEqual([]);
  expect(
    (
      await read(
        await post(hlvA.session, '/diemDanh/count', {
          filter: attendanceOf(ids.hocVienB),
        }),
      )
    ).data,
  ).toBe(0);
  // Packages are not a coach's (403 whoever the student is); the balance history is, for their own class only.
  for (const hocVienId of [ids.hocVienA, ids.hocVienB]) {
    const response = await post(hlvA.session, '/goiHoc/findMany', {
      filter: attendanceOf(hocVienId),
    });
    expect(response.status).toBe(403);
  }
  const ledgerOf = async (session: typeof hlvA.session, hocVienId: number) =>
    (
      await read(
        await post(session, '/soDuNhatKy/findMany', {
          filter: attendanceOf(hocVienId),
        }),
      )
    ).data as unknown[];
  expect(await ledgerOf(hlvA.session, ids.hocVienA)).toHaveLength(1);
  expect(await ledgerOf(hlvA.session, ids.hocVienB)).toEqual([]);
  // The branch manager sells packages: their branch's student only.
  for (const name of ['goiHoc', 'soDuNhatKy']) {
    const rowsOf = async (hocVienId: number) =>
      (
        await read(
          await post(managerA.session, `/${name}/findMany`, {
            filter: attendanceOf(hocVienId),
          }),
        )
      ).data as unknown[];
    expect(`${name} ${(await rowsOf(ids.hocVienA)).length}`).toBe(`${name} 1`);
    expect(await rowsOf(ids.hocVienB)).toEqual([]);
  }

  // The student and class themselves, by id.
  for (const [name, id] of [
    ['hocVien', ids.hocVienB],
    ['lop', ids.lopB],
  ] as const) {
    const response = await post(hlvA.session, `/${name}/findOne`, {
      filter: { id },
    });
    if (response.status === 200)
      expect((await read(response)).data ?? null).toBeNull();
    else expect([403, 404]).toContain(response.status);
  }
  const sessions = await read(
    await post(hlvA.session, '/buoiHoc/findMany', {
      filter: pageFilter({ page: 1, where: { lopId: ids.lopB } }),
    }),
  );
  expect(sessions.data).toEqual([]);
  const roster = await read(
    await post(hlvA.session, '/hocVien/findMany', {
      filter: pageFilter({ page: 1, where: { lopId: ids.lopB } }),
    }),
  );
  expect(roster.data).toEqual([]);

  // Their own student's file opens, and the administrator reads both.
  const mine = await read(
    await post(hlvA.session, '/hocVien/findOne', {
      filter: { id: ids.hocVienA },
    }),
  );
  expect((mine.data as { ma: string }).ma).toBe('HS-A');
  const all = await read(await post(admin, '/hocVien/count', {}));
  expect(all.data).toBe(2);
});

test('a list is paged on the server and its search ignores case and matches name or code', async ({
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
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const rows = Array.from({ length: 30 }, (_, index) => ({
    ma: `HS-P${String(index + 1).padStart(2, '0')}`,
    hoTen: `Học viên Phân Trang ${index + 1}`,
    namSinh: 2016,
    levelKey: 'tot',
    levelOrder: 1,
    lopId: ids.lopA,
    coSoId: ids.coSoA,
  }));
  await connection.query.insertInto('eduHocVien').values(rows).execute();

  const page = async (n: number, search = '') =>
    read(
      await post(admin, '/hocVien/findMany', {
        filter: pageFilter({
          page: n,
          search,
          searchFields: ['ma', 'hoTen'],
        }),
        sort: buildSort((sort) => sort.field('id').asc()),
        limit: 25,
        offset: (n - 1) * 25,
      }),
    );
  // 32 students: 25 on the first page, 7 on the second.
  expect(((await page(1)).data as unknown[]).length).toBe(25);
  expect(((await page(2)).data as unknown[]).length).toBe(7);
  // Search: by code, by name in another case, and nothing for a word that is nowhere.
  const byCode = (await page(1, 'hs-p07')).data as { ma: string }[];
  expect(byCode.map((r) => r.ma)).toEqual(['HS-P07']);
  const byName = (await page(1, 'phân trang 3')).data as unknown[];
  expect(byName.length).toBeGreaterThan(0);
  expect(((await page(1, 'không-có-ở-đâu')).data as unknown[]).length).toBe(0);
  const count = await read(
    await post(admin, '/hocVien/count', {
      filter: pageFilter({
        page: 1,
        search: 'Phân Trang',
        searchFields: ['ma', 'hoTen'],
      }),
    }),
  );
  expect(count.data).toBe(30);
});
