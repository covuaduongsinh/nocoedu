import { usePageBreadcrumb } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';

import { text, usePagedRows, useRequest, useRows, type Row } from './kit.js';
import { RowsTable } from './list-page.js';
import { KnowledgePanel } from './kien-thuc/panel.js';
import { GroupTab } from './lop-nhom.js';
import { useGroupNames } from './nhom.js';
import { RowManage } from './sua-xoa.js';
import { useUrlState } from './url-state.js';

function Detail(props: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col gap-1'>
      <dt className='text-xs text-muted-foreground'>{props.label}</dt>
      <dd className='text-sm'>{props.children}</dd>
    </div>
  );
}

/**
 * A class: its details, weekly timetable, the students in it and its sessions. Reads go through the record APIs, so
 * a class outside the person's scope is "not found", as it is in the list.
 */
export default function LopChiTietPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams();
  const id = Number(params.id);
  const { result, reload } = useRequest<Row | null>('lop/findOne', {
    filter: { id },
  });
  const lop = result.state === 'ready' ? result.data : null;
  usePageBreadcrumb([
    { label: t('edu.nav.lop'), to: '/lop' },
    { label: text(lop?.ten) || t('edu.lop.detail') },
  ]);
  if (result.state === 'loading')
    return (
      <PageContainer className='mx-auto max-w-6xl'>
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      </PageContainer>
    );
  if (result.state === 'error' && !result.forbidden)
    return (
      <PageContainer className='mx-auto max-w-6xl'>
        <div role='alert' className='flex flex-col items-start gap-3'>
          <p className='text-sm text-destructive'>
            {t('edu.common.loadError')}
          </p>
          <Button variant='outline' onClick={reload}>
            {t('edu.common.retry')}
          </Button>
        </div>
      </PageContainer>
    );
  if (!lop)
    return (
      <PageContainer className='mx-auto max-w-6xl'>
        <PageHeader
          title={t('edu.lop.notFound')}
          description={t('edu.lop.notFoundHint')}
        />
      </PageContainer>
    );
  return <ClassFile lop={lop} onChanged={reload} />;
}

