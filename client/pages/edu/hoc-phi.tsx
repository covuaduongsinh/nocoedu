import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';

import { FormDialog, SelectField, TextField } from './form-parts.js';
import {
  post,
  text,
  todayVn,
  useListState,
  usePagedRows,
  type Row,
} from './kit.js';
import { ListPage } from './list-page.js';

const fmt = (value: unknown): string => Number(value).toLocaleString('vi-VN');

interface Qr {
  soTien: number;
  noiDungCk: string;
  url: string;
}

/**
 * Tuition per session: the balance of each student, selling a package, recording a payment (cash or transfer), the
 * VietQR transfer code and the ledger of every balance change. Balances and amounts are computed on the server.
 */
export default function HocPhiPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const list = useListState();
  const { loaded, total, reload } = usePagedRows('hocVien', {
    page: list.page,
    search: list.applied,
    searchFields: ['ma', 'hoTen'],
  });
  const { can: canSell } = useCan({
    resource: { type: 'composite', id: 'edu.goiHoc' },
    action: 'manage',
  });
  const { can: canPay } = useCan({
    resource: { type: 'composite', id: 'edu.thanhToan' },
    action: 'manage',
  });
  const [sell, setSell] = useState<{
    row: Row;
    soBuoi: string;
    donGia: string;
  }>();
  const [pay, setPay] = useState<{
    row: Row;
    packs: Row[];
    goiHocId: string;
    soTien: string;
    hinhThuc: string;
  }>();
  const [qr, setQr] = useState<Qr | 'unset'>();
  const [ledger, setLedger] = useState<{ row: Row; rows: Row[] }>();

  const openPay = async (row: Row): Promise<void> => {
    const response = await api.request<{ data: Row[] }>({
      path: '/goiHoc/findMany',
      method: 'POST',
      json: { filter: { hocVienId: row.id }, limit: 100 },
    });
    setPay({
      row,
      packs: response.data,
      goiHocId: '',
      soTien: '',
      hinhThuc: 'chuyen_khoan',
    });
  };
  const openQr = async (goiHocId: string): Promise<void> => {
    try {
      const response = (await post(api, '/thanhToan/vietQr', {
        goiHocId: Number(goiHocId),
      })) as {
        data: Qr;
      };
      setQr(response.data);
    } catch {
      setQr('unset');
    }
  };
  const openLedger = async (row: Row): Promise<void> => {
    const response = await api.request<{ data: Row[] }>({
      path: '/soDuNhatKy/findMany',
      method: 'POST',
      json: { filter: { hocVienId: row.id }, limit: 100 },
    });
    setLedger({ row, rows: response.data });
  };

  return (
    <>
      <ListPage
        title={t('edu.hocPhi.title')}
        description={t('edu.hocPhi.description')}
        emptyTitle={t('edu.hocVien.empty')}
        emptyHint={t('edu.hocVien.emptyHint')}
        loaded={loaded}
        onRetry={reload}
        paging={{ page: list.page, total, onPage: list.setPage }}
        search={{
          value: list.search,
          label: t('edu.common.search'),
          onChange: list.setSearch,
        }}
        columns={[
          { key: 'ma', label: t('edu.hocVien.ma') },
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
            key: 'soBuoiConLai',
            label: t('edu.diemDanh.balance'),
            render: (row) => (
              <StatusBadge
                tone={Number(row.soBuoiConLai) <= 2 ? 'warning' : 'success'}
              >
                {text(row.soBuoiConLai)}
              </StatusBadge>
            ),
          },
        ]}
        rowActions={(row) => (
          <div className='flex flex-wrap gap-2'>
            {canSell ? (
              <Button
                size='sm'
                variant='outline'
                onClick={() => setSell({ row, soBuoi: '10', donGia: '' })}
              >
                {t('edu.hocPhi.sell')}
              </Button>
            ) : null}
            {canPay ? (
              <Button
                size='sm'
                variant='outline'
                onClick={() => void openPay(row)}
              >
                {t('edu.hocPhi.pay')}
              </Button>
            ) : null}
            <Button
              size='sm'
              variant='outline'
              onClick={() => void openLedger(row)}
            >
              {t('edu.hocPhi.ledger')}
            </Button>
          </div>
        )}
      />

      {sell ? (
        <FormDialog
          open
          title={t('edu.hocPhi.sell')}
          description={text(sell.row.hoTen)}
          onClose={() => setSell(undefined)}
          onSubmit={async () => {
            await post(api, '/goiHoc/taoMoi', {
              hocVienId: sell.row.id,
              soBuoi: Number(sell.soBuoi),
              donGia: Number(sell.donGia),
              ngayMua: todayVn(),
            });
            reload();
          }}
        >
          <TextField
            id='goi-so-buoi'
            label={t('edu.hocPhi.sessions')}
            type='number'
            value={sell.soBuoi}
            required
            onChange={(soBuoi) => setSell({ ...sell, soBuoi })}
          />
          <TextField
            id='goi-don-gia'
            label={t('edu.hocPhi.unitPrice')}
            type='number'
            value={sell.donGia}
            required
            onChange={(donGia) => setSell({ ...sell, donGia })}
          />
          <p className='text-sm text-muted-foreground'>
            {t('edu.hocPhi.total', {
              amount: fmt(Number(sell.soBuoi) * Number(sell.donGia) || 0),
            })}
          </p>
        </FormDialog>
      ) : null}

      {pay ? (
        <FormDialog
          open
          title={t('edu.hocPhi.pay')}
          description={text(pay.row.hoTen)}
          onClose={() => setPay(undefined)}
          onSubmit={async () => {
            await post(api, '/thanhToan/ghiNhan', {
              goiHocId: Number(pay.goiHocId),
              soTien: Number(pay.soTien),
              hinhThuc: pay.hinhThuc,
              ngay: todayVn(),
            });
          }}
        >
          <SelectField
            id='pay-goi'
            label={t('edu.hocPhi.package')}
            value={pay.goiHocId}
            required
            onChange={(goiHocId) => setPay({ ...pay, goiHocId })}
            options={pay.packs.map((pack) => ({
              value: String(pack.id),
              label: `${text(pack.ngayMua)} · ${text(pack.soBuoi)} · ${fmt(pack.thanhTien)}`,
            }))}
          />
          <TextField
            id='pay-so-tien'
            label={t('edu.hocPhi.amount')}
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
              { value: 'tien_mat', label: t('edu.hocPhi.cash') },
              { value: 'chuyen_khoan', label: t('edu.hocPhi.transfer') },
            ]}
          />
          <Button
            type='button'
            variant='outline'
            disabled={!pay.goiHocId}
            onClick={() => void openQr(pay.goiHocId)}
          >
            {t('edu.hocPhi.qr')}
          </Button>
        </FormDialog>
      ) : null}

      <Dialog
        open={qr !== undefined}
        onOpenChange={(open) => (open ? undefined : setQr(undefined))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('edu.hocPhi.qr')}</DialogTitle>
            <DialogDescription>
              {qr === 'unset'
                ? t('edu.hocPhi.qrUnset')
                : qr
                  ? t('edu.hocPhi.qrHint', { amount: fmt(qr.soTien) })
                  : ''}
            </DialogDescription>
          </DialogHeader>
          {qr && qr !== 'unset' ? (
            <div className='flex flex-col items-center gap-3'>
              <img src={qr.url} alt={t('edu.hocPhi.qr')} className='max-h-80' />
              <p className='text-sm'>
                {t('edu.hocPhi.content')}: <strong>{qr.noiDungCk}</strong>
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={ledger !== undefined}
        onOpenChange={(open) => (open ? undefined : setLedger(undefined))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('edu.hocPhi.ledger')}</DialogTitle>
            <DialogDescription>
              {ledger ? text(ledger.row.hoTen) : ''}
            </DialogDescription>
          </DialogHeader>
          {ledger && ledger.rows.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('edu.hocPhi.ledgerEmpty')}
            </p>
          ) : (
            <ul className='flex max-h-80 flex-col gap-1 overflow-y-auto text-sm'>
              {ledger?.rows.map((entry) => (
                <li key={entry.id} className='flex justify-between gap-3'>
                  <span>{t(`edu.hocPhi.reason.${text(entry.lyDo)}`)}</span>
                  <span>
                    {Number(entry.thayDoi) > 0 ? '+' : ''}
                    {text(entry.thayDoi)} → {text(entry.soDuSau)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
