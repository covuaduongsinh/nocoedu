import { ApiClientError, useApiClient } from '@nocobase/app-client';
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

interface Report {
  readonly rows: number;
  readonly problems: readonly { line: number; code: string }[];
  readonly warnings?: readonly { line: number; code: string }[];
  readonly written: number;
  readonly hocVienMoi: number;
  readonly hocVienTrung: number;
  readonly chiLienKet: number;
  readonly phuHuynhMoi: number;
  readonly phuHuynhDungLai: number;
  readonly lienKetMoi: number;
}

const COUNTS = [
  ['rows', 'import.rows'],
  ['hocVienMoi', 'import.newStudents'],
  ['hocVienTrung', 'import.sameStudents'],
  ['chiLienKet', 'import.linkOnly'],
  ['phuHuynhMoi', 'import.newParents'],
  ['phuHuynhDungLai', 'import.reusedParents'],
  ['lienKetMoi', 'import.newLinks'],
] as const;

/**
 * Upload a CSV of students with their parents, look at what it would do, then confirm. The file's text is kept in
 * memory only, sent to the server twice (preview, confirm) and dropped when the dialog closes; the server stores
 * nothing of it. The page shows counts and line numbers, never a name or a phone number from the file.
 */
export function ImportCsv(props: {
  readonly onImported: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState<string>();
  const [report, setReport] = useState<Report>();
  const [done, setDone] = useState<number>();
  const [busy, setBusy] = useState<'preview' | 'confirm'>();
  const [error, setError] = useState<string>();

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
      const path =
        kind === 'preview'
          ? 'hocVien/nhapCsv/xemTruoc'
          : 'hocVien/nhapCsv/xacNhan';
      const answer = (await post(api, path, { csv })) as { data: Report };
      if (kind === 'preview') setReport(answer.data);
      else {
        setDone(answer.data.written);
        setReport(undefined);
        setCsv(undefined);
        props.onImported();
      }
    } catch (cause) {
      setError(message(cause));
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
      const answer = (await post(api, 'hocVien/nhapCsv/mau', {})) as {
        data: { csv: string };
      };
      const url = URL.createObjectURL(
        new Blob([answer.data.csv], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mau-nhap-hoc-vien.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(message(cause));
    }
  };

  const nothingToDo =
    report !== undefined && report.hocVienMoi + report.chiLienKet === 0;
  const canConfirm =
    report !== undefined && report.problems.length === 0 && !nothingToDo;

  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        {t('edu.import.open')}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('edu.import.title')}</DialogTitle>
            <DialogDescription>{t('edu.import.hint')}</DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='import-csv-file'>{t('edu.import.file')}</Label>
              <Input
                id='import-csv-file'
                type='file'
                accept='.csv,text/csv'
                onChange={(event) => void choose(event.target.files?.[0])}
              />
              <p className='text-xs text-muted-foreground'>
                {t('edu.import.limits')}
              </p>
              <p className='text-xs text-muted-foreground'>
                {t('edu.import.reimport')}
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
                  {COUNTS.map(([key, label]) => (
                    <div key={key} className='contents'>
                      <dt>{t(`edu.${label}`)}</dt>
                      <dd className='text-right tabular-nums'>{report[key]}</dd>
                    </div>
                  ))}
                </dl>
                {report.problems.length > 0 ? (
                  <div role='alert' className='flex flex-col gap-1'>
                    <h3 className='text-sm font-medium text-destructive'>
                      {t('edu.import.problems')}: {report.problems.length}
                    </h3>
                    <p className='text-xs text-muted-foreground'>
                      {t('edu.import.problemsHint')}
                    </p>
                    <ul className='max-h-48 overflow-y-auto text-sm'>
                      {report.problems.slice(0, 100).map((problem) => (
                        <li key={`${problem.line}-${problem.code}`}>
                          {t('edu.import.line', { line: problem.line })}:{' '}
                          {t(`edu.import.problem.${problem.code}`)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {report.warnings && report.warnings.length > 0 ? (
                  <div className='flex flex-col gap-1'>
                    <h3 className='text-sm font-medium'>
                      {t('edu.import.warnings')}: {report.warnings.length}
                    </h3>
                    <ul className='max-h-32 overflow-y-auto text-sm'>
                      {report.warnings.slice(0, 100).map((warning) => (
                        <li key={`${warning.line}-${warning.code}`}>
                          {t('edu.import.line', { line: warning.line })}:{' '}
                          {t(`edu.import.warning.${warning.code}`)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {nothingToDo && report.problems.length === 0 ? (
                  <p className='text-sm'>{t('edu.import.nothing')}</p>
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
