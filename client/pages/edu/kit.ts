import {
  ApiClientError,
  createUuid,
  useApiClient,
  type ApiClient,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
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

/** Loads up to 100 rows of a collection API (`POST /api/<name>/findMany`). `reload` fetches again. */
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
    api
      .repository(name)
      .findMany({ limit: 100, signal: controller.signal } as never)
      .then((rows) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            value: { state: 'ready', rows: rows as unknown as Row[] },
          });
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
