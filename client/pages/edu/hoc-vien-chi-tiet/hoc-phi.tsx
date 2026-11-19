import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { StatusBadge } from '#components/status-badge';
import { buttonVariants } from '#components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { formatDay, formatMoney } from '../format.js';
import { text, usePagedRows } from '../kit.js';
import { RowsTable } from '../list-page.js';
import type { Payment, Term } from './types.js';
import { termLabel } from './terms.js';

const signed = (value: unknown): string =>
  Number(value) > 0 ? `+${Number(value)}` : String(Number(value));

/**
 * The terms the student paid for, with the sessions allocated to each (first in, first out, as the server worked it out),
 * and below them the balance history. A term opens its sessions on the "Sessions" tab, filtered to it.
 */
export function Tuition(props: {
  readonly terms: readonly Term[];
  readonly payments: readonly Payment[];
  readonly studentId: number;
  readonly sessionsLink: (kySo: number) => string;
  readonly canSeeSessions: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-8'>
      <section className='flex flex-col gap-3'>
        <h2 className='text-base font-semibold'>{t('edu.hoSo.termsTitle')}</h2>
        {props.terms.length === 0 ? (
          <div className='rounded-lg border border-dashed p-6 text-center'>
            <p className='text-sm font-medium'>{t('edu.hocVien.noPackages')}</p>
            <p className='text-sm text-muted-foreground'>
              {t('edu.hocVien.noPackagesHint')}
            </p>
          </div>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('edu.hoSo.col.ky')}</TableHead>
                  <TableHead>{t('edu.hocVien.ngayMua')}</TableHead>
                  <TableHead className='text-right'>
                    {t('edu.hocPhi.sessions')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('edu.hoSo.col.daDung')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('edu.hocVien.thanhTien')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('edu.hoSo.col.daNop')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('edu.hoSo.col.conNo')}
                  </TableHead>
                  <TableHead>{t('edu.hocVien.trangThai')}</TableHead>
                  {props.canSeeSessions ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.terms.map((term) => {
                  const unknown = term.chuaRoTien === true;
                  const paid =
                    !unknown && (term.goiHocId === null || term.conNo === 0);
                  const money = (value: number) =>
                    unknown ? t('edu.hoSo.chuaRoTien') : formatMoney(value);
                  return (
                    <TableRow key={term.kySo}>
                      <TableCell className='font-medium'>
                        {termLabel(t, term)}
                      </TableCell>
                      <TableCell>{formatDay(term.ngayMua)}</TableCell>
                      <TableCell className='text-right'>
                        {term.soBuoi}
                      </TableCell>
                      <TableCell className='text-right'>
                        {term.daDung} / {term.soBuoi}
                      </TableCell>
                      <TableCell className='text-right'>
                        {money(term.thanhTien)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatMoney(term.daThanhToan)}
                      </TableCell>
                      <TableCell
                        className={
                          term.conNo > 0
                            ? 'text-right text-destructive'
                            : 'text-right'
                        }
                      >
                        {money(term.conNo)}
                      </TableCell>
                      <TableCell>
                        {term.goiHocId === null ? null : (
                          <StatusBadge
                            tone={
                              unknown
                                ? 'neutral'
                                : paid
                                  ? 'success'
                                  : term.daThanhToan > 0
                                    ? 'warning'
                                    : 'neutral'
                            }
                            size='sm'
                          >
                            {unknown
                              ? t('edu.hoSo.pay.unknown')
                              : paid
                                ? t('edu.hoSo.pay.paid')
                                : term.daThanhToan > 0
                                  ? t('edu.hoSo.pay.partial')
                                  : t('edu.hoSo.pay.none')}
                          </StatusBadge>
                        )}
                      </TableCell>
                      {props.canSeeSessions ? (
                        <TableCell className='text-right'>
                          <Link
                            to={props.sessionsLink(term.kySo)}
                            className={buttonVariants({
                              variant: 'outline',
                              size: 'sm',
                            })}
                          >
                            {t('edu.hoSo.viewSessions')}
                          </Link>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <Payments payments={props.payments} />
      <Ledger studentId={props.studentId} />
    </div>
  );
}

/** Every payment of the student with the term it pays for; a payment Lark could not place says "no term". */
function Payments({
  payments,
}: {
  readonly payments: readonly Payment[];
}): ReactElement {
  const { t } = useTranslation();
  const method = (value: string) =>
    value === 'chuyen_khoan'
      ? t('edu.hocPhi.transfer')
      : value === 'tien_mat'
        ? t('edu.hocPhi.cash')
        : t('edu.hoSo.hinhThucKhongRo');
  return (
    <section className='flex flex-col gap-3'>
      <h2 className='text-base font-semibold'>{t('edu.hoSo.paymentsTitle')}</h2>
      {payments.length === 0 ? (
        <div className='rounded-lg border border-dashed p-6 text-center'>
          <p className='text-sm text-muted-foreground'>
            {t('edu.hoSo.paymentsEmpty')}
          </p>
        </div>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('edu.hocVien.ngay')}</TableHead>
                <TableHead className='text-right'>
                  {t('edu.hoSo.col.soTien')}
                </TableHead>
                <TableHead>{t('edu.hoSo.col.hinhThuc')}</TableHead>
                <TableHead>{t('edu.hoSo.col.ky')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{formatDay(payment.ngay)}</TableCell>
                  <TableCell className='text-right'>
                    {formatMoney(payment.soTien)}
                  </TableCell>
                  <TableCell>{method(payment.hinhThuc)}</TableCell>
                  <TableCell>
                    {payment.kySo === null ? (
                      <span className='text-muted-foreground'>
                        {t('edu.hoSo.payNoTerm')}
                      </span>
                    ) : (
                      t('edu.hoSo.kyShort', { n: payment.kySo })
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function Ledger({ studentId }: { readonly studentId: number }): ReactElement {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const ledger = usePagedRows('soDuNhatKy', {
    page,
    where: { hocVienId: studentId },
    descending: true,
  });
  return (
    <section className='flex flex-col gap-3'>
      <h2 className='text-base font-semibold'>{t('edu.hocVien.tab.ledger')}</h2>
      <RowsTable
        loaded={ledger.loaded}
        onRetry={ledger.reload}
        emptyTitle={t('edu.hocPhi.ledgerEmpty')}
        emptyHint={t('edu.hocVien.noLedgerHint')}
        paging={{ page, total: ledger.total, onPage: setPage }}
        columns={[
          {
            key: 'createdAt',
            label: t('edu.hocVien.ngay'),
            render: (row) => formatDay(row.createdAt),
          },
          {
            key: 'thayDoi',
            label: t('edu.hocVien.thayDoi'),
            render: (row) => signed(row.thayDoi),
          },
          {
            key: 'soDuSau',
            label: t('edu.hocVien.soDuSau'),
            render: (row) => text(row.soDuSau),
          },
          {
            key: 'lyDo',
            label: t('edu.hocVien.lyDo'),
            render: (row) =>
              t(`edu.hocPhi.reason.${text(row.lyDo)}`, {
                defaultValue: text(row.lyDo),
              }),
          },
          {
            key: 'ghiChu',
            label: t('edu.hocVien.ghiChuSo'),
            render: (row) => text(row.ghiChu),
          },
        ]}
      />
    </section>
  );
}