function ClassFile({
  lop,
  onChanged,
}: {
  readonly lop: Row;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const branches = useRows('coSo').loaded;
  const branch =
    branches.state === 'ready'
      ? branches.rows.find((row) => row.id === lop.coSoId)
      : undefined;
  const students = usePagedRows('hocVien', {
    page: 1,
    where: { lopId: lop.id },
  });
  // The tab is kept in the address (`?tab=groups`); the groups tab is offered to whoever may view them.
  const { values, set } = useUrlState({ tab: 'info' });
  const { can: canGroups } = useCan({
    resource: { type: 'composite', id: 'edu.lopNhom' },
    action: 'view',
  });
  // The knowledge tab (GĐ 4) is offered to whoever may view what students have learned.
  const { can: canKnowledge } = useCan({
    resource: { type: 'composite', id: 'edu.kienThuc' },
    action: 'view',
  });
  const tab =
    (values.tab === 'groups' && !canGroups) ||
    (values.tab === 'knowledge' && !canKnowledge)
      ? 'info'
      : [
            'info',
            'schedule',
            'students',
            'groups',
            'knowledge',
            'sessions',
          ].includes(values.tab)
        ? values.tab
        : 'info';
  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={text(lop.ten)}
        description={`${text(lop.ma)} · ${t(`edu.level.${text(lop.levelKey)}`)}`}
        actions={<RowManage kind='lop' row={lop} onChanged={onChanged} />}
      />
      <Tabs value={tab} onValueChange={(value) => set({ tab: String(value) })}>
        <TabsList>
          <TabsTrigger value='info'>{t('edu.lop.tab.info')}</TabsTrigger>
          <TabsTrigger value='schedule'>
            {t('edu.lop.tab.schedule')}
          </TabsTrigger>
          <TabsTrigger value='students'>
            {t('edu.lop.tab.students')}
          </TabsTrigger>
          {canGroups ? (
            <TabsTrigger value='groups'>{t('edu.lop.tab.groups')}</TabsTrigger>
          ) : null}
          {canKnowledge ? (
            <TabsTrigger value='knowledge'>
              {t('edu.lop.tab.knowledge')}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value='sessions'>
            {t('edu.lop.tab.sessions')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='info' className='pt-4'>
          <dl className='grid grid-cols-2 gap-4 md:grid-cols-4'>
            <Detail label={t('edu.lop.ma')}>{text(lop.ma)}</Detail>
            <Detail label={t('edu.lop.coSo')}>{text(branch?.ten)}</Detail>
            <Detail label={t('edu.lop.level')}>
              {t(`edu.level.${text(lop.levelKey)}`)}
            </Detail>
            <Detail label={t('edu.baoCao.col.soHocVien')}>
              {students.total}
            </Detail>
            <Detail label={t('edu.lop.trangThai')}>
              <StatusBadge
                tone={lop.trangThai === 'dang_mo' ? 'success' : 'neutral'}
              >
                {t(`edu.status.${text(lop.trangThai)}`)}
              </StatusBadge>
            </Detail>
          </dl>
        </TabsContent>
        <TabsContent value='schedule' className='pt-4'>
          <Schedule classId={lop.id} />
        </TabsContent>
        <TabsContent value='students' className='pt-4'>
          <Students classId={lop.id} />
        </TabsContent>
        {canGroups ? (
          <TabsContent value='groups' className='pt-4'>
            <GroupTab lop={lop} />
          </TabsContent>
        ) : null}
        {canKnowledge ? (
          <TabsContent value='knowledge' className='pt-4'>
            <KnowledgePanel lopId={lop.id} />
          </TabsContent>
        ) : null}
        <TabsContent value='sessions' className='pt-4'>
          <Sessions classId={lop.id} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

/** `thu` is 2 = Monday … 7 = Saturday, 8 = Sunday. */
function weekdayLabel(t: (key: string) => string, thu: unknown): string {
  const n = Number(thu);
  return n === 8 ? t('edu.lop.sunday') : `${t('edu.lop.weekday')} ${n}`;
}

function Schedule({ classId }: { readonly classId: number }): ReactElement {
  const { t } = useTranslation();
  const slots = usePagedRows('lopLich', {
    page: 1,
    where: { lopId: classId },
  });
  return (
    <RowsTable
      loaded={slots.loaded}
      onRetry={slots.reload}
      emptyTitle={t('edu.lop.noSchedule')}
      emptyHint={t('edu.lop.noScheduleHint')}
      columns={[
        {
          key: 'thu',
          label: t('edu.lop.thu'),
          render: (row) => weekdayLabel(t, row.thu),
        },
        {
          key: 'gio',
          label: t('edu.lop.gio'),
          render: (row) => `${text(row.gioBatDau)} – ${text(row.gioKetThuc)}`,
        },
      ]}
    />
  );
}

function Students({ classId }: { readonly classId: number }): ReactElement {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const students = usePagedRows('hocVien', {
    page,
    where: { lopId: classId },
  });
  const groupName = useGroupNames(
    students.loaded.state === 'ready'
      ? students.loaded.rows.map((row) => row.nhomId)
      : [],
  );
  return (
    <RowsTable
      loaded={students.loaded}
      onRetry={students.reload}
      emptyTitle={t('edu.lop.noStudents')}
      emptyHint={t('edu.lop.noStudentsHint')}
      paging={{ page, total: students.total, onPage: setPage }}
      columns={[
        { key: 'ma', label: t('edu.hocVien.ma') },
        {
          key: 'hoTen',
          label: t('edu.hocVien.hoTen'),
          render: (row) => (
            <RecordLink to={`/hoc-vien/${row.id}`}>
              {text(row.hoTen)}
            </RecordLink>
          ),
        },
        {
          key: 'nhom',
          label: t('edu.nhom.label'),
          render: (row) =>
            groupName(row.nhomId) || (
              <span className='text-muted-foreground'>
                {t('edu.nhom.none')}
              </span>
            ),
        },
        {
          key: 'trangThai',
          label: t('edu.hocVien.trangThai'),
          render: (row) => t(`edu.status.${text(row.trangThai)}`),
        },
        {
          key: 'soBuoiConLai',
          label: t('edu.diemDanh.balance'),
          render: (row) => text(row.soBuoiConLai),
        },
      ]}
    />
  );
}

function Sessions({ classId }: { readonly classId: number }): ReactElement {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const sessions = usePagedRows('buoiHoc', {
    page,
    where: { lopId: classId },
    descending: true,
  });
  return (
    <RowsTable
      loaded={sessions.loaded}
      onRetry={sessions.reload}
      emptyTitle={t('edu.lop.noSessions')}
      emptyHint={t('edu.lop.noSessionsHint')}
      paging={{ page, total: sessions.total, onPage: setPage }}
      columns={[
        {
          key: 'ngay',
          label: t('edu.hocVien.ngay'),
          render: (row) => (
            <RecordLink to={`/diem-danh?buoi=${row.id}`}>
              {text(row.ngay)}
            </RecordLink>
          ),
        },
        {
          key: 'gio',
          label: t('edu.lop.gio'),
          render: (row) => `${text(row.gioBatDau)} – ${text(row.gioKetThuc)}`,
        },
        {
          key: 'trangThai',
          label: t('edu.hocVien.trangThai'),
          render: (row) =>
            row.trangThai === 'da_diem_danh'
              ? t('edu.diemDanh.done')
              : t('edu.lop.notMarked'),
        },
      ]}
    />
  );
}
