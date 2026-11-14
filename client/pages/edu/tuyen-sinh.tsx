import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';

import { FormDialog, SelectField, TextField } from './form-parts.js';
import {
  createOne,
  deleteOne,
  post,
  text,
  todayVn,
  updateOne,
  useListState,
  usePagedRows,
  useRows,
} from './kit.js';
import { ListPage } from './list-page.js';

const STATUSES = ['moi', 'dang_cham_soc', 'da_chot', 'khong_chot'] as const;

interface Form {
  id?: number;
  hoTen: string;
  soDienThoai: string;
  coSoId: string;
  kenh: string;
  trangThai: string;
  ngayNhac: string;
  ghiChu: string;
}

/**
 * Families that have not enrolled yet. Minimal data by design (parent name and phone, branch, channel, status, a
 * day to call back, a note); the server limits the rows to the branches of the caller.
 */
export default function TuyenSinhPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const list = useListState();
  const { loaded, total, reload } = usePagedRows('lienHe', {
    page: list.page,
    search: list.applied,
    searchFields: ['hoTen', 'soDienThoai'],
    descending: true,
  });
  const { can: canManage } = useCan({
    resource: { type: 'composite', id: 'edu.tuyenSinh' },
    action: 'manage',
  });
  const branches = useRows('coSo');
  const branchRows =
    branches.loaded.state === 'ready' ? branches.loaded.rows : [];
  const [form, setForm] = useState<Form>();
  const [removing, setRemoving] = useState<number>();
  const [purging, setPurging] = useState(false);
  const today = todayVn();

  const blank = (): Form => ({
    hoTen: '',
    soDienThoai: '',
    coSoId: branchRows.length === 1 ? String(branchRows[0]?.id) : '',
    kenh: '',
    trangThai: 'moi',
    ngayNhac: '',
    ghiChu: '',
  });

  return (
    <>
      <ListPage
        title={t('edu.tuyenSinh.title')}
        description={t('edu.tuyenSinh.description')}
        emptyTitle={t('edu.tuyenSinh.empty')}
        emptyHint={t('edu.tuyenSinh.emptyHint')}
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
            <span className='flex gap-2'>
              <Button variant='outline' onClick={() => setPurging(true)}>
                {t('edu.tuyenSinh.purge')}
              </Button>
              <Button onClick={() => setForm(blank())}>
                {t('edu.tuyenSinh.new')}
              </Button>
            </span>
          ) : null
        }
        rowActions={
          canManage
            ? (row) => (
                <span className='flex gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() =>
                      setForm({
                        id: row.id,
                        hoTen: text(row.hoTen),
                        soDienThoai: text(row.soDienThoai),
                        coSoId: text(row.coSoId),
                        kenh: text(row.kenh),
                        trangThai: text(row.trangThai) || 'moi',
                        ngayNhac: text(row.ngayNhac),
                        ghiChu: text(row.ghiChu),
                      })
                    }
                  >
                    {t('edu.tuyenSinh.edit')}
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setRemoving(row.id)}
                  >
                    {t('edu.tuyenSinh.delete')}
                  </Button>
                </span>
              )
            : undefined
        }
        columns={[
          { key: 'hoTen', label: t('edu.tuyenSinh.hoTen') },
          { key: 'soDienThoai', label: t('edu.tuyenSinh.soDienThoai') },
          {
            key: 'coSoId',
            label: t('edu.tuyenSinh.coSo'),
            render: (row) =>
              text(
                branchRows.find((b) => b.id === Number(row.coSoId))?.ten ?? '',
              ),
          },
          { key: 'kenh', label: t('edu.tuyenSinh.kenh') },
          {
            key: 'trangThai',
            label: t('edu.tuyenSinh.trangThai'),
            render: (row) => (
              <StatusBadge
                tone={
                  row.trangThai === 'da_chot'
                    ? 'success'
                    : row.trangThai === 'khong_chot'
                      ? 'neutral'
                      : 'warning'
                }
              >
                {t(`edu.status.${text(row.trangThai)}`)}
              </StatusBadge>
            ),
          },
          {
            key: 'ngayNhac',
            label: t('edu.tuyenSinh.ngayNhac'),
            render: (row) => {
              const day = text(row.ngayNhac);
              const open =
                row.trangThai === 'moi' || row.trangThai === 'dang_cham_soc';
              return day && open && day <= today ? (
                <StatusBadge tone='warning'>{day}</StatusBadge>
              ) : (
                day
              );
            },
          },
          { key: 'ghiChu', label: t('edu.tuyenSinh.ghiChu') },
        ]}
      />
      {form ? (
        <FormDialog
          open
          title={form.id ? t('edu.tuyenSinh.edit') : t('edu.tuyenSinh.new')}
          onClose={() => setForm(undefined)}
          onSubmit={async () => {
            const values = {
              hoTen: form.hoTen.trim(),
              soDienThoai: form.soDienThoai.trim() || null,
              coSoId: Number(form.coSoId),
              kenh: form.kenh.trim() || null,
              trangThai: form.trangThai,
              ngayNhac: form.ngayNhac || null,
              ghiChu: form.ghiChu.trim() || null,
            };
            if (form.id) await updateOne(api, 'lienHe', form.id, values);
            else await createOne(api, 'lienHe', { ...values, ngayTao: today });
            reload();
          }}
        >
          <TextField
            id='lien-he-ho-ten'
            label={t('edu.tuyenSinh.hoTen')}
            value={form.hoTen}
            required
            onChange={(hoTen) => setForm({ ...form, hoTen })}
          />
          <TextField
            id='lien-he-sdt'
            label={t('edu.tuyenSinh.soDienThoai')}
            value={form.soDienThoai}
            onChange={(soDienThoai) => setForm({ ...form, soDienThoai })}
          />
          <SelectField
            id='lien-he-co-so'
            label={t('edu.tuyenSinh.coSo')}
            value={form.coSoId}
            required
            onChange={(coSoId) => setForm({ ...form, coSoId })}
            options={branchRows.map((b) => ({
              value: String(b.id),
              label: text(b.ten),
            }))}
          />
          <TextField
            id='lien-he-kenh'
            label={t('edu.tuyenSinh.kenh')}
            value={form.kenh}
            onChange={(kenh) => setForm({ ...form, kenh })}
          />
          <SelectField
            id='lien-he-trang-thai'
            label={t('edu.tuyenSinh.trangThai')}
            value={form.trangThai}
            onChange={(trangThai) => setForm({ ...form, trangThai })}
            options={STATUSES.map((value) => ({
              value,
              label: t(`edu.status.${value}`),
            }))}
          />
          <TextField
            id='lien-he-ngay-nhac'
            label={t('edu.tuyenSinh.ngayNhac')}
            type='date'
            value={form.ngayNhac}
            onChange={(ngayNhac) => setForm({ ...form, ngayNhac })}
          />
          <TextField
            id='lien-he-ghi-chu'
            label={t('edu.tuyenSinh.ghiChu')}
            value={form.ghiChu}
            onChange={(ghiChu) => setForm({ ...form, ghiChu })}
          />
        </FormDialog>
      ) : null}
      {purging ? (
        <FormDialog
          open
          title={t('edu.tuyenSinh.purge')}
          description={t('edu.tuyenSinh.purgeHint')}
          submitLabel={t('edu.tuyenSinh.purge')}
          onClose={() => setPurging(false)}
          onSubmit={async () => {
            await post(api, '/lienHe/donQuaHan', {});
            reload();
          }}
        />
      ) : null}
      {removing !== undefined ? (
        <FormDialog
          open
          title={t('edu.tuyenSinh.delete')}
          description={t('edu.tuyenSinh.confirmDelete')}
          submitLabel={t('edu.tuyenSinh.delete')}
          onClose={() => setRemoving(undefined)}
          onSubmit={async () => {
            await deleteOne(api, 'lienHe', removing);
            reload();
          }}
        />
      ) : null}
    </>
  );
}
