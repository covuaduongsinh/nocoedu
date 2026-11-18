import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { text, usePagedRows, useRowsByIds } from '../kit.js';
import { RowsTable } from '../list-page.js';
import { UnlinkButton } from '../sua-xoa.js';

/** The parents linked to the student, with the unlink action for a person who may manage links. */
export function Parents({
  studentId,
}: {
  readonly studentId: number;
}): ReactElement {
  const { t } = useTranslation();
  const links = usePagedRows('lienKet', {
    page: 1,
    where: { hocVienId: studentId },
  });
  const linkRows = links.loaded.state === 'ready' ? links.loaded.rows : [];
  const parents = useRowsByIds(
    'phuHuynh',
    linkRows.map((row) => Number(row.phuHuynhId)),
  );
  return (
    <RowsTable
      loaded={links.loaded}
      onRetry={links.reload}
      emptyTitle={t('edu.hocVien.noParents')}
      emptyHint={t('edu.hocVien.noParentsHint')}
      columns={[
        {
          key: 'hoTen',
          label: t('edu.phuHuynh.hoTen'),
          render: (row) => text(parents.get(Number(row.phuHuynhId))?.hoTen),
        },
        {
          key: 'quanHe',
          label: t('edu.hocVien.quanHe'),
          render: (row) => t(`edu.relation.${text(row.quanHe)}`),
        },
        {
          key: 'soDienThoai',
          label: t('edu.phuHuynh.soDienThoai'),
          render: (row) =>
            text(parents.get(Number(row.phuHuynhId))?.soDienThoai),
        },
        {
          key: 'zalo',
          label: t('edu.phuHuynh.zalo'),
          render: (row) => text(parents.get(Number(row.phuHuynhId))?.zalo),
        },
        {
          key: 'lienHeChinh',
          label: t('edu.hocVien.lienHeChinh'),
          render: (row) =>
            row.lienHeChinh === true ? t('edu.common.yes') : '',
        },
      ]}
      rowActions={(row) => (
        <UnlinkButton linkId={row.id} onChanged={links.reload} />
      )}
    />
  );
}
