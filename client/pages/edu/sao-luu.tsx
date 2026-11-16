import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Download } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';

import { post, todayVn, useErrorMessage } from './kit.js';

interface Backup {
  readonly tongSoBang: number;
  readonly soBanGhi: number;
}

/**
 * A copy of the whole training data for the administrator to keep off the server. The page opens with the page grant
 * `edu.saoLuu` and the download needs `edu.heThong` `backup`; the server writes the export log. There is no restore
 * here on purpose: see `server/routes/edu-sao-luu.ts`.
 */
export default function SaoLuuPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Backup>();
  const [error, setError] = useState<string>();

  const download = async (): Promise<void> => {
    setBusy(true);
    setDone(undefined);
    setError(undefined);
    try {
      const answer = (await post(api, 'heThong/backup/exportJson', {})) as {
        data: Backup;
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(answer.data)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `nocoedu-sao-luu-${todayVn()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setDone(answer.data);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('edu.saoLuu.title')}
        description={t('edu.saoLuu.description')}
      />
      <div className='grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('edu.saoLuu.cardTitle')}
            </CardTitle>
            <CardDescription>{t('edu.saoLuu.cardHint')}</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col items-start gap-3'>
            <Button
              disabled={busy}
              onClick={() => void download()}
              className='gap-2'
            >
              <Download className='size-4' />
              {busy ? t('edu.saoLuu.downloading') : t('edu.saoLuu.download')}
            </Button>
            {done ? (
              <p role='status' className='text-sm'>
                {t('edu.saoLuu.done', {
                  rows: done.soBanGhi,
                  tables: done.tongSoBang,
                })}
              </p>
            ) : null}
            {error ? (
              <p role='alert' className='text-sm text-destructive'>
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('edu.saoLuu.restoreTitle')}
            </CardTitle>
            <CardDescription>{t('edu.saoLuu.restoreHint')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </PageContainer>
  );
}
