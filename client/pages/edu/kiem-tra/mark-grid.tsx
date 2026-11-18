import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { RecordLink } from '#components/record-link';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { post, useErrorMessage } from '../kit.js';
import type { TestDetail } from './types.js';

/** What the server takes in one request. */
const MAX_CELLS = 500;

const keyOf = (studentId: number, skillId: number): string =>
  `${studentId}|${skillId}`;

/**
 * The grid of marks: one row per student of the class, one column per skill of the test, a whole number in each cell
 * (empty = not tested on it). Nothing is sent while typing; "Lưu điểm" sends what changed, in requests of at most 500
 * cells. A closed test, or a person without `edu.kiemTra` `manage`, sees the marks and cannot change them.
 */
export function MarkGrid(props: {
  readonly detail: TestDetail;
  readonly canEdit: boolean;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const { bai, kyNang, hocVien } = props.detail;
  const saved = new Map(
    props.detail.diem.map((mark) => [
      keyOf(mark.hocVienId, mark.kyNangId),
      mark.diem,
    ]),
  );
  // What the person typed, by cell; a cell not in here shows what is saved.
  const [draft, setDraft] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const topOf = new Map(
    kyNang.map((skill) => [skill.kyNangId, skill.diemToiDa]),
  );
  const editable = props.canEdit && bai.trangThai === 'nhap';

  const shown = (studentId: number, skillId: number): string => {
    const key = keyOf(studentId, skillId);
    const typed = draft.get(key);
    if (typed !== undefined) return typed;
    const mark = saved.get(key);
    return mark === undefined ? '' : String(mark);
  };
  const totalOf = (studentId: number): { diem: number; marked: number } => {
    let diem = 0;
    let marked = 0;
    for (const skill of kyNang) {
      const value = shown(studentId, skill.kyNangId);
      if (value === '' || !Number.isFinite(Number(value))) continue;
      diem += Number(value);
      marked += 1;
    }
    return { diem, marked };
  };
  const toiDa = kyNang.reduce((sum, skill) => sum + skill.diemToiDa, 0);

  const changes = (): {
    hocVienId: number;
    kyNangId: number;
    diem: number | null;
  }[] => {
    const cells: {
      hocVienId: number;
      kyNangId: number;
      diem: number | null;
    }[] = [];
    for (const [key, value] of draft) {
      const [studentId, skillId] = key.split('|').map(Number) as [
        number,
        number,
      ];
      const before = saved.get(key);
      if (value === '') {
        if (before !== undefined)
          cells.push({ hocVienId: studentId, kyNangId: skillId, diem: null });
        continue;
      }
      const mark = Number(value);
      if (mark !== before)
        cells.push({ hocVienId: studentId, kyNangId: skillId, diem: mark });
    }
    return cells;
  };

  const save = async (): Promise<void> => {
    if (busy) return;
    const cells = changes();
    // The server checks again; this tells the person which cell is wrong before anything is sent.
    for (const cell of cells) {
      const top = topOf.get(cell.kyNangId) ?? 0;
      if (
        cell.diem !== null &&
        (!Number.isInteger(cell.diem) || cell.diem < 0 || cell.diem > top)
      ) {
        setError(t('edu.kiemTra.grid.invalid'));
        return;
      }
    }
    setBusy(true);
    setError(undefined);
    try {
      for (let at = 0; at < cells.length; at += MAX_CELLS)
        await post(api, '/kiemTra/nhapDiem', {
          id: bai.id,
          o: cells.slice(at, at + MAX_CELLS),
        });
      setDraft(new Map());
      props.onSaved();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  if (hocVien.length === 0)
    return (
      <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
        {t('edu.kiemTra.grid.noStudents')}
      </p>
    );

  const pending = changes().length;
  return (
    <div className='flex flex-col gap-3'>
      <p className='text-xs text-muted-foreground'>
        {editable ? t('edu.kiemTra.grid.hint') : t('edu.kiemTra.grid.readOnly')}
      </p>
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='min-w-48'>
                {t('edu.hocVien.hoTen')}
              </TableHead>
              {kyNang.map((skill) => (
                <TableHead key={skill.kyNangId} className='min-w-28 align-top'>
                  <div className='flex flex-col gap-1'>
                    <span title={skill.ten} className='font-medium'>
                      {skill.ma}
                    </span>
                    <span className='line-clamp-2 text-xs font-normal text-muted-foreground'>
                      {skill.ten}
                    </span>
                    <span className='text-xs font-normal tabular-nums text-muted-foreground'>
                      {t('edu.kiemTra.grid.topMark', { max: skill.diemToiDa })}
                    </span>
                  </div>
                </TableHead>
              ))}
              <TableHead className='min-w-28'>
                {t('edu.kiemTra.grid.total')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hocVien.map((student) => {
              const total = totalOf(student.id);
              return (
                <TableRow key={student.id}>
                  <TableCell>
                    <RecordLink to={`/hoc-vien/${student.id}?tab=kien-thuc`}>
                      {student.hoTen}
                    </RecordLink>
                  </TableCell>
                  {kyNang.map((skill) => (
                    <TableCell key={skill.kyNangId}>
                      {editable ? (
                        <Input
                          type='number'
                          inputMode='numeric'
                          min={0}
                          max={skill.diemToiDa}
                          className='w-20'
                          aria-label={t('edu.kiemTra.grid.cell', {
                            student: student.hoTen,
                            skill: skill.ma,
                          })}
                          value={shown(student.id, skill.kyNangId)}
                          onChange={(event) =>
                            setDraft(
                              new Map(draft).set(
                                keyOf(student.id, skill.kyNangId),
                                event.target.value,
                              ),
                            )
                          }
                        />
                      ) : (
                        <span className='tabular-nums'>
                          {shown(student.id, skill.kyNangId) || '–'}
                        </span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className='text-sm tabular-nums'>
                    {total.marked === 0
                      ? '–'
                      : `${total.diem}/${toiDa} · ${
                          toiDa === 0
                            ? 0
                            : Math.round((1000 * total.diem) / toiDa) / 10
                        }%`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {editable ? (
        <div className='flex flex-wrap items-center gap-3'>
          <Button disabled={busy || pending === 0} onClick={() => void save()}>
            {busy ? t('edu.common.saving') : t('edu.kiemTra.grid.save')}
          </Button>
          <span role='status' className='text-sm text-muted-foreground'>
            {pending === 0
              ? t('edu.kiemTra.grid.noChange')
              : t('edu.kiemTra.grid.pending', { count: pending })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
