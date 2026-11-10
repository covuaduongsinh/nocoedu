import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';

import { FormDialog, SelectField, TextField } from './form-parts.js';
import {
  deleteOne,
  LEVEL_KEYS,
  LEVEL_ORDER,
  normalizePhone,
  post,
  text,
  updateOne,
  useRequest,
  useRows,
  type Row,
} from './kit.js';

/**
 * Edit and "delete" of a branch, a class, a student and a parent (DS-60 PR 4). A student, a class and a branch are
 * never deleted: they are set to an ended status, so the attendance, packages and balance history stay. A parent is
 * deleted for good only when nothing refers to it. The buttons follow the person's `manage` grant; the server checks
 * the same grant, the record scope and the allowed fields again, so hiding a button is only a convenience.
 */
export type Kind = 'coSo' | 'lop' | 'hocVien' | 'phuHuynh';

const COMPOSITE: Record<Kind, string> = {
  coSo: 'edu.coSo',
  lop: 'edu.lop',
  hocVien: 'edu.hocVien',
  phuHuynh: 'edu.phuHuynh',
};

/** The status a "delete" sets, and the statuses that already count as ended. A parent has no status. */
const ENDED: Record<Exclude<Kind, 'phuHuynh'>, string> = {
  coSo: 'tam_dung',
  lop: 'da_dong',
  hocVien: 'da_nghi',
};

const STATUS_OPTIONS: Record<Exclude<Kind, 'phuHuynh'>, readonly string[]> = {
  coSo: ['hoat_dong', 'tam_dung'],
  lop: ['dang_mo', 'da_dong'],
  hocVien: ['dang_hoc', 'tam_nghi', 'da_nghi', 'hoc_thu'],
};

