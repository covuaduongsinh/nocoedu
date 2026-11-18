import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

/**
 * The filters, the tab and the page of a NocoEdu list live in the address (`?tab=…&search=…&page=2`), so a refresh, the
 * back button and a copied link all show the same thing. A value equal to its default is left out of the address.
 * Changing a filter returns to page 1 unless `keepPage` says otherwise (the tab of a detail page keeps nothing else).
 */
export function useUrlState<K extends string>(
  defaults: Readonly<Record<K, string>>,
): {
  readonly values: Readonly<Record<K, string>>;
  readonly page: number;
  readonly set: (
    patch: Partial<Record<K, string>>,
    options?: { readonly keepPage?: boolean; readonly replace?: boolean },
  ) => void;
  readonly setPage: (page: number) => void;
} {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(
    (Object.entries(defaults) as [K, string][]).map(([key, fallback]) => [
      key,
      params.get(key) ?? fallback,
    ]),
  ) as Record<K, string>;
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  return {
    values,
    page,
    set: (patch, options = {}) =>
      setParams(
        (old) => {
          const next = new URLSearchParams(old);
          for (const [key, value] of Object.entries(patch) as [
            K,
            string | undefined,
          ][]) {
            if (value === undefined || value === '' || value === defaults[key])
              next.delete(key);
            else next.set(key, value);
          }
          if (!options.keepPage) next.delete('page');
          return next;
        },
        { replace: options.replace ?? true },
      ),
    setPage: (target) =>
      setParams(
        (old) => {
          const next = new URLSearchParams(old);
          if (target <= 1) next.delete('page');
          else next.set('page', String(target));
          return next;
        },
        { replace: false },
      ),
  };
}

/**
 * A search box whose text is kept in the address: typing shows at once and reaches the address (and so the request)
 * after a short pause, so a request is not sent for every key. A change of the address from outside (back, reset)
 * updates the box.
 */
export function useUrlSearch(
  urlValue: string,
  commit: (value: string) => void,
  delay = 300,
): readonly [string, (value: string) => void] {
  const [typed, setTyped] = useState(urlValue);
  const latestRef = useRef({ urlValue, commit });
  const previousUrlRef = useRef(urlValue);
  useEffect(() => {
    latestRef.current = { urlValue, commit };
  });
  useEffect(() => {
    if (previousUrlRef.current !== urlValue) {
      previousUrlRef.current = urlValue;
      setTyped(urlValue);
    }
  }, [urlValue]);
  useEffect(() => {
    if (typed === latestRef.current.urlValue) return;
    const timer = setTimeout(() => latestRef.current.commit(typed), delay);
    return () => clearTimeout(timer);
  }, [typed, delay]);
  return [typed, setTyped];
}
