import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
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

import { text, type Loaded, type Row } from './kit.js';

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
}): ReactElement {
  const { t } = useTranslation();
  const { loaded } = props;
  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={props.title}
        description={props.description}
        actions={props.actions}
      />
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
          {loaded.rows.length >= 100 ? (
            <p className='border-t p-3 text-xs text-muted-foreground'>
              {t('edu.common.limit')}
            </p>
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}
