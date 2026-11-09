import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { text, useRows } from './kit.js';
import { ListPage } from './list-page.js';

export default function PhuHuynhPage(): ReactElement {
  const { t } = useTranslation();
  const { loaded, reload } = useRows('phuHuynh');
  return (
    <ListPage
      title={t('edu.phuHuynh.title')}
      description={t('edu.phuHuynh.description')}
      emptyTitle={t('edu.phuHuynh.empty')}
      emptyHint={t('edu.phuHuynh.emptyHint')}
      loaded={loaded}
      onRetry={reload}
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
