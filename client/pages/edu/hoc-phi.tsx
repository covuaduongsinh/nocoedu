import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircle,
  ArrowRight,
  BadgeAlert,
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Download,
  ExternalLink,
  History,
  QrCode,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { FormDialog, SelectField, TextField } from './form-parts.js';
import { GenericImportDialog } from './generic-import-dialog.js';
import {
  post,
  text,
  todayVn,
  useErrorMessage,
  useRows,
  type Row,
} from './kit.js';

const fmt = (value: unknown): string => Number(value || 0).toLocaleString('vi-VN');

interface Qr {
  soTien: number;
  noiDungCk: string;
  url: string;
}

export default function HocPhiPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const api = useApiClient();
  const message = useErrorMessage();

  // Downloading is a separate action from viewing (`edu.baoCao` `export`).
  const { can: canExport } = useCan({
    resource: { type: 'composite', id: 'edu.baoCao' },
    action: 'export',
  });
  const { can: canSell } = useCan({
    resource: { type: 'composite', id: 'edu.goiHoc' },
    action: 'manage',
  });
  const { can: canPay } = useCan({
    resource: { type: 'composite', id: 'edu.thanhToan' },
    action: 'manage',
  });

  const students = useRows('hocVien');
  const classes = useRows('lop').loaded;

  const [activeTab, setActiveTab] = useState<'cashier' | 'ledger' | 'reminders'>('cashier');

  // State cho Tab 1: Quầy thu ngân
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [searchStudent, setSearchStudent] = useState<string>('');
  const [studentPacks, setStudentPacks] = useState<Row[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(false);

  // Modal Bán gói mới
  const [sellModal, setSellModal] = useState<{
    open: boolean;
    student: Row | null;
    soBuoi: string;
    donGia: string;
  }>({
    open: false,
    student: null,
    soBuoi: '12',
    donGia: '150000',
  });

  // Modal Thu tiền gói hiện có
  const [payModal, setPayModal] = useState<{
    open: boolean;
    student: Row | null;
    goiHocId: string;
    soTien: string;
    hinhThuc: 'chuyen_khoan' | 'tien_mat';
    noiDungCk: string;
  }>({
    open: false,
    student: null,
    goiHocId: '',
    soTien: '',
    hinhThuc: 'chuyen_khoan',
    noiDungCk: '',
  });

  // VietQR modal
  const [qr, setQr] = useState<Qr | 'unset' | null>(null);

  // State cho Tab 2: Sổ quỹ dòng tiền
  const [payments, setPayments] = useState<Row[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [filterMonth, setFilterMonth] = useState<string>('all');

  const studentRows = students.loaded.state === 'ready' ? students.loaded.rows : [];
  const classRows = classes.state === 'ready' ? classes.rows : [];

  const classNameOf = (lopId: unknown): string =>
    text(classRows.find((r) => r.id === lopId)?.ten) || '—';

  // Danh sách học sinh theo ô tìm kiếm
  const filteredStudents = useMemo(() => {
    if (!searchStudent.trim()) return [];
    const q = searchStudent.toLowerCase().trim();
    return studentRows
      .filter((s) => text(s.hoTen).toLowerCase().includes(q) || text(s.ma).toLowerCase().includes(q))
      .slice(0, 8);
  }, [studentRows, searchStudent]);

  // Học sinh đang chọn ở quầy thu ngân
  const selectedStudent = useMemo(
    () => studentRows.find((s) => s.id === selectedStudentId) || null,
    [studentRows, selectedStudentId],
  );

  // Danh sách học sinh cần thu tiền (âm buổi hoặc <= 2 buổi)
  const reminderStudents = useMemo(() => {
    return studentRows
      .filter((s) => Number(s.soBuoiConLai) <= 2)
      .sort((a, b) => Number(a.soBuoiConLai) - Number(b.soBuoiConLai));
  }, [studentRows]);

  // Tải các gói học của học sinh đang chọn
  useEffect(() => {
    if (!selectedStudentId) {
      setStudentPacks([]);
      return;
    }
    let live = true;
    setLoadingPacks(true);
    api
      .request<{ data: Row[] }>({
        path: '/goiHoc/findMany',
        method: 'POST',
        json: { filter: { hocVienId: selectedStudentId }, limit: 100 },
      })
      .then((res) => {
        if (!live) return;
        setStudentPacks(res.data);
      })
      .catch((err) => {
        console.error(err);
        if (live) setStudentPacks([]);
      })
      .finally(() => {
        if (live) setLoadingPacks(false);
      });

    return () => {
      live = false;
    };
  }, [api, selectedStudentId]);

  // Tải danh sách giao dịch thanh toán cho Tab 2
  const loadPayments = async () => {
    setLoadingPayments(true);
    try {
      const res = await api.request<{ data: Row[] }>({
        path: '/thanhToan/findMany',
        method: 'POST',
        json: { limit: 200, sort: ['-id'] },
      });
      setPayments(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'ledger') {
      loadPayments();
    }
  }, [activeTab]);

  // Sinh QR VietQR
  const handleOpenQr = async (goiHocId: string) => {
    try {
      const res = (await post(api, '/thanhToan/vietQr', {
        goiHocId: Number(goiHocId),
      })) as { data: Qr };
      setQr(res.data);
    } catch {
      setQr('unset');
    }
  };

  // Xác nhận bán gói
  const handleSellSubmit = async () => {
    if (!sellModal.student) return;
    try {
      await post(api, '/goiHoc/taoMoi', {
        hocVienId: sellModal.student.id,
        soBuoi: Number(sellModal.soBuoi),
        donGia: Number(sellModal.donGia),
        ngayMua: todayVn(),
      });
      setSellModal({ open: false, student: null, soBuoi: '12', donGia: '150000' });
      students.reload();
      if (selectedStudentId) {
        // reload packs
        const res = await api.request<{ data: Row[] }>({
          path: '/goiHoc/findMany',
          method: 'POST',
          json: { filter: { hocVienId: selectedStudentId }, limit: 100 },
        });
        setStudentPacks(res.data);
      }
    } catch (err: any) {
      alert(message(err));
    }
  };

  // Xác nhận ghi nhận thanh toán
  const handlePaySubmit = async () => {
    if (!payModal.student || !payModal.goiHocId) return;
    try {
      await post(api, '/thanhToan/ghiNhan', {
        goiHocId: Number(payModal.goiHocId),
        soTien: Number(payModal.soTien),
        hinhThuc: payModal.hinhThuc,
        ngay: todayVn(),
        noiDungCk: payModal.noiDungCk.trim() || undefined,
      });
      setPayModal({
        open: false,
        student: null,
        goiHocId: '',
        soTien: '',
        hinhThuc: 'chuyen_khoan',
        noiDungCk: '',
      });
      students.reload();
      if (activeTab === 'ledger') loadPayments();
      if (selectedStudentId) {
        const res = await api.request<{ data: Row[] }>({
          path: '/goiHoc/findMany',
          method: 'POST',
          json: { filter: { hocVienId: selectedStudentId }, limit: 100 },
        });
        setStudentPacks(res.data);
      }
    } catch (err: any) {
      alert(message(err));
    }
  };

  // Xuất CSV học phí
  const exportTuitionCsv = async (): Promise<void> => {
    try {
      const stream = await api.stream({
        path: '/hocPhi/xuatCsv',
        method: 'POST',
        json: {},
      });
      const blob = await new Response(stream).blob();
      const url = URL.createObjectURL(
        new Blob([blob], { type: 'text/csv;charset=utf-8' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `hoc-phi-${todayVn()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  // Tổng tiền sổ quỹ
  const totalLedgerAmount = useMemo(() => {
    return payments.reduce((acc, p) => acc + (Number(p.soTien) || 0), 0);
  }, [payments]);

  return (
    <PageContainer className='mx-auto max-w-5xl pb-16'>
      <PageHeader
        title='Quản Lý Học Phí & Quầy Thu Ngân'
        description='Trung tâm thu ngân, bán gói học phí VietQR, quản lý sổ quỹ dòng tiền và theo dõi các học viên cần thu tiền kỳ mới.'
        actions={
          <div className='flex flex-wrap items-center gap-2'>
            <GenericImportDialog
              entity='goiHoc'
              title='Nhập Gói học & Học phí từ file CSV'
              buttonLabel='Nhập học phí CSV'
              variant='outline'
              onSuccess={() => {
                students.reload();
                if (activeTab === 'ledger') loadPayments();
              }}
            />
            {canExport ? (
              <Button variant='outline' size='sm' onClick={() => void exportTuitionCsv()} className='gap-1.5'>
                <Download className='h-4 w-4' />
                Xuất CSV
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Tabs Chuyển đổi nghiệp vụ */}
      <div className='flex border-b border-border mb-6 gap-2'>
        <button
          type='button'
          onClick={() => setActiveTab('cashier')}
          className={`flex items-center gap-2 pb-3 px-4 font-semibold text-sm transition-all border-b-2 ${
            activeTab === 'cashier'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <CreditCard className='h-4 w-4' />
          Quầy Thu Ngân & Bán Gói
        </button>

        <button
          type='button'
          onClick={() => setActiveTab('ledger')}
          className={`flex items-center gap-2 pb-3 px-4 font-semibold text-sm transition-all border-b-2 ${
            activeTab === 'ledger'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <History className='h-4 w-4' />
          Sổ Quỹ Giao Dịch
        </button>

        <button
          type='button'
          onClick={() => setActiveTab('reminders')}
          className={`flex items-center gap-2 pb-3 px-4 font-semibold text-sm transition-all border-b-2 relative ${
            activeTab === 'reminders'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BadgeAlert className='h-4 w-4 text-amber-500' />
          Cần Thu Học Phí
          {reminderStudents.length > 0 && (
            <span className='ml-1 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold px-2 py-0.5 text-xs'>
              {reminderStudents.length}
            </span>
          )}
        </button>
      </div>

      {/* ================= TAB 1: QUẦY THU NGÂN & BÁN GÓI ================= */}
      {activeTab === 'cashier' && (
        <div className='flex flex-col gap-6'>
          {/* Ô tìm kiếm học sinh nhanh */}
          <div className='rounded-2xl border bg-card p-5 shadow-sm'>
            <h2 className='text-sm font-bold text-foreground mb-3 flex items-center gap-2'>
              <Search className='h-4 w-4 text-primary' />
              Tìm kiếm học viên để thu học phí hoặc bán gói
            </h2>
            <div className='relative'>
              <Input
                placeholder='Nhập tên học sinh hoặc mã học viên (VD: Nguyễn Nam hoặc HV-001)...'
                value={searchStudent}
                onChange={(e) => setSearchStudent(e.target.value)}
                className='h-11 text-sm pl-10 pr-4'
              />
              <Search className='absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground' />

              {/* Danh sách gợi ý khi gõ */}
              {filteredStudents.length > 0 && (
                <div className='absolute z-20 left-0 right-0 mt-1 rounded-xl border bg-popover text-popover-foreground shadow-lg overflow-hidden divide-y'>
                  {filteredStudents.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedStudentId(Number(s.id));
                        setSearchStudent('');
                      }}
                      className='p-3 hover:bg-muted/50 cursor-pointer flex items-center justify-between transition-colors'
                    >
                      <div>
                        <span className='font-bold text-sm text-foreground'>{text(s.hoTen)}</span>
                        <span className='text-xs text-muted-foreground ml-2 font-mono'>
                          ({text(s.ma)})
                        </span>
                        <span className='text-xs text-muted-foreground ml-2'>
                          · Lớp: {classNameOf(s.lopId)}
                        </span>
                      </div>
                      <div className='flex items-center gap-2'>
                        <span className='text-xs font-semibold'>
                          {Number(s.soBuoiConLai) < 0 ? (
                            <span className='text-destructive'>Nợ {Math.abs(Number(s.soBuoiConLai))} buổi</span>
                          ) : (
                            <span className='text-emerald-600'>Còn {Number(s.soBuoiConLai)} buổi</span>
                          )}
                        </span>
                        <ArrowRight className='h-4 w-4 text-muted-foreground' />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chi tiết học viên được chọn */}
          {selectedStudent ? (
            <div className='flex flex-col gap-5'>
              <div className='rounded-2xl border bg-muted/30 p-5 flex flex-wrap items-center justify-between gap-4'>
                <div className='flex items-center gap-4'>
                  <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-black text-lg shadow-sm'>
                    {text(selectedStudent.hoTen)?.charAt(0) || 'HV'}
                  </div>
                  <div>
                    <div className='flex items-center gap-2'>
                      <h3 className='text-lg font-bold text-foreground'>{text(selectedStudent.hoTen)}</h3>
                      <span className='font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded'>
                        {text(selectedStudent.ma)}
                      </span>
                    </div>
                    <p className='text-xs text-muted-foreground mt-0.5'>
                      Lớp: <strong>{classNameOf(selectedStudent.lopId)}</strong> | Số buổi còn lại:{' '}
                      <strong className={Number(selectedStudent.soBuoiConLai) < 0 ? 'text-destructive font-bold' : 'text-emerald-600 font-bold'}>
                        {Number(selectedStudent.soBuoiConLai) < 0
                          ? `🔴 Vượt ${Math.abs(Number(selectedStudent.soBuoiConLai))} buổi`
                          : `🟢 Còn ${Number(selectedStudent.soBuoiConLai)} buổi`}
                      </strong>
                    </p>
                  </div>
                </div>

                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => navigate(`/doi-soat?hocVienId=${selectedStudent.id}`)}
                    className='text-xs gap-1.5'
                  >
                    <ExternalLink className='h-3.5 w-3.5' /> Xem phiếu đối soát A4
                  </Button>
                  {canSell && (
                    <Button
                      size='sm'
                      onClick={() =>
                        setSellModal({
                          open: true,
                          student: selectedStudent,
                          soBuoi: '12',
                          donGia: '150000',
                        })
                      }
                      className='text-xs font-semibold bg-primary gap-1.5 shadow-sm'
                    >
                      <DollarSign className='h-3.5 w-3.5' /> Bán gói học mới
                    </Button>
                  )}
                </div>
              </div>

              {/* Bảng các gói học của học viên */}
              <div className='rounded-2xl border bg-card p-5 shadow-sm'>
                <div className='flex items-center justify-between mb-3 border-b pb-2.5'>
                  <h4 className='text-sm font-bold text-foreground flex items-center gap-2'>
                    <Wallet className='h-4 w-4 text-primary' />
                    Các gói học đã mua ({studentPacks.length} gói)
                  </h4>
                  {canSell && (
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() =>
                        setSellModal({
                          open: true,
                          student: selectedStudent,
                          soBuoi: '12',
                          donGia: '150000',
                        })
                      }
                      className='text-xs text-primary font-semibold'
                    >
                      + Bán thêm gói
                    </Button>
                  )}
                </div>

                {loadingPacks ? (
                  <p className='py-6 text-center text-xs text-muted-foreground'>Đang tải danh sách gói...</p>
                ) : studentPacks.length === 0 ? (
                  <p className='py-6 text-center text-xs text-muted-foreground'>
                    Học sinh này chưa mua gói học nào. Hãy bấm nút &quot;Bán gói học mới&quot; ở trên.
                  </p>
                ) : (
                  <div className='overflow-x-auto rounded-lg border'>
                    <Table>
                      <TableHeader>
                        <TableRow className='text-xs bg-muted/40'>
                          <TableHead>Ngày mua</TableHead>
                          <TableHead className='text-center'>Số buổi</TableHead>
                          <TableHead className='text-right'>Đơn giá</TableHead>
                          <TableHead className='text-right'>Thành tiền</TableHead>
                          <TableHead className='text-center'>Thao tác</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className='text-xs'>
                        {studentPacks.map((pack) => (
                          <TableRow key={pack.id}>
                            <TableCell className='font-medium'>{text(pack.ngayMua)}</TableCell>
                            <TableCell className='text-center font-bold'>{text(pack.soBuoi)}</TableCell>
                            <TableCell className='text-right'>{fmt(pack.donGia)} đ</TableCell>
                            <TableCell className='text-right font-bold text-primary'>
                              {fmt(pack.thanhTien)} đ
                            </TableCell>
                            <TableCell className='text-center'>
                              <div className='flex items-center justify-center gap-2'>
                                <Button
                                  size='sm'
                                  variant='outline'
                                  onClick={() => handleOpenQr(String(pack.id))}
                                  className='h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10'
                                >
                                  <QrCode className='h-3 w-3' /> Mã QR
                                </Button>
                                {canPay && (
                                  <Button
                                    size='sm'
                                    onClick={() =>
                                      setPayModal({
                                        open: true,
                                        student: selectedStudent,
                                        goiHocId: String(pack.id),
                                        soTien: String(pack.thanhTien || ''),
                                        hinhThuc: 'chuyen_khoan',
                                        noiDungCk: `HP ${text(selectedStudent.ma)} ${text(pack.soBuoi)}B`,
                                      })
                                    }
                                    className='h-7 text-xs font-semibold'
                                  >
                                    Thu tiền
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className='rounded-2xl border border-dashed p-10 text-center bg-muted/10'>
              <Users className='h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50' />
              <p className='text-sm font-semibold text-foreground'>Chưa chọn học viên nào</p>
              <p className='text-xs text-muted-foreground mt-1'>
                Vui lòng nhập tên học viên vào ô tìm kiếm ở trên để bắt đầu thao tác thu ngân hoặc bán gói học.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: SỔ QUỸ GIAO DỊCH DÒNG TIỀN ================= */}
      {activeTab === 'ledger' && (
        <div className='flex flex-col gap-6'>
          {/* Card KPI tổng dòng tiền */}
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
            <Card className='shadow-sm border-primary/20 bg-primary/5'>
              <CardHeader className='pb-2'>
                <CardTitle className='text-xs text-muted-foreground uppercase font-bold tracking-wider'>
                  Tổng Tiền Thu Học Phí
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-black text-primary'>{fmt(totalLedgerAmount)} đ</div>
                <p className='text-xs text-muted-foreground mt-1'>
                  Từ {payments.length} lượt giao dịch đã ghi nhận
                </p>
              </CardContent>
            </Card>

            <Card className='shadow-sm'>
              <CardHeader className='pb-2'>
                <CardTitle className='text-xs text-muted-foreground uppercase font-bold tracking-wider'>
                  Giao Dịch Chuyển Khoản
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-foreground'>
                  {payments.filter((p) => p.hinhThuc === 'chuyen_khoan').length} lượt
                </div>
                <p className='text-xs text-muted-foreground mt-1'>Qua ngân hàng & VietQR</p>
              </CardContent>
            </Card>

            <Card className='shadow-sm'>
              <CardHeader className='pb-2'>
                <CardTitle className='text-xs text-muted-foreground uppercase font-bold tracking-wider'>
                  Giao Dịch Tiền Mặt
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-foreground'>
                  {payments.filter((p) => p.hinhThuc === 'tien_mat').length} lượt
                </div>
                <p className='text-xs text-muted-foreground mt-1'>Thu trực tiếp tại cơ sở</p>
              </CardContent>
            </Card>
          </div>

          {/* Bảng danh sách các khoản thanh toán */}
          <div className='rounded-2xl border bg-card p-5 shadow-sm'>
            <div className='flex items-center justify-between mb-4 border-b pb-3'>
              <h3 className='text-sm font-bold text-foreground flex items-center gap-2'>
                <History className='h-4 w-4 text-primary' />
                Lịch sử các khoản tiền đã thu ({payments.length} bản ghi)
              </h3>
              <Button variant='outline' size='sm' onClick={loadPayments} className='text-xs'>
                Làm mới
              </Button>
            </div>

            {loadingPayments ? (
              <p className='py-8 text-center text-xs text-muted-foreground'>Đang tải sổ quỹ...</p>
            ) : payments.length === 0 ? (
              <p className='py-8 text-center text-xs text-muted-foreground'>Chưa có giao dịch thu tiền nào.</p>
            ) : (
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader>
                    <TableRow className='text-xs bg-muted/40'>
                      <TableHead>Ngày thu</TableHead>
                      <TableHead>Học viên</TableHead>
                      <TableHead className='text-right'>Số tiền (đ)</TableHead>
                      <TableHead className='text-center'>Hình thức</TableHead>
                      <TableHead>Nội dung ghi chú</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className='text-xs'>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className='whitespace-nowrap font-medium'>{text(p.ngay)}</TableCell>
                        <TableCell>
                          <RecordLink to={`/hoc-vien/${text(p.hocVienId)}`} target='_blank'>
                            Học viên #{text(p.hocVienId)}
                          </RecordLink>
                        </TableCell>
                        <TableCell className='text-right font-bold text-emerald-600'>
                          +{fmt(p.soTien)} đ
                        </TableCell>
                        <TableCell className='text-center'>
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                              p.hinhThuc === 'chuyen_khoan'
                                ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
                                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {p.hinhThuc === 'chuyen_khoan' ? 'Chuyển khoản' : 'Tiền mặt'}
                          </span>
                        </TableCell>
                        <TableCell className='max-w-xs truncate text-muted-foreground'>
                          {text(p.noiDungCk) || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 3: DANH SÁCH CẦN THU TIỀN ================= */}
      {activeTab === 'reminders' && (
        <div className='flex flex-col gap-5'>
          <div className='rounded-2xl border bg-card p-5 shadow-sm'>
            <div className='flex items-center justify-between mb-3 border-b pb-2.5'>
              <div>
                <h3 className='text-sm font-bold text-foreground flex items-center gap-2'>
                  <BadgeAlert className='h-4 w-4 text-amber-500' />
                  Học viên hết buổi hoặc sắp hết buổi ({reminderStudents.length} học viên)
                </h3>
                <p className='text-xs text-muted-foreground mt-0.5'>
                  Danh sách này chỉ lọc các học viên đang có số buổi còn lại &le; 2 buổi để thu ngân liên hệ nhắc phụ huynh nộp học phí kỳ mới.
                </p>
              </div>
            </div>

            {reminderStudents.length === 0 ? (
              <div className='p-8 text-center text-xs text-muted-foreground'>
                🎉 Tuyệt vời! Hiện không có học sinh nào bị nợ buổi hoặc sắp hết buổi.
              </div>
            ) : (
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader>
                    <TableRow className='text-xs bg-muted/40'>
                      <TableHead>Mã</TableHead>
                      <TableHead>Họ và tên</TableHead>
                      <TableHead>Lớp học</TableHead>
                      <TableHead className='text-center'>Tình trạng số buổi</TableHead>
                      <TableHead className='text-center'>Thao tác thu tiền</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className='text-xs'>
                    {reminderStudents.map((s) => {
                      const num = Number(s.soBuoiConLai);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className='font-mono font-bold'>{text(s.ma)}</TableCell>
                          <TableCell>
                            <RecordLink to={`/hoc-vien/${s.id}`} target='_blank' className='font-bold'>
                              {text(s.hoTen)}
                            </RecordLink>
                          </TableCell>
                          <TableCell>{classNameOf(s.lopId)}</TableCell>
                          <TableCell className='text-center'>
                            {num < 0 ? (
                              <span className='inline-block rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-400'>
                                🔴 Nợ {Math.abs(num)} buổi (Vượt gói)
                              </span>
                            ) : num === 0 ? (
                              <span className='inline-block rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400'>
                                🟡 Hết buổi (0)
                              </span>
                            ) : (
                              <span className='inline-block rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400'>
                                🟡 Sắp hết ({num} buổi)
                              </span>
                            )}
                          </TableCell>
                          <TableCell className='text-center'>
                            <div className='flex items-center justify-center gap-2'>
                              <Button
                                size='sm'
                                onClick={() => {
                                  setSelectedStudentId(Number(s.id));
                                  setActiveTab('cashier');
                                }}
                                className='h-7 text-xs font-semibold bg-primary gap-1'
                              >
                                <DollarSign className='h-3 w-3' /> Thu tiền ngay
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                onClick={() => navigate(`/doi-soat?hocVienId=${s.id}`)}
                                className='h-7 text-xs gap-1'
                              >
                                <ExternalLink className='h-3 w-3' /> Đối soát
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODALS ================= */}
      {/* Modal Bán gói */}
      {sellModal.open && sellModal.student && (
        <FormDialog
          open
          title='Bán Gói Học Phí Mới'
          description={`Học viên: ${text(sellModal.student.hoTen)} (${text(sellModal.student.ma)})`}
          onClose={() => setSellModal((prev) => ({ ...prev, open: false }))}
          onSubmit={handleSellSubmit}
        >
          <TextField
            id='sell-so-buoi'
            label='Số buổi học'
            type='number'
            value={sellModal.soBuoi}
            required
            onChange={(soBuoi) => setSellModal((prev) => ({ ...prev, soBuoi }))}
          />
          <TextField
            id='sell-don-gia'
            label='Đơn giá / buổi (đ)'
            type='number'
            value={sellModal.donGia}
            required
            onChange={(donGia) => setSellModal((prev) => ({ ...prev, donGia }))}
          />
          <div className='rounded-lg bg-muted p-3 text-sm'>
            Tổng tiền học phí:{' '}
            <strong className='text-primary text-base'>
              {fmt(Number(sellModal.soBuoi) * Number(sellModal.donGia) || 0)} đ
            </strong>
          </div>
        </FormDialog>
      )}

      {/* Modal Thu tiền */}
      {payModal.open && payModal.student && (
        <FormDialog
          open
          title='Xác Nhận Thu Tiền Học Phí'
          description={`Học viên: ${text(payModal.student.hoTen)}`}
          onClose={() => setPayModal((prev) => ({ ...prev, open: false }))}
          onSubmit={handlePaySubmit}
        >
          <TextField
            id='pay-so-tien'
            label='Số tiền thu (đ)'
            type='number'
            value={payModal.soTien}
            required
            onChange={(soTien) => setPayModal((prev) => ({ ...prev, soTien }))}
          />
          <SelectField
            id='pay-hinh-thuc'
            label='Hình thức thanh toán'
            value={payModal.hinhThuc}
            onChange={(hinhThuc) => setPayModal((prev) => ({ ...prev, hinhThuc: hinhThuc as any }))}
            options={[
              { value: 'chuyen_khoan', label: 'Chuyển khoản (VietQR / Ngân hàng)' },
              { value: 'tien_mat', label: 'Tiền mặt' },
            ]}
          />
          <TextField
            id='pay-noi-dung'
            label='Nội dung chuyển khoản / Ghi chú'
            value={payModal.noiDungCk}
            onChange={(noiDungCk) => setPayModal((prev) => ({ ...prev, noiDungCk }))}
          />
          <Button
            type='button'
            variant='outline'
            onClick={() => handleOpenQr(payModal.goiHocId)}
            className='gap-2 text-xs font-semibold'
          >
            <QrCode className='h-4 w-4' /> Hiển thị mã QR thanh toán
          </Button>
        </FormDialog>
      )}

      {/* Modal hiển thị mã VietQR */}
      <Dialog open={qr !== null} onOpenChange={(open) => !open && setQr(null)}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <QrCode className='h-5 w-5 text-primary' />
              Mã VietQR Thanh Toán Nhanh
            </DialogTitle>
            <DialogDescription>
              Phụ huynh mở ứng dụng ngân hàng và quét mã để thanh toán đúng số tiền và nội dung.
            </DialogDescription>
          </DialogHeader>
          {qr === 'unset' ? (
            <p className='py-6 text-center text-sm text-destructive'>
              Chưa thiết lập tài khoản nhận tiền trong hệ thống.
            </p>
          ) : qr ? (
            <div className='flex flex-col items-center gap-4 py-2'>
              <img src={qr.url} alt='VietQR' className='max-h-72 rounded-xl shadow-md border' />
              <div className='w-full rounded-xl bg-muted p-3 text-xs space-y-1.5'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Số tiền:</span>
                  <span className='font-bold text-foreground text-sm'>{fmt(qr.soTien)} đ</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Nội dung chuyển khoản:</span>
                  <span className='font-mono font-bold text-primary'>{qr.noiDungCk}</span>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
