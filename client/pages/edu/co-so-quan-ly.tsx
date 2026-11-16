import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';

import { SelectField } from './form-parts.js';
import {
  createOne,
  deleteOne,
  text,
  useErrorMessage,
  usePagedRows,
  useRequest,
  type Row,
} from './kit.js';

/**
 * Who manages a branch. A branch manager's whole data scope comes from these rows (`eduCoSoQuanLy`, read by
 * `server/edu/record-access.ts`), so an account holding the branch manager permission set sees nothing until it is named
 * here. Only the administrator holds `edu.coSoQuanLy` `manage`; the accounts offered are those that hold the set.
 */
export function BranchManagersButton(props: {
  readonly branch: Row;
}): ReactElement | null {
  const { t } = useTranslation();
  const { can } = useCan({
    resource: { type: 'composite', id: 'edu.coSoQuanLy' },
    action: 'manage',
  });
  const [open, setOpen] = useState(false);
  if (!can) return null;
  return (
    <>
      <Button size='sm' variant='outline' onClick={() => setOpen(true)}>
        {t('edu.coSo.managers')}
      </Button>
      {open ? (
        <ManagersDialog branch={props.branch} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function ManagersDialog(props: {
  readonly branch: Row;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const message = useErrorMessage();
  const links = usePagedRows('coSoQuanLy', {
    page: 1,
    where: { coSoId: props.branch.id },
  });
  const accounts = useRequest<{ id: string; name: string }[]>(
    '/quanLy/danhSach',
    {},
  ).result;
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const named = links.loaded.state === 'ready' ? links.loaded.rows : [];
  const all = accounts.state === 'ready' ? accounts.data : [];
  const nameOf = (userId: unknown): string =>
    all.find((account) => account.id === text(userId))?.name || text(userId);
  const free = all.filter(
    (account) => !named.some((row) => text(row.userId) === account.id),
  );

  const run = async (work: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      links.reload();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('edu.coSo.managersTitle', { name: text(props.branch.ten) })}
          </DialogTitle>
          <DialogDescription>{t('edu.coSo.managersHint')}</DialogDescription>
        </DialogHeader>
        {links.loaded.state === 'loading' ? (
          <p role='status' className='text-sm text-muted-foreground'>
            {t('edu.common.loading')}
          </p>
        ) : named.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('edu.coSo.noManagers')}
          </p>
        ) : (
          <ul className='flex flex-col gap-2'>
            {named.map((row) => (
              <li
                key={row.id}
                className='flex items-center justify-between gap-2 rounded-lg border p-2 text-sm'
              >
                <span>{nameOf(row.userId)}</span>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={busy}
                  onClick={() =>
                    void run(() => deleteOne(api, 'coSoQuanLy', row.id))
                  }
                >
                  {t('edu.coSo.removeManager')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {accounts.state === 'ready' && free.length === 0 ? (
          <p className='text-xs text-muted-foreground'>
            {all.length === 0
              ? t('edu.coSo.noAccounts')
              : t('edu.coSo.allNamed')}
          </p>
        ) : (
          <div className='flex items-end gap-2'>
            <div className='flex-1'>
              <SelectField
                id='co-so-quan-ly-chon'
                label={t('edu.coSo.addManager')}
                value={picked}
                allowEmpty
                onChange={setPicked}
                options={free.map((account) => ({
                  value: account.id,
                  label: account.name,
                }))}
              />
            </div>
            <Button
              disabled={busy || picked === ''}
              onClick={() =>
                void run(async () => {
                  await createOne(api, 'coSoQuanLy', {
                    coSoId: props.branch.id,
                    userId: picked,
                  });
                  setPicked('');
                })
              }
            >
              {t('edu.coSo.addManagerButton')}
            </Button>
          </div>
        )}
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
