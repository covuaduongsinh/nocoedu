import { appendFileSync } from 'node:fs';

import { expect } from 'vitest';

import {
  adminSession,
  post,
  seedSchool,
  test,
  userWithRole,
} from '../helpers/edu.js';

/**
 * The knowledge system at the size of the club (GĐ 4): 2,000 students in 20 classes, 200 skills, 40 sessions a class each
 * teaching 3 skills, 80,000 marks, a tenth of them absences. Made-up data. The time limits are generous (a slow CI
 * machine must not fail them) but an answer that reads every row of the register one by one would miss them by far.
 */
const CLASSES = 20;
const STUDENTS_PER_CLASS = 100;
const SESSIONS_PER_CLASS = 40;
const TOPICS = 20;
const SKILLS_PER_TOPIC = 10;

type Json = { data?: Record<string, any>; error?: { reason?: string } };

const timed = async <T>(label: string, run: () => Promise<T>) => {
  const start = performance.now();
  const value = await run();
  const ms = Math.round(performance.now() - start);
  if (process.env.EDU_PERF_LOG)
    appendFileSync(process.env.EDU_PERF_LOG, `${label}: ${ms} ms\n`);
  return { value, ms };
};

const insertAll = async (
  q: any,
  table: string,
  rows: Record<string, unknown>[],
  size = 100,
) => {
  for (let i = 0; i < rows.length; i += size)
    await q
      .insertInto(table)
      .values(rows.slice(i, i + size))
      .execute();
};

