import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Card, CardContent } from '#components/ui/card';

import { formatDay } from '../format.js';
import { useRequest } from '../kit.js';
import { MucDoBadge } from '../kien-thuc/muc-do.js';
import type { StudentTests } from '../kiem-tra/types.js';

/**
 * The closed tests of the student (the section "Kết quả kiểm tra" of the knowledge tab): each test with the marks over
 * the top marks, the state each skill earned, and the label "Đủ điều kiện lên cấp" when the student passed a `len_cap`
 * test at the level the student is still at. The one answer is `POST /kiemTra/hocVien`, which the file asks for only
 * when the person may view `edu.kiemTra`. Confirming the level is done on the page of the test, not here.
 */
export function TestResults({
  studentId,
}: {
  readonly studentId: number;
}): ReactElement {
  const { t } = useTranslation();
  const { result, reload } = useRequest<StudentTests>('/kiemTra/hocVien', {
    hocVienId: studentId,
  });
  return (
    <section
      aria-label={t('edu.kiemTra.student.title')}
      className='flex flex-col gap-3'
    >
      <h2 className='text-base font-semibold'>
        {t('edu.kiemTra.student.title')}
      </h2>
      {result.state === 'loading' ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      ) : result.state === 'error' ? (
        <div role='alert' className='flex flex-col items-start gap-3'>
          <p className='text-sm text-destructive'>
            {result.forbidden
              ? t('edu.kiemTra.forbidden')
              : t('edu.common.loadError')}
          </p>
          <Button variant='outline' onClick={reload}>
            {t('edu.common.retry')}
          </Button>
        </div>
      ) : result.data.baiKiemTra.length === 0 ? (
        <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
          {t('edu.kiemTra.student.none')}
        </p>
      ) : (
        result.data.baiKiemTra.map((test) => (
          <Card key={test.id}>
            <CardContent className='flex flex-col gap-3 p-4'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex min-w-0 flex-col'>
                  <RecordLink to={`/kiem-tra/${test.id}?tab=ket-qua`}>
                    {test.ten}
                  </RecordLink>
                  <span className='text-xs text-muted-foreground'>
                    {t(`edu.level.${test.levelKey}`)} · {formatDay(test.ngay)} ·{' '}
                    {t(`edu.kiemTra.kind.${test.loai}`)}
                  </span>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-sm tabular-nums'>
                    {test.diem}/{test.toiDa} · {test.phanTram}%
                  </span>
                  <StatusBadge
                    size='sm'
                    tone={test.dat ? 'success' : 'warning'}
                  >
                    {test.dat
                      ? t('edu.kiemTra.results.passed')
                      : t('edu.kiemTra.results.failed')}
                  </StatusBadge>
                  {test.denLevelKey !== null ? (
                    <StatusBadge size='sm' tone='info'>
                      {t('edu.kiemTra.results.eligibleLabel')}
                    </StatusBadge>
                  ) : null}
                </div>
              </div>
              <ul className='flex flex-col divide-y rounded-lg border'>
                {test.kyNang.map((skill) => (
                  <li
                    key={skill.kyNangId}
                    className='flex flex-wrap items-center justify-between gap-2 p-3'
                  >
                    <span className='text-sm'>
                      <span className='font-mono text-xs text-muted-foreground'>
                        {skill.ma}
                      </span>{' '}
                      {skill.ten}
                    </span>
                    <span className='flex items-center gap-2'>
                      <span className='text-xs tabular-nums text-muted-foreground'>
                        {skill.diem}/{skill.diemToiDa}
                      </span>
                      <MucDoBadge mucDo={skill.mucDo} size='sm' />
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </section>
  );
}
