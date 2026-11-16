import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, Search } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { RecordLink } from '#components/record-link';
import { Button, buttonVariants } from '#components/ui/button';
import { Card, CardContent } from '#components/ui/card';
import { Input } from '#components/ui/input';

import { SessionBalanceBadge } from '../edu-ui-parts.js';
import { text, usePagedRows, useRequest, useRows, type Row } from '../kit.js';
import { RowsTable } from '../list-page.js';

import { StudentTuition } from './student-tuition.js';

/**
 * The cashier: find a student (searched and paged on the server), then work on that student's tuition. Which student
 * is open lives in the address (`?hocVien=`), so a link from the home page, a report or a student's file opens the
 * cashier on the right student, and the browser's back button returns to the list.
 */
export function Cashier(props: {
  readonly hocVienId: number | undefined;
  /** The search a link brought along (`?search=`). */
  readonly initialSearch: string;
  readonly onSelect: (hocVienId: number | undefined) => void;
}): ReactElement {
  return props.hocVienId === undefined ? (
    <StudentPicker
      initialSearch={props.initialSearch}
      onSelect={props.onSelect}
    />
  ) : (
    <OpenStudent
      key={props.hocVienId}
      hocVienId={props.hocVienId}
      onBack={() => props.onSelect(undefined)}
    />
  );
}

function StudentPicker(props: {
  readonly initialSearch: string;
  readonly onSelect: (hocVienId: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = useState(props.initialSearch);
  const [applied, setApplied] = useState(props.initialSearch);
  const [page, setPage] = useState(1);
  // The request follows the box after a short pause, so a request is not sent for every key.
  useEffect(() => {
    if (search === applied) return undefined;
    const timer = setTimeout(() => {
      setApplied(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, applied]);
  const students = usePagedRows('hocVien', {
    page,
    search: applied,
    searchFields: ['ma', 'hoTen'],
  });
  const classes = useRows('lop').loaded;
  const className = (lopId: unknown): string =>
    classes.state === 'ready'
      ? text(classes.rows.find((row) => row.id === lopId)?.ten)
      : '';
  return (
    <div className='flex flex-col gap-4'>
      <div className='relative max-w-md'>
        <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          type='search'
          value={search}
          aria-label={t('edu.hocPhi.searchLabel')}
          placeholder={t('edu.hocPhi.searchLabel')}
          className='pl-8'
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <RowsTable
        loaded={students.loaded}
        onRetry={students.reload}
        emptyTitle={t('edu.hocVien.empty')}
        emptyHint={t('edu.hocVien.emptyHint')}
        paging={{ page, total: students.total, onPage: setPage }}
        columns={[
          {
            key: 'ma',
            label: t('edu.hocVien.ma'),
            render: (row) => (
              <span className='font-mono text-xs'>{text(row.ma)}</span>
            ),
          },
          {
            key: 'hoTen',
            label: t('edu.hocVien.hoTen'),
            render: (row) => (
              <RecordLink to={`/hoc-vien/${row.id}`}>
                {text(row.hoTen)}
              </RecordLink>
            ),
          },
          {
            key: 'lop',
            label: t('edu.hocPhi.class'),
            render: (row) => className(row.lopId),
          },
          {
            key: 'soBuoiConLai',
            label: t('edu.diemDanh.balance'),
            render: (row) => (
              <SessionBalanceBadge
                size='sm'
                balance={
                  row.soBuoiConLai == null ? null : Number(row.soBuoiConLai)
                }
              />
            ),
          },
        ]}
        rowActions={(row) => (
          <Button
            size='sm'
            variant='outline'
            onClick={() => props.onSelect(row.id)}
          >
            {t('edu.hocPhi.open')}
          </Button>
        )}
      />
    </div>
  );
}

function OpenStudent(props: {
  readonly hocVienId: number;
  readonly onBack: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { result, reload, lastData } = useRequest<Row | null>(
    'hocVien/findOne',
    { filter: { id: props.hocVienId } },
  );
  // The student stays on screen while it is read again after a payment or an adjustment.
  const student = result.state === 'ready' ? result.data : (lastData ?? null);
  const classes = useRows('lop').loaded;
  const back = (
    <Button
      variant='ghost'
      size='sm'
      className='self-start'
      onClick={props.onBack}
    >
      <ArrowLeft />
      {t('edu.hocPhi.backToList')}
    </Button>
  );
  if (!student) {
    return (
      <div className='flex flex-col gap-4'>
        {back}
        {result.state === 'loading' ? (
          <p role='status' className='text-sm text-muted-foreground'>
            {t('edu.common.loading')}
          </p>
        ) : result.state === 'error' && !result.forbidden ? (
          <div role='alert' className='flex flex-col items-start gap-3'>
            <p className='text-sm text-destructive'>
              {t('edu.common.loadError')}
            </p>
            <Button variant='outline' onClick={reload}>
              {t('edu.common.retry')}
            </Button>
          </div>
        ) : (
          <p role='alert' className='text-sm text-muted-foreground'>
            {t('edu.hocPhi.studentMissing')}
          </p>
        )}
      </div>
    );
  }
  const classRow =
    classes.state === 'ready'
      ? classes.rows.find((row) => row.id === student.lopId)
      : undefined;
  return (
    <div className='flex flex-col gap-4'>
      {back}
      <Card>
        <CardContent className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <h2 className='text-lg font-semibold'>{text(student.hoTen)}</h2>
              <span className='font-mono text-xs text-muted-foreground'>
                {text(student.ma)}
              </span>
            </div>
            <p className='mt-1 text-sm text-muted-foreground'>
              {text(classRow?.ten) || t('edu.hocVien.noClass')}
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <SessionBalanceBadge
              balance={
                student.soBuoiConLai == null
                  ? null
                  : Number(student.soBuoiConLai)
              }
            />
            <Link
              to={`/hoc-vien/${student.id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {t('edu.hocPhi.openProfile')}
            </Link>
            <Link
              to={`/doi-soat?hocVienId=${student.id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {t('edu.hocPhi.openAudit')}
            </Link>
          </div>
        </CardContent>
      </Card>
      <StudentTuition student={student} onChanged={reload} />
    </div>
  );
}
