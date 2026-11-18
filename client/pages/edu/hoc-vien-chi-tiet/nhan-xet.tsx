import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import { text, usePagedRows } from '../kit.js';
import { RowsTable } from '../list-page.js';

/**
 * The monthly comments saved for the student, newest first. They are read through the record API of the comments, so the
 * scope of the person (a coach sees their own classes) decides what shows; writing them stays on the Comments page.
 */
export function Comments({
  studentId,
}: {
  readonly studentId: number;
}): ReactElement {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const comments = usePagedRows('nhanXetThang', {
    page,
    where: { hocVienId: studentId },
    descending: true,
  });
  return (
    <RowsTable
      loaded={comments.loaded}
      onRetry={comments.reload}
      emptyTitle={t('edu.hoSo.comments.empty')}
      emptyHint={t('edu.hoSo.comments.emptyHint')}
      paging={{ page, total: comments.total, onPage: setPage }}
      columns={[
        {
          key: 'thang',
          label: t('edu.hoSo.comments.thang'),
          render: (row) => text(row.thang),
        },
        {
          key: 'noiDung',
          label: t('edu.hoSo.comments.noiDung'),
          render: (row) => (
            <span className='whitespace-pre-wrap break-words'>
              {text(row.noiDung)}
            </span>
          ),
        },
        {
          key: 'trangThai',
          label: t('edu.hocVien.trangThai'),
          render: (row) => (
            <StatusBadge tone='neutral' size='sm'>
              {t(`edu.hoSo.comments.status.${text(row.trangThai)}`, {
                defaultValue: text(row.trangThai),
              })}
            </StatusBadge>
          ),
        },
      ]}
    />
  );
}
