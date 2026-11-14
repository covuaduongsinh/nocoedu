import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';

import { FormDialog, SelectField, TextField } from './form-parts.js';
import {
  createOne,
  text,
  updateOne,
  useListState,
  usePagedRows,
} from './kit.js';
import { ListPage } from './list-page.js';

interface Form {
  id?: number;
  kyHieu: string;
  ten: string;
  giaBia: string;
  giaBan: string;
  trangThai: string;
}

const EMPTY: Form = {
  kyHieu: '',
  ten: '',
  giaBia: '0',
  giaBan: '0',
  trangThai: 'dang_ban',
};

const money = (value: unknown): string =>
  Number(value ?? 0).toLocaleString('vi-VN');
const dong = (value: string): number => {
  const n = Number(value.replace(/\D/gu, ''));
  return Number.isFinite(n) ? n : 0;
};

/** The books the club sells. Everyone with the page sees it; only a person who may `manage` adds or edits a book. */
export default function SachPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const list = useListState();
  const { loaded, total, reload } = usePagedRows('sach', {
    page: list.page,
    search: list.applied,
    searchFields: ['kyHieu', 'ten'],
  });
  const { can: canManage } = useCan({
    resource: { type: 'composite', id: 'edu.sach' },
    action: 'manage',
  });
  const [form, setForm] = useState<Form>();

  return (
    <>
      <ListPage
        title={t('edu.sach.title')}
        description={t('edu.sach.description')}
        emptyTitle={t('edu.sach.empty')}
        emptyHint={t('edu.sach.emptyHint')}
        loaded={loaded}
        onRetry={reload}
        paging={{ page: list.page, total, onPage: list.setPage }}
        search={{
          value: list.search,
          label: t('edu.common.search'),
          onChange: list.setSearch,
        }}
        actions={
          canManage ? (
            <Button onClick={() => setForm(EMPTY)}>{t('edu.sach.new')}</Button>
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
                      kyHieu: text(row.kyHieu),
                      ten: text(row.ten),
                      giaBia: String(Number(row.giaBia ?? 0)),
                      giaBan: String(Number(row.giaBan ?? 0)),
                      trangThai: text(row.trangThai) || 'dang_ban',
                    })
                  }
                >
                  {t('edu.sach.edit')}
                </Button>
              )
            : undefined
        }
        columns={[
          { key: 'kyHieu', label: t('edu.sach.kyHieu') },
          { key: 'ten', label: t('edu.sach.ten') },
          {
            key: 'giaBia',
            label: t('edu.sach.giaBia'),
            render: (row) => money(row.giaBia),
          },
          {
            key: 'giaBan',
            label: t('edu.sach.giaBan'),
            render: (row) => money(row.giaBan),
          },
          {
            key: 'trangThai',
            label: t('edu.sach.trangThai'),
            render: (row) => (
              <StatusBadge
                tone={row.trangThai === 'dang_ban' ? 'success' : 'neutral'}
              >
                {t(`edu.status.${String(row.trangThai)}`)}
              </StatusBadge>
            ),
          },
        ]}
      />
      {form ? (
        <FormDialog
          open
          title={form.id ? t('edu.sach.edit') : t('edu.sach.new')}
          onClose={() => setForm(undefined)}
          onSubmit={async () => {
            const values = {
              kyHieu: form.kyHieu.trim(),
              ten: form.ten.trim(),
              giaBia: dong(form.giaBia),
              giaBan: dong(form.giaBan),
              trangThai: form.trangThai,
            };
            if (form.id) await updateOne(api, 'sach', form.id, values);
            else await createOne(api, 'sach', values);
            reload();
          }}
        >
          <TextField
            id='sach-ky-hieu'
            label={t('edu.sach.kyHieu')}
            value={form.kyHieu}
            required
            onChange={(kyHieu) => setForm({ ...form, kyHieu })}
          />
          <TextField
            id='sach-ten'
            label={t('edu.sach.ten')}
            value={form.ten}
            required
            onChange={(ten) => setForm({ ...form, ten })}
          />
          <TextField
            id='sach-gia-bia'
            label={t('edu.sach.giaBia')}
            type='number'
            value={form.giaBia}
            onChange={(giaBia) => setForm({ ...form, giaBia })}
          />
          <TextField
            id='sach-gia-ban'
            label={t('edu.sach.giaBan')}
            type='number'
            value={form.giaBan}
            onChange={(giaBan) => setForm({ ...form, giaBan })}
          />
          <SelectField
            id='sach-trang-thai'
            label={t('edu.sach.trangThai')}
            value={form.trangThai}
            onChange={(trangThai) => setForm({ ...form, trangThai })}
            options={[
              { value: 'dang_ban', label: t('edu.status.dang_ban') },
              { value: 'ngung', label: t('edu.status.ngung') },
            ]}
          />
        </FormDialog>
      ) : null}
    </>
  );
}
