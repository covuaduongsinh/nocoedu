import { useApiClient, usePageBreadcrumb } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';

import { FormDialog } from '../form-parts.js';
import { formatDay } from '../format.js';
import { post, text, useRequest, useRows } from '../kit.js';
import { useUrlState } from '../url-state.js';
import { MarkGrid } from './mark-grid.js';
import { Results } from './results.js';
import { TestFormDialog } from './test-form.js';
import type { TestDetail } from './types.js';

/**
 * One test (`/kiem-tra/:id`): the grid where marks are entered while it is a draft, and the results. The tab is kept in
 * the address (`?tab=nhap-diem` or `?tab=ket-qua`; a closed test opens on the results). A test outside the person's
 * scope is "not found". The edit, the grid and the closing button need `edu.kiemTra` `manage`; the server decides again.
 */
export default function KiemTraChiTietPage(): ReactElement {
  const { t } = useTranslation();
  const id = Number(useParams().id);
  const { result, reload } = useRequest<TestDetail>('/kiemTra/chiTiet', { id });
  const detail = result.state === 'ready' ? result.data : undefined;
  usePageBreadcrumb([
    { label: t('edu.nav.kiemTra'), to: '/kiem-tra' },
    { label: detail?.bai.ten ?? t('edu.kiemTra.detail') },
  ]);

  if (result.state === 'loading')
    return (
      <PageContainer className='mx-auto max-w-6xl'>
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      </PageContainer>
    );
  if (result.state === 'error') {
    if (result.reason === 'EDU_TEST_NOT_FOUND')
      return (
        <PageContainer className='mx-auto max-w-6xl'>
          <PageHeader
            title={t('edu.kiemTra.notFound')}
            description={t('edu.kiemTra.notFoundHint')}
          />
        </PageContainer>
      );
    return (
      <PageContainer className='mx-auto max-w-6xl'>
        <div role='alert' className='flex flex-col items-start gap-3'>
          <p className='text-sm text-destructive'>
            {result.forbidden
              ? t('edu.kiemTra.forbidden')
              : t('edu.common.loadError')}
          </p>
          <Button variant='outline' onClick={reload}>
            {t('edu.common.retry')}
          </Button>
        </div>
      </PageContainer>
    );
  }
  return <TestFile detail={result.data} onChanged={reload} />;
}

function TestFile({
  detail,
  onChanged,
}: {
  readonly detail: TestDetail;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { bai } = detail;
  const { can: canManage } = useCan({
    resource: { type: 'composite', id: 'edu.kiemTra' },
    action: 'manage',
  });
  const classes = useRows('lop').loaded;
  const className =
    classes.state === 'ready'
      ? text(classes.rows.find((row) => row.id === bai.lopId)?.ten)
      : '';
  const url = useUrlState({
    tab: bai.trangThai === 'da_chot' ? 'ket-qua' : 'nhap-diem',
  });
  const tab = url.values.tab === 'ket-qua' ? 'ket-qua' : 'nhap-diem';
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const marked = new Set(detail.diem.map((mark) => mark.hocVienId)).size;
  const missing = detail.tongHop.filter(
    (summary) => summary.daKiemTra && summary.thieu > 0,
  ).length;

  return (
    <PageContainer className='mx-auto max-w-6xl space-y-6'>
      <PageHeader
        title={bai.ten}
        description={[
          t(`edu.level.${bai.levelKey}`),
          className,
          formatDay(bai.ngay),
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          canManage && bai.trangThai === 'nhap' ? (
            <div className='flex flex-wrap gap-2'>
              {detail.coTheSua ? (
                <Button variant='outline' onClick={() => setEditing(true)}>
                  {t('edu.kiemTra.edit')}
                </Button>
              ) : null}
              <Button
                disabled={detail.diem.length === 0}
                onClick={() => setClosing(true)}
              >
                {t('edu.kiemTra.close.button')}
              </Button>
            </div>
          ) : null
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <StatusBadge
          size='sm'
          tone={bai.trangThai === 'da_chot' ? 'success' : 'warning'}
        >
          {t(`edu.kiemTra.status.${bai.trangThai}`)}
        </StatusBadge>
        <StatusBadge
          size='sm'
          tone={bai.loai === 'len_cap' ? 'info' : 'neutral'}
        >
          {t(`edu.kiemTra.kind.${bai.loai}`)}
        </StatusBadge>
        <span className='text-sm text-muted-foreground'>
          {t('edu.kiemTra.passMark', { percent: bai.diemDat })}
        </span>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => url.set({ tab: String(value) })}
      >
        <TabsList>
          <TabsTrigger value='nhap-diem'>
            {t('edu.kiemTra.tab.marks')}
          </TabsTrigger>
          <TabsTrigger value='ket-qua'>
            {t('edu.kiemTra.tab.results')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='nhap-diem' className='pt-4'>
          <MarkGrid detail={detail} canEdit={canManage} onSaved={onChanged} />
        </TabsContent>
        <TabsContent value='ket-qua' className='pt-4'>
          <Results detail={detail} onChanged={onChanged} />
        </TabsContent>
      </Tabs>
      {editing ? (
        <TestFormDialog
          initial={{ bai, kyNang: detail.kyNang }}
          onClose={() => setEditing(false)}
          onSaved={() => onChanged()}
        />
      ) : null}
      {closing ? (
        <FormDialog
          open
          title={t('edu.kiemTra.close.title')}
          description={t('edu.kiemTra.close.hint')}
          submitLabel={t('edu.kiemTra.close.submit')}
          onClose={() => setClosing(false)}
          onSubmit={async () => {
            await post(api, '/kiemTra/chot', { id: bai.id });
            url.set({ tab: 'ket-qua' });
            onChanged();
          }}
        >
          <p className='text-sm' role='status'>
            {t('edu.kiemTra.close.counts', { count: marked })}
            {missing > 0
              ? ` ${t('edu.kiemTra.close.missing', { count: missing })}`
              : ''}
          </p>
        </FormDialog>
      ) : null}
    </PageContainer>
  );
}
