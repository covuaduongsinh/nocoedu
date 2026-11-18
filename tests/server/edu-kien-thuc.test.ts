import { expect } from 'vitest';

import {
  adminSession,
  idByMa,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

/**
 * The knowledge system (GĐ 4): the curriculum and its CSV, the skills taught in a session, what the register writes,
 * the matrix, grading by hand and the gaps. Made-up data only ("Học viên Mẫu").
 */
type Json = {
  data?: Record<string, any>;
  error?: { reason?: string; status?: string };
};
type Session = Parameters<typeof post>[0];

const call = async (session: Session, path: string, body: unknown) => {
  const response = await post(session, path, body);
  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Json,
  };
};

async function setup(
  testApp: Parameters<typeof adminSession>[0],
  connection: Parameters<typeof seedSchool>[0],
) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'kt-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'kt-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'kt-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'kt-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  const q = connection.query;
  for (const lopId of [ids.lopA, ids.lopB])
    await post(admin, '/lopNhom/taoMacDinh', { lopId });
  // Two more students in class A (made up).
  for (const [ma, hoTen] of [
    ['HS-A2', 'Học viên Mẫu A2'],
    ['HS-A3', 'Học viên Mẫu A3'],
  ] as const)
    await q
      .insertInto('eduHocVien')
      .values({
        ma,
        hoTen,
        namSinh: 2016,
        levelKey: 'tot',
        levelOrder: 1,
        lopId: ids.lopA,
        coSoId: ids.coSoA,
      })
      .execute();
  const hocVienA2 = await idByMa(connection, 'eduHocVien', 'HS-A2');
  const hocVienA3 = await idByMa(connection, 'eduHocVien', 'HS-A3');
  const sessionIds: number[] = [];
  for (const [lopId, ngay] of [
    [ids.lopA, '2026-11-02'],
    [ids.lopA, '2026-11-09'],
    [ids.lopA, '2026-11-16'],
    [ids.lopB, '2026-11-02'],
  ] as const) {
    await q
      .insertInto('eduBuoiHoc')
      .values({ lopId, ngay, gioBatDau: '17:30', gioKetThuc: '19:00' })
      .execute();
  }
  const rows = (await q
    .selectFrom('eduBuoiHoc')
    .select(['id', 'lopId', 'ngay'])
    .orderBy('id')
    .execute()) as { id: number; lopId: number; ngay: string }[];
  for (const row of rows) sessionIds.push(Number(row.id));
  const groups = (lopId: number) =>
    q
      .selectFrom('eduLopNhom')
      .select(['id', 'ten'])
      .where('lopId', '=', lopId)
      .orderBy('thuTu')
      .execute() as Promise<{ id: number; ten: string }[]>;
  const groupsA = (await groups(ids.lopA)).map((g) => Number(g.id));
  const groupsB = (await groups(ids.lopB)).map((g) => Number(g.id));

  // The curriculum: one topic with three skills, one hidden skill, and a second topic of level "ma".
  const topic = await call(admin, '/chuongTrinh/chuDe/luu', {
    levelKey: 'tot',
    ma: 'T01',
    ten: 'Làm quen bàn cờ',
  });
  expect(topic.status).toBe(201);
  const topicId = Number(topic.body.data?.id);
  const skill = async (ma: string, ten: string, chuDeId = topicId) => {
    const created = await call(admin, '/chuongTrinh/kyNang/luu', {
      chuDeId,
      ma,
      ten,
    });
    expect(created.status).toBe(201);
    return Number(created.body.data?.id);
  };
  const s1 = await skill('T01-01', 'Nhận biết ô cờ');
  const s2 = await skill('T01-02', 'Cách đi của tốt');
  const s3 = await skill('T01-03', 'Cách đi của vua');
  const hidden = await skill('T01-99', 'Kỹ năng đã ẩn');
  expect(
    (
      await call(admin, '/chuongTrinh/kyNang/luu', {
        id: hidden,
        trangThai: 'an',
      })
    ).status,
  ).toBe(200);
  return {
    admin,
    hlvA,
    hlvB,
    managerA,
    keToan,
    ids: {
      ...ids,
      hocVienA2,
      hocVienA3,
      s1Session: sessionIds[0] as number,
      s2Session: sessionIds[1] as number,
      s3Session: sessionIds[2] as number,
      sBSession: sessionIds[3] as number,
    },
    groupsA,
    groupsB,
    topicId,
    skills: { s1, s2, s3, hidden },
  };
}

const attendance = (
  session: Session,
  buoiHocId: number,
  danhSach: [number, string][],
) =>
  call(session, '/diemDanh/luu', {
    buoiHocId,
    danhSach: danhSach.map(([hocVienId, trangThai]) => ({
      hocVienId,
      trangThai,
    })),
  });

const states = async (connection: any, hocVienId: number) => {
  const rows = (await connection.query
    .selectFrom('eduHocVienKyNang')
    .select(['kyNangId', 'mucDo', 'nguon', 'buoiHocId'])
    .where('hocVienId', '=', hocVienId)
    .orderBy('kyNangId')
    .execute()) as Record<string, unknown>[];
  return rows.map((r) => ({
    kyNangId: Number(r.kyNangId),
    mucDo: r.mucDo,
    nguon: r.nguon,
    buoiHocId: r.buoiHocId == null ? null : Number(r.buoiHocId),
  }));
};

const anonymous = (request: any, path: string, body: unknown) =>
  request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  });

