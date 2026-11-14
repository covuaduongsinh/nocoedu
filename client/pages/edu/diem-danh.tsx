import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { Field, FormDialog, SelectField, TextField } from './form-parts.js';
import {
  post,
  text,
  todayVn,
  useErrorMessage,
  useRows,
  type Row,
} from './kit.js';

const STATUSES = [
  'co_mat',
  'vang_co_phep',
  'vang_khong_phep',
  'hoc_bu',
] as const;
type Status = (typeof STATUSES)[number];
interface Mark {
  trangThai: Status;
  daLamBtvn: boolean;
  nhanXet: string;
}
interface Saved {
  hocVienId: number;
  soBuoiConLai: number;
  canhBao: boolean;
}

/** What was taught (DS-61): kept per session, written through `/buoiHoc/noiDung/luu`, never through the balance path. */
const CONTENT_FIELDS = [
  'keHoachDay',
  'kienThucMoi',
  'giaoBtvn',
  'keHoachBuoiSau',
] as const;
type Content = Record<(typeof CONTENT_FIELDS)[number], string>;
const EMPTY_CONTENT: Content = {
  keHoachDay: '',
  kienThucMoi: '',
  giaoBtvn: '',
  keHoachBuoiSau: '',
};

/**
 * Sessions and attendance. A coach picks a session of their class and marks each student present, excused, absent
 * without leave or making up a missed session, whether the homework was done, and a short comment. Saving deducts
 * the sessions on the server (the page never computes a balance) and shows the new balances, warning at 2 or fewer.
 */
