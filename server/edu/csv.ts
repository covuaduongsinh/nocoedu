/**
 * CSV for the reports. A cell that starts with `=`, `+`, `-` or `@` (also after blanks: some spreadsheets skip them), or with a tab or a carriage return, would be run as a
 * formula by a spreadsheet, so such text gets a leading apostrophe. Numbers are written as they are.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^(?:\s*[=+\-@]|[\t\r])/u.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

/** Header and rows as one CSV document: UTF-8 with a byte order mark (so Excel reads Vietnamese) and CRLF lines. */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