test('every route answers 401 without a session, and 403 when the action is not held', async ({
  request,
  testApp,
  connection,
}) => {
  const { hlvA, keToan, ids, skills } = await setup(testApp, connection);
  const csv = 'cap,maChuDe,tenChuDe,maKyNang,tenKyNang\ntot,T9,Chín,T9-1,Một\n';
  const all: [string, unknown][] = [
    ['/chuongTrinh/cay', {}],
    ['/chuongTrinh/chuDe/luu', { levelKey: 'tot', ma: 'X1', ten: 'X' }],
    ['/chuongTrinh/kyNang/luu', { chuDeId: 1, ma: 'X1', ten: 'X' }],
    ['/chuongTrinh/sapXep', { loai: 'chuDe', ids: [1] }],
    ['/chuongTrinh/nhapCsv/mau', {}],
    ['/chuongTrinh/nhapCsv/xemTruoc', { csv }],
    ['/chuongTrinh/nhapCsv/xacNhan', { csv }],
    ['/chuongTrinh/xuatCsv', {}],
    ['/buoiHoc/kyNang/xem', { buoiHocId: ids.s1Session }],
    [
      '/buoiHoc/kyNang/luu',
      { buoiHocId: ids.s1Session, nhomId: null, kyNangIds: [skills.s1] },
    ],
    ['/kienThuc/maTran', { lopId: ids.lopA }],
    [
      '/kienThuc/cham',
      { o: [{ hocVienId: ids.hocVienA, kyNangId: skills.s1, mucDo: 'dat' }] },
    ],
    ['/kienThuc/loHong', { lopId: ids.lopA }],
    ['/kienThuc/hoSo', { hocVienId: ids.hocVienA }],
  ];
  for (const [path, body] of all) {
    expect(`${path} ${(await anonymous(request, path, body)).status}`).toBe(
      `${path} 401`,
    );
  }
  // The accountant reads the curriculum and nothing of what a student learned.
  const accountant = (path: string) =>
    all.find(([p]) => p === path) as [string, unknown];
  for (const [path, body] of all) {
    const status = (await post(keToan.session, path, body)).status;
    expect(`${path} ${status}`).toBe(
      path === '/chuongTrinh/cay' || path === '/chuongTrinh/xuatCsv'
        ? // The curriculum is readable; the file needs the export action, which the accountant holds.
          `${path} 200`
        : `${path} 403`,
    );
  }
  void accountant;
  // A coach reads the curriculum, may not change it, and has no export action.
  for (const path of [
    '/chuongTrinh/chuDe/luu',
    '/chuongTrinh/kyNang/luu',
    '/chuongTrinh/sapXep',
    '/chuongTrinh/nhapCsv/mau',
    '/chuongTrinh/nhapCsv/xemTruoc',
    '/chuongTrinh/nhapCsv/xacNhan',
    '/chuongTrinh/xuatCsv',
  ]) {
    const body = all.find(([p]) => p === path)?.[1];
    expect(`${path} ${(await post(hlvA.session, path, body)).status}`).toBe(
      `${path} 403`,
    );
  }
  expect((await post(hlvA.session, '/chuongTrinh/cay', {})).status).toBe(200);
});

