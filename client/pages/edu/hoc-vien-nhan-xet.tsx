import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import { text, useRequest, type Row } from './kit.js';

interface SessionMark {
  readonly diemDanhId: number;
  readonly ngay: string;
  readonly gioBatDau: string;
  readonly lopTen: string;
  readonly trangThai: string;
  readonly nhanXet: string;
  readonly yThucDiem: number | null;
}

/** How many session comments the tab shows; the reconciliation page has the whole history. */
const SHOWN = 40;

function Feedback(props: {
  readonly state: 'loading' | 'error';
  readonly forbidden?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  if (props.state === 'loading') {
    return (
      <p role='status' className='text-sm text-muted-foreground'>
        {t('edu.common.loading')}
      </p>
    );
  }
  return (
    <p role='alert' className='text-sm text-destructive'>
      {props.forbidden
        ? t('edu.errors.PERMISSION_DENIED')
        : t('edu.common.loadError')}
    </p>
  );
}

/**
 * Everything written about a student, in one place: the short comment of each session and the monthly, periodic and
 * year-end comments. Both are read through the caller's own permissions (`edu.nhanXet` `view`, and attendance for the
 * session comments), so a student outside the caller's classes shows nothing here.
 */
export function StudentComments({
  studentId,
}: {
  readonly studentId: number;
}): ReactElement {
  const { t } = useTranslation();
  const sessions = useRequest<{ danhSach: SessionMark[] }>(
    'nhanXet/lichSuBuoiHoc',
    { hocVienId: studentId },
  );
  const periods = useRequest<Row[]>('nhanXetThang/findMany', {
    filter: { hocVienId: studentId },
    limit: 100,
  });
  const commented =
    sessions.result.state === 'ready'
      ? sessions.result.data.danhSach.filter((mark) => mark.nhanXet.trim())
      : [];
  const written =
    periods.result.state === 'ready'
      ? [...periods.result.data].sort((a, b) =>
          text(b.thang).localeCompare(text(a.thang)),
        )
      : [];

  return (
    <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
      <section aria-labelledby='hv-nx-buoi' className='flex flex-col gap-3'>
        <h2 id='hv-nx-buoi' className='text-sm font-medium'>
          {t('edu.hocVien.sessionComments')}
        </h2>
        {sessions.result.state !== 'ready' ? (
          <Feedback
            state={sessions.result.state}
            forbidden={
              sessions.result.state === 'error' && sessions.result.forbidden
            }
          />
        ) : commented.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('edu.hocVien.noSessionComments')}
          </p>
        ) : (
          <ul className='flex flex-col divide-y rounded-lg border'>
            {commented.slice(0, SHOWN).map((mark) => (
              <li key={mark.diemDanhId} className='flex flex-col gap-1.5 p-3'>
                <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                  <span className='font-medium text-foreground'>
                    {mark.ngay}
                  </span>
                  <span>{mark.lopTen}</span>
                  <StatusBadge
                    size='sm'
                    tone={
                      mark.trangThai === 'co_mat' || mark.trangThai === 'hoc_bu'
                        ? 'success'
                        : 'warning'
                    }
                  >
                    {t(`edu.diemDanh.s.${mark.trangThai}`)}
                  </StatusBadge>
                  {mark.yThucDiem == null ? null : (
                    <span>
                      {t('edu.diemDanh.awareness')}: {mark.yThucDiem}
                    </span>
                  )}
                </div>
                <p className='text-sm whitespace-pre-wrap'>{mark.nhanXet}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby='hv-nx-ky' className='flex flex-col gap-3'>
        <h2 id='hv-nx-ky' className='text-sm font-medium'>
          {t('edu.hocVien.periodComments')}
        </h2>
        {periods.result.state !== 'ready' ? (
          <Feedback
            state={periods.result.state}
            forbidden={
              periods.result.state === 'error' && periods.result.forbidden
            }
          />
        ) : written.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('edu.hocVien.noPeriodComments')}
          </p>
        ) : (
          <ul className='flex flex-col divide-y rounded-lg border'>
            {written.map((comment) => (
              <li key={comment.id} className='flex flex-col gap-1.5 p-3'>
                <span className='text-xs font-medium'>
                  {t('edu.hocVien.period')} {text(comment.thang)}
                </span>
                <p className='text-sm whitespace-pre-wrap'>
                  {text(comment.noiDung)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
