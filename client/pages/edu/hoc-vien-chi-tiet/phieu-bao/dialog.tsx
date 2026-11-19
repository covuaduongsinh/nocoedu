import { copyText } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Copy, Download, Share2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Textarea } from '#components/ui/textarea';

import { saveBlob } from '../../download.js';
import { Field, SelectField } from '../../form-parts.js';
import { todayVn } from '../../kit.js';
import { termLabel } from '../terms.js';
import type { Profile } from '../types.js';
import {
  canCopyImage,
  canShareImage,
  copyImage,
  renderPng,
  shareImage,
  svgDataUrl,
} from './image.js';
import { noticeLabels, noticeMessage } from './labels.js';
import { buildNotice, noticeTerms, type Notice } from './model.js';
import { noticeSvg } from './svg.js';

type Png =
  | { readonly state: 'pending' }
  | { readonly state: 'ready'; readonly blob: Blob }
  | { readonly state: 'error' };

/**
 * The notice of one tuition term for a parent ("Phiếu báo kỳ học phí"): the picture that replaces the screenshot of
 * Lark's term row, and the message that goes with it. The person picks the term, then copies the picture (or downloads
 * or shares it) and the message into the chat with the parent. Nothing is asked of the server: the notice is built from
 * the answer of the student file the page already holds, so it shows exactly what the tabs show.
 */
export function NoticeDialog(props: {
  readonly profile: Profile;
  readonly kySo: number;
  readonly onTerm: (kySo: number) => void;
  readonly onClose: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const notice = useMemo(
    () => buildNotice(props.profile, props.kySo, todayVn()),
    [props.profile, props.kySo],
  );
  if (!notice) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent className='sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>{t('edu.phieuBao.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('edu.phieuBao.dialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <SelectField
          id='phieu-bao-ky'
          label={t('edu.phieuBao.term')}
          value={String(props.kySo)}
          onChange={(value) => props.onTerm(Number(value))}
          options={noticeTerms(props.profile).map((term) => ({
            value: String(term.kySo),
            label: termLabel(t, term),
          }))}
        />
        {/* A term has its own picture, message and file: start them again when the term changes. */}
        <NoticeBody key={props.kySo} notice={notice} />
      </DialogContent>
    </Dialog>
  );
}

function NoticeBody({ notice }: { readonly notice: Notice }): ReactElement {
  const { t } = useTranslation();
  const picture = useMemo(
    () => noticeSvg(notice, noticeLabels(t, notice)),
    [notice, t],
  );
  const [message, setMessage] = useState(() => noticeMessage(t, notice));
  const [png, setPng] = useState<Png>({ state: 'pending' });
  const [note, setNote] = useState<{
    readonly tone: 'success' | 'error';
    readonly text: string;
  } | null>(null);

  // The PNG is made as soon as the dialog opens, so a click copies a picture that already exists (a browser lets a
  // page write to the clipboard only right after the click).
  useEffect(() => {
    let stale = false;
    renderPng(picture.svg, picture.width, picture.height).then(
      (blob) => {
        if (!stale) setPng({ state: 'ready', blob });
      },
      () => {
        if (!stale) setPng({ state: 'error' });
      },
    );
    return () => {
      stale = true;
    };
  }, [picture]);

  const filename = `phieu-bao-${notice.hocVien.ma}-ky-${notice.term.kySo}.png`;
  const file = useMemo(
    () =>
      png.state === 'ready'
        ? new File([png.blob], filename, { type: 'image/png' })
        : null,
    [png, filename],
  );
  const copyable = canCopyImage();
  const shareable = file !== null && canShareImage(file);
  const blob = png.state === 'ready' ? png.blob : null;

  const say = (tone: 'success' | 'error', key: string): void =>
    setNote({ tone, text: t(key) });

  return (
    <>
      <div className='grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem]'>
        <div className='max-h-[55dvh] overflow-y-auto rounded-lg border md:max-h-[60dvh]'>
          <img
            src={svgDataUrl(picture.svg)}
            width={picture.width}
            height={picture.height}
            alt={t('edu.phieuBao.previewAlt', {
              term: termLabel(t, notice.term),
              name: notice.hocVien.hoTen,
            })}
            className='h-auto w-full'
          />
        </div>
        <div className='flex flex-col gap-3'>
          <Field
            id='phieu-bao-loi-nhan'
            label={t('edu.phieuBao.message')}
            hint={t('edu.phieuBao.messageHint')}
          >
            <Textarea
              id='phieu-bao-loi-nhan'
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className='max-h-72'
            />
          </Field>
          <Button
            variant='outline'
            size='sm'
            className='self-start'
            onClick={() =>
              void copyText(message).then(
                (copied) =>
                  copied
                    ? say('success', 'edu.phieuBao.copiedMessage')
                    : say('error', 'edu.phieuBao.copyMessageFailed'),
                () => say('error', 'edu.phieuBao.copyMessageFailed'),
              )
            }
          >
            <Copy className='size-3.5' />
            {t('edu.phieuBao.copyMessage')}
          </Button>
          {png.state === 'pending' ? (
            <p role='status' className='text-xs text-muted-foreground'>
              {t('edu.phieuBao.rendering')}
            </p>
          ) : null}
          {png.state === 'error' ? (
            <p role='alert' className='text-sm text-destructive'>
              {t('edu.phieuBao.renderError')}
            </p>
          ) : null}
          {png.state === 'ready' && !copyable ? (
            <p className='text-xs text-muted-foreground'>
              {t('edu.phieuBao.copyImageUnavailable')}
            </p>
          ) : null}
          {note ? (
            <p
              role={note.tone === 'error' ? 'alert' : 'status'}
              className={
                note.tone === 'error'
                  ? 'text-sm text-destructive'
                  : 'text-sm text-muted-foreground'
              }
            >
              {note.text}
            </p>
          ) : null}
        </div>
      </div>
      <DialogFooter>
        {shareable && file ? (
          <Button
            variant='outline'
            onClick={() =>
              void shareImage(file, message).then((outcome) => {
                if (outcome === 'failed')
                  say('error', 'edu.phieuBao.shareFailed');
              })
            }
          >
            <Share2 className='size-3.5' />
            {t('edu.phieuBao.share')}
          </Button>
        ) : null}
        <Button
          variant={copyable ? 'outline' : 'default'}
          disabled={!blob}
          onClick={() => {
            if (blob) saveBlob(blob, filename);
          }}
        >
          <Download className='size-3.5' />
          {t('edu.phieuBao.download')}
        </Button>
        {copyable ? (
          <Button
            disabled={!blob}
            onClick={() => {
              if (!blob) return;
              void copyImage(blob).then((copied) =>
                copied
                  ? say('success', 'edu.phieuBao.copiedImage')
                  : say('error', 'edu.phieuBao.copyImageFailed'),
              );
            }}
          >
            <Copy className='size-3.5' />
            {t('edu.phieuBao.copyImage')}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}
