import { defineSeed } from '@nocobase/db';

/**
 * Gives the NocoEdu permission sets the tests of a level (GĐ 5 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`):
 *
 * - the page `edu.kiemTra`;
 * - the business resource `edu.kiemTra` (`view`, `manage`) over `bai` (a test, by class or branch), `ketQua` (a mark, by
 *   student) and, for `manage` only, `mucDo` (the state of a student on a skill, written when a test is closed): the
 *   administrator all, the branch manager their branches, the coach their classes. The accountant gets nothing.
 *
 * Like the earlier grant seeds it adds each grant at the end of a set that exists and does not hold it yet, and assigns
 * nothing to anybody. Written out literally: a seed is loaded on its own and must not import application code.
 */
interface Grant {
  resource: { type: string; id: string };
  actions: { action: string; policy?: unknown }[];
}

interface SetPlan {
  readonly key: string;
  /** The scope of the tests; the set holds nothing of them when it is not listed. */
  readonly scope: string;
}

const SETS: readonly SetPlan[] = [
  { key: 'edu_quan_tri', scope: 'allRecords' },
  { key: 'edu_quan_ly_co_so', scope: 'edu.myBranches' },
  { key: 'edu_hlv', scope: 'edu.myClasses' },
];

export default defineSeed({
  name: '202611180006_edu_kiem_tra_grant',
  transaction: true,
  async run({ query }) {
    for (const plan of SETS) {
      const row = await query
        .selectFrom('authorizationPermissionSets')
        .select('grants')
        .where('key', '=', plan.key)
        .executeTakeFirst();
      if (!row) continue;
      let grants: unknown = row.grants;
      while (typeof grants === 'string') grants = JSON.parse(grants) as unknown;
      if (!Array.isArray(grants)) continue;
      const list = grants as Grant[];
      const holds = (type: string, id: string) =>
        list.some(
          (grant) => grant.resource.type === type && grant.resource.id === id,
        );
      let changed = false;
      if (!holds('page', 'edu.kiemTra')) {
        list.push({
          resource: { type: 'page', id: 'edu.kiemTra' },
          actions: [{ action: 'access' }],
        });
        changed = true;
      }
      if (!holds('composite', 'edu.kiemTra')) {
        const view = {
          type: 'composite',
          scopes: { bai: plan.scope, ketQua: plan.scope },
        };
        const manage = {
          type: 'composite',
          scopes: { bai: plan.scope, ketQua: plan.scope, mucDo: plan.scope },
        };
        list.push({
          resource: { type: 'composite', id: 'edu.kiemTra' },
          actions: [
            { action: 'view', policy: view },
            { action: 'manage', policy: manage },
          ],
        });
        changed = true;
      }
      if (!changed) continue;
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(list), updatedAt: new Date() })
        .where('key', '=', plan.key)
        .execute();
    }
  },
});
