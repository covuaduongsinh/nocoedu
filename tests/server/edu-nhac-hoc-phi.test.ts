import { createAppTest } from '@nocobase/app-testing/server';
import {
  notificationServiceToken,
  notificationTemplateRegistryToken,
} from '@nocobase/app-plugin-notification/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

import {
  collectTuitionReminders,
  isoWeekOf,
  MAX_CODES,
  partOf,
  renderTuitionReminder,
  reminderKey,
  sendTuitionReminders,
} from '../../server/edu/nhac-hoc-phi.js';
import { makeReminderThresholds } from '../../server/edu/nguong-nhac.js';
import { inAppChannelOf } from '../../server/providers/edu-nhac-hoc-phi.js';
import {
  adminSession,
  eduTestOptions,
  seedSchool,
  userWithRole,
} from '../helpers/edu.js';

// The daily tuition reminder. Names are made up; the codes are the only thing a message may carry about a student.

describe('the message', () => {
  it('lists counts and codes only, at most 15 codes a line, and says nothing when there is nothing', () => {
    const codes = Array.from(
      { length: 20 },
      (_, index) => `HS${String(index + 1).padStart(5, '0')}`,
    );
    const rendered = renderTuitionReminder({
      hetBuoi: partOf(codes),
      sapHet: partOf(['HS00100']),
      conNo: partOf([]),
    });
    expect(rendered?.title).toBe('Nhắc thu học phí: 21 học viên cần chú ý');
    const lines = rendered?.body.split('\n') ?? [];
    expect(lines[0]).toBe(
      `Hết buổi (20): ${codes.slice(0, MAX_CODES).join(', ')} và 5 học viên khác`,
    );
    expect(lines[1]).toBe('Sắp hết buổi (1): HS00100');
    expect(rendered?.body).not.toContain('Còn nợ');
    expect(rendered?.body).not.toContain('HS00016');
    expect(
      renderTuitionReminder({
        hetBuoi: partOf([]),
        sapHet: partOf([]),
        conNo: partOf([]),
      }),
    ).toBeUndefined();
  });

  it('counts a student once in the title when he is on two lines', () => {
    const rendered = renderTuitionReminder({
      hetBuoi: partOf(['HS00001']),
      sapHet: partOf([]),
      conNo: partOf(['HS00001']),
    });
    expect(rendered?.title).toBe('Nhắc thu học phí: 1 học viên cần chú ý');
  });

  it('keys one message per person per ISO week and content', () => {
    expect(isoWeekOf('2026-11-16')).toBe('2026-W47');
    expect(isoWeekOf('2027-01-01')).toBe('2026-W53');
    const a = { title: 't', body: 'b' };
    const key = reminderKey('u1', '2026-11-16', a);
    expect(key).toBe(reminderKey('u1', '2026-11-20', a));
    expect(key).not.toBe(reminderKey('u1', '2026-11-23', a));
    expect(key).not.toBe(reminderKey('u1', '2026-11-16', { ...a, body: 'c' }));
    expect(key).not.toBe(reminderKey('u2', '2026-11-16', a));
  });

  it('finds the in-app channel, enabled only', () => {
    expect(inAppChannelOf(undefined)).toBeUndefined();
    expect(
      inAppChannelOf({
        channels: { mail: { type: 'email' }, inbox: { type: 'in-app' } },
      } as never),
    ).toBe('inbox');
    expect(
      inAppChannelOf({
        channels: { inbox: { type: 'in-app', enabled: false } },
      } as never),
    ).toBeUndefined();
  });

  it('takes the threshold of the branch, and 2 for a branch it does not know', () => {
    const thresholds = makeReminderThresholds(
      new Map([
        [1, 5],
        [2, 0],
      ]),
    );
    expect(thresholds.isLow(1, 5)).toBe(true);
    expect(thresholds.isLow(1, 6)).toBe(false);
    expect(thresholds.isLow(2, 0)).toBe(true);
    expect(thresholds.isLow(2, 1)).toBe(false);
    expect(thresholds.isLow(99, 2)).toBe(true);
    expect(thresholds.isLow(null, 3)).toBe(false);
    expect(thresholds.highest).toBe(5);
  });
});

const test = createAppTest({
  ...eduTestOptions,
  config: {
    ...eduTestOptions.config,
    notification: { channels: { inbox: { type: 'in-app' } } },
  },
});

