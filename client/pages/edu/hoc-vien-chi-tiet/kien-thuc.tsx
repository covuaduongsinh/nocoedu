import { useTranslation } from '@nocobase/i18n/client';
import { Network } from 'lucide-react';
import type { ReactElement } from 'react';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';

/**
 * The knowledge tree of the student (level → topic → skill, with what still needs making up). The knowledge system is
 * built in phase 4 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`; the tab is here already so the file keeps its
 * seven tabs and the address `?tab=kien-thuc` does not move later.
 */
export function Knowledge(): ReactElement {
  const { t } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Network />
        </EmptyMedia>
        <EmptyTitle>{t('edu.hoSo.knowledge.title')}</EmptyTitle>
        <EmptyDescription>{t('edu.hoSo.knowledge.soon')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
