import { defineSeed } from '@nocobase/db';

/**
 * Gives the administrator and branch-manager permission sets the parents' private links (stage 3): the business
 * resource `edu.congPhuHuynh` (view and manage). The administrator works over every link, a branch manager over the
 * links of the students of their branches. Accountants and coaches hold nothing: a link opens a child's sessions to
 * the family, which is the club's decision to make, not theirs.
 *
 * Like the earlier grant seeds it adds the grant at the end of the set's grants, only when the set does not hold it
 * yet, and assigns nothing to anybody. Written out literally: a seed is loaded on its own and must not import
 * application code. The grants equal those of `database/seed-data/edu-permission-sets.ts`;
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
  name: '202611160005_edu_cong_phu_huynh_grant',
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
      if (
        list.some(
          (grant) =>
            grant.resource.type === 'composite' &&
            grant.resource.id === 'edu.congPhuHuynh',
        )
      )
        continue;
      list.push({
        resource: { type: 'composite', id: 'edu.congPhuHuynh' },
        actions: [
          { action: 'view', policy },
          { action: 'manage', policy },
        ],
      });
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(list), updatedAt: new Date() })
        .where('key', '=', key)
        .execute();
    }
  },
});
