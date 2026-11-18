import { defineSeed } from '@nocobase/db';

/**
 * Gives the NocoEdu permission sets the groups of level inside a class (GĐ 3 of
 * `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`): the business resource `edu.lopNhom`, with the scope `data` (the
 * groups, by class). No page: the groups are a tab of the class page, which
 * opens with the page grant of the class list. Over the same records as the class and the student: the administrator
 * all (view and manage), the branch manager their branches (both), the coach their classes (both), the accountant
 * all (view only). Like the earlier grant seeds it adds the grant at the end of each set that exists and does not
 * hold it yet, and assigns nothing to anybody. Written out literally: a seed is loaded on its own and must not import
 * application code.
 */
const SETS: readonly { key: string; scope: string; manage: boolean }[] = [
  { key: 'edu_quan_tri', scope: 'allRecords', manage: true },
  { key: 'edu_quan_ly_co_so', scope: 'edu.myBranches', manage: true },
  { key: 'edu_hlv', scope: 'edu.myClasses', manage: true },
  { key: 'edu_ke_toan', scope: 'allRecords', manage: false },
];

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string; policy?: unknown }[];
}

export default defineSeed({
  name: '202611180003_edu_lop_nhom_grant',
  transaction: true,
  async run({ query }) {
    for (const { key, scope, manage } of SETS) {
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
            grant.resource.id === 'edu.lopNhom',
        )
      )
        continue;
      const policy = { type: 'composite', scopes: { data: scope } };
      list.push({
        resource: { type: 'composite', id: 'edu.lopNhom' },
        actions: [
          { action: 'view', policy },
          ...(manage ? [{ action: 'manage', policy }] : []),
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
