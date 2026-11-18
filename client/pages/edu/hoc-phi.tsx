import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowRight,
  BadgeAlert,
  CreditCard,
  DollarSign,
  Download,
  History,
  QrCode,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button, buttonVariants } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
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

import { saveCsvStream } from './download.js';
import { SessionBalanceBadge } from './edu-ui-parts.js';
import { FilterSelect } from './filter-select.js';
import { FormDialog, SelectField, TextField } from './form-parts.js';
import { formatDay, formatMoney } from './format.js';
import { GenericImportDialog } from './generic-import-dialog.js';
import {
  PAGE_SIZE,
  post,
  text,
  todayVn,
  usePagedRows,
  useRequest,
  useRows,
  useRowsByIds,
  type Row,
} from './kit.js';
import { Pager, RowsTable } from './list-page.js';
import { useUrlSearch, useUrlState } from './url-state.js';

interface Qr {
  soTien: number;
  noiDungCk: string;
  url: string;
}

const TABS = ['cashier', 'ledger', 'can-thu'] as const;
type Tab = (typeof TABS)[number];

/** A month in the Vietnamese calendar, `YYYY-MM`, counted back from today. */
function recentMonths(count: number): string[] {
  const [year, month] = todayVn().split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, back) => {
    const index = year * 12 + (month - 1) - back;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
}

/**
 * Tuition: the cashier (sell a package, take a payment), the cash book and the list of who has to pay next. The tab, the
 * student being served (`hocVienId`), the search text and the month of the cash book are in the address, so a link such
 * as `/hoc-phi?search=HS00007` (from a student file or the home page) opens on that student.
 */
