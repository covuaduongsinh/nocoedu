import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowDown, ArrowUp, Download, Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Card, CardContent } from '#components/ui/card';
import { Checkbox } from '#components/ui/checkbox';
import { Label } from '#components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import { Textarea } from '#components/ui/textarea';

import { saveCsvStream } from '../download.js';
import { Field, FormDialog, SelectField, TextField } from '../form-parts.js';
import {
  LEVEL_KEYS,
  post,
  text,
  useErrorMessage,
  useRequest,
  useRows,
} from '../kit.js';
import { useUrlState } from '../url-state.js';
import type { CurriculumTree, Skill, Topic } from '../kien-thuc/types.js';
import { ImportCurriculum } from './import.js';

interface TopicEdit {
  readonly id?: number;
  readonly ma: string;
  readonly ten: string;
}
interface SkillEdit {
  readonly id?: number;
  readonly chuDeId: number;
  readonly ma: string;
  readonly ten: string;
  readonly moTa: string;
  readonly sachId: string;
}

/**
 * "Chương trình" (`/chuong-trinh`): the six levels, their topics and the skills of each topic. Everybody who teaches or
 * manages reads it; only the administrator (`edu.chuongTrinh` `manage`) adds, edits, hides, orders and imports. A topic
 * or a skill is hidden, never deleted: what was taught and what students learned point at it. The level is the tab in
 * the address (`?cap=`); `?an=1` shows the hidden ones.
 */
