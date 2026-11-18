import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import { formatDay, formatMoney } from '../format.js';
import { text, usePagedRows, useRowsByIds } from '../kit.js';
import { RowsTable } from '../list-page.js';
import type { Profile } from './types.js';

/**
 * The books of the student: the fund (money paid for books against books handed out), the handout history, both from the
 * student file, and the books they are learning or have finished (`sachHoc`, a record API of its own).
 */
export function BooksAndFund(props: {
  readonly sach: Profile['sach'];
  readonly studentId: number;
  readonly canSeeLearning: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { sach } = props;
  return (
    <div className='flex flex-col gap-6'>
      {sach ? (
        <>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
            <Figure
              label={t('edu.quySach.daNop')}
              value={formatMoney(sach.daNop)}
            />
            <Figure
              label={t('edu.quySach.daPhat')}
              value={formatMoney(sach.daPhat)}
            />
            <Figure
              label={t('edu.quySach.conLai')}
              value={formatMoney(sach.conLai)}
              negative={sach.conLai < 0}
            />
          </div>
          <section>
            <h2 className='mb-2 text-sm font-medium'>
              {t('edu.phatSach.history')}
            </h2>
            {sach.cacLanPhat.length === 0 ? (
              <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                {t('edu.phatSach.noHistory')}
              </p>
            ) : (
              <ul className='divide-y rounded-lg border text-sm'>
                {sach.cacLanPhat.map((handout) => (
                  <li
                    key={handout.id}
                    className='flex flex-wrap items-center justify-between gap-2 p-3'
                  >
                    <span>
                      <span className='font-medium'>
                        {handout.kyHieu ? `${handout.kyHieu} · ` : ''}
                        {handout.tenSach}
                      </span>
                      <span className='ml-2 text-muted-foreground'>
                        {formatDay(handout.ngay)}
                      </span>
                    </span>
                    <span className='flex items-center gap-3'>
                      {handout.uuDai > 0 ? (
                        <span className='text-muted-foreground'>
                          {t('edu.phatSach.uuDai')}:{' '}
                          {formatMoney(handout.uuDai)}
                        </span>
                      ) : null}
                      <span className='font-medium'>
                        {formatMoney(handout.tienSach)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
      {props.canSeeLearning ? <Learning studentId={props.studentId} /> : null}
    </div>
  );
}

function Figure(props: {
  readonly label: string;
  readonly value: string;
  readonly negative?: boolean;
}): ReactElement {
  return (
    <div className='rounded-lg border p-3'>
      <dt className='text-xs text-muted-foreground'>{props.label}</dt>
      <dd
        className={
          props.negative
            ? 'text-lg font-semibold text-destructive'
            : 'text-lg font-semibold'
        }
      >
        {props.value}
      </dd>
    </div>
  );
}

function Learning({ studentId }: { readonly studentId: number }): ReactElement {
  const { t } = useTranslation();
  const links = usePagedRows('sachHoc', {
    page: 1,
    where: { hocVienId: studentId },
  });
  const linkRows = links.loaded.state === 'ready' ? links.loaded.rows : [];
  const books = useRowsByIds(
    'sach',
    linkRows.map((row) => Number(row.sachId)),
  );
  return (
    <section>
      <h2 className='mb-2 text-sm font-medium'>{t('edu.hoSo.learning')}</h2>
      <RowsTable
        loaded={links.loaded}
        onRetry={links.reload}
        emptyTitle={t('edu.hocVien.noBooks')}
        emptyHint={t('edu.hocVien.noBooksHint')}
        columns={[
          {
            key: 'kyHieu',
            label: t('edu.sach.kyHieu'),
            render: (row) => text(books.get(Number(row.sachId))?.kyHieu),
          },
          {
            key: 'ten',
            label: t('edu.sach.ten'),
            render: (row) => text(books.get(Number(row.sachId))?.ten),
          },
          {
            key: 'trangThai',
            label: t('edu.hocVien.bookState'),
            render: (row) => (
              <StatusBadge
                tone={row.trangThai === 'da_hoc' ? 'success' : 'info'}
              >
                {t(`edu.status.${text(row.trangThai)}`)}
              </StatusBadge>
            ),
          },
        ]}
      />
    </section>
  );
}
