import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';

import { FormDialog, SelectField, TextField } from './form-parts.js';
import {
  post,
  text,
  todayVn,
  useListState,
  usePagedRows,
  type Row,
} from './kit.js';
import { ListPage } from './list-page.js';

const fmt = (value: unknown): string => Number(value).toLocaleString('vi-VN');

interface Qr {
  soTien: number;
  noiDungCk: string;
  url: string;
}

interface AuditData {
  hocVien: {
    id: number;
    ma: string;
    hoTen: string;
    lopId: number | null;
    lopTen: string | null;
    coSoId: number | null;
    coSoTen: string | null;
    soBuoiConLai: number;
    trangThai: string;
  };
  tongHop: {
    tongSoBuoiDaMua: number;
    tongSoBuoiDaHoc: number;
    soBuoiConLai: number;
    soBuoiVuotGoi: number;
    tongTienHocPhi: number;
    tongTienSach: number;
    tongDaThanhToan: number;
    tongConNo: number;
  };
  cacKyNop: {
    id: number;
    tenKy: string;
    ngayMua: string;
    soBuoi: number;
    donGia: number;
    thanhTien: number;
    daThanhToan: number;
    conNo: number;
    daDung: number;
    conLai: number;
    trangThai: string;
  }[];
  sachDaPhat: {
    id: number;
    tenSach: string;
    ngayPhat: string;
    soLuong: number;
    giaBia: number;
    thanhTien: number;
    trangThaiThanhToan: string;
  }[];
  danhSachBuoiHoc: {
    diemDanhId: number;
    buoiHocId: number;
    ngay: string;
    gioBatDau: string;
    gioKetThuc: string;
    lopTen: string;
    trangThai: string;
    daLamBtvn: boolean;
    nhanXet: string;
    yThucDiem: number | null;
    soBuoiDaTru: number;
  }[];
}

/**
 * Tuition per session: the balance of each student, selling a package, recording a payment (cash or transfer), the
 * VietQR transfer code and the ledger of every balance change. Balances and amounts are computed on the server.
 */
