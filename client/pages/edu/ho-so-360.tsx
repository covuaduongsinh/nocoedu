import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { buildFilter } from '@nocobase/repository-input';
import { Search } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { buttonVariants } from '#components/ui/button';
import { Input } from '#components/ui/input';

import { LevelBadge, SessionBalanceBadge } from './edu-ui-parts.js';
import { FilterSelect } from './filter-select.js';
import { text, usePagedRows, useRows, type Row } from './kit.js';
import { RowsTable } from './list-page.js';
import { useUrlSearch, useUrlState } from './url-state.js';

/** Digits, spaces and the signs of a phone number, at least three of them: the text is looked up as a parent's phone. */
const looksLikePhone = (value: string): boolean =>
  /^[\d\s.+-]{3,}$/u.test(value.trim());

/**
 * The students whose parent has a phone number containing `digits`: the parents, then their links. Both reads go through
 * the record APIs, so a person finds only the families they may see.
 */
function useStudentsOfPhone(digits: string): readonly number[] | undefined {
  const api = useApiClient();
  const [found, setFound] = useState<{
    digits: string;
    ids: readonly number[];
  }>();
  useEffect(() => {
    if (!digits) return;
    let live = true;
    void (async () => {
      const parents = (await api.repository('phuHuynh').findMany({
        filter: buildFilter((f) => f.string('soDienThoai').includes(digits)),
        limit: 100,
      })) as unknown as Row[];
      const ids: number[] = [];
      if (parents.length > 0) {
        const links = (await api.repository('lienKet').findMany({
          filter: buildFilter((f) =>
            f.or(parents.map((parent) => f.number('phuHuynhId').eq(parent.id))),
          ),
          limit: 100,
        })) as unknown as Row[];
        ids.push(...links.map((link) => Number(link.hocVienId)));
      }
      if (live) setFound({ digits, ids });
    })().catch(() => {
      if (live) setFound({ digits, ids: [] });
    });
    return () => {
      live = false;
    };
  }, [api, digits]);
  if (!digits) return undefined;
  return found?.digits === digits ? found.ids : undefined;
}

/**
 * "Hồ sơ 360°": the entry to the file of one student. One big search box (name, code or a parent's phone), a branch
 * and a class filter, 25 students a page read on the server, everything kept in the address. A row opens
 * `/hoc-vien/:id`, the one page that answers "how is this student doing?".
 */
export default function HoSo360Page(): ReactElement {
  const { t } = useTranslation();
  const url = useUrlState({ search: '', coSoId: '', lopId: '' });
  const [typed, setTyped] = useUrlSearch(url.values.search, (value) =>
    url.set({ search: value.trim() }),
  );
  const classes = useRows('lop').loaded;
  const branches = useRows('coSo').loaded;
  const classRows = classes.state === 'ready' ? classes.rows : [];
  const branchRows = branches.state === 'ready' ? branches.rows : [];
  const phone = looksLikePhone(url.values.search)
    ? url.values.search.replace(/\D/gu, '')
    : '';
  const byPhone = useStudentsOfPhone(phone);

  const where: Record<string, number> = {};
  if (url.values.coSoId) where.coSoId = Number(url.values.coSoId);
  if (url.values.lopId) where.lopId = Number(url.values.lopId);
  // A phone number matches students through their parents; any other text matches the name or the code.
  const { loaded, total, reload } = usePagedRows('hocVien', {
    page: url.page,
    where,
    ...(phone
      ? { ids: byPhone ?? [] }
      : { search: url.values.search, searchFields: ['ma', 'hoTen'] }),
  });
  const waitingForPhone = phone !== '' && byPhone === undefined;
  const shown = waitingForPhone ? { state: 'loading' as const } : loaded;

  const lopOptions = classRows
    .filter(
      (row) =>
        url.values.coSoId === '' || String(row.coSoId) === url.values.coSoId,
    )
    .map((row) => ({ value: String(row.id), label: text(row.ten) }));
  const className = (id: unknown): string =>
    text(classRows.find((row) => row.id === id)?.ten);

  return (
    <PageContainer className='mx-auto max-w-6xl space-y-6'>
      <PageHeader
        title={t('edu.hoSo360.title')}
        description={t('edu.hoSo360.description')}
      />
      <div className='relative'>
        <Search
          className='absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground'
          aria-hidden='true'
        />
        <Input
          type='search'
          autoFocus
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-label={t('edu.hoSo360.searchLabel')}
          placeholder={t('edu.hoSo360.searchLabel')}
          className='h-12 pl-11 text-base'
        />
      </div>
      <div className='flex flex-wrap items-center gap-3'>
        <FilterSelect
          label={t('edu.lop.coSo')}
          value={url.values.coSoId}
          allLabel={t('edu.hoSo360.allBranches')}
          options={branchRows.map((row) => ({
            value: String(row.id),
            label: text(row.ten),
          }))}
          onChange={(coSoId) => url.set({ coSoId, lopId: '' })}
        />
        <FilterSelect
          label={t('edu.hocVien.lop')}
          value={url.values.lopId}
          allLabel={t('edu.hoSo360.allClasses')}
          options={lopOptions}
          onChange={(lopId) => url.set({ lopId })}
        />
      </div>
      <RowsTable
        loaded={shown}
        onRetry={reload}
        emptyTitle={t('edu.hoSo360.empty')}
        emptyHint={t('edu.hoSo360.emptyHint')}
        paging={{ page: url.page, total, onPage: url.setPage }}
        columns={[
          {
            key: 'ma',
            label: t('edu.hocVien.ma'),
            render: (row) => (
              <RecordLink to={`/hoc-vien/${row.id}`}>{text(row.ma)}</RecordLink>
            ),
          },
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
            key: 'lop',
            label: t('edu.hocVien.lop'),
            render: (row) =>
              row.lopId == null
                ? t('edu.hocVien.noClass')
                : className(row.lopId),
          },
          {
            key: 'level',
            label: t('edu.hocVien.level'),
            render: (row) => <LevelBadge levelKey={row.levelKey} size='sm' />,
          },
          {
            key: 'trangThai',
            label: t('edu.hocVien.trangThai'),
            render: (row) => (
              <StatusBadge
                tone={row.trangThai === 'dang_hoc' ? 'success' : 'neutral'}
              >
                {t(`edu.status.${text(row.trangThai)}`)}
              </StatusBadge>
            ),
          },
          {
            key: 'soBuoiConLai',
            label: t('edu.diemDanh.balance'),
            render: (row) => (
              <SessionBalanceBadge
                balance={
                  row.soBuoiConLai == null ? null : Number(row.soBuoiConLai)
                }
                size='sm'
              />
            ),
          },
        ]}
        rowActions={(row) => (
          <Link
            to={`/hoc-vien/${row.id}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {t('edu.hoSo360.open')}
          </Link>
        )}
      />
    </PageContainer>
  );
}
