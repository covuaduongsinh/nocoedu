import { defineSeed } from '@nocobase/db';

/**
 * Gives the NocoEdu permission sets the books catalogue (DS-61 phase E): the page `edu.sach` and the business
 * resource `edu.sach`. `202611090002_edu_permission_sets` already ran on real databases and never overwrites a set, so
 * they are added here, to the sets that exist, at the end of their grants, and only when the set does not hold them
 * yet (an administrator who removed them is not overridden twice; a set that was deleted is not recreated). No set is
 * assigned to anybody.
 *
 * Administrators manage the catalogue; the other three sets only view it. Written out literally: a seed is loaded on
 * its own and must not import application code. The grants equal those of
 * `database/seed-data/edu-permission-sets.ts`; `tests/server/edu-permission-sets.test.ts` fails when they differ.
 */
const SETS: readonly { key: string; manage: boolean }[] = [
  { key: 'edu_quan_tri', manage: true },
  { key: 'edu_quan_ly_co_so', manage: false },
  { key: 'edu_hlv', manage: false },
  { key: 'edu_ke_toan', manage: false },
];

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string; policy?: unknown }[];
}

const policy = {
  type: 'composite',
  scopes: { data: 'allRecords' },
};

export default defineSeed({
  name: '202611130003_edu_sach_grant',
  transaction: true,
  async run({ query }) {
    for (const { key, manage } of SETS) {
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
            grant.resource.type === type && grant.resource.id === 'edu.sach',
        );
      let changed = false;
      if (!has('page')) {
        list.push({
          resource: { type: 'page', id: 'edu.sach' },
          actions: [{ action: 'access' }],
        });
        changed = true;
      }
      if (!has('composite')) {
        list.push({
          resource: { type: 'composite', id: 'edu.sach' },
          actions: [
            { action: 'view', policy },
            ...(manage ? [{ action: 'manage', policy }] : []),
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
