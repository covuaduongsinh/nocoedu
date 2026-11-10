import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement, type ReactNode } from 'react';

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

import { useErrorMessage } from './kit.js';

export function Field({
  id,
  label,
  hint,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
    </div>
  );
}

export function TextField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: string;
  readonly required?: boolean;
  readonly hint?: string;
}): ReactElement {
  return (
    <Field
      id={props.id}
      label={props.label}
      {...(props.hint ? { hint: props.hint } : {})}
    >
      <Input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        required={props.required ?? false}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </Field>
  );
}

export function SelectField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly { value: string; label: string }[];
  readonly allowEmpty?: boolean;
  readonly required?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Field id={props.id} label={props.label}>
      <select
        id={props.id}
        value={props.value}
        required={props.required ?? false}
        onChange={(event) => props.onChange(event.target.value)}
        className='h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm'
      >
        {props.allowEmpty || props.value === '' ? (
          <option value=''>{t('edu.common.choose')}</option>
        ) : null}
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** A dialog around a form: Enter or the save button submits once; the error is shown inside the dialog. */
export function FormDialog(props: {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly onClose: () => void;
  readonly onSubmit: () => Promise<void>;
  /** The text of the submit button; "Save" by default. */
  readonly submitLabel?: string;
  readonly children?: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await props.onSubmit();
      props.onClose();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => (open ? undefined : props.onClose())}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          {props.description ? (
            <DialogDescription>{props.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <form
          className='flex flex-col gap-4'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {props.children}
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={props.onClose}>
              {t('edu.common.cancel')}
            </Button>
            <Button type='submit' disabled={busy}>
              {busy
                ? t('edu.common.saving')
                : (props.submitLabel ?? t('edu.common.save'))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
