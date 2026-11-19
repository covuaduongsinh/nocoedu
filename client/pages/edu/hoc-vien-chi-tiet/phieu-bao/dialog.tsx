import { copyText, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Check, Copy, Download, Share2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';

import { saveBlob } from '../../download.js';
import { Field, SelectField } from '../../form-parts.js';
import { formatDayVn } from '../../format.js';
import { post, todayVn, useErrorMessage, useRequest } from '../../kit.js';
import { termLabel } from '../terms.js';
import type { NoticeMark, Profile } from '../types.js';
import {
  canCopyImage,
  canShareImage,
  copyImage,
  loadQrImage,
  renderPng,
  shareImage,
  svgDataUrl,
} from './image.js';
import { noticeLabels, noticeMessage } from './labels.js';
import { buildNotice, noticeTerms, type Notice } from './model.js';
import { noticeSvg, type NoticeQr } from './svg.js';

type Png =
  | { readonly state: 'pending' }
  | { readonly state: 'ready'; readonly blob: Blob }
  | { readonly state: 'error' };

/** The answer of `POST /phieuBao/vietQr`: the transfer code of the next term, when a bank account is configured. */
interface QrAnswer {
  readonly cauHinh: boolean;
  readonly soTienGoiY: number | null;
  readonly soTien: number | null;
  readonly noiDungCk: string;
  readonly url: string | null;
}

/** The code that is drawn for one amount, or the fact that it could not be fetched. */
type Code =
  | {
      readonly amount: number;
      readonly state: 'ready';
      readonly image: NoticeQr;
      readonly noiDungCk: string;
    }
  | { readonly amount: number; readonly state: 'error' };

const MAX_AMOUNT = 1_000_000_000;
/** The statuses in which the parent is asked to pay: the transfer code is drawn unless the person turns it off. */
const ASKS_TO_PAY: readonly Notice['status'][] = ['het', 'vuot', 'sap_het'];

/**
 * The notice of one tuition term for a parent ("Phiếu báo kỳ học phí"): the picture that replaces the screenshot of
 * Lark's term row, and the message that goes with it. The person picks the term, then copies the picture (or downloads
 * or shares it) and the message into the chat with the parent, and marks that the parent was told.
 *
 * The picture is built from the answer of the student file the page already holds, so it shows exactly what the tabs
 * show. The server adds two things: the VietQR code of the next term (`/phieuBao/vietQr`) and the "told" marks
 * (`/phieuBao/ghi`, `/phieuBao/xoa`). A mark made here shows at once and the student file is read again only when the
 * dialog closes: reading it while the dialog is open would close it and lose an edited message.
 */
export function NoticeDialog(props: {
  readonly profile: Profile;
  readonly kySo: number;
  readonly onTerm: (kySo: number) => void;
  readonly onClose: () => void;
  /** Called on closing when a mark was made or taken back, so the page reads the student file again. */
  readonly onChanged: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const { profile } = props;
  const notice = useMemo(
    () => buildNotice(profile, props.kySo, todayVn()),
    [profile, props.kySo],
  );
  const qr = useRequest<QrAnswer>('/phieuBao/vietQr', {
    hocVienId: profile.hocVien.id,
  });
  const [marks, setMarks] = useState<readonly NoticeMark[]>(
    () => profile.hocPhi?.cacLanBao ?? [],
  );
  const changedRef = useRef(false);
  if (!notice) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return;
        if (changedRef.current) props.onChanged();
        props.onClose();
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
          options={noticeTerms(profile).map((term) => ({
            value: String(term.kySo),
            label: termLabel(t, term),
          }))}
        />
        {/* A term has its own picture, message and file: start them again when the term changes. */}
        <NoticeBody
          key={props.kySo}
          notice={notice}
          studentId={profile.hocVien.id}
          balance={profile.tongHop.soBuoiConLai}
          qr={qr.result.state === 'ready' ? qr.result.data : null}
          marks={marks.filter((mark) => mark.goiHocId === notice.term.goiHocId)}
          onMarks={(update) => {
            changedRef.current = true;
            setMarks(update);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function NoticeBody(props: {
  readonly notice: Notice;
  readonly studentId: number;
  readonly balance: number;
  readonly qr: QrAnswer | null;
  /** The marks of this term, newest first. */
  readonly marks: readonly NoticeMark[];
  readonly onMarks: (
    update: (marks: readonly NoticeMark[]) => readonly NoticeMark[],
  ) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const errorMessage = useErrorMessage();
  const { notice, qr, studentId } = props;
  const [note, setNote] = useState<{
    readonly tone: 'success' | 'error';
    readonly text: string;
  } | null>(null);
  const say = (tone: 'success' | 'error', key: string): void =>
    setNote({ tone, text: t(key) });

  // --- The transfer code of the next term ---------------------------------------------------------------------
  const [withQr, setWithQr] = useState<boolean | null>(null);
  const [typedAmount, setTypedAmount] = useState<string | null>(null);
  const [code, setCode] = useState<Code | null>(null);
  const configured = qr?.cauHinh === true;
  const wantsQr = configured && (withQr ?? ASKS_TO_PAY.includes(notice.status));
  const amountText =
    typedAmount ?? (qr?.soTienGoiY ? String(qr.soTienGoiY) : '');
  const amount = /^\d{1,10}$/u.test(amountText.trim())
    ? Number(amountText.trim())
    : 0;
  const validAmount = amount >= 1 && amount <= MAX_AMOUNT;
  const suggestedUrl = qr && amount === qr.soTien ? qr.url : null;
  const transferNote = qr?.noiDungCk ?? '';
  useEffect(() => {
    if (!wantsQr || !validAmount) return;
    let stale = false;
    // A short pause, so a code is not fetched for every digit typed.
    const timer = setTimeout(() => {
      const address = suggestedUrl
        ? Promise.resolve({ url: suggestedUrl, noiDungCk: transferNote })
        : api
            .request<{ data: QrAnswer }>({
              path: '/phieuBao/vietQr',
              method: 'POST',
              json: { hocVienId: studentId, soTien: amount },
            })
            .then((response) => response.data);
      address
        .then(async (answer) => {
          if (!answer.url) throw new Error('No QR address.');
          const image = await loadQrImage(answer.url);
          if (!stale)
            setCode({
              amount,
              state: 'ready',
              image,
              noiDungCk: answer.noiDungCk,
            });
        })
        .catch(() => {
          if (!stale) setCode({ amount, state: 'error' });
        });
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [
    api,
    wantsQr,
    validAmount,
    amount,
    suggestedUrl,
    transferNote,
    studentId,
  ]);
  const drawn =
    wantsQr && validAmount && code?.amount === amount && code.state === 'ready'
      ? code
      : null;
  const qrFailed =
    wantsQr && validAmount && code?.amount === amount && code.state === 'error';
  const qrLoading = wantsQr && validAmount && code?.amount !== amount;

  // --- The picture and the message ----------------------------------------------------------------------------
  const picture = useMemo(() => {
    const transfer = drawn
      ? { soTien: drawn.amount, noiDungCk: drawn.noiDungCk }
      : undefined;
    return noticeSvg(notice, noticeLabels(t, notice, transfer), drawn?.image);
  }, [notice, t, drawn]);
  // The message follows the picture (with or without the transfer line) until the person edits it.
  const [draft, setDraft] = useState<string | null>(null);
  const message =
    draft ??
    noticeMessage(
      t,
      notice,
      drawn ? { soTien: drawn.amount, noiDungCk: drawn.noiDungCk } : undefined,
    );

  // The PNG is made as soon as the picture changes, so a click copies a file that already exists (a browser lets a
  // page write to the clipboard only right after the click).
  const [png, setPng] = useState<{
    readonly svg: string;
    readonly value: Png;
  } | null>(null);
  useEffect(() => {
    let stale = false;
    renderPng(picture.svg, picture.width, picture.height).then(
      (blob) => {
        if (!stale)
          setPng({ svg: picture.svg, value: { state: 'ready', blob } });
      },
      () => {
        if (!stale) setPng({ svg: picture.svg, value: { state: 'error' } });
      },
    );
    return () => {
      stale = true;
    };
  }, [picture]);
  const file: Png = png?.svg === picture.svg ? png.value : { state: 'pending' };
  const blob = file.state === 'ready' ? file.blob : null;
  const filename = `phieu-bao-${notice.hocVien.ma}-ky-${notice.term.kySo}.png`;
  const shared = useMemo(
    () => (blob ? new File([blob], filename, { type: 'image/png' }) : null),
    [blob, filename],
  );
  const copyable = canCopyImage();
  const shareable = shared !== null && canShareImage(shared);

  // --- "The parent was told" ----------------------------------------------------------------------------------
  const { can: canMark } = useCan({
    resource: { type: 'composite', id: 'edu.thanhToan' },
    action: 'manage',
  });
  const [marking, setMarking] = useState(false);
  const latest = props.marks[0] ?? null;
  const markedToday = latest?.ngay === todayVn();
  const change = async (work: () => Promise<void>): Promise<void> => {
    if (marking) return;
    setMarking(true);
    setNote(null);
    try {
      await work();
    } catch (cause) {
      setNote({ tone: 'error', text: errorMessage(cause) });
    } finally {
      setMarking(false);
    }
  };
  const mark = (): Promise<void> =>
    change(async () => {
      const answer = (await post(api, '/phieuBao/ghi', {
        hocVienId: studentId,
        goiHocId: notice.term.goiHocId,
      })) as { data: { id: number; ngay: string } };
      const made: NoticeMark = {
        id: answer.data.id,
        goiHocId: notice.term.goiHocId,
        ngay: answer.data.ngay,
        soBuoiConLai: props.balance,
        nguoiBao: '',
      };
      props.onMarks((marks) => [
        made,
        ...marks.filter((old) => old.id !== made.id),
      ]);
    });
  const unmark = (id: number): Promise<void> =>
    change(async () => {
      await post(api, '/phieuBao/xoa', { id });
      props.onMarks((marks) => marks.filter((old) => old.id !== id));
    });

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
              onChange={(event) => setDraft(event.target.value)}
              className='max-h-56'
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

          {configured ? (
            <div className='flex flex-col gap-2 border-t pt-3'>
              <label className='flex items-center gap-2 text-sm'>
                <Checkbox
                  checked={wantsQr}
                  onCheckedChange={(checked) => setWithQr(checked === true)}
                />
                {t('edu.phieuBao.qr.toggle')}
              </label>
              {wantsQr ? (
                <Field
                  id='phieu-bao-so-tien'
                  label={t('edu.phieuBao.qr.amount')}
                  {...(validAmount
                    ? {}
                    : { hint: t('edu.phieuBao.qr.invalid') })}
                >
                  <Input
                    id='phieu-bao-so-tien'
                    inputMode='numeric'
                    value={amountText}
                    onChange={(event) => setTypedAmount(event.target.value)}
                  />
                </Field>
              ) : null}
              {qrLoading ? (
                <p role='status' className='text-xs text-muted-foreground'>
                  {t('edu.phieuBao.qr.loading')}
                </p>
              ) : null}
              {qrFailed ? (
                <p role='alert' className='text-sm text-destructive'>
                  {t('edu.phieuBao.qr.error')}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className='flex flex-col gap-2 border-t pt-3'>
            <p className='text-sm font-medium'>
              {t('edu.phieuBao.mark.title')}
            </p>
            <p className='text-sm text-muted-foreground'>
              {latest
                ? latest.nguoiBao
                  ? t('edu.phieuBao.mark.doneBy', {
                      date: formatDayVn(latest.ngay),
                      name: latest.nguoiBao,
                    })
                  : t('edu.phieuBao.mark.done', {
                      date: formatDayVn(latest.ngay),
                    })
                : t('edu.phieuBao.mark.none')}
            </p>
            {canMark ? (
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={marking || markedToday}
                  onClick={() => void mark()}
                >
                  <Check className='size-3.5' />
                  {markedToday
                    ? t('edu.phieuBao.mark.today')
                    : t('edu.phieuBao.mark.button')}
                </Button>
                {latest ? (
                  <Button
                    variant='ghost'
                    size='sm'
                    disabled={marking}
                    onClick={() => void unmark(latest.id)}
                  >
                    <Undo2 className='size-3.5' />
                    {t('edu.phieuBao.mark.undo')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          {file.state === 'pending' ? (
            <p role='status' className='text-xs text-muted-foreground'>
              {t('edu.phieuBao.rendering')}
            </p>
          ) : null}
          {file.state === 'error' ? (
            <p role='alert' className='text-sm text-destructive'>
              {t('edu.phieuBao.renderError')}
            </p>
          ) : null}
          {file.state === 'ready' && !copyable ? (
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
        {shareable && shared ? (
          <Button
            variant='outline'
            onClick={() =>
              void shareImage(shared, message).then((outcome) => {
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