test('the administrator manages topics and skills; codes, levels and parents never change', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, topicId, skills } = await setup(testApp, connection);
  const tree = await call(admin, '/chuongTrinh/cay', {});
  expect(tree.body.data?.capDo).toHaveLength(6);
  expect(tree.body.data?.chuDe).toHaveLength(1);
  expect(tree.body.data?.kyNang).toHaveLength(4);
  // The coach reads the same tree.
  expect(
    (await call(hlvA.session, '/chuongTrinh/cay', { levelKey: 'tot' })).body
      .data?.kyNang,
  ).toHaveLength(4);
  expect(
    (await call(hlvA.session, '/chuongTrinh/cay', { levelKey: 'xe' })).body.data
      ?.chuDe,
  ).toHaveLength(0);

  // A code is taken once (topics and skills each have their own codes).
  const again = await call(admin, '/chuongTrinh/chuDe/luu', {
    levelKey: 'ma',
    ma: 'T01',
    ten: 'Trùng mã',
  });
  expect(again.status).toBe(409);
  expect(again.body.error?.reason).toBe('EDU_CODE_TAKEN');
  expect(
    (
      await call(admin, '/chuongTrinh/kyNang/luu', {
        chuDeId: topicId,
        ma: 'T01-01',
        ten: 'Trùng mã',
      })
    ).status,
  ).toBe(409);
  // Bad values.
  for (const body of [
    { levelKey: 'ma', ma: '-x', ten: 'Sai mã' },
    { levelKey: 'ma', ma: 'ok', ten: '   ' },
    { ma: 'ok', ten: 'Thiếu cấp' },
  ])
    expect((await call(admin, '/chuongTrinh/chuDe/luu', body)).status).toBe(
      400,
    );
  expect(
    (
      await call(admin, '/chuongTrinh/chuDe/luu', {
        levelKey: 'vong',
        ma: 'ok',
        ten: 'Cấp lạ',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call(admin, '/chuongTrinh/kyNang/luu', {
        chuDeId: 999999,
        ma: 'Z1',
        ten: 'Không có chủ đề',
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await call(admin, '/chuongTrinh/kyNang/luu', {
        chuDeId: topicId,
        ma: 'Z2',
        ten: 'Sách lạ',
        sachId: 999999,
      })
    ).status,
  ).toBe(404);

  // Rename, reorder, hide; the level and the code never change.
  expect(
    (
      await call(admin, '/chuongTrinh/chuDe/luu', {
        id: topicId,
        ten: 'Làm quen với bàn cờ',
      })
    ).status,
  ).toBe(200);
  const immutable = await call(admin, '/chuongTrinh/chuDe/luu', {
    id: topicId,
    levelKey: 'ma',
  });
  expect(immutable.status).toBe(400);
  expect(immutable.body.error?.reason).toBe('EDU_IMMUTABLE_FIELD');
  expect(
    (
      await call(admin, '/chuongTrinh/kyNang/luu', {
        id: skills.s1,
        chuDeId: 999999,
      })
    ).status,
  ).toBe(400);
  const moved = await call(admin, '/chuongTrinh/kyNang/luu', {
    id: skills.s1,
    ten: 'Nhận biết ô, hàng, cột',
    moTa: '  Gọi tên được ô  ',
  });
  expect(moved.status).toBe(200);
  const read = await call(admin, '/chuongTrinh/cay', {});
  const s1 = (read.body.data?.kyNang as Record<string, any>[]).find(
    (s) => s.id === skills.s1,
  );
  expect(s1).toMatchObject({
    ten: 'Nhận biết ô, hàng, cột',
    moTa: 'Gọi tên được ô',
  });
  expect(
    (await call(admin, '/chuongTrinh/chuDe/luu', { id: 999999, ten: 'x' }))
      .status,
  ).toBe(404);

  // Order: one list at a time, every id must exist.
  const order = [skills.s3, skills.s1, skills.s2];
  expect(
    (await call(admin, '/chuongTrinh/sapXep', { loai: 'kyNang', ids: order }))
      .status,
  ).toBe(200);
  const sorted = (
    (await call(admin, '/chuongTrinh/cay', {})).body.data?.kyNang as Record<
      string,
      any
    >[]
  )
    .filter((s) => order.includes(s.id))
    .map((s) => s.id);
  expect(sorted).toEqual(order);
  expect(
    (
      await call(admin, '/chuongTrinh/sapXep', {
        loai: 'kyNang',
        ids: [skills.s1, 999999],
      })
    ).status,
  ).toBe(404);
  const other = await call(admin, '/chuongTrinh/chuDe/luu', {
    levelKey: 'ma',
    ma: 'M01',
    ten: 'Cấp Mã',
  });
  expect(
    (
      await call(admin, '/chuongTrinh/sapXep', {
        loai: 'chuDe',
        ids: [topicId, Number(other.body.data?.id)],
      })
    ).body.error?.reason,
  ).toBe('EDU_SORT_MIXED_PARENT');
  expect(
    (await call(admin, '/chuongTrinh/sapXep', { loai: 'kyNang', ids: [1, 1] }))
      .status,
  ).toBe(400);
});

test('the curriculum CSV: preview, confirm, repeat, problems, export and the log', async ({
  testApp,
  connection,
}) => {
  const { admin, managerA, hlvA } = await setup(testApp, connection);
  const sample = await call(admin, '/chuongTrinh/nhapCsv/mau', {});
  expect(sample.status).toBe(200);
  const mau = String(sample.body.data?.csv);
  expect(mau).toContain('cap,maChuDe,tenChuDe,maKyNang,tenKyNang');
  expect(mau.split('\r\n').filter(Boolean)).toHaveLength(3);

  const csv = [
    'cap,maChuDe,tenChuDe,maKyNang,tenKyNang,moTa,kyHieuSach',
    'Tốt,T20,Chiếu hết,T20-01,Chiếu bằng xe,,',
    'Tốt,T20,Chiếu hết,T20-02,Chiếu bằng hậu,Hai nước,',
    'tuong,X01,Chủ đề trống,,,,',
  ].join('\n');
  const before = (await call(admin, '/chuongTrinh/cay', {})).body.data;
  const preview = await call(admin, '/chuongTrinh/nhapCsv/xemTruoc', { csv });
  expect(preview.status).toBe(200);
  expect(preview.body.data).toMatchObject({
    rows: 3,
    chuDeMoi: 2,
    kyNangMoi: 2,
    written: 0,
    problems: [],
  });
  // A preview writes nothing and logs nothing.
  expect((await call(admin, '/chuongTrinh/cay', {})).body.data).toEqual(before);
  expect(
    await connection.query
      .selectFrom('eduNhapLarkNhatKy')
      .select('id')
      .execute(),
  ).toHaveLength(0);

  const confirmed = await call(admin, '/chuongTrinh/nhapCsv/xacNhan', { csv });
  expect(confirmed.status).toBe(200);
  expect(confirmed.body.data).toMatchObject({ written: 4, kyNangMoi: 2 });
  const after = (await call(admin, '/chuongTrinh/cay', {})).body.data!;
  expect(after.chuDe).toHaveLength(3);
  expect(after.kyNang).toHaveLength(6);
  const t20 = (after.chuDe as Record<string, any>[]).find(
    (t) => t.ma === 'T20',
  );
  expect(t20).toMatchObject({ levelKey: 'tot', thuTu: 2 });
  const logs = (await connection.query
    .selectFrom('eduNhapLarkNhatKy')
    .select(['trangThai', 'tongKet'])
    .execute()) as { trangThai: string; tongKet: any }[];
  expect(logs).toHaveLength(1);
  expect(logs[0]?.trangThai).toBe('thanh_cong');
  const log = JSON.stringify(logs[0]?.tongKet);
  expect(log).toContain('csv_chuong_trinh');
  // Counts and codes only: neither a topic nor a skill name is in the log.
  expect(log).not.toContain('Chiếu');

  // The same file again changes nothing.
  const repeat = await call(admin, '/chuongTrinh/nhapCsv/xacNhan', { csv });
  expect(repeat.body.data).toMatchObject({
    chuDeMoi: 0,
    kyNangMoi: 0,
    giuNguyen: 4,
    written: 0,
  });
  expect(
    ((await call(admin, '/chuongTrinh/cay', {})).body.data?.kyNang as [])
      .length,
  ).toBe(6);

  // A row with a problem stops the whole file; nothing is written, and the refusal is logged.
  const bad = [
    'cap,maChuDe,tenChuDe,maKyNang,tenKyNang',
    'tot,T30,Ba mươi,T30-01,Một',
    'xe,T20,Chiếu hết,T30-02,Hai',
  ].join('\n');
  const refused = await call(admin, '/chuongTrinh/nhapCsv/xacNhan', {
    csv: bad,
  });
  expect(refused.status).toBe(400);
  expect(refused.body.error?.reason).toBe('EDU_IMPORT_HAS_PROBLEMS');
  expect(
    ((await call(admin, '/chuongTrinh/cay', {})).body.data?.chuDe as []).length,
  ).toBe(3);
  const statuses = (
    (await connection.query
      .selectFrom('eduNhapLarkNhatKy')
      .select('trangThai')
      .orderBy('id')
      .execute()) as { trangThai: string }[]
  ).map((r) => r.trangThai);
  expect(statuses).toEqual(['thanh_cong', 'thanh_cong', 'tu_choi']);
  const preview2 = await call(admin, '/chuongTrinh/nhapCsv/xemTruoc', {
    csv: bad,
  });
  expect(preview2.body.data?.problems).toEqual([
    { line: 3, code: 'TOPIC_OTHER_LEVEL' },
  ]);

  // Not a CSV, or too large.
  expect(
    (await call(admin, '/chuongTrinh/nhapCsv/xemTruoc', { csv: 'a,b\n1,2' }))
      .body.error?.reason,
  ).toBe('EDU_IMPORT_BAD_FORMAT');
  expect(
    (
      await call(admin, '/chuongTrinh/nhapCsv/xemTruoc', {
        csv: `cap,maChuDe,tenChuDe,maKyNang,tenKyNang\n${'tot,T40,Bốn mươi,S,Một\n'.repeat(3001)}`,
      })
    ).body.error?.reason,
  ).toBe('EDU_IMPORT_TOO_LARGE');

  // Two confirmations at once: one at a time, so no code is created twice.
  const parallel = [
    'cap,maChuDe,tenChuDe,maKyNang,tenKyNang',
    'ma,M50,Chủ đề song song,M50-01,Một',
  ].join('\n');
  const both = await Promise.all([
    call(admin, '/chuongTrinh/nhapCsv/xacNhan', { csv: parallel }),
    call(admin, '/chuongTrinh/nhapCsv/xacNhan', { csv: parallel }),
  ]);
  expect(both.map((r) => r.status)).toEqual([200, 200]);
  expect(both.map((r) => r.body.data?.written as number).sort()).toEqual([
    0, 2,
  ]);

  // The export is its own action: the branch manager holds it, the coach does not; one log row per file.
  const logRows = async () =>
    (
      await connection.query
        .selectFrom('eduXuatDuLieuNhatKy')
        .select('loai')
        .where('loai', '=', 'chuong_trinh_csv')
        .execute()
    ).length;
  const logsBefore = await logRows();
  const exportOf = (session: Session) =>
    post(session, '/chuongTrinh/xuatCsv', {});
  expect((await exportOf(hlvA.session)).status).toBe(403);
  const file = await exportOf(managerA.session);
  expect(file.status).toBe(200);
  expect(file.headers.get('content-type')).toContain('text/csv');
  const text = await file.text();
  expect(text.split('\r\n')[0]).toContain(
    'cap,maChuDe,tenChuDe,maKyNang,tenKyNang,moTa,kyHieuSach',
  );
  expect(text).toContain('T20-02');
  expect(await logRows()).toBe(logsBefore + 1);
  // What was exported imports back as "nothing to do".
  const round = await call(admin, '/chuongTrinh/nhapCsv/xemTruoc', {
    csv: text,
  });
  expect(round.body.data).toMatchObject({
    chuDeMoi: 0,
    chuDeCapNhat: 0,
    kyNangMoi: 0,
    kyNangCapNhat: 0,
    problems: [],
  });
});

test('the skills taught in a session: scope, groups, hidden skills and the limit', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB, managerA, ids, groupsA, groupsB, skills } =
    await setup(testApp, connection);
  const save = (
    session: Session,
    kyNangIds: number[],
    nhomId: number | null = null,
    buoiHocId = ids.s1Session,
  ) => call(session, '/buoiHoc/kyNang/luu', { buoiHocId, nhomId, kyNangIds });

  const first = await save(hlvA.session, [skills.s1, skills.s2]);
  expect(first.status).toBe(200);
  expect(first.body.data).toMatchObject({ them: 2, bo: 0 });
  // The same list again changes nothing; a different one replaces it.
  expect(
    (await save(hlvA.session, [skills.s2, skills.s1])).body.data,
  ).toMatchObject({
    them: 0,
    bo: 0,
  });
  expect(
    (await save(hlvA.session, [skills.s2, skills.s3])).body.data,
  ).toMatchObject({
    them: 1,
    bo: 1,
  });
  const read = await call(hlvA.session, '/buoiHoc/kyNang/xem', {
    buoiHocId: ids.s1Session,
  });
  expect(read.body.data?.lopId).toBe(ids.lopA);
  expect(
    (read.body.data?.danhSach as { kyNangId: number }[])
      .map((d) => d.kyNangId)
      .sort(),
  ).toEqual([skills.s2, skills.s3].sort());

  // A group has its own list in the same session.
  expect(
    (await save(hlvA.session, [skills.s1], groupsA[0] as number)).status,
  ).toBe(200);
  expect(
    (
      (
        await call(hlvA.session, '/buoiHoc/kyNang/xem', {
          buoiHocId: ids.s1Session,
        })
      ).body.data?.danhSach as unknown[]
    ).length,
  ).toBe(3);
  // …and saving the class list does not touch the group's.
  await save(hlvA.session, []);
  expect(
    (
      (
        await call(hlvA.session, '/buoiHoc/kyNang/xem', {
          buoiHocId: ids.s1Session,
        })
      ).body.data?.danhSach as { nhomId: number | null }[]
    ).map((d) => d.nhomId),
  ).toEqual([groupsA[0]]);

  // Refused: a hidden skill, an unknown skill, a group of another class, a hidden group, too many skills.
  expect((await save(hlvA.session, [skills.hidden])).body.error?.reason).toBe(
    'EDU_SKILL_HIDDEN',
  );
  expect((await save(hlvA.session, [999999])).status).toBe(404);
  expect(
    (await save(hlvA.session, [skills.s1], groupsB[0] as number)).status,
  ).toBe(404);
  expect(
    (
      await call(admin, '/lopNhom/updateOne', {
        filter: { id: groupsA[2] },
        values: { trangThai: 'an' },
      })
    ).status,
  ).toBeLessThan(500);
  await connection.query
    .updateTable('eduLopNhom')
    .set({ trangThai: 'an' })
    .where('id', '=', groupsA[2] as number)
    .execute();
  expect(
    (await save(hlvA.session, [skills.s1], groupsA[2] as number)).body.error
      ?.reason,
  ).toBe('EDU_GROUP_HIDDEN');
  expect(
    (
      await save(
        hlvA.session,
        Array.from({ length: 51 }, (_, i) => i + 1),
      )
    ).status,
  ).toBe(400);

  // Scope: a coach of another branch finds neither the session nor its skills; the branch manager of A may.
  expect((await save(hlvB.session, [skills.s1])).status).toBe(404);
  expect(
    (
      await call(hlvB.session, '/buoiHoc/kyNang/xem', {
        buoiHocId: ids.s1Session,
      })
    ).status,
  ).toBe(404);
  expect(
    (await save(hlvB.session, [skills.s1], null, ids.sBSession)).status,
  ).toBe(200);
  expect(
    (await save(managerA.session, [skills.s3], null, ids.s2Session)).status,
  ).toBe(200);
  expect(
    (await save(managerA.session, [skills.s3], null, ids.sBSession)).status,
  ).toBe(404);
});

