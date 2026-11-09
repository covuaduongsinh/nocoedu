/**
 * Readers for the shapes the Lark Base records API (`bitable/v1`) gives a cell. The same field can come back as a bare
 * value, a list of rich-text pieces (`[{ text, type }]`), a lookup (`{ type, value: [...] }`) or a link
 * (`{ link_record_ids }` or `[{ record_ids, text }]`); these functions turn them all into plain values and never
 * guess: a shape they do not know gives an empty result, which the plan reports as a missing value.
 */

type Json = unknown;

const isObject = (value: Json): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every scalar inside a cell, in order: strings, numbers and booleans; lookups and rich text are flattened. */
export function flatValues(cell: Json): (string | number | boolean)[] {
  if (cell === null || cell === undefined) return [];
  if (
    typeof cell === 'string' ||
    typeof cell === 'number' ||
    typeof cell === 'boolean'
  )
    return [cell];
  if (Array.isArray(cell)) return cell.flatMap((item) => flatValues(item));
  if (isObject(cell)) {
    if ('value' in cell) return flatValues(cell.value);
    if (typeof cell.text === 'string') return [cell.text];
  }
  return [];
}

/** The text of a cell: its pieces joined, trimmed; empty when there is none. */
export function textOf(cell: Json): string {
  return flatValues(cell)
    .map((value) => String(value))
    .join('')
    .trim();
}

/** The values of a lookup split into trimmed non-empty strings (`"A, B"` stays one value: only list items split). */
export function textList(cell: Json): string[] {
  return flatValues(cell)
    .map((value) => String(value).trim())
    .filter((value) => value !== '');
}

/** The first number in a cell, or `null`. */
export function numberOf(cell: Json): number | null {
  for (const value of flatValues(cell)) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^-?\d+(\.\d+)?$/u.test(value.trim()))
      return Number(value.trim());
  }
  return null;
}

/** Record ids a link cell points to. */
export function linkIds(cell: Json): string[] {
  const ids: string[] = [];
  const visit = (value: Json): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (isObject(value)) {
      for (const key of ['link_record_ids', 'record_ids'])
        if (Array.isArray(value[key]))
          for (const id of value[key]) if (typeof id === 'string') ids.push(id);
    }
  };
  visit(cell);
  return ids;
}

/** The display text a link cell carries (the primary field of the linked record), when the API sends it. */
export function linkTexts(cell: Json): string[] {
  const texts: string[] = [];
  const visit = (value: Json): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (isObject(value)) {
      if (Array.isArray(value.text_arr))
        for (const text of value.text_arr)
          if (typeof text === 'string') texts.push(text);
      if (!Array.isArray(value.text_arr) && typeof value.text === 'string')
        texts.push(value.text);
    }
  };
  visit(cell);
  return texts.map((text) => text.trim()).filter((text) => text !== '');
}

/** Users of a "person" cell: their email when the API sends one. */
export function userEmails(cell: Json): string[] {
  if (!Array.isArray(cell)) return [];
  return cell
    .map((user) => (isObject(user) ? user.email : undefined))
    .filter((email): email is string => typeof email === 'string' && !!email)
    .map((email) => email.trim().toLowerCase());
}

/** A Lark date (milliseconds since the epoch) as `YYYY-MM-DD` in the club's calendar (UTC+7); `null` when not a date. */
export function dateVn(cell: Json): string | null {
  const value = flatValues(cell)[0];
  const milliseconds =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d{10,}$/u.test(value.trim())
        ? Number(value.trim())
        : NaN;
  if (!Number.isFinite(milliseconds)) return null;
  const year = new Date(milliseconds + 7 * 3_600_000).getUTCFullYear();
  if (year < 1990 || year > 2100) return null;
  return new Date(milliseconds + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** The raw milliseconds of a date cell, or `NaN`. */
export function millisecondsOf(cell: Json): number {
  const value = flatValues(cell)[0];
  return typeof value === 'number' ? value : NaN;
}
