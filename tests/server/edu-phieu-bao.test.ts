import { describe, expect } from 'vitest';

import { currentMark, latestPackageId } from '../../server/edu/phieu-bao.js';
import { todayVn } from '../../server/edu/so-du.js';
import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

const GHI = '/phieuBao/ghi';
const XOA = '/phieuBao/xoa';
const QR = '/phieuBao/vietQr';
const CAN_THU = '/soDu/canhBao';
const HO_SO = '/hocVien/hoSo360';

type Q = Parameters<typeof seedSchool>[0];

async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Q,
) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'pb-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'pb-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'pb-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'pb-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  // Both students are studying and have run out, so both are on the "to collect" list.
  await connection.query
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: 0 })
    .where('id', 'in', [ids.hocVienA, ids.hocVienB])
    .execute();
  return { admin, hlvA, managerA, keToan, ids };
}

async function packageOf(
  connection: Q,
  hocVienId: number,
  ngayMua: string,
  thanhTien: number,
): Promise<number> {
  await connection.query
    .insertInto('eduGoiHoc')
    .values({
      hocVienId,
      soBuoi: 20,
      donGia: thanhTien / 20,
      thanhTien,
      ngayMua,
      nguoiTaoId: 'seed',
    })
    .execute();
  const row = await connection.query
    .selectFrom('eduGoiHoc')
    .select('id')
    .where('hocVienId', '=', hocVienId)
    .where('ngayMua', '=', ngayMua)
    .executeTakeFirstOrThrow();
  return Number(row.id);
}

const json = async <T = Record<string, any>>(response: Response): Promise<T> =>
  (await response.json()) as T;

const marksOf = (connection: Q) =>
  connection.query
    .selectFrom('eduPhieuBao')
    .select([
      'id',
      'hocVienId',
      'goiHocId',
      'ngay',
      'soBuoiConLai',
      'nguoiBaoId',
    ])
    .execute();

describe('which mark counts (pure rules)', () => {
  test('the term a student is on is the last package in effect, by day bought then id', () => {
    expect(latestPackageId([])).toBeNull();
    expect(
      latestPackageId([
        { id: 1, ngayMua: '2026-01-01', trangThai: 'hieu_luc' },
        { id: 2, ngayMua: '2026-03-01', trangThai: 'hieu_luc' },
        // A cancelled package is not a term.
        { id: 3, ngayMua: '2026-05-01', trangThai: 'da_huy' },
        { id: 4, ngayMua: '2026-03-01', trangThai: 'hieu_luc' },
      ]),
    ).toBe(4);
  });

  test('only a mark of that term counts, the newest one', () => {
    const marks = [
      { id: 1, goiHocId: 7, ngay: '2026-03-01' },
      { id: 2, goiHocId: 9, ngay: '2026-06-01' },
      { id: 3, goiHocId: 9, ngay: '2026-06-05' },
      { id: 4, goiHocId: null, ngay: '2026-07-01' },
    ];
    expect(currentMark(marks, 9)).toEqual({ id: 3, ngay: '2026-06-05' });
    expect(currentMark(marks, 7)).toEqual({ id: 1, ngay: '2026-03-01' });
    // A newer term nobody was told about yet.
    expect(currentMark(marks, 12)).toBeNull();
    // A student without a package: only a mark without a package counts.
    expect(currentMark(marks, null)).toEqual({ id: 4, ngay: '2026-07-01' });
  });
});

