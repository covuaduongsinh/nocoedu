import { useTranslation } from '@nocobase/i18n/client';
import { cn } from 'cn';
import { LayoutGrid, LayoutList, Search, type LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Badge } from '#components/ui/badge';
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

import { MetricCard } from './edu-ui-parts.js';
import { PAGE_SIZE, text, type Loaded, type Row } from './kit.js';

export interface Column {
  readonly key: string;
  readonly label: string;
  readonly render?: (row: Row) => ReactNode;
}

export interface ListTab {
  readonly key: string;
  readonly label: string;
  readonly count?: number;
  readonly icon?: ReactNode;
}

export interface ListMetric {
  readonly label: string;
  readonly value: ReactNode;
  readonly sub?: string;
  readonly icon?: LucideIcon;
  readonly tone?: 'neutral' | 'primary' | 'warning' | 'success' | 'destructive' | 'info';
}

/** A titled table with loading, error, empty states, tabs, metrics, and grid view options. */
export function ListPage(props: {
  readonly title: string;
  readonly description: string;
  readonly emptyTitle: string;
  readonly emptyHint: string;
  readonly columns: readonly Column[];
  readonly loaded: Loaded<Row>;
  readonly onRetry: () => void;
  readonly actions?: ReactNode;
  readonly rowActions?: (row: Row) => ReactNode;
  /** Summary KPI metrics displayed in a top grid */
  readonly metrics?: readonly ListMetric[];
  /** Filter tabs above the list */
  readonly tabs?: readonly ListTab[];
  readonly activeTab?: string;
  readonly onTabChange?: (key: string) => void;
  /** View switch: table vs card grid */
  readonly viewMode?: 'table' | 'grid';
  readonly onViewModeChange?: (mode: 'table' | 'grid') => void;
  readonly renderGridItem?: (row: Row) => ReactNode;
  /** Server-side paging: the 1-based page, the total of rows that match, and how to change the page. */
  readonly paging?: {
    readonly page: number;
    readonly total: number;
    readonly onPage: (page: number) => void;
  };
  /** A search box above the table; the caller resets the page when the text changes. */
  readonly search?: {
    readonly value: string;
    readonly label: string;
    readonly onChange: (value: string) => void;
  };
  /** Optional secondary filter controls (e.g. Branch dropdown) */
  readonly filterControls?: ReactNode;
}): ReactElement {
  const currentView = props.viewMode ?? 'table';

  return (
    <PageContainer className='mx-auto max-w-6xl space-y-6'>
      <PageHeader
        title={props.title}
        description={props.description}
        actions={props.actions}
      />

      {/* Top metrics cards */}
      {props.metrics && props.metrics.length > 0 ? (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {props.metrics.map((m) => (
            <MetricCard
              key={m.label}
              title={m.label}
              value={m.value}
              subtitle={m.sub}
              icon={m.icon}
              tone={m.tone}
            />
          ))}
        </div>
      ) : null}

      {/* Filter tabs */}
      {props.tabs && props.tabs.length > 0 ? (
        <div className='flex flex-wrap items-center gap-1.5 border-b pb-3'>
          {props.tabs.map((tab) => {
            const isActive = props.activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type='button'
                onClick={() => props.onTabChange?.(tab.key)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all sm:text-sm',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.count != null ? (
                  <Badge
                    variant={isActive ? 'secondary' : 'outline'}
                    className={cn(
                      'px-1.5 py-0 text-[11px] font-semibold',
                      isActive ? 'bg-primary-foreground/20 text-primary-foreground' : '',
                    )}
                  >
                    {tab.count}
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Search and view switcher toolbar */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex flex-1 flex-wrap items-center gap-3'>
          {props.search ? (
            <div className='relative w-full max-w-xs'>
              <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
              <Input
                type='search'
                className='pl-8'
                aria-label={props.search.label}
                placeholder={props.search.label}
                value={props.search.value}
                onChange={(event) => props.search?.onChange(event.target.value)}
              />
            </div>
          ) : null}
          {props.filterControls}
        </div>

        {props.renderGridItem && props.onViewModeChange ? (
          <div className='flex items-center gap-1 rounded-lg border p-1'>
            <Button
              size='sm'
              variant={currentView === 'table' ? 'secondary' : 'ghost'}
              className='h-7 px-2'
              onClick={() => props.onViewModeChange?.('table')}
              aria-label='Xem dạng bảng'
            >
              <LayoutList className='h-4 w-4' />
            </Button>
            <Button
              size='sm'
              variant={currentView === 'grid' ? 'secondary' : 'ghost'}
              className='h-7 px-2'
              onClick={() => props.onViewModeChange?.('grid')}
              aria-label='Xem dạng lưới'
            >
              <LayoutGrid className='h-4 w-4' />
            </Button>
          </div>
        ) : null}
      </div>

      {/* Main content: Grid or Table */}
      {currentView === 'grid' && props.renderGridItem ? (
        <RowsGrid
          loaded={props.loaded}
          onRetry={props.onRetry}
          emptyTitle={props.emptyTitle}
          emptyHint={props.emptyHint}
          renderItem={props.renderGridItem}
          paging={props.paging}
        />
      ) : (
        <RowsTable
          columns={props.columns}
          loaded={props.loaded}
          onRetry={props.onRetry}
          emptyTitle={props.emptyTitle}
          emptyHint={props.emptyHint}
          rowActions={props.rowActions}
          paging={props.paging}
        />
      )}
    </PageContainer>
  );
}

/** The grid view of rows */
export function RowsGrid(props: {
  readonly loaded: Loaded<Row>;
  readonly onRetry: () => void;
  readonly emptyTitle: string;
  readonly emptyHint: string;
  readonly renderItem: (row: Row) => ReactNode;
  readonly paging?: {
    readonly page: number;
    readonly total: number;
    readonly onPage: (page: number) => void;
  };
}): ReactElement {
  const { t } = useTranslation();
  const { loaded } = props;

  return (
    <>
      {loaded.state === 'loading' ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      ) : loaded.state === 'error' ? (
        <div role='alert' className='flex flex-col items-start gap-3'>
          <p className='text-sm text-destructive'>
            {t('edu.common.loadError')}
          </p>
          <Button variant='outline' onClick={props.onRetry}>
            {t('edu.common.retry')}
          </Button>
        </div>
      ) : loaded.rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{props.emptyTitle}</EmptyTitle>
            <EmptyDescription>{props.emptyHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className='space-y-4'>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {loaded.rows.map(props.renderItem)}
          </div>
          {props.paging ? (
            <Pager
              page={props.paging.page}
              total={props.paging.total}
              onPage={props.paging.onPage}
            />
          ) : null}
        </div>
      )}
    </>
  );
}

/** The table of rows with loading, error and empty states, and the pager when the list is paged. */
export function RowsTable(props: {
  readonly columns: readonly Column[];
  readonly loaded: Loaded<Row>;
  readonly onRetry: () => void;
  readonly emptyTitle: string;
  readonly emptyHint: string;
  readonly rowActions?: (row: Row) => ReactNode;
  readonly paging?: {
    readonly page: number;
    readonly total: number;
    readonly onPage: (page: number) => void;
  };
}): ReactElement {
  const { t } = useTranslation();
  const { loaded } = props;
  return (
    <>
      {loaded.state === 'loading' ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      ) : loaded.state === 'error' ? (
        <div role='alert' className='flex flex-col items-start gap-3'>
          <p className='text-sm text-destructive'>
            {t('edu.common.loadError')}
          </p>
          <Button variant='outline' onClick={props.onRetry}>
            {t('edu.common.retry')}
          </Button>
        </div>
      ) : loaded.rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{props.emptyTitle}</EmptyTitle>
            <EmptyDescription>{props.emptyHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                {props.columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
                {props.rowActions ? (
                  <TableHead className='text-right'>{t('edu.common.actions')}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loaded.rows.map((row) => (
                <TableRow key={row.id}>
                  {props.columns.map((column) => (
                    <TableCell key={column.key}>
                      {column.render
                        ? column.render(row)
                        : text(row[column.key])}
                    </TableCell>
                  ))}
                  {props.rowActions ? (
                    <TableCell className='text-right'>{props.rowActions(row)}</TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {props.paging ? (
            <Pager
              page={props.paging.page}
              total={props.paging.total}
              onPage={props.paging.onPage}
            />
          ) : loaded.rows.length >= 100 ? (
            <p className='border-t p-3 text-xs text-muted-foreground'>
              {t('edu.common.limit')}
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}

/** Previous / next with the range shown; the last page is `ceil(total / PAGE_SIZE)`. */
function Pager(props: {
  readonly page: number;
  readonly total: number;
  readonly onPage: (page: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(props.total / PAGE_SIZE));
  const from = (props.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(props.total, props.page * PAGE_SIZE);
  return (
    <div className='flex items-center justify-between gap-3 border-t p-3 text-sm'>
      <span className='text-muted-foreground'>
        {t('edu.common.range', { from, to, total: props.total })}
      </span>
      <div className='flex items-center gap-2'>
        <Button
          size='sm'
          variant='outline'
          disabled={props.page <= 1}
          onClick={() => props.onPage(props.page - 1)}
        >
          {t('edu.common.prev')}
        </Button>
        <span aria-live='polite'>
          {t('edu.common.pageOf', { page: props.page, pages })}
        </span>
        <Button
          size='sm'
          variant='outline'
          disabled={props.page >= pages}
          onClick={() => props.onPage(props.page + 1)}
        >
          {t('edu.common.next')}
        </Button>
      </div>
    </div>
  );
}
