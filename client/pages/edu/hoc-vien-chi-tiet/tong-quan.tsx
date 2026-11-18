import { useTranslation } from '@nocobase/i18n/client';
import {
  BookOpen,
  CalendarCheck,
  GraduationCap,
  Layers,
  Users,
  Wallet,
} from 'lucide-react';
import type { ReactElement } from 'react';

import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Card, CardContent } from '#components/ui/card';

import {
  LevelBadge,
  MetricCard,
  SessionBalanceBadge,
} from '../edu-ui-parts.js';
import { formatDay, formatMoney } from '../format.js';
import { termLabel } from './terms.js';
import type { Profile } from './types.js';

/** The first tab: the numbers that answer "how is this student doing?" and the milestones of each term. */
export function Overview({
  profile,
}: {
  readonly profile: Profile;
}): ReactElement {
  const { t } = useTranslation();
  const { tongHop: sum } = profile;
  const terms = profile.hocPhi?.cacKy ?? [];
  return (
    <div className='flex flex-col gap-6'>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <MetricCard
          title={t('edu.hoSo.kpi.conLai')}
          value={<SessionBalanceBadge balance={sum.soBuoiConLai} />}
          subtitle={sum.canThu ? t('edu.hoSo.kpi.canThu') : undefined}
          icon={CalendarCheck}
          tone={sum.dai === 'binh_thuong' ? 'success' : 'warning'}
        />
        {profile.hocVien.lopId !== null ? (
          <MetricCard
            title={t('edu.nhom.kpiTitle')}
            value={profile.hocVien.nhomTen ?? t('edu.nhom.none')}
            subtitle={profile.hocVien.lopTen ?? undefined}
            icon={Users}
          />
        ) : null}
        {sum.tongSoBuoiDaHoc !== null ? (
          <MetricCard
            title={t('edu.hoSo.kpi.daHoc')}
            value={sum.tongSoBuoiDaHoc}
            subtitle={t('edu.hoSo.kpi.daHocHint')}
            icon={GraduationCap}
          />
        ) : null}
        {sum.tongSoBuoiDaMua !== null ? (
          <MetricCard
            title={t('edu.hoSo.kpi.daNop')}
            value={sum.tongSoBuoiDaMua}
            subtitle={t('edu.hoSo.kpi.daNopHint', { count: terms.length })}
            icon={Layers}
            tone='primary'
          />
        ) : null}
        {sum.tongConNoHocPhi !== null ? (
          <MetricCard
            title={t('edu.hoSo.kpi.noHocPhi')}
            value={t('edu.common.money', {
              amount: formatMoney(sum.tongConNoHocPhi),
            })}
            subtitle={t('edu.hoSo.kpi.daNopTien', {
              amount: formatMoney(sum.tongDaThanhToan),
            })}
            icon={Wallet}
            tone={sum.tongConNoHocPhi > 0 ? 'destructive' : 'neutral'}
          />
        ) : null}
        {sum.quySach !== null ? (
          <MetricCard
            title={t('edu.hoSo.kpi.quySach')}
            value={t('edu.common.money', { amount: formatMoney(sum.quySach) })}
            subtitle={
              (sum.congNoSach ?? 0) > 0
                ? t('edu.hoSo.kpi.congNoSach', {
                    amount: formatMoney(sum.congNoSach),
                  })
                : undefined
            }
            icon={BookOpen}
            tone={(sum.congNoSach ?? 0) > 0 ? 'destructive' : 'neutral'}
          />
        ) : null}
        <Card>
          <CardContent className='flex h-full flex-col justify-center gap-2 p-5'>
            <p className='text-xs font-medium uppercase tracking-wider text-muted-foreground'>
              {t('edu.hoSo.kpi.cap')}
            </p>
            <LevelBadge levelKey={profile.hocVien.levelKey} />
          </CardContent>
        </Card>
      </div>

      {sum.vuotSoDu !== null && sum.vuotSoDu > 0 ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('edu.hoSo.over', { count: sum.vuotSoDu })}</AlertTitle>
          <AlertDescription>{t('edu.hoSo.overHint')}</AlertDescription>
        </Alert>
      ) : null}

      {profile.hocPhi ? (
        <section className='flex flex-col gap-3'>
          <h2 className='text-base font-semibold'>
            {t('edu.hoSo.milestones')}
          </h2>
          {terms.length === 0 ? (
            <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
              {t('edu.hoSo.noTerms')}
            </p>
          ) : (
            terms.map((term) => (
              <Card key={term.kySo}>
                <CardContent className='flex flex-col gap-3 p-4'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <div className='flex flex-wrap items-baseline gap-2'>
                      <span className='font-semibold'>
                        {termLabel(t, term)}
                      </span>
                      <span className='text-xs text-muted-foreground'>
                        {t('edu.hoSo.kyNgay', {
                          date: formatDay(term.ngayMua),
                        })}
                      </span>
                    </div>
                    <span className='text-sm'>
                      {t('edu.hoSo.daDung', {
                        used: term.daDung,
                        total: term.soBuoi,
                      })}
                    </span>
                  </div>
                  <div
                    role='progressbar'
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, term.tienDo)}
                    className='h-2.5 w-full overflow-hidden rounded-full bg-muted'
                  >
                    <div
                      className='h-full rounded-full bg-primary transition-all'
                      style={{ width: `${Math.min(100, term.tienDo)}%` }}
                    />
                  </div>
                  <div className='flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground'>
                    {term.goiHocId !== null ? (
                      <>
                        <span>
                          {t('edu.hoSo.hocPhiGoi', {
                            amount: formatMoney(term.thanhTien),
                            price: formatMoney(term.donGia),
                          })}
                        </span>
                        <span>
                          {t('edu.hoSo.daNop', {
                            amount: formatMoney(term.daThanhToan),
                          })}
                        </span>
                        <span
                          className={term.conNo > 0 ? 'text-destructive' : ''}
                        >
                          {t('edu.hoSo.conNo', {
                            amount: formatMoney(term.conNo),
                          })}
                        </span>
                      </>
                    ) : null}
                    <span>
                      {t('edu.hoSo.conLaiKy', { count: term.conLai })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </section>
      ) : null}
    </div>
  );
}
