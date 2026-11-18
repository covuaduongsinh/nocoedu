import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
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
import { RowsTable } from './list-page.js';
import { useClassGroups } from './nhom.js';
import { useUrlState } from './url-state.js';

/** Students a group holds, counted by the server. Remounted (`key`) after a move so the number is read again. */
function GroupCount({ groupId }: { readonly groupId: number }): ReactElement {
  const { total, loaded } = usePagedRows('hocVien', {
    page: 1,
    pageSize: 1,
    where: { nhomId: groupId },
  });
  return <>{loaded.state === 'ready' ? total : '–'}</>;
}

function useCanDo(action: string): boolean {
  return useCan({
    resource: { type: 'composite', id: 'edu.lopNhom' },
    action,
  }).can;
}

/**
 * The "Nhóm" tab of a class (`/lop/:id?tab=nhom`): the groups (rename, add, hide) and the students with the group each
 * sits in (move). Reads go through the record APIs; a move is `POST /hocVien/chuyenNhom`, which the server checks again
 * (the group must be one of the student's own class). Buttons show only to who holds the action; the server decides.
 */
export function GroupsTab({
  classId,
}: {
  readonly classId: number;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const canManage = useCanDo('manage');
  const canMove = useCanDo('moveStudent');
  const url = useUrlState({ nhom: '' });
  const { loaded, groups, active, reload } = useClassGroups(classId);
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<
    { readonly kind: 'add' } | { readonly kind: 'rename'; readonly row: Row }
  >();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const nhomFilter = Number(url.values.nhom);
  const filterId =
    Number.isInteger(nhomFilter) &&
    groups.some((group) => group.id === nhomFilter)
      ? nhomFilter
      : undefined;
  const students = usePagedRows('hocVien', {
    page: url.page,
    where: {
      lopId: classId,
      ...(filterId ? { nhomId: filterId } : {}),
    },
  });

  const refresh = (): void => {
    reload();
    students.reload();
    setVersion((value) => value + 1);
  };
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
      refresh();
    } catch (cause) {
      setError(message(cause));
    }
  };

  const noGroups = loaded.state === 'ready' && groups.length === 0;

  return (
    <div className='flex flex-col gap-8'>
      <section className='flex flex-col gap-3'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='flex flex-col gap-1'>
            <h2 className='text-base font-semibold'>{t('edu.nhom.title')}</h2>
            <p className='max-w-2xl text-sm text-muted-foreground'>
              {t('edu.nhom.hint')}
            </p>
          </div>
          {canManage && !noGroups ? (
            <Button size='sm' onClick={() => setDialog({ kind: 'add' })}>
              {t('edu.nhom.add')}
            </Button>
          ) : null}
        </div>
        {noGroups ? (
          <div className='flex flex-col items-start gap-3 rounded-lg border p-4'>
            <p className='text-sm font-medium'>{t('edu.nhom.empty.title')}</p>
            <p className='text-sm text-muted-foreground'>
              {t('edu.nhom.empty.hint')}
            </p>
            {canManage ? (
              <Button
                size='sm'
                onClick={() =>
                  void run(() =>
                    post(api, 'lopNhom/taoMacDinh', { lopId: classId }),
                  )
                }
              >
                {t('edu.nhom.createDefault')}
              </Button>
            ) : null}
          </div>
        ) : (
          <RowsTable
            loaded={loaded}
            onRetry={reload}
            emptyTitle={t('edu.nhom.empty.title')}
            emptyHint={t('edu.nhom.empty.hint')}
            columns={[
              { key: 'ten', label: t('edu.nhom.name') },
              { key: 'thuTu', label: t('edu.nhom.order') },
              {
                key: 'trangThai',
                label: t('edu.hocVien.trangThai'),
                render: (row) => (
                  <StatusBadge
                    tone={row.trangThai === 'hoat_dong' ? 'success' : 'neutral'}
                    size='sm'
                  >
                    {t(`edu.nhom.status.${text(row.trangThai)}`)}
                  </StatusBadge>
                ),
              },
              {
                key: 'soHocVien',
                label: t('edu.nhom.students'),
                render: (row) => (
                  <GroupCount key={`${row.id}:${version}`} groupId={row.id} />
                ),
              },
            ]}
            rowActions={
              canManage
                ? (row) => (
                    <div className='flex flex-wrap justify-end gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => setDialog({ kind: 'rename', row })}
                      >
                        {t('edu.nhom.rename')}
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() =>
                          void run(() =>
                            updateOne(api, 'lopNhom', row.id, {
                              trangThai:
                                row.trangThai === 'hoat_dong'
                                  ? 'an'
                                  : 'hoat_dong',
                            }),
                          )
                        }
                      >
                        {row.trangThai === 'hoat_dong'
                          ? t('edu.nhom.hide')
                          : t('edu.nhom.unhide')}
                      </Button>
                    </div>
                  )
                : undefined
            }
          />
        )}
      </section>

      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {notice}
        </p>
      ) : null}

      <section className='flex flex-col gap-3'>
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div className='flex flex-col gap-1'>
            <h2 className='text-base font-semibold'>
              {t('edu.nhom.studentsTitle')}
            </h2>
            {canMove ? (
              <p className='text-sm text-muted-foreground'>
                {t('edu.nhom.studentsHint')}
              </p>
            ) : null}
          </div>
          <FilterSelect
            label={t('edu.nhom.filter.label')}
            allLabel={t('edu.nhom.filter.all')}
            value={filterId ? String(filterId) : ''}
            onChange={(nhom) => url.set({ nhom })}
            options={groups.map((group) => ({
              value: String(group.id),
              label: text(group.ten),
            }))}
          />
        </div>
        <RowsTable
          loaded={students.loaded}
          onRetry={students.reload}
          emptyTitle={t('edu.lop.noStudents')}
          emptyHint={t('edu.lop.noStudentsHint')}
          paging={{
            page: url.page,
            total: students.total,
            onPage: url.setPage,
          }}
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
              key: 'nhomId',
              label: t('edu.nhom.col'),
              render: (row) => {
                const current = row.nhomId == null ? '' : text(row.nhomId);
                const name = groups.find(
                  (group) => String(group.id) === current,
                );
                if (!canMove) return name ? text(name.ten) : t('edu.nhom.none');
                return (
                  <select
                    aria-label={`${t('edu.nhom.col')}: ${text(row.hoTen)}`}
                    value={current}
                    onChange={(event) =>
                      void run(async () => {
                        await post(api, 'hocVien/chuyenNhom', {
                          hocVienId: row.id,
                          nhomId: event.target.value
                            ? Number(event.target.value)
                            : null,
                        });
                        setNotice(t('edu.nhom.moved'));
                      })
                    }
                    className='h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
                  >
                    <option value=''>{t('edu.nhom.none')}</option>
                    {active.map((group) => (
                      <option key={group.id} value={String(group.id)}>
                        {text(group.ten)}
                      </option>
                    ))}
                  </select>
                );
              },
            },
          ]}
        />
      </section>

      {dialog ? (
        <GroupDialog
          key={dialog.kind === 'rename' ? dialog.row.id : 'new'}
          classId={classId}
          existing={groups}
          {...(dialog.kind === 'rename' ? { row: dialog.row } : {})}
          onClose={() => setDialog(undefined)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

/** The dialog that adds a group (no `row`) or renames one. The name is sent clean: trimmed, single-spaced. */
function GroupDialog(props: {
  readonly classId: number;
  readonly existing: readonly Row[];
  readonly row?: Row;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const nextOrder =
    props.existing.reduce((top, g) => Math.max(top, Number(g.thuTu) || 0), 0) +
    1;
  const [ten, setTen] = useState(() => text(props.row?.ten));
  const [thuTu, setThuTu] = useState(() =>
    props.row ? text(props.row.thuTu) : String(nextOrder),
  );
  const clean = ten.replace(/\s+/gu, ' ').trim();
  const order = Math.min(999, Math.max(0, Math.floor(Number(thuTu)) || 0));
  return (
    <FormDialog
      open
      title={props.row ? t('edu.nhom.renameTitle') : t('edu.nhom.addTitle')}
      onClose={props.onClose}
      onSubmit={async () => {
        if (props.row) {
          await updateOne(api, 'lopNhom', props.row.id, {
            ten: clean,
            thuTu: order,
          });
        } else {
          await createOne(api, 'lopNhom', {
            lopId: props.classId,
            ten: clean,
            thuTu: order,
          });
        }
        props.onSaved();
      }}
    >
      <TextField
        id='nhom-ten'
        label={t('edu.nhom.name')}
        value={ten}
        required
        onChange={setTen}
      />
      <TextField
        id='nhom-thu-tu'
        label={t('edu.nhom.order')}
        hint={t('edu.nhom.orderHint')}
        type='number'
        value={thuTu}
        onChange={setThuTu}
      />
    </FormDialog>
  );
}
