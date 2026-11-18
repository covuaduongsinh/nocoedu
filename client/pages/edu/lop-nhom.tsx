import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';

import { FilterSelect } from './filter-select.js';
import { FormDialog, TextField } from './form-parts.js';
import {
  createOne,
  post,
  text,
  updateOne,
  useErrorMessage,
  usePagedRows,
  type Row,
} from './kit.js';
import { useClassGroups } from './nhom.js';
import { RowsTable } from './list-page.js';

/**
 * Groups of level inside a class (GĐ 3). The tab "Nhóm" of the class page lists them, adds, renames, orders and hides
 * them (the standard record API of `lopNhom`) and places each student in one (`POST /hocVien/chuyenNhom`). Buttons
 * follow the `edu.lopNhom` `manage` grant; the server checks the grant, the scope and the rules again.
 */

interface Editing {
  readonly id?: number;
  readonly ten: string;
  readonly thuTu: string;
}

export function GroupTab({ lop }: { readonly lop: Row }): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const { can } = useCan({
    resource: { type: 'composite', id: 'edu.lopNhom' },
    action: 'manage',
  });
  const groups = useClassGroups(lop.id);
  const students = usePagedRows('hocVien', {
    page: 1,
    pageSize: 100,
    where: { lopId: lop.id, trangThai: 'dang_hoc' },
  });
  const [editing, setEditing] = useState<Editing>();
  const [error, setError] = useState<string>();
  const [moved, setMoved] = useState(false);

  const groupRows = groups.loaded.state === 'ready' ? groups.loaded.rows : [];
  const studentRows =
    students.loaded.state === 'ready' ? students.loaded.rows : [];
  const activeGroups = groupRows.filter((g) => g.trangThai === 'hoat_dong');
  const countOf = (groupId: number): number =>
    studentRows.filter((s) => Number(s.nhomId) === groupId).length;
  const nextOrder =
    groupRows.reduce((max, g) => Math.max(max, Number(g.thuTu) || 0), 0) + 1;

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(undefined);
    setMoved(false);
    try {
      await action();
    } catch (cause) {
      setError(message(cause));
    }
  };
  const reload = (): void => {
    groups.reload();
    students.reload();
  };
  const toggle = (group: Row): Promise<void> =>
    run(async () => {
      await updateOne(api, 'lopNhom', group.id, {
        trangThai: group.trangThai === 'hoat_dong' ? 'an' : 'hoat_dong',
      });
      reload();
    });
  const place = (student: Row, value: string): Promise<void> =>
    run(async () => {
      await post(api, '/hocVien/chuyenNhom', {
        hocVienId: student.id,
        nhomId: value === '' ? null : Number(value),
      });
      reload();
      setMoved(true);
    });

  if (groups.loaded.state === 'ready' && groupRows.length === 0) {
    return (
      <div className='flex flex-col items-start gap-3'>
        <p className='text-sm text-muted-foreground'>
          {t('edu.nhom.noGroups')}
        </p>
        {can ? (
          <Button
            onClick={() =>
              void run(async () => {
                await post(api, '/lopNhom/taoMacDinh', { lopId: lop.id });
                reload();
              })
            }
          >
            {t('edu.nhom.createDefaults')}
          </Button>
        ) : null}
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-8'>
      <section className='flex flex-col gap-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div>
            <h2 className='text-base font-semibold'>{t('edu.nhom.title')}</h2>
            <p className='text-sm text-muted-foreground'>
              {t('edu.nhom.hint')}
            </p>
          </div>
          {can ? (
            <Button
              size='sm'
              onClick={() => setEditing({ ten: '', thuTu: String(nextOrder) })}
            >
              <Plus className='h-4 w-4' />
              {t('edu.nhom.add')}
            </Button>
          ) : null}
        </div>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        <RowsTable
          loaded={groups.loaded}
          onRetry={groups.reload}
          emptyTitle={t('edu.nhom.noGroups')}
          emptyHint=''
          columns={[
            {
              key: 'ten',
              label: t('edu.nhom.name'),
              render: (row) => (
                <span className='font-medium'>{text(row.ten)}</span>
              ),
            },
            {
              key: 'members',
              label: t('edu.nhom.members'),
              render: (row) => countOf(row.id),
            },
            {
              key: 'trangThai',
              label: t('edu.nhom.status'),
              render: (row) => (
                <StatusBadge
                  tone={row.trangThai === 'hoat_dong' ? 'success' : 'neutral'}
                  size='sm'
                >
                  {row.trangThai === 'hoat_dong'
                    ? t('edu.nhom.active')
                    : t('edu.nhom.hidden')}
                </StatusBadge>
              ),
            },
          ]}
          rowActions={
            can
              ? (row) => (
                  <div className='flex justify-end gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() =>
                        setEditing({
                          id: row.id,
                          ten: text(row.ten),
                          thuTu: text(row.thuTu),
                        })
                      }
                    >
                      {t('edu.nhom.rename')}
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => void toggle(row)}
                    >
                      {row.trangThai === 'hoat_dong'
                        ? t('edu.nhom.hide')
                        : t('edu.nhom.show')}
                    </Button>
                  </div>
                )
              : undefined
          }
        />
      </section>

      <section className='flex flex-col gap-3'>
        <h2 className='text-base font-semibold'>
          {t('edu.nhom.studentsTitle')}
        </h2>
        {moved ? (
          <p role='status' className='text-sm text-emerald-600'>
            {t('edu.nhom.moved')}
          </p>
        ) : null}
        <RowsTable
          loaded={students.loaded}
          onRetry={students.reload}
          emptyTitle={t('edu.nhom.noStudents')}
          emptyHint=''
          columns={[
            { key: 'ma', label: t('edu.hocVien.ma') },
            {
              key: 'hoTen',
              label: t('edu.hocVien.hoTen'),
              render: (row) => (
                <RecordLink to={`/hoc-vien/${row.id}`}>
                  {text(row.hoTen)}
                </RecordLink>
              ),
            },
            {
              key: 'nhom',
              label: t('edu.nhom.label'),
              render: (row) =>
                can ? (
                  <FilterSelect
                    label={`${t('edu.nhom.label')} – ${text(row.hoTen)}`}
                    allLabel={t('edu.nhom.none')}
                    value={row.nhomId == null ? '' : text(row.nhomId)}
                    onChange={(value) => void place(row, value)}
                    options={activeGroups.map((g) => ({
                      value: String(g.id),
                      label: text(g.ten),
                    }))}
                  />
                ) : (
                  text(groupRows.find((g) => g.id === row.nhomId)?.ten) ||
                  t('edu.nhom.none')
                ),
            },
          ]}
        />
      </section>

      {editing ? (
        <FormDialog
          open
          title={editing.id ? t('edu.nhom.rename') : t('edu.nhom.add')}
          onClose={() => setEditing(undefined)}
          onSubmit={async () => {
            const values = {
              ten: editing.ten.trim().replace(/\s+/gu, ' '),
              thuTu: Number(editing.thuTu) || 0,
            };
            if (editing.id) await updateOne(api, 'lopNhom', editing.id, values);
            else await createOne(api, 'lopNhom', { ...values, lopId: lop.id });
            reload();
          }}
        >
          <TextField
            id='nhom-ten'
            label={t('edu.nhom.name')}
            value={editing.ten}
            required
            onChange={(ten) => setEditing({ ...editing, ten })}
          />
          <TextField
            id='nhom-thu-tu'
            label={t('edu.nhom.order')}
            type='number'
            value={editing.thuTu}
            onChange={(thuTu) => setEditing({ ...editing, thuTu })}
          />
        </FormDialog>
      ) : null}
    </div>
  );
}
