import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';

import {
  text,
  useRequest,
  useRows,
  type Loaded,
  type Result,
  type Row,
} from '../kit.js';
import { RowsTable } from '../list-page.js';
import { formatVnd } from '../tien.js';

interface LowRow {
  readonly id: number;
  readonly ma: string;
  readonly hoTen: string;
  readonly lopId: number | null;
  readonly soBuoiConLai: number;
}

interface DebtReport {
  readonly rows: readonly {
    readonly hocVienId: number;
    readonly ma: string;
    readonly hoTen: string;
    readonly lop: string;
    readonly soGoiNo: number;
    readonly conNo: number;
    readonly noTuNgay: string;
  }[];
}

function loadedOf<T>(
  result: Result<T>,
  rows: (data: T) => readonly object[],
): Loaded<Row> {
  if (result.state === 'ready')
    return {
      state: 'ready',
      rows: rows(result.data).map((row, index) => ({
        ...(row as Record<string, unknown>),
        id: Number((row as { id?: unknown }).id ?? index),
      })),
    };
  return result.state === 'error' ? { state: 'error' } : { state: 'loading' };
}

/**
 * Who to collect from: active students whose sessions ran out or are about to (`/soDu/canhBao`), and students with a
 * package that is not paid in full (the `congNo` report, for a person who sees both packages and payments). Both lists
 * are the server's; the page opens the cashier on the student.
 */
export function DueLists(props: {
  readonly onSelect: (hocVienId: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  const canPayments = useCan({
    resource: { type: 'composite', id: 'edu.thanhToan' },
    action: 'view',
  }).can;
  const canPackages = useCan({
    resource: { type: 'composite', id: 'edu.goiHoc' },
    action: 'view',
  }).can;
  const showDebt = canPayments && canPackages;
  const low = useRequest<readonly LowRow[]>('/soDu/canhBao', {});
  const debt = useRequest<DebtReport>(
    '/baoCao/xem',
    { loai: 'congNo' },
    { enabled: showDebt },
  );
  const classes = useRows('lop').loaded;
  const className = (lopId: unknown): string =>
    classes.state === 'ready'
      ? text(classes.rows.find((row) => row.id === lopId)?.ten)
      : '';
  const open = (hocVienId: number): ReactElement => (
    <Button
      size='sm'
      variant='outline'
      onClick={() => props.onSelect(hocVienId)}
    >
      {t('edu.hocPhi.open')}
    </Button>
  );
  return (
    <div className='flex flex-col gap-8'>
      <section className='flex flex-col gap-2'>
        <div>
          <h2 className='text-base font-semibold'>
            {t('edu.hocPhi.lowTitle')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('edu.hocPhi.lowHint')}
          </p>
        </div>
        <RowsTable
          loaded={loadedOf(low.result, (rows) => rows)}
          onRetry={low.reload}
          emptyTitle={t('edu.hocPhi.lowNone')}
          emptyHint={t('edu.hocPhi.lowNoneHint')}
          columns={[
            {
              key: 'ma',
              label: t('edu.hocVien.ma'),
              render: (row) => (
                <span className='font-mono text-xs'>{text(row.ma)}</span>
              ),
            },
            {
              key: 'hoTen',
              label: t('edu.hocVien.hoTen'),
              render: (row) => (
                <RecordLink to={`/hoc-vien/${row.id}`}>
                  {text(row.hoTen)}
                </RecordLink>
              ),
            },
            {
              key: 'lop',
              label: t('edu.hocPhi.class'),
              render: (row) => className(row.lopId),
            },
            {
              key: 'soBuoiConLai',
              label: t('edu.diemDanh.balance'),
              render: (row) => {
                const balance = Number(row.soBuoiConLai);
                return (
                  <StatusBadge tone='warning'>
                    {balance < 0
                      ? t('edu.hocPhi.balanceOut', { count: -balance })
                      : balance === 0
                        ? t('edu.hocPhi.balanceZero')
                        : t('edu.home.sessionsLeft', { count: balance })}
                  </StatusBadge>
                );
              },
            },
          ]}
          rowActions={(row) => open(row.id)}
        />
      </section>

      {showDebt ? (
        <section className='flex flex-col gap-2'>
          <div>
            <h2 className='text-base font-semibold'>
              {t('edu.hocPhi.debtTitle')}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {t('edu.hocPhi.debtHint')}
            </p>
          </div>
          <RowsTable
            loaded={loadedOf(debt.result, (data) =>
              data.rows.map((row) => ({ ...row, id: row.hocVienId })),
            )}
            onRetry={debt.reload}
            emptyTitle={t('edu.hocPhi.debtNone')}
            emptyHint={t('edu.hocPhi.debtNoneHint')}
            columns={[
              {
                key: 'ma',
                label: t('edu.hocVien.ma'),
                render: (row) => (
                  <span className='font-mono text-xs'>{text(row.ma)}</span>
                ),
              },
              {
                key: 'hoTen',
                label: t('edu.hocVien.hoTen'),
                render: (row) => (
                  <RecordLink to={`/hoc-vien/${row.id}`}>
                    {text(row.hoTen)}
                  </RecordLink>
                ),
              },
              { key: 'lop', label: t('edu.hocPhi.class') },
              { key: 'soGoiNo', label: t('edu.hocPhi.debtPackages') },
              {
                key: 'conNo',
                label: t('edu.hocPhi.owed'),
                render: (row) => (
                  <StatusBadge tone='warning'>
                    {formatVnd(row.conNo)}
                  </StatusBadge>
                ),
              },
              { key: 'noTuNgay', label: t('edu.hocPhi.debtSince') },
            ]}
            rowActions={(row) => open(row.id)}
          />
        </section>
      ) : null}
    </div>
  );
}
