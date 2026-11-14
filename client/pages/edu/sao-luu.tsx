import { useApiClient } from '@nocobase/app-client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#components/ui/card';
import { Input } from '#components/ui/input';

import { todayVn } from './kit.js';

interface BackupData {
  phienBan: string;
  thoiGianTao: string;
  ngayVn: string;
  tongSoBang: number;
  soBanGhi: number;
  duLieu: Record<string, unknown[]>;
}

export default function SaoLuuPage(): ReactElement {
  const api = useApiClient();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupData | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Tạo và tải về file sao lưu JSON
  const handleExportBackup = async (): Promise<void> => {
    setExporting(true);
    setStatusMessage(null);
    try {
      const res = await api.request<{ data: BackupData }>({
        path: '/heThong/backup/exportJson',
        method: 'POST',
        json: {},
      });
      const dataStr = JSON.stringify(res.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nocoedu-backup-${todayVn()}-${Date.now().toString().slice(-4)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMessage({
        type: 'success',
        text: `Đã tạo và tải bản sao lưu thành công (${res.data.soBanGhi} bản ghi trên ${res.data.tongSoBang} bảng dữ liệu).`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Lỗi sao lưu: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setExporting(false);
    }
  };

  // Đọc file sao lưu người dùng chọn
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setStatusMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string) as BackupData;
        if (parsed.duLieu && typeof parsed.duLieu === 'object') {
          setPreview(parsed);
        } else {
          setStatusMessage({ type: 'error', text: 'File không đúng định dạng sao lưu của NocoEdu.' });
        }
      } catch {
        setStatusMessage({ type: 'error', text: 'Không thể đọc nội dung file JSON.' });
      }
    };
    reader.readAsText(file);
  };

  // Khôi phục dữ liệu
  const handleRestore = async (): Promise<void> => {
    if (!preview || confirmText !== 'XAC_NHAN_KHOI_PHUC') return;
    setImporting(true);
    setStatusMessage(null);
    try {
      const res = await api.request<{ data: { tongKhoiPhuc: number; thongBao: string } }>({
        path: '/heThong/backup/importJson',
        method: 'POST',
        json: {
          data: preview.duLieu,
          xacNhan: 'XAC_NHAN_KHOI_PHUC',
        },
      });
      setStatusMessage({
        type: 'success',
        text: res.data.thongBao,
      });
      setSelectedFile(null);
      setPreview(null);
      setConfirmText('');
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Lỗi khôi phục: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-5xl py-6'>
      <PageHeader
        title='Sao Lưu & Khôi Phục Dữ Liệu'
        description='Quản lý sao lưu an toàn toàn bộ cơ sở dữ liệu hệ thống, xuất nhập dữ liệu và phục hồi khi cần thiết.'
      />

      {statusMessage ? (
        <div
          className={`mb-6 rounded-lg border p-4 text-sm font-medium ${
            statusMessage.type === 'success'
              ? 'border-emerald-500/20 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-destructive/20 bg-destructive/10 text-destructive'
          }`}
        >
          {statusMessage.text}
        </div>
      ) : null}

      <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
        {/* Card 1: Sao lưu toàn hệ thống */}
        <Card className='shadow-xs'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base font-bold'>
              📦 Sao Lưu Cơ Sở Dữ Liệu (Backup)
            </CardTitle>
            <CardDescription className='text-xs'>
              Tạo bản chụp an toàn toàn bộ các bảng: Học viên, Phụ huynh, Lớp học, Điểm danh, Kỳ học phí, Sách, Tuyển sinh...
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4 text-sm'>
            <div className='rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5'>
              <p className='font-semibold text-foreground'>🛡️ Lợi ích khi sao lưu định kỳ:</p>
              <ul className='list-disc pl-4 space-y-0.5'>
                <li>Bảo vệ số liệu điểm danh và đối soát học phí.</li>
                <li>Lưu trữ offline an toàn trên máy tính cá nhân.</li>
                <li>Dễ dàng di chuyển hoặc phục hồi khi nâng cấp máy chủ.</li>
              </ul>
            </div>

            <Button
              onClick={() => void handleExportBackup()}
              disabled={exporting}
              className='gap-2 bg-primary hover:bg-primary/90 font-medium'
            >
              {exporting ? '⏳ Đang tạo bản sao lưu...' : '⬇️ Tải Về Bản Sao Lưu (.json)'}
            </Button>
          </CardContent>
        </Card>

        {/* Card 2: Khôi phục dữ liệu */}
        <Card className='shadow-xs'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base font-bold text-destructive'>
              🔄 Khôi Phục Dữ Liệu (Restore)
            </CardTitle>
            <CardDescription className='text-xs'>
              Khôi phục lại cơ sở dữ liệu từ file sao lưu JSON trước đó.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4 text-sm'>
            <div>
              <label className='mb-1.5 block text-xs font-medium text-foreground'>
                Chọn file sao lưu (.json)
              </label>
              <Input
                type='file'
                accept='.json'
                onChange={handleFileChange}
                className='cursor-pointer text-xs'
              />
            </div>

            {preview ? (
              <div className='rounded-lg border bg-muted/40 p-3 text-xs space-y-1.5'>
                <p className='font-bold text-foreground'>📋 Thông tin file sao lưu:</p>
                <p>• Ngày tạo: {preview.ngayVn || preview.thoiGianTao?.slice(0, 10)}</p>
                <p>• Số lượng bản ghi: <span className='font-semibold text-primary'>{preview.soBanGhi}</span> bản ghi</p>
                <p>• Số bảng dữ liệu: {preview.tongSoBang} bảng</p>

                <div className='pt-2 border-t mt-2'>
                  <label className='mb-1 block font-semibold text-destructive'>
                    Nhập chữ <code className='rounded bg-muted px-1 py-0.5 text-xs text-destructive'>XAC_NHAN_KHOI_PHUC</code> để tiếp tục:
                  </label>
                  <Input
                    placeholder='XAC_NHAN_KHOI_PHUC'
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className='h-8 text-xs font-mono font-bold'
                  />
                </div>

                <Button
                  variant='destructive'
                  size='sm'
                  disabled={confirmText !== 'XAC_NHAN_KHOI_PHUC' || importing}
                  onClick={() => void handleRestore()}
                  className='w-full mt-2 font-medium'
                >
                  {importing ? '⏳ Đang khôi phục dữ liệu...' : '⚠️ Thực Hiện Khôi Phục'}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
