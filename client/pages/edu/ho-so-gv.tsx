import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';
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
  createOne,
  text,
  todayVn,
  updateOne,
  useListState,
  usePagedRows,
  useRequest,
} from './kit.js';
import { ListPage } from './list-page.js';

interface Form {
  id?: number;
  userId: string;
  tenVietTat: string;
  viTri: string;
  tinhTrang: string;
  thuLaoMotBuoi: string;
}

interface PayRow {
  userId: string;
  ten: string;
  soBuoi: number;
  thuLaoMotBuoi: number;
  tong: number;
}

const money = (value: unknown): string =>
  Number(value ?? 0).toLocaleString('vi-VN');

function Pay(): ReactElement {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => todayVn().slice(0, 7));
  const { result } = useRequest<{ rows: PayRow[]; tong: number }>(
    '/hoSoGv/thuLao',
    { thang: month },
  );
  return (
    <section className='mx-auto w-full max-w-6xl px-4 pb-8'>
      <h2 className='mb-1 text-lg font-semibold'>
        {t('edu.hoSoGv.thuLaoTitle')}
      </h2>
      <p className='mb-3 text-sm text-muted-foreground'>
        {t('edu.hoSoGv.thuLaoHint')}
      </p>
      <div className='mb-3 max-w-48'>
        <TextField
          id='thu-lao-thang'
          label={t('edu.hoSoGv.thang')}
          type='month'
          value={month}
          onChange={(value) => setMonth(value)}
        />
      </div>
      {result.state === 'ready' && result.data.rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('edu.hoSoGv.tenVietTat')}</TableHead>
              <TableHead>{t('edu.hoSoGv.soBuoi')}</TableHead>
              <TableHead>{t('edu.hoSoGv.thuLaoMotBuoi')}</TableHead>
              <TableHead>{t('edu.hoSoGv.tong')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.rows.map((row) => (
              <TableRow key={row.userId}>
                <TableCell>{row.ten}</TableCell>
                <TableCell>{row.soBuoi}</TableCell>
                <TableCell>{money(row.thuLaoMotBuoi)}</TableCell>
                <TableCell>{money(row.tong)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={3}>{t('edu.hoSoGv.tongCong')}</TableCell>
              <TableCell>{money(result.data.tong)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      ) : null}
    </section>
  );
}

/** The coach profiles and their pay. Only the administrator holds the page; the pay is private to that role. */
export default function HoSoGvPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const list = useListState();
  const { loaded, total, reload } = usePagedRows('hoSoGv', {
    page: list.page,
  });
  const coaches = useRequest<{ id: string; name: string }[]>(
    '/hlv/danhSach',
    {},
  ).result;
  const coachRows = coaches.state === 'ready' ? coaches.data : [];
  const nameOf = (id: unknown): string =>
    coachRows.find((coach) => coach.id === id)?.name ?? '';
  const { can: canManage } = useCan({
    resource: { type: 'composite', id: 'edu.hoSoGv' },
    action: 'manage',
  });
  const [form, setForm] = useState<Form>();

  return (
    <>
      <ListPage
        title={t('edu.hoSoGv.title')}
        description={t('edu.hoSoGv.description')}
        emptyTitle={t('edu.hoSoGv.empty')}
        emptyHint={t('edu.hoSoGv.emptyHint')}
        loaded={loaded}
        onRetry={reload}
        paging={{ page: list.page, total, onPage: list.setPage }}
        actions={
          canManage ? (
            <Button
              onClick={() =>
                setForm({
                  userId: '',
                  tenVietTat: '',
                  viTri: '',
                  tinhTrang: 'dang_lam',
                  thuLaoMotBuoi: '0',
                })
              }
            >
              {t('edu.hoSoGv.new')}
            </Button>
          ) : null
        }
        rowActions={
          canManage
            ? (row) => (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() =>
                    setForm({
                      id: row.id,
                      userId: text(row.userId),
                      tenVietTat: text(row.tenVietTat),
                      viTri: text(row.viTri),
                      tinhTrang: text(row.tinhTrang) || 'dang_lam',
                      thuLaoMotBuoi: String(Number(row.thuLaoMotBuoi ?? 0)),
                    })
                  }
                >
                  {t('edu.hoSoGv.edit')}
                </Button>
              )
            : undefined
        }
        columns={[
          {
            key: 'userId',
            label: t('edu.hoSoGv.tai'),
            render: (row) => nameOf(row.userId),
          },
          { key: 'tenVietTat', label: t('edu.hoSoGv.tenVietTat') },
          { key: 'viTri', label: t('edu.hoSoGv.viTri') },
          {
            key: 'tinhTrang',
            label: t('edu.hoSoGv.tinhTrang'),
            render: (row) => (
              <StatusBadge
                tone={row.tinhTrang === 'dang_lam' ? 'success' : 'neutral'}
              >
                {t(`edu.status.${text(row.tinhTrang)}`)}
              </StatusBadge>
            ),
          },
          {
            key: 'thuLaoMotBuoi',
            label: t('edu.hoSoGv.thuLaoMotBuoi'),
            render: (row) => money(row.thuLaoMotBuoi),
          },
        ]}
      />
      <Pay />
      {form ? (
        <FormDialog
          open
          title={form.id ? t('edu.hoSoGv.edit') : t('edu.hoSoGv.new')}
          onClose={() => setForm(undefined)}
          onSubmit={async () => {
            const values = {
              tenVietTat: form.tenVietTat.trim() || null,
              viTri: form.viTri.trim() || null,
              tinhTrang: form.tinhTrang,
              thuLaoMotBuoi:
                Number(form.thuLaoMotBuoi.replace(/\D/gu, '')) || 0,
            };
            if (form.id) await updateOne(api, 'hoSoGv', form.id, values);
            else
              await createOne(api, 'hoSoGv', {
                ...values,
                userId: form.userId,
              });
            reload();
          }}
        >
          {form.id ? null : (
            <SelectField
              id='ho-so-gv-user'
              label={t('edu.hoSoGv.tai')}
              value={form.userId}
              required
              onChange={(userId) => setForm({ ...form, userId })}
              options={coachRows.map((coach) => ({
                value: coach.id,
                label: coach.name,
              }))}
            />
          )}
          <TextField
            id='ho-so-gv-ten'
            label={t('edu.hoSoGv.tenVietTat')}
            value={form.tenVietTat}
            onChange={(tenVietTat) => setForm({ ...form, tenVietTat })}
          />
          <TextField
            id='ho-so-gv-vi-tri'
            label={t('edu.hoSoGv.viTri')}
            value={form.viTri}
            onChange={(viTri) => setForm({ ...form, viTri })}
          />
          <SelectField
            id='ho-so-gv-tinh-trang'
            label={t('edu.hoSoGv.tinhTrang')}
            value={form.tinhTrang}
            onChange={(tinhTrang) => setForm({ ...form, tinhTrang })}
            options={[
              { value: 'dang_lam', label: t('edu.status.dang_lam') },
              {
                value: 'da_nghi_viec',
                label: t('edu.status.da_nghi_viec'),
              },
            ]}
          />
          <TextField
            id='ho-so-gv-thu-lao'
            label={t('edu.hoSoGv.thuLaoMotBuoi')}
            type='number'
            value={form.thuLaoMotBuoi}
            onChange={(thuLaoMotBuoi) => setForm({ ...form, thuLaoMotBuoi })}
          />
        </FormDialog>
      ) : null}
    </>
  );
}
