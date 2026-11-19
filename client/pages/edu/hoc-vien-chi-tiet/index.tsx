import { useApiClient, usePageBreadcrumb } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Download, Printer, Send, Wallet } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Badge } from '#components/ui/badge';
import { Button, buttonVariants } from '#components/ui/button';
import { Card, CardContent } from '#components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';

import {
  InitialsAvatar,
  LevelBadge,
  SessionBalanceBadge,
} from '../edu-ui-parts.js';
import { saveCsvStream } from '../download.js';
import { text, useErrorMessage, useRequest, type Row } from '../kit.js';
import { NoteButton, RowManage } from '../sua-xoa.js';
import { useUrlState } from '../url-state.js';
import { Sessions } from './buoi-hoc.js';
import { Tuition } from './hoc-phi.js';
import { PrintSheet } from './in-phieu.js';
import { Knowledge } from './kien-thuc.js';
import { TestResults } from './kiem-tra.js';
import { GroupHistory } from './nhom-lich-su.js';
import { Comments } from './nhan-xet.js';
import { NoticeDialog } from './phieu-bao/dialog.js';
import { currentTermNo, resolveTermNo } from './phieu-bao/model.js';
import { Parents } from './phu-huynh.js';
import { BooksAndFund } from './sach-quy.js';
import { Overview } from './tong-quan.js';
import { TABS, type Profile, type TabKey } from './types.js';

function useCanView(id: string): boolean {
  return useCan({ resource: { type: 'composite', id }, action: 'view' }).can;
}

