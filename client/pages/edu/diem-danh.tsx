import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
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

  const [filterLop, setFilterLop] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'chua_diem_danh' | 'da_diem_danh'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'select'>('cards');

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

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const s of ordered) {
      const d = text(s.ngay);
      if (d.length >= 7) set.add(d.slice(0, 7));
    }
    return Array.from(set).sort().reverse();
  }, [ordered]);

  const className = (id: unknown): string =>
    text(classRows.find((row) => row.id === id)?.ten);

  const filteredSessions = useMemo(() => {
    return ordered.filter((row) => {
      if (filterLop !== 'all' && String(row.lopId) !== filterLop) return false;
      const d = text(row.ngay);
      if (filterMonth !== 'all' && !d.startsWith(filterMonth)) return false;
      if (filterStatus === 'da_diem_danh' && row.trangThai !== 'da_diem_danh') return false;
      if (filterStatus === 'chua_diem_danh' && row.trangThai === 'da_diem_danh') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const cName = className(row.lopId).toLowerCase();
        if (!d.includes(q) && !cName.includes(q)) return false;
      }
      return true;
    });
  }, [ordered, filterLop, filterMonth, filterStatus, searchQuery, classRows]);

  const session = ordered.find((row) => row.id === selectedId);
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

  const QUICK_TAGS = [
    'Con tiếp thu bài tốt',
    'Chăm chỉ tập trung',
    'Con hay nói chuyện',
    'Chưa làm BTVN',
    'Cờ tàn tiến bộ',
    'Cần cẩn thận hơn',
  ];

  const markAllPresent = (): void => {
    const next: Record<number, Mark> = {};
    for (const student of roster) {
      const cur = markOf(student.id);
      next[student.id] = { ...cur, trangThai: 'co_mat' };
    }
    setMarks((curr) => ({ ...curr, ...next }));
  };

  const appendTag = (studentId: number, tag: string): void => {
    const cur = markOf(studentId);
    const existing = cur.nhanXet.trim();
    const updated = existing ? `${existing}. ${tag}` : tag;
    change(studentId, { nhanXet: updated });
  };

  const exportCsv = async (): Promise<void> => {
    try {
      const res = await api.request({
        path: '/diemDanh/xuatCsv',
        method: 'POST',
        json: {
          lopId: filterLop !== 'all' ? Number(filterLop) : undefined,
          thang: filterMonth !== 'all' ? filterMonth : undefined,
        },
      });
      const blob = new Blob([res as unknown as string], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diem-danh-${filterMonth !== 'all' ? filterMonth : todayVn()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
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
          <div className='flex items-center gap-2'>
            <Button variant='outline' size='sm' onClick={() => void exportCsv()}>
              📥 Xuất CSV
            </Button>
            {canGenerate ? (
              <Button
                size='sm'
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
            ) : null}
          </div>
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
          {/* Thanh công cụ lọc buổi học thông minh */}
          <div className='flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm'>
            <div className='flex flex-wrap items-center justify-between gap-2 border-b pb-3'>
              <h2 className='text-sm font-semibold tracking-wide text-foreground flex items-center gap-2'>
                📅 Chọn Ca Học Điểm Danh
                <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium'>
                  {filteredSessions.length} buổi phù hợp
                </span>
              </h2>
              <div className='flex items-center gap-1.5'>
                <Button
                  size='sm'
                  variant={viewMode === 'cards' ? 'default' : 'outline'}
                  onClick={() => setViewMode('cards')}
                  className='h-8 text-xs'
                >
                  🗂️ Thẻ ca học
                </Button>
                <Button
                  size='sm'
                  variant={viewMode === 'select' ? 'default' : 'outline'}
                  onClick={() => setViewMode('select')}
                  className='h-8 text-xs'
                >
                  📋 Danh sách
                </Button>
              </div>
            </div>

            {/* Các bộ lọc theo Lớp, Tháng, Trạng thái, Tìm kiếm */}
            <div className='grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4'>
              <div>
                <label className='mb-1 block text-xs font-medium text-muted-foreground'>Lớp học</label>
                <select
                  value={filterLop}
                  onChange={(e) => setFilterLop(e.target.value)}
                  className='h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm'
                >
                  <option value='all'>Tất cả các lớp ({classRows.length})</option>
                  {classRows.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {text(c.ten)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className='mb-1 block text-xs font-medium text-muted-foreground'>Tháng</label>
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className='h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm'
                >
                  <option value='all'>Tất cả các tháng</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      Tháng {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className='mb-1 block text-xs font-medium text-muted-foreground'>Trạng thái</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as 'all' | 'chua_diem_danh' | 'da_diem_danh')}
                  className='h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm'
                >
                  <option value='all'>Tất cả trạng thái</option>
                  <option value='chua_diem_danh'>🟡 Chưa điểm danh</option>
                  <option value='da_diem_danh'>🟢 Đã điểm danh</option>
                </select>
              </div>

              <div>
                <label className='mb-1 block text-xs font-medium text-muted-foreground'>Tìm kiếm ngày/lớp</label>
                <Input
                  placeholder='VD: 2026-10 hoặc KL7...'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className='h-9 text-sm'
                />
              </div>
            </div>

            {/* Hiển thị dạng Thẻ hoặc Dropdown */}
            {viewMode === 'cards' ? (
              <div className='mt-2 max-h-56 overflow-y-auto rounded-lg border bg-muted/20 p-2'>
                {filteredSessions.length === 0 ? (
                  <p className='py-6 text-center text-xs text-muted-foreground'>
                    Không có buổi học nào phù hợp với bộ lọc hiện tại.
                  </p>
                ) : (
                  <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3'>
                    {filteredSessions.map((row) => {
                      const isSelected = row.id === selectedId;
                      const isDone = row.trangThai === 'da_diem_danh';
                      return (
                        <div
                          key={row.id}
                          onClick={() => {
                            setSaved({});
                            setContentSaved(false);
                            setError(undefined);
                            setParams({ buoi: String(row.id) });
                          }}
                          className={`cursor-pointer rounded-lg border p-2.5 transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/10 ring-2 ring-primary/20 shadow-sm'
                              : 'border-border bg-card hover:border-primary/50 hover:bg-muted/40'
                          }`}
                        >
                          <div className='flex items-center justify-between gap-1'>
                            <span className='font-bold text-sm text-foreground truncate'>
                              {className(row.lopId)}
                            </span>
                            <StatusBadge tone={isDone ? 'success' : 'warning'}>
                              {isDone ? 'Đã điểm danh' : 'Chưa điểm danh'}
                            </StatusBadge>
                          </div>
                          <div className='mt-1 flex items-center justify-between text-xs text-muted-foreground'>
                            <span>📅 {text(row.ngay)}</span>
                            <span>⏰ {text(row.gioBatDau)?.slice(0, 5)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className='mt-1'>
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
                  options={filteredSessions.map((row) => ({
                    value: String(row.id),
                    label: `${text(row.ngay)} ${text(row.gioBatDau)} · ${className(row.lopId)}${
                      row.trangThai === 'da_diem_danh' ? ' · Đã điểm danh' : ''
                    }`,
                  }))}
                />
              </div>
            )}
          </div>

          {session ? (
            <div className='overflow-x-auto rounded-lg border bg-card shadow-sm'>
              <div className='flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5'>
                <div className='flex items-center gap-2'>
                  <span className='font-semibold text-sm'>
                    Lớp: <RecordLink to={`/lop/${String(session.lopId)}`}>{className(session.lopId)}</RecordLink>
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    · {text(session.ngay)} ({text(session.gioBatDau)?.slice(0, 5)})
                  </span>
                  <StatusBadge tone={session.trangThai === 'da_diem_danh' ? 'success' : 'warning'}>
                    {session.trangThai === 'da_diem_danh' ? 'Đã lưu' : 'Chưa lưu'}
                  </StatusBadge>
                </div>
                {canRecord && roster.length > 0 ? (
                  <div className='flex items-center gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={markAllPresent}
                      className='h-8 text-xs font-medium border-emerald-500/40 text-emerald-700 hover:bg-emerald-50'
                    >
                      ⚡ Tất cả có mặt
                    </Button>
                    <Button
                      size='sm'
                      onClick={() => void save()}
                      disabled={busy}
                      className='h-8 text-xs font-medium'
                    >
                      {busy ? t('edu.common.saving') : t('edu.diemDanh.save')}
                    </Button>
                  </div>
                ) : null}
              </div>

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
                        <TableCell>
                          <RecordLink
                            to={`/hoc-vien/${student.id}`}
                            target='_blank'
                          >
                            {text(student.hoTen)}
                          </RecordLink>
                        </TableCell>
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
                        <TableCell className='min-w-[280px]'>
                          <Input
                            aria-label={t('edu.diemDanh.comment')}
                            value={mark.nhanXet}
                            maxLength={500}
                            placeholder='Nhập nhận xét...'
                            disabled={!canRecord}
                            onChange={(event) =>
                              change(student.id, {
                                nhanXet: event.target.value,
                              })
                            }
                          />
                          {canRecord ? (
                            <div className='mt-1 flex flex-wrap gap-1'>
                              {QUICK_TAGS.map((tag) => (
                                <button
                                  key={tag}
                                  type='button'
                                  onClick={() => appendTag(student.id, tag)}
                                  className='rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors'
                                >
                                  +{tag}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Input
                            aria-label={t('edu.diemDanh.awareness')}
                            title={t('edu.diemDanh.awarenessHint')}
                            type='number'
                            min={0}
                            max={10}
                            step={1}
                            className='w-16 h-8 text-center font-bold'
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
                          {(() => {
                            const num = result ? result.soBuoiConLai : Number(student.soBuoiConLai);
                            if (num < 0) {
                              return (
                                <StatusBadge
                                  tone='neutral'
                                  className='border-destructive/30 bg-destructive/10 text-destructive font-semibold'
                                >
                                  🔴 Vượt {Math.abs(num)}
                                </StatusBadge>
                              );
                            }
                            if (num <= 2) {
                              return (
                                <StatusBadge tone='warning'>
                                  🟡 Còn {num}
                                </StatusBadge>
                              );
                            }
                            return (
                              <StatusBadge tone='success'>
                                🟢 Còn {num}
                              </StatusBadge>
                            );
                          })()}
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
