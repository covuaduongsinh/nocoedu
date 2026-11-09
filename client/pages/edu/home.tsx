import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';

import { useRequest } from './kit.js';

interface SessionView {
  id: number;
  lop: string;
  ngay: string;
  gioBatDau: string;
  gioKetThuc: string;
  daDiemDanh: boolean;
}
interface Summary {
  homNay: SessionView[];
  chuaDiemDanh: SessionView[];
}
interface LowStudent {
  id: number;
  ma: string;
  hoTen: string;
  soBuoiConLai: number;
}

/**
 * The landing page. What it shows follows the role: classes today, sessions not yet marked and students running out
 * of sessions come from routes the server limits to the caller's own classes or branches; a part the role may not
 * read is left out instead of showing an error.
 */
export default function EduHome(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const summary = useRequest<Summary>('/trangChu/tomTat', {});
  const low = useRequest<LowStudent[]>('/soDu/canhBao', {});
  const [counts, setCounts] = useState<{
    students: number | null;
    classes: number | null;
  }>({
    students: null,
    classes: null,
  });
  useEffect(() => {
    let live = true;
    const count = (name: string): Promise<number | null> =>
      api
        .repository(name)
        .count()
        .then((value) => value)
        .catch(() => null);
    void Promise.all([count('hocVien'), count('lop')]).then(
      ([students, classes]) => {
        if (live) setCounts({ students, classes });
      },
    );
    return () => {
      live = false;
    };
  }, [api]);

  const nothing =
    counts.students === null &&
    counts.classes === null &&
    summary.result.state === 'error' &&
    low.result.state === 'error';
  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <PageHeader
        title={t('edu.home.title')}
        description={t('edu.home.intro')}
      />
      {nothing ? (
        <p className='text-sm text-muted-foreground'>
          {t('edu.home.noAccess')}
        </p>
      ) : (
        <div className='grid gap-4 md:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardDescription>{t('edu.home.students')}</CardDescription>
              <CardTitle className='text-3xl'>
                {counts.students ?? '–'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t('edu.home.classes')}</CardDescription>
              <CardTitle className='text-3xl'>
                {counts.classes ?? '–'}
              </CardTitle>
            </CardHeader>
          </Card>

          {summary.result.state === 'ready' ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('edu.home.today')}</CardTitle>
                  <CardDescription>{t('edu.home.todayHint')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <SessionList
                    sessions={summary.result.data.homNay}
                    empty={t('edu.home.todayEmpty')}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('edu.home.unmarked')}</CardTitle>
                  <CardDescription>
                    {t('edu.home.unmarkedHint')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SessionList
                    sessions={summary.result.data.chuaDiemDanh}
                    empty={t('edu.home.unmarkedEmpty')}
                    showDate
                  />
                </CardContent>
              </Card>
            </>
          ) : null}

          {low.result.state === 'ready' ? (
            <Card className='md:col-span-2'>
              <CardHeader>
                <CardTitle>{t('edu.home.low')}</CardTitle>
                <CardDescription>{t('edu.home.lowHint')}</CardDescription>
              </CardHeader>
              <CardContent>
                {low.result.data.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('edu.home.lowEmpty')}
                  </p>
                ) : (
                  <ul className='flex flex-col gap-2'>
                    {low.result.data.map((student) => (
                      <li
                        key={student.id}
                        className='flex items-center justify-between gap-3 text-sm'
                      >
                        <span>
                          {student.hoTen}{' '}
                          <span className='text-muted-foreground'>
                            ({student.ma})
                          </span>
                        </span>
                        <StatusBadge tone={'warning'}>
                          {t('edu.home.sessionsLeft', {
                            count: student.soBuoiConLai,
                          })}
                        </StatusBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}

function SessionList(props: {
  readonly sessions: readonly SessionView[];
  readonly empty: string;
  readonly showDate?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  if (props.sessions.length === 0) {
    return <p className='text-sm text-muted-foreground'>{props.empty}</p>;
  }
  return (
    <ul className='flex flex-col gap-2'>
      {props.sessions.map((session) => (
        <li
          key={session.id}
          className='flex items-center justify-between gap-3 text-sm'
        >
          <span>
            {session.lop}{' '}
            <span className='text-muted-foreground'>
              {props.showDate ? `${session.ngay} ` : ''}
              {session.gioBatDau}–{session.gioKetThuc}
            </span>
          </span>
          {session.daDiemDanh ? (
            <StatusBadge tone='success'>{t('edu.diemDanh.done')}</StatusBadge>
          ) : (
            <Link
              className='text-primary underline'
              to={`/diem-danh?buoi=${session.id}`}
            >
              {t('edu.home.markNow')}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
