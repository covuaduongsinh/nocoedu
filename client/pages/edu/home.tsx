import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Phone,
  Plus,
  School,
  Users,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { PageContainer } from '#components/page-container';
import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Badge } from '#components/ui/badge';
import { Button, buttonVariants } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';

import {
  InitialsAvatar,
  LevelBadge,
  MetricCard,
  SessionBalanceBadge,
} from './edu-ui-parts.js';
import { LEVEL_KEYS, text, todayVn, useRequest, type Row } from './kit.js';

interface SessionView {
  id: number;
  lopId?: number;
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
 * Modern Executive Dashboard for chess academy management.
 * Provides real-time operational visibility, quick actions, today's schedule,
 * attendance alerts, and tuition collection reminders.
 */
export default function EduHome(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
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

  const todaySessions =
    summary.result.state === 'ready' ? summary.result.data.homNay : [];
  const unmarkedSessions =
    summary.result.state === 'ready' ? summary.result.data.chuaDiemDanh : [];
  const lowStudents = low.result.state === 'ready' ? low.result.data : [];

  return (
    <PageContainer className='mx-auto max-w-6xl space-y-6'>
      {/* Top Banner & Quick Actions */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
            {t('edu.home.title')}
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('edu.home.intro')}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            size='sm'
            onClick={() => void navigate('/hoc-vien?action=create')}
            className='gap-1.5'
          >
            <Plus className='h-4 w-4' />
            <span>{t('edu.hocVien.new')}</span>
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() => void navigate('/hoc-phi')}
            className='gap-1.5'
          >
            <Plus className='h-4 w-4' />
            <span>{t('edu.hocPhi.sell')}</span>
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() => void navigate('/tuyen-sinh')}
            className='gap-1.5'
          >
            <span>{t('edu.nav.tuyenSinh')}</span>
          </Button>
        </div>
      </div>

