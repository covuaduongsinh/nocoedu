import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { SelectField } from './form-parts.js';
import { text, useRequest } from './kit.js';

interface Report {
  columns: { key: string }[];
  rows: Record<string, string | number | null>[];
}

/**
 * Reports for the role: headcount, attendance rate, students running out of sessions, students away for over two
 * weeks and tuition revenue. The server limits each to the caller's classes or branches (a coach has no revenue
 * report). "Download CSV" is the same report as a spreadsheet file, and the export is logged.
 */
/** A report row has no id: its cells together identify it (each report lists a branch, class or student once). */
const rowKey = (row: Record<string, string | number | null>): string =>
  Object.values(row).join('|');

export default function BaoCaoPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { can: canRevenue } = useCan({
    resource: { type: 'composite', id: 'edu.thanhToan' },
    action: 'view',
  });
  const { can: canAttendance } = useCan({
    resource: { type: 'composite', id: 'edu.diemDanh' },
    action: 'view',
  });
  const { can: canExport } = useCan({
    resource: { type: 'composite', id: 'edu.baoCao' },
    action: 'export',
  });
  const kinds = [
    'siSo',
    'sapHetBuoi',
    'soDuAm',
    'thieuDongY',
    ...(canAttendance ? ['chuyenCan', 'nghiDai'] : []),
    ...(canRevenue ? ['doanhThu'] : []),
  ];
  const [kind, setKind] = useState('siSo');
  const [failed, setFailed] = useState(false);
  const { result, reload } = useRequest<Report>('/baoCao/xem', { loai: kind });

  const download = async (): Promise<void> => {
    setFailed(false);
    try {
      const stream = await api.stream({
        path: '/baoCao/xuatCsv',
        method: 'POST',
        json: { loai: kind },
      });
      const blob = await new Response(stream).blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(
        new Blob([blob], { type: 'text/csv;charset=utf-8' }),
      );
      link.download = `bao-cao-${kind}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setFailed(true);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <PageHeader
        title={t('edu.baoCao.title')}
        description={t('edu.baoCao.description')}
        actions={
          canExport ? (
            <Button variant='outline' onClick={() => void download()}>
              {t('edu.baoCao.csv')}
            </Button>
          ) : null
        }
      />
      <div className='max-w-xs'>
        <SelectField
          id='bc-loai'
          label={t('edu.baoCao.kind')}
          value={kind}
          onChange={setKind}
          options={kinds.map((key) => ({
            value: key,
            label: t(`edu.baoCao.k.${key}`),
          }))}
        />
      </div>
      {failed ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('edu.common.saveError')}
        </p>
      ) : null}
      {result.state === 'loading' ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      ) : result.state === 'error' ? (
        <div role='alert' className='flex flex-col items-start gap-3'>
          <p className='text-sm text-destructive'>
            {result.forbidden
              ? t('edu.errors.PERMISSION_DENIED')
              : t('edu.common.loadError')}
          </p>
          <Button variant='outline' onClick={reload}>
            {t('edu.common.retry')}
          </Button>
        </div>
      ) : result.data.rows.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('edu.baoCao.empty')}</p>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                {result.data.columns.map((column) => (
                  <TableHead key={column.key}>
                    {t(`edu.baoCao.col.${column.key}`)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.rows.map((row) => (
                <TableRow key={rowKey(row)}>
                  {result.data.columns.map((column) => (
                    <TableCell key={column.key}>
                      {text(row[column.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  );
}
