import {
  buildFilter,
  type FilterBuilder,
  type FilterNode,
  type SortBuilder,
} from '@nocobase/repository-input';

/** Most conditions one OR group holds; deeper nesting keeps the expression shallow for every database. */
const GROUP_SIZE = 64;

function balancedOr(
  f: FilterBuilder,
  nodes: readonly FilterNode[],
): FilterNode {
  if (nodes.length <= GROUP_SIZE) return f.or(nodes);
  const groups: FilterNode[] = [];
  for (let i = 0; i < nodes.length; i += GROUP_SIZE) {
    groups.push(f.or(nodes.slice(i, i + GROUP_SIZE)));
  }
  return balancedOr(f, groups);
}

/**
 * A filter matching rows whose numeric `field` is one of `values`. The caller handles the empty list.
 *
 * The builder has no `in` operator for numbers. A flat OR of thousands of ids exceeds the expression depth limit of
 * SQLite (1000), so the conditions are grouped into a shallow tree of at most 64 per group.
 */
export const anyOf = (field: string, values: readonly number[]) =>
  buildFilter((f) =>
    balancedOr(
      f,
      values.map((value) => f.number(field).eq(value)),
    ),
  );

export const byId = (sort: SortBuilder) => sort.field('id').asc();