test('the register writes "da_hoc" for those present, never over a higher grade, and follows a correction', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, ids, groupsA, skills } = await setup(
    testApp,
    connection,
  );
  const { hocVienA, hocVienA2, hocVienA3 } = ids;
  // A is in the first group, A2 in the second, A3 in none.
  await post(admin, '/hocVien/chuyenNhom', {
    hocVienId: hocVienA,
    nhomId: groupsA[0],
  });
  await post(admin, '/hocVien/chuyenNhom', {
    hocVienId: hocVienA2,
    nhomId: groupsA[1],
  });
  // The class learns s1; the first group also learns s2.
  await call(hlvA.session, '/buoiHoc/kyNang/luu', {
    buoiHocId: ids.s1Session,
    nhomId: null,
    kyNangIds: [skills.s1],
  });
  await call(hlvA.session, '/buoiHoc/kyNang/luu', {
    buoiHocId: ids.s1Session,
    nhomId: groupsA[0],
    kyNangIds: [skills.s2],
  });
  // Nothing is written until the register is saved: nobody is marked yet.
  expect(await states(connection, hocVienA)).toEqual([]);

  // A present, A2 a make-up, A3 absent with leave.
  const saved = await attendance(hlvA.session, ids.s1Session, [
    [hocVienA, 'co_mat'],
    [hocVienA2, 'hoc_bu'],
    [hocVienA3, 'vang_co_phep'],
  ]);
  expect(saved.status).toBe(200);
  expect(await states(connection, hocVienA)).toEqual([
    {
      kyNangId: skills.s1,
      mucDo: 'da_hoc',
      nguon: 'buoi_hoc',
      buoiHocId: ids.s1Session,
    },
    {
      kyNangId: skills.s2,
      mucDo: 'da_hoc',
      nguon: 'buoi_hoc',
      buoiHocId: ids.s1Session,
    },
  ]);
  // A2 is in another group: only the skill of the whole class. A3 was absent: nothing.
  expect((await states(connection, hocVienA2)).map((s) => s.kyNangId)).toEqual([
    skills.s1,
  ]);
  expect(await states(connection, hocVienA3)).toEqual([]);

  // Saving the same register again changes nothing (no duplicate rows).
  await attendance(hlvA.session, ids.s1Session, [
    [hocVienA, 'co_mat'],
    [hocVienA2, 'hoc_bu'],
    [hocVienA3, 'vang_co_phep'],
  ]);
  expect(await states(connection, hocVienA)).toHaveLength(2);

  // A grade by hand is never overwritten by the register.
  await call(hlvA.session, '/kienThuc/cham', {
    o: [{ hocVienId: hocVienA, kyNangId: skills.s1, mucDo: 'vung' }],
  });
  await attendance(hlvA.session, ids.s1Session, [
    [hocVienA, 'co_mat'],
    [hocVienA2, 'hoc_bu'],
    [hocVienA3, 'co_mat'],
  ]);
  expect((await states(connection, hocVienA))[0]).toMatchObject({
    kyNangId: skills.s1,
    mucDo: 'vung',
    nguon: 'cham_tay',
  });
  // A3 was corrected to present: now learns the class skill.
  expect((await states(connection, hocVienA3)).map((s) => s.kyNangId)).toEqual([
    skills.s1,
  ]);
  // …and corrected back to absent: the row the register wrote goes away.
  await attendance(hlvA.session, ids.s1Session, [
    [hocVienA, 'co_mat'],
    [hocVienA2, 'hoc_bu'],
    [hocVienA3, 'vang_khong_phep'],
  ]);
  expect(await states(connection, hocVienA3)).toEqual([]);

  // A skill added after the register was saved reaches the students already marked present; one taken off is removed.
  await call(hlvA.session, '/buoiHoc/kyNang/luu', {
    buoiHocId: ids.s1Session,
    nhomId: null,
    kyNangIds: [skills.s1, skills.s3],
  });
  expect((await states(connection, hocVienA2)).map((s) => s.kyNangId)).toEqual([
    skills.s1,
    skills.s3,
  ]);
  await call(hlvA.session, '/buoiHoc/kyNang/luu', {
    buoiHocId: ids.s1Session,
    nhomId: null,
    kyNangIds: [skills.s3],
  });
  expect((await states(connection, hocVienA2)).map((s) => s.kyNangId)).toEqual([
    skills.s3,
  ]);
  // The graded cell of A (s1, by hand) stays although the class no longer teaches it in this session.
  expect((await states(connection, hocVienA))[0]).toMatchObject({
    kyNangId: skills.s1,
    mucDo: 'vung',
  });

  // The balance rule is untouched by all of this: a present student cost one session, an absence with leave none.
  const balances = (await connection.query
    .selectFrom('eduHocVien')
    .select(['id', 'soBuoiConLai'])
    .where('id', 'in', [hocVienA, hocVienA3])
    .execute()) as { id: number; soBuoiConLai: number }[];
  expect(balances.find((b) => Number(b.id) === hocVienA)?.soBuoiConLai).toBe(
    -1,
  );
});

