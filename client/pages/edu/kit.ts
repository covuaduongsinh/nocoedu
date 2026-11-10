import {
  ApiClientError,
  createUuid,
  useApiClient,
  type ApiClient,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  buildFilter,
  buildSort,
  type FilterNode,
} from '@nocobase/repository-input';
import { useCallback, useEffect, useState } from 'react';

export const LEVEL_KEYS = ['tot', 'ma', 'tuong', 'xe', 'hau', 'vua'] as const;
export const LEVEL_ORDER: Record<string, number> = {
  tot: 1,
  ma: 2,
  tuong: 3,
  xe: 4,
  hau: 5,
  vua: 6,
};

export type Row = Record<string, unknown> & { id: number };

/** An operation key for a standard write: 13-digit milliseconds, a dot, a UUID. */
export const operationKey = (): string => `${Date.now()}.${createUuid()}`;

export type Loaded<T> =
  | { readonly state: 'loading' }
  | { readonly state: 'error' }
  | { readonly state: 'ready'; readonly rows: readonly T[] };

/** Rows per page of a list. */
export const PAGE_SIZE = 25;
/** The most the server returns in one `findMany`. */
const SERVER_LIMIT = 100;
/** Pages a lookup list reads at most (2,000 rows); a school has far fewer branches and classes. */
const LOOKUP_PAGES = 20;

const byIdAscending = buildSort((sort) => sort.field('id').asc());
const byIdDescending = buildSort((sort) => sort.field('id').desc());

/**
 * Loads a whole collection for a lookup (the name of a class, the choices of a form): pages of 100 until the server
 * has no more. `reload` fetches again. A list a person reads page by page uses `usePagedRows` instead.
 */
export function useRows(name: string): {
  loaded: Loaded<Row>;
  reload: () => void;
} {
  const api = useApiClient();
  const [version, setVersion] = useState(0);
  // The result remembers which request produced it; a result of an older request counts as still loading.
  const [result, setResult] = useState<{ key: string; value: Loaded<Row> }>();
  const key = `${name}:${version}`;
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const rows: Row[] = [];
      for (let page = 0; page < LOOKUP_PAGES; page += 1) {
        const batch = (await api.repository(name).findMany({
          limit: SERVER_LIMIT,
          offset: page * SERVER_LIMIT,
          sort: byIdAscending,
          signal: controller.signal,
        } as never)) as unknown as Row[];
        rows.push(...batch);
        if (batch.length < SERVER_LIMIT) break;
      }
      return rows;
    })()
      .then((rows) => {
        if (!controller.signal.aborted)
          setResult({ key, value: { state: 'ready', rows } });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ key, value: { state: 'error' } });
      });
    return () => controller.abort();
  }, [api, name, key]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const loaded: Loaded<Row> =
    result?.key === key ? result.value : { state: 'loading' };
  return { loaded, reload };
}

export interface PagedOptions {
  /** 1-based page number. */
  readonly page: number;
  /** Text to look for in `searchFields` (any one may contain it); blank means no search. */
  readonly search?: string;
  readonly searchFields?: readonly string[];
  /** Equality conditions that always apply (`{ lopId: 3 }`). */
  readonly where?: Readonly<Record<string, number | string>>;
  /** Newest first (highest id first). */
  readonly descending?: boolean;
}

/** The filter of a page request: the equality conditions, and the search text in any one of its fields. */
export function pageFilter(options: PagedOptions): unknown {
  const term = (options.search ?? '').trim();
  const fields = options.searchFields ?? [];
  const where = Object.entries(options.where ?? {});
  if (!term && where.length === 0) return undefined;
  return buildFilter((f) => {
    const nodes: FilterNode[] = where.map(([field, value]) =>
      typeof value === 'number'
        ? f.number(field).eq(value)
        : f.string(field).eq(value),
    );
    if (term && fields.length > 0)
      nodes.push(
        f.or(
          fields.map((field) =>
            f.string(field).includes(term, { mode: 'insensitive' }),
          ),
        ),
      );
    return f.and(nodes);
  });
}

/**
 * One page of a collection, read on the server (`limit`, `offset`, a filter and the total from `count`). The page
 * is kept by the caller so it can reset it when the search changes. `reload` asks again.
 */
export function usePagedRows(
  name: string,
  options: PagedOptions,
): {
  loaded: Loaded<Row>;
  total: number;
  reload: () => void;
} {
  const api = useApiClient();
  const [version, setVersion] = useState(0);
  const filter = pageFilter(options);
  const filterJson = JSON.stringify(filter ?? null);
  const key = `${name}:${options.page}:${filterJson}:${version}`;
  const [result, setResult] = useState<{
    key: string;
    value: Loaded<Row>;
    total: number;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    const body = JSON.parse(filterJson) as unknown;
    const withFilter = body ? { filter: body } : {};
    const read = <T>(action: string, json: unknown): Promise<T> =>
      api
        .request<{ data: T }>({
          path: `${name}/${action}`,
          method: 'POST',
          json,
        })
        .then((response) => response.data);
    Promise.all([
      read<Row[]>('findMany', {
        ...withFilter,
        sort: options.descending ? byIdDescending : byIdAscending,
        limit: PAGE_SIZE,
        offset: (options.page - 1) * PAGE_SIZE,
      }),
      read<number>('count', withFilter),
    ])
      .then(([rows, total]) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            value: { state: 'ready', rows },
            total: Number(total) || 0,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ key, value: { state: 'error' }, total: 0 });
      });
    return () => controller.abort();
  }, [api, name, key, filterJson, options.page, options.descending]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const current = result?.key === key ? result : undefined;
  return {
    loaded: current?.value ?? { state: 'loading' },
    total: current?.total ?? 0,
    reload,
  };
}

