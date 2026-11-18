import { useTranslation } from '@nocobase/i18n/client';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Card, CardContent } from '#components/ui/card';

import { formatDay } from '../format.js';
import { useRequest } from '../kit.js';
import { MucDoBadge } from '../kien-thuc/muc-do.js';
import type { StudentKnowledge } from '../kien-thuc/types.js';
import { useUrlState } from '../url-state.js';

/**
 * The knowledge of the student (level → topic → skill, one state per skill), with what still needs making up on top.
 * The one answer is `POST /kienThuc/hoSo`; the student must be one the person sees. The level that is open is in the
 * address (`?cap=`), by default the student's own.
 */
export function Knowledge({
  studentId,
}: {
  readonly studentId: number;
}): ReactElement {
  const { t } = useTranslation();
  const { result, reload } = useRequest<StudentKnowledge>('/kienThuc/hoSo', {
    hocVienId: studentId,
  });
  const url = useUrlState({ cap: '' });
  const [openTopics, setOpenTopics] = useState<ReadonlySet<number>>(
    () => new Set(),
  );

  if (result.state === 'loading')
    return (
      <p role='status' className='text-sm text-muted-foreground'>
        {t('edu.common.loading')}
      </p>
    );
  if (result.state === 'error')
    return (
      <div role='alert' className='flex flex-col items-start gap-3'>
        <p className='text-sm text-destructive'>
          {result.forbidden ? t('edu.kt.forbidden') : t('edu.common.loadError')}
        </p>
        <Button variant='outline' onClick={reload}>
          {t('edu.common.retry')}
        </Button>
      </div>
    );
  const data = result.data;
  const levelKey = data.capDo.some((level) => level.levelKey === url.values.cap)
    ? url.values.cap
    : data.levelKey;
  const level = data.capDo.find((item) => item.levelKey === levelKey);
  const toggle = (id: number): void =>
    setOpenTopics((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className='flex flex-col gap-6'>
      <section
        aria-label={t('edu.kt.makeupTitle')}
        className='flex flex-col gap-3'
      >
        <h2 className='text-base font-semibold'>{t('edu.kt.makeupTitle')}</h2>
        {data.canBu.length === 0 ? (
          <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
            {t('edu.kt.makeupNone')}
          </p>
        ) : (
          <ul className='flex flex-col divide-y rounded-lg border'>
            {data.canBu.map((gap) => (
              <li
                key={gap.kyNangId}
                className='flex flex-wrap items-center justify-between gap-2 p-3'
              >
                <div className='flex min-w-0 flex-col'>
                  <span className='text-xs text-muted-foreground'>
                    {t(`edu.level.${gap.levelKey}`)} · {gap.chuDe}
                  </span>
                  <span className='text-sm font-medium'>
                    {gap.ma} · {gap.ten}
                  </span>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <StatusBadge tone='warning' size='sm'>
                    {t(`edu.kt.gap.${gap.lyDo}`)}
                  </StatusBadge>
                  {gap.ngay ? (
                    <span className='text-xs text-muted-foreground'>
                      {t('edu.kt.gap.since', { date: formatDay(gap.ngay) })}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className='flex flex-col gap-3'>
        <div className='flex flex-wrap items-center gap-2'>
          {data.capDo.map((item) => (
            <Button
              key={item.levelKey}
              size='sm'
              variant={item.levelKey === levelKey ? 'default' : 'outline'}
              aria-pressed={item.levelKey === levelKey}
              onClick={() => url.set({ cap: item.levelKey })}
            >
              {t(`edu.level.${item.levelKey}`)}
              <span className='ml-1.5 text-xs tabular-nums opacity-80'>
                {item.phanTram}%
              </span>
            </Button>
          ))}
        </div>
        {level ? (
          <>
            <p role='status' className='text-sm text-muted-foreground'>
              {t('edu.kt.levelSummary', {
                level: t(`edu.level.${level.levelKey}`),
                percent: level.phanTram,
                done: level.daHoc,
                total: level.tong,
                solid: level.dat,
              })}
            </p>
            {level.chuDe.length === 0 ? (
              <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                {t('edu.kt.noCurriculum', {
                  level: t(`edu.level.${level.levelKey}`),
                })}
              </p>
            ) : (
              level.chuDe.map((topic) => {
                const open = openTopics.has(topic.id);
                const learned = topic.kyNang.filter(
                  (skill) =>
                    skill.mucDo !== null && skill.mucDo !== 'chua_vung',
                ).length;
                return (
                  <Card key={topic.id}>
                    <CardContent className='flex flex-col gap-2 p-4'>
                      <button
                        type='button'
                        aria-expanded={open}
                        onClick={() => toggle(topic.id)}
                        className='flex w-full items-center justify-between gap-2 text-left'
                      >
                        <span className='flex items-center gap-2'>
                          {open ? (
                            <ChevronDown className='size-4' />
                          ) : (
                            <ChevronRight className='size-4' />
                          )}
                          <span className='text-sm font-semibold'>
                            {topic.ma} · {topic.ten}
                          </span>
                        </span>
                        <span className='text-xs tabular-nums text-muted-foreground'>
                          {learned}/{topic.kyNang.length}
                        </span>
                      </button>
                      {open ? (
                        <ul className='flex flex-col divide-y rounded-lg border'>
                          {topic.kyNang.map((skill) => (
                            <li
                              key={skill.id}
                              className='flex flex-wrap items-center justify-between gap-2 p-3'
                            >
                              <span className='text-sm'>
                                <span className='font-mono text-xs text-muted-foreground'>
                                  {skill.ma}
                                </span>{' '}
                                {skill.ten}
                              </span>
                              <span className='flex flex-wrap items-center gap-2'>
                                {skill.canBu ? (
                                  <StatusBadge tone='warning' size='sm'>
                                    {t('edu.kt.needsMakeupOne')}
                                  </StatusBadge>
                                ) : null}
                                <MucDoBadge mucDo={skill.mucDo} size='sm' />
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}
