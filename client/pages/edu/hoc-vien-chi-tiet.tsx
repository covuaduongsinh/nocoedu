import { useApiClient, usePageBreadcrumb } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { useParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';

import {
  post,
  text,
  usePagedRows,
  useRequest,
  useRows,
  useRowsByIds,
  type Row,
} from './kit.js';
import { RowsTable } from './list-page.js';
import { NoteButton, RowManage, UnlinkButton } from './sua-xoa.js';

const fmt = (value: unknown): string => Number(value).toLocaleString('vi-VN');

/** A signed change of balance: `+5`, `-1`. */
const signed = (value: unknown): string =>
  Number(value) > 0 ? `+${Number(value)}` : String(Number(value));

/** `2026-11-09T03:00:00.000Z` or a date as the day alone. */
const day = (value: unknown): string => text(value).slice(0, 10);

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
 * A student's file: who they are, their parents, every session with its comment, their packages and the balance
 * history. Everything is read through the same record APIs, so the policy of each collection decides what a person
 * sees; a student outside the person's scope is "not found" here, as it is in the list.
 */
export default function HocVienChiTietPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams();
  const id = Number(params.id);
  const { result, reload } = useRequest<Row | null>('hocVien/findOne', {
    filter: { id },
  });
  const student = result.state === 'ready' ? result.data : null;
  usePageBreadcrumb([
    { label: t('edu.nav.hocVien'), to: '/hoc-vien' },
    { label: text(student?.hoTen) || t('edu.hocVien.detail') },
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
  if (!student)
    return (
      <PageContainer className='mx-auto max-w-6xl'>
        <PageHeader
          title={t('edu.hocVien.notFound')}
          description={t('edu.hocVien.notFoundHint')}
        />
      </PageContainer>
    );
  return <StudentFile student={student} onChanged={reload} />;
}

function useCanView(id: string): boolean {
  return useCan({ resource: { type: 'composite', id }, action: 'view' }).can;
}

function StudentFile({
  student,
  onChanged,
}: {
  readonly student: Row;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  // A tab is offered only to a person who may view what it lists (a coach sees no parents' phones and no tuition).
  const canParents = useCanView('edu.phuHuynh');
  const canSessions = useCanView('edu.diemDanh');
  const canPackages = useCanView('edu.goiHoc');
  const canLedger = useCanView('edu.soDu');
  const canBooks = useCanView('edu.sachHoc');
  const classes = useRows('lop').loaded;
  const branches = useRows('coSo').loaded;
  const classRow =
    classes.state === 'ready'
      ? classes.rows.find((row) => row.id === student.lopId)
      : undefined;
  const branchRow =
    branches.state === 'ready'
      ? branches.rows.find((row) => row.id === student.coSoId)
      : undefined;
  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={text(student.hoTen)}
        description={`${text(student.ma)} · ${t(`edu.level.${text(student.levelKey)}`)}`}
        actions={
          <div className='flex flex-wrap gap-2'>
            <NoteButton row={student} onChanged={onChanged} />
            <RowManage kind='hocVien' row={student} onChanged={onChanged} />
          </div>
        }
      />
      <Tabs defaultValue='info'>
        <TabsList>
          <TabsTrigger value='info'>{t('edu.hocVien.tab.info')}</TabsTrigger>
          {canParents ? (
            <TabsTrigger value='parents'>
              {t('edu.hocVien.tab.parents')}
            </TabsTrigger>
          ) : null}
          {canSessions ? (
            <TabsTrigger value='sessions'>
              {t('edu.hocVien.tab.sessions')}
            </TabsTrigger>
          ) : null}
          {canPackages ? (
            <TabsTrigger value='packages'>
              {t('edu.hocVien.tab.packages')}
            </TabsTrigger>
          ) : null}
          {canBooks ? (
            <TabsTrigger value='books'>
              {t('edu.hocVien.tab.books')}
            </TabsTrigger>
          ) : null}
          {canLedger ? (
            <TabsTrigger value='ledger'>
              {t('edu.hocVien.tab.ledger')}
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value='info' className='pt-4'>
          <dl className='grid grid-cols-2 gap-4 md:grid-cols-3'>
            <Detail label={t('edu.hocVien.ma')}>{text(student.ma)}</Detail>
            <Detail label={t('edu.hocVien.namSinh')}>
              {text(student.namSinh)}
            </Detail>
            <Detail label={t('edu.hocVien.level')}>
              {t(`edu.level.${text(student.levelKey)}`)}
            </Detail>
            <Detail label={t('edu.hocVien.lop')}>
              {student.lopId == null ? (
                t('edu.hocVien.noClass')
              ) : (
                <RecordLink to={`/lop/${text(student.lopId)}`}>
                  {text(classRow?.ten) || t('edu.lop.detail')}
                </RecordLink>
              )}
            </Detail>
            <Detail label={t('edu.lop.coSo')}>{text(branchRow?.ten)}</Detail>
            <Detail label={t('edu.hocVien.trangThai')}>
              <StatusBadge
                tone={student.trangThai === 'dang_hoc' ? 'success' : 'neutral'}
              >
                {t(`edu.status.${text(student.trangThai)}`)}
              </StatusBadge>
            </Detail>
            <Detail label={t('edu.diemDanh.balance')}>
              {text(student.soBuoiConLai)}
            </Detail>
            {student.ghiChuHlv ? (
              <Detail label={t('edu.hocVien.ghiChu')}>
                <span className='whitespace-pre-wrap'>
                  {text(student.ghiChuHlv)}
                </span>
              </Detail>
            ) : null}
          </dl>
        </TabsContent>
        {canParents ? (
          <TabsContent value='parents' className='pt-4'>
            <Parents studentId={student.id} />
          </TabsContent>
        ) : null}
        {canSessions ? (
          <TabsContent value='sessions' className='pt-4'>
            <Sessions studentId={student.id} />
          </TabsContent>
        ) : null}
        {canPackages ? (
          <TabsContent value='packages' className='pt-4'>
            <Packages studentId={student.id} />
          </TabsContent>
        ) : null}
        {canBooks ? (
          <TabsContent value='books' className='pt-4'>
            <Books studentId={student.id} />
          </TabsContent>
        ) : null}
        {canLedger ? (
          <TabsContent value='ledger' className='pt-4'>
            <Ledger studentId={student.id} />
          </TabsContent>
        ) : null}
      </Tabs>
    </PageContainer>
  );
}

/** The books the student is learning or has finished, imported from the Lark Base. */
function Books({ studentId }: { readonly studentId: number }): ReactElement {
  const { t } = useTranslation();
  const links = usePagedRows('sachHoc', {
    page: 1,
    where: { hocVienId: studentId },
  });
  const linkRows = links.loaded.state === 'ready' ? links.loaded.rows : [];
  const books = useRowsByIds(
    'sach',
    linkRows.map((row) => Number(row.sachId)),
  );
  return (
    <RowsTable
      loaded={links.loaded}
      onRetry={links.reload}
      emptyTitle={t('edu.hocVien.noBooks')}
      emptyHint={t('edu.hocVien.noBooksHint')}
      columns={[
        {
          key: 'kyHieu',
          label: t('edu.sach.kyHieu'),
          render: (row) => text(books.get(Number(row.sachId))?.kyHieu),
        },
        {
          key: 'ten',
          label: t('edu.sach.ten'),
          render: (row) => text(books.get(Number(row.sachId))?.ten),
        },
        {
          key: 'trangThai',
          label: t('edu.hocVien.bookState'),
          render: (row) => (
            <StatusBadge tone={row.trangThai === 'da_hoc' ? 'success' : 'info'}>
              {t(`edu.status.${text(row.trangThai)}`)}
            </StatusBadge>
          ),
        },
      ]}
    />
  );
}

function Parents({ studentId }: { readonly studentId: number }): ReactElement {
  const { t } = useTranslation();
  const links = usePagedRows('lienKet', {
    page: 1,
    where: { hocVienId: studentId },
  });
  const linkRows = links.loaded.state === 'ready' ? links.loaded.rows : [];
  const parents = useRowsByIds(
    'phuHuynh',
    linkRows.map((row) => Number(row.phuHuynhId)),
  );
  return (
    <RowsTable
      loaded={links.loaded}
      onRetry={links.reload}
      emptyTitle={t('edu.hocVien.noParents')}
      emptyHint={t('edu.hocVien.noParentsHint')}
      columns={[
        {
          key: 'hoTen',
          label: t('edu.phuHuynh.hoTen'),
          render: (row) => text(parents.get(Number(row.phuHuynhId))?.hoTen),
        },
        {
          key: 'quanHe',
          label: t('edu.hocVien.quanHe'),
          render: (row) => t(`edu.relation.${text(row.quanHe)}`),
        },
        {
          key: 'soDienThoai',
          label: t('edu.phuHuynh.soDienThoai'),
          render: (row) =>
            text(parents.get(Number(row.phuHuynhId))?.soDienThoai),
        },
        {
          key: 'zalo',
          label: t('edu.phuHuynh.zalo'),
          render: (row) => text(parents.get(Number(row.phuHuynhId))?.zalo),
        },
        {
          key: 'lienHeChinh',
          label: t('edu.hocVien.lienHeChinh'),
          render: (row) =>
            row.lienHeChinh === true ? t('edu.common.yes') : '',
        },
      ]}
      rowActions={(row) => (
        <UnlinkButton linkId={row.id} onChanged={links.reload} />
      )}
    />
  );
}

function Sessions({ studentId }: { readonly studentId: number }): ReactElement {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const marks = usePagedRows('diemDanh', {
    page,
    where: { hocVienId: studentId },
    descending: true,
  });
  const markRows = marks.loaded.state === 'ready' ? marks.loaded.rows : [];
  const sessions = useRowsByIds(
    'buoiHoc',
    markRows.map((row) => Number(row.buoiHocId)),
  );
  return (
    <RowsTable
      loaded={marks.loaded}
      onRetry={marks.reload}
      emptyTitle={t('edu.hocVien.noSessions')}
      emptyHint={t('edu.hocVien.noSessionsHint')}
      paging={{ page, total: marks.total, onPage: setPage }}
      columns={[
        {
          key: 'ngay',
          label: t('edu.hocVien.ngay'),
          render: (row) => day(sessions.get(Number(row.buoiHocId))?.ngay),
        },
        {
          key: 'trangThai',
          label: t('edu.diemDanh.status'),
          render: (row) => t(`edu.diemDanh.s.${text(row.trangThai)}`),
        },
        {
          key: 'daLamBtvn',
          label: t('edu.diemDanh.homework'),
          render: (row) =>
            row.daLamBtvn === true ? t('edu.common.yes') : t('edu.common.no'),
        },
        {
          key: 'soBuoiDaTru',
          label: t('edu.hocVien.soBuoiDaTru'),
          render: (row) => text(row.soBuoiDaTru),
        },
        {
          key: 'nhanXet',
          label: t('edu.hocVien.nhanXet'),
          render: (row) => (
            <span className='whitespace-pre-wrap'>{text(row.nhanXet)}</span>
          ),
        },
      ]}
    />
  );
}

interface PackageDetail {
  readonly daDung: number;
  readonly conLai: number;
  readonly vuotSoDu: number;
  readonly cacBuoi: readonly {
    readonly stt: number;
    readonly diemDanhId: number | null;
    readonly ngay: string | null;
    readonly lopId: number | null;
    readonly trangThai: string | null;
    readonly soBuoi: number;
  }[];
}

/** The sessions the server deducted from one package, first in first out; nothing is computed here. */
function PackageSessions(props: {
  readonly goiHocId: number;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [state, setState] = useState<
    | { readonly s: 'loading' }
    | { readonly s: 'error' }
    | { readonly s: 'ready'; readonly detail: PackageDetail }
  >({ s: 'loading' });
  useEffect(() => {
    let live = true;
    post(api, '/goiHoc/chiTiet', { goiHocId: props.goiHocId })
      .then((response) => {
        if (live)
          setState({
            s: 'ready',
            detail: (response as { data: PackageDetail }).data,
          });
      })
      .catch(() => {
        if (live) setState({ s: 'error' });
      });
    return () => {
      live = false;
    };
  }, [api, props.goiHocId]);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('edu.goiHoc.sessionsTitle')}</DialogTitle>
          <DialogDescription>{t('edu.goiHoc.sessionsHint')}</DialogDescription>
        </DialogHeader>
        {state.s === 'loading' ? (
          <p role='status' className='text-sm text-muted-foreground'>
            {t('edu.common.loading')}
          </p>
        ) : state.s === 'error' ? (
          <p role='alert' className='text-sm text-destructive'>
            {t('edu.common.loadError')}
          </p>
        ) : (
          <div className='flex flex-col gap-3'>
            <p className='text-sm'>
              {t('edu.goiHoc.usage', {
                used: state.detail.daDung,
                left: state.detail.conLai,
              })}
            </p>
            {state.detail.cacBuoi.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('edu.goiHoc.noSessions')}
              </p>
            ) : (
              <ul className='flex flex-col gap-1 text-sm'>
                {state.detail.cacBuoi.map((entry) => (
                  <li key={entry.stt}>
                    {entry.ngay
                      ? `${entry.ngay} · ${t(`edu.diemDanh.s.${text(entry.trangThai)}`)}`
                      : t('edu.goiHoc.adjustment')}
                    {entry.soBuoi > 1 ? ` · ${entry.soBuoi}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {state.detail.vuotSoDu > 0 ? (
              <p className='text-sm text-destructive'>
                {t('edu.goiHoc.over', { count: state.detail.vuotSoDu })}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Packages({ studentId }: { readonly studentId: number }): ReactElement {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<number>();
  const packs = usePagedRows('goiHoc', {
    page,
    where: { hocVienId: studentId },
    descending: true,
  });
  return (
    <>
      <RowsTable
        loaded={packs.loaded}
        onRetry={packs.reload}
        emptyTitle={t('edu.hocVien.noPackages')}
        emptyHint={t('edu.hocVien.noPackagesHint')}
        paging={{ page, total: packs.total, onPage: setPage }}
        rowActions={(row) => (
          <Button size='sm' variant='outline' onClick={() => setOpened(row.id)}>
            {t('edu.goiHoc.viewSessions')}
          </Button>
        )}
        columns={[
          {
            key: 'ngayMua',
            label: t('edu.hocVien.ngayMua'),
            render: (row) => day(row.ngayMua),
          },
          {
            key: 'soBuoi',
            label: t('edu.hocPhi.sessions'),
            render: (row) => text(row.soBuoi),
          },
          {
            key: 'donGia',
            label: t('edu.hocVien.donGia'),
            render: (row) => fmt(row.donGia),
          },
          {
            key: 'thanhTien',
            label: t('edu.hocVien.thanhTien'),
            render: (row) => fmt(row.thanhTien),
          },
          {
            key: 'trangThai',
            label: t('edu.hocVien.trangThai'),
            render: (row) =>
              t(`edu.hocVien.goiStatus.${text(row.trangThai)}`, {
                defaultValue: text(row.trangThai),
              }),
          },
        ]}
      />
      {opened === undefined ? null : (
        <PackageSessions
          goiHocId={opened}
          onClose={() => setOpened(undefined)}
        />
      )}
    </>
  );
}

function Ledger({ studentId }: { readonly studentId: number }): ReactElement {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const ledger = usePagedRows('soDuNhatKy', {
    page,
    where: { hocVienId: studentId },
    descending: true,
  });
  return (
    <RowsTable
      loaded={ledger.loaded}
      onRetry={ledger.reload}
      emptyTitle={t('edu.hocPhi.ledgerEmpty')}
      emptyHint={t('edu.hocVien.noLedgerHint')}
      paging={{ page, total: ledger.total, onPage: setPage }}
      columns={[
        {
          key: 'createdAt',
          label: t('edu.hocVien.ngay'),
          render: (row) => day(row.createdAt),
        },
        {
          key: 'thayDoi',
          label: t('edu.hocVien.thayDoi'),
          render: (row) => signed(row.thayDoi),
        },
        {
          key: 'soDuSau',
          label: t('edu.hocVien.soDuSau'),
          render: (row) => text(row.soDuSau),
        },
        {
          key: 'lyDo',
          label: t('edu.hocVien.lyDo'),
          render: (row) =>
            t(`edu.hocPhi.reason.${text(row.lyDo)}`, {
              defaultValue: text(row.lyDo),
            }),
        },
        {
          key: 'ghiChu',
          label: t('edu.hocVien.ghiChuSo'),
          render: (row) => text(row.ghiChu),
        },
      ]}
    />
  );
}
