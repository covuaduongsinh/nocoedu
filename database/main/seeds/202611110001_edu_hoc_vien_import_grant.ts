import { defineSeed } from '@nocobase/db';

/**
 * Gives the NocoEdu permission sets "Quản trị" and "Quản lý cơ sở" the `import` action of `edu.hocVien` (bulk import of
 * students and parents from a CSV file, DS-60). `202611090002_edu_permission_sets` already ran on real databases and
 * never overwrites a set, so the new action is added here, to the sets that exist. It is added only when the set does
 * not hold it yet, so an administrator who removed it or changed its scope is not overridden twice, and a set that was
 * deleted is not recreated. No set is assigned to anybody.
 *
 * Written out literally: a seed is loaded on its own and must not import application code. The grants equal those of
 * `database/seed-data/edu-permission-sets.ts`; `tests/server/edu-permission-sets.test.ts` fails when they differ.
 */
const GRANTS: readonly { key: string; scope: string }[] = [
  { key: 'edu_quan_tri', scope: 'allRecords' },
  { key: 'edu_quan_ly_co_so', scope: 'edu.myBranches' },
];

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string; policy?: unknown }[];
}

export default defineSeed({
  name: '202611110001_edu_hoc_vien_import_grant',
  transaction: true,
  async run({ query }) {
    for (const { key, scope } of GRANTS) {
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
      const student = list.find(
        (grant) =>
          grant.resource.type === 'composite' &&
          grant.resource.id === 'edu.hocVien',
      );
      // A set whose administrator removed the whole student grant is left alone.
      if (!student) continue;
      if (student.actions.some((action) => action.action === 'import')) continue;
      student.actions.push({
        action: 'import',
        policy: {
          type: 'composite',
          scopes: {
            data: scope,
            branches: scope,
            classes: scope,
            parents: scope,
          },
        },
      });
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(list), updatedAt: new Date() })
        .where('key', '=', key)
        .execute();
    }
  },
});
