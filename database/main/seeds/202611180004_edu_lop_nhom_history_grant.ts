import { defineSeed } from '@nocobase/db';

/**
 * Lets the people who move students between groups also read the history of those moves: the action `history` of the
 * business resource `edu.lopNhom` (record API `chuyenNhom`, read only, shown on the overview of a student's file). The
 * administrator holds it over every record, the branch manager over their branches, the coach over their classes; the
 * accountant does not hold it. `202611180003_edu_lop_nhom_grant` had already run, so this adds the action to the grant it
 * made, after `manage`, only when the action is missing; a set without that grant is left alone. Assigns nothing to
 * anybody. Written out literally: a seed is loaded on its own and must not import application code.
 */
const SETS: readonly { key: string; scope: string }[] = [
  { key: 'edu_quan_tri', scope: 'allRecords' },
  { key: 'edu_quan_ly_co_so', scope: 'edu.myBranches' },
  { key: 'edu_hlv', scope: 'edu.myClasses' },
];

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string; policy?: unknown }[];
}

export default defineSeed({
  name: '202611180004_edu_lop_nhom_history_grant',
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
      const grant = (grants as Grant[]).find(
        (item) =>
          item.resource.type === 'composite' &&
          item.resource.id === 'edu.lopNhom',
      );
      if (!grant || grant.actions.some((a) => a.action === 'history')) continue;
      grant.actions.push({
        action: 'history',
        policy: { type: 'composite', scopes: { data: scope } },
      });
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(grants), updatedAt: new Date() })
        .where('key', '=', key)
        .execute();
    }
  },
});
