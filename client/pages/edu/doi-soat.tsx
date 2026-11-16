import { resolveAssetUrl, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, useMemo, type ReactElement } from 'react';
import { useSearchParams } from 'react-router';
import {
  ArrowLeft,
  CalendarCheck,
  Download,
  Layers,
  Printer,
  RefreshCw,
  Search,
  BookOpen,
  Wallet,
  AlertTriangle,
  Edit3,
  X,
  ExternalLink,
} from 'lucide-react';

import { PageContainer } from '#components/page-container';
import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  downloadReport,
  text,
  useErrorMessage,
  useRequest,
  useRows,
} from './kit.js';

const fmt = (value: unknown): string =>
  Number(value || 0).toLocaleString('vi-VN');

interface StudentOverviewRow {
  id: number;
  ma: string;
  hoTen: string;
  lopId: number | null;
  lopTen: string | null;
  coSoId: number | null;
  coSoTen: string | null;
  phuHuynhTen: string | null;
  phuHuynhSdt: string | null;
  soBuoiConLai: number;
  soBuoiVuotGoi: number;
  tongSoBuoiDaMua: number;
  tongSoBuoiDaHoc: number;
  tongTienHocPhi: number;
  tongDaThanhToan: number;
  tongConNoHocPhi: number;
  tongTienSachDaPhat: number;
  tongTienSachDaNop: number;
  tienSachTon: number;
  congNoSach: number;
  trangThai: string;
}

interface AuditStats {
  tongHocVien: number;
  soHocVienVuotGoi: number;
  soHocVienSapHet: number;
  soHocVienBinhThuong: number;
  tongCongNoHocPhi: number;
  tongCongNoSach: number;
}

/** What the server returned for this viewer: money, books and parents come only with the matching permission. */
interface AuditParts {
  hocPhi: boolean;
  sach: boolean;
  phuHuynh: boolean;
  suaBuoi?: boolean;
}

interface StudentAuditDetail {
  quyen: AuditParts;
  hocVien: {
    id: number;
    ma: string;
    hoTen: string;
    lopId: number | null;
    lopTen: string | null;
    coSoId: number | null;
    coSoTen: string | null;
    phuHuynh: {
      id: number;
      hoTen: string;
      soDienThoai: string;
      email: string | null;
      moiQuanHe: string | null;
    } | null;
    soBuoiConLai: number;
    trangThai: string;
  };
  tongHop: {
    tongSoBuoiDaMua: number;
    tongSoBuoiDaHoc: number;
    soBuoiConLai: number;
    soBuoiVuotGoi: number;
    tongTienHocPhi: number;
    tongDaThanhToan: number;
    tongConNo: number;
    tongTienSachDaPhat: number;
    tongTienSachDaNop: number;
    tienSachTon: number;
  };
  cacKyNop: {
    id: number;
    kySo: number;
    tenKy: string;
    ngayMua: string;
    soBuoi: number;
    donGia: number;
    thanhTien: number;
    daThanhToan: number;
    conNo: number;
    daDung: number;
    conLai: number;
    tienDo: number;
    trangThai: string;
  }[];
  sachDaPhat: {
    id: number;
    sachId: number;
    tenSach: string;
    ngayPhat: string;
    soLuong: number;
    giaBia: number;
    uuDai: number;
    thanhTien: number;
    ghiChu: string;
  }[];
  danhSachBuoiHoc: {
    diemDanhId: number;
    buoiHocId: number;
    stt: number;
    buoiThu: number;
    ngay: string;
    gioBatDau: string;
    gioKetThuc: string;
    lopId: number | null;
    lopTen: string;
    trangThai: string;
    daLamBtvn: boolean;
    yThucDiem: number | null;
    nhanXet: string;
    soBuoiDaTru: number;
    kyId: number | null;
    kySo: number | null;
    kyTen: string;
    ngoaiGoi: boolean;
  }[];
}

