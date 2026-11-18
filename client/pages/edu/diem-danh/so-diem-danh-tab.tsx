import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  readTableUrlState,
  useTableUrlState,
} from '#hooks/use-table-url-state';
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Percent,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';
import { Input } from '#components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';

import { MetricCard } from '../edu-ui-parts.js';
import { FilterSelect } from '../filter-select.js';
import { formatTime } from '../format.js';
import { Pager } from '../list-page.js';
import { useUrlState } from '../url-state.js';
import {
  PAGE_SIZE,
  text,
  todayVn,
  useErrorMessage,
  useRequest,
  useRows,
  useRowsByIds,
  usePagedRows,
  type Row,
} from '../kit.js';
import {
  addDays,
  displayDay,
  isDay,
  periodOf,
  shiftAnchor,
  shiftCustom,
  spanDays,
  PERIOD_KINDS,
  type Period,
  type PeriodKind,
} from './periods.js';

const STATUSES = [
  'co_mat',
  'vang_co_phep',
  'vang_khong_phep',
  'hoc_bu',
] as const;
const VIEWS = ['buoi', 'hocVien', 'giaoVien'] as const;
type View = (typeof VIEWS)[number];

/** The longest period the server answers (`MAX_RANGE_DAYS` in `server/edu/so-diem-danh.ts`). */
const MAX_DAYS = 366;
const DEFAULT_KIND: PeriodKind = 'tuan';
/** Pages of 25 rows, the size the server pages are read in; the page number is the only table state. */
const TABLE_OPTIONS = {
  defaultPageSize: PAGE_SIZE,
  pageSizeOptions: [PAGE_SIZE],
  sortColumns: [],
} as const;

interface Summary {
  readonly soCa: number;
  readonly soLuot: number;
  readonly coMat: number;
  readonly vangCoPhep: number;
  readonly vangKhongPhep: number;
  readonly hocBu: number;
  readonly tyLe: number;
  readonly soHocVien?: number;
}

interface Register {
  readonly data: readonly Row[];
  readonly meta: { readonly count: number; readonly tongHop: Summary };
}

type Loaded =
  | { readonly state: 'loading' }
  | { readonly state: 'error'; readonly error: unknown }
  | { readonly state: 'ready'; readonly value: Register };

/** The state of the register, kept in the address (`useUrlState`) so a link or a refresh shows the same list. */
function useRegisterParams() {
  const { values, set } = useUrlState({
    ky: '',
    ngay: '',
    tu: '',
    den: '',
    xem: 'buoi',
    coSo: '',
    lop: '',
    gv: '',
    hv: '',
    tt: '',
  });
  const today = todayVn();
  const kind: PeriodKind = PERIOD_KINDS.includes(values.ky as PeriodKind)
    ? (values.ky as PeriodKind)
    : DEFAULT_KIND;
  const anchor = isDay(values.ngay) ? values.ngay : today;
  const custom: Period | undefined =
    isDay(values.tu) && isDay(values.den)
      ? { from: values.tu, to: values.den }
      : undefined;
  const period: Period =
    kind === 'tuyChon'
      ? (custom ?? { from: addDays(today, -6), to: today })
      : periodOf(kind, anchor);
  const view: View = VIEWS.includes(values.xem as View)
    ? (values.xem as View)
    : 'buoi';
  const number = (value: string): number | undefined => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : undefined;
  };
  const filters = {
    coSoId: number(values.coSo),
    lopId: number(values.lop),
    hlvId: values.gv || undefined,
    hocVienId: number(values.hv),
    trangThai: (STATUSES as readonly string[]).includes(values.tt)
      ? values.tt
      : undefined,
  };
  return { kind, anchor, period, view, filters, today, update: set };
}

