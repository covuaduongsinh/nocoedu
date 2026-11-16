import {
  ApiClientError,
  resolveAssetUrl,
  useApiClient,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Card, CardContent } from '#components/ui/card';

/**
 * `/ph#<token>`: the page a parent opens from the private link the club sent (stage 3, `server/routes/edu-cong-phu-huynh.ts`).
 *
 * The parent has no account, so the route is `auth: 'optional'` and `authz: 'skip'` and it renders outside the shell,
 * like `/device`. The token sits after the `#`, which the browser never sends to a server, so it never reaches an access
 * log; the page posts it in a body. A link that is unknown, expired or revoked is one and the same message. The page is
 * made for a phone: one column, large type, nothing to sign in to. What it shows is what the server returns: no date of
 * birth, phone number, money or private note ever arrives here.
 */
interface Session {
  readonly ngay: string;
  readonly trangThai: string;
  readonly daLamBtvn: boolean;
  readonly yThuc: number | null;
  readonly kienThucMoi: string;
  readonly giaoBtvn: string;
  readonly nhanXet: string;
}

interface Portal {
  readonly tenGoi: string;
  readonly capDo: string;
  readonly lop: string;
  readonly soBuoiConLai: number;
  readonly cacBuoi: readonly Session[];
  readonly nhanXetThang: {
    readonly thang: string;
    readonly noiDung: string;
  } | null;
  readonly hanLuc: string;
}

type State =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: Portal }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'noToken' }
  | { readonly kind: 'tooMany' }
  | { readonly kind: 'error' };

/** `2026-11-09` → `09/11/2026`. */
const dayLabel = (value: string): string => {
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const STATUS_TONE = {
  co_mat: 'success',
  hoc_bu: 'info',
  vang_co_phep: 'warning',
  vang_khong_phep: 'warning',
} as const;

const tokenFromAddress = (): string =>
  typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/u, '');

/** Keeps the link out of search engines and out of the `Referer` of anything the page opens. */
function useKeepPrivate(title: string): void {
  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    const referrer = document.createElement('meta');
    referrer.name = 'referrer';
    referrer.content = 'no-referrer';
    document.head.append(robots, referrer);
    const before = document.title;
    document.title = title;
    return () => {
      robots.remove();
      referrer.remove();
      document.title = before;
    };
  }, [title]);
}

export default function ParentPortalPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [state, setState] = useState<State>(() =>
    tokenFromAddress() ? { kind: 'loading' } : { kind: 'noToken' },
  );
  useKeepPrivate(t('edu.congPh.title'));

  useEffect(() => {
    const token = tokenFromAddress();
    if (!token) return undefined;
    let live = true;
    api
      .request<{ data: Portal }>({
        path: 'congPhuHuynh/xem',
        method: 'POST',
        json: { token },
      })
      .then((response) => {
        if (live) setState({ kind: 'ready', data: response.data });
      })
      .catch((error: unknown) => {
        if (!live) return;
        const status = error instanceof ApiClientError ? error.status : 0;
        setState({
          kind:
            status === 404 ? 'invalid' : status === 429 ? 'tooMany' : 'error',
        });
      });
    return () => {
      live = false;
    };
  }, [api]);

  return (
    <main className='mx-auto flex min-h-svh w-full max-w-xl flex-col gap-5 bg-background px-4 py-6 text-foreground'>
      <header className='flex flex-col gap-3'>
        <img
          src={resolveAssetUrl('/assets/logo.png')}
          alt={t('edu.congPh.club')}
          className='h-12 w-auto self-start'
        />
        <h1 className='text-2xl font-semibold leading-tight'>
          {t('edu.congPh.title')}
        </h1>
      </header>
      {state.kind === 'loading' ? (
        <p role='status' className='text-muted-foreground'>
          {t('edu.congPh.loading')}
        </p>
      ) : state.kind === 'ready' ? (
        <Portal data={state.data} />
      ) : (
        <p role='alert' className='rounded-lg border bg-card p-4 text-base'>
          {t(
            state.kind === 'invalid'
              ? 'edu.congPh.invalid'
              : state.kind === 'noToken'
                ? 'edu.congPh.noToken'
                : state.kind === 'tooMany'
                  ? 'edu.congPh.tooMany'
                  : 'edu.congPh.loadError',
          )}
        </p>
      )}
    </main>
  );
}

function Fact(props: {
  readonly label: string;
  readonly value: string;
}): ReactElement | null {
  return props.value ? (
    <div className='flex flex-col'>
      <dt className='text-xs text-muted-foreground'>{props.label}</dt>
      <dd className='text-base font-medium'>{props.value}</dd>
    </div>
  ) : null;
}

function Portal({ data }: { readonly data: Portal }): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <Card>
        <CardContent className='flex flex-col gap-4 pt-4'>
          <p className='text-xl font-semibold'>{data.tenGoi}</p>
          <dl className='grid grid-cols-2 gap-4'>
            <Fact label={t('edu.congPh.level')} value={data.capDo} />
            <Fact label={t('edu.congPh.class')} value={data.lop} />
            <Fact
              label={t('edu.congPh.left')}
              value={t('edu.congPh.leftValue', { count: data.soBuoiConLai })}
            />
          </dl>
        </CardContent>
      </Card>

      <section className='flex flex-col gap-3' aria-labelledby='ph-recent'>
        <h2 id='ph-recent' className='text-lg font-semibold'>
          {t('edu.congPh.recent')}
        </h2>
        {data.cacBuoi.length === 0 ? (
          <p className='text-muted-foreground'>{t('edu.congPh.noSessions')}</p>
        ) : (
          <ol className='flex flex-col gap-3'>
            {data.cacBuoi.map((item) => (
              <li key={item.ngay}>
                <Card>
                  <CardContent className='flex flex-col gap-3 pt-4'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='text-base font-semibold'>
                        {dayLabel(item.ngay)}
                      </span>
                      <StatusBadge
                        tone={
                          STATUS_TONE[
                            item.trangThai as keyof typeof STATUS_TONE
                          ] ?? 'neutral'
                        }
                      >
                        {t(`edu.congPh.status.${item.trangThai}`)}
                      </StatusBadge>
                    </div>
                    <p className='text-sm text-muted-foreground'>
                      {item.daLamBtvn
                        ? t('edu.congPh.homeworkDone')
                        : t('edu.congPh.homeworkNotDone')}
                      {item.yThuc === null
                        ? ''
                        : ` · ${t('edu.congPh.focus')}: ${t('edu.congPh.focusValue', { score: item.yThuc })}`}
                    </p>
                    <dl className='flex flex-col gap-2'>
                      <Fact
                        label={t('edu.congPh.newKnowledge')}
                        value={item.kienThucMoi}
                      />
                      <Fact
                        label={t('edu.congPh.homework')}
                        value={item.giaoBtvn}
                      />
                      <Fact
                        label={t('edu.congPh.comment')}
                        value={item.nhanXet}
                      />
                    </dl>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>

      {data.nhanXetThang ? (
        <section className='flex flex-col gap-2' aria-labelledby='ph-monthly'>
          <h2 id='ph-monthly' className='text-lg font-semibold'>
            {t('edu.congPh.monthly', { month: data.nhanXetThang.thang })}
          </h2>
          <Card>
            <CardContent className='pt-4'>
              <p className='whitespace-pre-line text-base'>
                {data.nhanXetThang.noiDung}
              </p>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <p className='text-xs text-muted-foreground'>
        {t('edu.congPh.expires', { date: dayLabel(data.hanLuc) })}
      </p>
    </>
  );
}
