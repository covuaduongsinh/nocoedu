import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { BodyPortal } from '#components/body-portal';

import { formatMoney, formatTime } from '../format.js';
import { termLabel } from './terms.js';
import type { Profile } from './types.js';

/**
 * The A4 reconciliation sheet a parent signs: the student, the totals, every session with its term. It is rendered into
 * the page's body but shown only on paper (`client/styles.css` keeps everything else off the printout). Black on white
 * on purpose: it is a printed form, not a screen.
 */
export function PrintSheet({
  profile,
}: {
  readonly profile: Profile;
}): ReactElement {
  const { t } = useTranslation();
  const { hocVien: student, tongHop: sum, phuHuynhChinh: parent } = profile;
  const terms = profile.hocPhi?.cacKy ?? [];
  const termName = (kySo: number | null): string => {
    const term = terms.find((candidate) => candidate.kySo === kySo);
    return term ? termLabel(t, term) : '—';
  };
  const money = (value: number | null): string =>
    value === null
      ? '—'
      : t('edu.common.money', { amount: formatMoney(value) });
  return (
    <BodyPortal>
      <div
        data-print-sheet
        className='hidden bg-white p-6 font-serif text-black print:block'
      >
        <header className='mb-4 border-b-2 border-black pb-3 text-center'>
          <p className='text-xl font-bold uppercase tracking-wider'>
            {t('edu.hoSo.print.club')}
          </p>
          <h1 className='mt-2 text-lg font-bold uppercase'>
            {t('edu.hoSo.print.title')}
          </h1>
        </header>
        <div className='mb-4 grid grid-cols-2 gap-4 text-xs'>
          <div>
            <p>
              {t('edu.hoSo.print.student')}: <strong>{student.hoTen}</strong> (
              {student.ma})
            </p>
            <p>
              {t('edu.hocVien.lop')}: <strong>{student.lopTen ?? '—'}</strong> ·{' '}
              {t('edu.lop.coSo')}: <strong>{student.coSoTen ?? '—'}</strong>
            </p>
          </div>
          <div>
            <p>
              {t('edu.hoSo.print.parent')}:{' '}
              <strong>{parent?.hoTen ?? '—'}</strong>
            </p>
            <p>
              {t('edu.phuHuynh.soDienThoai')}:{' '}
              <strong>{parent?.soDienThoai ?? '—'}</strong>
            </p>
          </div>
        </div>
        <div className='mb-4 border border-black p-3 text-xs'>
          <h2 className='mb-2 font-bold uppercase'>
            {t('edu.hoSo.print.summary')}
          </h2>
          <div className='grid grid-cols-3 gap-2'>
            <p>
              {t('edu.hoSo.kpi.daNop')}:{' '}
              <strong>{sum.tongSoBuoiDaMua ?? '—'}</strong>
            </p>
            <p>
              {t('edu.hoSo.kpi.daHoc')}:{' '}
              <strong>{sum.tongSoBuoiDaHoc ?? '—'}</strong>
            </p>
            <p>
              {t('edu.hoSo.kpi.conLai')}: <strong>{sum.soBuoiConLai}</strong>
            </p>
            <p>
              {t('edu.hoSo.col.daNop')}:{' '}
              <strong>{money(sum.tongDaThanhToan)}</strong>
            </p>
            <p>
              {t('edu.hoSo.col.conNo')}:{' '}
              <strong>{money(sum.tongConNoHocPhi)}</strong>
            </p>
            <p>
              {t('edu.hoSo.kpi.quySach')}: <strong>{money(sum.quySach)}</strong>
            </p>
          </div>
        </div>
        <h2 className='mb-2 text-xs font-bold uppercase'>
          {t('edu.hoSo.print.detail')}
        </h2>
        <table className='mb-8 w-full border-collapse border border-black text-[11px]'>
          <thead>
            <tr>
              <th className='border border-black p-1'>
                {t('edu.hoSo.col.stt')}
              </th>
              <th className='border border-black p-1 text-left'>
                {t('edu.hoSo.col.ngayGio')}
              </th>
              <th className='border border-black p-1 text-left'>
                {t('edu.hocVien.lop')}
              </th>
              <th className='border border-black p-1'>
                {t('edu.hocVien.trangThai')}
              </th>
              <th className='border border-black p-1'>
                {t('edu.hoSo.col.yThuc')}
              </th>
              <th className='border border-black p-1 text-left'>
                {t('edu.hocVien.nhanXet')}
              </th>
              <th className='border border-black p-1'>
                {t('edu.hoSo.col.ky')}
              </th>
              <th className='border border-black p-1'>
                {t('edu.hoSo.col.tru')}
              </th>
            </tr>
          </thead>
          <tbody>
            {(profile.buoiHoc ?? []).map((session) => (
              <tr key={session.diemDanhId}>
                <td className='border border-black p-1 text-center'>
                  {session.stt}
                </td>
                <td className='border border-black p-1'>
                  {session.ngay} ({formatTime(session.gioBatDau)})
                </td>
                <td className='border border-black p-1'>
                  {session.lopTen ?? '—'}
                </td>
                <td className='border border-black p-1 text-center'>
                  {t(`edu.diemDanh.s.${session.trangThai}`, {
                    defaultValue: session.trangThai,
                  })}
                </td>
                <td className='border border-black p-1 text-center'>
                  {session.yThucDiem === null ? '—' : `${session.yThucDiem}/10`}
                </td>
                <td className='border border-black p-1'>
                  {session.nhanXet || '—'}
                </td>
                <td className='border border-black p-1 text-center'>
                  {session.vuotSoDu
                    ? t('edu.hoSo.vuotGoi')
                    : termName(session.kySo)}
                </td>
                <td className='border border-black p-1 text-center font-bold'>
                  {session.soBuoiDaTru > 0 ? `-${session.soBuoiDaTru}` : '0'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className='mt-8 grid grid-cols-2 text-center text-xs'>
          <div>
            <p className='font-bold uppercase'>{t('edu.hoSo.print.center')}</p>
            <p className='text-[10px] italic'>
              {t('edu.hoSo.print.centerHint')}
            </p>
            <div className='h-20' />
          </div>
          <div>
            <p className='font-bold uppercase'>
              {t('edu.hoSo.print.parentSign')}
            </p>
            <p className='text-[10px] italic'>
              {t('edu.hoSo.print.parentHint')}
            </p>
            <div className='h-20' />
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
