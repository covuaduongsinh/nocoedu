import { useTranslation } from '@nocobase/i18n/client';

import { text } from '../kit.js';

/** "Th 2, 09/11" in the viewer's language; `ngay` is the club's calendar day, so no time zone moves it. */
export function useDayLabel(): (ngay: unknown) => string {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });
  return (ngay) => {
    const day = new Date(`${text(ngay)}T00:00:00Z`);
    return Number.isNaN(day.getTime()) ? text(ngay) : format.format(day);
  };
}
