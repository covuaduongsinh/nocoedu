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

interface CoachSession {
  readonly id: number;
  readonly lopId: number;
  readonly lopTen: string;
  readonly ngay: string;
  readonly gioBatDau: string;
  readonly gioKetThuc: string;
  readonly trangThai: string;
}

function CoachSessionsDialog(props: {
  readonly thang: string;
  readonly userId: string;
  readonly coachName: string;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { result } = useRequest<{ rows: CoachSession[] }>(
    '/hoSoGv/chiTietBuoiDay',
    { thang: props.thang, userId: props.userId },
  );

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {`${props.coachName} · ${t('edu.hoSoGv.chiTietTitle')} (${props.thang})`}
          </DialogTitle>
          <DialogDescription>
            {t('edu.hoSoGv.chiTietHint')}
          </DialogDescription>
        </DialogHeader>
        {result.state === 'loading' ? (
          <p role='status' className='text-sm text-muted-foreground'>
            {t('edu.common.loading')}
          </p>
        ) : result.state === 'error' ? (
          <p role='alert' className='text-sm text-destructive'>
            {t('edu.common.loadError')}
          </p>
        ) : result.data.rows.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('edu.hoSoGv.noSessions')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('edu.hoSoGv.ngay')}</TableHead>
                <TableHead>{t('edu.hoSoGv.gio')}</TableHead>
                <TableHead>{t('edu.hoSoGv.lop')}</TableHead>
                <TableHead>{t('edu.diemDanh.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <RecordLink to={`/diem-danh?buoi=${row.id}`}>
                      {row.ngay}
                    </RecordLink>
                  </TableCell>
                  <TableCell>{`${row.gioBatDau} – ${row.gioKetThuc}`}</TableCell>
                  <TableCell>
                    <RecordLink to={`/lop/${row.lopId}`}>
                      {row.lopTen || t('edu.lop.detail')}
                    </RecordLink>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone='success'>
                      {t('edu.diemDanh.done')}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Pay(): ReactElement {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => todayVn().slice(0, 7));
  const [inspecting, setInspecting] = useState<{
    userId: string;
    coachName: string;
  } | null>(null);
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
              <TableHead>{t('edu.common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.rows.map((row) => (
              <TableRow key={row.userId}>
                <TableCell>{row.ten}</TableCell>
                <TableCell>{row.soBuoi}</TableCell>
                <TableCell>{money(row.thuLaoMotBuoi)}</TableCell>
                <TableCell>{money(row.tong)}</TableCell>
                <TableCell>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() =>
                      setInspecting({ userId: row.userId, coachName: row.ten })
                    }
                  >
                    {t('edu.hoSoGv.viewSessions')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={3}>{t('edu.hoSoGv.tongCong')}</TableCell>
              <TableCell colSpan={2}>{money(result.data.tong)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      ) : null}
      {inspecting ? (
        <CoachSessionsDialog
          thang={month}
          userId={inspecting.userId}
          coachName={inspecting.coachName}
          onClose={() => setInspecting(null)}
        />
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