/**
 * The file of one student ("Hồ sơ 360°"), the one page that answers "how is this student doing?". Seven tabs, the active
 * one in the address (`?tab=`): overview, sessions, tuition, books and fund, knowledge, comments, parents. The numbers
 * come from one answer of the server (`/hocVien/hoSo360`); the lists that are long (the balance history, the comments)
 * are read page by page through the record APIs. A student outside the person's scope is "not found", as in the list.
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

function StudentFile({
  student,
  onChanged,
}: {
  readonly student: Row;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  // `phieu` opens the notice of a tuition term for the parent: `hien-tai` (the term in use) or a term number.
  const url = useUrlState({
    tab: 'tong-quan',
    ky: '',
    trangThai: '',
    phieu: '',
  });
  const profileRequest = useRequest<Profile>('/hocVien/hoSo360', {
    hocVienId: student.id,
  });
  const profile =
    profileRequest.result.state === 'ready' ? profileRequest.result.data : null;
  const reloadAll = (): void => {
    profileRequest.reload();
    onChanged();
  };
  // A notice needs the terms and the sessions, so it is offered to who sees both (a coach sees no tuition).
  const canNotice = profile !== null && currentTermNo(profile) !== null;
  const noticeTermNo = profile
    ? resolveTermNo(profile, url.values.phieu)
    : null;

  // A tab is offered only to a person who may view what it lists (a coach sees no parents' phones and no tuition).
  const canSessions = useCanView('edu.diemDanh');
  const canPackages = useCanView('edu.goiHoc');
  const canLedger = useCanView('edu.soDu');
  const canBookFund = useCanView('edu.phatSach');
  const canBookLearning = useCanView('edu.sachHoc');
  const canComments = useCanView('edu.nhanXet');
  const canParents = useCanView('edu.phuHuynh');
  const canKnowledge = useCanView('edu.kienThuc');
  // The results of the tests of a level (GĐ 5) sit under the knowledge tab, for who may view them.
  const canTests = useCanView('edu.kiemTra');
  const { can: canCollect } = useCan({
    resource: { type: 'composite', id: 'edu.thanhToan' },
    action: 'manage',
  });
  const { can: canExport } = useCan({
    resource: { type: 'composite', id: 'edu.baoCao' },
    action: 'export',
  });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();

  const visible: Record<TabKey, boolean> = {
    'tong-quan': true,
    'buoi-hoc': canSessions,
    'hoc-phi': canPackages && canLedger,
    'sach-quy': canBookFund || canBookLearning,
    'kien-thuc': canKnowledge || canTests,
    'nhan-xet': canComments,
    'phu-huynh': canParents,
  };
  const requested = url.values.tab as TabKey;
  const active: TabKey =
    (TABS as readonly string[]).includes(requested) && visible[requested]
      ? requested
      : 'tong-quan';

  const exportCsv = async (): Promise<void> => {
    if (exporting) return;
    setExporting(true);
    setExportError(undefined);
    try {
      const stream = await api.stream({
        path: '/hocVien/hoSo360/xuatCsv',
        method: 'POST',
        json: { hocVienId: student.id },
      });
      await saveCsvStream(stream, `ho-so-${text(student.ma)}.csv`);
    } catch (cause) {
      setExportError(message(cause));
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-6xl space-y-6'>
      <Card className='overflow-hidden border-primary/20 shadow-xs'>
        <CardContent className='p-6'>
          <div className='flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-center gap-4'>
              <InitialsAvatar name={text(student.hoTen)} size='xl' />
              <div className='space-y-1.5'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h1 className='text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
                    {text(student.hoTen)}
                  </h1>
                  <Badge variant='outline' className='font-mono text-xs'>
                    {text(student.ma)}
                  </Badge>
                  <StatusBadge
                    tone={
                      student.trangThai === 'dang_hoc' ? 'success' : 'neutral'
                    }
                  >
                    {t(`edu.status.${text(student.trangThai)}`)}
                  </StatusBadge>
                </div>
                <div className='flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground'>
                  <LevelBadge levelKey={student.levelKey} size='sm' />
                  <span>·</span>
                  <span>
                    {student.lopId == null
                      ? t('edu.hocVien.noClass')
                      : (profile?.hocVien.lopTen ?? t('edu.lop.detail'))}
                  </span>
                  {profile?.hocVien.nhomTen ? (
                    <>
                      <span>·</span>
                      <span>{profile.hocVien.nhomTen}</span>
                    </>
                  ) : null}
                  {profile?.hocVien.coSoTen ? (
                    <>
                      <span>·</span>
                      <span>{profile.hocVien.coSoTen}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            <div className='flex flex-wrap items-center gap-3'>
              <div className='rounded-xl border bg-muted/40 px-4 py-2.5 text-right'>
                <span className='block text-xs font-medium uppercase tracking-wider text-muted-foreground'>
                  {t('edu.diemDanh.balance')}
                </span>
                <SessionBalanceBadge
                  balance={
                    student.soBuoiConLai == null
                      ? null
                      : Number(student.soBuoiConLai)
                  }
                />
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                {canCollect ? (
                  <Link
                    to={`/hoc-phi?search=${encodeURIComponent(text(student.ma))}`}
                    className={buttonVariants({
                      variant: 'default',
                      size: 'sm',
                    })}
                  >
                    <Wallet className='size-3.5' />
                    {t('edu.hoSo.collect')}
                  </Link>
                ) : null}
                {canNotice ? (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() =>
                      url.set(
                        { phieu: 'hien-tai' },
                        { keepPage: true, replace: false },
                      )
                    }
                  >
                    <Send className='size-3.5' />
                    {t('edu.phieuBao.button')}
                  </Button>
                ) : null}
                {profile?.buoiHoc ? (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => window.print()}
                  >
                    <Printer className='size-3.5' />
                    {t('edu.hoSo.print.button')}
                  </Button>
                ) : null}
                {profile?.buoiHoc && canExport ? (
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={exporting}
                    onClick={() => void exportCsv()}
                  >
                    <Download className='size-3.5' />
                    {t('edu.hoSo.exportCsv')}
                  </Button>
                ) : null}
                <NoteButton row={student} onChanged={onChanged} />
                <RowManage kind='hocVien' row={student} onChanged={onChanged} />
              </div>
            </div>
          </div>
          {exportError ? (
            <p role='alert' className='mt-3 text-sm text-destructive'>
              {exportError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Tabs
        value={active}
        onValueChange={(tab) =>
          url.set(
            { tab: String(tab), ky: '', trangThai: '' },
            { replace: false },
          )
        }
      >
        <TabsList className='flex-wrap'>
          {TABS.filter((tab) => visible[tab]).map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`edu.hoSo.tab.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value='tong-quan' className='pt-4'>
          <Section request={profileRequest} profile={profile}>
            {(loaded) => <Overview profile={loaded} />}
          </Section>
          <div className='pt-6'>
            <GroupHistory studentId={student.id} />
          </div>
        </TabsContent>
        {visible['buoi-hoc'] ? (
          <TabsContent value='buoi-hoc' className='pt-4'>
            <Section request={profileRequest} profile={profile}>
              {(loaded) =>
                loaded.buoiHoc ? (
                  <Sessions
                    sessions={loaded.buoiHoc}
                    terms={loaded.hocPhi?.cacKy ?? null}
                    onChanged={reloadAll}
                  />
                ) : null
              }
            </Section>
          </TabsContent>
        ) : null}
        {visible['hoc-phi'] ? (
          <TabsContent value='hoc-phi' className='pt-4'>
            <Section request={profileRequest} profile={profile}>
              {(loaded) =>
                loaded.hocPhi ? (
                  <Tuition
                    terms={loaded.hocPhi.cacKy}
                    payments={loaded.hocPhi.cacLanNop ?? []}
                    studentId={student.id}
                    canSeeSessions={canSessions}
                    sessionsLink={(kySo) =>
                      `/hoc-vien/${student.id}?tab=buoi-hoc&ky=${kySo}`
                    }
                  />
                ) : null
              }
            </Section>
          </TabsContent>
        ) : null}
        {visible['sach-quy'] ? (
          <TabsContent value='sach-quy' className='pt-4'>
            <Section request={profileRequest} profile={profile}>
              {(loaded) => (
                <BooksAndFund
                  sach={loaded.sach}
                  studentId={student.id}
                  canSeeLearning={canBookLearning}
                />
              )}
            </Section>
          </TabsContent>
        ) : null}
        {visible['kien-thuc'] ? (
          <TabsContent value='kien-thuc' className='pt-4'>
            <div className='flex flex-col gap-8'>
              {canKnowledge ? <Knowledge studentId={student.id} /> : null}
              {canTests ? <TestResults studentId={student.id} /> : null}
            </div>
          </TabsContent>
        ) : null}
        {visible['nhan-xet'] ? (
          <TabsContent value='nhan-xet' className='pt-4'>
            <Comments studentId={student.id} />
          </TabsContent>
        ) : null}
        {visible['phu-huynh'] ? (
          <TabsContent value='phu-huynh' className='pt-4'>
            <Parents studentId={student.id} />
          </TabsContent>
        ) : null}
      </Tabs>
      {profile ? <PrintSheet profile={profile} /> : null}
      {profile && noticeTermNo !== null ? (
        <NoticeDialog
          profile={profile}
          kySo={noticeTermNo}
          onTerm={(kySo) =>
            url.set({ phieu: String(kySo) }, { keepPage: true })
          }
          onClose={() => url.set({ phieu: '' }, { keepPage: true })}
        />
      ) : null}
    </PageContainer>
  );
}

/** The loading and error states of the answer the tabs share; `children` gets the answer once it is there. */
function Section(props: {
  readonly request: ReturnType<typeof useRequest<Profile>>;
  readonly profile: Profile | null;
  readonly children: (profile: Profile) => ReactElement | null;
}): ReactElement | null {
  const { t } = useTranslation();
  const { result, reload } = props.request;
  if (props.profile) return props.children(props.profile);
  if (result.state === 'loading')
    return (
      <p role='status' className='text-sm text-muted-foreground'>
        {t('edu.common.loading')}
      </p>
    );
  return (
    <div role='alert' className='flex flex-col items-start gap-3'>
      <p className='text-sm text-destructive'>{t('edu.common.loadError')}</p>
      <Button variant='outline' onClick={reload}>
        {t('edu.common.retry')}
      </Button>
    </div>
  );
}
