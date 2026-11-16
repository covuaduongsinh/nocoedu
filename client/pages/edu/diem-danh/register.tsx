import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { cn } from 'cn';
import { Check } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PendingButton } from '#components/pending-button';
import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { Textarea } from '#components/ui/textarea';
import { useIsMobile } from '#hooks/use-mobile';

import { usePageLeave } from '../../../routing/route-leave-boundary.js';
import { post, text, useErrorMessage, type Row } from '../kit.js';
import {
  CONTENT_FIELDS,
  countByStatus,
  MAX_COMMENT,
  NEW_MARK,
  parseScore,
  QUICK_TAGS,
  rosterOf,
  STATUSES,
  withTag,
  type Content,
  type Mark,
  type Status,
} from './model.js';

interface Saved {
  readonly hocVienId: number;
  readonly soBuoiConLai: number;
  readonly canhBao: boolean;
}

/** The chosen status is told by its wording and a tick, and coloured by what it means. */
const CHOSEN: Record<Status, string> = {
  co_mat:
    'border-(--status-success)/40 bg-(--status-success-background) text-(--status-success)',
  hoc_bu: 'border-primary/30 bg-primary/8 text-primary',
  vang_co_phep:
    'border-(--status-warning)/40 bg-(--status-warning-background) text-(--status-warning)',
  vang_khong_phep: 'border-destructive/40 bg-destructive/10 text-destructive',
};

