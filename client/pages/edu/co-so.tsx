import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { StatusBadge } from '#components/status-badge';

import { FormDialog, TextField } from './form-parts.js';
import { createOne, useRows } from './kit.js';
import { ListPage } from './list-page.js';

const EMPTY = { ma: '', ten: '', diaChi: '', truBuoiVangCoPhep: false };

export default function CoSoPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { loaded, reload } = useRows('coSo');
  const { can: canManage } = useCan({
    resource: { type: 'composite', id: 'edu.coSo' },
    action: 'manage',
  });
  const [form, setForm] = useState<typeof EMPTY>();

  return (
    <>
      <ListPage
        title={t('edu.coSo.title')}
        description={t('edu.coSo.description')}
        emptyTitle={t('edu.coSo.empty')}
        emptyHint={t('edu.coSo.emptyHint')}
        loaded={loaded}
        onRetry={reload}
        actions={
          canManage ? (
            <Button onClick={() => setForm(EMPTY)}>{t('edu.coSo.new')}</Button>
          ) : null
        }
        columns={[
          { key: 'ma', label: t('edu.coSo.ma') },
          { key: 'ten', label: t('edu.coSo.ten') },
          { key: 'diaChi', label: t('edu.coSo.diaChi') },
          {
            key: 'truBuoiVangCoPhep',
            label: t('edu.coSo.truBuoi'),
            render: (row) =>
              row.truBuoiVangCoPhep === true
                ? t('edu.common.yes')
                : t('edu.common.no'),
          },
          {
            key: 'trangThai',
            label: t('edu.coSo.trangThai'),
            render: (row) => (
              <StatusBadge
                tone={row.trangThai === 'hoat_dong' ? 'success' : 'neutral'}
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
          title={t('edu.coSo.new')}
          onClose={() => setForm(undefined)}
          onSubmit={async () => {
            await createOne(api, 'coSo', {
              ma: form.ma.trim(),
              ten: form.ten.trim(),
              diaChi: form.diaChi.trim() || null,
              truBuoiVangCoPhep: form.truBuoiVangCoPhep,
            });
            reload();
          }}
        >
          <TextField
            id='co-so-ma'
            label={t('edu.coSo.ma')}
            value={form.ma}
            required
            onChange={(ma) => setForm({ ...form, ma })}
          />
          <TextField
            id='co-so-ten'
            label={t('edu.coSo.ten')}
            value={form.ten}
            required
            onChange={(ten) => setForm({ ...form, ten })}
          />
          <TextField
            id='co-so-dia-chi'
            label={t('edu.coSo.diaChi')}
            value={form.diaChi}
            onChange={(diaChi) => setForm({ ...form, diaChi })}
          />
          <label className='flex items-center gap-2 text-sm'>
            <Checkbox
              checked={form.truBuoiVangCoPhep}
              onCheckedChange={(checked) =>
                setForm({ ...form, truBuoiVangCoPhep: checked === true })
              }
            />
            {t('edu.coSo.truBuoi')}
          </label>
        </FormDialog>
      ) : null}
    </>
  );
}
