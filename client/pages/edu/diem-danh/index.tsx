import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, Download } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';

import { FormDialog, SelectField, TextField } from '../form-parts.js';
import { GenericImportDialog } from '../generic-import-dialog.js';
import {
  downloadReport,
  post,
  text,
  todayVn,
  useErrorMessage,
  useRequest,
  useIsLowBalance,
  useRows,
  type Row,
} from '../kit.js';
import { useDayLabel } from './day-label.js';
import {
  EMPTY_CONTENT,
  sessionState,
  STATUSES,
  type Content,
  type Mark,
  type Status,
} from './model.js';
import { Register } from './register.js';
import { SessionPicker } from './session-picker.js';

interface StoredContent {
  readonly noiDung: Partial<Content>;
  readonly yThuc: readonly { hocVienId: number; diem: number }[];
}

const TONE = {
  done: 'success',
  due: 'warning',
  planned: 'info',
  cancelled: 'neutral',
} as const;

const asStatus = (value: unknown): Status =>
  (STATUSES as readonly string[]).includes(text(value))
    ? (text(value) as Status)
    : 'co_mat';

/**
 * One session: what is stored for it is read first, then the register opens on it. The register is mounted only when
 * the marks are there, keyed by the session, so its fields start from what is stored and never from a previous
 * session.
 */
