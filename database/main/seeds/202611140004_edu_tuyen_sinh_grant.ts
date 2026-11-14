import { defineSeed } from '@nocobase/db';

/**
 * Gives the NocoEdu permission sets the admissions (DS-61 phase D): the page `edu.tuyenSinh` and the business resource
 * `edu.tuyenSinh`. Like `202611140002_edu_phat_sach_grant` it adds them to the sets that exist, at the end of their
 * grants, and only when the set does not hold them yet; no set is assigned to anybody.
 *
 * Administrators work over every contact, branch managers over their branches. Accountants and coaches hold neither:
 * a family that has not enrolled is none of their business. Written out literally: a seed is loaded on its own and
 * must not import application code. The grants equal those of `database/seed-data/edu-permission-sets.ts`;
 * `tests/server/edu-permission-sets.test.ts` fails when they differ.
 */
const SETS: readonly { key: string; scope: string }[] = [
  { key: 'edu_quan_tri', scope: 'allRecords' },
  { key: 'edu_quan_ly_co_so', scope: 'edu.myBranches' },
];

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string; policy?: unknown }[];
}

export default defineSeed({
  name: '202611140004_edu_tuyen_sinh_grant',
  transaction: true,
  async run({ query }) {
    for (const { key, scope } of SETS) {
      const policy = { type: 'composite', scopes: { data: scope } };
      const row = await query
        .selectFrom('authorizationPermissionSets')
        .select('grants')
        .where('key', '=', key)
        .executeTakeFirst();
      if (!row) continue;
      let grants: unknown = row.grants;
      while (typeof grants === 'string') grants = JSON.parse(grants) as unknown;
      if (!Array.isArray(grants)) continue;
      const list = grants as Grant[];
      const has = (type: string) =>
        list.some(
          (grant) =>
            grant.resource.type === type &&
            grant.resource.id === 'edu.tuyenSinh',
        );
      let changed = false;
      if (!has('page')) {
        list.push({
          resource: { type: 'page', id: 'edu.tuyenSinh' },
          actions: [{ action: 'access' }],
        });
        changed = true;
      }
      if (!has('composite')) {
        list.push({
          resource: { type: 'composite', id: 'edu.tuyenSinh' },
          actions: [
            { action: 'view', policy },
            { action: 'manage', policy },
          ],
        });
        changed = true;
      }
      if (!changed) continue;
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(list), updatedAt: new Date() })
        .where('key', '=', key)
        .execute();
    }
  },
});
