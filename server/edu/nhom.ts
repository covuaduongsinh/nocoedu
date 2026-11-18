/**
 * Groups of level inside a class (GĐ 3). No database access here except `ensureDefaultGroups`, which takes the query
 * adapter of the connection (or transaction) the caller is in.
 */

/** The groups every class starts with, in the order they are shown. The head coach renames, adds and hides them. */
export const DEFAULT_GROUP_NAMES = ['Nhập môn', 'Cơ bản', 'Nâng cao'] as const;

export const GROUP_STATUSES = ['hoat_dong', 'an'] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];

export const GROUP_NAME_MAX = 60;

/**
 * The lock that hiding a group and moving a student into a group both take (one process at a time; a Redis adapter of
 * the concurrency service shares it across instances). Without it a student could be moved into a group while it is
 * being hidden: both checks pass, both writes land.
 */
export const GROUP_LOCK = 'edu:lop-nhom';

interface GroupQuery {
  selectFrom(table: 'eduLopNhom'): {
    select(column: 'id'): {
      where(
        column: 'lopId',
        op: '=',
        value: number,
      ): { executeTakeFirst(): Promise<unknown> };
    };
  };
  insertInto(table: 'eduLopNhom'): {
    values(rows: object[]): { execute(): Promise<unknown> };
  };
}

/**
 * Gives a class its three default groups when it has no group at all (a class that had its groups hidden keeps them).
 * Returns whether it created them. Safe to call twice.
 */
export async function ensureDefaultGroups(
  query: unknown,
  lopId: number,
): Promise<boolean> {
  const q = query as GroupQuery;
  const existing = await q
    .selectFrom('eduLopNhom')
    .select('id')
    .where('lopId', '=', lopId)
    .executeTakeFirst();
  if (existing) return false;
  await q
    .insertInto('eduLopNhom')
    .values(
      DEFAULT_GROUP_NAMES.map((ten, index) => ({
        lopId,
        ten,
        thuTu: index + 1,
        trangThai: 'hoat_dong',
      })),
    )
    .execute();
  return true;
}

/** A group name as it is stored: trimmed, inner spaces collapsed. An empty or too long name is `undefined`. */
export function cleanGroupName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim().replace(/\s+/gu, ' ');
  return name.length > 0 && name.length <= GROUP_NAME_MAX ? name : undefined;
}
