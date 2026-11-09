import {
  defineAppConfig,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';

const i18n: AppConfigFactory<AppI18nConfig> = defineAppConfig({
  defaults: { defaultLocale: 'vi-VN' },
  env: {
    APP_DEFAULT_LOCALE: envString('defaultLocale', {
      description:
        'The language the application starts in, such as en-US. NocoEdu starts in Vietnamese.',
    }),
  },
});

export default i18n;
