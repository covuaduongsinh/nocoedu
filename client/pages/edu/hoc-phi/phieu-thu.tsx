import { resolveAssetUrl, usePageBreadcrumb } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Printer } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { PrintArea } from '#components/print-area';
import { Button } from '#components/ui/button';

import { useRequest } from '../kit.js';
import { amountInWords, formatVnd } from '../tien.js';

interface Receipt {
  readonly id: number;
  readonly soPhieu: string | null;
  readonly ngay: string;
  readonly soTien: number;
  readonly hinhThuc: string;
  readonly noiDungCk: string | null;
  readonly nguoiThu: string | null;
  readonly coSo: {
    readonly ten: string;
    readonly diaChi: string | null;
  } | null;
  readonly hocVien: {
    readonly ma: string;
    readonly hoTen: string;
    readonly lop: string | null;
  } | null;
  readonly goiHoc: {
    readonly soBuoi: number;
    readonly thanhTien: number;
    readonly ngayMua: string;
    readonly daThu: number;
    readonly conNo: number;
  } | null;
}

/** `2026-11-16` as the club writes a day: `16/11/2026`. */
const dayVn = (value: string): string => {
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

function Line(props: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex gap-3 py-1.5'>
      <dt className='w-36 shrink-0 text-muted-foreground'>{props.label}</dt>
      <dd className='min-w-0 flex-1 font-medium'>{props.children}</dd>
    </div>
  );
}

/**
 * The receipt of one payment, laid out for paper: the page shows it as it prints, and printing sends the receipt
 * alone (`PrintArea`). Everything on it comes from `/thanhToan/phieuThu`, which answers through the caller's payment
 * policy; a payment outside the scope is "not found" here.
 */
