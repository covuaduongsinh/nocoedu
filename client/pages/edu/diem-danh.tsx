import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Save,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
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
import { GenericImportDialog } from './generic-import-dialog.js';
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
  // Downloading is a separate action from viewing (`edu.baoCao` `export`): a coach sees attendance but cannot take the file.
  const { can: canExport } = useCan({
    resource: { type: 'composite', id: 'edu.baoCao' },
    action: 'export',
  });

  const selectedId = Number(params.get('buoi')) || 0;
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [saved, setSaved] = useState<Record<number, Saved>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [content, setContent] = useState<Content>(EMPTY_CONTENT);
  const [scores, setScores] = useState<Record<number, string>>({});
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

  // Teacher-Centric Fast Filters
  const [timeFilter, setTimeFilter] = useState<
    'today' | 'yesterday' | 'this_week' | 'all'
  >('today');
  const [filterLop, setFilterLop] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'chua_diem_danh' | 'da_diem_danh'
  >('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSessionSelector, setShowSessionSelector] =
    useState<boolean>(!selectedId);

  const todayStr = todayVn();
  const classRows = useMemo(
    () => (classes.state === 'ready' ? classes.rows : []),
    [classes],
  );
  const loadedSessions = sessions.loaded;

  const ordered = useMemo(
    () =>
      loadedSessions.state === 'ready'
        ? [...loadedSessions.rows].sort(
            (a, b) =>
              text(b.ngay).localeCompare(text(a.ngay)) ||
              text(a.gioBatDau).localeCompare(text(b.gioBatDau)),
          )
        : [],
    [loadedSessions],
  );

  const className = useCallback(
    (id: unknown): string => text(classRows.find((row) => row.id === id)?.ten),
    [classRows],
  );

  // Danh sách các ca học hôm nay (Today's Spotlight)
  const todaySessions = useMemo(() => {
    return ordered.filter((row) => text(row.ngay) === todayStr);
  }, [ordered, todayStr]);

  // Bộ lọc nhanh ngày hôm qua, tuần này
  const filteredSessions = useMemo(() => {
    // Tính khoảng ngày của tuần này
    const now = new Date();
    const dayOfWeek = now.getDay() || 7; // 1 = T2, 7 = CN
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + 1);
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - dayOfWeek + 7);
    const monStr = monday.toISOString().slice(0, 10);
    const sunStr = sunday.toISOString().slice(0, 10);

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    return ordered.filter((row) => {
      const d = text(row.ngay);
      if (timeFilter === 'today' && d !== todayStr) return false;
      if (timeFilter === 'yesterday' && d !== yesterdayStr) return false;
      if (timeFilter === 'this_week' && (d < monStr || d > sunStr))
        return false;

      if (filterLop !== 'all' && String(row.lopId) !== filterLop) return false;
      if (filterStatus === 'da_diem_danh' && row.trangThai !== 'da_diem_danh')
        return false;
      if (filterStatus === 'chua_diem_danh' && row.trangThai === 'da_diem_danh')
        return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const cName = className(row.lopId).toLowerCase();
        if (!d.includes(q) && !cName.includes(q)) return false;
      }
      return true;
    });
  }, [
    ordered,
    timeFilter,
    todayStr,
    filterLop,
    filterStatus,
    searchQuery,
    className,
  ]);

  const session = ordered.find((row) => row.id === selectedId);
  const roster: Row[] =
    session && students.state === 'ready'
      ? students.rows.filter(
          (row) => row.lopId === session.lopId && row.trangThai === 'dang_hoc',
        )
      : [];

  // Choosing a session closes the selector: adjusted while rendering, when the chosen session changes.
  const [seenSessionId, setSeenSessionId] = useState(selectedId);
  if (seenSessionId !== selectedId) {
    setSeenSessionId(selectedId);
    if (selectedId) setShowSessionSelector(false);
  }

  // Tải dữ liệu điểm danh đã lưu
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

  // Tải nội dung bài dạy
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
    'Nắm vững khai cuộc',
    'Giải cờ thế nhanh',
  ];

  const markAllPresent = (): void => {
    const next: Record<number, Mark> = {};
    for (const student of roster) {
      const cur = markOf(student.id);
      next[student.id] = { ...cur, trangThai: 'co_mat' };
    }
    setMarks((curr) => ({ ...curr, ...next }));
  };

  const markAllHomework = (): void => {
    const next: Record<number, Mark> = {};
    for (const student of roster) {
      const cur = markOf(student.id);
      next[student.id] = { ...cur, daLamBtvn: true };
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
      const stream = await api.stream({
        path: '/diemDanh/xuatCsv',
        method: 'POST',
        json: {
          lopId: filterLop !== 'all' ? Number(filterLop) : undefined,
        },
      });
      const blob = await new Response(stream).blob();
      const url = URL.createObjectURL(
        new Blob([blob], { type: 'text/csv;charset=utf-8' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `diem-danh-${todayVn()}.csv`;
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
      setRegistered(new Set(roster.map((student) => student.id)));
      sessions.reload();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-5xl pb-24'>
      <PageHeader
        title={t('edu.diemDanh.title')}
        description='Sổ điểm danh lớp học trực quan cho giáo viên: Điểm danh 1 chạm, nhận xét nhanh và theo dõi số buổi còn lại của học sinh.'
        actions={
          <div className='flex flex-wrap items-center gap-2'>
            <GenericImportDialog
              entity='diemDanh'
              title='Nhập điểm danh từ file CSV'
              buttonLabel='Nhập điểm danh CSV'
              variant='outline'
              onSuccess={() => sessions.reload()}
            />
            {canExport ? (
              <Button
                variant='outline'
                size='sm'
                onClick={() => void exportCsv()}
                className='gap-1.5'
              >
                <Download className='h-4 w-4' />
                Xuất CSV
              </Button>
            ) : null}
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
        <div className='flex flex-col gap-5'>
          {/* 1. KHỐI TIÊU ĐIỂM HÔM NAY (TODAY'S SPOTLIGHT FOR TEACHERS) */}
          <div className='rounded-2xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 via-primary/[0.02] to-background p-4 shadow-sm'>
            <div className='flex flex-wrap items-center justify-between gap-2 mb-3'>
              <div className='flex items-center gap-2'>
                <span className='flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs'>
                  <Sparkles className='h-4 w-4' />
                </span>
                <div>
                  <h2 className='text-sm font-bold text-foreground flex items-center gap-2'>
                    Ca Học Hôm Nay (Ngày {todayStr})
                    <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-semibold'>
                      {todaySessions.length} ca
                    </span>
                  </h2>
                </div>
              </div>
              <div className='text-xs text-muted-foreground flex items-center gap-1 font-medium'>
                <Clock className='h-3.5 w-3.5 text-primary' /> Giúp giáo viên
                vào nhanh lớp dạy
              </div>
            </div>

            {todaySessions.length === 0 ? (
              <div className='rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground bg-background/50'>
                Hôm nay không có ca học nào được lên lịch sẵn. Giáo viên có thể
                bấm bộ lọc &quot;Tuần này&quot; hoặc &quot;Tất cả ca học&quot;
                bên dưới để điểm danh bù.
              </div>
            ) : (
              <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3'>
                {todaySessions.map((row) => {
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
                        setShowSessionSelector(false);
                      }}
                      className={`group cursor-pointer rounded-xl border p-3 transition-all relative overflow-hidden ${
                        isSelected
                          ? 'border-primary bg-primary/15 ring-2 ring-primary shadow-sm'
                          : 'border-border bg-card hover:border-primary/50 hover:shadow-sm'
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
                      <div className='mt-2 flex items-center justify-between text-xs text-muted-foreground'>
                        <span className='flex items-center gap-1 font-medium'>
                          <Clock className='h-3.5 w-3.5 text-primary' />
                          {text(row.gioBatDau)?.slice(0, 5)} -{' '}
                          {text(row.gioKetThuc)?.slice(0, 5) || '20:00'}
                        </span>
                        <span className='font-semibold text-primary group-hover:underline'>
                          {isSelected ? '✓ Đang chọn' : '👉 Vào điểm danh'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. BANNER CA HỌC ĐANG CHỌN (KHI ĐANG ĐIỂM DANH) HOẶC BỘ CHỌN CA */}
          {selectedId > 0 && session && !showSessionSelector ? (
            <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4 shadow-sm'>
              <div className='flex items-center gap-3'>
                <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold shadow-sm'>
                  <Users className='h-5 w-5' />
                </div>
                <div>
                  <div className='flex items-center gap-2'>
                    <span className='text-base font-bold text-foreground'>
                      Lớp: {className(session.lopId)}
                    </span>
                    <StatusBadge
                      tone={
                        session.trangThai === 'da_diem_danh'
                          ? 'success'
                          : 'warning'
                      }
                    >
                      {session.trangThai === 'da_diem_danh'
                        ? 'Đã lưu điểm danh'
                        : 'Chưa lưu'}
                    </StatusBadge>
                  </div>
                  <p className='text-xs text-muted-foreground mt-0.5'>
                    📅 Ngày dạy:{' '}
                    <strong className='text-foreground'>
                      {text(session.ngay)}
                    </strong>{' '}
                    | ⏰ Giờ:{' '}
                    <strong className='text-foreground'>
                      {text(session.gioBatDau)?.slice(0, 5)}
                    </strong>{' '}
                    | Sĩ số:{' '}
                    <strong className='text-foreground'>
                      {roster.length} học viên
                    </strong>
                  </p>
                </div>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setShowSessionSelector(true)}
                className='text-xs gap-1.5'
              >
                <Filter className='h-3.5 w-3.5' /> Đổi ca học khác
              </Button>
            </div>
          ) : (
            <div className='flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm'>
              <div className='flex flex-wrap items-center justify-between gap-2 border-b pb-3'>
                <div className='flex items-center gap-2'>
                  <Calendar className='h-4 w-4 text-primary' />
                  <h2 className='text-sm font-semibold tracking-wide text-foreground'>
                    Tra cứu & Lọc ca học để điểm danh
                  </h2>
                </div>
                {/* Bộ lọc nhanh thời gian */}
                <div className='flex items-center gap-1 bg-muted p-1 rounded-lg'>
                  <button
                    type='button'
                    onClick={() => setTimeFilter('today')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      timeFilter === 'today'
                        ? 'bg-background shadow text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    🌟 Hôm nay
                  </button>
                  <button
                    type='button'
                    onClick={() => setTimeFilter('yesterday')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      timeFilter === 'yesterday'
                        ? 'bg-background shadow text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    ⏪ Hôm qua
                  </button>
                  <button
                    type='button'
                    onClick={() => setTimeFilter('this_week')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      timeFilter === 'this_week'
                        ? 'bg-background shadow text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    📅 Tuần này
                  </button>
                  <button
                    type='button'
                    onClick={() => setTimeFilter('all')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      timeFilter === 'all'
                        ? 'bg-background shadow text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    🔍 Tất cả ({ordered.length})
                  </button>
                </div>
              </div>

              {/* Bộ lọc chi tiết theo Lớp, Trạng thái, Tìm kiếm */}
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-2.5'>
                <div>
                  <label className='mb-1 block text-xs font-medium text-muted-foreground'>
                    Lớp học
                  </label>
                  <select
                    value={filterLop}
                    onChange={(e) => setFilterLop(e.target.value)}
                    className='h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm'
                  >
                    <option value='all'>
                      Tất cả các lớp ({classRows.length})
                    </option>
                    {classRows.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {text(c.ten)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className='mb-1 block text-xs font-medium text-muted-foreground'>
                    Trạng thái điểm danh
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) =>
                      setFilterStatus(e.target.value as typeof filterStatus)
                    }
                    className='h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm'
                  >
                    <option value='all'>Tất cả trạng thái</option>
                    <option value='chua_diem_danh'>🟡 Chưa điểm danh</option>
                    <option value='da_diem_danh'>🟢 Đã điểm danh</option>
                  </select>
                </div>

                <div>
                  <label className='mb-1 block text-xs font-medium text-muted-foreground'>
                    Tìm nhanh theo ngày / tên lớp
                  </label>
                  <Input
                    placeholder='VD: 2026-11 hoặc K1...'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className='h-9 text-sm'
                  />
                </div>
              </div>

              {/* Danh sách các ca học theo bộ lọc */}
              <div className='mt-1 max-h-56 overflow-y-auto rounded-lg border bg-muted/15 p-2'>
                {filteredSessions.length === 0 ? (
                  <p className='py-6 text-center text-xs text-muted-foreground'>
                    Không có ca học nào phù hợp với bộ lọc hiện tại.
                  </p>
                ) : (
                  <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2'>
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
                            setShowSessionSelector(false);
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
                              {isDone ? 'Đã lưu' : 'Chưa lưu'}
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
            </div>
          )}

          {/* 3. BẢNG DANH SÁCH HỌC VIÊN ĐIỂM DANH */}
          {session ? (
            <div className='overflow-x-auto rounded-xl border bg-card shadow-sm'>
              <div className='flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3'>
                <div className='flex items-center gap-2'>
                  <span className='font-bold text-sm text-foreground'>
                    Danh sách học viên lớp ({roster.length} học viên)
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    · Bấm các nút thao tác nhanh để tối ưu thời gian điểm danh:
                  </span>
                </div>
                {canRecord && roster.length > 0 ? (
                  <div className='flex flex-wrap items-center gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={markAllPresent}
                      className='h-8 text-xs font-semibold border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
                    >
                      ⚡ Tất cả có mặt
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={markAllHomework}
                      className='h-8 text-xs font-semibold border-blue-500/40 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20'
                    >
                      📝 Tất cả đã làm BTVN
                    </Button>
                    <Button
                      size='sm'
                      onClick={() => void save()}
                      disabled={busy}
                      className='h-8 text-xs font-bold bg-primary gap-1 shadow-sm'
                    >
                      <Save className='h-3.5 w-3.5' />
                      {busy ? t('edu.common.saving') : 'Lưu Điểm Danh'}
                    </Button>
                  </div>
                ) : null}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-48'>Học viên</TableHead>
                    <TableHead className='w-36'>Trạng thái</TableHead>
                    <TableHead className='w-24 text-center'>
                      Đã làm BTVN
                    </TableHead>
                    <TableHead className='min-w-[280px]'>
                      Nhận xét của giáo viên
                    </TableHead>
                    <TableHead className='w-20 text-center'>
                      Ý thức (0-10)
                    </TableHead>
                    <TableHead className='w-32 text-center'>
                      Số buổi còn lại
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map((student) => {
                    const mark = markOf(student.id);
                    const result = saved[student.id];
                    const num = result
                      ? result.soBuoiConLai
                      : Number(student.soBuoiConLai);

                    return (
                      <TableRow key={student.id} className='hover:bg-muted/30'>
                        {/* Cột 1: Tên học viên & cảnh báo số buổi cạnh tên */}
                        <TableCell>
                          <div className='flex flex-col gap-0.5'>
                            <RecordLink
                              to={`/hoc-vien/${student.id}`}
                              target='_blank'
                              className='font-bold text-sm text-foreground hover:underline'
                            >
                              {text(student.hoTen)}
                            </RecordLink>
                            <span className='text-[11px] text-muted-foreground font-mono'>
                              Mã: {text(student.ma) || `HV-${student.id}`}
                            </span>
                            {/* Cảnh báo nhanh nếu học viên âm hoặc sắp hết */}
                            {num < 0 && (
                              <span className='inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400'>
                                <AlertCircle className='h-3 w-3' /> Đang nợ{' '}
                                {Math.abs(num)} buổi
                              </span>
                            )}
                            {num >= 0 && num <= 2 && (
                              <span className='inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400'>
                                ⚠️ Sắp hết buổi ({num} buổi)
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Cột 2: Trạng thái điểm danh */}
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
                            className={`h-8 w-full rounded-md border text-xs font-semibold px-2 ${
                              mark.trangThai === 'co_mat'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                                : mark.trangThai === 'vang_co_phep'
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                                  : mark.trangThai === 'vang_khong_phep'
                                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400'
                                    : 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400'
                            }`}
                          >
                            {STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {t(`edu.diemDanh.s.${status}`)}
                              </option>
                            ))}
                          </select>
                        </TableCell>

                        {/* Cột 3: BTVN */}
                        <TableCell className='text-center'>
                          <Checkbox
                            aria-label={t('edu.diemDanh.homework')}
                            checked={mark.daLamBtvn}
                            disabled={!canRecord}
                            onCheckedChange={(checked) =>
                              change(student.id, {
                                daLamBtvn: checked === true,
                              })
                            }
                            className='h-5 w-5'
                          />
                        </TableCell>

                        {/* Cột 4: Nhận xét & Quick Tags */}
                        <TableCell className='min-w-[280px]'>
                          <Input
                            aria-label={t('edu.diemDanh.comment')}
                            value={mark.nhanXet}
                            maxLength={500}
                            placeholder='Nhập lời nhận xét cho phụ huynh...'
                            disabled={!canRecord}
                            onChange={(event) =>
                              change(student.id, {
                                nhanXet: event.target.value,
                              })
                            }
                            className='h-8 text-xs'
                          />
                          {canRecord ? (
                            <div className='mt-1.5 flex flex-wrap gap-1'>
                              {QUICK_TAGS.map((tag) => (
                                <button
                                  key={tag}
                                  type='button'
                                  onClick={() => appendTag(student.id, tag)}
                                  className='rounded-md border border-muted bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors'
                                >
                                  +{tag}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </TableCell>

                        {/* Cột 5: Điểm ý thức */}
                        <TableCell className='text-center'>
                          <Input
                            aria-label={t('edu.diemDanh.awareness')}
                            title={t('edu.diemDanh.awarenessHint')}
                            type='number'
                            min={0}
                            max={10}
                            step={1}
                            className='w-14 h-8 text-center font-bold text-sm mx-auto'
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

                        {/* Cột 6: Số buổi còn lại */}
                        <TableCell className='text-center'>
                          {num < 0 ? (
                            <span className='inline-block rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-400'>
                              🔴 Nợ {Math.abs(num)}
                            </span>
                          ) : num <= 2 ? (
                            <span className='inline-block rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400'>
                              🟡 Còn {num}
                            </span>
                          ) : (
                            <span className='inline-block rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400'>
                              🟢 Còn {num}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {roster.length === 0 ? (
                <p className='p-6 text-center text-sm text-muted-foreground'>
                  {t('edu.diemDanh.noStudents')}
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className='p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2'>
              <AlertCircle className='h-4 w-4 shrink-0' />
              <span>{error}</span>
            </div>
          ) : null}

          {/* 4. NỘI DUNG BUỔI HỌC VÀ KẾ HOẠCH DẠY */}
          {session ? (
            <section
              aria-label={t('edu.diemDanh.content.title')}
              className='flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm'
            >
              <div className='flex items-center justify-between border-b pb-2.5'>
                <h2 className='text-sm font-bold text-foreground flex items-center gap-2'>
                  📖 Nội Dung Giảng Dạy & Kế Hoạch Buổi Học
                </h2>
                {contentSaved && (
                  <span className='text-xs font-semibold text-emerald-600 flex items-center gap-1'>
                    <CheckCircle2 className='h-3.5 w-3.5' /> Đã lưu nội dung
                  </span>
                )}
              </div>
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
                      rows={3}
                      placeholder={`Ghi chú ${t(`edu.diemDanh.content.${field}`).toLowerCase()}...`}
                      onChange={(event) =>
                        setContent((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                      className='text-xs'
                    />
                  </Field>
                ))}
              </div>
              {canRecord ? (
                <div className='flex items-center gap-3 pt-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => void saveContent()}
                    disabled={contentBusy}
                    className='text-xs font-semibold'
                  >
                    {contentBusy
                      ? t('edu.common.saving')
                      : 'Lưu nội dung bài dạy'}
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* 5. THANH LƯU CỐ ĐỊNH Ở ĐÁY (STICKY ACTION BAR CHO GIÁO VIÊN) */}
          {session && canRecord && roster.length > 0 && (
            <div className='fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t py-3 px-6 shadow-lg'>
              <div className='mx-auto max-w-5xl flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                  <span className='font-bold text-sm text-foreground'>
                    {className(session.lopId)} - Ngày {text(session.ngay)}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    ({roster.length} học sinh)
                  </span>
                </div>
                <div className='flex items-center gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={markAllPresent}
                    className='text-xs'
                  >
                    ⚡ Có mặt tất cả
                  </Button>
                  <Button
                    size='sm'
                    onClick={() => void save()}
                    disabled={busy}
                    className='font-bold bg-primary text-primary-foreground gap-1.5 shadow-md px-4'
                  >
                    <Save className='h-4 w-4' />
                    {busy ? t('edu.common.saving') : 'LƯU ĐIỂM DANH'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialog sinh ca học */}
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
