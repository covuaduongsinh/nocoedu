import { copyText, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Textarea } from '#components/ui/textarea';

import { SelectField, TextField } from './form-parts.js';
import { post, text, todayVn, useErrorMessage, useRows, type Row } from './kit.js';

/**
 * Monthly comments. A coach writes one comment per student for the month; "Export text" builds the message to paste
 * into Zalo (there is no Zalo integration) and the export is logged on the server.
 */
export default function NhanXetPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const students = useRows('hocVien');
  const { can: canWrite } = useCan({
    resource: { type: 'composite', id: 'edu.nhanXet' },
    action: 'write',
  });
  // What the comment is about: a month, the periodic review after five sessions (`K1`…`K9`) or the year-end summary
  // (`CN`). The server keeps it in one key (`2026-05`, `2026-K3`, `2026-CN`).
  const [kind, setKind] = useState<'thang' | 'dinhKy' | 'cuoiNam'>('thang');
  const [monthValue, setMonthValue] = useState(() => todayVn().slice(0, 7));
  const [year, setYear] = useState(() => todayVn().slice(0, 4));
  const [round, setRound] = useState('1');
  const month =
    kind === 'thang'
      ? monthValue
      : kind === 'dinhKy'
        ? `${year}-K${round}`
        : `${year}-CN`;
  const periodValid = /^\d{4}-(0[1-9]|1[0-2]|K[1-9]|CN)$/u.test(month);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<Record<number, 'saved' | 'error'>>({});
  const [exported, setExported] = useState<{ ma: string; vanBan: string }[]>();
  const [error, setError] = useState<string>();
  const [historyModal, setHistoryModal] = useState<{
    student: Row;
    data: {
      danhSach: {
        diemDanhId: number;
        buoiHocId: number;
        ngay: string;
        gioBatDau: string;
        lopTen: string;
        trangThai: string;
        daLamBtvn: boolean;
        nhanXet: string;
        yThucDiem: number | null;
      }[];
      thongKe: {
        tongBuoi: number;
        soBuoiCoMat: number;
        soBuoiVang: number;
        tyLeLamBtvn: number;
        diemYThucTb: number | null;
        cacNhanXet: string[];
      };
    };
  } | null>(null);
  const [aiLoading, setAiLoading] = useState<Record<number, boolean>>({});

  const generateAiReview = async (student: Row): Promise<void> => {
    setAiLoading((prev) => ({ ...prev, [student.id]: true }));
    try {
      const res = await api.request<{ data: { goiY: string } }>({
        path: '/nhanXet/aiGoiY',
        method: 'POST',
        json: { hocVienId: student.id, thang: month },
      });
      setDrafts((prev) => ({ ...prev, [student.id]: res.data.goiY }));
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading((prev) => ({ ...prev, [student.id]: false }));
    }
  };

  const openHistory = async (student: Row): Promise<void> => {
    try {
      const res = await api.request<{
        data: {
          danhSach: {
            diemDanhId: number;
            buoiHocId: number;
            ngay: string;
            gioBatDau: string;
            lopTen: string;
            trangThai: string;
            daLamBtvn: boolean;
            nhanXet: string;
            yThucDiem: number | null;
          }[];
          thongKe: {
            tongBuoi: number;
            soBuoiCoMat: number;
            soBuoiVang: number;
            tyLeLamBtvn: number;
            diemYThucTb: number | null;
            cacNhanXet: string[];
          };
        };
      }>({
        path: '/nhanXet/lichSuBuoiHoc',
        method: 'POST',
        json: { hocVienId: student.id, thang: month },
      });
      setHistoryModal({ student, data: res.data });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!periodValid) return;
    let live = true;
    api
      .request<{ data: Record<string, unknown>[] }>({
        path: '/nhanXetThang/findMany',
        method: 'POST',
        json: { filter: { thang: month }, limit: 100 },
      })
      .then((response) => {
        if (!live) return;
        setDrafts(
          Object.fromEntries(
            response.data.map((row) => [
              Number(row.hocVienId),
              text(row.noiDung),
            ]),
          ),
        );
        setStatus({});
      })
      .catch(() => {
        if (live) setDrafts({});
      });
    return () => {
      live = false;
    };
  }, [api, month, periodValid]);

  const rows =
    students.loaded.state === 'ready'
      ? students.loaded.rows.filter((r) => r.trangThai === 'dang_hoc')
      : [];

  const save = async (id: number): Promise<void> => {
    const noiDung = (drafts[id] ?? '').trim();
    if (!noiDung) return;
    if (!periodValid) return;
    try {
      await post(api, '/nhanXet/luu', { hocVienId: id, thang: month, noiDung });
      setStatus((s) => ({ ...s, [id]: 'saved' }));
    } catch {
      setStatus((s) => ({ ...s, [id]: 'error' }));
    }
  };
  const exportText = async (): Promise<void> => {
    setError(undefined);
    try {
      const response = (await post(api, '/nhanXet/xuatVanBan', {
        thang: month,
      })) as {
        data: { danhSach: { ma: string; vanBan: string }[] };
      };
      setExported(response.data.danhSach);
    } catch (cause) {
      setError(message(cause));
    }
  };

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <PageHeader
        title={t('edu.nhanXet.title')}
        description={t('edu.nhanXet.description')}
        actions={
          <Button variant='outline' onClick={() => void exportText()}>
            {t('edu.nhanXet.export')}
          </Button>
        }
      />
      <div className='grid max-w-xl gap-3 sm:grid-cols-3'>
        <SelectField
          id='nx-kind'
          label={t('edu.nhanXet.kindLabel')}
          value={kind}
          onChange={(value) => setKind(value as typeof kind)}
          options={[
            { value: 'thang', label: t('edu.nhanXet.kind.thang') },
            { value: 'dinhKy', label: t('edu.nhanXet.kind.dinhKy') },
            { value: 'cuoiNam', label: t('edu.nhanXet.kind.cuoiNam') },
          ]}
        />
        {kind === 'thang' ? (
          <TextField
            id='nx-month'
            label={t('edu.nhanXet.month')}
            type='month'
            value={monthValue}
            onChange={setMonthValue}
          />
        ) : (
          <TextField
            id='nx-year'
            label={t('edu.nhanXet.year')}
            type='number'
            value={year}
            onChange={setYear}
          />
        )}
        {kind === 'dinhKy' ? (
          <SelectField
            id='nx-round'
            label={t('edu.nhanXet.round')}
            value={round}
            onChange={setRound}
            options={['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => ({
              value: n,
              label: n,
            }))}
          />
        ) : null}
      </div>
      {kind !== 'thang' ? (
        <p className='text-sm text-muted-foreground'>
          {t('edu.nhanXet.template')}
        </p>
      ) : null}
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      {students.loaded.state === 'loading' ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      ) : rows.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('edu.hocVien.empty')}
        </p>
      ) : (
        <ul className='flex flex-col gap-4'>
          {rows.map((student) => (
            <li
              key={student.id}
              className='flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm'
            >
              <div className='flex flex-wrap items-center justify-between gap-2 border-b pb-2'>
                <div className='flex items-center gap-2'>
                  <label
                    htmlFor={`nx-${student.id}`}
                    className='text-base font-bold text-foreground'
                  >
                    {text(student.hoTen)}
                  </label>
                  <span className='rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'>
                    {text(student.ma)}
                  </span>
                </div>
                <div className='flex items-center gap-1.5'>
                  <Button
                    size='sm'
                    type='button'
                    variant='outline'
                    onClick={() => void openHistory(student)}
                    className='h-7 text-xs font-medium gap-1'
                  >
                    🔍 Xem lịch sử {month}
                  </Button>
                  {canWrite ? (
                    <Button
                      size='sm'
                      type='button'
                      variant='default'
                      disabled={aiLoading[student.id]}
                      onClick={() => void generateAiReview(student)}
                      className='h-7 text-xs font-medium gap-1 bg-violet-600 hover:bg-violet-700 text-white'
                    >
                      {aiLoading[student.id] ? '⏳ Đang phân tích...' : '✨ AI Gợi ý nhận xét'}
                    </Button>
                  ) : null}
                </div>
              </div>

              <Textarea
                id={`nx-${student.id}`}
                value={drafts[student.id] ?? ''}
                rows={4}
                placeholder={
                  kind === 'thang'
                    ? 'Nhập nhận xét tháng hoặc bấm "✨ AI Gợi ý nhận xét" để hệ thống tự động tổng hợp từ các buổi học...'
                    : t('edu.nhanXet.templateText')
                }
                maxLength={3000}
                disabled={!canWrite}
                onChange={(event) =>
                  setDrafts((d) => ({ ...d, [student.id]: event.target.value }))
                }
              />
              {canWrite ? (
                <div className='flex items-center justify-between pt-1'>
                  <div className='flex items-center gap-3'>
                    <Button size='sm' onClick={() => void save(student.id)}>
                      {t('edu.common.save')}
                    </Button>
                    {status[student.id] === 'saved' ? (
                      <span className='text-xs font-medium text-emerald-600 flex items-center gap-1'>
                        ✅ Đã lưu nhận xét
                      </span>
                    ) : null}
                    {status[student.id] === 'error' ? (
                      <span role='alert' className='text-xs font-medium text-destructive'>
                        {t('edu.common.saveError')}
                      </span>
                    ) : null}
                  </div>
                  <span className='text-[11px] text-muted-foreground'>
                    {(drafts[student.id] ?? '').length}/3000 ký tự
                  </span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={exported !== undefined}
        onOpenChange={(open) => (open ? undefined : setExported(undefined))}
      >
        <DialogContent className='max-h-[80vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>{t('edu.nhanXet.export')}</DialogTitle>
            <DialogDescription>{t('edu.nhanXet.exportHint')}</DialogDescription>
          </DialogHeader>
          {exported && exported.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('edu.nhanXet.none')}
            </p>
          ) : null}
          {exported?.map((item) => (
            <div key={item.ma} className='flex flex-col gap-2'>
              <Textarea
                readOnly
                value={item.vanBan}
                rows={8}
                aria-label={item.ma}
              />
              <Button
                size='sm'
                variant='outline'
                onClick={() => void copyText(item.vanBan)}
              >
                {t('edu.nhanXet.copy')}
              </Button>
            </div>
          ))}
        </DialogContent>
      </Dialog>

      <Dialog
        open={historyModal !== null}
        onOpenChange={(open) => (open ? undefined : setHistoryModal(null))}
      >
        <DialogContent className='max-w-2xl max-h-[85vh] overflow-y-auto'>
          <DialogHeader className='border-b pb-3'>
            <DialogTitle className='text-lg font-bold'>
              📋 Lịch Sử Nhận Xét Các Buổi Học ({month})
            </DialogTitle>
            <DialogDescription>
              {historyModal ? (
                <span>
                  Học viên: <strong>{text(historyModal.student.hoTen)}</strong> ({text(historyModal.student.ma)})
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {historyModal ? (
            <div className='flex flex-col gap-4 py-2'>
              {/* Thống kê chỉ số */}
              <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                <div className='rounded-md border bg-muted/40 p-2 text-center'>
                  <span className='block text-[11px] text-muted-foreground'>Số buổi tham gia</span>
                  <span className='font-bold text-sm text-foreground'>
                    {historyModal.data.thongKe.soBuoiCoMat}/{historyModal.data.thongKe.tongBuoi} buổi
                  </span>
                </div>
                <div className='rounded-md border bg-muted/40 p-2 text-center'>
                  <span className='block text-[11px] text-muted-foreground'>Số buổi vắng</span>
                  <span className={`font-bold text-sm ${historyModal.data.thongKe.soBuoiVang > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {historyModal.data.thongKe.soBuoiVang} buổi
                  </span>
                </div>
                <div className='rounded-md border bg-muted/40 p-2 text-center'>
                  <span className='block text-[11px] text-muted-foreground'>Tỷ lệ làm BTVN</span>
                  <span className='font-bold text-sm text-primary'>
                    {historyModal.data.thongKe.tyLeLamBtvn}%
                  </span>
                </div>
                <div className='rounded-md border bg-muted/40 p-2 text-center'>
                  <span className='block text-[11px] text-muted-foreground'>Điểm ý thức TB</span>
                  <span className='font-bold text-sm text-amber-600'>
                    {historyModal.data.thongKe.diemYThucTb != null ? `${historyModal.data.thongKe.diemYThucTb}/10` : '—'}
                  </span>
                </div>
              </div>

              {/* Dòng thời gian chi tiết các buổi */}
              <div>
                <h4 className='mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground'>
                  Ghi chú & Nhận xét từng buổi của giáo viên
                </h4>
                {historyModal.data.danhSach.length === 0 ? (
                  <p className='rounded border border-dashed p-4 text-center text-xs text-muted-foreground'>
                    Không có buổi học nào trong giai đoạn này.
                  </p>
                ) : (
                  <div className='flex flex-col gap-2'>
                    {historyModal.data.danhSach.map((buoi) => (
                      <div
                        key={buoi.diemDanhId}
                        className='rounded-lg border bg-card p-3 text-xs flex flex-col gap-1'
                      >
                        <div className='flex items-center justify-between font-medium'>
                          <span className='text-foreground font-semibold'>
                            📅 {buoi.ngay} ({buoi.gioBatDau?.slice(0, 5)}) · {buoi.lopTen}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            buoi.trangThai === 'co_mat' || buoi.trangThai === 'hoc_bu'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-destructive/10 text-destructive'
                          }`}>
                            {buoi.trangThai === 'co_mat' ? 'Có mặt' : buoi.trangThai === 'hoc_bu' ? 'Học bù' : 'Vắng'}
                          </span>
                        </div>
                        <div className='flex items-center gap-3 text-muted-foreground text-[11px]'>
                          <span>BTVN: {buoi.daLamBtvn ? '✅ Đã làm' : '❌ Chưa làm'}</span>
                          {buoi.yThucDiem != null ? <span>Ý thức: <strong>{buoi.yThucDiem}/10</strong></span> : null}
                        </div>
                        <div className='mt-1 rounded bg-muted/50 p-2 text-foreground font-sans'>
                          💬 {buoi.nhanXet ? buoi.nhanXet : <em className='text-muted-foreground'>Không có ghi chú riêng</em>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