export default function PhieuThuPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams();
  const { result, reload } = useRequest<Receipt>('/thanhToan/phieuThu', {
    thanhToanId: Number(params.id),
  });
  const receipt = result.state === 'ready' ? result.data : undefined;
  usePageBreadcrumb([
    { label: t('edu.nav.hocPhi'), to: '/hoc-phi' },
    { label: receipt?.soPhieu ?? t('edu.phieuThu.detail') },
  ]);

  if (result.state === 'loading')
    return (
      <PageContainer className='mx-auto max-w-3xl'>
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      </PageContainer>
    );
  if (!receipt) {
    const missing =
      result.state === 'error' && (result.forbidden || result.notFound);
    return (
      <PageContainer className='mx-auto max-w-3xl'>
        {missing ? (
          <PageHeader
            title={t('edu.phieuThu.notFound')}
            description={t('edu.phieuThu.notFoundHint')}
          />
        ) : (
          <div role='alert' className='flex flex-col items-start gap-3'>
            <p className='text-sm text-destructive'>
              {t('edu.common.loadError')}
            </p>
            <Button variant='outline' onClick={reload}>
              {t('edu.common.retry')}
            </Button>
          </div>
        )}
      </PageContainer>
    );
  }

  const method =
    receipt.hinhThuc === 'tien_mat'
      ? t('edu.hocPhi.cash')
      : receipt.hinhThuc === 'chuyen_khoan'
        ? t('edu.hocPhi.transfer')
        : receipt.hinhThuc;
  const currency = t('edu.phieuThu.currency');
  return (
    <PageContainer className='mx-auto max-w-3xl'>
      <PageHeader
        title={t('edu.phieuThu.title')}
        description={receipt.soPhieu ?? undefined}
        actions={
          <Button onClick={() => window.print()}>
            <Printer />
            {t('edu.phieuThu.print')}
          </Button>
        }
      />
      <PrintArea className='rounded-xl border bg-card p-6 text-sm text-card-foreground sm:p-8'>
        <header className='flex items-start justify-between gap-4 border-b-2 border-primary pb-4'>
          <div className='flex min-w-0 items-start gap-4'>
            <img
              src={resolveAssetUrl('/assets/logo-mark.png')}
              alt=''
              className='h-16 w-auto shrink-0'
            />
            <div className='min-w-0'>
              <p className='text-xl font-bold tracking-tight text-primary uppercase'>
                {t('edu.phieuThu.org')}
              </p>
              <p className='mt-0.5 inline-block border-b-2 border-(--brand-gold) pb-0.5 text-xs font-medium text-muted-foreground'>
                {t('edu.phieuThu.slogan')}
              </p>
              {receipt.coSo ? (
                <p className='mt-2 text-xs text-muted-foreground'>
                  {receipt.coSo.ten}
                  {receipt.coSo.diaChi ? ` · ${receipt.coSo.diaChi}` : ''}
                </p>
              ) : null}
              <p className='mt-1 text-xs text-muted-foreground'>
                {t('edu.phieuThu.hotline')}
              </p>
            </div>
          </div>
          <div className='shrink-0 text-right'>
            <p className='text-xs text-muted-foreground'>
              {t('edu.phieuThu.number')}
            </p>
            <p className='font-mono text-sm font-semibold'>
              {receipt.soPhieu ?? '—'}
            </p>
            <p className='mt-1 text-xs text-muted-foreground'>
              {t('edu.phieuThu.date')}: {dayVn(receipt.ngay)}
            </p>
          </div>
        </header>

        <h2 className='mt-6 text-center text-lg font-bold tracking-wide text-primary uppercase'>
          {t('edu.phieuThu.title')}
        </h2>

        <dl className='mt-4'>
          <Line label={t('edu.phieuThu.student')}>
            {receipt.hocVien?.hoTen ?? ''}
          </Line>
          <Line label={t('edu.phieuThu.code')}>
            <span className='font-mono'>{receipt.hocVien?.ma ?? ''}</span>
          </Line>
          {receipt.hocVien?.lop ? (
            <Line label={t('edu.phieuThu.class')}>{receipt.hocVien.lop}</Line>
          ) : null}
          <Line label={t('edu.phieuThu.reason')}>
            {receipt.goiHoc
              ? t('edu.phieuThu.reasonPackage', {
                  count: receipt.goiHoc.soBuoi,
                  day: dayVn(receipt.goiHoc.ngayMua),
                })
              : t('edu.phieuThu.reasonOther')}
          </Line>
          <Line label={t('edu.phieuThu.amount')}>
            <span className='text-base font-bold'>
              {formatVnd(receipt.soTien)} {currency}
            </span>
          </Line>
          <Line label={t('edu.phieuThu.inWords')}>
            <span className='italic'>{amountInWords(receipt.soTien)}</span>
          </Line>
          <Line label={t('edu.phieuThu.method')}>{method}</Line>
          {receipt.noiDungCk ? (
            <Line label={t('edu.phieuThu.note')}>{receipt.noiDungCk}</Line>
          ) : null}
        </dl>

        {receipt.goiHoc ? (
          <dl className='mt-4 grid grid-cols-3 gap-3 rounded-lg border p-3 text-center'>
            <div>
              <dt className='text-xs text-muted-foreground'>
                {t('edu.phieuThu.packageTotal')}
              </dt>
              <dd className='font-semibold'>
                {formatVnd(receipt.goiHoc.thanhTien)}
              </dd>
            </div>
            <div>
              <dt className='text-xs text-muted-foreground'>
                {t('edu.phieuThu.paidSoFar')}
              </dt>
              <dd className='font-semibold'>
                {formatVnd(receipt.goiHoc.daThu)}
              </dd>
            </div>
            <div>
              <dt className='text-xs text-muted-foreground'>
                {t('edu.phieuThu.stillOwed')}
              </dt>
              <dd className='font-semibold'>
                {formatVnd(receipt.goiHoc.conNo)}
              </dd>
            </div>
          </dl>
        ) : null}

        <div className='mt-8 grid grid-cols-2 gap-6 text-center'>
          <div>
            <p className='font-semibold'>{t('edu.phieuThu.payer')}</p>
            <p className='text-xs text-muted-foreground'>
              {t('edu.phieuThu.signHint')}
            </p>
            <div className='h-20' />
          </div>
          <div>
            <p className='font-semibold'>{t('edu.phieuThu.collector')}</p>
            <p className='text-xs text-muted-foreground'>
              {t('edu.phieuThu.signHint')}
            </p>
            <div className='h-20' />
            <p className='font-medium'>{receipt.nguoiThu ?? ''}</p>
          </div>
        </div>
      </PrintArea>
    </PageContainer>
  );
}
