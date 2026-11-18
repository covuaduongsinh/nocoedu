import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { MucDo } from './types.js';

const TONE: Record<MucDo, 'info' | 'warning' | 'success'> = {
  da_hoc: 'info',
  chua_vung: 'warning',
  dat: 'success',
  vung: 'success',
};

/** The state of a student on a skill; a missing state is "not learned yet". */
export function MucDoBadge({
  mucDo,
  size,
}: {
  readonly mucDo: MucDo | null;
  readonly size?: 'sm';
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge
      tone={mucDo === null ? 'neutral' : TONE[mucDo]}
      {...(size ? { size } : {})}
    >
      {t(`edu.kt.state.${mucDo ?? 'chua_hoc'}`)}
    </StatusBadge>
  );
}