export default function DoiSoatPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const errorMessage = useErrorMessage();
  const money = (value: unknown): string =>
    t('edu.doiSoat.money', { v: fmt(value) });
  const { can: canExport } = useCan({
    resource: { type: 'composite', id: 'edu.baoCao' },
    action: 'export',
  });
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedStudentId = searchParams.get('hocVienId');

  // Lấy dữ liệu cơ sở và lớp học
  const classes = useRows('lop').loaded;
  const branches = useRows('coSo').loaded;
  const classRows = classes.state === 'ready' ? classes.rows : [];
  const branchRows = branches.state === 'ready' ? branches.rows : [];

  // State chế độ 1 (Tổng quan): bộ lọc; dữ liệu đọc qua `useRequest`
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('tat_ca');
  const [selectedCoSoId, setSelectedCoSoId] = useState<string>('all');
  const [selectedLopId, setSelectedLopId] = useState<string>('all');
  // Gõ phím sau 350ms mới lọc
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  const overview = useRequest<{
    quyen?: AuditParts;
    thongKe: AuditStats;
    danhSach: StudentOverviewRow[];
  }>(
    '/doiSoat/tongQuan',
    {
      search: debouncedSearch || null,
      trangThaiLoc: filterStatus,
      coSoId: selectedCoSoId !== 'all' ? Number(selectedCoSoId) : null,
      lopId: selectedLopId !== 'all' ? Number(selectedLopId) : null,
    },
    { enabled: !selectedStudentId },
  );
  const reasonText = (reason?: string): string => {
    const key = reason ? `edu.errors.${reason}` : '';
    const found = key ? t(key) : '';
    return found && found !== key ? found : t('edu.errors.generic');
  };
  const loadingOverview = overview.result.state === 'loading';
  const overviewError =
    overview.result.state === 'error'
      ? reasonText(overview.result.reason)
      : null;
  const overviewData = overviewError ? null : (overview.lastData ?? null);
  const loadOverview = overview.reload;

  // Lọc danh sách lớp học theo cơ sở đã chọn
  const availableClasses =
    selectedCoSoId === 'all'
      ? classRows
      : classRows.filter((c) => String(c.coSoId) === selectedCoSoId);

  // State chế độ 2 (Chi tiết học viên): đọc qua `useRequest` khi có học viên được chọn
  const detailRequest = useRequest<StudentAuditDetail>(
    '/doiSoat/chiTietHocVien',
    { hocVienId: Number(selectedStudentId) },
    { enabled: Boolean(selectedStudentId) },
  );
  const loadingDetail = detailRequest.result.state === 'loading';
  const detailError =
    detailRequest.result.state === 'error'
      ? reasonText(detailRequest.result.reason)
      : null;
  const rawDetail =
    detailRequest.result.state === 'ready' ? detailRequest.result.data : null;
  // The server sends numbers and flags; the labels are written here, in the viewer's language.
  const studentDetail = useMemo<StudentAuditDetail | null>(() => {
    if (!rawDetail) return null;
    const cacKyNop = rawDetail.cacKyNop.map((ky) => ({
      ...ky,
      tenKy: t('edu.doiSoat.kyLabel', { so: ky.kySo, soBuoi: ky.soBuoi }),
    }));
    const kyLabel = new Map(cacKyNop.map((ky) => [ky.id, ky.tenKy]));
    return {
      ...rawDetail,
      cacKyNop,
      danhSachBuoiHoc: rawDetail.danhSachBuoiHoc.map((buoi) => ({
        ...buoi,
        lopTen: buoi.lopTen ?? '—',
        kyTen:
          buoi.kyId != null && !buoi.ngoaiGoi
            ? (kyLabel.get(buoi.kyId) ?? '')
            : t('edu.doiSoat.ngoaiGoi'),
      })),
    };
  }, [rawDetail, t]);
  const [activeTab, setActiveTab] = useState('overview');

  // Bộ lọc và sắp xếp bên trong Tab Lịch sử buổi học
  const [sessionKyFilter, setSessionKyFilter] = useState<string>('all');
  const [sessionStatusFilter, setSessionStatusFilter] = useState<string>('all');
  const [sessionSearchComment, setSessionSearchComment] = useState<string>('');
  const [sessionSortOrder, setSessionSortOrder] = useState<'desc' | 'asc'>(
    'desc',
  );

  // Dialog Quick Edit buổi học
  const [editSession, setEditSession] = useState<{
    diemDanhId: number;
    ngay: string;
    lopTen: string;
    trangThai: string;
    daLamBtvn: boolean;
    yThucDiem: number | '';
    nhanXet: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleFilterStatus = (status: string) => {
    setFilterStatus(status);
  };

  const handleCoSoChange = (coSoId: string) => {
    setSelectedCoSoId(coSoId);
    setSelectedLopId('all');
  };

  const handleLopChange = (lopId: string) => {
    setSelectedLopId(lopId);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setFilterStatus('tat_ca');
    setSelectedCoSoId('all');
    setSelectedLopId('all');
  };

  // Lưu chỉnh sửa nhanh buổi học
  const handleSaveEditSession = async (): Promise<void> => {
    if (!editSession) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await api.request({
        path: '/doiSoat/capNhatBuoiHoc',
        method: 'POST',
        json: {
          diemDanhId: editSession.diemDanhId,
          trangThai: editSession.trangThai,
          daLamBtvn: editSession.daLamBtvn,
          yThucDiem:
            editSession.yThucDiem === '' ? null : Number(editSession.yThucDiem),
          nhanXet: editSession.nhanXet,
        },
      });
      detailRequest.reload();
      setEditSession(null);
    } catch (err) {
      // The dialog stays open with what was typed, and says why nothing was saved.
      setEditError(errorMessage(err));
    } finally {
      setSavingEdit(false);
    }
  };

  // Lọc và sắp xếp danh sách buổi học trong Tab
  const filteredSessions = useMemo(() => {
    if (!studentDetail) return [];
    const list = studentDetail.danhSachBuoiHoc.filter((s) => {
      if (sessionKyFilter !== 'all') {
        if (sessionKyFilter === 'ngoai_goi' && !s.ngoaiGoi) return false;
        if (
          sessionKyFilter !== 'ngoai_goi' &&
          String(s.kyId) !== sessionKyFilter
        )
          return false;
      }
      if (
        sessionStatusFilter !== 'all' &&
        s.trangThai !== sessionStatusFilter
      ) {
        return false;
      }
      if (sessionSearchComment) {
        const q = sessionSearchComment.toLowerCase();
        if (!s.nhanXet?.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list];
    if (sessionSortOrder === 'desc') {
      sorted.reverse();
    }
    return sorted;
  }, [
    studentDetail,
    sessionKyFilter,
    sessionStatusFilter,
    sessionSearchComment,
    sessionSortOrder,
  ]);

  // Xuất bảng kê buổi học của học viên: qua báo cáo `diemDanhChiTiet`, có kiểm quyền xuất và ghi nhật ký
  const [exportError, setExportError] = useState<string | null>(null);
  const exportStudentCsv = async (): Promise<void> => {
    if (!studentDetail) return;
    setExportError(null);
    try {
      await downloadReport(
        api,
        { loai: 'diemDanhChiTiet', hocVienId: studentDetail.hocVien.id },
        `doi-soat-${studentDetail.hocVien.ma}.csv`,
      );
    } catch (cause) {
      setExportError(errorMessage(cause));
    }
  };

  return (
    <PageContainer>
      {/* =========================================================================
          CHẾ ĐỘ 1: BẢNG ĐIỀU KHIỂN ĐỐI SOÁT TOÀN TRUNG TÂM (HUB VIEW)
         ========================================================================= */}
      {!selectedStudentId ? (
        <div className='flex flex-col gap-6 py-4'>
          {/* Header Trang */}
          <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <h1 className='text-2xl font-bold tracking-tight text-foreground flex items-center gap-2'>
                <CalendarCheck className='size-6 text-primary' />
                {t('edu.doiSoat.hubTitle')}
              </h1>
              <p className='text-sm text-muted-foreground'>
                {t('edu.doiSoat.hubDescription')}
              </p>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => loadOverview()}
              disabled={loadingOverview}
              className='gap-1.5'
            >
              <RefreshCw
                className={`size-4 ${loadingOverview ? 'animate-spin' : ''}`}
              />
              {t('edu.doiSoat.refresh')}
            </Button>
          </div>

          {/* Khối Thống kê Toàn trường (KPI Cards) */}
          {overviewData ? (
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
              <div
                onClick={() => handleFilterStatus('tat_ca')}
                className={`cursor-pointer rounded-xl border p-3.5 shadow-sm transition-all hover:border-primary ${filterStatus === 'tat_ca' ? 'ring-2 ring-primary bg-primary/5' : 'bg-card'}`}
              >
                <p className='text-xs font-medium text-muted-foreground'>
                  {t('edu.doiSoat.kpi.total')}
                </p>
                <p className='mt-1 text-2xl font-bold text-foreground'>
                  {overviewData.thongKe.tongHocVien}
                </p>
                <span className='text-[11px] text-muted-foreground'>
                  {t('edu.doiSoat.kpi.totalSub')}
                </span>
              </div>

              <div
                onClick={() => handleFilterStatus('vuot_goi')}
                className={`cursor-pointer rounded-xl border p-3.5 shadow-sm transition-all hover:border-destructive ${filterStatus === 'vuot_goi' ? 'ring-2 ring-destructive bg-destructive/5' : 'bg-card'}`}
              >
                <p className='text-xs font-medium text-destructive flex items-center gap-1'>
                  <AlertTriangle className='size-3.5' />{' '}
                  {t('edu.doiSoat.kpi.over')}
                </p>
                <p className='mt-1 text-2xl font-bold text-destructive'>
                  {overviewData.thongKe.soHocVienVuotGoi}
                </p>
                <span className='text-[11px] text-destructive'>
                  {t('edu.doiSoat.kpi.overSub')}
                </span>
              </div>

              <div
                onClick={() => handleFilterStatus('sap_het')}
                className={`cursor-pointer rounded-xl border p-3.5 shadow-sm transition-all hover:border-(--status-warning) ${filterStatus === 'sap_het' ? 'ring-2 ring-(--status-warning) bg-(--status-warning-background)' : 'bg-card'}`}
              >
                <p className='text-xs font-medium text-(--status-warning)'>
                  {t('edu.doiSoat.kpi.low')}
                </p>
                <p className='mt-1 text-2xl font-bold text-(--status-warning)'>
                  {overviewData.thongKe.soHocVienSapHet}
                </p>
                <span className='text-[11px] text-muted-foreground'>
                  {t('edu.doiSoat.kpi.lowSub')}
                </span>
              </div>

              <div
                onClick={() => handleFilterStatus('binh_thuong')}
                className={`cursor-pointer rounded-xl border p-3.5 shadow-sm transition-all hover:border-(--status-success) ${filterStatus === 'binh_thuong' ? 'ring-2 ring-(--status-success) bg-(--status-success-background)' : 'bg-card'}`}
              >
                <p className='text-xs font-medium text-(--status-success)'>
                  {t('edu.doiSoat.kpi.safe')}
                </p>
                <p className='mt-1 text-2xl font-bold text-(--status-success)'>
                  {overviewData.thongKe.soHocVienBinhThuong}
                </p>
                <span className='text-[11px] text-muted-foreground'>
                  {t('edu.doiSoat.kpi.safeSub')}
                </span>
              </div>

              <div
                onClick={() => handleFilterStatus('no_hoc_phi')}
                className={`cursor-pointer rounded-xl border p-3.5 shadow-sm transition-all hover:border-primary ${filterStatus === 'no_hoc_phi' ? 'ring-2 ring-primary bg-primary/5' : 'bg-card'}`}
              >
                <p className='text-xs font-medium text-muted-foreground'>
                  {t('edu.doiSoat.kpi.tuitionDebt')}
                </p>
                <p className='mt-1 text-lg font-bold text-foreground'>
                  {money(overviewData.thongKe.tongCongNoHocPhi)}
                </p>
                <span className='text-[11px] text-muted-foreground'>
                  {t('edu.doiSoat.kpi.tuitionDebtSub')}
                </span>
              </div>

              <div
                onClick={() => handleFilterStatus('no_sach')}
                className={`cursor-pointer rounded-xl border p-3.5 shadow-sm transition-all hover:border-primary ${filterStatus === 'no_sach' ? 'ring-2 ring-primary bg-primary/5' : 'bg-card'}`}
              >
                <p className='text-xs font-medium text-muted-foreground'>
                  {t('edu.doiSoat.kpi.bookDebt')}
                </p>
                <p className='mt-1 text-lg font-bold text-foreground'>
                  {money(overviewData.thongKe.tongCongNoSach)}
                </p>
                <span className='text-[11px] text-muted-foreground'>
                  {t('edu.doiSoat.kpi.bookDebtSub')}
                </span>
              </div>
            </div>
          ) : null}

          {/* Thanh công cụ Tìm kiếm & Bộ lọc Đa năng */}
          <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm'>
            <div className='flex flex-1 flex-wrap items-center gap-2 min-w-[280px]'>
              <div className='relative flex-1 min-w-[220px]'>
                <Search className='absolute left-2.5 top-2.5 size-4 text-muted-foreground' />
                <Input
                  placeholder={t('edu.doiSoat.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadOverview();
                  }}
                  className='h-9 pl-8 text-sm'
                />
              </div>

              {/* Lọc theo Cơ sở */}
              <select
                value={selectedCoSoId}
                onChange={(e) => handleCoSoChange(e.target.value)}
                className='h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
              >
                <option value='all'>
                  {t('edu.doiSoat.allBranches', { n: branchRows.length })}
                </option>
                {branchRows.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {text(b.ten)}
                  </option>
                ))}
              </select>

              {/* Lọc theo Lớp học */}
              <select
                value={selectedLopId}
                onChange={(e) => handleLopChange(e.target.value)}
                className='h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
              >
                <option value='all'>
                  {t('edu.doiSoat.allClasses', { n: availableClasses.length })}
                </option>
                {availableClasses.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {text(c.ten)}
                  </option>
                ))}
              </select>

              {/* Lọc theo Trạng thái đối soát */}
              <select
                value={filterStatus}
                onChange={(e) => handleFilterStatus(e.target.value)}
                className='h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
              >
                <option value='tat_ca'>{t('edu.doiSoat.filterAll')}</option>
                <option value='vuot_goi'>{t('edu.doiSoat.filterOver')}</option>
                <option value='sap_het'>{t('edu.doiSoat.filterLow')}</option>
                <option value='binh_thuong'>
                  {t('edu.doiSoat.filterSafe')}
                </option>
                <option value='no_hoc_phi'>
                  {t('edu.doiSoat.filterTuition')}
                </option>
                <option value='no_sach'>{t('edu.doiSoat.filterBook')}</option>
              </select>

              <Button
                size='sm'
                className='h-9 px-3 gap-1'
                onClick={() => loadOverview()}
              >
                <Search className='size-3.5' /> {t('edu.doiSoat.search')}
              </Button>

              {searchTerm ||
              selectedCoSoId !== 'all' ||
              selectedLopId !== 'all' ||
              filterStatus !== 'tat_ca' ? (
                <Button
                  size='sm'
                  variant='ghost'
                  className='h-9 px-2 text-xs text-muted-foreground hover:text-foreground gap-1'
                  onClick={handleResetFilters}
                >
                  <X className='size-3.5' /> {t('edu.doiSoat.reset')}
                </Button>
              ) : null}
            </div>
          </div>

          {/* Thống kê số lượng kết quả tìm kiếm */}
          {overviewData ? (
            <div className='flex items-center justify-between text-xs text-muted-foreground px-1 font-medium'>
              <span>
                {t('edu.doiSoat.foundPrefix')}{' '}
                <strong className='text-foreground'>
                  {overviewData.danhSach.length}
                </strong>{' '}
                {t('edu.doiSoat.foundSuffix')}
                {overviewData.danhSach.length !==
                overviewData.thongKe.tongHocVien
                  ? t('edu.doiSoat.foundOfTotal', {
                      n: overviewData.thongKe.tongHocVien,
                    })
                  : ''}
              </span>
            </div>
          ) : null}

          {/* Bảng Danh sách Học viên Đối soát */}
          <div className='overflow-x-auto rounded-lg border bg-card shadow-sm'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/50 text-xs font-semibold'>
                  <TableHead className='w-28'>
                    {t('edu.doiSoat.th.ma')}
                  </TableHead>
                  <TableHead>{t('edu.doiSoat.th.name')}</TableHead>
                  <TableHead>{t('edu.doiSoat.th.class')}</TableHead>
                  <TableHead>{t('edu.doiSoat.th.branch')}</TableHead>
                  <TableHead>{t('edu.doiSoat.th.parent')}</TableHead>
                  <TableHead className='text-center'>
                    {t('edu.doiSoat.th.paid')}
                  </TableHead>
                  <TableHead className='text-center'>
                    {t('edu.doiSoat.th.studied')}
                  </TableHead>
                  <TableHead className='text-center'>
                    {t('edu.doiSoat.th.remaining')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('edu.doiSoat.th.tuition')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('edu.doiSoat.th.books')}
                  </TableHead>
                  <TableHead className='text-center w-32'>
                    {t('edu.doiSoat.th.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className='text-xs'>
                {loadingOverview ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className='h-36 text-center text-muted-foreground'
                    >
                      <div className='flex flex-col items-center justify-center gap-2'>
                        <RefreshCw className='size-5 animate-spin text-primary' />
                        <span className='font-medium text-xs'>
                          {t('edu.doiSoat.loadingOverview')}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : overviewError ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className='h-36 text-center text-destructive'
                    >
                      <div className='flex flex-col items-center justify-center gap-2'>
                        <span className='font-medium text-xs'>
                          {overviewError}
                        </span>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => loadOverview()}
                        >
                          {t('edu.common.retry')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : overviewData?.danhSach.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className='h-32 text-center text-muted-foreground'
                    >
                      {t('edu.doiSoat.noResults')}
                    </TableCell>
                  </TableRow>
                ) : (
                  overviewData?.danhSach.map((row) => (
                    <TableRow
                      key={row.id}
                      className='hover:bg-muted/40 transition-colors'
                    >
                      <TableCell>
                        <RecordLink
                          to={`/hoc-vien/${row.id}`}
                          className='font-mono font-medium text-primary hover:underline'
                        >
                          {row.ma}
                        </RecordLink>
                      </TableCell>
                      <TableCell>
                        <RecordLink
                          to={`/hoc-vien/${row.id}`}
                          className='font-semibold text-foreground hover:underline hover:text-primary transition-colors text-sm'
                        >
                          {row.hoTen}
                        </RecordLink>
                      </TableCell>
                      <TableCell>
                        {row.lopId ? (
                          <RecordLink
                            to={`/lop/${row.lopId}`}
                            className='text-primary hover:underline font-medium'
                          >
                            {row.lopTen}
                          </RecordLink>
                        ) : (
                          <span className='text-muted-foreground'>—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className='text-muted-foreground'>
                          {row.coSoTen || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {row.phuHuynhTen ? (
                          <div>
                            <span className='font-medium text-foreground'>
                              {row.phuHuynhTen}
                            </span>
                            {row.phuHuynhSdt ? (
                              <span className='block text-[11px] text-muted-foreground font-mono'>
                                {row.phuHuynhSdt}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className='text-muted-foreground'>—</span>
                        )}
                      </TableCell>
                      <TableCell className='text-center font-bold text-foreground'>
                        {row.tongSoBuoiDaMua}
                      </TableCell>
                      <TableCell className='text-center font-medium text-foreground'>
                        {row.tongSoBuoiDaHoc}
                      </TableCell>
                      <TableCell className='text-center'>
                        {row.soBuoiConLai < 0 ? (
                          <StatusBadge
                            tone='neutral'
                            className='border-destructive/30 bg-destructive/10 text-destructive font-bold'
                          >
                            {t('edu.doiSoat.overN', {
                              n: Math.abs(row.soBuoiConLai),
                            })}
                          </StatusBadge>
                        ) : row.soBuoiConLai === 0 ? (
                          <StatusBadge tone='warning' className='font-semibold'>
                            {t('edu.doiSoat.zeroLeft')}
                          </StatusBadge>
                        ) : row.soBuoiConLai <= 2 ? (
                          <StatusBadge tone='warning' className='font-semibold'>
                            {t('edu.doiSoat.leftN', { n: row.soBuoiConLai })}
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone='success' className='font-semibold'>
                            {t('edu.doiSoat.leftN', { n: row.soBuoiConLai })}
                          </StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className='text-right'>
                        <span className='font-medium'>
                          {money(row.tongDaThanhToan)}
                        </span>
                        {row.tongConNoHocPhi > 0 ? (
                          <span className='block text-[11px] text-destructive font-medium'>
                            {t('edu.doiSoat.debt', {
                              v: fmt(row.tongConNoHocPhi),
                            })}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className='text-right'>
                        <span className='font-medium'>
                          {money(row.tongTienSachDaPhat)}
                        </span>
                        {row.tienSachTon < 0 ? (
                          <span className='block text-[11px] text-destructive font-medium'>
                            {t('edu.doiSoat.bookDebt', {
                              v: fmt(Math.abs(row.tienSachTon)),
                            })}
                          </span>
                        ) : row.tienSachTon > 0 ? (
                          <span className='block text-[11px] text-(--status-success) font-medium'>
                            {t('edu.doiSoat.bookSurplus', {
                              v: fmt(row.tienSachTon),
                            })}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className='text-center'>
                        <Button
                          size='sm'
                          className='h-8 px-2.5 bg-primary/90 hover:bg-primary font-medium text-xs gap-1 shadow-sm'
                          onClick={() =>
                            setSearchParams({ hocVienId: String(row.id) })
                          }
                        >
                          <Layers className='size-3.5' />
                          {t('edu.doiSoat.audit')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        /* =========================================================================
            CHẾ ĐỘ 2: KHÔNG GIAN ĐỐI SOÁT CHI TIẾT HỌC VIÊN (STUDENT WORKSPACE)
           ========================================================================= */
        <div className='flex flex-col gap-6 py-4'>
          {/* Thanh điều hướng quay lại & Nút tác vụ */}
          <div className='flex flex-wrap items-center justify-between gap-3 border-b pb-4'>
            <div className='flex items-center gap-3'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setSearchParams({})}
                className='gap-1.5'
              >
                <ArrowLeft className='size-4' />
                {t('edu.doiSoat.back')}
              </Button>
              {studentDetail ? (
                <div>
                  <h2 className='text-xl font-bold tracking-tight text-foreground flex items-center gap-2'>
                    {studentDetail.hocVien.hoTen}
                    <span className='font-mono text-sm font-normal text-muted-foreground'>
                      ({studentDetail.hocVien.ma})
                    </span>
                    <RecordLink
                      to={`/hoc-vien/${studentDetail.hocVien.id}`}
                      className='inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline ml-2'
                    >
                      <ExternalLink className='size-3.5' />
                      {t('edu.doiSoat.profile360')}
                    </RecordLink>
                  </h2>
                  <p className='text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 mt-0.5'>
                    {studentDetail.hocVien.lopId ? (
                      <RecordLink
                        to={`/lop/${studentDetail.hocVien.lopId}`}
                        className='text-primary hover:underline font-medium'
                      >
                        {t('edu.doiSoat.classLine', {
                          ten: studentDetail.hocVien.lopTen,
                        })}
                      </RecordLink>
                    ) : (
                      <span>{t('edu.hocVien.noClass')}</span>
                    )}
                    {studentDetail.hocVien.coSoTen ? (
                      <span>
                        {t('edu.doiSoat.branchLine', {
                          ten: studentDetail.hocVien.coSoTen,
                        })}
                      </span>
                    ) : null}
                    {studentDetail.hocVien.phuHuynh ? (
                      <span>
                        {t('edu.doiSoat.parentLead')}{' '}
                        <span className='font-medium text-foreground'>
                          {studentDetail.hocVien.phuHuynh.hoTen}
                        </span>{' '}
                        ({studentDetail.hocVien.phuHuynh.soDienThoai})
                      </span>
                    ) : null}
                  </p>
                </div>
              ) : null}
            </div>

            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void exportStudentCsv()}
                disabled={!studentDetail || !canExport}
                className='gap-1.5'
              >
                <Download className='size-4' />
                {t('edu.doiSoat.exportCsvShort')}
              </Button>
              <Button
                size='sm'
                onClick={() => window.print()}
                disabled={!studentDetail}
                className='gap-1.5 bg-primary font-medium'
              >
                <Printer className='size-4' />
                {t('edu.doiSoat.printBtn')}
              </Button>
            </div>
          </div>

          {exportError ? (
            <p role='alert' className='text-sm text-destructive'>
              {exportError}
            </p>
          ) : null}

          {detailError ? (
            <div
              role='alert'
              className='flex h-64 flex-col items-center justify-center gap-1 text-sm text-destructive'
            >
              <span className='font-medium'>
                {t('edu.doiSoat.detailError')}
              </span>
              <span className='text-xs text-muted-foreground'>
                {detailError}
              </span>
            </div>
          ) : loadingDetail || !studentDetail ? (
            <div className='flex h-64 items-center justify-center text-sm text-muted-foreground'>
              <RefreshCw className='size-6 animate-spin mr-2 text-primary' />{' '}
              {t('edu.doiSoat.loadingDetail')}
            </div>
          ) : (
            <div className='flex flex-col gap-6'>
              {/* Thẻ KPI Tóm tắt Của Học Viên */}
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                <div className='rounded-xl border bg-card p-4 shadow-sm'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    {t('edu.doiSoat.kpiD.paidSessions')}
                  </p>
                  <p className='mt-1 text-2xl font-bold text-primary'>
                    {t('edu.doiSoat.sessionsN', {
                      n: studentDetail.tongHop.tongSoBuoiDaMua,
                    })}
                  </p>
                  <span className='text-[11px] text-muted-foreground'>
                    {t('edu.doiSoat.termsCount', {
                      n: studentDetail.cacKyNop.length,
                    })}
                  </span>
                </div>

                <div className='rounded-xl border bg-card p-4 shadow-sm'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    {t('edu.doiSoat.kpiD.studied')}
                  </p>
                  <p className='mt-1 text-2xl font-bold text-foreground'>
                    {t('edu.doiSoat.sessionsN', {
                      n: studentDetail.tongHop.tongSoBuoiDaHoc,
                    })}
                  </p>
                  <span className='text-[11px] text-muted-foreground'>
                    {t('edu.doiSoat.kpiD.recorded')}
                  </span>
                </div>

                <div className='rounded-xl border bg-card p-4 shadow-sm'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    {t('edu.doiSoat.th.remaining')}
                  </p>
                  <p
                    className={`mt-1 text-2xl font-bold ${studentDetail.tongHop.soBuoiConLai < 0 ? 'text-destructive' : 'text-(--status-success)'}`}
                  >
                    {studentDetail.tongHop.soBuoiConLai < 0
                      ? t('edu.doiSoat.overN', {
                          n: studentDetail.tongHop.soBuoiVuotGoi,
                        })
                      : t('edu.doiSoat.leftN', {
                          n: studentDetail.tongHop.soBuoiConLai,
                        })}
                  </p>
                  <span className='text-[11px] text-muted-foreground'>
                    {studentDetail.tongHop.soBuoiConLai < 0
                      ? t('edu.doiSoat.kpiD.noNewTerm')
                      : t('edu.doiSoat.kpiD.balance')}
                  </span>
                </div>

                <div className='rounded-xl border bg-card p-4 shadow-sm'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    {t('edu.doiSoat.kpiD.feesBooks')}
                  </p>
                  <p className='mt-1 text-sm font-semibold'>
                    {t('edu.doiSoat.feeLine', {
                      v: fmt(studentDetail.tongHop.tongDaThanhToan),
                    })}
                    {studentDetail.tongHop.tongConNo > 0 ? (
                      <span className='text-destructive ml-1.5'>
                        {t('edu.doiSoat.debtParen', {
                          v: fmt(studentDetail.tongHop.tongConNo),
                        })}
                      </span>
                    ) : null}
                  </p>
                  <p className='text-xs text-muted-foreground mt-0.5'>
                    {t('edu.doiSoat.booksReceived', {
                      v: fmt(studentDetail.tongHop.tongTienSachDaPhat),
                    })}
                    {studentDetail.tongHop.tienSachTon < 0 ? (
                      <span className='text-destructive font-semibold ml-1.5'>
                        {t('edu.doiSoat.debtParen', {
                          v: fmt(Math.abs(studentDetail.tongHop.tienSachTon)),
                        })}
                      </span>
                    ) : studentDetail.tongHop.tienSachTon > 0 ? (
                      <span className='text-(--status-success) font-semibold ml-1.5'>
                        {t('edu.doiSoat.stockParen', {
                          v: fmt(studentDetail.tongHop.tienSachTon),
                        })}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>

              {/* Hệ thống 4 Tabs Chuyên Sâu */}
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className='w-full'
              >
                <TabsList className='grid w-full grid-cols-4 max-w-2xl bg-muted/70 p-1'>
                  <TabsTrigger
                    value='overview'
                    className='gap-1.5 text-xs font-medium'
                  >
                    <Layers className='size-3.5' />{' '}
                    {t('edu.doiSoat.tab.overview')}
                  </TabsTrigger>
                  <TabsTrigger
                    value='sessions'
                    className='gap-1.5 text-xs font-medium'
                  >
                    <CalendarCheck className='size-3.5' />{' '}
                    {t('edu.doiSoat.tab.sessions', {
                      n: studentDetail.danhSachBuoiHoc.length,
                    })}
                  </TabsTrigger>
                  <TabsTrigger
                    value='tuition'
                    className='gap-1.5 text-xs font-medium'
                  >
                    <Wallet className='size-3.5' />{' '}
                    {t('edu.doiSoat.tab.tuition', {
                      n: studentDetail.cacKyNop.length,
                    })}
                  </TabsTrigger>
                  <TabsTrigger
                    value='books'
                    className='gap-1.5 text-xs font-medium'
                  >
                    <BookOpen className='size-3.5' />{' '}
                    {t('edu.doiSoat.tab.books', {
                      n: studentDetail.sachDaPhat.length,
                    })}
                  </TabsTrigger>
                </TabsList>

                {/* TAB 1: TỔNG QUAN TIẾN ĐỘ TỪNG KỲ HỌC */}
                <TabsContent
                  value='overview'
                  className='mt-4 flex flex-col gap-6'
                >
                  <div>
                    <h3 className='text-base font-bold text-foreground mb-3 flex items-center gap-2'>
                      <span>{t('edu.doiSoat.milestones')}</span>
                    </h3>
                    {studentDetail.cacKyNop.length === 0 ? (
                      <div className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                        {t('edu.doiSoat.noPackagesYet')}
                      </div>
                    ) : (
                      <div className='flex flex-col gap-3'>
                        {studentDetail.cacKyNop.map((ky) => (
                          <div
                            key={ky.id}
                            className='rounded-xl border bg-card p-4 shadow-sm flex flex-col gap-3'
                          >
                            <div className='flex flex-wrap items-center justify-between gap-2'>
                              <div className='flex items-center gap-2'>
                                <span className='font-bold text-base text-foreground'>
                                  {ky.tenKy}
                                </span>
                                <span className='text-xs text-muted-foreground font-mono'>
                                  {t('edu.doiSoat.paidOnLine', {
                                    v:
                                      ky.ngayMua || t('edu.doiSoat.notUpdated'),
                                  })}
                                </span>
                              </div>
                              <div className='flex items-center gap-2'>
                                <span className='text-xs font-medium text-foreground'>
                                  {t('edu.doiSoat.studiedLabel')}{' '}
                                  <strong>{ky.daDung}</strong> /{' '}
                                  {t('edu.doiSoat.sessionsN', { n: ky.soBuoi })}
                                </span>
                                <StatusBadge
                                  tone={
                                    ky.tienDo === 100
                                      ? 'success'
                                      : ky.tienDo > 0
                                        ? 'warning'
                                        : 'neutral'
                                  }
                                >
                                  {ky.tienDo === 100
                                    ? t('edu.doiSoat.termDone')
                                    : ky.tienDo > 0
                                      ? t('edu.doiSoat.termInProgress', {
                                          n: ky.tienDo,
                                        })
                                      : t('edu.doiSoat.termNotStarted')}
                                </StatusBadge>
                              </div>
                            </div>

                            {/* Thanh tiến độ (Progress bar) */}
                            <div className='w-full bg-muted rounded-full h-2.5 overflow-hidden'>
                              <div
                                className={`h-2.5 rounded-full transition-all ${ky.tienDo === 100 ? 'bg-(--status-success)' : 'bg-primary'}`}
                                style={{
                                  width: `${Math.min(100, ky.tienDo)}%`,
                                }}
                              />
                            </div>

                            <div className='flex flex-wrap items-center justify-between text-xs text-muted-foreground pt-1 border-t'>
                              <span>
                                {t('edu.doiSoat.packageFee')}{' '}
                                <strong>{money(ky.thanhTien)}</strong>{' '}
                                {t('edu.doiSoat.perSession', {
                                  v: fmt(ky.donGia),
                                })}
                              </span>
                              <span>
                                {t('edu.doiSoat.paidLabel')}{' '}
                                <strong className='text-(--status-success)'>
                                  {money(ky.daThanhToan)}
                                </strong>
                              </span>
                              <span>
                                {t('edu.doiSoat.owedLabel')}{' '}
                                <strong
                                  className={
                                    ky.conNo > 0
                                      ? 'text-destructive'
                                      : 'text-foreground'
                                  }
                                >
                                  {money(ky.conNo)}
                                </strong>
                              </span>
                              <span>
                                {t('edu.doiSoat.termLeftLabel')}{' '}
                                <strong className='text-primary'>
                                  {t('edu.doiSoat.sessionsN', { n: ky.conLai })}
                                </strong>
                              </span>
                            </div>
                          </div>
                        ))}

                        {/* Cảnh báo vượt gói nếu có */}
                        {studentDetail.tongHop.soBuoiConLai < 0 ? (
                          <div className='rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive flex items-center justify-between gap-4'>
                            <div className='flex items-center gap-3'>
                              <AlertTriangle className='size-6 shrink-0' />
                              <div>
                                <p className='font-bold text-base'>
                                  {t('edu.doiSoat.overWarning', {
                                    n: studentDetail.tongHop.soBuoiVuotGoi,
                                  })}
                                </p>
                                <p className='text-xs opacity-90'>
                                  {t('edu.doiSoat.overWarningHint')}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* TAB 2: LỊCH SỬ BUỔI HỌC & SỬA NHANH (QUICK EDIT) */}
                <TabsContent
                  value='sessions'
                  className='mt-4 flex flex-col gap-4'
                >
                  {/* Bộ lọc buổi học */}
                  <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm'>
                    <div className='flex flex-wrap items-center gap-3'>
                      <div className='flex items-center gap-1.5'>
                        <span className='text-xs text-muted-foreground'>
                          {t('edu.doiSoat.termFilter')}
                        </span>
                        <select
                          value={sessionKyFilter}
                          onChange={(e) => setSessionKyFilter(e.target.value)}
                          className='h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
                        >
                          <option value='all'>
                            {t('edu.doiSoat.allTerms')}
                          </option>
                          {studentDetail.cacKyNop.map((ky) => (
                            <option key={ky.id} value={String(ky.id)}>
                              {ky.tenKy}
                            </option>
                          ))}
                          <option value='ngoai_goi'>
                            {t('edu.doiSoat.ngoaiGoi')}
                          </option>
                        </select>
                      </div>

                      <div className='flex items-center gap-1.5'>
                        <span className='text-xs text-muted-foreground'>
                          {t('edu.doiSoat.statusFilter')}
                        </span>
                        <select
                          value={sessionStatusFilter}
                          onChange={(e) =>
                            setSessionStatusFilter(e.target.value)
                          }
                          className='h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
                        >
                          <option value='all'>
                            {t('edu.doiSoat.filterAll')}
                          </option>
                          <option value='co_mat'>
                            {t('edu.diemDanh.s.co_mat')}
                          </option>
                          <option value='hoc_bu'>
                            {t('edu.diemDanh.s.hoc_bu')}
                          </option>
                          <option value='vang_co_phep'>
                            {t('edu.diemDanh.s.vang_co_phep')}
                          </option>
                          <option value='vang_khong_phep'>
                            {t('edu.diemDanh.s.vang_khong_phep')}
                          </option>
                        </select>
                      </div>

                      <div className='flex items-center gap-1.5 min-w-[200px]'>
                        <Search className='size-3.5 text-muted-foreground' />
                        <Input
                          placeholder={t('edu.doiSoat.commentSearch')}
                          value={sessionSearchComment}
                          onChange={(e) =>
                            setSessionSearchComment(e.target.value)
                          }
                          className='h-8 text-xs'
                        />
                      </div>

                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() =>
                          setSessionSortOrder(
                            sessionSortOrder === 'desc' ? 'asc' : 'desc',
                          )
                        }
                        className='h-8 text-xs gap-1'
                      >
                        {sessionSortOrder === 'desc'
                          ? t('edu.doiSoat.sortNewest')
                          : t('edu.doiSoat.sortOldest')}
                      </Button>
                    </div>

                    <span className='text-xs text-muted-foreground'>
                      {t('edu.doiSoat.showing')}{' '}
                      <strong>{filteredSessions.length}</strong> /{' '}
                      {t('edu.doiSoat.sessionsOfTotal', {
                        n: studentDetail.danhSachBuoiHoc.length,
                      })}
                    </span>
                  </div>

                  {/* Bảng Buổi Học Full Width (Chống đè chữ triệt để) */}
                  <div className='overflow-x-auto rounded-lg border bg-card shadow-sm'>
                    <Table className='min-w-[1100px]'>
                      <TableHeader className='bg-muted/60 sticky top-0 z-10'>
                        <TableRow className='text-xs font-semibold'>
                          <TableHead className='w-12 text-center'>
                            {t('edu.doiSoat.th.stt')}
                          </TableHead>
                          <TableHead className='w-32'>
                            {t('edu.doiSoat.th.dateTime')}
                          </TableHead>
                          <TableHead className='w-20'>
                            {t('edu.doiSoat.th.lop')}
                          </TableHead>
                          <TableHead className='w-32 text-center'>
                            {t('edu.doiSoat.th.status')}
                          </TableHead>
                          <TableHead className='w-14 text-center'>
                            {t('edu.doiSoat.th.hw')}
                          </TableHead>
                          <TableHead className='w-14 text-center'>
                            {t('edu.doiSoat.th.awareness')}
                          </TableHead>
                          <TableHead className='min-w-[280px] max-w-[420px]'>
                            {t('edu.doiSoat.th.teacherComment')}
                          </TableHead>
                          <TableHead className='w-52 min-w-[200px]'>
                            {t('edu.doiSoat.th.term')}
                          </TableHead>
                          <TableHead className='w-20 text-center'>
                            {t('edu.doiSoat.th.deducted')}
                          </TableHead>
                          <TableHead className='w-16 text-center'>
                            {t('edu.doiSoat.th.edit')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className='text-xs'>
                        {filteredSessions.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={10}
                              className='h-28 text-center text-muted-foreground'
                            >
                              {t('edu.doiSoat.noFilteredSessions')}
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredSessions.map((buoi) => (
                            <TableRow
                              key={buoi.diemDanhId}
                              className='hover:bg-muted/40 transition-colors'
                            >
                              <TableCell className='text-center font-mono text-muted-foreground'>
                                {buoi.stt}
                              </TableCell>
                              <TableCell className='font-medium whitespace-nowrap'>
                                {buoi.ngay}{' '}
                                <span className='text-muted-foreground'>
                                  ({buoi.gioBatDau?.slice(0, 5)})
                                </span>
                              </TableCell>
                              <TableCell className='font-medium'>
                                {buoi.lopTen}
                              </TableCell>
                              <TableCell className='text-center'>
                                <StatusBadge
                                  tone={
                                    buoi.trangThai === 'co_mat' ||
                                    buoi.trangThai === 'hoc_bu'
                                      ? 'success'
                                      : buoi.trangThai === 'vang_co_phep'
                                        ? 'warning'
                                        : 'neutral'
                                  }
                                  className={
                                    buoi.trangThai === 'vang_khong_phep'
                                      ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                      : undefined
                                  }
                                >
                                  {buoi.trangThai === 'co_mat'
                                    ? t('edu.diemDanh.s.co_mat')
                                    : buoi.trangThai === 'hoc_bu'
                                      ? t('edu.diemDanh.s.hoc_bu')
                                      : buoi.trangThai === 'vang_co_phep'
                                        ? t('edu.diemDanh.s.vang_co_phep')
                                        : t('edu.diemDanh.s.vang_khong_phep')}
                                </StatusBadge>
                              </TableCell>
                              <TableCell className='text-center'>
                                {buoi.daLamBtvn
                                  ? t('edu.doiSoat.hwDone')
                                  : t('edu.doiSoat.hwNotDone')}
                              </TableCell>
                              <TableCell className='text-center font-bold'>
                                {buoi.yThucDiem != null
                                  ? `${buoi.yThucDiem}/10`
                                  : '—'}
                              </TableCell>
                              <TableCell className='min-w-[280px] max-w-[420px] break-words whitespace-normal leading-relaxed text-foreground'>
                                {buoi.nhanXet ? (
                                  <span>{buoi.nhanXet}</span>
                                ) : (
                                  <span className='text-muted-foreground italic'>
                                    {t('edu.doiSoat.noComment')}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className='w-52 min-w-[200px]'>
                                {buoi.ngoaiGoi ? (
                                  <div className='inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-destructive/10 text-destructive border border-destructive/20 whitespace-normal leading-tight'>
                                    {buoi.kyTen}
                                  </div>
                                ) : (
                                  <div className='inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-muted text-foreground border border-border whitespace-normal leading-tight'>
                                    {buoi.kyTen}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className='text-center font-bold text-destructive'>
                                {buoi.soBuoiDaTru > 0
                                  ? `-${buoi.soBuoiDaTru}`
                                  : '0'}
                              </TableCell>
                              <TableCell className='text-center'>
                                {studentDetail.quyen.suaBuoi ? (
                                  <Button
                                    variant='ghost'
                                    size='sm'
                                    aria-label={t('edu.doiSoat.editSession')}
                                    className='h-7 w-7 p-0 hover:bg-primary/10 hover:text-primary'
                                    onClick={() => {
                                      setEditError(null);
                                      setEditSession({
                                        diemDanhId: buoi.diemDanhId,
                                        ngay: buoi.ngay,
                                        lopTen: buoi.lopTen,
                                        trangThai: buoi.trangThai,
                                        daLamBtvn: buoi.daLamBtvn,
                                        yThucDiem: buoi.yThucDiem ?? '',
                                        nhanXet: buoi.nhanXet || '',
                                      });
                                    }}
                                  >
                                    <Edit3 className='size-3.5' />
                                  </Button>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* TAB 3: KỲ NỘP HỌC PHÍ */}
                <TabsContent
                  value='tuition'
                  className='mt-4 flex flex-col gap-4'
                >
                  <div className='overflow-x-auto rounded-lg border bg-card shadow-sm'>
                    <Table>
                      <TableHeader className='bg-muted/60'>
                        <TableRow className='text-xs font-semibold'>
                          <TableHead>{t('edu.doiSoat.th.pkg')}</TableHead>
                          <TableHead>{t('edu.doiSoat.th.paidOn')}</TableHead>
                          <TableHead className='text-center'>
                            {t('edu.doiSoat.th.sessions')}
                          </TableHead>
                          <TableHead className='text-right'>
                            {t('edu.doiSoat.th.unitPrice')}
                          </TableHead>
                          <TableHead className='text-right'>
                            {t('edu.doiSoat.th.total')}
                          </TableHead>
                          <TableHead className='text-right'>
                            {t('edu.doiSoat.th.paid')}
                          </TableHead>
                          <TableHead className='text-right'>
                            {t('edu.doiSoat.th.owed')}
                          </TableHead>
                          <TableHead className='text-center'>
                            {t('edu.doiSoat.th.status')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className='text-xs'>
                        {studentDetail.cacKyNop.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className='h-24 text-center text-muted-foreground'
                            >
                              {t('edu.doiSoat.noPackages')}
                            </TableCell>
                          </TableRow>
                        ) : (
                          studentDetail.cacKyNop.map((ky) => (
                            <TableRow key={ky.id}>
                              <TableCell className='font-bold text-foreground'>
                                {ky.tenKy}
                              </TableCell>
                              <TableCell>{ky.ngayMua || '—'}</TableCell>
                              <TableCell className='text-center font-bold'>
                                {ky.soBuoi}
                              </TableCell>
                              <TableCell className='text-right'>
                                {money(ky.donGia)}
                              </TableCell>
                              <TableCell className='text-right font-semibold'>
                                {money(ky.thanhTien)}
                              </TableCell>
                              <TableCell className='text-right text-(--status-success) font-bold'>
                                {money(ky.daThanhToan)}
                              </TableCell>
                              <TableCell
                                className={`text-right font-bold ${ky.conNo > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                              >
                                {money(ky.conNo > 0 ? ky.conNo : 0)}
                              </TableCell>
                              <TableCell className='text-center'>
                                <StatusBadge
                                  tone={
                                    ky.conNo === 0
                                      ? 'success'
                                      : ky.daThanhToan > 0
                                        ? 'warning'
                                        : 'neutral'
                                  }
                                >
                                  {ky.conNo === 0
                                    ? t('edu.doiSoat.payFull')
                                    : ky.daThanhToan > 0
                                      ? t('edu.doiSoat.payPartial')
                                      : t('edu.doiSoat.payNone')}
                                </StatusBadge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* TAB 4: SÁCH & GIÁO TRÌNH */}
                <TabsContent value='books' className='mt-4 flex flex-col gap-4'>
                  <div className='overflow-x-auto rounded-lg border bg-card shadow-sm'>
                    <Table>
                      <TableHeader className='bg-muted/60'>
                        <TableRow className='text-xs font-semibold'>
                          <TableHead>{t('edu.doiSoat.th.bookName')}</TableHead>
                          <TableHead>{t('edu.doiSoat.th.givenOn')}</TableHead>
                          <TableHead className='text-center'>
                            {t('edu.doiSoat.th.qty')}
                          </TableHead>
                          <TableHead className='text-right'>
                            {t('edu.doiSoat.th.cover')}
                          </TableHead>
                          <TableHead className='text-right'>
                            {t('edu.doiSoat.th.discount')}
                          </TableHead>
                          <TableHead className='text-right'>
                            {t('edu.doiSoat.th.total')}
                          </TableHead>
                          <TableHead>{t('edu.doiSoat.th.note')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className='text-xs'>
                        {studentDetail.sachDaPhat.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className='h-24 text-center text-muted-foreground'
                            >
                              {t('edu.doiSoat.noBooks')}
                            </TableCell>
                          </TableRow>
                        ) : (
                          studentDetail.sachDaPhat.map((sach) => (
                            <TableRow key={sach.id}>
                              <TableCell className='font-bold text-foreground'>
                                {sach.tenSach}
                              </TableCell>
                              <TableCell>{sach.ngayPhat || '—'}</TableCell>
                              <TableCell className='text-center'>
                                {sach.soLuong}
                              </TableCell>
                              <TableCell className='text-right'>
                                {money(sach.giaBia)}
                              </TableCell>
                              <TableCell className='text-right text-(--status-success)'>
                                {money(sach.uuDai)}
                              </TableCell>
                              <TableCell className='text-right font-bold'>
                                {money(sach.thanhTien)}
                              </TableCell>
                              <TableCell className='text-muted-foreground'>
                                {sach.ghiChu || '—'}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* =========================================================================
              MODAL SỬA NHANH BUỔI HỌC (QUICK EDIT DIALOG)
             ========================================================================= */}
          {editSession ? (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open) setEditSession(null);
              }}
            >
              <DialogContent className='max-w-lg'>
                <DialogHeader>
                  <DialogTitle className='text-lg font-bold flex items-center gap-2'>
                    <Edit3 className='size-5 text-primary' />{' '}
                    {t('edu.doiSoat.editTitle')}
                  </DialogTitle>
                  <DialogDescription>
                    {t('edu.doiSoat.sessionDateLabel')}{' '}
                    <strong>{editSession.ngay}</strong> ·{' '}
                    {t('edu.doiSoat.classColon')}{' '}
                    <strong>{editSession.lopTen}</strong>
                  </DialogDescription>
                </DialogHeader>

                <div className='flex flex-col gap-4 py-3 text-sm'>
                  <div className='flex flex-col gap-1.5'>
                    <label className='font-semibold text-xs text-foreground'>
                      {t('edu.doiSoat.attendanceStatus')}
                    </label>
                    <select
                      value={editSession.trangThai}
                      onChange={(e) =>
                        setEditSession({
                          ...editSession,
                          trangThai: e.target.value,
                        })
                      }
                      className='h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
                    >
                      <option value='co_mat'>
                        {t('edu.diemDanh.s.co_mat')}
                      </option>
                      <option value='hoc_bu'>
                        {t('edu.diemDanh.s.hoc_bu')}
                      </option>
                      <option value='vang_co_phep'>
                        {t('edu.diemDanh.s.vang_co_phep')}
                      </option>
                      <option value='vang_khong_phep'>
                        {t('edu.diemDanh.s.vang_khong_phep')}
                      </option>
                    </select>
                    <p className='text-xs text-muted-foreground'>
                      {t('edu.doiSoat.deductHint')}
                    </p>
                  </div>

                  <div className='flex items-center gap-2 pt-1'>
                    <input
                      type='checkbox'
                      id='edit-btvn'
                      checked={editSession.daLamBtvn}
                      onChange={(e) =>
                        setEditSession({
                          ...editSession,
                          daLamBtvn: e.target.checked,
                        })
                      }
                      className='size-4 rounded border-input'
                    />
                    <label
                      htmlFor='edit-btvn'
                      className='text-sm font-medium cursor-pointer'
                    >
                      {t('edu.doiSoat.hwChecked')}
                    </label>
                  </div>

                  <div className='flex flex-col gap-1.5'>
                    <label className='font-semibold text-xs text-foreground'>
                      {t('edu.doiSoat.awarenessScore')}
                    </label>
                    <Input
                      type='number'
                      min={0}
                      max={10}
                      placeholder={t('edu.doiSoat.awarenessPlaceholder')}
                      value={editSession.yThucDiem}
                      onChange={(e) =>
                        setEditSession({
                          ...editSession,
                          yThucDiem:
                            e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                      className='h-9 text-sm'
                    />
                  </div>

                  <div className='flex flex-col gap-1.5'>
                    <label className='font-semibold text-xs text-foreground'>
                      {t('edu.doiSoat.th.teacherCommentLong')}
                    </label>
                    <textarea
                      rows={3}
                      placeholder={t('edu.doiSoat.commentPlaceholder')}
                      value={editSession.nhanXet}
                      onChange={(e) =>
                        setEditSession({
                          ...editSession,
                          nhanXet: e.target.value,
                        })
                      }
                      className='w-full rounded-md border border-input bg-background p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
                    />
                  </div>
                </div>

                {editError ? (
                  <p role='alert' className='text-sm text-destructive'>
                    {editError}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button
                    variant='outline'
                    onClick={() => setEditSession(null)}
                  >
                    {t('edu.common.cancel')}
                  </Button>
                  <Button
                    onClick={() => void handleSaveEditSession()}
                    disabled={savingEdit}
                    className='bg-primary font-medium'
                  >
                    {savingEdit ? t('edu.common.saving') : t('edu.common.save')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}

          {/* =========================================================================
              MẪU IN PHIẾU ĐỐI SOÁT CHUẨN KHỔ A4 (DÀNH CHO @MEDIA PRINT)
             ========================================================================= */}
          {studentDetail ? (
            <div
              data-print-area=''
              className='hidden print:block font-serif text-black p-6'
            >
              <div className='text-center border-b-2 border-black pb-4 mb-4'>
                <img
                  src={resolveAssetUrl('/assets/duong-sinh-logo.png')}
                  alt=''
                  className='mx-auto mb-2 h-20 w-auto'
                />
                <h1 className='text-2xl font-bold uppercase tracking-wider'>
                  {t('edu.doiSoat.printout.club')}
                </h1>
                <p className='text-xs italic'>
                  {t('edu.doiSoat.printout.tagline')}
                </p>
                <h2 className='text-xl font-bold uppercase mt-3'>
                  {t('edu.doiSoat.printout.title')}
                </h2>
              </div>

              <div className='grid grid-cols-2 gap-4 text-xs mb-4'>
                <div>
                  <p>
                    {t('edu.doiSoat.printout.student')}{' '}
                    <strong>{studentDetail.hocVien.hoTen}</strong>{' '}
                    {t('edu.doiSoat.printout.code', {
                      ma: studentDetail.hocVien.ma,
                    })}
                  </p>
                  <p>
                    {t('edu.doiSoat.printout.class')}{' '}
                    <strong>{studentDetail.hocVien.lopTen || '—'}</strong>{' '}
                    {t('edu.doiSoat.printout.branch')}{' '}
                    <strong>{studentDetail.hocVien.coSoTen || '—'}</strong>
                  </p>
                </div>
                <div>
                  <p>
                    {t('edu.doiSoat.printout.parent')}{' '}
                    <strong>
                      {studentDetail.hocVien.phuHuynh?.hoTen || '—'}
                    </strong>
                  </p>
                  <p>
                    {t('edu.doiSoat.printout.phone')}{' '}
                    <strong>
                      {studentDetail.hocVien.phuHuynh?.soDienThoai || '—'}
                    </strong>
                  </p>
                </div>
              </div>

              <div className='border border-black p-3 mb-4 text-xs'>
                <h3 className='font-bold uppercase mb-2'>
                  {t('edu.doiSoat.printout.summary')}
                </h3>
                <div className='grid grid-cols-3 gap-2'>
                  <p>
                    {t('edu.doiSoat.printout.sessionsPaid')}{' '}
                    <strong>
                      {t('edu.doiSoat.sessionsN', {
                        n: studentDetail.tongHop.tongSoBuoiDaMua,
                      })}
                    </strong>
                  </p>
                  <p>
                    {t('edu.doiSoat.printout.sessionsStudied')}{' '}
                    <strong>
                      {t('edu.doiSoat.sessionsN', {
                        n: studentDetail.tongHop.tongSoBuoiDaHoc,
                      })}
                    </strong>
                  </p>
                  <p>
                    {t('edu.doiSoat.printout.sessionsLeft')}{' '}
                    <strong>
                      {t('edu.doiSoat.sessionsN', {
                        n: studentDetail.tongHop.soBuoiConLai,
                      })}
                    </strong>
                  </p>
                  <p>
                    {t('edu.doiSoat.printout.feePaid')}{' '}
                    <strong>
                      {money(studentDetail.tongHop.tongDaThanhToan)}
                    </strong>
                  </p>
                  <p>
                    {t('edu.doiSoat.printout.feeOwed')}{' '}
                    <strong>{money(studentDetail.tongHop.tongConNo)}</strong>
                  </p>
                  <p>
                    {t('edu.doiSoat.printout.bookFund')}{' '}
                    <strong>{money(studentDetail.tongHop.tienSachTon)}</strong>
                  </p>
                </div>
              </div>

              <h3 className='font-bold uppercase text-xs mb-2'>
                {t('edu.doiSoat.printout.detailTitle')}
              </h3>
              <table className='w-full border-collapse border border-black text-[11px] mb-8'>
                <thead>
                  <tr className='bg-muted'>
                    <th className='border border-black p-1 text-center w-8'>
                      {t('edu.doiSoat.th.stt')}
                    </th>
                    <th className='border border-black p-1 text-left'>
                      {t('edu.doiSoat.th.dateTime')}
                    </th>
                    <th className='border border-black p-1 text-left'>
                      {t('edu.doiSoat.th.lop')}
                    </th>
                    <th className='border border-black p-1 text-center'>
                      {t('edu.doiSoat.th.status')}
                    </th>
                    <th className='border border-black p-1 text-center'>
                      {t('edu.doiSoat.th.awareness')}
                    </th>
                    <th className='border border-black p-1 text-left'>
                      {t('edu.doiSoat.th.teacherCommentLong')}
                    </th>
                    <th className='border border-black p-1 text-center'>
                      {t('edu.doiSoat.th.deducted')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentDetail.danhSachBuoiHoc.map((b, idx) => (
                    <tr key={b.diemDanhId}>
                      <td className='border border-black p-1 text-center'>
                        {idx + 1}
                      </td>
                      <td className='border border-black p-1'>
                        {b.ngay} ({b.gioBatDau?.slice(0, 5)})
                      </td>
                      <td className='border border-black p-1'>{b.lopTen}</td>
                      <td className='border border-black p-1 text-center'>
                        {b.trangThai === 'co_mat'
                          ? t('edu.diemDanh.s.co_mat')
                          : b.trangThai === 'hoc_bu'
                            ? t('edu.diemDanh.s.hoc_bu')
                            : b.trangThai === 'vang_co_phep'
                              ? t('edu.diemDanh.s.vang_co_phep')
                              : t('edu.diemDanh.s.vang_khong_phep')}
                      </td>
                      <td className='border border-black p-1 text-center'>
                        {b.yThucDiem != null ? `${b.yThucDiem}/10` : '—'}
                      </td>
                      <td className='border border-black p-1'>
                        {b.nhanXet || '—'}
                      </td>
                      <td className='border border-black p-1 text-center font-bold'>
                        {b.soBuoiDaTru > 0 ? `-${b.soBuoiDaTru}` : '0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className='grid grid-cols-2 text-center text-xs mt-8 pt-4'>
                <div>
                  <p className='font-bold uppercase'>
                    {t('edu.doiSoat.printout.center')}
                  </p>
                  <p className='italic text-[10px]'>
                    {t('edu.doiSoat.printout.centerSign')}
                  </p>
                  <div className='h-20' />
                </div>
                <div>
                  <p className='font-bold uppercase'>
                    {t('edu.doiSoat.printout.parentSide')}
                  </p>
                  <p className='italic text-[10px]'>
                    {t('edu.doiSoat.printout.parentSign')}
                  </p>
                  <div className='h-20' />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}
