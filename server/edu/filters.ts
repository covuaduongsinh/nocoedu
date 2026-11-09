import { buildFilter, type SortBuilder } from '@nocobase/repository-input';

/** A filter matching rows whose numeric `field` is one of `values`. The caller handles the empty list. */
export const anyOf = (field: string, values: readonly number[]) =>
  buildFilter((f) => f.or(values.map((value) => f.number(field).eq(value))));

export const byId = (sort: SortBuilder) => sort.field('id').asc();
