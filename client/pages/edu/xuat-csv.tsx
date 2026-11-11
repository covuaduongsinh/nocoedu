import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
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

import { SelectField } from './form-parts.js';
import { useErrorMessage, useRows } from './kit.js';

const STATUSES = ['dang_hoc', 'tam_nghi', 'da_nghi', 'hoc_thu'] as const;

/**
 * Downloads students with their parents as a CSV file in the columns of the import file, for the branch, class and
 * status chosen here (empty = all the person may see; the server decides what that is). The file is built by the server
 * for this request and not stored there; the export is logged without names.
 */
export function ExportCsv(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const branches = useRows('coSo').loaded;
  const classes = useRows('lop').loaded;
  const [open, setOpen] = useState(false);
  const [coSoId, setCoSoId] = useState('');
  const [lopId, setLopId] = useState('');
  const [trangThai, setTrangThai] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const branchRows = branches.state === 'ready' ? branches.rows : [];
  const classRows = (classes.state === 'ready' ? classes.rows : []).filter(
    (row) => coSoId === '' || String(row.coSoId) === coSoId,
  );

  const download = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const stream = await api.stream({
        path: 'hocVien/xuatCsv',
        method: 'POST',
        json: {
          ...(coSoId ? { coSoId: Number(coSoId) } : {}),
          ...(lopId ? { lopId: Number(lopId) } : {}),
          ...(trangThai ? { trangThai } : {}),
        },
      });
      const blob = await new Response(stream).blob();
      const url = URL.createObjectURL(
        new Blob([blob], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'hoc-vien.csv';
      link.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        {t('edu.export.open')}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('edu.export.title')}</DialogTitle>
            <DialogDescription>{t('edu.export.hint')}</DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-4'>
            <SelectField
              id='xuat-co-so'
              label={t('edu.hocVien.coSo')}
              value={coSoId}
              allowEmpty
              onChange={(value) => {
                setCoSoId(value);
                setLopId('');
              }}
              options={branchRows.map((row) => ({
                value: String(row.id),
                label: String(row.ten),
              }))}
            />
            <SelectField
              id='xuat-lop'
              label={t('edu.hocVien.lop')}
              value={lopId}
              allowEmpty
              onChange={setLopId}
              options={classRows.map((row) => ({
                value: String(row.id),
                label: String(row.ten),
              }))}
            />
            <SelectField
              id='xuat-trang-thai'
              label={t('edu.hocVien.trangThai')}
              value={trangThai}
              allowEmpty
              onChange={setTrangThai}
              options={STATUSES.map((key) => ({
                value: key,
                label: t(`edu.status.${key}`),
              }))}
            />
            {error ? (
              <p role='alert' className='text-sm text-destructive'>
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setOpen(false)}>
              {t('edu.common.cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void download()}>
              {busy ? t('edu.export.downloading') : t('edu.export.download')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
