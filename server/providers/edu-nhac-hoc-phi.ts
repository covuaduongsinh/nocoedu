import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import {
  notificationServiceToken,
  notificationTemplateRegistryToken,
  describeNotificationTemplateChannel,
  type NotificationConfigInput,
} from '@nocobase/app-plugin-notification/server';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  MAX_CODES,
  REMINDER_ROUTE,
  partOf,
  renderTuitionReminder,
  sendTuitionReminders,
} from '../edu/nhac-hoc-phi.js';

/** The id of the scenario in the notification template directory. */
export const TUITION_REMINDER_TEMPLATE = 'edu.nhac-hoc-phi';

/** The scheduled job: 08:00 every day, Vietnam time. */
export const TUITION_REMINDER_JOB = 'nhac-hoc-phi';
export const TUITION_REMINDER_CRON = '0 8 * * *';
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * The first enabled in-app channel of the notification configuration, if any. The reminder goes to the inbox; without
 * such a channel the job is not scheduled (see `docs/edu-giai-doan-1.md`).
 */
export function inAppChannelOf(
  config: NotificationConfigInput | undefined,
): string | undefined {
  for (const [name, channel] of Object.entries(config?.channels ?? {})) {
    const type = 'type' in channel ? channel.type : channel.provider;
    if (type === 'in-app' && channel.enabled !== false) return name;
  }
  return undefined;
}

/**
 * Sends the daily tuition reminder to the inbox of the people who collect tuition, and lists the scenario in System
 * settings › Notification templates (synthetic preview only). The work itself is `server/edu/nhac-hoc-phi.ts`; this
 * provider only decides when it runs.
 */
export default class EduNhacHocPhiProvider extends ServiceProvider<AppPluginApplication> {
  readonly name = 'app.edu-nhac-hoc-phi';

  private executor: ScheduleExecutor | undefined;
  private release: (() => void) | undefined;

  override boot(): Promise<void> {
    // The scenario is real business use of notifications: the template directory is shown (`client/routes.ts`).
    this.app.config.mergeDefaults({
      client: { notificationTemplates: { tuitionReminder: true } },
    });
    if (!this.app.container.has(notificationTemplateRegistryToken))
      return Promise.resolve();
    const config = (): NotificationConfigInput | undefined =>
      this.app.config.get<NotificationConfigInput>('notification');
    this.release = this.app.container
      .resolve(notificationTemplateRegistryToken)
      .register({
        id: TUITION_REMINDER_TEMPLATE,
        contributor: 'nocoedu',
        category: 'Học phí',
        name: 'Nhắc thu học phí',
        trigger:
          '08:00 mỗi ngày (giờ Việt Nam), khi có học viên hết buổi, sắp hết buổi hoặc còn nợ học phí.',
        recipients:
          'Tài khoản đang hoạt động được gán bộ quyền và được xem cả Thanh toán lẫn Học viên (Quản trị, Kế toán, Quản lý cơ sở); mỗi người chỉ nhận số học viên trong phạm vi của mình. Huấn luyện viên không nhận.',
        businessRule: `Gửi vào Hộp thư; một lần mỗi tuần cho cùng một nội dung. Ngưỡng sắp hết buổi đặt ở từng cơ sở. Chỉ có số lượng và mã học viên (tối đa ${MAX_CODES} mã mỗi dòng), không tên, không số tiền. Đường dẫn: ${REMINDER_ROUTE}.`,
        locales: ['vi-VN'],
        languagePolicy:
          'Chỉ tiếng Việt, không phụ thuộc ngôn ngữ giao diện của người nhận.',
        variables: [
          { name: 'count', description: 'Số học viên cần chú ý' },
          {
            name: 'ma',
            description: 'Mã học viên (HS00001); chỉ mã, không có họ tên',
          },
        ],
        channels: () => {
          const name = inAppChannelOf(config());
          return [
            describeNotificationTemplateChannel(config(), name ?? 'inbox'),
          ];
        },
        render: (_locale, example) => {
          const raw = example === 'definition';
          const rendered = renderTuitionReminder(
            raw
              ? {
                  hetBuoi: { count: '{{count}}', codes: ['{{ma}}'] },
                  sapHet: { count: '{{count}}', codes: ['{{ma}}'] },
                  conNo: { count: '{{count}}', codes: ['{{ma}}'] },
                }
              : {
                  hetBuoi: partOf(['HS90001', 'HS90002']),
                  sapHet: partOf(['HS90003']),
                  conNo: partOf(['HS90001', 'HS90004']),
                },
          );
          if (!rendered) throw new Error('The sample reminder is empty.');
          return rendered;
        },
      });
    return Promise.resolve();
  }

  override async start(): Promise<void> {
    if (
      !this.app.container.has(authorizationToken) ||
      !this.app.container.has(notificationServiceToken)
    )
      return;
    const channel = inAppChannelOf(
      this.app.config.get<NotificationConfigInput>('notification'),
    );
    // Without an in-app channel there is nowhere to deliver to: leave the job unscheduled.
    if (!channel) return;
    const database = this.app.container.resolve(databaseManagerToken);
    const authz: AppAuthorization =
      this.app.container.resolve(authorizationToken);
    const notification = this.app.container.resolve(notificationServiceToken);
    this.executor = this.app.container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor('nocoedu');
    await this.executor.addJob({
      name: TUITION_REMINDER_JOB,
      options: { cron: TUITION_REMINDER_CRON, tz: TIME_ZONE },
      payload: {},
      execute: async () => {
        await sendTuitionReminders({
          database,
          authz,
          notification,
          channel,
        });
      },
    });
    await this.executor.setup();
  }

  override async shutdown(): Promise<void> {
    this.release?.();
    this.release = undefined;
    await this.executor?.shutdown();
    this.executor = undefined;
  }
}
