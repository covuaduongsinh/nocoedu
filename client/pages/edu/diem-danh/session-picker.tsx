import { useTranslation } from '@nocobase/i18n/client';
import { CalendarCheck, ChevronRight } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';

import { SelectField } from '../form-parts.js';
import { text, type Row } from '../kit.js';
import { useDayLabel } from './day-label.js';
import {
  bySessionTime,
  inTimeFilter,
  sessionState,
  TIME_FILTERS,
  type SessionState,
  type TimeFilter,
} from './model.js';

/** A long list is cut here; the filters narrow it. */
const SHOWN = 60;

const TONE: Record<SessionState, 'success' | 'warning' | 'neutral' | 'info'> = {
  done: 'success',
  due: 'warning',
  planned: 'info',
  cancelled: 'neutral',
};

function SessionCard(props: {
  readonly session: Row;
  readonly className: string;
  readonly today: string;
  readonly onPick: (id: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  const dayLabel = useDayLabel();
  const state = sessionState(props.session, props.today);
  return (
    <button
      type='button'
      onClick={() => props.onPick(props.session.id)}
      className='flex min-h-16 w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'
    >
      <span className='flex min-w-0 flex-1 flex-col gap-1'>
        <span className='truncate text-sm font-medium'>{props.className}</span>
        <span className='text-xs text-muted-foreground'>
          {dayLabel(props.session.ngay)} · {text(props.session.gioBatDau)}–
          {text(props.session.gioKetThuc)}
        </span>
      </span>
      <StatusBadge tone={TONE[state]} size='sm'>
        {t(`edu.diemDanh.state.${state}`)}
      </StatusBadge>
      <ChevronRight
        className='size-4 shrink-0 text-muted-foreground'
        aria-hidden='true'
      />
    </button>
  );
}

/**
 * Choosing the session to mark: today's sessions first, because that is what a coach opens the page for, then the
 * others behind a few filters. Nothing is fetched here; the page hands over the sessions the person may see.
 */
export function SessionPicker(props: {
  readonly sessions: readonly Row[];
  readonly classes: readonly Row[];
  readonly today: string;
  readonly onPick: (id: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  const dayLabel = useDayLabel();
  const [time, setTime] = useState<TimeFilter>('week');
  // `all` rather than an empty value: `SelectField` adds its own "choose" option beside an empty one.
  const [lopId, setLopId] = useState('all');
  const [state, setState] = useState('all');

  const className = (id: unknown): string =>
    text(props.classes.find((row) => row.id === id)?.ten);
  const ordered = [...props.sessions].sort(bySessionTime);
  const todays = ordered.filter((row) => text(row.ngay) === props.today);
  const others = ordered.filter(
    (row) =>
      inTimeFilter(text(row.ngay), time, props.today) &&
      (lopId === 'all' || String(row.lopId) === lopId) &&
      (state === 'all' || sessionState(row, props.today) === state),
  );

  return (
    <div className='flex flex-col gap-6'>
      <section aria-labelledby='dd-today' className='flex flex-col gap-3'>
        <h2
          id='dd-today'
          className='flex items-center gap-2 text-sm font-medium'
        >
          <CalendarCheck className='size-4 text-primary' aria-hidden='true' />
          {t('edu.diemDanh.today', { day: dayLabel(props.today) })}
        </h2>
        {todays.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('edu.diemDanh.noneToday')}
          </p>
        ) : (
          <ul className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
            {todays.map((session) => (
              <li key={session.id}>
                <SessionCard
                  session={session}
                  className={className(session.lopId)}
                  today={props.today}
                  onPick={props.onPick}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby='dd-others' className='flex flex-col gap-3'>
        <h2 id='dd-others' className='text-sm font-medium'>
          {t('edu.diemDanh.allSessions')}
        </h2>
        <div className='flex flex-wrap items-end gap-3'>
          <div
            role='group'
            aria-label={t('edu.diemDanh.timeFilter')}
            className='flex flex-wrap gap-1'
          >
            {TIME_FILTERS.map((key) => (
              <Button
                key={key}
                type='button'
                size='sm'
                variant={time === key ? 'secondary' : 'ghost'}
                aria-pressed={time === key}
                onClick={() => setTime(key)}
              >
                {t(`edu.diemDanh.time.${key}`)}
              </Button>
            ))}
          </div>
          <div className='w-44'>
            <SelectField
              id='dd-filter-lop'
              label={t('edu.baoCao.filterClass')}
              value={lopId}
              onChange={setLopId}
              options={[
                { value: 'all', label: t('edu.baoCao.allClasses') },
                ...props.classes.map((row) => ({
                  value: String(row.id),
                  label: text(row.ten),
                })),
              ]}
            />
          </div>
          <div className='w-44'>
            <SelectField
              id='dd-filter-state'
              label={t('edu.diemDanh.status')}
              value={state}
              onChange={setState}
              options={[
                { value: 'all', label: t('edu.diemDanh.anyState') },
                ...(['due', 'done', 'planned', 'cancelled'] as const).map(
                  (key) => ({
                    value: key,
                    label: t(`edu.diemDanh.state.${key}`),
                  }),
                ),
              ]}
            />
          </div>
        </div>
        {props.sessions.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('edu.diemDanh.noSessions')}
          </p>
        ) : others.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('edu.diemDanh.noMatch')}
          </p>
        ) : (
          <>
            <ul className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
              {others.slice(0, SHOWN).map((session) => (
                <li key={session.id}>
                  <SessionCard
                    session={session}
                    className={className(session.lopId)}
                    today={props.today}
                    onPick={props.onPick}
                  />
                </li>
              ))}
            </ul>
            {others.length > SHOWN ? (
              <p className='text-xs text-muted-foreground'>
                {t('edu.diemDanh.more', {
                  shown: SHOWN,
                  total: others.length,
                })}
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