/**
 * The page and search text of a list. `search` is what the box shows; `applied` follows it after a short pause so a
 * request is not sent for every key. Changing the search returns to page 1.
 */
export function useListState(): {
  page: number;
  setPage: (page: number) => void;
  search: string;
  setSearch: (value: string) => void;
  applied: string;
} {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setApplied(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  return { page, setPage, search, setSearch, applied };
}

/**
 * The rows of a collection with these ids (a page of attendance names its sessions), by id. Rows the person may not
 * see are simply absent. Ids are looked up at most 100 at a time.
 */
export function useRowsByIds(
  name: string,
  ids: readonly number[],
): ReadonlyMap<number, Row> {
  const api = useApiClient();
  const wanted = JSON.stringify([...new Set(ids)].sort((a, b) => a - b));
  const [found, setFound] = useState<{
    key: string;
    rows: ReadonlyMap<number, Row>;
  }>();
  const key = `${name}:${wanted}`;
  useEffect(() => {
    const list = JSON.parse(wanted) as number[];
    if (list.length === 0) return;
    let live = true;
    const filter = buildFilter((f) =>
      f.or(list.slice(0, SERVER_LIMIT).map((id) => f.number('id').eq(id))),
    );
    api
      .request<{ data: Row[] }>({
        path: `${name}/findMany`,
        method: 'POST',
        json: { filter, limit: SERVER_LIMIT },
      })
      .then((response) => {
        if (live)
          setFound({
            key,
            rows: new Map(response.data.map((row) => [row.id, row])),
          });
      })
      .catch(() => {
        if (live) setFound({ key, rows: new Map() });
      });
    return () => {
      live = false;
    };
  }, [api, name, wanted, key]);
  return found?.key === key ? found.rows : EMPTY_ROWS;
}

const EMPTY_ROWS: ReadonlyMap<number, Row> = new Map();

/** The translated message for a failed request: by the server's `reason`, never the raw message. */
export function useErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation();
  return (error) => {
    const reason =
      error instanceof ApiClientError
        ? (error as { reason?: string }).reason
        : undefined;
    const keyed = reason ? `edu.errors.${reason}` : '';
    const text = keyed ? t(keyed) : '';
    return text && text !== keyed ? text : t('edu.errors.generic');
  };
}

export function createOne(
  api: ApiClient,
  name: string,
  values: Record<string, unknown>,
): Promise<unknown> {
  return api
    .repository(name)
    .createOne({ values, idempotencyKey: operationKey() } as never);
}

export function post(
  api: ApiClient,
  path: string,
  json: unknown,
): Promise<unknown> {
  return api.request({ path, method: 'POST', json });
}

/** A row value as text: strings and numbers only, anything else is empty. */
export function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

export type Result<T> =
  | { readonly state: 'loading' }
  | {
      readonly state: 'error';
      readonly forbidden: boolean;
      readonly reason?: string;
    }
  | { readonly state: 'ready'; readonly data: T };

/** POSTs a read-only business route (reports, summaries) and keeps the result; `reload` asks again. */
export function useRequest<T>(
  path: string,
  json: unknown,
): { result: Result<T>; reload: () => void } {
  const api = useApiClient();
  const [version, setVersion] = useState(0);
  const body = JSON.stringify(json);
  const key = `${path}:${body}:${version}`;
  const [done, setDone] = useState<{ key: string; value: Result<T> }>();
  useEffect(() => {
    let live = true;
    api
      .request<{ data: T }>({ path, method: 'POST', json: JSON.parse(body) })
      .then((response) => {
        if (live)
          setDone({ key, value: { state: 'ready', data: response.data } });
      })
      .catch((error: unknown) => {
        if (live)
          setDone({
            key,
            value: {
              state: 'error',
              forbidden:
                error instanceof ApiClientError &&
                (error as { status?: number }).status === 403,
              ...(error instanceof ApiClientError &&
              (error as { reason?: string }).reason
                ? { reason: (error as { reason: string }).reason }
                : {}),
            },
          });
      });
    return () => {
      live = false;
    };
  }, [api, path, body, key]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const result: Result<T> =
    done?.key === key ? done.value : { state: 'loading' };
  return { result, reload };
}

/** Today in Vietnam as `YYYY-MM-DD`, the club's calendar day. */
export function todayVn(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}
