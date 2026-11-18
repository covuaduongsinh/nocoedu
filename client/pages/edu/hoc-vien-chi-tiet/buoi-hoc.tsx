import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Pencil } from 'lucide-react';
import { useState, type ReactElement } from 'react';

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

import { AttendanceStatusBadge } from '../edu-ui-parts.js';
import { FilterSelect } from '../filter-select.js';
import { Field, FormDialog, SelectField } from '../form-parts.js';
import { formatTime } from '../format.js';
import { PAGE_SIZE, post } from '../kit.js';
import { Pager } from '../list-page.js';
import { useUrlState } from '../url-state.js';
import { termShortLabel } from './terms.js';
import type { SessionRow, Term } from './types.js';

const STATUSES = [
  'co_mat',
  'hoc_bu',
  'vang_co_phep',
  'vang_khong_phep',
] as const;

/** `ky` in the address: empty for every term, a term number, or `vuot` for the sessions beyond everything bought. */
const BEYOND = 'vuot';

/**
 * The sessions of the student with the term each was deducted from. The filters (term and status) and the page are in
 * the address. The edit button is for a person who may take attendance (`edu.diemDanh` `record`); the server checks the
 * same action and the scope of the row again.
 */
export function Sessions(props: {
  readonly sessions: readonly SessionRow[];
  readonly terms: readonly Term[] | null;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const url = useUrlState({ ky: '', trangThai: '' });
  const { can: canEdit } = useCan({
    resource: { type: 'composite', id: 'edu.diemDanh' },
    action: 'record',
  });
  const [editing, setEditing] = useState<SessionRow>();

  const shown = props.sessions
    .filter((session) =>
      url.values.ky === ''
        ? true
        : url.values.ky === BEYOND
          ? session.vuotSoDu
          : String(session.kySo) === url.values.ky,
    )
    .filter(
      (session) =>
        url.values.trangThai === '' ||
        session.trangThai === url.values.trangThai,
    )
    .slice()
    .reverse();
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(url.page, pages);
  const rows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const termName = (kySo: number | null): string => {
    if (kySo === null) return t('edu.hoSo.noKy');
    const term = props.terms?.find((candidate) => candidate.kySo === kySo);
    return term ? termShortLabel(t, term) : String(kySo);
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-3'>
        {props.terms ? (
          <FilterSelect
            label={t('edu.hoSo.filter.ky')}
            value={url.values.ky}
            allLabel={t('edu.hoSo.filter.allKy')}
            options={[
              ...props.terms.map((term) => ({
                value: String(term.kySo),
                label: termShortLabel(t, term),
              })),
              { value: BEYOND, label: t('edu.hoSo.vuotGoi') },
            ]}
            onChange={(ky) => url.set({ ky }, { keepPage: false })}
          />
        ) : null}
        <FilterSelect
          label={t('edu.hocVien.trangThai')}
          value={url.values.trangThai}
          allLabel={t('edu.hoSo.filter.allStatus')}
          options={STATUSES.map((status) => ({
            value: status,
            label: t(`edu.diemDanh.s.${status}`),
          }))}
          onChange={(trangThai) => url.set({ trangThai })}
        />
        <span className='text-xs text-muted-foreground'>
          {t('edu.hoSo.shown', {
            shown: shown.length,
            total: props.sessions.length,
          })}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
          {props.sessions.length === 0
            ? t('edu.hocVien.noSessions')
            : t('edu.hoSo.noSessionsFiltered')}
        </p>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('edu.hoSo.col.stt')}</TableHead>
                <TableHead>{t('edu.hoSo.col.ngayGio')}</TableHead>
                <TableHead>{t('edu.hocVien.lop')}</TableHead>
                <TableHead>{t('edu.hocVien.trangThai')}</TableHead>
                <TableHead>{t('edu.diemDanh.homework')}</TableHead>
                <TableHead>{t('edu.hoSo.col.yThuc')}</TableHead>
                <TableHead>{t('edu.hocVien.nhanXet')}</TableHead>
                {props.terms ? (
                  <TableHead>{t('edu.hoSo.col.ky')}</TableHead>
                ) : null}
                <TableHead>{t('edu.hoSo.col.tru')}</TableHead>
                {canEdit ? (
                  <TableHead className='text-right'>
                    {t('edu.common.actions')}
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((session) => (
                <TableRow key={session.diemDanhId}>
                  <TableCell className='text-muted-foreground'>
                    {session.stt}
                  </TableCell>
                  <TableCell className='whitespace-nowrap'>
                    <RecordLink to={`/diem-danh?buoi=${session.buoiHocId}`}>
                      {session.ngay}
                    </RecordLink>{' '}
                    <span className='text-muted-foreground'>
                      {formatTime(session.gioBatDau)}
                    </span>
                  </TableCell>
                  <TableCell>{session.lopTen ?? '—'}</TableCell>
                  <TableCell>
                    <AttendanceStatusBadge
                      status={session.trangThai}
                      size='sm'
                    />
                  </TableCell>
                  <TableCell>
                    {session.daLamBtvn
                      ? t('edu.common.yes')
                      : t('edu.common.no')}
                  </TableCell>
                  <TableCell>
                    {session.yThucDiem === null
                      ? '—'
                      : `${session.yThucDiem}/10`}
                  </TableCell>
                  <TableCell className='max-w-sm whitespace-pre-wrap break-words'>
                    {session.nhanXet || (
                      <span className='text-muted-foreground'>
                        {t('edu.hoSo.noComment')}
                      </span>
                    )}
                  </TableCell>
                  {props.terms ? (
                    <TableCell>
                      {session.vuotSoDu ? (
                        <StatusBadge tone='warning' size='sm'>
                          {t('edu.hoSo.vuotGoi')}
                        </StatusBadge>
                      ) : (
                        <span
                          className={
                            session.kySo === null ? 'text-muted-foreground' : ''
                          }
                        >
                          {termName(session.kySo)}
                        </span>
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    {session.soBuoiDaTru > 0 ? `-${session.soBuoiDaTru}` : '0'}
                  </TableCell>
                  {canEdit ? (
                    <TableCell className='text-right'>
                      <Button
                        size='sm'
                        variant='ghost'
                        aria-label={t('edu.hoSo.edit.title')}
                        onClick={() => setEditing(session)}
                      >
                        <Pencil className='size-3.5' />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager
            page={page}
            total={shown.length}
            onPage={(next) => url.setPage(next)}
          />
        </div>
      )}

      {editing ? (
        <EditSession
          session={editing}
          onClose={() => setEditing(undefined)}
          onSaved={props.onChanged}
        />
      ) : null}
    </div>
  );
}

/**
 * The quick edit of one attendance row. The server moves the balance by the difference only, with the rule fixed on the
 * session, and writes the ledger row (`/doiSoat/capNhatBuoiHoc`).
 */
function EditSession(props: {
  readonly session: SessionRow;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { session } = props;
  const [status, setStatus] = useState(session.trangThai);
  const [homework, setHomework] = useState(session.daLamBtvn);
  const [score, setScore] = useState(
    session.yThucDiem === null ? '' : String(session.yThucDiem),
  );
  const [comment, setComment] = useState(session.nhanXet);
  return (
    <FormDialog
      open
      title={t('edu.hoSo.edit.title')}
      description={t('edu.hoSo.edit.description', {
        date: session.ngay,
        class: session.lopTen ?? '',
      })}
      onClose={props.onClose}
      onSubmit={async () => {
        await post(api, '/doiSoat/capNhatBuoiHoc', {
          diemDanhId: session.diemDanhId,
          trangThai: status,
          daLamBtvn: homework,
          yThucDiem: score === '' ? null : Number(score),
          nhanXet: comment,
        });
        props.onSaved();
      }}
    >
      <SelectField
        id='edit-status'
        label={t('edu.hoSo.edit.status')}
        value={status}
        onChange={setStatus}
        options={STATUSES.map((value) => ({
          value,
          label: t(`edu.diemDanh.s.${value}`),
        }))}
      />
      <div className='flex items-center gap-2'>
        <Checkbox
          id='edit-homework'
          checked={homework}
          onCheckedChange={(checked) => setHomework(checked === true)}
        />
        <Label htmlFor='edit-homework'>{t('edu.hoSo.edit.homework')}</Label>
      </div>
      <Field id='edit-score' label={t('edu.hoSo.edit.score')}>
        <Input
          id='edit-score'
          type='number'
          min={0}
          max={10}
          step={1}
          value={score}
          onChange={(event) => setScore(event.target.value)}
        />
      </Field>
      <Field id='edit-comment' label={t('edu.hoSo.edit.comment')}>
        <Textarea
          id='edit-comment'
          rows={3}
          maxLength={1000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </Field>
      <p className='text-xs text-muted-foreground'>{t('edu.hoSo.edit.hint')}</p>
    </FormDialog>
  );
}
