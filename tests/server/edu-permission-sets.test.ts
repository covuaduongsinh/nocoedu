import { expect } from 'vitest';

import { EDU_PERMISSION_SETS } from '../../database/seed-data/edu-permission-sets.js';
import { shortName, normalizePhone } from '../../server/edu/names.js';
import { test } from '../helpers/edu.js';

test('the seeded permission sets equal their declarations and are assigned to nobody', async ({
  connection,
}) => {
  for (const set of EDU_PERMISSION_SETS) {
    const row = await connection.query
      .selectFrom('authorizationPermissionSets')
      .select('grants')
      .where('key', '=', set.key)
      .executeTakeFirstOrThrow();
    let grants: unknown = row.grants;
    while (typeof grants === 'string') grants = JSON.parse(grants) as unknown;
    expect(grants, set.key).toEqual(JSON.parse(JSON.stringify(set.grants)));
    const assignments = await connection.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('permissionSetKey', '=', set.key)
      .execute();
    expect(assignments, set.key).toEqual([]);
  }
  expect(EDU_PERMISSION_SETS.map((set) => set.key)).toEqual([
    'edu_quan_tri',
    'edu_quan_ly_co_so',
    'edu_hlv',
    'edu_ke_toan',
    'edu_api_doc',
  ]);
});

test('names and phone numbers are normalized', () => {
  expect(shortName('Nguyễn Minh An')).toBe('Nguyễn M. An');
  expect(shortName('Nguyễn Thị Thu Hà')).toBe('Nguyễn T. T. Hà');
  expect(shortName('An')).toBe('An');
  expect(normalizePhone('+84 900 000 001')).toBe('0900000001');
  expect(normalizePhone('0900.000.001')).toBe('0900000001');
});
