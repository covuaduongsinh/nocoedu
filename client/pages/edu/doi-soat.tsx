import { useApiClient } from '@nocobase/app-client';
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
                Đối Soát Buổi Học & Học Phí
              </h1>
              <p className='text-sm text-muted-foreground'>
                Kiểm tra, phân tích số buổi đã học, các kỳ nộp học phí, sách
                giáo trình và nhận xét học viên toàn trung tâm.
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
              Làm mới số liệu
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
                  Tổng học viên
                </p>
                <p className='mt-1 text-2xl font-bold text-foreground'>
                  {overviewData.thongKe.tongHocVien}
                </p>
                <span className='text-[11px] text-muted-foreground'>
                  Tất cả học viên
                </span>
              </div>

              <div
                onClick={() => handleFilterStatus('vuot_goi')}
                className={`cursor-pointer rounded-xl border p-3.5 shadow-sm transition-all hover:border-destructive ${filterStatus === 'vuot_goi' ? 'ring-2 ring-destructive bg-destructive/5' : 'bg-card'}`}
              >
                <p className='text-xs font-medium text-destructive flex items-center gap-1'>
                  <AlertTriangle className='size-3.5' /> Vượt buổi (Âm)
                </p>
                <p className='mt-1 text-2xl font-bold text-destructive'>
                  {overviewData.thongKe.soHocVienVuotGoi}
                </p>
                <span className='text-[11px] text-destructive'>
                  Cần thu kỳ mới
                </span>
              </div>

              <div
                onClick={() => handleFilterStatus('sap_het')}
                className={`cursor-pointer rounded-xl border p-3.5 shadow-sm transition-all hover:border-(--status-warning) ${filterStatus === 'sap_het' ? 'ring-2 ring-(--status-warning) bg-(--status-warning-background)' : 'bg-card'}`}
              >
                <p className='text-xs font-medium text-(--status-warning)'>
                  Sắp hết buổi
                </p>
                <p className='mt-1 text-2xl font-bold text-(--status-warning)'>
                  {overviewData.thongKe.soHocVienSapHet}
                </p>
                <span className='text-[11px] text-muted-foreground'>
                  Còn 0 - 2 buổi
                </span>
              </div>

              <div
                onClick={() => handleFilterStatus('binh_thuong')}
                className={`cursor-pointer rounded-xl border p-3.5 shadow-sm transition-all hover:border-(--status-success) ${filterStatus === 'binh_thuong' ? 'ring-2 ring-(--status-success) bg-(--status-success-background)' : 'bg-card'}`}
              >
                <p className='text-xs font-medium text-(--status-success)'>
                  Đang an toàn
                </p>
                <p className='mt-1 text-2xl font-bold text-(--status-success)'>
                  {overviewData.thongKe.soHocVienBinhThuong}
                </p>
                <span className='text-[11px] text-muted-foreground'>
                  Còn ≥ 3 buổi
                </span>
              </div>

              <div
                onClick={() => handleFilterStatus('no_hoc_phi')}
                className={`cursor-pointer rounded-xl border p-3.5 shadow-sm transition-all hover:border-primary ${filterStatus === 'no_hoc_phi' ? 'ring-2 ring-primary bg-primary/5' : 'bg-card'}`}
              >
                <p className='text-xs font-medium text-muted-foreground'>
                  Nợ học phí
                </p>
                <p className='mt-1 text-lg font-bold text-foreground'>
                  {fmt(overviewData.thongKe.tongCongNoHocPhi)} đ
                </p>
                <span className='text-[11px] text-muted-foreground'>
                  Tiền học chưa nộp
                </span>
              </div>

              <div
                onClick={() => handleFilterStatus('no_sach')}
                className={`cursor-pointer rounded-xl border p-3.5 shadow-sm transition-all hover:border-primary ${filterStatus === 'no_sach' ? 'ring-2 ring-primary bg-primary/5' : 'bg-card'}`}
              >
                <p className='text-xs font-medium text-muted-foreground'>
                  Nợ tiền sách
                </p>
                <p className='mt-1 text-lg font-bold text-foreground'>
                  {fmt(overviewData.thongKe.tongCongNoSach)} đ
                </p>
                <span className='text-[11px] text-muted-foreground'>
                  Tiền sách chưa thu
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
                  placeholder='Tìm theo Tên học viên, Mã HV hoặc SĐT phụ huynh...'
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
                <option value='all'>Tất cả cơ sở ({branchRows.length})</option>
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
                  Tất cả lớp học ({availableClasses.length})
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
                <option value='tat_ca'>Tất cả trạng thái</option>
                <option value='vuot_goi'>Học viên vượt buổi (Âm)</option>
                <option value='sap_het'>Sắp hết buổi (0 - 2)</option>
                <option value='binh_thuong'>Còn nhiều buổi (≥ 3)</option>
                <option value='no_hoc_phi'>💳 Còn nợ học phí</option>
                <option value='no_sach'>📚 Còn nợ tiền sách</option>
              </select>

              <Button
                size='sm'
                className='h-9 px-3 gap-1'
                onClick={() => loadOverview()}
              >
                <Search className='size-3.5' /> Tìm kiếm
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
                  <X className='size-3.5' /> Đặt lại
                </Button>
              ) : null}
            </div>
          </div>

          {/* Thống kê số lượng kết quả tìm kiếm */}
          {overviewData ? (
            <div className='flex items-center justify-between text-xs text-muted-foreground px-1 font-medium'>
              <span>
                Tìm thấy{' '}
                <strong className='text-foreground'>
                  {overviewData.danhSach.length}
                </strong>{' '}
                học viên phù hợp
                {overviewData.danhSach.length !==
                overviewData.thongKe.tongHocVien
                  ? ` (trên tổng số ${overviewData.thongKe.tongHocVien} học viên toàn trung tâm)`
                  : ''}
              </span>
            </div>
          ) : null}

          {/* Bảng Danh sách Học viên Đối soát */}
          <div className='overflow-x-auto rounded-lg border bg-card shadow-sm'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/50 text-xs font-semibold'>
                  <TableHead className='w-28'>Mã HV</TableHead>
                  <TableHead>Họ và tên</TableHead>
                  <TableHead>Lớp học</TableHead>
                  <TableHead>Cơ sở</TableHead>
                  <TableHead>Phụ huynh liên hệ</TableHead>
                  <TableHead className='text-center'>Đã nộp</TableHead>
                  <TableHead className='text-center'>Đã học</TableHead>
                  <TableHead className='text-center'>Số buổi còn lại</TableHead>
                  <TableHead className='text-right'>Học phí</TableHead>
                  <TableHead className='text-right'>Tiền sách</TableHead>
                  <TableHead className='text-center w-32'>Thao tác</TableHead>
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
                          Đang tải và tổng hợp dữ liệu đối soát học viên...
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
                          Thử lại
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
                      Không tìm thấy học viên nào phù hợp với điều kiện tìm
                      kiếm.
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
                            Vượt {Math.abs(row.soBuoiConLai)} buổi
                          </StatusBadge>
                        ) : row.soBuoiConLai === 0 ? (
                          <StatusBadge tone='warning' className='font-semibold'>
                            Hết buổi (0)
                          </StatusBadge>
                        ) : row.soBuoiConLai <= 2 ? (
                          <StatusBadge tone='warning' className='font-semibold'>
                            Còn {row.soBuoiConLai} buổi
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone='success' className='font-semibold'>
                            Còn {row.soBuoiConLai} buổi
                          </StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className='text-right'>
                        <span className='font-medium'>
                          {fmt(row.tongDaThanhToan)} đ
                        </span>
                        {row.tongConNoHocPhi > 0 ? (
                          <span className='block text-[11px] text-destructive font-medium'>
                            Nợ: {fmt(row.tongConNoHocPhi)} đ
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className='text-right'>
                        <span className='font-medium'>
                          {fmt(row.tongTienSachDaPhat)} đ
                        </span>
                        {row.tienSachTon < 0 ? (
                          <span className='block text-[11px] text-destructive font-medium'>
                            Nợ sách: {fmt(Math.abs(row.tienSachTon))} đ
                          </span>
                        ) : row.tienSachTon > 0 ? (
                          <span className='block text-[11px] text-(--status-success) font-medium'>
                            Quỹ dư: {fmt(row.tienSachTon)} đ
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
                          Đối soát
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
                Quay lại danh sách
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
                      Hồ sơ 360°
                    </RecordLink>
                  </h2>
                  <p className='text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 mt-0.5'>
                    {studentDetail.hocVien.lopId ? (
                      <RecordLink
                        to={`/lop/${studentDetail.hocVien.lopId}`}
                        className='text-primary hover:underline font-medium'
                      >
                        Lớp: {studentDetail.hocVien.lopTen}
                      </RecordLink>
                    ) : (
                      <span>Chưa xếp lớp</span>
                    )}
                    {studentDetail.hocVien.coSoTen ? (
                      <span>· Cơ sở: {studentDetail.hocVien.coSoTen}</span>
                    ) : null}
                    {studentDetail.hocVien.phuHuynh ? (
                      <span>
                        · Phụ huynh:{' '}
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
                Xuất CSV
              </Button>
              <Button
                size='sm'
                onClick={() => window.print()}
                disabled={!studentDetail}
                className='gap-1.5 bg-primary font-medium'
              >
                <Printer className='size-4' />
                🖨️ In phiếu đối soát A4
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
              Đang tải dữ liệu đối soát học viên...
            </div>
          ) : (
            <div className='flex flex-col gap-6'>
              {/* Thẻ KPI Tóm tắt Của Học Viên */}
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                <div className='rounded-xl border bg-card p-4 shadow-sm'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    Tổng số buổi đã nộp
                  </p>
                  <p className='mt-1 text-2xl font-bold text-primary'>
                    {studentDetail.tongHop.tongSoBuoiDaMua} buổi
                  </p>
                  <span className='text-[11px] text-muted-foreground'>
                    {studentDetail.cacKyNop.length} kỳ học phí
                  </span>
                </div>

                <div className='rounded-xl border bg-card p-4 shadow-sm'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    Tổng số buổi đã học
                  </p>
                  <p className='mt-1 text-2xl font-bold text-foreground'>
                    {studentDetail.tongHop.tongSoBuoiDaHoc} buổi
                  </p>
                  <span className='text-[11px] text-muted-foreground'>
                    Đã ghi nhận điểm danh
                  </span>
                </div>

                <div className='rounded-xl border bg-card p-4 shadow-sm'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    Số buổi còn lại
                  </p>
                  <p
                    className={`mt-1 text-2xl font-bold ${studentDetail.tongHop.soBuoiConLai < 0 ? 'text-destructive' : 'text-(--status-success)'}`}
                  >
                    {studentDetail.tongHop.soBuoiConLai < 0
                      ? `Vượt ${studentDetail.tongHop.soBuoiVuotGoi} buổi`
                      : `Còn ${studentDetail.tongHop.soBuoiConLai} buổi`}
                  </p>
                  <span className='text-[11px] text-muted-foreground'>
                    {studentDetail.tongHop.soBuoiConLai < 0
                      ? 'Chưa đóng học phí kỳ mới'
                      : 'Số dư khả dụng'}
                  </span>
                </div>

                <div className='rounded-xl border bg-card p-4 shadow-sm'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    Học phí & Quỹ sách
                  </p>
                  <p className='mt-1 text-sm font-semibold'>
                    Học phí: {fmt(studentDetail.tongHop.tongDaThanhToan)} đ
                    {studentDetail.tongHop.tongConNo > 0 ? (
                      <span className='text-destructive ml-1.5'>
                        (Nợ: {fmt(studentDetail.tongHop.tongConNo)} đ)
                      </span>
                    ) : null}
                  </p>
                  <p className='text-xs text-muted-foreground mt-0.5'>
                    Sách đã nhận:{' '}
                    {fmt(studentDetail.tongHop.tongTienSachDaPhat)} đ
                    {studentDetail.tongHop.tienSachTon < 0 ? (
                      <span className='text-destructive font-semibold ml-1.5'>
                        (Nợ: {fmt(Math.abs(studentDetail.tongHop.tienSachTon))}{' '}
                        đ)
                      </span>
                    ) : studentDetail.tongHop.tienSachTon > 0 ? (
                      <span className='text-(--status-success) font-semibold ml-1.5'>
                        (Tồn: {fmt(studentDetail.tongHop.tienSachTon)} đ)
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
                    <Layers className='size-3.5' /> Tổng quan tiến độ
                  </TabsTrigger>
                  <TabsTrigger
                    value='sessions'
                    className='gap-1.5 text-xs font-medium'
                  >
                    <CalendarCheck className='size-3.5' /> Buổi học & Sửa nhanh
                    ({studentDetail.danhSachBuoiHoc.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value='tuition'
                    className='gap-1.5 text-xs font-medium'
                  >
                    <Wallet className='size-3.5' /> Kỳ học phí (
                    {studentDetail.cacKyNop.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value='books'
                    className='gap-1.5 text-xs font-medium'
                  >
                    <BookOpen className='size-3.5' /> Sách & Quỹ (
                    {studentDetail.sachDaPhat.length})
                  </TabsTrigger>
                </TabsList>

                {/* TAB 1: TỔNG QUAN TIẾN ĐỘ TỪNG KỲ HỌC */}
                <TabsContent
                  value='overview'
                  className='mt-4 flex flex-col gap-6'
                >
                  <div>
                    <h3 className='text-base font-bold text-foreground mb-3 flex items-center gap-2'>
                      <span>📊 Cột mốc phân bổ buổi học theo từng kỳ nộp</span>
                    </h3>
                    {studentDetail.cacKyNop.length === 0 ? (
                      <div className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                        Chưa có gói học phí nào được tạo cho học viên này.
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
                                  (Ngày nộp: {ky.ngayMua || 'Chưa cập nhật'})
                                </span>
                              </div>
                              <div className='flex items-center gap-2'>
                                <span className='text-xs font-medium text-foreground'>
                                  Đã học: <strong>{ky.daDung}</strong> /{' '}
                                  {ky.soBuoi} buổi
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
                                    ? 'Đã hoàn thành'
                                    : ky.tienDo > 0
                                      ? `Đang học (${ky.tienDo}%)`
                                      : 'Chưa học'}
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
                                Học phí gói:{' '}
                                <strong>{fmt(ky.thanhTien)} đ</strong> (
                                {fmt(ky.donGia)} đ/buổi)
                              </span>
                              <span>
                                Đã nộp:{' '}
                                <strong className='text-(--status-success)'>
                                  {fmt(ky.daThanhToan)} đ
                                </strong>
                              </span>
                              <span>
                                Còn nợ:{' '}
                                <strong
                                  className={
                                    ky.conNo > 0
                                      ? 'text-destructive'
                                      : 'text-foreground'
                                  }
                                >
                                  {fmt(ky.conNo)} đ
                                </strong>
                              </span>
                              <span>
                                Số buổi còn lại của kỳ:{' '}
                                <strong className='text-primary'>
                                  {ky.conLai} buổi
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
                                  Học viên đã học vượt{' '}
                                  {studentDetail.tongHop.soBuoiVuotGoi} buổi
                                  ngoài các kỳ đã nộp!
                                </p>
                                <p className='text-xs opacity-90'>
                                  Các buổi học gần nhất chưa được kết nối với kỳ
                                  học phí mới. Vui lòng tạo gói buổi mới và ghi
                                  nhận thanh toán.
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
                          Kỳ học:
                        </span>
                        <select
                          value={sessionKyFilter}
                          onChange={(e) => setSessionKyFilter(e.target.value)}
                          className='h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
                        >
                          <option value='all'>Tất cả các kỳ</option>
                          {studentDetail.cacKyNop.map((ky) => (
                            <option key={ky.id} value={String(ky.id)}>
                              {ky.tenKy}
                            </option>
                          ))}
                          <option value='ngoai_goi'>
                            Vượt gói / Chưa nộp kỳ mới
                          </option>
                        </select>
                      </div>

                      <div className='flex items-center gap-1.5'>
                        <span className='text-xs text-muted-foreground'>
                          Trạng thái:
                        </span>
                        <select
                          value={sessionStatusFilter}
                          onChange={(e) =>
                            setSessionStatusFilter(e.target.value)
                          }
                          className='h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
                        >
                          <option value='all'>Tất cả trạng thái</option>
                          <option value='co_mat'>Có mặt</option>
                          <option value='hoc_bu'>Học bù</option>
                          <option value='vang_co_phep'>Vắng có phép</option>
                          <option value='vang_khong_phep'>
                            Vắng không phép
                          </option>
                        </select>
                      </div>

                      <div className='flex items-center gap-1.5 min-w-[200px]'>
                        <Search className='size-3.5 text-muted-foreground' />
                        <Input
                          placeholder='Tìm từ khóa nhận xét...'
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
                          ? '⬇️ Mới nhất trước'
                          : '⬆️ Cũ nhất trước'}
                      </Button>
                    </div>

                    <span className='text-xs text-muted-foreground'>
                      Hiển thị <strong>{filteredSessions.length}</strong> /{' '}
                      {studentDetail.danhSachBuoiHoc.length} buổi học
                    </span>
                  </div>

                  {/* Bảng Buổi Học Full Width (Chống đè chữ triệt để) */}
                  <div className='overflow-x-auto rounded-lg border bg-card shadow-sm'>
                    <Table className='min-w-[1100px]'>
                      <TableHeader className='bg-muted/60 sticky top-0 z-10'>
                        <TableRow className='text-xs font-semibold'>
                          <TableHead className='w-12 text-center'>
                            STT
                          </TableHead>
                          <TableHead className='w-32'>Ngày & Giờ</TableHead>
                          <TableHead className='w-20'>Lớp</TableHead>
                          <TableHead className='w-32 text-center'>
                            Trạng thái
                          </TableHead>
                          <TableHead className='w-14 text-center'>
                            BTVN
                          </TableHead>
                          <TableHead className='w-14 text-center'>
                            Ý thức
                          </TableHead>
                          <TableHead className='min-w-[280px] max-w-[420px]'>
                            Nhận xét giáo viên
                          </TableHead>
                          <TableHead className='w-52 min-w-[200px]'>
                            Thuộc kỳ nộp
                          </TableHead>
                          <TableHead className='w-20 text-center'>
                            Trừ buổi
                          </TableHead>
                          <TableHead className='w-16 text-center'>
                            Sửa
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
                              Không có buổi học nào thỏa mãn bộ lọc đã chọn.
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
                                    ? 'Có mặt'
                                    : buoi.trangThai === 'hoc_bu'
                                      ? 'Học bù'
                                      : buoi.trangThai === 'vang_co_phep'
                                        ? 'Vắng có phép'
                                        : 'Vắng không phép'}
                                </StatusBadge>
                              </TableCell>
                              <TableCell className='text-center'>
                                {buoi.daLamBtvn ? 'Đã làm' : 'Chưa làm'}
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
                                    Chưa có nhận xét
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
                          <TableHead>Tên gói / Kỳ nộp</TableHead>
                          <TableHead>Ngày nộp</TableHead>
                          <TableHead className='text-center'>Số buổi</TableHead>
                          <TableHead className='text-right'>Đơn giá</TableHead>
                          <TableHead className='text-right'>
                            Thành tiền
                          </TableHead>
                          <TableHead className='text-right'>Đã nộp</TableHead>
                          <TableHead className='text-right'>Còn nợ</TableHead>
                          <TableHead className='text-center'>
                            Trạng thái
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
                              Chưa có gói học phí nào.
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
                                {fmt(ky.donGia)} đ
                              </TableCell>
                              <TableCell className='text-right font-semibold'>
                                {fmt(ky.thanhTien)} đ
                              </TableCell>
                              <TableCell className='text-right text-(--status-success) font-bold'>
                                {fmt(ky.daThanhToan)} đ
                              </TableCell>
                              <TableCell
                                className={`text-right font-bold ${ky.conNo > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                              >
                                {ky.conNo > 0 ? `${fmt(ky.conNo)} đ` : '0 đ'}
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
                                    ? 'Đã đóng đủ'
                                    : ky.daThanhToan > 0
                                      ? 'Đóng một phần'
                                      : 'Chưa đóng'}
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
                          <TableHead>Tên đầu sách / Giáo trình</TableHead>
                          <TableHead>Ngày phát</TableHead>
                          <TableHead className='text-center'>
                            Số lượng
                          </TableHead>
                          <TableHead className='text-right'>Giá bìa</TableHead>
                          <TableHead className='text-right'>Ưu đãi</TableHead>
                          <TableHead className='text-right'>
                            Thành tiền
                          </TableHead>
                          <TableHead>Ghi chú</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className='text-xs'>
                        {studentDetail.sachDaPhat.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className='h-24 text-center text-muted-foreground'
                            >
                              Học viên chưa nhận đầu sách nào.
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
                                {fmt(sach.giaBia)} đ
                              </TableCell>
                              <TableCell className='text-right text-(--status-success)'>
                                {fmt(sach.uuDai)} đ
                              </TableCell>
                              <TableCell className='text-right font-bold'>
                                {fmt(sach.thanhTien)} đ
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
                    <Edit3 className='size-5 text-primary' /> Sửa thông tin buổi
                    học
                  </DialogTitle>
                  <DialogDescription>
                    Buổi học ngày: <strong>{editSession.ngay}</strong> · Lớp:{' '}
                    <strong>{editSession.lopTen}</strong>
                  </DialogDescription>
                </DialogHeader>

                <div className='flex flex-col gap-4 py-3 text-sm'>
                  <div className='flex flex-col gap-1.5'>
                    <label className='font-semibold text-xs text-foreground'>
                      Trạng thái điểm danh
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
                      Đã làm bài tập về nhà (BTVN)
                    </label>
                  </div>

                  <div className='flex flex-col gap-1.5'>
                    <label className='font-semibold text-xs text-foreground'>
                      Điểm ý thức học tập (0 - 10)
                    </label>
                    <Input
                      type='number'
                      min={0}
                      max={10}
                      placeholder='Ví dụ: 8 hoặc 10...'
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
                      Nhận xét của giáo viên
                    </label>
                    <textarea
                      rows={3}
                      placeholder='Nhập nhận xét chi tiết về buổi học...'
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
                <h1 className='text-2xl font-bold uppercase tracking-wider'>
                  CLB CỜ VUA DƯƠNG SINH
                </h1>
                <p className='text-xs italic'>
                  Hệ thống đào tạo cờ vua chuẩn thi đấu - Hotline: 0989.xxx.xxx
                </p>
                <h2 className='text-xl font-bold uppercase mt-3'>
                  BẢNG KÊ ĐỐI SOÁT BUỔI HỌC & HỌC PHÍ
                </h2>
              </div>

              <div className='grid grid-cols-2 gap-4 text-xs mb-4'>
                <div>
                  <p>
                    Học viên: <strong>{studentDetail.hocVien.hoTen}</strong>{' '}
                    (Mã: {studentDetail.hocVien.ma})
                  </p>
                  <p>
                    Lớp học:{' '}
                    <strong>{studentDetail.hocVien.lopTen || '—'}</strong> · Cơ
                    sở: <strong>{studentDetail.hocVien.coSoTen || '—'}</strong>
                  </p>
                </div>
                <div>
                  <p>
                    Phụ huynh:{' '}
                    <strong>
                      {studentDetail.hocVien.phuHuynh?.hoTen || '—'}
                    </strong>
                  </p>
                  <p>
                    Số điện thoại:{' '}
                    <strong>
                      {studentDetail.hocVien.phuHuynh?.soDienThoai || '—'}
                    </strong>
                  </p>
                </div>
              </div>

              <div className='border border-black p-3 mb-4 text-xs'>
                <h3 className='font-bold uppercase mb-2'>
                  TỔNG HỢP SỐ BUỔI & HỌC PHÍ
                </h3>
                <div className='grid grid-cols-3 gap-2'>
                  <p>
                    Tổng buổi nộp:{' '}
                    <strong>
                      {studentDetail.tongHop.tongSoBuoiDaMua} buổi
                    </strong>
                  </p>
                  <p>
                    Tổng buổi đã học:{' '}
                    <strong>
                      {studentDetail.tongHop.tongSoBuoiDaHoc} buổi
                    </strong>
                  </p>
                  <p>
                    Số buổi còn lại:{' '}
                    <strong>{studentDetail.tongHop.soBuoiConLai} buổi</strong>
                  </p>
                  <p>
                    Học phí đã nộp:{' '}
                    <strong>
                      {fmt(studentDetail.tongHop.tongDaThanhToan)} đ
                    </strong>
                  </p>
                  <p>
                    Học phí còn nợ:{' '}
                    <strong>{fmt(studentDetail.tongHop.tongConNo)} đ</strong>
                  </p>
                  <p>
                    Quỹ tiền sách:{' '}
                    <strong>{fmt(studentDetail.tongHop.tienSachTon)} đ</strong>
                  </p>
                </div>
              </div>

              <h3 className='font-bold uppercase text-xs mb-2'>
                CHI TIẾT LỊCH SỬ CÁC BUỔI ĐIỂM DANH
              </h3>
              <table className='w-full border-collapse border border-black text-[11px] mb-8'>
                <thead>
                  <tr className='bg-muted'>
                    <th className='border border-black p-1 text-center w-8'>
                      STT
                    </th>
                    <th className='border border-black p-1 text-left'>
                      Ngày & Giờ
                    </th>
                    <th className='border border-black p-1 text-left'>Lớp</th>
                    <th className='border border-black p-1 text-center'>
                      Trạng thái
                    </th>
                    <th className='border border-black p-1 text-center'>
                      Ý thức
                    </th>
                    <th className='border border-black p-1 text-left'>
                      Nhận xét của giáo viên
                    </th>
                    <th className='border border-black p-1 text-center'>
                      Trừ buổi
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
                          ? 'Có mặt'
                          : b.trangThai === 'hoc_bu'
                            ? 'Học bù'
                            : b.trangThai === 'vang_co_phep'
                              ? 'Vắng có phép'
                              : 'Vắng không phép'}
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
                  <p className='font-bold uppercase'>ĐẠI DIỆN TRUNG TÂM</p>
                  <p className='italic text-[10px]'>
                    (Ký, đóng dấu và ghi rõ họ tên)
                  </p>
                  <div className='h-20' />
                </div>
                <div>
                  <p className='font-bold uppercase'>PHỤ HUYNH HỌC VIÊN</p>
                  <p className='italic text-[10px]'>
                    (Ký và ghi rõ họ tên xác nhận đối soát)
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
