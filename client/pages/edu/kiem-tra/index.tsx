import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { RecordLink } from '#components/record-link';
import { RowActions } from '#components/row-actions';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';

import { FilterSelect } from '../filter-select.js';
import { formatDay } from '../format.js';
import {
  LEVEL_KEYS,
  PAGE_SIZE,
  text,
  useRequest,
  useRows,
  type Loaded,
  type Row,
} from '../kit.js';
import { ListPage } from '../list-page.js';
import { useUrlSearch, useUrlState } from '../url-state.js';
import { TestFormDialog } from './test-form.js';
import {
  TEST_KINDS,
  TEST_STATUSES,
  type TestList,
  type TestRow,
} from './types.js';

/**
 * "Kiểm tra" (`/kiem-tra`): the tests of a level, newest first, 25 to a page read on the server. The class, level, kind,
 * status, search and page are kept in the address. What the person sees is decided by the server (the classes they teach
 * or the branches they manage); the "new test" button shows only to who holds `edu.kiemTra` `manage`.
 */
export default function KiemTraPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const url = useUrlState({ lop: '', cap: '', loai: '', tt: '', tim: '' });
  const [typed, setTyped] = useUrlSearch(url.values.tim, (tim) =>
    url.set({ tim }),
  );
  const classes = useRows('lop').loaded;
  const classRows = classes.state === 'ready' ? classes.rows : [];
  const { can: canManage } = useCan({
    resource: { type: 'composite', id: 'edu.kiemTra' },
    action: 'manage',
  });
  const [creating, setCreating] = useState(false);
  const { result, reload } = useRequest<TestList>('/kiemTra/danhSach', {
    ...(url.values.lop ? { lopId: Number(url.values.lop) } : {}),
    ...(url.values.cap ? { levelKey: url.values.cap } : {}),
    ...(url.values.loai ? { loai: url.values.loai } : {}),
    ...(url.values.tt ? { trangThai: url.values.tt } : {}),
    ...(url.values.tim ? { tim: url.values.tim } : {}),
    trang: url.page,
    limit: PAGE_SIZE,
  });
  const loaded: Loaded<Row> =
    result.state === 'ready'
      ? { state: 'ready', rows: result.data.danhSach as unknown as Row[] }
      : { state: result.state };
  const className = (id: number): string =>
    text(classRows.find((row) => row.id === id)?.ten);

  return (
    <>
      <ListPage
        title={t('edu.kiemTra.title')}
        description={t('edu.kiemTra.description')}
        emptyTitle={t('edu.kiemTra.empty')}
        emptyHint={t('edu.kiemTra.emptyHint')}
        loaded={loaded}
        onRetry={reload}
        paging={{
          page: url.page,
          total: result.state === 'ready' ? result.data.tong : 0,
          onPage: url.setPage,
        }}
        search={{
          value: typed,
          label: t('edu.kiemTra.search'),
          onChange: setTyped,
        }}
        filterControls={
          <>
            <FilterSelect
              label={t('edu.kiemTra.filter.class')}
              allLabel={t('edu.kiemTra.filter.allClasses')}
              value={url.values.lop}
              onChange={(lop) => url.set({ lop })}
              options={classRows.map((row) => ({
                value: String(row.id),
                label: `${text(row.ma)} · ${text(row.ten)}`,
              }))}
            />
            <FilterSelect
              label={t('edu.kiemTra.filter.level')}
              allLabel={t('edu.kiemTra.filter.allLevels')}
              value={url.values.cap}
              onChange={(cap) => url.set({ cap })}
              options={LEVEL_KEYS.map((key) => ({
                value: key,
                label: t(`edu.level.${key}`),
              }))}
            />
            <FilterSelect
              label={t('edu.kiemTra.filter.kind')}
              allLabel={t('edu.kiemTra.filter.allKinds')}
              value={url.values.loai}
              onChange={(loai) => url.set({ loai })}
              options={TEST_KINDS.map((kind) => ({
                value: kind,
                label: t(`edu.kiemTra.kind.${kind}`),
              }))}
            />
            <FilterSelect
              label={t('edu.kiemTra.filter.status')}
              allLabel={t('edu.kiemTra.filter.allStatuses')}
              value={url.values.tt}
              onChange={(tt) => url.set({ tt })}
              options={TEST_STATUSES.map((status) => ({
                value: status,
                label: t(`edu.kiemTra.status.${status}`),
              }))}
            />
          </>
        }
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)} className='gap-1.5'>
              <Plus className='h-4 w-4' />
              <span>{t('edu.kiemTra.new')}</span>
            </Button>
          ) : null
        }
        columns={[
          {
            key: 'ten',
            label: t('edu.kiemTra.col.name'),
            render: (row) => (
              <RecordLink to={`/kiem-tra/${row.id}`}>
                {text(row.ten)}
              </RecordLink>
            ),
          },
          {
            key: 'loai',
            label: t('edu.kiemTra.col.kind'),
            render: (row) => (
              <StatusBadge
                size='sm'
                tone={row.loai === 'len_cap' ? 'info' : 'neutral'}
              >
                {t(`edu.kiemTra.kind.${text(row.loai)}`)}
              </StatusBadge>
            ),
          },
          {
            key: 'levelKey',
            label: t('edu.kiemTra.col.level'),
            render: (row) => t(`edu.level.${text(row.levelKey)}`),
          },
          {
            key: 'lopId',
            label: t('edu.kiemTra.col.class'),
            render: (row) => className(Number(row.lopId)),
          },
          {
            key: 'ngay',
            label: t('edu.kiemTra.col.date'),
            render: (row) => formatDay(row.ngay),
          },
          {
            key: 'soHocVien',
            label: t('edu.kiemTra.col.tested'),
            render: (row) => text(row.soHocVien),
          },
          {
            key: 'trangThai',
            label: t('edu.kiemTra.col.status'),
            render: (row) => (
              <StatusBadge
                size='sm'
                tone={row.trangThai === 'da_chot' ? 'success' : 'warning'}
              >
                {t(`edu.kiemTra.status.${text(row.trangThai)}`)}
              </StatusBadge>
            ),
          },
        ]}
        rowActions={(row) => (
          <RowActions
            label={t('edu.kiemTra.rowActions', {
              name: (row as unknown as TestRow).ten,
            })}
            actions={[
              {
                key: 'open',
                label: t('edu.kiemTra.open'),
                render: <Link to={`/kiem-tra/${row.id}`} />,
              },
            ]}
          />
        )}
      />
      {creating ? (
        <TestFormDialog
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            // The new test opens at once: its marks are what comes next.
            void navigate(`/kiem-tra/${id}`);
          }}
        />
      ) : null}
    </>
  );
}
