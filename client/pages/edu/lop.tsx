import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';

import { FormDialog, SelectField, TextField } from './form-parts.js';
import {
  createOne,
  LEVEL_KEYS,
  LEVEL_ORDER,
  text,
  useListState,
  usePagedRows,
  useRequest,
  useRows,
} from './kit.js';
import { ListPage } from './list-page.js';
import { RowManage } from './sua-xoa.js';

const EMPTY = { ma: '', ten: '', coSoId: '', hlvId: '', levelKey: 'tot' };

export default function LopPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const list = useListState();
  const { loaded, total, reload } = usePagedRows('lop', {
    page: list.page,
    search: list.applied,
    searchFields: ['ma', 'ten'],
  });
  const branches = useRows('coSo').loaded;
  // The coaches to choose from; a person who may not manage classes gets no list, and cannot open the form anyway.
  const coaches = useRequest<{ id: string; name: string }[]>(
    '/hlv/danhSach',
    {},
  ).result;
  const coachRows = coaches.state === 'ready' ? coaches.data : [];
  const { can: canManage } = useCan({
    resource: { type: 'composite', id: 'edu.lop' },
    action: 'manage',
  });
  const [form, setForm] = useState<typeof EMPTY>();
  const branchRows = branches.state === 'ready' ? branches.rows : [];
  const branchName = (id: unknown): string =>
    text(branchRows.find((row) => row.id === id)?.ten);

  return (
    <>
      <ListPage
        title={t('edu.lop.title')}
        description={t('edu.lop.description')}
        emptyTitle={t('edu.lop.empty')}
        emptyHint={t('edu.lop.emptyHint')}
        loaded={loaded}
        onRetry={reload}
        rowActions={(row) => (
          <RowManage kind='lop' row={row} onChanged={reload} />
        )}
        paging={{ page: list.page, total, onPage: list.setPage }}
        search={{
          value: list.search,
          label: t('edu.common.search'),
          onChange: list.setSearch,
        }}
        actions={
          canManage ? (
            <Button onClick={() => setForm(EMPTY)}>{t('edu.lop.new')}</Button>
          ) : null
        }
        columns={[
          { key: 'ma', label: t('edu.lop.ma') },
          {
            key: 'ten',
            label: t('edu.lop.ten'),
            render: (row) => (
              <RecordLink to={`/lop/${row.id}`}>{text(row.ten)}</RecordLink>
            ),
          },
          {
            key: 'coSoId',
            label: t('edu.lop.coSo'),
            render: (row) => branchName(row.coSoId),
          },
          {
            key: 'levelKey',
            label: t('edu.lop.level'),
            render: (row) => t(`edu.level.${String(row.levelKey)}`),
          },
          {
            key: 'trangThai',
            label: t('edu.lop.trangThai'),
            render: (row) => (
              <StatusBadge
                tone={row.trangThai === 'dang_mo' ? 'success' : 'neutral'}
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
          title={t('edu.lop.new')}
          onClose={() => setForm(undefined)}
          onSubmit={async () => {
            await createOne(api, 'lop', {
              ma: form.ma.trim(),
              ten: form.ten.trim(),
              coSoId: Number(form.coSoId),
              hlvId: form.hlvId.trim() || null,
              levelKey: form.levelKey,
              levelOrder: LEVEL_ORDER[form.levelKey] ?? 1,
            });
            reload();
          }}
        >
          <TextField
            id='lop-ma'
            label={t('edu.lop.ma')}
            value={form.ma}
            required
            onChange={(ma) => setForm({ ...form, ma })}
          />
          <TextField
            id='lop-ten'
            label={t('edu.lop.ten')}
            value={form.ten}
            required
            onChange={(ten) => setForm({ ...form, ten })}
          />
          <SelectField
            id='lop-co-so'
            label={t('edu.lop.coSo')}
            value={form.coSoId}
            required
            onChange={(coSoId) => setForm({ ...form, coSoId })}
            options={branchRows.map((row) => ({
              value: String(row.id),
              label: String(row.ten),
            }))}
          />
          <SelectField
            id='lop-level'
            label={t('edu.lop.level')}
            value={form.levelKey}
            onChange={(levelKey) => setForm({ ...form, levelKey })}
            options={LEVEL_KEYS.map((key) => ({
              value: key,
              label: t(`edu.level.${key}`),
            }))}
          />
          <SelectField
            id='lop-hlv'
            label={t('edu.lop.hlv')}
            value={form.hlvId}
            allowEmpty
            onChange={(hlvId) => setForm({ ...form, hlvId })}
            options={coachRows.map((coach) => ({
              value: coach.id,
              label: coach.name,
            }))}
          />
        </FormDialog>
      ) : null}
    </>
  );
}
