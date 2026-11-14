import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createAppTest } from '@nocobase/app-testing/server';

import { createStandaloneServer } from '../../server/standalone.js';

export const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      trustedOrigins: ['http://localhost'],
    },
    users: { initialAdmin: DEFAULT_ADMIN_CREDENTIALS },
  },
});

type TestApp = Parameters<typeof signIn>[0];
type Session = Awaited<ReturnType<typeof signIn>>;

/** Standard writes need an operation key: 13-digit milliseconds, a dot, a UUID. */
let counter = 0;

export const jsonHeaders = (): Record<string, string> => ({
  'content-type': 'application/json',
  origin: 'http://localhost',
  'idempotency-key': `${Date.now()}.${crypto.randomUUID()}`,
});

export async function adminSession(testApp: TestApp): Promise<Session> {
  return signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
}

/** Creates a user and assigns exactly one permission set to it. Returns the session of that user. */
export async function userWithRole(
  testApp: TestApp,
  admin: Session,
  name: string,
  permissionSet: string,
): Promise<{ session: Session; id: string }> {
  const credentials = {
    email: `${name}-${++counter}@example.com`,
    password: `${name}-test-password-${counter}`,
  };
  const created = await admin.fetch('/users', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ name, ...credentials }),
  });
  if (created.status !== 201)
    throw new Error(`create user ${name}: ${created.status}`);
  const session = await signIn(testApp, credentials);
  const assigned = await admin.fetch(
    `/authorization/permissionSets/${permissionSet}/assignments`,
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ subject: { type: 'user', id: session.user.id } }),
    },
  );
  if (assigned.status !== 201) {
    throw new Error(`assign ${permissionSet} to ${name}: ${assigned.status}`);
  }
  return { session, id: session.user.id };
}

export function post(session: Session, path: string, body: unknown) {
  return session.fetch(path, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
}

type Query = {
  query: {
    insertInto: (t: string) => {
      values: (v: object) => {
        execute: () => Promise<unknown>;
        returning?: unknown;
      };
    };
  };
};

export interface SchoolIds {
  readonly coSoA: number;
  readonly coSoB: number;
  readonly lopA: number;
  readonly lopB: number;
  readonly hocVienA: number;
  readonly hocVienB: number;
}

/**
 * Two branches, one class each, one student each; entirely made-up data. Ids come from the database (never inserted by
 * hand: on PostgreSQL a hand-written id does not advance the sequence), so tests use the returned ids.
 */
export async function seedSchool(
  connection: Query & { query: any },
  people: { hlvA: string; hlvB: string; managerA: string },
): Promise<SchoolIds> {
  const q = connection.query;
  // The file shares one application, so start every case from an empty school.
  for (const table of [
    'eduLienHe',
    'eduHoSoGv',
    'eduPhatSach',
    'eduNopSach',
    'eduNhanXetThang',
    'eduSoDuNhatKy',
    'eduThanhToan',
    'eduGoiHoc',
    'eduDiemDanh',
    'eduBuoiHoc',
    'eduDongY',
    'eduHocVienPhuHuynh',
    'eduPhuHuynh',
    'eduHocVienLenCap',
    'eduHocVien',
    'eduLopLich',
    'eduLop',
    'eduCoSoQuanLy',
    'eduCoSo',
  ]) {
    await q.deleteFrom(table).allowAllRows().execute();
  }
  const idOf = async (table: string, ma: string): Promise<number> => {
    const row = await q
      .selectFrom(table)
      .select('id')
      .where('ma', '=', ma)
      .executeTakeFirstOrThrow();
    return Number(row.id);
  };
  await q
    .insertInto('eduCoSo')
    .values({ ma: 'CS-A', ten: 'Cơ sở Mẫu A' })
    .execute();
  await q
    .insertInto('eduCoSo')
    .values({ ma: 'CS-B', ten: 'Cơ sở Mẫu B' })
    .execute();
  const coSoA = await idOf('eduCoSo', 'CS-A');
  const coSoB = await idOf('eduCoSo', 'CS-B');
  await q
    .insertInto('eduCoSoQuanLy')
    .values({ coSoId: coSoA, userId: people.managerA })
    .execute();
  await q
    .insertInto('eduLop')
    .values({
      ma: 'L-A1',
      ten: 'Lớp Mẫu A1',
      coSoId: coSoA,
      hlvId: people.hlvA,
      levelKey: 'tot',
      levelOrder: 1,
    })
    .execute();
  await q
    .insertInto('eduLop')
    .values({
      ma: 'L-B1',
      ten: 'Lớp Mẫu B1',
      coSoId: coSoB,
      hlvId: people.hlvB,
      levelKey: 'tot',
      levelOrder: 1,
    })
    .execute();
  const lopA = await idOf('eduLop', 'L-A1');
  const lopB = await idOf('eduLop', 'L-B1');
  await q
    .insertInto('eduHocVien')
    .values({
      ma: 'HS-A',
      hoTen: 'Học viên Mẫu A',
      namSinh: 2016,
      levelKey: 'tot',
      levelOrder: 1,
      lopId: lopA,
      coSoId: coSoA,
    })
    .execute();
  await q
    .insertInto('eduHocVien')
    .values({
      ma: 'HS-B',
      hoTen: 'Học viên Mẫu B',
      namSinh: 2015,
      levelKey: 'tot',
      levelOrder: 1,
      lopId: lopB,
      coSoId: coSoB,
    })
    .execute();
  return {
    coSoA,
    coSoB,
    lopA,
    lopB,
    hocVienA: await idOf('eduHocVien', 'HS-A'),
    hocVienB: await idOf('eduHocVien', 'HS-B'),
  };
}

/** The id of the row with this code, for rows a test inserted without an id. */
export async function idByMa(
  connection: { query: any },
  table: string,
  ma: string,
): Promise<number> {
  const row = await connection.query
    .selectFrom(table)
    .select('id')
    .where('ma', '=', ma)
    .executeTakeFirstOrThrow();
  return Number(row.id);
}