test('a skill taught in two sessions: a make-up closes the gap, removing the first session keeps the second', async ({
  testApp,
  connection,
}) => {
  const { hlvA, ids, skills } = await setup(testApp, connection);
  const { hocVienA, hocVienA2 } = ids;
  const teach = (buoiHocId: number, kyNangIds: number[]) =>
    call(hlvA.session, '/buoiHoc/kyNang/luu', {
      buoiHocId,
      nhomId: null,
      kyNangIds,
    });
  await teach(ids.s1Session, [skills.s1, skills.s2]);
  await attendance(hlvA.session, ids.s1Session, [
    [hocVienA, 'co_mat'],
    [hocVienA2, 'vang_khong_phep'],
  ]);
  const gaps = await call(hlvA.session, '/kienThuc/loHong', {
    lopId: ids.lopA,
  });
  expect(gaps.status).toBe(200);
  const listed = gaps.body.data?.kyNang as Record<string, any>[];
  expect(listed.map((g) => g.ma)).toEqual(['T01-01', 'T01-02']);
  expect(listed[0]?.hocVien).toEqual([
    expect.objectContaining({
      hocVienId: hocVienA2,
      lyDo: 'vang_buoi_day',
      ngay: '2026-11-02',
      buoiHocId: ids.s1Session,
    }),
  ]);
  expect(gaps.body.data).toMatchObject({ che: 'lop', tong: 2, tongCap: 2 });

  // The student's own view says the same.
  const own = await call(hlvA.session, '/kienThuc/loHong', {
    hocVienId: hocVienA2,
  });
  expect(own.body.data).toMatchObject({ che: 'hocVien', tong: 2 });
  expect(
    await call(hlvA.session, '/kienThuc/loHong', { hocVienId: hocVienA }).then(
      (r) => r.body.data?.tong,
    ),
  ).toBe(0);

  // Session 2 teaches s1 again and the student comes as a make-up: s1 is no longer a gap, s2 still is.
  await teach(ids.s2Session, [skills.s1]);
  await attendance(hlvA.session, ids.s2Session, [
    [hocVienA, 'co_mat'],
    [hocVienA2, 'hoc_bu'],
  ]);
  const after = await call(hlvA.session, '/kienThuc/loHong', {
    lopId: ids.lopA,
  });
  expect(
    (after.body.data?.kyNang as { ma: string }[]).map((g) => g.ma),
  ).toEqual(['T01-02']);
  // s1 now has one row for A2 (written by the second session) and the first session's row for A is intact.
  expect(
    (await states(connection, hocVienA2)).map((s) => [s.kyNangId, s.buoiHocId]),
  ).toEqual([[skills.s1, ids.s2Session]]);

  // Taking s1 off the second session while the first still teaches it: A's row moves back to the first session.
  await teach(ids.s2Session, []);
  expect((await states(connection, hocVienA2)).map((s) => s.kyNangId)).toEqual(
    [],
  );
  expect(
    (await states(connection, hocVienA)).map((s) => [s.kyNangId, s.buoiHocId]),
  ).toEqual([
    [skills.s1, ids.s1Session],
    [skills.s2, ids.s1Session],
  ]);
  // A2 missed session 1 and the make-up no longer teaches it: the gap is open again.
  expect(
    (
      (await call(hlvA.session, '/kienThuc/loHong', { lopId: ids.lopA })).body
        .data?.kyNang as unknown[]
    ).length,
  ).toBe(2);
});

