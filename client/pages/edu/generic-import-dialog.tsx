import { useApiClient } from '@nocobase/app-client';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';

import { post, useErrorMessage } from './kit.js';

export interface GenericImportDialogProps {
  readonly entity:
    | 'lop'
    | 'coSo'
    | 'hoSoGv'
    | 'sach'
    | 'phatSach'
    | 'goiHoc'
    | 'diemDanh'
    | 'tuyenSinh';
  readonly title: string;
  readonly buttonLabel?: string;
  readonly variant?: 'outline' | 'default' | 'secondary';
  readonly onSuccess?: () => void;
}

interface PreviewRow {
  line: number;
  data: Record<string, string>;
  isValid: boolean;
  errors: string[];
}

interface PreviewReport {
  totalRows: number;
  validCount: number;
  errorCount: number;
  rows: PreviewRow[];
}

export function GenericImportDialog({
  entity,
  title,
  buttonLabel = 'Nhập từ CSV',
  variant = 'outline',
  onSuccess,
}: GenericImportDialogProps): ReactElement {
  const api = useApiClient();
  const message = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [csvContent, setCsvContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [busy, setBusy] = useState<'template' | 'preview' | 'commit'>();
  const [preview, setPreview] = useState<PreviewReport>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();

  const reset = () => {
    setCsvContent('');
    setFileName('');
    setPreview(undefined);
    setSuccessMessage(undefined);
    setErrorMessage(undefined);
    setBusy(undefined);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) reset();
  };

  // Tải mẫu CSV
  const handleDownloadTemplate = async () => {
    try {
      setBusy('template');
      setErrorMessage(undefined);
      const res = await api.request<{ data: { entity: string; name: string; csv: string } }>({
        path: `/edu/import/mau/${entity}`,
        method: 'GET',
      });
      const data = res?.data;
      if (data?.csv) {
        const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `mau_import_${entity}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setErrorMessage(message(err));
    } finally {
      setBusy(undefined);
    }
  };

  // Đọc file CSV
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setPreview(undefined);
    setSuccessMessage(undefined);
    setErrorMessage(undefined);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      setCsvContent(text);
    };
    reader.onerror = () => {
      setErrorMessage('Không thể đọc nội dung file');
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Kiểm tra & xem trước
  const handlePreview = async () => {
    if (!csvContent) {
      setErrorMessage('Vui lòng chọn file CSV');
      return;
    }
    try {
      setBusy('preview');
      setErrorMessage(undefined);
      const res = (await post(api, `/edu/import/xem-truoc/${entity}`, {
        csv: csvContent,
      })) as { data: PreviewReport };
      setPreview(res?.data);
    } catch (err) {
      setErrorMessage(message(err));
    } finally {
      setBusy(undefined);
    }
  };

  // Xác nhận nạp
  const handleCommit = async () => {
    if (!csvContent) return;
    try {
      setBusy('commit');
      setErrorMessage(undefined);
      const res = (await post(api, `/edu/import/xac-nhan/${entity}`, {
        csv: csvContent,
      })) as {
        data: { totalRows: number; importedCount: number; message: string };
      };
      const data = res?.data;
      setSuccessMessage(data?.message || 'Đã nạp dữ liệu thành công!');
      setPreview(undefined);
      setCsvContent('');
      if (onSuccess) onSuccess();
    } catch (err) {
      setErrorMessage(message(err));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      <Button variant={variant} size='sm' onClick={() => setOpen(true)} className='gap-2 shadow-sm font-medium'>
        <Upload className='h-4 w-4' />
        {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className='max-w-3xl max-h-[90vh] flex flex-col p-6'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-xl font-bold'>
              <FileSpreadsheet className='h-5 w-5 text-emerald-600' />
              {title}
            </DialogTitle>
            <DialogDescription>
              Tải mẫu CSV chuẩn, điền dữ liệu theo các cột quy định, sau đó tải lên để hệ thống tự động kiểm tra và nhập liệu.
            </DialogDescription>
          </DialogHeader>

          <div className='flex-1 overflow-y-auto space-y-5 py-2 pr-1'>
            {/* Bước 1: Tải mẫu */}
            <div className='bg-muted/40 rounded-lg p-4 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3'>
              <div>
                <p className='font-semibold text-sm'>Bước 1: Tải file mẫu CSV</p>
                <p className='text-xs text-muted-foreground mt-0.5'>
                  File mẫu chứa đúng định dạng cột và dữ liệu minh họa chuẩn tiếng Việt (UTF-8).
                </p>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void handleDownloadTemplate()}
                disabled={busy === 'template'}
                className='gap-1.5 shrink-0'
              >
                {busy === 'template' ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <Download className='h-4 w-4 text-primary' />
                )}
                Tải file mẫu CSV
              </Button>
            </div>

            {/* Bước 2: Chọn file */}
            <div className='space-y-2'>
              <Label htmlFor='csv-upload' className='font-semibold text-sm'>
                Bước 2: Chọn tập tin CSV cần nhập
              </Label>
              <div className='flex items-center gap-3'>
                <Input
                  id='csv-upload'
                  type='file'
                  accept='.csv,text/csv'
                  onChange={handleFileChange}
                  className='cursor-pointer'
                />
                {csvContent && !preview && !successMessage && (
                  <Button
                    onClick={() => void handlePreview()}
                    disabled={busy === 'preview'}
                    className='gap-2 shrink-0 bg-primary font-semibold'
                  >
                    {busy === 'preview' && <Loader2 className='h-4 w-4 animate-spin' />}
                    Kiểm tra dữ liệu
                  </Button>
                )}
              </div>
              {fileName && (
                <p className='text-xs text-muted-foreground'>
                  Đã nạp file: <span className='font-medium text-foreground'>{fileName}</span>
                </p>
              )}
            </div>

            {/* Báo lỗi nếu có */}
            {errorMessage && (
              <div className='p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md flex items-center gap-2'>
                <AlertCircle className='h-4 w-4 shrink-0' />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Báo thành công */}
            {successMessage && (
              <div className='p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-md flex items-center gap-3'>
                <CheckCircle2 className='h-5 w-5 shrink-0' />
                <div className='space-y-1'>
                  <p className='font-semibold'>{successMessage}</p>
                  <p className='text-xs'>Dữ liệu đã được nạp thành công và cập nhật vào hệ thống.</p>
                </div>
              </div>
            )}

            {/* Bước 3: Xem trước kết quả kiểm tra */}
            {preview && (
              <div className='space-y-3 border rounded-lg p-4 bg-card'>
                <div className='flex items-center justify-between pb-2 border-b'>
                  <p className='font-semibold text-sm'>Bước 3: Kết quả kiểm tra dữ liệu</p>
                  <div className='flex items-center gap-2 text-xs'>
                    <span className='px-2 py-0.5 rounded bg-muted font-medium'>
                      Tổng: {preview.totalRows} dòng
                    </span>
                    <span className='px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-semibold'>
                      Hợp lệ: {preview.validCount}
                    </span>
                    {preview.errorCount > 0 && (
                      <span className='px-2 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-400 font-semibold'>
                        Lỗi: {preview.errorCount}
                      </span>
                    )}
                  </div>
                </div>

                <div className='max-h-60 overflow-y-auto border rounded divide-y text-xs'>
                  {preview.rows.map((r) => (
                    <div
                      key={r.line}
                      className={`p-2.5 flex items-start gap-2.5 ${
                        r.isValid ? 'bg-background hover:bg-muted/40' : 'bg-destructive/5'
                      }`}
                    >
                      <div className='pt-0.5'>
                        {r.isValid ? (
                          <CheckCircle2 className='h-4 w-4 text-emerald-600 shrink-0' />
                        ) : (
                          <AlertCircle className='h-4 w-4 text-destructive shrink-0' />
                        )}
                      </div>
                      <div className='flex-1 space-y-1'>
                        <div className='flex items-center gap-2'>
                          <span className='font-mono font-bold text-muted-foreground'>Dòng {r.line}:</span>
                          <span className='font-medium text-foreground'>
                            {Object.entries(r.data)
                              .slice(0, 3)
                              .map(([k, v]) => `${k}: ${v || '—'}`)
                              .join(' | ')}
                          </span>
                        </div>
                        {r.errors.length > 0 && (
                          <div className='text-destructive font-semibold'>
                            ⚠️ {r.errors.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className='gap-2 sm:gap-0 pt-3 border-t'>
            <Button variant='ghost' onClick={() => setOpen(false)}>
              {successMessage ? 'Đóng' : 'Hủy bỏ'}
            </Button>
            {preview && preview.validCount > 0 && (
              <Button
                onClick={() => void handleCommit()}
                disabled={busy === 'commit'}
                className='gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold'
              >
                {busy === 'commit' && <Loader2 className='h-4 w-4 animate-spin' />}
                Xác nhận nạp {preview.validCount} dòng hợp lệ
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
