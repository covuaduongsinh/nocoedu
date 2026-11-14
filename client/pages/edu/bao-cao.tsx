import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import { Button } from '#components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { SelectField, TextField } from './form-parts.js';
import { text, useRequest, useRows } from './kit.js';

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

interface Bar {
  readonly label: string;
  readonly value: number;
  /** What is printed above the bar. */
  readonly shown: string;
  readonly full: string;
}

/** Bars drawn from the rows of a report; the table below keeps the exact numbers. `max` fixes the scale (e.g. 100). */
function BarChart(props: {
  title: string;
  bars: readonly Bar[];
  max?: number;
  selected?: string | null;
  onSelect?: (label: string | null) => void;
}): ReactElement | null {
  if (props.bars.length === 0) return null;
  const max = props.max ?? Math.max(...props.bars.map((bar) => bar.value), 1);
  return (
    <figure className='mb-4 rounded-lg border p-4'>
      <div className='mb-3 flex items-center justify-between'>
        <figcaption className='text-sm font-medium'>
          {props.title}
        </figcaption>
        {props.selected ? (
          <button
            type='button'
            onClick={() => props.onSelect?.(null)}
            className='text-xs text-primary underline'
          >
            ✕
          </button>
        ) : null}
      </div>
      <ul className='flex h-40 items-end gap-2'>
        {props.bars.map((bar) => {
          const isSelected = props.selected === bar.label;
          return (
            <li
              key={bar.label}
              className={`flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 ${
                props.onSelect ? 'cursor-pointer hover:opacity-80' : ''
              }`}
              onClick={() => {
                if (props.onSelect) {
                  props.onSelect(isSelected ? null : bar.label);
                }
              }}
            >
              <span className='text-xs text-muted-foreground'>{bar.shown}</span>
              <div
                role='img'
                aria-label={`${bar.label}: ${bar.full}`}
                className={`w-full rounded-t ${
                  isSelected
                    ? 'bg-primary ring-2 ring-primary ring-offset-2'
                    : props.selected
                      ? 'bg-primary/40'
                      : 'bg-primary'
                }`}
                style={{
                  height: `${Math.min(Math.max((bar.value / max) * 100, 2), 100)}%`,
                }}
              />
              <span className='w-full truncate text-center text-xs'>
                {bar.label}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

/** The chart of a report, when it has one: revenue by month, headcount by class, attendance rate by class. */
function ReportChart(props: {
  kind: string;
  rows: Report['rows'];
  selected?: string | null;
  onSelect?: (label: string | null) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  if (props.kind === 'doanhThu') {
    const months = new Map<string, number>();
    for (const row of props.rows)
      months.set(
        text(row.thang),
        (months.get(text(row.thang)) ?? 0) + Number(row.doanhThu ?? 0),
      );
    return (
      <BarChart
        title={t('edu.baoCao.doanhThuChart')}
        selected={props.selected}
        onSelect={props.onSelect}
        bars={[...months]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, value]) => ({
            label: month.slice(5),
            value,
            shown: `${Math.round(value / 1000).toLocaleString('vi-VN')}k`,
            full: `${month} ${value.toLocaleString('vi-VN')}`,
          }))}
      />
    );
  }
  if (props.kind === 'siSo')
    return (
      <BarChart
        title={t('edu.baoCao.siSoChart')}
        selected={props.selected}
        onSelect={props.onSelect}
        bars={props.rows.map((row) => ({
          label: text(row.lop),
          value: Number(row.soHocVien ?? 0),
          shown: String(Number(row.soHocVien ?? 0)),
          full: String(Number(row.soHocVien ?? 0)),
        }))}
      />
    );
  if (props.kind === 'chuyenCan')
    return (
      <BarChart
        title={t('edu.baoCao.chuyenCanChart')}
        selected={props.selected}
        onSelect={props.onSelect}
        max={100}
        bars={props.rows.map((row) => ({
          label: text(row.lop),
          value: Number(row.tyLe ?? 0),
          shown: `${Number(row.tyLe ?? 0)}%`,
          full: `${Number(row.tyLe ?? 0)}%`,
        }))}
      />
    );
  return null;
}

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
  const [coSoId, setCoSoId] = useState('');
  const [lopId, setLopId] = useState('');
  const [tuNgay, setTuNgay] = useState('');
  const [denNgay, setDenNgay] = useState('');
  const [tuThang, setTuThang] = useState('');
  const [denThang, setDenThang] = useState('');
  const [selectedBar, setSelectedBar] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const branches = useRows('coSo').loaded;
  const classes = useRows('lop').loaded;
  const students = useRows('hocVien').loaded;

  const branchRows = branches.state === 'ready' ? branches.rows : [];
  const classRows = classes.state === 'ready' ? classes.rows : [];
  const studentRows = students.state === 'ready' ? students.rows : [];

  const availableClasses = coSoId
    ? classRows.filter((c) => String(c.coSoId) === coSoId)
    : classRows;

  const handleKindChange = (newKind: string) => {
    setKind(newKind);
    setSelectedBar(null);
  };

  const handleResetFilters = () => {
    setCoSoId('');
    setLopId('');
    setTuNgay('');
    setDenNgay('');
    setTuThang('');
    setDenThang('');
    setSelectedBar(null);
  };

  const hasFilters = Boolean(
    coSoId ||
      lopId ||
      (kind === 'doanhThu' ? tuThang || denThang : tuNgay || denNgay),
  );

  const requestParams = {
    loai: kind,
    ...(coSoId ? { coSoId: Number(coSoId) } : {}),
    ...(lopId ? { lopId: Number(lopId) } : {}),
    ...(kind === 'doanhThu'
      ? {
          ...(tuThang ? { tuThang } : {}),
          ...(denThang ? { denThang } : {}),
        }
      : {
          ...(tuNgay ? { tuNgay } : {}),
          ...(denNgay ? { denNgay } : {}),
        }),
  };

  const { result, reload } = useRequest<Report>('/baoCao/xem', requestParams);

  const download = async (): Promise<void> => {
    setFailed(false);
    try {
      const stream = await api.stream({
        path: '/baoCao/xuatCsv',
        method: 'POST',
        json: requestParams,
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

  const classIdByName = new Map<string, number>();
  for (const c of classRows) classIdByName.set(text(c.ten), c.id);

  const studentIdByMa = new Map<string, number>();
  for (const s of studentRows) studentIdByMa.set(text(s.ma), s.id);

  const filteredRows =
    result.state === 'ready'
      ? selectedBar
        ? result.data.rows.filter((row) => {
            if (kind === 'doanhThu') {
              return text(row.thang)?.slice(5) === selectedBar;
            }
            if (kind === 'siSo' || kind === 'chuyenCan') {
              return text(row.lop) === selectedBar;
            }
            return true;
          })
        : result.data.rows
      : [];

  const renderCell = (
    key: string,
    value: unknown,
    row: Record<string, string | number | null>,
  ) => {
    const valText = text(value);
    if (key === 'lop' && valText) {
      const id = classIdByName.get(valText);
      if (id) {
        return <RecordLink to={`/lop/${id}`}>{valText}</RecordLink>;
      }
    }
    if ((key === 'ma' || key === 'hoTen') && row.ma) {
      const id = studentIdByMa.get(text(row.ma));
      if (id) {
        return <RecordLink to={`/hoc-vien/${id}`}>{valText}</RecordLink>;
      }
    }
    return valText;
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
      <div className='mb-6 flex flex-wrap items-end gap-3'>
        <div className='w-56'>
          <SelectField
            id='bc-loai'
            label={t('edu.baoCao.kind')}
            value={kind}
            onChange={handleKindChange}
            options={kinds.map((key) => ({
              value: key,
              label: t(`edu.baoCao.k.${key}`),
            }))}
          />
        </div>

        {branchRows.length > 0 ? (
          <div className='w-44'>
            <SelectField
              id='bc-coso'
              label={t('edu.baoCao.filterBranch')}
              value={coSoId}
              onChange={(val) => {
                setCoSoId(val);
                setLopId('');
              }}
              options={[
                { value: '', label: t('edu.baoCao.allBranches') },
                ...branchRows.map((b) => ({
                  value: String(b.id),
                  label: text(b.ten),
                })),
              ]}
            />
          </div>
        ) : null}

        {availableClasses.length > 0 && kind !== 'doanhThu' ? (
          <div className='w-44'>
            <SelectField
              id='bc-lop'
              label={t('edu.baoCao.filterClass')}
              value={lopId}
              onChange={setLopId}
              options={[
                { value: '', label: t('edu.baoCao.allClasses') },
                ...availableClasses.map((c) => ({
                  value: String(c.id),
                  label: text(c.ten),
                })),
              ]}
            />
          </div>
        ) : null}

        {kind === 'doanhThu' ? (
          <>
            <div className='w-36'>
              <TextField
                id='bc-tu-thang'
                type='month'
                label={t('edu.baoCao.fromMonth')}
                value={tuThang}
                onChange={setTuThang}
              />
            </div>
            <div className='w-36'>
              <TextField
                id='bc-den-thang'
                type='month'
                label={t('edu.baoCao.toMonth')}
                value={denThang}
                onChange={setDenThang}
              />
            </div>
          </>
        ) : kind === 'chuyenCan' || kind === 'nghiDai' ? (
          <>
            <div className='w-36'>
              <TextField
                id='bc-tu-ngay'
                type='date'
                label={t('edu.baoCao.fromDate')}
                value={tuNgay}
                onChange={setTuNgay}
              />
            </div>
            <div className='w-36'>
              <TextField
                id='bc-den-ngay'
                type='date'
                label={t('edu.baoCao.toDate')}
                value={denNgay}
                onChange={setDenNgay}
              />
            </div>
          </>
        ) : null}

        {hasFilters || selectedBar ? (
          <Button variant='ghost' size='sm' onClick={handleResetFilters}>
            {t('edu.baoCao.filterReset')}
          </Button>
        ) : null}
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
      ) : filteredRows.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('edu.baoCao.empty')}</p>
      ) : (
        <>
          <ReportChart
            kind={kind}
            rows={result.data.rows}
            selected={selectedBar}
            onSelect={setSelectedBar}
          />
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
                {filteredRows.map((row) => (
                  <TableRow key={rowKey(row)}>
                    {result.data.columns.map((column) => (
                      <TableCell key={column.key}>
                        {renderCell(column.key, row[column.key], row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </PageContainer>
  );
}