function SessionWorkspace(props: {
  readonly session: Row;
  readonly className: string;
  readonly students: readonly Row[];
  readonly today: string;
  readonly canRecord: boolean;
  readonly canManage: boolean;
  readonly isLow: (student: Row) => boolean;
  readonly onBack: () => void;
  /** The register was saved: the page stays as it is. */
  readonly onSaved: () => void;
  /** The session was called off or opened again: the sessions are read again. */
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const dayLabel = useDayLabel();
  const { session } = props;
  const state = sessionState(session, props.today);
  const [toggling, setToggling] = useState(false);
  const marks = useRequest<Row[]>('diemDanh/findMany', {
    filter: { buoiHocId: session.id },
    limit: 100,
  });
  const stored = useRequest<StoredContent>('buoiHoc/noiDung/xem', {
    buoiHocId: session.id,
  });

  const initialMarks: Record<number, Mark> = {};
  if (marks.result.state === 'ready') {
    for (const row of marks.result.data) {
      initialMarks[Number(row.hocVienId)] = {
        trangThai: asStatus(row.trangThai),
        daLamBtvn: row.daLamBtvn === true,
        nhanXet: text(row.nhanXet),
      };
    }
  }
  const unmarked =
    marks.result.state === 'ready' && marks.result.data.length === 0;

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex min-w-0 items-start gap-2'>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label={t('edu.diemDanh.otherSession')}
            onClick={props.onBack}
          >
            <ArrowLeft className='size-4' />
          </Button>
          <div className='flex min-w-0 flex-col gap-1'>
            <span className='truncate text-sm font-medium'>
              <RecordLink to={`/lop/${text(session.lopId)}`}>
                {props.className}
              </RecordLink>
            </span>
            <span className='text-xs text-muted-foreground'>
              {dayLabel(session.ngay)} · {text(session.gioBatDau)}–
              {text(session.gioKetThuc)}
            </span>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <StatusBadge tone={TONE[state]} size='sm'>
            {t(`edu.diemDanh.state.${state}`)}
          </StatusBadge>
          {props.canManage && state === 'cancelled' ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setToggling(true)}
            >
              {t('edu.diemDanh.reopen')}
            </Button>
          ) : null}
          {props.canManage &&
          unmarked &&
          state !== 'cancelled' &&
          state !== 'done' ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setToggling(true)}
            >
              {t('edu.diemDanh.cancelSession')}
            </Button>
          ) : null}
        </div>
      </div>

      {state === 'cancelled' ? (
        <p className='text-sm text-muted-foreground'>
          {t('edu.diemDanh.cancelledHint')}
        </p>
      ) : marks.result.state === 'loading' ||
        stored.result.state === 'loading' ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      ) : marks.result.state === 'error' ? (
        <div role='alert' className='flex flex-col items-start gap-3'>
          <p className='text-sm text-destructive'>
            {marks.result.forbidden
              ? t('edu.errors.PERMISSION_DENIED')
              : t('edu.common.loadError')}
          </p>
          {marks.result.forbidden ? null : (
            <Button variant='outline' onClick={marks.reload}>
              {t('edu.common.retry')}
            </Button>
          )}
        </div>
      ) : (
        <Register
          key={session.id}
          session={session}
          students={props.students}
          initialMarks={initialMarks}
          initialScores={
            stored.result.state === 'ready'
              ? Object.fromEntries(
                  stored.result.data.yThuc.map((score) => [
                    score.hocVienId,
                    String(score.diem),
                  ]),
                )
              : {}
          }
          initialContent={
            stored.result.state === 'ready'
              ? { ...EMPTY_CONTENT, ...stored.result.data.noiDung }
              : EMPTY_CONTENT
          }
          contentReady={stored.result.state === 'ready'}
          canRecord={props.canRecord}
          isLow={props.isLow}
          onSaved={props.onSaved}
        />
      )}

      {toggling ? (
        <FormDialog
          open
          title={
            state === 'cancelled'
              ? t('edu.diemDanh.reopen')
              : t('edu.diemDanh.cancelSession')
          }
          description={
            state === 'cancelled'
              ? t('edu.diemDanh.reopenHint')
              : t('edu.diemDanh.cancelHint')
          }
          submitLabel={
            state === 'cancelled'
              ? t('edu.diemDanh.reopen')
              : t('edu.diemDanh.cancelSession')
          }
          onClose={() => setToggling(false)}
          onSubmit={async () => {
            await post(api, '/buoiHoc/huy', {
              buoiHocId: session.id,
              huy: state !== 'cancelled',
            });
            props.onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Attendance: pick a session (today's first), then mark it. The session being marked is in the address (`?buoi=`), so
 * the home page and a class page link straight to a register and a reload keeps it.
 */
export default function DiemDanhPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const [params, setParams] = useSearchParams();
  const sessions = useRows('buoiHoc', { newestFirst: true });
  const classes = useRows('lop').loaded;
  const students = useRows('hocVien').loaded;
  const isLow = useIsLowBalance();
  const { can: canRecord } = useCan({
    resource: { type: 'composite', id: 'edu.diemDanh' },
    action: 'record',
  });
  const { can: canExport } = useCan({
    resource: { type: 'composite', id: 'edu.baoCao' },
    action: 'export',
  });
  const { can: canManage } = useCan({
    resource: { type: 'composite', id: 'edu.buoiHoc' },
    action: 'manage',
  });
  const [error, setError] = useState<string>();
  const [generate, setGenerate] = useState<{
    lopId: string;
    tuNgay: string;
    denNgay: string;
  }>();

  const today = todayVn();
  const selectedId = Number(params.get('buoi')) || 0;
  const classRows = classes.state === 'ready' ? classes.rows : [];
  const sessionRows =
    sessions.loaded.state === 'ready' ? sessions.loaded.rows : [];
  // A register saved in this visit: its session shows as marked at once. The sessions are read again only when the
  // person goes back to the list, because reading them again here would rebuild the register they are looking at.
  const [savedIds, setSavedIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const found = sessionRows.find((row) => row.id === selectedId);
  const session =
    found && savedIds.has(found.id)
      ? { ...found, trangThai: 'da_diem_danh' }
      : found;
  const back = (): void => {
    if (savedIds.size > 0) {
      setSavedIds(new Set());
      sessions.reload();
    }
    setParams({});
  };
  const className = (id: unknown): string =>
    text(classRows.find((row) => row.id === id)?.ten);

  const exportCsv = async (): Promise<void> => {
    setError(undefined);
    try {
      await downloadReport(
        api,
        {
          loai: 'diemDanhChiTiet',
          ...(session ? { lopId: Number(session.lopId) } : {}),
        },
        `diem-danh-${today}.csv`,
      );
    } catch (cause) {
      setError(message(cause));
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('edu.diemDanh.title')}
        description={t('edu.diemDanh.description')}
        actions={
          <div className='flex flex-wrap items-center gap-2'>
            <GenericImportDialog
              entity='diemDanh'
              onSuccess={sessions.reload}
            />
            {canExport ? (
              <Button
                variant='outline'
                onClick={() => void exportCsv()}
                className='gap-1.5'
              >
                <Download className='size-4' aria-hidden='true' />
                {t('edu.baoCao.csv')}
              </Button>
            ) : null}
            {canManage ? (
              <Button
                variant='outline'
                onClick={() =>
                  setGenerate({ lopId: '', tuNgay: today, denNgay: today })
                }
              >
                {t('edu.diemDanh.generate')}
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <p role='alert' className='mb-4 text-sm text-destructive'>
          {error}
        </p>
      ) : null}

      {sessions.loaded.state === 'loading' ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      ) : sessions.loaded.state === 'error' ? (
        <div role='alert' className='flex flex-col items-start gap-3'>
          <p className='text-sm text-destructive'>
            {t('edu.common.loadError')}
          </p>
          <Button variant='outline' onClick={sessions.reload}>
            {t('edu.common.retry')}
          </Button>
        </div>
      ) : selectedId && !session ? (
        <div className='flex flex-col items-start gap-3'>
          <p className='text-sm text-muted-foreground'>
            {t('edu.diemDanh.sessionMissing')}
          </p>
          <Button variant='outline' onClick={() => setParams({})}>
            {t('edu.diemDanh.otherSession')}
          </Button>
        </div>
      ) : session ? (
        <SessionWorkspace
          key={session.id}
          session={session}
          className={className(session.lopId)}
          students={students.state === 'ready' ? students.rows : []}
          today={today}
          canRecord={canRecord}
          canManage={canManage}
          isLow={isLow}
          onBack={back}
          onSaved={() =>
            setSavedIds((current) => new Set(current).add(session.id))
          }
          onChanged={sessions.reload}
        />
      ) : (
        <SessionPicker
          sessions={sessionRows}
          classes={classRows}
          today={today}
          onPick={(id) => setParams({ buoi: String(id) })}
        />
      )}

      {generate ? (
        <FormDialog
          open
          title={t('edu.diemDanh.generate')}
          description={t('edu.diemDanh.generateHint')}
          onClose={() => setGenerate(undefined)}
          onSubmit={async () => {
            await post(api, '/buoiHoc/taoTheoLich', {
              lopId: Number(generate.lopId),
              tuNgay: generate.tuNgay,
              denNgay: generate.denNgay,
            });
            sessions.reload();
          }}
        >
          <SelectField
            id='gen-lop'
            label={t('edu.hocVien.lop')}
            value={generate.lopId}
            required
            onChange={(lopId) => setGenerate({ ...generate, lopId })}
            options={classRows
              .filter((row) => row.trangThai !== 'da_dong')
              .map((row) => ({ value: String(row.id), label: text(row.ten) }))}
          />
          <TextField
            id='gen-from'
            label={t('edu.diemDanh.from')}
            type='date'
            value={generate.tuNgay}
            required
            onChange={(tuNgay) => setGenerate({ ...generate, tuNgay })}
          />
          <TextField
            id='gen-to'
            label={t('edu.diemDanh.to')}
            type='date'
            value={generate.denNgay}
            required
            onChange={(denNgay) => setGenerate({ ...generate, denNgay })}
          />
        </FormDialog>
      ) : null}
    </PageContainer>
  );
}
