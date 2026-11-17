import { defineSeed } from '@nocobase/db';

/**
 * Gives the administrator permission set the backup and restore of the whole database (`edu.heThong`, GĐ 0 of
 * `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`): the page `edu.heThong` (the backup page) and the business resource
 * `edu.heThong` with the actions `backup` and `restore`, every record. Only the administrator holds it: no other set gets it. Like the earlier grant seeds it appends the
 * grant at the end of the set's grants only when it does not hold it yet, and assigns nothing to anybody. Written out
 * literally: a seed is loaded on its own and must not import application code.
 */
interface Grant {
  resource: { type: string; id: string };
  actions: { action: string; policy?: unknown }[];
}

const policy = { type: 'composite', scopes: { data: 'allRecords' } };

export default defineSeed({
  name: '202611170001_edu_he_thong_grant',
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
          grant.resource.type === type && grant.resource.id === 'edu.heThong',
      );
    let changed = false;
    if (!has('page')) {
      list.push({
        resource: { type: 'page', id: 'edu.heThong' },
        actions: [{ action: 'access' }],
      });
      changed = true;
    }
    if (!has('composite')) {
      list.push({
        resource: { type: 'composite', id: 'edu.heThong' },
        actions: [
          { action: 'backup', policy },
          { action: 'restore', policy },
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
