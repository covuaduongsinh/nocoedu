/**
 * The groups of a class (phase 3 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`). Every class has three standard
 * groups, which a head coach may rename, add to and hide (never delete: the move history points at them).
 */
export const DEFAULT_GROUP_NAMES = ['Nhập môn', 'Cơ bản', 'Nâng cao'] as const;

export const GROUP_STATUSES = ['hoat_dong', 'an'] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];

/** The most groups (visible or hidden) one class may have; a coach would not read a longer list. */
export const MAX_GROUPS_PER_CLASS = 12;

interface GroupQuery {
  selectFrom: (table: 'eduLopNhom') => {
    select: (column: 'id') => {
      where: (
        column: 'lopId',
        op: '=',
        value: number,
      ) => { executeTakeFirst: () => Promise<unknown> };
    };
  };
  insertInto: (table: 'eduLopNhom') => {
    values: (rows: object[]) => { execute: () => Promise<unknown> };
  };
}

/**
 * Gives a class its three standard groups when it has none yet (idempotent: a class that has any group, even a hidden
 * one, is left alone). `query` is a trusted internal query of the connection or transaction in use; callers check the
 * class is one the caller may change before they call it.
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

/** A group name as it is stored: trimmed, single-spaced. Empty when it is not a usable name. */
export function cleanGroupName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const name = value.replace(/\s+/gu, ' ').trim();
  return name.length > 100 ? '' : name;
}
