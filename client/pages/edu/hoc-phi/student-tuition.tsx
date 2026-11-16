import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Printer, QrCode, SlidersHorizontal, Wallet } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { StatusBadge } from '#components/status-badge';
import { Button, buttonVariants } from '#components/ui/button';

import { text, useRequest, type Loaded, type Row } from '../kit.js';
import { RowsTable } from '../list-page.js';
import { formatVnd } from '../tien.js';

import {
  AdjustDialog,
  PayDialog,
  QrDialog,
  SellDialog,
  type PackageRow,
  type StudentPackages,
  type StudentRef,
} from './dialogs.js';

type Opened =
  | { readonly kind: 'sell' }
  | { readonly kind: 'adjust' }
  | { readonly kind: 'pay'; readonly pack: PackageRow }
  | { readonly kind: 'qr'; readonly goiHocId: number };

type Notice =
  | { readonly kind: 'paid'; readonly id: number; readonly text: string }
  | { readonly kind: 'text'; readonly text: string };

const receiptPath = (id: number): string => `/hoc-phi/phieu-thu/${id}`;

function useCanDo(id: string, action: string): boolean {
  return useCan({ resource: { type: 'composite', id }, action }).can;
}

/**
 * The tuition of one student: their packages with what was paid and what is owed, the payments with their receipts,
 * and the actions the person holds (sell a package, take a payment, show the VietQR code, set the balance by hand).
 * Amounts come from `/goiHoc/cuaHocVien`; nothing is added up here. The tuition page and the student's file both
 * render it. `onChanged` tells the owner that the balance moved, so it reads the student again.
 */