test('the notice routes answer 401 without a session', async ({
  testApp,
  connection,
  request,
}) => {
  await setup(testApp, connection);
  for (const path of [GHI, XOA, QR]) {
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

test('marking a term is written once a day, shows in the student file and can be taken back', async ({
  testApp,
  connection,
}) => {
  const { keToan, ids } = await setup(testApp, connection);
  const pack = await packageOf(connection, ids.hocVienA, '2026-10-01', 3000000);

  const first = await post(keToan.session, GHI, {
    hocVienId: ids.hocVienA,
    goiHocId: pack,
  });
  expect(first.status).toBe(201);
  const created = (await json(first)).data;
  expect(created).toMatchObject({ ngay: todayVn(), moi: true });

  // A second click on the same day writes nothing.
  const again = await post(keToan.session, GHI, {
    hocVienId: ids.hocVienA,
    goiHocId: pack,
  });
  expect(again.status).toBe(200);
  expect((await json(again)).data).toMatchObject({
    id: created.id,
    moi: false,
  });
  expect(await marksOf(connection)).toEqual([
    {
      id: created.id,
      hocVienId: ids.hocVienA,
      goiHocId: pack,
      ngay: todayVn(),
      soBuoiConLai: 0,
      nguoiBaoId: keToan.id,
    },
  ]);

  // The student file lists it in the tuition section, with the name of who marked it and nothing else about them.
  const file = (
    await json(await post(keToan.session, HO_SO, { hocVienId: ids.hocVienA }))
  ).data;
  expect(file.hocPhi.cacLanBao).toEqual([
    {
      id: created.id,
      goiHocId: pack,
      ngay: todayVn(),
      soBuoiConLai: 0,
      nguoiBao: 'pb-kt',
    },
  ]);

  const removed = await post(keToan.session, XOA, { id: created.id });
  expect(removed.status).toBe(200);
  expect(await marksOf(connection)).toEqual([]);
  // A mark that is gone is "not found".
  expect((await post(keToan.session, XOA, { id: created.id })).status).toBe(
    404,
  );
});

test('a mark needs the collecting permission, a student in scope and a package of that student', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, managerA, ids } = await setup(testApp, connection);
  const packA = await packageOf(
    connection,
    ids.hocVienA,
    '2026-10-01',
    3000000,
  );
  const packB = await packageOf(
    connection,
    ids.hocVienB,
    '2026-10-01',
    3000000,
  );

  // A coach sees no tuition: refused before anything is read.
  expect(
    (
      await post(hlvA.session, GHI, {
        hocVienId: ids.hocVienA,
        goiHocId: packA,
      })
    ).status,
  ).toBe(403);
  expect((await post(hlvA.session, XOA, { id: 1 })).status).toBe(403);

  // The manager of branch A does not see the student of branch B: "not found", like a student that does not exist.
  const outside = await post(managerA.session, GHI, {
    hocVienId: ids.hocVienB,
    goiHocId: packB,
  });
  expect(outside.status).toBe(404);
  expect((await json(outside)).error.reason).toBe('EDU_STUDENT_NOT_FOUND');
  // A package of another student is not this student's term.
  const wrong = await post(admin, GHI, {
    hocVienId: ids.hocVienA,
    goiHocId: packB,
  });
  expect(wrong.status).toBe(404);
  expect((await json(wrong)).error.reason).toBe('EDU_PACKAGE_NOT_FOUND');
  expect(await marksOf(connection)).toEqual([]);

  // A term that is a manual adjustment has no package.
  expect(
    (
      await post(managerA.session, GHI, {
        hocVienId: ids.hocVienA,
        goiHocId: null,
      })
    ).status,
  ).toBe(201);

  // The manager of branch A cannot take back a mark of branch B.
  const other = (
    await json(
      await post(admin, GHI, { hocVienId: ids.hocVienB, goiHocId: packB }),
    )
  ).data;
  expect((await post(managerA.session, XOA, { id: other.id })).status).toBe(
    404,
  );
  expect(await marksOf(connection)).toHaveLength(2);
});

test('"to collect" says who was told for the term they are on, filters on it and forgets it when a new term is bought', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, ids } = await setup(testApp, connection);
  const packA = await packageOf(
    connection,
    ids.hocVienA,
    '2026-10-01',
    3000000,
  );
  await packageOf(connection, ids.hocVienB, '2026-10-01', 3000000);
  const list = async (
    session: Parameters<typeof post>[0],
    baoPhuHuynh?: string,
  ) =>
    (
      await json(
        await post(session, CAN_THU, {
          trang: 1,
          limit: 25,
          ...(baoPhuHuynh ? { baoPhuHuynh } : {}),
        }),
      )
    ).data as {
      tong: number;
      coBaoPhuHuynh: boolean;
      hocVien: { id: number; daBao?: { id: number; ngay: string } | null }[];
    };
  const told = (rows: Awaited<ReturnType<typeof list>>) =>
    Object.fromEntries(rows.hocVien.map((row) => [row.id, row.daBao]));

  const before = await list(admin);
  expect(before.coBaoPhuHuynh).toBe(true);
  expect(told(before)).toEqual({ [ids.hocVienA]: null, [ids.hocVienB]: null });

  const mark = (
    await json(
      await post(admin, GHI, { hocVienId: ids.hocVienA, goiHocId: packA }),
    )
  ).data;
  expect(told(await list(admin))).toEqual({
    [ids.hocVienA]: { id: mark.id, ngay: todayVn() },
    [ids.hocVienB]: null,
  });
  const notTold = await list(admin, 'chua_bao');
  expect(notTold.tong).toBe(1);
  expect(notTold.hocVien.map((row) => row.id)).toEqual([ids.hocVienB]);
  const wasTold = await list(admin, 'da_bao');
  expect(wasTold.tong).toBe(1);
  expect(wasTold.hocVien.map((row) => row.id)).toEqual([ids.hocVienA]);

  // A coach gets the plain list: no marks, and the filter does nothing.
  const coach = await list(hlvA.session, 'da_bao');
  expect(coach.coBaoPhuHuynh).toBe(false);
  expect(coach.hocVien.map((row) => row.id)).toEqual([ids.hocVienA]);
  expect(coach.hocVien[0]).not.toHaveProperty('daBao');

  // The parent pays: a new package is the term the student is on now, and nobody was told about that one.
  await packageOf(connection, ids.hocVienA, '2026-11-15', 3000000);
  expect(told(await list(admin))[ids.hocVienA]).toBeNull();
  expect((await list(admin, 'da_bao')).tong).toBe(0);
});