test('a skill graded "not solid" is a gap until it is graded again; grading by hand', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB, managerA, keToan, ids, skills } = await setup(
    testApp,
    connection,
  );
  const { hocVienA, hocVienA2, hocVienB } = ids;
  const grade = (session: Session, o: unknown[]) =>
    call(session, '/kienThuc/cham', { o });
  const cell = (hocVienId: number, kyNangId: number, mucDo: string | null) => ({
    hocVienId,
    kyNangId,
    mucDo,
  });

  const one = await grade(hlvA.session, [
    cell(hocVienA, skills.s1, 'chua_vung'),
  ]);
  expect(one.status).toBe(200);
  expect(one.body.data).toMatchObject({ capNhat: 1, xoa: 0 });
  const row = (await states(connection, hocVienA))[0];
  expect(row).toMatchObject({ mucDo: 'chua_vung', nguon: 'cham_tay' });
  const written = (await connection.query
    .selectFrom('eduHocVienKyNang')
    .select(['nguoiChamId'])
    .where('hocVienId', '=', hocVienA)
    .executeTakeFirstOrThrow()) as { nguoiChamId: string };
  expect(written.nguoiChamId).toBe(hlvA.id);

  const gaps = await call(hlvA.session, '/kienThuc/loHong', {
    lopId: ids.lopA,
  });
  expect(gaps.body.data?.kyNang).toEqual([
    expect.objectContaining({
      ma: 'T01-01',
      hocVien: [
        expect.objectContaining({
          hocVienId: hocVienA,
          lyDo: 'chua_vung',
          ngay: null,
        }),
      ],
    }),
  ]);
  // Grading it again closes the gap; clearing the cell removes the row.
  await grade(hlvA.session, [cell(hocVienA, skills.s1, 'dat')]);
  expect(
    (await call(hlvA.session, '/kienThuc/loHong', { lopId: ids.lopA })).body
      .data?.tong,
  ).toBe(0);
  const cleared = await grade(hlvA.session, [cell(hocVienA, skills.s1, null)]);
  expect(cleared.body.data).toMatchObject({ capNhat: 0, xoa: 1 });
  expect(await states(connection, hocVienA)).toEqual([]);
  expect(
    (await grade(hlvA.session, [cell(hocVienA, skills.s1, null)])).body.data,
  ).toMatchObject({ capNhat: 0, xoa: 0 });

  // Many cells at once, in one transaction.
  const bulk = await grade(hlvA.session, [
    cell(hocVienA, skills.s1, 'dat'),
    cell(hocVienA, skills.s2, 'vung'),
    cell(hocVienA2, skills.s1, 'da_hoc'),
  ]);
  expect(bulk.body.data).toMatchObject({ capNhat: 3 });
  // …and the same grade again writes nothing new.
  expect(
    (await grade(hlvA.session, [cell(hocVienA, skills.s1, 'dat')])).body.data,
  ).toMatchObject({ capNhat: 0 });

  // Refused, all or nothing: a student of another branch, a hidden skill, an unknown skill, a repeated cell, a bad level.
  const before = await states(connection, hocVienA2);
  const outOfScope = await grade(hlvA.session, [
    cell(hocVienA2, skills.s2, 'dat'),
    cell(hocVienB, skills.s1, 'dat'),
  ]);
  expect(outOfScope.status).toBe(404);
  expect(outOfScope.body.error?.reason).toBe('EDU_STUDENT_NOT_FOUND');
  expect(await states(connection, hocVienA2)).toEqual(before);
  expect(await states(connection, hocVienB)).toEqual([]);
  expect(
    (await grade(hlvA.session, [cell(hocVienA, skills.hidden, 'dat')])).body
      .error?.reason,
  ).toBe('EDU_SKILL_HIDDEN');
  expect(
    (await grade(hlvA.session, [cell(hocVienA, 999999, 'dat')])).status,
  ).toBe(404);
  expect(
    (
      await grade(hlvA.session, [
        cell(hocVienA, skills.s3, 'dat'),
        cell(hocVienA, skills.s3, 'vung'),
      ])
    ).body.error?.reason,
  ).toBe('EDU_DUPLICATE_CELL');
  expect(
    (await grade(hlvA.session, [cell(hocVienA, skills.s3, 'gioi')])).status,
  ).toBe(400);
  expect((await grade(hlvA.session, [])).status).toBe(400);
  expect(
    (
      await grade(
        hlvA.session,
        Array.from({ length: 501 }, (_, i) => cell(hocVienA, i + 1, 'dat')),
      )
    ).status,
  ).toBe(400);
  // The accountant holds neither action; the other branch's coach cannot reach class A's students.
  expect(
    (await grade(keToan.session, [cell(hocVienA, skills.s3, 'dat')])).status,
  ).toBe(403);
  expect(
    (await grade(hlvB.session, [cell(hocVienA, skills.s3, 'dat')])).status,
  ).toBe(404);
  // The branch manager and the administrator grade within their scope.
  expect(
    (await grade(managerA.session, [cell(hocVienA, skills.s3, 'dat')])).status,
  ).toBe(200);
  expect(
    (await grade(managerA.session, [cell(hocVienB, skills.s1, 'dat')])).status,
  ).toBe(404);
  expect((await grade(admin, [cell(hocVienB, skills.s1, 'dat')])).status).toBe(
    200,
  );
});

