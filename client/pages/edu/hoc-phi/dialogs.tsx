import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Textarea } from '#components/ui/textarea';

import { Field, FormDialog, SelectField, TextField } from '../form-parts.js';
import { post, todayVn, useRequest } from '../kit.js';
import { formatVnd } from '../tien.js';

/** The student a tuition dialog is about. */
export interface StudentRef {
  readonly id: number;
  readonly hoTen: string;
  readonly soBuoiConLai: number;
}

/** A package as `/goiHoc/cuaHocVien` answers it; the paid amounts are `null` for a person who sees no payments. */
export interface PackageRow {
  readonly id: number;
  readonly ngayMua: string;
  readonly soBuoi: number;
  readonly donGia: number;
  readonly thanhTien: number;
  readonly trangThai: string;
  readonly loai: string;
  readonly daThu: number | null;
  readonly conNo: number | null;
}

export interface PaymentRow {
  readonly id: number;
  readonly goiHocId: number | null;
  readonly soPhieu: string | null;
  readonly ngay: string;
  readonly soTien: number;
  readonly hinhThuc: string;
  readonly noiDungCk: string | null;
}

export interface StudentPackages {
  readonly goi: readonly PackageRow[];
  readonly thanhToan: readonly PaymentRow[] | null;
}

/** Sells a package: the sessions are added to the balance on the server, in the transaction that writes the ledger. */
export function SellDialog(props: {
  readonly student: StudentRef;
  /** The price of the student's latest package, offered as the price of this one. */
  readonly lastPrice?: number;
  readonly onClose: () => void;
  readonly onDone: (sold: { soBuoi: number; soBuoiConLai: number }) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [soBuoi, setSoBuoi] = useState('12');
  const [donGia, setDonGia] = useState(() =>
    props.lastPrice ? String(props.lastPrice) : '',
  );
  const [ngayMua, setNgayMua] = useState(() => todayVn());
  const body = {
    hocVienId: props.student.id,
    soBuoi: Number(soBuoi),
    donGia: Number(donGia),
    ngayMua,
  };
  return (
    <FormDialog
      open
      title={t('edu.hocPhi.sellFor', { name: props.student.hoTen })}
      description={t('edu.hocPhi.sellHint')}
      submitLabel={t('edu.hocPhi.sellSubmit')}
      snapshot={body}
      onClose={props.onClose}
      onSubmit={async (operation) => {
        const response = (await post(
          api,
          '/goiHoc/taoMoi',
          body,
          operation,
        )) as { data: { soBuoiConLai: number } };
        props.onDone({
          soBuoi: body.soBuoi,
          soBuoiConLai: response.data.soBuoiConLai,
        });
      }}
    >
      <TextField
        id='goi-so-buoi'
        label={t('edu.hocPhi.sessions')}
        type='number'
        value={soBuoi}
        required
        onChange={setSoBuoi}
      />
      <TextField
        id='goi-don-gia'
        label={t('edu.hocPhi.unitPrice')}
        type='number'
        value={donGia}
        required
        onChange={setDonGia}
      />
      <TextField
        id='goi-ngay-mua'
        label={t('edu.hocPhi.boughtOn')}
        type='date'
        value={ngayMua}
        required
        onChange={setNgayMua}
      />
      <p className='rounded-lg bg-muted px-3 py-2 text-sm'>
        {t('edu.hocPhi.total', {
          amount: formatVnd(body.soBuoi * body.donGia),
        })}
      </p>
    </FormDialog>
  );
}

/** Records a payment for one package; the server gives the receipt its number. */
export function PayDialog(props: {
  readonly student: StudentRef;
  readonly pack: PackageRow;
  readonly onClose: () => void;
  readonly onDone: (paid: {
    id: number;
    soPhieu: string;
    soTien: number;
  }) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const owed = props.pack.conNo ?? props.pack.thanhTien;
  const [soTien, setSoTien] = useState(() => String(owed));
  const [hinhThuc, setHinhThuc] = useState('chuyen_khoan');
  const [ngay, setNgay] = useState(() => todayVn());
  const [noiDungCk, setNoiDungCk] = useState('');
  const body = {
    goiHocId: props.pack.id,
    soTien: Number(soTien),
    hinhThuc,
    ngay,
    ...(noiDungCk.trim() ? { noiDungCk: noiDungCk.trim() } : {}),
  };
  return (
    <FormDialog
      open
      title={t('edu.hocPhi.payFor', { name: props.student.hoTen })}
      description={t('edu.hocPhi.payHint', {
        count: props.pack.soBuoi,
        day: props.pack.ngayMua,
        owed: formatVnd(owed),
      })}
      submitLabel={t('edu.hocPhi.paySubmit')}
      snapshot={body}
      onClose={props.onClose}
      onSubmit={async (operation) => {
        const response = (await post(
          api,
          '/thanhToan/ghiNhan',
          body,
          operation,
        )) as { data: { id: number; soPhieu: string } };
        props.onDone({ ...response.data, soTien: body.soTien });
      }}
    >
      <TextField
        id='thu-so-tien'
        label={t('edu.hocPhi.amount')}
        type='number'
        value={soTien}
        required
        onChange={setSoTien}
      />
      <SelectField
        id='thu-hinh-thuc'
        label={t('edu.hocPhi.method')}
        value={hinhThuc}
        onChange={setHinhThuc}
        options={[
          { value: 'chuyen_khoan', label: t('edu.hocPhi.transfer') },
          { value: 'tien_mat', label: t('edu.hocPhi.cash') },
        ]}
      />
      <TextField
        id='thu-ngay'
        label={t('edu.hocPhi.day')}
        type='date'
        value={ngay}
        required
        onChange={setNgay}
      />
      <TextField
        id='thu-noi-dung'
        label={t('edu.hocPhi.payNote')}
        value={noiDungCk}
        onChange={setNoiDungCk}
      />
    </FormDialog>
  );
}

interface Qr {
  readonly soTien: number;
  readonly noiDungCk: string;
  readonly url: string;
}

/** The VietQR transfer code for what a package still owes; amount and note come from the server. */
export function QrDialog(props: {
  readonly goiHocId: number;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { result } = useRequest<Qr>('/thanhToan/vietQr', {
    goiHocId: props.goiHocId,
  });
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('edu.hocPhi.qr')}</DialogTitle>
          <DialogDescription>
            {result.state === 'ready'
              ? t('edu.hocPhi.qrHint', {
                  amount: formatVnd(result.data.soTien),
                })
              : ''}
          </DialogDescription>
        </DialogHeader>
        {result.state === 'loading' ? (
          <p role='status' className='text-sm text-muted-foreground'>
            {t('edu.common.loading')}
          </p>
        ) : result.state === 'error' ? (
          <p role='alert' className='text-sm text-destructive'>
            {result.reason === 'EDU_VIETQR_NOT_CONFIGURED'
              ? t('edu.hocPhi.qrUnset')
              : t('edu.common.loadError')}
          </p>
        ) : (
          <div className='flex flex-col items-center gap-3'>
            <img
              src={result.data.url}
              alt={t('edu.hocPhi.qr')}
              className='max-h-80 rounded-lg border'
            />
            <p className='text-sm'>
              {t('edu.hocPhi.content')}:{' '}
              <strong className='font-mono'>{result.data.noiDungCk}</strong>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Sets a balance by hand, with a reason. The form sends the balance the person is looking at; when somebody changed it
 * meanwhile the server writes nothing and says so. Offered only to a person who holds `edu.soDu` `adjust`.
 */
export function AdjustDialog(props: {
  readonly student: StudentRef;
  readonly onClose: () => void;
  readonly onDone: (balance: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [soDuMoi, setSoDuMoi] = useState(() =>
    String(props.student.soBuoiConLai),
  );
  const [lyDo, setLyDo] = useState('');
  const body = {
    hocVienId: props.student.id,
    soDuHienTai: props.student.soBuoiConLai,
    soDuMoi: Number(soDuMoi),
    lyDo: lyDo.trim(),
  };
  return (
    <FormDialog
      open
      title={t('edu.soDu.adjustFor', { name: props.student.hoTen })}
      description={t('edu.soDu.adjustHint')}
      submitLabel={t('edu.soDu.submit')}
      snapshot={body}
      onClose={props.onClose}
      onSubmit={async (operation) => {
        const response = (await post(
          api,
          '/soDu/dieuChinh',
          body,
          operation,
        )) as { data: { soBuoiConLai: number } };
        props.onDone(response.data.soBuoiConLai);
      }}
    >
      <div className='flex flex-col gap-1'>
        <span className='text-sm font-medium'>{t('edu.soDu.current')}</span>
        <span className='text-lg font-semibold'>
          {props.student.soBuoiConLai}
        </span>
      </div>
      <TextField
        id='so-du-moi'
        label={t('edu.soDu.target')}
        type='number'
        value={soDuMoi}
        required
        onChange={setSoDuMoi}
      />
      <Field
        id='so-du-ly-do'
        label={t('edu.soDu.reason')}
        hint={t('edu.soDu.reasonHint')}
      >
        <Textarea
          id='so-du-ly-do'
          value={lyDo}
          required
          minLength={3}
          maxLength={500}
          rows={3}
          onChange={(event) => setLyDo(event.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