      {nothing ? (
        <p className='text-sm text-muted-foreground'>
          {t('edu.home.noAccess')}
        </p>
      ) : (
        <>
          {/* Executive KPI Metrics Grid */}
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <MetricCard
              title={t('edu.home.students')}
              value={counts.students ?? '–'}
              subtitle='Học viên đang theo học'
              icon={Users}
              tone='primary'
              onClick={() => void navigate('/hoc-vien')}
            />
            <MetricCard
              title={t('edu.home.classes')}
              value={counts.classes ?? '–'}
              subtitle='Lớp học đang hoạt động'
              icon={School}
              tone='info'
              onClick={() => void navigate('/lop')}
            />
            <MetricCard
              title={t('edu.home.low')}
              value={lowStudents.length}
              subtitle='Học viên còn ≤ 2 buổi'
              icon={AlertCircle}
              tone={lowStudents.length > 0 ? 'warning' : 'neutral'}
              onClick={() => void navigate('/hoc-phi')}
            />
            <MetricCard
              title={t('edu.home.today')}
              value={todaySessions.length}
              subtitle='Buổi học diễn ra hôm nay'
              icon={Calendar}
              tone='success'
              onClick={() => void navigate('/diem-danh')}
            />
          </div>

          {/* Main 2-column Operational Grid */}
          <div className='grid gap-6 lg:grid-cols-12'>
            {/* Left Column (8 cols): Class Sessions & Attendance */}
            <div className='space-y-6 lg:col-span-8'>
              {/* Today's Schedule Card */}
              {summary.result.state === 'ready' ? (
                <Card className='shadow-xs'>
                  <CardHeader className='pb-3'>
                    <div className='flex items-center justify-between'>
                      <div>
                        <CardTitle className='text-base font-semibold sm:text-lg'>
                          {t('edu.home.today')}
                        </CardTitle>
                        <CardDescription>
                          {t('edu.home.todayHint')}
                        </CardDescription>
                      </div>
                      <Badge variant='outline' className='font-normal'>
                        {todaySessions.length} ca học
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <SessionList
                      sessions={todaySessions}
                      empty={t('edu.home.todayEmpty')}
                    />
                  </CardContent>
                </Card>
              ) : null}

              {/* Unmarked Sessions Requiring Attention */}
              {summary.result.state === 'ready' && unmarkedSessions.length > 0 ? (
                <Card className='border-amber-500/20 shadow-xs'>
                  <CardHeader className='pb-3'>
                    <div className='flex items-center justify-between'>
                      <div>
                        <CardTitle className='text-base font-semibold text-amber-700 dark:text-amber-400 sm:text-lg'>
                          {t('edu.home.unmarked')}
                        </CardTitle>
                        <CardDescription>
                          {t('edu.home.unmarkedHint')}
                        </CardDescription>
                      </div>
                      <Badge
                        variant='outline'
                        className='border-amber-500/30 bg-amber-500/10 text-amber-600'
                      >
                        {unmarkedSessions.length} buổi cần xử lý
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <SessionList
                      sessions={unmarkedSessions}
                      empty={t('edu.home.unmarkedEmpty')}
                      showDate
                    />
                  </CardContent>
                </Card>
              ) : null}

              {/* Students Running Low on Sessions */}
              {low.result.state === 'ready' ? (
                <Card className='shadow-xs'>
                  <CardHeader className='pb-3'>
                    <div className='flex items-center justify-between'>
                      <div>
                        <CardTitle className='text-base font-semibold sm:text-lg'>
                          {t('edu.home.low')}
                        </CardTitle>
                        <CardDescription>
                          {t('edu.home.lowHint')}
                        </CardDescription>
                      </div>
                      <Link
                        to='/hoc-phi'
                        className='text-xs font-medium text-primary hover:underline'
                      >
                        Xem tất cả học phí →
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {lowStudents.length === 0 ? (
                      <div className='flex items-center gap-2 py-4 text-sm text-muted-foreground'>
                        <CheckCircle2 className='h-4 w-4 text-emerald-500' />
                        <span>{t('edu.home.lowEmpty')}</span>
                      </div>
                    ) : (
                      <div className='divide-y'>
                        {lowStudents.map((student) => (
                          <div
                            key={student.id}
                            className='flex items-center justify-between gap-3 py-2.5 text-sm'
                          >
                            <div className='flex items-center gap-2.5'>
                              <InitialsAvatar name={student.hoTen} size='sm' />
                              <div>
                                <RecordLink to={`/hoc-vien/${student.id}`}>
                                  {student.hoTen}
                                </RecordLink>
                                <span className='ml-2 text-xs text-muted-foreground'>
                                  ({student.ma})
                                </span>
                              </div>
                            </div>
                            <div className='flex items-center gap-2'>
                              <SessionBalanceBadge
                                balance={student.soBuoiConLai}
                                size='sm'
                              />
                              <Link
                                to={`/hoc-phi?search=${encodeURIComponent(student.ma)}`}
                                className='inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted'
                              >
                                {t('edu.nav.hocPhi')}
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}
            </div>

            {/* Right Column (4 cols): Follow-ups & Level Distribution */}
            <div className='space-y-6 lg:col-span-4'>
              {/* Admissions CRM Call-Backs */}
              <CallBacks />

              {/* Chess Levels Overview Card */}
              <Card className='shadow-xs'>
                <CardHeader className='pb-3'>
                  <CardTitle className='text-base font-semibold sm:text-lg'>
                    Hệ Thống Cấp Độ Cờ Vua
                  </CardTitle>
                  <CardDescription>
                    Lộ trình đào tạo chuẩn theo chuẩn cờ vua
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-2.5'>
                  {LEVEL_KEYS.map((key) => (
                    <div
                      key={key}
                      className='flex items-center justify-between rounded-lg border p-2 text-xs transition-colors hover:bg-muted/50'
                    >
                      <LevelBadge levelKey={key} size='sm' />
                      <span className='font-mono text-muted-foreground'>
                        Cấp {LEVEL_KEYS.indexOf(key) + 1}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Quick Operation Links */}
              <Card className='shadow-xs'>
                <CardHeader className='pb-3'>
                  <CardTitle className='text-base font-semibold sm:text-lg'>
                    Lối Tắt Vận Hành
                  </CardTitle>
                </CardHeader>
                <CardContent className='grid gap-2'>
                  <Link
                    to='/bao-cao'
                    className='flex items-center justify-between rounded-lg border p-2.5 text-sm font-medium transition-colors hover:bg-muted'
                  >
                    <span>📊 Báo cáo vận hành</span>
                    <span className='text-muted-foreground'>→</span>
                  </Link>
                  <Link
                    to='/ho-so-gv'
                    className='flex items-center justify-between rounded-lg border p-2.5 text-sm font-medium transition-colors hover:bg-muted'
                  >
                    <span>👨‍🏫 Hồ sơ giáo viên</span>
                    <span className='text-muted-foreground'>→</span>
                  </Link>
                  <Link
                    to='/phat-sach'
                    className='flex items-center justify-between rounded-lg border p-2.5 text-sm font-medium transition-colors hover:bg-muted'
                  >
                    <span>📚 Quản lý giáo trình</span>
                    <span className='text-muted-foreground'>→</span>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
}

/**
 * Families to call back (admissions CRM): contacts still open whose reminder day has come.
 */
function CallBacks(): ReactElement | null {
  const { t } = useTranslation();
  const api = useApiClient();
  const { can } = useCan({
    resource: { type: 'composite', id: 'edu.tuyenSinh' },
    action: 'view',
  });
  const [due, setDue] = useState<Row[]>();

  useEffect(() => {
    if (!can) return;
    let live = true;
    const today = todayVn();
    api
      .request<{ data: Row[] }>({
        path: 'lienHe/findMany',
        method: 'POST',
        json: { limit: 100 },
      })
      .then((response) => {
        if (!live) return;
        setDue(
          response.data
            .filter(
              (row) =>
                (row.trangThai === 'moi' ||
                  row.trangThai === 'dang_cham_soc') &&
                text(row.ngayNhac) !== '' &&
                text(row.ngayNhac) <= today,
            )
            .sort((a, b) => text(a.ngayNhac).localeCompare(text(b.ngayNhac))),
        );
      })
      .catch(() => {
        if (live) setDue(undefined);
      });
    return () => {
      live = false;
    };
  }, [api, can]);

  if (!can || due === undefined) return null;

  return (
    <Card className='shadow-xs'>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-base font-semibold sm:text-lg'>
            {t('edu.home.callBack')}
          </CardTitle>
          <Badge variant='outline' className='text-xs'>
            {due.length} liên hệ
          </Badge>
        </div>
        <CardDescription>{t('edu.home.callBackHint')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {due.length === 0 ? (
          <div className='flex items-center gap-2 py-3 text-sm text-muted-foreground'>
            <CheckCircle2 className='h-4 w-4 text-emerald-500' />
            <span>{t('edu.home.callBackEmpty')}</span>
          </div>
        ) : (
          <div className='divide-y'>
            {due.map((row) => (
              <div
                key={row.id}
                className='flex items-center justify-between gap-3 py-2 text-sm'
              >
                <div className='space-y-0.5'>
                  <div className='font-medium text-foreground'>
                    {text(row.hoTen)}
                  </div>
                  <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                    <Phone className='h-3 w-3' />
                    <span>{text(row.soDienThoai)}</span>
                  </div>
                </div>
                <StatusBadge tone='warning'>{text(row.ngayNhac)}</StatusBadge>
              </div>
            ))}
          </div>
        )}
        <Link
          className='inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline'
          to='/tuyen-sinh'
        >
          {t('edu.home.callBackOpen')} →
        </Link>
      </CardContent>
    </Card>
  );
}

function SessionList(props: {
  readonly sessions: readonly SessionView[];
  readonly empty: string;
  readonly showDate?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  if (props.sessions.length === 0) {
    return (
      <div className='flex items-center gap-2 py-4 text-sm text-muted-foreground'>
        <CheckCircle2 className='h-4 w-4 text-emerald-500' />
        <span>{props.empty}</span>
      </div>
    );
  }

  return (
    <div className='divide-y'>
      {props.sessions.map((session) => (
        <div
          key={session.id}
          className='flex items-center justify-between gap-3 py-3 text-sm'
        >
          <div className='space-y-1'>
            <div>
              {session.lopId ? (
                <RecordLink to={`/lop/${session.lopId}`}>
                  {session.lop}
                </RecordLink>
              ) : (
                <span className='font-medium text-foreground'>
                  {session.lop}
                </span>
              )}
            </div>
            <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
              <Clock className='h-3.5 w-3.5' />
              <span>
                {props.showDate ? `${session.ngay} · ` : ''}
                {session.gioBatDau} – {session.gioKetThuc}
              </span>
            </div>
          </div>
          <div>
            {session.daDiemDanh ? (
              <StatusBadge tone='success'>
                ✓ {t('edu.diemDanh.done')}
              </StatusBadge>
            ) : (
              <Link
                to={`/diem-danh?buoi=${session.id}`}
                className={buttonVariants({ size: 'sm', variant: 'default', className: 'h-8 text-xs' })}
              >
                {t('edu.home.markNow')}
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