test('the matrix of a class: skills of its level, a page of students, a group, the scope', async ({
  testApp,
  connection,
}) => {
  const {
    admin,
    hlvA,
    hlvB,
    managerA,
    keToan,
    ids,
    groupsA,
    groupsB,
    skills,
    topicId,
  } = await setup(testApp, connection);
  const { hocVienA, hocVienA2, hocVienA3 } = ids;
  await post(admin, '/hocVien/chuyenNhom', {
    hocVienId: hocVienA,
    nhomId: groupsA[0],
  });
  await call(hlvA.session, '/buoiHoc/kyNang/luu', {
    buoiHocId: ids.s1Session,
    nhomId: null,
    kyNangIds: [skills.s1, skills.s2],
  });
  await attendance(hlvA.session, ids.s1Session, [
    [hocVienA, 'co_mat'],
    [hocVienA2, 'co_mat'],
    [hocVienA3, 'vang_co_phep'],
  ]);
  await call(hlvA.session, '/kienThuc/cham', {
    o: [
      { hocVienId: hocVienA, kyNangId: skills.s1, mucDo: 'dat' },
      { hocVienId: hocVienA2, kyNangId: skills.s2, mucDo: 'chua_vung' },
    ],
  });

  const matrix = await call(hlvA.session, '/kienThuc/maTran', {
    lopId: ids.lopA,
  });
  expect(matrix.status).toBe(200);
  const data = matrix.body.data!;
  expect(data).toMatchObject({
    levelKey: 'tot',
    tong: 3,
    trang: 1,
    limit: 25,
    nhomId: null,
  });
  expect(data.lop).toMatchObject({ id: ids.lopA, levelKey: 'tot' });
  // Active skills of the level only (the hidden one is not a column).
  expect((data.kyNang as { id: number }[]).map((s) => s.id)).toEqual([
    skills.s1,
    skills.s2,
    skills.s3,
  ]);
  expect((data.hocVien as { hoTen: string }[]).map((s) => s.hoTen)).toEqual([
    'Học viên Mẫu A',
    'Học viên Mẫu A2',
    'Học viên Mẫu A3',
  ]);
  expect((data.daDay as number[]).sort()).toEqual(
    [skills.s1, skills.s2].sort(),
  );
  const cells = data.o as Record<string, any>[];
  expect(
    cells.find((c) => c.hocVienId === hocVienA && c.kyNangId === skills.s1),
  ).toMatchObject({ mucDo: 'dat', nguon: 'cham_tay' });
  expect(
    cells.find((c) => c.hocVienId === hocVienA && c.kyNangId === skills.s2),
  ).toMatchObject({ mucDo: 'da_hoc', nguon: 'buoi_hoc' });
  expect(cells.find((c) => c.hocVienId === hocVienA3)).toBeUndefined();
  // Progress over the whole level (3 skills), and the gaps: A3 missed two skills, A2's s2 is "not solid".
  const byId = new Map(
    (data.hocVien as Record<string, any>[]).map((s) => [s.id, s]),
  );
  expect(byId.get(hocVienA)).toMatchObject({
    tong: 3,
    daHoc: 2,
    dat: 1,
    phanTram: 67,
    canBu: 0,
  });
  expect(byId.get(hocVienA2)).toMatchObject({
    daHoc: 1,
    chuaVung: 1,
    canBu: 1,
  });
  expect(byId.get(hocVienA3)).toMatchObject({
    daHoc: 0,
    phanTram: 0,
    canBu: 2,
  });

  // One topic, one page of students.
  const paged = await call(hlvA.session, '/kienThuc/maTran', {
    lopId: ids.lopA,
    chuDeId: topicId,
    trang: 2,
    limit: 2,
  });
  expect((paged.body.data?.hocVien as unknown[]).length).toBe(1);
  expect(paged.body.data?.tong).toBe(3);
  // A group: only its students, and only what was taught to it or to everyone.
  const grouped = await call(hlvA.session, '/kienThuc/maTran', {
    lopId: ids.lopA,
    nhomId: groupsA[0],
  });
  expect(
    (grouped.body.data?.hocVien as { id: number }[]).map((s) => s.id),
  ).toEqual([hocVienA]);
  // Another level, a topic of another level, a group of another class.
  const other = await call(hlvA.session, '/kienThuc/maTran', {
    lopId: ids.lopA,
    levelKey: 'xe',
  });
  expect(other.body.data).toMatchObject({ chuDe: [], kyNang: [] });
  expect(
    (
      await call(hlvA.session, '/kienThuc/maTran', {
        lopId: ids.lopA,
        levelKey: 'xe',
        chuDeId: topicId,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await call(hlvA.session, '/kienThuc/maTran', {
        lopId: ids.lopA,
        nhomId: groupsB[0],
      })
    ).status,
  ).toBe(404);

  // Scope: the other branch's coach and manager do not see the class; the manager of A and the accountant: see below.
  expect(
    (await call(hlvB.session, '/kienThuc/maTran', { lopId: ids.lopA })).status,
  ).toBe(404);
  expect(
    (await call(managerA.session, '/kienThuc/maTran', { lopId: ids.lopA }))
      .status,
  ).toBe(200);
  expect(
    (await call(managerA.session, '/kienThuc/maTran', { lopId: ids.lopB }))
      .status,
  ).toBe(404);
  expect(
    (await call(keToan.session, '/kienThuc/maTran', { lopId: ids.lopA }))
      .status,
  ).toBe(403);
  expect(
    (await call(admin, '/kienThuc/maTran', { lopId: ids.lopB })).status,
  ).toBe(200);
});

test('the gap list: scope, filters, pages and a student the caller does not see', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB, managerA, ids, groupsA, skills } = await setup(
    testApp,
    connection,
  );
  const { hocVienA, hocVienA2, hocVienA3 } = ids;
  // A skill of level "ma" in a second topic.
  const topic = await call(admin, '/chuongTrinh/chuDe/luu', {
    levelKey: 'ma',
    ma: 'M01',
    ten: 'Cấp Mã',
  });
  const created = await call(admin, '/chuongTrinh/kyNang/luu', {
    chuDeId: Number(topic.body.data?.id),
    ma: 'M01-01',
    ten: 'Nước đi của mã',
  });
  const horse = Number(created.body.data?.id);
  await post(admin, '/hocVien/chuyenNhom', {
    hocVienId: hocVienA2,
    nhomId: groupsA[1],
  });
  await call(hlvA.session, '/buoiHoc/kyNang/luu', {
    buoiHocId: ids.s1Session,
    nhomId: null,
    kyNangIds: [skills.s1, horse],
  });
  await call(hlvA.session, '/buoiHoc/kyNang/luu', {
    buoiHocId: ids.s1Session,
    nhomId: groupsA[1],
    kyNangIds: [skills.s2],
  });
  await attendance(hlvA.session, ids.s1Session, [
    [hocVienA, 'co_mat'],
    [hocVienA2, 'vang_co_phep'],
    [hocVienA3, 'vang_khong_phep'],
  ]);
  const gaps = (session: Session, body: Record<string, unknown>) =>
    call(session, '/kienThuc/loHong', body);

  const everything = await gaps(hlvA.session, { lopId: ids.lopA });
  const byMa = new Map(
    (everything.body.data?.kyNang as Record<string, any>[]).map((k) => [
      k.ma,
      (k.hocVien as { hocVienId: number }[]).map((h) => h.hocVienId).sort(),
    ]),
  );
  // A2 (second group) missed s1 (class), s2 (its group) and the skill of level "ma"; A3 (no group) missed the class ones.
  expect(byMa.get('T01-01')).toEqual([hocVienA2, hocVienA3].sort());
  expect(byMa.get('T01-02')).toEqual([hocVienA2]);
  expect(byMa.get('M01-01')).toEqual([hocVienA2, hocVienA3].sort());
  expect(everything.body.data).toMatchObject({ tong: 3, tongCap: 5 });

  // By level and by group.
  expect(
    (
      (await gaps(hlvA.session, { lopId: ids.lopA, levelKey: 'ma' })).body.data
        ?.kyNang as { ma: string }[]
    ).map((k) => k.ma),
  ).toEqual(['M01-01']);
  expect(
    (await gaps(hlvA.session, { lopId: ids.lopA, nhomId: groupsA[1] })).body
      .data?.tongCap,
  ).toBe(3);
  // Pages of skills.
  const page2 = await gaps(hlvA.session, {
    lopId: ids.lopA,
    limit: 2,
    trang: 2,
  });
  expect(page2.body.data).toMatchObject({ tong: 3, trang: 2, limit: 2 });
  expect(page2.body.data?.kyNang).toHaveLength(1);
  // A hidden skill is no gap.
  await call(admin, '/chuongTrinh/kyNang/luu', { id: horse, trangThai: 'an' });
  expect((await gaps(hlvA.session, { lopId: ids.lopA })).body.data?.tong).toBe(
    2,
  );
  // A hidden topic hides its skills too: show the skill again, hide the topic, and the gap stays closed.
  await call(admin, '/chuongTrinh/kyNang/luu', {
    id: horse,
    trangThai: 'hoat_dong',
  });
  expect((await gaps(hlvA.session, { lopId: ids.lopA })).body.data?.tong).toBe(
    3,
  );
  await call(admin, '/chuongTrinh/chuDe/luu', {
    id: Number(topic.body.data?.id),
    trangThai: 'an',
  });
  expect((await gaps(hlvA.session, { lopId: ids.lopA })).body.data?.tong).toBe(
    2,
  );

  // Exactly one of the two ids; both or neither is a bad request.
  expect((await gaps(hlvA.session, {})).status).toBe(400);
  expect(
    (await gaps(hlvA.session, { lopId: ids.lopA, hocVienId: hocVienA })).status,
  ).toBe(400);

  // Scope. The other coach and the other branch's manager see neither class nor student; the manager of A sees both.
  expect((await gaps(hlvB.session, { lopId: ids.lopA })).status).toBe(404);
  expect((await gaps(hlvB.session, { hocVienId: hocVienA2 })).status).toBe(404);
  expect((await gaps(managerA.session, { lopId: ids.lopB })).status).toBe(404);
  expect((await gaps(managerA.session, { hocVienId: hocVienA2 })).status).toBe(
    200,
  );
  expect(
    (await call(hlvB.session, '/kienThuc/hoSo', { hocVienId: hocVienA }))
      .status,
  ).toBe(404);
});