async function setup(testApp: any, connection: any) {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'nh-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'nh-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'nh-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'nh-kt', 'edu_ke_toan');
  const quanTri = await userWithRole(testApp, admin, 'nh-qt', 'edu_quan_tri');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  return { admin, hlvA, hlvB, managerA, keToan, quanTri, ids };
}

const setBalance = (connection: any, id: number, balance: number) =>
  connection.query
    .updateTable('eduHocVien')
    .set({ soBuoiConLai: balance })
    .where('id', '=', id)
    .execute();

const depsOf = (app: any) => ({
  database: app.container.resolve(databaseManagerToken),
  authz: app.container.resolve(authorizationToken),
});

const bodyOf = async (
  app: any,
  reminders: Awaited<ReturnType<typeof collectTuitionReminders>>,
  userId: string,
) => {
  const found = reminders.find((reminder) => reminder.userId === userId);
  return found ? renderTuitionReminder(found.parts) : undefined;
};

test('only people who see both tuition and students are told, each about their own scope', async ({
  testApp,
  app,
  connection,
}) => {
  const { hlvA, hlvB, managerA, keToan, quanTri, ids } = await setup(
    testApp,
    connection,
  );
  await setBalance(connection, ids.hocVienA, 0);
  await setBalance(connection, ids.hocVienB, 2);

  const reminders = await collectTuitionReminders(depsOf(app));
  const forAdmin = await bodyOf(app, reminders, quanTri.id);
  expect(forAdmin?.body).toContain('Hết buổi (1): HS-A');
  expect(forAdmin?.body).toContain('Sắp hết buổi (1): HS-B');
  expect((await bodyOf(app, reminders, keToan.id))?.body).toBe(forAdmin?.body);
  // A branch manager hears about their own branch only.
  const forManager = await bodyOf(app, reminders, managerA.id);
  expect(forManager?.body).toContain('Hết buổi (1): HS-A');
  expect(forManager?.body).not.toContain('HS-B');
  // A coach holds neither tuition nor students of the whole school.
  expect(reminders.some((r) => r.userId === hlvA.id)).toBe(false);
  expect(reminders.some((r) => r.userId === hlvB.id)).toBe(false);
  // Nothing about a person is in a message.
  for (const reminder of reminders) {
    const rendered = renderTuitionReminder(reminder.parts);
    expect(rendered?.body).not.toContain('Học viên Mẫu');
    expect(rendered?.body).not.toMatch(/đ\b|\d{1,3}\.\d{3}/u);
  }
});

test('a branch threshold decides who is nearly out, and debt comes from packages and payments', async ({
  testApp,
  app,
  connection,
}) => {
  const { managerA, quanTri, ids } = await setup(testApp, connection);
  await setBalance(connection, ids.hocVienA, 1);
  await setBalance(connection, ids.hocVienB, 4);
  // Branch A warns from 0 sessions, branch B from 5.
  await connection.query
    .updateTable('eduCoSo')
    .set({ nguongNhacBuoi: 0 })
    .where('id', '=', ids.coSoA)
    .execute();
  await connection.query
    .updateTable('eduCoSo')
    .set({ nguongNhacBuoi: 5 })
    .where('id', '=', ids.coSoB)
    .execute();
  // HS-A bought a package of 1,000,000 and paid 400,000.
  await connection.query
    .insertInto('eduGoiHoc')
    .values({
      hocVienId: ids.hocVienA,
      soBuoi: 10,
      donGia: 100_000,
      thanhTien: 1_000_000,
      ngayMua: '2026-11-01',
      nguoiTaoId: quanTri.id,
    })
    .execute();
  const pack = await connection.query
    .selectFrom('eduGoiHoc')
    .select('id')
    .where('hocVienId', '=', ids.hocVienA)
    .executeTakeFirstOrThrow();
  await connection.query
    .insertInto('eduThanhToan')
    .values({
      hocVienId: ids.hocVienA,
      coSoId: ids.coSoA,
      goiHocId: Number(pack.id),
      soTien: 400_000,
      ngay: '2026-11-02',
      hinhThuc: 'tien_mat',
      thang: '2026-11',
      nguoiGhiNhanId: quanTri.id,
    })
    .execute();

  const reminders = await collectTuitionReminders(depsOf(app));
  const forAdmin = await bodyOf(app, reminders, quanTri.id);
  expect(forAdmin?.body).toContain('Sắp hết buổi (1): HS-B');
  expect(forAdmin?.body).not.toContain('Sắp hết buổi (2)');
  expect(forAdmin?.body).toContain('Còn nợ học phí (1): HS-A');
  // HS-A has 1 session left but its branch warns from 0: not nearly out.
  expect(forAdmin?.body).not.toMatch(/Hết buổi/u);
  const forManager = await bodyOf(app, reminders, managerA.id);
  expect(forManager?.body).toBe(
    'Còn nợ học phí (1): HS-A\nMở mục Học phí › Cần thu để thu.',
  );
});

