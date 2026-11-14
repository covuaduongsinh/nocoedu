import { defineSeed } from '@nocobase/db';

/**
 * Gives the administrator permission set the coach profiles (DS-61 phase F): the page `edu.hoSoGv` and the business
 * resource `edu.hoSoGv` (view and manage, every record). Pay is private to the administrator: no other set gets it.
 * Like the earlier grant seeds it adds them at the end of the set's grants only when it does not hold them yet, and
 * assigns nothing to anybody. Written out literally: a seed is loaded on its own and must not import application code.
 */
interface Grant {
  resource: { type: string; id: string };
  actions: { action: string; policy?: unknown }[];
}

const policy = { type: 'composite', scopes: { data: 'allRecords' } };

export default defineSeed({
  name: '202611140005_edu_ho_so_gv_grant',
  transaction: true,
  async run({ query }) {
    const row = await query
      .selectFrom('authorizationPermissionSets')
      .select('grants')
      .where('key', '=', 'edu_quan_tri')
      .executeTakeFirst();
    if (!row) return;
    let grants: unknown = row.grants;
    while (typeof grants === 'string') grants = JSON.parse(grants) as unknown;
    if (!Array.isArray(grants)) return;
    const list = grants as Grant[];
    const has = (type: string) =>
      list.some(
        (grant) =>
          grant.resource.type === type && grant.resource.id === 'edu.hoSoGv',
      );
    let changed = false;
    if (!has('page')) {
      list.push({
        resource: { type: 'page', id: 'edu.hoSoGv' },
        actions: [{ action: 'access' }],
      });
      changed = true;
    }
    if (!has('composite')) {
      list.push({
        resource: { type: 'composite', id: 'edu.hoSoGv' },
        actions: [
          { action: 'view', policy },
          { action: 'manage', policy },
        ],
      });
      changed = true;
    }
    if (!changed) return;
    await query
      .updateTable('authorizationPermissionSets')
      .set({ grants: JSON.stringify(list), updatedAt: new Date() })
      .where('key', '=', 'edu_quan_tri')
      .execute();
  },
});
