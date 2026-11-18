import type { RepositoryPolicy } from '@nocobase/db';

import { anyOf } from './filters.js';
import { eduError } from '../routes/edu-support.js';

export type Row = Record<string, unknown>;

/** The server returns at most this many rows per request, so the helpers below page. */
export const PAGE = 100;

interface PolicyReader {
  repository(name: string): {
    withPolicy(policy: RepositoryPolicy): unknown;
  };
}

/**
 * Every row of `collection` the policy lets through (optionally narrowed by `filter`), page by page, ordered by id. More
 * than `max` rows is refused with a clear error instead of a silently short result. `database` may be the database
 * manager or a transaction connection.
 */
export async function readAllRows(
  database: PolicyReader,
  collection: string,
  policy: RepositoryPolicy,
  filter?: unknown,
  max = 5000,
): Promise<Row[]> {
  const repository = database.repository(collection).withPolicy(policy) as {
    findMany(input: unknown): Promise<Row[]>;
  };
  const rows: Row[] = [];
  for (let offset = 0; offset <= max; offset += PAGE) {
    const page = await repository.findMany({
      ...(filter ? { filter } : {}),
      sort: (s: { field: (n: string) => { asc: () => unknown } }) =>
        s.field('id').asc(),
      limit: PAGE,
      offset,
    });
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  if (rows.length > max) {
    throw eduError(
      'FAILED_PRECONDITION',
      'EDU_EXPORT_TOO_LARGE',
      `More than ${max} records: narrow the request to one branch, class or month.`,
    );
  }
  return rows;
}

/** `items` cut into groups of at most `size`. */
export function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * The rows of `collection` with these ids that the policy lets through, by id. A policy of `undefined` (the caller does
 * not hold the action) and ids outside the scope simply give no row.
 */
export async function readRowsByIds(
  database: PolicyReader,
  collection: string,
  policy: RepositoryPolicy | undefined,
  ids: readonly number[],
): Promise<Map<number, Row>> {
  const map = new Map<number, Row>();
  if (!policy) return map;
  for (const part of chunksOf([...new Set(ids)], PAGE)) {
    for (const row of await readAllRows(
      database,
      collection,
      policy,
      anyOf('id', part),
      PAGE,
    )) {
      map.set(Number(row.id), row);
    }
  }
  return map;
}
