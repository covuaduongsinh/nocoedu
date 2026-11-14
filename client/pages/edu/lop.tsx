import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { CheckCircle2, Plus, School, Users } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Badge } from '#components/ui/badge';
import { Button, buttonVariants } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';

import {
  InitialsAvatar,
  LevelBadge,
} from './edu-ui-parts.js';
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
  type Row,
} from './kit.js';
import { ListPage } from './list-page.js';
import { RowManage } from './sua-xoa.js';

const EMPTY = { ma: '', ten: '', coSoId: '', hlvId: '', levelKey: 'tot' };

export default function LopPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const list = useListState();
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('grid');
  const [activeTab, setActiveTab] = useState('all');

  const { loaded, total, reload } = usePagedRows('lop', {
    page: list.page,
    search: list.applied,
    searchFields: ['ma', 'ten'],
  });
  const branches = useRows('coSo').loaded;
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
  const coachName = (id: unknown): string => {
    if (!id) return t('edu.common.none');
    return coachRows.find((c) => c.id === id)?.name ?? text(id);
  };

  const rows = loaded.state === 'ready' ? loaded.rows : [];
  const activeCount = rows.filter((r) => r.trangThai === 'dang_mo').length;
  const closedCount = rows.filter((r) => r.trangThai !== 'dang_mo').length;

  const filteredRows =
    loaded.state === 'ready'
      ? activeTab === 'active'
        ? rows.filter((r) => r.trangThai === 'dang_mo')
        : activeTab === 'closed'
          ? rows.filter((r) => r.trangThai !== 'dang_mo')
          : rows
      : [];

  const displayLoaded =
    loaded.state === 'ready'
      ? { ...loaded, rows: filteredRows }
      : loaded;

  return (
    <>
      <ListPage
        title={t('edu.lop.title')}
        description={t('edu.lop.description')}
        emptyTitle={t('edu.lop.empty')}
        emptyHint={t('edu.lop.emptyHint')}
        loaded={displayLoaded}
        onRetry={reload}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        metrics={[
          {
            label: 'Tổng số lớp',
            value: total,
            sub: 'Lớp học trong danh mục',
            icon: School,
            tone: 'primary',
          },
          {
            label: 'Đang hoạt động',
            value: activeCount,
            sub: 'Lớp mở tuyển & đang dạy',
            icon: CheckCircle2,
            tone: 'success',
          },
          {
            label: 'Cơ sở đào tạo',
            value: branchRows.length,
            sub: 'Phân bố phòng & kỳ đài',
            icon: Users,
            tone: 'info',
          },
        ]}
        tabs={[
          { key: 'all', label: 'Tất cả lớp', count: total },
          { key: 'active', label: 'Đang mở', count: activeCount },
          { key: 'closed', label: 'Đã đóng / Kết thúc', count: closedCount },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        renderGridItem={(row: Row) => (
          <Card
            key={row.id}
            className='group relative flex flex-col justify-between overflow-hidden transition-all duration-200 hover:border-primary/40 hover:shadow-sm'
          >
            <CardHeader className='pb-3'>
              <div className='flex items-start justify-between gap-2'>
                <div className='space-y-1'>
                  <div className='flex items-center gap-2'>
                    <Badge variant='outline' className='font-mono text-xs'>
                      {text(row.ma)}
                    </Badge>
                    <StatusBadge
                      size='sm'
                      tone={row.trangThai === 'dang_mo' ? 'success' : 'neutral'}
                    >
                      {t(`edu.status.${text(row.trangThai)}`)}
                    </StatusBadge>
                  </div>
                  <CardTitle className='text-base font-semibold leading-tight text-foreground'>
                    <RecordLink to={`/lop/${row.id}`}>
                      {text(row.ten)}
                    </RecordLink>
                  </CardTitle>
                </div>
                <LevelBadge levelKey={row.levelKey} size='sm' />
              </div>
            </CardHeader>

            <CardContent className='space-y-3 pt-0'>
              <div className='space-y-1.5 text-xs text-muted-foreground'>
                <div className='flex items-center gap-2'>
                  <School className='h-3.5 w-3.5 shrink-0' />
                  <span>{branchName(row.coSoId) || t('edu.common.none')}</span>
                </div>
                <div className='flex items-center gap-2'>
                  <InitialsAvatar name={coachName(row.hlvId)} size='sm' />
                  <span className='font-medium text-foreground'>
                    {coachName(row.hlvId)}
                  </span>
                </div>
              </div>

              <div className='flex items-center justify-between border-t pt-3'>
                <div className='flex items-center gap-2'>
                  <Link
                    to={`/lop/${row.id}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-7 text-xs' })}
                  >
                    Chi tiết lớp
                  </Link>
                  <Link
                    to={`/diem-danh?lopId=${row.id}`}
                    className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-7 text-xs text-primary' })}
                  >
                    Điểm danh
                  </Link>
                </div>
                <RowManage kind='lop' row={row} onChanged={reload} />
              </div>
            </CardContent>
          </Card>
        )}
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
            <Button onClick={() => setForm(EMPTY)} className='gap-1.5'>
              <Plus className='h-4 w-4' />
              <span>{t('edu.lop.new')}</span>
            </Button>
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
            render: (row) => <LevelBadge levelKey={row.levelKey} size='sm' />,
          },
          {
            key: 'hlvId',
            label: t('edu.lop.hlv'),
            render: (row) => coachName(row.hlvId),
          },
          {
            key: 'trangThai',
            label: t('edu.lop.trangThai'),
            render: (row) => (
              <StatusBadge
                tone={row.trangThai === 'dang_mo' ? 'success' : 'neutral'}
              >
                {t(`edu.status.${text(row.trangThai)}`)}
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
