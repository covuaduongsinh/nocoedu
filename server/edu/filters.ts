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
  buildFilter((f) => anyOfNode(f, field, values));

/** The node of `anyOf`, to combine with other conditions inside one `buildFilter` (the list must not be empty). */
export const anyOfNode = (
  f: FilterBuilder,
  field: string,
  values: readonly number[],
): FilterNode =>
  balancedOr(
    f,
    values.map((value) => f.number(field).eq(value)),
  );

/** Like `anyOfNode`, for a text column (a date `YYYY-MM-DD`, a status). */
export const anyOfText = (
  f: FilterBuilder,
  field: string,
  values: readonly string[],
): FilterNode =>
  balancedOr(
    f,
    values.map((value) => f.string(field).eq(value)),
  );

export const byId = (sort: SortBuilder) => sort.field('id').asc();

/**
 * A numeric `field` inside one of the closed ranges `[from, to]` (a one-id range is an equality). A long list of ids
 * that mostly follow each other becomes a handful of ranges, which the database answers from an index instead of
 * comparing every row with every id.
 */
export const inRanges = (
  f: FilterBuilder,
  field: string,
  ranges: readonly { readonly from: number; readonly to: number }[],
): FilterNode =>
  balancedOr(
    f,
    ranges.map((range) =>
      range.from === range.to
        ? f.number(field).eq(range.from)
        : f.and([
            f.number(field).gte(range.from),
            f.number(field).lte(range.to),
          ]),
    ),
  );
