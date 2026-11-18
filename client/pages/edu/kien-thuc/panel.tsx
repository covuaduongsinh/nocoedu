import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Card, CardContent } from '#components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';

import { FilterSelect } from '../filter-select.js';
import { LEVEL_KEYS, post, text, useErrorMessage, useRequest } from '../kit.js';
import { Pager } from '../list-page.js';
import { useClassGroups } from '../nhom.js';
import { useUrlState } from '../url-state.js';
import { formatDay } from '../format.js';
import { CELL_TONE } from './cell-tone.js';
import { MucDoBadge } from './muc-do.js';
import {
  MUC_DO,
  isMucDo,
  type Gaps,
  type Matrix,
  type MucDo,
} from './types.js';

/** What a grading request may carry; the server refuses more than this. */
const GRADE_STATES: readonly (MucDo | '')[] = ['', ...MUC_DO];

/**
 * The knowledge of one class (GĐ 4): the matrix students × skills of one topic, and the list of gaps to make up. The
 * view, the group, the level, the topic and the page live in the address, so a refresh or a copied link shows the same
 * thing. Shared by the page `/kien-thuc` (which picks the class) and the tab "Tiến độ kiến thức" of the class page.
 * A grading control appears only for a person who holds `edu.kienThuc` `record`; the server checks it again.
 */
export function KnowledgePanel({
  lopId,
}: {
  readonly lopId: number;
}): ReactElement {
  const { t } = useTranslation();
  const url = useUrlState({ che: 'ma-tran', nhom: '', cap: '', chuDe: '' });
  const groups = useClassGroups(lopId);
  const activeGroups =
    groups.loaded.state === 'ready'
      ? groups.loaded.rows.filter((group) => group.trangThai === 'hoat_dong')
      : [];
  const mode = url.values.che === 'lo-hong' ? 'lo-hong' : 'ma-tran';
  const { can: canRecord } = useCan({
    resource: { type: 'composite', id: 'edu.kienThuc' },
    action: 'record',
  });

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Tabs
          value={mode}
          onValueChange={(value) =>
            url.set({ che: String(value), chuDe: '' }, { replace: false })
          }
        >
          <TabsList>
            <TabsTrigger value='ma-tran'>{t('edu.kt.view.matrix')}</TabsTrigger>
            <TabsTrigger value='lo-hong'>{t('edu.kt.view.gaps')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {activeGroups.length > 0 ? (
          <FilterSelect
            label={t('edu.nhom.label')}
            allLabel={t('edu.kt.allGroups')}
            value={url.values.nhom}
            onChange={(nhom) => url.set({ nhom })}
            options={activeGroups.map((group) => ({
              value: String(group.id),
              label: text(group.ten),
            }))}
          />
        ) : null}
        <FilterSelect
          label={t('edu.kt.level')}
          allLabel={t('edu.kt.levelOfClass')}
          value={url.values.cap}
          onChange={(cap) => url.set({ cap, chuDe: '' })}
          options={LEVEL_KEYS.map((key) => ({
            value: key,
            label: t(`edu.level.${key}`),
          }))}
        />
      </div>
      {mode === 'ma-tran' ? (
        <MatrixView
          lopId={lopId}
          nhomId={url.values.nhom}
          levelKey={url.values.cap}
          chuDeId={url.values.chuDe}
          page={url.page}
          onPage={url.setPage}
          onTopic={(chuDe) => url.set({ chuDe })}
          canRecord={canRecord}
        />
      ) : (
        <GapView
          lopId={lopId}
          nhomId={url.values.nhom}
          levelKey={url.values.cap}
          page={url.page}
          onPage={url.setPage}
        />
      )}
    </div>
  );
}

function Legend(): ReactElement {
  const { t } = useTranslation();
  return (
    <ul
      aria-label={t('edu.kt.legend')}
      className='flex flex-wrap items-center gap-2 text-xs'
    >
      {[null, ...MUC_DO].map((mucDo) => (
        <li key={mucDo ?? 'none'}>
          <MucDoBadge mucDo={mucDo} size='sm' />
        </li>
      ))}
    </ul>
  );
}

