import { expect } from 'vitest';

import { adminSession, post, test, userWithRole } from '../helpers/edu.js';

// The books catalogue (DS-61 phase E). Every title and symbol is made up.

test('the administrator manages the catalogue; the other roles only read it, and a symbol is never used twice', async ({
  testApp,
  request,
}) => {
  const admin = await adminSession(testApp);
  const hlv = await userWithRole(testApp, admin, 'hlv-sach', 'edu_hlv');
  const manager = await userWithRole(
    testApp,
    admin,
    'quanly-sach',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(
    testApp,
    admin,
    'ketoan-sach',
    'edu_ke_toan',
  );
  const anonymous = await request('/sach/findMany', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: '{}',
  });
  expect(anonymous.status).toBe(401);

  // A catalogue record is created by whoever may manage it: the administrator holds the set, the account used by the
  // tests as the first administrator is unrestricted.
  const created = await post(admin, '/sach/createOne', {
    values: {
      kyHieu: 'MAU1',
      ten: 'Sách Mẫu 1',
      giaBia: 120000,
      giaBan: 100000,
    },
  });
  expect([200, 201]).toContain(created.status);

  // Two books never share a symbol (the unique index answers, whatever the form checked).
  const again = await post(admin, '/sach/createOne', {
    values: { kyHieu: 'MAU1', ten: 'Sách Mẫu khác' },
  });
  expect(again.status).toBeGreaterThanOrEqual(400);

  // Reading: every role with the page sees the book, with its price.
  for (const person of [hlv, manager, keToan]) {
    const read = await post(person.session, '/sach/findMany', {});
    expect(read.status).toBe(200);
    const rows = ((await read.json()) as { data: Record<string, unknown>[] })
      .data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kyHieu: 'MAU1', giaBan: 100000 });
    // The import key is not a field of the grant: no role reads it through the API.
    expect(rows[0]).not.toHaveProperty('externalId');
  }

  // Writing: none of them may create or edit a book.
  for (const person of [hlv, manager, keToan]) {
    const write = await post(person.session, '/sach/createOne', {
      values: { kyHieu: 'MAU2', ten: 'Sách Mẫu 2' },
    });
    expect(write.status).toBe(403);
  }
});
