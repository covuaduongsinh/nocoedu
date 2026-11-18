import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Label } from '#components/ui/label';

import { FormDialog } from '../form-parts.js';
import { post, text, useRequest, type Row } from '../kit.js';
import type { CurriculumTree } from './types.js';

interface Taught {
  readonly danhSach: readonly {
    readonly kyNangId: number;
    readonly nhomId: number | null;
  }[];
}

/**
 * The skills taught in a session (GĐ 4), for the whole class or for one group of it: the block "Kỹ năng đã dạy" of
 * "Nội dung buổi học". The students marked present learn them when the register is saved (and at once when they are
 * already marked), the absent ones get them as gaps to make up. Shown to whoever holds `edu.kienThuc` `view`; the
 * "choose" buttons need `record`. The choices are the skills of the class's own level.
 */
export function SessionSkills(props: {
  readonly buoiHocId: number;
  readonly levelKey: string;
  /** The active groups of the class, in display order. */
  readonly groups: readonly Row[];
}): ReactElement | null {
  const { can: canView } = useCan({
    resource: { type: 'composite', id: 'edu.kienThuc' },
    action: 'view',
  });
  // Nothing is asked of the server before the person is known to hold the permission and the class level is known
  // (the classes load after the session: an empty level would be a bad request).
  return canView && props.levelKey !== '' ? (
    <SessionSkillsBody {...props} />
  ) : null;
}

function SessionSkillsBody(props: {
  readonly buoiHocId: number;
  readonly levelKey: string;
  readonly groups: readonly Row[];
}): ReactElement {
  const { t } = useTranslation();
  const { can: canRecord } = useCan({
    resource: { type: 'composite', id: 'edu.kienThuc' },
    action: 'record',
  });
  const taught = useRequest<Taught>('/buoiHoc/kyNang/xem', {
    buoiHocId: props.buoiHocId,
  });
  const tree = useRequest<CurriculumTree>('/chuongTrinh/cay', {
    levelKey: props.levelKey,
  });
  const [choosing, setChoosing] = useState<{
    readonly nhomId: number | null;
    readonly label: string;
  }>();
  if (taught.result.state === 'loading' || tree.result.state === 'loading')
    return (
      <p role='status' className='text-xs text-muted-foreground'>
        {t('edu.common.loading')}
      </p>
    );
  if (taught.result.state === 'error' || tree.result.state === 'error')
    return (
      <p role='alert' className='text-xs text-destructive'>
        {t('edu.common.loadError')}
      </p>
    );
  const skills = new Map(tree.result.data.kyNang.map((s) => [s.id, s]));
  const topics = tree.result.data.chuDe.filter(
    (topic) => topic.trangThai === 'hoat_dong',
  );
  const scopes = [
    { nhomId: null, label: t('edu.kt.session.wholeClass') },
    ...props.groups.map((group) => ({
      nhomId: group.id,
      label: text(group.ten),
    })),
  ];
  const selectedOf = (nhomId: number | null): number[] =>
    taught.result.state === 'ready'
      ? taught.result.data.danhSach
          .filter((row) => row.nhomId === nhomId)
          .map((row) => row.kyNangId)
      : [];

  return (
    <div className='flex flex-col gap-3 border-t pt-3'>
      <div>
        <h3 className='text-sm font-semibold'>{t('edu.kt.session.title')}</h3>
        <p className='text-xs text-muted-foreground'>
          {t('edu.kt.session.hint')}
        </p>
      </div>
      <ul className='flex flex-col gap-2'>
        {scopes.map((scope) => {
          const chosen = selectedOf(scope.nhomId);
          return (
            <li
              key={scope.nhomId ?? 'all'}
              className='flex flex-wrap items-center gap-2'
            >
              <span className='min-w-24 text-xs font-medium'>
                {scope.label}
              </span>
              {chosen.length === 0 ? (
                <span className='text-xs text-muted-foreground'>
                  {t('edu.kt.session.none')}
                </span>
              ) : (
                chosen.map((id) => (
                  <StatusBadge key={id} tone='info' size='sm'>
                    {skills.get(id)?.ma ?? id}
                    {skills.get(id) ? ` · ${skills.get(id)?.ten}` : ''}
                  </StatusBadge>
                ))
              )}
              {canRecord ? (
                <Button
                  size='sm'
                  variant='outline'
                  aria-label={`${t('edu.kt.session.choose')} – ${scope.label}`}
                  onClick={() => setChoosing(scope)}
                >
                  {t('edu.kt.session.choose')}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {choosing ? (
        <PickDialog
          buoiHocId={props.buoiHocId}
          scope={choosing}
          topics={topics}
          skills={tree.result.data.kyNang.filter(
            (skill) => skill.trangThai === 'hoat_dong',
          )}
          initial={selectedOf(choosing.nhomId)}
          onClose={() => setChoosing(undefined)}
          onSaved={taught.reload}
        />
      ) : null}
    </div>
  );
}

function PickDialog(props: {
  readonly buoiHocId: number;
  readonly scope: { readonly nhomId: number | null; readonly label: string };
  readonly topics: CurriculumTree['chuDe'];
  readonly skills: CurriculumTree['kyNang'];
  readonly initial: readonly number[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [picked, setPicked] = useState<ReadonlySet<number>>(
    () => new Set(props.initial),
  );
  const toggle = (id: number, on: boolean): void =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <FormDialog
      open
      title={`${t('edu.kt.session.dialogTitle')} – ${props.scope.label}`}
      description={t('edu.kt.session.dialogHint')}
      onClose={props.onClose}
      onSubmit={async () => {
        await post(api, '/buoiHoc/kyNang/luu', {
          buoiHocId: props.buoiHocId,
          nhomId: props.scope.nhomId,
          kyNangIds: [...picked],
        });
        props.onSaved();
      }}
    >
      {props.topics.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('edu.kt.session.noCurriculum')}
        </p>
      ) : (
        <div className='flex max-h-96 flex-col gap-4 overflow-y-auto'>
          {props.topics.map((topic) => (
            <fieldset key={topic.id} className='flex flex-col gap-1.5'>
              <legend className='text-sm font-semibold'>
                {topic.ma} · {topic.ten}
              </legend>
              {props.skills
                .filter((skill) => skill.chuDeId === topic.id)
                .map((skill) => (
                  <div key={skill.id} className='flex items-center gap-2'>
                    <Checkbox
                      id={`kt-pick-${skill.id}`}
                      checked={picked.has(skill.id)}
                      onCheckedChange={(checked) =>
                        toggle(skill.id, checked === true)
                      }
                    />
                    <Label
                      htmlFor={`kt-pick-${skill.id}`}
                      className='text-sm font-normal'
                    >
                      {skill.ma} · {skill.ten}
                    </Label>
                  </div>
                ))}
            </fieldset>
          ))}
        </div>
      )}
    </FormDialog>
  );
}