export default function HocPhiPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const list = useListState();
  const { loaded, total, reload } = usePagedRows('hocVien', {
    page: list.page,
    search: list.applied,
    searchFields: ['ma', 'hoTen'],
  });
  const { can: canSell } = useCan({
    resource: { type: 'composite', id: 'edu.goiHoc' },
    action: 'manage',
  });
  const { can: canPay } = useCan({
    resource: { type: 'composite', id: 'edu.thanhToan' },
    action: 'manage',
  });
  const [sell, setSell] = useState<{
    row: Row;
    soBuoi: string;
    donGia: string;
  }>();
  const [pay, setPay] = useState<{
    row: Row;
    packs: Row[];
    goiHocId: string;
    soTien: string;
    hinhThuc: string;
  }>();
  const [qr, setQr] = useState<Qr | 'unset'>();
  const [ledger, setLedger] = useState<{ row: Row; rows: Row[] }>();
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const openAudit = async (row: Row): Promise<void> => {
    setAuditLoading(true);
    try {
      const response = await api.request<{ data: AuditData }>({
        path: '/hocVien/doiSoatTongThe',
        method: 'POST',
        json: { hocVienId: row.id },
      });
      setAudit(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setAuditLoading(false);
    }
  };

  const openPay = async (row: Row): Promise<void> => {
    const response = await api.request<{ data: Row[] }>({
      path: '/goiHoc/findMany',
      method: 'POST',
      json: { filter: { hocVienId: row.id }, limit: 100 },
    });
    setPay({
      row,
      packs: response.data,
      goiHocId: '',
      soTien: '',
      hinhThuc: 'chuyen_khoan',
    });
  };
  const openQr = async (goiHocId: string): Promise<void> => {
    try {
      const response = (await post(api, '/thanhToan/vietQr', {
        goiHocId: Number(goiHocId),
      })) as {
        data: Qr;
      };
      setQr(response.data);
    } catch {
      setQr('unset');
    }
  };
  const openLedger = async (row: Row): Promise<void> => {
    const response = await api.request<{ data: Row[] }>({
      path: '/soDuNhatKy/findMany',
      method: 'POST',
      json: { filter: { hocVienId: row.id }, limit: 100 },
    });
    setLedger({ row, rows: response.data });
  };

  const exportTuitionCsv = async (): Promise<void> => {
    try {
      const res = await api.request({
        path: '/hocPhi/xuatCsv',
        method: 'POST',
        json: {},
      });
      const blob = new Blob([res as unknown as string], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hoc-phi-${todayVn()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <ListPage
        title={t('edu.hocPhi.title')}
        description={t('edu.hocPhi.description')}
        actions={
          <Button variant='outline' size='sm' onClick={() => void exportTuitionCsv()}>
            📥 Xuất CSV Học phí
          </Button>
        }
        emptyTitle={t('edu.hocVien.empty')}
        emptyHint={t('edu.hocVien.emptyHint')}
        loaded={loaded}
        onRetry={reload}
        paging={{ page: list.page, total, onPage: list.setPage }}
        search={{
          value: list.search,
          label: t('edu.common.search'),
          onChange: list.setSearch,
        }}
        columns={[
          { key: 'ma', label: t('edu.hocVien.ma') },
          {
            key: 'hoTen',
            label: t('edu.hocVien.hoTen'),
            render: (row) => (
              <RecordLink to={`/hoc-vien/${row.id}`}>
                {text(row.hoTen)}
              </RecordLink>
            ),
          },
          {
            key: 'soBuoiConLai',
            label: t('edu.diemDanh.balance'),
            render: (row) => {
              const num = Number(row.soBuoiConLai);
              if (num < 0) {
                return (
                  <StatusBadge
                    tone='neutral'
                    className='border-destructive/30 bg-destructive/10 text-destructive font-semibold'
                  >
                    🔴 Vượt {Math.abs(num)} buổi
                  </StatusBadge>
                );
              }
              if (num === 0) {
                return (
                  <StatusBadge tone='warning'>
                    🟡 Hết buổi (0)
                  </StatusBadge>
                );
              }
              if (num <= 2) {
                return (
                  <StatusBadge tone='warning'>
                    🟡 Sắp hết ({num})
                  </StatusBadge>
                );
              }
              return (
                <StatusBadge tone='success'>
                  🟢 Còn {num} buổi
                </StatusBadge>
              );
            },
          },
        ]}
        rowActions={(row) => (
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              variant='default'
              className='bg-primary/90 hover:bg-primary font-medium'
              disabled={auditLoading}
              onClick={() => void openAudit(row)}
            >
              📋 Đối soát buổi học
            </Button>
            {canSell ? (
              <Button
                size='sm'
                variant='outline'
                onClick={() => setSell({ row, soBuoi: '10', donGia: '' })}
              >
                {t('edu.hocPhi.sell')}
              </Button>
            ) : null}
            {canPay ? (
              <Button
                size='sm'
                variant='outline'
                onClick={() => void openPay(row)}
              >
                {t('edu.hocPhi.pay')}
              </Button>
            ) : null}
            <Button
              size='sm'
              variant='outline'
              onClick={() => void openLedger(row)}
            >
              {t('edu.hocPhi.ledger')}
            </Button>
          </div>
        )}
      />

      {sell ? (
        <FormDialog
          open
          title={t('edu.hocPhi.sell')}
          description={text(sell.row.hoTen)}
          onClose={() => setSell(undefined)}
          onSubmit={async () => {
            await post(api, '/goiHoc/taoMoi', {
              hocVienId: sell.row.id,
              soBuoi: Number(sell.soBuoi),
              donGia: Number(sell.donGia),
              ngayMua: todayVn(),
            });
            reload();
          }}
        >
          <TextField
            id='goi-so-buoi'
            label={t('edu.hocPhi.sessions')}
            type='number'
            value={sell.soBuoi}
            required
            onChange={(soBuoi) => setSell({ ...sell, soBuoi })}
          />
          <TextField
            id='goi-don-gia'
            label={t('edu.hocPhi.unitPrice')}
            type='number'
            value={sell.donGia}
            required
            onChange={(donGia) => setSell({ ...sell, donGia })}
          />
          <p className='text-sm text-muted-foreground'>
            {t('edu.hocPhi.total', {
              amount: fmt(Number(sell.soBuoi) * Number(sell.donGia) || 0),
            })}
          </p>
        </FormDialog>
      ) : null}

      {pay ? (
        <FormDialog
          open
          title={t('edu.hocPhi.pay')}
          description={text(pay.row.hoTen)}
          onClose={() => setPay(undefined)}
          onSubmit={async () => {
            await post(api, '/thanhToan/ghiNhan', {
              goiHocId: Number(pay.goiHocId),
              soTien: Number(pay.soTien),
              hinhThuc: pay.hinhThuc,
              ngay: todayVn(),
            });
          }}
        >
          <SelectField
            id='pay-goi'
            label={t('edu.hocPhi.package')}
            value={pay.goiHocId}
            required
            onChange={(goiHocId) => setPay({ ...pay, goiHocId })}
            options={pay.packs.map((pack) => ({
              value: String(pack.id),
              label: `${text(pack.ngayMua)} · ${text(pack.soBuoi)} · ${fmt(pack.thanhTien)}`,
            }))}
          />
          <TextField
            id='pay-so-tien'
            label={t('edu.hocPhi.amount')}
            type='number'
            value={pay.soTien}
            required
            onChange={(soTien) => setPay({ ...pay, soTien })}
          />
          <SelectField
            id='pay-hinh-thuc'
            label={t('edu.hocPhi.method')}
            value={pay.hinhThuc}
            onChange={(hinhThuc) => setPay({ ...pay, hinhThuc })}
            options={[
              { value: 'tien_mat', label: t('edu.hocPhi.cash') },
              { value: 'chuyen_khoan', label: t('edu.hocPhi.transfer') },
            ]}
          />
          <Button
            type='button'
            variant='outline'
            disabled={!pay.goiHocId}
            onClick={() => void openQr(pay.goiHocId)}
          >
            {t('edu.hocPhi.qr')}
          </Button>
        </FormDialog>
      ) : null}

      <Dialog
        open={qr !== undefined}
        onOpenChange={(open) => (open ? undefined : setQr(undefined))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('edu.hocPhi.qr')}</DialogTitle>
            <DialogDescription>
              {qr === 'unset'
                ? t('edu.hocPhi.qrUnset')
                : qr
                  ? t('edu.hocPhi.qrHint', { amount: fmt(qr.soTien) })
                  : ''}
            </DialogDescription>
          </DialogHeader>
          {qr && qr !== 'unset' ? (
            <div className='flex flex-col items-center gap-3'>
              <img src={qr.url} alt={t('edu.hocPhi.qr')} className='max-h-80' />
              <p className='text-sm'>
                {t('edu.hocPhi.content')}: <strong>{qr.noiDungCk}</strong>
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={audit !== null}
        onOpenChange={(open) => (open ? undefined : setAudit(null))}
      >
        <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
          <DialogHeader className='flex flex-row items-center justify-between border-b pb-4'>
            <div>
              <DialogTitle className='text-xl font-bold text-foreground'>
                📋 Bảng Kê Đối Soát Buổi Học & Kỳ Nộp Học Phí
              </DialogTitle>
              <DialogDescription className='mt-1 text-sm text-muted-foreground'>
                {audit ? (
                  <span>
                    Học viên: <strong>{audit.hocVien.hoTen}</strong> ({audit.hocVien.ma})
                    {audit.hocVien.lopTen ? ` · Lớp: ${audit.hocVien.lopTen}` : ''}
                    {audit.hocVien.coSoTen ? ` · Cơ sở: ${audit.hocVien.coSoTen}` : ''}
                  </span>
                ) : null}
              </DialogDescription>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => window.print()}
              className='gap-1.5'
            >
              🖨️ In phiếu đối soát
            </Button>
          </DialogHeader>

          {audit ? (
            <div className='flex flex-col gap-6 py-4'>
              {/* Khối KPI tổng hợp */}
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                <div className='rounded-lg border bg-card p-3 shadow-sm'>
                  <p className='text-xs text-muted-foreground'>Tổng buổi đã nộp</p>
                  <p className='text-xl font-bold text-primary'>
                    {audit.tongHop.tongSoBuoiDaMua} buổi
                  </p>
                </div>
                <div className='rounded-lg border bg-card p-3 shadow-sm'>
                  <p className='text-xs text-muted-foreground'>Tổng buổi đã học</p>
                  <p className='text-xl font-bold text-foreground'>
                    {audit.tongHop.tongSoBuoiDaHoc} buổi
                  </p>
                </div>
                <div className='rounded-lg border bg-card p-3 shadow-sm'>
                  <p className='text-xs text-muted-foreground'>Số buổi còn lại</p>
                  <p className={`text-xl font-bold ${audit.tongHop.soBuoiConLai < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {audit.tongHop.soBuoiConLai < 0
                      ? `🔴 Vượt ${audit.tongHop.soBuoiVuotGoi} buổi`
                      : `🟢 Còn ${audit.tongHop.soBuoiConLai} buổi`}
                  </p>
                  {audit.tongHop.soBuoiConLai < 0 ? (
                    <span className='text-[11px] text-destructive'>Chưa nộp học phí kỳ mới</span>
                  ) : null}
                </div>
                <div className='rounded-lg border bg-card p-3 shadow-sm'>
                  <p className='text-xs text-muted-foreground'>Tình trạng học phí</p>
                  <p className='text-sm font-semibold'>
                    Đã nộp: {fmt(audit.tongHop.tongDaThanhToan)} đ
                  </p>
                  {audit.tongHop.tongConNo > 0 ? (
                    <p className='text-xs text-destructive font-medium'>
                      Còn nợ: {fmt(audit.tongHop.tongConNo)} đ
                    </p>
                  ) : (
                    <p className='text-xs text-emerald-600 font-medium'>Đã hoàn thành</p>
                  )}
                  {audit.tongHop.tongTienSach > 0 ? (
                    <p className='text-[11px] text-muted-foreground mt-0.5'>
                      Tiền sách: {fmt(audit.tongHop.tongTienSach)} đ
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Bảng 1: Danh sách các kỳ nộp học phí */}
              <div>
                <h3 className='mb-2 text-sm font-bold uppercase tracking-wide text-foreground/80 flex items-center gap-1.5'>
                  💳 Danh sách các kỳ nộp học phí ({audit.cacKyNop.length} kỳ)
                </h3>
                {audit.cacKyNop.length === 0 ? (
                  <p className='rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground'>
                    Chưa có gói/kỳ nộp học phí nào được tạo.
                  </p>
                ) : (
                  <div className='overflow-x-auto rounded-md border'>
                    <Table>
                      <TableHeader>
                        <TableRow className='bg-muted/50 text-xs'>
                          <TableHead>Tên kỳ / Gói</TableHead>
                          <TableHead>Ngày mua</TableHead>
                          <TableHead className='text-center'>Số buổi</TableHead>
                          <TableHead className='text-right'>Học phí</TableHead>
                          <TableHead className='text-right'>Đã nộp</TableHead>
                          <TableHead className='text-right'>Còn thiếu</TableHead>
                          <TableHead className='text-center'>Đã dùng</TableHead>
                          <TableHead className='text-center'>Còn lại</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className='text-xs'>
                        {audit.cacKyNop.map((ky) => (
                          <TableRow key={ky.id}>
                            <TableCell className='font-medium'>{ky.tenKy}</TableCell>
                            <TableCell>{ky.ngayMua}</TableCell>
                            <TableCell className='text-center font-bold'>{ky.soBuoi}</TableCell>
                            <TableCell className='text-right'>{fmt(ky.thanhTien)} đ</TableCell>
                            <TableCell className='text-right text-emerald-600 font-medium'>
                              {fmt(ky.daThanhToan)} đ
                            </TableCell>
                            <TableCell className={`text-right font-medium ${ky.conNo > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {ky.conNo > 0 ? `${fmt(ky.conNo)} đ` : '0 đ'}
                            </TableCell>
                            <TableCell className='text-center'>{ky.daDung}</TableCell>
                            <TableCell className='text-center font-bold text-primary'>
                              {ky.conLai}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Bảng 2: Sách đã phát */}
              {audit.sachDaPhat.length > 0 ? (
                <div>
                  <h3 className='mb-2 text-sm font-bold uppercase tracking-wide text-foreground/80 flex items-center gap-1.5'>
                    📚 Sách & Giáo trình đã phát ({audit.sachDaPhat.length} đầu sách)
                  </h3>
                  <div className='overflow-x-auto rounded-md border'>
                    <Table>
                      <TableHeader>
                        <TableRow className='bg-muted/50 text-xs'>
                          <TableHead>Tên sách</TableHead>
                          <TableHead>Ngày phát</TableHead>
                          <TableHead className='text-center'>Số lượng</TableHead>
                          <TableHead className='text-right'>Giá bìa</TableHead>
                          <TableHead className='text-right'>Thành tiền</TableHead>
                          <TableHead className='text-center'>Thanh toán</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className='text-xs'>
                        {audit.sachDaPhat.map((sach) => (
                          <TableRow key={sach.id}>
                            <TableCell className='font-medium'>{sach.tenSach}</TableCell>
                            <TableCell>{sach.ngayPhat}</TableCell>
                            <TableCell className='text-center'>{sach.soLuong}</TableCell>
                            <TableCell className='text-right'>{fmt(sach.giaBia)} đ</TableCell>
                            <TableCell className='text-right font-medium'>{fmt(sach.thanhTien)} đ</TableCell>
                            <TableCell className='text-center'>
                              <StatusBadge tone={sach.trangThaiThanhToan === 'da_thanh_toan' ? 'success' : 'warning'}>
                                {sach.trangThaiThanhToan === 'da_thanh_toan' ? 'Đã thu' : 'Chưa thu'}
                              </StatusBadge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}

              {/* Bảng 3: Chi tiết từng buổi học (Audit Trail) */}
              <div>
                <h3 className='mb-2 text-sm font-bold uppercase tracking-wide text-foreground/80 flex items-center justify-between'>
                  <span className='flex items-center gap-1.5'>
                    📅 Lịch sử chi tiết các buổi học ({audit.danhSachBuoiHoc.length} buổi)
                  </span>
                  <span className='text-xs normal-case text-muted-foreground'>
                    Đối soát chính xác từng buổi điểm danh và nhận xét của giáo viên
                  </span>
                </h3>
                {audit.danhSachBuoiHoc.length === 0 ? (
                  <p className='rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground'>
                    Chưa có buổi học nào được ghi nhận điểm danh.
                  </p>
                ) : (
                  <div className='max-h-72 overflow-y-auto rounded-md border'>
                    <Table>
                      <TableHeader className='sticky top-0 bg-muted/80 backdrop-blur z-10'>
                        <TableRow className='text-xs'>
                          <TableHead className='w-10 text-center'>STT</TableHead>
                          <TableHead>Ngày & Giờ</TableHead>
                          <TableHead>Lớp</TableHead>
                          <TableHead className='text-center'>Trạng thái</TableHead>
                          <TableHead className='text-center'>BTVN</TableHead>
                          <TableHead className='text-center'>Ý thức</TableHead>
                          <TableHead>Nhận xét giáo viên</TableHead>
                          <TableHead className='text-center'>Trừ buổi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className='text-xs'>
                        {audit.danhSachBuoiHoc.map((buoi, idx) => (
                          <TableRow key={buoi.diemDanhId}>
                            <TableCell className='text-center text-muted-foreground font-mono'>
                              {idx + 1}
                            </TableCell>
                            <TableCell className='whitespace-nowrap font-medium'>
                              {buoi.ngay} <span className='text-muted-foreground'>({buoi.gioBatDau?.slice(0, 5)})</span>
                            </TableCell>
                            <TableCell>{buoi.lopTen}</TableCell>
                            <TableCell className='text-center'>
                              <StatusBadge
                                tone={
                                  buoi.trangThai === 'co_mat' || buoi.trangThai === 'hoc_bu'
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
                              {buoi.daLamBtvn ? '✅' : '❌'}
                            </TableCell>
                            <TableCell className='text-center font-bold'>
                              {buoi.yThucDiem != null ? `${buoi.yThucDiem}/10` : '—'}
                            </TableCell>
                            <TableCell className='max-w-xs truncate' title={buoi.nhanXet}>
                              {buoi.nhanXet || '—'}
                            </TableCell>
                            <TableCell className='text-center font-bold text-destructive'>
                              {buoi.soBuoiDaTru > 0 ? `-${buoi.soBuoiDaTru}` : '0'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