test('answers within a few seconds with 2,000 students, 80,000 marks and 200 skills', async ({
  testApp,
  connection,
}) => {
  const admin = await adminSession(testApp);
  const hlv = await userWithRole(testApp, admin, 'pf-hlv', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'pf-hlv-b', 'edu_hlv');
  const manager = await userWithRole(
    testApp,
    admin,
    'pf-ql',
    'edu_quan_ly_co_so',
  );
  const ids = await seedSchool(connection, {
    hlvA: hlv.id,
    hlvB: hlvB.id,
    managerA: manager.id,
  });
  const q = connection.query as any;
  const id = async (table: string, where: Record<string, unknown>) =>
    (
      await q
        .selectFrom(table)
        .select('id')
        .where(Object.keys(where)[0]!, '=', Object.values(where)[0])
        .executeTakeFirstOrThrow()
    ).id as number;

  // Curriculum: one level, 20 topics of 10 skills.
  await insertAll(
    q,
    'eduChuDe',
    Array.from({ length: TOPICS }, (_, t) => ({
      levelKey: 'tot',
      ma: `PT${t}`,
      ten: `Chủ đề ${t}`,
      thuTu: t + 1,
    })),
  );
  const topics = (await q
    .selectFrom('eduChuDe')
    .select('id')
    .orderBy('id')
    .execute()) as { id: number }[];
  await insertAll(
    q,
    'eduKyNang',
    topics.flatMap((topic, t) =>
      Array.from({ length: SKILLS_PER_TOPIC }, (_, s) => ({
        chuDeId: Number(topic.id),
        ma: `PK${t}-${s}`,
        ten: `Kỹ năng ${t}-${s}`,
        thuTu: s + 1,
      })),
    ),
  );
  const skills = (await q
    .selectFrom('eduKyNang')
    .select('id')
    .orderBy('id')
    .execute()) as { id: number }[];

  // 20 classes of the branch of the coach (the first one is the seeded class), 100 students each.
  const classIds: number[] = [ids.lopA];
  for (let c = 1; c < CLASSES; c += 1) {
    await q
      .insertInto('eduLop')
      .values({
        ma: `PL${c}`,
        ten: `Lớp Mẫu ${c}`,
        coSoId: ids.coSoA,
        hlvId: c % 2 ? hlv.id : manager.id,
        levelKey: 'tot',
        levelOrder: 1,
      })
      .execute();
    classIds.push(await id('eduLop', { ma: `PL${c}` }));
  }
  const studentsOf = new Map<number, number[]>();
  for (const [c, lopId] of classIds.entries()) {
    const rows = Array.from({ length: STUDENTS_PER_CLASS }, (_, s) => ({
      ma: `PH${c}-${s}`,
      hoTen: `Học viên Mẫu ${c}-${s}`,
      namSinh: 2016,
      levelKey: 'tot',
      levelOrder: 1,
      lopId,
      coSoId: ids.coSoA,
    }));
    await insertAll(q, 'eduHocVien', rows);
    studentsOf.set(
      lopId,
      (
        (await q
          .selectFrom('eduHocVien')
          .select('id')
          .where('lopId', '=', lopId)
          .orderBy('id')
          .execute()) as { id: number }[]
      ).map((r) => Number(r.id)),
    );
  }

  // Sessions, the skills taught in them (class-wide) and the register: every tenth student is absent.
  for (const [c, lopId] of classIds.entries()) {
    await insertAll(
      q,
      'eduBuoiHoc',
      Array.from({ length: SESSIONS_PER_CLASS }, (_, n) => ({
        lopId,
        ngay: new Date(Date.UTC(2026, 0, 1 + n * 7)).toISOString().slice(0, 10),
        gioBatDau: '17:30',
        gioKetThuc: '19:00',
        trangThai: 'da_diem_danh',
      })),
    );
    const sessions = (await q
      .selectFrom('eduBuoiHoc')
      .select('id')
      .where('lopId', '=', lopId)
      .orderBy('id')
      .execute()) as { id: number }[];
    await insertAll(
      q,
      'eduBuoiHocKyNang',
      sessions.flatMap((session, n) =>
        [0, 1, 2].map((k) => ({
          buoiHocId: Number(session.id),
          lopId,
          kyNangId: Number(skills[(c * 7 + n * 3 + k) % skills.length]!.id),
          nhomId: null,
        })),
      ),
    );
    const marks = sessions.flatMap((session, n) =>
      (studentsOf.get(lopId) ?? []).map((hocVienId, s) => ({
        buoiHocId: Number(session.id),
        hocVienId,
        trangThai: (s + n) % 10 === 0 ? 'vang_khong_phep' : 'co_mat',
        daLamBtvn: false,
        soBuoiDaTru: 0,
      })),
    );
    await insertAll(q, 'eduDiemDanh', marks, 100);
  }
  const total = await q.selectFrom('eduDiemDanh').select('id').execute();
  // The seeded student of the first class is in its register too.
  expect(total.length).toBeGreaterThanOrEqual(
    CLASSES * STUDENTS_PER_CLASS * SESSIONS_PER_CLASS,
  );

  // A register saved for a class of 100 students with three skills taught (re-derives the skills for everybody).
  const lopId = classIds[1] as number;
  const session = (await q
    .selectFrom('eduBuoiHoc')
    .select('id')
    .where('lopId', '=', lopId)
    .orderBy('id')
    .executeTakeFirstOrThrow()) as { id: number };
  const roster = studentsOf.get(lopId) ?? [];
  const save = await timed('register of 100 students, 3 skills (coach)', () =>
    post(hlv.session, '/diemDanh/luu', {
      buoiHocId: Number(session.id),
      danhSach: roster.map((hocVienId, s) => ({
        hocVienId,
        trangThai: s % 10 === 0 ? 'vang_co_phep' : 'co_mat',
      })),
    }),
  );
  expect(save.value.status).toBe(200);
  expect(save.ms).toBeLessThan(15_000);
  // The same register in a class where no skill is taught: what the register itself costs, without the knowledge.
  const plainClass = classIds[3] as number;
  await q
    .deleteFrom('eduBuoiHocKyNang')
    .where('lopId', '=', plainClass)
    .execute();
  const plainSession = (await q
    .selectFrom('eduBuoiHoc')
    .select('id')
    .where('lopId', '=', plainClass)
    .orderBy('id')
    .executeTakeFirstOrThrow()) as { id: number };
  const plain = await timed(
    'register of 100 students, no skill taught (coach)',
    () =>
      post(hlv.session, '/diemDanh/luu', {
        buoiHocId: Number(plainSession.id),
        danhSach: (studentsOf.get(plainClass) ?? []).map((hocVienId, s) => ({
          hocVienId,
          trangThai: s % 10 === 0 ? 'vang_co_phep' : 'co_mat',
        })),
      }),
  );
  expect(plain.value.status).toBe(200);
  const taughtNow = await timed('choose skills of a session (coach)', () =>
    post(hlv.session, '/buoiHoc/kyNang/luu', {
      buoiHocId: Number(session.id),
      nhomId: null,
      kyNangIds: [
        Number(skills[0]!.id),
        Number(skills[1]!.id),
        Number(skills[2]!.id),
      ],
    }),
  );
  expect(taughtNow.value.status).toBe(200);
  expect(taughtNow.ms).toBeLessThan(15_000);

  const call = async (
    label: string,
    session_: Parameters<typeof post>[0],
    path: string,
    body: unknown,
    limit: number,
  ) => {
    const { value, ms } = await timed(label, () => post(session_, path, body));
    expect(`${label}: ${value.status}`).toBe(`${label}: 200`);
    expect(ms).toBeLessThan(limit);
    return (await value.json()) as Json;
  };
  const matrix = await call(
    'matrix of one class (administrator)',
    admin,
    '/kienThuc/maTran',
    { lopId, trang: 1, limit: 25 },
    6000,
  );
  expect(matrix.data?.tong).toBe(STUDENTS_PER_CLASS);
  await call(
    'matrix of one class (coach)',
    hlv.session,
    '/kienThuc/maTran',
    { lopId, trang: 2, limit: 25 },
    6000,
  );
  const gaps = await call(
    'gaps of one class (administrator)',
    admin,
    '/kienThuc/loHong',
    { lopId, trang: 1, limit: 25 },
    6000,
  );
  expect(gaps.data?.tongCap).toBeGreaterThan(0);
  await call(
    'gaps of one class (coach)',
    hlv.session,
    '/kienThuc/loHong',
    { lopId },
    6000,
  );
  await call(
    'gaps of one student',
    hlv.session,
    '/kienThuc/hoSo',
    { hocVienId: roster[1] },
    6000,
  );
  await call(
    'student file with summary',
    hlv.session,
    '/hocVien/hoSo360',
    { hocVienId: roster[1] },
    6000,
  );
  const report = await call(
    'report of every gap, 2,000 students (administrator)',
    admin,
    '/baoCao/xem',
    { loai: 'loHongKienThuc', lopId },
    20000,
  );
  expect((report.data?.rows as unknown[]).length).toBeGreaterThan(0);
  // The whole club is more rows than a report holds: refused with a clear error, never cut short.
  const whole = await timed('report of the whole club (administrator)', () =>
    post(admin, '/baoCao/xem', { loai: 'loHongKienThuc' }),
  );
  expect(whole.ms).toBeLessThan(20_000);
  expect([200, 400]).toContain(whole.value.status);
});
