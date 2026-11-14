import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { FormDialog, SelectField, TextField } from './form-parts.js';
import {
  post,
  text,
  todayVn,
  useListState,
  usePagedRows,
  useRows,
  useRequest,
  useRowsByIds,
} from './kit.js';
import { ListPage } from './list-page.js';

interface Form {
  hocVienId: string;
  sachId: string;
  ngay: string;
  uuDai: string;
  ghiChu: string;
}

const money = (value: unknown): string =>
  Number(value ?? 0).toLocaleString('vi-VN');

interface FundRow {
  hocVienId: number;
  ma: string;
  hoTen: string;
  daNop: number;
  daPhat: number;
  conLai: number;
}

/** The book fund of each student: what the parent paid for books, what was handed out, what is left. */
function QuySach(props: { version: number }): ReactElement | null {
  const { t } = useTranslation();
  const { result } = useRequest<{ rows: FundRow[] }>('/quySach/xem', {
    v: props.version,
  });
  if (result.state !== 'ready' || result.data.rows.length === 0) return null;
  return (
    <section className='mx-auto w-full max-w-6xl px-4 pb-8'>
      <h2 className='mb-1 text-lg font-semibold'>{t('edu.quySach.title')}</h2>
      <p className='mb-3 text-sm text-muted-foreground'>
        {t('edu.quySach.description')}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('edu.phatSach.hocVien')}</TableHead>
            <TableHead>{t('edu.quySach.daNop')}</TableHead>
            <TableHead>{t('edu.quySach.daPhat')}</TableHead>
            <TableHead>{t('edu.quySach.conLai')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.data.rows.map((row) => (
            <TableRow key={row.hocVienId}>
              <TableCell>{`${row.ma} · ${row.hoTen}`}</TableCell>
              <TableCell>{money(row.daNop)}</TableCell>
              <TableCell>{money(row.daPhat)}</TableCell>
              <TableCell>{money(row.conLai)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/**
 * The books handed out to students. The server fills the branch of the student and the price of the book; the
 * person only chooses the student, the book, the day and the discount.
 */
export default function PhatSachPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const list = useListState();
  const { loaded, total, reload } = usePagedRows('phatSach', {
    page: list.page,
    descending: true,
  });
  const { can: canManage } = useCan({
    resource: { type: 'composite', id: 'edu.phatSach' },
    action: 'manage',
  });
  const rows = loaded.state === 'ready' ? loaded.rows : [];
  const students = useRowsByIds(
    'hocVien',
    rows.map((row) => Number(row.hocVienId)),
  );
  const books = useRowsByIds(
    'sach',
    rows.map((row) => Number(row.sachId)),
  );
  const [form, setForm] = useState<Form>();
  const studentChoices = useRows('hocVien');
  const bookChoices = useRows('sach');

  const open = (): void =>
    setForm({
      hocVienId: '',
      sachId: '',
      ngay: todayVn(),
      uuDai: '0',
      ghiChu: '',
    });

  return (
    <>
      <ListPage
        title={t('edu.phatSach.title')}
        description={t('edu.phatSach.description')}
        emptyTitle={t('edu.phatSach.empty')}
        emptyHint={t('edu.phatSach.emptyHint')}
        loaded={loaded}
        onRetry={reload}
        paging={{ page: list.page, total, onPage: list.setPage }}
        actions={
          canManage ? (
            <Button onClick={open}>{t('edu.phatSach.new')}</Button>
          ) : null
        }
        columns={[
          { key: 'ngay', label: t('edu.phatSach.ngay') },
          {
            key: 'hocVienId',
            label: t('edu.phatSach.hocVien'),
            render: (row) => {
              const student = students.get(Number(row.hocVienId));
              return student
                ? `${text(student.ma)} · ${text(student.hoTen)}`
                : '';
            },
          },
          {
            key: 'sachId',
            label: t('edu.phatSach.sach'),
            render: (row) => {
              const book = books.get(Number(row.sachId));
              return book ? `${text(book.kyHieu)} · ${text(book.ten)}` : '';
            },
          },
          {
            key: 'uuDai',
            label: t('edu.phatSach.uuDai'),
            render: (row) => money(row.uuDai),
          },
          {
            key: 'tienSach',
            label: t('edu.phatSach.tienSach'),
            render: (row) => money(row.tienSach),
          },
          { key: 'ghiChu', label: t('edu.phatSach.ghiChu') },
        ]}
      />
      <QuySach version={total} />
      {form ? (
        <FormDialog
          open
          title={t('edu.phatSach.new')}
          onClose={() => setForm(undefined)}
          onSubmit={async () => {
            await post(api, '/phatSach/ghi', {
              hocVienId: Number(form.hocVienId),
              sachId: Number(form.sachId),
              ngay: form.ngay,
              uuDai: Number(form.uuDai.replace(/\D/gu, '')) || 0,
              ghiChu: form.ghiChu.trim() || null,
            });
            reload();
          }}
        >
          <SelectField
            id='phat-sach-hoc-vien'
            label={t('edu.phatSach.hocVien')}
            value={form.hocVienId}
            required
            onChange={(hocVienId) => setForm({ ...form, hocVienId })}
            options={(studentChoices.loaded.state === 'ready'
              ? studentChoices.loaded.rows
              : []
            ).map((row) => ({
              value: String(row.id),
              label: `${text(row.ma)} · ${text(row.hoTen)}`,
            }))}
          />
          <SelectField
            id='phat-sach-sach'
            label={t('edu.phatSach.sach')}
            value={form.sachId}
            required
            onChange={(sachId) => setForm({ ...form, sachId })}
            options={(bookChoices.loaded.state === 'ready'
              ? bookChoices.loaded.rows
              : []
            )
              .filter((row) => row.trangThai === 'dang_ban')
              .map((row) => ({
                value: String(row.id),
                label: `${text(row.kyHieu)} · ${text(row.ten)} (${money(row.giaBan)})`,
              }))}
          />
          <TextField
            id='phat-sach-ngay'
            label={t('edu.phatSach.ngay')}
            type='date'
            value={form.ngay}
            required
            onChange={(ngay) => setForm({ ...form, ngay })}
          />
          <TextField
            id='phat-sach-uu-dai'
            label={t('edu.phatSach.uuDai')}
            type='number'
            value={form.uuDai}
            onChange={(uuDai) => setForm({ ...form, uuDai })}
          />
          <TextField
            id='phat-sach-ghi-chu'
            label={t('edu.phatSach.ghiChu')}
            value={form.ghiChu}
            onChange={(ghiChu) => setForm({ ...form, ghiChu })}
          />
        </FormDialog>
      ) : null}
    </>
  );
}
