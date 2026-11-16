import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import {
  describeNotificationTemplateChannel,
  notificationServiceToken,
  notificationTemplateRegistryToken,
  type NotificationConfigInput,
} from '@nocobase/app-plugin-notification/server';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  renderTuitionReminder,
  sendTuitionReminders,
  TUITION_REMINDER_ID,
} from '../edu/nhac-hoc-phi.js';
import { todayVn } from '../edu/so-du.js';

/** The name of the configured in-app channel; the template's `inbox` when none is configured. */
export function inAppChannel(config: NotificationConfigInput | undefined): {
  name: string;
  configured: boolean;
} {
  const channels = (
    config as
      | {
          channels?: Readonly<
            Record<string, { type?: string; provider?: string }>
          >;
        }
      | undefined
  )?.channels;
  const found = Object.entries(channels ?? {}).find(
    ([, channel]) => (channel.type ?? channel.provider) === 'in-app',
  );
  return found
    ? { name: found[0], configured: true }
    : { name: 'inbox', configured: false };
}

/**
 * The daily tuition reminder: every morning at 08:00 Vietnam time it tells the people who collect tuition which
 * students ran out of sessions, are about to, or still owe (`server/edu/nhac-hoc-phi.ts`). Nobody tracks its runs in
 * a screen, so it is a schedule of the application's own jobs service rather than a Scheduler definition; what it
 * sends is listed, with a synthetic preview, in System settings › Notification templates.
 */
export default class EduTuitionReminderProvider extends ServiceProvider<AppPluginApplication> {
  readonly name = 'app.edu-nhac-hoc-phi';
  private executor?: ScheduleExecutor;
  private releaseTemplate?: () => void;

  override boot(): Promise<void> {
    const config = this.app.config.get<NotificationConfigInput>('notification');
    // Only a derived boolean reaches the browser: with the reminder in use, System settings shows the directory of
    // notification templates (`client/routes.ts`).
    this.app.config.mergeDefaults({
      client: {
        notificationTemplates: {
          tuitionReminder: inAppChannel(config).configured,
        },
      },
    });
    if (!this.app.container.has(notificationTemplateRegistryToken))
      return Promise.resolve();
    this.releaseTemplate = this.app.container
      .resolve(notificationTemplateRegistryToken)
      .register({
        id: TUITION_REMINDER_ID,
        contributor: 'NocoEdu',
        category: 'Học phí',
        name: 'Nhắc thu học phí hằng ngày',
        trigger:
          'Mỗi ngày lúc 08:00 (giờ Việt Nam). Cùng một danh sách chỉ nhắc một lần mỗi tuần; danh sách thay đổi thì nhắc lại ngay sáng hôm sau.',
        recipients:
          'Người dùng đang hoạt động và được xem thanh toán (Kế toán, Quản lý cơ sở, Quản trị). Mỗi người chỉ được nhắc về học viên trong phạm vi mình được xem.',
        businessRule:
          'Học viên đang học có số buổi còn lại từ ngưỡng nhắc của cơ sở trở xuống (đặt ở trang Cơ sở, mặc định 2 buổi), và học viên có gói buổi chưa thu đủ tiền. Không có ai thì không gửi.',
        locales: ['vi-VN'],
        languagePolicy:
          'Chỉ tiếng Việt, không theo ngôn ngữ giao diện của người nhận.',
        variables: [
          {
            name: 'hetBuoi',
            description: 'Mã các học viên hết buổi hoặc âm buổi.',
          },
          {
            name: 'sapHet',
            description:
              'Mã các học viên còn ít buổi (từ ngưỡng nhắc của cơ sở trở xuống).',
          },
          {
            name: 'conNo',
            description: 'Số học viên có gói buổi chưa thu đủ tiền.',
          },
        ],
        channels: () => [
          describeNotificationTemplateChannel(
            config,
            inAppChannel(config).name,
          ),
        ],
        // The same builder the job sends with. Codes below are made up; no student is read here.
        render: (_locale, example) =>
          renderTuitionReminder(
            example === 'definition'
              ? {
                  hetBuoi: ['{mã học viên hết buổi}'],
                  sapHet: ['{mã học viên sắp hết buổi}'],
                  conNo: 1,
                }
              : {
                  hetBuoi: ['HS-MAU-01', 'HS-MAU-04'],
                  sapHet: ['HS-MAU-02', 'HS-MAU-03', 'HS-MAU-07'],
                  conNo: 2,
                },
          ),
      });
    return Promise.resolve();
  }

  override async start(): Promise<void> {
    const { container } = this.app;
    if (
      !container.has(jobExecutorServiceToken) ||
      !container.has(notificationServiceToken) ||
      !container.has(authorizationToken) ||
      !container.has(databaseManagerToken)
    )
      return;
    const channel = inAppChannel(
      this.app.config.get<NotificationConfigInput>('notification'),
    );
    // Without an in-app channel there is nowhere to send to; the template directory shows it as not configured.
    if (!channel.configured) return;
    const authz: AppAuthorization = container.resolve(authorizationToken);
    const database = container.resolve(databaseManagerToken);
    const notification = container.resolve(notificationServiceToken);
    this.executor = container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor('nocoedu');
    await this.executor.addJob({
      name: 'nhac-hoc-phi',
      options: { cron: '0 8 * * *', tz: 'Asia/Ho_Chi_Minh' },
      payload: {},
      execute: async () => {
        await sendTuitionReminders(
          { database, authz, notification, channel: channel.name },
          todayVn(),
        );
      },
    });
    await this.executor.setup();
  }

  override async shutdown(): Promise<void> {
    this.releaseTemplate?.();
    await this.executor?.shutdown();
  }
}
