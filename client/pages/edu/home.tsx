import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';

/**
 * The first landing page. It counts what the signed-in person may see (the server applies their branch or class
 * scope); "today's classes", unmarked sessions and low balances arrive with attendance and tuition.
 */
export default function EduHome(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [counts, setCounts] = useState<{
    students: number | null;
    classes: number | null;
  }>({
    students: null,
    classes: null,
  });
  useEffect(() => {
    let live = true;
    const count = (name: string): Promise<number | null> =>
      api
        .repository(name)
        .count()
        .then((value) => value)
        .catch(() => null);
    void Promise.all([count('hocVien'), count('lop')]).then(
      ([students, classes]) => {
        if (live) setCounts({ students, classes });
      },
    );
    return () => {
      live = false;
    };
  }, [api]);
  const none = counts.students === null && counts.classes === null;
  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <PageHeader
        title={t('edu.home.title')}
        description={t('edu.home.intro')}
      />
      {none ? (
        <p className='text-sm text-muted-foreground'>
          {t('edu.home.noAccess')}
        </p>
      ) : (
        <div className='grid gap-4 sm:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardDescription>{t('edu.home.students')}</CardDescription>
              <CardTitle className='text-3xl'>
                {counts.students ?? '–'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t('edu.home.classes')}</CardDescription>
              <CardTitle className='text-3xl'>
                {counts.classes ?? '–'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
