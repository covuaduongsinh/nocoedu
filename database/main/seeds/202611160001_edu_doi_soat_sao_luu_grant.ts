import { defineSeed } from '@nocobase/db';

/**
 * Gives the reconciliation page and the backup page grants of their own.
 *
 * Until now `/doi-soat` opened with the tuition page's grant and `/sao-luu` with no grant at all (every signed-in
 * person saw it), and the backup route asked for no permission. This adds, at the end of the grants of the sets that
 * exist and only when a set does not hold them yet:
 *
 * - the page `edu.doiSoat` to administrators, branch managers and accountants (what each sees on it is decided by
 *   their business actions, so a page grant alone opens no data);
 * - the page `edu.saoLuu` and the action `backup` of `edu.heThong` to administrators only: a backup is a copy of every
 *   student, parent phone number and payment.
 *
 * No set is assigned to anybody. Written out literally: a seed is loaded on its own and must not import application
 * code. The grants equal those of `database/seed-data/edu-permission-sets.ts`;
 * `tests/server/edu-permission-sets.test.ts` fails when they differ.
 */
interface Grant {
  resource: { type: string; id: string };
  actions: { action: string; policy?: unknown }[];
}

const page = (id: string): Grant => ({
  resource: { type: 'page', id },
  actions: [{ action: 'access' }],
});

const SETS: readonly { key: string; grants: readonly Grant[] }[] = [
  {
    key: 'edu_quan_tri',
    grants: [
      page('edu.doiSoat'),
      page('edu.saoLuu'),
      {
        resource: { type: 'composite', id: 'edu.heThong' },
        actions: [
          {
            action: 'backup',
            policy: { type: 'composite', scopes: { data: 'allRecords' } },
          },
        ],
      },
    ],
  },
  { key: 'edu_quan_ly_co_so', grants: [page('edu.doiSoat')] },
  { key: 'edu_ke_toan', grants: [page('edu.doiSoat')] },
];

export default defineSeed({
  name: '202611160001_edu_doi_soat_sao_luu_grant',
  transaction: true,
  async run({ query }) {
    for (const { key, grants: wanted } of SETS) {
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
      let changed = false;
      for (const grant of wanted) {
        const held = list.some(
          (existing) =>
            existing.resource.type === grant.resource.type &&
            existing.resource.id === grant.resource.id,
        );
        if (held) continue;
        list.push(grant);
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
