import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { RecordLink } from '#components/record-link';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';

import { FormDialog, SelectField, TextField } from './form-parts.js';
import {
  LEVEL_KEYS,
  LEVEL_ORDER,
  post,
  text,
  useListState,
  usePagedRows,
  useRows,
  type Row,
} from './kit.js';
import { ListPage } from './list-page.js';

const NEW_STUDENT = {
  hoTen: '',
  namSinh: '',
  coSoId: '',
  lopId: '',
  levelKey: 'tot',
};
const NEW_PARENT = { hoTen: '', soDienThoai: '', zalo: '', quanHe: 'me' };
const RELATIONS = ['bo', 'me', 'ong', 'ba', 'nguoi_giam_ho', 'khac'] as const;

export default function HocVienPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const list = useListState();
  const { loaded, total, reload } = usePagedRows('hocVien', {
    page: list.page,
    search: list.applied,
    searchFields: ['ma', 'hoTen'],
  });
  const classes = useRows('lop').loaded;
  const branches = useRows('coSo').loaded;
  const { can: canCreate } = useCan({
    resource: { type: 'composite', id: 'edu.hocVien' },
    action: 'manage',
  });
  const { can: canLevelUp } = useCan({
    resource: { type: 'composite', id: 'edu.hocVien' },
    action: 'levelUp',
  });
  const { can: canAddParent } = useCan({
    resource: { type: 'composite', id: 'edu.phuHuynh' },
    action: 'manage',
  });

  const [student, setStudent] = useState<typeof NEW_STUDENT>();
  const [levelUp, setLevelUp] = useState<{ row: Row; levelKey: string }>();
  const [parent, setParent] = useState<{ row: Row; form: typeof NEW_PARENT }>();

  const classRows = classes.state === 'ready' ? classes.rows : [];
  const branchRows = branches.state === 'ready' ? branches.rows : [];
  const className = (id: unknown): string =>
    id == null
      ? t('edu.hocVien.noClass')
      : text(classRows.find((row) => row.id === id)?.ten);

  return (
    <>
      <ListPage
        title={t('edu.hocVien.title')}
        description={t('edu.hocVien.description')}
        emptyTitle={t('edu.hocVien.empty')}
        emptyHint={t('edu.hocVien.emptyHint')}
        loaded={loaded}
        onRetry={reload}
        paging={{ page: list.page, total, onPage: list.setPage }}
        search={{
          value: list.search,
          label: t('edu.common.search'),
          onChange: list.setSearch,
        }}
        actions={
          canCreate ? (
            <Button onClick={() => setStudent(NEW_STUDENT)}>
              {t('edu.hocVien.new')}
            </Button>
          ) : null
        }
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
          { key: 'namSinh', label: t('edu.hocVien.namSinh') },
          {
            key: 'levelKey',
            label: t('edu.hocVien.level'),
            render: (row) => t(`edu.level.${String(row.levelKey)}`),
          },
          {
            key: 'lopId',
            label: t('edu.hocVien.lop'),
            render: (row) => className(row.lopId),
          },
          {
            key: 'trangThai',
            label: t('edu.hocVien.trangThai'),
            render: (row) => (
              <StatusBadge
                tone={row.trangThai === 'dang_hoc' ? 'success' : 'neutral'}
              >
                {t(`edu.status.${String(row.trangThai)}`)}
              </StatusBadge>
            ),
          },
        ]}
        rowActions={
          canLevelUp || canAddParent
            ? (row) => (
                <div className='flex flex-wrap gap-2'>
                  {canLevelUp ? (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={Number(row.levelOrder) >= 6}
                      onClick={() =>
                        setLevelUp({
                          row,
                          levelKey:
                            LEVEL_KEYS[Math.min(Number(row.levelOrder), 5)] ??
                            'ma',
                        })
                      }
                    >
                      {t('edu.hocVien.levelUp')}
                    </Button>
                  ) : null}
                  {canAddParent ? (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => setParent({ row, form: NEW_PARENT })}
                    >
                      {t('edu.hocVien.addParent')}
                    </Button>
                  ) : null}
                </div>
              )
            : undefined
        }
      />

      {student ? (
        <FormDialog
          open
          title={t('edu.hocVien.new')}
          onClose={() => setStudent(undefined)}
          onSubmit={async () => {
            await post(api, 'hocVien/taoMoi', {
              hoTen: student.hoTen.trim(),
              namSinh: Number(student.namSinh),
              coSoId: Number(student.coSoId),
              lopId: student.lopId ? Number(student.lopId) : null,
              levelKey: student.levelKey,
            });
            reload();
          }}
        >
          <TextField
            id='hv-ho-ten'
            label={t('edu.hocVien.hoTen')}
            value={student.hoTen}
            required
            onChange={(hoTen) => setStudent({ ...student, hoTen })}
          />
          <TextField
            id='hv-nam-sinh'
            label={t('edu.hocVien.namSinh')}
            type='number'
            value={student.namSinh}
            required
            onChange={(namSinh) => setStudent({ ...student, namSinh })}
          />
          <SelectField
            id='hv-co-so'
            label={t('edu.hocVien.coSo')}
            value={student.coSoId}
            required
            onChange={(coSoId) => setStudent({ ...student, coSoId, lopId: '' })}
            options={branchRows.map((row) => ({
              value: String(row.id),
              label: String(row.ten),
            }))}
          />
          <SelectField
            id='hv-lop'
            label={t('edu.hocVien.lop')}
            value={student.lopId}
            allowEmpty
            onChange={(lopId) => setStudent({ ...student, lopId })}
            options={classRows
              .filter((row) => String(row.coSoId) === student.coSoId)
              .map((row) => ({
                value: String(row.id),
                label: String(row.ten),
              }))}
          />
          <SelectField
            id='hv-level'
            label={t('edu.hocVien.level')}
            value={student.levelKey}
            onChange={(levelKey) => setStudent({ ...student, levelKey })}
            options={LEVEL_KEYS.map((key) => ({
              value: key,
              label: t(`edu.level.${key}`),
            }))}
          />
        </FormDialog>
      ) : null}

      {levelUp ? (
        <FormDialog
          open
          title={t('edu.hocVien.levelUpTitle')}
          description={t('edu.hocVien.levelUpHint')}
          onClose={() => setLevelUp(undefined)}
          onSubmit={async () => {
            await post(api, 'hocVien/lenCap', {
              hocVienId: levelUp.row.id,
              denLevelKey: levelUp.levelKey,
            });
            reload();
          }}
        >
          <SelectField
            id='hv-level-up'
            label={t('edu.hocVien.newLevel')}
            value={levelUp.levelKey}
            onChange={(levelKey) => setLevelUp({ ...levelUp, levelKey })}
            options={LEVEL_KEYS.filter(
              (key) => (LEVEL_ORDER[key] ?? 0) > Number(levelUp.row.levelOrder),
            ).map((key) => ({
              value: key,
              label: t(`edu.level.${key}`),
            }))}
          />
        </FormDialog>
      ) : null}

      {parent ? (
        <FormDialog
          open
          title={`${t('edu.hocVien.addParent')}: ${String(parent.row.hoTen)}`}
          description={t('edu.hocVien.parentHint')}
          onClose={() => setParent(undefined)}
          onSubmit={async () => {
            await post(api, 'phuHuynh/taoMoi', {
              hocVienId: parent.row.id,
              hoTen: parent.form.hoTen.trim(),
              soDienThoai: parent.form.soDienThoai.trim(),
              zalo: parent.form.zalo.trim() || null,
              quanHe: parent.form.quanHe,
            });
          }}
        >
          <TextField
            id='ph-ho-ten'
            label={t('edu.hocVien.parentName')}
            value={parent.form.hoTen}
            required
            onChange={(hoTen) =>
              setParent({ ...parent, form: { ...parent.form, hoTen } })
            }
          />
          <TextField
            id='ph-sdt'
            label={t('edu.hocVien.parentPhone')}
            type='tel'
            value={parent.form.soDienThoai}
            required
            onChange={(soDienThoai) =>
              setParent({ ...parent, form: { ...parent.form, soDienThoai } })
            }
          />
          <TextField
            id='ph-zalo'
            label={t('edu.hocVien.parentZalo')}
            value={parent.form.zalo}
            onChange={(zalo) =>
              setParent({ ...parent, form: { ...parent.form, zalo } })
            }
          />
          <SelectField
            id='ph-quan-he'
            label={t('edu.hocVien.parentRelation')}
            value={parent.form.quanHe}
            onChange={(quanHe) =>
              setParent({ ...parent, form: { ...parent.form, quanHe } })
            }
            options={RELATIONS.map((key) => ({
              value: key,
              label: t(`edu.relation.${key}`),
            }))}
          />
        </FormDialog>
      ) : null}
    </>
  );
}
