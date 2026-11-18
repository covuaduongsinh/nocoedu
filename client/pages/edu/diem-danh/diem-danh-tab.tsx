import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Save,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { Field, FormDialog, SelectField, TextField } from '../form-parts.js';
import { GenericImportDialog } from '../generic-import-dialog.js';
import { formatTime } from '../format.js';
import { Pager } from '../list-page.js';
import { groupBlocks, useClassGroups } from '../nhom.js';
import {
  post,
  text,
  todayVn,
  useErrorMessage,
  usePagedRows,
  useRows,
  useListState,
  type Row,
} from '../kit.js';
import { saveCsvStream } from '../download.js';
import { addDays, daysIn, periodOf } from './periods.js';

const STATUSES = [
  'co_mat',
  'vang_co_phep',
  'vang_khong_phep',
  'hoc_bu',
] as const;
type Status = (typeof STATUSES)[number];

interface Mark {
  trangThai: Status;
  daLamBtvn: boolean;
  nhanXet: string;
}

interface Saved {
  hocVienId: number;
  soBuoiConLai: number;
  canhBao: boolean;
}

const CONTENT_FIELDS = [
  'keHoachDay',
  'kienThucMoi',
  'giaoBtvn',
  'keHoachBuoiSau',
] as const;
type Content = Record<(typeof CONTENT_FIELDS)[number], string>;
const EMPTY_CONTENT: Content = {
  keHoachDay: '',
  kienThucMoi: '',
  giaoBtvn: '',
  keHoachBuoiSau: '',
};

const QUICK_TAGS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

type TimeFilter = 'today' | 'yesterday' | 'this_week' | 'all';
type StatusFilter = 'all' | 'chua_diem_danh' | 'da_diem_danh';

type Loading<T> =
  | { readonly state: 'loading' }
  | { readonly state: 'error' }
  | { readonly state: 'ready'; readonly value: T };

/** The session with this id, read on its own (the page no longer loads every session to find one). */
function useSession(
  id: number,
  version: number,
): { loaded: Loading<Row | null> } {
  const api = useApiClient();
  const key = `${id}:${version}`;
  const [result, setResult] = useState<{
    key: string;
    value: Loading<Row | null>;
  }>();
  useEffect(() => {
    if (!id) return;
    let live = true;
    api
      .request<{ data: Row | null }>({
        path: 'buoiHoc/findOne',
        method: 'POST',
        json: { filter: { id } },
      })
      .then((response) => {
        if (live)
          setResult({
            key,
            value: { state: 'ready', value: response.data ?? null },
          });
      })
      .catch(() => {
        if (live) setResult({ key, value: { state: 'error' } });
      });
    return () => {
      live = false;
    };
  }, [api, id, key]);
  return {
    loaded: id && result?.key === key ? result.value : { state: 'loading' },
  };
}

/** The students of one class who are still studying: one request for the class, not for every student of the club. */
function useRoster(lopId: number): Loading<Row[]> {
  const api = useApiClient();
  const [result, setResult] = useState<{
    lopId: number;
    value: Loading<Row[]>;
  }>();
  useEffect(() => {
    if (!lopId) return;
    let live = true;
    api
      .request<{ data: Row[] }>({
        path: 'hocVien/findMany',
        method: 'POST',
        json: { filter: { lopId, trangThai: 'dang_hoc' }, limit: 100 },
      })
      .then((response) => {
        if (live)
          setResult({
            lopId,
            value: { state: 'ready', value: response.data },
          });
      })
      .catch(() => {
        if (live) setResult({ lopId, value: { state: 'error' } });
      });
    return () => {
      live = false;
    };
  }, [api, lopId]);
  return lopId && result?.lopId === lopId ? result.value : { state: 'loading' };
}