function useRegisterData(body: Record<string, unknown> | null): {
  loaded: Loaded;
  reload: () => void;
} {
  const api = useApiClient();
  const [version, setVersion] = useState(0);
  const json = body ? JSON.stringify(body) : '';
  const key = `${json}:${version}`;
  const [done, setDone] = useState<{ key: string; value: Loaded }>();
  useEffect(() => {
    if (!json) return;
    let live = true;
    api
      .request<Register>({
        path: 'diemDanh/traCuu',
        method: 'POST',
        json: JSON.parse(json) as unknown,
      })
      .then((response) => {
        if (live) setDone({ key, value: { state: 'ready', value: response } });
      })
      .catch((error: unknown) => {
        if (live) setDone({ key, value: { state: 'error', error } });
      });
    return () => {
      live = false;
    };
  }, [api, json, key]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return {
    loaded: json && done?.key === key ? done.value : { state: 'loading' },
    reload,
  };
}

/** Finds a student by name or code and picks one; the choice is the `hv` parameter of the URL. */
function StudentFilter(props: {
  readonly value: number | undefined;
  readonly onChange: (id: number | undefined) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setApplied(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const found = usePagedRows('hocVien', {
    page: 1,
    pageSize: 8,
    search: applied,
    searchFields: ['hoTen', 'ma'],
  });
  const chosen = useRowsByIds('hocVien', props.value ? [props.value] : []);
  const chosenRow = props.value ? chosen.get(props.value) : undefined;
  const suggestions =
    applied && found.loaded.state === 'ready' ? found.loaded.rows : undefined;

  if (props.value) {
    return (
      <div className='flex h-8 min-w-44 items-center justify-between gap-2 rounded-lg border border-input px-2.5 text-sm'>
        <span className='truncate'>
          {chosenRow ? text(chosenRow.hoTen) : `#${props.value}`}
        </span>
        <button
          type='button'
          aria-label={t('edu.diemDanh.so.f.clearStudent')}
          className='text-muted-foreground hover:text-foreground'
          onClick={() => props.onChange(undefined)}
        >
          ×
        </button>
      </div>
    );
  }
  return (
    <div className='relative'>
      <Input
        aria-label={t('edu.diemDanh.so.f.student')}
        className='h-8 w-64 text-sm'
        placeholder={t('edu.diemDanh.so.f.studentSearch')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {suggestions ? (
        <ul className='absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md'>
          {suggestions.length === 0 ? (
            <li className='px-2 py-1.5 text-muted-foreground'>
              {t('edu.diemDanh.so.f.noStudent')}
            </li>
          ) : (
            suggestions.map((row) => (
              <li key={row.id}>
                <button
                  type='button'
                  className='flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent'
                  onClick={() => {
                    props.onChange(row.id);
                    setSearch('');
                    setApplied('');
                  }}
                >
                  <span className='truncate'>{text(row.hoTen)}</span>
                  <span className='font-mono text-xs text-muted-foreground'>
                    {text(row.ma)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** The "Sổ điểm danh" tab: a lookup of attendance over a period, by session, student or teacher. */
export function SoDiemDanhTab({
  tabs,
}: {
  /** The two tabs of the page, drawn under the page header. */
  readonly tabs: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const { kind, anchor, period, view, filters, today, update } =
    useRegisterParams();

  const branches = useRows('coSo').loaded;
  const classes = useRows('lop').loaded;
  const teachers = useRequest<readonly { id: string; ten: string }[]>(
    'diemDanh/giaoVien',
    {},
  ).result;
  const branchRows = branches.state === 'ready' ? branches.rows : [];
  const classRows = classes.state === 'ready' ? classes.rows : [];
  const teacherRows = teachers.state === 'ready' ? teachers.data : [];
  const classOptions = filters.coSoId
    ? classRows.filter((row) => row.coSoId === filters.coSoId)
    : classRows;

  const spanTooLong = spanDays(period.from, period.to) > MAX_DAYS;
  const spanReversed = period.to < period.from;
  const rangeProblem = spanReversed
    ? t('edu.diemDanh.so.rangeInvalid')
    : spanTooLong
      ? t('edu.diemDanh.so.rangeTooLong')
      : undefined;

  // The table's position (page) lives in the URL too; the total corrects a page beyond the last.
  const [searchParams] = useSearchParams();
  const { paginationState } = readTableUrlState(searchParams, TABLE_OPTIONS);
  const { pageIndex } = paginationState;

  const body = rangeProblem
    ? null
    : {
        tuNgay: period.from,
        denNgay: period.to,
        cheDo: view,
        ...(filters.coSoId ? { coSoId: filters.coSoId } : {}),
        ...(filters.lopId ? { lopId: filters.lopId } : {}),
        ...(filters.hlvId ? { hlvId: filters.hlvId } : {}),
        ...(filters.hocVienId ? { hocVienId: filters.hocVienId } : {}),
        ...(filters.trangThai ? { trangThai: filters.trangThai } : {}),
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
      };
  const { loaded, reload } = useRegisterData(body);
  const total = loaded.state === 'ready' ? loaded.value.meta.count : undefined;
  // The total corrects a page beyond the last one (a filter that matches less than before).
  const table = useTableUrlState({
    ...TABLE_OPTIONS,
    ...(total === undefined ? {} : { rowCount: total }),
    active: total !== undefined,
  });

  const className = (id: unknown): string =>
    text(classRows.find((row) => row.id === id)?.ten);
  const teacherName = (id: unknown, fallback = ''): string =>
    teacherRows.find((row) => row.id === id)?.ten ?? fallback;

  // Arrows move the period by its own length; a custom period moves by the days it holds.
  const step = (direction: -1 | 1): void => {
    if (kind === 'tuyChon') {
      const next = shiftCustom(period, direction);
      update({ tu: next.from, den: next.to });
    } else {
      update({ ngay: shiftAnchor(kind, anchor, direction) });
    }
  };
  const chooseKind = (next: PeriodKind): void => {
    if (next === 'tuyChon')
      update({ ky: next, tu: period.from, den: period.to, ngay: undefined });
    else update({ ky: next, ngay: undefined, tu: undefined, den: undefined });
  };

  const summary =
    loaded.state === 'ready' ? loaded.value.meta.tongHop : undefined;
  const absent = summary ? summary.vangCoPhep + summary.vangKhongPhep : 0;
  const rangeLabel =
    period.from === period.to
      ? displayDay(period.from)
      : `${displayDay(period.from)} – ${displayDay(period.to)}`;
  const hasFilters = Object.values(filters).some(
    (value) => value !== undefined,
  );

  const statusBadge = (value: unknown): ReactElement => (
    <StatusBadge
      tone={value === 'da_diem_danh' ? 'success' : 'warning'}
      size='sm'
    >
      {t(`edu.diemDanh.so.sessionState.${text(value) || 'du_kien'}`)}
    </StatusBadge>
  );
  const counts = (row: Row): ReactElement => (
    <>
      <TableCell className='text-right tabular-nums'>
        {text(row.coMat)}
      </TableCell>
      <TableCell className='text-right tabular-nums'>
        {text(row.vangCoPhep)}
      </TableCell>
      <TableCell className='text-right tabular-nums'>
        {text(row.vangKhongPhep)}
      </TableCell>
      <TableCell className='text-right tabular-nums'>
        {text(row.hocBu)}
      </TableCell>
    </>
  );
  const countHeads = (
    <>
      {STATUSES.map((status) => (
        <TableHead key={status} className='text-right'>
          {t(`edu.diemDanh.s.${status}`)}
        </TableHead>
      ))}
    </>
  );

  const rows = loaded.state === 'ready' ? loaded.value.data : [];

  return (
    <PageContainer className='mx-auto max-w-6xl space-y-5'>
      <PageHeader
        title={t('edu.diemDanh.title')}
        description={t('edu.diemDanh.so.description')}
      />
      {tabs}

      {/* Thời gian */}
      <div className='flex flex-wrap items-center gap-3'>
        <Tabs
          value={kind}
          onValueChange={(value) => chooseKind(value as PeriodKind)}
        >
          <TabsList
            className='flex-wrap'
            aria-label={t('edu.diemDanh.so.period')}
          >
            {PERIOD_KINDS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`edu.diemDanh.so.p.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className='flex items-center gap-1'>
          <Button
            variant='outline'
            size='icon'
            aria-label={t('edu.diemDanh.so.prev')}
            onClick={() => step(-1)}
          >
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <span
            className='min-w-40 text-center text-sm font-medium'
            aria-live='polite'
          >
            {rangeLabel}
          </span>
          <Button
            variant='outline'
            size='icon'
            aria-label={t('edu.diemDanh.so.next')}
            onClick={() => step(1)}
          >
            <ChevronRight className='h-4 w-4' />
          </Button>
        </div>
        {kind === 'tuyChon' ? (
          <div className='flex items-center gap-2'>
            <Input
              type='date'
              aria-label={t('edu.diemDanh.from')}
              className='h-9 w-40'
              value={period.from}
              onChange={(event) => {
                if (isDay(event.target.value))
                  update({ tu: event.target.value, den: period.to });
              }}
            />
            <span aria-hidden='true'>–</span>
            <Input
              type='date'
              aria-label={t('edu.diemDanh.to')}
              className='h-9 w-40'
              value={period.to}
              onChange={(event) => {
                if (isDay(event.target.value))
                  update({ tu: period.from, den: event.target.value });
              }}
            />
          </div>
        ) : null}
        {kind !== 'tuyChon' && anchor !== today ? (
          <Button
            variant='ghost'
            size='sm'
            onClick={() => update({ ngay: undefined })}
          >
            {t('edu.diemDanh.so.p.homNay')}
          </Button>
        ) : null}
      </div>
      {rangeProblem ? (
        <p role='alert' className='text-sm text-destructive'>
          {rangeProblem}
        </p>
      ) : null}

      {/* Bộ lọc */}
      <div className='flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3'>
        <FilterSelect
          label={t('edu.diemDanh.so.f.branch')}
          allLabel={t('edu.diemDanh.so.f.allBranches')}
          value={filters.coSoId ? String(filters.coSoId) : ''}
          onChange={(coSo) => update({ coSo, lop: undefined })}
          options={branchRows.map((row) => ({
            value: String(row.id),
            label: text(row.ten),
          }))}
        />
        <FilterSelect
          label={t('edu.diemDanh.so.f.class')}
          allLabel={t('edu.diemDanh.so.f.allClasses')}
          value={filters.lopId ? String(filters.lopId) : ''}
          onChange={(lop) => update({ lop })}
          options={classOptions.map((row) => ({
            value: String(row.id),
            label: text(row.ten),
          }))}
        />
        <FilterSelect
          label={t('edu.diemDanh.so.f.teacher')}
          allLabel={t('edu.diemDanh.so.f.allTeachers')}
          value={filters.hlvId ?? ''}
          onChange={(gv) => update({ gv })}
          options={teacherRows.map((row) => ({
            value: row.id,
            label: row.ten,
          }))}
        />
        <StudentFilter
          value={filters.hocVienId}
          onChange={(id) => update({ hv: id ? String(id) : undefined })}
        />
        <FilterSelect
          label={t('edu.diemDanh.so.f.status')}
          allLabel={t('edu.diemDanh.so.f.allStatuses')}
          value={filters.trangThai ?? ''}
          onChange={(tt) => update({ tt })}
          options={STATUSES.map((status) => ({
            value: status,
            label: t(`edu.diemDanh.s.${status}`),
          }))}
        />
        {/*
          Phase 3 (class groups) adds the "Nhóm" filter here: one more FilterSelect, the `nhom` key of `useUrlState`
          in `useRegisterParams`, and `nhomId` in the request body of `POST /diemDanh/traCuu`.
        */}
        {hasFilters ? (
          <Button
            variant='ghost'
            size='sm'
            onClick={() =>
              update({
                coSo: undefined,
                lop: undefined,
                gv: undefined,
                hv: undefined,
                tt: undefined,
              })
            }
          >
            {t('edu.diemDanh.so.f.clear')}
          </Button>
        ) : null}
      </div>

      {/* Tổng hợp */}
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <MetricCard
          title={t('edu.diemDanh.so.k.sessions')}
          value={summary ? summary.soCa : '–'}
          icon={CalendarCheck}
          tone='primary'
        />
        <MetricCard
          title={
            view === 'hocVien'
              ? t('edu.diemDanh.so.k.students')
              : t('edu.diemDanh.so.k.marks')
          }
          value={
            summary
              ? view === 'hocVien'
                ? (summary.soHocVien ?? 0)
                : summary.soLuot
              : '–'
          }
          subtitle={
            summary && view === 'hocVien'
              ? `${summary.soLuot} ${t('edu.diemDanh.so.k.marks').toLowerCase()}`
              : undefined
          }
          icon={Users}
          tone='info'
        />
        <MetricCard
          title={t('edu.diemDanh.so.k.rate')}
          value={summary ? `${summary.tyLe}%` : '–'}
          subtitle={t('edu.diemDanh.so.k.rateHint')}
          icon={Percent}
          tone='success'
        />
        <MetricCard
          title={t('edu.diemDanh.so.k.absent')}
          value={summary ? absent : '–'}
          subtitle={
            summary
              ? t('edu.diemDanh.so.k.absentHint', {
                  excused: summary.vangCoPhep,
                  unexcused: summary.vangKhongPhep,
                })
              : undefined
          }
          icon={summary && absent === 0 ? UserCheck : UserX}
          tone={absent > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {/* Cách xem */}
      <Tabs
        value={view}
        onValueChange={(value) =>
          update({ xem: value === 'buoi' ? undefined : String(value) })
        }
      >
        <TabsList aria-label={t('edu.diemDanh.so.v.label')}>
          {VIEWS.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`edu.diemDanh.so.v.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {(filters.hocVienId || filters.trangThai) && view === 'buoi' ? (
        <p className='text-xs text-muted-foreground'>
          {t('edu.diemDanh.so.sessionsOnly')}
        </p>
      ) : null}

      {/* Bảng */}
      {rangeProblem ? null : loaded.state === 'loading' ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      ) : loaded.state === 'error' ? (
        <div role='alert' className='flex flex-col items-start gap-3'>
          <p className='text-sm text-destructive'>
            {loaded.error instanceof ApiClientError
              ? message(loaded.error)
              : t('edu.common.loadError')}
          </p>
          <Button variant='outline' onClick={reload}>
            {t('edu.common.retry')}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('edu.diemDanh.so.emptyTitle')}</EmptyTitle>
            <EmptyDescription>
              {t('edu.diemDanh.so.emptyHint')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              {view === 'buoi' ? (
                <TableRow>
                  <TableHead>{t('edu.diemDanh.so.c.date')}</TableHead>
                  <TableHead>{t('edu.diemDanh.so.c.time')}</TableHead>
                  <TableHead>{t('edu.diemDanh.so.c.class')}</TableHead>
                  <TableHead>{t('edu.diemDanh.so.c.teacher')}</TableHead>
                  <TableHead>{t('edu.diemDanh.so.c.session')}</TableHead>
                  {countHeads}
                  <TableHead className='text-right'>
                    {t('edu.diemDanh.so.c.total')}
                  </TableHead>
                </TableRow>
              ) : view === 'hocVien' ? (
                <TableRow>
                  <TableHead>{t('edu.diemDanh.so.c.code')}</TableHead>
                  <TableHead>{t('edu.diemDanh.so.c.student')}</TableHead>
                  <TableHead>{t('edu.diemDanh.so.c.class')}</TableHead>
                  {countHeads}
                  <TableHead className='text-right'>
                    {t('edu.diemDanh.so.c.total')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('edu.diemDanh.so.c.rate')}
                  </TableHead>
                </TableRow>
              ) : (
                <TableRow>
                  <TableHead>{t('edu.diemDanh.so.c.teacher')}</TableHead>
                  <TableHead className='text-right'>
                    {t('edu.diemDanh.so.c.shifts')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('edu.diemDanh.so.c.shiftsMarked')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('edu.diemDanh.so.c.marks')}
                  </TableHead>
                  {countHeads}
                  <TableHead className='text-right'>
                    {t('edu.diemDanh.so.c.rate')}
                  </TableHead>
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {rows.map((row) =>
                view === 'buoi' ? (
                  <TableRow key={text(row.buoiHocId)}>
                    <TableCell>
                      <RecordLink to={`/diem-danh?buoi=${text(row.buoiHocId)}`}>
                        {displayDay(text(row.ngay))}
                      </RecordLink>
                    </TableCell>
                    <TableCell>{formatTime(row.gioBatDau)}</TableCell>
                    <TableCell>{className(row.lopId)}</TableCell>
                    <TableCell>
                      {row.hlvId
                        ? teacherName(row.hlvId, text(row.hlvId))
                        : t('edu.diemDanh.so.noTeacher')}
                    </TableCell>
                    <TableCell>{statusBadge(row.trangThai)}</TableCell>
                    {counts(row)}
                    <TableCell className='text-right font-medium tabular-nums'>
                      {text(row.tong)}
                    </TableCell>
                  </TableRow>
                ) : view === 'hocVien' ? (
                  <TableRow key={text(row.hocVienId)}>
                    <TableCell className='font-mono text-xs'>
                      {text(row.ma)}
                    </TableCell>
                    <TableCell>
                      <RecordLink to={`/hoc-vien/${text(row.hocVienId)}`}>
                        {text(row.hoTen) || `#${text(row.hocVienId)}`}
                      </RecordLink>
                    </TableCell>
                    <TableCell>{className(row.lopId)}</TableCell>
                    {counts(row)}
                    <TableCell className='text-right font-medium tabular-nums'>
                      {text(row.tong)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {text(row.tyLe)}%
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={text(row.hlvId) || 'none'}>
                    <TableCell>
                      {row.hlvId
                        ? text(row.hlvTen) || text(row.hlvId)
                        : t('edu.diemDanh.so.noTeacher')}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {text(row.soCa)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {text(row.soCaDaDiemDanh)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {text(row.soLuot)}
                    </TableCell>
                    {counts(row)}
                    <TableCell className='text-right tabular-nums'>
                      {text(row.tyLe)}%
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
          <Pager
            page={pageIndex + 1}
            total={total ?? 0}
            onPage={(page) =>
              table.onPaginationChange({
                pageIndex: page - 1,
                pageSize: PAGE_SIZE,
              })
            }
          />
        </div>
      )}
      {table.error ? (
        <p role='alert' className='text-sm text-destructive'>
          {table.error.message}
        </p>
      ) : null}
    </PageContainer>
  );
}