/** "Edit" and "Remove" buttons of one row, with their dialogs. `onChanged` reloads whatever the page shows. */
export function RowManage(props: {
  readonly kind: Kind;
  readonly row: Row;
  readonly onChanged: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const { can } = useCan({
    resource: { type: 'composite', id: COMPOSITE[props.kind] },
    action: 'manage',
  });
  const [mode, setMode] = useState<'edit' | 'remove'>();
  if (!can) return null;
  const ended =
    props.kind !== 'phuHuynh' && props.row.trangThai === ENDED[props.kind];
  const close = (): void => setMode(undefined);
  return (
    <>
      <div className='flex flex-wrap gap-2'>
        <Button size='sm' variant='outline' onClick={() => setMode('edit')}>
          {t('edu.edit.edit')}
        </Button>
        {ended ? null : (
          <Button size='sm' variant='outline' onClick={() => setMode('remove')}>
            {t(`edu.edit.remove.${props.kind}`)}
          </Button>
        )}
      </div>
      {mode === 'edit' ? <EditDialog {...props} onClose={close} /> : null}
      {mode === 'remove' ? <RemoveDialog {...props} onClose={close} /> : null}
    </>
  );
}

function RemoveDialog(props: {
  readonly kind: Kind;
  readonly row: Row;
  readonly onChanged: () => void;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const name = text(props.row.hoTen) || text(props.row.ten);
  return (
    <FormDialog
      open
      title={`${t(`edu.edit.remove.${props.kind}`)}: ${name}`}
      description={t(`edu.edit.removeHint.${props.kind}`)}
      submitLabel={t(`edu.edit.remove.${props.kind}`)}
      onClose={props.onClose}
      onSubmit={async () => {
        if (props.kind === 'phuHuynh') {
          await post(api, 'phuHuynh/xoa', { id: props.row.id });
        } else {
          await updateOne(api, props.kind, props.row.id, {
            trangThai: ENDED[props.kind],
          });
        }
        props.onChanged();
      }}
    />
  );
}

function EditDialog(props: {
  readonly kind: Kind;
  readonly row: Row;
  readonly onChanged: () => void;
  readonly onClose: () => void;
}): ReactElement {
  if (props.kind === 'coSo') return <EditCoSo {...props} />;
  if (props.kind === 'lop') return <EditLop {...props} />;
  if (props.kind === 'hocVien') return <EditHocVien {...props} />;
  return <EditPhuHuynh {...props} />;
}

interface DialogProps {
  readonly row: Row;
  readonly onChanged: () => void;
  readonly onClose: () => void;
}

function statusField(
  kind: Exclude<Kind, 'phuHuynh'>,
  value: string,
  onChange: (value: string) => void,
  label: string,
  t: (key: string) => string,
): ReactElement {
  return (
    <SelectField
      id={`${kind}-trang-thai`}
      label={label}
      value={value}
      onChange={onChange}
      options={STATUS_OPTIONS[kind].map((key) => ({
        value: key,
        label: t(`edu.status.${key}`),
      }))}
    />
  );
}

function EditCoSo({ row, onChanged, onClose }: DialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [form, setForm] = useState({
    ten: text(row.ten),
    diaChi: text(row.diaChi),
    truBuoiVangCoPhep: row.truBuoiVangCoPhep === true,
    trangThai: text(row.trangThai),
  });
  return (
    <FormDialog
      open
      title={`${t('edu.edit.edit')}: ${text(row.ten)}`}
      onClose={onClose}
      onSubmit={async () => {
        await updateOne(api, 'coSo', row.id, {
          ten: form.ten.trim(),
          diaChi: form.diaChi.trim() || null,
          truBuoiVangCoPhep: form.truBuoiVangCoPhep,
          trangThai: form.trangThai,
        });
        onChanged();
      }}
    >
      <TextField
        id='sua-co-so-ten'
        label={t('edu.coSo.ten')}
        value={form.ten}
        required
        onChange={(ten) => setForm({ ...form, ten })}
      />
      <TextField
        id='sua-co-so-dia-chi'
        label={t('edu.coSo.diaChi')}
        value={form.diaChi}
        onChange={(diaChi) => setForm({ ...form, diaChi })}
      />
      <label className='flex items-center gap-2 text-sm'>
        <Checkbox
          checked={form.truBuoiVangCoPhep}
          onCheckedChange={(checked) =>
            setForm({ ...form, truBuoiVangCoPhep: checked === true })
          }
        />
        {t('edu.coSo.truBuoi')}
      </label>
      {statusField(
        'coSo',
        form.trangThai,
        (trangThai) => setForm({ ...form, trangThai }),
        t('edu.coSo.trangThai'),
        t,
      )}
    </FormDialog>
  );
}

function EditLop({ row, onChanged, onClose }: DialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const coaches = useRequest<{ id: string; name: string }[]>(
    '/hlv/danhSach',
    {},
  ).result;
  const [form, setForm] = useState({
    ten: text(row.ten),
    hlvId: text(row.hlvId),
    levelKey: text(row.levelKey) || 'tot',
    trangThai: text(row.trangThai),
  });
  const coachRows = coaches.state === 'ready' ? coaches.data : [];
  return (
    <FormDialog
      open
      title={`${t('edu.edit.edit')}: ${text(row.ten)}`}
      onClose={onClose}
      onSubmit={async () => {
        await updateOne(api, 'lop', row.id, {
          ten: form.ten.trim(),
          hlvId: form.hlvId || null,
          levelKey: form.levelKey,
          levelOrder: LEVEL_ORDER[form.levelKey] ?? 1,
          trangThai: form.trangThai,
        });
        onChanged();
      }}
    >
      <TextField
        id='sua-lop-ten'
        label={t('edu.lop.ten')}
        value={form.ten}
        required
        onChange={(ten) => setForm({ ...form, ten })}
      />
      <SelectField
        id='sua-lop-level'
        label={t('edu.lop.level')}
        value={form.levelKey}
        onChange={(levelKey) => setForm({ ...form, levelKey })}
        options={LEVEL_KEYS.map((key) => ({
          value: key,
          label: t(`edu.level.${key}`),
        }))}
      />
      <SelectField
        id='sua-lop-hlv'
        label={t('edu.lop.hlv')}
        value={form.hlvId}
        allowEmpty
        onChange={(hlvId) => setForm({ ...form, hlvId })}
        options={coachRows.map((coach) => ({
          value: coach.id,
          label: coach.name,
        }))}
      />
      {statusField(
        'lop',
        form.trangThai,
        (trangThai) => setForm({ ...form, trangThai }),
        t('edu.lop.trangThai'),
        t,
      )}
    </FormDialog>
  );
}

function EditHocVien({ row, onChanged, onClose }: DialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const classes = useRows('lop').loaded;
  const [form, setForm] = useState({
    hoTen: text(row.hoTen),
    namSinh: text(row.namSinh),
    lopId: row.lopId == null ? '' : text(row.lopId),
    trangThai: text(row.trangThai),
    ghiChuHlv: text(row.ghiChuHlv),
  });
  const classRows = classes.state === 'ready' ? classes.rows : [];
  return (
    <FormDialog
      open
      title={`${t('edu.edit.edit')}: ${text(row.hoTen)}`}
      description={t('edu.edit.studentHint')}
      onClose={onClose}
      onSubmit={async () => {
        await updateOne(api, 'hocVien', row.id, {
          hoTen: form.hoTen.trim(),
          namSinh: Number(form.namSinh),
          trangThai: form.trangThai,
          ghiChuHlv: form.ghiChuHlv.trim() || null,
        });
        // The class is not a plain field: moving a student goes through the route that checks both classes.
        if (form.lopId !== (row.lopId == null ? '' : text(row.lopId))) {
          await post(api, 'hocVien/chuyenLop', {
            id: row.id,
            lopId: form.lopId ? Number(form.lopId) : null,
          });
        }
        onChanged();
      }}
    >
      <TextField
        id='sua-hv-ho-ten'
        label={t('edu.hocVien.hoTen')}
        value={form.hoTen}
        required
        onChange={(hoTen) => setForm({ ...form, hoTen })}
      />
      <TextField
        id='sua-hv-nam-sinh'
        label={t('edu.hocVien.namSinh')}
        type='number'
        value={form.namSinh}
        required
        onChange={(namSinh) => setForm({ ...form, namSinh })}
      />
      <SelectField
        id='sua-hv-lop'
        label={t('edu.hocVien.lop')}
        value={form.lopId}
        allowEmpty
        onChange={(lopId) => setForm({ ...form, lopId })}
        options={classRows
          .filter((cls) => cls.coSoId === row.coSoId)
          .map((cls) => ({ value: String(cls.id), label: text(cls.ten) }))}
      />
      {statusField(
        'hocVien',
        form.trangThai,
        (trangThai) => setForm({ ...form, trangThai }),
        t('edu.hocVien.trangThai'),
        t,
      )}
      <TextField
        id='sua-hv-ghi-chu'
        label={t('edu.hocVien.ghiChu')}
        value={form.ghiChuHlv}
        onChange={(ghiChuHlv) => setForm({ ...form, ghiChuHlv })}
      />
    </FormDialog>
  );
}

function EditPhuHuynh({ row, onChanged, onClose }: DialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [form, setForm] = useState({
    hoTen: text(row.hoTen),
    soDienThoai: text(row.soDienThoai),
    zalo: text(row.zalo),
    ghiChu: text(row.ghiChu),
  });
  return (
    <FormDialog
      open
      title={`${t('edu.edit.edit')}: ${text(row.hoTen)}`}
      onClose={onClose}
      onSubmit={async () => {
        await updateOne(api, 'phuHuynh', row.id, {
          hoTen: form.hoTen.trim(),
          soDienThoai: normalizePhone(form.soDienThoai),
          zalo: form.zalo.trim() || null,
          ghiChu: form.ghiChu.trim() || null,
        });
        onChanged();
      }}
    >
      <TextField
        id='sua-ph-ho-ten'
        label={t('edu.phuHuynh.hoTen')}
        value={form.hoTen}
        required
        onChange={(hoTen) => setForm({ ...form, hoTen })}
      />
      <TextField
        id='sua-ph-sdt'
        label={t('edu.phuHuynh.soDienThoai')}
        type='tel'
        value={form.soDienThoai}
        required
        onChange={(soDienThoai) => setForm({ ...form, soDienThoai })}
      />
      <TextField
        id='sua-ph-zalo'
        label={t('edu.phuHuynh.zalo')}
        value={form.zalo}
        onChange={(zalo) => setForm({ ...form, zalo })}
      />
      <TextField
        id='sua-ph-ghi-chu'
        label={t('edu.hocVien.ghiChu')}
        value={form.ghiChu}
        onChange={(ghiChu) => setForm({ ...form, ghiChu })}
      />
    </FormDialog>
  );
}

/** A coach's note on a student: the one thing a coach may change on the student file. */
export function NoteButton(props: {
  readonly row: Row;
  readonly onChanged: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApiClient();
  const { can } = useCan({
    resource: { type: 'composite', id: 'edu.hocVien' },
    action: 'updateNote',
  });
  const [note, setNote] = useState<string>();
  if (!can) return null;
  return (
    <>
      <Button
        size='sm'
        variant='outline'
        onClick={() => setNote(text(props.row.ghiChuHlv))}
      >
        {t('edu.edit.note')}
      </Button>
      {note !== undefined ? (
        <FormDialog
          open
          title={`${t('edu.edit.note')}: ${text(props.row.hoTen)}`}
          onClose={() => setNote(undefined)}
          onSubmit={async () => {
            await post(api, 'hocVien/capNhatGhiChu', {
              id: props.row.id,
              ghiChuHlv: note.trim(),
            });
            props.onChanged();
          }}
        >
          <TextField
            id='ghi-chu-hlv'
            label={t('edu.hocVien.ghiChu')}
            value={note}
            onChange={setNote}
          />
        </FormDialog>
      ) : null}
    </>
  );
}

/** Removes the link between a student and a parent; the parent record stays. */
export function UnlinkButton(props: {
  readonly linkId: number;
  readonly onChanged: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApiClient();
  const { can } = useCan({
    resource: { type: 'composite', id: 'edu.lienKet' },
    action: 'manage',
  });
  const [open, setOpen] = useState(false);
  if (!can) return null;
  return (
    <>
      <Button size='sm' variant='outline' onClick={() => setOpen(true)}>
        {t('edu.edit.unlink')}
      </Button>
      {open ? (
        <FormDialog
          open
          title={t('edu.edit.unlink')}
          description={t('edu.edit.unlinkHint')}
          submitLabel={t('edu.edit.unlink')}
          onClose={() => setOpen(false)}
          onSubmit={async () => {
            await deleteOne(api, 'lienKet', props.linkId);
            props.onChanged();
          }}
        />
      ) : null}
    </>
  );
}
