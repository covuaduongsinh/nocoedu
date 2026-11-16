import { copyText, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { useHref } from 'react-router';

import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';

import { FormDialog } from './form-parts.js';
import { post, text, useErrorMessage } from './kit.js';
import type { ParentLink, useParentLinks } from './parent-links-model.js';

/**
 * The private links of a student's parents (stage 3), on the Parents tab of the student's file. The server keeps only a
 * hash of a token, so a link can be copied just once, in the window that opens when it is made; making a new link
 * replaces the old one of that parent.
 */
const dayOf = (value: unknown): string => {
  const [year, month, day] = text(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
};

/** What the newest link of a parent is: valid until, expired, revoked, and how often it was opened. */
export function LinkStatus(props: {
  readonly link: ParentLink | undefined;
  /** The moment the page was read, to tell an expired link from a valid one. */
  readonly now: number;
}): ReactElement {
  const { t } = useTranslation();
  const { link } = props;
  if (!link) return <span>{t('edu.congPh.admin.none')}</span>;
  if (link.thuHoiLuc) return <span>{t('edu.congPh.admin.revoked')}</span>;
  const expired = new Date(link.hanLuc).getTime() <= props.now;
  return (
    <span className='flex flex-col'>
      <span>
        {expired
          ? t('edu.congPh.admin.expired', { date: dayOf(link.hanLuc) })
          : t('edu.congPh.admin.active', { date: dayOf(link.hanLuc) })}
      </span>
      <span className='text-xs text-muted-foreground'>
        {link.soLanXem > 0
          ? t('edu.congPh.admin.views', {
              count: link.soLanXem,
              date: dayOf(link.xemCuoiLuc),
            })
          : t('edu.congPh.admin.neverOpened')}
      </span>
    </span>
  );
}

/** Make, copy (once) and revoke the link of one parent. */
export function LinkActions(props: {
  readonly studentId: number;
  readonly parentId: number;
  readonly link: ParentLink | undefined;
  readonly now: number;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const message = useErrorMessage();
  const portal = useHref('/ph');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [made, setMade] = useState<string>();
  const [revoking, setRevoking] = useState(false);
  const live =
    props.link !== undefined &&
    props.link.thuHoiLuc === null &&
    new Date(props.link.hanLuc).getTime() > props.now;

  const make = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const response = (await post(api, 'congPhuHuynh/taoLink', {
        hocVienId: props.studentId,
        phuHuynhId: props.parentId,
      })) as { data: { token: string } };
      // The token goes after the `#`: a browser never sends it to a server.
      setMade(`${window.location.origin}${portal}#${response.data.token}`);
      props.onChanged();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  };
  const copy = async (): Promise<void> => {
    // False when the browser refuses: the link stays selectable in the field for a manual copy.
    const copied = await copyText(made ?? '');
    toaster.show(
      copied
        ? { type: 'success', title: t('edu.congPh.admin.copied') }
        : { type: 'error', title: t('edu.congPh.admin.copyFailed') },
    );
  };

  return (
    <>
      <Button
        size='sm'
        variant='outline'
        disabled={busy}
        onClick={() => void make()}
      >
        {live ? t('edu.congPh.admin.remake') : t('edu.congPh.admin.make')}
      </Button>
      {live ? (
        <Button size='sm' variant='outline' onClick={() => setRevoking(true)}>
          {t('edu.congPh.admin.revoke')}
        </Button>
      ) : null}
      {error ? (
        <span role='alert' className='text-xs text-destructive'>
          {error}
        </span>
      ) : null}
      {revoking && props.link ? (
        <FormDialog
          open
          title={t('edu.congPh.admin.revoke')}
          description={t('edu.congPh.admin.revokeHint')}
          submitLabel={t('edu.congPh.admin.revoke')}
          onClose={() => setRevoking(false)}
          onSubmit={async () => {
            await post(api, 'congPhuHuynh/thuHoi', { id: props.link?.id });
            props.onChanged();
          }}
        />
      ) : null}
      <Dialog
        open={made !== undefined}
        onOpenChange={(open) => {
          if (!open) setMade(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('edu.congPh.admin.created')}</DialogTitle>
            <DialogDescription>
              {t('edu.congPh.admin.createdHint')}
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='parent-link-url'>
              {t('edu.congPh.admin.linkLabel')}
            </Label>
            <Input
              id='parent-link-url'
              readOnly
              value={made ?? ''}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setMade(undefined)}>
              {t('edu.congPh.admin.close')}
            </Button>
            <Button onClick={() => void copy()}>
              {t('edu.congPh.admin.copy')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The block under the parents table: one card per parent with the state of their link and, for who may manage them,
 * the buttons. Cards rather than table columns, so it works on a phone too.
 */
export function ParentLinks(props: {
  readonly studentId: number;
  readonly parents: readonly { readonly id: number; readonly name: string }[];
  readonly portal: ReturnType<typeof useParentLinks>;
}): ReactElement {
  const { t } = useTranslation();
  const { portal } = props;
  return (
    <section className='flex flex-col gap-3' aria-labelledby='parent-links'>
      <h3 id='parent-links' className='text-base font-semibold'>
        {t('edu.congPh.admin.title')}
      </h3>
      <ul className='flex flex-col gap-3'>
        {props.parents.map((parent) => (
          <li
            key={parent.id}
            className='flex flex-col gap-3 rounded-lg border bg-card p-3 text-sm sm:flex-row sm:items-center sm:justify-between'
          >
            <div className='flex min-w-0 flex-col gap-1'>
              <span className='font-medium'>{parent.name}</span>
              <LinkStatus
                link={portal.byParent.get(parent.id)}
                now={portal.now}
              />
            </div>
            {portal.canManage ? (
              <div className='flex flex-wrap items-center gap-2'>
                <LinkActions
                  studentId={props.studentId}
                  parentId={parent.id}
                  link={portal.byParent.get(parent.id)}
                  now={portal.now}
                  onChanged={portal.reload}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
