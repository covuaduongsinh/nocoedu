import { defineAppConfig, type AppConfigFactory } from '@nocobase/app-client';

const app: AppConfigFactory<{ title: string }> = defineAppConfig(
  (_runtime) => ({
    title: 'NocoEdu - Cờ vua Dương Sinh',
  }),
);
export default app;
