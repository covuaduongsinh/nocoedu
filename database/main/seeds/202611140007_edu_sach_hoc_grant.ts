import { defineSeed } from '@nocobase/db';

/**
 * Gives the NocoEdu permission sets the books each student learns (DS-61 phase E4): the business resource
 * `edu.sachHoc` (view only; no page, it is shown on the student's file). Everyone who sees students may see it, over
 * the same records: administrator and accountant all, branch manager their branches, coach their classes. Like the
 * earlier grant seeds it adds the grant at the end of each set that exists and does not hold it yet, and assigns
 * nothing. Written out literally: a seed is loaded on its own and must not import application code.
 */
const SETS: readonly { key: string; scope: string }[] = [
  { key: 'edu_quan_tri', scope: 'allRecords' },
  { key: 'edu_quan_ly_co_so', scope: 'edu.myBranches' },
  { key: 'edu_hlv', scope: 'edu.myClasses' },
  { key: 'edu_ke_toan', scope: 'allRecords' },
];

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string; policy?: unknown }[];
}

export default defineSeed({
  name: '202611140007_edu_sach_hoc_grant',
  transaction: true,
  async run({ query }) {
    for (const { key, scope } of SETS) {
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
            grant.resource.id === 'edu.sachHoc',
        )
      )
        continue;
      list.push({
        resource: { type: 'composite', id: 'edu.sachHoc' },
        actions: [
          {
            action: 'view',
            policy: { type: 'composite', scopes: { data: scope } },
          },
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
