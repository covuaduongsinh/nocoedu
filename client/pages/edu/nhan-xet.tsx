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
import { post, text, todayVn, useErrorMessage, useRows } from './kit.js';

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
              className='flex flex-col gap-2 rounded-lg border p-3'
            >
              <label
                htmlFor={`nx-${student.id}`}
                className='text-sm font-medium'
              >
                {text(student.hoTen)}
              </label>
              <Textarea
                id={`nx-${student.id}`}
                value={drafts[student.id] ?? ''}
                placeholder={
                  kind === 'thang' ? undefined : t('edu.nhanXet.templateText')
                }
                maxLength={3000}
                disabled={!canWrite}
                onChange={(event) =>
                  setDrafts((d) => ({ ...d, [student.id]: event.target.value }))
                }
              />
              {canWrite ? (
                <div className='flex items-center gap-3'>
                  <Button size='sm' onClick={() => void save(student.id)}>
                    {t('edu.common.save')}
                  </Button>
                  {status[student.id] === 'saved' ? (
                    <span className='text-sm text-muted-foreground'>
                      {t('edu.nhanXet.saved')}
                    </span>
                  ) : null}
                  {status[student.id] === 'error' ? (
                    <span role='alert' className='text-sm text-destructive'>
                      {t('edu.common.saveError')}
                    </span>
                  ) : null}
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
    </PageContainer>
  );
}
