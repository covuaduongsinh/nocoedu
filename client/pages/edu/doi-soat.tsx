import { useTranslation } from '@nocobase/i18n/client';
import { AlertTriangle, Search, X } from 'lucide-react';
import { type ReactElement } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import { Button, buttonVariants } from '#components/ui/button';
import { Input } from '#components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { cn } from 'cn';

import { SessionBalanceBadge } from './edu-ui-parts.js';
import { FilterSelect } from './filter-select.js';
import { formatMoney } from './format.js';
import { PAGE_SIZE, text, useRequest, useRows } from './kit.js';
import { Pager } from './list-page.js';
import { useUrlSearch, useUrlState } from './url-state.js';

interface AuditRow {
  id: number;
  ma: string;
  hoTen: string;
  lopId: number | null;
  lopTen: string | null;
  coSoTen: string | null;
  phuHuynhTen: string | null;
  phuHuynhSdt: string | null;
  soBuoiConLai: number;
  tongSoBuoiDaMua: number;
  tongSoBuoiDaHoc: number;
  tongDaThanhToan: number;
  tongConNoHocPhi: number;
  tongTienSachDaPhat: number;
  tienSachTon: number;
}

interface AuditStats {
  tongHocVien: number;
  soHocVienVuotGoi: number;
  soHocVienSapHet: number;
  soHocVienBinhThuong: number;
  soHocVienCanThu: number;
  tongCongNoHocPhi: number;
  tongCongNoSach: number;
}

interface AuditAnswer {
  thongKe: AuditStats;
  danhSach: AuditRow[];
  tong: number;
}

const FILTERS = [
  'tat_ca',
  'vuot_goi',
  'sap_het',
  'binh_thuong',
  'no_hoc_phi',
  'no_sach',
] as const;

/**
 * The student file of the one whose `hocVienId` the address names: the old "detail mode" of this page lives in the
 * student file now (`/hoc-vien/:id?tab=buoi-hoc`), so an old link or bookmark goes there instead of to a dead end.
 */
export default function DoiSoatPage(): ReactElement {
  const [params] = useSearchParams();
  const studentId = params.get('hocVienId');
  if (studentId && /^\d+$/u.test(studentId))
    return <Navigate to={`/hoc-vien/${studentId}?tab=buoi-hoc`} replace />;
  return <AuditTable />;
}

/**
 * "Đối soát": the table of the whole centre — who is over their balance, who owes tuition or book money. One question,
 * one page; the answer about one student is his file. The list is read page by page on the server and its filters live
 * in the address.
 */
