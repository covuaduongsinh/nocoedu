import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { formatDay } from '../format.js';
import { text, useRowsByIds, usePagedRows } from '../kit.js';
import { RowsTable } from '../list-page.js';

/**
 * The moves of the student between the groups of his classes, newest first (record API `chuyenNhom`, read through the
 * action `history` of `edu.lopNhom`). Shown only to who holds that action; the server decides what it returns.
 */
export function GroupHistory({
  studentId,
}: {
  readonly studentId: number;
}): ReactElement | null {
  const { t } = useTranslation();
  const { can } = useCan({
    resource: { type: 'composite', id: 'edu.lopNhom' },
    action: 'history',
  });
  const [page, setPage] = useState(1);
  const moves = usePagedRows('chuyenNhom', {
    page,
    where: { hocVienId: studentId },
    descending: true,
  });
  const rows = moves.loaded.state === 'ready' ? moves.loaded.rows : [];
  const names = useRowsByIds(
    'lopNhom',
    rows.flatMap((row) =>
      [row.tuNhomId, row.denNhomId]
        .filter((id) => id != null)
        .map((id) => Number(id)),
    ),
  );
  if (!can) return null;
  const groupName = (id: unknown): string =>
    id == null
      ? t('edu.nhom.none')
      : text(names.get(Number(id))?.ten) || `#${text(id)}`;
  return (
    <section className='flex flex-col gap-3'>
      <h2 className='text-base font-semibold'>{t('edu.nhom.history.title')}</h2>
      <RowsTable
        loaded={moves.loaded}
        onRetry={moves.reload}
        emptyTitle={t('edu.nhom.history.empty')}
        emptyHint={t('edu.nhom.history.emptyHint')}
        paging={{ page, total: moves.total, onPage: setPage }}
        columns={[
          {
            key: 'ngay',
            label: t('edu.hocVien.ngay'),
            render: (row) => formatDay(row.ngay),
          },
          {
            key: 'tuNhomId',
            label: t('edu.nhom.history.from'),
            render: (row) => groupName(row.tuNhomId),
          },
          {
            key: 'denNhomId',
            label: t('edu.nhom.history.to'),
            render: (row) => groupName(row.denNhomId),
          },
          {
            key: 'ghiChu',
            label: t('edu.nhom.history.note'),
            // `chuyen_lop` is written by the system when the class changes; anything else is the coach's own note.
            render: (row) =>
              row.ghiChu === 'chuyen_lop'
                ? t('edu.nhom.history.classChanged')
                : text(row.ghiChu),
          },
        ]}
      />
    </section>
  );
}
