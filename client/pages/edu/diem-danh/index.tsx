import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useSearchParams } from 'react-router';

import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';

import { DiemDanhTab } from './diem-danh-tab.js';
import { SoDiemDanhTab } from './so-diem-danh-tab.js';

type TabKey = 'diem-danh' | 'so';

/**
 * Attendance (`/diem-danh`): two tabs kept in the URL. "Điểm danh" (default) takes the register of a session
 * (`?buoi=<id>` opens one); "Sổ điểm danh" (`?tab=so`) looks attendance up over a period. Each tab owns the other
 * parameters of the address, so switching tabs starts the other one clean and the browser's back button returns.
 */
export default function DiemDanhPage(): ReactElement {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab: TabKey = params.get('tab') === 'so' ? 'so' : 'diem-danh';

  const tabs = (
    <Tabs
      value={tab}
      onValueChange={(value) =>
        setParams(value === 'so' ? { tab: 'so' } : {}, { replace: false })
      }
    >
      <TabsList aria-label={t('edu.diemDanh.title')}>
        <TabsTrigger value='diem-danh'>
          {t('edu.diemDanh.tab.take')}
        </TabsTrigger>
        <TabsTrigger value='so'>{t('edu.diemDanh.tab.register')}</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return tab === 'so' ? (
    <SoDiemDanhTab tabs={tabs} />
  ) : (
    <DiemDanhTab tabs={tabs} />
  );
}
