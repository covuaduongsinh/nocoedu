/** "Nguyễn Minh An" → "Nguyễn M. An": the short form other applications may show (knowledge document 05). */
export function shortName(fullName: string): string {
  const words = fullName.trim().split(/\s+/u).filter(Boolean);
  if (words.length <= 2) return words.join(' ');
  const first = words[0] ?? '';
  const last = words[words.length - 1] ?? '';
  const middle = words
    .slice(1, -1)
    .map((word) => `${[...word][0]?.toUpperCase() ?? ''}.`);
  return [first, ...middle, last].join(' ');
}

/** Digits only, with +84 / 84 turned into the leading 0: the form used to compare parents by phone number. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/[^\d+]/gu, '');
  const plain = digits.startsWith('+84')
    ? `0${digits.slice(3)}`
    : digits.startsWith('84') && digits.length >= 11
      ? `0${digits.slice(2)}`
      : digits;
  return plain.replace(/\D/gu, '');
}

export function codeFromId(prefix: string, id: number): string {
  return `${prefix}${String(id).padStart(5, '0')}`;
}

/** A database value as text: strings and numbers only, anything else is empty. */
export function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}