export function StudentTuition(props: {
  readonly student: Row;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const student: StudentRef = {
    id: props.student.id,
    hoTen: text(props.student.hoTen),
    soBuoiConLai: Number(props.student.soBuoiConLai) || 0,
  };
  const canSell = useCanDo('edu.goiHoc', 'manage');
  const canPay = useCanDo('edu.thanhToan', 'manage');
  const canAdjust = useCanDo('edu.soDu', 'adjust');
  const { result, reload } = useRequest<StudentPackages>('/goiHoc/cuaHocVien', {
    hocVienId: student.id,
  });
  const [opened, setOpened] = useState<Opened>();
  const [notice, setNotice] = useState<Notice>();
  const packs = result.state === 'ready' ? result.data.goi : [];
  const payments = result.state === 'ready' ? result.data.thanhToan : null;
  const changed = (next: Notice): void => {
    setNotice(next);
    reload();
    props.onChanged();
  };
  const asLoaded = (rows: readonly object[]): Loaded<Row> =>
    result.state === 'ready'
      ? { state: 'ready', rows: rows as readonly Row[] }
      : result.state === 'error'
        ? { state: 'error' }
        : { state: 'loading' };
  const method = (value: unknown): string =>
    value === 'tien_mat'
      ? t('edu.hocPhi.cash')
      : value === 'chuyen_khoan'
        ? t('edu.hocPhi.transfer')
        : text(value);

  return (
    <div className='flex flex-col gap-6'>
      {canSell || canAdjust ? (
        <div className='flex flex-wrap items-center gap-2'>
          {canSell ? (
            <Button size='sm' onClick={() => setOpened({ kind: 'sell' })}>
              <Wallet />
              {t('edu.hocPhi.sell')}
            </Button>
          ) : null}
          {canAdjust ? (
            <Button
              size='sm'
              variant='outline'
              onClick={() => setOpened({ kind: 'adjust' })}
            >
              <SlidersHorizontal />
              {t('edu.soDu.adjust')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <p
          role='status'
          className='flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-(--status-success)/20 bg-(--status-success-background) px-3 py-2 text-sm text-(--status-success)'
        >
          <span>{notice.text}</span>
          {notice.kind === 'paid' ? (
            <Link
              to={receiptPath(notice.id)}
              className='inline-flex items-center gap-1 font-medium underline underline-offset-2'
            >
              <Printer className='size-3.5' />
              {t('edu.hocPhi.print')}
            </Link>
          ) : null}
        </p>
      ) : null}

      <section className='flex flex-col gap-2'>
        <h3 className='text-sm font-medium'>{t('edu.hocPhi.packages')}</h3>
        <RowsTable
          loaded={asLoaded(packs)}
          onRetry={reload}
          emptyTitle={t('edu.hocPhi.noPackages')}
          emptyHint={t('edu.hocPhi.noPackagesHint')}
          columns={[
            { key: 'ngayMua', label: t('edu.hocPhi.boughtOn') },
            { key: 'soBuoi', label: t('edu.hocPhi.sessions') },
            {
              key: 'thanhTien',
              label: t('edu.hocPhi.packageTotal'),
              render: (row) => formatVnd(row.thanhTien),
            },
            ...(payments === null
              ? []
              : [
                  {
                    key: 'daThu',
                    label: t('edu.hocPhi.paid'),
                    render: (row: Row) => formatVnd(row.daThu),
                  },
                  {
                    key: 'conNo',
                    label: t('edu.hocPhi.owed'),
                    render: (row: Row) =>
                      Number(row.conNo) > 0 ? (
                        <StatusBadge tone='warning'>
                          {formatVnd(row.conNo)}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone='success'>
                          {t('edu.hocPhi.paidUp')}
                        </StatusBadge>
                      ),
                  },
                ]),
          ]}
          rowActions={(row) => {
            const pack = row as unknown as PackageRow;
            // Without the paid amounts nobody knows what is owed; the code and the payment need them.
            if (pack.conNo === null || pack.conNo <= 0) return null;
            return (
              <div className='flex flex-wrap gap-2'>
                {canPay ? (
                  <Button
                    size='sm'
                    onClick={() => setOpened({ kind: 'pay', pack })}
                  >
                    {t('edu.hocPhi.collect')}
                  </Button>
                ) : null}
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => setOpened({ kind: 'qr', goiHocId: pack.id })}
                >
                  <QrCode />
                  {t('edu.hocPhi.qr')}
                </Button>
              </div>
            );
          }}
        />
      </section>

      {payments === null ? null : (
        <section className='flex flex-col gap-2'>
          <h3 className='text-sm font-medium'>{t('edu.hocPhi.payments')}</h3>
          <RowsTable
            loaded={asLoaded(payments)}
            onRetry={reload}
            emptyTitle={t('edu.hocPhi.noPayments')}
            emptyHint={t('edu.hocPhi.noPaymentsHint')}
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
              { key: 'ngay', label: t('edu.hocPhi.day') },
              {
                key: 'soTien',
                label: t('edu.hocPhi.money'),
                render: (row) => formatVnd(row.soTien),
              },
              {
                key: 'hinhThuc',
                label: t('edu.hocPhi.method'),
                render: (row) => method(row.hinhThuc),
              },
              {
                key: 'noiDungCk',
                label: t('edu.hocPhi.note'),
                render: (row) => text(row.noiDungCk),
              },
            ]}
            rowActions={(row) => (
              <Link
                to={receiptPath(row.id)}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Printer />
                {t('edu.hocPhi.print')}
              </Link>
            )}
          />
        </section>
      )}

      {opened?.kind === 'sell' ? (
        <SellDialog
          student={student}
          {...(packs[0] && packs[0].donGia > 0
            ? { lastPrice: packs[0].donGia }
            : {})}
          onClose={() => setOpened(undefined)}
          onDone={(sold) =>
            changed({
              kind: 'text',
              text: t('edu.hocPhi.sold', {
                count: sold.soBuoi,
                balance: sold.soBuoiConLai,
              }),
            })
          }
        />
      ) : null}
      {opened?.kind === 'pay' ? (
        <PayDialog
          student={student}
          pack={opened.pack}
          onClose={() => setOpened(undefined)}
          onDone={(paid) =>
            changed({
              kind: 'paid',
              id: paid.id,
              text: t('edu.hocPhi.recorded', {
                amount: formatVnd(paid.soTien),
                receipt: paid.soPhieu,
              }),
            })
          }
        />
      ) : null}
      {opened?.kind === 'qr' ? (
        <QrDialog
          goiHocId={opened.goiHocId}
          onClose={() => setOpened(undefined)}
        />
      ) : null}
      {opened?.kind === 'adjust' ? (
        <AdjustDialog
          student={student}
          onClose={() => setOpened(undefined)}
          onDone={(balance) =>
            changed({
              kind: 'text',
              text: t('edu.soDu.adjusted', { balance }),
            })
          }
        />
      ) : null}
    </div>
  );
}