export default function HocPhiPage(): ReactElement {
  const { t } = useTranslation();
  const month = todayVn().slice(0, 7);
  const url = useUrlState({
    tab: 'cashier',
    search: '',
    hocVienId: '',
    thang: month,
  });
  const tab: Tab = (TABS as readonly string[]).includes(url.values.tab)
    ? (url.values.tab as Tab)
    : 'cashier';
  // Downloading is a separate action from viewing (`edu.baoCao` `export`).
  const { can: canExport } = useCan({
    resource: { type: 'composite', id: 'edu.baoCao' },
    action: 'export',
  });
  const api = useApiClient();
  const [reloadKey, setReloadKey] = useState(0);

  // The number on the "Cần thu" tab is the total of the same list that tab shows.
  const collect = useRequest<{ tong: number; hocVien: Row[]; nguong: number }>(
    '/soDu/canhBao',
    {
      trang: tab === 'can-thu' ? url.page : 1,
      limit: PAGE_SIZE,
    },
  );
  const reloadCollect = collect.reload;
  const refresh = (): void => {
    setReloadKey((value) => value + 1);
    reloadCollect();
  };

  const exportCsv = async (): Promise<void> => {
    try {
      const stream = await api.stream({
        path: '/hocPhi/xuatCsv',
        method: 'POST',
        json: {},
      });
      await saveCsvStream(stream, `hoc-phi-${todayVn()}.csv`);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-5xl pb-16'>
      <PageHeader
        title={t('edu.hocPhi.pageTitle')}
        description={t('edu.hocPhi.pageDescription')}
        actions={
          <div className='flex flex-wrap items-center gap-2'>
            <GenericImportDialog
              entity='goiHoc'
              title={t('edu.hocPhi.importTitle')}
              buttonLabel={t('edu.hocPhi.importButton')}
              variant='outline'
              onSuccess={refresh}
            />
            {canExport ? (
              <Button
                variant='outline'
                size='sm'
                onClick={() => void exportCsv()}
              >
                <Download className='h-4 w-4' />
                {t('edu.hocPhi.exportCsv')}
              </Button>
            ) : null}
          </div>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(next) =>
          url.set({ tab: String(next) }, { replace: false })
        }
        className='mb-6'
      >
        <TabsList>
          <TabsTrigger value='cashier'>
            <CreditCard className='h-4 w-4' />
            {t('edu.hocPhi.tab.cashier')}
          </TabsTrigger>
          <TabsTrigger value='ledger'>
            <History className='h-4 w-4' />
            {t('edu.hocPhi.tab.ledger')}
          </TabsTrigger>
          <TabsTrigger value='can-thu'>
            <BadgeAlert className='h-4 w-4' />
            {t('edu.hocPhi.tab.canThu')}
            {collect.result.state === 'ready' &&
            collect.result.data.tong > 0 ? (
              <StatusBadge tone='warning' size='sm'>
                {collect.result.data.tong}
              </StatusBadge>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'cashier' ? (
        <Cashier
          search={url.values.search}
          studentId={url.values.hocVienId}
          onSearch={(search) => url.set({ search }, { keepPage: true })}
          onPick={(hocVienId) =>
            url.set({ hocVienId, search: '' }, { keepPage: true })
          }
          reloadKey={reloadKey}
          onChanged={refresh}
        />
      ) : null}
      {tab === 'ledger' ? (
        <CashBook
          month={url.values.thang}
          page={url.page}
          onMonth={(thang) => url.set({ thang })}
          onPage={url.setPage}
          reloadKey={reloadKey}
        />
      ) : null}
      {tab === 'can-thu' ? (
        <NeedToPay
          request={collect}
          page={url.page}
          onPage={url.setPage}
          onServe={(hocVienId) =>
            url.set({ tab: 'cashier', hocVienId }, { replace: false })
          }
        />
      ) : null}
    </PageContainer>
  );
}

// --- Cashier ---------------------------------------------------------------------------------------------------

function Cashier(props: {
  readonly search: string;
  readonly studentId: string;
  readonly onSearch: (search: string) => void;
  readonly onPick: (hocVienId: string) => void;
  readonly reloadKey: number;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [typed, setTyped] = useUrlSearch(props.search, (value) =>
    props.onSearch(value.trim()),
  );
  return (
    <div className='flex flex-col gap-6'>
      <div className='rounded-2xl border bg-card p-5 shadow-sm'>
        <h2 className='mb-3 flex items-center gap-2 text-sm font-bold'>
          <Search className='h-4 w-4 text-primary' />
          {t('edu.hocPhi.findStudent')}
        </h2>
        <div className='relative'>
          <Search className='absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground' />
          <Input
            type='search'
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-label={t('edu.hocPhi.findStudent')}
            placeholder={t('edu.hocPhi.findPlaceholder')}
            className='h-11 pl-10 pr-4 text-sm'
          />
          {props.search !== '' ? (
            <Suggestions search={props.search} onPick={props.onPick} />
          ) : null}
        </div>
      </div>
      {props.studentId !== '' ? (
        <Served
          key={`${props.studentId}:${props.reloadKey}`}
          studentId={Number(props.studentId)}
          onChanged={props.onChanged}
        />
      ) : (
        <div className='rounded-2xl border border-dashed bg-muted/10 p-10 text-center'>
          <Users className='mx-auto mb-2 h-10 w-10 text-muted-foreground opacity-50' />
          <p className='text-sm font-semibold'>{t('edu.hocPhi.noneChosen')}</p>
          <p className='mt-1 text-xs text-muted-foreground'>
            {t('edu.hocPhi.noneChosenHint')}
          </p>
        </div>
      )}
    </div>
  );
}

/** The students the search text finds, read on the server; a code typed in full opens its student at once. */
function Suggestions(props: {
  readonly search: string;
  readonly onPick: (hocVienId: string) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const found = usePagedRows('hocVien', {
    page: 1,
    search: props.search,
    searchFields: ['ma', 'hoTen'],
  });
  const classes = useRows('lop').loaded;
  const rows =
    found.loaded.state === 'ready' ? found.loaded.rows.slice(0, 8) : [];
  const exact = rows.filter(
    (row) => text(row.ma).toLowerCase() === props.search.toLowerCase(),
  );
  const { onPick } = props;
  const onlyId =
    found.loaded.state === 'ready' && exact.length === 1 && exact[0]
      ? String(exact[0].id)
      : '';
  useEffect(() => {
    if (onlyId !== '') onPick(onlyId);
  }, [onlyId, onPick]);
  if (found.loaded.state === 'loading' || rows.length === 0) {
    return found.loaded.state === 'ready' ? (
      <p className='mt-2 text-xs text-muted-foreground'>
        {t('edu.hocPhi.noMatch')}
      </p>
    ) : null;
  }
  const className = (id: unknown): string =>
    classes.state === 'ready'
      ? text(classes.rows.find((row) => row.id === id)?.ten) || '—'
      : '—';
  return (
    <ul className='absolute left-0 right-0 z-20 mt-1 divide-y overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg'>
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type='button'
            onClick={() => props.onPick(String(row.id))}
            className='flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-muted/50'
          >
            <span>
              <span className='text-sm font-bold'>{text(row.hoTen)}</span>
              <span className='ml-2 font-mono text-xs text-muted-foreground'>
                ({text(row.ma)})
              </span>
              <span className='ml-2 text-xs text-muted-foreground'>
                · {className(row.lopId)}
              </span>
            </span>
            <span className='flex items-center gap-2'>
              <SessionBalanceBadge
                balance={
                  row.soBuoiConLai == null ? null : Number(row.soBuoiConLai)
                }
                size='sm'
              />
              <ArrowRight className='h-4 w-4 text-muted-foreground' />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The student being served: their packages, with "sell a package", "take a payment" and the VietQR code. */
function Served(props: {
  readonly studentId: number;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { can: canSell } = useCan({
    resource: { type: 'composite', id: 'edu.goiHoc' },
    action: 'manage',
  });
  const { can: canPay } = useCan({
    resource: { type: 'composite', id: 'edu.thanhToan' },
    action: 'manage',
  });
  const student = useRequest<Row | null>('hocVien/findOne', {
    filter: { id: props.studentId },
  });
  const packs = usePagedRows('goiHoc', {
    page: 1,
    where: { hocVienId: props.studentId },
    descending: true,
  });
  const classes = useRows('lop').loaded;
  const [sell, setSell] = useState<{ soBuoi: string; donGia: string }>();
  const [pay, setPay] = useState<{
    goiHocId: string;
    soTien: string;
    hinhThuc: string;
    noiDungCk: string;
  }>();
  const [qr, setQr] = useState<Qr | 'unset' | null>(null);
  const reload = (): void => {
    student.reload();
    packs.reload();
    props.onChanged();
  };

  const row = student.result.state === 'ready' ? student.result.data : null;
  if (student.result.state === 'loading')
    return (
      <p role='status' className='text-sm text-muted-foreground'>
        {t('edu.common.loading')}
      </p>
    );
  if (!row)
    return (
      <p role='alert' className='text-sm text-destructive'>
        {t('edu.hocVien.notFound')}
      </p>
    );
  const className =
    classes.state === 'ready'
      ? text(classes.rows.find((item) => item.id === row.lopId)?.ten) || '—'
      : '—';
  const packRows = packs.loaded.state === 'ready' ? packs.loaded.rows : [];

  const openQr = async (goiHocId: string): Promise<void> => {
    try {
      const answer = (await post(api, '/thanhToan/vietQr', {
        goiHocId: Number(goiHocId),
      })) as { data: Qr };
      setQr(answer.data);
    } catch {
      setQr('unset');
    }
  };

  return (
    <div className='flex flex-col gap-5'>
      <div className='flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-muted/30 p-5'>
        <div className='flex items-center gap-4'>
          <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-black text-primary-foreground shadow-sm'>
            {text(row.hoTen).charAt(0)}
          </div>
          <div>
            <div className='flex items-center gap-2'>
              <h3 className='text-lg font-bold'>{text(row.hoTen)}</h3>
              <span className='rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground'>
                {text(row.ma)}
              </span>
            </div>
            <p className='mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
              {t('edu.hocVien.lop')}: <strong>{className}</strong>
              <SessionBalanceBadge
                balance={
                  row.soBuoiConLai == null ? null : Number(row.soBuoiConLai)
                }
                size='sm'
              />
            </p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Link
            to={`/hoc-vien/${row.id}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {t('edu.hocPhi.openFile')}
          </Link>
          {canSell ? (
            <Button
              size='sm'
              onClick={() => setSell({ soBuoi: '12', donGia: '150000' })}
            >
              <DollarSign className='h-3.5 w-3.5' />
              {t('edu.hocPhi.sellNew')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className='rounded-2xl border bg-card p-5 shadow-sm'>
        <h4 className='mb-3 flex items-center gap-2 border-b pb-2.5 text-sm font-bold'>
          <Wallet className='h-4 w-4 text-primary' />
          {t('edu.hocPhi.packagesTitle', { count: packRows.length })}
        </h4>
        {packs.loaded.state === 'loading' ? (
          <p className='py-6 text-center text-xs text-muted-foreground'>
            {t('edu.common.loading')}
          </p>
        ) : packRows.length === 0 ? (
          <p className='py-6 text-center text-xs text-muted-foreground'>
            {t('edu.hocPhi.noPackages')}
          </p>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('edu.hocVien.ngayMua')}</TableHead>
                  <TableHead className='text-center'>
                    {t('edu.hocPhi.sessions')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('edu.hocVien.donGia')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('edu.hocVien.thanhTien')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('edu.common.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packRows.map((pack) => (
                  <TableRow key={pack.id}>
                    <TableCell>{formatDay(pack.ngayMua)}</TableCell>
                    <TableCell className='text-center font-bold'>
                      {text(pack.soBuoi)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {formatMoney(pack.donGia)}
                    </TableCell>
                    <TableCell className='text-right font-bold'>
                      {formatMoney(pack.thanhTien)}
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex items-center justify-end gap-2'>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => void openQr(String(pack.id))}
                        >
                          <QrCode className='h-3 w-3' />
                          {t('edu.hocPhi.qrShort')}
                        </Button>
                        {canPay ? (
                          <Button
                            size='sm'
                            onClick={() =>
                              setPay({
                                goiHocId: String(pack.id),
                                soTien: text(pack.thanhTien),
                                hinhThuc: 'chuyen_khoan',
                                noiDungCk: `HP ${text(row.ma)} ${text(pack.soBuoi)}B`,
                              })
                            }
                          >
                            {t('edu.hocPhi.collect')}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {sell ? (
        <FormDialog
          open
          title={t('edu.hocPhi.sellTitle')}
          description={t('edu.hocPhi.forStudent', {
            name: text(row.hoTen),
            code: text(row.ma),
          })}
          onClose={() => setSell(undefined)}
          onSubmit={async () => {
            await post(api, '/goiHoc/taoMoi', {
              hocVienId: row.id,
              soBuoi: Number(sell.soBuoi),
              donGia: Number(sell.donGia),
              ngayMua: todayVn(),
            });
            reload();
          }}
        >
          <TextField
            id='sell-so-buoi'
            label={t('edu.hocPhi.sellSessions')}
            type='number'
            value={sell.soBuoi}
            required
            onChange={(soBuoi) => setSell({ ...sell, soBuoi })}
          />
          <TextField
            id='sell-don-gia'
            label={t('edu.hocPhi.sellPrice')}
            type='number'
            value={sell.donGia}
            required
            onChange={(donGia) => setSell({ ...sell, donGia })}
          />
          <div className='rounded-lg bg-muted p-3 text-sm'>
            {t('edu.hocPhi.sellTotal')}:{' '}
            <strong className='text-base text-primary'>
              {t('edu.common.money', {
                amount: formatMoney(
                  Number(sell.soBuoi) * Number(sell.donGia) || 0,
                ),
              })}
            </strong>
          </div>
        </FormDialog>
      ) : null}

      {pay ? (
        <FormDialog
          open
          title={t('edu.hocPhi.payTitle')}
          description={t('edu.hocPhi.forStudentName', {
            name: text(row.hoTen),
          })}
          onClose={() => setPay(undefined)}
          onSubmit={async () => {
            await post(api, '/thanhToan/ghiNhan', {
              goiHocId: Number(pay.goiHocId),
              soTien: Number(pay.soTien),
              hinhThuc: pay.hinhThuc,
              ngay: todayVn(),
              noiDungCk: pay.noiDungCk.trim() || undefined,
            });
            reload();
          }}
        >
          <TextField
            id='pay-so-tien'
            label={t('edu.hocPhi.payAmount')}
            type='number'
            value={pay.soTien}
            required
            onChange={(soTien) => setPay({ ...pay, soTien })}
          />
          <SelectField
            id='pay-hinh-thuc'
            label={t('edu.hocPhi.method')}
            value={pay.hinhThuc}
            onChange={(hinhThuc) => setPay({ ...pay, hinhThuc })}
            options={[
              { value: 'chuyen_khoan', label: t('edu.hocPhi.transfer') },
              { value: 'tien_mat', label: t('edu.hocPhi.cash') },
            ]}
          />
          <TextField
            id='pay-noi-dung'
            label={t('edu.hocPhi.payNote')}
            value={pay.noiDungCk}
            onChange={(noiDungCk) => setPay({ ...pay, noiDungCk })}
          />
          <Button
            type='button'
            variant='outline'
            onClick={() => void openQr(pay.goiHocId)}
          >
            <QrCode className='h-4 w-4' />
            {t('edu.hocPhi.showQr')}
          </Button>
        </FormDialog>
      ) : null}

      <Dialog open={qr !== null} onOpenChange={(open) => !open && setQr(null)}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <QrCode className='h-5 w-5 text-primary' />
              {t('edu.hocPhi.qr')}
            </DialogTitle>
            <DialogDescription>{t('edu.hocPhi.qrHint')}</DialogDescription>
          </DialogHeader>
          {qr === 'unset' ? (
            <p className='py-6 text-center text-sm text-destructive'>
              {t('edu.hocPhi.qrUnset')}
            </p>
          ) : qr ? (
            <div className='flex flex-col items-center gap-4 py-2'>
              <img
                src={qr.url}
                alt={t('edu.hocPhi.qr')}
                className='max-h-72 rounded-xl border shadow-md'
              />
              <div className='w-full space-y-1.5 rounded-xl bg-muted p-3 text-xs'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>
                    {t('edu.hocPhi.amount')}:
                  </span>
                  <span className='text-sm font-bold'>
                    {t('edu.common.money', { amount: formatMoney(qr.soTien) })}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>
                    {t('edu.hocPhi.content')}:
                  </span>
                  <span className='font-mono font-bold text-primary'>
                    {qr.noiDungCk}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Cash book -------------------------------------------------------------------------------------------------

/** The payments of one month (or all), newest first, 25 a page, with the student's name; the month is in the address. */
function CashBook(props: {
  readonly month: string;
  readonly page: number;
  readonly onMonth: (month: string) => void;
  readonly onPage: (page: number) => void;
  readonly reloadKey: number;
}): ReactElement {
  const { t } = useTranslation();
  const all = props.month === 'all';
  const payments = usePagedRows('thanhToan', {
    page: props.page,
    descending: true,
    where: all ? {} : { thang: props.month },
  });
  void props.reloadKey;
  const rows = payments.loaded.state === 'ready' ? payments.loaded.rows : [];
  const students = useRowsByIds(
    'hocVien',
    rows.map((row) => Number(row.hocVienId)),
  );
  const months = recentMonths(12);
  return (
    <div className='flex flex-col gap-5'>
      <div className='flex flex-wrap items-center gap-3'>
        <FilterSelect
          label={t('edu.hocPhi.month')}
          value={props.month}
          allValue='all'
          allLabel={t('edu.hocPhi.allMonths')}
          options={(months.includes(props.month) || all
            ? months
            : [props.month, ...months]
          ).map((month) => ({ value: month, label: month }))}
          onChange={props.onMonth}
        />
        <span className='text-xs text-muted-foreground'>
          {t('edu.hocPhi.paymentsCount', { count: payments.total })}
        </span>
      </div>
      {all ? null : <MonthTotal month={props.month} />}
      <RowsTable
        loaded={payments.loaded}
        onRetry={payments.reload}
        emptyTitle={t('edu.hocPhi.noPayments')}
        emptyHint={t('edu.hocPhi.noPaymentsHint')}
        paging={{
          page: props.page,
          total: payments.total,
          onPage: props.onPage,
        }}
        columns={[
          {
            key: 'ngay',
            label: t('edu.hocPhi.paidOn'),
            render: (row) => formatDay(row.ngay),
          },
          {
            key: 'hocVien',
            label: t('edu.hocVien.hoTen'),
            render: (row) => {
              const student = students.get(Number(row.hocVienId));
              return (
                <RecordLink to={`/hoc-vien/${text(row.hocVienId)}`}>
                  {student
                    ? `${text(student.hoTen)} (${text(student.ma)})`
                    : t('edu.hocPhi.studentFallback', {
                        id: text(row.hocVienId),
                      })}
                </RecordLink>
              );
            },
          },
          {
            key: 'soTien',
            label: t('edu.hocPhi.amount'),
            render: (row) => formatMoney(row.soTien),
          },
          {
            key: 'hinhThuc',
            label: t('edu.hocPhi.method'),
            render: (row) => (
              <StatusBadge
                tone={row.hinhThuc === 'chuyen_khoan' ? 'info' : 'success'}
                size='sm'
              >
                {row.hinhThuc === 'chuyen_khoan'
                  ? t('edu.hocPhi.transfer')
                  : t('edu.hocPhi.cash')}
              </StatusBadge>
            ),
          },
          {
            key: 'noiDungCk',
            label: t('edu.hocPhi.content'),
            render: (row) => text(row.noiDungCk) || '—',
          },
        ]}
      />
    </div>
  );
}

/** Revenue of the month from the revenue report, which has the same grant as the payments themselves. */
function MonthTotal({
  month,
}: {
  readonly month: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const report = useRequest<{ rows: { doanhThu: number; soKhoan: number }[] }>(
    '/baoCao/xem',
    { loai: 'doanhThu', tuThang: month, denThang: month },
  );
  if (report.result.state !== 'ready') return null;
  const rows = report.result.data.rows;
  const total = rows.reduce((sum, row) => sum + Number(row.doanhThu), 0);
  const count = rows.reduce((sum, row) => sum + Number(row.soKhoan), 0);
  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
      <Card className='border-primary/20 bg-primary/5 shadow-sm'>
        <CardHeader className='pb-2'>
          <CardTitle className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>
            {t('edu.hocPhi.monthTotal', { month })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-black text-primary'>
            {t('edu.common.money', { amount: formatMoney(total) })}
          </div>
        </CardContent>
      </Card>
      <Card className='shadow-sm'>
        <CardHeader className='pb-2'>
          <CardTitle className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>
            {t('edu.hocPhi.monthCount')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>{count}</div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Who has to pay next -------------------------------------------------------------------------------------------

/**
 * The students who are studying and have `nguong` sessions left or fewer (or owe sessions): the list of the server
 * (`/soDu/canhBao`), the same one the home page warns about and the audit page counts.
 */
function NeedToPay(props: {
  readonly request: ReturnType<
    typeof useRequest<{ tong: number; hocVien: Row[]; nguong: number }>
  >;
  readonly page: number;
  readonly onPage: (page: number) => void;
  readonly onServe: (hocVienId: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const classes = useRows('lop').loaded;
  const { result, reload } = props.request;
  if (result.state === 'loading')
    return (
      <p role='status' className='text-sm text-muted-foreground'>
        {t('edu.common.loading')}
      </p>
    );
  if (result.state === 'error')
    return (
      <div role='alert' className='flex flex-col items-start gap-3'>
        <p className='text-sm text-destructive'>{t('edu.common.loadError')}</p>
        <Button variant='outline' onClick={reload}>
          {t('edu.common.retry')}
        </Button>
      </div>
    );
  const { hocVien, tong, nguong } = result.data;
  const className = (id: unknown): string =>
    classes.state === 'ready'
      ? text(classes.rows.find((row) => row.id === id)?.ten) || '—'
      : '—';
  return (
    <div className='rounded-2xl border bg-card p-5 shadow-sm'>
      <div className='mb-3 border-b pb-2.5'>
        <h3 className='flex items-center gap-2 text-sm font-bold'>
          <BadgeAlert className='h-4 w-4 text-primary' />
          {t('edu.hocPhi.canThuTitle', { count: tong })}
        </h3>
        <p className='mt-0.5 text-xs text-muted-foreground'>
          {t('edu.hocPhi.canThuHint', { count: nguong })}
        </p>
      </div>
      {hocVien.length === 0 ? (
        <p className='p-8 text-center text-xs text-muted-foreground'>
          {t('edu.hocPhi.canThuEmpty')}
        </p>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('edu.hocVien.ma')}</TableHead>
                <TableHead>{t('edu.hocVien.hoTen')}</TableHead>
                <TableHead>{t('edu.hocVien.lop')}</TableHead>
                <TableHead>{t('edu.diemDanh.balance')}</TableHead>
                <TableHead className='text-right'>
                  {t('edu.common.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hocVien.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className='font-mono font-bold'>
                    {text(row.ma)}
                  </TableCell>
                  <TableCell>
                    <RecordLink to={`/hoc-vien/${row.id}`}>
                      {text(row.hoTen)}
                    </RecordLink>
                  </TableCell>
                  <TableCell>{className(row.lopId)}</TableCell>
                  <TableCell>
                    <SessionBalanceBadge
                      balance={Number(row.soBuoiConLai)}
                      size='sm'
                    />
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex items-center justify-end gap-2'>
                      <Button
                        size='sm'
                        onClick={() => props.onServe(String(row.id))}
                      >
                        <DollarSign className='h-3 w-3' />
                        {t('edu.hocPhi.collectNow')}
                      </Button>
                      <Link
                        to={`/hoc-vien/${row.id}?tab=hoc-phi`}
                        className={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                        })}
                      >
                        {t('edu.hocPhi.openFile')}
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager page={props.page} total={tong} onPage={props.onPage} />
        </div>
      )}
    </div>
  );
}
