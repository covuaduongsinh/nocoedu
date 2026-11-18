import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';

import { FilterSelect } from '../filter-select.js';
import { text, useRows } from '../kit.js';
import { useUrlState } from '../url-state.js';
import { KnowledgePanel } from './panel.js';

/**
 * "Tiến độ kiến thức" (`/kien-thuc`): choose a class, then read its matrix of students × skills and grade it by
 * hand, or switch to the gaps to make up. The class, the group, the level, the topic, the view and the page are kept in
 * the address. What the person may see is decided by the server (their classes or branches); a class outside it is
 * simply not listed.
 */
export default function KienThucPage(): ReactElement {
  const { t } = useTranslation();
  const url = useUrlState({
    lop: '',
    nhom: '',
    cap: '',
    chuDe: '',
    che: 'ma-tran',
  });
  const classes = useRows('lop');
  const rows = classes.loaded.state === 'ready' ? classes.loaded.rows : [];
  const lopId = Number(url.values.lop);

  return (
    <PageContainer className='mx-auto max-w-7xl space-y-6'>
      <PageHeader
        title={t('edu.kt.title')}
        description={t('edu.kt.description')}
      />
      <div className='flex flex-wrap items-center gap-2'>
        <FilterSelect
          label={t('edu.kt.pickClass')}
          allLabel={t('edu.kt.pickClass')}
          value={url.values.lop}
          // Another class has its own groups: only the class and the view stay in the address.
          onChange={(lop) =>
            url.set({ lop, nhom: '', cap: '', chuDe: '' }, { replace: false })
          }
          options={rows
            .filter((row) => row.trangThai !== 'da_dong')
            .map((row) => ({
              value: String(row.id),
              label: `${text(row.ma)} · ${text(row.ten)}`,
            }))}
        />
        {classes.loaded.state === 'error' ? (
          <p role='alert' className='text-sm text-destructive'>
            {t('edu.common.loadError')}
          </p>
        ) : null}
      </div>
      {Number.isInteger(lopId) && lopId > 0 ? (
        <KnowledgePanel key={lopId} lopId={lopId} />
      ) : (
        <p className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
          {t('edu.kt.chooseClassHint')}
        </p>
      )}
    </PageContainer>
  );
}
