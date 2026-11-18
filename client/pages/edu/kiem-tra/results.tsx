import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { FormDialog } from '../form-parts.js';
import { post } from '../kit.js';
import type { TestDetail, TestStudent, TestSummary } from './types.js';

/**
 * The result of each student: the marks over the top marks, the percentage, passed or not, and for a closed `len_cap`
 * test the label "Đủ điều kiện lên cấp" with a button that calls the existing `/hocVien/lenCap`. The button shows only
 * to who holds `edu.hocVien` `levelUp`; nothing here moves a student up on its own, and the server checks the action and
 * the student's scope again.
 */
export function Results(props: {
  readonly detail: TestDetail;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { can: canLevelUp } = useCan({
    resource: { type: 'composite', id: 'edu.hocVien' },
    action: 'levelUp',
  });
  const [confirming, setConfirming] = useState<{
    student: TestStudent;
    levelKey: string;
  }>();
  const { bai, hocVien, tongHop } = props.detail;
  const summaryOf = new Map<number, TestSummary>(
    tongHop.map((summary) => [summary.hocVienId, summary]),
  );
  const tested = tongHop.filter((summary) => summary.daKiemTra);
  const passed = tested.filter((summary) => summary.dat);
  const eligible = tested.filter((summary) => summary.denLevelKey !== null);

  if (tested.length === 0)
    return (
      <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
        {t('edu.kiemTra.results.none')}
      </p>
    );

  return (
    <div className='flex flex-col gap-3'>
      <p role='status' className='text-sm text-muted-foreground'>
        {t('edu.kiemTra.results.summary', {
          tested: tested.length,
          passed: passed.length,
          pass: bai.diemDat,
        })}
        {bai.trangThai === 'nhap' ? ` ${t('edu.kiemTra.results.draft')}` : ''}
        {bai.loai === 'len_cap' && bai.trangThai === 'da_chot'
          ? ` ${t('edu.kiemTra.results.eligible', { count: eligible.length })}`
          : ''}
      </p>
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('edu.hocVien.hoTen')}</TableHead>
              <TableHead>{t('edu.kiemTra.results.marks')}</TableHead>
              <TableHead>{t('edu.kiemTra.results.percent')}</TableHead>
              <TableHead>{t('edu.kiemTra.results.outcome')}</TableHead>
              {bai.loai === 'len_cap' ? (
                <TableHead>{t('edu.kiemTra.results.levelUp')}</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {hocVien
              .filter((student) => summaryOf.get(student.id)?.daKiemTra)
              .map((student) => {
                const summary = summaryOf.get(student.id) as TestSummary;
                return (
                  <TableRow key={student.id}>
                    <TableCell>
                      <RecordLink to={`/hoc-vien/${student.id}?tab=kien-thuc`}>
                        {student.hoTen}
                      </RecordLink>
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {summary.diem}/{summary.toiDa}
                      {summary.thieu > 0 ? (
                        <span className='ml-2 text-xs text-muted-foreground'>
                          {t('edu.kiemTra.results.missing', {
                            count: summary.thieu,
                          })}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {summary.phanTram}%
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        size='sm'
                        tone={summary.dat ? 'success' : 'warning'}
                      >
                        {summary.dat
                          ? t('edu.kiemTra.results.passed')
                          : t('edu.kiemTra.results.failed')}
                      </StatusBadge>
                    </TableCell>
                    {bai.loai === 'len_cap' ? (
                      <TableCell>
                        {summary.denLevelKey !== null ? (
                          <div className='flex flex-wrap items-center gap-2'>
                            <StatusBadge size='sm' tone='info'>
                              {t('edu.kiemTra.results.eligibleLabel')}
                            </StatusBadge>
                            {canLevelUp ? (
                              <Button
                                size='sm'
                                variant='outline'
                                onClick={() =>
                                  setConfirming({
                                    student,
                                    levelKey: summary.denLevelKey as string,
                                  })
                                }
                              >
                                {t('edu.kiemTra.results.confirmLevelUp')}
                              </Button>
                            ) : null}
                          </div>
                        ) : summary.daLenCap ? (
                          <StatusBadge size='sm' tone='success'>
                            {t('edu.kiemTra.results.movedUp')}
                          </StatusBadge>
                        ) : (
                          <span className='text-muted-foreground'>–</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
      {confirming ? (
        <FormDialog
          open
          title={t('edu.kiemTra.levelUp.title')}
          description={t('edu.kiemTra.levelUp.hint', {
            student: confirming.student.hoTen,
            level: t(`edu.level.${confirming.levelKey}`),
          })}
          submitLabel={t('edu.kiemTra.levelUp.submit')}
          onClose={() => setConfirming(undefined)}
          onSubmit={async () => {
            await post(api, '/hocVien/lenCap', {
              hocVienId: confirming.student.id,
              denLevelKey: confirming.levelKey,
            });
            props.onChanged();
          }}
        />
      ) : null}
    </div>
  );
}
