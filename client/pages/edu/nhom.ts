import { text, usePagedRows, type Loaded, type Row } from './kit.js';

/**
 * Groups inside a class (phase 3). `useClassGroups` reads the groups of one class through the `lopNhom` record API
 * (so the person's scope decides what shows); `rosterSections` is the pure rule that splits a roster into blocks.
 */
export function useClassGroups(lopId: number): {
  readonly loaded: Loaded<Row>;
  readonly groups: readonly Row[];
  readonly active: readonly Row[];
  readonly reload: () => void;
} {
  const { loaded, reload } = usePagedRows('lopNhom', {
    page: 1,
    pageSize: 100,
    where: { lopId },
    sortField: 'thuTu',
  });
  const groups = loaded.state === 'ready' ? loaded.rows : [];
  return {
    loaded,
    groups,
    active: groups.filter((group) => group.trangThai === 'hoat_dong'),
    reload,
  };
}

export interface RosterSection {
  readonly key: string;
  /** The group of this block, `null` for the students who sit in none. */
  readonly nhomId: number | null;
  /** The heading of the block; `null` when the roster is not split (nobody has a group). */
  readonly title: string | null;
  readonly students: readonly Row[];
}

/**
 * Splits the students of one class into blocks by group, in the order of the groups (the server sorts them by
 * `thuTu`); students in no group come last. When nobody sits in a known group the roster stays one block without a
 * heading, so a class that does not use groups looks as it did before. A group with no student is left out.
 */
export function rosterSections(
  roster: readonly Row[],
  groups: readonly Row[],
  noGroupTitle: string,
): readonly RosterSection[] {
  const known = new Set(groups.map((group) => Number(group.id)));
  const inKnownGroup = (student: Row): boolean =>
    student.nhomId != null && known.has(Number(student.nhomId));
  if (!roster.some(inKnownGroup)) {
    return [{ key: 'all', nhomId: null, title: null, students: roster }];
  }
  const sections: RosterSection[] = [];
  for (const group of groups) {
    const students = roster.filter(
      (student) =>
        student.nhomId != null && Number(student.nhomId) === group.id,
    );
    if (students.length > 0) {
      sections.push({
        key: `g-${group.id}`,
        nhomId: group.id,
        title: text(group.ten),
        students,
      });
    }
  }
  const rest = roster.filter((student) => !inKnownGroup(student));
  if (rest.length > 0) {
    sections.push({
      key: 'none',
      nhomId: null,
      title: noGroupTitle,
      students: rest,
    });
  }
  return sections;
}
