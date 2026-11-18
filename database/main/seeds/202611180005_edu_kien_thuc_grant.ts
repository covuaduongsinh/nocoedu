import { defineSeed } from '@nocobase/db';

/**
 * Gives the NocoEdu permission sets the knowledge system (GĐ 4 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`):
 *
 * - the pages `edu.chuongTrinh` (the curriculum) and `edu.kienThuc` (the knowledge matrix);
 * - the business resource `edu.chuongTrinh` (`view`, `manage`), over the curriculum collections `chuDe` and `kyNang`.
 *   The curriculum is the same for every branch, so every holder reads all of it; only the administrator manages it;
 * - the business resource `edu.kienThuc` (`view`, `record`), over `data` (what a student has learned, by student) and
 *   `taught` (the skills taught in a session, by class): the administrator all, the branch manager their branches,
 *   the coach their classes. The accountant gets the curriculum page and its `view`, nothing of what a student learned.
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
  readonly pages: readonly string[];
  /** The scope of the curriculum, and whether the set may manage it. */
  readonly chuongTrinh: { manage: boolean };
  /** The scope of the knowledge matrix; `null` when the set does not hold it. */
  readonly kienThuc: string | null;
}

const SETS: readonly SetPlan[] = [
  {
    key: 'edu_quan_tri',
    pages: ['edu.chuongTrinh', 'edu.kienThuc'],
    chuongTrinh: { manage: true },
    kienThuc: 'allRecords',
  },
  {
    key: 'edu_quan_ly_co_so',
    pages: ['edu.chuongTrinh', 'edu.kienThuc'],
    chuongTrinh: { manage: false },
    kienThuc: 'edu.myBranches',
  },
  {
    key: 'edu_hlv',
    pages: ['edu.chuongTrinh', 'edu.kienThuc'],
    chuongTrinh: { manage: false },
    kienThuc: 'edu.myClasses',
  },
  {
    key: 'edu_ke_toan',
    pages: ['edu.chuongTrinh'],
    chuongTrinh: { manage: false },
    kienThuc: null,
  },
];

export default defineSeed({
  name: '202611180005_edu_kien_thuc_grant',
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
      for (const id of plan.pages) {
        if (holds('page', id)) continue;
        list.push({
          resource: { type: 'page', id },
          actions: [{ action: 'access' }],
        });
        changed = true;
      }
      if (!holds('composite', 'edu.chuongTrinh')) {
        const policy = {
          type: 'composite',
          scopes: { chuDe: 'allRecords', kyNang: 'allRecords' },
        };
        list.push({
          resource: { type: 'composite', id: 'edu.chuongTrinh' },
          actions: [
            { action: 'view', policy },
            ...(plan.chuongTrinh.manage ? [{ action: 'manage', policy }] : []),
          ],
        });
        changed = true;
      }
      if (plan.kienThuc && !holds('composite', 'edu.kienThuc')) {
        const policy = {
          type: 'composite',
          scopes: { data: plan.kienThuc, taught: plan.kienThuc },
        };
        list.push({
          resource: { type: 'composite', id: 'edu.kienThuc' },
          actions: [
            { action: 'view', policy },
            { action: 'record', policy },
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
