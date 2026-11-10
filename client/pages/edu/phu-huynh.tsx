import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { text, useListState, usePagedRows } from './kit.js';
import { ListPage } from './list-page.js';
import { RowManage } from './sua-xoa.js';

export default function PhuHuynhPage(): ReactElement {
  const { t } = useTranslation();
  const list = useListState();
  const { loaded, total, reload } = usePagedRows('phuHuynh', {
    page: list.page,
    search: list.applied,
    searchFields: ['ma', 'hoTen', 'soDienThoai'],
  });
  return (
    <ListPage
      title={t('edu.phuHuynh.title')}
      description={t('edu.phuHuynh.description')}
      emptyTitle={t('edu.phuHuynh.empty')}
      emptyHint={t('edu.phuHuynh.emptyHint')}
      loaded={loaded}
      onRetry={reload}
      rowActions={(row) => (
        <RowManage kind='phuHuynh' row={row} onChanged={reload} />
      )}
      paging={{ page: list.page, total, onPage: list.setPage }}
      search={{
        value: list.search,
        label: t('edu.common.search'),
        onChange: list.setSearch,
      }}
      columns={[
        { key: 'ma', label: t('edu.phuHuynh.ma') },
        { key: 'hoTen', label: t('edu.phuHuynh.hoTen') },
        { key: 'soDienThoai', label: t('edu.phuHuynh.soDienThoai') },
        {
          key: 'zalo',
          label: t('edu.phuHuynh.zalo'),
          render: (row) => text(row.zalo),
        },
      ]}
    />
  );
}
