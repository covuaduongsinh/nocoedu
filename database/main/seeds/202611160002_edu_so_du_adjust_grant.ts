import { defineSeed } from '@nocobase/db';

/**
 * Gives the NocoEdu permission sets "Quản trị" and "Kế toán" the `adjust` action of `edu.soDu`: setting a student's
 * balance of sessions by hand, with a reason (a correction, a refund of sessions, settling a balance that disagrees
 * with the ledger). A branch manager and a coach do not hold it: a balance is money owed in sessions.
 *
 * `202611090002_edu_permission_sets` already ran on real databases and never overwrites a set, so the action is added
 * here, to the ledger grant of the sets that exist, and only when the set does not hold it yet. A set whose
 * administrator removed the whole ledger grant is left alone. No set is assigned to anybody.
 *
 * Written out literally: a seed is loaded on its own and must not import application code. The grants equal those of
 * `database/seed-data/edu-permission-sets.ts`; `tests/server/edu-permission-sets.test.ts` fails when they differ.
 */
const SETS = ['edu_quan_tri', 'edu_ke_toan'] as const;

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string; policy?: unknown }[];
}

export default defineSeed({
  name: '202611160002_edu_so_du_adjust_grant',
  transaction: true,
  async run({ query }) {
    for (const key of SETS) {
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
      const ledger = list.find(
        (grant) =>
          grant.resource.type === 'composite' &&
          grant.resource.id === 'edu.soDu',
      );
      if (!ledger) continue;
      if (ledger.actions.some((action) => action.action === 'adjust')) continue;
      ledger.actions.push({
        action: 'adjust',
        policy: { type: 'composite', scopes: { data: 'allRecords' } },
      });
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(list), updatedAt: new Date() })
        .where('key', '=', key)
        .execute();
    }
  },
});
