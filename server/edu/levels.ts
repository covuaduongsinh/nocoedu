/**
 * The six-level path of the club: Tốt → Mã → Tượng → Xe → Hậu → Vua (knowledge document 03).
 * The path is fixed by the club; the application never promotes a student on its own — a coach confirms each step.
 */
export const LEVELS = [
  { key: 'tot', order: 1, title: 'Tốt' },
  { key: 'ma', order: 2, title: 'Mã' },
  { key: 'tuong', order: 3, title: 'Tượng' },
  { key: 'xe', order: 4, title: 'Xe' },
  { key: 'hau', order: 5, title: 'Hậu' },
  { key: 'vua', order: 6, title: 'Vua' },
] as const;

export type LevelKey = (typeof LEVELS)[number]['key'];

export const LEVEL_KEYS = LEVELS.map((level) => level.key) as [
  LevelKey,
  ...LevelKey[],
];

export function levelOrder(key: string): number | undefined {
  return LEVELS.find((level) => level.key === key)?.order;
}
