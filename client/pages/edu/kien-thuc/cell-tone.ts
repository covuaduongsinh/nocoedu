import type { MucDo } from './types.js';

/** The class of a cell in the matrix, by state: quiet tints of the semantic tokens. */
export const CELL_TONE: Record<MucDo | 'none', string> = {
  none: 'bg-background',
  da_hoc: 'bg-primary/8',
  chua_vung: 'bg-(--status-warning-background)',
  dat: 'bg-(--status-success-background)',
  vung: 'bg-(--status-success-background) font-semibold',
};
