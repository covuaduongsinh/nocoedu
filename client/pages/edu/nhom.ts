import { text, usePagedRows, useRowsByIds, type Row } from './kit.js';

/**
 * Groups of level inside a class (GĐ 3): the hooks and the roster split that the class page, the attendance page, the
 * register and the student lists share. The tab itself is `lop-nhom.tsx`.
 */

/** The groups of one class, hidden ones included, in display order (a class has far fewer than 100). */
export function useClassGroups(lopId: number): ReturnType<typeof usePagedRows> {
  return usePagedRows('lopNhom', {
    page: 1,
    pageSize: 100,
    where: { lopId },
    sortField: 'thuTu',
  });
}

/** The name of each group in `ids`, for a list that shows the group of its rows (rows out of scope are absent). */
export function useGroupNames(
  ids: readonly unknown[],
): (id: unknown) => string {
  const wanted = ids
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const found = useRowsByIds('lopNhom', wanted);
  return (id) => text(found.get(Number(id))?.ten);
}

export interface RosterBlock {
  readonly key: string;
  /** The header of the block; `undefined` when the class is one plain list. */
  readonly title: string | undefined;
  readonly students: readonly Row[];
}

/**
 * Splits a roster into blocks by group: the groups in display order (hidden ones too, when a student is still in
 * them), then the students in no group, whose header is `noGroupTitle`. When nobody is in a group there is one block
 * without a header, so a class that does not use groups looks as it did.
 */
export function groupBlocks(
  roster: readonly Row[],
  groups: readonly Row[],
  noGroupTitle = '',
): readonly RosterBlock[] {
  const grouped = roster.filter((row) => row.nhomId != null);
  if (grouped.length === 0)
    return [{ key: 'all', title: undefined, students: roster }];
  const blocks: RosterBlock[] = groups
    .map((group) => ({
      key: `g${group.id}`,
      title: text(group.ten),
      students: roster.filter((row) => Number(row.nhomId) === group.id),
    }))
    .filter((block) => block.students.length > 0);
  // A student in a group the caller cannot read stays visible, under no header of its own.
  const known = new Set(groups.map((group) => group.id));
  const orphans = grouped.filter((row) => !known.has(Number(row.nhomId)));
  const unsorted = [...roster.filter((row) => row.nhomId == null), ...orphans];
  if (unsorted.length > 0)
    blocks.push({ key: 'none', title: noGroupTitle, students: unsorted });
  return blocks;
}
