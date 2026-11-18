import { defineSeed } from '@nocobase/db';

/**
 * Gives the NocoEdu permission sets the groups inside a class (phase 3 of
 * `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`): the business resource `edu.lopNhom`. There is no page of its own
 * (the groups are a tab of the class page, which keeps the class page grant).
 *
 * - administrator: view, manage, history (the move history, read only), moveStudent over every record;
 * - branch manager: the same over their branches;
 * - coach: the same over the classes they teach;
 * - accountant: view only.
 *
 * Like the earlier grant seeds it appends the grant at the end of each set that exists and does not hold it yet, and
 * assigns nothing to anybody. Written out literally: a seed is loaded on its own and must not import application code.
 */
const SETS: readonly { key: string; scope: string; moves: boolean }[] = [
  { key: 'edu_quan_tri', scope: 'allRecords', moves: true },
  { key: 'edu_quan_ly_co_so', scope: 'edu.myBranches', moves: true },
  { key: 'edu_hlv', scope: 'edu.myClasses', moves: true },
  { key: 'edu_ke_toan', scope: 'allRecords', moves: false },
];

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string; policy?: unknown }[];
}

const composite = (scopes: Record<string, string>) => ({
  type: 'composite',
  scopes,
});

export default defineSeed({
  name: '202611180003_edu_lop_nhom_grant',
  transaction: true,
  async run({ query }) {
    for (const { key, scope, moves } of SETS) {
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
      list.push({
        resource: { type: 'composite', id: 'edu.lopNhom' },
        actions: [
          { action: 'view', policy: composite({ data: scope }) },
          ...(moves
            ? [
                { action: 'manage', policy: composite({ data: scope }) },
                { action: 'history', policy: composite({ data: scope }) },
                {
                  action: 'moveStudent',
                  policy: composite({
                    data: scope,
                    students: scope,
                    history: scope,
                  }),
                },
              ]
            : []),
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