export default function ChuongTrinhPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const url = useUrlState({ cap: 'tot', an: '' });
  const level = (LEVEL_KEYS as readonly string[]).includes(url.values.cap)
    ? url.values.cap
    : 'tot';
  const showHidden = url.values.an === '1';
  const { result, reload } = useRequest<CurriculumTree>('/chuongTrinh/cay', {
    levelKey: level,
  });
  const { can: canManage } = useCan({
    resource: { type: 'composite', id: 'edu.chuongTrinh' },
    action: 'manage',
  });
  const { can: canExport } = useCan({
    resource: { type: 'composite', id: 'edu.baoCao' },
    action: 'export',
  });
  const [topicEdit, setTopicEdit] = useState<TopicEdit>();
  const [skillEdit, setSkillEdit] = useState<SkillEdit>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await action();
      reload();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  const exportCsv = (): Promise<void> =>
    run(async () => {
      const stream = await api.stream({
        path: '/chuongTrinh/xuatCsv',
        method: 'POST',
        json: {},
      });
      await saveCsvStream(stream, 'chuong-trinh.csv');
    });
  const setStatus = (kind: 'chuDe' | 'kyNang', row: Topic | Skill) =>
    run(() =>
      post(api, `/chuongTrinh/${kind}/luu`, {
        id: row.id,
        trangThai: row.trangThai === 'hoat_dong' ? 'an' : 'hoat_dong',
      }),
    );
  const move = (
    kind: 'chuDe' | 'kyNang',
    siblings: readonly { id: number }[],
    index: number,
    by: -1 | 1,
  ) => {
    const ids = siblings.map((row) => row.id);
    const other = ids[index + by];
    if (other === undefined) return Promise.resolve();
    ids[index + by] = ids[index];
    ids[index] = other;
    return run(() => post(api, '/chuongTrinh/sapXep', { loai: kind, ids }));
  };

  const data = result.state === 'ready' ? result.data : undefined;
  const topics = (data?.chuDe ?? []).filter(
    (topic) => showHidden || topic.trangThai === 'hoat_dong',
  );
  const skillsOf = (topicId: number): readonly Skill[] =>
    (data?.kyNang ?? []).filter(
      (skill) =>
        skill.chuDeId === topicId &&
        (showHidden || skill.trangThai === 'hoat_dong'),
    );
  const nextOrder = (rows: readonly { thuTu: number }[]): number =>
    rows.reduce((max, row) => Math.max(max, row.thuTu), 0) + 1;

  return (
    <PageContainer className='mx-auto max-w-5xl space-y-6'>
      <PageHeader
        title={t('edu.ct.title')}
        description={t('edu.ct.description')}
        actions={
          <>
            {canExport ? (
              <Button
                variant='outline'
                disabled={busy}
                onClick={() => void exportCsv()}
              >
                <Download className='size-3.5' />
                {t('edu.ct.export')}
              </Button>
            ) : null}
            {canManage ? <ImportCurriculum onImported={reload} /> : null}
            {canManage ? (
              <Button onClick={() => setTopicEdit({ ma: '', ten: '' })}>
                <Plus className='size-3.5' />
                {t('edu.ct.addTopic')}
              </Button>
            ) : null}
          </>
        }
      />
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Tabs
          value={level}
          onValueChange={(cap) => url.set({ cap: String(cap) })}
        >
          <TabsList className='flex-wrap'>
            {LEVEL_KEYS.map((key) => (
              <TabsTrigger key={key} value={key}>
                {t(`edu.level.${key}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {canManage ? (
          <div className='flex items-center gap-2'>
            <Checkbox
              id='ct-show-hidden'
              checked={showHidden}
              onCheckedChange={(checked) =>
                url.set({ an: checked === true ? '1' : '' })
              }
            />
            <Label htmlFor='ct-show-hidden' className='text-sm'>
              {t('edu.ct.showHidden')}
            </Label>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}

      {result.state === 'loading' ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('edu.common.loading')}
        </p>
      ) : result.state === 'error' ? (
        <div role='alert' className='flex flex-col items-start gap-3'>
          <p className='text-sm text-destructive'>
            {t('edu.common.loadError')}
          </p>
          <Button variant='outline' onClick={reload}>
            {t('edu.common.retry')}
          </Button>
        </div>
      ) : topics.length === 0 ? (
        <p className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
          {canManage
            ? t('edu.ct.emptyAdmin', { level: t(`edu.level.${level}`) })
            : t('edu.ct.empty', { level: t(`edu.level.${level}`) })}
        </p>
      ) : (
        <div className='flex flex-col gap-4'>
          {topics.map((topic, topicIndex) => {
            const skills = skillsOf(topic.id);
            return (
              <Card key={topic.id}>
                <CardContent className='flex flex-col gap-3 p-4'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='font-mono text-xs text-muted-foreground'>
                        {topic.ma}
                      </span>
                      <h2 className='text-base font-semibold'>{topic.ten}</h2>
                      {topic.trangThai !== 'hoat_dong' ? (
                        <StatusBadge size='sm'>
                          {t('edu.nhom.hidden')}
                        </StatusBadge>
                      ) : null}
                      <span className='text-xs text-muted-foreground'>
                        {t('edu.ct.skillCount', { count: skills.length })}
                      </span>
                    </div>
                    {canManage ? (
                      <div className='flex flex-wrap items-center gap-2'>
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={busy || topicIndex === 0}
                          aria-label={`${t('edu.ct.moveUp')} – ${topic.ma}`}
                          onClick={() =>
                            void move('chuDe', topics, topicIndex, -1)
                          }
                        >
                          <ArrowUp className='size-3.5' />
                        </Button>
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={busy || topicIndex === topics.length - 1}
                          aria-label={`${t('edu.ct.moveDown')} – ${topic.ma}`}
                          onClick={() =>
                            void move('chuDe', topics, topicIndex, 1)
                          }
                        >
                          <ArrowDown className='size-3.5' />
                        </Button>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() =>
                            setTopicEdit({
                              id: topic.id,
                              ma: topic.ma,
                              ten: topic.ten,
                            })
                          }
                        >
                          {t('edu.ct.editTopic')}
                        </Button>
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={busy}
                          onClick={() => void setStatus('chuDe', topic)}
                        >
                          {topic.trangThai === 'hoat_dong'
                            ? t('edu.nhom.hide')
                            : t('edu.nhom.show')}
                        </Button>
                        <Button
                          size='sm'
                          onClick={() =>
                            setSkillEdit({
                              chuDeId: topic.id,
                              ma: '',
                              ten: '',
                              moTa: '',
                              sachId: '',
                            })
                          }
                        >
                          <Plus className='size-3.5' />
                          {t('edu.ct.addSkill')}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {skills.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      {t('edu.ct.noSkills')}
                    </p>
                  ) : (
                    <ul className='flex flex-col divide-y rounded-lg border'>
                      {skills.map((skill, index) => (
                        <li
                          key={skill.id}
                          className='flex flex-wrap items-start justify-between gap-2 p-3'
                        >
                          <div className='flex min-w-0 flex-col gap-0.5'>
                            <div className='flex flex-wrap items-center gap-2'>
                              <span className='font-mono text-xs text-muted-foreground'>
                                {skill.ma}
                              </span>
                              <span className='text-sm font-medium'>
                                {skill.ten}
                              </span>
                              {skill.trangThai !== 'hoat_dong' ? (
                                <StatusBadge size='sm'>
                                  {t('edu.nhom.hidden')}
                                </StatusBadge>
                              ) : null}
                            </div>
                            {skill.moTa ? (
                              <p className='text-xs text-muted-foreground'>
                                {skill.moTa}
                              </p>
                            ) : null}
                          </div>
                          {canManage ? (
                            <div className='flex flex-wrap items-center gap-2'>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={busy || index === 0}
                                aria-label={`${t('edu.ct.moveUp')} – ${skill.ma}`}
                                onClick={() =>
                                  void move('kyNang', skills, index, -1)
                                }
                              >
                                <ArrowUp className='size-3.5' />
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={busy || index === skills.length - 1}
                                aria-label={`${t('edu.ct.moveDown')} – ${skill.ma}`}
                                onClick={() =>
                                  void move('kyNang', skills, index, 1)
                                }
                              >
                                <ArrowDown className='size-3.5' />
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                aria-label={`${t('edu.ct.editSkill')} – ${skill.ma}`}
                                onClick={() =>
                                  setSkillEdit({
                                    id: skill.id,
                                    chuDeId: skill.chuDeId,
                                    ma: skill.ma,
                                    ten: skill.ten,
                                    moTa: skill.moTa ?? '',
                                    sachId:
                                      skill.sachId == null
                                        ? ''
                                        : String(skill.sachId),
                                  })
                                }
                              >
                                {t('edu.ct.editSkill')}
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={busy}
                                aria-label={`${skill.trangThai === 'hoat_dong' ? t('edu.nhom.hide') : t('edu.nhom.show')} – ${skill.ma}`}
                                onClick={() => void setStatus('kyNang', skill)}
                              >
                                {skill.trangThai === 'hoat_dong'
                                  ? t('edu.nhom.hide')
                                  : t('edu.nhom.show')}
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {topicEdit ? (
        <FormDialog
          open
          title={topicEdit.id ? t('edu.ct.editTopic') : t('edu.ct.addTopic')}
          onClose={() => setTopicEdit(undefined)}
          onSubmit={async () => {
            await post(api, '/chuongTrinh/chuDe/luu', {
              ...(topicEdit.id
                ? { id: topicEdit.id }
                : { levelKey: level, ma: topicEdit.ma.trim() }),
              ten: topicEdit.ten.trim(),
              ...(topicEdit.id ? {} : { thuTu: nextOrder(data?.chuDe ?? []) }),
            });
            reload();
          }}
        >
          <TextField
            id='ct-topic-ma'
            label={t('edu.ct.code')}
            value={topicEdit.ma}
            required
            hint={topicEdit.id ? t('edu.ct.codeFixed') : t('edu.ct.codeHint')}
            onChange={(ma) =>
              topicEdit.id ? undefined : setTopicEdit({ ...topicEdit, ma })
            }
          />
          <TextField
            id='ct-topic-ten'
            label={t('edu.ct.topicName')}
            value={topicEdit.ten}
            required
            onChange={(ten) => setTopicEdit({ ...topicEdit, ten })}
          />
        </FormDialog>
      ) : null}
      {skillEdit ? (
        <SkillDialog
          edit={skillEdit}
          onChange={setSkillEdit}
          onClose={() => setSkillEdit(undefined)}
          onSaved={reload}
          nextOrder={nextOrder(skillsOf(skillEdit.chuDeId))}
        />
      ) : null}
    </PageContainer>
  );
}

function SkillDialog(props: {
  readonly edit: SkillEdit;
  readonly nextOrder: number;
  readonly onChange: (edit: SkillEdit) => void;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const books = useRows('sach');
  const bookRows = books.loaded.state === 'ready' ? books.loaded.rows : [];
  const { edit } = props;
  return (
    <FormDialog
      open
      title={edit.id ? t('edu.ct.editSkill') : t('edu.ct.addSkill')}
      onClose={props.onClose}
      onSubmit={async () => {
        await post(api, '/chuongTrinh/kyNang/luu', {
          ...(edit.id
            ? { id: edit.id }
            : {
                chuDeId: edit.chuDeId,
                ma: edit.ma.trim(),
                thuTu: props.nextOrder,
              }),
          ten: edit.ten.trim(),
          moTa: edit.moTa.trim() === '' ? null : edit.moTa.trim(),
          sachId: edit.sachId === '' ? null : Number(edit.sachId),
        });
        props.onSaved();
      }}
    >
      <TextField
        id='ct-skill-ma'
        label={t('edu.ct.code')}
        value={edit.ma}
        required
        hint={edit.id ? t('edu.ct.codeFixed') : t('edu.ct.codeHint')}
        onChange={(ma) =>
          edit.id ? undefined : props.onChange({ ...edit, ma })
        }
      />
      <TextField
        id='ct-skill-ten'
        label={t('edu.ct.skillName')}
        value={edit.ten}
        required
        onChange={(ten) => props.onChange({ ...edit, ten })}
      />
      <Field id='ct-skill-mo-ta' label={t('edu.ct.skillDescription')}>
        <Textarea
          id='ct-skill-mo-ta'
          rows={3}
          maxLength={1000}
          value={edit.moTa}
          onChange={(event) =>
            props.onChange({ ...edit, moTa: event.target.value })
          }
        />
      </Field>
      {bookRows.length > 0 ? (
        <SelectField
          id='ct-skill-sach'
          label={t('edu.ct.book')}
          value={edit.sachId}
          allowEmpty
          onChange={(sachId) => props.onChange({ ...edit, sachId })}
          options={bookRows.map((book) => ({
            value: String(book.id),
            label: `${text(book.kyHieu)} · ${text(book.ten)}`,
          }))}
        />
      ) : null}
    </FormDialog>
  );
}
