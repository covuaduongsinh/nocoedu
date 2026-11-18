import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';

import { Field, FormDialog, SelectField, TextField } from '../form-parts.js';
import {
  LEVEL_KEYS,
  post,
  text,
  useRequest,
  useRows,
  todayVn,
} from '../kit.js';
import type { CurriculumTree } from '../kien-thuc/types.js';
import { TEST_KINDS, type TestBase, type TestSkill } from './types.js';

/** The top mark a skill gets when it is first ticked. */
const DEFAULT_TOP_MARK = 10;
const DEFAULT_PASS_PERCENT = 70;

/**
 * Makes a test, or edits one that has no mark yet (the server refuses an edit after the first mark). The skills on
 * offer are the active skills of the chosen level; each ticked skill takes a top mark. Nothing is saved until the form
 * is sent.
 */
export function TestFormDialog(props: {
  /** A test to edit with its skills; omitted to make a new one. */
  readonly initial?: {
    readonly bai: TestBase;
    readonly kyNang: readonly TestSkill[];
  };
  readonly onClose: () => void;
  readonly onSaved: (id: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const initial = props.initial;
  const [form, setForm] = useState(() => ({
    ten: initial?.bai.ten ?? '',
    loai: initial?.bai.loai ?? 'len_cap',
    levelKey: initial?.bai.levelKey ?? 'tot',
    lopId: initial ? String(initial.bai.lopId) : '',
    ngay: initial?.bai.ngay ?? todayVn(),
    diemDat: String(initial?.bai.diemDat ?? DEFAULT_PASS_PERCENT),
  }));
  const [picked, setPicked] = useState<ReadonlyMap<number, string>>(
    () =>
      new Map(
        (initial?.kyNang ?? []).map((skill) => [
          skill.kyNangId,
          String(skill.diemToiDa),
        ]),
      ),
  );
  const classes = useRows('lop').loaded;
  const tree = useRequest<CurriculumTree>('/chuongTrinh/cay', {
    levelKey: form.levelKey,
  }).result;
  const activeTopics =
    tree.state === 'ready'
      ? tree.data.chuDe.filter((topic) => topic.trangThai === 'hoat_dong')
      : [];
  const classRows = classes.state === 'ready' ? classes.rows : [];

  const toggle = (id: number, on: boolean): void =>
    setPicked((current) => {
      const next = new Map(current);
      if (on) next.set(id, next.get(id) ?? String(DEFAULT_TOP_MARK));
      else next.delete(id);
      return next;
    });

  return (
    <FormDialog
      open
      title={
        initial
          ? t('edu.kiemTra.form.editTitle')
          : t('edu.kiemTra.form.newTitle')
      }
      description={t('edu.kiemTra.form.hint')}
      onClose={props.onClose}
      onSubmit={async () => {
        if (picked.size === 0) throw new Error('no-skill');
        const response = (await post(api, '/kiemTra/luu', {
          ...(initial ? { id: initial.bai.id } : {}),
          ten: form.ten,
          loai: form.loai,
          levelKey: form.levelKey,
          lopId: Number(form.lopId),
          ngay: form.ngay,
          diemDat: Number(form.diemDat),
          kyNang: [...picked.entries()].map(([kyNangId, top]) => ({
            kyNangId,
            diemToiDa: Number(top),
          })),
        })) as { data: { id: number } };
        props.onSaved(response.data.id);
      }}
    >
      <TextField
        id='kt-ten'
        label={t('edu.kiemTra.form.name')}
        value={form.ten}
        required
        onChange={(ten) => setForm({ ...form, ten })}
      />
      <div className='grid gap-4 sm:grid-cols-2'>
        <SelectField
          id='kt-loai'
          label={t('edu.kiemTra.form.kind')}
          value={form.loai}
          onChange={(loai) =>
            setForm({ ...form, loai: loai as TestBase['loai'] })
          }
          options={TEST_KINDS.map((kind) => ({
            value: kind,
            label: t(`edu.kiemTra.kind.${kind}`),
          }))}
        />
        <SelectField
          id='kt-cap'
          label={t('edu.kiemTra.form.level')}
          value={form.levelKey}
          // Another level has other skills: what was ticked no longer applies.
          onChange={(levelKey) => {
            setForm({ ...form, levelKey });
            setPicked(new Map());
          }}
          options={LEVEL_KEYS.map((key) => ({
            value: key,
            label: t(`edu.level.${key}`),
          }))}
        />
        <SelectField
          id='kt-lop'
          label={t('edu.kiemTra.form.class')}
          value={form.lopId}
          required
          onChange={(lopId) => setForm({ ...form, lopId })}
          options={classRows
            .filter((row) => row.trangThai !== 'da_dong')
            .map((row) => ({
              value: String(row.id),
              label: `${text(row.ma)} · ${text(row.ten)}`,
            }))}
        />
        <TextField
          id='kt-ngay'
          type='date'
          label={t('edu.kiemTra.form.date')}
          value={form.ngay}
          required
          onChange={(ngay) => setForm({ ...form, ngay })}
        />
        <TextField
          id='kt-dat'
          type='number'
          label={t('edu.kiemTra.form.pass')}
          hint={t('edu.kiemTra.form.passHint')}
          value={form.diemDat}
          required
          onChange={(diemDat) => setForm({ ...form, diemDat })}
        />
      </div>
      <Field id='kt-skills' label={t('edu.kiemTra.form.skills')}>
        <div
          id='kt-skills'
          className='flex max-h-64 flex-col gap-3 overflow-y-auto rounded-lg border p-3'
        >
          {tree.state === 'loading' ? (
            <p role='status' className='text-sm text-muted-foreground'>
              {t('edu.common.loading')}
            </p>
          ) : tree.state === 'error' ? (
            <p role='alert' className='text-sm text-destructive'>
              {t('edu.common.loadError')}
            </p>
          ) : activeTopics.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('edu.kiemTra.form.noSkills', {
                level: t(`edu.level.${form.levelKey}`),
              })}
            </p>
          ) : (
            activeTopics.map((topic) => (
              <div key={topic.id} className='flex flex-col gap-1.5'>
                <span className='text-xs font-medium text-muted-foreground'>
                  {topic.ma} · {topic.ten}
                </span>
                {tree.data.kyNang
                  .filter(
                    (skill) =>
                      skill.chuDeId === topic.id &&
                      skill.trangThai === 'hoat_dong',
                  )
                  .map((skill) => {
                    const on = picked.has(skill.id);
                    return (
                      <div
                        key={skill.id}
                        className='flex items-center justify-between gap-2'
                      >
                        <label className='flex min-w-0 items-center gap-2 text-sm'>
                          <Checkbox
                            checked={on}
                            onCheckedChange={(checked) =>
                              toggle(skill.id, checked === true)
                            }
                            aria-label={`${skill.ma} ${skill.ten}`}
                          />
                          <span className='truncate'>
                            {skill.ma} · {skill.ten}
                          </span>
                        </label>
                        {on ? (
                          <Input
                            type='number'
                            min={1}
                            className='w-20'
                            aria-label={t('edu.kiemTra.form.topMarkOf', {
                              skill: skill.ma,
                            })}
                            value={picked.get(skill.id) ?? ''}
                            onChange={(event) =>
                              setPicked(
                                new Map(picked).set(
                                  skill.id,
                                  event.target.value,
                                ),
                              )
                            }
                          />
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            ))
          )}
        </div>
      </Field>
      <p className='text-xs text-muted-foreground' aria-live='polite'>
        {t('edu.kiemTra.form.picked', { count: picked.size })}
      </p>
    </FormDialog>
  );
}