function MatrixView(props: {
  readonly lopId: number;
  readonly nhomId: string;
  readonly levelKey: string;
  readonly chuDeId: string;
  readonly page: number;
  readonly onPage: (page: number) => void;
  readonly onTopic: (chuDe: string) => void;
  readonly canRecord: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const { result, reload } = useRequest<Matrix>('/kienThuc/maTran', {
    lopId: props.lopId,
    ...(props.nhomId ? { nhomId: Number(props.nhomId) } : {}),
    ...(props.levelKey ? { levelKey: props.levelKey } : {}),
    ...(props.chuDeId ? { chuDeId: Number(props.chuDeId) } : {}),
    trang: props.page,
    limit: 25,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const grade = async (
    cells: readonly {
      hocVienId: number;
      kyNangId: number;
      mucDo: MucDo | null;
    }[],
  ): Promise<void> => {
    if (busy || cells.length === 0) return;
    setBusy(true);
    setError(undefined);
    try {
      await post(api, '/kienThuc/cham', { o: cells });
      reload();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  if (result.state === 'loading')
    return (
      <p role='status' className='text-sm text-muted-foreground'>
        {t('edu.common.loading')}
      </p>
    );
  if (result.state === 'error')
    return (
      <div role='alert' className='flex flex-col items-start gap-3'>
        <p className='text-sm text-destructive'>
          {result.forbidden ? t('edu.kt.forbidden') : t('edu.common.loadError')}
        </p>
        <Button variant='outline' onClick={reload}>
          {t('edu.common.retry')}
        </Button>
      </div>
    );

  const data = result.data;
  const cellOf = new Map(
    data.o.map((cell) => [`${cell.hocVienId}|${cell.kyNangId}`, cell]),
  );
  const taught = new Set(data.daDay);
  if (data.chuDe.length === 0 || data.kyNang.length === 0)
    return (
      <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
        {data.chuDe.length === 0
          ? t('edu.kt.noCurriculum', { level: t(`edu.level.${data.levelKey}`) })
          : t('edu.kt.noSkills')}
      </p>
    );

  const bulkColumn = (kyNangId: number, value: string): void => {
    if (!isMucDo(value)) return;
    void grade(
      data.hocVien.map((student) => ({
        hocVienId: student.id,
        kyNangId,
        mucDo: value,
      })),
    );
  };
  const bulkRow = (hocVienId: number, value: string): void => {
    if (!isMucDo(value)) return;
    void grade(
      data.kyNang.map((skill) => ({
        hocVienId,
        kyNangId: skill.id,
        mucDo: value,
      })),
    );
  };

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <select
          aria-label={t('edu.kt.topic')}
          value={String(data.chuDeId ?? '')}
          onChange={(event) => props.onTopic(event.target.value)}
          className='h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
        >
          {data.chuDe.map((topic) => (
            <option key={topic.id} value={String(topic.id)}>
              {topic.ma} · {topic.ten}
            </option>
          ))}
        </select>
        <Legend />
      </div>
      <p className='text-xs text-muted-foreground'>
        {props.canRecord ? t('edu.kt.matrixHint') : t('edu.kt.matrixReadOnly')}
      </p>
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      {data.hocVien.length === 0 ? (
        <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
          {t('edu.kt.noStudents')}
        </p>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='min-w-48'>
                  {t('edu.hocVien.hoTen')}
                </TableHead>
                {data.kyNang.map((skill) => (
                  <TableHead key={skill.id} className='min-w-36 align-top'>
                    <div className='flex flex-col gap-1'>
                      <span title={skill.ten} className='font-medium'>
                        {skill.ma}
                      </span>
                      <span
                        title={skill.moTa ?? skill.ten}
                        className='line-clamp-2 text-xs font-normal text-muted-foreground'
                      >
                        {skill.ten}
                      </span>
                      {!taught.has(skill.id) ? (
                        <span className='text-xs font-normal italic text-muted-foreground'>
                          {t('edu.kt.notTaughtYet')}
                        </span>
                      ) : null}
                      {props.canRecord ? (
                        <BulkSelect
                          label={`${t('edu.kt.gradeColumn')} – ${skill.ma}`}
                          placeholder={t('edu.kt.gradeColumn')}
                          disabled={busy}
                          onPick={(value) => bulkColumn(skill.id, value)}
                        />
                      ) : null}
                    </div>
                  </TableHead>
                ))}
                {props.canRecord ? (
                  <TableHead className='min-w-36'>
                    {t('edu.kt.gradeRow')}
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.hocVien.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>
                    <div className='flex flex-col gap-1'>
                      <RecordLink to={`/hoc-vien/${student.id}?tab=kien-thuc`}>
                        {student.hoTen}
                      </RecordLink>
                      <div className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
                        <span>
                          {t('edu.kt.progress', {
                            percent: student.phanTram,
                            done: student.daHoc,
                            total: student.tong,
                          })}
                        </span>
                        {student.canBu > 0 ? (
                          <StatusBadge tone='warning' size='sm'>
                            {t('edu.kt.needsMakeup', { count: student.canBu })}
                          </StatusBadge>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  {data.kyNang.map((skill) => {
                    const cell = cellOf.get(`${student.id}|${skill.id}`);
                    const label = `${student.hoTen} – ${skill.ma}`;
                    return (
                      <TableCell
                        key={skill.id}
                        className={CELL_TONE[cell?.mucDo ?? 'none']}
                      >
                        {props.canRecord ? (
                          <select
                            aria-label={label}
                            value={cell?.mucDo ?? ''}
                            disabled={busy}
                            onChange={(event) =>
                              void grade([
                                {
                                  hocVienId: student.id,
                                  kyNangId: skill.id,
                                  mucDo: isMucDo(event.target.value)
                                    ? event.target.value
                                    : null,
                                },
                              ])
                            }
                            className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
                          >
                            {GRADE_STATES.map((state) => (
                              <option key={state || 'none'} value={state}>
                                {t(`edu.kt.state.${state || 'chua_hoc'}`)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <MucDoBadge mucDo={cell?.mucDo ?? null} size='sm' />
                        )}
                      </TableCell>
                    );
                  })}
                  {props.canRecord ? (
                    <TableCell>
                      <BulkSelect
                        label={`${t('edu.kt.gradeRow')} – ${student.hoTen}`}
                        placeholder={t('edu.kt.gradeRow')}
                        disabled={busy}
                        onPick={(value) => bulkRow(student.id, value)}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager page={data.trang} total={data.tong} onPage={props.onPage} />
        </div>
      )}
    </div>
  );
}

/** "Grade the whole column / row": a select that applies the chosen state at once and falls back to its prompt. */
function BulkSelect(props: {
  readonly label: string;
  readonly placeholder: string;
  readonly disabled: boolean;
  readonly onPick: (value: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <select
      aria-label={props.label}
      value=''
      disabled={props.disabled}
      onChange={(event) => props.onPick(event.target.value)}
      className='h-7 w-full rounded-md border border-input bg-transparent px-1.5 text-xs font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
    >
      <option value=''>{props.placeholder}</option>
      {MUC_DO.map((state) => (
        <option key={state} value={state}>
          {t(`edu.kt.state.${state}`)}
        </option>
      ))}
    </select>
  );
}

function GapView(props: {
  readonly lopId: number;
  readonly nhomId: string;
  readonly levelKey: string;
  readonly page: number;
  readonly onPage: (page: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  const { result, reload } = useRequest<Gaps>('/kienThuc/loHong', {
    lopId: props.lopId,
    ...(props.nhomId ? { nhomId: Number(props.nhomId) } : {}),
    ...(props.levelKey ? { levelKey: props.levelKey } : {}),
    trang: props.page,
    limit: 25,
  });
  if (result.state === 'loading')
    return (
      <p role='status' className='text-sm text-muted-foreground'>
        {t('edu.common.loading')}
      </p>
    );
  if (result.state === 'error')
    return (
      <div role='alert' className='flex flex-col items-start gap-3'>
        <p className='text-sm text-destructive'>
          {result.forbidden ? t('edu.kt.forbidden') : t('edu.common.loadError')}
        </p>
        <Button variant='outline' onClick={reload}>
          {t('edu.common.retry')}
        </Button>
      </div>
    );
  const data = result.data;
  return (
    <div className='flex flex-col gap-3'>
      <p className='text-sm text-muted-foreground'>{t('edu.kt.gapsHint')}</p>
      {data.kyNang.length === 0 ? (
        <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
          {t('edu.kt.noGaps')}
        </p>
      ) : (
        <>
          <p role='status' className='text-sm font-medium'>
            {t('edu.kt.gapsTotal', { skills: data.tong, pairs: data.tongCap })}
          </p>
          <div className='flex flex-col gap-3'>
            {data.kyNang.map((skill) => (
              <Card key={skill.kyNangId}>
                <CardContent className='flex flex-col gap-3 p-4'>
                  <div className='flex flex-col gap-0.5'>
                    <span className='text-xs text-muted-foreground'>
                      {t(`edu.level.${skill.levelKey}`)} · {skill.chuDe}
                    </span>
                    <h3 className='text-sm font-semibold'>
                      {skill.ma} · {skill.ten}
                    </h3>
                  </div>
                  <ul className='flex flex-col gap-1.5'>
                    {skill.hocVien.map((student) => (
                      <li
                        key={student.hocVienId}
                        className='flex flex-wrap items-center gap-2 text-sm'
                      >
                        <RecordLink
                          to={`/hoc-vien/${student.hocVienId}?tab=kien-thuc`}
                        >
                          {student.hoTen}
                        </RecordLink>
                        <StatusBadge tone='warning' size='sm'>
                          {t(`edu.kt.gap.${student.lyDo}`)}
                        </StatusBadge>
                        {student.ngay ? (
                          <span className='text-xs text-muted-foreground'>
                            {t('edu.kt.gap.since', {
                              date: formatDay(student.ngay),
                            })}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pager page={data.trang} total={data.tong} onPage={props.onPage} />
        </>
      )}
    </div>
  );
}