function StatusPicker(props: {
  readonly name: string;
  readonly value: Status;
  readonly disabled: boolean;
  readonly onChange: (status: Status) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      role='radiogroup'
      aria-label={`${t('edu.diemDanh.status')}: ${props.name}`}
      className='grid grid-cols-2 gap-1.5'
    >
      {STATUSES.map((status) => {
        const chosen = props.value === status;
        return (
          <button
            key={status}
            type='button'
            role='radio'
            aria-checked={chosen}
            disabled={props.disabled}
            onClick={() => props.onChange(status)}
            className={cn(
              // 44px tall on a phone: a thumb hits it without looking.
              'inline-flex min-h-11 items-center justify-center gap-1 rounded-md border px-2 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 md:min-h-8',
              chosen
                ? cn(CHOSEN[status], 'font-medium')
                : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {chosen ? <Check className='size-3.5' aria-hidden='true' /> : null}
            {t(`edu.diemDanh.s.${status}`)}
          </button>
        );
      })}
    </div>
  );
}

/** Sessions left: a plain number while there are plenty, a warning when few are left or the student owes some. */
function Balance(props: {
  readonly left: number | undefined;
  readonly warn: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  if (props.left === undefined) return null;
  if (props.left < 0) {
    return (
      <StatusBadge tone='warning' size='sm'>
        {t('edu.diemDanh.owed', { count: -props.left })}
      </StatusBadge>
    );
  }
  if (props.warn) {
    return (
      <StatusBadge tone='warning' size='sm'>
        {t('edu.diemDanh.low', { count: props.left })}
      </StatusBadge>
    );
  }
  return (
    <StatusBadge tone='neutral' size='sm'>
      {t('edu.diemDanh.left', { count: props.left })}
    </StatusBadge>
  );
}

/**
 * The register of one session: who came, homework, an awareness score and a short comment for every student, and
 * what was taught. On a phone each student is a card with large buttons; on a wider screen the same fields are a table.
 *
 * One Save writes the attendance first (`/diemDanh/luu`, which moves the balances through the ledger) and then the
 * session content and the scores (`/buoiHoc/noiDung/luu`, which needs the attendance rows to exist). Both can be
 * repeated: saving an unchanged register changes nothing.
 */
export function Register(props: {
  readonly session: Row;
  readonly students: readonly Row[];
  readonly initialMarks: Readonly<Record<number, Mark>>;
  readonly initialScores: Readonly<Record<number, string>>;
  readonly initialContent: Content;
  /**
   * `false` when the content and the scores could not be read: they are then shown locked and never written, because
   * saving the empty fields of a failed read would wipe what is stored.
   */
  readonly contentReady: boolean;
  readonly canRecord: boolean;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const message = useErrorMessage();
  const isMobile = useIsMobile();
  const [marks, setMarks] = useState<Record<number, Mark>>(props.initialMarks);
  const [scores, setScores] = useState<Record<number, string>>(
    props.initialScores,
  );
  const [content, setContent] = useState<Content>(props.initialContent);
  const [saved, setSaved] = useState<Record<number, Saved>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const [marked] = useState(
    () => new Set(Object.keys(props.initialMarks).map(Number)),
  );
  const roster = rosterOf(props.session, props.students, marked);
  const markOf = (id: number): Mark => marks[id] ?? NEW_MARK;
  const change = (id: number, patch: Partial<Mark>): void =>
    setMarks((current) => ({
      ...current,
      [id]: { ...(current[id] ?? NEW_MARK), ...patch },
    }));

  // What was typed, compared with what is stored: leaving the page with a difference asks first, and the session
  // content is written only when it or a score changed.
  const marksNow = JSON.stringify(marks);
  const extraNow = JSON.stringify([scores, content]);
  const [storedMarks, setStoredMarks] = useState(marksNow);
  const [storedExtra, setStoredExtra] = useState(extraNow);
  const extraChanged = props.contentReady && extraNow !== storedExtra;
  const dirty = props.canRecord && (marksNow !== storedMarks || extraChanged);
  const leave = usePageLeave(dirty, busy);
  const canEditExtra = props.canRecord && props.contentReady;

  const badScore = roster.find(
    (student) => parseScore(scores[student.id] ?? '') === undefined,
  );
  const { present, away } = countByStatus(roster, markOf);

  const save = async (): Promise<void> => {
    if (busy || roster.length === 0) return;
    if (badScore) {
      setError(t('edu.diemDanh.badScore', { name: text(badScore.hoTen) }));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = (await post(api, '/diemDanh/luu', {
        buoiHocId: props.session.id,
        danhSach: roster.map((student) => {
          const mark = markOf(student.id);
          return {
            hocVienId: student.id,
            trangThai: mark.trangThai,
            daLamBtvn: mark.daLamBtvn,
            nhanXet: mark.nhanXet.trim() || null,
          };
        }),
      })) as { data: { danhSach: Saved[] } };
      setSaved(
        Object.fromEntries(response.data.danhSach.map((s) => [s.hocVienId, s])),
      );
      setStoredMarks(marksNow);
      if (extraChanged) {
        await post(api, '/buoiHoc/noiDung/luu', {
          buoiHocId: props.session.id,
          noiDung: content,
          yThuc: roster.map((student) => ({
            hocVienId: student.id,
            diem: parseScore(scores[student.id] ?? '') ?? null,
          })),
        });
        setStoredExtra(extraNow);
      }
      toaster.show({ type: 'success', title: t('edu.diemDanh.saved') });
      props.onSaved();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  const setAll = (patch: Partial<Mark>): void =>
    setMarks((current) => ({
      ...current,
      ...Object.fromEntries(
        roster.map((student) => [
          student.id,
          { ...(current[student.id] ?? NEW_MARK), ...patch },
        ]),
      ),
    }));

  const balanceOf = (student: Row): ReactElement | null => {
    const after = saved[student.id];
    const left = after
      ? after.soBuoiConLai
      : typeof student.soBuoiConLai === 'number'
        ? student.soBuoiConLai
        : undefined;
    return (
      <Balance
        left={left}
        warn={after ? after.canhBao : left !== undefined && left <= 2}
      />
    );
  };

  const homework = (student: Row): ReactElement => (
    <Checkbox
      id={`dd-btvn-${student.id}`}
      aria-label={`${t('edu.diemDanh.homework')}: ${text(student.hoTen)}`}
      checked={markOf(student.id).daLamBtvn}
      disabled={!props.canRecord}
      onCheckedChange={(checked) =>
        change(student.id, { daLamBtvn: checked === true })
      }
    />
  );

  const score = (student: Row): ReactElement => (
    <Input
      id={`dd-yt-${student.id}`}
      aria-label={`${t('edu.diemDanh.awareness')}: ${text(student.hoTen)}`}
      inputMode='numeric'
      maxLength={2}
      placeholder='–'
      value={scores[student.id] ?? ''}
      disabled={!canEditExtra}
      aria-invalid={parseScore(scores[student.id] ?? '') === undefined}
      onChange={(event) =>
        setScores((current) => ({
          ...current,
          [student.id]: event.target.value,
        }))
      }
      className='h-11 w-16 text-center md:h-8'
    />
  );

  const comment = (student: Row): ReactElement => (
    <div className='flex flex-col gap-1.5'>
      <Textarea
        id={`dd-nx-${student.id}`}
        aria-label={`${t('edu.diemDanh.comment')}: ${text(student.hoTen)}`}
        value={markOf(student.id).nhanXet}
        maxLength={MAX_COMMENT}
        rows={2}
        disabled={!props.canRecord}
        placeholder={t('edu.diemDanh.commentHint')}
        onChange={(event) =>
          change(student.id, { nhanXet: event.target.value })
        }
      />
      {props.canRecord ? (
        <div className='flex flex-wrap gap-1'>
          {QUICK_TAGS.map((key) => {
            const tag = t(`edu.diemDanh.tag.${key}`);
            return (
              <button
                key={key}
                type='button'
                onClick={() =>
                  change(student.id, {
                    nhanXet: withTag(markOf(student.id).nhanXet, tag),
                  })
                }
                className='rounded-full border border-input px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring'
              >
                {tag}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );

  const name = (student: Row): ReactElement => (
    <RecordLink to={`/hoc-vien/${student.id}`}>
      {text(student.hoTen)}
    </RecordLink>
  );

  return (
    <div className='flex flex-col gap-4'>
      {props.canRecord && roster.length > 0 ? (
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => setAll({ trangThai: 'co_mat' })}
          >
            {t('edu.diemDanh.allPresent')}
          </Button>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => setAll({ daLamBtvn: true })}
          >
            {t('edu.diemDanh.allHomework')}
          </Button>
        </div>
      ) : null}

      {roster.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('edu.diemDanh.noStudents')}
        </p>
      ) : isMobile ? (
        <ul className='flex flex-col gap-3'>
          {roster.map((student) => (
            <li
              key={student.id}
              className='flex flex-col gap-3 rounded-lg border bg-card p-3'
            >
              <div className='flex items-start justify-between gap-2'>
                <span className='min-w-0 text-sm font-medium'>
                  {name(student)}
                </span>
                {balanceOf(student)}
              </div>
              <StatusPicker
                name={text(student.hoTen)}
                value={markOf(student.id).trangThai}
                disabled={!props.canRecord}
                onChange={(trangThai) => change(student.id, { trangThai })}
              />
              <div className='flex items-center justify-between gap-3'>
                <Label
                  htmlFor={`dd-btvn-${student.id}`}
                  className='flex min-h-11 items-center gap-2 font-normal'
                >
                  {homework(student)}
                  {t('edu.diemDanh.homework')}
                </Label>
                <Label
                  htmlFor={`dd-yt-${student.id}`}
                  className='flex items-center gap-2 font-normal'
                >
                  {t('edu.diemDanh.awareness')}
                  {score(student)}
                </Label>
              </div>
              {comment(student)}
            </li>
          ))}
        </ul>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('edu.hocVien.hoTen')}</TableHead>
                <TableHead>{t('edu.diemDanh.status')}</TableHead>
                <TableHead>{t('edu.diemDanh.homework')}</TableHead>
                <TableHead>{t('edu.diemDanh.awareness')}</TableHead>
                <TableHead className='min-w-64'>
                  {t('edu.diemDanh.comment')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((student) => (
                <TableRow key={student.id} className='align-top'>
                  <TableCell>
                    <div className='flex flex-col items-start gap-1.5'>
                      <span className='font-medium'>{name(student)}</span>
                      {balanceOf(student)}
                    </div>
                  </TableCell>
                  <TableCell className='min-w-72'>
                    <StatusPicker
                      name={text(student.hoTen)}
                      value={markOf(student.id).trangThai}
                      disabled={!props.canRecord}
                      onChange={(trangThai) =>
                        change(student.id, { trangThai })
                      }
                    />
                  </TableCell>
                  <TableCell>{homework(student)}</TableCell>
                  <TableCell>{score(student)}</TableCell>
                  <TableCell>{comment(student)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <section
        aria-labelledby='dd-content'
        className='flex flex-col gap-3 rounded-lg border p-4'
      >
        <h2 id='dd-content' className='text-sm font-medium'>
          {t('edu.diemDanh.content.title')}
        </h2>
        {props.contentReady ? null : (
          <p className='text-sm text-muted-foreground'>
            {t('edu.diemDanh.contentUnavailable')}
          </p>
        )}
        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
          {CONTENT_FIELDS.map((field) => (
            <div key={field} className='flex flex-col gap-1.5'>
              <Label htmlFor={`dd-nd-${field}`}>
                {t(`edu.diemDanh.content.${field}`)}
              </Label>
              <Textarea
                id={`dd-nd-${field}`}
                value={content[field]}
                maxLength={2000}
                rows={3}
                disabled={!canEditExtra}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}

      {props.canRecord && roster.length > 0 ? (
        // Stays at the bottom of the page's own scroll area, inside the content column: it never covers the sidebar.
        <div className='sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t bg-background px-6 py-3 md:-mx-8 md:px-8'>
          <p className='text-sm text-muted-foreground'>
            {t('edu.diemDanh.summary', { present, away })}
          </p>
          <PendingButton
            type='button'
            busy={busy}
            pendingLabel={t('edu.common.saving')}
            onClick={() => void save()}
            className='min-h-11 md:min-h-8'
          >
            {t('edu.diemDanh.save')}
          </PendingButton>
        </div>
      ) : null}
      {leave.dialog}
    </div>
  );
}