export default function DiemDanhPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const [params, setParams] = useSearchParams();
  const sessions = useRows('buoiHoc', { newestFirst: true });
  const classes = useRows('lop').loaded;
  const students = useRows('hocVien').loaded;
  const { can: canRecord } = useCan({
    resource: { type: 'composite', id: 'edu.diemDanh' },
    action: 'record',
  });
  const { can: canGenerate } = useCan({
    resource: { type: 'composite', id: 'edu.buoiHoc' },
    action: 'manage',
  });

  const selectedId = Number(params.get('buoi')) || 0;
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [saved, setSaved] = useState<Record<number, Saved>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [content, setContent] = useState<Content>(EMPTY_CONTENT);
  const [scores, setScores] = useState<Record<number, string>>({});
  // Students that already have an attendance row in the chosen session: only they can be given a score.
  const [registered, setRegistered] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [contentBusy, setContentBusy] = useState(false);
  const [contentSaved, setContentSaved] = useState(false);
  const [generate, setGenerate] = useState<{
    lopId: string;
    tuNgay: string;
    denNgay: string;
  }>();

  const classRows = classes.state === 'ready' ? classes.rows : [];
  const loadedSessions = sessions.loaded;
  const ordered = useMemo(
    () =>
      loadedSessions.state === 'ready'
        ? [...loadedSessions.rows].sort((a, b) =>
            text(b.ngay).localeCompare(text(a.ngay)),
          )
        : [],
    [loadedSessions],
  );
  const session = ordered.find((row) => row.id === selectedId);
  const className = (id: unknown): string =>
    text(classRows.find((row) => row.id === id)?.ten);
  const roster: Row[] =
    session && students.state === 'ready'
      ? students.rows.filter(
          (row) => row.lopId === session.lopId && row.trangThai === 'dang_hoc',
        )
      : [];

  // The marks already saved for the chosen session.
  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    api
      .request<{ data: Row[] }>({
        path: '/diemDanh/findMany',
        method: 'POST',
        json: { filter: { buoiHocId: selectedId }, limit: 100 },
      })
      .then((response) => {
        if (!live) return;
        const next: Record<number, Mark> = {};
        for (const row of response.data) {
          next[Number(row.hocVienId)] = {
            trangThai: text(row.trangThai) as Status,
            daLamBtvn: row.daLamBtvn === true,
            nhanXet: text(row.nhanXet),
          };
        }
        setMarks(next);
        setRegistered(new Set(Object.keys(next).map(Number)));
      })
      .catch(() => {
        if (!live) return;
        setMarks({});
        setRegistered(new Set());
      });
    return () => {
      live = false;
    };
  }, [api, selectedId]);

  // The content of the session and the awareness scores already saved.
  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    api
      .request<{
        data: {
          noiDung: Partial<Content>;
          yThuc: { hocVienId: number; diem: number }[];
        };
      }>({
        path: '/buoiHoc/noiDung/xem',
        method: 'POST',
        json: { buoiHocId: selectedId },
      })
      .then((response) => {
        if (!live) return;
        setContent({ ...EMPTY_CONTENT, ...response.data.noiDung });
        setScores(
          Object.fromEntries(
            response.data.yThuc.map((s) => [s.hocVienId, String(s.diem)]),
          ),
        );
      })
      .catch(() => {
        if (!live) return;
        setContent(EMPTY_CONTENT);
        setScores({});
      });
    return () => {
      live = false;
    };
  }, [api, selectedId]);

  const saveContent = async (): Promise<void> => {
    if (!session || contentBusy) return;
    setContentBusy(true);
    setContentSaved(false);
    setError(undefined);
    try {
      await post(api, '/buoiHoc/noiDung/luu', {
        buoiHocId: session.id,
        noiDung: content,
        yThuc: roster
          .filter((student) => registered.has(student.id))
          .map((student) => {
            const raw = (scores[student.id] ?? '').trim();
            return {
              hocVienId: student.id,
              diem: raw === '' ? null : Number(raw),
            };
          }),
      });
      setContentSaved(true);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setContentBusy(false);
    }
  };

  const markOf = (id: number): Mark =>
    marks[id] ?? { trangThai: 'co_mat', daLamBtvn: false, nhanXet: '' };
  const change = (id: number, patch: Partial<Mark>): void =>
    setMarks((current) => ({ ...current, [id]: { ...markOf(id), ...patch } }));

  const save = async (): Promise<void> => {
    if (!session || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = (await post(api, '/diemDanh/luu', {
        buoiHocId: session.id,
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
      // The register now has a row for every student listed, so each can be scored.
      setRegistered(new Set(roster.map((student) => student.id)));
      sessions.reload();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <PageHeader
        title={t('edu.diemDanh.title')}
        description={t('edu.diemDanh.description')}
        actions={
          canGenerate ? (
            <Button
              variant='outline'
              onClick={() =>
                setGenerate({
                  lopId: '',
                  tuNgay: todayVn(),
                  denNgay: todayVn(),
                })
              }
            >
              {t('edu.diemDanh.generate')}
            </Button>
          ) : null
        }
      />
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
      ) : (
        <div className='flex flex-col gap-4'>
          <SelectField
            id='dd-buoi'
            label={t('edu.diemDanh.session')}
            value={selectedId ? String(selectedId) : ''}
            onChange={(value) => {
              setSaved({});
              setContentSaved(false);
              setError(undefined);
              setParams(value ? { buoi: value } : {});
            }}
            options={ordered.map((row) => ({
              value: String(row.id),
              label: `${text(row.ngay)} ${text(row.gioBatDau)} · ${className(row.lopId)}${
                row.trangThai === 'da_diem_danh'
                  ? ` · ${t('edu.diemDanh.done')}`
                  : ''
              }`,
            }))}
          />
          {ordered.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('edu.diemDanh.noSessions')}
            </p>
          ) : null}
          {session ? (
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('edu.hocVien.hoTen')}</TableHead>
                    <TableHead>{t('edu.diemDanh.status')}</TableHead>
                    <TableHead>{t('edu.diemDanh.homework')}</TableHead>
                    <TableHead>{t('edu.diemDanh.comment')}</TableHead>
                    <TableHead>{t('edu.diemDanh.awareness')}</TableHead>
                    <TableHead>{t('edu.diemDanh.balance')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map((student) => {
                    const mark = markOf(student.id);
                    const result = saved[student.id];
                    return (
                      <TableRow key={student.id}>
                        <TableCell>{text(student.hoTen)}</TableCell>
                        <TableCell>
                          <select
                            aria-label={t('edu.diemDanh.status')}
                            value={mark.trangThai}
                            disabled={!canRecord}
                            onChange={(event) =>
                              change(student.id, {
                                trangThai: event.target.value as Status,
                              })
                            }
                            className='h-8 rounded-lg border border-input bg-transparent px-2 text-sm'
                          >
                            {STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {t(`edu.diemDanh.s.${status}`)}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            aria-label={t('edu.diemDanh.homework')}
                            checked={mark.daLamBtvn}
                            disabled={!canRecord}
                            onCheckedChange={(checked) =>
                              change(student.id, {
                                daLamBtvn: checked === true,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            aria-label={t('edu.diemDanh.comment')}
                            value={mark.nhanXet}
                            maxLength={500}
                            disabled={!canRecord}
                            onChange={(event) =>
                              change(student.id, {
                                nhanXet: event.target.value,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            aria-label={t('edu.diemDanh.awareness')}
                            title={t('edu.diemDanh.awarenessHint')}
                            type='number'
                            min={0}
                            max={10}
                            step={1}
                            className='w-20'
                            value={scores[student.id] ?? ''}
                            disabled={!canRecord || !registered.has(student.id)}
                            onChange={(event) =>
                              setScores((current) => ({
                                ...current,
                                [student.id]: event.target.value,
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {result ? (
                            <StatusBadge
                              tone={result.canhBao ? 'warning' : 'success'}
                            >
                              {result.canhBao
                                ? t('edu.diemDanh.low', {
                                    count: result.soBuoiConLai,
                                  })
                                : t('edu.home.sessionsLeft', {
                                    count: result.soBuoiConLai,
                                  })}
                            </StatusBadge>
                          ) : (
                            text(student.soBuoiConLai)
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {roster.length === 0 ? (
                <p className='p-3 text-sm text-muted-foreground'>
                  {t('edu.diemDanh.noStudents')}
                </p>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
          {session && canRecord && roster.length > 0 ? (
            <div>
              <Button onClick={() => void save()} disabled={busy}>
                {busy ? t('edu.common.saving') : t('edu.diemDanh.save')}
              </Button>
            </div>
          ) : null}
          {session ? (
            <section
              aria-label={t('edu.diemDanh.content.title')}
              className='flex flex-col gap-3 rounded-lg border p-4'
            >
              <h2 className='text-base font-medium'>
                {t('edu.diemDanh.content.title')}
              </h2>
              <div className='grid gap-3 sm:grid-cols-2'>
                {CONTENT_FIELDS.map((field) => (
                  <Field
                    key={field}
                    id={`dd-nd-${field}`}
                    label={t(`edu.diemDanh.content.${field}`)}
                  >
                    <Textarea
                      id={`dd-nd-${field}`}
                      value={content[field]}
                      maxLength={2000}
                      disabled={!canRecord}
                      onChange={(event) =>
                        setContent((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                    />
                  </Field>
                ))}
              </div>
              {canRecord ? (
                <div className='flex items-center gap-3'>
                  <Button
                    variant='outline'
                    onClick={() => void saveContent()}
                    disabled={contentBusy}
                  >
                    {contentBusy
                      ? t('edu.common.saving')
                      : t('edu.diemDanh.content.save')}
                  </Button>
                  {contentSaved ? (
                    <p role='status' className='text-sm text-muted-foreground'>
                      {t('edu.diemDanh.content.saved')}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
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
              .map((row) => ({
                value: String(row.id),
                label: text(row.ten),
              }))}
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