/** The "Điểm danh" tab: today's sessions, a session picker and the register of the chosen session. */
export function DiemDanhTab({
  tabs,
}: {
  /** The two tabs of the page, drawn under the page header. */
  readonly tabs: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const [params, setParams] = useSearchParams();
  const classes = useRows('lop').loaded;

  const { can: canRecord } = useCan({
    resource: { type: 'composite', id: 'edu.diemDanh' },
    action: 'record',
  });
  const { can: canGenerate } = useCan({
    resource: { type: 'composite', id: 'edu.buoiHoc' },
    action: 'manage',
  });

  // Downloading is a separate action from viewing (`edu.baoCao` `export`): a coach sees attendance but cannot take the file.
  const { can: canExport } = useCan({
    resource: { type: 'composite', id: 'edu.baoCao' },
    action: 'export',
  });

  const selectedId = Number(params.get('buoi')) || 0;
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [saved, setSaved] = useState<Record<number, Saved>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [content, setContent] = useState<Content>(EMPTY_CONTENT);
  const [scores, setScores] = useState<Record<number, string>>({});
  const [registered, setRegistered] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [contentBusy, setContentBusy] = useState(false);
  const [contentSaved, setContentSaved] = useState(false);
  const [generate, setGenerate] = useState<{
    lopId: string;
    tuNgay: string;
    denNgay: string;
  }>();
  const [sessionVersion, setSessionVersion] = useState(0);

  // The picker's filters: the time quick-filter, the class, the status and a search over the dates.
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [filterLop, setFilterLop] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const list = useListState();
  // The picker shows while no session is chosen, or when the person asks to change it.
  const [changing, setChanging] = useState(false);
  const showSessionSelector = changing || !selectedId;

  const todayStr = todayVn();
  const classRows = classes.state === 'ready' ? classes.rows : [];

  // Today's sessions (a club has far fewer than 100 a day), read on the server.
  const todayList = usePagedRows('buoiHoc', {
    page: 1,
    pageSize: 100,
    where: { ngay: todayStr },
    sortField: 'gioBatDau',
  });
  const todaySessions =
    todayList.loaded.state === 'ready' ? todayList.loaded.rows : [];

  // The picker: one page of 25 sessions, newest day first, filtered on the server.
  const week = periodOf('tuan', todayStr);
  const pickerWhere: Record<string, number | string> = {
    ...(filterLop !== 'all' ? { lopId: Number(filterLop) } : {}),
    ...(filterStatus === 'da_diem_danh' ? { trangThai: 'da_diem_danh' } : {}),
    ...(filterStatus === 'chua_diem_danh' ? { trangThai: 'du_kien' } : {}),
    ...(timeFilter === 'today' ? { ngay: todayStr } : {}),
    ...(timeFilter === 'yesterday' ? { ngay: addDays(todayStr, -1) } : {}),
  };
  const picker = usePagedRows('buoiHoc', {
    page: list.page,
    search: list.applied,
    searchFields: ['ngay'],
    where: pickerWhere,
    ...(timeFilter === 'this_week'
      ? { whereIn: { ngay: daysIn(week.from, week.to) } }
      : {}),
    sortField: 'ngay',
    descending: true,
  });

  const className = (id: unknown): string =>
    text(classRows.find((row) => row.id === id)?.ten);

  const { loaded: sessionState } = useSession(selectedId, sessionVersion);
  const session =
    sessionState.state === 'ready' && sessionState.value
      ? sessionState.value
      : undefined;
  const rosterState = useRoster(session ? Number(session.lopId) : 0);
  const roster: Row[] = rosterState.state === 'ready' ? rosterState.value : [];
  // The class is taught in blocks by group: one header per group that has students, the unsorted ones last. A class
  // whose students are in no group stays one plain list.
  const classGroups = useClassGroups(session ? Number(session.lopId) : 0);
  const blocks = groupBlocks(
    roster,
    classGroups.loaded.state === 'ready' ? classGroups.loaded.rows : [],
    t('edu.nhom.none'),
  );

  const reloadSessions = (): void => {
    todayList.reload();
    picker.reload();
    setSessionVersion((value) => value + 1);
  };
  // Tải dữ liệu điểm danh đã lưu
  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    api
      .request<{ data: Row[] }>({
        path: '/diemDanh/findMany',
        method: 'POST',
        json: { filter: { buoiHocId: selectedId }, limit: 100 },
      })
      .then((response) => {
        if (!live) return;
        const next: Record<number, Mark> = {};
        for (const row of response.data) {
          next[Number(row.hocVienId)] = {
            trangThai: text(row.trangThai) as Status,
            daLamBtvn: row.daLamBtvn === true,
            nhanXet: text(row.nhanXet),
          };
        }
        setMarks(next);
        setRegistered(new Set(Object.keys(next).map(Number)));
      })
      .catch(() => {
        if (!live) return;
        setMarks({});
        setRegistered(new Set());
      });
    return () => {
      live = false;
    };
  }, [api, selectedId]);

  // Tải nội dung bài dạy
  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    api
      .request<{
        data: {
          noiDung: Partial<Content>;
          yThuc: { hocVienId: number; diem: number }[];
        };
      }>({
        path: '/buoiHoc/noiDung/xem',
        method: 'POST',
        json: { buoiHocId: selectedId },
      })
      .then((response) => {
        if (!live) return;
        setContent({ ...EMPTY_CONTENT, ...response.data.noiDung });
        setScores(
          Object.fromEntries(
            response.data.yThuc.map((s) => [s.hocVienId, String(s.diem)]),
          ),
        );
      })
      .catch(() => {
        if (!live) return;
        setContent(EMPTY_CONTENT);
        setScores({});
      });
    return () => {
      live = false;
    };
  }, [api, selectedId]);

  const saveContent = async (): Promise<void> => {
    if (!session || contentBusy) return;
    setContentBusy(true);
    setContentSaved(false);
    setError(undefined);
    try {
      await post(api, '/buoiHoc/noiDung/luu', {
        buoiHocId: session.id,
        noiDung: content,
        yThuc: roster
          .filter((student) => registered.has(student.id))
          .map((student) => {
            const raw = (scores[student.id] ?? '').trim();
            return {
              hocVienId: student.id,
              diem: raw === '' ? null : Number(raw),
            };
          }),
      });
      setContentSaved(true);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setContentBusy(false);
    }
  };

  const markOf = (id: number): Mark =>
    marks[id] ?? { trangThai: 'co_mat', daLamBtvn: false, nhanXet: '' };

  const change = (id: number, patch: Partial<Mark>): void =>
    setMarks((current) => ({ ...current, [id]: { ...markOf(id), ...patch } }));

  const markAllPresent = (): void => {
    const next: Record<number, Mark> = {};
    for (const student of roster) {
      next[student.id] = { ...markOf(student.id), trangThai: 'co_mat' };
    }
    setMarks((curr) => ({ ...curr, ...next }));
  };

  const markAllHomework = (): void => {
    const next: Record<number, Mark> = {};
    for (const student of roster) {
      next[student.id] = { ...markOf(student.id), daLamBtvn: true };
    }
    setMarks((curr) => ({ ...curr, ...next }));
  };

  const appendTag = (studentId: number, tag: string): void => {
    const existing = markOf(studentId).nhanXet.trim();
    change(studentId, { nhanXet: existing ? `${existing}. ${tag}` : tag });
  };

  const exportCsv = async (): Promise<void> => {
    try {
      const stream = await api.stream({
        path: '/diemDanh/xuatCsv',
        method: 'POST',
        json: {
          lopId: filterLop !== 'all' ? Number(filterLop) : undefined,
        },
      });
      await saveCsvStream(stream, `diem-danh-${todayVn()}.csv`);
    } catch (err) {
      console.error(err);
    }
  };

  const save = async (): Promise<void> => {
    if (!session || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = (await post(api, '/diemDanh/luu', {
        buoiHocId: session.id,
        danhSach: roster.map((student) => {
          const mark = markOf(student.id);
          return {
            hocVienId: student.id,
            trangThai: mark.trangThai,
            daLamBtvn: mark.daLamBtvn,
            nhanXet: mark.nhanXet.trim() || null,
          };
        }),
      })) as { data: { danhSach: Saved[] } };
      setSaved(
        Object.fromEntries(response.data.danhSach.map((s) => [s.hocVienId, s])),
      );
      setRegistered(new Set(roster.map((student) => student.id)));
      reloadSessions();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  const pick = (row: Row): void => {
    setSaved({});
    setContentSaved(false);
    setError(undefined);
    setParams({ buoi: String(row.id) });
    setChanging(false);
  };

  const timeOptions = useMemo(
    () =>
      [
        ['today', 'edu.diemDanh.take.t.today'],
        ['yesterday', 'edu.diemDanh.take.t.yesterday'],
        ['this_week', 'edu.diemDanh.take.t.week'],
        ['all', 'edu.diemDanh.take.t.all'],
      ] as const,
    [],
  );

  const timeOf = (row: Row): string => formatTime(row.gioBatDau);

  return (
    <PageContainer className='mx-auto max-w-5xl pb-24'>
      <PageHeader
        title={t('edu.diemDanh.title')}
        description={t('edu.diemDanh.description')}
        actions={
          <div className='flex flex-wrap items-center gap-2'>
            <GenericImportDialog
              entity='diemDanh'
              title={t('edu.diemDanh.importTitle')}
              buttonLabel={t('edu.diemDanh.importCsv')}
              variant='outline'
              onSuccess={reloadSessions}
            />
            {canExport ? (
              <Button
                variant='outline'
                size='sm'
                onClick={() => void exportCsv()}
                className='gap-1.5'
              >
                <Download className='h-4 w-4' />
                {t('edu.diemDanh.exportCsv')}
              </Button>
            ) : null}
            {canGenerate ? (
              <Button
                size='sm'
                variant='outline'
                onClick={() =>
                  setGenerate({
                    lopId: '',
                    tuNgay: todayVn(),
                    denNgay: todayVn(),
                  })
                }
              >
                {t('edu.diemDanh.generate')}
              </Button>
            ) : null}
          </div>
        }
      />
      {tabs}

      {todayList.loaded.state === 'loading' &&
      picker.loaded.state === 'loading' ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      ) : todayList.loaded.state === 'error' ? (
        <div role='alert' className='flex flex-col items-start gap-3'>
          <p className='text-sm text-destructive'>
            {t('edu.common.loadError')}
          </p>
          <Button variant='outline' onClick={todayList.reload}>
            {t('edu.common.retry')}
          </Button>
        </div>
      ) : (
        <div className='flex flex-col gap-5'>
          {/* 1. Ca học hôm nay */}
          <div className='rounded-2xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 via-primary/[0.02] to-background p-4 shadow-sm'>
            <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
              <div className='flex items-center gap-2'>
                <span className='flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground'>
                  <Sparkles className='h-4 w-4' />
                </span>
                <h2 className='flex items-center gap-2 text-sm font-bold text-foreground'>
                  {t('edu.diemDanh.take.todayTitle', { date: todayStr })}
                  <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary'>
                    {t('edu.diemDanh.take.shifts', {
                      count: todaySessions.length,
                    })}
                  </span>
                </h2>
              </div>
              <div className='flex items-center gap-1 text-xs font-medium text-muted-foreground'>
                <Clock className='h-3.5 w-3.5 text-primary' />{' '}
                {t('edu.diemDanh.take.spotlightHint')}
              </div>
            </div>

            {todaySessions.length === 0 ? (
              <div className='rounded-xl border border-dashed bg-background/50 p-4 text-center text-xs text-muted-foreground'>
                {t('edu.diemDanh.take.noToday')}
              </div>
            ) : (
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3'>
                {todaySessions.map((row) => {
                  const isSelected = row.id === selectedId;
                  const isDone = row.trangThai === 'da_diem_danh';
                  return (
                    <button
                      type='button'
                      key={row.id}
                      onClick={() => pick(row)}
                      className={`group relative cursor-pointer overflow-hidden rounded-xl border p-3 text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/15 shadow-sm ring-2 ring-primary'
                          : 'border-border bg-card hover:border-primary/50 hover:shadow-sm'
                      }`}
                    >
                      <div className='flex items-center justify-between gap-1'>
                        <span className='truncate text-sm font-bold text-foreground'>
                          {className(row.lopId)}
                        </span>
                        <StatusBadge tone={isDone ? 'success' : 'warning'}>
                          {isDone
                            ? t('edu.diemDanh.take.marked')
                            : t('edu.diemDanh.take.notMarked')}
                        </StatusBadge>
                      </div>
                      <div className='mt-2 flex items-center justify-between text-xs text-muted-foreground'>
                        <span className='flex items-center gap-1 font-medium'>
                          <Clock className='h-3.5 w-3.5 text-primary' />
                          {timeOf(row)} -{' '}
                          {formatTime(row.gioKetThuc) || '20:00'}
                        </span>
                        <span className='font-semibold text-primary group-hover:underline'>
                          {isSelected
                            ? t('edu.diemDanh.take.picked')
                            : t('edu.diemDanh.take.enter')}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Ca học đang chọn, hoặc bộ chọn ca */}
          {selectedId > 0 && session && !showSessionSelector ? (
            <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4 shadow-sm'>
              <div className='flex items-center gap-3'>
                <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground shadow-sm'>
                  <Users className='h-5 w-5' />
                </div>
                <div>
                  <div className='flex items-center gap-2'>
                    <span className='text-base font-bold text-foreground'>
                      {t('edu.diemDanh.take.className', {
                        name: className(session.lopId),
                      })}
                    </span>
                    <StatusBadge
                      tone={
                        session.trangThai === 'da_diem_danh'
                          ? 'success'
                          : 'warning'
                      }
                    >
                      {session.trangThai === 'da_diem_danh'
                        ? t('edu.diemDanh.take.registerSaved')
                        : t('edu.diemDanh.take.registerUnsaved')}
                    </StatusBadge>
                  </div>
                  <p className='mt-0.5 text-xs text-muted-foreground'>
                    {t('edu.diemDanh.take.dateLine', {
                      date: text(session.ngay),
                      time: timeOf(session),
                      count: roster.length,
                    })}
                  </p>
                </div>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setChanging(true)}
                className='gap-1.5 text-xs'
              >
                <Filter className='h-3.5 w-3.5' />{' '}
                {t('edu.diemDanh.take.changeSession')}
              </Button>
            </div>
          ) : (
            <div className='flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm'>
              {selectedId > 0 && sessionState.state === 'error' ? (
                <p role='alert' className='text-sm text-destructive'>
                  {t('edu.diemDanh.take.sessionError')}
                </p>
              ) : null}
              <div className='flex flex-wrap items-center justify-between gap-2 border-b pb-3'>
                <div className='flex items-center gap-2'>
                  <Calendar className='h-4 w-4 text-primary' />
                  <h2 className='text-sm font-semibold tracking-wide text-foreground'>
                    {t('edu.diemDanh.take.lookup')}
                  </h2>
                </div>
                <div className='flex items-center gap-1 rounded-lg bg-muted p-1'>
                  {timeOptions.map(([value, label]) => (
                    <button
                      key={value}
                      type='button'
                      aria-pressed={timeFilter === value}
                      onClick={() => {
                        setTimeFilter(value);
                        list.setPage(1);
                      }}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                        timeFilter === value
                          ? 'bg-background text-primary shadow'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
              </div>

              <div className='grid grid-cols-1 gap-2.5 sm:grid-cols-3'>
                <div>
                  <label
                    htmlFor='dd-pick-lop'
                    className='mb-1 block text-xs font-medium text-muted-foreground'
                  >
                    {t('edu.diemDanh.take.lop')}
                  </label>
                  <select
                    id='dd-pick-lop'
                    value={filterLop}
                    onChange={(e) => {
                      setFilterLop(e.target.value);
                      list.setPage(1);
                    }}
                    className='h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm'
                  >
                    <option value='all'>
                      {t('edu.diemDanh.take.allClasses')} ({classRows.length})
                    </option>
                    {classRows.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {text(c.ten)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor='dd-pick-status'
                    className='mb-1 block text-xs font-medium text-muted-foreground'
                  >
                    {t('edu.diemDanh.take.statusLabel')}
                  </label>
                  <select
                    id='dd-pick-status'
                    value={filterStatus}
                    onChange={(e) => {
                      setFilterStatus(e.target.value as StatusFilter);
                      list.setPage(1);
                    }}
                    className='h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm'
                  >
                    <option value='all'>
                      {t('edu.diemDanh.take.allStatus')}
                    </option>
                    <option value='chua_diem_danh'>
                      {t('edu.diemDanh.take.notMarked')}
                    </option>
                    <option value='da_diem_danh'>
                      {t('edu.diemDanh.take.marked')}
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor='dd-pick-search'
                    className='mb-1 block text-xs font-medium text-muted-foreground'
                  >
                    {t('edu.diemDanh.take.searchLabel')}
                  </label>
                  <Input
                    id='dd-pick-search'
                    placeholder={t('edu.diemDanh.take.searchHint')}
                    value={list.search}
                    onChange={(e) => list.setSearch(e.target.value)}
                    className='h-9 text-sm'
                  />
                </div>
              </div>

              <div className='mt-1 rounded-lg border bg-muted/15 p-2'>
                {picker.loaded.state === 'loading' ? (
                  <p
                    role='status'
                    className='py-6 text-center text-xs text-muted-foreground'
                  >
                    {t('edu.common.loading')}
                  </p>
                ) : picker.loaded.state === 'error' ? (
                  <div
                    role='alert'
                    className='flex flex-col items-center gap-2 py-4'
                  >
                    <p className='text-sm text-destructive'>
                      {t('edu.common.loadError')}
                    </p>
                    <Button variant='outline' size='sm' onClick={picker.reload}>
                      {t('edu.common.retry')}
                    </Button>
                  </div>
                ) : picker.loaded.rows.length === 0 ? (
                  <p className='py-6 text-center text-xs text-muted-foreground'>
                    {t('edu.diemDanh.take.noMatch')}
                  </p>
                ) : (
                  <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3'>
                    {picker.loaded.rows.map((row) => {
                      const isSelected = row.id === selectedId;
                      const isDone = row.trangThai === 'da_diem_danh';
                      return (
                        <button
                          type='button'
                          key={row.id}
                          onClick={() => pick(row)}
                          className={`cursor-pointer rounded-lg border p-2.5 text-left transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/20'
                              : 'border-border bg-card hover:border-primary/50 hover:bg-muted/40'
                          }`}
                        >
                          <div className='flex items-center justify-between gap-1'>
                            <span className='truncate text-sm font-bold text-foreground'>
                              {className(row.lopId)}
                            </span>
                            <StatusBadge tone={isDone ? 'success' : 'warning'}>
                              {isDone
                                ? t('edu.diemDanh.take.savedShort')
                                : t('edu.diemDanh.take.unsavedShort')}
                            </StatusBadge>
                          </div>
                          <div className='mt-1 flex items-center justify-between text-xs text-muted-foreground'>
                            <span>📅 {text(row.ngay)}</span>
                            <span>⏰ {timeOf(row)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {picker.loaded.state === 'ready' && picker.total > 0 ? (
                  <Pager
                    page={list.page}
                    total={picker.total}
                    onPage={list.setPage}
                  />
                ) : null}
              </div>
            </div>
          )}

          {/* 3. Bảng điểm danh */}
          {session ? (
            <div className='overflow-x-auto rounded-xl border bg-card shadow-sm'>
              <div className='flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3'>
                <div className='flex items-center gap-2'>
                  <span className='text-sm font-bold text-foreground'>
                    {t('edu.diemDanh.take.rosterTitle', {
                      count: roster.length,
                    })}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    · {t('edu.diemDanh.take.quickHint')}
                  </span>
                </div>
                {canRecord && roster.length > 0 ? (
                  <div className='flex flex-wrap items-center gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={markAllPresent}
                      className='h-8 border-emerald-500/40 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/20'
                    >
                      {t('edu.diemDanh.take.allPresent')}
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={markAllHomework}
                      className='h-8 border-blue-500/40 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/20'
                    >
                      {t('edu.diemDanh.take.allHomework')}
                    </Button>
                    <Button
                      size='sm'
                      onClick={() => void save()}
                      disabled={busy}
                      className='h-8 gap-1 bg-primary text-xs font-bold shadow-sm'
                    >
                      <Save className='h-3.5 w-3.5' />
                      {busy ? t('edu.common.saving') : t('edu.diemDanh.save')}
                    </Button>
                  </div>
                ) : null}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-48'>
                      {t('edu.diemDanh.take.colStudent')}
                    </TableHead>
                    <TableHead className='w-36'>
                      {t('edu.diemDanh.status')}
                    </TableHead>
                    <TableHead className='w-24 text-center'>
                      {t('edu.diemDanh.take.colHomework')}
                    </TableHead>
                    <TableHead className='min-w-[280px]'>
                      {t('edu.diemDanh.take.colComment')}
                    </TableHead>
                    <TableHead className='w-20 text-center'>
                      {t('edu.diemDanh.awareness')}
                    </TableHead>
                    <TableHead className='w-32 text-center'>
                      {t('edu.diemDanh.balance')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blocks.map((block) => (
                    <Fragment key={block.key}>
                      {block.title ? (
                        <TableRow className='bg-muted/50 hover:bg-muted/50'>
                          <TableCell
                            colSpan={6}
                            className='py-1.5 text-xs font-semibold text-foreground'
                          >
                            {block.title}
                            <span className='ml-2 font-normal text-muted-foreground'>
                              {t('edu.nhom.blockCount', {
                                count: block.students.length,
                              })}
                            </span>
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {block.students.map((student) => {
                        const mark = markOf(student.id);
                        const result = saved[student.id];
                        const num = result
                          ? result.soBuoiConLai
                          : Number(student.soBuoiConLai);

                        return (
                          <TableRow
                            key={student.id}
                            className='hover:bg-muted/30'
                          >
                            <TableCell>
                              <div className='flex flex-col gap-0.5'>
                                <RecordLink
                                  to={`/hoc-vien/${student.id}`}
                                  target='_blank'
                                  className='text-sm font-bold text-foreground hover:underline'
                                >
                                  {text(student.hoTen)}
                                </RecordLink>
                                <span className='font-mono text-[11px] text-muted-foreground'>
                                  {t('edu.diemDanh.take.code', {
                                    code:
                                      text(student.ma) || `HV-${student.id}`,
                                  })}
                                </span>
                                {num < 0 && (
                                  <span className='inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400'>
                                    <AlertCircle className='h-3 w-3' />{' '}
                                    {t('edu.diemDanh.take.owes', {
                                      count: Math.abs(num),
                                    })}
                                  </span>
                                )}
                                {num >= 0 && num <= 2 && (
                                  <span className='inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400'>
                                    ⚠️{' '}
                                    {t('edu.diemDanh.take.lowWarn', {
                                      count: num,
                                    })}
                                  </span>
                                )}
                              </div>
                            </TableCell>

                            <TableCell>
                              <select
                                aria-label={t('edu.diemDanh.status')}
                                value={mark.trangThai}
                                disabled={!canRecord}
                                onChange={(event) =>
                                  change(student.id, {
                                    trangThai: event.target.value as Status,
                                  })
                                }
                                className={`h-8 w-full rounded-md border px-2 text-xs font-semibold ${
                                  mark.trangThai === 'co_mat'
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                    : mark.trangThai === 'vang_co_phep'
                                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                      : mark.trangThai === 'vang_khong_phep'
                                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400'
                                        : 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                                }`}
                              >
                                {STATUSES.map((status) => (
                                  <option key={status} value={status}>
                                    {t(`edu.diemDanh.s.${status}`)}
                                  </option>
                                ))}
                              </select>
                            </TableCell>

                            <TableCell className='text-center'>
                              <Checkbox
                                aria-label={t('edu.diemDanh.homework')}
                                checked={mark.daLamBtvn}
                                disabled={!canRecord}
                                onCheckedChange={(checked) =>
                                  change(student.id, {
                                    daLamBtvn: checked === true,
                                  })
                                }
                                className='h-5 w-5'
                              />
                            </TableCell>

                            <TableCell className='min-w-[280px]'>
                              <Input
                                aria-label={t('edu.diemDanh.comment')}
                                value={mark.nhanXet}
                                maxLength={500}
                                placeholder={t(
                                  'edu.diemDanh.take.commentPlaceholder',
                                )}
                                disabled={!canRecord}
                                onChange={(event) =>
                                  change(student.id, {
                                    nhanXet: event.target.value,
                                  })
                                }
                                className='h-8 text-xs'
                              />
                              {canRecord ? (
                                <div className='mt-1.5 flex flex-wrap gap-1'>
                                  {QUICK_TAGS.map((n) => {
                                    const tag = t(`edu.diemDanh.take.tag.${n}`);
                                    return (
                                      <button
                                        key={n}
                                        type='button'
                                        onClick={() =>
                                          appendTag(student.id, tag)
                                        }
                                        className='rounded-md border border-muted bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary'
                                      >
                                        +{tag}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </TableCell>

                            <TableCell className='text-center'>
                              <Input
                                aria-label={t('edu.diemDanh.awareness')}
                                title={t('edu.diemDanh.awarenessHint')}
                                type='number'
                                min={0}
                                max={10}
                                step={1}
                                className='mx-auto h-8 w-14 text-center text-sm font-bold'
                                value={scores[student.id] ?? ''}
                                disabled={
                                  !canRecord || !registered.has(student.id)
                                }
                                onChange={(event) =>
                                  setScores((current) => ({
                                    ...current,
                                    [student.id]: event.target.value,
                                  }))
                                }
                              />
                            </TableCell>

                            <TableCell className='text-center'>
                              {num < 0 ? (
                                <span className='inline-block rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-400'>
                                  🔴{' '}
                                  {t('edu.diemDanh.take.balanceOwe', {
                                    count: Math.abs(num),
                                  })}
                                </span>
                              ) : num <= 2 ? (
                                <span className='inline-block rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400'>
                                  🟡{' '}
                                  {t('edu.diemDanh.take.balanceLeft', {
                                    count: num,
                                  })}
                                </span>
                              ) : (
                                <span className='inline-block rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400'>
                                  🟢{' '}
                                  {t('edu.diemDanh.take.balanceLeft', {
                                    count: num,
                                  })}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>

              {rosterState.state === 'ready' && roster.length === 0 ? (
                <p className='p-6 text-center text-sm text-muted-foreground'>
                  {t('edu.diemDanh.noStudents')}
                </p>
              ) : null}
              {rosterState.state === 'error' ? (
                <p
                  role='alert'
                  className='p-6 text-center text-sm text-destructive'
                >
                  {t('edu.common.loadError')}
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className='flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive'>
              <AlertCircle className='h-4 w-4 shrink-0' />
              <span>{error}</span>
            </div>
          ) : null}

          {/* 4. Nội dung buổi học */}
          {session ? (
            <section
              aria-label={t('edu.diemDanh.content.title')}
              className='flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm'
            >
              <div className='flex items-center justify-between border-b pb-2.5'>
                <h2 className='flex items-center gap-2 text-sm font-bold text-foreground'>
                  📖 {t('edu.diemDanh.content.title')}
                </h2>
                {contentSaved && (
                  <span className='flex items-center gap-1 text-xs font-semibold text-emerald-600'>
                    <CheckCircle2 className='h-3.5 w-3.5' />{' '}
                    {t('edu.diemDanh.content.saved')}
                  </span>
                )}
              </div>
              <div className='grid gap-3 sm:grid-cols-2'>
                {CONTENT_FIELDS.map((field) => (
                  <Field
                    key={field}
                    id={`dd-nd-${field}`}
                    label={t(`edu.diemDanh.content.${field}`)}
                  >
                    <Textarea
                      id={`dd-nd-${field}`}
                      value={content[field]}
                      maxLength={2000}
                      disabled={!canRecord}
                      rows={3}
                      placeholder={t('edu.diemDanh.take.contentPlaceholder', {
                        field: t(`edu.diemDanh.content.${field}`).toLowerCase(),
                      })}
                      onChange={(event) =>
                        setContent((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                      className='text-xs'
                    />
                  </Field>
                ))}
              </div>
              {canRecord ? (
                <div className='flex items-center gap-3 pt-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => void saveContent()}
                    disabled={contentBusy}
                    className='text-xs font-semibold'
                  >
                    {contentBusy
                      ? t('edu.common.saving')
                      : t('edu.diemDanh.content.save')}
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* 5. Thanh lưu cố định ở đáy */}
          {session && canRecord && roster.length > 0 && (
            <div className='fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 px-6 py-3 shadow-lg backdrop-blur'>
              <div className='mx-auto flex max-w-5xl items-center justify-between'>
                <div className='flex items-center gap-3'>
                  <span className='text-sm font-bold text-foreground'>
                    {t('edu.diemDanh.take.stickyLine', {
                      name: className(session.lopId),
                      date: text(session.ngay),
                    })}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    {t('edu.diemDanh.take.stickyCount', {
                      count: roster.length,
                    })}
                  </span>
                </div>
                <div className='flex items-center gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={markAllPresent}
                    className='text-xs'
                  >
                    {t('edu.diemDanh.take.allPresent')}
                  </Button>
                  <Button
                    size='sm'
                    onClick={() => void save()}
                    disabled={busy}
                    className='gap-1.5 bg-primary px-4 font-bold text-primary-foreground shadow-md'
                  >
                    <Save className='h-4 w-4' />
                    {busy ? t('edu.common.saving') : t('edu.diemDanh.save')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {generate ? (
        <FormDialog
          open
          title={t('edu.diemDanh.generate')}
          description={t('edu.diemDanh.generateHint')}
          onClose={() => setGenerate(undefined)}
          onSubmit={async () => {
            await post(api, '/buoiHoc/taoTheoLich', {
              lopId: Number(generate.lopId),
              tuNgay: generate.tuNgay,
              denNgay: generate.denNgay,
            });
            reloadSessions();
          }}
        >
          <SelectField
            id='gen-lop'
            label={t('edu.hocVien.lop')}
            value={generate.lopId}
            required
            onChange={(lopId) => setGenerate({ ...generate, lopId })}
            options={classRows
              .filter((row) => row.trangThai !== 'da_dong')
              .map((row) => ({
                value: String(row.id),
                label: text(row.ten),
              }))}
          />
          <TextField
            id='gen-from'
            label={t('edu.diemDanh.from')}
            type='date'
            value={generate.tuNgay}
            required
            onChange={(tuNgay) => setGenerate({ ...generate, tuNgay })}
          />
          <TextField
            id='gen-to'
            label={t('edu.diemDanh.to')}
            type='date'
            value={generate.denNgay}
            required
            onChange={(denNgay) => setGenerate({ ...generate, denNgay })}
          />
        </FormDialog>
      ) : null}
    </PageContainer>
  );
}
