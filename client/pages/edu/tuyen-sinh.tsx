import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CheckCircle2,
  Clock,
  Kanban,
  LayoutList,
  MessageCircle,
  Phone,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { StatusBadge } from '#components/status-badge';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Card, CardContent } from '#components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';

import { InitialsAvatar } from './edu-ui-parts.js';
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

const CHANNEL_COLORS: Record<string, string> = {
  facebook: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  fb: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  zalo: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  gioi_thieu: 'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  vang_lai: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  website: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

function channelBadge(channel: string): ReactElement {
  const normalized = channel.toLowerCase().trim();
  const style = CHANNEL_COLORS[normalized] ?? 'border-border bg-muted text-muted-foreground';
  return (
    <Badge variant='outline' className={style}>
      {channel}
    </Badge>
  );
}

/**
 * Modern CRM Admissions & Leads Pipeline with Kanban board and Table views.
 */
export default function TuyenSinhPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const api = useApiClient();
  const list = useListState();
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

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
  const [crmOpen, setCrmOpen] = useState(false);
  const [crmTesting, setCrmTesting] = useState(false);
  const [crmResult, setCrmResult] = useState<string>();
  const today = todayVn();

  const testCrmSync = async (): Promise<void> => {
    setCrmTesting(true);
    setCrmResult(undefined);
    try {
      const res = await post(api, '/edu/crm/lead-sync', {
        hoTen: 'Phụ huynh Test NocoCRM',
        soDienThoai: '0988776655',
        coSoId: branchRows[0]?.id ? Number(branchRows[0].id) : 1,
        kenhTiepNhan: 'nococrm',
        ghiChu: 'Khách hàng quan tâm khóa học cờ vua tiểu học (Test sync)',
      }) as { data: { thongBao: string } };
      setCrmResult(`✅ ${res.data.thongBao}`);
      reload();
    } catch (err) {
      setCrmResult(`❌ Lỗi đồng bộ: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCrmTesting(false);
    }
  };

  const blank = (): Form => ({
    hoTen: '',
    soDienThoai: '',
    coSoId: branchRows.length === 1 ? String(branchRows[0]?.id) : '',
    kenh: '',
    trangThai: 'moi',
    ngayNhac: '',
    ghiChu: '',
  });

  const branchName = (id: unknown): string =>
    text(branchRows.find((b) => b.id === Number(id))?.ten ?? '');

  const rows = loaded.state === 'ready' ? loaded.rows : [];
  const moiRows = rows.filter((r) => r.trangThai === 'moi' || !r.trangThai);
  const dangChamSocRows = rows.filter((r) => r.trangThai === 'dang_cham_soc');
  const daChotRows = rows.filter((r) => r.trangThai === 'da_chot');
  const khongChotRows = rows.filter((r) => r.trangThai === 'khong_chot');

  const updateLeadStatus = async (id: number, newStatus: string): Promise<void> => {
    try {
      await updateOne(api, 'lienHe', id, { trangThai: newStatus });
      reload();
    } catch {
      // ignore
    }
  };

  const kanbanColumns = [
    {
      id: 'moi',
      title: '1. Mới tiếp nhận',
      count: moiRows.length,
      rows: moiRows,
      tone: 'border-blue-500/30 bg-blue-500/5',
      badgeTone: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    },
    {
      id: 'dang_cham_soc',
      title: '2. Đang tư vấn / Test',
      count: dangChamSocRows.length,
      rows: dangChamSocRows,
      tone: 'border-amber-500/30 bg-amber-500/5',
      badgeTone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    },
    {
      id: 'da_chot',
      title: '3. Đã chốt nhập học',
      count: daChotRows.length,
      rows: daChotRows,
      tone: 'border-emerald-500/30 bg-emerald-500/5',
      badgeTone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    },
    {
      id: 'khong_chot',
      title: '4. Tạm ngưng / Hẹn sau',
      count: khongChotRows.length,
      rows: khongChotRows,
      tone: 'border-muted bg-muted/20',
      badgeTone: 'bg-muted text-muted-foreground',
    },
  ];

  return (
    <>
      <ListPage
        title={t('edu.tuyenSinh.title')}
        description={t('edu.tuyenSinh.description')}
        emptyTitle={t('edu.tuyenSinh.empty')}
        emptyHint={t('edu.tuyenSinh.emptyHint')}
        loaded={loaded}
        onRetry={reload}
        metrics={[
          {
            label: 'Tổng Leads tiếp nhận',
            value: total,
            sub: 'Khách hàng tiềm năng',
            icon: Users,
            tone: 'primary',
          },
          {
            label: 'Chờ liên hệ',
            value: moiRows.length,
            sub: 'Chưa bắt đầu tư vấn',
            icon: Clock,
            tone: 'info',
          },
          {
            label: 'Đang theo sát',
            value: dangChamSocRows.length,
            sub: 'Hẹn test & cân nhắc',
            icon: MessageCircle,
            tone: 'warning',
          },
          {
            label: 'Đã nhập học',
            value: daChotRows.length,
            sub: 'Ghi danh thành công',
            icon: CheckCircle2,
            tone: 'success',
          },
        ]}
        filterControls={
          <div className='flex items-center gap-1 rounded-lg border p-1'>
            <Button
              size='sm'
              variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
              className='h-7 gap-1.5 px-2.5 text-xs'
              onClick={() => setViewMode('kanban')}
            >
              <Kanban className='h-3.5 w-3.5' />
              <span>Bảng Kanban</span>
            </Button>
            <Button
              size='sm'
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              className='h-7 gap-1.5 px-2.5 text-xs'
              onClick={() => setViewMode('table')}
            >
              <LayoutList className='h-3.5 w-3.5' />
              <span>Dạng bảng</span>
            </Button>
          </div>
        }
        actions={
          canManage ? (
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setCrmOpen(true)}
                className='gap-1.5 border-violet-500/30 text-violet-700 hover:bg-violet-50 dark:text-violet-300'
              >
                🔗 Kết nối NocoCRM
              </Button>
              <Button variant='outline' size='sm' onClick={() => setPurging(true)}>
                {t('edu.tuyenSinh.purge')}
              </Button>
              <Button size='sm' onClick={() => setForm(blank())} className='gap-1.5'>
                <Plus className='h-4 w-4' />
                <span>{t('edu.tuyenSinh.new')}</span>
              </Button>
            </div>
          ) : null
        }
        paging={{ page: list.page, total, onPage: list.setPage }}
        search={{
          value: list.search,
          label: t('edu.common.search'),
          onChange: list.setSearch,
        }}
        columns={[
          { key: 'hoTen', label: t('edu.tuyenSinh.hoTen') },
          { key: 'soDienThoai', label: t('edu.tuyenSinh.soDienThoai') },
          {
            key: 'coSoId',
            label: t('edu.tuyenSinh.coSo'),
            render: (row) => branchName(row.coSoId),
          },
          {
            key: 'kenh',
            label: t('edu.tuyenSinh.kenh'),
            render: (row) => (row.kenh ? channelBadge(text(row.kenh)) : '–'),
          },
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
        rowActions={
          canManage
            ? (row) => (
                <div className='flex items-center justify-end gap-1.5'>
                  <Button
                    size='sm'
                    variant='outline'
                    className='h-7 text-xs text-primary'
                    onClick={() => {
                      const params = new URLSearchParams({
                        action: 'create',
                        coSoId: text(row.coSoId),
                        parentName: text(row.hoTen),
                        parentPhone: text(row.soDienThoai),
                      });
                      void navigate(`/hoc-vien?${params.toString()}`);
                    }}
                  >
                    {t('edu.tuyenSinh.ghiDanh')}
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    className='h-7 text-xs'
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
                    variant='ghost'
                    className='h-7 px-2 text-xs text-destructive hover:text-destructive'
                    onClick={() => setRemoving(row.id)}
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                  </Button>
                </div>
              )
            : undefined
        }
      />

      {/* Kanban Board View Rendered When viewMode === 'kanban' */}
      {viewMode === 'kanban' && loaded.state === 'ready' && (
        <div className='mt-6 overflow-x-auto pb-4'>
          <div className='grid min-w-[900px] grid-cols-4 gap-4'>
            {kanbanColumns.map((col) => (
              <div
                key={col.id}
                className={`flex flex-col rounded-xl border p-3.5 ${col.tone}`}
              >
                <div className='mb-3 flex items-center justify-between'>
                  <span className='text-xs font-semibold uppercase tracking-wider text-foreground'>
                    {col.title}
                  </span>
                  <Badge variant='outline' className={`px-2 py-0 text-xs font-bold ${col.badgeTone}`}>
                    {col.count}
                  </Badge>
                </div>

                <div className='flex flex-1 flex-col gap-3'>
                  {col.rows.length === 0 ? (
                    <div className='flex flex-1 items-center justify-center rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground'>
                      Chưa có liên hệ nào
                    </div>
                  ) : (
                    col.rows.map((row) => {
                      const phone = text(row.soDienThoai);
                      const cleanPhone = phone.replace(/\D/g, '');
                      const isReminderDue =
                        text(row.ngayNhac) &&
                        (row.trangThai === 'moi' || row.trangThai === 'dang_cham_soc') &&
                        text(row.ngayNhac) <= today;

                      return (
                        <Card
                          key={row.id}
                          className='group relative bg-card shadow-2xs transition-all hover:border-primary/50 hover:shadow-xs'
                        >
                          <CardContent className='space-y-2.5 p-3.5'>
                            <div className='flex items-start justify-between gap-2'>
                              <div className='flex items-center gap-2'>
                                <InitialsAvatar name={text(row.hoTen)} size='sm' />
                                <span className='font-semibold text-foreground'>
                                  {text(row.hoTen)}
                                </span>
                              </div>
                              {row.kenh ? channelBadge(text(row.kenh)) : null}
                            </div>

                            {/* Phone & Instant Contact Buttons */}
                            <div className='flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs'>
                              <span className='font-mono text-muted-foreground'>
                                {phone}
                              </span>
                              <div className='flex items-center gap-1'>
                                {phone ? (
                                  <>
                                    <a
                                      href={`tel:${phone}`}
                                      className='rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-primary'
                                      title='Gọi điện thoại'
                                    >
                                      <Phone className='h-3.5 w-3.5' />
                                    </a>
                                    <a
                                      href={`https://zalo.me/${cleanPhone}`}
                                      target='_blank'
                                      rel='noopener noreferrer'
                                      className='rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-cyan-600'
                                      title='Nhắn tin Zalo'
                                    >
                                      <MessageCircle className='h-3.5 w-3.5' />
                                    </a>
                                  </>
                                ) : null}
                              </div>
                            </div>

                            {/* Campus and Reminder Date */}
                            <div className='flex items-center justify-between text-xs text-muted-foreground'>
                              <span>{branchName(row.coSoId) || 'Cơ sở'}</span>
                              {text(row.ngayNhac) ? (
                                <span
                                  className={
                                    isReminderDue
                                      ? 'font-medium text-amber-600 dark:text-amber-400'
                                      : ''
                                  }
                                >
                                  📅 {text(row.ngayNhac)}
                                </span>
                              ) : null}
                            </div>

                            {/* Note preview if any */}
                            {row.ghiChu ? (
                              <p className='line-clamp-2 text-xs text-muted-foreground'>
                                {text(row.ghiChu)}
                              </p>
                            ) : null}

                            {/* Quick pipeline move & action buttons */}
                            {canManage ? (
                              <div className='flex items-center justify-between border-t pt-2.5'>
                                <Button
                                  size='sm'
                                  variant='ghost'
                                  className='h-6 px-1.5 text-[11px] text-primary'
                                  onClick={() => {
                                    const params = new URLSearchParams({
                                      action: 'create',
                                      coSoId: text(row.coSoId),
                                      parentName: text(row.hoTen),
                                      parentPhone: text(row.soDienThoai),
                                    });
                                    void navigate(`/hoc-vien?${params.toString()}`);
                                  }}
                                >
                                  + Ghi danh
                                </Button>

                                <div className='flex items-center gap-1'>
                                  {col.id === 'moi' ? (
                                    <Button
                                      size='sm'
                                      variant='outline'
                                      className='h-6 px-2 text-[11px]'
                                      onClick={() => void updateLeadStatus(row.id, 'dang_cham_soc')}
                                    >
                                      Tư vấn →
                                    </Button>
                                  ) : col.id === 'dang_cham_soc' ? (
                                    <>
                                      <Button
                                        size='sm'
                                        variant='outline'
                                        className='h-6 px-2 text-[11px] text-emerald-600'
                                        onClick={() => void updateLeadStatus(row.id, 'da_chot')}
                                      >
                                        Chốt ✓
                                      </Button>
                                      <Button
                                        size='sm'
                                        variant='ghost'
                                        className='h-6 px-1.5 text-[11px] text-muted-foreground'
                                        onClick={() => void updateLeadStatus(row.id, 'khong_chot')}
                                      >
                                        Hẹn sau
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      size='sm'
                                      variant='ghost'
                                      className='h-6 px-1.5 text-[11px]'
                                      onClick={() => void updateLeadStatus(row.id, 'dang_cham_soc')}
                                    >
                                      Mở lại
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {form ? (
        <FormDialog
          open
          title={form.id ? t('edu.tuyenSinh.edit') : t('edu.tuyenSinh.new')}
          onClose={() => setForm(undefined)}
          onSubmit={async () => {
            const payload = {
              hoTen: form.hoTen.trim(),
              soDienThoai: form.soDienThoai.trim(),
              coSoId: form.coSoId ? Number(form.coSoId) : null,
              kenh: form.kenh.trim() || null,
              trangThai: form.trangThai,
              ngayNhac: form.ngayNhac.trim() || null,
              ghiChu: form.ghiChu.trim() || null,
            };
            if (form.id) {
              await updateOne(api, 'lienHe', form.id, payload);
            } else {
              await createOne(api, 'lienHe', payload);
            }
            reload();
          }}
        >
          <TextField
            id='ts-ho-ten'
            label={t('edu.tuyenSinh.hoTen')}
            value={form.hoTen}
            required
            onChange={(hoTen) => setForm({ ...form, hoTen })}
          />
          <TextField
            id='ts-sdt'
            label={t('edu.tuyenSinh.soDienThoai')}
            type='tel'
            value={form.soDienThoai}
            required
            onChange={(soDienThoai) => setForm({ ...form, soDienThoai })}
          />
          <SelectField
            id='ts-co-so'
            label={t('edu.tuyenSinh.coSo')}
            value={form.coSoId}
            allowEmpty
            onChange={(coSoId) => setForm({ ...form, coSoId })}
            options={branchRows.map((b) => ({
              value: String(b.id),
              label: String(b.ten),
            }))}
          />
          <TextField
            id='ts-kenh'
            label={t('edu.tuyenSinh.kenh')}
            value={form.kenh}
            onChange={(kenh) => setForm({ ...form, kenh })}
          />
          <SelectField
            id='ts-trang-thai'
            label={t('edu.tuyenSinh.trangThai')}
            value={form.trangThai}
            onChange={(trangThai) => setForm({ ...form, trangThai })}
            options={STATUSES.map((status) => ({
              value: status,
              label: t(`edu.status.${status}`),
            }))}
          />
          <TextField
            id='ts-ngay-nhac'
            label={t('edu.tuyenSinh.ngayNhac')}
            type='date'
            value={form.ngayNhac}
            onChange={(ngayNhac) => setForm({ ...form, ngayNhac })}
          />
          <TextField
            id='ts-ghi-chu'
            label={t('edu.tuyenSinh.ghiChu')}
            value={form.ghiChu}
            onChange={(ghiChu) => setForm({ ...form, ghiChu })}
          />
        </FormDialog>
      ) : null}

      {removing ? (
        <FormDialog
          open
          title={t('edu.tuyenSinh.delete')}
          description={t('edu.tuyenSinh.confirmDelete')}
          onClose={() => setRemoving(undefined)}
          onSubmit={async () => {
            await deleteOne(api, 'lienHe', removing);
            reload();
          }}
        >
          <p className='text-sm text-destructive'>
            {t('edu.tuyenSinh.confirmDelete')}
          </p>
        </FormDialog>
      ) : null}

      {purging ? (
        <FormDialog
          open
          title={t('edu.tuyenSinh.purge')}
          description={t('edu.tuyenSinh.purgeHint')}
          onClose={() => setPurging(false)}
          onSubmit={async () => {
            await post(api, '/lienHe/donDep', {});
            reload();
          }}
        >
          <p className='text-sm text-muted-foreground'>
            {t('edu.tuyenSinh.purgeHint')}
          </p>
        </FormDialog>
      ) : null}

      <Dialog open={crmOpen} onOpenChange={setCrmOpen}>
        <DialogContent className='max-w-lg'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-lg font-bold'>
              🔗 Tích Hợp Đồng Bộ Lead NocoCRM
            </DialogTitle>
            <DialogDescription>
              Khi có khách hàng tiềm năng mới trên NocoCRM, webhook tự động đẩy hồ sơ về phễu tuyển sinh NocoEdu.
            </DialogDescription>
          </DialogHeader>

          <div className='flex flex-col gap-4 py-3 text-sm'>
            <div className='rounded-lg border bg-muted/30 p-3 flex flex-col gap-1.5'>
              <span className='text-xs font-semibold uppercase text-muted-foreground'>Webhook Endpoint</span>
              <code className='rounded bg-muted px-2 py-1 font-mono text-xs text-primary select-all break-all'>
                https://nocoedu.dsc.edu.vn/api/edu/crm/lead-sync
              </code>
            </div>

            <div className='rounded-lg border bg-muted/30 p-3 flex flex-col gap-1.5'>
              <span className='text-xs font-semibold uppercase text-muted-foreground'>X-CRM-Token (Header)</span>
              <code className='rounded bg-muted px-2 py-1 font-mono text-xs text-foreground select-all'>
                nocoedu-crm-secret
              </code>
            </div>

            <div className='rounded-lg border p-3 text-xs text-muted-foreground space-y-1.5'>
              <p className='font-semibold text-foreground'>📋 Các trường dữ liệu nhận từ CRM:</p>
              <ul className='list-disc pl-4 space-y-0.5'>
                <li><code>hoTen</code>: Tên phụ huynh hoặc học viên (bắt buộc)</li>
                <li><code>soDienThoai</code>: Số điện thoại liên hệ (bắt buộc)</li>
                <li><code>coSoId</code>: ID cơ sở muốn đăng ký (tùy chọn)</li>
                <li><code>ghiChu</code>: Ghi chú nhu cầu từ CRM</li>
                <li><code>ngayHenHocThu</code>: Ngày hẹn học thử (YYYY-MM-DD)</li>
              </ul>
            </div>

            {crmResult ? (
              <div className='rounded-md border p-2.5 text-xs font-medium bg-muted/50'>
                {crmResult}
              </div>
            ) : null}

            <div className='flex items-center justify-between pt-2 border-t'>
              <Button
                variant='outline'
                size='sm'
                disabled={crmTesting}
                onClick={() => void testCrmSync()}
                className='text-xs font-medium'
              >
                {crmTesting ? 'Đang gửi...' : '🚀 Bắn thử 1 Lead mẫu từ CRM'}
              </Button>
              <Button size='sm' onClick={() => setCrmOpen(false)}>
                Đóng
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