test('the VietQR code of the next term suggests the price of the latest package and takes another amount', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, managerA, ids } = await setup(testApp, connection);
  const env = process.env;
  const keep = {
    bank: env.EDU_VIETQR_BANK_ID,
    no: env.EDU_VIETQR_ACCOUNT_NO,
  };
  try {
    delete env.EDU_VIETQR_BANK_ID;
    delete env.EDU_VIETQR_ACCOUNT_NO;
    await packageOf(connection, ids.hocVienA, '2026-09-01', 2400000);
    await packageOf(connection, ids.hocVienA, '2026-10-01', 3000000);
    // A package loaded from Lark without its payment has no price: it suggests nothing.
    await packageOf(connection, ids.hocVienA, '2026-11-01', 0);

    // Without a bank account the answer says so; it is not an error and carries no code.
    const unset = (
      await json(await post(admin, QR, { hocVienId: ids.hocVienA }))
    ).data;
    expect(unset).toEqual({
      cauHinh: false,
      soTienGoiY: 3000000,
      soTien: null,
      noiDungCk: 'HP HS-A',
      url: null,
    });

    env.EDU_VIETQR_BANK_ID = 'TESTBANK';
    env.EDU_VIETQR_ACCOUNT_NO = '0000000000';
    const suggested = (
      await json(await post(admin, QR, { hocVienId: ids.hocVienA }))
    ).data;
    expect(suggested).toMatchObject({
      cauHinh: true,
      soTienGoiY: 3000000,
      soTien: 3000000,
      noiDungCk: 'HP HS-A',
    });
    const url = new URL(suggested.url);
    expect(url.origin + url.pathname).toBe(
      // The address a page may fetch: `.png` redirects without a CORS header.
      'https://img.vietqr.io/image/TESTBANK-0000000000-compact2.svg',
    );
    expect(url.searchParams.get('amount')).toBe('3000000');
    expect(url.searchParams.get('addInfo')).toBe('HP HS-A');

    const typed = (
      await json(
        await post(admin, QR, { hocVienId: ids.hocVienA, soTien: 2500000 }),
      )
    ).data;
    expect(typed.soTien).toBe(2500000);
    expect(new URL(typed.url).searchParams.get('amount')).toBe('2500000');

    // A student without a priced package: no suggestion, no code until an amount is typed.
    const none = (
      await json(await post(admin, QR, { hocVienId: ids.hocVienB }))
    ).data;
    expect(none).toMatchObject({ cauHinh: true, soTienGoiY: null, url: null });

    // Outside the scope is "not found"; a coach holds no tuition action; a silly amount is refused.
    expect(
      (await post(managerA.session, QR, { hocVienId: ids.hocVienB })).status,
    ).toBe(404);
    expect(
      (await post(hlvA.session, QR, { hocVienId: ids.hocVienA })).status,
    ).toBe(403);
    expect(
      (await post(admin, QR, { hocVienId: ids.hocVienA, soTien: 0 })).status,
    ).toBe(400);
  } finally {
    if (keep.bank === undefined) delete env.EDU_VIETQR_BANK_ID;
    else env.EDU_VIETQR_BANK_ID = keep.bank;
    if (keep.no === undefined) delete env.EDU_VIETQR_ACCOUNT_NO;
    else env.EDU_VIETQR_ACCOUNT_NO = keep.no;
  }
});