test('sending twice in a week with the same lists sends once; a changed list is a new message', async ({
  testApp,
  app,
  connection,
}) => {
  const { hlvA, managerA, quanTri, ids } = await setup(testApp, connection);
  await setBalance(connection, ids.hocVienA, 0);
  await setBalance(connection, ids.hocVienB, 9);

  const sent: { to: string; key: string; path: string; body: string }[] = [];
  const keys = new Set<string>();
  const notification = {
    send: async (input: any) => {
      const message = input.messages.inbox;
      const deduplicated = keys.has(input.idempotencyKey);
      keys.add(input.idempotencyKey);
      if (!deduplicated)
        sent.push({
          to: message.to,
          key: input.idempotencyKey,
          path: message.target.path,
          body: message.body,
        });
      return { deduplicated } as never;
    },
  };
  const run = (now: string) =>
    sendTuitionReminders({
      ...depsOf(app),
      notification,
      channel: 'inbox',
      now: new Date(`${now}T01:00:00Z`),
    });

  const first = await run('2026-11-16');
  expect(first.sent).toBeGreaterThanOrEqual(2);
  expect(first.repeated).toBe(0);
  const recipients = sent.map((message) => message.to);
  expect(recipients).toContain(quanTri.id);
  expect(recipients).toContain(managerA.id);
  expect(recipients).not.toContain(hlvA.id);
  expect(sent.every((message) => message.path === '/hoc-phi?tab=can-thu')).toBe(
    true,
  );

  const again = await run('2026-11-18');
  expect(again.sent).toBe(0);
  expect(again.repeated).toBe(first.sent);

  // The next week, the same lists: a new message. The same week with a changed list: a new message too.
  expect((await run('2026-11-23')).sent).toBe(first.sent);
  await setBalance(connection, ids.hocVienB, 1);
  const changed = await run('2026-11-23');
  expect(changed.sent).toBeGreaterThanOrEqual(1);
});

test('the real notification service puts the reminder in the inbox once', async ({
  testApp,
  app,
  connection,
}) => {
  const { quanTri, ids } = await setup(testApp, connection);
  await setBalance(connection, ids.hocVienA, 0);
  const notification = app.container.resolve(notificationServiceToken);
  const options = {
    ...depsOf(app),
    notification,
    channel: 'inbox',
    now: new Date('2026-11-16T01:00:00Z'),
  };
  const first = await sendTuitionReminders(options);
  expect(first.sent).toBeGreaterThanOrEqual(1);
  const second = await sendTuitionReminders(options);
  expect(second.sent).toBe(0);
  expect(second.repeated).toBe(first.sent);
  const dispatches = await connection.query
    .selectFrom('notificationDispatches')
    .selectAll()
    .execute();
  expect(
    dispatches.filter((row: any) =>
      String(row.idempotencyKey).startsWith(
        `edu.nhac-hoc-phi:${quanTri.id}:2026-W47:`,
      ),
    ),
  ).toHaveLength(1);
});

test('the scenario is listed in the template directory with a synthetic preview only', async ({
  app,
}) => {
  expect(app.config.get('client.notificationTemplates.tuitionReminder')).toBe(
    true,
  );
  expect(
    app.config.get('client.notificationTemplates.invitationConfigured'),
  ).toBe(false);
  const registry = app.container.resolve(notificationTemplateRegistryToken);
  const view = registry.get('edu.nhac-hoc-phi');
  expect(view?.locales).toEqual(['vi-VN']);
  expect(view?.channels[0]).toMatchObject({ name: 'inbox', type: 'in-app' });
  const preview = await registry.preview('edu.nhac-hoc-phi', 'vi-VN');
  expect(preview?.synthetic).toBe(true);
  expect(preview?.content.body).toContain('HS90001');
  expect(preview?.definition.title).toContain('{{count}}');
});
