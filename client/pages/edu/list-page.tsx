import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { PAGE_SIZE, text, type Loaded, type Row } from './kit.js';

export interface Column {
  readonly key: string;
  readonly label: string;
  readonly render?: (row: Row) => ReactNode;
}

/** A titled table with loading, error and empty states; every state says what to do next. */
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
}): ReactElement {
  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={props.title}
        description={props.description}
        actions={props.actions}
      />
      {props.search ? (
        <Input
          type='search'
          className='max-w-sm'
          aria-label={props.search.label}
          placeholder={props.search.label}
          value={props.search.value}
          onChange={(event) => props.search?.onChange(event.target.value)}
        />
      ) : null}
      <RowsTable
        columns={props.columns}
        loaded={props.loaded}
        onRetry={props.onRetry}
        emptyTitle={props.emptyTitle}
        emptyHint={props.emptyHint}
        rowActions={props.rowActions}
        paging={props.paging}
      />
    </PageContainer>
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
                  <TableHead>{t('edu.common.actions')}</TableHead>
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
                    <TableCell>{props.rowActions(row)}</TableCell>
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
