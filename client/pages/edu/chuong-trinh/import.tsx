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

import { saveText } from '../download.js';
import { post, useErrorMessage } from '../kit.js';

/** The file the server accepts: about 500 KB. It is checked here too so a big file is not read into the page. */
const MAX_BYTES = 512 * 1024;

interface Report {
  readonly rows: number;
  readonly problems: readonly { line: number; code: string }[];
  readonly chuDeMoi: number;
  readonly chuDeCapNhat: number;
  readonly kyNangMoi: number;
  readonly kyNangCapNhat: number;
  readonly giuNguyen: number;
  readonly written: number;
}

const COUNTS = [
  ['rows', 'rows'],
  ['chuDeMoi', 'newTopics'],
  ['chuDeCapNhat', 'updatedTopics'],
  ['kyNangMoi', 'newSkills'],
  ['kyNangCapNhat', 'updatedSkills'],
  ['giuNguyen', 'unchanged'],
] as const;

/**
 * Upload the curriculum as a CSV, look at what it would do, then confirm (administrator). The text of the file stays in
 * memory, goes to the server twice (preview, confirm) and is dropped when the dialog closes. The page shows counts and
 * line numbers, as the student import does.
 */
export function ImportCurriculum(props: {
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
      const answer = (await post(
        api,
        kind === 'preview'
          ? '/chuongTrinh/nhapCsv/xemTruoc'
          : '/chuongTrinh/nhapCsv/xacNhan',
        { csv },
      )) as { data: Report };
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
      )
        setReport(undefined);
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
      const answer = (await post(api, '/chuongTrinh/nhapCsv/mau', {})) as {
        data: { csv: string };
      };
      saveText(answer.data.csv, 'mau-chuong-trinh.csv');
    } catch (cause) {
      setError(message(cause));
    }
  };

  const nothingToDo =
    report !== undefined &&
    report.chuDeMoi +
      report.chuDeCapNhat +
      report.kyNangMoi +
      report.kyNangCapNhat ===
      0;
  const canConfirm =
    report !== undefined && report.problems.length === 0 && !nothingToDo;

  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        {t('edu.ct.import.open')}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('edu.ct.import.title')}</DialogTitle>
            <DialogDescription>{t('edu.ct.import.hint')}</DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='ct-import-file'>{t('edu.import.file')}</Label>
              <Input
                id='ct-import-file'
                type='file'
                accept='.csv,text/csv'
                onChange={(event) => void choose(event.target.files?.[0])}
              />
              <p className='text-xs text-muted-foreground'>
                {t('edu.ct.import.limits')}
              </p>
              <Button
                type='button'
                variant='link'
                className='h-auto self-start p-0'
                onClick={() => void downloadSample()}
              >
                {t('edu.ct.import.sample')}
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
                      <dt>{t(`edu.ct.import.${label}`)}</dt>
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
                      {t('edu.ct.import.problemsHint')}
                    </p>
                    <ul className='max-h-48 overflow-y-auto text-sm'>
                      {report.problems.slice(0, 100).map((problem) => (
                        <li key={`${problem.line}-${problem.code}`}>
                          {t('edu.import.line', { line: problem.line })}:{' '}
                          {t(`edu.ct.import.problem.${problem.code}`)}
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
                {t('edu.ct.import.done', { count: done })}
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
