import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
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
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';

import { post, useErrorMessage } from './kit.js';

/** The file the server accepts: about 500 KB. It is checked here too so a big file is not read into the page. */
const MAX_BYTES = 512 * 1024;

/** The action that opens each import on the server (`server/edu/import-da-nang.ts`); the button follows it. */
const GATES = {
  coSo: ['edu.coSo', 'manage'],
  lop: ['edu.lop', 'manage'],
  sach: ['edu.sach', 'manage'],
  hoSoGv: ['edu.hoSoGv', 'manage'],
  tuyenSinh: ['edu.tuyenSinh', 'manage'],
  phatSach: ['edu.phatSach', 'manage'],
  goiHoc: ['edu.goiHoc', 'manage'],
  diemDanh: ['edu.diemDanh', 'record'],
} as const;

export type ImportKind = keyof typeof GATES;

interface Report {
  readonly tongDong: number;
  readonly hopLe: number;
  readonly loi: readonly { dong: number; ma: string; cot?: string }[];
}

/**
 * Import one kind of record from a CSV file: choose the file, preview what it would do, then confirm. The file's text
 * stays in memory, is sent to the server twice (preview, confirm) and is dropped when the dialog closes. The preview
 * shows counts and line numbers with a reason, never the content of a row. One bad row means nothing is written.
 *
 * The button shows only to a person who holds the action that opens this import; the server decides either way.
 */
export function GenericImportDialog({
  entity,
  variant = 'outline',
  onSuccess,
}: {
  readonly entity: ImportKind;
  readonly variant?: 'outline' | 'default' | 'secondary';
  readonly onSuccess?: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const [resource, action] = GATES[entity];
  const allowed = useCan({
    resource: { type: 'composite', id: resource },
    action,
  }).can;
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState<string>();
  const [report, setReport] = useState<Report>();
  const [done, setDone] = useState<number>();
  const [busy, setBusy] = useState<'preview' | 'confirm'>();
  const [error, setError] = useState<string>();

  if (!allowed) return null;

  const close = (): void => {
    setOpen(false);
    setCsv(undefined);
    setReport(undefined);
    setDone(undefined);
    setError(undefined);
  };

  const run = async (kind: 'preview' | 'confirm'): Promise<void> => {
    if (csv === undefined || busy) return;
    setBusy(kind);
    setError(undefined);
    try {
      const answer = (await post(
        api,
        kind === 'preview' ? 'nhapDuLieu/xemTruoc' : 'nhapDuLieu/xacNhan',
        { loai: entity, csv },
      )) as { data: Report & { daGhi?: number } };
      if (kind === 'preview') setReport(answer.data);
      else {
        setDone(answer.data.daGhi ?? answer.data.hopLe);
        setReport(undefined);
        setCsv(undefined);
        onSuccess?.();
      }
    } catch (cause) {
      setError(message(cause));
      // The data changed since the preview: it has to be previewed again.
      if (
        cause instanceof ApiClientError &&
        (cause as { reason?: string }).reason === 'EDU_IMPORT_HAS_PROBLEMS'
      ) {
        setReport(undefined);
      }
    } finally {
      setBusy(undefined);
    }
  };

  const choose = async (file: File | undefined): Promise<void> => {
    setReport(undefined);
    setDone(undefined);
    setError(undefined);
    setCsv(undefined);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(t('edu.import.tooBig'));
      return;
    }
    setCsv(await file.text());
  };

  const downloadSample = async (): Promise<void> => {
    setError(undefined);
    try {
      const answer = (await post(api, 'nhapDuLieu/mau', { loai: entity })) as {
        data: { csv: string };
      };
      const url = URL.createObjectURL(
        new Blob([answer.data.csv], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `mau-nhap-${entity}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(message(cause));
    }
  };

  /** The reason of a row, in this order: the import's own wording, the shared error wording, a plain fallback. */
  const reason = (code: string): string => {
    for (const key of [`edu.nhapDuLieu.loi.${code}`, `edu.errors.${code}`]) {
      const found = t(key);
      if (found !== key) return found;
    }
    return t('edu.nhapDuLieu.loi.other');
  };

  const canConfirm =
    report !== undefined && report.loi.length === 0 && report.hopLe > 0;
  const fileId = `import-file-${entity}`;

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {t('edu.import.open')}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(`edu.nhapDuLieu.title.${entity}`)}</DialogTitle>
            <DialogDescription>{t('edu.nhapDuLieu.hint')}</DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor={fileId}>{t('edu.import.file')}</Label>
              <Input
                id={fileId}
                type='file'
                accept='.csv,text/csv'
                onChange={(event) => void choose(event.target.files?.[0])}
              />
              <p className='text-xs text-muted-foreground'>
                {t('edu.nhapDuLieu.limits')}
              </p>
              <p className='text-xs text-muted-foreground'>
                {t(`edu.nhapDuLieu.note.${entity}`)}
              </p>
              <Button
                type='button'
                variant='link'
                className='h-auto self-start p-0'
                onClick={() => void downloadSample()}
              >
                {t('edu.import.sample')}
              </Button>
            </div>

            {report ? (
              <section className='flex flex-col gap-2'>
                <h3 className='text-sm font-medium'>
                  {t('edu.import.summary')}
                </h3>
                <dl className='grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm'>
                  <dt>{t('edu.import.rows')}</dt>
                  <dd className='text-right tabular-nums'>{report.tongDong}</dd>
                  <dt>{t('edu.nhapDuLieu.valid')}</dt>
                  <dd className='text-right tabular-nums'>{report.hopLe}</dd>
                </dl>
                {report.loi.length > 0 ? (
                  <div role='alert' className='flex flex-col gap-1'>
                    <h3 className='text-sm font-medium text-destructive'>
                      {t('edu.import.problems')}: {report.loi.length}
                    </h3>
                    <p className='text-xs text-muted-foreground'>
                      {t('edu.import.problemsHint')}
                    </p>
                    <ul className='max-h-48 overflow-y-auto text-sm'>
                      {report.loi.slice(0, 100).map((problem) => (
                        <li key={`${problem.dong}-${problem.ma}`}>
                          {t('edu.import.line', { line: problem.dong })}
                          {problem.cot
                            ? ` (${t('edu.nhapDuLieu.column', { cot: problem.cot })})`
                            : ''}
                          : {reason(problem.ma)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            {done !== undefined ? (
              <p role='status' className='text-sm'>
                {t('edu.import.done', { count: done })}
              </p>
            ) : null}
            {error ? (
              <p role='alert' className='text-sm text-destructive'>
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={close}>
              {t('edu.import.close')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={csv === undefined || busy !== undefined}
              onClick={() => void run('preview')}
            >
              {busy === 'preview'
                ? t('edu.import.previewing')
                : t('edu.import.preview')}
            </Button>
            <Button
              type='button'
              disabled={!canConfirm || busy !== undefined}
              onClick={() => void run('confirm')}
            >
              {busy === 'confirm'
                ? t('edu.import.confirming')
                : t('edu.import.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
