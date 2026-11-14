import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Clock, Plus, School, UserCheck, Users } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router';

import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button, buttonVariants } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';

import {
  InitialsAvatar,
  LevelBadge,
} from './edu-ui-parts.js';
import { FormDialog, SelectField, TextField } from './form-parts.js';
import {
  LEVEL_KEYS,
  LEVEL_ORDER,
  post,
  text,
  useListState,
  usePagedRows,
  useRows,
  type Row,
} from './kit.js';
import { ListPage } from './list-page.js';
import { RowManage } from './sua-xoa.js';
import { ExportCsv } from './xuat-csv.js';
import { ImportCsv } from './nhap-csv.js';

const NEW_STUDENT = {
  hoTen: '',
  namSinh: '',
  coSoId: '',
  lopId: '',
  levelKey: 'tot',
};
const NEW_PARENT = { hoTen: '', soDienThoai: '', zalo: '', quanHe: 'me' };
const RELATIONS = ['bo', 'me', 'ong', 'ba', 'nguoi_giam_ho', 'khac'] as const;

export default function HocVienPage(): ReactElement {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const api = useApiClient();
  const list = useListState();
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [activeTab, setActiveTab] = useState('all');

  const { loaded, total, reload } = usePagedRows('hocVien', {
    page: list.page,
    search: list.applied,
    searchFields: ['ma', 'hoTen'],
  });
  const classes = useRows('lop').loaded;
  const branches = useRows('coSo').loaded;
  const { can: canCreate } = useCan({
    resource: { type: 'composite', id: 'edu.hocVien' },
    action: 'manage',
  });
  const { can: canImport } = useCan({
    resource: { type: 'composite', id: 'edu.hocVien' },
    action: 'import',
  });
  const { can: canExport } = useCan({
    resource: { type: 'composite', id: 'edu.hocVien' },
    action: 'export',
  });
  const { can: canLevelUp } = useCan({
    resource: { type: 'composite', id: 'edu.hocVien' },
    action: 'levelUp',
  });
  const { can: canAddParent } = useCan({
    resource: { type: 'composite', id: 'edu.phuHuynh' },
    action: 'manage',
  });

  const [student, setStudent] = useState<typeof NEW_STUDENT>();
  const [pendingParent, setPendingParent] = useState<typeof NEW_PARENT | null>(
    null,
  );
  const [levelUp, setLevelUp] = useState<{ row: Row; levelKey: string }>();
  const [parent, setParent] = useState<{ row: Row; form: typeof NEW_PARENT }>();

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      const coSoId = searchParams.get('coSoId') ?? '';
      const parentName = searchParams.get('parentName');
      const parentPhone = searchParams.get('parentPhone');
      setSearchParams({}, { replace: true });
      queueMicrotask(() => {
        setStudent({
          hoTen: '',
          namSinh: '',
          coSoId,
          lopId: '',
          levelKey: 'tot',
        });
        if (parentName || parentPhone) {
          setPendingParent({
            hoTen: parentName ?? '',
            soDienThoai: parentPhone ?? '',
            zalo: '',
            quanHe: 'me',
          });
        }
      });
    }
  }, [searchParams, setSearchParams]);

  const classRows = classes.state === 'ready' ? classes.rows : [];
  const branchRows = branches.state === 'ready' ? branches.rows : [];
  const className = (id: unknown): string =>
    id == null
      ? t('edu.hocVien.noClass')
      : text(classRows.find((row) => row.id === id)?.ten);

  const rawRows = loaded.state === 'ready' ? loaded.rows : [];
  const activeStudents = rawRows.filter((r) => r.trangThai === 'dang_hoc');
  const waitingStudents = rawRows.filter((r) => r.trangThai === 'cho_xep_lop' || r.lopId == null);
  const otherStudents = rawRows.filter((r) => r.trangThai !== 'dang_hoc' && r.trangThai !== 'cho_xep_lop');

  const filteredRows =
    loaded.state === 'ready'
      ? activeTab === 'dang_hoc'
        ? activeStudents
        : activeTab === 'cho_xep_lop'
          ? waitingStudents
          : activeTab === 'other'
            ? otherStudents
            : rawRows
      : [];

  const displayLoaded =
    loaded.state === 'ready'
      ? { ...loaded, rows: filteredRows }
      : loaded;

  return (
    <>
      <ListPage
        title={t('edu.hocVien.title')}
        description={t('edu.hocVien.description')}
        emptyTitle={t('edu.hocVien.empty')}
        emptyHint={t('edu.hocVien.emptyHint')}
        loaded={displayLoaded}
        onRetry={reload}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        metrics={[
          {
            label: 'Tổng số học viên',
            value: total,
            sub: 'Học viên trong danh mục',
            icon: Users,
            tone: 'primary',
          },
          {
            label: 'Đang theo học',
            value: activeStudents.length,
            sub: 'Đang sinh hoạt tại lớp',
            icon: UserCheck,
            tone: 'success',
          },
          {
            label: 'Chờ xếp lớp',
            value: waitingStudents.length,
            sub: 'Cần phân lớp học',
            icon: Clock,
            tone: 'warning',
          },
          {
            label: 'Lớp học hiện có',
            value: classRows.length,
            sub: 'Các lớp đang mở',
            icon: School,
            tone: 'info',
          },
        ]}
        tabs={[
          { key: 'all', label: 'Tất cả học viên', count: total },
          { key: 'dang_hoc', label: 'Đang học', count: activeStudents.length },
          { key: 'cho_xep_lop', label: 'Chờ xếp lớp', count: waitingStudents.length },
          { key: 'other', label: 'Bảo lưu / Khác', count: otherStudents.length },
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
                <div className='flex items-center gap-3'>
                  <InitialsAvatar name={text(row.hoTen)} size='md' />
                  <div className='space-y-0.5'>
                    <CardTitle className='text-base font-semibold text-foreground'>
                      <RecordLink to={`/hoc-vien/${row.id}`}>
                        {text(row.hoTen)}
                      </RecordLink>
                    </CardTitle>
                    <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                      <span className='font-mono'>{text(row.ma)}</span>
                      <span>·</span>
                      <span>{text(row.namSinh)}</span>
                    </div>
                  </div>
                </div>
                <LevelBadge levelKey={row.levelKey} size='sm' />
              </div>
            </CardHeader>

            <CardContent className='space-y-3 pt-0'>
              <div className='space-y-1.5 text-xs text-muted-foreground'>
                <div className='flex items-center justify-between'>
                  <span className='flex items-center gap-1.5'>
                    <School className='h-3.5 w-3.5' />
                    <span>{className(row.lopId)}</span>
                  </span>
                  <StatusBadge
                    size='sm'
                    tone={row.trangThai === 'dang_hoc' ? 'success' : 'neutral'}
                  >
                    {t(`edu.status.${text(row.trangThai)}`)}
                  </StatusBadge>
                </div>
              </div>

              <div className='flex items-center justify-between border-t pt-3'>
                <div className='flex items-center gap-1.5'>
                  <Link
                    to={`/hoc-vien/${row.id}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-7 text-xs' })}
                  >
                    Hồ sơ 360°
                  </Link>
                  <Link
                    to={`/hoc-phi?search=${encodeURIComponent(text(row.ma))}`}
                    className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-7 text-xs text-primary' })}
                  >
                    Thu phí
                  </Link>
                </div>
                <div className='flex items-center gap-1'>
                  {canLevelUp ? (
                    <Button
                      size='sm'
                      variant='ghost'
                      className='h-7 px-2 text-xs'
                      disabled={Number(row.levelOrder) >= 6}
                      onClick={() =>
                        setLevelUp({
                          row,
                          levelKey:
                            LEVEL_KEYS[Math.min(Number(row.levelOrder), 5)] ?? 'ma',
                        })
                      }
                    >
                      {t('edu.hocVien.levelUp')}
                    </Button>
                  ) : null}
                  <RowManage kind='hocVien' row={row} onChanged={reload} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        paging={{ page: list.page, total, onPage: list.setPage }}
        search={{
          value: list.search,
          label: t('edu.common.search'),
          onChange: list.setSearch,
        }}
        actions={
          canCreate || canImport || canExport ? (
            <div className='flex flex-wrap gap-2'>
              {canExport ? <ExportCsv /> : null}
              {canImport ? <ImportCsv onImported={reload} /> : null}
              {canCreate ? (
                <Button onClick={() => setStudent(NEW_STUDENT)} className='gap-1.5'>
                  <Plus className='h-4 w-4' />
                  <span>{t('edu.hocVien.new')}</span>
                </Button>
              ) : null}
            </div>
          ) : null
        }
        columns={[
          { key: 'ma', label: t('edu.hocVien.ma') },
          {
            key: 'hoTen',
            label: t('edu.hocVien.hoTen'),
            render: (row) => (
              <div className='flex items-center gap-2.5'>
                <InitialsAvatar name={text(row.hoTen)} size='sm' />
                <RecordLink to={`/hoc-vien/${row.id}`}>
                  {text(row.hoTen)}
                </RecordLink>
              </div>
            ),
          },
          { key: 'namSinh', label: t('edu.hocVien.namSinh') },
          {
            key: 'levelKey',
            label: t('edu.hocVien.level'),
            render: (row) => <LevelBadge levelKey={row.levelKey} size='sm' />,
          },
          {
            key: 'lopId',
            label: t('edu.hocVien.lop'),
            render: (row) =>
              row.lopId != null ? (
                <RecordLink to={`/lop/${text(row.lopId)}`}>
                  {className(row.lopId)}
                </RecordLink>
              ) : (
                className(row.lopId)
              ),
          },
          {
            key: 'trangThai',
            label: t('edu.hocVien.trangThai'),
            render: (row) => (
              <StatusBadge
                tone={row.trangThai === 'dang_hoc' ? 'success' : 'neutral'}
              >
                {t(`edu.status.${text(row.trangThai)}`)}
              </StatusBadge>
            ),
          },
        ]}
        rowActions={(row) => (
          <div className='flex flex-wrap items-center justify-end gap-1.5'>
            {canLevelUp ? (
              <Button
                size='sm'
                variant='outline'
                disabled={Number(row.levelOrder) >= 6}
                onClick={() =>
                  setLevelUp({
                    row,
                    levelKey:
                      LEVEL_KEYS[Math.min(Number(row.levelOrder), 5)] ?? 'ma',
                  })
                }
              >
                {t('edu.hocVien.levelUp')}
              </Button>
            ) : null}
            {canAddParent ? (
              <Button
                size='sm'
                variant='outline'
                onClick={() => setParent({ row, form: NEW_PARENT })}
              >
                {t('edu.hocVien.addParent')}
              </Button>
            ) : null}
            <RowManage kind='hocVien' row={row} onChanged={reload} />
          </div>
        )}
      />

      {student ? (
        <FormDialog
          open
          title={t('edu.hocVien.new')}
          onClose={() => setStudent(undefined)}
          onSubmit={async () => {
            const res = (await post(api, 'hocVien/taoMoi', {
              hoTen: student.hoTen.trim(),
              namSinh: Number(student.namSinh),
              coSoId: Number(student.coSoId),
              lopId: student.lopId ? Number(student.lopId) : null,
              levelKey: student.levelKey,
            })) as { data?: { id?: number } };
            reload();
            if (pendingParent && res?.data?.id) {
              setParent({
                row: { id: res.data.id, hoTen: student.hoTen },
                form: pendingParent,
              });
              setPendingParent(null);
            }
          }}
        >
          <TextField
            id='hv-ho-ten'
            label={t('edu.hocVien.hoTen')}
            value={student.hoTen}
            required
            onChange={(hoTen) => setStudent({ ...student, hoTen })}
          />
          <TextField
            id='hv-nam-sinh'
            label={t('edu.hocVien.namSinh')}
            type='number'
            value={student.namSinh}
            required
            onChange={(namSinh) => setStudent({ ...student, namSinh })}
          />
          <SelectField
            id='hv-co-so'
            label={t('edu.hocVien.coSo')}
            value={student.coSoId}
            required
            onChange={(coSoId) => setStudent({ ...student, coSoId, lopId: '' })}
            options={branchRows.map((row) => ({
              value: String(row.id),
              label: String(row.ten),
            }))}
          />
          <SelectField
            id='hv-lop'
            label={t('edu.hocVien.lop')}
            value={student.lopId}
            allowEmpty
            onChange={(lopId) => setStudent({ ...student, lopId })}
            options={classRows
              .filter((row) => String(row.coSoId) === student.coSoId)
              .map((row) => ({
                value: String(row.id),
                label: String(row.ten),
              }))}
          />
          <SelectField
            id='hv-level'
            label={t('edu.hocVien.level')}
            value={student.levelKey}
            onChange={(levelKey) => setStudent({ ...student, levelKey })}
            options={LEVEL_KEYS.map((key) => ({
              value: key,
              label: t(`edu.level.${key}`),
            }))}
          />
        </FormDialog>
      ) : null}

      {levelUp ? (
        <FormDialog
          open
          title={t('edu.hocVien.levelUpTitle')}
          description={t('edu.hocVien.levelUpHint')}
          onClose={() => setLevelUp(undefined)}
          onSubmit={async () => {
            await post(api, 'hocVien/lenCap', {
              hocVienId: levelUp.row.id,
              denLevelKey: levelUp.levelKey,
            });
            reload();
          }}
        >
          <SelectField
            id='hv-level-up'
            label={t('edu.hocVien.newLevel')}
            value={levelUp.levelKey}
            onChange={(levelKey) => setLevelUp({ ...levelUp, levelKey })}
            options={LEVEL_KEYS.filter(
              (key) => (LEVEL_ORDER[key] ?? 0) > Number(levelUp.row.levelOrder),
            ).map((key) => ({
              value: key,
              label: t(`edu.level.${key}`),
            }))}
          />
        </FormDialog>
      ) : null}

      {parent ? (
        <FormDialog
          open
          title={`${t('edu.hocVien.addParent')}: ${String(parent.row.hoTen)}`}
          description={t('edu.hocVien.parentHint')}
          onClose={() => setParent(undefined)}
          onSubmit={async () => {
            await post(api, 'phuHuynh/taoMoi', {
              hocVienId: parent.row.id,
              hoTen: parent.form.hoTen.trim(),
              soDienThoai: parent.form.soDienThoai.trim(),
              zalo: parent.form.zalo.trim() || null,
              quanHe: parent.form.quanHe,
            });
          }}
        >
          <TextField
            id='ph-ho-ten'
            label={t('edu.hocVien.parentName')}
            value={parent.form.hoTen}
            required
            onChange={(hoTen) =>
              setParent({ ...parent, form: { ...parent.form, hoTen } })
            }
          />
          <TextField
            id='ph-sdt'
            label={t('edu.hocVien.parentPhone')}
            type='tel'
            value={parent.form.soDienThoai}
            required
            onChange={(soDienThoai) =>
              setParent({ ...parent, form: { ...parent.form, soDienThoai } })
            }
          />
          <TextField
            id='ph-zalo'
            label={t('edu.hocVien.parentZalo')}
            value={parent.form.zalo}
            onChange={(zalo) =>
              setParent({ ...parent, form: { ...parent.form, zalo } })
            }
          />
          <SelectField
            id='ph-quan-he'
            label={t('edu.hocVien.parentRelation')}
            value={parent.form.quanHe}
            onChange={(quanHe) =>
              setParent({ ...parent, form: { ...parent.form, quanHe } })
            }
            options={RELATIONS.map((key) => ({
              value: key,
              label: t(`edu.relation.${key}`),
            }))}
          />
        </FormDialog>
      ) : null}
    </>
  );
}