test('the student file: tree with the state of every skill, the gaps, and the summary in the file', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB, keToan, ids, skills } = await setup(
    testApp,
    connection,
  );
  const { hocVienA, hocVienA2 } = ids;
  await call(hlvA.session, '/buoiHoc/kyNang/luu', {
    buoiHocId: ids.s1Session,
    nhomId: null,
    kyNangIds: [skills.s1, skills.s2],
  });
  await attendance(hlvA.session, ids.s1Session, [
    [hocVienA, 'co_mat'],
    [hocVienA2, 'vang_khong_phep'],
  ]);
  await call(hlvA.session, '/kienThuc/cham', {
    o: [{ hocVienId: hocVienA, kyNangId: skills.s2, mucDo: 'vung' }],
  });

  const file = await call(hlvA.session, '/kienThuc/hoSo', {
    hocVienId: hocVienA2,
  });
  expect(file.status).toBe(200);
  expect(file.body.data?.capDo).toHaveLength(6);
  const tot = (file.body.data?.capDo as Record<string, any>[])[0]!;
  expect(tot).toMatchObject({ levelKey: 'tot', tong: 3, daHoc: 0 });
  const leaf = (tot.chuDe[0].kyNang as Record<string, any>[]).find(
    (k) => k.id === skills.s1,
  );
  expect(leaf).toMatchObject({
    mucDo: null,
    canBu: 'vang_buoi_day',
    ngayVang: '2026-11-02',
  });
  expect(file.body.data?.canBu).toHaveLength(2);
  const mine = await call(hlvA.session, '/kienThuc/hoSo', {
    hocVienId: hocVienA,
  });
  expect((mine.body.data?.capDo as Record<string, any>[])[0]).toMatchObject({
    daHoc: 2,
    dat: 1,
    phanTram: 67,
  });
  expect(mine.body.data?.canBu).toEqual([]);

  // The same two numbers sit in the student file (the overview tab).
  const profile = await call(hlvA.session, '/hocVien/hoSo360', {
    hocVienId: hocVienA2,
  });
  expect(profile.body.data?.kienThuc).toMatchObject({
    levelKey: 'tot',
    tong: 3,
    daHoc: 0,
    phanTram: 0,
    canBu: 2,
  });
  const admins = await call(admin, '/hocVien/hoSo360', { hocVienId: hocVienA });
  expect(admins.body.data?.kienThuc).toMatchObject({ daHoc: 2, canBu: 0 });
  // Without `edu.kienThuc` the file simply has no such section; with the student out of scope it is not found.
  const accountant = await call(keToan.session, '/hocVien/hoSo360', {
    hocVienId: hocVienA,
  });
  expect(accountant.status).toBe(200);
  expect(accountant.body.data?.kienThuc).toBeNull();
  expect(
    (await call(hlvB.session, '/hocVien/hoSo360', { hocVienId: hocVienA }))
      .status,
  ).toBe(404);
});

test('the report "loHongKienThuc": gated by edu.kienThuc, through the caller\'s scope, exported with a log row', async ({
  testApp,
  connection,
}) => {
  const { admin, hlvA, hlvB, managerA, keToan, ids, skills } = await setup(
    testApp,
    connection,
  );
  const { hocVienA, hocVienA2, hocVienB } = ids;
  await call(hlvA.session, '/buoiHoc/kyNang/luu', {
    buoiHocId: ids.s1Session,
    nhomId: null,
    kyNangIds: [skills.s1],
  });
  await call(hlvB.session, '/buoiHoc/kyNang/luu', {
    buoiHocId: ids.sBSession,
    nhomId: null,
    kyNangIds: [skills.s2],
  });
  await attendance(hlvA.session, ids.s1Session, [
    [hocVienA, 'co_mat'],
    [hocVienA2, 'vang_co_phep'],
  ]);
  await attendance(hlvB.session, ids.sBSession, [
    [hocVienB, 'vang_khong_phep'],
  ]);
  const report = (session: Session, extra: Record<string, unknown> = {}) =>
    call(session, '/baoCao/xem', { loai: 'loHongKienThuc', ...extra });

  const all = await report(admin);
  expect(all.status).toBe(200);
  const rows = all.body.data?.rows as Record<string, any>[];
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.ma).sort()).toEqual(['HS-A2', 'HS-B']);
  expect(rows.find((r) => r.ma === 'HS-A2')).toMatchObject({
    kyNang: 'Nhận biết ô cờ',
    lyDo: 'Vắng buổi dạy',
    ngayVang: '2026-11-02',
    cap: 'tot',
  });
  expect((all.body.data?.columns as unknown[]).length).toBe(8);
  // A coach sees only the gaps of their class; a branch manager those of their branch.
  expect(
    ((await report(hlvA.session)).body.data?.rows as { ma: string }[]).map(
      (r) => r.ma,
    ),
  ).toEqual(['HS-A2']);
  expect(
    ((await report(hlvB.session)).body.data?.rows as { ma: string }[]).map(
      (r) => r.ma,
    ),
  ).toEqual(['HS-B']);
  expect(
    ((await report(managerA.session)).body.data?.rows as unknown[]).length,
  ).toBe(1);
  expect(
    ((await report(admin, { lopId: ids.lopB })).body.data?.rows as unknown[])
      .length,
  ).toBe(1);
  // The accountant has no `edu.kienThuc`: refused.
  expect((await report(keToan.session)).status).toBe(403);
  expect((await call(admin, '/baoCao/xem', { loai: 'khongCo' })).status).toBe(
    400,
  );

  // The file is the export action: the coach holds none, the manager does; one log row each, no names.
  const csv = (session: Session) =>
    post(session, '/baoCao/xuatCsv', { loai: 'loHongKienThuc' });
  expect((await csv(hlvA.session)).status).toBe(403);
  const file = await csv(managerA.session);
  expect(file.status).toBe(200);
  expect(await file.text()).toContain('Kỹ năng cần bù');
  const log = (await connection.query
    .selectFrom('eduXuatDuLieuNhatKy')
    .select(['loai', 'soDong'])
    .where('loai', '=', 'bao_cao_loHongKienThuc')
    .execute()) as { loai: string; soDong: number }[];
  expect(log).toHaveLength(1);
  expect(Number(log[0]?.soDong)).toBe(1);
});
