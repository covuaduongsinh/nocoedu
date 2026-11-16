import { useTranslation } from '@nocobase/i18n/client';
import { Printer } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { RecordLink } from '#components/record-link';
import { buttonVariants } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';

import { MetricCard } from '../edu-ui-parts.js';
import {
  text,
  todayVn,
  usePagedRows,
  useRequest,
  useRowsByIds,
} from '../kit.js';
import { RowsTable } from '../list-page.js';
import { formatVnd } from '../tien.js';

interface RevenueReport {
  readonly rows: readonly {
    readonly doanhThu: number;
    readonly tienMat: number;
    readonly chuyenKhoan: number;
  }[];
}

/**
 * The payments of one month, newest first, read page by page through the payments policy. The totals above come from
 * the revenue report of that month, so they are the server's sums over every payment the person may see, not a sum
 * of the page on screen.
 */
export function PaymentLedger(): ReactElement {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => todayVn().slice(0, 7));
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);
  const validMonth = /^\d{4}-\d{2}$/u.test(month);
  const payments = usePagedRows('thanhToan', {
    page,
    descending: true,
    where: {
      ...(validMonth ? { thang: month } : {}),
      ...(method ? { hinhThuc: method } : {}),
    },
  });
  const rows = payments.loaded.state === 'ready' ? payments.loaded.rows : [];
  const students = useRowsByIds(
    'hocVien',
    rows.map((row) => Number(row.hocVienId)),
  );
  const revenue = useRequest<RevenueReport>(
    '/baoCao/xem',
    { loai: 'doanhThu', tuThang: month, denThang: month },
    { enabled: validMonth },
  );
  const totals = (
    revenue.result.state === 'ready' ? revenue.result.data : revenue.lastData
  )?.rows.reduce(
    (sum, row) => ({
      all: sum.all + Number(row.doanhThu),
      cash: sum.cash + Number(row.tienMat),
      transfer: sum.transfer + Number(row.chuyenKhoan),
    }),
    { all: 0, cash: 0, transfer: 0 },
  );
  const methodLabel = (value: unknown): string =>
    value === 'tien_mat'
      ? t('edu.hocPhi.cash')
      : value === 'chuyen_khoan'
        ? t('edu.hocPhi.transfer')
        : text(value);
  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-end gap-3'>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='so-thu-thang'>{t('edu.hocPhi.month')}</Label>
          <Input
            id='so-thu-thang'
            type='month'
            value={month}
            className='w-44'
            onChange={(event) => {
              setMonth(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='so-thu-hinh-thuc'>{t('edu.hocPhi.method')}</Label>
          <select
            id='so-thu-hinh-thuc'
            value={method}
            onChange={(event) => {
              setMethod(event.target.value);
              setPage(1);
            }}
            className='h-8 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm'
          >
            <option value=''>{t('edu.hocPhi.allMethods')}</option>
            <option value='tien_mat'>{t('edu.hocPhi.cash')}</option>
            <option value='chuyen_khoan'>{t('edu.hocPhi.transfer')}</option>
          </select>
        </div>
      </div>

      {totals ? (
        <div className='grid gap-3 sm:grid-cols-3'>
          <MetricCard
            title={t('edu.hocPhi.monthTotal')}
            value={formatVnd(totals.all)}
            tone='primary'
          />
          <MetricCard
            title={t('edu.hocPhi.cash')}
            value={formatVnd(totals.cash)}
          />
          <MetricCard
            title={t('edu.hocPhi.transfer')}
            value={formatVnd(totals.transfer)}
          />
        </div>
      ) : null}

      <RowsTable
        loaded={payments.loaded}
        onRetry={payments.reload}
        emptyTitle={t('edu.hocPhi.ledgerNone')}
        emptyHint={t('edu.hocPhi.ledgerNoneHint')}
        paging={{ page, total: payments.total, onPage: setPage }}
        columns={[
          {
            key: 'soPhieu',
            label: t('edu.hocPhi.receiptNo'),
            render: (row) => (
              <span className='font-mono text-xs'>
                {text(row.soPhieu) || '—'}
              </span>
            ),
          },
          {
            key: 'ngay',
            label: t('edu.hocPhi.day'),
            render: (row) => text(row.ngay).slice(0, 10),
          },
          {
            key: 'hocVien',
            label: t('edu.hocPhi.student'),
            render: (row) => {
              const student = students.get(Number(row.hocVienId));
              return student ? (
                <RecordLink to={`/hoc-vien/${student.id}`}>
                  {text(student.hoTen)}
                </RecordLink>
              ) : (
                ''
              );
            },
          },
          {
            key: 'soTien',
            label: t('edu.hocPhi.money'),
            render: (row) => formatVnd(row.soTien),
          },
          {
            key: 'hinhThuc',
            label: t('edu.hocPhi.method'),
            render: (row) => methodLabel(row.hinhThuc),
          },
          {
            key: 'noiDungCk',
            label: t('edu.hocPhi.note'),
            render: (row) => text(row.noiDungCk),
          },
        ]}
        rowActions={(row) => (
          <Link
            to={`/hoc-phi/phieu-thu/${row.id}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Printer />
            {t('edu.hocPhi.print')}
          </Link>
        )}
      />
    </div>
  );
}
