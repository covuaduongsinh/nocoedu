import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Download } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';

import { GenericImportDialog } from '../generic-import-dialog.js';
import { downloadReport, todayVn, useErrorMessage } from '../kit.js';

import { Cashier } from './cashier.js';
import { DueLists } from './due.js';
import { PaymentLedger } from './ledger.js';

const TABS = ['thu', 'so-thu', 'can-thu'] as const;
type Tab = (typeof TABS)[number];

/**
 * Tuition per session, in three views: the cashier (find a student, sell a package, take a payment, print the
 * receipt), the payments book of a month, and who to collect from. The view and the open student live in the address
 * (`?tab=`, `?hocVien=`), so other pages link straight to a student's tuition. Balances and amounts are the server's.
 */
export default function HocPhiPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const [params, setParams] = useSearchParams();
  const canExport = useCan({
    resource: { type: 'composite', id: 'edu.baoCao' },
    action: 'export',
  }).can;
  const canPayments = useCan({
    resource: { type: 'composite', id: 'edu.thanhToan' },
    action: 'view',
  }).can;
  const [exportError, setExportError] = useState<string>();

  const wanted = params.get('tab');
  const tab: Tab =
    wanted === 'so-thu' && canPayments
      ? 'so-thu'
      : wanted === 'can-thu'
        ? 'can-thu'
        : 'thu';
  const hocVienId = Number(params.get('hocVien'));
  const selected =
    Number.isSafeInteger(hocVienId) && hocVienId > 0 ? hocVienId : undefined;

  const show = (next: Tab, student?: number): void => {
    const query = new URLSearchParams();
    if (next !== 'thu') query.set('tab', next);
    if (student !== undefined) query.set('hocVien', String(student));
    setParams(query);
  };

  const exportCsv = async (): Promise<void> => {
    setExportError(undefined);
    try {
      await downloadReport(
        api,
        { loai: 'goiHocChiTiet' },
        `hoc-phi-${todayVn()}.csv`,
      );
    } catch (cause) {
      setExportError(message(cause));
    }
  };

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('edu.hocPhi.title')}
        description={t('edu.hocPhi.pageHint')}
        actions={
          <>
            <GenericImportDialog entity='goiHoc' variant='outline' />
            {canExport ? (
              <Button
                variant='outline'
                size='sm'
                onClick={() => void exportCsv()}
              >
                <Download />
                {t('edu.hocPhi.exportCsv')}
              </Button>
            ) : null}
          </>
        }
      />
      {exportError ? (
        <p role='alert' className='text-sm text-destructive'>
          {exportError}
        </p>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = TABS.find((entry) => entry === value);
          if (next) show(next);
        }}
      >
        <TabsList>
          <TabsTrigger value='thu'>{t('edu.hocPhi.tab.cashier')}</TabsTrigger>
          {canPayments ? (
            <TabsTrigger value='so-thu'>
              {t('edu.hocPhi.tab.ledger')}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value='can-thu'>{t('edu.hocPhi.tab.due')}</TabsTrigger>
        </TabsList>
        <TabsContent value='thu' className='pt-4'>
          <Cashier
            hocVienId={selected}
            initialSearch={params.get('search') ?? ''}
            onSelect={(student) => show('thu', student)}
          />
        </TabsContent>
        {canPayments ? (
          <TabsContent value='so-thu' className='pt-4'>
            <PaymentLedger />
          </TabsContent>
        ) : null}
        <TabsContent value='can-thu' className='pt-4'>
          <DueLists onSelect={(student) => show('thu', student)} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
