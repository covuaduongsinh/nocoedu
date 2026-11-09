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
    email: `${name}@example.com`,
    password: `${name}-test-password`,
  };
  const created = await admin.fetch('/users', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ name, ...credentials }),
  });
  if (created.status !== 201) throw new Error(`create user ${name}: ${created.status}`);
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

type Query = { query: { insertInto: (t: string) => { values: (v: object) => { execute: () => Promise<unknown>; returning?: unknown } } } };

/** Two branches, one class each, one student each; entirely made-up data. */
export async function seedSchool(
  connection: Query & { query: any },
  people: { hlvA: string; hlvB: string; managerA: string },
): Promise<void> {
  const q = connection.query;
  await q.insertInto('eduCoSo').values({ id: 1, ma: 'CS-A', ten: 'Cơ sở Mẫu A' }).execute();
  await q.insertInto('eduCoSo').values({ id: 2, ma: 'CS-B', ten: 'Cơ sở Mẫu B' }).execute();
  await q.insertInto('eduCoSoQuanLy').values({ coSoId: 1, userId: people.managerA }).execute();
  await q.insertInto('eduLop').values({ id: 1, ma: 'L-A1', ten: 'Lớp Mẫu A1', coSoId: 1, hlvId: people.hlvA, levelKey: 'tot', levelOrder: 1 }).execute();
  await q.insertInto('eduLop').values({ id: 2, ma: 'L-B1', ten: 'Lớp Mẫu B1', coSoId: 2, hlvId: people.hlvB, levelKey: 'tot', levelOrder: 1 }).execute();
  await q.insertInto('eduHocVien').values({ id: 1, ma: 'HS-A', hoTen: 'Học viên Mẫu A', namSinh: 2016, levelKey: 'tot', levelOrder: 1, lopId: 1, coSoId: 1 }).execute();
  await q.insertInto('eduHocVien').values({ id: 2, ma: 'HS-B', hoTen: 'Học viên Mẫu B', namSinh: 2015, levelKey: 'tot', levelOrder: 1, lopId: 2, coSoId: 2 }).execute();
}
