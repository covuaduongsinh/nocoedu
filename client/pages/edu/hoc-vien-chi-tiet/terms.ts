import type { Term } from './types.js';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The label of a term: its number for a package that was sold, a name for the two kinds that are not. */
export function termLabel(
  t: Translate,
  term: Pick<Term, 'loai' | 'kySo' | 'soBuoi'>,
): string {
  if (term.loai === 'chuyen_so_du') return t('edu.hoSo.kyChuyen');
  if (term.loai === 'dieu_chinh') return t('edu.hoSo.kyDieuChinh');
  return t('edu.hoSo.kyMua', { n: term.kySo, count: term.soBuoi });
}

/** The short label (`Kỳ 2`) for a filter or a table cell. */
export function termShortLabel(t: Translate, term: Term): string {
  if (term.loai === 'chuyen_so_du') return t('edu.hoSo.kyChuyen');
  if (term.loai === 'dieu_chinh') return t('edu.hoSo.kyDieuChinh');
  return t('edu.hoSo.kyShort', { n: term.kySo });
}