function AuditTable(): ReactElement {
  const { t } = useTranslation();
  const url = useUrlState({
    search: '',
    coSoId: '',
    lopId: '',
    trangThai: 'tat_ca',
  });
  const [typed, setTyped] = useUrlSearch(url.values.search, (value) =>
    url.set({ search: value.trim() }),
  );
  const classes = useRows('lop').loaded;
  const branches = useRows('coSo').loaded;
  const classRows = classes.state === 'ready' ? classes.rows : [];
  const branchRows = branches.state === 'ready' ? branches.rows : [];

  const { result, reload } = useRequest<AuditAnswer>('/doiSoat/tongQuan', {
    search: url.values.search || null,
    coSoId: url.values.coSoId ? Number(url.values.coSoId) : null,
    lopId: url.values.lopId ? Number(url.values.lopId) : null,
    trangThaiLoc: url.values.trangThai,
    trang: url.page,
    limit: PAGE_SIZE,
  });
  const data = result.state === 'ready' ? result.data : null;
  const stats = data?.thongKe;
  const filtered =
    url.values.search !== '' ||
    url.values.coSoId !== '' ||
    url.values.lopId !== '' ||
    url.values.trangThai !== 'tat_ca';

  const kpi: readonly {
    key: (typeof FILTERS)[number];
    label: string;
    hint: string;
    value: string | number;
    warn?: boolean;
  }[] = [
    {
      key: 'tat_ca',
      label: t('edu.doiSoat.kpi.tatCa'),
      hint: t('edu.doiSoat.kpi.tatCaHint'),
      value: stats?.tongHocVien ?? '–',
    },
    {
      key: 'vuot_goi',
      label: t('edu.doiSoat.kpi.vuotGoi'),
      hint: t('edu.doiSoat.kpi.vuotGoiHint'),
      value: stats?.soHocVienVuotGoi ?? '–',
      warn: true,
    },
    {
      key: 'sap_het',
      label: t('edu.doiSoat.kpi.sapHet'),
      hint: t('edu.doiSoat.kpi.sapHetHint'),
      value: stats?.soHocVienSapHet ?? '–',
    },
    {
      key: 'binh_thuong',
      label: t('edu.doiSoat.kpi.binhThuong'),
      hint: t('edu.doiSoat.kpi.binhThuongHint'),
      value: stats?.soHocVienBinhThuong ?? '–',
    },
    {
      key: 'no_hoc_phi',
      label: t('edu.doiSoat.kpi.noHocPhi'),
      hint: t('edu.doiSoat.kpi.noHocPhiHint'),
      value: stats
        ? t('edu.common.money', { amount: formatMoney(stats.tongCongNoHocPhi) })
        : '–',
    },
    {
      key: 'no_sach',
      label: t('edu.doiSoat.kpi.noSach'),
      hint: t('edu.doiSoat.kpi.noSachHint'),
      value: stats
        ? t('edu.common.money', { amount: formatMoney(stats.tongCongNoSach) })
        : '–',
    },
  ];

  return (
    <PageContainer className='mx-auto max-w-7xl space-y-6'>
      <PageHeader
        title={t('edu.doiSoat.title')}
        description={t('edu.doiSoat.description')}
      />

      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
        {kpi.map((card) => {
          const active = url.values.trangThai === card.key;
          return (
            <button
              key={card.key}
              type='button'
              aria-pressed={active}
              onClick={() => url.set({ trangThai: card.key })}
              className={cn(
                'rounded-xl border bg-card p-3.5 text-left shadow-xs transition-colors hover:border-primary',
                active ? 'border-primary ring-2 ring-primary/30' : '',
              )}
            >
              <span
                className={cn(
                  'flex items-center gap-1 text-xs font-medium text-muted-foreground',
                  card.warn ? 'text-destructive' : '',
                )}
              >
                {card.warn ? <AlertTriangle className='size-3.5' /> : null}
                {card.label}
              </span>
              <span
                className={cn(
                  'mt-1 block text-xl font-bold',
                  card.warn ? 'text-destructive' : 'text-foreground',
                )}
              >
                {card.value}
              </span>
              <span className='text-[11px] text-muted-foreground'>
                {card.hint}
              </span>
            </button>
          );
        })}
      </div>

      <div className='flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3'>
        <div className='relative min-w-[220px] flex-1'>
          <Search className='absolute left-2.5 top-2.5 size-4 text-muted-foreground' />
          <Input
            type='search'
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-label={t('edu.doiSoat.searchLabel')}
            placeholder={t('edu.doiSoat.searchLabel')}
            className='pl-8'
          />
        </div>
        <FilterSelect
          label={t('edu.lop.coSo')}
          value={url.values.coSoId}
          allLabel={t('edu.hoSo360.allBranches')}
          options={branchRows.map((row) => ({
            value: String(row.id),
            label: text(row.ten),
          }))}
          onChange={(coSoId) => url.set({ coSoId, lopId: '' })}
        />
        <FilterSelect
          label={t('edu.hocVien.lop')}
          value={url.values.lopId}
          allLabel={t('edu.hoSo360.allClasses')}
          options={classRows
            .filter(
              (row) =>
                url.values.coSoId === '' ||
                String(row.coSoId) === url.values.coSoId,
            )
            .map((row) => ({ value: String(row.id), label: text(row.ten) }))}
          onChange={(lopId) => url.set({ lopId })}
        />
        <FilterSelect
          label={t('edu.hocVien.trangThai')}
          value={url.values.trangThai}
          allValue='tat_ca'
          allLabel={t('edu.doiSoat.filter.tatCa')}
          options={FILTERS.filter((key) => key !== 'tat_ca').map((key) => ({
            value: key,
            label: t(`edu.doiSoat.filter.${key}`),
          }))}
          onChange={(trangThai) => url.set({ trangThai })}
        />
        {filtered ? (
          <Button
            size='sm'
            variant='ghost'
            onClick={() =>
              url.set({
                search: '',
                coSoId: '',
                lopId: '',
                trangThai: 'tat_ca',
              })
            }
          >
            <X className='size-3.5' />
            {t('edu.doiSoat.reset')}
          </Button>
        ) : null}
      </div>

      {result.state === 'loading' ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      ) : result.state === 'error' ? (
        <div role='alert' className='flex flex-col items-start gap-3'>
          <p className='text-sm text-destructive'>
            {result.forbidden
              ? t('edu.doiSoat.forbidden')
              : t('edu.common.loadError')}
          </p>
          {result.forbidden ? null : (
            <Button variant='outline' onClick={reload}>
              {t('edu.common.retry')}
            </Button>
          )}
        </div>
      ) : data && data.danhSach.length === 0 ? (
        <p className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
          {t('edu.doiSoat.empty')}
        </p>
      ) : data ? (
        <div className='overflow-x-auto rounded-lg border bg-card'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('edu.hocVien.ma')}</TableHead>
                <TableHead>{t('edu.hocVien.hoTen')}</TableHead>
                <TableHead>{t('edu.hocVien.lop')}</TableHead>
                <TableHead>{t('edu.doiSoat.col.phuHuynh')}</TableHead>
                <TableHead className='text-right'>
                  {t('edu.doiSoat.col.daNop')}
                </TableHead>
                <TableHead className='text-right'>
                  {t('edu.doiSoat.col.daHoc')}
                </TableHead>
                <TableHead>{t('edu.diemDanh.balance')}</TableHead>
                <TableHead className='text-right'>
                  {t('edu.doiSoat.col.hocPhi')}
                </TableHead>
                <TableHead className='text-right'>
                  {t('edu.doiSoat.col.tienSach')}
                </TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.danhSach.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className='font-mono text-xs'>
                    <RecordLink to={`/hoc-vien/${row.id}`}>{row.ma}</RecordLink>
                  </TableCell>
                  <TableCell>
                    <RecordLink to={`/hoc-vien/${row.id}`}>
                      {row.hoTen}
                    </RecordLink>
                  </TableCell>
                  <TableCell>
                    {row.lopId ? (
                      <RecordLink to={`/lop/${row.lopId}`}>
                        {row.lopTen}
                      </RecordLink>
                    ) : (
                      <span className='text-muted-foreground'>—</span>
                    )}
                    {row.coSoTen ? (
                      <span className='block text-[11px] text-muted-foreground'>
                        {row.coSoTen}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {row.phuHuynhTen ? (
                      <>
                        <span className='block'>{row.phuHuynhTen}</span>
                        <span className='block font-mono text-[11px] text-muted-foreground'>
                          {row.phuHuynhSdt}
                        </span>
                      </>
                    ) : (
                      <span className='text-muted-foreground'>—</span>
                    )}
                  </TableCell>
                  <TableCell className='text-right'>
                    {row.tongSoBuoiDaMua}
                  </TableCell>
                  <TableCell className='text-right'>
                    {row.tongSoBuoiDaHoc}
                  </TableCell>
                  <TableCell>
                    <SessionBalanceBadge balance={row.soBuoiConLai} size='sm' />
                  </TableCell>
                  <TableCell className='text-right'>
                    {formatMoney(row.tongDaThanhToan)}
                    {row.tongConNoHocPhi > 0 ? (
                      <span className='block text-[11px] text-destructive'>
                        {t('edu.doiSoat.owes', {
                          amount: formatMoney(row.tongConNoHocPhi),
                        })}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className='text-right'>
                    {formatMoney(row.tongTienSachDaPhat)}
                    {row.tienSachTon < 0 ? (
                      <span className='block text-[11px] text-destructive'>
                        {t('edu.doiSoat.owesBook', {
                          amount: formatMoney(Math.abs(row.tienSachTon)),
                        })}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Link
                      to={`/hoc-vien/${row.id}?tab=buoi-hoc`}
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'sm',
                      })}
                    >
                      {t('edu.doiSoat.openFile')}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager page={url.page} total={data.tong} onPage={url.setPage} />
        </div>
      ) : null}
    </PageContainer>
  );
}
